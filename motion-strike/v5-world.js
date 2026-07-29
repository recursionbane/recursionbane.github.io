function createSky(theme) {
  const geometry=new THREE.SphereGeometry(130,game.isLowPower?18:28,game.isLowPower?10:16);
  const material=new THREE.ShaderMaterial({
    side:THREE.BackSide, depthWrite:false,
    uniforms:{topColor:{value:new THREE.Color(theme.skyTop)},bottomColor:{value:new THREE.Color(theme.skyBottom)},offset:{value:22},exponent:{value:.7}},
    vertexShader:"varying vec3 vWorldPosition;void main(){vec4 wp=modelMatrix*vec4(position,1.0);vWorldPosition=wp.xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader:"uniform vec3 topColor;uniform vec3 bottomColor;uniform float offset;uniform float exponent;varying vec3 vWorldPosition;void main(){float h=normalize(vWorldPosition+offset).y;gl_FragColor=vec4(mix(bottomColor,topColor,max(pow(max(h,0.0),exponent),0.0)),1.0);}" 
  });
  game.scene.add(new THREE.Mesh(geometry,material));
}

function addObstacle(mesh,x,y,z) {
  mesh.position.set(x,y,z); game.scene.add(mesh); mesh.updateMatrixWorld(true);
  mesh.userData.bounds=new THREE.Box3().setFromObject(mesh);
  game.obstacles.push(mesh); game.worldShootables.push(mesh); return mesh;
}
function addDecor(mesh,x,y,z) { mesh.position.set(x,y,z); game.scene.add(mesh); return mesh; }

function addGlowPanel(x,y,z,width,height,color,rotationY=0) {
  const panel=makeBasicBox(width,height,.08,color); panel.position.set(x,y,z); panel.rotation.y=rotationY; game.scene.add(panel);
  return panel;
}

function createTeamBase(team,x,theme) {
  const color=team==="blue"?theme.blue:theme.red;
  const direction=team==="blue"?1:-1;
  const pad=new THREE.Mesh(new THREE.CylinderGeometry(5.6,5.6,.12,32),makeMaterial(0x192338,{metalness:.18,roughness:.45,emissive:color,emissiveIntensity:.12}));
  pad.position.set(x,.06,0); pad.receiveShadow=true; game.scene.add(pad);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(4.55,.1,8,32),new THREE.MeshBasicMaterial({color}));
  ring.rotation.x=Math.PI/2; ring.position.set(x,.15,0); game.scene.add(ring);
  const rear=x-direction*5.2;
  addObstacle(makeBox(.75,5,.75,0x1c273b,{metalness:.35}),rear,2.5,-4.5);
  addObstacle(makeBox(.75,5,.75,0x1c273b,{metalness:.35}),rear,2.5,4.5);
  addObstacle(makeBox(.75,.75,9.6,0x1c273b,{metalness:.35}),rear,4.65,0);
  addGlowPanel(rear+direction*.42,3.2,0,.08,2.1,color,Math.PI/2);
  const shieldWall=makeBox(.5,2.6,8.4,team==="blue"?0x183c68:0x681d30,{transparent:true,opacity:.82,emissive:color,emissiveIntensity:.16,roughness:.35});
  addObstacle(shieldWall,rear-direction*.25,1.3,0);
}

function addCover(width,height,depth,x,z,color,accent) {
  const cover=addObstacle(makeBox(width,height,depth,color,{metalness:.18,roughness:.55}),x,height/2,z);
  const stripe=makeBasicBox(width*.7,.1,depth*1.012,accent); stripe.position.set(x,height*.62,z); game.scene.add(stripe);
  return cover;
}

function addThemeDecor(name,theme) {
  if(name==="yard"){
    for(const [x,z,c] of [[-29,-20,theme.accent],[-29,20,theme.accent2],[29,-20,theme.accent2],[29,20,theme.accent]]){
      const post=addObstacle(makeBox(.42,5,.42,0x172237,{metalness:.42}),x,2.5,z);
      const glow=makeBasicBox(.15,4.5,.15,c); glow.position.copy(post.position); game.scene.add(glow);
    }
  } else if(name==="canyon"){
    for(const [x,z,s] of [[-30,-19,3.2],[-28,19,4],[30,-19,3.5],[28,19,4.2],[-7,21,2.2],[7,-21,2.4]]){
      const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(s,0),makeMaterial(0x613828,{roughness:.94}));
      rock.rotation.set(Math.random(),Math.random(),Math.random()); rock.scale.y=1.2+Math.random()*.4; addObstacle(rock,x,s*.65,z);
    }
  } else {
    for(const [x,z,s] of [[-30,-19,2.2],[-28,19,2.8],[30,-19,2.4],[28,19,3],[-7,21,1.8],[7,-21,2]]){
      const shard=new THREE.Mesh(new THREE.ConeGeometry(s*.62,s*3,5),makeMaterial(0xaeeaff,{roughness:.25,emissive:0x15506a,emissiveIntensity:.18}));
      shard.rotation.z=(Math.random()-.5)*.2; addObstacle(shard,x,s*1.45,z);
    }
  }
}

function createPickupMesh(type) {
  const def=PICKUPS[type],root=new THREE.Group();
  const pad=new THREE.Mesh(new THREE.TorusGeometry(.72,.055,8,22),new THREE.MeshBasicMaterial({color:def.color,transparent:true,opacity:.72}));
  pad.rotation.x=Math.PI/2; root.add(pad);
  if(type==="disguise"){
    const hood=new THREE.Mesh(new THREE.TorusGeometry(.34,.13,8,18,Math.PI*1.55),makeMaterial(def.color,{emissive:def.color,emissiveIntensity:.28,roughness:.4}));
    hood.rotation.z=Math.PI*.22; hood.position.y=.75; root.add(hood);
    const mask=makeBox(.48,.34,.12,0xead7ff,{emissive:def.color,emissiveIntensity:.12,roughness:.4}); mask.position.set(0,.67,-.08); root.add(mask);
    const eye1=makeBasicBox(.09,.06,.02,0x251535),eye2=eye1.clone(); eye1.position.set(-.13,.7,-.15);eye2.position.set(.13,.7,-.15);root.add(eye1,eye2);
  }else{
    const liquid=new THREE.Mesh(new THREE.CylinderGeometry(.24,.31,.56,12),makeMaterial(def.color,{transparent:true,opacity:.86,emissive:def.color,emissiveIntensity:.28,roughness:.25}));
    liquid.position.y=.55; root.add(liquid);
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(.13,.17,.2,10),makeMaterial(0xe9f5ff,{transparent:true,opacity:.72,roughness:.2})); neck.position.y=.92;root.add(neck);
    const cork=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.13,8),makeMaterial(0x8c5a35,{roughness:.9}));cork.position.y=1.08;root.add(cork);
  }
  return root;
}

function createPickup(type,x,z) {
  const root=createPickupMesh(type); root.position.set(x,.12,z); game.scene.add(root);
  const pickup={type,root,active:true,respawnAt:0,phase:Math.random()*6}; game.pickups.push(pickup); return pickup;
}

function buildArena(name) {
  const theme=THEMES[name]; game.scene.background=new THREE.Color(theme.fog); game.scene.fog=new THREE.FogExp2(theme.fog,game.isLowPower?.011:.0085); createSky(theme);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(66,48),new THREE.MeshStandardMaterial({map:makeGroundTexture(theme.ground,theme.grid),roughness:.86,metalness:name==="yard"?.13:0}));
  ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;game.scene.add(ground);game.worldShootables.push(ground);

  const boundaryColor=theme.cover;
  addObstacle(makeBox(66,3,1,boundaryColor),0,1.5,-24.5); addObstacle(makeBox(66,3,1,boundaryColor),0,1.5,24.5);
  addObstacle(makeBox(1,3,48,boundaryColor),-33.5,1.5,0); addObstacle(makeBox(1,3,48,boundaryColor),33.5,1.5,0);
  createTeamBase("blue",-26,theme); createTeamBase("red",26,theme);

  addCover(8,2.5,5,0,0,theme.cover,theme.accent);
  addCover(3,4.2,7,-10,-8,theme.cover,theme.accent2); addCover(3,4.2,7,10,8,theme.cover,theme.accent2);
  addCover(3,4.2,7,-10,8,theme.cover,theme.accent); addCover(3,4.2,7,10,-8,theme.cover,theme.accent);
  addCover(5.5,2.3,2.6,-19,-13,theme.cover,theme.accent2); addCover(5.5,2.3,2.6,19,13,theme.cover,theme.accent2);
  addCover(5.5,2.3,2.6,-19,13,theme.cover,theme.accent); addCover(5.5,2.3,2.6,19,-13,theme.cover,theme.accent);
  addCover(3.2,3.2,3.2,-4,-17,theme.cover,theme.accent); addCover(3.2,3.2,3.2,4,17,theme.cover,theme.accent2);
  addThemeDecor(name,theme);

  createPickup("health",0,-15); createPickup("shield",0,15); createPickup("speed",-15,0); createPickup("disguise",15,0);
  createPickup("health",-25,-9); createPickup("shield",25,9);

  const dustCount=game.isLowPower?80:170,positions=new Float32Array(dustCount*3);
  for(let i=0;i<dustCount;i++){positions[i*3]=(Math.random()-.5)*68;positions[i*3+1]=Math.random()*13+.4;positions[i*3+2]=(Math.random()-.5)*50;}
  const dustGeometry=new THREE.BufferGeometry();dustGeometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
  const dust=new THREE.Points(dustGeometry,new THREE.PointsMaterial({color:name==="canyon"?0xffd1a0:0xd8f7ff,size:name==="canyon"?.07:.1,transparent:true,opacity:.48,depthWrite:false}));
  game.scene.add(dust);game.decor.push({type:"dust",object:dust});
}
