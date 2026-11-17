// Presupuesto de rendimiento (SCRUM-19). Lo usa el panel de depuración y se documenta en docs/QA.md
export const BUDGET = {
  fps: 30,            // mínimo en un portátil de gama media (meta: 60)
  drawCalls: 600,     // por cuadro, contando sombras y postprocesado
  triangles: 1500000, // por cuadro, contando sombras y postprocesado
  glbMB: 3,           // peso máximo de cada modelo .glb
  loadSeconds: 10,    // carga inicial
};

// Peso real de los .glb descargados (Performance API: no hace falta volver a pedirlos)
export function glbWeights() {
  const byName = new Map();
  for (const e of performance.getEntriesByType('resource')) {
    if (!e.name.split('?')[0].endsWith('.glb')) continue;
    const name = decodeURIComponent(e.name.split('/').pop().split('?')[0]).replace(/-[\w-]{8}\.glb$/, '.glb');
    const mb = (e.decodedBodySize || e.encodedBodySize || e.transferSize) / 1048576;
    if (mb > (byName.get(name) ?? 0)) byName.set(name, mb); // en desarrollo Vite registra también la importación (0 bytes)
  }
  return [...byName].map(([name, mb]) => ({ name, mb }));
}
