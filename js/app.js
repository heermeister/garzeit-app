// Meat again – Oberfläche, Timer, Signale
import { FLEISCH, STUFEN, GERAETE, START } from './data.js';
import { berechne, ablauf, fmt } from './model.js';

const $ = (id) => document.getElementById(id);

// ───────────────────────── Zustand ─────────────────────────
const SPEICHER = 'meatagain.auswahl.v1';
const auswahl = ladeAuswahl() || {
  fleischId: 'rumpsteak', dicke: 2.5, stufe: 'mediumRare', startId: 'kalt', geraetId: 'pfanne',
};

function ladeAuswahl() {
  try { return JSON.parse(localStorage.getItem(SPEICHER)); } catch { return null; }
}
function speichereAuswahl() {
  try { localStorage.setItem(SPEICHER, JSON.stringify(auswahl)); } catch { /* egal */ }
}

const finde = (liste, id) => liste.find((x) => x.id === id) || liste[0];
const aktuell = () => ({
  fleisch: finde(FLEISCH, auswahl.fleischId),
  stufe: auswahl.stufe,
  dicke: auswahl.dicke,
  start: finde(START, auswahl.startId),
  geraet: finde(GERAETE, auswahl.geraetId),
});

// ───────────────────────── Auswahl-Ansicht ─────────────────────────
function knopf(cls, gedrueckt, html, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.setAttribute('aria-pressed', String(gedrueckt));
  b.innerHTML = html;
  b.addEventListener('click', onClick);
  return b;
}

function stufePassend(fleisch) {
  if (fleisch.art === 'sicher') return 'sicher';
  if (fleisch.stufen[auswahl.stufe] != null) return auswahl.stufe;
  return fleisch.stufen.mediumRare != null ? 'mediumRare' : Object.keys(fleisch.stufen)[0];
}

function render() {
  const a = aktuell();
  if (a.fleisch.art !== 'sicher') auswahl.stufe = stufePassend(a.fleisch);
  a.stufe = stufePassend(a.fleisch);

  // Fleisch
  const fl = $('fleisch-liste');
  fl.replaceChildren(...FLEISCH.map((f) => knopf('karte', f.id === a.fleisch.id,
    `${f.emoji} ${f.name}<small>${f.tier}</small>`,
    () => { auswahl.fleischId = f.id; auswahl.dicke = f.dicke; aktualisiere(); })));

  // Dicke
  $('dicke').value = a.dicke;
  $('dicke-wert').textContent = `${String(a.dicke).replace('.', ',')} cm`;

  // Garstufen
  const sl = $('stufen-liste');
  if (a.fleisch.art === 'sicher') {
    sl.replaceChildren(knopf('chip', true, `🛡️ ${STUFEN.sicher.label}<small>${STUFEN.sicher.sub}</small>`, () => {}));
  } else {
    sl.replaceChildren(...Object.entries(a.fleisch.stufen).map(([key, temp]) =>
      knopf('chip', key === a.stufe, `${STUFEN[key].label}<small>${temp} °C</small>`,
        () => { auswahl.stufe = key; aktualisiere(); })));
  }

  // Start & Gerät
  $('start-liste').replaceChildren(...START.map((s) => knopf('chip', s.id === a.start.id,
    `${s.emoji} ${s.name}`, () => { auswahl.startId = s.id; aktualisiere(); })));
  $('geraet-liste').replaceChildren(...GERAETE.map((g) => knopf('chip', g.id === a.geraet.id,
    `${g.emoji} ${g.name}`, () => { auswahl.geraetId = g.id; aktualisiere(); })));
  $('geraet-info').hidden = !a.geraet.hinweis;
  $('geraet-info').textContent = a.geraet.hinweis ? `⚠️ ${a.geraet.hinweis}` : '';

  // Plan
  const plan = berechne(a);
  $('sicher-info').hidden = !plan.sicher;
  $('risiko-info').hidden = !plan.risiko;
  $('p-gar').textContent = `${fmt(plan.garSek)} Min.`;
  $('p-seite').textContent = `${fmt(plan.seiteSek)} Min.`;
  $('p-raus').textContent = `${plan.raus} °C`;
  $('p-ruhe').textContent = `${fmt(plan.ruheSek)} Min.`;
  $('p-ziel').textContent = plan.sicher ? '≥ 70 °C (2 Min.)' : `${plan.ziel} °C`;
  $('start').textContent = a.geraet.id === 'pfanne' ? '▶️ Pfanne ist heiß – los!' : '▶️ Grill ist heiß – los!';
}

function aktualisiere() { speichereAuswahl(); render(); }

$('dicke').addEventListener('input', (e) => { auswahl.dicke = Number(e.target.value); aktualisiere(); });

// ───────────────────────── Signale ─────────────────────────
let audio = null;
function audioEntsperren() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { audio = null; }
}

function piep(anzahl = 3) {
  if (!audio) return;
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
}

function sprich(text) {
  try {
    if (!('speechSynthesis' in window) || !text) return;
    const u = new SpeechSynthesisUtterance(text.replace(/[^\p{L}\p{N}\s.,!?°-]/gu, ''));
    u.lang = 'de-DE';
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch { /* egal */ }
}

function signal(text) {
  piep(3);
  setTimeout(() => sprich(text), 1000);
  try { navigator.vibrate?.([300, 150, 300, 150, 300]); } catch { /* egal */ }
  document.body.classList.remove('alarm');
  void document.body.offsetWidth;
  document.body.classList.add('alarm');
}

// ───────────────────────── Bildschirm anlassen ─────────────────────────
let wakeLock = null;
async function bildschirmAn() {
  try {
    if (!('wakeLock' in navigator)) throw new Error('nicht unterstützt');
    wakeLock = await navigator.wakeLock.request('screen');
    $('t-wake').hidden = true;
  } catch {
    $('t-wake').hidden = false;
  }
}
function bildschirmFrei() {
  try { wakeLock?.release(); } catch { /* egal */ }
  wakeLock = null;
}

// ───────────────────────── Timer ─────────────────────────
const lauf = {
  aktiv: false, schritte: [], idx: 0, fleisch: null,
  endeUm: 0, restMs: 0, pausiert: false, erinnerung: null, tick: null,
};

function starte() {
  audioEntsperren();
  piep(1); // Ton-Test & iOS-Entsperrung
  const a = aktuell();
  a.stufe = stufePassend(a.fleisch);
  const plan = berechne(a);
  lauf.schritte = ablauf(plan, a.fleisch, a.geraet);
  lauf.idx = 0;
  lauf.fleisch = `${a.fleisch.emoji} ${a.fleisch.name} · ${String(a.dicke).replace('.', ',')} cm · ${plan.stufenLabel}`;
  lauf.aktiv = true;
  $('auswahl').hidden = true;
  $('timer').hidden = false;
  window.scrollTo(0, 0);
  bildschirmAn();
  zeigeSchritt();
  lauf.tick = setInterval(ticke, 250);
}

function schritt() { return lauf.schritte[lauf.idx]; }

function zeigeSchritt(startUm = Date.now()) {
  clearInterval(lauf.erinnerung);
  const s = schritt();
  $('t-fleisch').textContent = lauf.fleisch;
  $('t-schritt').textContent = s.typ === 'fertig' ? '' : `Schritt ${lauf.idx + 1} von ${lauf.schritte.length - 1}`;
  $('t-titel').textContent = s.titel;
  $('t-text').textContent = s.text;
  $('t-check').hidden = s.typ !== 'check';
  $('t-steuer').hidden = s.typ !== 'timer';
  $('t-zeit').hidden = s.typ !== 'timer';
  $('t-balken').parentElement.hidden = s.typ !== 'timer';
  $('t-abbruch').textContent = s.typ === 'fertig' ? '↩︎ Neues Stück' : '✖ Abbrechen';

  if (s.typ === 'timer') {
    lauf.pausiert = false;
    lauf.endeUm = startUm + s.sek * 1000;
    $('t-pause').textContent = '⏸️ Pause';
    ticke();
  } else if (s.typ === 'check') {
    $('t-frage').textContent = s.frage;
    // Erinnerung, falls niemand reagiert
    lauf.erinnerung = setInterval(() => piep(2), 20000);
  } else if (s.typ === 'fertig') {
    bildschirmFrei();
  }
  const n = lauf.schritte[lauf.idx + 1];
  $('t-naechst').textContent = n && n.typ !== 'fertig'
    ? `Danach: ${n.titel}${n.typ === 'timer' ? ` (${fmt(n.sek)})` : ''}` : '';
}

function ticke() {
  const s = schritt();
  if (!lauf.aktiv || !s || s.typ !== 'timer') return;
  const rest = lauf.pausiert ? lauf.restMs : lauf.endeUm - Date.now();
  $('t-zeit').textContent = fmt(rest / 1000);
  $('t-balken').style.width = `${Math.min(100, 100 * (1 - rest / (s.sek * 1000)))}%`;
  if (!lauf.pausiert && rest <= 0) {
    signal(s.signal);
    weiter(lauf.endeUm); // nächster Timer schließt nahtlos an (auch nach Hintergrund)
  }
}

function weiter(startUm = Date.now()) {
  lauf.idx = Math.min(lauf.idx + 1, lauf.schritte.length - 1);
  zeigeSchritt(startUm);
}

function antwort(ja) {
  const s = schritt();
  if (s.typ !== 'check') return;
  audioEntsperren();
  if (!ja) {
    // Nein: Zusatzschritte einfügen, danach dieselbe Prüfung erneut
    const extra = s.neinSchritte.map((x) => ({ ...x }));
    lauf.schritte.splice(lauf.idx + 1, 0, ...extra, { ...s });
  }
  weiter();
}

function pause() {
  const s = schritt();
  if (s.typ !== 'timer') return;
  if (lauf.pausiert) {
    lauf.endeUm = Date.now() + lauf.restMs;
    lauf.pausiert = false;
    $('t-pause').textContent = '⏸️ Pause';
  } else {
    lauf.restMs = lauf.endeUm - Date.now();
    lauf.pausiert = true;
    $('t-pause').textContent = '▶️ Weiter';
  }
  ticke();
}

function beende() {
  clearInterval(lauf.tick);
  clearInterval(lauf.erinnerung);
  lauf.aktiv = false;
  bildschirmFrei();
  try { speechSynthesis.cancel(); } catch { /* egal */ }
  $('timer').hidden = true;
  $('auswahl').hidden = false;
}

$('start').addEventListener('click', starte);
$('t-ja').addEventListener('click', () => antwort(true));
$('t-nein').addEventListener('click', () => antwort(false));
$('t-pause').addEventListener('click', () => { audioEntsperren(); pause(); });
$('t-weiter').addEventListener('click', () => { audioEntsperren(); weiter(Date.now()); });
$('t-abbruch').addEventListener('click', () => {
  if (schritt()?.typ === 'fertig' || confirm('Garvorgang wirklich abbrechen?')) beende();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && lauf.aktiv) {
    if (schritt()?.typ !== 'fertig') bildschirmAn();
    audioEntsperren();
    ticke();
  }
});
window.addEventListener('beforeunload', (e) => {
  if (lauf.aktiv && schritt()?.typ !== 'fertig') { e.preventDefault(); e.returnValue = ''; }
});

render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline-Modus optional */ });
}
