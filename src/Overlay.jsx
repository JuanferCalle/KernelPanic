import { useUi } from './store.jsx';

// Pantallas de inicio, pausa, victoria y derrota (SCRUM-14)
export default function Overlay({ onClick, onRestart }) {
  const open = useUi((ui) => ui.overlayOpen);
  const title = useUi((ui) => ui.overlayTitle);
  const text = useUi((ui) => ui.overlayText);
  const button = useUi((ui) => ui.overlayButton);
  const result = useUi((ui) => ui.overlayResult);
  const restart = useUi((ui) => ui.overlayRestart);
  if (!open) return null;
  return (
    <div id="overlay" className={result ?? ''}>
      <h1>{title}</h1>
      <p>{text}</p>
      {button && (
        <button type="button" onClick={onClick} autoFocus>
          {button}
        </button>
      )}
      {/* En la pausa: empezar de cero (recarga la página y vuelve a la pantalla de inicio) */}
      {restart && (
        <button type="button" className="secondary" onClick={onRestart}>
          Reiniciar
        </button>
      )}
      <small>WASD moverse · Shift correr · mouse mirar · clic interactuar · F linterna · TAB inventario · M mapa · Esc pausa</small>
    </div>
  );
}
