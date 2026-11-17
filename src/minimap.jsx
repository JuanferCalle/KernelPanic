// Minimapa: se dibuja desde el mapa de alturas de colisión, así siempre coincide con el .glb de Blender.
// La capa fija (zonas, muros, racks, muebles) se pinta una vez; puertas y jugador en cada cuadro.
// Un píxel = una celda del mapa de alturas (10 cm); el canvas se escala con CSS.

export function createMinimap(world) {
  const { zones, grid } = world.minimap;
  const { w: width, d: height, cell } = grid;
  // Norte arriba: -Z en three.js es el norte del mapa
  const px = (x) => (x - grid.x0) / cell;
  const py = (z) => (z - grid.z0) / cell;
  const rect = (g, b) => g.fillRect(px(b.min.x), py(b.min.z), Math.max(2, (b.max.x - b.min.x) / cell), Math.max(2, (b.max.z - b.min.z) / cell));

  const base = document.createElement('canvas');
  base.width = width;
  base.height = height;
  const g = base.getContext('2d');
  g.fillStyle = '#16212d';
  for (const z of zones) rect(g, z.box);
  // Obstáculos coloreados por altura: muebles bajos, racks/estantes, muros
  const img = g.getImageData(0, 0, width, height);
  for (let k = 0; k < grid.h.length; k++) {
    const y = grid.h[k];
    if (y <= 0.2) continue;
    const [r, gr, b] = y >= 3 ? [169, 191, 214] : y >= 1.5 ? [75, 97, 120] : [43, 59, 77];
    img.data.set([r, gr, b, 255], k * 4);
  }
  g.putImageData(img, 0, 0);
  g.textAlign = 'center';
  g.fillStyle = 'rgba(236,235,230,0.6)';
  for (const z of zones) {
    const label = z.name.toUpperCase();
    const room = ((z.box.max.x - z.box.min.x) / cell) * 0.85;
    g.font = `bold ${Math.min(26, Math.floor(room / (label.length * 0.62)))}px monospace`; // que quepa en la zona
    g.fillText(label, px((z.box.min.x + z.box.max.x) / 2), py((z.box.min.z + z.box.max.z) / 2));
  }

  return {
    width,
    height,
    draw(canvas, camera) {
      if (canvas.width !== width) {
        canvas.width = width;
        canvas.height = height;
      }
      const c = canvas.getContext('2d');
      c.drawImage(base, 0, 0);
      for (const d of world.doors) {
        c.fillStyle = d.open ? '#4ade80' : d.locked ? '#ef4444' : '#fbbf24';
        rect(c, d.box);
      }
      // Jugador: flecha hacia donde mira
      const e = camera.matrixWorld.elements;
      const fx = -e[8], fz = -e[10]; // hacia dónde mira la cámara, en el plano XZ
      c.save();
      c.translate(px(camera.position.x), py(camera.position.z));
      c.rotate(Math.atan2(-fx, fz)); // la flecha está dibujada apuntando a +Y del canvas
      c.fillStyle = '#fb923c';
      c.strokeStyle = '#000';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(0, 16);
      c.lineTo(11, -11);
      c.lineTo(0, -5);
      c.lineTo(-11, -11);
      c.closePath();
      c.stroke();
      c.fill();
      c.restore();
    },
  };
}
