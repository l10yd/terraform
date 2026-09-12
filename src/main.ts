import './styles.css';
import { initLang, getLang } from './i18n';
import { App } from './app';

initLang();
document.documentElement.lang = getLang();
const root = document.getElementById('app');
if (root) {
  const app = new App(root);
  // debug handle (dev/QA only; gameplay never reads it)
  (window as unknown as Record<string, unknown>).__TF = app;
}
