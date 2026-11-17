# KernelPanic — mapa y modelos (Sprint 2–3)

Archivos en `models3d/`:

| Archivo | Qué es |
|---|---|
| `kernelpanic_mapa.blend` / `.glb` | Instalación completa: 52 × 40 m, 8 zonas, ~40k triángulos, 2.4 MB |
| `arms.blend` / `.glb` | Brazos humanos en primera persona (misma rig, acciones y nombres que antes) |
| `build_assets.py` | Genera `arms.glb` y `flashlight.glb` |
| `textures/` | Pantallas, letreros, nota y placa (PNG) |

Unidades en metros. glTF con Y arriba; en Blender X = este y Y = norte, así que en three.js el norte queda en −Z.

## Zonas y recorrido

```
Recepción (inicio, iluminada)          → linterna en la mesita
  → Pasillo en zigzag (oscuro, parpadeo) → pilas
  → NOC (pantallas)                     → Puzzle 1: terminal (la clave 1987 está en la placa de recepción; la pista, en la nota del escritorio)
  → Sala de racks (laberinto, alerta roja) → Llave ROJA en el rincón NE (chasis caído)
  → Enfriamiento (zigzag, CRAC)          → Cuarto eléctrico: Puzzle 2, tablero + palanca → se abre la caja de llaves → Llave VERDE
  → (la energía abre la puerta Racks → Bodega)
  → Bodega (estanterías en laberinto, una bombilla) → Gabinete con 4 cajones + caja fuerte → Llave AZUL
  → Bóveda (iluminada)                    → Puerta blindada: 3 cerraduras (roja, verde, azul) → SALIDA
```

## Nombres que el código puede buscar (`getObjectByName`)

Cada objeto trae `userData` (extras de glTF): `tipo`, `interactivo`, `colision`, `zona`, `estado`, etc.

- Puertas: `Puerta_NOC_Pasillo`, `Puerta_Pasillo_Recep`, `Puerta_NOC_Racks` (bloqueada, puzzle 1), `Puerta_Racks_Enfr`, `Puerta_Enfr_Electrico`, `Puerta_Racks_Bodega` (bloqueada, puzzle 2), `Puerta_Bodega_Boveda`. `userData.desliza_hacia` = eje local de apertura.
- Puzzles: `Pantalla_Terminal`, `Nota_Turno`, `Placa_Fundacion`, `Tablero_Electrico`, `Interruptor_1..6`, `Palanca_Principal`, `Caja_Llaves`.
- Llaves: `Llave_Roja`, `Llave_Verde`, `Llave_Azul` → `Cerradura_Roja/Verde/Azul` sobre `Puerta_Blindada`.
- Bodega: `Cajon_1..4`; `CajaFuerte_Puerta` (el pivote ya está en la bisagra: rota en Y local).
- Consumibles: `Spawn_Linterna`, `Pilas_1`, `Pilas_2`.
- Luces: los vacíos `LP_*` marcan dónde va cada luz (`luz_tipo`, `color`, `potencia_w`, `zona`, `estado`). Las luces no se exportan como luces, así decides cuántas crear (conviene una o dos por zona y las balizas `Baliza_Luz_*` girando).
- Luminarias emisivas: `Luminarias_<Zona>`, con un material por zona (`M_Luz_<Zona>`) para apagarlas y encenderlas.
- Colisión: todo lo que tenga `userData.colision === true` (muros, racks, props y puertas) sirve para generar los `Box3`.
- Marcadores: `POI_*` (centros de celda de cada punto de interés).

La planta (grilla de 26×20 celdas de 2 m, zonas, puertas y puntos de interés) está en `mapa_layout.py`. Si la cambias, ejecuta `python mapa_layout.py` para comprobar que todo siga siendo alcanzable.

## Cómo llega el mapa al juego

- `src/world.jsx` carga `kernelpanic_mapa.glb` y arma todo desde los nombres y `userData`: colisiones (una caja por pieza de cada mesh con `colision`), puertas `Puerta_*`, luces desde los vacíos `LP_*` y zonas desde `Piso_<Zona>`.
- **Auto-exportación:** con `npm run dev` corriendo, al guardar `kernelpanic_mapa.blend` en Blender se ejecuta `export_glb.py`, se regenera el `.glb` y el navegador se recarga solo. Si Blender no está en la ruta por defecto, define `BLENDER_PATH`.
- Manual: `blender -b models3d/kernelpanic_mapa.blend -P models3d/export_glb.py`
- GitHub Pages no tiene Blender: haz commit del `.glb` actualizado, no solo del `.blend`.
- La oscuridad de cada zona se ajusta en `ZONE_LIGHT` (`src/world.jsx`). El plano está escondido en `PLANO_POS` (callejón 17,5 del laberinto de racks).
