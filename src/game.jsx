import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { buildWorld } from './world.jsx';
import { createViewModel } from './viewmodel.jsx';
import { createMinimap } from './minimap.jsx';
import armsUrl from '../models3d/arms.glb?url';
import flashlightUrl from '../models3d/flashlight.glb?url';
import mapaUrl from '../models3d/kernelpanic_mapa.glb?url';
import { getUi, setUi } from './store.jsx';

const TIME_LIMIT = 600;
const ROOT_PASSWORD = '1987'; // pista: Nota_Turno (NOC) -> Placa_Fundacion (recepción)
const WRONG_PENALTY = 15;     // segundos que se pierden por contraseña incorrecta

// Crea el juego dentro de `container`. Devuelve las acciones que usa la UI de React
export function createGame(container) {
  const listeners = new AbortController();
  const on = (type, fn) => addEventListener(type, fn, { signal: listeners.signal });

  // --- Render ---
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false; // el composer hace varios renders por cuadro: se cuentan todos (SCRUM-19)
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030304);
  scene.fog = new THREE.FogExp2(0x030304, 0.055);

  // Reflejos sutiles para los metales. Luz ambiente casi nula: sin luz propia, una zona queda negra
  const envMap = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envMap;
  scene.environmentIntensity = 0.02;

  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.03, 80);
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0x8090a8, 0x101010, 0.015));

  let world = null;   // se crea al cargar el mapa de Blender
  let minimap = null; // aparece al recoger el plano

  // --- Linterna: SpotLight con patrón (cookie) y sombras ---
  // Las luces nunca se ocultan (visible = false recompila todos los shaders); se apagan con intensity = 0
  // Haz ancho (~38° de apertura a cada lado) con borde suave; la intensidad se ajusta según la distancia a la pared (ver animate)
  const FLASH_POWER = 40;
  const flashlight = new THREE.SpotLight(0xfff1d6, FLASH_POWER, 24, Math.PI / 4.7, 0.65, 2);
  flashlight.castShadow = true;
  flashlight.shadow.mapSize.set(1024, 1024);
  flashlight.shadow.camera.near = 0.1;
  flashlight.shadow.bias = -0.0002;
  flashlight.shadow.normalBias = 0.02;
  // Empieza apagada: no actualiza su sombra cada cuadro, pero la calcula UNA vez. Sin ningún cálculo su
  // matriz de sombra queda en ceros y el patrón (map) del SpotLight da NaN: con bloom, la pantalla queda negra
  flashlight.shadow.autoUpdate = false;
  flashlight.shadow.needsUpdate = true;
  scene.add(flashlight, flashlight.target);

  // --- Postprocesado: bloom para LEDs/pantallas + viñeta, grano y aberración cromática ---
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.addPass(new RenderPass(scene, camera));
  // Resaltado del objeto interactivo al que se apunta (SCRUM-13)
  const outline = new OutlinePass(new THREE.Vector2(innerWidth, innerHeight), scene, camera);
  outline.edgeStrength = 6;
  outline.edgeGlow = 0.6;
  outline.edgeThickness = 1.5;
  outline.pulsePeriod = 2;
  outline.visibleEdgeColor.set(0xfb923c);
  outline.hiddenEdgeColor.set(0xa8561c); // objetos apoyados sobre otros también se notan
  // Umbral alto: solo brillan pantallas, LEDs y lámparas, no las paredes iluminadas (eso lavaba la imagen)
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.25, 1.2);
  const fx = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, time: { value: 0 }, danger: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float time; uniform float danger; varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 d = vUv - 0.5;
        float ca = 0.002 + danger * 0.006;
        vec3 col = vec3(texture2D(tDiffuse, vUv + d * ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * ca).b);
        col *= mix(0.25, 1.0, smoothstep(0.85, 0.3, length(d * vec2(1.2, 1.0))));
        col += (hash(vUv * 731.0 + fract(time)) - 0.5) * 0.05;
        float pulse = danger * (0.5 + 0.5 * sin(time * 5.0));
        col = mix(col, col * vec3(1.3, 0.6, 0.6) + vec3(0.04, 0.0, 0.0), pulse * 0.5);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  // --- UI: el juego escribe en el store y React la dibuja ---
  let msgTimeout;
  function say(text, ms = 3500) {
    setUi({ message: text, messageVisible: true });
    clearTimeout(msgTimeout);
    msgTimeout = setTimeout(() => setUi({ messageVisible: false }), ms);
  }
  function objective(text) {
    setUi({ objective: text });
  }
  // Inventario (SCRUM-16)
  const hasItem = (id) => getUi().inventory.includes(id);
  function give(id) {
    if (!hasItem(id)) setUi({ inventory: [...getUi().inventory, id], newItem: id });
  }
  // Los objetos que ya cumplieron su función salen del inventario (la nota al abrir el panel, la tarjeta al abrir la puerta)
  function takeItem(id) {
    setUi({ inventory: getUi().inventory.filter((i) => i !== id) });
  }

  // --- Estado del juego ---
  let state = 'loading'; // loading | ready | playing | terminal | rebooting | won | lost
  let timeLeft = TIME_LIMIT;
  let flashlightOn = false;
  let warming = true;          // compilando shaders: el bucle no dibuja todavía
  let flashScale = 1;         // atenuación de la linterna cuando la pared está cerca
  let darkWarned = false;      // ya se avisó "demasiado oscuro" en esta visita a la zona
  let vm;

  function setOverlay(title, text, button, restart = false) {
    setUi({ overlayOpen: true, overlayTitle: title, overlayText: text, overlayButton: button, overlayRestart: restart });
  }
  function endGame(won) {
    state = won ? 'won' : 'lost';
    const used = TIME_LIMIT - Math.ceil(timeLeft);
    const mm = String(Math.floor(used / 60)).padStart(2, '0');
    const ss = String(used % 60).padStart(2, '0');
    setUi({ termOpen: false, invOpen: false, overlayResult: won ? 'won' : 'lost' });
    controls.unlock();
    setOverlay(
      won ? 'SISTEMA RESTAURADO' : 'KERNEL PANIC',
      won ? `Escapaste en ${mm}:${ss}` : 'Se acabó el tiempo: los datos se perdieron',
      won ? 'Jugar de nuevo' : 'Reintentar'
    );
  }

  // --- Controles ---
  const controls = new PointerLockControls(camera, document.body);
  function clickOverlay() {
    if (state === 'won' || state === 'lost') return location.reload();
    if (state !== 'loading') controls.lock();
  }
  controls.addEventListener('lock', () => {
    setUi({ overlayOpen: false });
    if (state === 'ready') {
      state = 'playing';
      objective('Encuentra una fuente de luz');
    }
  });
  controls.addEventListener('unlock', () => {
    if (state === 'playing' || state === 'rebooting') setOverlay('PAUSA', 'El tiempo está detenido', 'Continuar', true);
  });

  const keys = {};
  on('keydown', (e) => {
    if (state === 'terminal') {
      if (e.code === 'Escape') closeTerminal(false);
      return;
    }
    keys[e.code] = true;
    if ((e.code === 'Tab' || e.code === 'KeyI') && state === 'playing') {
      e.preventDefault();
      setUi({ invOpen: !getUi().invOpen });
    }
    if (e.code === 'KeyM' && minimap) setUi({ mapBig: !getUi().mapBig });
    if (e.code === 'KeyF' && hasItem('flashlight') && controls.isLocked) setFlashlight(!flashlightOn);
  });
  on('keyup', (e) => (keys[e.code] = false));
  on('mousemove', (e) => {
    if (controls.isLocked && vm) vm.look(e.movementX, e.movementY);
  });
  function setFlashlight(on) {
    flashlightOn = on;
    flashlight.shadow.autoUpdate = on; // apagada no gasta un render de sombras por cuadro (castShadow no cambia: no recompila)
    vm.setLight(on);
  }

  // --- Interacción: apuntar con la mira + clic ---
  const interactables = [];
  // hitRadius: esfera invisible para que objetos pequeños sean fáciles de apuntar
  function interactable(object, label, use, { range = 2.2, hitRadius = 0 } = {}) {
    object.userData.interact = { label, use, range };
    if (hitRadius) {
      const proxy = new THREE.Mesh(new THREE.SphereGeometry(hitRadius, 8, 6));
      proxy.visible = false; // el Raycaster sí la detecta; OutlinePass la respeta como invisible
      object.add(proxy);
    }
    interactables.push(object);
  }
  function removeInteractable(object) {
    interactables.splice(interactables.indexOf(object), 1);
  }
  const raycaster = new THREE.Raycaster();
  const CENTER = new THREE.Vector2();
  // Devuelve el objeto interactivo bajo la mira (o null)
  function findTarget() {
    camera.updateMatrixWorld();
    raycaster.setFromCamera(CENTER, camera);
    raycaster.far = 3;
    const hit = raycaster.intersectObjects(interactables, true)[0];
    if (!hit) return null;
    // Que no haya una pared antes (se consulta el mapa de alturas: más barato que los triángulos del mapa)
    if (world.rayBlocked(raycaster.ray, hit.distance - 0.2)) return null;
    // En zona oscura solo se ve (y se resalta) lo que alumbra la linterna; el haz sigue a la mira
    if (!flashlightOn && world.isDark(hit.point)) return null;
    for (let o = hit.object; o; o = o.parent) {
      const it = o.userData.interact;
      if (it) return hit.distance <= it.range ? o : null;
    }
    return null;
  }
  let target = null;
  on('mousedown', () => {
    if (!controls.isLocked || state !== 'playing' || !target) return;
    vm.grab();
    target.userData.interact.use();
  });

  // --- Puzzle 1 (SCRUM-15): terminal con contraseña ---
  function openTerminal() {
    state = 'terminal';
    controls.unlock();
    setUi({
      invOpen: false,
      termOpen: true,
      termUnlocked: false,
      termLog: 'NOC: KERNEL PANIC\npanel de seguridad: CERRADO\n\nIngrese el código para abrir el panel de la tarjeta de acceso.\n',
    });
  }
  function closeTerminal(relock = true) {
    setUi({ termOpen: false });
    state = 'playing';
    setOverlay('PAUSA', 'El tiempo está detenido', 'Continuar', true);
    if (relock) controls.lock(); // si el navegador lo permite, la pausa se oculta de inmediato
  }
  function submitPassword(value) {
    const attempt = value.toUpperCase().replace(/[\s-]/g, '');
    if (!attempt) return;
    if (attempt === ROOT_PASSWORD) {
      setUi({
        termUnlocked: true,
        termLog: `${getUi().termLog}\n> ****\nACCESO CONCEDIDO\nPanel de seguridad abierto: retire la tarjeta de acceso.\n\nLOG técnico: "perdí el plano de planta\nen el fondo del laberinto de racks"\n`,
      });
      world.panel.open();
      takeItem('note'); // la pista ya se usó
      interactable(world.panel.card, 'Recoger tarjeta de acceso', () => {
        world.panel.card.removeFromParent();
        removeInteractable(world.panel.card);
        give('tarjeta');
        say('Tarjeta de acceso: úsala en la puerta de la sala de racks');
        objective('Usa la tarjeta en la puerta del NOC a la sala de racks');
      }, { hitRadius: 0.12 });
      world.setScreen(world.get('Pantalla_Terminal'), world.termText(['root@noc:~#', '', 'ACCESO CONCEDIDO', '', 'panel de seguridad: ABIERTO', '', '> retire la tarjeta de acceso']));
      say('Acceso concedido');
      objective('Recoge la tarjeta de acceso del panel');
      return;
    }
    timeLeft = Math.max(1, timeLeft - WRONG_PENALTY);
    setUi({ termLog: `${getUi().termLog}\n> ${'*'.repeat(attempt.length)}\nACCESO DENEGADO (-${WRONG_PENALTY} s)\n` });
  }

  // --- Carga de modelos de Blender ---
  const loader = new GLTFLoader();
  Promise.all([armsUrl, flashlightUrl, mapaUrl].map((u) => loader.loadAsync(u))).then(async ([arms, fl, mapa]) => {
    if (listeners.signal.aborted) return; // el componente se desmontó mientras cargaba
    world = buildWorld(scene, mapa);
    flashlight.map = world.textures.cookie;
    camera.position.copy(world.anchors.spawn);
    camera.rotation.set(0, world.anchors.spawnYaw, 0, 'YXZ');

    vm = createViewModel(arms, envMap);
    composer.addPass(outline);
    const vmPass = new RenderPass(vm.scene, camera);
    vmPass.clear = false;     // conserva el color del mundo...
    vmPass.clearDepth = true; // ...pero los brazos siempre quedan encima
    composer.addPass(vmPass);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composer.addPass(fx);

    // Linterna sobre la mesita de recepción (vacío Spawn_Linterna del mapa)
    const flPickup = fl.scene;
    flPickup.position.copy(world.anchors.flashlight);
    flPickup.rotation.y = 0.9;
    flPickup.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    scene.add(flPickup);
    interactable(flPickup, 'Recoger linterna', () => {
      scene.remove(flPickup);
      removeInteractable(flPickup);
      world.refreshShadows();
      give('flashlight');
      vm.setHolding(true);
      say('Encontraste una linterna. Presiona F para encenderla');
      objective('Encuentra la terminal del NOC');
    }, { hitRadius: 0.14 });

    // --- Puzzle 1: Nota_Turno (NOC) -> Placa_Fundacion (recepción) -> Pantalla_Terminal ---
    const nota = world.get('Nota_Turno');
    interactable(nota, 'Recoger nota', () => {
      nota.removeFromParent();
      removeInteractable(nota);
      give('note');
      say(`"${nota.userData.texto}" Revísala con TAB`, 5000);
      objective('Busca la placa de recepción');
    }, { hitRadius: 0.15 });

    const placa = world.get('Placa_Fundacion');
    interactable(placa, 'Leer placa', () => {
      say(`Placa: "${placa.userData.texto}"`, 4500);
      if (hasItem('note') && !world.panel.opened) objective('Ingresa el código en la terminal del NOC');
    });

    interactable(world.get('Pantalla_Terminal'), 'Usar terminal', () => {
      if (world.panel.opened) return say('El panel de seguridad ya está abierto');
      if (!hasItem('note')) objective('Encuentra el código de la terminal');
      openTerminal();
    });

    // --- Puertas: las libres se abren con clic; las bloqueadas explican qué falta ---
    // La de la sala de racks se abre USANDO la tarjeta de acceso del inventario (SCRUM-16: usar un objeto en el lugar correcto).
    // Después no tiene más usos, así que sale del inventario.
    const REQUIRES = { Puerta_NOC_Racks: 'tarjeta' };
    const LOCKED_MSG = {
      Puerta_NOC_Racks: 'BLOQUEADA: requiere la tarjeta de acceso (está en el panel junto a la terminal)',
      Puerta_Racks_Bodega: 'BLOQUEADA: no hay energía en esta puerta',
      Puerta_Blindada: 'Puerta blindada: tiene 3 cerraduras',
    };
    for (const door of world.doors) {
      interactable(door.object, door.final ? 'Revisar puerta blindada' : REQUIRES[door.name] ? 'Usar tarjeta de acceso' : 'Abrir puerta', () => {
        const item = REQUIRES[door.name];
        if (item && hasItem(item)) {
          world.openDoor(door);
          removeInteractable(door.object);
          takeItem(item);
          say('Usaste la tarjeta de acceso: puerta desbloqueada');
          objective('Explora la sala de racks (está a oscuras)');
          return;
        }
        if (door.locked) return say(LOCKED_MSG[door.name] ?? 'Bloqueada');
        world.openDoor(door);
        removeInteractable(door.object);
      });
    }

    // La linterna no usa batería: las pilas que trae el mapa de Blender se quitan de la escena
    const pilasEnMapa = [];
    mapa.scene.traverse((o) => { if (o.userData.tipo === 'pilas') pilasEnMapa.push(o); });
    pilasEnMapa.forEach((p) => p.removeFromParent());
    world.refreshShadows();

    // --- Plano escondido: al recogerlo aparece el minimapa en la esquina ---
    interactable(world.plano, 'Recoger plano', () => {
      world.plano.removeFromParent();
      removeInteractable(world.plano);
      // El plano no ocupa espacio en el inventario: se "usa" al instante como minimapa
      minimap = createMinimap(world);
      setUi({ hasMap: true });
      say('Plano de planta: ahora ves el mapa en la esquina. [M] para ampliarlo', 5000);
      objective('Explora la instalación');
    }, { hitRadius: 0.3 });

    // --- Precalentado: compilar todos los shaders antes de "Comenzar" ---
    // WebGL compila cada material la primera vez que se dibuja; con 16 luces y sombras eso congelaba
    // los primeros segundos de juego. Se compila todo aquí, con la pantalla de carga todavía visible:
    // mundo, brazos con la linterna en la mano, contorno de resaltado y postprocesado.
    setUi({ overlayText: 'Preparando gráficos...' });
    vm.setHolding(true);
    outline.selectedObjects = [flPickup];
    try {
      await Promise.all([renderer.compileAsync(scene, camera), renderer.compileAsync(vm.scene, camera)]);
    } catch (err) {
      console.warn('Precompilación de shaders incompleta', err); // el juego igual compila al dibujar
    }
    if (listeners.signal.aborted) return;
    composer.render(0); // primer cuadro: termina de enlazar los programas y llena los mapas de sombra
    outline.selectedObjects = [];
    vm.setHolding(false);
    warming = false;

    state = 'ready';
    setUi({ overlayText: 'Tienes 10 minutos para escapar del datacenter', overlayButton: 'Comenzar' });
    if (import.meta.env.DEV) devShot();
  });

  // Solo en desarrollo: ?cam=x,y,z,yaw,pitch&give=flashlight,note,plano&open=1 para revisar escenas sin jugar
  function devShot() {
    const q = new URLSearchParams(location.search);
    if (!q.has('cam')) return;
    const [x, y, z, yaw, pitch] = q.get('cam').split(',').map(Number);
    camera.position.set(x, y, z);
    camera.rotation.set(THREE.MathUtils.degToRad(pitch || 0), THREE.MathUtils.degToRad(yaw || 0), 0, 'YXZ');
    for (const id of (q.get('give') || '').split(',').filter(Boolean)) {
      if (id !== 'plano') give(id);
      if (id === 'flashlight') {
        vm.setHolding(true);
        if (q.get('flash') !== '0') setFlashlight(true);
      }
      if (id === 'plano') {
        minimap = createMinimap(world);
        setUi({ hasMap: true, mapBig: q.has('big') });
      }
    }
    if (q.has('open')) world.doors.filter((d) => !d.final).forEach(world.openDoor);
    if (q.has('panel')) world.panel.open();
    if (q.has('t')) timeLeft = Number(q.get('t'));
    setUi({ overlayOpen: false, invOpen: q.has('inv') });
    state = 'playing';
    if (q.has('term')) openTerminal();
  }

  // --- Movimiento con colisiones (por eje, para deslizar en paredes) ---
  const RADIUS = 0.3;
  const EYE = 1.7;
  function tryMove(fn) {
    const old = camera.position.clone();
    fn();
    if (world.collides(camera.position, RADIUS)) camera.position.copy(old);
  }

  const timer = new THREE.Timer();
  const camDir = new THREE.Vector3();
  let bob = 0;
  let raf;
  function animate(now) {
    raf = requestAnimationFrame(animate);
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.05);
    const t = timer.getElapsed();
    if (!world || warming) return; // todavía cargando el mapa o compilando shaders
    world.update(dt, t);

    let moving = 0;
    if (controls.isLocked && state === 'playing') {
      const sprint = keys.ShiftLeft || keys.ShiftRight;
      const speed = (sprint ? 4.6 : 2.8) * dt;
      const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
      const r = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
      const k = f && r ? Math.SQRT1_2 : 1;
      if (f) tryMove(() => controls.moveForward(f * speed * k));
      if (r) tryMove(() => controls.moveRight(r * speed * k));
      if (f || r) moving = sprint ? 1 : 0.6;
    }
    if (state === 'terminal' || (controls.isLocked && (state === 'playing' || state === 'rebooting'))) {
      timeLeft = Math.max(0, timeLeft - dt);
      const s = Math.ceil(timeLeft);
      setUi({ time: `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, timerAlert: timeLeft < 120 });
      if (timeLeft <= 0 && (state === 'playing' || state === 'terminal')) endGame(false);
    }
    // Balanceo de cabeza al caminar
    bob += dt * (moving ? 7 + moving * 4 : 0);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, EYE + (moving ? Math.sin(bob * 2) * 0.035 : 0), 12, dt);

    // Aviso al entrar a una zona oscura sin luz (SCRUM-17)
    if (state === 'playing' && controls.isLocked) {
      const dark = world.isDark(camera.position) && !flashlightOn;
      if (dark && !darkWarned) say('Está demasiado oscuro para ver', 3000);
      darkWarned = dark;
    }
    world.setAlert(state !== 'won' && timeLeft < 120);

    if (vm) {
      target = state === 'playing' ? findTarget() : null;
      setUi({ hint: target ? `[clic] ${target.userData.interact.label}` : '', aiming: !!target });
      outline.selectedObjects = target ? [target] : [];
      vm.update(dt, t, camera, moving, !!target);
    }
    if (minimap) {
      const canvas = document.getElementById('minimap');
      if (canvas) minimap.draw(canvas, camera);
      setUi({ zone: world.zoneAt(camera.position)?.name ?? '' });
    }

    // La linterna sale desde la mano derecha y apunta a la mira
    camera.getWorldDirection(camDir);
    flashlight.position.set(0.16, -0.14, -0.1).applyQuaternion(camera.quaternion).add(camera.position);
    flashlight.target.position.copy(camera.position).addScaledVector(camDir, 8);
    // Con decaimiento físico (1/d²) una pared a 40 cm recibe ~25 veces más luz que una a 2 m y encandila.
    // Se mide la distancia a lo que hay delante y se atenúa: de cerca el brillo queda como a ~1.8 m.
    // Se mide aunque esté apagada (es barato) para que al encenderla frente a una pared no destelle
    raycaster.set(camera.position, camDir);
    const near = world.rayDistance(raycaster.ray, 2);
    const want = THREE.MathUtils.clamp((Math.max(near - 0.1, 0.05) / 1.8) ** 2, 0.02, 1); // la luz sale 10 cm por delante de la cámara
    // Baja de golpe al acercarse (sin destello) y sube suave al alejarse
    flashScale = want < flashScale || !flashlightOn ? want : THREE.MathUtils.damp(flashScale, want, 8, dt);
    flashlight.intensity = flashlightOn ? FLASH_POWER * flashScale * (0.97 + Math.random() * 0.03) : 0;

    fx.uniforms.time.value = t;
    fx.uniforms.danger.value = timeLeft < 120 ? 1 - timeLeft / 120 : 0;
    renderer.info.reset();
    if (composer.passes.length > 1) composer.render(dt);
    frameStats.calls = renderer.info.render.calls;
    frameStats.triangles = renderer.info.render.triangles;
  }
  const frameStats = { calls: 0, triangles: 0 };
  animate();

  on('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  });

  return {
    clickOverlay,
    submitPassword,
    closeTerminal,
    // Números para el panel de depuración (SCRUM-19)
    stats: () => ({
      ...frameStats,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      lights: world ? scene.children.filter((o) => o.isLight).length : 0,
    }),
    dispose() {
      listeners.abort();
      cancelAnimationFrame(raf);
      clearTimeout(msgTimeout);
      controls.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
