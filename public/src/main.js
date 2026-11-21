import * as THREE from '../vendor/three.module.js';
import { loadMesh } from './mesh.js';
import { dropletFragment, dropletVertex, fabricFragment, fabricVertex, skinFragment, skinVertex, stageFragment, stageVertex, panoramaVertex, outlineVertex, outlineFragment } from './shaders.js';
import { initUI } from './ui.js';
import { applyPose, isMotionPose, isSeatedPose, isLyingPose, isAdjustableStandingPose, clearMotionCache } from './pose.js';
import { createSpatialEnvironment } from './environment.js';

const canvas = document.getElementById('view');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const mobilePointer = matchMedia('(pointer: coarse)').matches;
const lengths = {
  ankle: [.132, .022], crew: [.285, .034], knee: [.425, .04],
  over: [.545, .05], thigh: [.7, .05], tights: [1, .05],
};
const palette = {
  ink: '#141318', smoke: '#6c7381', ivory: '#f4f1f3', nude: '#dba585',
  coffee: '#5a3a2c', wine: '#6e1b2e', cherry: '#c22a3a', sakura: '#f3b3c6',
  taro: '#b49ad6', mist: '#8fb4de', navy: '#1f2a4d', forest: '#254a3c',
};
const backgrounds = {
  lilac: ['#f0edef', '#e3dae7'], sakura: ['#fbf1f3', '#f3d6dd'],
  mint: ['#f1f8f5', '#cfe7df'], cream: ['#fbf7ee', '#f0e3c8'],
  sky: ['#f0f6fc', '#cbdff3'], dusk: ['#4a4868', '#2a2944'],
};
const sceneKeys = ['studio', 'bath', 'street', 'pool'];
const scenicColors = {
  bath: ['#ccdfe2', '#bec7cd'],
  street: ['#303044', '#252a39'],
  pool: ['#bde9ea', '#e4dccc'],
};
const styles = ['sheer', 'matte', 'gloss', 'pearl', 'velvet', 'cotton', 'latex'];
const cuffs = ['plain', 'lace', 'stripes', 'rib', 'bow'];
const patterns = ['none', 'dots', 'argyle', 'net', 'hoops', 'pins', 'seam', 'hearts', 'stars', 'lace', 'fade', 'paws'];
const defaultLeg = { length: 'thigh', cuff: 'lace', material: 'sheer', denier: 40, color: 'ink' };
const restTarget = new THREE.Vector3(0, .43, .035);
const maxStains = 24;
const poses = ['single', 'together', 'step', 'crossed', 'tiptoe', 'point', 'pigeon',
  'bendForward', 'bendTiptoe', 'tiptoeShake', 'bendTiptoeShake', 'pigeonTiptoeShake', 'stepPoint', 'stepPointShake', 'sitNatural', 'sitReach', 'sitCross', 'kick', 'walk', 'run', 'sitBounce', 'sitCrossKick',
  'lieFlat', 'lieBent', 'lieCrossLeft', 'lieCrossRight', 'lieSideLeft', 'lieSideRight', 'lieSpread'];

function createSound() {
  // All water sounds are Web Audio noise synthesis. Tap keeps the upstream
  // bandpass splash contour; drag, a fuller bucket, and scene-specific rain
  // provide distinct layers with no external audio files or autoplay.
  const AudioAPI=window.AudioContext||window.webkitAudioContext;
  let ctx,noise,rainNoise,master,rainSource,rainGain,rainFilter;
  let enabled=true,raining=false,unlocked=false,profile='studio',lastDrag=-100;
  const rainProfiles={
    studio:{frequency:1450,gain:.016,rate:.91,Q:.42},
    bath:{frequency:2450,gain:.032,rate:1.24,Q:.32},
    street:{frequency:780,gain:.034,rate:.80,Q:.46},
    pool:{frequency:1800,gain:.019,rate:1.02,Q:.40},
  };

  function ensureAudio(userGesture=false) {
    if(userGesture)unlocked=true;
    if(!enabled||!unlocked||!AudioAPI)return null;
    try {
      if(!ctx){
        ctx=new AudioAPI();
        master=ctx.createGain();
        master.gain.value=1;
        master.connect(ctx.destination);
        const makeNoise=(seconds,loop=false)=>{
          const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*seconds),ctx.sampleRate);
          const samples=buffer.getChannelData(0);
          for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
          if(loop){
            const edge=Math.floor(ctx.sampleRate*.025);
            for(let i=0;i<edge;i++){
              const factor=(i+1)/edge,last=samples.length-edge+i;
              samples[last]=samples[last]*(1-factor)+samples[edge-1-i]*factor;
            }
          }
          return buffer;
        };
        noise=makeNoise(.55);
        rainNoise=makeNoise(1.8,true);
      }
      if(ctx.state==='suspended')ctx.resume().catch(()=>{});
      return ctx;
    }catch(error){
      console.warn('Sound unavailable',error);
      return null;
    }
  }

  function transient(kind='tap',strength=1) {
    const c=ensureAudio(true);
    if(!c)return;
    const source=c.createBufferSource();
    const filter=c.createBiquadFilter();
    const gain=c.createGain();
    const now=c.currentTime;
    source.buffer=noise;
    let duration=.33;
    if(kind==='wipe'){
      duration=.40;
      source.playbackRate.value=.67;
      filter.type='lowpass';
      filter.frequency.setValueAtTime(1550,now);
      filter.frequency.exponentialRampToValueAtTime(380,now+.34);
      gain.gain.setValueAtTime(.001,now);
      gain.gain.linearRampToValueAtTime(.067*strength,now+.034);
      gain.gain.exponentialRampToValueAtTime(.001,now+.38);
    }else if(kind==='drag'){
      duration=.16;
      source.playbackRate.value=1.08+Math.random()*.25;
      filter.type='bandpass';
      filter.Q.value=.71;
      filter.frequency.setValueAtTime(2250,now);
      filter.frequency.exponentialRampToValueAtTime(880,now+.14);
      gain.gain.setValueAtTime(.001,now);
      gain.gain.linearRampToValueAtTime(.07*strength,now+.012);
      gain.gain.exponentialRampToValueAtTime(.001,now+.15);
    }else if(kind==='bucketBody'){
      duration=.37;
      source.playbackRate.value=.52+Math.random()*.13;
      filter.type='lowpass';
      filter.frequency.setValueAtTime(1100,now);
      filter.frequency.exponentialRampToValueAtTime(340,now+.32);
      gain.gain.setValueAtTime(.001,now);
      gain.gain.linearRampToValueAtTime(.13*strength,now+.025);
      gain.gain.exponentialRampToValueAtTime(.001,now+.34);
    }else{
      // Original Github splash timbre and envelope.
      source.playbackRate.value=.82+Math.random()*.42;
      filter.type='bandpass';
      filter.Q.value=.56;
      filter.frequency.setValueAtTime(2900,now);
      filter.frequency.exponentialRampToValueAtTime(640,now+.29);
      gain.gain.setValueAtTime(.001,now);
      gain.gain.linearRampToValueAtTime(.22*strength,now+.016);
      gain.gain.exponentialRampToValueAtTime(.001,now+.30);
    }
    source.connect(filter).connect(gain).connect(master);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
    source.start(now);
    source.stop(now+duration);
    if(raining)startRain();
  }

  function stopRain(){
    if(!rainSource)return;
    const source=rainSource,gain=rainGain;
    rainSource=null;rainGain=null;rainFilter=null;
    const now=ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0,now,.035);
    try{source.stop(now+.18);}catch{}
  }
  function updateRainProfile(){
    if(!ctx||!rainSource)return;
    const p=rainProfiles[profile]||rainProfiles.studio;
    rainFilter.frequency.setTargetAtTime(p.frequency,ctx.currentTime,.08);
    rainFilter.Q.setTargetAtTime(p.Q,ctx.currentTime,.08);
    rainGain.gain.setTargetAtTime(p.gain,ctx.currentTime,.12);
    rainSource.playbackRate.setTargetAtTime(p.rate,ctx.currentTime,.08);
  }
  function startRain(){
    if(!raining||!enabled||rainSource)return;
    const c=ensureAudio(false);
    if(!c)return;
    const p=rainProfiles[profile]||rainProfiles.studio;
    const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
    const now=c.currentTime;
    source.buffer=rainNoise;
    source.loop=true;
    source.playbackRate.value=p.rate;
    filter.type='bandpass';
    filter.frequency.value=p.frequency;
    filter.Q.value=p.Q;
    gain.gain.setValueAtTime(.001,now);
    gain.gain.linearRampToValueAtTime(p.gain,now+.32);
    source.connect(filter).connect(gain).connect(master);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
    rainSource=source;rainGain=gain;rainFilter=filter;
    source.start(now);
  }
  return {
    unlock(){ if(ensureAudio(true)&&raining)startRain(); },
    setEnabled(value){
      enabled=Boolean(value);
      if(!enabled){
        stopRain();
        if(master)master.gain.setTargetAtTime(0,ctx.currentTime,.012);
      }else{
        const c=ensureAudio(true);
        if(c){master.gain.setTargetAtTime(1,c.currentTime,.012);startRain();}
      }
    },
    setProfile(value){profile=Object.hasOwn(rainProfiles,value)?value:'studio';updateRainProfile();},
    setRain(value){raining=Boolean(value);if(raining)startRain();else stopRain();},
    play(strength=.6){transient('tap',strength);},
    drag(){
      const c=ensureAudio(true);
      if(c&&c.currentTime-lastDrag>=.13){lastDrag=c.currentTime;transient('drag',.85);}
    },
    bucket(){transient('tap',1);transient('bucketBody',.85);},
    dry(){transient('wipe',1);},
  };
}

function fabricMaterial(skinAppearance) {
  return new THREE.ShaderMaterial({
    uniforms: {
      dye: { value: new THREE.Color(palette.ink) },
      wetDye: { value: new THREE.Color(0) },
      tint: { value: new THREE.Color(0xffffff) },
      skinTint: skinAppearance.tint,
      skinLightness: skinAppearance.lightness,
      lengthLimit: { value: .7 },
      band: { value: .05 },
      denier: { value: 40 },
      toeStyle: { value: 0 },
      patternDensity: { value: 1 },
      patternRandomness: { value: .45 },
      fabric: { value: 0 },
      cuff: { value: 1 },
      pattern: { value: 0 },
      secret: { value: 0 },
      garter: { value: 0 },
      skinOnly: { value: 0 },
      reflection: { value: 0 },
      time: { value: 0 },
      stains: { value: Array.from({ length: maxStains }, () => new THREE.Vector4(0, 0, 0, 0)) },
    },
    vertexShader: fabricVertex,
    fragmentShader: fabricFragment,
    transparent: true,
  });
}

function updateFabric(uniforms, clothes) {
  const config = { ...defaultLeg, ...clothes };
  const [limit, band] = lengths[config.length] ?? lengths.thigh;
  uniforms.dye.value.set(palette[config.color] ?? config.color ?? palette.ink);
  uniforms.wetDye.value.set(palette[config.wetColor] ?? (config.wetColor || 0));
  uniforms.lengthLimit.value = limit;
  uniforms.band.value = band;
  uniforms.denier.value = THREE.MathUtils.clamp(Number(config.denier) || 40,5,200);
  uniforms.toeStyle.value = Math.max(0,['natural','reinforced','seamless','tabi'].indexOf(config.toeStyle));
  uniforms.patternDensity.value=THREE.MathUtils.clamp(Number(config.patternDensity)||100,20,200)/100;
  uniforms.patternRandomness.value=THREE.MathUtils.clamp(Number(config.patternRandomness??45),0,100)/100;
  uniforms.fabric.value = Math.max(0, styles.indexOf(config.material));
  uniforms.cuff.value = config.length === 'tights' ? 0 : Math.max(0, cuffs.indexOf(config.cuff));
  uniforms.pattern.value = Math.max(0, patterns.indexOf(config.pattern));
  uniforms.secret.value = config.secret === 'words' ? 2 : Math.max(0, patterns.indexOf(config.secret));
  uniforms.garter.value = Number(Boolean(config.garter));
}

function radialShadow() {
  const image = document.createElement('canvas');
  image.width = image.height = 64;
  const ctx = image.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,.91)');
  gradient.addColorStop(.36, 'rgba(255,255,255,.54)');
  gradient.addColorStop(.70, 'rgba(255,255,255,.15)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(image);
}

function bakeFloorShadow(models) {
  const resolution = 384;
  const image = document.createElement('canvas');
  image.width = image.height = resolution;
  const raw = image.cloneNode();
  const outlines = raw.getContext('2d');
  const coordinates = new THREE.Vector3();
  const projected = [];
  for (const { group, cloth } of models) {
    if (!group.visible) continue;
    group.updateMatrixWorld(true);
    const geometry = cloth.geometry;
    const points = geometry.attributes.position;
    projected.length = points.count * 2;
    for (let index = 0; index < points.count; index++) {
      coordinates.fromBufferAttribute(points, index).applyMatrix4(cloth.matrixWorld);
      const x = coordinates.x + coordinates.y * .35;
      const z = coordinates.z - coordinates.y * 1.45;
      projected[index * 2] = (x + .50) * resolution / 1.85;
      projected[index * 2 + 1] = (z + 1.55) * resolution / 2;
    }

    outlines.beginPath();
    const faces = geometry.index.array;
    for (let index = 0; index < faces.length; index += 3) {
      const a = faces[index] * 2;
      const b = faces[index + 1] * 2;
      const c = faces[index + 2] * 2;
      const ax = projected[a];
      const ay = projected[a + 1];
      const bx = projected[b];
      const by = projected[b + 1];
      const cx = projected[c];
      const cy = projected[c + 1];
      const clockwise = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay) > 0;
      outlines.moveTo(ax, ay);
      outlines.lineTo(clockwise ? bx : cx, clockwise ? by : cy);
      outlines.lineTo(clockwise ? cx : bx, clockwise ? cy : by);
      outlines.closePath();
    }
    outlines.fillStyle = 'white';
    outlines.fill();
  }

  const ctx = image.getContext('2d');
  // Soft penumbra: keep the tight foot-contact decal while broad cast shadows
  // lose the hard cardboard-cutout outline.
  ctx.filter = 'blur(8px)';
  ctx.drawImage(raw, 0, 0);
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'destination-in';
  const falloff = ctx.createLinearGradient(0, resolution * .1, 0, resolution * .93);
  falloff.addColorStop(0, 'rgba(255,255,255,.22)');
  falloff.addColorStop(.52, 'rgba(255,255,255,.68)');
  falloff.addColorStop(1, 'rgba(255,255,255,.91)');
  ctx.fillStyle = falloff;
  ctx.fillRect(0, 0, resolution, resolution);
  return new THREE.CanvasTexture(image);
}

function createEngine({ stocking }) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false, preserveDrawingBuffer: true,
    powerPreference: mobilePointer ? 'default' : 'high-performance',
  });
  const world = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, .02, 80);
  const thumbCamera = new THREE.PerspectiveCamera(30, 3 / 4, .02, 12);
  const backdropMaterial = new THREE.ShaderMaterial({
    uniforms: {
      upper: { value: new THREE.Color() },
      lower: { value: new THREE.Color() },
      kind: { value: 0 },
      time: { value: 0 },
      aspect: { value: 1.6 },
    },
    vertexShader: stageVertex,
    fragmentShader: stageFragment,
    depthTest: false,
    depthWrite: false,
  });
  // Retain a screen-space gradient for neutral studio mode.
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backdropMaterial);
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -10;
  world.add(backdrop);
  // Scenic modes live in a stationary panoramic shell, so camera orbit
  // changes the observed environment as well as the garment silhouette.
  // These are illustrated panoramas, not geometrically reconstructed rooms.
  const panoramaMaterial = new THREE.ShaderMaterial({
    uniforms: {
      upper: backdropMaterial.uniforms.upper,
      lower: backdropMaterial.uniforms.lower,
      kind: backdropMaterial.uniforms.kind,
      time: backdropMaterial.uniforms.time,
      aspect: { value: 1.6 },
    },
    vertexShader: panoramaVertex,
    fragmentShader: stageFragment,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  });
  const panorama = new THREE.Mesh(new THREE.SphereGeometry(8, 96, 48), panoramaMaterial);
  panorama.position.copy(restTarget);
  panorama.rotation.y = -0.62;
  panorama.renderOrder = -10;
  panorama.frustumCulled = false;
  panorama.visible = false;
  world.add(panorama);
  // 3D spatial scenes replace the old spherical painted floors.
  const spatialEnvironment = createSpatialEnvironment(THREE, world);

  const contactTexture = radialShadow();
  const shadowGeometry = new THREE.PlaneGeometry(.31, .56);
  const shadowCache = new Map();
  const floorShade = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 2), new THREE.MeshBasicMaterial({
    color: '#8f7b9b', transparent: true, opacity: .50, depthWrite: false,
  }));
  floorShade.position.set(.425, .001, -.55);
  floorShade.rotation.x = -Math.PI / 2;
  floorShade.renderOrder = -3;
  world.add(floorShade);
  // Global skin appearance; the skin and the garment use the SAME uniforms.
  // Default (1,1,1) exactly reproduces the upstream shader's original skin.
  const skinAppearance = {
    tint: { value: new THREE.Vector3(1,1,1) },
    lightness: { value: 1 },
  };
  const legMeshes = [];
  const models = [0, 1].map(index => {
    const group = new THREE.Group();
    // Derive a full-length inner-skin surface from the continuous stocking rest mesh.
    // The supplied 'skin' GLB mesh covers only the upper thigh, leaving a gap below it.
    // The skin shader recesses its vertices slightly so cloth stays outside and anti-z-fights.
    const skinMesh = new THREE.Mesh(stocking.clone(), new THREE.ShaderMaterial({
      uniforms: { skinTint: skinAppearance.tint, skinLightness: skinAppearance.lightness },
      vertexShader: skinVertex, fragmentShader: skinFragment,
      // Opaque, depth-writing skin on both sides of the open leg.
      // Its inward-facing surface screens the dark BackSide outline when
      // looking down the cut, while MSAA coverage softens only the top fade.
      // No transparent skin sorting: the near leg still occludes the far one.
      transparent: false, depthTest: true, depthWrite: true,
      alphaToCoverage: true, side: THREE.DoubleSide,
    }));
    skinMesh.renderOrder = 0;
    group.add(skinMesh);
    const geometry = stocking.clone();
    const cloth = new THREE.Mesh(geometry, fabricMaterial(skinAppearance));
    cloth.userData.leg = index;
    cloth.material.depthWrite = false;
    cloth.renderOrder = 1;
    group.add(cloth);
    // Restore the original repository's outward-expanded back-face outline.
    // Keep it transparent + depth-tested; the opaque skin continues to occlude
    // the far leg. Share the deformed cloth geometry and length uniform so
    // this never becomes a separate animated mesh that can desynchronize.
    const outline = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      uniforms: { lengthLimit: cloth.material.uniforms.lengthLimit },
      vertexShader: outlineVertex,
      fragmentShader: outlineFragment,
      transparent: true,
      side: THREE.BackSide,
      depthTest: true,
      depthWrite: false,
    }));
    outline.renderOrder = 0;
    group.add(outline);
    const reflectionMaterial = new THREE.ShaderMaterial({
      uniforms: { ...cloth.material.uniforms, reflection: { value: 0 } },
      vertexShader: fabricVertex, fragmentShader: fabricFragment,
      transparent: true, depthWrite: false,
    });
    const reflection = new THREE.Mesh(geometry, reflectionMaterial);
    reflection.scale.set(index === 0 ? 1 : -1, -1, 1);
    reflection.renderOrder = -4;
    world.add(reflection);
    const contact = new THREE.Mesh(shadowGeometry, new THREE.MeshBasicMaterial({
      map: contactTexture, color: '#8e7c9c', transparent: true, opacity: .36, depthWrite: false,
    }));
    contact.position.set(.02, .002, .061);
    contact.rotation.x = -Math.PI / 2;
    contact.renderOrder = -2;
    // Foot contact is a world-space decal at y=0, never attached to the
    // elevated limb rig: attaching it to group made the shadow hover.
    world.add(contact);
    group.scale.x = index === 0 ? 1 : -1;
    world.add(group);
    legMeshes.push(cloth);
    return { group, skinMesh, cloth, outline, reflection, contact, nextStain: 0 };
  });

  // Seated poses are shown without a chair or other seat geometry.

  // A stable rest-mesh vertex near the front arch keeps soft contact decals
  // aligned to animated feet rather than to their hip/group transforms.
  const restFeet=stocking.attributes.position;
  let footVertex=0,minFootDistance=Infinity;
  for(let i=0;i<restFeet.count;i++){
    const dx=restFeet.getX(i),dy=restFeet.getY(i)-.035,dz=restFeet.getZ(i)-.105;
    const d=dx*dx+dy*dy+dz*dz;
    if(d<minFootDistance){minFootDistance=d;footVertex=i;}
  }
  const contactProbe=new THREE.Vector3();
  const droplets = [];
  const ripples = [];
  const dropletGeometry = new THREE.IcosahedronGeometry(1, 1);
  const dropMaterial = new THREE.ShaderMaterial({
    vertexShader: dropletVertex, fragmentShader: dropletFragment, transparent: true, depthWrite: false,
  });
  const rimGeometry = new THREE.RingGeometry(.83, 1, 28);
  const ray = new THREE.Raycaster();
  const hitVector = new THREE.Vector2();
  const sound = createSound();
  const pointers = new Map();
  const view = { yaw: .76, pitch: .12, range: 2.50, target: restTarget.clone() };
  const liveView = { yaw: .76, pitch: .12, range: 2.50, target: restTarget.clone() };
  const panelCamera={active:false,previous:null,signature:''};
  let environment = 'studio';
  let colorway = 'lilac';
  let wardrobe = [defaultLeg, defaultLeg];
  let pose = 'step';
  let mode = 'water';
  let rain = false;
  let slow = false;
  let rainClock = 0;
  let playClock = 0;
  let motionClock = 0, lastMotionUpdate = -Infinity;
  let motionPlaying = true, motionSpeed = 1, motionAmplitude = 1;
  let footMotion={lateral:1,forward:1,heel:1};
  let legMorph={length:1,height:1,calf:1,thigh:1};
  const footPitch = [0,0]; // Per-leg ankle pitch in degrees, applies to every pose.
  let legSpacing = 1; // Distance between bilateral hip origins, relative to pose default.
  const motionHz = {kick:.85,walk:1.18,run:1.85,sitBounce:2.5,sitCrossKick:1.05,tiptoeShake:3.0,bendTiptoeShake:3.6,pigeonTiptoeShake:3.25,stepPointShake:3.1};
  let width = 1;
  let height = 1;
  let projectionLeft = 0;
  let verticalProjectionOffset = 0;
  let belowGround = false;
  let lastTime = performance.now();
  let lastInput = lastTime;

  function setScene(sceneName, colorName) {
    environment = sceneName ?? environment;
    colorway = colorName ?? colorway;
    const colors = environment === 'studio'
      ? (Array.isArray(colorway) ? colorway : backgrounds[colorway] ?? backgrounds.lilac)
      : scenicColors[environment] ?? scenicColors.bath;
    const customColor = typeof colorway === 'string' && /^#[0-9a-f]{6}$/i.test(colorway);
    const settings = backdropMaterial.uniforms;
    settings.upper.value.set(customColor && environment === 'studio' ? colorway : colors[0]);
    settings.lower.value.set(colors[1]);
    if (customColor && environment === 'studio') settings.lower.value.copy(settings.upper.value).multiplyScalar(.79);
    // The stage gradient is distant only; every walkable surface is 3D at y=0.
    settings.kind.value = 0;
    backdrop.visible = true;
    panorama.visible = false;
    spatialEnvironment.setScene(environment);
    sound.setProfile(environment);
    const tint = environment === 'street' ? '#c1afd2' : '#ffffff';
    const reflectAmount = { bath: .22, street: .28, pool: .12 }[environment] ?? 0;
    models.forEach(({ group, cloth, reflection }) => {
      cloth.material.uniforms.tint.value.set(tint);
      reflection.material.uniforms.reflection.value = reflectAmount;
      reflection.visible = group.visible && !belowGround &&
        !isMotionPose(pose) && !isSeatedPose(pose) && reflectAmount > 0;
    });
    floorShade.material.color.set({bath: '#84929f', pool: '#8a877f', street: '#252333'}[environment] ?? '#9a88a8');
  }

  function setSkinAppearance(config = {}) {
    const tone = config.tone || 'original';
    const preset = {
      original: [1,1,1],
      porcelain: [1.16,1.22,1.18],
      warm: [1.08,1.03,.93],
      neutral: [1,.96,.94],
      tan: [.83,.79,.72],
      deep: [.62,.63,.59],
    };
    let multipliers = preset[tone];
    if (!multipliers && /^#[0-9a-f]{6}$/i.test(tone)) {
      // For custom swatches, compare sRGB channel proportions to the
      // original skin's representative display colour. A multiplier of
      // exactly one remains the canonical, source-matched appearance.
      const rgb = [1,3,5].map(i=>parseInt(tone.slice(i,i+2),16));
      multipliers = rgb.map((v,i)=>THREE.MathUtils.clamp(v/[201,157,154][i],.42,1.48));
    }
    skinAppearance.tint.value.set(...(multipliers || preset.original));
    const brightness = Number(config.brightness);
    skinAppearance.lightness.value = THREE.MathUtils.clamp(
      Number.isFinite(brightness) ? brightness/100 : 1, .70, 1.30);
  }

  function setMaterial(config) {
    wardrobe = Array.isArray(config) ? config : config?.legs ?? [config, config];
    models.forEach(({ cloth }, index) => updateFabric(cloth.material.uniforms, wardrobe[index]));
  }

  function placePose(phase=0) {
    const seated=isSeatedPose(pose),lying=isLyingPose(pose),moving=isMotionPose(pose);
    models.forEach(({ group, skinMesh, cloth, reflection, contact }, index) => {
      applyPose(skinMesh.geometry,stocking,pose,index,phase,motionAmplitude,
        footPitch,footMotion,legMorph);
      const {x,y,z,visible}=applyPose(cloth.geometry,stocking,pose,index,phase,
        motionAmplitude,footPitch,footMotion,legMorph);
      const scale=legMorph.height;
      group.scale.set((index===0?1:-1)*scale,scale,scale);
      // Preserve anatomical hip pivots: adjust only bilateral placement,
      // not leg geometry or the knee/ankle transforms.
      group.position.set(x*legSpacing*scale,y*scale,z*scale);
      group.visible=visible;
      group.updateMatrixWorld(true);
      // Contact follows the posed foot, and is suppressed while airborne.
      const p=cloth.geometry.attributes.position;
      contactProbe.set(p.getX(footVertex),p.getY(footVertex),p.getZ(footVertex));
      group.localToWorld(contactProbe);
      contact.position.set(contactProbe.x,.0032,contactProbe.z);
      contact.visible=visible&&!belowGround&&!lying&&contactProbe.y<.085;
      reflection.position.set(x*legSpacing*scale,-y*scale,z*scale);
      reflection.scale.set((index===0?1:-1)*scale,-scale,scale);
      reflection.visible=visible&&!belowGround&&!seated&&!lying&&!moving&&
        reflection.material.uniforms.reflection.value>0;
    });
    floorShade.visible=!seated&&!lying&&!moving&&!belowGround;
  }
  function refreshStandingShadow(){
    if(isMotionPose(pose)||isSeatedPose(pose)||isLyingPose(pose))return;
    const old=shadowCache.get(pose);
    const fresh=bakeFloorShadow(models);
    shadowCache.set(pose,fresh);
    floorShade.material.map=fresh;
    floorShade.material.needsUpdate=true;
    if(old&&old!==fresh)old.dispose();
  }
  function setPose(name) {
    const next=poses.includes(name)?name:'step';
    if(next===pose&&models[0].cloth.geometry.hasAttribute('restPosition'))return;
    pose=next;
    motionClock=0;
    lastMotionUpdate=-Infinity;
    placePose(0);
    // Static ground shadows are baked once. Animated and seated poses use
    // foot contact decals instead of a frozen standing silhouette.
    if(!isMotionPose(pose)&&!isSeatedPose(pose)&&!isLyingPose(pose)){
      if(!shadowCache.has(pose))shadowCache.set(pose,bakeFloorShadow(models));
      floorShade.material.map=shadowCache.get(pose);
      floorShade.material.needsUpdate=true;
    }
    if(panelCamera.active)fitPanelCamera();
  }

  function panelBounds(){
    const bounds=new THREE.Box3().makeEmpty(),point=new THREE.Vector3();
    models.forEach(({group,cloth})=>{
      if(!group.visible||!cloth.geometry.boundingBox)return;
      group.updateMatrixWorld(true);
      const b=cloth.geometry.boundingBox;
      for(const x of [b.min.x,b.max.x])
        for(const y of [b.min.y,b.max.y])
          for(const z of [b.min.z,b.max.z])
            bounds.expandByPoint(point.set(x,y,z).applyMatrix4(group.matrixWorld));
    });
    if(bounds.isEmpty())bounds.setFromCenterAndSize(restTarget,new THREE.Vector3(.5,1,.4));
    return bounds.expandByScalar(.028*legMorph.height);
  }
  function panelRegion(){
    const rect=canvas.getBoundingClientRect();
    const sheet=document.body.classList.contains('mat-open')
      ?document.getElementById('materials'):document.getElementById('scenes');
    const dock=document.querySelector('.dock');
    const sheetTop=sheet?.getBoundingClientRect().top??rect.bottom;
    const bottom=Math.min(sheetTop-16,(dock?.getBoundingClientRect().top??rect.bottom)-12);
    const top=Math.max(rect.top+78,rect.top+rect.height*.075);
    const freeHeight=Math.max(70,bottom-top);
    // Bias the full-leg preview upward by another 10–42 CSS pixels.
    // This offset is included in the perspective-fit budget, so lifting
    // the model never clips the thigh or toes against the top safe edge.
    const lift=Math.min(42,freeHeight*.15);
    return {top:top-rect.top,bottom:bottom-rect.top,
      height:freeHeight,width:Math.max(120,rect.width-38),
      lift,sheetTop};
  }
  function fitPanelCamera(){
    if(!panelCamera.active||document.body.classList.contains('wide'))return;
    const bounds=panelBounds(),center=bounds.getCenter(new THREE.Vector3()),points=[];
    for(const x of [bounds.min.x,bounds.max.x])
      for(const y of [bounds.min.y,bounds.max.y])
        for(const z of [bounds.min.z,bounds.max.z])
          points.push(new THREE.Vector3(x,y,z));
    const region=panelRegion();
    const cp=Math.cos(view.pitch),sp=Math.sin(view.pitch);
    const sy=Math.sin(view.yaw),cy=Math.cos(view.yaw);
    const towardsCamera=new THREE.Vector3(sy*cp,sp,cy*cp);
    const right=new THREE.Vector3(cy,0,-sy);
    const up=new THREE.Vector3().crossVectors(towardsCamera,right);
    const focal=Math.max(1,height)/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov)*.5));
    const projected=points.map(point=>{
      const v=point.sub(center);
      return [Math.abs(v.dot(right)),Math.abs(v.dot(up)),v.dot(towardsCamera)];
    });
    const halfWidth=region.width*.46;
    // Reserve enough projected space above the lifted centre for the
    // entire upper-leg silhouette; the bottom has more spare room.
    const halfHeight=Math.max(14,(region.height*.5-region.lift)*.91);
    const fits=distance=>projected.every(([x,y,z])=>{
      const depth=distance-z;
      return depth>.08&&x*focal/depth<=halfWidth&&y*focal/depth<=halfHeight;
    });
    let low=.15,high=.5;
    while(!fits(high)&&high<40)high*=1.6;
    for(let i=0;i<22;i++){
      const mid=(low+high)*.5;
      if(fits(mid))high=mid;else low=mid;
    }
    view.target.copy(center);
    view.range=THREE.MathUtils.clamp(high*1.035,.25,40);
    lastInput=performance.now();
  }
  function setPanelFraming(open=false,force=false){
    const enabled=Boolean(open)&&!document.body.classList.contains('wide');
    if(!enabled){
      if(panelCamera.active&&panelCamera.previous){
        const old=panelCamera.previous;
        view.yaw=old.yaw;view.pitch=old.pitch;view.range=old.range;
        view.target.copy(old.target);
      }
      panelCamera.active=false;panelCamera.previous=null;panelCamera.signature='';
      lastInput=performance.now();
      return;
    }
    if(!panelCamera.active){
      panelCamera.previous={yaw:view.yaw,pitch:view.pitch,
        range:view.range,target:view.target.clone()};
    }
    panelCamera.active=true;
    const r=panelRegion();
    const signature=[Math.round(width),Math.round(height),
      Math.round(r.sheetTop),pose,legMorph.length,legMorph.height,legSpacing].join(':');
    if(!force&&signature===panelCamera.signature)return;
    panelCamera.signature=signature;
    fitPanelCamera();
  }
  function resetCamera() {
    const extent=legMorph.height*(.2+.8*legMorph.length);
    if(isLyingPose(pose)){
      // Reclining rigs are anchored near the ground and extend along +Z.
      // A high 3/4 view makes knee overlap and sidedness inspectable.
      view.target.set(0,.24*extent,.44*extent);
      view.yaw=.39;
      view.pitch=.64;
      view.range=1.88*extent;
    }else{
      view.yaw=.76;
      view.pitch=.12;
      view.range = (pose === 'single' ? 1.95 : 2)*extent;
      view.target.copy(restTarget).multiplyScalar(extent);
    }
    lastInput = performance.now();
    if(panelCamera.active)fitPanelCamera();
  }
  function focusToes(targetLeg = '-1') {
    // Use the actual posed foot transforms. A fixed camera target would
    // drift away from toes when switching crossing/tiptoe/pigeon poses.
    world.updateMatrixWorld(true);
    const selected = targetLeg === '0' ? [0] :
      targetLeg === '1' && models[1].group.visible ? [1] :
      models[1].group.visible ? [0,1] : [0];
    const point = new THREE.Vector3();
    const center = new THREE.Vector3();
    selected.forEach(index => {
      point.set(0,.035,.177);
      models[index].group.localToWorld(point);
      center.add(point);
    });
    center.multiplyScalar(1 / selected.length);
    view.target.copy(center);
    // Keep both feet within narrow portrait-screen horizontal FOV.
    view.range = selected.length === 1 ? .58 : .92;
    view.yaw = .17;
    view.pitch = .23;
    lastInput = performance.now();
  }

  function orient(targetCamera, state) {
    const radius = Math.cos(state.pitch) * state.range;
    targetCamera.position.set(
      state.target.x + Math.sin(state.yaw) * radius,
      state.target.y + Math.sin(state.pitch) * state.range,
      state.target.z + Math.cos(state.yaw) * radius,
    );
    targetCamera.lookAt(state.target);
    targetCamera.updateMatrixWorld();
  }

  function zoom(step) {
    view.range=THREE.MathUtils.clamp(view.range*Math.exp(-step*.19),
      .23,panelCamera.active?40:3.2);
    lastInput = performance.now();
  }

  function orbit(dx, dy) {
    // Revert both drag axes relative to the previous deployment.
    // Mouse and single-touch drags share this one orbit function.
    view.yaw -= dx * .009;
    view.pitch = THREE.MathUtils.clamp(view.pitch + dy * .007, -.60, 1.25);
    lastInput = performance.now();
  }

  function resize() {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    const limit = mobilePointer ? 2200000 : 4200000;
    renderer.setPixelRatio(Math.min(devicePixelRatio, mobilePointer ? 2 : 1.75, Math.sqrt(limit / (width * height))));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    backdropMaterial.uniforms.aspect.value = camera.aspect;
    camera.fov = width / height < .75 ? 34 : 30;
    camera.updateProjectionMatrix();
    if(panelCamera.active)setPanelFraming(true,true);
  }

  function updateCamera(delta) {
    const follow = 1 - Math.exp(-delta * 9);
    if(!reducedMotion.matches&&!panelCamera.active&&!pointers.size
      &&mode!=='view'&&performance.now()-lastInput>9000){
      view.yaw += delta * .105;
    }
    liveView.yaw += (view.yaw - liveView.yaw) * follow;
    liveView.pitch += (view.pitch - liveView.pitch) * follow;
    liveView.range += (view.range - liveView.range) * follow;
    liveView.target.lerp(view.target, follow);
    orient(camera, liveView);
    // The real ground plane is at y=0. Crossing it from below must not
    // expose floor undersides or inverted architecture. Hysteresis prevents
    // blinking around the threshold during spring-damped camera movement.
    const nextBelowGround = belowGround
      ? camera.position.y < .035
      : camera.position.y < -.025;
    if (nextBelowGround !== belowGround) {
      belowGround = nextBelowGround;
      spatialEnvironment.setUnderground(belowGround);
      // Reapply the current pose's contact/reflection policy. Simply toggling
      // every decal back on revives fake shadows under reclining legs.
      placePose(isMotionPose(pose)?motionClock*(motionHz[pose]||1):0);
    }
    const rect = canvas.getBoundingClientRect();
    const isWide = document.body.classList.contains('wide');
    const cssX = getComputedStyle(document.documentElement).getPropertyValue('--stage-x');
    const stageCenterX = isWide && Number.isFinite(parseFloat(cssX))
      ? parseFloat(cssX) - rect.left : width * .5;
    // Project around the visible canvas, not the full window; do not change zoom.
    const desiredX = THREE.MathUtils.clamp(stageCenterX, width * .18, width * .82);
    const horizontalOffset = width * .5 - desiredX;
    projectionLeft += (horizontalOffset - projectionLeft) * follow;

    const sheetOpen=!isWide&&document.body.classList.contains('sheet-open');
    let verticalOffset=0;
    if(!isWide){
      if(sheetOpen){
        const r=panelRegion();
        // Pan into the unobstructed strip ABOVE the sheet, rather than
        // limiting vertical movement to 16vh as the old camera did.
        verticalOffset=THREE.MathUtils.clamp(
          height*.5-(r.top+r.bottom)*.5+r.lift,0,height*.48);
      }else{
        const dockTop=document.querySelector('.dock')?.getBoundingClientRect().top??rect.bottom;
        const visibleHeight=Math.max(height*.32,
          Math.min(rect.bottom,dockTop)-rect.top);
        verticalOffset=THREE.MathUtils.clamp(
          height*.5-visibleHeight*.5,0,height*.16);
      }
    }
    verticalProjectionOffset += (verticalOffset - verticalProjectionOffset) * follow;
    if (Math.abs(projectionLeft) > .05 || Math.abs(verticalProjectionOffset) > .05) {
      camera.setViewOffset(width, height, projectionLeft, verticalProjectionOffset, width, height);
    } else if (camera.view?.enabled) {
      camera.clearViewOffset();
    }
  }

  function markWet(mesh, point, radius) {
    const index = mesh.userData.leg;
    const model = models[index];
    const local = mesh.worldToLocal(point.clone());
    const uniforms = mesh.material.uniforms;
    if (local.y >= uniforms.lengthLimit.value && uniforms.lengthLimit.value < .9) return;
    const stains = uniforms.stains.value;
    const close = stains.find(stain => stain.w > 0 && Math.hypot(stain.x - local.x, stain.y - local.y, stain.z - local.z) < .021);
    if (close) close.w = Math.min(.089, Math.max(close.w, radius) * 1.13);
    else {
      stains[model.nextStain].set(local.x, local.y, local.z, radius);
      model.nextStain = (model.nextStain + 1) % maxStains;
    }
  }

  function rippleAt(position) {
    if (ripples.length >= 28) return;
    const mesh = new THREE.Mesh(rimGeometry, new THREE.MeshBasicMaterial({
      color: '#f7f3fd', transparent: true, opacity: .60, depthWrite: false, side: THREE.DoubleSide,
    }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(position.x, .003, position.z);
    mesh.scale.setScalar(.013);
    world.add(mesh);
    ripples.push({ mesh, age: 0 });
  }

  function spawnDrops(point, amount, power, attached) {
    const count = Math.min(amount, 390 - droplets.length);
    for (let i = 0; i < count; i++) {
      const speed = .13 + Math.random() * power;
      const angle = Math.random() * Math.PI * 2;
      const radius = (.0008 + Math.pow(Math.random(), 2) * .0042) * (.64 + power * .33);
      const mesh = new THREE.Mesh(dropletGeometry, dropMaterial);
      mesh.position.copy(point);
      mesh.position.x += (Math.random() - .5) * .028;
      mesh.position.z += (Math.random() - .5) * .024;
      mesh.scale.set(radius, radius * (1.2 + Math.random() * .70), radius);
      mesh.renderOrder = 3;
      world.add(mesh);
      const bead = Boolean(attached) && i % 4 === 0;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * speed, .12 + Math.random() * .76 * power, Math.sin(angle) * speed,
      );
      if (bead) velocity.set(0, -.01 - Math.random() * .07, 0);
      droplets.push({ mesh, velocity, bead, age: 0, life: bead ? 1.15 + Math.random() * 3.5 : 1.35 });
    }
  }

  function pickLeg(x, y) {
    const rect = canvas.getBoundingClientRect();
    hitVector.set((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2);
    ray.setFromCamera(hitVector, camera);
    return ray.intersectObjects(legMeshes.filter(mesh => mesh.parent.visible), false)[0];
  }

  function splash(x, y, quiet = false) {
    const hit = pickLeg(x, y);
    if (!hit) return false;
    const local = hit.object.worldToLocal(hit.point.clone());
    if (local.y > hit.object.material.uniforms.lengthLimit.value) return false;
    markWet(hit.object, hit.point, quiet ? .026 : .046);
    spawnDrops(hit.point, quiet ? 7 : 50, quiet ? .55 : 1.01, true);
    if (quiet) sound.drag();
    else sound.play(.6);
    return true;
  }

  function bucket() {
    const visibleLegs = models.filter(model => model.group.visible);
    for (const { group, cloth } of visibleLegs) {
      const center = group.position.clone();
      const towardEye = camera.position.clone().sub(center);
      towardEye.y = 0;
      towardEye.normalize();
      const across = new THREE.Vector3(towardEye.z, 0, -towardEye.x);
      for (let index = 0; index < 7; index++) {
        const foot = index > 3;
        const height = foot ? .020 + Math.random() * .060 : .27 + Math.random() * .12;
        const point = center.clone().addScaledVector(towardEye, .52);
        point.y = height;
        point.addScaledVector(across, (Math.random() - .5) * (foot ? .063 : .092));
        ray.set(point, towardEye.clone().negate());
        const hit = ray.intersectObject(cloth, false)[0];
        if (!hit) continue;
        markWet(cloth, hit.point, (foot ? .014 : .034) + Math.random() * .024);
        spawnDrops(hit.point, foot ? 7 : 14, .88, true);
      }
    }
    sound.bucket();
  }

  function dry() {
    sound.dry();
    for (const model of models) {
      for (const mark of model.cloth.material.uniforms.stains.value) mark.w = 0;
    }
    for (const { mesh } of droplets) world.remove(mesh);
    for (const { mesh } of ripples) {
      mesh.material.dispose();
      world.remove(mesh);
    }
    droplets.length = 0;
    ripples.length = 0;
  }

  function updateWater(delta) {
    rainClock += delta;
    if (rain && rainClock > .052) {
      rainClock = 0;
      for (const { group, cloth } of models.filter(model => model.group.visible)) {
        const x = (Math.random() - .5) * .18;
        const z = (Math.random() - .5) * .19;
        const point = group.localToWorld(new THREE.Vector3(x, .95 + Math.random() * .22, z));
        spawnDrops(point, 3, .45, false);
        if (Math.random() > .35) {
          const skin = group.localToWorld(new THREE.Vector3(x * .65, .11 + Math.random() * .54, z * .58));
          markWet(cloth, skin, .025 + Math.random() * .025);
        }
      }
    }
    for (let i = droplets.length - 1; i >= 0; i--) {
      const drop = droplets[i];
      drop.age += delta;
      if (drop.bead && drop.age > .40) drop.velocity.y -= delta * .13;
      if (!drop.bead) drop.velocity.y -= delta * 5.0;
      drop.mesh.position.addScaledVector(drop.velocity, delta);
      if (drop.mesh.position.y <= .002 || drop.age > drop.life) {
        if (drop.mesh.position.y <= .002 && Math.random() > .66) rippleAt(drop.mesh.position);
        world.remove(drop.mesh);
        droplets.splice(i, 1);
      }
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const ring = ripples[i];
      ring.age += delta;
      ring.mesh.scale.setScalar(.012 + ring.age * .16);
      ring.mesh.material.opacity = .56 * Math.max(0, 1 - ring.age * 1.58);
      if (ring.age > .65) {
        world.remove(ring.mesh);
        ring.mesh.material.dispose();
        ripples.splice(i, 1);
      }
    }
  }

  function run(time) {
    requestAnimationFrame(run);
    const dt = Math.max(0, Math.min(.05, (time - lastTime) * .001));
    lastTime = time;
    playClock += dt * (slow ? .20 : 1);
    if(isMotionPose(pose)&&motionPlaying){
      motionClock += dt * (slow ? .25 : 1) * motionSpeed;
      if(motionClock-lastMotionUpdate >= 1/30){
        placePose(motionClock * (motionHz[pose]||1));
        lastMotionUpdate=motionClock;
      }
    }
    backdropMaterial.uniforms.time.value = playClock;
    spatialEnvironment.update(dt * (slow ? .20 : 1));
    updateCamera(dt);
    for (const pointer of pointers.values()) {
      if (!pointer.wet) continue;
      pointer.timer += dt;
      if (pointer.timer > .073) {
        pointer.timer = 0;
        splash(pointer.x, pointer.y, true);
      }
    }
    updateWater(dt * (slow ? .20 : 1));
    renderer.render(world, camera);
  }

  function photo() {
    renderer.render(world, camera);
    const result = document.createElement('canvas');
    result.width = canvas.width;
    result.height = canvas.height;
    const ctx = result.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    const scale = Math.max(.65, result.height / 900);
    const margin = 28 * scale;
    ctx.fillStyle = 'rgba(47,40,56,.86)';
    ctx.font = `${Math.round(34 * scale)}px "ZCOOL XiaoWei", "Songti SC", serif`;
    ctx.fillText('ATELIER', margin, result.height - margin - 21 * scale);
    ctx.fillStyle = 'rgba(92,82,108,.82)';
    ctx.font = `${Math.round(13 * scale)}px system-ui, sans-serif`;
    ctx.fillText('DIGITAL FABRIC STUDIO  ·  CC0 BODY / CC BY TEXTILE', margin, result.height - margin);
    return result.toDataURL('image/jpeg', .93);
  }

  const thumbnailQueue = new Map();
  function thumbnail(target, config) {
    thumbnailQueue.set(target, config);
    if (thumbnailQueue.size === 1) requestAnimationFrame(drawThumbnail);
  }

  function drawThumbnail() {
    const next = thumbnailQueue.entries().next();
    if (next.done) return;
    const [target, config] = next.value;
    thumbnailQueue.delete(target);
    if (target.isConnected) {
      const current = { environment, colorway, wardrobe, pose };
      const cachedVisibility = [...droplets, ...ripples].map(({ mesh }) => [mesh, mesh.visible]);
      cachedVisibility.forEach(([mesh]) => { mesh.visible = false; });
      setScene(config?.scene ?? environment, config?.backdrop ?? colorway);
      if (config?.material) setMaterial(config.material);
      setPose(config?.pose ?? pose);
      const w = target.width;
      const h = target.height;
      thumbCamera.aspect = w / h;
      backdropMaterial.uniforms.aspect.value = thumbCamera.aspect;
      thumbCamera.updateProjectionMatrix();
      orient(thumbCamera, { yaw: .80, pitch: .12, range: 2.22, target: restTarget });
      const buffer = new THREE.WebGLRenderTarget(w, h);
      buffer.texture.colorSpace = THREE.SRGBColorSpace;
      renderer.setRenderTarget(buffer);
      renderer.render(world, thumbCamera);
      const pixels = new Uint8Array(w * h * 4);
      renderer.readRenderTargetPixels(buffer, 0, 0, w, h, pixels);
      renderer.setRenderTarget(null);
      backdropMaterial.uniforms.aspect.value = camera.aspect;
      buffer.dispose();
      const ctx = target.getContext('2d');
      const image = ctx.createImageData(w, h);
      for (let line = 0; line < h; line++) {
        image.data.set(pixels.subarray((h - line - 1) * w * 4, (h - line) * w * 4), line * w * 4);
      }
      ctx.putImageData(image, 0, 0);
      setScene(current.environment, current.colorway);
      setMaterial(current.wardrobe);
      setPose(current.pose);
      cachedVisibility.forEach(([mesh, visible]) => { mesh.visible = visible; });
    }
    if (thumbnailQueue.size) requestAnimationFrame(drawThumbnail);
  }

  // One deliberate user gesture unlocks Web Audio on iOS/WebKit. Initial
  // hash-based scene restoration cannot start audio without such a gesture.
  document.addEventListener('pointerdown',()=>sound.unlock(),{once:true,capture:true});
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.button !== 2) return;
    canvas.setPointerCapture(event.pointerId);
    lastInput = performance.now();
    const wet = mode === 'water' && event.button === 0 && pointers.size === 0 && splash(event.clientX, event.clientY);
    const tap = mode === 'view' && event.button === 0 && pointers.size === 0;
    for (const previous of pointers.values()) previous.tap = false;
    pointers.set(event.pointerId, {
      x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
      startedAt: lastInput, tap, wet, timer: -.06,
    });
  });
  canvas.addEventListener('pointermove', event => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    const previous = { x: pointer.x, y: pointer.y };
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) >= 6) pointer.tap = false;
    if (pointers.size >= 2) {
      const other = [...pointers.values()].find(member => member !== pointer);
      const before = Math.hypot(other.x - previous.x, other.y - previous.y);
      const after = Math.hypot(other.x - pointer.x, other.y - pointer.y);
      if (before > 1) {
        view.range = THREE.MathUtils.clamp(view.range * before / Math.max(1, after), .23, 3.2);
      }
      pointer.wet = other.wet = false;
    } else if (!pointer.wet) orbit(pointer.x - previous.x, pointer.y - previous.y);
  });
  canvas.addEventListener('pointerup', event => {
    const pointer = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (mode !== 'view' || !pointer?.tap || performance.now() - pointer.startedAt >= 350 ||
        Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) >= 6) return;
    const hit = pickLeg(event.clientX, event.clientY);
    if (!hit) return;
    view.target.copy(hit.point);
    view.range = Math.min(view.range, .65);
    lastInput = performance.now();
  });
  for (const type of ['pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, event => pointers.delete(event.pointerId));
  }
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    zoom(THREE.MathUtils.clamp(-event.deltaY * .008, -1.5, 1.5));
  }, { passive: false });
  new ResizeObserver(resize).observe(canvas);
  resize();
  setScene('studio', 'lilac');
  setPose('step');

  return {
    setScene, setSkinAppearance, setMaterial, setPose, setPanelFraming,
    zoom, orbit, resetCamera, focusToes, bucket, dry, photo, thumbnail,
    setLegSpacing(percent) {
      const next=THREE.MathUtils.clamp((Number(percent)||100)/100,.75,1.55);
      if(Math.abs(next-legSpacing)<.001)return;
      legSpacing=next;
      placePose(isMotionPose(pose)?motionClock*(motionHz[pose]||1):0);
      refreshStandingShadow();
      if(panelCamera.active)fitPanelCamera();
    },
    setFootPitch(values) {
      const next = [0,1].map(i=>THREE.MathUtils.clamp(Number(values?.[i]) || 0,-35,35));
      if(next.every((v,i)=>Math.abs(v-footPitch[i])<.001))return;
      footPitch[0]=next[0];footPitch[1]=next[1];
      // Static and animated poses share a rest mesh cache. Updating the
      // ankle must invalidate BOTH deformed position and normal buffers.
      clearMotionCache();
      placePose(isMotionPose(pose)?motionClock*(motionHz[pose]||1):0);
      refreshStandingShadow();
    },
    setMotionAmplitude(value) {
      const next=THREE.MathUtils.clamp(Number(value)||1,.2,2);
      if(Math.abs(next-motionAmplitude)<.0001)return;
      motionAmplitude=next;
      clearMotionCache();
      if(isMotionPose(pose)||isAdjustableStandingPose(pose)){
        placePose(isMotionPose(pose)?motionClock*(motionHz[pose]||1):0);
      }
      if(isAdjustableStandingPose(pose))refreshStandingShadow();
      if(panelCamera.active)fitPanelCamera();
    },
    setFootMotion(value){
      const next=Object.fromEntries(['lateral','forward','heel'].map(key=>[
        key,THREE.MathUtils.clamp(Number(value?.[key]??1),0,2),
      ]));
      if(Object.keys(next).every(key=>Math.abs(next[key]-footMotion[key])<.0001))return;
      footMotion=next;
      clearMotionCache();
      if(isMotionPose(pose))placePose(motionClock*(motionHz[pose]||1));
    },
    setLegMorph(value){
      const limits={length:[.82,1.22],height:[.80,1.30],thigh:[.75,1.35],calf:[.75,1.35]};
      const next=Object.fromEntries(Object.entries(limits).map(([key,[lo,hi]])=>[
        key,THREE.MathUtils.clamp(Number(value?.[key]??1),lo,hi),
      ]));
      if(Object.keys(next).every(key=>Math.abs(next[key]-legMorph[key])<.0001))return;
      const previousExtent=legMorph.height*(.2+.8*legMorph.length);
      const nextExtent=next.height*(.2+.8*next.length);
      const ratio=nextExtent/previousExtent;
      legMorph=next;
      clearMotionCache();
      placePose(isMotionPose(pose)?motionClock*(motionHz[pose]||1):0);
      // Preserve the user's orbit rather than snapping back to a preset.
      // Rescale distance and target so taller/longer legs stay framed on phones.
      if(Math.abs(ratio-1)>.0001){
        view.range=THREE.MathUtils.clamp(view.range*ratio,.23,3.2);
        if(isLyingPose(pose))view.target.z*=ratio;
        else view.target.y*=ratio;
      }
      refreshStandingShadow();
      if(panelCamera.active)fitPanelCamera();
    },
    setMotionPlaying(value) { motionPlaying=Boolean(value); },
    setMotionSpeed(value) { motionSpeed=THREE.MathUtils.clamp(Number(value)||1,.5,2); },
    setMode(value) { mode = value; lastInput = performance.now(); },
    setRain(value) { rain = value; sound.setRain(rain); },
    setSlow(value) { slow = value; },
    async present() {
      updateCamera(.85);
      await renderer.compileAsync(world, camera);
      renderer.render(world, camera);
      renderer.getContext().finish();
      lastInput = lastTime = performance.now();
      requestAnimationFrame(run);
    },
    setSound(value) { sound.setEnabled(value); },
  };
}

try {
  const engine = createEngine(await loadMesh(THREE));
  initUI(engine);
  await engine.present();
  requestAnimationFrame(() => document.body.classList.add('ready'));
} catch (error) {
  console.error(error);
  document.getElementById('loading').textContent = '加载失败，请确认浏览器已启用 WebGL 后刷新。';
}
