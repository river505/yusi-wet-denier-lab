export const stageVertex = /* glsl */`
  varying vec2 screenUV;
  void main() {
    screenUV = uv;
    gl_Position = vec4(position.xy, .999, 1.);
  }
`;

// World-anchored panorama: reuses the existing illustrated environment shader,
// but uses perspective-projected spherical UVs instead of a camera-fixed screen quad.
export const panoramaVertex = /* glsl */`
  varying vec2 screenUV;
  void main() {
    screenUV = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }
`;

export const stageFragment = /* glsl */`
  uniform vec3 upper;
  uniform vec3 lower;
  uniform float kind;
  uniform float time;
  uniform float aspect;
  varying vec2 screenUV;

  float rand(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float border(vec2 p) {
    vec2 f = abs(fract(p) - .5);
    return smoothstep(.476, .496, max(f.x, f.y));
  }
  float box(vec2 p, vec2 center, vec2 size, float blur) {
    vec2 d = abs(p - center) - size;
    return 1. - smoothstep(0., blur, max(d.x, d.y));
  }
  float disc(vec2 p, vec2 center, vec2 size, float blur) {
    return 1. - smoothstep(1. - blur, 1., length((p - center) / size));
  }
  float tileFloor(vec2 p, float offset) {
    float z = 1. / max(.10, p.y - .40);
    vec2 tiles = vec2(((p.x-.43) * 4.7 + .86) * z, ((p.x-.43) * -2.8 + 3.8) * z);
    vec2 distanceToGrout = .5 - abs(fract(tiles + offset) - .5);
    vec2 antialias = max(fwidth(tiles) * .9, vec2(.004));
    vec2 lines = 1. - smoothstep(vec2(.010), vec2(.019)+antialias, distanceToGrout);
    return max(lines.x,lines.y);
  }
  vec3 bathroom(vec2 p) {
    float corner = abs(p.x - .30);
    float wallLine = .111 - corner * (p.x > .30 ? .116 : .18);
    float seam = border(vec2((p.x + max(0.,p.x - .3)*.19)*21., (p.y-wallLine)*12.4));
    vec3 rgb = mix(vec3(.70,.81,.83),vec3(.77,.86,.87),1.-p.y);
    rgb = mix(rgb,vec3(.66,.80,.84),1.-smoothstep(.04,.045,p.y-wallLine));
    rgb = mix(rgb,vec3(.916,.913,.909),1.-smoothstep(-.002,.005,p.y-wallLine));
    rgb -= .016*seam;
    rgb *= 1.-.048*exp(-abs(p.x-.3)*42.);
    float floorY = .60 + .13*corner;
    vec3 floorRgb = vec3(.816,.839,.855)+tileFloor(p,0.)*.058;
    rgb = mix(rgb,floorRgb,smoothstep(-.004,.004,p.y-floorY));

    float duck = max(disc(p,vec2(.564,.348),vec2(.023,.030),.28),
                     disc(p,vec2(.581,.319),vec2(.015,.025),.26));
    rgb = mix(rgb,vec3(.93,.84,.44),duck*.96);
    rgb = mix(rgb,vec3(.82,.60,.31),disc(p,vec2(.594,.322),vec2(.008,.010),.4));
    rgb = mix(rgb,vec3(.42,.35,.26),disc(p,vec2(.583,.312),vec2(.0035,.006),.6));

    float faucet = box(p,vec2(.501,.113),vec2(.004,.121),.006);
    faucet = max(faucet,box(p,vec2(.500,.252),vec2(.027,.009),.008));
    faucet = max(faucet,box(p,vec2(.501,.270),vec2(.004,.017),.007));
    faucet = max(faucet,disc(p,vec2(.524,.251),vec2(.010,.017),.35));
    faucet = max(faucet,disc(p,vec2(.472,.252),vec2(.010,.017),.35));
    rgb = mix(rgb,vec3(.66,.70,.71),faucet*.9);
    rgb = mix(rgb,vec3(.90,.91,.90),faucet*box(p,vec2(.500,.153),vec2(.003,.097),.003)*.6);
    rgb = mix(rgb,vec3(.45,.66,.85),disc(p,vec2(.525,.252),vec2(.004,.006),.6));
    rgb = mix(rgb,vec3(.87,.57,.59),disc(p,vec2(.471,.254),vec2(.004,.006),.6));
    rgb = mix(rgb,vec3(.86,.67,.75),box(p,vec2(.341,.326),vec2(.011,.049),.005));

    float yTop = .367 + max(0.,p.x-.23)*.028;
    float yBottom = .646 + max(0.,p.x-.15)*.237;
    float front = step(.154,p.x) * step(p.x,.783) * step(yTop,p.y) * step(p.y,yBottom);
    float side = step(.781,p.x) * step(p.x,.868) * step(yTop,p.y) * step(p.y,.79-(p.x-.783)*.88);
    vec3 porcelain = mix(vec3(.965,.967,.968),vec3(.822,.824,.826),smoothstep(.393,.79,p.y));
    rgb = mix(rgb,porcelain,front);
    rgb = mix(rgb,porcelain*.958,side);
    float rim = step(.154,p.x)*step(p.x,.868)*(smoothstep(yTop-.007,yTop,p.y)-smoothstep(yTop+.003,yTop+.007,p.y));
    return mix(rgb,vec3(.81,.94,.94),rim);
  }

  vec3 reflectLight(vec2 p, vec2 center, float radius, vec3 glow, float seed) {
    vec2 ratio = vec2(radius,radius*1.6);
    float halo = disc(p,center,ratio,.32);
    float highlight = disc(p,center,ratio*.82,.15);
    float y = p.y - (.57 + rand(vec2(seed,2.))*.19);
    float wavering = sin(p.y*170. + time*2.2)*.007 + sin(p.y*425.-time*3.2)*.004;
    float x = abs(p.x - center.x - y*.16 - wavering);
    float reflection = (1.-smoothstep(radius*.45,radius*1.42,x)) * smoothstep(-.02,.045,y);
    reflection *= (.26 + .42 * (.5+.5*sin(p.y * 75. + time*.4))) * (1.-smoothstep(.25,.51,y));
    return glow*(halo*.67+highlight*.17+reflection);
  }
  vec3 street(vec2 p) {
    vec3 rgb = mix(vec3(.34,.29,.42),vec3(.245,.25,.305),smoothstep(.26,1.,p.y));
    vec2 windows = p * vec2(63.,27.);
    vec2 cell = floor(windows);
    float building = sin(p.x*29.1)*sin(p.x*12.8);
    float lit = step(.83,rand(cell))*box(fract(windows),vec2(.5),vec2(.13,.20),.23);
    rgb += lit * vec3(.26,.21,.14) * (1.-smoothstep(.25,.33,p.y));
    rgb *= .97 + .055 * (building+.4*rand(vec2(floor(p.y*245.),0.)));
    float crossing = step(.65,fract((p.y-.46)*6.4+(p.x-.5)*3.)) *
                     smoothstep(.31,.48,p.y) * (1.-smoothstep(.56,.70,p.y));
    rgb += crossing * vec3(.075,.082,.091);
    rgb += reflectLight(p,vec2(.047,.094),.033,vec3(.21,.51,.61),1.);
    rgb += reflectLight(p,vec2(.137,.105),.028,vec3(.19,.52,.65),2.);
    rgb += reflectLight(p,vec2(.251,.245),.017,vec3(.59,.25,.43),3.);
    rgb += reflectLight(p,vec2(.364,.038),.014,vec3(.30,.70,.71),4.);
    rgb += reflectLight(p,vec2(.512,.145),.020,vec3(.74,.30,.57),5.);
    rgb += reflectLight(p,vec2(.512,.217),.032,vec3(.45,.20,.40),6.);
    rgb += reflectLight(p,vec2(.596,.072),.034,vec3(.67,.37,.70),7.);
    rgb += reflectLight(p,vec2(.650,.278),.012,vec3(.60,.53,.51),8.);
    rgb += reflectLight(p,vec2(.959,.052),.032,vec3(.70,.48,.25),9.);
    vec2 rain = vec2((p.x - p.y*.085)*150.,(p.y-time*.92)*14.);
    float drop = step(.91,rand(vec2(floor(rain.x),0.)))*box(fract(rain),vec2(.50,.5),vec2(.047,.23),.06);
    return rgb + drop * vec3(.11,.13,.18);
  }

  vec3 pool(vec2 p) {
    float shore = .584 + p.x*.208;
    float back = .351 + p.x*.035;
    float ripple1 = sin(p.x*51.+p.y*38.+2.9*sin(p.y*41.+p.x*14.-time*.44));
    float ripple2 = sin(p.y*113.+p.x*31.+2.7*sin(p.x*42.-time*.3));
    float foam = pow(1.-abs(ripple1*ripple2),12.) * .24 + pow(max(0.,ripple1*ripple2),19.)*.22;
    vec3 water = mix(vec3(.741,.864,.919),vec3(.60,.83,.879),smoothstep(back,shore,p.y));
    water += foam*vec3(.85,.96,.99)*smoothstep(back,shore,p.y);
    vec3 deck = vec3(.908,.893,.851) - tileFloor(p, .22)*.057;
    deck += (rand(floor(p*vec2(122.,135.))) - .5)*.012;
    vec3 rgb = mix(water,deck,smoothstep(shore,shore+.015,p.y));
    rgb = mix(rgb,vec3(.960,.960,.955),box(vec2(p.x,p.y-shore),vec2(.5,.006),vec2(.7,.011),.004));
    rgb = mix(rgb,vec3(.906,.903,.883),1.-smoothstep(back-.002,back+.001,p.y));
    float hedgeTop = .063 + .015*sin(p.x*20.) + .013*sin(p.x*47.) + .012*sin(p.x*12.);
    float hedge = smoothstep(hedgeTop-.022,hedgeTop+.019,p.y);
    vec3 leaves = mix(vec3(.80,.90,.93),vec3(.55,.70,.53),hedge);
    leaves *= .98 + .043*sin(p.x*35.)*sin(p.y*16.);
    rgb = mix(rgb,leaves,1.-smoothstep(.187,.204,p.y));
    vec2 f = (p-vec2(.564,.531))/vec2(.055,.012);
    float floatRing = (1.-smoothstep(.86,1.,length(f))) * smoothstep(.39,.58,length(f));
    vec3 stripe = mix(vec3(.95,.96,.93),vec3(.93,.53,.49),step(.0,sin(atan(f.y,f.x)*4.)));
    return mix(rgb,stripe,floatRing*.86);
  }

  void main() {
    vec2 screen = screenUV;
    float vignette = smoothstep(.08,.73,length((screen - vec2(.5,.68))*vec2(.93,.81)));
    vec3 rgb = mix(lower, upper, smoothstep(-.12,.81,screen.y));
    rgb = rgb * (1.-.082*vignette) + vec3(.025) * (1.-vignette)*sin(screen.y*3.14159);
    vec2 p = vec2(.5+(screen.x-.5)*clamp(aspect/1.6,.42,1.6),1.-screen.y);
    if (kind == 1.) rgb = pow(max(vec3(0.),bathroom(p)),vec3(2.2));
    if (kind == 2.) rgb = pow(max(vec3(0.),street(p)),vec3(2.2));
    if (kind == 3.) rgb = pow(max(vec3(0.),pool(p)),vec3(2.2));
    gl_FragColor = vec4(rgb,1.);
    #include <colorspace_fragment>
  }
`;

// Dedicated two-sided skin layer: the open upper leg is not a black back-face silhouette.
export const skinVertex = /* glsl */`
  attribute vec3 restPosition;
  varying vec3 surfaceNormal;
  varying vec3 eyeDirection;
  varying vec3 restSurface;
  void main() {
    vec4 viewPoint = modelViewMatrix * vec4(position, 1.);
    surfaceNormal = normalize(normalMatrix * normal);
    eyeDirection = -viewPoint.xyz;
    restSurface = restPosition;
    // Recess full-length skin by 0.9 mm under the garment.
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position - normal * .0009, 1.);
  }
`;

export const skinFragment = /* glsl */`
  // Toe detail is anchored to the original GLB's dorsal foot coordinates.
  // Recessed grooves and restrained nail highlights supplement the existing
  // five-toe geometry, without placing floating stickers on the feet.
  float toeGrooves(vec3 p) {
    // Branch out for the whole calf/thigh: toe Gaussian detail is evaluated
    // only on the tiny foot-tip region, avoiding 4 exps per leg fragment.
    if (p.y > .075 || p.z < .145) return 0.;
    float dorsal = smoothstep(.014,.027,p.y) * (1.-smoothstep(.044,.061,p.y));
    float forward = smoothstep(.156,.186,p.z);
    float groove = 0.;
    for (int i=0; i<4; i++) {
      float center = -.029 + float(i)*.018 + .06*(p.z-.180);
      float dx = (p.x-center)/.0026;
      groove = max(groove,exp(-dx*dx));
    }
    return dorsal*forward*groove;
  }
  float toeNailDetail(vec3 p) {
    if (p.y > .065 || p.z < .16) return 0.;
    float dorsal = smoothstep(.017,.027,p.y)*(1.-smoothstep(.042,.053,p.y));
    float nail = 0.;
    for (int i=0; i<5; i++) {
      float x = -.039+float(i)*.019;
      float z = .198-.006*max(0.,float(i)-1.);
      vec2 q=vec2((p.x-x)/.006,(p.z-z)/.007);
      nail=max(nail,exp(-dot(q,q)*1.55));
    }
    return nail*dorsal;
  }
  uniform vec3 skinTint;
  uniform float skinLightness;
  varying vec3 surfaceNormal;
  varying vec3 eyeDirection;
  varying vec3 restSurface;
  void main() {
    vec3 n = normalize(surfaceNormal);
    if (!gl_FrontFacing) n = -n;
    vec3 light = normalize(vec3(-.50, .67, .72));
    vec3 fill = normalize(vec3(.62, .32, -.45));
    // The exact default diffuse/incidence skin model used by the upstream
    // MartinDelophy fabric shader. The same formula is used underneath cloth.
    vec3 view = normalize(eyeDirection);
    float incidence = clamp(dot(n,view),0.,1.);
    float modeled = smoothstep(-.55,.70,dot(n,light));
    vec3 skinColor = mix(vec3(.68,.46,.45),vec3(.89,.73,.72),modeled);
    skinColor *= mix(vec3(.88,.80,.84),vec3(1.),smoothstep(.01,.70,incidence));
    skinColor *= skinTint * skinLightness;
    // The reference geometry contains five distinct toes. Emphasize its
    // dorsal toe separations and nail plates by lighting, not fake meshes.
    float separation = toeGrooves(restSurface);
    float nails = toeNailDetail(restSurface);
    skinColor *= 1. - .145*separation;
    skinColor = mix(skinColor,skinColor*vec3(1.07,1.045,1.04),nails*.30);
    // Preserve the original cutaway transparency on both sides. The inner
    // cutaway has its OWN fixed colour ramp: natural warm skin at the base,
    // feathering toward white at the top, independently of skin swatches.
    float edgeFade = 1. - smoothstep(.783,.861,restSurface.y);
    if (!gl_FrontFacing) {
      // Delay the white part until the fade is already underway. This
      // preserves the requested white interior but prevents a bright,
      // opaque-looking circular cap at the top of each thigh.
      float whiteRamp = smoothstep(.758,.865,restSurface.y);
      skinColor = mix(vec3(.82,.68,.67),vec3(.995,.993,.993),whiteRamp);
    }
    gl_FragColor = vec4(skinColor, edgeFade);
    #include <colorspace_fragment>
  }
`;

export const fabricVertex = /* glsl */`
  attribute vec3 restPosition;
  varying vec3 wetPoint;
  varying vec3 localPoint;
  varying vec3 facing;
  varying vec3 eyeDirection;
  void main() {
    localPoint = restPosition;
    wetPoint = position;
    vec4 viewPoint = modelViewMatrix * vec4(position, 1.);
    facing = normalize(normalMatrix * normal);
    eyeDirection = -viewPoint.xyz;
    gl_Position = projectionMatrix * viewPoint;
  }
`;

export const fabricFragment = /* glsl */`
  uniform vec3 skinTint;
  uniform float skinLightness;
  uniform vec3 dye;
  uniform vec3 wetDye;
  uniform vec3 tint;
  uniform float lengthLimit;
  uniform float band;
  uniform float denier;
  uniform float toeStyle;
  uniform float fabric;
  uniform float cuff;
  uniform float pattern;
  uniform float patternDensity;
  uniform float patternRandomness;
  uniform float secret;
  uniform float garter;
  uniform float skinOnly;
  uniform float reflection;
  uniform float time;
  uniform vec4 stains[24];
  varying vec3 wetPoint;
  varying vec3 localPoint;
  varying vec3 facing;
  varying vec3 eyeDirection;

  float toeGrooves(vec3 p) {
    // Branch out for the whole calf/thigh: toe Gaussian detail is evaluated
    // only on the tiny foot-tip region, avoiding 4 exps per leg fragment.
    if (p.y > .075 || p.z < .145) return 0.;
    float dorsal = smoothstep(.014,.027,p.y)*(1.-smoothstep(.044,.061,p.y));
    float forward = smoothstep(.156,.186,p.z);
    float groove = 0.;
    for (int i=0; i<4; i++) {
      float center = -.029 + float(i)*.018 + .06*(p.z-.180);
      float dx = (p.x-center)/.0026;
      groove=max(groove,exp(-dx*dx));
    }
    return dorsal*forward*groove;
  }
  float hash(vec2 p) {
    return fract(sin(dot(p,vec2(19.27,112.9))) * 8372.356);
  }
  float shape(float id, vec2 p) {
    vec2 f=fract(p)-.5;
    // One motif per unit cell. Jitter never exceeds 0.14 of a cell,
    // and every random motif fits within 0.33 of its center. Therefore
    // adjacent motifs have at least 1-2*.14-2*.33 = .06 spacing.
    if(id==1.||id==2.||id==7.||id==8.||id==11.){
      vec2 cell=floor(p);
      vec2 jitter=vec2(hash(cell+vec2(13.,79.)),hash(cell+vec2(93.,17.)))*2.-1.;
      f-=.14*clamp(patternRandomness,0.,1.)*jitter;
      float scale=1.+.09*patternRandomness*(2.*hash(cell+vec2(49.,61.))-1.);
      f*=scale;
    }
    if (id == 1.) return 1. - smoothstep(.13,.17,length(f));
    if (id == 2.) return 1. - smoothstep(.265,.32,abs(f.x)+abs(f.y));
    if (id == 3.) return smoothstep(.41,.48,max(abs(f.x),abs(f.y)));
    if (id == 4.) return step(.54,fract(p.y));
    if (id == 5.) return step(.87,fract(p.x));
    if (id == 6.) return 1. - smoothstep(.015,.035,abs(fract(p.x/9.+.5)-.5));
    if (id == 7.) {
      vec2 heart=f*1.55;
      float h=heart.x*heart.x+heart.y*heart.y-.075;
      return float(h*h*h-heart.x*heart.x*heart.y*heart.y*heart.y < 0.)
        *(1.-smoothstep(.28,.32,length(f)));
    }
    if (id == 8.) return 1.-smoothstep(.02,.053, length(f)*(1.35+.65*cos(atan(f.y,f.x)*5.)));
    if (id == 9.) {
      float w=clamp(patternRandomness,0.,1.);
      vec2 flow=vec2(.10*sin(p.y*3.7),.09*cos(p.x*4.1))*w;
      return smoothstep(.10,.22,abs(sin((p.x+flow.x)*6.28)*sin((p.y+flow.y)*6.28)));
    }
    if (id == 10.) return smoothstep(.2,.8,localPoint.y);
    if (id == 11.) {
      float palm = 1.-smoothstep(.10,.14,length(f+vec2(0.,.09)));
      float toes = 1.-smoothstep(.044,.064,length(vec2(abs(abs(f.x)-.09)-.045,f.y-.09)));
      return max(palm,toes);
    }
    return 0.;
  }
  void main() {
    vec3 n = normalize(facing);
    if (!gl_FrontFacing) n = -n;
    vec3 view = normalize(eyeDirection);
    vec3 light = normalize(vec3(-.50,.67,.72));
    float incidence = clamp(dot(n,view),0.,1.);
    float diffuse = dot(n,light);
    float modeled = smoothstep(-.55,.70,diffuse);
    float shade = mix(.68,1.06,modeled);
    // Identical upstream default skin formula on skin and cloth surfaces.
    vec3 skin = mix(vec3(.68,.46,.45),vec3(.89,.73,.72),modeled);
    skin *= mix(vec3(.88,.80,.84),vec3(1.),smoothstep(.01,.70,incidence));
    skin *= skinTint * skinLightness;
    float h = localPoint.y;
    float angle = atan(localPoint.x+.006,localPoint.z-.030) / 6.2831853 + .5;
    vec2 textile = vec2(angle*17.,h*14.);
    bool scattered=pattern==1.||pattern==2.||pattern==7.||pattern==8.||pattern==11.;
    bool frequencyPattern=scattered||pattern==9.;
    vec2 printUV=textile*(frequencyPattern?sqrt(clamp(patternDensity,.2,2.)):1.);
    float knit = (hash(floor(vec2(angle*1400.,h*1500.))) - .5) * .019;
    float shine = pow(max(0.,dot(n,normalize(light+view))),mix(25.,85.,step(1.5,fabric)));
    float stocking = step(h, lengthLimit + (cuff == 1. ? .0048 * (.5+.5*cos(angle*125.6637)) : 0.));
    float edge = stocking * step(lengthLimit-band,h);
    vec3 rgb = skin;
    float garmentOpacity = 0.;
    if (stocking > 0. && skinOnly == 0.) {
      // Denier has a saturating, non-linear optical response. The old linear
      // alpha hit its ceiling near 80D, making 120D/200D almost identical.
      // These are perceptual coverage controls, not a textile lab calibration.
      float d = clamp(denier,5.,200.);
      garmentOpacity = clamp(.27+.73*(1.-exp(-d/48.)),.32,.975);
      float dense = clamp(.30+.66*(1.-exp(-d/68.)),.33,.96);
      if (fabric >= 4.) { garmentOpacity = .97; dense = .96; }
      vec3 base = mix(skin * vec3(.86,.86,.88),dye,dense);
      base *= mix(.82,1.16,modeled);
      float print = shape(pattern,printUV);
      if (pattern == 3.) base = mix(skin,base,print);
      else if (pattern == 4.) base = mix(base, vec3(.81,.80,.85)*shade,print*.76);
      else base *= 1. - .42 * print;
      float wetness = 0.;
      for (int i = 0; i < 24; i++) {
        vec4 mark = stains[i];
        if (mark.w <= 0.) continue;
        vec3 delta = wetPoint-mark.xyz;
        float radius = mark.w;
        float ripple = .86+.14*sin(dot(localPoint,vec3(107.,146.,82.)));
        // Diffuse wet front: soften the abrupt bright patches without losing
        // local irregularity or the time-dependent water streaks.
        float blob = 1. - smoothstep(radius*.48,radius*(1.10 + .09*ripple),length(delta));
        float meander = sin(delta.y*56.+mark.x*45.)*.006;
        float drip = 1.-smoothstep(radius*.06+.002,radius*.12+.004,length(vec2(delta.x+meander,delta.z*.66)));
        drip *= smoothstep(-radius*4.,-radius*.55,delta.y) * (1.-step(0.,delta.y));
        wetness = max(wetness, max(blob,drip*.65));
      }
      vec3 wet = mix(base*.61,skin,.81 - .27*step(3.5,fabric));
      wet = mix(wet,wetDye,step(.001,dot(wetDye,wetDye))*.72);
      if (secret > 0.) wet *= 1. - .42*shape(secret,printUV);
      if (fabric >= 6.) wet = base;
      rgb = mix(base,wet,wetness);
      garmentOpacity = mix(garmentOpacity,max(.23,garmentOpacity*.70),wetness);
      // Local toe-groove contrast follows the real mesh, and is partly hidden
      // by thicker hosiery. Reinforced toes add a separate graduated toe cap.
      float toeCrease = toeGrooves(localPoint);
      float toeRegion = smoothstep(.130,.181,localPoint.z)
                      * (1.-smoothstep(.040,.069,localPoint.y));
      float detailStrength = mix(.14,.055,clamp(d/200.,0.,1.));
      rgb *= 1.-detailStrength*toeCrease;
      if (fabric < 4.) {
        if (toeStyle > .5 && toeStyle < 1.5) {
          // Reinforcement follows the top of the original toe volume instead
          // of creating an artificial flat colour band across the whole foot.
          garmentOpacity = mix(garmentOpacity,min(.985,garmentOpacity+.24),toeRegion);
          rgb = mix(rgb,dye*.85,toeRegion*.18);
        } else if (toeStyle > 1.5 && toeStyle < 2.5) {
          garmentOpacity = mix(garmentOpacity,max(.18,garmentOpacity*.78),toeRegion);
        }
      }
      if (toeStyle > 2.5) {
        // Tabi: optically cut a narrow channel separating the large toe
        // from the smaller digits. Skin remains visible through the slit,
        // with a stitched edge; the underlying anatomical toes stay intact.
        float forefoot=smoothstep(.15,.19,localPoint.z)
          *(1.-smoothstep(.035,.070,localPoint.y));
        float seam=abs(localPoint.x+.016);
        float gap=(1.-smoothstep(.0018,.0042,seam))*forefoot;
        float stitched=(1.-smoothstep(.004,.009,seam))*forefoot;
        garmentOpacity*=1.-.84*gap;
        rgb=mix(rgb,skin, gap*.42);
        rgb*=1.-.28*stitched;
      }
      rgb += knit * mix(1.,.22,wetness);
      // Soft silk / oil sheen is continuous; pearl requires a *different*
      // microflake layer, not simply a more intense plastic-looking hotspot.
      float glossStyle = float(fabric == 2.);
      float pearlStyle = float(fabric == 3.);
      float clearcoat = .035 + .09*wetness + .11*glossStyle
                        + .07*pearlStyle + .34*step(6.,fabric);
      rgb += shine * clearcoat;
      if (fabric == 3.) {
        // Pearl glints must be visible when DRY. The earlier 172x290
        // frequency with 2% rare cells fell below a phone pixel and was
        // antialiased away. Each new microflake occupies several screen
        // samples at mobile portrait scale, with deterministic REST coords.
        vec2 fleckUV = vec2(angle*56.,h*115.);
        vec2 cell = floor(fleckUV);
        vec2 f = fract(fleckUV)-.5;
        float seed = hash(cell+vec2(11.,3.));
        vec2 jitter = .20*(vec2(hash(cell+vec2(37.,7.)),
                                  hash(cell+vec2(5.,41.)))-.5);
        float shape = 1.-smoothstep(.09,.34,length(f-jitter));
        float chosen = smoothstep(.77,.95,seed);
        float glint = chosen * shape;
        // The visual sparkle is a bright fibre reflection, not a wet
        // opacity mask. Viewing angle changes its intensity, but not its
        // anchored position. A soft pearlescent sheen remains between dots.
        float sparkleLight = .72+.28*max(0.,dot(n,normalize(light+view)));
        vec3 pearlWhite = mix(vec3(1.,.93,.95),vec3(.96,.98,1.),modeled);
        rgb = mix(rgb,pearlWhite,clamp(glint * (.79+.15*wetness)
                       * sparkleLight,0.,.94));
        float softLobe = pow(1.-incidence,3.)*.055;
        rgb += pearlWhite*softLobe;
      }
      if (wetness > .06 && fabric < 4.) {
        // Sparse point highlights confined to already wet fragments.
        // This does not modify body depth, wet coverage or denier opacity.
        vec2 beadUV=vec2(angle*122.,h*205.);
        vec2 beadCell=floor(beadUV);
        float beadHash=hash(beadCell+vec2(7.,19.));
        float beadShape=1.-smoothstep(.035,.20,length(fract(beadUV)-.5));
        float bead=smoothstep(.981,.999,beadHash)*beadShape;
        rgb += vec3(.90,.84,.88)*bead*wetness*.17;
      }
      float fresnel = pow(1.-incidence,2.7);
      rgb = mix(rgb, mix(skin, vec3(.92,.86,.84), .45), fresnel*.16);
      if (edge > 0.) {
        float offset = (lengthLimit - h) / max(band,.001);
        float detail = .49;
        if (cuff == 1.) {
          vec2 petal = vec2(fract(angle*20.)-.5,offset-.42);
          float bloom = length(petal) * (1. + .23*cos(atan(petal.y,petal.x)*5.));
          float flower = 1.-smoothstep(.158,.212,bloom);
          float seam = float(offset > .89 || (offset>.10 && offset<.148));
          float lace = float(sin(angle*331.+offset*37.) * cos(angle*429.-offset*34.) > .49);
          detail = .20 + .61 * max(seam,flower) + .13 * lace;
        }
        if (cuff == 2.) detail = .12+.78*float(abs(offset-.3)<.10 || abs(offset-.66)<.10);
        if (cuff == 3.) detail = .29+.42*pow(.5+.5*sin(angle*782.),2.);
        rgb = mix(rgb, mix(dye,vec3(.07,.055,.07),.28),detail);
      }
      // Do not darken inward/grazing surfaces to nearly black. Retain a
      // weak fabric-coloured Fresnel, with the separate outline mesh handling
      // the external silhouette independently of the open cut interior.
      rgb = mix(rgb, mix(skin,dye,.28),
                (1. - smoothstep(.02,.27,incidence))*.14);
    }
    if (garter > 0. && skinOnly == 0. && h > lengthLimit && abs(fract(angle*2.+.3)-.5)<.086) {
      rgb = mix(rgb,dye,.77);
      garmentOpacity = max(garmentOpacity, .76);
    }
    rgb *= tint;
    // Faithful to the original smoothstep range; garment optical density
    // remains independent, preventing transparency through the whole leg.
    float cutFade = 1. - smoothstep(.783,.861,h);
    if (reflection > 0.) cutFade *= reflection*(1.-smoothstep(-.03,.34,h));
    gl_FragColor = vec4(max(rgb,0.), cutFade * (skinOnly > .5 ? 1. : garmentOpacity));
    #include <colorspace_fragment>
  }
`;

export const outlineVertex = /* glsl */`
  attribute vec3 restPosition;
  varying float height;
  void main() {
    height = restPosition.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position+normal*.0018,1.);
  }
`;

export const outlineFragment = /* glsl */`
  uniform float lengthLimit;
  varying float height;
  void main() {
    float stocking = 1. - smoothstep(lengthLimit-.005,lengthLimit+.004,height);
    vec3 pigment = mix(vec3(.33,.16,.16),vec3(.018,.016,.023),stocking);
    float alpha = mix(.52,.91,stocking)*(1.-smoothstep(.747,.852,height));
    gl_FragColor = vec4(pigment,alpha);
    #include <colorspace_fragment>
  }
`;

export const dropletVertex = /* glsl */`
  varying vec3 facing;
  varying vec3 eyeDirection;
  void main() {
    vec4 viewPoint = modelViewMatrix * vec4(position,1.);
    facing = normalize(normalMatrix * normal);
    eyeDirection = -viewPoint.xyz;
    gl_Position = projectionMatrix * viewPoint;
  }
`;

export const dropletFragment = /* glsl */`
  varying vec3 facing;
  varying vec3 eyeDirection;
  void main() {
    vec3 n = normalize(facing);
    vec3 v = normalize(eyeDirection);
    vec3 light = normalize(vec3(-.55,.83,.62));
    float fresnel = pow(1.-max(0.,dot(n,v)),2.);
    float specular = pow(max(0.,dot(n,normalize(v+light))),25.);
    float oval = smoothstep(.12,.72,dot(n,light));
    vec3 color = mix(vec3(.48,.49,.57),vec3(.92,.96,1.),oval);
    color = mix(color,vec3(1.),specular*.94);
    gl_FragColor = vec4(color,.16 + .35*fresnel + .64*specular);
    #include <colorspace_fragment>
  }
`;
