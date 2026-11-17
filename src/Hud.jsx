import { useUi } from './store.jsx';

const SLOTS = 4;
const ITEMS = {
  flashlight: { icon: '🔦', name: 'Linterna', desc: 'Presiona F para encenderla o apagarla.' },
  note: { icon: '📝', name: 'Nota del turno', desc: '"La clave es el año de fundación (ver placa en recepción)."' },
  tarjeta: { icon: '💳', name: 'Tarjeta de acceso', desc: 'Abre la puerta del NOC a la sala de racks. Es una de las 3 llaves de la puerta blindada.' },
  plano: { icon: '🗺️', name: 'Plano de planta', desc: 'Mapa de la instalación: se ve en la esquina inferior derecha. [M] para ampliarlo.' },
};

// El motor del juego dibuja el minimapa sobre este canvas (ver minimap.jsx)
function Minimap() {
  const hasMap = useUi((ui) => ui.hasMap);
  const big = useUi((ui) => ui.mapBig);
  const zone = useUi((ui) => ui.zone);
  if (!hasMap) return null;
  return (
    <div id="minimapBox" className={big ? 'big' : ''}>
      <canvas id="minimap" />
      <small>{zone || '—'} · [M] {big ? 'reducir' : 'ampliar'}</small>
    </div>
  );
}

function InventoryBar() {
  const inventory = useUi((ui) => ui.inventory);
  const newItem = useUi((ui) => ui.newItem);
  return (
    <div id="inv">
      {Array.from({ length: SLOTS }, (_, i) => {
        const id = inventory[i];
        const item = ITEMS[id];
        return (
          <div key={i} className={`slot${item ? '' : ' empty'}${id && id === newItem ? ' new' : ''}`}>
            <b>{i + 1}</b>
            {item && (
              <>
                <span>{item.icon}</span>
                <small>{item.name}</small>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function InventoryPanel() {
  const inventory = useUi((ui) => ui.inventory);
  return (
    <div id="invPanel">
      <h2>INVENTARIO</h2>
      <ul>
        {inventory.length === 0 && <li className="none">Vacío</li>}
        {inventory.map((id, i) => (
          <li key={i}>
            <span>{ITEMS[id].icon}</span>
            <div>
              <b>{ITEMS[id].name}</b>
              <p>{ITEMS[id].desc}</p>
            </div>
          </li>
        ))}
      </ul>
      <small>TAB / I para cerrar</small>
    </div>
  );
}

export default function Hud() {
  const objective = useUi((ui) => ui.objective);
  const time = useUi((ui) => ui.time);
  const timerAlert = useUi((ui) => ui.timerAlert);
  const hint = useUi((ui) => ui.hint);
  const message = useUi((ui) => ui.message);
  const messageVisible = useUi((ui) => ui.messageVisible);
  const invOpen = useUi((ui) => ui.invOpen);
  const aiming = useUi((ui) => ui.aiming);
  return (
    <div id="hud">
      <div id="objective">{objective}</div>
      <div id="timer" className={timerAlert ? 'alert' : ''}>{time}</div>
      {/* La mira cambia sobre un objeto interactivo (SCRUM-13): con el puntero bloqueado es el "cursor" */}
      <div id="crosshair" className={aiming ? 'active' : ''} />
      <div id="hint">{hint}</div>
      <div id="msg" className={messageVisible ? 'show' : ''}>{message}</div>
      <InventoryBar />
      <Minimap />
      {invOpen && <InventoryPanel />}
    </div>
  );
}
