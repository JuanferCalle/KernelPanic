import { Suspense, lazy, useEffect, useRef } from 'react';
import { createGame } from './game.jsx';
import { useUi } from './store.jsx';
import Hud from './Hud.jsx';
import Terminal from './Terminal.jsx';
import Overlay from './Overlay.jsx';

// Panel de FPS (leva): siempre en desarrollo; en el sitio publicado se activa con ?debug
const FpsPanel = lazy(() => import('./FpsPanel.jsx'));
const showFps = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');

export default function App() {
  const container = useRef(null);
  const game = useRef(null);
  const termOpen = useUi((ui) => ui.termOpen);

  useEffect(() => {
    game.current = createGame(container.current);
    return () => game.current.dispose();
  }, []);

  return (
    <>
      <div ref={container} />
      <Hud />
      {termOpen && (
        <Terminal
          onSubmit={(password) => game.current.submitPassword(password)}
          onExit={() => game.current.closeTerminal()}
        />
      )}
      <Overlay onClick={() => game.current.clickOverlay()} onRestart={() => location.reload()} />
      {showFps && (
        <Suspense fallback={null}>
          <FpsPanel getStats={() => game.current?.stats()} />
        </Suspense>
      )}
    </>
  );
}
