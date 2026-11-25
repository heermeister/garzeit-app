// Meat again – Signale: Ton, Sprache, Vibration, Bildschirm anlassen (inkl. iPhone-Besonderheiten)

export const istIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const istInstalliert = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

/** iOS-Version aus der Kennung, z. B. [18, 3]; null, wenn nicht ermittelbar. */
export function iosVersion() {
  const m = navigator.userAgent.match(/OS (\d+)[_.](\d+)/);
  return istIOS() && m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * Bildschirm-anlassen funktioniert in Home-Screen-Apps erst ab iOS 18.4 zuverlässig.
 * (Ab iOS 26 meldet Safari eingefroren „18_6“ – das ist ≥ 18.4 und damit unkritisch.)
 */
export function wakeLockUnzuverlaessig() {
  const v = iosVersion();
  return !!v && istInstalliert() && (v[0] < 18 || (v[0] === 18 && v[1] < 4));
}

// ───────────── Ton ─────────────
let audio = null;
let musikMischen = false;

/**
 * „playback“: Töne auch im Stummmodus (ab iOS 17), unterbricht aber laufende Musik.
 * „ambient“: Musik läuft weiter, dafür schaltet der Stummschalter die Töne stumm.
 */
export function setzeMusikMischen(an) {
  musikMischen = !!an;
  setzeAudioSession();
}
function setzeAudioSession() {
  try {
    const typ = musikMischen ? 'ambient' : 'playback';
    if (navigator.audioSession && navigator.audioSession.type !== typ) navigator.audioSession.type = typ;
  } catch { /* nicht unterstützt */ }
}

/** Muss bei einer Berührung aufgerufen werden (iOS/Safari erlauben Ton erst danach). */
export function tonEntsperren() {
  setzeAudioSession();
  try {
    // Nach Anruf/Sperre kann iOS den Kontext dauerhaft „interrupted“ oder „closed“ lassen → neu aufbauen
    if (audio && audio.state === 'closed') audio = null;
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state !== 'running') audio.resume().catch(() => {});
  } catch { audio = null; }
}

/** Läuft die Tonausgabe gerade? */
export const tonBereit = () => !!audio && audio.state === 'running';

/**
 * Bei einer Berührung aufrufen, wenn der Ton ausgefallen ist: erst fortsetzen,
 * klappt das nicht, den Kontext verwerfen und neu anlegen (iOS nach Anruf oder Sperre).
 */
export async function tonReparieren() {
  tonEntsperren();
  if (tonBereit()) return true;
  await new Promise((r) => setTimeout(r, 300));
  if (tonBereit()) return true;
  try { await audio?.close(); } catch { /* egal */ }
  audio = null;
  tonEntsperren();
  return tonBereit();
}

export function piep(anzahl = 3) {
  if (!audio) return false;
  try {
    if (audio.state !== 'running') audio.resume().catch(() => {});
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
    return audio.state === 'running';
  } catch { return false; }
}

// ───────────── Sprache ─────────────
// Eigene Warteschlange mit Wachhund: iOS meldet „onend“ nicht immer zuverlässig.
let spracheEntsperrt = false;
let spricht = false;
let wachhund = null;
const warteschlange = [];

function sprecheUtterance(text, lautstaerke = 1) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  u.rate = 1.05;
  u.volume = lautstaerke;
  let erledigt = false;
  const weiter = () => {
    if (erledigt) return;
    erledigt = true;
    clearTimeout(wachhund);
    spricht = false;
    sprecheNaechste();
  };
  u.onend = weiter;
  u.onerror = weiter;
  spricht = true;
  wachhund = setTimeout(() => { try { speechSynthesis.cancel(); } catch { /* egal */ } weiter(); },
    Math.min(10000, 2500 + 90 * text.length));
  speechSynthesis.speak(u);
}

function sprecheNaechste() {
  if (spricht || !warteschlange.length) return;
  try { sprecheUtterance(warteschlange.shift()); } catch { spricht = false; }
}

/** iOS spricht oft erst, nachdem eine Ansage durch eine Berührung ausgelöst wurde. */
export function spracheEntsperren(text = '') {
  try {
    if (!('speechSynthesis' in window)) return;
    spracheEntsperrt = true;
    if (spricht) return;   // läuft schon etwas → nicht dazwischenreden, die Warteschlange folgt
    sprecheUtterance(text || ' ', text ? 1 : 0);
  } catch { /* egal */ }
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

/** Veraltete Ansagen verwerfen (z. B. nach der Rückkehr aus dem Hintergrund). */
export function stille() {
  warteschlange.length = 0;
  clearTimeout(wachhund);
  spricht = false;
  try { speechSynthesis.cancel(); } catch { /* egal */ }
}

// ───────────── Vibration (iPhone: nicht unterstützt) ─────────────
export const kannVibrieren = () => typeof navigator.vibrate === 'function';
export function vibriere(muster = [300, 150, 300, 150, 300]) {
  // Ohne vorherige Berührung blockiert der Browser die Vibration (z. B. direkt nach dem Neuladen)
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try { if (kannVibrieren()) navigator.vibrate(muster); } catch { /* egal */ }
}

// ───────────── Bildschirm anlassen ─────────────
let wakeLock = null;
let gewuenscht = false;

export async function bildschirmAn() {
  gewuenscht = true;
  try {
    if (!('wakeLock' in navigator)) return false;
    if (wakeLock && !wakeLock.released) return true;
    const l = await navigator.wakeLock.request('screen');
    if (!gewuenscht) { l.release().catch(() => {}); return false; }   // inzwischen nicht mehr gewünscht
    wakeLock = l;
    l.addEventListener('release', () => {
      if (wakeLock === l) wakeLock = null;
      // Vom System freigegeben, obwohl noch gekocht wird → erneut anfordern
      if (gewuenscht && document.visibilityState === 'visible') bildschirmAn();
    });
    return true;
  } catch { return false; }
}
export function bildschirmFrei() {
  gewuenscht = false;
  const l = wakeLock;
  wakeLock = null;
  try { l?.release().catch(() => {}); } catch { /* egal */ }
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
