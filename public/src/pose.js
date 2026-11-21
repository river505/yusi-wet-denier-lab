const radians = Math.PI / 180;
const hip = [0, .90, .030];
const knee = [0, .49, .015];
const ankle = [.005, .075, .005];
const toe = [0, .022, .135];

const poses = {
  single: [{ x: 0 }, { x: .092, yaw: 6 }],
  together: [{ x: .089, yaw: 7, roll: -1.2 },
    { x: .089, yaw: 4, roll: -1, pitch: -1.5, knee: 3 }],
  step: [{ x: .084, z: .012, yaw: 15, roll: -4.2, pitch: -8, knee: 6 },
    { x: .092, z: -.012, yaw: 8, roll: -.5, pitch: 2.5 }],
  crossed: [{ x: .100, yaw: 12, roll: -16, pitch: -15, knee: 12 },
    { x: .100, yaw: 5, roll: -6, pitch: 3 }],
  tiptoe: [{ x: .090, yaw: 7, roll: -1, heel: 38 },
    { x: .090, yaw: 5, roll: -1, pitch: -2, knee: 5, heel: 33 }],
  point: [{ x: .087, yaw: 13, roll: -4, pitch: -17, ankle: 34, toe: -24 },
    { x: .092, yaw: 8 }],
  pigeon: [{ x: .094, yaw: -20, roll: 4.5, pitch: -9, knee: 15 },
    { x: .095, yaw: -17, roll: 4.2, pitch: -7.5, knee: 12 }],
  // Both standing bends reuse the anatomical hip, knee, and ankle pivots.
  bendForward: [{ x:.095 }, { x:.095 }],
  bendTiptoe: [{ x:.095 }, { x:.095 }],
  tiptoeShake: [{ x:.090 }, { x:.090 }],
  bendTiptoeShake: [{ x:.095 }, { x:.095 }],
  pigeonTiptoeShake: [{ x:.095 }, { x:.095 }],
  pigeonShake: [{ x:.095 }, { x:.095 }],
  stepShake: [{ x:.085 }, { x:.092 }],
  // Front toe touches the ground; rear foot is a stable load-bearing step.
  stepPoint: [
    {x:.085,z:.058,yaw:13,roll:-4,pitch:-17,knee:12,ankle:34,toe:-24},
    {x:.092,z:-.038,yaw:8,roll:-.5,pitch:2.5,knee:3},
  ],
  stepPointShake: [{x:.085}, {x:.092}],
  // A seat height of 0.57 m gives a hip at y~0.57 and bent legs below it.
  sitNatural: [{ x:.095, pitch:-79, knee:84, yaw:7, roll:-2, shiftY:-.32 },
    { x:.095, pitch:-81, knee:86, yaw:6, roll:2, shiftY:-.32 }],
  sitReach: [{ x:.095, pitch:-79, knee:37, yaw:6, roll:-1, ankle:8, shiftY:-.32 },
    { x:.095, pitch:-80, knee:86, yaw:6, roll:2, shiftY:-.32 }],
  sitCross: [{ x:.095, pitch:-100, knee:62, yaw:-20, roll:40, shiftY:-.32 },
    { x:.095, pitch:-80, knee:87, yaw:8, roll:-5, shiftY:-.32 }],
  // For reclining poses the hip is at y≈.15m; the legs extend into the
  // common world +Z axis. These shifts were checked against the actual GLB
  // bounds (including the foot), not estimated from knee/ankle alone.
  lieFlat: [{x:.095,pitch:-90,yaw:4,shiftY:-.755},
    {x:.095,pitch:-90,yaw:4,shiftY:-.755}],
  lieBent: [{x:.095,pitch:-155,knee:155,yaw:4,shiftY:-.735},
    {x:.095,pitch:-155,knee:155,yaw:4,shiftY:-.735}],
  // Restore the original left-over-right arrangement unchanged.
  // main.js renders the right leg with group.scale.x=-1; exchanging the
  // active leg while preserving the SAME local angles makes a true mirror.
  // Negating yaw/roll here would reflect twice, splaying the foot outward.
  lieCrossLeft: [{x:.095,pitch:-200,knee:110,roll:-15,yaw:-70,shiftY:-.700},
    {x:.095,pitch:-155,knee:155,yaw:4,shiftY:-.735}],
  lieCrossRight: [{x:.095,pitch:-155,knee:155,yaw:4,shiftY:-.735},
    {x:.095,pitch:-200,knee:110,roll:-15,yaw:-70,shiftY:-.700}],
  // Preserve the previously shipped splayed right leg as a distinct pose.
  lieSpread: [{x:.095,pitch:-155,knee:155,yaw:-4,shiftY:-.735},
    {x:.095,pitch:-200,knee:110,roll:25,yaw:-100,kneeYaw:-120,shiftY:-.700}],
  lieSideLeft: [{x:.095,pitch:-92,knee:7,roll:65,yaw:8,shiftY:-.77},
    {x:.095,pitch:-97,knee:20,roll:65,yaw:5,shiftY:-.68}],
  lieSideRight: [{x:.095,pitch:-97,knee:20,roll:-65,yaw:-5,shiftY:-.68},
    {x:.095,pitch:-92,knee:7,roll:-65,yaw:-8,shiftY:-.77}],
};
const motionNames=new Set(['kick','walk','run','sitBounce','sitCrossKick',
  'tiptoeShake','bendTiptoeShake','pigeonTiptoeShake','stepPointShake',
  'pigeonShake','stepShake']);
const lyingNames=new Set(['lieFlat','lieBent','lieCrossLeft','lieCrossRight','lieSideLeft','lieSideRight','lieSpread']);
const seatedNames=new Set(['sitNatural','sitReach','sitCross','sitBounce','sitCrossKick']);
const standingBendNames=new Set(['bendForward','bendTiptoe']);
export const isAdjustableStandingPose=name=>standingBendNames.has(name);
export const isMotionPose = name => motionNames.has(name);
export const isSeatedPose = name => seatedNames.has(name);
export const isLyingPose = name => lyingNames.has(name);
const FRAME_COUNT=12;
function standingBendConfigs(name, amplitude=1) {
  // Forward flexion of the thigh advances the knee while the lower leg
  // counter-rotates; the toe stance additionally raises the heel.
  const amp=Math.max(.2,Math.min(2,Number(amplitude)||1));
  const kneeAngle=Math.min(88,8+42*amp);
  const hipAngle=-Math.min(49,4+23*amp);
  const heelAngle=name==='bendTiptoe'?Math.min(55,5+30*amp):0;
  return [
    {x:.095,yaw:7,roll:-1.8,pitch:hipAngle,knee:kneeAngle,heel:heelAngle},
    {x:.095,yaw:5,roll:1.8,pitch:hipAngle+1,knee:kneeAngle-2,heel:heelAngle},
  ];
}
const defaultFootMotion={lateral:1,forward:1,heel:1};
function motionConfigs(name, phase, amplitude=1, footMotion=defaultFootMotion) {
  // One explicit amplitude parameter scales *excursions*, not the joint
  // neutral pose. Both legs keep their anatomical hip/knee pivot positions.
  const amp=Math.max(.2,Math.min(2,Number(amplitude)||1));
  const theta=phase*Math.PI*2;
  const swing=Math.sin(theta);
  const opposite=Math.sin(theta+Math.PI);
  const bend=v=>Math.max(0,v);
  const seated=poses.sitNatural;
  if(name==='pigeonShake'||name==='stepShake'){
    // These are genuine flat-footed tremors, not aliases for the raised-heel
    // pigeon and toe-pointed staggered animations.
    const inward=name==='pigeonShake';
    const neutral=inward?poses.pigeon:poses.step;
    const heelControl=Math.max(0,Math.min(2,Number(footMotion.heel??1)));
    return neutral.map((cfg,i)=>{
      // Staggered gait: front leg trembles while the rear stabilizes.
      if(!inward&&i===1)return {...cfg};
      const t=theta+i*.34;
      const wobble=Math.sin(t);
      const smallHeel=(inward?3.8:5.)*amp*heelControl*
        (.5-.5*Math.cos(t));
      return {...cfg,
        knee:Math.max(1,(cfg.knee||0)+(inward?3.8:5.2)*amp*wobble),
        pitch:(cfg.pitch||0)-(inward?1.4:1.7)*amp*wobble,
        heel:smallHeel,
        roll:(cfg.roll||0)+(inward?.4:.25)*amp*Math.sin(t+.8),
      };
    });
  }
  if(name==='tiptoeShake'||name==='bendTiptoeShake'||name==='pigeonTiptoeShake'||name==='stepPointShake') {
    const bent=name==='bendTiptoeShake';
    const inward=name==='pigeonTiptoeShake';
    const stepped=name==='stepPointShake';
    // Preserve the existing pigeon-toed hip/knee yaw and roll; the heel
    // lift is added in place, rather than twisting the feet outward.
    const neutral=stepped?poses.stepPoint:
      bent?standingBendConfigs('bendTiptoe',amp):
      inward?poses.pigeon.map((cfg,i)=>({...cfg,heel:i===0?38:35})):
      poses.tiptoe;
    return neutral.map((cfg,i)=>{
      // The rear leg of the staggered pose bears weight and remains stable.
      if(stepped&&i===1)return {...cfg};
      const tremor=Math.sin(theta+(i===0?0:.35));
      const knee=(cfg.knee||0)+(stepped?6.5:bent?8:inward?6.5:5)*amp*tremor;
      const rock=.5-.5*Math.cos(theta+(stepped?0:i*.35));
      const heelTravel=(stepped?7:bent?6.5:7.5)*amp*
        Math.max(0,Math.min(2,Number(footMotion.heel??1)))*rock;
      return {...cfg,
        pitch:(cfg.pitch||0)-(stepped?2.3:bent?2.7:inward?2.1:1.8)*amp*tremor,
        knee:inward?Math.max(3,knee):knee,
        heel:(cfg.heel||0)+heelTravel,
        // Explicit toe-ground correction follows joint deformation.
      };
    });
  }
  if(name==='kick') {
    const pulse=.5-.5*Math.cos(theta);
    return [
      // Kick rotates around the hip joint, with knee flexion relative to
      // the knee joint. Do not translate the kicking leg to keep its toes
      // on the floor: that old sole-height correction pulled the entire
      // limb downward at maximum extension.
      {x:.095, pitch:-13-56*pulse*amp, knee:15+24*(1-pulse)*amp, yaw:6, roll:-2},
      {x:.095,pitch:0,knee:3,yaw:7,roll:-1},
    ];
  }
  if(name==='walk'||name==='run') {
    const speed=name==='run'?1.5:1.;
    const pitchExtent=(name==='run'?39:23)*amp;
    return [swing,opposite].map((value,i)=>({
      x:.095, yaw:8, roll:(i?1:-1)*2, pitch:-pitchExtent*value,
      knee:(name==='run'?13:5)+(name==='run'?57:38)*amp*bend(value),
      ankle:-(name==='run'?12:6)*amp*value,
      lift:(name==='run'?.065:.025)*amp*bend(value),
      z:(name==='run'?.035:.022)*amp*value*speed,
    }));
  }
  if(name==='sitBounce') {
    const lift=Math.max(0,.5+.5*swing);
    return seated.map((cfg,i)=>({
      ...cfg,
      knee:(cfg.knee||84)+ (i===0?9:6)*amp*Math.sin(theta+(i?Math.PI*.45:0)),
      ankle:-5+(i===0?10:6)*amp*swing,
      shiftY:-.32 + (i===0?.025:.010)*amp*lift,
    }));
  }
  if(name==='sitCrossKick') {
    const pulse=.5-.5*Math.cos(theta);
    return [
      {...poses.sitCross[0], pitch:-100-7*pulse*amp,
       knee:Math.max(8,62-48*pulse*amp), ankle:9*pulse*amp},
      {...poses.sitCross[1]},
    ];
  }
  return poses.step;
}

function smoothstep(lower, upper, value) {
  const t = Math.max(0, Math.min(1, (value - lower) / (upper - lower)));
  return t * t * (3 - 2 * t);
}

function xRotation(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return (x, y, z) => [x, c * y - s * z, s * y + c * z];
}

function zRotation(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return (x, y, z) => [c * x - s * y, s * x + c * y, z];
}

function yRotation(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return (x, y, z) => [c * x + s * z, y, c * z - s * x];
}

function rotateAround(point, [x, y, z], rotation, weight = 1) {
  const [a, b, c] = rotation(point[0] - x, point[1] - y, point[2] - z);
  point[0] += (a + x - point[0]) * weight;
  point[1] += (b + y - point[1]) * weight;
  point[2] += (c + z - point[2]) * weight;
}

function makeTransform(config) {
  const pitch = xRotation((config.pitch ?? 0) * radians);
  const roll = zRotation((config.roll ?? 0) * radians);
  const yaw = yRotation((config.yaw ?? 0) * radians);
  const swing = (x, y, z) => yaw(...roll(...pitch(x, y, z)));
  const kneeFlexion=xRotation((config.knee ?? 0) * radians);
  const kneeTwist=yRotation((config.kneeYaw ?? 0) * radians);
  const flexKnee=(x,y,z)=>kneeTwist(...kneeFlexion(x,y,z));
  // Standing poses auto-level the sole relative to the room. When lying
  // down this world-leveling is anatomically wrong: it can align the foot
  // with the shin. For supine/side-lying poses retain the neutral 90-degree
  // ankle joint by letting the foot follow the lower-leg rotation.
  // The original MakeHuman foot-to-shin rest angle, measured on the mesh
  // ankle and toe landmarks, is ~69 degrees. Correct its neutral ankle by
  // -21 degrees for a natural ~90-degree lying foot relative to the calf.
  const solePitch = config.followShin
    ? -21 * radians
    : Math.asin(Math.max(-1, Math.min(1, swing(...flexKnee(0, 0, 1))[1])));
  const soleRoll = config.followShin
    ? 0
    : Math.atan2(-swing(1, 0, 0)[1], swing(...flexKnee(0, 1, 0))[1]);
  const heel = config.heel ?? 0;
  const ankleAngle=solePitch+(heel+(config.ankle??0))*radians;
  const toeAngle=((config.toe??0)-heel)*radians;
  // Weighted point blending of two rotated mesh locations is not a true
  // rotation: the interpolation scales the foot near the ankle and pinches
  // its heel when the heel angle reaches 35–55 degrees. Instead vary the
  // ANGLE, then rotate each vertex about the anatomically fixed pivot.
  const rotateToe=(point,weight)=>{
    const r=xRotation(toeAngle*weight);
    rotateAround(point,toe,r);
  };
  const rotateAnkle=(point,weight)=>{
    const plantar=xRotation(ankleAngle*weight);
    const roll=zRotation(soleRoll*weight);
    rotateAround(point,ankle,(x,y,z)=>roll(...plantar(x,y,z)));
  };

  // On high-heel/pointed poses the original 35mm toe and 65mm ankle
  // blending intervals folded the forefoot into a visible crease.
  // Move the soft hinge into the ankle and distribute toe flex over 80mm.
  // Normal walking/standing and the neutral GLB remain pixel-identical.
  const strongFootFlex=Math.abs(heel)+Math.abs(config.toe??0)+
    Math.abs(config.ankle??0)>20;
  const toeStart=strongFootFlex?.110:.12;
  const toeEnd=strongFootFlex?.190:.160;
  // Keep the heel and talus below y=.10 rigid, distributing the ankle
  // articulation into the lower shin instead of folding the calcaneus.
  const ankleStart=strongFootFlex?.105:.088;
  // Use a progressively broader ankle transition for high plantar flexion.
  // On the actual 4,086-vertex leg mesh a fixed .177 endpoint can invert
  // heel-adjacent triangles above ~70 degrees; the angle-aware band keeps
  // its Jacobian positive even with the extra +/-35 degree pitch control.
  const ankleEnd=strongFootFlex?Math.min(.31,
    Math.max(.20,.19+.00078*Math.abs(ankleAngle)/radians)):.155;
  return (x, y, z) => {
    const point=[x,y,z];
    if(z>toeStart&&y<.095){
      const toeWeight=smoothstep(toeStart,toeEnd,z)*
        (1.-smoothstep(.048,strongFootFlex?.09:.07,y));
      if(toeWeight>0.)rotateToe(point,toeWeight);
    }
    if(y<ankleEnd){
      const ankleWeight=1.-smoothstep(ankleStart,ankleEnd,y);
      if(ankleWeight>0.)rotateAnkle(point,ankleWeight);
    }
    if(y<.565)rotateAround(point,knee,flexKnee,1.-smoothstep(.415,.565,y));
    rotateAround(point,hip,swing);
    return point;
  };
}

function soleHeight(vertices, transform) {
  let minimum = Infinity;
  for (let i = 0; i < vertices.length; i += 3) {
    if (vertices[i + 1] < .14) {
      const posedHeight = transform(vertices[i], vertices[i + 1], vertices[i + 2])[1];
      minimum = Math.min(minimum, posedHeight);
    }
  }
  return minimum;
}

let resolved = new WeakMap();
// Changing a dynamic amplitude invalidates its cached deformed keyframes;
// keeping all slider values would accumulate large mesh buffers on mobile.
export function clearMotionCache() { resolved = new WeakMap(); }
const applied = new WeakMap();

function resolvePose(restGeometry, name, frameIndex=0, amplitude=1,
  footPitch=[0,0], footMotion=defaultFootMotion) {
  let cache = resolved.get(restGeometry);
  if (!cache) {
    cache = new Map();
    resolved.set(restGeometry, cache);
  }
  const key=isMotionPose(name)?name+':'+frameIndex:name;
  if (cache.has(key)) return cache.get(key);
  const vertices = restGeometry.attributes.position.array;
  const footLevel = restGeometry.boundingBox.min.y;
  const configs=isMotionPose(name)?motionConfigs(name,frameIndex/FRAME_COUNT,amplitude,footMotion)
    :isAdjustableStandingPose(name)?standingBendConfigs(name,amplitude):poses[name];
  const followShin = isLyingPose(name);
  const second = makeTransform({ ...configs[1], followShin,
    ankle: (configs[1].ankle || 0) + (Number(footPitch[1]) || 0) });
  let first = makeTransform({ ...configs[0], followShin,
    ankle: (configs[0].ankle || 0) + (Number(footPitch[0]) || 0) });

  let stepPointKnee=null;
  if(name==='point'||name==='stepPoint'||name==='stepPointShake'){
    // Use the SAME standing reference knee angle for the static pose and
    // every animated frame; switching modes cannot make the toe jump.
    const base=name==='stepPointShake'?poses.stepPoint[0]:configs[0];
    const supportingHeight=soleHeight(vertices,second);
    let low=0,high=80;
    for(let i=0;i<16;i++){
      const angle=(low+high)/2;
      const option=makeTransform({...base,knee:angle,followShin,
        ankle:(base.ankle||0)+(Number(footPitch[0])||0)});
      if(soleHeight(vertices,option)>supportingHeight)low=angle;
      else high=angle;
    }
    const kneeNeutral=(low+high)/2;
    if(name==='stepPointShake')stepPointKnee=kneeNeutral;
    const kneeValue=kneeNeutral+(name==='stepPointShake'?
      (configs[0].knee||0)-(base.knee||0):0);
    first=makeTransform({...configs[0],knee:kneeValue,followShin,
      ankle:(configs[0].ankle||0)+(Number(footPitch[0])||0)});
  }

  // Shared pelvis anchor for unilateral kicking. The supporting leg keeps
  // its sole planted; the swing leg rotates about the anatomical hip,
  // not its own lowest moving foot vertex.
  const supportHeight = footLevel - soleHeight(vertices, second);
  const toeSupported=name==='tiptoeShake'||name==='bendTiptoeShake'
    ||name==='pigeonTiptoeShake'||name==='stepPointShake'
    ||name==='pigeonShake'||name==='stepShake';
  const reference=toeSupported?motionConfigs(name,0,amplitude,footMotion):null;
  if(name==='stepPointShake')reference[0]={...reference[0],knee:stepPointKnee};
  const toeContact=[0,.022,.185];
  const result = [first, second].map((transform, leg) => {
    let x=configs[leg].x*(leg===0?1:-1);
    let y=Number.isFinite(configs[leg].shiftY)?configs[leg].shiftY:
      name==='kick'?supportHeight:footLevel-soleHeight(vertices,transform)+(configs[leg].lift||0);
    let z=configs[leg].z??0;
    if(toeSupported&&(
      (name!=='stepPointShake'&&name!=='stepShake')||leg===0)){
      const referenceTransform=makeTransform({...reference[leg],followShin:false,
        ankle:(reference[leg].ankle||0)+(Number(footPitch[leg])||0)});
      const currentToe=transform(...toeContact);
      const initialToe=referenceTransform(...toeContact);
      // Independent lateral X and forward/back Z cycles form an oval,
      // not one diagonal back-and-forth line. Slight second harmonics
      // break mechanical synchrony; both begin with exactly zero offset.
      const theta=frameIndex/FRAME_COUNT*2*Math.PI,phase=leg*.47;
      const lateral=Math.max(0,Math.min(2,Number(footMotion.lateral??1)));
      const forward=Math.max(0,Math.min(2,Number(footMotion.forward??1)));
      const swayX=amplitude*lateral*(
        .0016*(Math.sin(theta+phase)-Math.sin(phase))+
        .00035*(Math.sin(2*theta+phase*.8)-Math.sin(phase*.8)));
      const swayZ=amplitude*forward*(
        .0021*(Math.cos(theta+phase*.7)-Math.cos(phase*.7))+
        .00035*(Math.sin(2*theta+phase*.43)-Math.sin(phase*.43)));
      x+=initialToe[0]-currentToe[0]+swayX;
      z+=initialToe[2]-currentToe[2]+swayZ;
      // Front toe of the staggered stance rests at the floor itself;
      // all toe-supported animations keep zero VERTICAL displacement.
      y=footLevel-soleHeight(vertices,referenceTransform)
        +initialToe[1]-currentToe[1];
    }
    return {transform,x,y,z,visible:name!=='single'||leg===0};
  });
  cache.set(key, result);
  return result;
}

function cross([ax, ay, az], [bx, by, bz]) {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

function transformNormal(transform, point, [x, y, z], [nx, ny, nz]) {
  // The cofactor matrix derived from the deformation preserves seam normals.
  const delta = .0001;
  const jacobian = [
    transform(x + delta, y, z),
    transform(x, y + delta, z),
    transform(x, y, z + delta),
  ].map(q => q.map((value, index) => (value - point[index]) / delta));
  const [u, v, w] = jacobian;
  const a = cross(v, w), b = cross(w, u), c = cross(u, v);
  const result = a.map((value, index) => value * nx + b[index] * ny + c[index] * nz);
  const length = Math.hypot(...result) || 1;
  return result.map(value => value / length);
}

const defaultLegMorph={length:1,thigh:1,calf:1};
function morphedTransform(base,morph=defaultLegMorph){
  const length=Math.max(.82,Math.min(1.22,Number(morph.length??1)));
  const calf=Math.max(.75,Math.min(1.35,Number(morph.calf??1)));
  const thigh=Math.max(.75,Math.min(1.35,Number(morph.thigh??1)));
  if(Math.abs(length-1)<.0001&&Math.abs(calf-1)<.0001&&Math.abs(thigh-1)<.0001)
    return base;
  const a=base(...ankle),k=base(...knee),h=base(...hip);
  const lower=k.map((v,i)=>v-a[i]),upper=h.map((v,i)=>v-k[i]);
  const normalize=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n)};
  const axisLow=normalize(lower),axisHigh=normalize(upper);
  return (x,y,z)=>{
    const p=base(x,y,z);
    const shin=smoothstep(.09,.49,y),top=smoothstep(.49,.90,y);
    const delta=length-1;
    // Lengthen two articulated bone segments, rather than stretching the
    // world Y axis: supine/crossed legs preserve anatomical directions.
    for(let i=0;i<3;i++)p[i]+=delta*(lower[i]*shin+upper[i]*top);
    if(y>.115){
      const ratio=smoothstep(.35,.60,y),width=calf*(1-ratio)+thigh*ratio;
      const fade=smoothstep(.115,.19,y);
      if(Math.abs(width-1)>.0001&&fade>0){
        const center=base(0,y,.015),axis=y<.49?axisLow:axisHigh;
        const v=[p[0]-center[0]-delta*(lower[0]*shin+upper[0]*top),
                 p[1]-center[1]-delta*(lower[1]*shin+upper[1]*top),
                 p[2]-center[2]-delta*(lower[2]*shin+upper[2]*top)];
        const dot=v[0]*axis[0]+v[1]*axis[1]+v[2]*axis[2];
        for(let i=0;i<3;i++)p[i]+=(width-1)*fade*(v[i]-axis[i]*dot);
      }
    }
    return p;
  };
}

function ensureSample(pose, rest, legMorph=defaultLegMorph) {
  if(pose.vertices)return;
  const shaped=morphedTransform(pose.transform,legMorph);
  pose.vertices=new Float32Array(rest.position.array.length);
  pose.normals=new Float32Array(rest.normal.array.length);
  for(let i=0;i<rest.position.count;i++) {
    const off=i*3;
    const p=rest.position.array.subarray(off,off+3);
    const n=rest.normal.array.subarray(off,off+3);
    const point=shaped(...p);
    pose.vertices.set(point,off);
    pose.normals.set(transformNormal(shaped,point,p,n),off);
  }
}
export function applyPose(geometry, restGeometry, poseName, legIndex, phase=0, amplitude=1,
  footPitch=[0,0], footMotion=defaultFootMotion, legMorph=defaultLegMorph) {
  const name=(Object.hasOwn(poses,poseName)||isMotionPose(poseName))?poseName:'step';
  const animated=isMotionPose(name);
  const step=animated ? ((phase%1+1)%1)*FRAME_COUNT : 0;
  const first=Math.floor(step),next=(first+1)%FRAME_COUNT,t=step-first;
  const pose=resolvePose(restGeometry,name,first,amplitude,footPitch,footMotion)[legIndex];
  const future=animated?resolvePose(restGeometry,name,next,amplitude,footPitch,footMotion)[legIndex]:null;
  const rest=restGeometry.attributes;
  ensureSample(pose,rest,legMorph);
  if(future)ensureSample(future,rest,legMorph);
  const placement={
    x:future?pose.x+(future.x-pose.x)*t:pose.x,
    y:future?pose.y+(future.y-pose.y)*t:pose.y,
    z:future?pose.z+(future.z-pose.z)*t:pose.z,
    visible:pose.visible,
  };
  if(!animated && applied.get(geometry)===pose)return placement;
  const {position,normal}=geometry.attributes;
  // Use the original mesh's stable rest positions for wetness, patterns
  // and cutaway gradients, even when the visible pose is animated.
  if(!geometry.hasAttribute('restPosition'))geometry.setAttribute('restPosition',rest.position);
  if(animated){
    const q=1-t,p=pose.vertices,v=future.vertices,n=pose.normals,b=future.normals;
    for(let i=0;i<position.array.length;i++){
      position.array[i]=p[i]*q+v[i]*t;
      normal.array[i]=n[i]*q+b[i]*t;
    }
  }else{
    position.array.set(pose.vertices);
    normal.array.set(pose.normals);
  }
  position.needsUpdate=true;
  normal.needsUpdate=true;
  // Pose changes can push the feet outside old cached bounding volumes.
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  applied.set(geometry,pose);
  return placement;
}
