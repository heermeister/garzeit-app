// Meat again – Signale: Ton, Sprache, Vibration, Bildschirm anlassen (inkl. iPhone-Besonderheiten)

export const istIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const istInstalliert = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

// ───────────── Ton ─────────────
let audio = null;

/**
 * Muss bei einer Berührung aufgerufen werden (iOS/Safari erlauben Ton erst danach).
 * iPhone: audioSession „playback“ sorgt dafür, dass Töne auch im Stummmodus hörbar sind (ab iOS 17).
 */
export function tonEntsperren() {
  try {
    if (navigator.audioSession && navigator.audioSession.type !== 'playback') {
      navigator.audioSession.type = 'playback';
    }
  } catch { /* nicht unterstützt */ }
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state !== 'running') audio.resume();
  } catch { audio = null; }
}

export function piep(anzahl = 3) {
  if (!audio) return false;
  try {
    if (audio.state !== 'running') audio.resume();
    const t0 = audio.currentTime + 0.02;
    for (let i = 0; i < anzahl; i++) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'square';
      o.frequency.value = i % 2 ? 1175 : 880;
      const t = t0 + i * 0.32;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.25);
    }
    return true;
  } catch { return false; }
}

// ───────────── Sprache ─────────────
let spracheEntsperrt = false;
const warteschlange = [];

/** iOS spricht oft erst, nachdem eine Ansage durch eine Berührung ausgelöst wurde. */
export function spracheEntsperren(text = '') {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text || ' ');
    u.lang = 'de-DE';
    u.volume = text ? 1 : 0;
    speechSynthesis.speak(u);
    spracheEntsperrt = true;
  } catch { /* egal */ }
}

function sprecheNaechste() {
  if (!warteschlange.length || speechSynthesis.speaking) return;
  const u = new SpeechSynthesisUtterance(warteschlange.shift());
  u.lang = 'de-DE';
  u.rate = 1.05;
  u.onend = () => sprecheNaechste();
  u.onerror = () => sprecheNaechste();
  speechSynthesis.speak(u);
}

export function sprich(text) {
  try {
    if (!('speechSynthesis' in window) || !text) return;
    const sauber = text.replace(/[^\p{L}\p{N}\s.,:!?°-]/gu, '').trim();
    if (!sauber) return;
    warteschlange.push(sauber);
    if (warteschlange.length > 4) warteschlange.splice(0, warteschlange.length - 4);
    sprecheNaechste();
  } catch { /* egal */ }
}

export function sprachePruefen() {
  return 'speechSynthesis' in window && spracheEntsperrt;
}

export function stille() {
  warteschlange.length = 0;
  try { speechSynthesis.cancel(); } catch { /* egal */ }
}

// ───────────── Vibration (iPhone: nicht unterstützt) ─────────────
export const kannVibrieren = () => typeof navigator.vibrate === 'function';
export function vibriere(muster = [300, 150, 300, 150, 300]) {
  try { if (kannVibrieren()) navigator.vibrate(muster); } catch { /* egal */ }
}

// ───────────── Bildschirm anlassen ─────────────
let wakeLock = null;
export async function bildschirmAn() {
  try {
    if (!('wakeLock' in navigator)) return false;
    if (wakeLock && !wakeLock.released) return true;
    wakeLock = await navigator.wakeLock.request('screen');
    return true;
  } catch { return false; }
}
export function bildschirmFrei() {
  try { wakeLock?.release(); } catch { /* egal */ }
  wakeLock = null;
}

// ───────────── Alles zusammen ─────────────
export function signal(sprachText, { anzahl = 3 } = {}) {
  piep(anzahl);
  if (sprachText) setTimeout(() => sprich(sprachText), 1000);
  vibriere();
  document.body.classList.remove('alarm');
  void document.body.offsetWidth;   // Animation neu starten
  document.body.classList.add('alarm');
}
