import './ui/style.css';
import { App } from './app';

new App().init().catch((e) => {
  console.error(e);
  const m = document.getElementById('message')!;
  m.hidden = false;
  m.textContent = 'Error al cargar los datos. Inténtalo de nuevo más tarde.';
});
