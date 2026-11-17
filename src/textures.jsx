import * as THREE from 'three';

// --- Texturas procedurales (canvas) para no depender de imágenes externas ---

// Random con semilla: el escenario se ve igual en cada recarga
function seeded(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = seeded(1337);

function canvasTexture(w, h, draw, { repeat = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function grain(g, w, h, amount) {
  const img = g.getImageData(0, 0, w, h);
  const p = img.data;
  for (let i = 0; i < p.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    p[i] += n;
    p[i + 1] += n;
    p[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

function stains(g, w, h, count, rgb, alpha, maxR) {
  for (let i = 0; i < count; i++) {
    const x = rand() * w, y = rand() * h, r = maxR * (0.3 + rand() * 0.7);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${rgb},${alpha})`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function seam(g, x1, y1, x2, y2) {
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(x1 + 2, y1 + 2); g.lineTo(x2 + 2, y2 + 2); g.stroke();
}

export function makeTextures() {
  return {
    // Paneles de pared: 1 tile = 2 m
    wall: canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = '#a3a49e';
      g.fillRect(0, 0, w, h);
      stains(g, w, h, 40, '60,58,50', 0.08, 90);
      grain(g, w, h, 16);
      seam(g, 0, 0, 0, h);
      seam(g, w / 2, 0, w / 2, h);
      seam(g, 0, h * 0.62, w, h * 0.62);
    }),
    // Alfombra de oficina: 1 tile = 1 m
    carpet: canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#30353d';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.03)';
      for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < w; x += 8) g.fillRect(x, y, 4, 4);
      stains(g, w, h, 6, '0,0,0', 0.15, 60);
      grain(g, w, h, 36);
    }),
    // Piso técnico elevado con perforaciones: 1 tile = 0.6 m
    floorTile: canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#7d8185';
      g.fillRect(0, 0, w, h);
      stains(g, w, h, 4, '30,30,30', 0.12, 80);
      grain(g, w, h, 14);
      g.fillStyle = '#4c4f53';
      for (let y = 40; y < h - 30; y += 18) for (let x = 40; x < w - 30; x += 18) {
        g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = '#2b2d30';
      g.lineWidth = 8;
      g.strokeRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.15)';
      g.lineWidth = 2;
      g.strokeRect(6, 6, w - 12, h - 12);
    }),
    // Cielo raso: 1 tile = 0.6 m
    ceiling: canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#c4c2bb';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 0; i < 400; i++) g.fillRect(rand() * w, rand() * h, 2, 2);
      stains(g, w, h, 3, '120,100,60', 0.18, 70);
      grain(g, w, h, 10);
      g.strokeStyle = '#6f6d68';
      g.lineWidth = 6;
      g.strokeRect(0, 0, w, h);
    }),
    // Frente de rack de servidores (cubre toda la cara, sin repetir)
    rack: canvasTexture(256, 512, (g, w, h) => {
      g.fillStyle = '#15171a';
      g.fillRect(0, 0, w, h);
      for (let y = 20; y < h - 20; y += 22) {
        g.fillStyle = rand() < 0.2 ? '#0d0e10' : '#24272b';
        g.fillRect(14, y, w - 28, 19);
        g.fillStyle = '#0a0b0c';
        for (let x = 70; x < w - 30; x += 7) g.fillRect(x, y + 5, 3, 9);
        g.fillStyle = '#3c4046';
        g.fillRect(20, y + 6, 8, 7);
      }
      g.strokeStyle = '#3a3e44';
      g.lineWidth = 6;
      g.strokeRect(3, 3, w - 6, h - 6);
    }, { repeat: false }),
    // Puerta blindada con franja de peligro
    door: canvasTexture(256, 308, (g, w, h) => {
      g.fillStyle = '#5b6066';
      g.fillRect(0, 0, w, h);
      grain(g, w, h, 18);
      stains(g, w, h, 10, '20,20,20', 0.12, 50);
      seam(g, w / 2, 0, w / 2, h);
      const top = h * 0.82;
      g.save();
      g.beginPath(); g.rect(0, top, w, h - top); g.clip();
      g.fillStyle = '#111';
      g.fillRect(0, top, w, h - top);
      g.fillStyle = '#f59e0b';
      for (let x = -h; x < w + h; x += 32) {
        g.beginPath();
        g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + (h - top), top); g.lineTo(x + (h - top), top);
        g.fill();
      }
      g.restore();
      g.fillStyle = '#1b1d20';
      g.fillRect(w * 0.3, h * 0.15, w * 0.4, h * 0.18);
    }, { repeat: false }),
    // Patrón de la linterna (cookie del SpotLight): núcleo, anillo y borde
    cookie: canvasTexture(256, 256, (g, w) => {
      const c = w / 2;
      const grad = g.createRadialGradient(c, c, 0, c, c, c);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.18, '#fff6e6');
      grad.addColorStop(0.32, '#8c8577');
      grad.addColorStop(0.42, '#c9c0ae');
      grad.addColorStop(0.62, '#3a362f');
      grad.addColorStop(1, '#000000');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, w);
    }, { repeat: false }),
  };
}

// Superficie con texto que se puede redibujar (pantallas, letreros, tablero)
export function makePanel(w, h, draw) {
  const tex = canvasTexture(w, h, draw, { repeat: false });
  const g = tex.image.getContext('2d');
  return {
    texture: tex,
    redraw(fn) {
      fn(g, w, h);
      tex.needsUpdate = true;
    },
  };
}

// --- PBR (SCRUM-20): normales y rugosidad generadas a partir de lo que ya trae el modelo ---

const MAX_SIZE = 512; // los mapas derivados no necesitan más resolución

function pixels(image) {
  const s = Math.min(1, MAX_SIZE / Math.max(image.width, image.height));
  const w = Math.max(4, Math.round(image.width * s)), h = Math.max(4, Math.round(image.height * s));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, 0, 0, w, h);
  return { c, g, w, h, data: g.getImageData(0, 0, w, h).data };
}

// Copia cómo se aplica la textura original (repetición, UV, sin invertir Y como en glTF)
function like(tex, source) {
  tex.flipY = source.flipY;
  tex.wrapS = source.wrapS;
  tex.wrapT = source.wrapT;
  tex.repeat.copy(source.repeat);
  tex.offset.copy(source.offset);
  tex.rotation = source.rotation;
  tex.channel = source.channel;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// Normal map por diferencias (Sobel) usando la luminancia de la textura de color como altura:
// las juntas y ranuras oscuras quedan hundidas, así el relieve coincide con el dibujo
export function normalMapFrom(colorTex, strength = 2) {
  const { c, g, w, h, data } = pixels(colorTex.image);
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
  const at = (x, y) => lum[((y + h) % h) * w + ((x + w) % w)];
  const out = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * strength;
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const k = (y * w + x) * 4;
      out.data[k] = (-dx / len * 0.5 + 0.5) * 255;
      out.data[k + 1] = (dy / len * 0.5 + 0.5) * 255;
      out.data[k + 2] = (1 / len * 0.5 + 0.5) * 255;
      out.data[k + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  return like(new THREE.CanvasTexture(c), colorTex);
}

// Rugosidad a partir del color: zonas oscuras (juntas, rejillas) más ásperas que las superficies lisas
export function roughnessMapFrom(colorTex, base = 0.45, range = 0.4) {
  const { c, g, w, h, data } = pixels(colorTex.image);
  const out = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const l = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
    // roughnessMap usa el canal G (glTF); el material multiplica por su roughness
    const v = Math.min(1, base + (1 - l) * range) * 255;
    out.data.set([v, v, v, 255], i * 4);
  }
  g.putImageData(out, 0, 0);
  return like(new THREE.CanvasTexture(c), colorTex);
}

// Metal cepillado para los metales sin textura: rayas finas en normal y rugosidad
let brushed = null;
export function brushedMetal() {
  if (brushed) return brushed;
  const size = 256;
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    let v = Math.random();
    for (let x = 0; x < size; x++) {
      v = v * 0.92 + Math.random() * 0.08; // ruido estirado en X = rayas del cepillado
      height[y * size + x] = v + (Math.random() - 0.5) * 0.04;
    }
  }
  const mk = (fill) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    for (let i = 0; i < size * size; i++) img.data.set([...fill(i), 255], i * 4);
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 3);
    t.anisotropy = 8;
    return t;
  };
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  brushed = {
    normalMap: mk((i) => {
      const x = i % size, y = Math.floor(i / size);
      const dx = (at(x + 1, y) - at(x - 1, y)) * 1.5, dy = (at(x, y + 1) - at(x, y - 1)) * 1.5;
      const len = Math.hypot(dx, dy, 1);
      return [(-dx / len * 0.5 + 0.5) * 255, (dy / len * 0.5 + 0.5) * 255, (1 / len * 0.5 + 0.5) * 255];
    }),
    roughnessMap: mk((i) => {
      const v = (0.75 + height[i] * 0.5) * 255;
      return [v, v, v];
    }),
  };
  return brushed;
}
