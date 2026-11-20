const mv = document.getElementById('stove');

// --- Encrypted model --------------------------------------------------------
// model/stove.glb.enc = "WM3D" | 1 | salt(16) | iv(12) | AES-256-GCM(glb)
// Key = PBKDF2-SHA256(password, salt, 600 000). See tools/encrypt_model.mjs.
const ITERATIONS = 600000;
const KEY_STORE = 'wm3d-key';
const gate = document.getElementById('gate');
const pwInput = document.getElementById('pw');
const remember = document.getElementById('remember');
const unlockBtn = document.getElementById('unlock');
const gateMsg = document.getElementById('gateMsg');
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let encrypted = null; // { salt, iv, ct }
async function loadEncrypted() {
  const res = await fetch('model/stove.glb.enc', { cache: 'no-cache' });
  if (!res.ok) throw new Error('model ' + res.status);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (new TextDecoder().decode(buf.subarray(0, 4)) !== 'WM3D' || buf[4] !== 1) throw new Error('bad model file');
  return { salt: buf.subarray(5, 21), iv: buf.subarray(21, 33), ct: buf.subarray(33) };
}

async function deriveKey(password, salt, extractable) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    base, { name: 'AES-GCM', length: 256 }, extractable, ['decrypt']);
}

async function openWith(key) {
  const glb = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: encrypted.iv }, key, encrypted.ct);
  mv.src = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
  gate.hidden = true;
  document.getElementById('panel').hidden = false;
}

function readStoredKey() {
  try { return JSON.parse(localStorage.getItem(KEY_STORE) || 'null'); } catch { return null; }
}
function storeKey(raw) {
  try { localStorage.setItem(KEY_STORE, JSON.stringify({ salt: b64(encrypted.salt), key: b64(raw) })); } catch {}
}
function forgetKey() { try { localStorage.removeItem(KEY_STORE); } catch {} }

async function start() {
  try {
    encrypted = await loadEncrypted();
  } catch (e) {
    gateMsg.textContent = "Impossible de charger le modèle (" + e.message + ").";
    unlockBtn.disabled = true;
    return;
  }
  // Remembered key, only valid for this exact encrypted file (same salt)
  const stored = readStoredKey();
  if (stored && stored.salt === b64(encrypted.salt)) {
    try {
      const key = await crypto.subtle.importKey('raw', unb64(stored.key), 'AES-GCM', false, ['decrypt']);
      await openWith(key);
      return;
    } catch { forgetKey(); }
  }
  pwInput.focus();
}

gate.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!encrypted) return;
  unlockBtn.disabled = true;
  gateMsg.textContent = '';
  unlockBtn.textContent = 'Déverrouillage…';
  try {
    const key = await deriveKey(pwInput.value.trim(), encrypted.salt, remember.checked);
    await openWith(key);
    if (remember.checked) storeKey(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
    pwInput.value = '';
  } catch {
    gateMsg.textContent = 'Mot de passe incorrect.';
    pwInput.select();
  } finally {
    unlockBtn.disabled = false;
    unlockBtn.textContent = 'Ouvrir';
  }
});

start();
const lines = [...document.querySelectorAll('#dimLines line')];
const sizeText = document.getElementById('sizeText');
const arNote = document.getElementById('arNote');

const mm = (m) => Math.round(m * 1000).toLocaleString('fr-FR');

// --- Dimensions, measured from the loaded model (metres) -------------------
mv.addEventListener('load', () => {
  const c = mv.getBoundingBoxCenter();
  const s = mv.getDimensions();
  const x = s.x / 2, y = s.y / 2, z = s.z / 2;
  const floor = c.y - y, top = c.y + y;
  const P = (px, py, pz) => `${px} ${py} ${pz}`;

  // Front = +Z. Width on the front-bottom edge, height on the front-right edge,
  // depth on the right-bottom edge.
  mv.updateHotspot({ name: 'hotspot-p-left',   position: P(c.x - x, floor, c.z + z) });
  mv.updateHotspot({ name: 'hotspot-p-corner', position: P(c.x + x, floor, c.z + z) });
  mv.updateHotspot({ name: 'hotspot-p-top',    position: P(c.x + x, top,   c.z + z) });
  mv.updateHotspot({ name: 'hotspot-p-back',   position: P(c.x + x, floor, c.z - z) });
  mv.updateHotspot({ name: 'hotspot-l-width',  position: P(c.x,     floor, c.z + z) });
  mv.updateHotspot({ name: 'hotspot-l-height', position: P(c.x + x, c.y,   c.z + z) });
  mv.updateHotspot({ name: 'hotspot-l-depth',  position: P(c.x + x, floor, c.z) });

  mv.querySelector('[slot="hotspot-l-width"]').textContent  = `${mm(s.x)} mm`;
  mv.querySelector('[slot="hotspot-l-height"]').textContent = `${mm(s.y)} mm`;
  mv.querySelector('[slot="hotspot-l-depth"]').textContent  = `${mm(s.z)} mm`;

  sizeText.textContent = `L ${mm(s.x)} × P ${mm(s.z)} × H ${mm(s.y)} mm`;
  drawLines();

  if (!mv.canActivateAR) {
    arNote.textContent =
      "La réalité augmentée s'ouvre sur iPhone, iPad ou téléphone Android. " +
      "Sur ordinateur : tournez et zoomez le poêle à la souris.";
  }
});

function drawLines() {
  for (const ln of lines) {
    const a = mv.queryHotspot('hotspot-' + ln.dataset.from);
    const b = mv.queryHotspot('hotspot-' + ln.dataset.to);
    const lbl = mv.queryHotspot('hotspot-' + ln.dataset.label);
    if (!a || !b) continue;
    ln.setAttribute('x1', a.canvasPosition.x);
    ln.setAttribute('y1', a.canvasPosition.y);
    ln.setAttribute('x2', b.canvasPosition.x);
    ln.setAttribute('y2', b.canvasPosition.y);
    ln.classList.toggle('hide', !!lbl && !lbl.facingCamera);
  }
}
mv.addEventListener('camera-change', drawLines);
window.addEventListener('resize', drawLines);

// --- Loading bar ------------------------------------------------------------
const bar = document.getElementById('progress');
mv.addEventListener('progress', (e) => {
  const p = e.detail.totalProgress;
  bar.firstElementChild.style.width = `${p * 100}%`;
  bar.classList.toggle('done', p >= 1);
});

// --- Controls ---------------------------------------------------------------
const dimToggle = document.getElementById('dimToggle');
dimToggle.addEventListener('click', () => {
  const on = dimToggle.getAttribute('aria-pressed') !== 'true';
  dimToggle.setAttribute('aria-pressed', String(on));
  mv.classList.toggle('no-dims', !on);
  if (on) drawLines();
});

for (const btn of document.querySelectorAll('[data-placement]')) {
  btn.addEventListener('click', () => {
    mv.arPlacement = btn.dataset.placement;
    for (const b of document.querySelectorAll('[data-placement]')) {
      b.setAttribute('aria-checked', String(b === btn));
    }
  });
}

mv.addEventListener('ar-status', (e) => {
  if (e.detail.status === 'failed') {
    arNote.textContent =
      "Impossible de lancer la réalité augmentée sur cet appareil. " +
      "Vérifiez que la page est ouverte en https:// et que l'appareil est compatible (ARCore / ARKit).";
  }
});

// --- Offline cache (needs a trusted https or localhost origin) --------------
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch((err) =>
    console.info('Service worker not registered (self-signed certificate?):', err.message));
}
