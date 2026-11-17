import { useEffect, useRef, useState } from 'react';
import { useUi } from './store.jsx';

export default function Terminal({ onSubmit, onExit }) {
  const log = useUi((ui) => ui.termLog);
  const unlocked = useUi((ui) => ui.termUnlocked);
  const [password, setPassword] = useState('');
  const logEl = useRef(null);
  const exitEl = useRef(null);

  useEffect(() => {
    logEl.current.scrollTop = logEl.current.scrollHeight;
  }, [log]);
  useEffect(() => {
    if (unlocked) exitEl.current.focus();
  }, [unlocked]);

  function submit(e) {
    e.preventDefault();
    onSubmit(password);
    setPassword('');
  }

  return (
    <div id="term">
      <div className="screen">
        <header>root@oficina — terminal de emergencia</header>
        <pre ref={logEl}>{log}</pre>
        {!unlocked && (
          <form onSubmit={submit}>
            <label htmlFor="termInput">password:</label>
            <input
              id="termInput"
              type="password"
              autoComplete="off"
              spellCheck={false}
              maxLength={24}
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </form>
        )}
        <button ref={exitEl} type="button" onClick={onExit}>{unlocked ? 'Continuar' : 'Salir'}</button>
      </div>
    </div>
  );
}
