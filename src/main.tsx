import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { recarregarVersaoNova } from './carregarModulo';
import './styles.css';

registerSW({ immediate: true });

// Parte do app de uma versão antiga que não existe mais no site (o app foi atualizado): recarrega na versão nova.
window.addEventListener('vite:preloadError', (e) => {
  if (recarregarVersaoNova()) e.preventDefault();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
