"use strict";

const MODEL_URL = "https://teachablemachine.withgoogle.com/models/Nh68eUDmN/";
const $ = (selector) => document.querySelector(selector);

const ui = {
  menu: $("#menu"), hud: $("#hud"), status: $("#status"), start: $("#start"),
  mode: $("#mode"), map: $("#map"), team: $("#team"), controls: $("#controls"),
  blueScore: $("#blue-score"), redScore: $("#red-score"), timer: $("#timer"),
  healthNumber: $("#health-number"), healthBar: $("#health-bar"),
  weaponName: $("#weapon-name"), ammo: $("#ammo"), reserve: $("#reserve"),
  action: $("#action"), hitMarker: $("#hit-marker"), damage: $("#damage-vignette"),
  killFeed: $("#kill-feed"), scope: $("#scope"), cameraPanel: $("#camera-panel"),
  enableCamera: $("#enable-camera"), webcam: $("#webcam"), prediction: $("#prediction"),
  swipeTip: $("#swipe-tip"), fatal: $("#fatal")
};

const WEAPONS = {
  rifle: { label:"RIFLE", mag:30, reserve:120, damage:18, rate:115, reload:1150, range:105, spread:0.012, color:0x7bc8ff },
  sniper:{ label:"SNIPER", mag:5, reserve:25, damage:88, rate:850, reload:1900, range:165, spread:0.0015, color:0xffd36b }
};

const MAPS = {
  yard: {
    skyTop:0x101c3d, skyBottom:0x441b53, fog:0x10162a, ground:0x151d31, grid:0x2b4b73,
    cover:0x263452, accent:0x32d8ff, accent2:0xff4caa, sun:0xbdd8ff
  },
  canyon: {
    skyTop:0x713625, skyBottom:0xe8a15e, fog:0x9a5f3b, ground:0x7b4c31, grid:0xa96d44,
    cover:0x5b3527, accent:0xffb45e, accent2:0xff644a, sun:0xffe0b1
  },
  ice: {
    skyTop:0x19416d, skyBottom:0xa8d9f4, fog:0x7aa9c8, ground:0x9dc9dc, grid:0xd8f4ff,
    cover:0x6b92aa, accent:0x6ff2ff, accent2:0xa98cff, sun:0xe9fbff
  }
};

const game = {
  running:false, scene:null, camera:null, renderer:null, clock:null, player:null,
  actors:[], obstacles:[], shootables:[], effects:[], animatedDecor:[],
  keys:new Set(), scores:{blue:0,red:0}, teamSize:2, myTeam:"blue", mapName:"yard",
  yaw:0, pitch:-0.08, moveStick:{x:0,y:0}, lookPointer:null, lookX:0, lookY:0,
  mouseFire:false, mobileFire:false, scoped:false, endAt:0, lastFrame:0,
  cameraRay:null, collisionRay:null,
  tmModel:null, webcam:null, poseMovement:{x:0,y:0}, lastPose:"", cameraLoopRunning:false,
  audio:null, bound:false, startToken:0
};

function setFatal(message) {
  ui.fatal.style.display = "block";
  ui.fatal.textContent = String(message);
}
window.addEventListener("error", (event) => setFatal(`Game error: ${event.message}`));
window.addEventListener("unhandledrejection", (event) => setFatal(`Game error: ${event.reason?.message || event.reason}`));

function colorHex(value) { return new THREE.Color(value); }

function makeMaterial(color, options={}) {
  return new THREE.MeshStandardMaterial({
    color, roughness:options.roughness ?? 0.68, metalness:options.metalness ?? 0.08,
    emissive:options.emissive ?? 0x000000, emissiveIntensity:options.emissiveIntensity ?? 0
  });
}

function makeBox(w,h,d,color,options={}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), makeMaterial(color,options));
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}

function makeGroundTexture(base, line) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = `#${new THREE.Color(base).getHexString()}`;
  ctx.fillRect(0,0,256,256);
  ctx.strokeStyle = `#${new THREE.Color(line).getHexString()}`;
  ctx.globalAlpha = .42;
  ctx.lineWidth = 2;
  for(let i=0;i<=256;i+=32){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,256);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(256,i);ctx.stroke();}
  ctx.globalAlpha = .15;
  for(let i=0;i<280;i++){ctx.fillStyle=i%2?"#ffffff":"#000000";ctx.fillRect(Math.random()*256,Math.random()*256,1,1);}
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(13,10);
  texture.anisotropy = Math.min(8, game.renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function createSky(config) {
  const geometry = new THREE.SphereGeometry(150,32,18);
  const material = new THREE.ShaderMaterial({
    side:THREE.BackSide, depthWrite:false,
    uniforms:{topColor:{value:colorHex(config.skyTop)},bottomColor:{value:colorHex(config.skyBottom)},offset:{value:24},exponent:{value:.65}},
    vertexShader:`varying vec3 vWorldPosition;void main(){vec4 worldPosition=modelMatrix*vec4(position,1.0);vWorldPosition=worldPosition.xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`uniform vec3 topColor;uniform vec3 bottomColor;uniform float offset;uniform float exponent;varying vec3 vWorldPosition;void main(){float h=normalize(vWorldPosition+offset).y;gl_FragColor=vec4(mix(bottomColor,topColor,max(pow(max(h,0.0),exponent),0.0)),1.0);}`
  });
  game.scene.add(new THREE.Mesh(geometry,material));
}

function addObstacle(mesh,x,y,z) {
  mesh.position.set(x,y,z);
  game.scene.add(mesh);
  mesh.updateMatrixWorld(true);
  mesh.userData.bounds = new THREE.Box3().setFromObject(mesh);
  game.obstacles.push(mesh);
  game.shootables.push(mesh);
  return mesh;
}

function addDecor(mesh,x,y,z) {
  mesh.position.set(x,y,z);
  game.scene.add(mesh);
  return mesh;
}

function createBoundary(config) {
  const wallMat = makeMaterial(config.cover,{roughness:.55,metalness:.18});
  const pieces = [
    [82,3,1,0,1.5,-30.5],[82,3,1,0,1.5,30.5],
    [1,3,62,-40.5,1.5,0],[1,3,62,40.5,1.5,0]
  ];
  for(const [w,h,d,x,y,z] of pieces){
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),wallMat.clone());
    wall.castShadow = wall.receiveShadow = true;
    addObstacle(wall,x,y,z);
  }
}

function neonPost(x,z,color,height=5) {
  const post = makeBox(.45,height,.45,0x1b2438,{metalness:.45,roughness:.35});
  addObstacle(post,x,height/2,z);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(.18,height*.9,.18),new THREE.MeshBasicMaterial({color}));
  glow.position.set(x,height/2,z);
  game.scene.add(glow);
  const light = new THREE.PointLight(color,1.2,12,2);
  light.position.set(x,height*.75,z);
  game.scene.add(light);
  game.animatedDecor.push({type:"pulse",object:light,base:1.1,phase:Math.random()*6});
}

function rock(x,z,scale,color,collidable=true) {
  const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(scale,0),makeMaterial(color,{roughness:.95}));
  mesh.rotation.set(Math.random(),Math.random(),Math.random());
  mesh.scale.y = 1.25+Math.random()*.55;
  if(collidable) addObstacle(mesh,x,scale*.7,z); else addDecor(mesh,x,scale*.7,z);
}

function iceShard(x,z,scale,color) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(scale*.65,scale*3,5),makeMaterial(color,{roughness:.24,metalness:.05,emissive:0x14364a,emissiveIntensity:.2}));
  mesh.rotation.z = (Math.random()-.5)*.22;
  addObstacle(mesh,x,scale*1.45,z);
}

function makeAtmosphere(name,config) {
  const count = name==="canyon" ? 300 : 220;
  const positions = new Float32Array(count*3);
  for(let i=0;i<count;i++){positions[i*3]=(Math.random()-.5)*90;positions[i*3+1]=Math.random()*18+.5;positions[i*3+2]=(Math.random()-.5)*70;}
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
  const material = new THREE.PointsMaterial({color:name==="canyon"?0xffd0a0:0xdaf7ff,size:name==="canyon"?.08:.12,transparent:true,opacity:name==="canyon"?.45:.65,depthWrite:false});
  const points = new THREE.Points(geometry,material);
  game.scene.add(points);
  game.animatedDecor.push({type:"drift",object:points,speed:name==="canyon"?.18:.08});
}

function buildMap(name) {
  const c = MAPS[name];
  game.scene.background = new THREE.Color(c.fog);
  game.scene.fog = new THREE.FogExp2(c.fog,name==="canyon"?.012:.009);
  createSky(c);

  const groundMat = new THREE.MeshStandardMaterial({map:makeGroundTexture(c.ground,c.grid),roughness:.88,metalness:name==="yard"?.12:0});
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(82,62),groundMat);
  ground.rotation.x = -Math.PI/2;
  ground.receiveShadow = true;
  game.scene.add(ground);
  game.shootables.push(ground);
  createBoundary(c);

  const cover = c.cover;
  const boxes = [
    [10,2.6,6,0,1.3,0],[4,3.2,8,-14,1.6,-9],[4,3.2,8,14,1.6,9],
    [6,2.3,3,-22,1.15,12],[6,2.3,3,22,1.15,-12],
    [4,4.3,4,-30,2.15,-17],[4,4.3,4,30,2.15,17],
    [8,1.8,3,-6,.9,18],[8,1.8,3,6,.9,-18]
  ];
  boxes.forEach(([w,h,d,x,y,z],i)=>{
    const box = makeBox(w,h,d,cover,{metalness:name==="yard"?.22:.05,roughness:name==="ice"?.4:.72});
    addObstacle(box,x,y,z);
    if(i<5){
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(w*.72,.12,d*1.015),new THREE.MeshBasicMaterial({color:i%2?c.accent:c.accent2}));
      stripe.position.set(x,y+.25,z);
      game.scene.add(stripe);
    }
  });

  if(name==="yard"){
    [-32,-24,-16,-8,8,16,24,32].forEach((x,i)=>neonPost(x,i%2?27:-27,i%2?c.accent:c.accent2,4.8+(i%3)));
    for(const p of [[-25,-3],[25,3],[-8,-11],[8,11]]) {
      const crate = makeBox(3.2,3.2,3.2,0x30425f,{metalness:.3,roughness:.45});
      addObstacle(crate,p[0],1.6,p[1]);
    }
  } else if(name==="canyon"){
    [[-34,-22,3.8],[-29,22,4.8],[33,-21,4.2],[27,22,5.2],[-10,26,3.1],[12,-26,3.4]].forEach(v=>rock(v[0],v[1],v[2],0x6b3d2b));
    for(const p of [[-24,0],[24,0],[-5,-10],[5,10]]) {
      const crate = makeBox(3.5,3,3.5,0x74452d,{roughness:.85});
      addObstacle(crate,p[0],1.5,p[1]);
    }
  } else {
    [[-33,-23,2.3],[-28,21,2.8],[32,-21,2.5],[28,23,3],[-11,26,2],[12,-26,2.2]].forEach(v=>iceShard(v[0],v[1],v[2],0xaeeaff));
    for(const p of [[-25,2],[25,-2],[-8,-11],[8,11]]) {
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.2,3.2,10),makeMaterial(0x7395aa,{metalness:.22,roughness:.38}));
      pod.rotation.z = Math.PI/2;
      addObstacle(pod,p[0],2,p[1]);
    }
  }
  makeAtmosphere(name,c);
}

function makeHealthBar() {
  const group = new THREE.Group();
  const back = new THREE.Mesh(new THREE.PlaneGeometry(1.5,.16),new THREE.MeshBasicMaterial({color:0x120b12,transparent:true,opacity:.9,depthTest:false}));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.42,.1),new THREE.MeshBasicMaterial({color:0x55e07c,depthTest:false}));
  fill.position.z=.01;
  group.add(back,fill);
  group.position.y=2.85;
  group.renderOrder=10;
  return {group,fill};
}

function createCharacter(team) {
  const root = new THREE.Group();
  const visual = new THREE.Group();
  root.add(visual);
  const color = team==="blue"?0x288cff:0xff3d5d;
  const dark = team==="blue"?0x173c73:0x741c2c;
  const skin = 0xe8b88b;
  const body = makeBox(.88,1.15,.55,color,{roughness:.48,metalness:.08});
  body.position.y=1.42;
  const vest = makeBox(.94,.62,.61,dark,{roughness:.5,metalness:.18});
  vest.position.set(0,1.48,.015);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.34,16,12),makeMaterial(skin,{roughness:.8}));
  head.position.y=2.26;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(.36,16,8,0,Math.PI*2,0,Math.PI*.58),makeMaterial(dark,{metalness:.25,roughness:.38}));
  helmet.position.y=2.31;
  const hip = makeBox(.7,.28,.46,dark,{roughness:.55});hip.position.y=.78;
  const leftArm = makeBox(.24,.92,.24,color);leftArm.position.set(-.57,1.42,-.05);
  const rightArm = makeBox(.24,.92,.24,color);rightArm.position.set(.57,1.42,-.05);
  const leftLeg = makeBox(.29,.86,.31,dark);leftLeg.position.set(-.23,.36,0);
  const rightLeg = makeBox(.29,.86,.31,dark);rightLeg.position.set(.23,.36,0);
  const gunPivot = new THREE.Group();gunPivot.position.set(.38,1.56,-.25);
  const rifle = makeBox(.16,.19,1.28,0x222a37,{metalness:.52,roughness:.28});
  rifle.position.z=-.45;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.6,8),makeMaterial(0x11161e,{metalness:.75,roughness:.22}));
  barrel.rotation.x=Math.PI/2;barrel.position.set(0,0,-1.12);
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.45,10),makeMaterial(0x151b25,{metalness:.58,roughness:.24}));
  scope.rotation.x=Math.PI/2;scope.position.set(0,.14,-.5);scope.visible=false;
  const muzzle = new THREE.Object3D();muzzle.position.set(0,0,-1.43);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),new THREE.MeshBasicMaterial({color:0xffe39a,transparent:true,opacity:.95}));
  flash.position.copy(muzzle.position);flash.visible=false;
  gunPivot.add(rifle,barrel,scope,muzzle,flash);
  visual.add(body,vest,head,helmet,hip,leftArm,rightArm,leftLeg,rightLeg,gunPivot);
  const hb=makeHealthBar();root.add(hb.group);
  visual.traverse(obj=>{if(obj.isMesh){obj.castShadow=true;obj.receiveShadow=true;}});
  return {root,visual,body,leftArm,rightArm,leftLeg,rightLeg,gunPivot,rifle,barrel,scope,muzzle,flash,health:hb.group,healthFill:hb.fill};
}

class Actor {
  constructor(team,human=false,index=0) {
    this.team=team;this.human=human;this.index=index;this.hp=100;this.dead=false;
    this.verticalVelocity=0;this.grounded=true;this.weapon="rifle";
    this.ammo={rifle:WEAPONS.rifle.mag,sniper:WEAPONS.sniper.mag};
    this.reserve={rifle:WEAPONS.rifle.reserve,sniper:WEAPONS.sniper.reserve};
    this.lastShot=0;this.reloading=false;this.reloadTimer=0;this.rollStart=0;this.rollUntil=0;
    this.target=null;this.thinkAt=0;this.walkPhase=Math.random()*10;this.speed=0;this.flashUntil=0;
    this.rig=createCharacter(team);this.group=this.rig.root;this.group.userData.actor=this;
    this.group.traverse(obj=>{obj.userData.actor=this;});
    game.scene.add(this.group);game.actors.push(this);
  }
  spawn() {
    const side=this.team==="blue"?-1:1;
    const lane=this.index-(game.teamSize-1)/2;
    this.group.position.set(side*22,0,lane*5);
    this.group.rotation.set(0,this.team==="blue"?Math.PI/2:-Math.PI/2,0);
    this.rig.visual.rotation.set(0,0,0);
    this.hp=100;this.dead=false;this.group.visible=true;this.verticalVelocity=0;this.grounded=true;
    this.weapon="rifle";this.ammo.rifle=WEAPONS.rifle.mag;this.ammo.sniper=WEAPONS.sniper.mag;
    this.reserve.rifle=WEAPONS.rifle.reserve;this.reserve.sniper=WEAPONS.sniper.reserve;
    this.reloading=false;this.rollUntil=0;this.updateWeaponVisual();this.updateHealthBar();
    if(this.human) updateHud();
  }
  updateWeaponVisual() {
    const sniper=this.weapon==="sniper";
    this.rig.rifle.scale.z=sniper?1.32:1;
    this.rig.barrel.scale.y=sniper?1.5:1;
    this.rig.scope.visible=sniper;
  }
  updateHealthBar() {
    const ratio=Math.max(0,this.hp/100);
    this.rig.healthFill.scale.x=Math.max(.001,ratio);
    this.rig.healthFill.position.x=-.71*(1-ratio);
    this.rig.healthFill.material.color.setHex(ratio>.55?0x55e07c:ratio>.25?0xffc85a:0xff526a);
  }
  takeDamage(amount,attacker) {
    if(this.dead)return;
    this.hp-=amount;this.updateHealthBar();
    if(this.human){updateHud();showDamage();}
    if(this.hp<=0){
      this.dead=true;this.group.visible=false;
      game.scores[attacker.team]+=1;updateScore();
      addKillFeed(`${attacker.human?"YOU":attacker.team.toUpperCase()} tagged ${this.human?"YOU":this.team.toUpperCase()}`);
      setTimeout(()=>{if(game.running)this.spawn();},1500);
    }
  }
}

function spawnTeams() {
  for(const team of ["blue","red"]){
    for(let i=0;i<game.teamSize;i++){
      const actor=new Actor(team,team===game.myTeam&&i===0,i);
      if(actor.human)game.player=actor;
      actor.spawn();
    }
  }
}

function updateScore(){ui.blueScore.textContent=game.scores.blue;ui.redScore.textContent=game.scores.red;}

function blockedAt(position,actor) {
  if(Math.abs(position.x)>39.4||Math.abs(position.z)>29.4)return true;
  const radius=.48;
  for(const obstacle of game.obstacles){
    const b=obstacle.userData.bounds;
    if(!b)continue;
    const overlaps=position.x>b.min.x-radius&&position.x<b.max.x+radius&&position.z>b.min.z-radius&&position.z<b.max.z+radius;
    if(overlaps&&position.y<b.max.y+.08)return true;
  }
  for(const other of game.actors){
    if(other===actor||other.dead)continue;
    const dx=position.x-other.group.position.x,dz=position.z-other.group.position.z;
    if(dx*dx+dz*dz<.72)return true;
  }
  return false;
}

function moveActor(actor,direction,speed,dt) {
  actor.speed=direction.lengthSq()?speed:0;
  if(direction.lengthSq()){
    const step=direction.clone().normalize().multiplyScalar(speed*dt);
    const px=actor.group.position.clone();px.x+=step.x;if(!blockedAt(px,actor))actor.group.position.x=px.x;
    const pz=actor.group.position.clone();pz.z+=step.z;if(!blockedAt(pz,actor))actor.group.position.z=pz.z;
  }
  actor.verticalVelocity-=21*dt;
  actor.group.position.y+=actor.verticalVelocity*dt;
  if(actor.group.position.y<=0){actor.group.position.y=0;actor.verticalVelocity=0;actor.grounded=true;}
}

function jump(actor) {
  if(!actor||actor.dead||!actor.grounded)return;
  actor.verticalVelocity=8.7;actor.grounded=false;flashAction("JUMP");sound("jump");
}

function roll(actor) {
  if(!actor||actor.dead||Date.now()<actor.rollUntil)return;
  actor.rollStart=Date.now();actor.rollUntil=actor.rollStart+560;flashAction("ROLL");sound("roll");
}

function reload(actor) {
  if(!actor||actor.dead||actor.reloading)return;
  const w=WEAPONS[actor.weapon];
  if(actor.ammo[actor.weapon]>=w.mag||actor.reserve[actor.weapon]<=0)return;
  actor.reloading=true;actor.reloadTimer=Date.now()+w.reload;
  if(actor.human){flashAction(actor.weapon==="sniper"?"SNIPER RELOAD":"RELOAD");updateHud();}
  sound("reload");
  setTimeout(()=>{
    if(actor.dead)return;
    const needed=w.mag-actor.ammo[actor.weapon],taken=Math.min(needed,actor.reserve[actor.weapon]);
    actor.ammo[actor.weapon]+=taken;actor.reserve[actor.weapon]-=taken;actor.reloading=false;
    if(actor.human)updateHud();
  },w.reload);
}

function switchWeapon(actor,weapon=null) {
  if(!actor||actor.dead)return;
  actor.weapon=weapon||(actor.weapon==="rifle"?"sniper":"rifle");
  actor.reloading=false;actor.updateWeaponVisual();
  if(actor.human){setScoped(false);flashAction(WEAPONS[actor.weapon].label);updateHud();}
}

function actorFromObject(object) {
  let node=object;
  while(node){if(node.userData?.actor)return node.userData.actor;node=node.parent;}
  return null;
}

function getMuzzle(actor) {
  const p=new THREE.Vector3();
  actor.rig.muzzle.getWorldPosition(p);
  return p;
}

function createTracer(start,end,color) {
  const geometry=new THREE.BufferGeometry().setFromPoints([start,end]);
  const material=new THREE.LineBasicMaterial({color,transparent:true,opacity:.95});
  const line=new THREE.Line(geometry,material);game.scene.add(line);
  game.effects.push({type:"tracer",object:line,until:performance.now()+95});
}

function createImpact(position,color=0xffffff) {
  for(let i=0;i<5;i++){
    const particle=new THREE.Mesh(new THREE.SphereGeometry(.035,5,4),new THREE.MeshBasicMaterial({color,transparent:true,opacity:1}));
    particle.position.copy(position);game.scene.add(particle);
    game.effects.push({type:"particle",object:particle,velocity:new THREE.Vector3((Math.random()-.5)*3,Math.random()*2.5,(Math.random()-.5)*3),until:performance.now()+300});
  }
}

function showHitMarker() {
  ui.hitMarker.style.opacity="1";
  clearTimeout(showHitMarker.timer);
  showHitMarker.timer=setTimeout(()=>ui.hitMarker.style.opacity="0",95);
}

function shoot(actor) {
  const now=performance.now(),w=WEAPONS[actor.weapon];
  if(!game.running||actor.dead||actor.reloading||now-actor.lastShot<w.rate)return;
  if(actor.ammo[actor.weapon]<=0){reload(actor);return;}
  actor.lastShot=now;actor.ammo[actor.weapon]-=1;actor.flashUntil=now+60;actor.rig.flash.visible=true;
  if(actor.human)updateHud();

  actor.group.updateMatrixWorld(true);
  const muzzle=getMuzzle(actor);
  let origin,dir;
  if(actor.human){
    origin=game.camera.position.clone();
    dir=new THREE.Vector3();game.camera.getWorldDirection(dir);
    const spread=game.scoped&&actor.weapon==="sniper"?w.spread*.2:w.spread;
    dir.x+=(Math.random()-.5)*spread;dir.y+=(Math.random()-.5)*spread;dir.z+=(Math.random()-.5)*spread;dir.normalize();
    game.pitch=Math.min(.58,game.pitch+(actor.weapon==="sniper"?.028:.006));
  }else{
    origin=muzzle.clone();
    if(!actor.target||actor.target.dead)return;
    dir=actor.target.group.position.clone().add(new THREE.Vector3(0,1.45,0)).sub(origin).normalize();
    const spread=actor.weapon==="sniper"?.025:.07;
    dir.x+=(Math.random()-.5)*spread;dir.y+=(Math.random()-.5)*spread;dir.z+=(Math.random()-.5)*spread;dir.normalize();
  }

  game.cameraRay.set(origin,dir);game.cameraRay.near=0;game.cameraRay.far=w.range;
  const targets=game.actors.filter(a=>a.team!==actor.team&&!a.dead).map(a=>a.group);
  const worldHits=game.cameraRay.intersectObjects(game.shootables,true);
  const actorHits=game.cameraRay.intersectObjects(targets,true);
  let hit=null;
  if(worldHits[0]&&actorHits[0])hit=worldHits[0].distance<actorHits[0].distance?worldHits[0]:actorHits[0];
  else hit=worldHits[0]||actorHits[0]||null;
  const end=hit?hit.point.clone():origin.clone().addScaledVector(dir,w.range);
  const victim=hit?actorFromObject(hit.object):null;
  if(victim&&victim.team!==actor.team){
    victim.takeDamage(w.damage,actor);createImpact(end,actor.team==="blue"?0x79bdff:0xff7185);
    if(actor.human){showHitMarker();sound("hit");}
  }else if(hit) createImpact(end,0xffffff);
  createTracer(muzzle,end,w.color);
  sound(actor.weapon);
}

function hasLineOfSight(actor,target) {
  const start=actor.group.position.clone().add(new THREE.Vector3(0,1.4,0));
  const end=target.group.position.clone().add(new THREE.Vector3(0,1.4,0));
  const dir=end.clone().sub(start),distance=dir.length();dir.normalize();
  game.collisionRay.set(start,dir);game.collisionRay.far=distance;
  const hit=game.collisionRay.intersectObjects(game.obstacles,true)[0];
  return !hit||hit.distance>distance-.5;
}

function updateAI(actor,dt) {
  if(actor.dead)return;
  const now=performance.now();
  if(now>actor.thinkAt){
    actor.thinkAt=now+350+Math.random()*450;
    actor.target=game.actors.filter(a=>a.team!==actor.team&&!a.dead)
      .sort((a,b)=>a.group.position.distanceTo(actor.group.position)-b.group.position.distanceTo(actor.group.position))[0]||null;
    if(Math.random()<.07)switchWeapon(actor);
  }
  if(!actor.target)return;
  const toTarget=actor.target.group.position.clone().sub(actor.group.position),distance=toTarget.length();
  toTarget.y=0;toTarget.normalize();
  const strafe=new THREE.Vector3(-toTarget.z,0,toTarget.x).multiplyScalar(Math.sin(now/720+actor.index*1.7)*.65);
  const approach=toTarget.clone().multiplyScalar(distance>13?1:distance<7?-.55:.15);
  let direction=approach.add(strafe).normalize();
  const probe=actor.group.position.clone().addScaledVector(direction,1.3);
  if(blockedAt(probe,actor))direction=new THREE.Vector3(-direction.z,0,direction.x);
  moveActor(actor,direction,now<actor.rollUntil?10.3:5.1,dt);
  actor.group.rotation.y=Math.atan2(direction.x,direction.z)+Math.PI;
  if(distance<48&&hasLineOfSight(actor,actor.target)&&Math.random()<dt*(actor.weapon==="sniper"?.75:3.2))shoot(actor);
  if(actor.ammo[actor.weapon]===0)reload(actor);
  if(Math.random()<dt*.045)jump(actor);
  if(Math.random()<dt*.025)roll(actor);
}

function inputDirection() {
  const keyX=(game.keys.has("KeyD")||game.keys.has("ArrowRight")?1:0)-(game.keys.has("KeyA")||game.keys.has("ArrowLeft")?1:0);
  const keyY=(game.keys.has("KeyW")||game.keys.has("ArrowUp")?1:0)-(game.keys.has("KeyS")||game.keys.has("ArrowDown")?1:0);
  return {x:Math.max(-1,Math.min(1,keyX+game.moveStick.x+game.poseMovement.x)),y:Math.max(-1,Math.min(1,keyY+game.moveStick.y+game.poseMovement.y))};
}

function updatePlayer(dt) {
  const p=game.player;if(!p||p.dead)return;
  const input=inputDirection();
  const forward=new THREE.Vector3(Math.sin(game.yaw),0,-Math.cos(game.yaw));
  const right=new THREE.Vector3(Math.cos(game.yaw),0,Math.sin(game.yaw));
  const direction=forward.multiplyScalar(input.y).add(right.multiplyScalar(input.x));
  if(direction.lengthSq())direction.normalize();
  moveActor(p,direction,performance.now()<p.rollUntil?12.3:6.35,dt);
  p.group.rotation.y=game.yaw;
  if(game.mouseFire||game.mobileFire)shoot(p);
}

function updateRig(actor,dt) {
  if(actor.dead)return;
  actor.walkPhase+=dt*(actor.speed>0?10:2);
  const walk=actor.speed>0?Math.sin(actor.walkPhase)*.62:Math.sin(actor.walkPhase)*.03;
  actor.rig.leftLeg.rotation.x=walk;actor.rig.rightLeg.rotation.x=-walk;
  actor.rig.leftArm.rotation.x=-walk*.55-.5;actor.rig.rightArm.rotation.x=walk*.35-.5;
  actor.rig.gunPivot.rotation.x=-.12;
  const now=performance.now();
  if(now<actor.rollUntil){
    const t=(now-actor.rollStart)/(actor.rollUntil-actor.rollStart);
    actor.rig.visual.rotation.x=-Math.sin(Math.PI*Math.max(0,Math.min(1,t)))*Math.PI*1.05;
    actor.rig.visual.position.y=-Math.sin(Math.PI*t)*.2;
  }else{actor.rig.visual.rotation.x*=.72;actor.rig.visual.position.y*=.72;}
  if(now>actor.flashUntil)actor.rig.flash.visible=false;
  actor.rig.health.quaternion.copy(game.camera.quaternion);
}

function updateCamera(dt) {
  const p=game.player;if(!p)return;
  const target=p.group.position.clone().add(new THREE.Vector3(0,1.55,0));
  const forward=new THREE.Vector3(Math.sin(game.yaw),0,-Math.cos(game.yaw));
  const right=new THREE.Vector3(Math.cos(game.yaw),0,Math.sin(game.yaw));
  const distance=game.scoped?3.2:5.8;
  const desired=target.clone().addScaledVector(forward,-distance).addScaledVector(right,game.scoped?.42:1.02);
  desired.y+=1.15-game.pitch*1.35;
  const rayDir=desired.clone().sub(target),rayDistance=rayDir.length();rayDir.normalize();
  game.collisionRay.set(target,rayDir);game.collisionRay.far=rayDistance;
  const hit=game.collisionRay.intersectObjects(game.obstacles,true)[0];
  if(hit)desired.copy(target).addScaledVector(rayDir,Math.max(.6,hit.distance-.25));
  const blend=1-Math.pow(.001,dt);
  game.camera.position.lerp(desired,blend);
  const aimDirection=new THREE.Vector3(Math.sin(game.yaw)*Math.cos(game.pitch),Math.sin(game.pitch),-Math.cos(game.yaw)*Math.cos(game.pitch));
  game.camera.lookAt(target.clone().addScaledVector(aimDirection,18));
  const targetFov=game.scoped?36:68;
  game.camera.fov+=(targetFov-game.camera.fov)*Math.min(1,dt*12);game.camera.updateProjectionMatrix();
}

function updateEffects(dt) {
  const now=performance.now();
  game.effects=game.effects.filter(effect=>{
    if(effect.type==="particle"){
      effect.object.position.addScaledVector(effect.velocity,dt);effect.velocity.y-=7*dt;
      effect.object.material.opacity=Math.max(0,(effect.until-now)/300);
    }
    if(now>=effect.until){game.scene.remove(effect.object);effect.object.geometry?.dispose();effect.object.material?.dispose();return false;}
    return true;
  });
  for(const item of game.animatedDecor){
    if(item.type==="pulse")item.object.intensity=item.base+Math.sin(performance.now()/520+item.phase)*.35;
    if(item.type==="drift"){item.object.rotation.y+=dt*item.speed;item.object.position.x=Math.sin(performance.now()/4000)*1.5;}
  }
}

function updateHud() {
  const p=game.player;if(!p)return;
  ui.healthNumber.textContent=Math.max(0,Math.ceil(p.hp));
  ui.healthBar.style.width=`${Math.max(0,p.hp)}%`;
  ui.ammo.textContent=p.ammo[p.weapon];ui.reserve.textContent=p.reserve[p.weapon];
  ui.weaponName.textContent=`${WEAPONS[p.weapon].label}${p.reloading?" — RELOADING":""}`;
  $("#mobile-scope").disabled=p.weapon!=="sniper";
  $("#mobile-switch").textContent=p.weapon==="rifle"?"SNIPER":"RIFLE";
}

function flashAction(text) {
  ui.action.textContent=text;clearTimeout(flashAction.timer);
  flashAction.timer=setTimeout(()=>ui.action.textContent="",650);
}

function showDamage() {
  ui.damage.style.opacity=".8";setTimeout(()=>ui.damage.style.opacity="0",150);
}

function addKillFeed(text) {
  const line=document.createElement("div");line.textContent=text;ui.killFeed.prepend(line);
  setTimeout(()=>line.remove(),3200);
}

function setScoped(enabled) {
  game.scoped=Boolean(enabled&&game.player?.weapon==="sniper");
  ui.scope.style.display=game.scoped?"block":"none";
  $("#mobile-scope").classList.toggle("active",game.scoped);
}

function sound(type) {
  try{
    if(!game.audio)game.audio=new (window.AudioContext||window.webkitAudioContext)();
    const ctx=game.audio,osc=ctx.createOscillator(),gain=ctx.createGain(),now=ctx.currentTime;
    const settings={
      rifle:[145,.035,.09],sniper:[82,.065,.18],hit:[620,.025,.07],jump:[260,.025,.08],roll:[95,.02,.11],reload:[210,.015,.06]
    }[type]||[180,.02,.07];
    osc.type=type==="hit"?"sine":"square";osc.frequency.setValueAtTime(settings[0],now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(45,settings[0]*.55),now+settings[2]);
    gain.gain.setValueAtTime(settings[1],now);gain.gain.exponentialRampToValueAtTime(.0001,now+settings[2]);
    osc.connect(gain).connect(ctx.destination);osc.start(now);osc.stop(now+settings[2]);
  }catch(_){}
}

function updateTimer() {
  const left=Math.max(0,game.endAt-Date.now()),m=Math.floor(left/60000),s=Math.floor(left/1000)%60;
  ui.timer.textContent=`0${m}:${String(s).padStart(2,"0")}`;
  if(left<=0||game.scores.blue>=15||game.scores.red>=15)finishGame();
}

function frame(now) {
  if(!game.running)return;
  requestAnimationFrame(frame);
  const dt=Math.min((now-game.lastFrame)/1000||.016,.04);game.lastFrame=now;
  updatePlayer(dt);
  for(const actor of game.actors){if(!actor.human)updateAI(actor,dt);}
  updateCamera(dt);
  for(const actor of game.actors)updateRig(actor,dt);
  updateEffects(dt);updateTimer();
  game.renderer.render(game.scene,game.camera);
}

function disposeGame() {
  if(game.renderer){
    game.renderer.domElement.remove();
    game.renderer.dispose();
  }
  if(game.scene){
    game.scene.traverse(obj=>{
      if(obj.geometry)obj.geometry.dispose?.();
      if(obj.material){
        const materials=Array.isArray(obj.material)?obj.material:[obj.material];
        materials.forEach(mat=>{if(mat.map)mat.map.dispose?.();mat.dispose?.();});
      }
    });
  }
  game.scene=game.camera=game.renderer=game.clock=game.player=null;
  game.actors=[];game.obstacles=[];game.shootables=[];game.effects=[];game.animatedDecor=[];
}

function finishGame() {
  if(!game.running)return;
  game.running=false;game.mouseFire=false;game.mobileFire=false;setScoped(false);
  if(document.exitPointerLock)document.exitPointerLock();
  ui.hud.style.display="none";ui.menu.style.display="grid";
  const result=game.scores.blue===game.scores.red?"DRAW":game.scores.blue>game.scores.red?"BLUE WINS":"RED WINS";
  ui.status.textContent=`${result} — Blue ${game.scores.blue}, Red ${game.scores.red}`;
}

function setupRenderer() {
  game.scene=new THREE.Scene();
  game.camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.08,220);
  game.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
  game.renderer.setSize(innerWidth,innerHeight);
  game.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  game.renderer.shadowMap.enabled=true;game.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  game.renderer.outputEncoding=THREE.sRGBEncoding;
  game.renderer.toneMapping=THREE.ACESFilmicToneMapping;game.renderer.toneMappingExposure=1.05;
  game.cameraRay=new THREE.Raycaster();game.collisionRay=new THREE.Raycaster();
  game.renderer.domElement.id="game-canvas";
  $("#game-root").appendChild(game.renderer.domElement);

  const c=MAPS[game.mapName];
  const hemi=new THREE.HemisphereLight(c.sun,0x181119,1.45);game.scene.add(hemi);
  const sun=new THREE.DirectionalLight(c.sun,2.25);sun.position.set(-22,34,18);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-45;sun.shadow.camera.right=45;sun.shadow.camera.top=38;sun.shadow.camera.bottom=-38;
  sun.shadow.camera.near=.5;sun.shadow.camera.far=100;sun.shadow.bias=-.00035;game.scene.add(sun);
}

async function startGame() {
  const token=++game.startToken;
  ui.start.disabled=true;ui.status.textContent="Starting match…";ui.fatal.style.display="none";
  try{
    if(!window.THREE)throw new Error("The 3D engine did not load. Refresh once and try again.");
    if(game.running)game.running=false;
    disposeGame();
    game.teamSize=Number(ui.mode.value);game.myTeam=ui.team.value;game.mapName=ui.map.value;
    game.scores={blue:0,red:0};game.yaw=game.myTeam==="blue"?Math.PI/2:-Math.PI/2;game.pitch=-.08;
    game.moveStick={x:0,y:0};game.poseMovement={x:0,y:0};game.lookPointer=null;game.keys.clear();game.scoped=false;
    setupRenderer();buildMap(game.mapName);spawnTeams();bindCanvasControls();
    game.endAt=Date.now()+180000;game.running=true;game.lastFrame=performance.now();
    updateScore();updateHud();ui.menu.style.display="none";ui.hud.style.display="block";
    ui.cameraPanel.style.display=ui.controls.value==="camera"?"block":"none";
    ui.enableCamera.style.display=game.webcam?"none":"block";
    if(token!==game.startToken)return;
    requestAnimationFrame(frame);
    if(matchMedia("(pointer:coarse)").matches){
      ui.swipeTip.style.opacity="1";setTimeout(()=>ui.swipeTip.style.opacity="0",3000);
    }
    ui.status.textContent="Ready.";
  }catch(error){
    console.error(error);ui.status.textContent=`Could not start: ${error.message||error}`;setFatal(error.stack||error);
    game.running=false;disposeGame();
  }finally{ui.start.disabled=false;}
}

function bindCanvasControls() {
  const canvas=game.renderer.domElement;
  canvas.addEventListener("pointerdown",event=>{
    if(event.pointerType==="touch"){
      if(event.clientX<innerWidth*.34)return;
      game.lookPointer=event.pointerId;game.lookX=event.clientX;game.lookY=event.clientY;
      try{canvas.setPointerCapture?.(event.pointerId);}catch(_){}event.preventDefault();
    }else if(event.button===0){
      game.mouseFire=true;
      if(document.pointerLockElement!==canvas)canvas.requestPointerLock?.();
    }else if(event.button===2)setScoped(true);
  },{passive:false});
  canvas.addEventListener("pointermove",event=>{
    if(event.pointerType==="touch"&&event.pointerId===game.lookPointer){
      const dx=event.clientX-game.lookX,dy=event.clientY-game.lookY;
      game.lookX=event.clientX;game.lookY=event.clientY;
      game.yaw+=dx*.006;game.pitch=Math.max(-.58,Math.min(.58,game.pitch-dy*.0045));event.preventDefault();
    }
  },{passive:false});
  const release=event=>{
    if(event.pointerId===game.lookPointer)game.lookPointer=null;
    if(event.pointerType!=="touch"&&event.button===0)game.mouseFire=false;
    if(event.pointerType!=="touch"&&event.button===2)setScoped(false);
  };
  canvas.addEventListener("pointerup",release);canvas.addEventListener("pointercancel",release);
  canvas.addEventListener("contextmenu",event=>event.preventDefault());
}

function bindGlobalControls() {
  if(game.bound)return;game.bound=true;
  addEventListener("resize",()=>{
    if(!game.camera||!game.renderer)return;
    game.camera.aspect=innerWidth/innerHeight;game.camera.updateProjectionMatrix();game.renderer.setSize(innerWidth,innerHeight);
  });
  addEventListener("keydown",event=>{
    game.keys.add(event.code);
    if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.code))event.preventDefault();
    if(!game.running)return;
    if(event.code==="Space")jump(game.player);
    if(event.code==="ShiftLeft"||event.code==="ShiftRight")roll(game.player);
    if(event.code==="KeyR")reload(game.player);
    if(event.code==="Digit1")switchWeapon(game.player,"rifle");
    if(event.code==="Digit2")switchWeapon(game.player,"sniper");
  });
  addEventListener("keyup",event=>game.keys.delete(event.code));
  addEventListener("mousemove",event=>{
    if(game.running&&document.pointerLockElement===game.renderer?.domElement){
      game.yaw+=event.movementX*.0024;
      game.pitch=Math.max(-.58,Math.min(.58,game.pitch-event.movementY*.0021));
    }
  });
  addEventListener("mouseup",event=>{if(event.button===0)game.mouseFire=false;if(event.button===2)setScoped(false);});
  addEventListener("blur",()=>{game.keys.clear();game.mouseFire=false;game.mobileFire=false;});
}

function setupJoystick() {
  const zone=$("#joystick"),nub=$("#joystick-nub");let pointer=null;
  const update=event=>{
    const r=zone.getBoundingClientRect(),x=Math.max(-45,Math.min(45,event.clientX-r.left-r.width/2)),y=Math.max(-45,Math.min(45,event.clientY-r.top-r.height/2));
    nub.style.transform=`translate(${x}px,${y}px)`;game.moveStick={x:x/45,y:-y/45};
  };
  zone.addEventListener("pointerdown",event=>{pointer=event.pointerId;try{zone.setPointerCapture?.(pointer);}catch(_){}update(event);event.preventDefault();},{passive:false});
  zone.addEventListener("pointermove",event=>{if(event.pointerId===pointer){update(event);event.preventDefault();}},{passive:false});
  const stop=event=>{if(event.pointerId!==pointer)return;pointer=null;game.moveStick={x:0,y:0};nub.style.transform="";};
  zone.addEventListener("pointerup",stop);zone.addEventListener("pointercancel",stop);
}

function holdButton(button,onStart,onEnd) {
  button.addEventListener("pointerdown",event=>{try{button.setPointerCapture?.(event.pointerId);}catch(_){}onStart();event.preventDefault();},{passive:false});
  button.addEventListener("pointerup",event=>{onEnd();event.preventDefault();},{passive:false});
  button.addEventListener("pointercancel",onEnd);
}

function setupMobileButtons() {
  holdButton($("#mobile-fire"),()=>game.mobileFire=true,()=>game.mobileFire=false);
  $("#mobile-jump").addEventListener("click",()=>jump(game.player));
  $("#mobile-roll").addEventListener("click",()=>roll(game.player));
  $("#mobile-reload").addEventListener("click",()=>reload(game.player));
  $("#mobile-switch").addEventListener("click",()=>switchWeapon(game.player));
  $("#mobile-scope").addEventListener("click",()=>setScoped(!game.scoped));
}

function loadScript(src,id) {
  return new Promise((resolve,reject)=>{
    if(document.getElementById(id))return resolve();
    const script=document.createElement("script");script.id=id;script.src=src;script.async=true;
    script.onload=resolve;script.onerror=()=>reject(new Error(`Could not load ${id}`));document.head.appendChild(script);
  });
}

async function enableCamera() {
  ui.enableCamera.disabled=true;ui.prediction.textContent="Loading camera controls…";
  try{
    await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js","tfjs-lib");
    await loadScript("https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8/dist/teachablemachine-image.min.js","tm-lib");
    if(!window.tmImage)throw new Error("Teachable Machine did not load.");
    if(!game.tmModel)game.tmModel=await tmImage.load(MODEL_URL+"model.json",MODEL_URL+"metadata.json");
    if(!game.webcam){
      game.webcam=new tmImage.Webcam(176,132,true);
      await game.webcam.setup();await game.webcam.play();
      ui.webcam.replaceChildren(game.webcam.canvas);
    }
    ui.enableCamera.style.display="none";ui.prediction.textContent="Camera ready.";
    if(!game.cameraLoopRunning){game.cameraLoopRunning=true;cameraLoop();}
  }catch(error){
    console.error(error);ui.prediction.textContent=`Camera unavailable: ${error.message||error}`;ui.enableCamera.disabled=false;
  }
}

async function cameraLoop() {
  if(!game.webcam||!game.tmModel){game.cameraLoopRunning=false;return;}
  try{
    game.webcam.update();
    const predictions=await game.tmModel.predict(game.webcam.canvas);
    predictions.sort((a,b)=>b.probability-a.probability);
    const best=predictions[0];
    ui.prediction.textContent=`${best.className}: ${Math.round(best.probability*100)}%`;
    if(best.probability>.76&&ui.controls.value==="camera")applyPose(best.className.toLowerCase());else game.poseMovement={x:0,y:0};
  }catch(error){console.error(error);ui.prediction.textContent="Camera prediction paused.";}
  requestAnimationFrame(cameraLoop);
}

function applyPose(name) {
  if(!game.running)return;
  if(name!==game.lastPose){game.lastPose=name;game.poseMovement={x:0,y:0};}
  if(/sniper.*reload|reload.*sniper/.test(name)){switchWeapon(game.player,"sniper");reload(game.player);}
  else if(/reload/.test(name))reload(game.player);
  else if(/sniper/.test(name)){switchWeapon(game.player,"sniper");shoot(game.player);}
  else if(/gun|fire|shoot/.test(name)){switchWeapon(game.player,"rifle");shoot(game.player);}
  else if(/jump/.test(name))jump(game.player);
  else if(/roll|dodge/.test(name))roll(game.player);
  else if(/left/.test(name))game.poseMovement.x=-1;
  else if(/right/.test(name))game.poseMovement.x=1;
  else if(/forward|up/.test(name))game.poseMovement.y=1;
  else if(/back|down/.test(name))game.poseMovement.y=-1;
  else game.poseMovement={x:0,y:0};
}

bindGlobalControls();setupJoystick();setupMobileButtons();
$("#generate").addEventListener("click",()=>$("#party").value=Math.random().toString(36).slice(2,8).toUpperCase());
ui.start.addEventListener("click",startGame);
ui.enableCamera.addEventListener("click",enableCamera);
ui.controls.addEventListener("change",()=>{ui.status.textContent=ui.controls.value==="camera"?"Start the match, then tap Enable Camera.":"Ready.";});

window.__motionStrikeDebug={
  start:startGame,
  get state(){return {running:game.running,yaw:game.yaw,pitch:game.pitch,actors:game.actors.length,canvas:Boolean(game.renderer?.domElement)};}
};
