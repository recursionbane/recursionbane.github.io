function normalizeLabel(label) { return String(label).toLowerCase().replace(/[_-]+/g," ").replace(/[^a-z0-9 ]/g,"").replace(/\s+/g," ").trim(); }
function actionFromLabel(label) {
  const text=normalizeLabel(label),has=(word)=>new RegExp(`(^| )${word}( |$)`).test(text);
  if((has("sniper")||has("scope"))&&(has("reload")||has("loading")))return "sniper_reload";
  if((has("sniper")||has("scope"))&&(has("fire")||has("shoot")||has("shot")||has("aim")||text==="sniper"))return "sniper_fire";
  if((has("gun")||has("rifle")||has("pistol"))&&(has("reload")||has("loading")))return "rifle_reload";
  if(has("reload")||has("loading"))return "rifle_reload";
  if(has("gun")||has("rifle")||has("pistol")||has("fire")||has("shoot")||has("shot"))return "rifle_fire";
  if(has("roll")||has("rolling")||has("dodge")||has("somersault")||has("tumble"))return "roll";
  if(has("jump")||has("jumping")||has("hop"))return "jump";
  if(has("left"))return "left";if(has("right"))return "right";if(has("forward")||has("front")||has("up"))return "forward";if(has("back")||has("backward")||has("down"))return "back";
  if(has("neutral")||has("idle")||has("none")||has("nothing")||has("rest")||has("background")||has("normal"))return "neutral";return "neutral";
}
function cosine(a,b) { let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return dot/(Math.sqrt(aa*bb)||1); }
function calibrationKey() { return `motion-strike-calibration:${MODEL_URL}`; }
function loadCalibration() {
  try{const saved=JSON.parse(localStorage.getItem(calibrationKey())||"null");if(saved&&JSON.stringify(saved.labels)===JSON.stringify(game.motion.labels))game.motion.templates=saved.templates||{};else game.motion.templates={};}catch(_error){game.motion.templates={};}updateCalibrationButtons();
}
function saveCalibration() { localStorage.setItem(calibrationKey(),JSON.stringify({labels:game.motion.labels,templates:game.motion.templates}));updateCalibrationButtons(); }
function updateCalibrationButtons() {
  document.querySelectorAll("[data-calibrate]").forEach((button)=>{const action=button.dataset.calibrate,recorded=Boolean(game.motion.templates[action]);button.textContent=`${recorded?"✓ ":""}RECORD ${ACTION_NAMES[action].toUpperCase()}`;});
  const count=Object.keys(game.motion.templates).length;ui.calibrationStatus.textContent=count?`${count} custom pose${count===1?"":"s"} saved.`:"No custom poses recorded yet.";
}
function classifyVector(vector,rawPredictions) {
  const templateEntries=Object.entries(game.motion.templates),templateScores=[];
  for(const [action,template] of templateEntries)templateScores.push({action,score:cosine(vector,template)});templateScores.sort((a,b)=>b.score-a.score);
  if(templateScores.length&&templateScores[0].score>.93&&(templateScores.length===1||templateScores[0].score-templateScores[1].score>.006))return {action:templateScores[0].action,score:templateScores[0].score,calibrated:true};
  const sorted=[...rawPredictions].sort((a,b)=>b.probability-a.probability),top=sorted[0],second=sorted[1];
  if(!top||top.probability<game.motion.threshold||second&&top.probability-second.probability<.09)return {action:"neutral",score:top?.probability||0,calibrated:false};
  return {action:actionFromLabel(top.className),score:top.probability,calibrated:false};
}
function updateMotionBars(predictions) {
  const top=[...predictions].sort((a,b)=>b.probability-a.probability).slice(0,3);ui.motionBars.innerHTML=top.map((item)=>`<div class="motion-row"><span>${item.className.slice(0,10)}</span><span class="motion-meter"><i style="width:${Math.round(item.probability*100)}%"></i></span><b>${Math.round(item.probability*100)}</b></div>`).join("");
}
function commitMotionAction(action) {
  if(action===game.motion.active)return;game.motion.active=action;game.poseMovement={x:0,y:0};const time=nowMs(),last=game.motion.lastActionAt[action]||0;
  if(action==="jump"&&time-last>900){jump(game.player);game.motion.lastActionAt[action]=time;}
  if(action==="roll"&&time-last>1050){roll(game.player);game.motion.lastActionAt[action]=time;}
  if(action==="rifle_reload"&&time-last>900){switchWeapon(game.player,"rifle");reload(game.player);game.motion.lastActionAt[action]=time;}
  if(action==="sniper_reload"&&time-last>1200){switchWeapon(game.player,"sniper");reload(game.player);game.motion.lastActionAt[action]=time;}
  if(action==="rifle_fire"||action==="sniper_fire")game.motion.lastFireAt=0;
}
function processPredictions(predictions) {
  if(!game.motion.labels.length)return;const rawVector=game.motion.labels.map((label)=>predictions.find((prediction)=>prediction.className===label)?.probability||0);
  if(!game.motion.smoothed.length)game.motion.smoothed=rawVector.slice();else for(let i=0;i<rawVector.length;i++)game.motion.smoothed[i]=game.motion.smoothed[i]*.72+rawVector[i]*.28;
  const capture=game.motion.capture,time=nowMs();
  if(capture&&time>=capture.beginAt){for(let i=0;i<rawVector.length;i++)capture.sum[i]+=rawVector[i];capture.count++;ui.calibrationStatus.textContent=`Recording ${ACTION_NAMES[capture.action]}… ${Math.min(100,Math.round(capture.count/24*100))}%`;
    if(capture.count>=24){const average=capture.sum.map((value)=>value/capture.count);game.motion.templates[capture.action]=average;game.motion.capture=null;document.querySelectorAll("[data-calibrate]").forEach((button)=>button.classList.remove("recording"));saveCalibration();ui.calibrationStatus.textContent=`Saved ${ACTION_NAMES[capture.action]}.`;}}
  const result=classifyVector(game.motion.smoothed,predictions);const needed=result.calibrated?3:5;
  if(result.action===game.motion.candidate)game.motion.candidateFrames++;else{game.motion.candidate=result.action;game.motion.candidateFrames=1;}
  if(game.motion.candidateFrames>=needed)commitMotionAction(result.action);
  const top=[...predictions].sort((a,b)=>b.probability-a.probability)[0];ui.prediction.textContent=`Detected: ${ACTION_NAMES[result.action]||result.action} · ${top?top.className:"none"} ${top?Math.round(top.probability*100):0}%${result.calibrated?" · calibrated":""}`;updateMotionBars(predictions);
}

async function enableCamera() {
  ui.enableCamera.disabled=true;ui.prediction.textContent="Loading motion controls…";
  try{
    await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js","tfjs-lib");await loadScript("https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8/dist/teachablemachine-image.min.js","tm-lib");
    if(!window.tmImage)throw new Error("Teachable Machine did not load.");if(!game.tmModel)game.tmModel=await tmImage.load(MODEL_URL+"model.json",MODEL_URL+"metadata.json");
    if(!game.webcam){game.webcam=new tmImage.Webcam(190,143,true);await game.webcam.setup();await game.webcam.play();ui.webcam.replaceChildren(game.webcam.canvas);}
    game.motion.labels=game.tmModel.getClassLabels?game.tmModel.getClassLabels():[];if(!game.motion.labels.length){const sample=await game.tmModel.predict(game.webcam.canvas);game.motion.labels=sample.map((prediction)=>prediction.className);}
    game.motion.smoothed=[];loadCalibration();ui.modelClasses.textContent=`Model classes: ${game.motion.labels.join(" · ")}`;ui.enableCamera.style.display="none";ui.prediction.textContent="Camera ready. Hold gestures steadily.";
    if(!game.cameraLoopRunning){game.cameraLoopRunning=true;cameraLoop();}
  }catch(error){console.error(error);ui.prediction.textContent=`Camera unavailable: ${error.message||error}`;ui.enableCamera.disabled=false;}
}
async function cameraLoop() {
  if(!game.webcam||!game.tmModel){game.cameraLoopRunning=false;return;}
  try{game.webcam.update();const predictions=await game.tmModel.predict(game.webcam.canvas);if(ui.controls.value==="camera")processPredictions(predictions);else game.motion.active="neutral";}
  catch(error){console.error(error);ui.prediction.textContent="Prediction paused. Tap Enable Camera again.";game.cameraLoopRunning=false;return;}
  requestAnimationFrame(cameraLoop);
}
function beginCalibration(action) {
  if(!game.webcam||!game.tmModel){ui.calibrationStatus.textContent="Enable the camera first.";return;}
  game.motion.capture={action,sum:new Array(game.motion.labels.length).fill(0),count:0,beginAt:nowMs()+650};document.querySelectorAll("[data-calibrate]").forEach((button)=>button.classList.toggle("recording",button.dataset.calibrate===action));ui.calibrationStatus.textContent=`Hold ${ACTION_NAMES[action]} now… recording starts in a moment.`;
}
function openMotionLab() {
  const show=()=>{game.paused=true;game.mouseFire=false;game.mobileFire=false;ui.motionLab.classList.remove("hidden");ui.modelClasses.textContent=game.motion.labels.length?`Model classes: ${game.motion.labels.join(" · ")}`:"Enable the camera first.";updateCalibrationButtons();};
  if(!game.tmModel)enableCamera().then(show);else show();
}
function closeMotionLab() { game.motion.capture=null;document.querySelectorAll("[data-calibrate]").forEach((button)=>button.classList.remove("recording"));ui.motionLab.classList.add("hidden");game.paused=false; }
