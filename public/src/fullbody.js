import * as THREE from '../vendor/three.module.js';
import { createSpatialEnvironment } from './environment.js';

const $ = id => document.getElementById(id);
const canvas = $('fullbodyCanvas');
const hint = $('fbHint');
const STORAGE = 'atelier.fullbody.v1';
const DEFAULTS = {
  figure: { height:167, weight:56, waist:100, hips:105, chest:100, shoulders:100, legLength:100, legSpacing:100 },
  face: { eyesH:0, noseW:0, lipsW:0, jawW:0, faceRound:0, faceLength:0 },
  hair: { style:'long', color:'#30252b', length:100, volume:100, fringe:38 },
  outfit:'dress', outfitColor:'#b8a1bd', skin:'#cfaaa2',
  material:'pearl', stockings:true, denier:40, fabricColor:'#b9a3c0', wet:0,
  pose:'neutral', scene:'studio', rain:false, speed:100, amplitude:100,
  legTarget:'both', footPitch:[0,0],
  stockingLegs:[{denier:40,color:'#b9a3c0',material:'pearl',length:'thigh'},
                {denier:40,color:'#b9a3c0',material:'pearl',length:'thigh'}],
};
const cloneDefaults=()=>JSON.parse(JSON.stringify(DEFAULTS));
function loadState() {
  try {
    const obj=JSON.parse(localStorage.getItem(STORAGE)||'null');
    if(!obj||typeof obj!=='object')return cloneDefaults();
    const s=cloneDefaults();
    for(const key of ['figure','face','hair']) if(obj[key]&&typeof obj[key]==='object')
      Object.assign(s[key],obj[key]);
    for(const key of ['outfit','outfitColor','skin','material','stockings','denier',
      'fabricColor','wet','pose','scene','rain','speed','amplitude','legTarget'])
      if(obj[key]!==undefined)s[key]=obj[key];
    if(Array.isArray(obj.footPitch))s.footPitch=[0,1].map(i=>Math.max(-35,Math.min(35,Number(obj.footPitch[i])||0)));
    if(Array.isArray(obj.stockingLegs))
      s.stockingLegs=s.stockingLegs.map((side,i)=>({...side,...(obj.stockingLegs[i]||{})}));
    return s;
  } catch {return cloneDefaults();}
}
let state=loadState();
const num=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||a));
const sm=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const bell=(x,c,w)=>Math.exp(-Math.pow((x-c)/w,2));
const clothingColors=['#b8a1bd','#e8c9bc','#b3cad1','#f3e8d5','#4b4450','#9aa7a6','#b89493'];
const hairColors=['#30252b','#5e4435','#906744','#c7a072','#17171d','#9d7772','#c6bcc0'];
const skinColors=['#e7c9bf','#cfaaa2','#b99585','#a47d65','#765847','#d5bbb1'];
const POSES={
  neutral:'自然站姿',step:'迈步',crossed:'交叉',tiptoe:'踮脚',
  sitNatural:'自然坐姿',sitReach:'坐姿前伸',sitCross:'坐姿二郎腿',
  lieFlat:'平躺',lieBent:'平躺屈膝',
  lieCrossLeft:'平躺左搭右',lieCrossRight:'平躺右搭左',
  lieSideLeft:'左侧躺',lieSideRight:'右侧躺',
  kick:'踢腿',walk:'步行',run:'跑步',sitBounce:'坐姿抖腿',
};
const MOTION=new Set(['kick','walk','run','sitBounce']);
const OUTFITS={dress:'短裙套装',athletic:'运动套装',casual:'休闲长裤',swim:'连体泳装'};
const FABRICS={sheer:'轻薄丝',matte:'哑光',gloss:'亮泽',pearl:'珠光',cotton:'棉质'};
const HAIRSTYLES={short:'短发',bob:'齐肩',long:'长发',ponytail:'马尾'};
const SCENES={studio:'影棚',bath:'浴室',pool:'泳池',street:'夜雨街道'};

const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));
renderer.setSize(window.innerWidth,window.innerHeight,false);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.43;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
scene.background=new THREE.Color('#efeaf0');
const environment=createSpatialEnvironment(THREE,scene);
const root=new THREE.Group();scene.add(root);
const model=new THREE.Group();root.add(model);
const hairGroup=new THREE.Group();model.add(hairGroup);
const camera=new THREE.PerspectiveCamera(34,1,.015,110);
const orbit={yaw:.26,pitch:.12,distance:3.7,target:new THREE.Vector3(0,.91,0)};
const activePointers=new Map();
let lastPinch=0;
let geometry=null,skinMesh=null,eyesMesh=null,basePositions=null,baseIndices=null,morphs=null;
let headEyes=[],garments=[],hairPieces=[],splashTimer=0;
let needShape=true,needPose=true,frameTimestamp=0,lastAnimate=-Infinity,animClock=0;
let clothMeshes=[];
const skinMaterial=new THREE.MeshPhysicalMaterial({color:state.skin,roughness:.83,metalness:0,clearcoat:.11,clearcoatRoughness:.78});
const eyeMaterial=new THREE.MeshPhysicalMaterial({color:'#f2f0ec',roughness:.30,metalness:0,clearcoat:.5});
const rad=d=>d*Math.PI/180;
const makeMat=(color,rough=.65)=>new THREE.MeshPhysicalMaterial({color,roughness:rough,metalness:.015,clearcoat:.18,clearcoatRoughness:.60,side:THREE.DoubleSide});

function vecAccessor(ab,json,index,binStart){
  const a=json.accessors[index],v=json.bufferViews[a.bufferView],offset=binStart+(v.byteOffset||0)+(a.byteOffset||0);
  if(a.componentType===5126)return new Float32Array(ab,offset,a.count*(a.type==='VEC3'?3:1));
  if(a.componentType===5125)return new Uint32Array(ab,offset,a.count);
  throw new Error('Unsupported glTF accessor component: '+a.componentType);
}
async function loadModel(){
  const [glb,morph]=await Promise.all([
    fetch('../assets/atelier-makehuman-female.glb').then(r=>{if(!r.ok)throw new Error('全身网格 '+r.status);return r.arrayBuffer()}),
    fetch('../assets/atelier-face-morphs.json').then(r=>{if(!r.ok)throw new Error('形变文件 '+r.status);return r.json()}),
  ]);
  const view=new DataView(glb);
  if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2)throw new Error('全身模型不是有效 glTF 2.0');
  const len=view.getUint32(12,true);
  const json=JSON.parse(new TextDecoder().decode(new Uint8Array(glb,20,len)).trim());
  const start=20+len+8,prims=json.meshes[0].primitives;
  basePositions=Float32Array.from(vecAccessor(glb,json,prims[0].attributes.POSITION,start));
  const rawNormals=Float32Array.from(vecAccessor(glb,json,prims[0].attributes.NORMAL,start));
  baseIndices=Uint32Array.from(vecAccessor(glb,json,prims[0].indices,start));
  const eyeIdx=Uint32Array.from(vecAccessor(glb,json,prims[1].indices,start));
  geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(basePositions),3));
  geometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(rawNormals),3));
  geometry.setIndex(new THREE.BufferAttribute(baseIndices,1));
  geometry.computeBoundingSphere();
  skinMesh=new THREE.Mesh(geometry,skinMaterial);
  skinMesh.castShadow=true;skinMesh.receiveShadow=true;
  skinMesh.frustumCulled=false;
  model.add(skinMesh);
  const eyeGeo=new THREE.BufferGeometry();
  eyeGeo.setAttribute('position',geometry.getAttribute('position'));
  // Eye normals must remain independent. The visible skin mesh recalculates
  // smooth normals after sculpting; eyeball polygons are not in its index.
  eyeGeo.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(rawNormals),3));
  eyeGeo.setIndex(new THREE.BufferAttribute(eyeIdx,1));
  eyesMesh=new THREE.Mesh(eyeGeo,eyeMaterial);
  eyesMesh.frustumCulled=false;
  model.add(eyesMesh);
  morphs=morph.morphs;
  for(const side of [-1,1]){
    const iris=new THREE.Mesh(new THREE.SphereGeometry(.0078,20,12),
      new THREE.MeshPhysicalMaterial({color:'#473f43',roughness:.18,clearcoat:1}));
    iris.position.set(side*.031,1.575,.136);
    model.add(iris);headEyes.push(iris);
  }
  createGarments();
  updateAppearance();
  hint.textContent='MakeHuman · CC0 全身网格已加载';
  setTimeout(()=>{if(hint.textContent.includes('已加载'))hint.textContent='';},3000);
}

function subset(test){
  const out=[],a=baseIndices,p=basePositions;
  for(let i=0;i<a.length;i+=3){
    const x=(p[a[i]*3]+p[a[i+1]*3]+p[a[i+2]*3])/3;
    const y=(p[a[i]*3+1]+p[a[i+1]*3+1]+p[a[i+2]*3+1])/3;
    const z=(p[a[i]*3+2]+p[a[i+1]*3+2]+p[a[i+2]*3+2])/3;
    if(test(x,y,z))out.push(a[i],a[i+1],a[i+2]);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',geometry.getAttribute('position'));
  geo.setAttribute('normal',geometry.getAttribute('normal'));
  geo.setIndex(out);
  return geo;
}
const dressTop=(x,y)=>y>1.045&&y<1.42&&Math.abs(x)<.205;
const croppedTop=(x,y)=>y>1.16&&y<1.40&&Math.abs(x)<.19;
function overlayMaterial(col,rough=.63){
  const m=makeMat(col,rough);
  m.onBeforeCompile=sh=>{sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\n transformed += normal * 0.0036;');};
  return m;
}
function createGarments(){
  const definitions=[
    ['dressTop',(x,y)=>dressTop(x,y),'top'],
    ['sportTop',(x,y)=>croppedTop(x,y),'top'],
    ['shorts',(x,y)=>y>.78&&y<1.05&&Math.abs(x)<.23,'bottom'],
    ['trousers',(x,y)=>y>.052&&y<1.04&&Math.abs(x)<.24,'bottom'],
    ['swimsuit',(x,y)=>y>.82&&y<1.39&&Math.abs(x)<.205,'top'],
    ['stockingL',(x,y)=>y<.92&&y>.026&&x>=0&&Math.abs(x)<.255,'stocking'],
    ['stockingR',(x,y)=>y<.92&&y>.026&&x<0&&Math.abs(x)<.255,'stocking'],
  ];
  for(const [name,test,type] of definitions){
    const mat=overlayMaterial(state.outfitColor,type==='stocking'?.43:.72);
    if(type==='stocking'){
      mat.transparent=true;mat.depthWrite=false;mat.opacity=.6;mat.clearcoat=.76;
    }
    const mesh=new THREE.Mesh(subset(test),mat);
    mesh.name=name;mesh.visible=false;mesh.frustumCulled=false;
    mesh.renderOrder=type==='stocking'?3:2;
    model.add(mesh);garments.push(mesh);
  }
  const skirt=new THREE.Mesh(new THREE.CylinderGeometry(.16,.31,.43,64,2,true),
    makeMat(state.outfitColor,.60));
  skirt.name='skirt';skirt.position.set(0,.836,0);skirt.visible=false;
  model.add(skirt);garments.push(skirt);
  updateWardrobe();
}
function updateWardrobe(){
  for(const g of garments){
    g.visible=g.name.startsWith('stocking')?Boolean(state.stockings):
      state.outfit==='dress'?(g.name==='dressTop'||g.name==='skirt'):
      state.outfit==='athletic'?(g.name==='sportTop'||g.name==='shorts'):
      state.outfit==='casual'?(g.name==='dressTop'||g.name==='trousers'):
      state.outfit==='swim'?(g.name==='swimsuit'):false;
    if(g.name.startsWith('stocking')){
      const index=g.name==='stockingR'?1:0;
      const leg=state.stockingLegs[index];
      const d=num(leg.denier,5,200);
      g.material.color.set(leg.color);
      g.material.opacity=leg.material==='cotton'?.94:.18+.78*(1-Math.exp(-d/55));
      g.material.roughness=leg.material==='matte'?.95:leg.material==='gloss'?.21:leg.material==='pearl'?.29:.48;
      g.material.clearcoat=leg.material==='pearl'?1:.72;
      g.material.clearcoatRoughness=Math.max(.065,(leg.material==='pearl'?.12:.34)*(1-state.wet*.58));
      g.material.roughness=Math.max(.08,g.material.roughness*(1-state.wet*.46));
      g.material.opacity=Math.min(.985,g.material.opacity+(state.wet*.025));
      g.material.needsUpdate=true;
    }else{
      g.material.color.set(state.outfitColor);
      g.material.roughness=state.outfit==='swim'?.34:.67;
    }
  }
}
function changePearlMaterial(){
  for(const garment of garments.filter(x=>x.name.startsWith('stocking'))){
    const index=garment.name==='stockingR'?1:0;
    const m=garment.material;
    // Both sides maintain separate fabric masks, deniers and optical values.
    m.onBeforeCompile=sh=>{
    sh.uniforms.atelierPearl={value:state.stockingLegs[index].material==='pearl'?1:0};
    sh.uniforms.atelierWet={value:num(state.wet,0,1)};
    sh.uniforms.atelierLength={value:({ankle:.19,knee:.56,thigh:.93,tights:1.10})[state.stockingLegs[index].length]||.93};
    m.userData.shader=sh;
    sh.vertexShader=sh.vertexShader.replace('#include <common>',
      '#include <common>\n varying vec3 vAtelierPos;');
    sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vAtelierPos=position; transformed += normal*.0047;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',
      '#include <common>\n varying vec3 vAtelierPos; uniform float atelierPearl; uniform float atelierWet; uniform float atelierLength;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <dithering_fragment>',
      'if(vAtelierPos.y>atelierLength) discard;'
      +'vec3 q=floor(vAtelierPos.xyz*110.); float sparkle=fract(sin(dot(q,vec3(17.27,61.23,39.81)))*43758.5453);'
      +'float glint=smoothstep(.73,.99,sparkle);'
      +'gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(1.,.965,.99),atelierPearl*glint*(.46+.16*atelierWet));'
      +'#include <dithering_fragment>');
    };
    m.needsUpdate=true;
  }
}

function hairPiece(vertices,color){
  const geo=new THREE.BufferGeometry(),p=[],ind=[];
  for(let i=0;i<vertices.length;i++)p.push(...vertices[i]);
  for(let i=0;i<vertices.length-2;i++){if(i%2===0)ind.push(i,i+1,i+2);else ind.push(i+1,i,i+2);}
  geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  geo.setIndex(ind);geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color,roughness:.71,metalness:.035,side:THREE.DoubleSide}));
  mesh.castShadow=true;hairGroup.add(mesh);hairPieces.push(mesh);
}
function buildHair(){
  for(const mesh of hairPieces){hairGroup.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
  hairPieces=[];
  const style=state.hair.style||'long',volume=num(state.hair.volume,65,145)/100,
    len=num(state.hair.length,50,150)/100,fringe=num(state.hair.fringe,0,100)/100;
  const color=state.hair.color;
  const cap=new THREE.Mesh(new THREE.SphereGeometry(1,36,20,0,Math.PI*2,0,Math.PI*.61),
    new THREE.MeshStandardMaterial({color,roughness:.76,side:THREE.DoubleSide}));
  cap.scale.set(.105*volume,.109,.110*volume);
  cap.position.set(0,1.581,-.008);
  hairGroup.add(cap);hairPieces.push(cap);
  const strandCount=style==='short'?14:28;
  const long=style==='long'?.32:style==='ponytail'?.10:style==='bob'?.18:.070;
  const length=long*len;
  for(let i=0;i<strandCount;i++){
    const t=(i+.5)/strandCount,angle=-Math.PI*.15+t*Math.PI*1.3;
    const x=Math.cos(angle)*.107*volume,z=Math.sin(angle)*.099*volume;
    const side=Math.sign(x)||1;
    let verts=[];
    const segments=8;
    for(let j=0;j<=segments;j++){
      const u=j/segments;
      const yt=1.58-u*length,zv=z+(u*u*(style==='long'?.02:.008));
      const bend=Math.sin(u*Math.PI)*.014*side;
      const width=(.017-.011*u)*Math.max(.34,len);
      verts.push([x+bend-width/2,yt,zv],[x+bend+width/2,yt-.002,zv+.003]);
    }
    hairPiece(verts,color);
  }
  if(style==='ponytail'){
    const verts=[];
    for(let j=0;j<=16;j++){const u=j/16,r=.033*(1-u)*volume;
      verts.push([-.03-r,1.59-u*.36*len,-.092-u*.13],
                 [.03+r,1.59-u*.36*len,-.093-u*.13]);}
    hairPiece(verts,color);
  }
  if(fringe>.05){
    for(let i=0;i<10;i++){
      const x=(i-4.5)*.018,drop=.085*fringe*(.75+.25*Math.sin(i*2));
      hairPiece([[x-.012,1.615,.064],[x+.012,1.615,.064],
        [x-.008,1.615-drop,.101],[x+.009,1.615-drop,.102]],color);
    }
  }
}

function reconstructShape(){
  if(!geometry)return;
  const p=geometry.attributes.position.array;
  const base=basePositions,fig=state.figure,face=state.face;
  // Anthropometric adjustments operate on the genuine MakeHuman topology.
  // Torso/hip/shoulder envelopes smoothly taper to avoid hard seam steps.
  for(let i=0;i<p.length;i+=3){
    const x=base[i],y=base[i+1],z=base[i+2];
    const weight=(num(fig.weight,42,90)-56)/55;
    const waist=(num(fig.waist,70,145)-100)/130;
    const hips=(num(fig.hips,75,140)-100)/160;
    const chest=(num(fig.chest,75,145)-100)/155;
    const shoulders=(num(fig.shoulders,75,140)-100)/155;
    const leg=(num(fig.legLength,80,125)-100)/180;
    const scale=1+weight*(.12+.09*bell(y,.94,.3))+waist*bell(y,1.025,.17)
      +hips*bell(y,.92,.18)+chest*bell(y,1.24,.15)+shoulders*bell(y,1.38,.13);
    p[i]=x*scale;
    p[i+1]=y+(y<.94 ? (y-.94)*leg : .025*leg);
    p[i+2]=z*(1+(scale-1)*.85);
  }
  for(const [key,value] of Object.entries(face)){
    const pair=morphs?.[key];if(!pair)continue;
    const v=num(value,-100,100)/100;
    if(Math.abs(v)<.001)continue;
    for(const [idx,dx,dy,dz] of pair[v>=0?1:0]){
      const off=idx*3,w=Math.abs(v);
      p[off]+=dx*w;p[off+1]+=dy*w;p[off+2]+=dz*w;
    }
  }
  needShape=false;needPose=true;
}
const rotateX=(p,px,py,pz,ang,w)=>{
  if(!ang||w<=.001)return;
  const a=rad(ang)*w,c=Math.cos(a),s=Math.sin(a);
  const y=p[1]-py,z=p[2]-pz;
  p[1]=py+y*c-z*s;
  p[2]=pz+y*s+z*c;
};
const rotateZ=(p,px,py,pz,ang,w)=>{
  if(!ang||w<=.001)return;
  const a=rad(ang)*w,c=Math.cos(a),s=Math.sin(a);
  const x=p[0]-px,y=p[1]-py;
  p[0]=px+x*c-y*s;p[1]=py+x*s+y*c;
};
function poseAngles(time){
  const name=state.pose,amp=num(state.amplitude,20,200)/100;
  const zero={hip:0,knee:0,ankle:0,side:0};
  const L={...zero},R={...zero};
  if(name==='step'){L.hip=-16;L.knee=20;R.hip=5;}
  if(name==='crossed'){L.hip=-12;L.knee=14;L.side=-10;R.side=4;}
  if(name==='tiptoe'){L.ankle=24;R.ankle=24;}
  if(name==='sitNatural'||name==='sitBounce'){L.hip=-83;R.hip=-83;L.knee=83;R.knee=83;}
  if(name==='sitReach'){L.hip=-80;R.hip=-80;L.knee=24;R.knee=78;}
  if(name==='sitCross'){L.hip=-99;L.knee=62;L.side=-22;R.hip=-80;R.knee=86;}
  if(name==='lieBent'||name==='lieCrossLeft'||name==='lieCrossRight'){L.hip=-55;R.hip=-55;L.knee=100;R.knee=100;}
  if(name==='lieCrossLeft'){L.side=-27;L.knee=67;}
  if(name==='lieCrossRight'){R.side=27;R.knee=67;}
  if(name==='lieSideLeft'||name==='lieSideRight'){L.hip=-5;R.hip=-10;L.knee=9;R.knee=18;}
  const phase=time*2*Math.PI*(name==='run'?1.9:name==='sitBounce'?2.4:1.0)*num(state.speed,30,200)/100;
  if(name==='walk'||name==='run'){
    const extent=name==='run'?37:23;
    L.hip=-extent*amp*Math.sin(phase);R.hip=extent*amp*Math.sin(phase);
    L.knee=45*amp*Math.max(0,Math.sin(phase));R.knee=45*amp*Math.max(0,-Math.sin(phase));
  }
  if(name==='kick'){const v=(1-Math.cos(phase))*.5;L.hip=-70*amp*v;L.knee=26*(1-v);}
  if(name==='sitBounce'){L.knee+=13*amp*Math.sin(phase);R.knee+=9*amp*Math.sin(phase+1.5);}
  L.ankle+=Math.max(-35,Math.min(35,Number(state.footPitch[0])||0));
  R.ankle+=Math.max(-35,Math.min(35,Number(state.footPitch[1])||0));
  return [L,R];
}
function updatePose(t){
  if(!geometry||!basePositions)return;
  if(needShape){reconstructShape();shapedPositions=new Float32Array(geometry.attributes.position.array);}
  const pos=geometry.attributes.position.array;
  if(!shapedPositions||shapedPositions.length!==pos.length)
    shapedPositions=new Float32Array(pos);
  if(needPose||MOTION.has(state.pose)){
    // Evaluate joint kinematics once per frame, not once per vertex.
    // This removes 19k repeated trigonometric evaluations on mobile.
    const angles=poseAngles(t);
    const v=[0,0,0];
    for(let i=0;i<pos.length;i+=3){
      v[0]=shapedPositions[i];v[1]=shapedPositions[i+1];v[2]=shapedPositions[i+2];
      const y=v[1],x=v[0];
      if(y<1.09){
        const side=x>=0?0:1,a=angles[side],sx=side===0?.096:-.096;
        const ankleWeight=1-sm(.085,.18,y);
        const kneeWeight=1-sm(.54,.69,y);
        const hipWeight=(1-sm(.92,1.105,y))*sm(.01,.085,Math.abs(x));
        rotateX(v,sx,.095,0,a.ankle,ankleWeight);
        rotateX(v,sx,.54,.005,a.knee,kneeWeight);
        rotateX(v,sx,.95,0,a.hip,hipWeight);
        rotateZ(v,sx,.95,0,a.side,hipWeight);
        v[0]+=sx*(num(state.figure.legSpacing,75,155)/100-1)*hipWeight;
      }
      pos[i]=v[0];pos[i+1]=v[1];pos[i+2]=v[2];
    }
    geometry.attributes.position.needsUpdate=true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    needPose=false;
  }
}
let shapedPositions=null;
function refreshShape(){
  if(!geometry)return;
  reconstructShape();
  shapedPositions=new Float32Array(geometry.attributes.position.array);
  updatePose(animClock);
}
function updateAppearance(){
  skinMaterial.color.set(state.skin);
  updateWardrobe();
  buildHair();
  changePearlMaterial();
  refreshShape();
}
function updateRootPose(){
  const pose=state.pose;
  const lie=pose.startsWith('lie');
  model.rotation.set(0,0,0);
  model.position.set(0,0,0);
  model.scale.setScalar(num(state.figure.height,150,185)/165);
  if(lie){
    model.rotation.x=-Math.PI/2;
    model.rotation.z=pose==='lieSideLeft'?.16:pose==='lieSideRight'?-.16:0;
    model.position.y=.13;
    orbit.target.set(0,.17,-.74);
    orbit.pitch=.56;
    orbit.distance=3.4;
  }else if(pose.startsWith('sit')){
    model.position.y=-.40;
    orbit.target.set(0,.72,0);
  }else{
    orbit.target.set(0,.89,0);
  }
  needPose=true;
}

function openPanel(open){$('fbPanel').classList.toggle('closed',!open);$('fbToggle').setAttribute('aria-expanded',String(open));}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch{}}
const specs={
 figure:[['height','身高',150,185,1,'cm'],['weight','体重',42,90,1,'kg'],
  ['legSpacing','双腿间距',75,155,5,'%'],
  ['waist','腰部比例',70,145,1,'%'],['hips','臀部比例',75,140,1,'%'],
  ['chest','胸部轮廓',75,145,1,'%'],['shoulders','肩宽比例',75,140,1,'%'],
  ['legLength','腿长比例',80,125,1,'%']],
 face:[['eyesH','眼部高度',-100,100,5,'%'],['noseW','鼻翼宽度',-100,100,5,'%'],
  ['lipsW','唇部宽度',-100,100,5,'%'],['jawW','下颌宽度',-100,100,5,'%'],
  ['faceRound','脸型圆润',-100,100,5,'%'],['faceLength','脸部长度',-100,100,5,'%']],
 hair:[['length','头发长度',50,150,5,'%'],['volume','发量蓬松',65,145,5,'%'],
  ['fringe','刘海长度',0,100,5,'%']],
};
const sections={
 figure:'基于 MakeHuman 完整女性网格进行连续形体调整；身高单位为厘米，其余体型比例为视觉形变。',
 face:'眼、鼻、口、下颌与脸型使用 MakeHuman 官方 CC0 顶点形变目标，而非贴图伪装。',
 hair:'发型由独立可变形发片组成，与全身模型保持同步。可分别改变长度、蓬松程度及刘海。',
 outfit:'基础套装与全身人体分属独立网格层。切换套装不会改变身体形态。',
 fabric:'全身丝袜材质支持独立 Denier、珠光、湿润与颜色控制；腿部实验室的高级湿润场景保持独立。',
 pose:'本模式采用全身网格的基本髋膝动作与整身姿态；腿部实验室保留原有精细动作与左右独立控制。',
 scene:'四种场景沿用 ATELIER 世界坐标的 3D 背景，绕视角旋转时背景和模型同步。',
};
const options=(obj,current,field)=>'<div class="fb-chip-grid">'+Object.entries(obj).map(([key,label])=>
  '<button data-pick="'+field+'" data-val="'+key+'" class="'+(key===current?'active':'')+'">'+label+'</button>').join('')+'</div>';
const swatches=(arr,current,field)=>'<div class="fb-swatches">'+arr.map(c=>
  '<button aria-label="'+c+'" title="'+c+'" data-pick="'+field+'" data-val="'+c+'" style="--swatch:'+c+'" class="'+(c.toLowerCase()===String(current).toLowerCase()?'active':'')+'"></button>').join('')+'</div>';
let currentTab='figure';
function renderControls(){
  $('fbTabs').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.tab===currentTab));
  const container=$('fbControls');
  let html='<p class="fb-section-head">'+currentTab.toUpperCase()+' / 模特编辑</p>';
  if(specs[currentTab])for(const [key,label,min,max,step,unit] of specs[currentTab]){
    const val=state[currentTab][key];
    html+='<div class="fb-control"><label for="fb_'+key+'">'+label+'</label>'+
      '<input id="fb_'+key+'" type="range" data-group="'+currentTab+'" data-key="'+key+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+val+'">'+
      '<output>'+val+unit+'</output></div>';
  }
  if(currentTab==='hair'){
    html+='<p class="fb-section-head">发型预设</p>'+options(HAIRSTYLES,state.hair.style,'hair.style')+
      '<p class="fb-section-head">发色</p>'+swatches(hairColors,state.hair.color,'hair.color');
  }
  if(currentTab==='outfit'){
    html+=options(OUTFITS,state.outfit,'outfit')+
      '<p class="fb-section-head">服装颜色</p>'+swatches(clothingColors,state.outfitColor,'outfitColor')+
      '<p class="fb-section-head">基础肤色</p>'+swatches(skinColors,state.skin,'skin');
  }
  if(currentTab==='fabric'){
    html+=options(FABRICS,state.material,'material')+
      '<div class="fb-control"><label>丝袜层</label><select data-field="stockings">'+
      '<option value="true" '+(state.stockings?'selected':'')+'>显示</option><option value="false" '+(!state.stockings?'selected':'')+'>隐藏</option></select></div>'+
      '<div class="fb-control"><label>Denier 厚度</label><input type="range" min="5" max="200" step="5" data-field="denier" value="'+state.denier+'"><output>'+state.denier+'D</output></div>'+
      '<div class="fb-control"><label>湿润程度</label><input type="range" min="0" max="100" step="1" data-field="wet" value="'+Math.round(state.wet*100)+'"><output>'+Math.round(state.wet*100)+'%</output></div>'+
      '<p class="fb-section-head">织物颜色</p>'+swatches(clothingColors,state.fabricColor,'fabricColor');
  }
  if(currentTab==='pose'){
    html+=options(POSES,state.pose,'pose')+
      '<div class="fb-control"><label>动作幅度</label><input type="range" min="20" max="200" step="10" data-field="amplitude" value="'+state.amplitude+'"><output>'+state.amplitude+'%</output></div>'+
      '<div class="fb-control"><label>动作速度</label><input type="range" min="30" max="200" step="10" data-field="speed" value="'+state.speed+'"><output>'+state.speed+'%</output></div>';
  }
  if(currentTab==='scene')html+=options(SCENES,state.scene,'scene');
  html+='<p class="fb-note">'+sections[currentTab]+'</p>';
  container.innerHTML=html;
}
function assignPick(field,value){
  const parts=field.split('.');
  if(parts.length===2)state[parts[0]][parts[1]]=value;
  else state[field]=value;
  if(field==='hair.style'||field==='hair.color')buildHair();
  if(field==='outfit'||field==='outfitColor'||field==='stockings'||field==='fabricColor'||field==='material')updateWardrobe();
  if(field==='skin')skinMaterial.color.set(value);
  if(field==='material')changePearlMaterial();
  if(field==='pose')updateRootPose();
  if(field==='scene')environment.setScene(value);
  save();renderControls();
}
$('fbControls').addEventListener('click',e=>{
  const b=e.target.closest('button[data-pick]');if(b)assignPick(b.dataset.pick,b.dataset.val);
});
$('fbControls').addEventListener('input',e=>{
  const el=e.target;
  if(el.dataset.group){
    const group=el.dataset.group,key=el.dataset.key;
    state[group][key]=num(el.value,Number(el.min),Number(el.max));
    const output=el.parentElement.querySelector('output');
    output.textContent=state[group][key]+(group==='figure'?(key==='height'?'cm':key==='weight'?'kg':'%'):'%');
    if(group==='hair')buildHair();
    else if(group==='figure'){
      if(key==='height')model.scale.setScalar(num(state.figure.height,150,185)/165);
      refreshShape();
    }else if(group==='face')refreshShape();
  }else if(el.dataset.field){
    const key=el.dataset.field;
    state[key]=key==='stockings'?(el.value==='true'):key==='wet'?num(el.value,0,100)/100:Number(el.value);
    const output=el.parentElement.querySelector('output');
    if(output)output.textContent=el.value+(key==='denier'?'D':'%');
    if(key==='denier'||key==='wet'||key==='stockings')updateWardrobe();
  }
  save();
});
$('fbTabs').addEventListener('click',e=>{const b=e.target.closest('button[data-tab]');if(b){currentTab=b.dataset.tab;renderControls();}});
const togglePanel=()=>openPanel($('fbPanel').classList.contains('closed'));
$('fbToggle').onclick=togglePanel;$('fbOpenControls').onclick=()=>openPanel(true);
$('fbClose').onclick=()=>openPanel(false);
$('fbSave').onclick=()=>{save();hint.textContent='全身模特设定已保存在此浏览器';};
$('fbResetAppearance').onclick=()=>{state=cloneDefaults();updateRootPose();updateAppearance();environment.setScene(state.scene);renderControls();save();};
$('fbResetCamera').onclick=()=>{orbit.yaw=.26;orbit.pitch=.12;orbit.distance=3.7;orbit.target.set(0,.9,0);if(state.pose.startsWith('lie'))updateRootPose();};
$('fbSplash').onclick=()=>{state.wet=num(state.wet+.35,0,1);updateWardrobe();save();hint.textContent='织物湿润程度 '+Math.round(state.wet*100)+'%';};
$('fbRain').onclick=()=>{state.rain=!state.rain;$('fbRain').setAttribute('aria-pressed',String(state.rain));save();};
$('fbDry').onclick=()=>{state.wet=0;updateWardrobe();save();hint.textContent='织物已恢复干燥';};
$('fbPhoto').onclick=()=>{renderer.render(scene,camera);const a=document.createElement('a');a.download='ATELIER-fullbody.png';a.href=renderer.domElement.toDataURL('image/png');a.click();};

function setOrbitFromPointers(){
  const entries=[...activePointers.values()];
  if(entries.length===2){
    const distance=Math.hypot(entries[0].x-entries[1].x,entries[0].y-entries[1].y);
    if(lastPinch>0)orbit.distance=num(orbit.distance*(lastPinch/Math.max(1,distance)),1.6,7);
    lastPinch=distance;
  }else lastPinch=0;
}
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});setOrbitFromPointers();});
canvas.addEventListener('pointermove',e=>{
  const p=activePointers.get(e.pointerId);if(!p)return;
  if(activePointers.size===1){orbit.yaw-=(e.clientX-p.x)*.007;orbit.pitch=num(orbit.pitch-(e.clientY-p.y)*.006,-.65,1.32);}
  activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});setOrbitFromPointers();
});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{activePointers.delete(e.pointerId);setOrbitFromPointers();});
canvas.addEventListener('wheel',e=>{e.preventDefault();orbit.distance=num(orbit.distance*Math.exp(e.deltaY*.0008),1.5,7);},{passive:false});
window.addEventListener('resize',()=>{renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));renderer.setSize(window.innerWidth,window.innerHeight,false);camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();});
camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();
function setCamera(){
  const r=Math.cos(orbit.pitch)*orbit.distance;
  camera.position.set(orbit.target.x+Math.sin(orbit.yaw)*r,
    orbit.target.y+Math.sin(orbit.pitch)*orbit.distance,
    orbit.target.z+Math.cos(orbit.yaw)*r);
  camera.lookAt(orbit.target);
  environment.setUnderground(camera.position.y<-.025);
}
function animate(timestamp){
  requestAnimationFrame(animate);
  const dt=Math.min((timestamp-frameTimestamp)/1000||0,.045);frameTimestamp=timestamp;
  if(state.rain){state.wet=Math.min(1,state.wet+dt*.055);updateWardrobe();}
  if(MOTION.has(state.pose))animClock+=dt;
  if(needShape)refreshShape();
  if(needPose||(MOTION.has(state.pose)&&timestamp-lastAnimate>52)){updatePose(animClock);lastAnimate=timestamp;}
  if(garments.length){const sh=garments.find(x=>x.name==='stocking')?.material.userData.shader;
    if(sh){sh.uniforms.atelierWet.value=state.wet;sh.uniforms.atelierPearl.value=state.material==='pearl'?1:0;}}
  setCamera();
  renderer.render(scene,camera);
}
renderControls();
openPanel(!matchMedia('(max-width:600px)').matches);
environment.setScene(state.scene);
updateRootPose();
loadModel().then(()=>{requestAnimationFrame(animate);}).catch(err=>{
  console.error('ATELIER fullbody load failed',err);
  hint.textContent='模型加载失败：'+err.message+'。腿部实验室仍可正常使用。';
});
