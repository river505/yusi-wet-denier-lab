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
  // The crossing foot ankle lies above the opposite raised knee. Use mirror
  // transforms for left-/right-crossing rather than rotating the whole rig.
  // The lateral knee and ankle must both cross the midline. A separate
  // knee yaw prevents the lower leg from reversing direction at the knee.
  lieCrossLeft: [{x:.095,pitch:-200,knee:110,roll:-25,yaw:100,kneeYaw:120,shiftY:-.700},
    {x:.095,pitch:-155,knee:155,yaw:4,shiftY:-.735}],
  lieCrossRight: [{x:.095,pitch:-155,knee:155,yaw:-4,shiftY:-.735},
    {x:.095,pitch:-200,knee:110,roll:25,yaw:-100,kneeYaw:-120,shiftY:-.700}],
  lieSideLeft: [{x:.095,pitch:-92,knee:7,roll:65,yaw:8,shiftY:-.77},
    {x:.095,pitch:-97,knee:20,roll:65,yaw:5,shiftY:-.68}],
  lieSideRight: [{x:.095,pitch:-97,knee:20,roll:-65,yaw:-5,shiftY:-.68},
    {x:.095,pitch:-92,knee:7,roll:-65,yaw:-8,shiftY:-.77}],
};
const motionNames=new Set(['kick','walk','run','sitBounce','sitCrossKick','tiptoeShake','bendTiptoeShake']);
const lyingNames=new Set(['lieFlat','lieBent','lieCrossLeft','lieCrossRight','lieSideLeft','lieSideRight']);
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
function motionConfigs(name, phase, amplitude=1) {
  // One explicit amplitude parameter scales *excursions*, not the joint
  // neutral pose. Both legs keep their anatomical hip/knee pivot positions.
  const amp=Math.max(.2,Math.min(2,Number(amplitude)||1));
  const theta=phase*Math.PI*2;
  const swing=Math.sin(theta);
  const opposite=Math.sin(theta+Math.PI);
  const bend=v=>Math.max(0,v);
  const seated=poses.sitNatural;
  if(name==='tiptoeShake'||name==='bendTiptoeShake') {
    const bent=name==='bendTiptoeShake';
    const neutral=bent?standingBendConfigs('bendTiptoe',amp):poses.tiptoe;
    return neutral.map((cfg,i)=>{
      const tremor=Math.sin(theta+(i===0?0:.35));
      return {...cfg,
        pitch:(cfg.pitch||0)-(bent?2.7:1.8)*amp*tremor,
        knee:(cfg.knee||0)+(bent?8:5)*amp*tremor,
        // Foot and toe position is subsequently corrected by an explicit
        // world-space contact anchor, never by rotating the whole ankle.
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
  const plantar = xRotation(solePitch + (heel + (config.ankle ?? 0)) * radians);
  const invert = zRotation(soleRoll);
  const flexAnkle = (x, y, z) => invert(...plantar(x, y, z));
  const flexToe = xRotation(((config.toe ?? 0) - heel) * radians);

  return (x, y, z) => {
    const point = [x, y, z];
    if (z > .12 && y < .07) {
      const heelWeight = smoothstep(.12, .155, z) * (1 - smoothstep(.05, .07, y));
      rotateAround(point, toe, flexToe, heelWeight);
    }
    if (y < .125) rotateAround(point, ankle, flexAnkle, 1 - smoothstep(.06, .125, y));
    if (y < .565) rotateAround(point, knee, flexKnee, 1 - smoothstep(.415, .565, y));
    rotateAround(point, hip, swing);
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

function resolvePose(restGeometry, name, frameIndex=0, amplitude=1, footPitch=[0,0]) {
  let cache = resolved.get(restGeometry);
  if (!cache) {
    cache = new Map();
    resolved.set(restGeometry, cache);
  }
  const key=isMotionPose(name)?name+':'+frameIndex:name;
  if (cache.has(key)) return cache.get(key);
  const vertices = restGeometry.attributes.position.array;
  const footLevel = restGeometry.boundingBox.min.y;
  const configs=isMotionPose(name)?motionConfigs(name,frameIndex/FRAME_COUNT,amplitude)
    :isAdjustableStandingPose(name)?standingBendConfigs(name,amplitude):poses[name];
  const followShin = isLyingPose(name);
  const second = makeTransform({ ...configs[1], followShin,
    ankle: (configs[1].ankle || 0) + (Number(footPitch[1]) || 0) });
  let first = makeTransform({ ...configs[0], followShin,
    ankle: (configs[0].ankle || 0) + (Number(footPitch[0]) || 0) });

  if (name === 'point') {
    const supportingHeight = soleHeight(vertices, second);
    let low = 0, high = 80;
    for (let i = 0; i < 16; i++) {
      const angle = (low + high) / 2;
      const option = makeTransform({ ...configs[0], knee: angle,
        ankle: (configs[0].ankle || 0) + (Number(footPitch[0]) || 0) });
      if (soleHeight(vertices, option) > supportingHeight) low = angle;
      else high = angle;
    }
    first = makeTransform({ ...configs[0], knee: (low + high) / 2 });
  }

  // Shared pelvis anchor for unilateral kicking. The supporting leg keeps
  // its sole planted; the swing leg rotates about the anatomical hip,
  // not its own lowest moving foot vertex.
  const supportHeight = footLevel - soleHeight(vertices, second);
  const toeFixed=name==='tiptoeShake'||name==='bendTiptoeShake';
  const reference=toeFixed?motionConfigs(name,0,amplitude):null;
  const toeContact=[0,.022,.185];
  const result = [first, second].map((transform, leg) => {
    let x=configs[leg].x*(leg===0?1:-1);
    let y=Number.isFinite(configs[leg].shiftY)?configs[leg].shiftY:
      name==='kick'?supportHeight:footLevel-soleHeight(vertices,transform)+(configs[leg].lift||0);
    let z=configs[leg].z??0;
    if(toeFixed){
      const referenceTransform=makeTransform({...reference[leg],followShin:false,
        ankle:(reference[leg].ankle||0)+(Number(footPitch[leg])||0)});
      const currentToe=transform(...toeContact);
      const initialToe=referenceTransform(...toeContact);
      x+=initialToe[0]-currentToe[0];
      y+=initialToe[1]-currentToe[1]+soleHeight(vertices,transform)-soleHeight(vertices,referenceTransform);
      z+=initialToe[2]-currentToe[2];
      // Preserve the same toe world-height across all frames. In particular,
      // never recenter on the heel, which must be free to bounce.
      y=footLevel-soleHeight(vertices,referenceTransform)+initialToe[1]-currentToe[1];
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

function ensureSample(pose, rest) {
  if(pose.vertices)return;
  pose.vertices=new Float32Array(rest.position.array.length);
  pose.normals=new Float32Array(rest.normal.array.length);
  for(let i=0;i<rest.position.count;i++) {
    const off=i*3;
    const p=rest.position.array.subarray(off,off+3);
    const n=rest.normal.array.subarray(off,off+3);
    const point=pose.transform(...p);
    pose.vertices.set(point,off);
    pose.normals.set(transformNormal(pose.transform,point,p,n),off);
  }
}
export function applyPose(geometry, restGeometry, poseName, legIndex, phase=0, amplitude=1, footPitch=[0,0]) {
  const name=(Object.hasOwn(poses,poseName)||isMotionPose(poseName))?poseName:'step';
  const animated=isMotionPose(name);
  const step=animated ? ((phase%1+1)%1)*FRAME_COUNT : 0;
  const first=Math.floor(step),next=(first+1)%FRAME_COUNT,t=step-first;
  const pose=resolvePose(restGeometry,name,first,amplitude,footPitch)[legIndex];
  const future=animated?resolvePose(restGeometry,name,next,amplitude,footPitch)[legIndex]:null;
  const rest=restGeometry.attributes;
  ensureSample(pose,rest);
  if(future)ensureSample(future,rest);
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
