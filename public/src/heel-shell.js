// A separate, genuinely cut heel fabric shell. The original garment is
// clipped away in the exact same rest-space region by fabricFragment.
// The rear shell is reconstructed from the original indexed triangles,
// clipped at an upper ankle plane and a forward sole plane. Interior
// vertices use a stable heel rigid frame; the boundary meets the posed
// unaltered cloth with no gap and no model-wide deformation changes.
export const HEEL_SHELL_Y=.151;
export const HEEL_SHELL_Z=.075;
const smoothstep=(a,b,v)=>{
  const t=Math.max(0,Math.min(1,(v-a)/(b-a)));
  return t*t*(3-2*t);
};
const normalize=v=>{
  const d=Math.hypot(v[0],v[1],v[2])||1;
  return v.map(x=>x/d);
};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
function basis(a,b,c){
  const x=normalize(sub(b,a));
  const v=sub(c,a),parallel=dot(v,x);
  const y=normalize(v.map((n,i)=>n-parallel*x[i]));
  const z=[x[1]*y[2]-x[2]*y[1],
           x[2]*y[0]-x[0]*y[2],
           x[0]*y[1]-x[1]*y[0]];
  return [x,y,z];
}
export function makeHeelShell(THREE,restGeometry){
  const source=restGeometry.attributes;
  const triangles=restGeometry.index.array;
  const meshPositions=[],meshNormals=[],meshRest=[],meshUV=[];
  const sources=[],barycentrics=[];
  const coords=new Array(3);
  function vertex(id,corner){
    const point=[source.position.getX(id),source.position.getY(id),
                 source.position.getZ(id)];
    const normal=[source.normal.getX(id),source.normal.getY(id),
                  source.normal.getZ(id)];
    const uv=[source.uv?.getX(id)??0,source.uv?.getY(id)??0];
    const weights=[0,0,0];weights[corner]=1;
    return {point,normal,uv,weights};
  }
  function lerp(a,b,t){
    return {
      point:a.point.map((v,i)=>v+(b.point[i]-v)*t),
      normal:a.normal.map((v,i)=>v+(b.normal[i]-v)*t),
      uv:a.uv.map((v,i)=>v+(b.uv[i]-v)*t),
      weights:a.weights.map((v,i)=>v+(b.weights[i]-v)*t),
    };
  }
  function clip(polygon,axis,cut){
    const output=[];
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length];
      const insideA=a.point[axis]<=cut,insideB=b.point[axis]<=cut;
      if(insideA)output.push(a);
      if(insideA!==insideB){
        const t=(cut-a.point[axis])/(b.point[axis]-a.point[axis]);
        output.push(lerp(a,b,t));
      }
    }
    return output;
  }
  for(let start=0;start<triangles.length;start+=3){
    coords[0]=triangles[start];
    coords[1]=triangles[start+1];
    coords[2]=triangles[start+2];
    let polygon=coords.map((index,i)=>vertex(index,i));
    polygon=clip(polygon,1,HEEL_SHELL_Y);
    if(polygon.length<3)continue;
    polygon=clip(polygon,2,HEEL_SHELL_Z);
    if(polygon.length<3)continue;
    for(let i=1;i<polygon.length-1;i++){
      for(const p of [polygon[0],polygon[i],polygon[i+1]]){
        meshRest.push(...p.point);
        meshPositions.push(...p.point);
        meshNormals.push(...normalize(p.normal));
        meshUV.push(...p.uv);
        sources.push(...coords);
        barycentrics.push(...p.weights);
      }
    }
  }
  const position=new THREE.BufferAttribute(new Float32Array(meshPositions),3);
  position.setUsage(THREE.DynamicDrawUsage);
  const normal=new THREE.BufferAttribute(new Float32Array(meshNormals),3);
  normal.setUsage(THREE.DynamicDrawUsage);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',position);
  geometry.setAttribute('normal',normal);
  geometry.setAttribute('restPosition',new THREE.BufferAttribute(new Float32Array(meshRest),3));
  geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(meshUV),2));
  geometry.computeBoundingSphere();
  // Rigid heel is recovered from three actual rear heel vertices,
  // not guessed from a generic cylinder or rounded shoe silhouette.
  function nearest(target){
    let best=0,distance=Infinity;
    for(let i=0;i<source.position.count;i++){
      const dx=source.position.getX(i)-target[0],
            dy=source.position.getY(i)-target[1],
            dz=source.position.getZ(i)-target[2];
      const d=dx*dx+dy*dy+dz*dz;
      if(d<distance){best=i;distance=d;}
    }
    return best;
  }
  const anchorIndices=[
    nearest([-.027,.026,-.040]),
    nearest([.027,.026,-.040]),
    nearest([-.017,.061,-.036]),
  ];
  const rest=anchorIndices.map(i=>[
    source.position.getX(i),source.position.getY(i),source.position.getZ(i)]);
  return {geometry,sources:new Uint16Array(sources),
    bary:new Float32Array(barycentrics),rest,anchorIndices,
    restBasis:basis(...rest)};
}
export function updateHeelShell(shell,posedGeometry){
  const {geometry,sources,bary,rest,anchorIndices,restBasis}=shell;
  const pts=posedGeometry.attributes.position,ns=posedGeometry.attributes.normal;
  const posedAnchor=anchorIndices.map(i=>[pts.getX(i),pts.getY(i),pts.getZ(i)]);
  const posedBasis=basis(...posedAnchor);
  const positions=geometry.attributes.position.array;
  const normals=geometry.attributes.normal.array;
  const restPoints=geometry.attributes.restPosition.array;
  const count=positions.length/3;
  for(let i=0;i<count;i++){
    const offset=i*3;
    let px=0,py=0,pz=0,nx=0,ny=0,nz=0;
    for(let k=0;k<3;k++){
      const index=sources[offset+k],w=bary[offset+k];
      px+=pts.getX(index)*w;
      py+=pts.getY(index)*w;
      pz+=pts.getZ(index)*w;
      nx+=ns.getX(index)*w;
      ny+=ns.getY(index)*w;
      nz+=ns.getZ(index)*w;
    }
    const rel=[restPoints[offset]-rest[0][0],
      restPoints[offset+1]-rest[0][1],restPoints[offset+2]-rest[0][2]];
    const axis=restBasis.map(unit=>dot(rel,unit));
    const rigid=[0,1,2].map(k=>posedAnchor[0][k]+
      axis[0]*posedBasis[0][k]+axis[1]*posedBasis[1][k]+
      axis[2]*posedBasis[2][k]);
    // "Cut at the already normal edge": match the undisturbed cloth
    // exactly near both cut planes; retain a smooth rigid heel behind it.
    const edge=Math.max(
      smoothstep(.092,HEEL_SHELL_Y,restPoints[offset+1]),
      smoothstep(.022,HEEL_SHELL_Z,restPoints[offset+2]));
    const normalLength=Math.hypot(nx,ny,nz)||1;
    const n=[nx/normalLength,ny/normalLength,nz/normalLength];
    for(let k=0;k<3;k++){
      const original=[px,py,pz][k];
      positions[offset+k]=rigid[k]*(1-edge)+original*edge+n[k]*.00165;
      normals[offset+k]=n[k];
    }
  }
  geometry.attributes.position.needsUpdate=true;
  geometry.attributes.normal.needsUpdate=true;
}
