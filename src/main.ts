import './ui/styles.css';
import { App } from './app';

const root = document.getElementById('app')!;
const app = new App(root);
app.boot().catch((err) => {
  console.error(err);
  root.insertAdjacentHTML('beforeend', `<div class="fatal">Não foi possível iniciar a física (WebAssembly).<br><small>${String(err)}</small></div>`);
});
// acesso para depuração no console / testes automatizados
(window as unknown as { sumo: App }).sumo = app;
