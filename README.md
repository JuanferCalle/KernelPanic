# Kernel Panic

Escape room en primera persona hecho con Three.js: tienes 10 minutos para escapar de un datacenter en falla.

**Demo:** https://juanfercalle.github.io/KernelPanic/

## Correr el proyecto

Requisitos: Node.js 20.19 o superior (o 22.12+).

```bash
git clone https://github.com/JuanferCalle/KernelPanic.git
cd KernelPanic
npm install
npm run dev        # http://localhost:5173
```

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | Compila el sitio en `dist/` |
| `npm run preview` | Sirve `dist/` para probar la versión compilada |

## Controles

WASD moverse · Shift correr · mouse mirar · clic interactuar · F linterna · TAB inventario · M mapa · Esc pausa

## Estructura

```
src/
  main.jsx, App.jsx     Entrada de React
  game.jsx              Motor: render, controles, interacción, puzzles, temporizador
  world.jsx             Arma el mundo desde el .glb del mapa (colisiones, luces, zonas, puertas)
  viewmodel.jsx         Brazos en primera persona y sus animaciones
  minimap.jsx           Minimapa (aparece al recoger el plano)
  textures.jsx          Texturas procedurales y mapas PBR derivados
  Hud.jsx, Overlay.jsx, Terminal.jsx   Interfaz (React)
  store.jsx             Estado de la interfaz que escribe el motor
  FpsPanel.jsx, budget.jsx             Panel de rendimiento y presupuesto
models3d/               Modelos de Blender (.blend) y exportados (.glb)
docs/QA.md              Presupuesto de rendimiento y checklist de pruebas
```

## Pipeline de assets 3D (Blender → juego)

1. **Formato:** GLB (glTF binario), un archivo por modelo en `models3d/`, junto a su `.blend`.
2. **Escala y ejes:** 1 unidad = 1 metro. Se exporta con *+Y arriba* (en Blender, el norte es +Y; en el juego queda en −Z).
3. **Exportación:** `blender -b models3d/<modelo>.blend -P models3d/export_glb.py`. Exporta lo visible, aplica modificadores e incluye las propiedades personalizadas (*extras*).
   - Con `npm run dev` corriendo, al guardar `kernelpanic_mapa.blend` se reexporta solo y el navegador se recarga (plugin en `vite.config.js`; ruta de Blender en `BLENDER_PATH`).
   - `arms.glb` y `flashlight.glb` los genera `models3d/build_assets.py` (incluye las animaciones).
4. **Nombres y propiedades:** el código encuentra los objetos por nombre y lee sus propiedades personalizadas:
   - `colision: true` → bloquea al jugador.
   - `interactivo: true` → se puede resaltar y usar.
   - `Puerta_*` → puertas corredizas (`bloqueada`, `desliza_hacia`).
   - `LP_*` → dónde van las luces (`luz_tipo`, `color`, `potencia_w`, `zona`).
   - `Piso_<Zona>` → límites de cada zona.

   El detalle está en `models3d/README_MAPA.md`.
5. **Peso:** cada `.glb` debe pesar menos de 3 MB (ver `docs/QA.md`).
6. **GitHub Pages no tiene Blender:** haz commit del `.glb` actualizado junto con el `.blend`.

## Convención de ramas

- `main`: siempre desplegable. Cada merge se publica en GitHub Pages.
- Una rama por historia: `feature/SCRUM-<n>-descripcion-corta` (por ejemplo `feature/SCRUM-15-terminal`). Para correcciones: `fix/SCRUM-<n>-...`.
- Se integra con pull request revisado (Definición de Hecho, SCRUM-8). El mensaje del commit empieza con la clave: `SCRUM-15: abrir panel con animación`.

## Despliegue

El workflow `.github/workflows/deploy.yml` compila y publica en GitHub Pages en cada push a `main`. Solo hay que activarlo una vez: en el repositorio, ve a **Settings → Pages → Source** y elige **GitHub Actions**.

## Depuración

En desarrollo aparece el panel **Rendimiento**: FPS, draw calls, triángulos, memoria y peso de cada modelo comparados contra el presupuesto. En el sitio publicado se activa con `?debug` en la URL.
