"use strict";

const MODEL_URL = "https://teachablemachine.withgoogle.com/models/Nh68eUDmN/";
const $ = (selector) => document.querySelector(selector);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const nowMs = () => performance.now();

const ui = {
  menu: $("#menu"), hud: $("#hud"), status: $("#status"), start: $("#start"),
  mode: $("#mode"), map: $("#map"), team: $("#team"), controls: $("#controls"),
  party: $("#party"), generate: $("#generate"),
  blueAlive: $("#blue-alive"), redAlive: $("#red-alive"), timer: $("#timer"),
  objective: $("#round-objective"), healthNumber: $("#health-number"), shieldNumber: $("#shield-number"),
  healthBar: $("#health-bar"), shieldBar: $("#shield-bar"), weaponName: $("#weapon-name"),
  ammo: $("#ammo"), reserve: $("#reserve"), action: $("#action"), hitMarker: $("#hit-marker"),
  damage: $("#damage-vignette"), killFeed: $("#kill-feed"), effectsHud: $("#effects-hud"),
  scope: $("#scope"), spectating: $("#spectating"), swipeTip: $("#swipe-tip"),
  cameraPanel: $("#camera-panel"), enableCamera: $("#enable-camera"), webcam: $("#webcam"),
  prediction: $("#prediction"), motionBars: $("#motion-bars"), threshold: $("#gesture-threshold"),
  thresholdValue: $("#threshold-value"), openMotionLab: $("#open-motion-lab"), motionLab: $("#motion-lab"),
  closeMotionLab: $("#close-motion-lab"), modelClasses: $("#model-classes"),
  calibrationStatus: $("#calibration-status"), clearCalibration: $("#clear-calibration"),
  result: $("#round-result"), resultKicker: $("#result-kicker"), resultTitle: $("#result-title"),
  resultDetail: $("#result-detail"), playAgain: $("#play-again"), backMenu: $("#back-menu"),
  fatal: $("#fatal")
};

const WEAPONS = {
  rifle: { label:"RIFLE", mag:30, reserve:120, damage:17, rate:125, reload:1150, range:105, spread:0.011, tracer:0x77c9ff },
  sniper:{ label:"SNIPER", mag:5, reserve:25, damage:86, rate:850, reload:1850, range:170, spread:0.0015, tracer:0xffd56b }
};

const THEMES = {
  yard:   { skyTop:0x07152f, skyBottom:0x44134e, fog:0x11172b, ground:0x11192b, grid:0x284c78, cover:0x273754, blue:0x2d9dff, red:0xff4368, accent:0x33e2ff, accent2:0xff50b1, sun:0xc4ddff },
  canyon: { skyTop:0x5b241c, skyBottom:0xf3a15b, fog:0x8d5537, ground:0x72442e, grid:0xa66b46, cover:0x5b3427, blue:0x49aaff, red:0xff5849, accent:0xffc166, accent2:0xff704e, sun:0xffe3bb },
  ice:    { skyTop:0x10365f, skyBottom:0xa8dcf6, fog:0x6f9fbd, ground:0x8ab8cc, grid:0xd6f5ff, cover:0x648ba2, blue:0x4db9ff, red:0xff5c8d, accent:0x72f2ff, accent2:0xaf8cff, sun:0xeafcff }
};

const PICKUPS = {
  health:   { label:"HEALTH POTION", color:0xff526f, respawn:14000 },
  shield:   { label:"SHIELD POTION", color:0x4ba8ff, respawn:15000 },
  speed:    { label:"SPEED POTION", color:0x65e88e, respawn:16000 },
  disguise: { label:"DISGUISE", color:0xc177ff, respawn:18000 }
};

const ACTION_NAMES = {
  rifle_fire:"Gun Fire", rifle_reload:"Gun Reload", sniper_fire:"Sniper Fire",
  sniper_reload:"Sniper Reload", jump:"Jump", roll:"Roll", neutral:"Neutral"
};

const game = {
  running:false, paused:false, ending:false, scene:null, camera:null, renderer:null,
  actors:[], obstacles:[], worldShootables:[], hitboxes:[], pickups:[], effects:[], decor:[],
  player:null, keys:new Set(), teamSize:2, myTeam:"blue", mapName:"yard", yaw:-Math.PI/2,
  pitch:-0.06, moveStick:{x:0,y:0}, poseMovement:{x:0,y:0}, lookPointer:null, lookX:0, lookY:0,
  mouseFire:false, mobileFire:false, scoped:false, endAt:0, lastFrame:0, ray:null, collisionRay:null,
  isLowPower:false, shared:{}, audio:null, bound:false, canvasBound:null, frameRequest:0,
  tmModel:null, webcam:null, cameraLoopRunning:false,
  motion:{
    labels:[], smoothed:[], candidate:"neutral", candidateFrames:0, active:"neutral",
    lastActionAt:{}, lastFireAt:0, templates:{}, capture:null, threshold:.86
  }
};

function showFatal(message) {
  ui.fatal.style.display = "block";
  ui.fatal.textContent = String(message);
}
function clearFatal() { ui.fatal.style.display = "none"; ui.fatal.textContent = ""; }
window.addEventListener("error", (event) => showFatal(`Game error: ${event.message}`));
window.addEventListener("unhandledrejection", (event) => showFatal(`Game error: ${event.reason?.message || event.reason}`));

function forwardFromYaw(yaw) {
  return new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
}
function rightFromYaw(yaw) {
  return new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
}
function aimFromAngles(yaw, pitch) {
  const horizontal = Math.cos(pitch);
  return new THREE.Vector3(-Math.sin(yaw) * horizontal, Math.sin(pitch), -Math.cos(yaw) * horizontal).normalize();
}

function makeMaterial(color, options={}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness:options.roughness ?? .68,
    metalness:options.metalness ?? .06,
    emissive:options.emissive ?? 0x000000,
    emissiveIntensity:options.emissiveIntensity ?? 0,
    transparent:options.transparent ?? false,
    opacity:options.opacity ?? 1
  });
}
function makeBox(width,height,depth,color,options={}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width,height,depth), makeMaterial(color,options));
  mesh.castShadow = options.castShadow ?? !game.isLowPower;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}
function makeBasicBox(width,height,depth,color) {
  return new THREE.Mesh(new THREE.BoxGeometry(width,height,depth), new THREE.MeshBasicMaterial({color}));
}

function makeGroundTexture(base,line) {
  const canvas=document.createElement("canvas"); canvas.width=canvas.height=256;
  const context=canvas.getContext("2d");
  context.fillStyle=`#${new THREE.Color(base).getHexString()}`; context.fillRect(0,0,256,256);
  context.strokeStyle=`#${new THREE.Color(line).getHexString()}`; context.globalAlpha=.46; context.lineWidth=2;
  for(let i=0;i<=256;i+=32){context.beginPath();context.moveTo(i,0);context.lineTo(i,256);context.stroke();context.beginPath();context.moveTo(0,i);context.lineTo(256,i);context.stroke();}
  context.globalAlpha=.11;
  for(let i=0;i<220;i++){context.fillStyle=i%2?"#fff":"#000";context.fillRect(Math.random()*256,Math.random()*256,1,1);}
  const texture=new THREE.CanvasTexture(canvas); texture.wrapS=texture.wrapT=THREE.RepeatWrapping; texture.repeat.set(12,9);
  texture.anisotropy=Math.min(4,game.renderer.capabilities.getMaxAnisotropy());
  return texture;
}
