import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeTextures, makePanel, normalMapFrom, roughnessMapFrom, brushedMetal } from './textures.jsx';

// Mundo construido desde models3d/kernelpanic_mapa.glb (Blender).
// Todo lo que el juego necesita sale de los nombres y userData (extras de glTF) del mapa:
//   colision: true   -> cajas de colisión        Puerta_*        -> puertas corredizas
//   LP_*             -> dónde poner las luces     Luminarias_<Zona> -> lámparas emisivas por zona
//   Piso_<Zona>      -> límites de cada zona (minimapa y zona actual)

// Iluminación por zona: entre más lejos del inicio, más oscuro.
//   n: luces reales (agrupando los vacíos LP_*), cd: intensidad (candelas), d: alcance (m), lum: brillo de las lámparas
//   sombras: luces de techo que proyectan sombras (SCRUM-23, zona iluminada)
//   oscura: sin la linterna no se distingue nada y no se resaltan los objetos (SCRUM-17 y SCRUM-23)
const ZONE_LIGHT = {
  Recepcion:    { n: 2, cd: 35, d: 18, lum: 0.35, sombras: true },
  Pasillo:      { n: 1, cd: 5, d: 9, lum: 0.5, fx: 'parpadeo' }, // límite entre la zona iluminada y la oscura
  NOC:          { n: 1, cd: 4, d: 10, lum: 0.3 },
  SalaRacks:    { n: 0, lum: 0, oscura: true },   // solo LEDs y balizas de alerta
  Enfriamiento: { n: 0, lum: 0, oscura: true },
  Electrico:    { n: 1, cd: 1.5, d: 6, lum: 0.2, fx: 'emergencia', oscura: true },
  Bodega:       { n: 1, cd: 2, d: 7, lum: 0.3, fx: 'falla', oscura: true },
  Boveda:       { n: 2, cd: 5, d: 16, lum: 0.4 },
};
const ALERT_COLOR = new THREE.Color(0xff2a1a);
// Luces puntuales extra (vacíos LP_* sin zona)
const EXTRA_LIGHT = {
  LP_Luz_Terminal: { cd: 1.5, d: 3 },
  LP_Luz_VideoWall: { cd: 3, d: 6 },
  LP_Luz_Tablero: { cd: 0.8, d: 3 },
  LP_Luz_Salida: { cd: 3, d: 5 },
};
export const ZONE_NAMES = {
  Recepcion: 'Recepción', Pasillo: 'Pasillo', NOC: 'NOC', SalaRacks: 'Sala de racks',
  Enfriamiento: 'Enfriamiento', Electrico: 'Cuarto eléctrico', Bodega: 'Bodega', Boveda: 'Bóveda',
};
// Escondite del plano: el callejón sin salida más profundo del laberinto de racks (celda 17,5 de mapa_layout.py)
const PLANO_POS = new THREE.Vector3(35, 0.012, -28.7);

// --- Colisión con mapa de alturas ---
// Vista desde arriba en celdas de 10 cm: cada celda guarda la altura del obstáculo más alto que la toca.
// Se rasteriza desde los triángulos reales, así que respeta formas en L, esquinas y huecos
// (una caja por objeto taparía el espacio vacío de un mostrador en L con un muro invisible).
const CELL = 0.1;
const STEP = 0.2;     // obstáculos más bajos que esto no bloquean (zócalos, franjas del piso)
const HEADROOM = 1.9; // lo que empieza por encima de la cabeza no bloquea

function buildHeightmap(meshes, bounds) {
  const x0 = bounds.min.x - 1, z0 = bounds.min.z - 1;
  const w = Math.ceil((bounds.max.x - bounds.min.x + 2) / CELL);
  const d = Math.ceil((bounds.max.z - bounds.min.z + 2) / CELL);
  const h = new Float32Array(w * d);
  const mark = (x, z, y) => {
    const i = Math.floor((x - x0) / CELL), j = Math.floor((z - z0) / CELL);
    if (i < 0 || j < 0 || i >= w || j >= d) return;
    const k = j * w + i;
    if (y > h[k]) h[k] = y;
  };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const side = (p, q, x, z) => (q.x - p.x) * (z - p.z) - (q.z - p.z) * (x - p.x);
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const pos = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;
    const count = index ? index.count : pos.count;
    for (let t = 0; t < count; t += 3) {
      a.fromBufferAttribute(pos, index ? index.getX(t) : t).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(pos, index ? index.getX(t + 1) : t + 1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(pos, index ? index.getX(t + 2) : t + 2).applyMatrix4(mesh.matrixWorld);
      const top = Math.max(a.y, b.y, c.y);
      if (top < STEP || Math.min(a.y, b.y, c.y) > HEADROOM) continue;
      // Bordes (las caras verticales de paredes se proyectan como líneas)
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const steps = Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / (CELL * 0.5)) + 1;
        for (let s = 0; s <= steps; s++) mark(p.x + ((q.x - p.x) * s) / steps, p.z + ((q.z - p.z) * s) / steps, top);
      }
      // Interior (caras horizontales: superficies de mesas, estantes, etc.)
      const area = side(a, b, c.x, c.z);
      if (Math.abs(area) < 1e-6) continue;
      const minI = Math.floor((Math.min(a.x, b.x, c.x) - x0) / CELL), maxI = Math.floor((Math.max(a.x, b.x, c.x) - x0) / CELL);
      const minJ = Math.floor((Math.min(a.z, b.z, c.z) - z0) / CELL), maxJ = Math.floor((Math.max(a.z, b.z, c.z) - z0) / CELL);
      for (let j = minJ; j <= maxJ; j++) {
        for (let i = minI; i <= maxI; i++) {
          const x = x0 + (i + 0.5) * CELL, z = z0 + (j + 0.5) * CELL;
          const s1 = side(a, b, x, z) * area, s2 = side(b, c, x, z) * area, s3 = side(c, a, x, z) * area;
          if (s1 >= 0 && s2 >= 0 && s3 >= 0) mark(x, z, top);
        }
      }
    }
  }
  return {
    x0, z0, w, d, cell: CELL, h,
    // Altura del obstáculo en (x, z); 0 = libre
    at(x, z) {
      const i = Math.floor((x - x0) / CELL), j = Math.floor((z - z0) / CELL);
      return i < 0 || j < 0 || i >= w || j >= d ? 99 : h[j * w + i];
    },
  };
}

// --- Rendimiento: geometría estática fusionada por material ---
// El mapa trae 234 piezas: cada una es un draw call en cada pasada (cámara, sombras, contorno).
// Todo lo que no se mueve ni es interactivo se junta en un solo mesh por material.
// Las animaciones de luz siguen funcionando porque los materiales son los mismos objetos.
function mergeStatic(map) {
  map.updateMatrixWorld(true);
  const groups = new Map();
  map.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    for (let p = o; p && p !== map; p = p.parent) if (p.userData.interactivo || p.name.startsWith('Puerta_')) return;
    const key = `${o.material.uuid}|${Object.keys(o.geometry.attributes).sort()}|${!!o.geometry.index}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const geos = meshes.map((m) => {
      const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
      // Escala negativa (espejo en Blender): invertir el orden de los triángulos para no ver las caras al revés
      if (m.matrixWorld.determinant() < 0 && g.index) {
        const idx = g.index.array;
        for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
      }
      return g;
    });
    const geo = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, meshes[0].material);
    mesh.name = `Estatico_${meshes[0].material.name}`;
    mesh.castShadow = mesh.receiveShadow = true;
    map.add(mesh);
    for (const m of meshes) m.removeFromParent();
  }
}

// Valor de userData heredado (los extras quedan en el nodo; un mesh con varios materiales es un Group con hijos)
function inherited(o, key) {
  for (; o; o = o.parent) if (o.userData[key] !== undefined) return o.userData[key];
  return undefined;
}

export function buildWorld(scene, gltf) {
  const T = makeTextures();
  const map = gltf.scene;
  scene.add(map);
  const get = (name) => map.getObjectByName(name);
  const updaters = [];

  const minimap = { zones: [], bounds: new THREE.Box3() };
  const materials = new Map();
  map.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    for (const m of [o.material].flat()) materials.set(m.name, m);
  });

  // --- PBR (SCRUM-20): color + rugosidad + metalicidad + normales en piso, paredes, racks y metales ---
  // Superficies con textura: el relieve sale de su propio dibujo (juntas, paneles, rejillas)
  for (const [name, strength] of [['M_PisoTecnico', 3], ['M_Pared', 2], ['M_Concreto', 2.5], ['M_Techo', 1.5], ['M_RackFrente_A', 2], ['M_RackFrente_B', 2]]) {
    const m = materials.get(name);
    if (!m?.map) continue;
    m.normalMap = normalMapFrom(m.map, strength);
    if (!m.roughnessMap) {
      m.roughnessMap = roughnessMapFrom(m.map, 0.55, 0.4); // superficies mates: sin brillos fuertes al alumbrarlas de cerca
      m.roughness = 1; // el mapa manda
    }
    m.needsUpdate = true;
  }
  // Letreros y pantallas: en el .blend tienen 2.5–5× de emisión y todo lo que pasa de 1.2 genera bloom,
  // así que el texto se lavaba en un halo. Con estos topes solo las letras más claras brillan un poco
  const EMISSIVE_MAX = {
    M_Logo: 1.5, M_Salida: 1.6, M_VideoWall: 1.3, M_Monitor0: 1.3, M_Monitor1: 1.3,
    M_PantallaTerminal: 1.4, M_RackFrente_A: 1.2, M_RackFrente_B: 1.2, M_Bombilla: 6,
  };
  for (const [name, max] of Object.entries(EMISSIVE_MAX)) {
    const m = materials.get(name);
    if (m) m.emissiveIntensity = Math.min(m.emissiveIntensity, max);
  }

  // Metales lisos (marcos de rack, puertas, bandejas, tuberías): cepillado fino
  const metal = brushedMetal();
  for (const name of ['M_RackMarco', 'M_RackPuertaTrasera', 'M_metalOsc', 'M_metalGris', 'M_metalClaro', 'M_MarcoPuerta', 'M_PuertaGris', 'M_BandejaCable', 'M_tuberia', 'M_crac', 'M_escritorio']) {
    const m = materials.get(name);
    if (!m || m.normalMap) continue;
    m.normalMap = metal.normalMap;
    m.normalScale.set(0.6, 0.6);
    m.roughnessMap = metal.roughnessMap;
    m.needsUpdate = true;
  }

  // --- Puertas corredizas ---
  const doors = [];
  map.traverse((o) => {
    if (!o.name.startsWith('Puerta_') || !String(o.userData.tipo || '').startsWith('puerta')) return;
    const box = new THREE.Box3().setFromObject(o);
    const size = box.getSize(new THREE.Vector3());
    const axis = size.x > size.z ? 'x' : 'z'; // se desliza a lo ancho, hacia adentro del muro
    doors.push({
      name: o.name,
      object: o,
      box,
      final: o.userData.tipo === 'puerta_final',
      locked: !!o.userData.bloqueada || o.userData.tipo === 'puerta_final',
      open: false,
      axis,
      from: o.position[axis],
      to: o.position[axis] + size[axis] * 0.95,
    });
  });
  const doorObjects = new Set(doors.map((d) => d.object));
  function openDoor(door) {
    door.open = true;
    door.locked = false;
  }
  updaters.push((dt) => {
    for (const d of doors) {
      if (d.open && d.object.position[d.axis] < d.to) d.object.position[d.axis] = Math.min(d.to, d.object.position[d.axis] + dt * 1.6);
    }
  });

  // --- Zonas (pisos) ---
  map.traverse((o) => {
    if (!o.name.startsWith('Piso_') || !o.userData.zona) return;
    const box = new THREE.Box3().setFromObject(o);
    minimap.zones.push({ id: o.userData.zona, name: ZONE_NAMES[o.userData.zona] ?? o.userData.zona, box });
    minimap.bounds.union(box);
  });
  function zoneAt(p) {
    return minimap.zones.find((z) => p.x >= z.box.min.x && p.x <= z.box.max.x && p.z >= z.box.min.z && p.z <= z.box.max.z);
  }

  // --- Colisiones: mapa de alturas con todos los meshes colision: true (las puertas van aparte: se mueven) ---
  const solidMeshes = [];
  map.traverse((o) => {
    if (!o.isMesh || inherited(o, 'colision') !== true) return;
    for (let p = o; p; p = p.parent) if (doorObjects.has(p)) return;
    solidMeshes.push(o);
  });
  const grid = buildHeightmap(solidMeshes, minimap.bounds);
  minimap.grid = grid;

  // ¿Un jugador de radio r en (x, z) choca con algo?
  const probe = new THREE.Box3();
  function collides(p, r) {
    for (let dz = -r; dz <= r; dz += CELL) {
      for (let dx = -r; dx <= r; dx += CELL) {
        if (dx * dx + dz * dz <= r * r && grid.at(p.x + dx, p.z + dz) > STEP) return true;
      }
    }
    probe.min.set(p.x - r, 0.1, p.z - r);
    probe.max.set(p.x + r, 1.8, p.z + r);
    return doors.some((d) => !d.open && d.box.intersectsBox(probe));
  }
  // ¿Hay una pared entre el ojo y un punto a `dist` metros sobre el rayo? (para no interactuar a través de muros)
  const step = new THREE.Vector3();
  function rayBlocked(ray, dist) {
    for (let s = 0.1; s < dist; s += CELL * 0.5) {
      step.copy(ray.direction).multiplyScalar(s).add(ray.origin);
      if (step.y < grid.at(step.x, step.z)) return true;
    }
    return false;
  }
  // Distancia hasta lo primero que toca el rayo (pared, mueble o piso), máximo `max`
  function rayDistance(ray, max) {
    for (let s = 0.05; s < max; s += CELL * 0.5) {
      step.copy(ray.direction).multiplyScalar(s).add(ray.origin);
      if (step.y < grid.at(step.x, step.z)) return s;
    }
    return max;
  }

  // --- Luces: se agrupan los vacíos LP_<zona> en pocas luces reales (cada luz extra encarece el render) ---
  const byZone = {};
  const extras = [];
  const balizas = [];
  map.traverse((o) => {
    if (!o.name.startsWith('LP_')) return;
    const p = o.getWorldPosition(new THREE.Vector3());
    const color = new THREE.Color(o.userData.color || '#ffffff');
    if (o.name.startsWith('LP_Baliza')) balizas.push({ p, color });
    else if (o.userData.zona) (byZone[o.userData.zona] ||= []).push({ p, color });
    else {
      const key = Object.keys(EXTRA_LIGHT).find((k) => o.name.startsWith(k));
      if (key) extras.push({ p, color, ...EXTRA_LIGHT[key] });
    }
  });
  function pointLight(color, cd, d, p) {
    const l = new THREE.PointLight(color, cd, d, 2);
    l.position.copy(p);
    scene.add(l);
    return l;
  }
  const zoneLights = [];
  const staticShadows = [];
  // Las sombras fijas se recalculan durante los primeros cuadros (con una sola pasada la sala podía salir negra).
  // Como los shaders ya se precompilan antes de "Comenzar" (game.jsx), bastan unos pocos
  let shadowWarmup = 5;
  updaters.push(() => {
    if (shadowWarmup <= 0) return;
    shadowWarmup--;
    for (const l of staticShadows) l.shadow.needsUpdate = true;
  });
  for (const [zone, points] of Object.entries(byZone)) {
    const cfg = ZONE_LIGHT[zone];
    if (!cfg?.n) continue;
    // Parte los puntos en n grupos a lo largo del eje más largo y pone una luz en el centro de cada grupo
    const box = new THREE.Box3().setFromPoints(points.map((q) => q.p));
    const size = box.getSize(new THREE.Vector3());
    const axis = size.x > size.z ? 'x' : 'z';
    const sorted = [...points].sort((a, b) => a.p[axis] - b.p[axis]);
    for (let i = 0; i < cfg.n; i++) {
      const group = sorted.slice(Math.floor((i * sorted.length) / cfg.n), Math.floor(((i + 1) * sorted.length) / cfg.n));
      const center = group.reduce((acc, q) => acc.add(q.p), new THREE.Vector3()).divideScalar(group.length);
      let light;
      if (cfg.sombras) {
        // Luz de techo hacia abajo con sombras (una SpotLight es 1 render de sombra; una PointLight serían 6)
        light = new THREE.SpotLight(group[0].color, cfg.cd, cfg.d, 1.15, 0.7, 2);
        light.position.copy(center);
        light.target.position.set(center.x, 0, center.z);
        light.castShadow = true;
        light.shadow.mapSize.set(1024, 1024);
        light.shadow.bias = -0.0005;
        light.shadow.normalBias = 0.03;
        // La luz y la sala no se mueven: la sombra se calcula al inicio y luego se congela
        // (ahorra un render del mapa por cuadro). Ver SHADOW_WARMUP.
        light.shadow.autoUpdate = false;
        staticShadows.push(light);
        scene.add(light, light.target);
      } else light = pointLight(group[0].color, cfg.cd, cfg.d, center);
      zoneLights.push({ zone, cfg, light, color: light.color.clone() });
    }
  }
  for (const e of extras) pointLight(e.color, e.cd, e.d, e.p);

  // Lámparas emisivas por zona (M_Luz_<Zona>): apagadas en las zonas oscuras
  const lamps = Object.entries(ZONE_LIGHT).map(([zone, cfg]) => {
    const m = materials.get(`M_Luz_${zone}`);
    return m && { m, base: m.emissiveIntensity, color: m.emissive.clone(), cfg };
  }).filter(Boolean);
  for (const { m, base, cfg } of lamps) m.emissiveIntensity = base * cfg.lum;

  // Efectos: parpadeo del pasillo, luz de emergencia pulsante, bombillo que falla.
  // Alerta roja (SCRUM-21): con menos de 2 minutos todas las luces pasan a rojo intermitente.
  let alert = false;
  let burst = 0;                         // segundos que le quedan al parpadeo del pasillo
  let nextBurst = 3 + Math.random() * 5; // cuándo empieza el siguiente
  updaters.push((dt, t) => {
    nextBurst -= dt;
    if (nextBurst <= 0) {
      burst = 0.5 + Math.random() * 0.6;
      nextBurst = 4 + Math.random() * 6;
    }
    burst = Math.max(0, burst - dt);
    const blink = Math.sin(t * 7) > 0 ? 1 : 0.25;
    for (const { light, cfg, color } of zoneLights) {
      let k = 1;
      // parpadea en ráfagas y luego se estabiliza
      if (cfg.fx === 'parpadeo') k = burst > 0 && Math.random() < 0.5 ? 0.08 : 1;
      else if (cfg.fx === 'emergencia') k = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.4), 3);
      else if (cfg.fx === 'falla') k = Math.random() < 0.9 ? 0.6 + Math.random() * 0.15 : Math.random() * 0.3;
      if (alert) k *= blink;
      light.color.copy(alert ? ALERT_COLOR : color);
      light.intensity = cfg.cd * k;
      const lamp = lamps.find((l) => l.cfg === cfg);
      if (lamp) {
        lamp.m.emissive.copy(alert ? ALERT_COLOR : lamp.color);
        lamp.m.emissiveIntensity = lamp.base * Math.max(cfg.lum, alert ? 0.4 : 0) * k;
      }
    }
  });
  function isDark(p) {
    const zone = zoneAt(p);
    return !!(zone && ZONE_LIGHT[zone.id]?.oscura);
  }

  // Balizas de alerta girando en la sala de racks (2 haces rojos; los demás vacíos quedan sin luz)
  if (balizas.length) {
    const far = balizas.reduce((a, b) => (b.p.distanceTo(balizas[0].p) > a.p.distanceTo(balizas[0].p) ? b : a));
    const beams = [balizas[0], far].map(({ p, color }, i) => {
      const s = new THREE.SpotLight(color, 14, 14, 0.4, 0.5, 2);
      s.position.copy(p);
      scene.add(s, s.target);
      return { s, p, phase: i * Math.PI };
    });
    const balizaMat = materials.get('M_Baliza');
    const balizaBase = balizaMat?.emissiveIntensity ?? 1;
    updaters.push((dt, t) => {
      for (const b of beams) {
        const a = t * 2.5 + b.phase;
        b.s.target.position.set(b.p.x + Math.cos(a) * 4, 0.5, b.p.z + Math.sin(a) * 4);
      }
      if (balizaMat) balizaMat.emissiveIntensity = balizaBase * (0.5 + 0.5 * Math.sin(t * 5));
    });
  }

  // LEDs de los racks: pulsan a distinto ritmo por color
  const leds = ['M_ledRojo', 'M_ledVerde', 'M_ledAzul', 'M_ledAmbar'].map((n, i) => {
    const m = materials.get(n);
    return m && { m, base: m.emissiveIntensity, speed: 1.3 + i * 0.9 };
  }).filter(Boolean);
  updaters.push((dt, t) => {
    for (const l of leds) l.m.emissiveIntensity = l.base * (0.55 + 0.45 * Math.sin(t * l.speed));
  });

  // Después de construir colisiones, zonas y luces (necesitan las piezas originales)
  mergeStatic(map);

  // --- Plano de la instalación (se esconde aquí; al recogerlo aparece el minimapa) ---
  const planoPanel = makePanel(512, 360, (g, w, h) => {
    g.fillStyle = '#123a6b';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 1;
    for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    // dibujo del plano real a partir del mapa de alturas (muros y racks)
    const s = Math.min((w - 40) / (grid.w * CELL), (h - 70) / (grid.d * CELL));
    g.fillStyle = '#dbeafe';
    for (let j = 0; j < grid.d; j += 2) {
      for (let i = 0; i < grid.w; i += 2) {
        if (grid.h[j * grid.w + i] > 1.5) g.fillRect(20 + i * CELL * s, 20 + j * CELL * s, Math.ceil(2 * CELL * s), Math.ceil(2 * CELL * s));
      }
    }
    g.fillStyle = '#e0f2fe';
    g.font = 'bold 24px monospace';
    g.fillText('PLANO DE PLANTA', 20, h - 18);
  });
  const plano = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.003, 0.3),
    new THREE.MeshStandardMaterial({ map: planoPanel.texture, roughness: 0.85 })
  );
  plano.position.copy(PLANO_POS);
  plano.rotation.y = 0.5;
  plano.castShadow = plano.receiveShadow = true;
  scene.add(plano);

  // --- Panel de seguridad junto a la terminal (Puzzle 1, SCRUM-15): guarda la tarjeta de acceso ---
  // Caja en la pared norte del NOC, a la derecha del escritorio; la puerta gira sobre su bisagra izquierda
  const panelMetal = new THREE.MeshStandardMaterial({ color: 0x5b6168, metalness: 0.7, roughness: 0.4 });
  const panelGroup = new THREE.Group();
  panelGroup.position.set(10.75, 1.3, -38.75);
  const pw = 0.46, ph = 0.52, pd = 0.14;
  const slab = (w, h, d, x, y, z, mat = panelMetal) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    panelGroup.add(m);
    return m;
  };
  slab(pw, ph, 0.01, 0, 0, 0.005);                  // fondo
  slab(0.015, ph, pd, -pw / 2, 0, pd / 2);          // lados
  slab(0.015, ph, pd, pw / 2, 0, pd / 2);
  slab(pw, 0.015, pd, 0, ph / 2, pd / 2);           // techo y base
  slab(pw, 0.015, pd, 0, -ph / 2, pd / 2);
  const hinge = new THREE.Group();                   // bisagra en el borde izquierdo del frente
  hinge.position.set(-pw / 2, 0, pd);
  panelGroup.add(hinge);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.015), panelMetal);
  lid.position.set(pw / 2, 0, 0.008);
  lid.castShadow = true;
  hinge.add(lid);
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff2020, emissiveIntensity: 3 });
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.006), ledMat);
  led.position.set(pw - 0.06, ph / 2 - 0.05, 0.018);
  hinge.add(led);
  const cardTex = makePanel(128, 200, (g, w, h) => {
    g.fillStyle = '#e7e5df';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fb923c';
    g.fillRect(0, 22, w, 34);
    g.fillStyle = '#c9a227';
    g.fillRect(18, 90, 34, 26);
    g.fillStyle = '#111';
    g.font = 'bold 18px monospace';
    g.fillText('ACCESO', 14, 150);
    g.fillText('ROOT', 14, 172);
  });
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.086, 0.002), new THREE.MeshStandardMaterial({ map: cardTex.texture, roughness: 0.45 }));
  card.position.set(0, 0, 0.03);
  panelGroup.add(card);
  scene.add(panelGroup);
  const panel = {
    group: panelGroup,
    card,
    opened: false,
    open() {
      this.opened = true;
      ledMat.emissive.set(0x22ff66);
    },
  };
  updaters.push((dt) => {
    if (panel.opened && hinge.rotation.y > -1.9) hinge.rotation.y = Math.max(-1.9, hinge.rotation.y - dt * 2.2);
  });

  // Cambia lo que muestra una pantalla del mapa (p. ej. la terminal tras resolver el puzzle)
  function setScreen(object, draw) {
    const panel = makePanel(512, 320, draw);
    object.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.map = o.material.emissiveMap = panel.texture;
      o.material.emissive.set(0xffffff);
    });
  }
  function termText(lines, color = '#4ade80') {
    return (g, w, h) => {
      g.fillStyle = '#020604';
      g.fillRect(0, 0, w, h);
      g.fillStyle = color;
      g.font = `${Math.round(h / 12)}px monospace`;
      lines.forEach((l, i) => g.fillText(l, 18, 36 + i * (h / 10)));
      g.fillStyle = 'rgba(255,255,255,0.04)';
      for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
    };
  }

  const spawnLinterna = get('Spawn_Linterna');
  return {
    textures: T,
    collides,
    rayBlocked,
    rayDistance,
    doors,
    openDoor,
    minimap,
    zoneAt,
    isDark,
    setAlert(on) {
      alert = on;
    },
    // Recalcular las sombras fijas cuando algo cambia en la sala (p. ej. se recoge la linterna)
    refreshShadows() {
      shadowWarmup = Math.max(shadowWarmup, 2);
    },
    panel,
    plano,
    get,
    setScreen,
    termText,
    anchors: {
      spawn: get('POI_Spawn').getWorldPosition(new THREE.Vector3()).setY(1.7),
      spawnYaw: THREE.MathUtils.degToRad(125), // mirando hacia la mesita de la linterna
      flashlight: spawnLinterna.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.037, 0)),
    },
    update(dt, t) {
      for (const u of updaters) u(dt, t);
    },
  };
}
