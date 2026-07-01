/* ============================================================
   app.js — bootstrap : session → login OU onboarding OU app.
   ============================================================ */
import { $ } from './ui.js';
import { getSession, onAuthChange } from './auth.js';
import { mountLogin, unmountLogin } from './login.js';
import { startApp } from './router.js';
import { isOnboarded, mountOnboarding, unmountOnboarding } from './onboarding.js';

let appStarted = false;
let routing = false;   // évite les routages concurrents (onAuthChange + init)
let onbActive = false; // onboarding en cours → ne pas le réinitialiser sur refresh de session

async function route() {
  if (routing) return;
  routing = true;
  try {
    const session = await getSession();
    if (!session) { onbActive = false; showLogin(); return; }
    // Onboarding déjà en cours : ne pas ré-router (préserve la saisie).
    if (onbActive) return;
    // Session OK → onboardé ?
    if (await isOnboarded()) { showApp(); }
    else { showOnboarding(); }
  } finally {
    routing = false;
  }
}

function showApp() {
  onbActive = false;
  unmountLogin();
  unmountOnboarding();
  $('#app').classList.remove('hide');
  if (!appStarted) { startApp('accueil'); appStarted = true; }
}

function showOnboarding() {
  onbActive = true;
  unmountLogin();
  $('#app').classList.add('hide');
  appStarted = false;
  mountOnboarding(() => { showApp(); });   // à la fin de l'onboarding → app
}

function showLogin() {
  $('#app').classList.add('hide');
  unmountOnboarding();
  appStarted = false;
  mountLogin();
}

async function init() {
  await route();
  // Réagit aux login/logout ultérieurs.
  onAuthChange(() => { route(); });
}

init();
