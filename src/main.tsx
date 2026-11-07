import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initStore } from './lib/store';
import { initSync } from './lib/sync';
import { registerServiceWorker } from './lib/offline';
import './styles.css';

registerServiceWorker();

void initStore().finally(() => {
  void initSync();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
