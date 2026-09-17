import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.5.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBcKnjZm5LYqj5jx5VEqx9ywspgZyxNfsA',
  authDomain: 'vepa-24b46.firebaseapp.com',
  projectId: 'vepa-24b46',
  storageBucket: 'vepa-24b46.appspot.com',
  messagingSenderId: '170936495301',
  appId: '1:170936495301:web:6f15b8fa08deeb01d5d4ac',
  measurementId: 'G-F8NFZ6SRKR'
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Change these two values in one place for the entire site.
const IDLE_LIMIT_MS = 30 * 60 * 1000;   // 30 minutes
const WARNING_MS    = 2 * 60 * 1000;    // warn 2 minutes before logout
const LAST_ACTIVITY_KEY = 'vepa_last_activity_at';

let activeUser = null;
let warningShown = false;
let tickId = null;
let lastActivityWrite = 0;

function ensureWarningUI() {
  if (document.getElementById('vepa-idle-warning')) return;
  const wrap = document.createElement('div');
  wrap.id = 'vepa-idle-warning';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.innerHTML = `
    <div class="vepa-idle-card">
      <strong>Still there?</strong>
      <p>You’ll be signed out soon because there hasn’t been any activity.</p>
      <button type="button" id="vepa-stay-signed-in">Stay signed in</button>
    </div>`;
  document.body.appendChild(wrap);

  const style = document.createElement('style');
  style.textContent = `
    #vepa-idle-warning{display:none;position:fixed;inset:0;z-index:100000;background:rgba(28,25,23,.62);backdrop-filter:blur(3px);align-items:center;justify-content:center;padding:1rem;font-family:'Nunito Sans',sans-serif}
    #vepa-idle-warning.show{display:flex}
    .vepa-idle-card{width:min(420px,100%);background:#F7F3EE;border:1px solid #D0C9BE;border-radius:12px;padding:1.5rem;box-shadow:0 22px 65px rgba(0,0,0,.3)}
    .vepa-idle-card strong{display:block;font-family:'Barlow Condensed',sans-serif;font-size:1.55rem;text-transform:uppercase;color:#1C1917;margin-bottom:.45rem}
    .vepa-idle-card p{margin:0 0 1.1rem;color:#3D3730;line-height:1.55;font-size:.9rem}
    #vepa-stay-signed-in{border:0;border-radius:8px;background:#C8381A;color:#fff;font-weight:700;padding:.72rem 1rem;cursor:pointer}
  `;
  document.head.appendChild(style);

  document.getElementById('vepa-stay-signed-in').addEventListener('click', () => markActivity(true));
}

function markActivity(force = false) {
  if (!activeUser) return;
  const now = Date.now();
  // Avoid hammering localStorage/storage events on every scroll or pointer event.
  if (!force && now - lastActivityWrite < 5000) return;
  lastActivityWrite = now;
  localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  warningShown = false;
  document.getElementById('vepa-idle-warning')?.classList.remove('show');
}

async function expireSession() {
  try { await signOut(auth); } catch (e) { console.warn('Idle sign-out failed', e); }
  sessionStorage.removeItem('admin-auth');
  localStorage.removeItem(LAST_ACTIVITY_KEY);
  const returnTo = encodeURIComponent(location.pathname + location.search + location.hash);
  location.replace(`/login?reason=inactive&returnTo=${returnTo}`);
}

function checkIdle() {
  if (!activeUser) return;
  const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || Date.now());
  const idle = Date.now() - last;
  if (idle >= IDLE_LIMIT_MS) {
    expireSession();
    return;
  }
  if (idle >= IDLE_LIMIT_MS - WARNING_MS && !warningShown) {
    warningShown = true;
    ensureWarningUI();
    document.getElementById('vepa-idle-warning')?.classList.add('show');
  }
}

const activityEvents = ['pointerdown','keydown','scroll','touchstart'];
activityEvents.forEach(evt => window.addEventListener(evt, () => markActivity(false), { passive:true }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') markActivity(false);
});

// Keep tabs in sync: activity in one VEPA tab refreshes the idle timer everywhere.
window.addEventListener('storage', e => {
  if (e.key === LAST_ACTIVITY_KEY && activeUser) {
    warningShown = false;
    document.getElementById('vepa-idle-warning')?.classList.remove('show');
  }
});

onAuthStateChanged(auth, user => {
  activeUser = user;
  if (tickId) clearInterval(tickId);
  if (!user) {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    document.getElementById('vepa-idle-warning')?.classList.remove('show');
    return;
  }
  if (!localStorage.getItem(LAST_ACTIVITY_KEY)) markActivity(true);
  checkIdle();
  tickId = setInterval(checkIdle, 15_000);
});
