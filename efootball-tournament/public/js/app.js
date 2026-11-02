async function api(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showMsg(el, text, ok = false) {
  el.textContent = text;
  el.className = 'msg ' + (ok ? 'ok' : 'err');
  el.hidden = !text;
}

async function renderNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  try {
    const { user } = await api('/api/auth/me');
    nav.innerHTML =
      (user.role === 'admin' ? '<a href="admin.html">Admin</a>' : '<a href="pay.html">Payment</a>') +
      '<a href="tournament.html">Tournament</a>' +
      '<a href="#" id="logout">Log out</a>';
    document.getElementById('logout').onclick = async (e) => {
      e.preventDefault();
      await api('/api/auth/logout', { method: 'POST' });
      location.href = 'index.html';
    };
  } catch {
    nav.innerHTML = '<a href="login.html">Log in</a><a href="register.html">Register</a>';
  }
}

function addBackButton() {
  const page = location.pathname.split('/').pop() || 'index.html';
  if (page === 'index.html') return;
  const container = document.querySelector('header.site .container');
  if (!container) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'back-btn';
  btn.setAttribute('aria-label', 'Go back');
  btn.textContent = '← Back';
  btn.onclick = () => {
    if (history.length > 1) history.back();
    else location.href = 'index.html';
  };
  container.insertBefore(btn, container.firstChild);
}

async function startCountdown() {
  const el = document.getElementById('countdown');
  if (!el) return;
  let cfg;
  try { cfg = await api('/api/config'); } catch { return; }
  const start = new Date(cfg.startsAt);
  const target = start.getTime();

  const box = (n, label) => `<div class="cd-box"><strong>${n}</strong><span>${label}</span></div>`;

  function tick() {
    const diff = target - Date.now();
    if (diff <= 0) {
      el.innerHTML = '<p class="cd-title">The tournament has started</p>';
      clearInterval(timer);
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.innerHTML = `
      <p class="cd-title">Tournament starts in</p>
      <div class="cd-row">${box(d, 'Days')}${box(h, 'Hours')}${box(m, 'Minutes')}${box(s, 'Seconds')}</div>
      <p class="cd-date">Starts ${esc(start.toLocaleString())}</p>`;
  }

  tick();
  const timer = setInterval(tick, 1000);
}

document.addEventListener('DOMContentLoaded', () => {
  renderNav();
  addBackButton();
  startCountdown();
});
