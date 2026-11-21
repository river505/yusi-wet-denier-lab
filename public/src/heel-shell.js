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
    restNormals:new Float32Array(meshNormals),
    restBasis:basis(...rest)};
}
export function updateHeelShell(shell,posedGeometry){
  const {geometry,sources,bary,rest,anchorIndices,restBasis}=shell;
  const pts=posedGeometry.attributes.position,ns=posedGeometry.attributes.normal;
  const anchors=anchorIndices.map(i=>[pts.getX(i),pts.getY(i),pts.getZ(i)]);
  const frame=basis(...anchors);
  const P=geometry.attributes.position.array;
  const N=geometry.attributes.normal.array;
  const R=geometry.attributes.restPosition.array;
  const RN=shell.restNormals;
  const nVerts=P.length/3;
  for(let i=0;i<nVerts;i++){
    const j=i*3;
    let px=0,py=0,pz=0,nx=0,ny=0,nz=0;
    for(let k=0;k<3;k++){
      const idx=sources[j+k],w=bary[j+k];
      px+=pts.getX(idx)*w;py+=pts.getY(idx)*w;pz+=pts.getZ(idx)*w;
      nx+=ns.getX(idx)*w;ny+=ns.getY(idx)*w;nz+=ns.getZ(idx)*w;
    }
    const dx=R[j]-rest[0][0],dy=R[j+1]-rest[0][1],
      dz=R[j+2]-rest[0][2];
    const a=dx*restBasis[0][0]+dy*restBasis[0][1]+dz*restBasis[0][2];
    const b=dx*restBasis[1][0]+dy*restBasis[1][1]+dz*restBasis[1][2];
    const c=dx*restBasis[2][0]+dy*restBasis[2][1]+dz*restBasis[2][2];
    const rx=anchors[0][0]+a*frame[0][0]+b*frame[1][0]+c*frame[2][0];
    const ry=anchors[0][1]+a*frame[0][1]+b*frame[1][1]+c*frame[2][1];
    const rz=anchors[0][2]+a*frame[0][2]+b*frame[1][2]+c*frame[2][2];
    // Exact border match by the 2 clipping planes; smooth rear heel.
    const edge=Math.max(
      smoothstep(.092,HEEL_SHELL_Y,R[j+1]),
      smoothstep(.022,HEEL_SHELL_Z,R[j+2]));
    const rn0=RN[j]*restBasis[0][0]+RN[j+1]*restBasis[0][1]+
      RN[j+2]*restBasis[0][2];
    const rn1=RN[j]*restBasis[1][0]+RN[j+1]*restBasis[1][1]+
      RN[j+2]*restBasis[1][2];
    const rn2=RN[j]*restBasis[2][0]+RN[j+1]*restBasis[2][1]+
      RN[j+2]*restBasis[2][2];
    nx=nx*edge+(1-edge)*
      (rn0*frame[0][0]+rn1*frame[1][0]+rn2*frame[2][0]);
    ny=ny*edge+(1-edge)*
      (rn0*frame[0][1]+rn1*frame[1][1]+rn2*frame[2][1]);
    nz=nz*edge+(1-edge)*
      (rn0*frame[0][2]+rn1*frame[1][2]+rn2*frame[2][2]);
    const norm=1/(Math.hypot(nx,ny,nz)||1);
    nx*=norm;ny*=norm;nz*=norm;
    P[j]=rx*(1-edge)+px*edge+nx*.00165;
    P[j+1]=ry*(1-edge)+py*edge+ny*.00165;
    P[j+2]=rz*(1-edge)+pz*edge+nz*.00165;
    N[j]=nx;N[j+1]=ny;N[j+2]=nz;
  }
  geometry.attributes.position.needsUpdate=true;
  geometry.attributes.normal.needsUpdate=true;
}
