import * as THREE from 'three';

// Brazos en primera persona (models3d/arms.glb).
// Se dibujan en una escena aparte, encima del mundo, para que no atraviesen paredes.
//
// Acciones exportadas desde Blender (poses estáticas, se mezclan con crossfade):
//   Idle · Reach · Grab                 -> manos libres
//   HoldFlashlight · HoldReach · HoldGrab -> linterna en la mano derecha

const BASE_POS = new THREE.Vector3(0, -0.17, -0.25);
const BASE_ROT = new THREE.Euler(0.2, 0, 0);

export function createViewModel(gltf, envMap) {
  const scene = new THREE.Scene();
  scene.environment = envMap;
  scene.environmentIntensity = 0.15;

  const root = new THREE.Group();   // sigue a la cámara
  const holder = new THREE.Group(); // balanceo / caminar / empujar
  scene.add(root);
  root.add(holder);
  holder.add(gltf.scene);

  // Luz propia de los brazos (relativa a la cámara)
  root.add(new THREE.HemisphereLight(0xc7d6ff, 0x1a1512, 0.3));
  const key = new THREE.PointLight(0xfff1d6, 0.3, 1.5, 2);
  key.position.set(0.1, 0.15, 0.1);
  root.add(key);

  gltf.scene.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false; // el skinning mueve los vértices fuera del bounding box original
      o.castShadow = o.receiveShadow = false;
    }
  });

  const held = gltf.scene.getObjectByName('Held_Flashlight');
  held.visible = false;
  let lensMat;
  held.traverse((o) => { if (o.material?.name === 'FL_Lens') lensMat = o.material; });
  const lensOn = lensMat.emissiveIntensity;

  const mixer = new THREE.AnimationMixer(gltf.scene);
  const actions = Object.fromEntries(gltf.animations.map((c) => [c.name, mixer.clipAction(c)]));
  let current = null;
  function play(name, fade = 0.18) {
    const next = actions[name];
    if (current === next) return;
    next.reset().setEffectiveWeight(1).play();
    if (current) current.crossFadeTo(next, fade, false);
    current = next;
  }
  play('Idle', 0);

  let holding = false;
  let grabT = 0;
  let bobPhase = 0;
  let moveAmt = 0;
  const sway = new THREE.Vector2();
  const tmp = new THREE.Vector3();

  return {
    scene,
    setHolding(v) {
      holding = v;
      held.visible = v;
    },
    setLight(on) {
      lensMat.emissiveIntensity = on ? lensOn : 0.15;
      key.intensity = on ? 0.8 : 0.3;
    },
    grab() {
      grabT = 0.4;
    },
    look(dx, dy) {
      sway.x = THREE.MathUtils.clamp(sway.x - dx * 0.00025, -0.04, 0.04);
      sway.y = THREE.MathUtils.clamp(sway.y + dy * 0.00025, -0.04, 0.04);
    },
    // moving: 0..1 (velocidad relativa), aiming: hay algo interactuable al frente
    update(dt, t, camera, moving, aiming) {
      root.position.copy(camera.position);
      root.quaternion.copy(camera.quaternion);

      grabT = Math.max(0, grabT - dt);
      const pose = grabT > 0 ? 'Grab' : aiming ? 'Reach' : 'Idle';
      play(holding ? (pose === 'Idle' ? 'HoldFlashlight' : 'Hold' + pose) : pose);
      mixer.update(dt);

      moveAmt = THREE.MathUtils.damp(moveAmt, moving, 8, dt);
      bobPhase += dt * (4 + moving * 5);
      sway.multiplyScalar(Math.exp(-dt * 6));

      const push = Math.sin(((0.4 - grabT) / 0.4) * Math.PI);
      tmp.copy(BASE_POS);
      tmp.x += Math.cos(bobPhase) * 0.012 * moveAmt + sway.x;
      tmp.y += Math.abs(Math.sin(bobPhase)) * 0.014 * moveAmt + Math.sin(t * 1.6) * 0.003 + sway.y;
      tmp.z += -push * 0.07 + (aiming ? -0.02 : 0);
      holder.position.lerp(tmp, 1 - Math.exp(-dt * 14));
      holder.rotation.set(BASE_ROT.x + sway.y * 2 - push * 0.15, sway.x * 2, -sway.x * 1.5);
    },
  };
}
