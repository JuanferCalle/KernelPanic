import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './style.css';

// Sin StrictMode: montaría el juego dos veces en desarrollo (doble contexto WebGL y doble carga de modelos)
createRoot(document.getElementById('root')).render(<App />);
