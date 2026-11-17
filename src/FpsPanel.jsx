import { useEffect, useRef } from 'react';
import { Leva, monitor, useControls } from 'leva';
import { BUDGET, glbWeights } from './budget.jsx';

const SAMPLE_MS = 500; // ventana de medición: también es el refresco de la gráfica
const check = (ok) => (ok ? ' ✓' : ' ✗ fuera de presupuesto');

// Panel de depuración (SCRUM-19): números reales contra el presupuesto de rendimiento
export default function FpsPanel({ getStats }) {
  const fps = useRef(0);

  useEffect(() => {
    let raf;
    let frames = 0;
    let start = performance.now();
    function count(now) {
      raf = requestAnimationFrame(count);
      frames++;
      const elapsed = now - start;
      if (elapsed < SAMPLE_MS) return;
      fps.current = Math.round((frames * 1000) / elapsed);
      frames = 0;
      start = now;
    }
    raf = requestAnimationFrame(count);
    return () => cancelAnimationFrame(raf);
  }, []);

  const stat = (key) => getStats()?.[key] ?? 0;
  // Texto y no número: leva formatea los números con toPrecision(2) y 144 saldría como 1.4e+2
  useControls({
    FPS: monitor(() => `${fps.current} (mín. ${BUDGET.fps})${check(fps.current >= BUDGET.fps)}`, { interval: SAMPLE_MS }),
    Historial: monitor(() => fps.current, { graph: true, interval: SAMPLE_MS }),
    'Draw calls': monitor(() => `${stat('calls')} / ${BUDGET.drawCalls}${check(stat('calls') <= BUDGET.drawCalls)}`, { interval: SAMPLE_MS }),
    Triángulos: monitor(() => `${(stat('triangles') / 1000).toFixed(0)}k / ${BUDGET.triangles / 1000}k${check(stat('triangles') <= BUDGET.triangles)}`, { interval: SAMPLE_MS }),
    Memoria: monitor(() => `${stat('geometries')} geometrías · ${stat('textures')} texturas · ${stat('lights')} luces`, { interval: 1000 }),
    Modelos: monitor(() => glbWeights().map((g) => `${g.name} ${g.mb.toFixed(2)} MB${g.mb <= BUDGET.glbMB ? '' : ' ✗'}`).join(' · ') || '—', { interval: 2000 }),
  });

  return <Leva hideCopyButton titleBar={{ title: 'Rendimiento', filter: false }} />;
}
