import { useSyncExternalStore } from 'react';

// Estado de la interfaz: lo escribe el motor del juego y lo leen los componentes
let state = {
  objective: '',
  time: '10:00',
  timerAlert: false,
  hint: '',
  aiming: false,  // la mira está sobre un objeto interactivo (cambia el cursor)
  message: '',
  messageVisible: false,
  inventory: [],
  newItem: null,
  invOpen: false,
  hasMap: false, // se recogió el plano: se muestra el minimapa
  mapBig: false, // minimapa ampliado con [M]
  zone: '',
  termOpen: false,
  termLog: '',
  termUnlocked: false,
  overlayOpen: true,
  overlayTitle: 'KERNEL PANIC',
  overlayText: 'Cargando modelos...',
  overlayButton: null, // texto del botón (Comenzar, Continuar, Reintentar...)
  overlayResult: null, // null | 'won' | 'lost'
  overlayRestart: false, // la pausa muestra también "Reiniciar"
};
const listeners = new Set();
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getUi = () => state;

// El motor llama a esto en cada cuadro: si nada cambió no se avisa a React
export function setUi(patch) {
  if (Object.keys(patch).every((key) => Object.is(state[key], patch[key]))) return;
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export const useUi = (selector) => useSyncExternalStore(subscribe, () => selector(state));
