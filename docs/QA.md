# Presupuesto de rendimiento y checklist de QA (SCRUM-19)

## Presupuesto

Los mismos valores están en `src/budget.jsx` y el panel **Rendimiento** los compara en vivo.

| Métrica | Presupuesto | Medido (17 nov 2026) |
|---|---|---|
| FPS | ≥ 30 (meta 60) en portátil de gama media | Pendiente: medir en equipo real (*) |
| Draw calls por cuadro | ≤ 600 | 198–205 |
| Triángulos por cuadro | ≤ 1 500 000 | 129k–166k |
| Peso por modelo `.glb` | ≤ 3 MB | mapa 2.34 MB · brazos 0.55 MB · linterna 0.07 MB |
| Carga inicial | ≤ 10 s | Pendiente: medir en la URL pública |

Los conteos incluyen todas las pasadas de un cuadro: cámara, sombras, contorno y postprocesado.

(*) Las mediciones automáticas se hicieron con un navegador sin GPU (render por software). Los FPS reales hay que medirlos en un equipo con tarjeta gráfica.

### Decisiones que mantienen el presupuesto

- La geometría estática del mapa se fusiona por material: 234 piezas pasan a ~50 draw calls por pasada.
- Las sombras de las luces fijas de Recepción se calculan al inicio y se congelan.
- La sombra de la linterna solo se actualiza mientras está encendida.
- Las luces de las zonas se agrupan: 1 o 2 luces reales por zona en vez de los 70 puntos de luz del `.blend`.
- Las colisiones usan un mapa de alturas de 10 cm, no los triángulos del mapa.

## Checklist de pruebas (antes de cerrar una historia)

**Carga y consola**
- [ ] La escena carga sin errores ni advertencias graves en la consola.
- [ ] Carga en menos de 10 s en la URL pública.

**Rendimiento** (con el panel Rendimiento)
- [ ] FPS ≥ 30 en Recepción, en la Sala de racks con la linterna encendida y durante la alerta roja.
- [ ] Draw calls y triángulos dentro del presupuesto en esas mismas vistas.
- [ ] Ningún `.glb` supera 3 MB.

**Juego**
- [ ] El temporizador arranca en 10:00 al presionar "Comenzar"; al llegar a 00:00 aparece la derrota y se puede reintentar.
- [ ] El mouse gira la cámara y la vista vertical no se voltea.
- [ ] Al apuntar a un objeto interactivo, se resalta y la mira cambia; al dejar de apuntarlo, el resaltado desaparece.
- [ ] Linterna: aparece el mensaje al recogerla, F la enciende y la apaga. El haz es ancho y de cerca no encandila.
- [ ] Zonas oscuras sin linterna: aparece "Está demasiado oscuro para ver" y los objetos no se resaltan.
- [ ] Puzzle 1: el código correcto abre el panel con animación y muestra la tarjeta; uno incorrecto muestra "Acceso denegado".
- [ ] Inventario: lo recogido aparece en la barra y en TAB. La tarjeta abre la puerta de la Sala de racks.
- [ ] Con menos de 2 minutos las luces pasan a rojo intermitente.
- [ ] El paso del Pasillo parpadea de vez en cuando y luego se estabiliza.
- [ ] No se atraviesan paredes, racks ni muebles, y no hay bloqueos invisibles.

**Despliegue**
- [ ] El push a `main` termina el workflow en verde y la URL pública muestra la versión nueva.
