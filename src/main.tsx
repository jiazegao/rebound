import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startCloud } from './lib/cloud';
import { registerServiceWorker } from './lib/offline';
import './styles.css';

registerServiceWorker();
// Load the signed-in player's account (if this device has a session) and keep it in step with the server.
startCloud();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
