function bindCanvasControls() {
  const canvas=game.renderer.domElement;game.canvasBound=canvas;
  canvas.addEventListener("pointerdown",(event)=>{
    if(event.pointerType==="touch"){
      if(event.clientX<innerWidth*.35)return;game.lookPointer=event.pointerId;game.lookX=event.clientX;game.lookY=event.clientY;try{canvas.setPointerCapture(event.pointerId);}catch(_error){}event.preventDefault();
    }else if(event.button===0){game.mouseFire=true;if(document.pointerLockElement!==canvas)canvas.requestPointerLock?.();}
    else if(event.button===2)setScoped(true);
  },{passive:false});
  canvas.addEventListener("pointermove",(event)=>{
    if(event.pointerType==="touch"&&event.pointerId===game.lookPointer){const dx=event.clientX-game.lookX,dy=event.clientY-game.lookY;game.lookX=event.clientX;game.lookY=event.clientY;game.yaw+=dx*.006;game.pitch=clamp(game.pitch-dy*.0045,-.58,.58);event.preventDefault();}
  },{passive:false});
  const release=(event)=>{if(event.pointerId===game.lookPointer)game.lookPointer=null;if(event.pointerType!=="touch"&&event.button===0)game.mouseFire=false;if(event.pointerType!=="touch"&&event.button===2)setScoped(false);};
  canvas.addEventListener("pointerup",release);canvas.addEventListener("pointercancel",release);canvas.addEventListener("contextmenu",(event)=>event.preventDefault());
}

function bindGlobalControls() {
  if(game.bound)return;game.bound=true;
  addEventListener("resize",()=>{if(!game.camera||!game.renderer)return;game.camera.aspect=innerWidth/innerHeight;game.camera.updateProjectionMatrix();game.renderer.setSize(innerWidth,innerHeight);});
  addEventListener("keydown",(event)=>{
    game.keys.add(event.code);if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.code))event.preventDefault();if(!game.running||game.paused)return;
    if(event.code==="Space")jump(game.player);if(event.code==="ShiftLeft"||event.code==="ShiftRight")roll(game.player);if(event.code==="KeyR")reload(game.player);if(event.code==="Digit1")switchWeapon(game.player,"rifle");if(event.code==="Digit2")switchWeapon(game.player,"sniper");
  });
  addEventListener("keyup",(event)=>game.keys.delete(event.code));
  addEventListener("mousemove",(event)=>{if(game.running&&!game.paused&&document.pointerLockElement===game.renderer?.domElement){game.yaw+=event.movementX*.0024;game.pitch=clamp(game.pitch-event.movementY*.0021,-.58,.58);}});
  addEventListener("mouseup",(event)=>{if(event.button===0)game.mouseFire=false;if(event.button===2)setScoped(false);});
  addEventListener("blur",()=>{game.keys.clear();game.mouseFire=false;game.mobileFire=false;});
}

function setupJoystick() {
  const zone=$("#joystick"),nub=$("#joystick-nub");let pointer=null;
  const update=(event)=>{const bounds=zone.getBoundingClientRect(),x=clamp(event.clientX-bounds.left-bounds.width/2,-45,45),y=clamp(event.clientY-bounds.top-bounds.height/2,-45,45);nub.style.transform=`translate(${x}px,${y}px)`;game.moveStick={x:x/45,y:-y/45};};
  zone.addEventListener("pointerdown",(event)=>{pointer=event.pointerId;try{zone.setPointerCapture(pointer);}catch(_error){}update(event);event.preventDefault();},{passive:false});
  zone.addEventListener("pointermove",(event)=>{if(event.pointerId===pointer){update(event);event.preventDefault();}},{passive:false});
  const stop=(event)=>{if(event.pointerId!==pointer)return;pointer=null;game.moveStick={x:0,y:0};nub.style.transform="";};zone.addEventListener("pointerup",stop);zone.addEventListener("pointercancel",stop);
}
function holdButton(button,onStart,onEnd) {
  button.addEventListener("pointerdown",(event)=>{try{button.setPointerCapture(event.pointerId);}catch(_error){}onStart();event.preventDefault();},{passive:false});
  button.addEventListener("pointerup",(event)=>{onEnd();event.preventDefault();},{passive:false});button.addEventListener("pointercancel",onEnd);
}
function setupMobileButtons() {
  holdButton($("#mobile-fire"),()=>game.mobileFire=true,()=>game.mobileFire=false);$("#mobile-jump").addEventListener("click",()=>jump(game.player));$("#mobile-roll").addEventListener("click",()=>roll(game.player));$("#mobile-reload").addEventListener("click",()=>reload(game.player));$("#mobile-switch").addEventListener("click",()=>switchWeapon(game.player));$("#mobile-scope").addEventListener("click",()=>setScoped(!game.scoped));
}

function loadScript(source,id) {
  return new Promise((resolve,reject)=>{if(document.getElementById(id))return resolve();const script=document.createElement("script");script.id=id;script.src=source;script.async=true;script.onload=resolve;script.onerror=()=>reject(new Error(`Could not load ${id}`));document.head.appendChild(script);});
}
