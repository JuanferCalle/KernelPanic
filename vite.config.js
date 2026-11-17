import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Ruta de Blender: se puede cambiar con la variable de entorno BLENDER_PATH
const BLENDER = process.env.BLENDER_PATH || 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
// .blend que se reexportan solos. arms y flashlight NO: esos los genera build_assets.py con sus animaciones
const AUTO_EXPORT = ['kernelpanic_mapa.blend'];

// En `npm run dev`: al guardar el .blend en Blender se reexporta el .glb y el juego se recarga
function blendToGlb() {
  return {
    name: 'blend-to-glb',
    apply: 'serve',
    configureServer(server) {
      const log = server.config.logger;
      if (!existsSync(BLENDER)) {
        log.warn(`[blend] No encontré Blender en ${BLENDER}. Define BLENDER_PATH para exportar el mapa al guardar.`);
        return;
      }
      const pending = new Map();
      const running = new Set();
      server.watcher.add(AUTO_EXPORT.map((f) => path.resolve('models3d', f)));
      server.watcher.on('change', (file) => {
        if (!AUTO_EXPORT.includes(path.basename(file))) return;
        // Blender escribe el archivo en varios pasos: se espera a que termine de guardar
        clearTimeout(pending.get(file));
        pending.set(file, setTimeout(() => exportBlend(file), 800));
      });
      function exportBlend(file) {
        if (running.has(file)) return;
        running.add(file);
        log.info(`[blend] Exportando ${path.basename(file)}...`, { timestamp: true });
        const p = spawn(BLENDER, ['-b', file, '-P', path.resolve('models3d/export_glb.py')], { stdio: 'ignore' });
        p.on('close', (code) => {
          running.delete(file);
          if (code !== 0) return log.error(`[blend] Falló la exportación de ${path.basename(file)} (código ${code})`);
          log.info(`[blend] ${path.basename(file, '.blend')}.glb actualizado`, { timestamp: true });
          server.ws.send({ type: 'full-reload' });
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), blendToGlb()],
  // Rutas relativas: el sitio funciona en https://<usuario>.github.io/KernelPanic/
  base: './',
  build: {
    chunkSizeWarningLimit: 1000, // three.js completo pesa ~650 kB
  },
});
