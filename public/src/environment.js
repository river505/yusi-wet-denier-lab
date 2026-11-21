// ATELIER spatial environments. All walkable surfaces share y=0 with the foot rig.
// Scene props use metric-style local units and remain stationary under camera orbit.
export function createSpatialEnvironment(T, world) {
  const root = new T.Group();
  world.add(root);
  // The source demo renders most surfaces with unlit GLSL; the new physical
  // stages require actual Three.js lights or every floor/wall turns black.
  const ambience=new T.HemisphereLight('#e8f1ff','#817b7b',2.35);
  world.add(ambience);
  const keyLight=new T.DirectionalLight('#fff3de',2.4);
  keyLight.position.set(2.6,4.6,3.8);
  world.add(keyLight);
  const fillLight=new T.DirectionalLight('#c6dfff',.95);
  fillLight.position.set(-3.5,2.5,-2.5);
  world.add(fillLight);
  const groups = Object.fromEntries(['studio','bath','street','pool'].map(n=>[n,new T.Group()]));
  Object.values(groups).forEach(g=>root.add(g));
  const color = s=>new T.Color(s);
  function tileTexture(kind) {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
    const ctx=canvas.getContext('2d');
    const light=kind==='bath',wet=kind==='street',stone=kind==='pool';
    ctx.fillStyle=light?'#d5dce5':wet?'#343846':stone?'#d4cec0':'#e7e0ec';
    ctx.fillRect(0,0,512,512);
    const seed=i=>(Math.sin(i*114.51+47.37)*43758.5453)%1;
    const divisions=wet?4:stone?8:light?8:16, cell=512/divisions;
    for(let y=0;y<divisions;y++)for(let x=0;x<divisions;x++){
      const n=seed(y*divisions+x);
      const v=Math.round(Math.abs(n)*15);
      ctx.fillStyle=wet?'rgba(110,129,151,'+(.045+Math.abs(n)*.075)+')':
        'rgba(255,255,255,'+(.025+Math.abs(n)*.095)+')';
      ctx.fillRect(x*cell+1,y*cell+1,cell-2,cell-2);
      if(!wet){ctx.strokeStyle=light?'rgba(124,155,183,.34)':'rgba(114,112,114,.24)';
        ctx.lineWidth=light?1.65:1.2;ctx.strokeRect(x*cell+.65,y*cell+.65,cell-1.3,cell-1.3);}
    }
    for(let i=0;i<2700;i++){let x=Math.abs(seed(i*17))*512,y=Math.abs(seed(i*9+4))*512;
      ctx.fillStyle=i%2?'rgba(255,255,255,.06)':'rgba(45,39,50,.035)';ctx.fillRect(x,y,1.2,1.2)}
    const t=new T.CanvasTexture(canvas);t.wrapS=t.wrapT=T.RepeatWrapping;
    t.repeat.set(wet?3:stone?3:light?5:2,wet?3:stone?3:light?5:2);
    t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;
    return t;
  }
  function plane(parent,w,h,material,x=0,y=-.013,z=0) {
    const m=new T.Mesh(new T.PlaneGeometry(w,h),material);
    m.rotation.x=-Math.PI/2;m.position.set(x,y,z);m.receiveShadow=true;parent.add(m);return m;
  }
  function box(parent,w,h,d,mat,x,y,z) {
    const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);
    m.castShadow=false;m.receiveShadow=true;parent.add(m);return m;
  }
  // Small radius bevels remove the toy-like perfectly sharp bathtub cutouts.
  function roundedBox(parent,w,h,d,radius,material,x,y,z) {
    const rad=Math.min(radius,w*.32,h*.32,d*.32);
    const geometry=new T.BoxGeometry(w,h,d,24,10,12);
    const position=geometry.attributes.position;
    const normals=geometry.attributes.normal;
    for(let i=0;i<position.count;i++) {
      const px=position.getX(i),py=position.getY(i),pz=position.getZ(i);
      const cx=T.MathUtils.clamp(px,-w/2+rad,w/2-rad);
      const cy=T.MathUtils.clamp(py,-h/2+rad,h/2-rad);
      const cz=T.MathUtils.clamp(pz,-d/2+rad,d/2-rad);
      const dx=px-cx,dy=py-cy,dz=pz-cz;
      const len=Math.max(.000001,Math.hypot(dx,dy,dz));
      position.setXYZ(i,cx+dx/len*rad,cy+dy/len*rad,cz+dz/len*rad);
      normals.setXYZ(i,dx/len,dy/len,dz/len);
    }
    const mesh=new T.Mesh(geometry,material);
    mesh.position.set(x,y,z);
    mesh.receiveShadow=true;
    parent.add(mesh);
    return mesh;
  }
  function standard(hex,rough=.72,metal=0){return new T.MeshStandardMaterial({color:hex,roughness:rough,metalness:metal,side:T.DoubleSide})}
  function floorMat(kind){return new T.MeshStandardMaterial({map:tileTexture(kind),roughness:kind==='street'?.25:kind==='bath'?.42:.83,metalness:kind==='street'?.25:0,side:T.DoubleSide})}
  plane(groups.studio,20,20,floorMat('studio'));
  const studioDisc=new T.Mesh(new T.CircleGeometry(1.45,100),new T.MeshBasicMaterial({color:'#e0d7e5',transparent:true,opacity:.25,depthWrite:false}));
  studioDisc.rotation.x=-Math.PI/2;studioDisc.position.set(0,-.01,0);groups.studio.add(studioDisc);
  const bath=groups.bath;
  plane(bath,15,15,floorMat('bath'));
  const wallTexture=tileTexture('bath');wallTexture.repeat.set(7,3);
  const wallMaterial=new T.MeshStandardMaterial({map:wallTexture,color:'#a5d5d5',roughness:.48,side:T.DoubleSide});
  const back=new T.Mesh(new T.PlaneGeometry(11,5),wallMaterial);
  back.position.set(0,2,-3.9);bath.add(back);
  const side=new T.Mesh(new T.PlaneGeometry(11,5),wallMaterial);
  side.rotation.y=Math.PI/2;side.position.set(-4.7,2,0);bath.add(side);
  const bathWhite=standard('#ecf2ef',.22),rimWhite=standard('#fbfbf7',.2);
  // The tub is deliberately behind the stance; floor and tub share world axes.
  roundedBox(bath,2.28,.78,.85,.075,bathWhite,.54,.39,-1.65);
  roundedBox(bath,2.32,.075,.92,.022,rimWhite,.54,.81,-1.65);
  const tubWater=new T.MeshBasicMaterial({color:'#82c9d4',transparent:true,opacity:.69});
  plane(bath,2.12,.68,tubWater,.54,.857,-1.65);
  box(bath,2.12,.055,.085,rimWhite,.54,.89,-1.19);
  const tap=standard('#a6b7c7',.21,.67);
  box(bath,.055,.54,.054,tap,-.29,1.09,-2.07);
  box(bath,.31,.055,.055,tap,-.17,1.37,-2.07);
  const duckMat=standard('#f6cf5b',.65);
  const duck=new T.Mesh(new T.SphereGeometry(.12,18,14),duckMat);
  duck.position.set(1.08,.98,-1.62);bath.add(duck);
  const duckHead=new T.Mesh(new T.SphereGeometry(.067,16,12),duckMat);
  duckHead.position.set(1.16,1.07,-1.60);bath.add(duckHead);
  const bill=new T.Mesh(new T.SphereGeometry(.038,10,8),standard('#e7a15c',.6));
  bill.position.set(1.215,1.06,-1.58);bath.add(bill);
  const pool=groups.pool;
  plane(pool,16,12,floorMat('pool'),0,-.013,4.48); // deck extends from z=-1.52 forward
  const poolWaterMat=new T.ShaderMaterial({
    uniforms:{uTime:{value:0}},side:T.DoubleSide,
    vertexShader:`varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float uTime;varying vec3 p;
      void main(){float x=p.x,z=p.y;
      float w=sin(x*11.+z*15.+uTime*.7)+sin(x*18.-z*9.-uTime*.45);
      float a=pow(.5+.5*sin(x*31.+z*16.+2.*sin(z*7.+uTime*.6)),14.);
      float b=pow(.5+.5*sin(x*15.-z*27.+1.7*sin(x*12.-uTime*.5)),12.);
      vec3 c=mix(vec3(.12,.45,.54),vec3(.37,.76,.87),.5+.25*w);
      c+=vec3(.48,.59,.53)*(.18*a+.25*b);gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  plane(pool,16,19,poolWaterMat,0,-.035,-11.02);
  box(pool,16,.1,.16,standard('#f5f2e8',.31),0,0,-1.51);
  // Pool distant trees are fixed three-dimensional forms, not screen artwork.
  const hillMat=standard('#759f79',1);
  for(let i=0;i<7;i++){const h=new T.Mesh(new T.SphereGeometry(1,20,10),hillMat);
    h.scale.set(1.6+i%3*.3,.65+i%2*.2,.33);h.position.set((i-3)*2.1,.49,-6.4);
    pool.add(h)}
  const street=groups.street;
  plane(street,20,20,floorMat('street'));
  const white=standard('#c2c1be',.47,.08),streetSide=standard('#55516c',.67);
  for(let i=0;i<5;i++){
    box(street,.72,.008,.26,white,(i-2)*1.04,.003,-1.6);
  }
  for(let i=0;i<5;i++){
    box(street,1.1,1.1+(.4*(i%3)),.8,streetSide,(i-2)*2.13,.52,-5.2);
  }
  // Bounded neon columns produce view-dependent highlights without a fake screen-space road.
  const neonColors=['#ed83be','#69d9ed','#e6a1ed'];
  for(let i=0;i<3;i++){
    const mat=new T.MeshBasicMaterial({color:neonColors[i],transparent:true,opacity:.83});
    box(street,.12,1.35,.025,mat,(i-1)*2.2,1.1,-4.75);
    const glow=new T.PointLight(neonColors[i],1.5,6,2);
    glow.position.set((i-1)*2.2,1.25,-4.25);street.add(glow);
  }
  let active='studio',time=0;
  let underground = false;
  function setUnderground(flag) {
    underground = Boolean(flag);
    root.visible = !underground;
  }
  function setScene(name){
    active=groups[name]?name:'studio';
    for(const [key,g]of Object.entries(groups))g.visible=key===active;
    // Fog is applied only to distant world-space geometry. Near skin, cloth,
    // and foot contact remain sharp while remote walls/hills blend with the sky.
    const fogSettings={
      studio:['#f0edf1',.035],
      bath:['#c3e0e2',.105],
      pool:['#b9dfe5',.10],
      street:['#363649',.13],
    };
    const [fogColor,fogDensity]=fogSettings[active];
    if(!world.fog)world.fog=new T.FogExp2(fogColor,fogDensity);
    world.fog.color.set(fogColor);
    world.fog.density=fogDensity;
  }
  setScene('studio');
  function update(dt){time+=dt;poolWaterMat.uniforms.uTime.value=time;}
  return{setScene,setUnderground,update,root,groups};
}
