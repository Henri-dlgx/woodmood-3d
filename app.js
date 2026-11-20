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
  if (new TextDecoder().decode(buf.subarray(0, 4)) !== 'WM3D' || ![1, 2].includes(buf[4])) throw new Error('bad model file');
  return { version: buf[4], salt: buf.subarray(5, 21), iv: buf.subarray(21, 33), ct: buf.subarray(33) };
}

async function gunzip(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

async function deriveKey(password, salt, extractable) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    base, { name: 'AES-GCM', length: 256 }, extractable, ['decrypt']);
}

async function openWith(key) {
  let glb = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: encrypted.iv }, key, encrypted.ct);
  if (encrypted.version === 2) glb = await gunzip(glb);
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

// --- Doors ------------------------------------------------------------------
// The model has "open_<door>" / "close_<door>" clips; appendAnimation lets
// each door run on its own (one clip per door at a time, held at its end).
// Button 1 = stove door, button 2 = both cassette rear doors together.
const doorBox = document.getElementById('doors');
const SWING_MS = 1300;
function setDoorButton(btn, open) {
  btn.setAttribute('aria-pressed', String(open));
  btn.querySelector('span').textContent = open ? btn.dataset.close : btn.dataset.open;
}
if (doorBox) {
  mv.addEventListener('load', () => {
    const anims = new Set(mv.availableAnimations || []);
    let any = false;
    for (const btn of doorBox.querySelectorAll('[data-doors]')) {
      const doors = btn.dataset.doors.split(' ');
      const ok = doors.every((d) => anims.has('open_' + d) && anims.has('close_' + d));
      btn.hidden = !ok;
      setDoorButton(btn, false);
      any ||= ok;
    }
    doorBox.hidden = !any;
  });
  // In WebXR AR, a tap on these buttons must not also count as a tap on the
  // scene (which would move the stove).
  doorBox.addEventListener('beforexrselect', (e) => e.preventDefault());
  doorBox.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-doors]');
    if (!btn || btn.disabled) return;
    const open = btn.getAttribute('aria-pressed') !== 'true';
    for (const door of btn.dataset.doors.split(' ')) {
      mv.detachAnimation((open ? 'close_' : 'open_') + door, { fade: false });
      mv.appendAnimation((open ? 'open_' : 'close_') + door, { repetitions: 1 });
    }
    setDoorButton(btn, open);
    btn.disabled = true;                       // no double taps mid-swing
    setTimeout(() => { btn.disabled = false; }, SWING_MS);
  });
}

// --- AR floor finder --------------------------------------------------------
// model-viewer's WebXR mode shows the stove at a guessed height, looks for a
// horizontal surface along a ray 20° below the screen centre, and drops the
// stove onto it ("object-placed"). Nothing on screen said so. This adds:
//  - a message card (searching / tip after 8 s / found / tracking lost)
//  - a target ring where the detector looks: dashed while searching, a green
//    ellipse lying on the floor once a surface is found (own hit-test source
//    on the same AR session, same ray as model-viewer).
const arGuide = document.getElementById('arGuide');
const reticle = document.getElementById('reticle');
const arCard = document.getElementById('arCard');
const arTitle = document.getElementById('arTitle');
const arText = document.getElementById('arText');
const RAY_DOWN = 20 * Math.PI / 180;
const MSG = {
  floor: {
    searching: ['Cherchez le sol', 'Pointez le téléphone vers le sol et balayez lentement de gauche à droite.'],
    tip: ['Toujours en recherche…', "Visez un sol texturé (parquet, carrelage, tapis) dans une pièce bien éclairée ; évitez les sols unis ou brillants."],
    found: ['Sol détecté ✓', 'Glissez pour déplacer le poêle · deux doigts pour le tourner.'],
    lost: ['Suivi perdu', 'Bougez plus lentement et éclairez la pièce.'],
  },
  wall: {
    searching: ['Cherchez le mur', 'Pointez le téléphone vers le mur et balayez lentement.'],
    tip: ['Toujours en recherche…', 'Un mur avec des détails (prises, cadres, texture) se détecte plus facilement.'],
    found: ['Mur détecté ✓', 'Glissez pour déplacer le poêle le long du mur.'],
    lost: ['Suivi perdu', 'Bougez plus lentement et éclairez la pièce.'],
  },
};
let placed = false, placedAt = 0, tipTimer = 0, fadeTimer = 0;

function setCard(state, key = state) {
  const set = MSG[mv.arPlacement === 'wall' ? 'wall' : 'floor'];
  arCard.dataset.state = state;
  arCard.classList.remove('fade');
  arTitle.textContent = set[key][0];
  arText.textContent = set[key][1];
  clearTimeout(fadeTimer);
  if (state === 'found') fadeTimer = setTimeout(() => arCard.classList.add('fade'), 4000);
}

mv.addEventListener('ar-status', (e) => {
  const s = e.detail.status;
  if (s === 'session-started') {
    placed = false;
    arGuide.hidden = false;
    setCard('searching');
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { if (!placed) setCard('searching', 'tip'); }, 8000);
  } else if (s === 'object-placed') {
    placed = true; placedAt = performance.now();
    clearTimeout(tipTimer);
    setCard('found');
  } else if (s === 'not-presenting' || s === 'failed') {
    arGuide.hidden = true; reticle.hidden = true;
    clearTimeout(tipTimer); clearTimeout(fadeTimer);
  }
});
mv.addEventListener('ar-tracking', (e) => {
  if (arGuide.hidden) return;
  if (e.detail.status === 'not-tracking') setCard('lost');
  else setCard(placed ? 'found' : 'searching');
});

// 4x4 column-major matrix (WebXR) times vec4
const mul = (m, v) => [0, 1, 2, 3].map((i) => m[i] * v[0] + m[4 + i] * v[1] + m[8 + i] * v[2] + m[12 + i] * v[3]);

function showReticle(cx, cy, w, h, state) {
  w = Math.min(Math.max(w, 24), 420); h = Math.min(Math.max(h, 12), 420);
  reticle.hidden = false;
  reticle.dataset.state = state;
  reticle.style.width = w + 'px'; reticle.style.height = h + 'px';
  reticle.style.margin = `${-h / 2}px 0 0 ${-w / 2}px`;
  reticle.style.transform = `translate(${cx}px, ${cy}px)`;
}

async function startReticle(session) {
  if (mv.arPlacement === 'wall' || typeof XRRay === 'undefined') return;
  const local = await session.requestReferenceSpace('local');
  const viewer = await session.requestReferenceSpace('viewer');
  const source = await session.requestHitTestSource({
    space: viewer,
    offsetRay: new XRRay(new DOMPoint(0, 0, 0), { x: 0, y: -Math.sin(RAY_DOWN), z: -Math.cos(RAY_DOWN) }),
  });
  let running = true;
  session.addEventListener('end', () => { running = false; try { source.cancel(); } catch {} reticle.hidden = true; });
  const R = 0.3; // ring radius on the floor, metres
  const onFrame = (time, frame) => {
    if (!running) return;
    session.requestAnimationFrame(onFrame);
    if (arGuide.hidden || (placed && performance.now() - placedAt > 1500)) { reticle.hidden = true; return; }
    const pose = frame.getViewerPose(local);
    if (!pose) return;
    const view = pose.views[0];
    const P = view.projectionMatrix, V = view.transform.inverse.matrix;
    const W = arGuide.clientWidth || innerWidth, H = arGuide.clientHeight || innerHeight;
    const toScreen = (c) => (c[3] <= 0 ? null : [(c[0] / c[3] + 1) / 2 * W, (1 - c[1] / c[3]) / 2 * H]);
    const hit = frame.getHitTestResults(source)[0];
    const hp = hit && hit.getPose(local);
    if (hp && hp.transform.matrix[5] > 0.75) {          // surface normal points up: a floor
      const m = hp.transform.matrix, x = m[12], y = m[13], z = m[14];
      const pts = [[x, y, z], [x + R, y, z], [x - R, y, z], [x, y, z + R], [x, y, z - R]]
        .map((q) => toScreen(mul(P, mul(V, [...q, 1]))));
      if (pts.every(Boolean)) {
        const xs = pts.slice(1).map((p) => p[0]), ys = pts.slice(1).map((p) => p[1]);
        showReticle(pts[0][0], pts[0][1], Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 'found');
        return;
      }
    }
    if (placed) return;
    // nothing yet: dashed ring where the detector is looking (1.5 m along the ray)
    const p = toScreen(mul(P, [0, -Math.sin(RAY_DOWN) * 1.5, -Math.cos(RAY_DOWN) * 1.5, 1]));
    if (p) showReticle(p[0], p[1], 76, 76, 'searching');
  };
  session.requestAnimationFrame(onFrame);
}

// Catch the AR session model-viewer opens (only when "Voir chez moi" is used)
if (navigator.xr && typeof navigator.xr.requestSession === 'function') {
  const original = navigator.xr.requestSession.bind(navigator.xr);
  navigator.xr.requestSession = async (mode, init) => {
    const session = await original(mode, init);
    if (mode === 'immersive-ar') startReticle(session).catch((err) => console.info('AR ring unavailable:', err.message));
    return session;
  };
}

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
