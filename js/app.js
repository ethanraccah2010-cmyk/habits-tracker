/* ============================================================
   app.js — bootstrap : session → login OU app.
   ============================================================ */
import { $ } from './ui.js';
import { getSession, onAuthChange } from './auth.js';
import { mountLogin, unmountLogin } from './login.js';
import { startApp } from './router.js';

let appStarted = false;

function showApp() {
  unmountLogin();
  $('#app').classList.remove('hide');
  if (!appStarted) { startApp('accueil'); appStarted = true; }
}

function showLogin() {
  $('#app').classList.add('hide');
  appStarted = false;
  mountLogin();
}

async function init() {
  const session = await getSession();
  if (session) showApp(); else showLogin();

  // Réagit aux login/logout ultérieurs.
  onAuthChange((s) => {
    if (s) showApp(); else showLogin();
  });
}

init();
