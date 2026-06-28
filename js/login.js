/* ============================================================
   login.js — écran de connexion email + mot de passe.
   ============================================================ */
import { $, gem } from './ui.js';
import { signIn } from './auth.js';

export function mountLogin() {
  const el = $('#login');
  el.style.setProperty('--accent', '#8b7bff');
  el.innerHTML = `
    <div class="login__brand">
      ${gem(56)}
      <h1>Pilotage</h1>
      <p>Connecte-toi pour accéder à ton tableau de bord.</p>
    </div>
    <form id="login-form" autocomplete="on">
      <div class="field"><input id="email" type="email" inputmode="email" placeholder="Email" required></div>
      <div class="field"><input id="password" type="password" placeholder="Mot de passe" required></div>
      <button class="btn-primary" type="submit" id="login-submit">Se connecter</button>
      <div class="login__err" id="login-err"></div>
    </form>`;
  el.classList.remove('hide');

  const form = $('#login-form'), btn = $('#login-submit'), err = $('#login-err');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    btn.disabled = true; btn.textContent = 'Connexion…';
    try {
      await signIn($('#email').value.trim(), $('#password').value);
      // onAuthChange (app.js) prend le relais pour afficher l'app.
    } catch (ex) {
      err.textContent = traduire(ex);
      btn.disabled = false; btn.textContent = 'Se connecter';
    }
  });
}

export function unmountLogin() {
  $('#login').classList.add('hide');
  $('#login').innerHTML = '';
}

function traduire(ex) {
  const m = (ex?.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'Email ou mot de passe incorrect.';
  if (m.includes('email not confirmed')) return 'Email non confirmé.';
  if (m.includes('network') || m.includes('fetch')) return 'Connexion réseau impossible.';
  return ex?.message || 'Erreur de connexion.';
}
