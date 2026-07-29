function collectPickup(actor,pickup) {
  if(!pickup.active||actor.dead)return;const time=nowMs();let collected=true;
  if(pickup.type==="health"){if(actor.hp>=100)collected=false;else actor.hp=Math.min(100,actor.hp+45);}
  if(pickup.type==="shield"){if(actor.shield>=75)collected=false;else actor.shield=Math.min(75,actor.shield+50);}
  if(pickup.type==="speed")actor.speedUntil=time+10000;
  if(pickup.type==="disguise"){actor.disguiseUntil=time+12000;actor.revealedUntil=0;actor.applyDisguise(true);}
  if(!collected)return;actor.updateBar();pickup.active=false;pickup.root.visible=false;pickup.respawnAt=time+PICKUPS[pickup.type].respawn;
  if(actor.human){flashAction(PICKUPS[pickup.type].label);updateHud();playSound("pickup");}
}
function updatePickups(dt) {
  const time=nowMs();
  for(const pickup of game.pickups){
    if(!pickup.active){if(time>=pickup.respawnAt){pickup.active=true;pickup.root.visible=true;}continue;}
    pickup.root.rotation.y+=dt*1.8;pickup.root.position.y=.18+Math.sin(time/600+pickup.phase)*.13;
    for(const actor of game.actors){if(actor.dead)continue;const dx=actor.group.position.x-pickup.root.position.x,dz=actor.group.position.z-pickup.root.position.z;if(dx*dx+dz*dz<1.35){collectPickup(actor,pickup);break;}}
  }
}

function updateEffects(dt) {
  const time=nowMs();game.effects=game.effects.filter((effect)=>{
    if(effect.type==="particle"){effect.object.position.addScaledVector(effect.velocity,dt);effect.velocity.y-=6.5*dt;effect.object.material.opacity=clamp((effect.until-time)/260,0,1);}
    if(time>=effect.until){removeEffect(effect);return false;}return true;
  });
  for(const item of game.decor){if(item.type==="dust"){item.object.rotation.y+=dt*.025;item.object.position.x=Math.sin(time/4200)*.8;}}
}

function updateHud() {
  const player=game.player;if(!player)return;ui.healthNumber.textContent=Math.max(0,Math.ceil(player.hp));ui.shieldNumber.textContent=Math.max(0,Math.ceil(player.shield));
  ui.healthBar.style.width=`${clamp(player.hp,0,100)}%`;ui.shieldBar.style.width=`${clamp(player.shield/75*100,0,100)}%`;
  ui.ammo.textContent=player.ammo[player.weapon];ui.reserve.textContent=player.reserve[player.weapon];ui.weaponName.textContent=`${WEAPONS[player.weapon].label}${player.reloading?" — RELOADING":""}`;
  $("#mobile-scope").disabled=player.weapon!=="sniper"||player.dead;$("#mobile-switch").textContent=player.weapon==="rifle"?"SNIPER":"RIFLE";
  updateEffectsHud();
}
function updateEffectsHud() {
  const player=game.player;if(!player)return;const time=nowMs(),chips=[];
  if(player.shield>0)chips.push(`<div class="effect-chip shield">SHIELD ${Math.ceil(player.shield)}</div>`);
  if(player.speedUntil>time)chips.push(`<div class="effect-chip speed">SPEED ${Math.ceil((player.speedUntil-time)/1000)}s</div>`);
  if(player.disguiseUntil>time)chips.push(`<div class="effect-chip disguise">DISGUISE ${Math.ceil((player.disguiseUntil-time)/1000)}s</div>`);
  ui.effectsHud.innerHTML=chips.join("");
}
function flashAction(text) { ui.action.textContent=text;clearTimeout(flashAction.timer);flashAction.timer=setTimeout(()=>ui.action.textContent="",700); }
function showDamage() { ui.damage.style.opacity=".82";setTimeout(()=>ui.damage.style.opacity="0",145); }
function addKillFeed(text) { const line=document.createElement("div");line.textContent=text;ui.killFeed.prepend(line);setTimeout(()=>line.remove(),3200); }
function setScoped(enabled) { game.scoped=Boolean(enabled&&game.player&&!game.player.dead&&game.player.weapon==="sniper");ui.scope.style.display=game.scoped?"block":"none";$("#mobile-scope").classList.toggle("active",game.scoped); }

function playSound(type) {
  try{
    if(!game.audio)game.audio=new (window.AudioContext||window.webkitAudioContext)();const context=game.audio,oscillator=context.createOscillator(),gain=context.createGain(),time=context.currentTime;
    const setting={rifle:[145,.03,.075],sniper:[75,.05,.15],hit:[650,.018,.055],jump:[260,.018,.075],roll:[92,.014,.09],reload:[205,.012,.055],pickup:[480,.02,.13]}[type]||[180,.014,.06];
    oscillator.type=type==="hit"||type==="pickup"?"sine":"square";oscillator.frequency.setValueAtTime(setting[0],time);oscillator.frequency.exponentialRampToValueAtTime(Math.max(45,setting[0]*(type==="pickup"?1.5:.55)),time+setting[2]);
    gain.gain.setValueAtTime(setting[1],time);gain.gain.exponentialRampToValueAtTime(.0001,time+setting[2]);oscillator.connect(gain).connect(context.destination);oscillator.start(time);oscillator.stop(time+setting[2]);
  }catch(_error){}
}

function checkRoundEnd() {
  if(game.ending)return;const blue=aliveOn("blue"),red=aliveOn("red");if(blue>0&&red>0)return;
  game.ending=true;setTimeout(()=>finishRound(blue===red?null:blue>0?"blue":"red","Enemy team eliminated."),900);
}
function finishRound(winner,detail) {
  if(!game.running)return;game.running=false;game.ending=false;game.mouseFire=false;game.mobileFire=false;setScoped(false);if(document.exitPointerLock)document.exitPointerLock();
  const won=winner===game.myTeam;ui.resultKicker.textContent=winner?won?"ROUND WON":"ROUND LOST":"ROUND DRAW";ui.resultTitle.textContent=winner?`${winner.toUpperCase()} WINS`:"DRAW";ui.resultTitle.className=winner||"";
  ui.resultDetail.textContent=detail;ui.result.classList.remove("hidden");
}
function updateTimer() {
  const left=Math.max(0,game.endAt-Date.now()),minutes=Math.floor(left/60000),seconds=Math.floor(left/1000)%60;ui.timer.textContent=`0${minutes}:${String(seconds).padStart(2,"0")}`;
  if(left<=0&&!game.ending){
    const blue=aliveOn("blue"),red=aliveOn("red");let winner=null;if(blue!==red)winner=blue>red?"blue":"red";else{
      const bluePower=game.actors.filter((a)=>a.team==="blue"&&!a.dead).reduce((sum,a)=>sum+a.hp+a.shield,0),redPower=game.actors.filter((a)=>a.team==="red"&&!a.dead).reduce((sum,a)=>sum+a.hp+a.shield,0);if(bluePower!==redPower)winner=bluePower>redPower?"blue":"red";
    }
    game.ending=true;finishRound(winner,winner?"Time ran out. More fighters survived.":"Time ran out with equal teams.");
  }
}

function updateMotionActions() {
  const action=game.motion.active,time=nowMs();game.poseMovement={x:0,y:0};
  if(action==="left")game.poseMovement.x=-1;if(action==="right")game.poseMovement.x=1;if(action==="forward")game.poseMovement.y=1;if(action==="back")game.poseMovement.y=-1;
  if(action==="rifle_fire"&&time-game.motion.lastFireAt>Math.max(230,WEAPONS.rifle.rate)){switchWeapon(game.player,"rifle");shoot(game.player);game.motion.lastFireAt=time;}
  if(action==="sniper_fire"&&time-game.motion.lastFireAt>850){switchWeapon(game.player,"sniper");shoot(game.player);game.motion.lastFireAt=time;}
}

function safeFrame(time) {
  if(!game.running)return;
  try{
    const dt=Math.min((time-game.lastFrame)/1000||.016,.04);game.lastFrame=time;
    if(!game.paused){updateMotionActions();updatePlayer(dt);for(const actor of game.actors){if(!actor.human)updateAI(actor,dt);}updatePickups(dt);updateTimer();}
    updateCamera(dt);for(const actor of game.actors)updateActorRig(actor,dt);updateEffects(dt);updateEffectsHud();game.renderer.render(game.scene,game.camera);
    game.frameRequest=requestAnimationFrame(safeFrame);
  }catch(error){
    console.error(error);game.running=false;showFatal(error.stack||error);ui.status.textContent="The round stopped because of a game error. The error is shown below.";ui.hud.style.display="none";ui.menu.style.display="grid";
  }
}

function disposeScene() {
  cancelAnimationFrame(game.frameRequest);game.frameRequest=0;
  for(const actor of game.actors)clearTimeout(actor.reloadTimeout);
  if(game.renderer){game.renderer.domElement.remove();game.renderer.dispose();}
  if(game.scene){game.scene.traverse((object)=>{object.geometry?.dispose?.();if(object.material){const list=Array.isArray(object.material)?object.material:[object.material];for(const material of list){material.map?.dispose?.();material.dispose?.();}}});}
  game.scene=game.camera=game.renderer=game.player=null;game.actors=[];game.obstacles=[];game.worldShootables=[];game.hitboxes=[];game.pickups=[];game.effects=[];game.decor=[];game.shared={};
}

function setupRenderer() {
  game.isLowPower=matchMedia("(pointer:coarse)").matches||(navigator.deviceMemory&&navigator.deviceMemory<=4);
  game.scene=new THREE.Scene();game.camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.08,190);
  game.renderer=new THREE.WebGLRenderer({antialias:!game.isLowPower,powerPreference:"high-performance",alpha:false});game.renderer.setSize(innerWidth,innerHeight);game.renderer.setPixelRatio(game.isLowPower?1:Math.min(devicePixelRatio,1.35));
  game.renderer.shadowMap.enabled=true;game.renderer.shadowMap.type=THREE.PCFSoftShadowMap;game.renderer.outputEncoding=THREE.sRGBEncoding;game.renderer.toneMapping=THREE.ACESFilmicToneMapping;game.renderer.toneMappingExposure=1.02;
  game.renderer.domElement.id="game-canvas";$("#game-root").appendChild(game.renderer.domElement);game.ray=new THREE.Raycaster();game.collisionRay=new THREE.Raycaster();game.shared.sparkGeometry=new THREE.BoxGeometry(.045,.045,.045);
  const theme=THEMES[game.mapName],hemisphere=new THREE.HemisphereLight(theme.sun,0x17101a,1.55);game.scene.add(hemisphere);
  const sun=new THREE.DirectionalLight(theme.sun,2.1);sun.position.set(-22,32,16);sun.castShadow=true;sun.shadow.mapSize.set(game.isLowPower?512:1024,game.isLowPower?512:1024);sun.shadow.camera.left=-38;sun.shadow.camera.right=38;sun.shadow.camera.top=30;sun.shadow.camera.bottom=-30;sun.shadow.camera.near=.5;sun.shadow.camera.far=90;sun.shadow.bias=-.00035;game.scene.add(sun);
  game.renderer.domElement.addEventListener("webglcontextlost",(event)=>{event.preventDefault();game.running=false;showFatal("The graphics chip reset. Reload the page to restart the arena.");},{once:true});
}

async function startGame() {
  ui.start.disabled=true;ui.status.textContent="Building arena…";clearFatal();ui.result.classList.add("hidden");
  try{
    if(!window.THREE)throw new Error("The 3D engine did not load. Refresh the page once.");game.running=false;game.paused=false;game.ending=false;disposeScene();
    game.teamSize=Number(ui.mode.value);game.myTeam=ui.team.value;game.mapName=ui.map.value;game.yaw=game.myTeam==="blue"?-Math.PI/2:Math.PI/2;game.pitch=-.06;game.keys.clear();game.moveStick={x:0,y:0};game.poseMovement={x:0,y:0};game.scoped=false;game.motion.active="neutral";game.motion.candidate="neutral";game.motion.candidateFrames=0;game.motion.lastFireAt=0;
    setupRenderer();buildArena(game.mapName);spawnTeams();bindCanvasControls();game.endAt=Date.now()+150000;game.running=true;game.lastFrame=nowMs();
    updateAlive();updateHud();ui.menu.style.display="none";ui.hud.style.display="block";ui.cameraPanel.style.display=ui.controls.value==="camera"?"block":"none";ui.enableCamera.style.display=game.webcam?"none":"block";ui.objective.textContent="ELIMINATE THE ENEMY TEAM";
    game.frameRequest=requestAnimationFrame(safeFrame);if(matchMedia("(pointer:coarse)").matches){ui.swipeTip.style.opacity="1";setTimeout(()=>ui.swipeTip.style.opacity="0",2800);}ui.status.textContent="Ready.";
  }catch(error){console.error(error);game.running=false;ui.status.textContent=`Could not start: ${error.message||error}`;showFatal(error.stack||error);disposeScene();}
  finally{ui.start.disabled=false;}
}
