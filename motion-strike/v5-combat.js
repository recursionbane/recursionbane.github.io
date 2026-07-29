function jump(actor) {
  if(!actor||actor.dead||!actor.grounded||game.paused)return;actor.verticalVelocity=8.6;actor.grounded=false;
  if(actor.human){flashAction("JUMP");playSound("jump");}
}
function roll(actor) {
  const time=nowMs();if(!actor||actor.dead||time<actor.rollUntil||game.paused)return;
  actor.rollStart=time;actor.rollUntil=time+560;if(actor.human){flashAction("ROLL");playSound("roll");}
}
function reload(actor) {
  if(!actor||actor.dead||actor.reloading||game.paused)return;const weapon=WEAPONS[actor.weapon];
  if(actor.ammo[actor.weapon]>=weapon.mag||actor.reserve[actor.weapon]<=0)return;
  actor.reloading=true;if(actor.human){flashAction(actor.weapon==="sniper"?"SNIPER RELOAD":"RELOAD");updateHud();playSound("reload");}
  clearTimeout(actor.reloadTimeout);actor.reloadTimeout=setTimeout(()=>{
    if(actor.dead||!game.running)return;const needed=weapon.mag-actor.ammo[actor.weapon],taken=Math.min(needed,actor.reserve[actor.weapon]);
    actor.ammo[actor.weapon]+=taken;actor.reserve[actor.weapon]-=taken;actor.reloading=false;if(actor.human)updateHud();
  },weapon.reload);
}
function switchWeapon(actor,weapon=null) {
  if(!actor||actor.dead)return;const next=weapon||(actor.weapon==="rifle"?"sniper":"rifle");if(next===actor.weapon)return;
  actor.weapon=next;actor.reloading=false;clearTimeout(actor.reloadTimeout);actor.updateWeapon();
  if(actor.human){setScoped(false);flashAction(WEAPONS[next].label);updateHud();}
}

function actorFromObject(object) {
  let node=object;while(node){if(node.userData?.actor)return node.userData.actor;node=node.parent;}return null;
}
function worldPosition(object) { const output=new THREE.Vector3();object.getWorldPosition(output);return output; }

function firstHit(origin,direction,range,enemyTeam) {
  game.ray.set(origin,direction);game.ray.near=0;game.ray.far=range;
  const worldHit=game.ray.intersectObjects(game.worldShootables,true)[0]||null;
  const targetHit=game.ray.intersectObjects(game.hitboxes.filter((hitbox)=>{
    const actor=hitbox.userData.actor;return actor&&!actor.dead&&actor.team===enemyTeam;
  }),false)[0]||null;
  if(worldHit&&targetHit)return worldHit.distance<targetHit.distance?worldHit:targetHit;
  return worldHit||targetHit;
}

function addEffect(effect) {
  game.effects.push(effect);
  while(game.effects.length>60){const old=game.effects.shift();removeEffect(old);}
}
function removeEffect(effect) {
  if(!effect?.object)return;game.scene?.remove(effect.object);
  if(effect.ownsGeometry)effect.object.geometry?.dispose();if(effect.ownsMaterial)effect.object.material?.dispose();
}
function createTracer(start,end,color) {
  const geometry=new THREE.BufferGeometry().setFromPoints([start,end]);const material=new THREE.LineBasicMaterial({color,transparent:true,opacity:.94});
  const line=new THREE.Line(geometry,material);game.scene.add(line);addEffect({type:"tracer",object:line,until:nowMs()+85,ownsGeometry:true,ownsMaterial:true});
}
function createImpact(position,color) {
  const count=game.isLowPower?2:4;
  for(let i=0;i<count;i++){
    const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:1});const particle=new THREE.Mesh(game.shared.sparkGeometry,material);
    particle.position.copy(position);game.scene.add(particle);addEffect({type:"particle",object:particle,velocity:new THREE.Vector3((Math.random()-.5)*2.6,Math.random()*2.1,(Math.random()-.5)*2.6),until:nowMs()+260,ownsGeometry:false,ownsMaterial:true});
  }
}
function showHitMarker() { ui.hitMarker.style.opacity="1";clearTimeout(showHitMarker.timer);showHitMarker.timer=setTimeout(()=>ui.hitMarker.style.opacity="0",90); }

function breakDisguise(actor) {
  if(actor.disguiseUntil<=nowMs())return;actor.disguiseUntil=0;actor.revealedUntil=nowMs()+2500;actor.applyDisguise(false);if(actor.human)flashAction("DISGUISE BROKEN");
}

function shoot(actor) {
  const time=nowMs(),weapon=WEAPONS[actor.weapon];
  if(!game.running||game.paused||actor.dead||actor.reloading||time-actor.lastShot<weapon.rate)return;
  if(actor.ammo[actor.weapon]<=0){reload(actor);return;}
  actor.lastShot=time;actor.ammo[actor.weapon]-=1;actor.flashUntil=time+55;actor.rig.flash.visible=true;if(actor.human)updateHud();
  if(actor.disguiseUntil>time)breakDisguise(actor);
  actor.group.updateMatrixWorld(true);const muzzle=worldPosition(actor.rig.muzzle),enemyTeam=actor.team==="blue"?"red":"blue";
  let direction,aimPoint;
  if(actor.human){
    direction=aimFromAngles(game.yaw,game.pitch);const spread=game.scoped&&actor.weapon==="sniper"?weapon.spread*.18:weapon.spread;
    direction.x+=(Math.random()-.5)*spread;direction.y+=(Math.random()-.5)*spread;direction.z+=(Math.random()-.5)*spread;direction.normalize();
    const cameraHit=firstHit(game.camera.position.clone(),direction,weapon.range,enemyTeam);
    aimPoint=cameraHit?cameraHit.point.clone():game.camera.position.clone().addScaledVector(direction,weapon.range);
  }else{
    if(!actor.target||actor.target.dead)return;aimPoint=actor.target.group.position.clone().add(new THREE.Vector3(0,1.42,0));
    direction=aimPoint.clone().sub(muzzle).normalize();const spread=actor.weapon==="sniper"?.022:.065;
    direction.x+=(Math.random()-.5)*spread;direction.y+=(Math.random()-.5)*spread;direction.z+=(Math.random()-.5)*spread;direction.normalize();
    aimPoint=muzzle.clone().addScaledVector(direction,weapon.range);
  }
  let muzzleDirection=aimPoint.clone().sub(muzzle).normalize(),actorForward=forwardFromYaw(actor.group.rotation.y);
  if(muzzleDirection.dot(actorForward)<.08){muzzleDirection=actorForward.clone();muzzleDirection.y=direction.y;muzzleDirection.normalize();}
  const hit=firstHit(muzzle,muzzleDirection,weapon.range,enemyTeam),end=hit?hit.point.clone():muzzle.clone().addScaledVector(muzzleDirection,weapon.range);
  const victim=hit?actorFromObject(hit.object):null;
  if(victim&&victim.team!==actor.team){victim.damage(weapon.damage,actor);createImpact(end,actor.team==="blue"?0x77c9ff:0xff7187);if(actor.human){showHitMarker();playSound("hit");}}
  else if(hit)createImpact(end,0xffffff);
  createTracer(muzzle,end,weapon.tracer);
  if(actor.human)playSound(actor.weapon);
  if(actor.human)game.pitch=clamp(game.pitch+(actor.weapon==="sniper"?.024:.004),-.58,.58);
}

function visibleToEnemy(observer,candidate) {
  if(candidate.dead||candidate.team===observer.team)return false;const time=nowMs();
  return !(candidate.disguiseUntil>time&&candidate.revealedUntil<time);
}
function hasLineOfSight(actor,target) {
  const start=actor.group.position.clone().add(new THREE.Vector3(0,1.4,0)),end=target.group.position.clone().add(new THREE.Vector3(0,1.4,0));
  const direction=end.clone().sub(start),distance=direction.length();direction.normalize();game.collisionRay.set(start,direction);game.collisionRay.far=distance;
  const hit=game.collisionRay.intersectObjects(game.obstacles,true)[0];return !hit||hit.distance>distance-.55;
}
function updateAI(actor,dt) {
  if(actor.dead)return;const time=nowMs();
  if(time>actor.thinkAt||!actor.target||actor.target.dead||!visibleToEnemy(actor,actor.target)){
    actor.thinkAt=time+430+Math.random()*420;actor.target=game.actors.filter((candidate)=>visibleToEnemy(actor,candidate)).sort((a,b)=>a.group.position.distanceTo(actor.group.position)-b.group.position.distanceTo(actor.group.position))[0]||null;
    if(Math.random()<.045)switchWeapon(actor);
  }
  if(!actor.target){moveActor(actor,new THREE.Vector3(),0,dt);return;}
  const delta=actor.target.group.position.clone().sub(actor.group.position),distance=delta.length();delta.y=0;delta.normalize();
  const strafe=new THREE.Vector3(-delta.z,0,delta.x).multiplyScalar(Math.sin(time/750+actor.index*1.8)*.66),approach=delta.clone().multiplyScalar(distance>14?1:distance<7?-.58:.14);
  let direction=approach.add(strafe).normalize();const probe=actor.group.position.clone().addScaledVector(direction,1.25);if(blockedAt(probe,actor))direction.set(-direction.z,0,direction.x);
  const speed=time<actor.speedUntil?7.1:5.05;moveActor(actor,direction,time<actor.rollUntil?10.2:speed,dt);actor.group.rotation.y=Math.atan2(-direction.x,-direction.z);
  const aimVector=actor.target.group.position.clone().add(new THREE.Vector3(0,1.4,0)).sub(actor.group.position.clone().add(new THREE.Vector3(0,1.5,0)));actor.aimPitch=Math.atan2(aimVector.y,Math.hypot(aimVector.x,aimVector.z));
  if(distance<49&&time>actor.aiNextShot&&hasLineOfSight(actor,actor.target)){
    actor.aiNextShot=time+(actor.weapon==="sniper"?1050+Math.random()*450:310+Math.random()*280);shoot(actor);
  }
  if(actor.ammo[actor.weapon]===0)reload(actor);if(Math.random()<dt*.035)jump(actor);if(Math.random()<dt*.018)roll(actor);
}

function inputDirection() {
  const keyX=(game.keys.has("KeyD")||game.keys.has("ArrowRight")?1:0)-(game.keys.has("KeyA")||game.keys.has("ArrowLeft")?1:0);
  const keyY=(game.keys.has("KeyW")||game.keys.has("ArrowUp")?1:0)-(game.keys.has("KeyS")||game.keys.has("ArrowDown")?1:0);
  return {x:clamp(keyX+game.moveStick.x+game.poseMovement.x,-1,1),y:clamp(keyY+game.moveStick.y+game.poseMovement.y,-1,1)};
}
function updatePlayer(dt) {
  const player=game.player;if(!player||player.dead)return;const input=inputDirection();
  const direction=forwardFromYaw(game.yaw).multiplyScalar(input.y).add(rightFromYaw(game.yaw).multiplyScalar(input.x));if(direction.lengthSq())direction.normalize();
  let speed=nowMs()<player.speedUntil?8.8:6.3;if(nowMs()<player.rollUntil)speed=12.1;moveActor(player,direction,speed,dt);player.group.rotation.y=game.yaw;player.aimPitch=game.pitch;
  if(game.mouseFire||game.mobileFire)shoot(player);
}

function updateActorRig(actor,dt) {
  if(actor.dead)return;actor.walkPhase+=dt*(actor.moveSpeed>0?10:2);const walk=actor.moveSpeed>0?Math.sin(actor.walkPhase)*.62:Math.sin(actor.walkPhase)*.025;
  actor.rig.legLPivot.rotation.x=walk;actor.rig.legRPivot.rotation.x=-walk;actor.rig.armLPivot.rotation.x=-.62-walk*.28;actor.rig.armRPivot.rotation.x=-.72+walk*.2;
  actor.rig.gunPivot.rotation.x=clamp(actor.aimPitch,-.45,.45);
  const time=nowMs();
  if(time<actor.rollUntil){const t=clamp((time-actor.rollStart)/(actor.rollUntil-actor.rollStart),0,1);actor.rig.visual.rotation.x=-Math.sin(Math.PI*t)*Math.PI;actor.rig.visual.position.y=-Math.sin(Math.PI*t)*.19;}
  else{actor.rig.visual.rotation.x*=.68;actor.rig.visual.position.y*=.68;}
  if(time>actor.flashUntil)actor.rig.flash.visible=false;
  if(actor.disguiseUntil>0&&time>=actor.disguiseUntil){actor.disguiseUntil=0;actor.applyDisguise(false);}
  actor.rig.health.quaternion.copy(game.camera.quaternion);
}

function cameraActor() {
  if(game.player&&!game.player.dead)return game.player;
  return game.actors.find((actor)=>actor.team===game.myTeam&&!actor.dead)||game.player;
}
function updateCamera(dt) {
  const focus=cameraActor();if(!focus)return;const target=focus.group.position.clone().add(new THREE.Vector3(0,1.52,0));
  const yaw=focus===game.player?game.yaw:focus.group.rotation.y,pitch=focus===game.player?game.pitch:focus.aimPitch;
  const forward=forwardFromYaw(yaw),right=rightFromYaw(yaw),distance=game.scoped&&focus===game.player?3.1:5.8;
  const desired=target.clone().addScaledVector(forward,-distance).addScaledVector(right,game.scoped?.42:1.05);desired.y+=1.14-pitch*1.25;
  const rayDirection=desired.clone().sub(target),rayDistance=rayDirection.length();rayDirection.normalize();game.collisionRay.set(target,rayDirection);game.collisionRay.far=rayDistance;
  const hit=game.collisionRay.intersectObjects(game.obstacles,true)[0];if(hit)desired.copy(target).addScaledVector(rayDirection,Math.max(.62,hit.distance-.25));
  const blend=1-Math.pow(.001,dt);game.camera.position.lerp(desired,blend);game.camera.lookAt(target.clone().addScaledVector(aimFromAngles(yaw,pitch),18));
  const targetFov=game.scoped&&focus===game.player?35:68;game.camera.fov+=(targetFov-game.camera.fov)*Math.min(1,dt*12);game.camera.updateProjectionMatrix();
  ui.spectating.style.display=game.player?.dead&&aliveOn(game.myTeam)>0?"block":"none";
}
