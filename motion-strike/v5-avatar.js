function createHealthBar() {
  const group=new THREE.Group();
  const back=new THREE.Mesh(new THREE.PlaneGeometry(1.45,.15),new THREE.MeshBasicMaterial({color:0x160a10,transparent:true,opacity:.9,depthTest:false}));
  const fill=new THREE.Mesh(new THREE.PlaneGeometry(1.37,.09),new THREE.MeshBasicMaterial({color:0x57df7d,depthTest:false}));fill.position.z=.01;
  group.add(back,fill);group.position.y=2.92;group.renderOrder=20;return {group,fill};
}

function createRobloxAvatar(team,index) {
  const root=new THREE.Group(),visual=new THREE.Group();root.add(visual);
  const teamColor=team==="blue"?0x2b91f2:0xf13f61,dark=team==="blue"?0x143967:0x67192a,skin=0xe6b487;
  const shirtMat=makeMaterial(teamColor,{roughness:.48}),darkMat=makeMaterial(dark,{roughness:.5}),skinMat=makeMaterial(skin,{roughness:.82}),shoeMat=makeMaterial(0x1a1f2a,{roughness:.5});

  const torso=makeBox(.9,1.04,.48,teamColor);torso.material=shirtMat;torso.position.y=1.48;
  const shirtPanel=makeBasicBox(.58,.5,.02,team==="blue"?0x9ed7ff:0xffb2c0);shirtPanel.position.set(0,1.48,-.251);
  const waist=makeBox(.72,.25,.43,dark);waist.material=darkMat;waist.position.y=.84;
  const head=makeBox(.68,.68,.68,skin);head.material=skinMat;head.position.y=2.32;
  const hairTop=makeBox(.72,.18,.72,index%2?0x37271d:0x17191f,{roughness:.86});hairTop.position.y=2.68;
  const hairBack=makeBox(.7,.28,.15,index%2?0x37271d:0x17191f,{roughness:.86});hairBack.position.set(0,2.52,.32);
  const eyeL=makeBasicBox(.07,.09,.025,0x18141a),eyeR=eyeL.clone();eyeL.position.set(-.15,2.38,-.352);eyeR.position.set(.15,2.38,-.352);
  const smile=makeBasicBox(.22,.035,.025,0x6c2d36);smile.position.set(0,2.2,-.353);

  const armLPivot=new THREE.Group(),armRPivot=new THREE.Group();armLPivot.position.set(-.57,1.84,0);armRPivot.position.set(.57,1.84,0);
  const armL=makeBox(.28,.78,.29,teamColor);armL.material=shirtMat;armL.position.y=-.37;
  const armR=makeBox(.28,.78,.29,teamColor);armR.material=shirtMat;armR.position.y=-.37;
  const handL=makeBox(.29,.25,.3,skin);handL.material=skinMat;handL.position.y=-.79;
  const handR=makeBox(.29,.25,.3,skin);handR.material=skinMat;handR.position.y=-.79;
  armLPivot.add(armL,handL);armRPivot.add(armR,handR);

  const legLPivot=new THREE.Group(),legRPivot=new THREE.Group();legLPivot.position.set(-.23,.75,0);legRPivot.position.set(.23,.75,0);
  const legL=makeBox(.34,.77,.36,dark);legL.material=darkMat;legL.position.y=-.38;
  const legR=makeBox(.34,.77,.36,dark);legR.material=darkMat;legR.position.y=-.38;
  const shoeL=makeBox(.36,.22,.52,0x1a1f2a);shoeL.material=shoeMat;shoeL.position.set(0,-.82,-.08);
  const shoeR=makeBox(.36,.22,.52,0x1a1f2a);shoeR.material=shoeMat;shoeR.position.set(0,-.82,-.08);
  legLPivot.add(legL,shoeL);legRPivot.add(legR,shoeR);

  const gunPivot=new THREE.Group();gunPivot.position.set(.32,1.68,-.25);
  const gunBody=makeBox(.18,.2,1.18,0x202733,{metalness:.55,roughness:.28});gunBody.position.z=-.48;
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.052,.052,.58,8),makeMaterial(0x10151d,{metalness:.75,roughness:.2}));barrel.rotation.x=Math.PI/2;barrel.position.z=-1.12;
  const stock=makeBox(.28,.29,.35,0x2b3443,{metalness:.25,roughness:.38});stock.position.set(0,-.02,.22);
  const scope=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.46,10),makeMaterial(0x151b24,{metalness:.6,roughness:.25}));scope.rotation.x=Math.PI/2;scope.position.set(0,.15,-.52);scope.visible=false;
  const muzzle=new THREE.Object3D();muzzle.position.set(0,0,-1.44);
  const flash=new THREE.Mesh(new THREE.OctahedronGeometry(.15,0),new THREE.MeshBasicMaterial({color:0xffe09b,transparent:true,opacity:.95}));flash.position.copy(muzzle.position);flash.visible=false;
  gunPivot.add(gunBody,barrel,stock,scope,muzzle,flash);

  visual.add(torso,shirtPanel,waist,head,hairTop,hairBack,eyeL,eyeR,smile,armLPivot,armRPivot,legLPivot,legRPivot,gunPivot);
  const health=createHealthBar();root.add(health.group);
  const hitbox=new THREE.Mesh(new THREE.BoxGeometry(1,2.75,.82),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));
  hitbox.position.y=1.35;hitbox.material.colorWrite=false;root.add(hitbox);
  visual.traverse((object)=>{if(object.isMesh){object.castShadow=!game.isLowPower;object.receiveShadow=true;}});
  return {root,visual,torso,shirtPanel,waist,head,hairTop,armLPivot,armRPivot,legLPivot,legRPivot,gunPivot,gunBody,barrel,scope,muzzle,flash,health:health.group,healthFill:health.fill,hitbox,shirtMat,darkMat,baseTeam:team};
}

class Actor {
  constructor(team,human,index) {
    this.team=team;this.human=human;this.index=index;this.name=human?"YOU":`${team.toUpperCase()} BOT ${index+1}`;
    this.hp=100;this.shield=0;this.dead=false;this.weapon="rifle";this.ammo={rifle:30,sniper:5};this.reserve={rifle:120,sniper:25};
    this.verticalVelocity=0;this.grounded=true;this.lastShot=0;this.reloading=false;this.reloadTimeout=0;
    this.rollStart=0;this.rollUntil=0;this.speedUntil=0;this.disguiseUntil=0;this.revealedUntil=0;
    this.target=null;this.thinkAt=0;this.aiNextShot=0;this.walkPhase=Math.random()*9;this.moveSpeed=0;this.flashUntil=0;this.aimPitch=0;
    this.rig=createRobloxAvatar(team,index);this.group=this.rig.root;this.group.userData.actor=this;this.rig.hitbox.userData.actor=this;
    game.scene.add(this.group);game.actors.push(this);game.hitboxes.push(this.rig.hitbox);
  }
  spawn() {
    const side=this.team==="blue"?-1:1,lane=this.index-(game.teamSize-1)/2;
    this.group.position.set(side*25.5,0,lane*3.4);this.group.rotation.set(0,this.team==="blue"?-Math.PI/2:Math.PI/2,0);
    this.rig.visual.rotation.set(0,0,0);this.rig.visual.position.set(0,0,0);
    this.hp=100;this.shield=0;this.dead=false;this.group.visible=true;this.weapon="rifle";this.ammo={rifle:30,sniper:5};this.reserve={rifle:120,sniper:25};
    this.verticalVelocity=0;this.grounded=true;this.reloading=false;this.rollStart=0;this.rollUntil=0;this.speedUntil=0;this.disguiseUntil=0;this.revealedUntil=0;
    this.updateWeapon();this.applyDisguise(false);this.updateBar();if(this.human)updateHud();
  }
  updateWeapon() {
    const sniper=this.weapon==="sniper";this.rig.gunBody.scale.z=sniper?1.32:1;this.rig.barrel.scale.y=sniper?1.5:1;this.rig.scope.visible=sniper;
  }
  applyDisguise(active) {
    const lookTeam=active?(this.team==="blue"?"red":"blue"):this.team;
    const color=lookTeam==="blue"?0x2b91f2:0xf13f61,dark=lookTeam==="blue"?0x143967:0x67192a;
    this.rig.shirtMat.color.setHex(color);this.rig.darkMat.color.setHex(dark);this.rig.shirtPanel.material.color.setHex(lookTeam==="blue"?0x9ed7ff:0xffb2c0);
  }
  updateBar() {
    const ratio=clamp(this.hp/100,0,1);this.rig.healthFill.scale.x=Math.max(.001,ratio);this.rig.healthFill.position.x=-.685*(1-ratio);
    this.rig.healthFill.material.color.setHex(ratio>.55?0x55e07c:ratio>.25?0xffca5a:0xff526a);
  }
  damage(amount,attacker) {
    if(this.dead)return;
    const rolling=nowMs()<this.rollUntil;if(rolling)amount*=.48;
    const shieldHit=Math.min(this.shield,amount);this.shield-=shieldHit;amount-=shieldHit;this.hp-=amount;this.updateBar();
    if(this.human){updateHud();showDamage();}
    if(this.hp<=0)this.eliminate(attacker);
  }
  eliminate(attacker) {
    if(this.dead)return;this.dead=true;this.hp=0;this.group.visible=false;
    addKillFeed(`${attacker?.human?"YOU":attacker?.name||"ENEMY"} KO'd ${this.human?"YOU":this.name}`);
    updateAlive();checkRoundEnd();
  }
}

function spawnTeams() {
  for(const team of ["blue","red"]){
    for(let i=0;i<game.teamSize;i++){
      const actor=new Actor(team,team===game.myTeam&&i===0,i);if(actor.human)game.player=actor;actor.spawn();
    }
  }
}

function aliveOn(team) { return game.actors.filter((actor)=>actor.team===team&&!actor.dead).length; }
function updateAlive() { ui.blueAlive.textContent=aliveOn("blue");ui.redAlive.textContent=aliveOn("red"); }

function blockedAt(position,actor) {
  if(Math.abs(position.x)>32.75||Math.abs(position.z)>23.75)return true;
  const radius=.48;
  for(const obstacle of game.obstacles){
    const bounds=obstacle.userData.bounds;if(!bounds)continue;
    const overlaps=position.x>bounds.min.x-radius&&position.x<bounds.max.x+radius&&position.z>bounds.min.z-radius&&position.z<bounds.max.z+radius;
    if(overlaps&&position.y<bounds.max.y+.04)return true;
  }
  for(const other of game.actors){
    if(other===actor||other.dead)continue;const dx=position.x-other.group.position.x,dz=position.z-other.group.position.z;
    if(dx*dx+dz*dz<.62)return true;
  }
  return false;
}

function moveActor(actor,direction,speed,dt) {
  actor.moveSpeed=direction.lengthSq()?speed:0;
  if(direction.lengthSq()){
    const step=direction.clone().normalize().multiplyScalar(speed*dt);
    const nextX=actor.group.position.clone();nextX.x+=step.x;if(!blockedAt(nextX,actor))actor.group.position.x=nextX.x;
    const nextZ=actor.group.position.clone();nextZ.z+=step.z;if(!blockedAt(nextZ,actor))actor.group.position.z=nextZ.z;
  }
  actor.verticalVelocity-=21*dt;actor.group.position.y+=actor.verticalVelocity*dt;
  if(actor.group.position.y<=0){actor.group.position.y=0;actor.verticalVelocity=0;actor.grounded=true;}
}
