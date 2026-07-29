bindGlobalControls();setupJoystick();setupMobileButtons();
ui.generate.addEventListener("click",()=>ui.party.value=Math.random().toString(36).slice(2,8).toUpperCase());ui.start.addEventListener("click",startGame);ui.enableCamera.addEventListener("click",enableCamera);
ui.controls.addEventListener("change",()=>{ui.status.textContent=ui.controls.value==="camera"?"Start the round, enable the camera, then use Motion Lab if a pose is wrong.":"Ready.";});
ui.threshold.addEventListener("input",()=>{game.motion.threshold=Number(ui.threshold.value)/100;ui.thresholdValue.textContent=`${ui.threshold.value}%`;});
ui.openMotionLab.addEventListener("click",openMotionLab);ui.closeMotionLab.addEventListener("click",closeMotionLab);document.querySelectorAll("[data-calibrate]").forEach((button)=>button.addEventListener("click",()=>beginCalibration(button.dataset.calibrate)));
ui.clearCalibration.addEventListener("click",()=>{game.motion.templates={};localStorage.removeItem(calibrationKey());updateCalibrationButtons();ui.calibrationStatus.textContent="Calibration reset.";});
ui.playAgain.addEventListener("click",()=>{ui.result.classList.add("hidden");startGame();});ui.backMenu.addEventListener("click",()=>{ui.result.classList.add("hidden");game.running=false;disposeScene();ui.hud.style.display="none";ui.menu.style.display="grid";ui.status.textContent="Ready.";});

window.__motionStrikeDebug={
  start:startGame,
  forwardFromYaw:(yaw)=>({x:-Math.sin(yaw),z:-Math.cos(yaw)}),
  actionFromLabel,
  get state(){return {running:game.running,actors:game.actors.length,blueAlive:aliveOn("blue"),redAlive:aliveOn("red"),yaw:game.yaw,pitch:game.pitch,effects:game.effects.length};}
};
