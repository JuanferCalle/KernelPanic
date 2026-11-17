import { useUi } from './store.jsx';

// Pantallas de inicio, pausa, victoria y derrota (SCRUM-14)
export default function Overlay({ onClick }) {
  const open = useUi((ui) => ui.overlayOpen);
  const title = useUi((ui) => ui.overlayTitle);
  const text = useUi((ui) => ui.overlayText);
  const button = useUi((ui) => ui.overlayButton);
  const result = useUi((ui) => ui.overlayResult);
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
      <small>WASD moverse · Shift correr · mouse mirar · clic interactuar · F linterna · TAB inventario · M mapa · Esc pausa</small>
    </div>
  );
}
