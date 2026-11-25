// Meat again – Oberfläche und Ablaufsteuerung
import { FLEISCH, STUFEN, START, FARBEN, MAX_STUECKE, GERAETE_TYPEN, SICHER, TEMP_BEREICH } from './data.js';
import {
  berechne, ablauf, zusatzzeit, kalibriere, lerneFaktor, effektiverFaktor, anpassungAusUrteilen,
  anpassungsSchluessel, anpassungsWert, leseTemp, zeitplan, fmt, csv, ZUSATZ_MIN_SEK,
} from './model.js';
import {
  speicher, dauerhaftSpeichern, istDauerhaft, sicherungErstellen, sicherungPruefen, sicherungEinspielen,
} from './speicher.js';
import {
  istIOS, istInstalliert, wakeLockUnzuverlaessig, tonEntsperren, tonBereit, tonReparieren, setzeMusikMischen,
  piep, spracheEntsperren, stille, kannVibrieren, vibriere, bildschirmAn, bildschirmFrei, signal,
} from './signale.js';

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kinder) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kinder.flat()) if (k != null) e.append(k);
  return e;
};
/** Nur setzen, wenn sich etwas ändert (schont Screenreader und Layout). */
const setText = (e, text) => { if (e.textContent !== text) e.textContent = text; };
const zahl = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const komma = (v) => String(v).replace('.', ',');
const cm = (d) => `${komma(d)} cm`;
const grad = (v) => `${komma(v)} °C`;
const faktorText = (f) => f.toFixed(2).replace('.', ',');
const neueId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const SPERRE_MS = 600;                    // Schutz gegen Doppel-Tipp nach jedem Schrittwechsel
const SPAET_MS = 5000;                    // so viel später nachgeholt = App war im Hintergrund
const LAUF_MAX_ALTER_MS = 3 * 3600 * 1000;
const DICK_AB_CM = 5;                     // ab hier Hinweis: direkte Hitze stößt an Grenzen

let toastTimer;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

// ═════════════════════════ Zustand ═════════════════════════
let einstellungen = speicher.einstellungen();
let geraete = speicher.geraete();
let anpassung = speicher.anpassung();
let teller = speicher.teller();
setzeMusikMischen(einstellungen.musikMischen);

const auswahl = {
  fleischId: 'rumpsteak', dicke: 2.5, stufe: 'mediumRare', startId: 'kalt', geraetId: 'pfanne',
  ...(speicher.auswahl() || {}),
};
auswahl.tStartGemessen = zahl(auswahl.tStartGemessen);

const finde = (liste, id) => liste.find((x) => x.id === id) || liste[0];
const findeGeraet = (id) => geraete.find((g) => g.id === id) || geraete[0];
const gueltigeDicke = (d, fallback) => {
  const n = Number(d);
  return Number.isFinite(n) ? Math.min(6, Math.max(1, Math.round(n * 2) / 2)) : fallback;
};

function stufePassend(fleisch, stufe) {
  if (fleisch.art === 'sicher') return 'sicher';
  if (fleisch.stufen[stufe] != null) return stufe;
  return fleisch.stufen.mediumRare != null ? 'mediumRare' : Object.keys(fleisch.stufen)[0];
}

/** Stück-Konfiguration → alles, was berechne() braucht. */
function aufloesen(cfg) {
  const fleisch = finde(FLEISCH, cfg.fleischId);
  const start = finde(START, cfg.startId);
  const geraet = findeGeraet(cfg.geraetId);
  const tGem = einstellungen.messModus ? zahl(cfg.tStartGemessen) : null;
  const stufe = stufePassend(fleisch, cfg.stufe);
  const plan = berechne({
    fleisch, stufe, dicke: gueltigeDicke(cfg.dicke, fleisch.dicke),
    tStart: tGem ?? start.temp,
    geraet: { ...geraet, faktor: effektiverFaktor(geraet, fleisch.art) },
    anpassung,
  });
  return { fleisch, start, geraet, stufe, plan, tStartGemessen: tGem };
}

// ═════════════════════════ Navigation ═════════════════════════
const ANSICHTEN = ['v-auswahl', 'v-timer', 'v-einstellungen', 'v-messungen'];
let ansicht = 'v-auswahl';

function zeige(id) {
  // Während eines Garvorgangs gibt es die Auswahl erst wieder über „Neues Essen“
  if (lauf.aktiv && id === 'v-auswahl') id = 'v-timer';
  ansicht = id;
  for (const a of ANSICHTEN) $(a).hidden = a !== id;
  $('nav-home').setAttribute('aria-label', lauf.aktiv ? 'Zum Timer' : 'Zur Auswahl');
  if (id === 'v-auswahl') renderAuswahl();
  if (id === 'v-einstellungen') renderEinstellungen();
  if (id === 'v-messungen') renderMessungen();
  renderLaufleiste();
  window.scrollTo(0, 0);
}
const zurueck = () => zeige(lauf.aktiv ? 'v-timer' : 'v-auswahl');
$('nav-home').addEventListener('click', zurueck);
$('nav-einstellungen').addEventListener('click', () => zeige('v-einstellungen'));
$('nav-messungen').addEventListener('click', () => zeige('v-messungen'));
for (const b of document.querySelectorAll('[data-zurueck]')) b.addEventListener('click', zurueck);
$('laufleiste').addEventListener('click', () => zeige('v-timer'));

/** Leiste unten in ⚙️/📊, solange gegart wird – wird rot, wenn gemessen werden muss. */
function renderLaufleiste() {
  const leiste = $('laufleiste');
  const zeigen = lauf.aktiv && !lauf.alleFertig && ansicht !== 'v-timer';
  leiste.hidden = !zeigen;
  document.body.classList.toggle('mit-leiste', zeigen);
  if (!zeigen) return;
  const checks = lauf.stuecke.filter((st) => aktSchritt(st).typ === 'check');
  leiste.classList.toggle('dringend', checks.length > 0);
  if (checks.length) {
    setText(leiste, `🌡️ Jetzt messen: ${checks.map((st) => st.label).join(', ')} – zum Timer ›`);
    return;
  }
  const timer = lauf.stuecke.filter((st) => aktSchritt(st).typ === 'timer').sort((a, b) => a.endeUm - b.endeUm);
  const st = timer[0];
  setText(leiste, st
    ? `⏱️ ${fmt(restMs(st) / 1000)} · ${aktSchritt(st).titel}${lauf.pausiertSeit ? ' (Pause)' : ''} – zum Timer ›`
    : '⏱️ Zum Timer ›');
}

// ═════════════════════════ Auswahl ═════════════════════════
function knopf(cls, gedrueckt, kinder, onClick, extra = {}) {
  return el('button', { type: 'button', class: cls, 'aria-pressed': String(gedrueckt), onclick: onClick, ...extra }, kinder);
}

function speichereAuswahl() { speicher.setAuswahl(auswahl); }

function renderAuswahl() {
  const a = aufloesen(auswahl);
  auswahl.stufe = a.stufe === 'sicher' ? auswahl.stufe : a.stufe;
  auswahl.dicke = gueltigeDicke(auswahl.dicke, a.fleisch.dicke);
  if (!geraete.some((g) => g.id === auswahl.geraetId)) auswahl.geraetId = geraete[0].id;

  $('ios-banner').hidden = !(istIOS() && !istInstalliert());
  $('mess-badge').hidden = !einstellungen.messModus;
  $('mess-safari').hidden = !(einstellungen.messModus && istIOS() && !istInstalliert());

  // Fleisch
  $('fleisch-liste').replaceChildren(...FLEISCH.map((f) => knopf('karte', f.id === a.fleisch.id,
    [`${f.emoji} ${f.name}`, el('small', { text: f.tier })],
    () => {
      if (auswahl.fleischId !== f.id) { auswahl.fleischId = f.id; auswahl.dicke = f.dicke; }
      aktualisiere();
    })));

  // Dicke
  $('dicke').value = auswahl.dicke;
  $('dicke').setAttribute('aria-valuetext', `${komma(auswahl.dicke)} Zentimeter`);
  $('dicke-wert').textContent = cm(auswahl.dicke);
  $('dicke-minus').disabled = auswahl.dicke <= 1;
  $('dicke-plus').disabled = auswahl.dicke >= 6;
  $('dicke-info').hidden = auswahl.dicke < DICK_AB_CM;

  // Garstufen
  if (a.fleisch.art === 'sicher') {
    $('stufen-liste').replaceChildren(knopf('chip', true,
      [`🛡️ ${STUFEN.sicher.label}`, el('small', { text: STUFEN.sicher.sub })], () => {}));
  } else {
    $('stufen-liste').replaceChildren(...Object.entries(a.fleisch.stufen).map(([key, basis]) => {
      const d = anpassungsWert(anpassung, anpassungsSchluessel(a.fleisch, key));
      const t = basis + d;
      return knopf('chip', key === a.stufe,
        [STUFEN[key].label, el('small', { text: d ? `${t} °C ✱` : `${t} °C` })],
        () => { auswahl.stufe = key; aktualisiere(); });
    }));
  }
  $('anpass-info').hidden = !a.plan.anpassung;
  $('anpass-info').textContent = a.plan.anpassung
    ? `✱ Dein persönlicher Wert: ${a.plan.anpassung > 0 ? '+' : ''}${a.plan.anpassung} °C gegenüber der Tabelle (${a.plan.zielBasis} °C).`
    : '';

  // Start & Gerät
  $('start-liste').replaceChildren(...START.map((s) => knopf('chip', s.id === a.start.id,
    `${s.emoji} ${s.name}`, () => { auswahl.startId = s.id; aktualisiere(); })));
  $('tstart-feld').hidden = !einstellungen.messModus;
  if (document.activeElement !== $('tstart')) {
    $('tstart').value = auswahl.tStartGemessen != null ? komma(auswahl.tStartGemessen) : '';
    $('tstart').removeAttribute('aria-invalid');
  }
  $('geraet-liste').replaceChildren(...geraete.map((g) => knopf('chip', g.id === a.geraet.id,
    `${GERAETE_TYPEN[g.typ]?.emoji || '🍳'} ${g.name}`, () => { auswahl.geraetId = g.id; aktualisiere(); })));
  const typInfo = GERAETE_TYPEN[a.geraet.typ];
  $('geraet-info').hidden = !typInfo?.hinweis;
  $('geraet-info').textContent = typInfo?.hinweis ? `⚠️ ${typInfo.hinweis}` : '';

  // Plan
  const p = a.plan;
  $('sicher-info').hidden = !p.sicher;
  $('risiko-info').hidden = !p.risiko;
  $('plan-hinweis').hidden = !teller.length;
  $('p-gar').textContent = `${fmt(p.garSek)} Min.`;
  $('p-seite').textContent = `${fmt(p.seiteSek)} Min.`;
  $('p-raus').textContent = grad(p.raus);
  $('p-ruhe').textContent = `${fmt(p.ruheSek)} Min.`;
  $('p-ziel').textContent = p.sicher ? `≥ ${SICHER.hold} °C (2 Min.)` : grad(p.ziel);
  const gelernt = Math.abs(p.faktor - 1) >= 0.005;
  $('p-faktor').hidden = !gelernt;
  $('p-faktor').textContent = gelernt
    ? `🔁 Gelernt für „${a.geraet.name}“${p.sicher ? ' (Schwein/Geflügel)' : ''}: Zeit × ${faktorText(p.faktor)}` : '';

  renderTeller();
}

function aktualisiere() { speichereAuswahl(); renderAuswahl(); }

function setzeDicke(d) { auswahl.dicke = gueltigeDicke(d, auswahl.dicke); aktualisiere(); }
$('dicke').addEventListener('input', (e) => setzeDicke(e.target.value));
$('dicke-minus').addEventListener('click', () => setzeDicke(auswahl.dicke - 0.5));
$('dicke-plus').addEventListener('click', () => setzeDicke(auswahl.dicke + 0.5));
$('tstart').addEventListener('input', (e) => {
  const m = leseTemp(e.target.value, TEMP_BEREICH.start);
  if (m.fehler) {
    e.target.setAttribute('aria-invalid', 'true');
    auswahl.tStartGemessen = null;
  } else {
    e.target.removeAttribute('aria-invalid');
    auswahl.tStartGemessen = m.leer ? null : m.wert;
  }
  $('tstart-fehler').hidden = !m.fehler;
  speichereAuswahl();
  renderAuswahl();
});

// ───────── Teller: mehrere Stücke ─────────
function stueckLabel(stueck, alle) {
  const fleisch = finde(FLEISCH, stueck.fleischId);
  const farbe = finde(FARBEN, stueck.farbeId);
  if (stueck.name) return stueck.name;
  const doppelt = alle.filter((s) => s.fleischId === stueck.fleischId).length > 1;
  return doppelt ? `${fleisch.name} ${farbe.name}` : fleisch.name;
}

// geschütztes Leerzeichen: „70 °C“ nicht zwischen Zahl und Einheit umbrechen
const zielText = (plan) => (plan.sicher ? `≥\u00a0${SICHER.hold}\u00a0°C` : `${komma(plan.ziel)}\u00a0°C`);

function renderTeller() {
  const liste = $('teller-liste');
  const aufgeloest = teller.map(aufloesen);
  liste.replaceChildren(...teller.map((s, i) => {
    const r = aufgeloest[i];
    const farbe = finde(FARBEN, s.farbeId);
    const details = [
      farbe.name, cm(s.dicke), `${r.plan.stufenLabel} ${zielText(r.plan)}`, r.geraet.name,
      `${fmt(r.plan.garSek + r.plan.ruheSek)} Min.`,
      r.tStartGemessen != null ? `Start ${grad(r.tStartGemessen)} gemessen` : null,
    ].filter(Boolean).join(' · ');
    return el('li', { class: 'teller-eintrag', style: `--farbe:${farbe.css}` },
      el('span', { class: 'punkt', 'aria-hidden': 'true' }),
      el('div', { class: 'teller-text' },
        el('b', { text: `${s.name ? `${s.name} · ` : ''}${r.fleisch.emoji} ${r.fleisch.name}` }),
        el('small', { text: details }),
        r.plan.risiko ? el('small', { class: 'warn-text', text: '⚠️ unter 63 °C – nicht für Risikogruppen' }) : null),
      el('button', {
        type: 'button', class: 'mini', 'aria-label': `✖ ${stueckLabel(s, teller)} entfernen`,
        onclick: () => { teller = teller.filter((x) => x.id !== s.id); speicher.setTeller(teller); renderAuswahl(); },
      }, '✖'));
  }));

  const n = teller.length;
  $('hinzu').disabled = n >= MAX_STUECKE;
  $('teller-leeren').hidden = !n;
  const zeit = speicher.tellerZeit();
  const alt = n && zeit && Date.now() - zeit > 3 * 3600 * 1000;
  $('teller-hinweis').textContent = n
    ? `${alt ? `Liste vom ${new Date(zeit).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}. ` : ''}Die Auswahl oben kommt erst mit ➕ auf die Liste. Start nimmt alle Stücke auf dieser Liste.`
    : 'Für ein einzelnes Stück einfach direkt starten.';
  $('start').textContent = n ? `▶️ Los – ${n} ${n === 1 ? 'Stück' : 'Stücke'}` : '▶️ Los!';

  // Risiko-Hinweis für Stücke auf der Liste (gilt nicht nur für die aktuelle Auswahl)
  const riskant = teller.filter((s, i) => aufgeloest[i].plan.risiko);
  $('teller-risiko').hidden = !riskant.length;
  $('teller-risiko').textContent = riskant.length
    ? `⚠️ Unter 63 °C: ${riskant.map((s) => stueckLabel(s, teller)).join(', ')}. Für Schwangere, Kleinkinder, ältere und immungeschwächte Menschen wird mindestens 63 °C empfohlen.`
    : '';

  // Zeitplan-Vorschau
  const plan = $('teller-plan');
  plan.hidden = n < 2;
  if (n >= 2) {
    const { versatz, gesamtSek } = zeitplan(aufgeloest.map((r) => r.plan));
    const reihenfolge = teller.map((s, i) => ({ s, v: versatz[i] })).sort((x, y) => x.v - y.v);
    plan.replaceChildren(
      el('b', { text: '⏱️ Ablauf' }),
      el('ul', {}, reihenfolge.map(({ s, v }) => el('li', {},
        el('span', { class: 'zeit-spalte', text: fmt(v) }),
        `${finde(FARBEN, s.farbeId).punkt} ${stueckLabel(s, teller)} auflegen`))),
      el('p', { class: 'klein', text: `🍽️ Alle gleichzeitig servierfertig nach ca. ${fmt(gesamtSek)} Min.` }));
  }
}

function fuegeHinzu() {
  if (teller.length >= MAX_STUECKE) { toast(`Maximal ${MAX_STUECKE} Stücke gleichzeitig.`); return false; }
  const frei = FARBEN.find((f) => !teller.some((s) => s.farbeId === f.id)) || FARBEN[0];
  const name = $('name').value.trim().slice(0, 14);
  teller.push({
    id: neueId(), name, farbeId: frei.id,
    fleischId: auswahl.fleischId, stufe: auswahl.stufe, dicke: auswahl.dicke,
    startId: auswahl.startId, geraetId: auswahl.geraetId,
    tStartGemessen: einstellungen.messModus ? auswahl.tStartGemessen : null,
  });
  speicher.setTeller(teller);
  $('name').value = '';
  renderAuswahl();
  toast(`${frei.punkt} ${name || finde(FLEISCH, auswahl.fleischId).name} hinzugefügt`);
  return true;
}
$('hinzu').addEventListener('click', fuegeHinzu);
$('teller-leeren').addEventListener('click', () => {
  if (!confirm('Liste der Stücke leeren?')) return;
  teller = [];
  speicher.setTeller(teller);
  renderAuswahl();
});

/** Steht die aktuelle Auswahl schon (gleich eingestellt) auf der Liste? */
function auswahlAufListe() {
  const f = finde(FLEISCH, auswahl.fleischId);
  const stufe = stufePassend(f, auswahl.stufe);
  return teller.some((t) => t.fleischId === auswahl.fleischId
    && stufePassend(finde(FLEISCH, t.fleischId), t.stufe) === stufe
    && Number(t.dicke) === Number(auswahl.dicke)
    && t.startId === auswahl.startId && t.geraetId === auswahl.geraetId);
}

// ═════════════════════════ Timer (mehrere Stücke) ═════════════════════════
const lauf = {
  aktiv: false, alleFertig: false, stuecke: [], tick: null,
  pausiertSeit: null, letzteErinnerung: 0, wakeOk: true, urteile: {}, neuSperreBis: 0,
};

// Diese Felder eines Stücks werden gespeichert, damit ein Neuladen keinen Garvorgang verliert
const GESICHERT = [
  'id', 'cfg', 'label', 'stufe', 'plan', 'tStartGemessen', 'faktorSnapshot', 'schritte', 'idx', 'endeUm',
  'gekochtSek', 'neinAnzahl', 'ersteErfasst', 'ersteMessung', 'gekochtBeiErster', 'rausErledigt', 'messungId',
  'feedback', 'checkSeit', 'messwarteSek', 'halteAbgelaufen', 'aufgeholt',
];

function sichereLauf() {
  if (!lauf.aktiv) return;
  speicher.setLauf({
    version: 1, gespeichertUm: Date.now(), alleFertig: lauf.alleFertig, pausiertSeit: lauf.pausiertSeit,
    urteile: lauf.urteile,
    stuecke: lauf.stuecke.map((st) => Object.fromEntries(GESICHERT.map((k) => [k, st[k] ?? null]))),
  });
}

function laufStarten() {
  lauf.aktiv = true;
  baueStueckKarten();
  zeige('v-timer');
  aktualisierePauseKnopf();
  wachHalten();
  clearInterval(lauf.tick);
  lauf.tick = setInterval(ticke, 250);
  sichereLauf();
  ticke();
}

function starte() {
  tonEntsperren();
  spracheEntsperren('Los geht’s!');
  dauerhaftSpeichern();

  // Liste vorhanden, aber die Auswahl oben (oder ein Name) ist noch nicht drauf → nachfragen
  if (teller.length && teller.length < MAX_STUECKE) {
    const name = $('name').value.trim();
    if (name || !auswahlAufListe()) {
      const f = finde(FLEISCH, auswahl.fleischId);
      const was = `${name ? `„${name}“: ` : ''}${f.name} ${cm(auswahl.dicke)}`;
      if (confirm(`${was} ist noch nicht auf der Liste. Auch mitgaren?`)) fuegeHinzu();
    }
  }

  const konfigs = teller.length ? teller.map((t) => ({ ...t })) : [{
    ...auswahl, id: neueId(), name: $('name').value.trim().slice(0, 14), farbeId: FARBEN[0].id,
    tStartGemessen: einstellungen.messModus ? auswahl.tStartGemessen : null,
  }];
  // Gemessene Starttemperatur gilt nur für diesen Durchgang – auch auf der Liste
  if (auswahl.tStartGemessen != null) { auswahl.tStartGemessen = null; speichereAuswahl(); }
  if (teller.some((t) => t.tStartGemessen != null)) {
    teller = teller.map((t) => ({ ...t, tStartGemessen: null }));
    speicher.setTeller(teller);
  }
  const aufgeloest = konfigs.map(aufloesen);
  const { versatz } = zeitplan(aufgeloest.map((r) => r.plan));
  const jetzt = Date.now();

  lauf.stuecke = konfigs.map((cfg, i) => {
    const r = aufgeloest[i];
    const schritte = ablauf(r.plan, r.fleisch, r.geraet.typ, versatz[i]);
    return {
      id: cfg.id, cfg, farbe: finde(FARBEN, cfg.farbeId), label: stueckLabel(cfg, konfigs), ...r,
      faktorSnapshot: r.plan.faktor,
      schritte, idx: 0, endeUm: jetzt + schritte[0].sek * 1000,
      gekochtSek: 0, neinAnzahl: 0, ersteErfasst: false, ersteMessung: null, gekochtBeiErster: null,
      rausErledigt: false, messungId: null, feedback: null, checkSeit: null, messwarteSek: 0,
      halteAbgelaufen: false, aufgeholt: false, dom: null, renderIdx: -1, sperreBis: 0,
    };
  });
  lauf.alleFertig = false;
  lauf.pausiertSeit = null;
  lauf.letzteErinnerung = jetzt;
  lauf.urteile = {};
  laufStarten();
}

/** Nach Neuladen oder Beenden der App durch iOS: laufenden Garvorgang fortsetzen. */
function wiederherstellen() {
  const l = speicher.lauf();
  if (!l) return false;
  if (!(Date.now() - l.gespeichertUm < LAUF_MAX_ALTER_MS) || !l.stuecke.length) { speicher.loescheLauf(); return false; }
  try {
    lauf.stuecke = l.stuecke.map((d) => {
      if (!d.cfg || !Array.isArray(d.schritte) || !d.schritte.length || !d.plan) throw new Error('unvollständig');
      return {
        ...d,
        fleisch: finde(FLEISCH, d.cfg.fleischId), start: finde(START, d.cfg.startId),
        geraet: findeGeraet(d.cfg.geraetId), farbe: finde(FARBEN, d.cfg.farbeId),
        idx: Math.min(Math.max(0, d.idx | 0), d.schritte.length - 1),
        dom: null, renderIdx: -1, sperreBis: 0,
      };
    });
  } catch { speicher.loescheLauf(); lauf.stuecke = []; return false; }
  lauf.alleFertig = !!l.alleFertig;
  lauf.pausiertSeit = l.pausiertSeit || null;
  lauf.letzteErinnerung = Date.now();
  lauf.urteile = l.urteile && typeof l.urteile === 'object' ? l.urteile : {};
  laufStarten();
  toast('♻️ Garvorgang wiederhergestellt – einmal tippen, damit die Töne wieder gehen.');
  return true;
}

async function wachHalten() {
  const ok = (await bildschirmAn()) && !wakeLockUnzuverlaessig();
  if (!lauf.aktiv || lauf.alleFertig) { bildschirmFrei(); return; }   // inzwischen fertig geworden
  lauf.wakeOk = ok;
  $('t-wake').hidden = ok;
  $('t-wake').textContent = istIOS()
    ? '⚠️ Der Bildschirm bleibt nicht automatisch an. Bitte für die Kochzeit: Einstellungen → Anzeige & Helligkeit → Automatische Sperre → „Nie“. Sonst kommen keine Signale.'
    : '⚠️ Der Bildschirm bleibt nicht automatisch an – bitte anlassen, sonst kommen die Signale evtl. nicht.';
}

const aktSchritt = (st) => st.schritte[st.idx];
const restMs = (st, jetzt = Date.now()) => (lauf.pausiertSeit ? st.endeUm - lauf.pausiertSeit : st.endeUm - jetzt);

/** Schritt beenden und zum nächsten wechseln. startUm = Startzeitpunkt des nächsten Schritts. */
function naechsterSchritt(st, startUm) {
  st.idx = Math.min(st.idx + 1, st.schritte.length - 1);
  const s = aktSchritt(st);
  st.checkSeit = s.typ === 'check' ? startUm : null;
  if (s.typ === 'timer') st.endeUm = startUm + s.sek * 1000;
  if (s.halte) st.halteAbgelaufen = false;
  if (s.typ === 'fertig') stueckFertig(st, startUm);
  sichereLauf();
}

/** Doppel-Tipp-Schutz: Eingaben nur für den Schritt, für den der Knopf gebaut wurde – und nicht direkt nach einem Wechsel. */
const gesperrt = (st, idx) => st.idx !== idx || Date.now() < st.sperreBis;

function ticke() {
  if (!lauf.aktiv) return;
  const jetzt = Date.now();
  if (!lauf.pausiertSeit) {
    const ansagen = [];
    for (const st of lauf.stuecke) {
      // Alle abgelaufenen Timer nachholen (z. B. nach Hintergrund), Folge-Timer schließen nahtlos an
      let s = aktSchritt(st);
      let sicherung = 0;
      while (s.typ === 'timer' && jetzt >= st.endeUm && sicherung++ < 50) {
        const spaet = jetzt - st.endeUm > SPAET_MS;
        if (s.kochen) { st.gekochtSek += s.sek; if (spaet) st.aufgeholt = true; }
        if (s.halte) st.halteAbgelaufen = true;   // nur ein tatsächlich abgelaufener Timer zählt
        ansagen.push(lauf.stuecke.length > 1 ? `${st.label}: ${s.signal}` : s.signal);
        if (s.warten && jetzt - st.endeUm > 2000) {
          // Das Auflegen wurde verpasst (App im Hintergrund) → Seite 1 beginnt erst jetzt
          naechsterSchritt(st, jetzt);
          break;
        }
        naechsterSchritt(st, st.endeUm);
        s = aktSchritt(st);
      }
    }
    if (ansagen.length) {
      signal(ansagen.join(' '));
      lauf.letzteErinnerung = jetzt;
    } else if (lauf.stuecke.some((st) => aktSchritt(st).typ === 'check') && jetzt - lauf.letzteErinnerung > 20000) {
      piep(2);   // Erinnerung: es wartet eine Messung
      lauf.letzteErinnerung = jetzt;
    }
  }
  renderTimer();
}

function stueckFertig(st, endeUm = Date.now()) {
  if (lauf.stuecke.every((x) => aktSchritt(x).typ === 'fertig')) {
    lauf.alleFertig = true;
    lauf.neuSperreBis = Date.now() + SPERRE_MS;
    bildschirmFrei();
  }
  if (st.messungId) {
    const ende = new Date(endeUm);
    const m = speicher.messungen().find((x) => x.id === st.messungId);
    const raus = m?.zeitstempel ? new Date(m.zeitstempel) : null;
    speicher.aendereMessung(st.messungId, {
      gesamtEnde: ende.toISOString(),
      ruheTatsaechlichSek: raus ? Math.max(0, Math.round((ende - raus) / 1000)) : null,
    });
  }
}

// ───────── Karten pro Stück ─────────
function baueStueckKarten() {
  const box = $('stuecke');
  const einzeln = lauf.stuecke.length === 1;
  box.classList.toggle('einzeln', einzeln);
  box.replaceChildren(...lauf.stuecke.map((st) => {
    const dom = {
      name: el('b', { class: 's-name' }),
      info: el('small', { class: 's-info' }),
      nr: el('small', { class: 's-nr' }),
      titel: el('span', { class: 's-titel' }),
      zeit: el('span', { class: 's-zeit' }),
      balken: el('div'),
      text: el('p', { class: 's-text' }),
      aktion: el('div', { class: 's-aktion' }),
      danach: el('p', { class: 's-danach klein' }),
    };
    st.dom = dom;
    st.renderIdx = -1;
    dom.name.textContent = `${st.farbe.punkt} ${st.label}`;
    dom.info.textContent = [
      `${st.fleisch.emoji} ${st.fleisch.name}`, cm(st.cfg.dicke), `${st.plan.stufenLabel} ${zielText(st.plan)}`,
      st.geraet.name, st.plan.risiko ? '⚠️ unter 63 °C' : null,
    ].filter(Boolean).join(' · ');
    dom.karte = el('article', { class: 'stueck', style: `--farbe:${st.farbe.css}` },
      el('header', { class: 's-kopf' }, dom.name, dom.nr),
      dom.info,
      el('div', { class: 's-zeile' }, dom.titel, dom.zeit),
      el('div', { class: 'balken' }, dom.balken),
      dom.text, dom.aktion, dom.danach);
    return dom.karte;
  }));
}

function renderTimer() {
  const jetzt = Date.now();
  const n = lauf.stuecke.length;
  const neueAnsagen = [];

  for (const st of lauf.stuecke) {
    const s = aktSchritt(st);
    const d = st.dom;
    if (st.renderIdx !== st.idx) {
      const erstesMal = st.renderIdx === -1;
      st.renderIdx = st.idx;
      st.sperreBis = jetzt + SPERRE_MS;
      setText(d.titel, s.titel);
      setText(d.text, s.text);
      const ohneFertig = st.schritte.filter((x) => x.typ !== 'fertig').length;
      setText(d.nr, s.typ === 'fertig' ? '✅' : `Schritt ${Math.min(st.idx + 1, ohneFertig)}/${ohneFertig}`);
      const nx = st.schritte[st.idx + 1];
      setText(d.danach, nx && nx.typ !== 'fertig' ? `Danach: ${nx.titel}${nx.typ === 'timer' ? ` (${fmt(nx.sek)})` : ''}` : '');
      d.aktion.replaceChildren(...baueAktion(st, s, st.idx));
      d.zeit.hidden = s.typ !== 'timer';
      d.balken.parentElement.hidden = s.typ !== 'timer';
      d.karte.classList.toggle('wartet-auf-dich', s.typ === 'check');
      d.karte.classList.toggle('erledigt', s.typ === 'fertig');
      neueAnsagen.push(n > 1 ? `${st.label}: ${s.titel}` : s.titel);
      // Mehrere Stücke: wartende Messkarte ins Bild holen (nicht, während getippt wird)
      if (!erstesMal && s.typ === 'check' && n > 1 && ansicht === 'v-timer' && !document.activeElement?.matches?.('input')) {
        const r = d.karte.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) d.karte.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
    if (s.typ === 'timer') {
      const rest = restMs(st, jetzt);
      setText(d.zeit, fmt(rest / 1000));
      d.balken.style.width = `${Math.min(100, Math.max(0, 100 * (1 - rest / (s.sek * 1000))))}%`;
    }
  }
  if (neueAnsagen.length) setText($('sr-ansage'), neueAnsagen.join('. '));

  // Held: das Dringendste zuerst
  const checks = lauf.stuecke.filter((st) => aktSchritt(st).typ === 'check');
  const timer = lauf.stuecke.filter((st) => aktSchritt(st).typ === 'timer')
    .sort((a, b) => a.endeUm - b.endeUm);
  const pausiert = lauf.pausiertSeit ? '⏸️ Pausiert · ' : '';
  $('held').classList.toggle('dringend', checks.length > 0);
  if (lauf.alleFertig) {
    setText($('h-wer'), n > 1 ? 'Alle Stücke sind fertig' : `${lauf.stuecke[0].fleisch.emoji} ${lauf.stuecke[0].fleisch.name}`);
    setText($('h-titel'), 'Guten Appetit! 🍽️');
    $('h-zeit').hidden = true;
    $('t-steuer').hidden = true;
    $('t-neu').hidden = false;
    $('t-neu').disabled = jetzt < lauf.neuSperreBis;
    $('t-wake').hidden = true;
  } else if (checks.length) {
    setText($('h-wer'), pausiert + (n > 1 ? checks.map((st) => `${st.farbe.punkt} ${st.label}`).join(' · ') : ''));
    setText($('h-titel'), checks.length > 1 ? '🌡️ Jetzt messen!' : `🌡️ ${aktSchritt(checks[0]).titel}`);
    $('h-zeit').hidden = true;
  } else if (timer.length) {
    const st = timer[0];
    const s = aktSchritt(st);
    setText($('h-wer'), pausiert + (n > 1 ? `Als Nächstes: ${st.farbe.punkt} ${st.label}` : `${st.fleisch.emoji} ${st.label} · ${cm(st.cfg.dicke)} · ${st.plan.stufenLabel}`));
    setText($('h-titel'), n > 1 ? `${s.titel} → ${s.signal}` : s.titel);
    $('h-zeit').hidden = false;
    setText($('h-zeit'), fmt(restMs(st, jetzt) / 1000));
  }
  if (!lauf.alleFertig) { $('t-steuer').hidden = false; $('t-neu').hidden = true; }
  $('h-zeit').classList.toggle('pausiert', !!lauf.pausiertSeit);
  $('t-ton').hidden = !(lauf.aktiv && !lauf.alleFertig && !tonBereit());
  renderLaufleiste();
}

/** Aktionsbereich eines Stücks, abhängig vom Schritt. idx = Schritt, für den die Knöpfe gelten. */
function baueAktion(st, s, idx) {
  if (s.typ === 'timer') {
    if (s.halte) {
      // BfR-Haltephase: niemals überspringbar
      return [el('p', { class: 'klein halte-hinweis', text: '🛡️ Haltephase läuft – sie kann nicht übersprungen werden.' })];
    }
    const text = s.warten ? '⏭️ Jetzt schon auflegen' : '⏭️ Überspringen';
    return [el('button', {
      type: 'button', class: 'mini weiter', onclick: () => ueberspringe(st, idx),
      'aria-label': `${text} – ${st.label}`,
    }, text)];
  }
  if (s.typ === 'check') {
    const sicher = st.fleisch.art === 'sicher';
    const feld = el('input', {
      type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done', class: 'temp-eingabe',
      placeholder: '°C', 'aria-label': `Gemessene Kerntemperatur in °C – ${st.label}`,
    });
    const hinweis = sicher ? 'Gemessen (Pflicht):' : einstellungen.messModus ? 'Gemessen (bitte eintragen):' : 'Gemessen (optional, hilft beim Lernen):';
    return [
      el('p', { class: 's-frage', text: s.frage }),
      el('label', { class: 'temp-zeile' }, el('span', { text: hinweis }), feld),
      el('div', { class: 'zwei' },
        el('button', {
          type: 'button', class: 'gross primaer', onclick: () => antworteMitFeld(st, idx, true, feld),
          'aria-label': `✅ Ja, mindestens ${s.grenze} °C – ${st.label}`,
        }, '✅ Ja'),
        el('button', {
          type: 'button', class: 'gross', onclick: () => antworteMitFeld(st, idx, false, feld),
          'aria-label': `⏳ Noch nicht – ${st.label}`,
        }, '⏳ Noch nicht')),
    ];
  }
  // fertig: Rückmeldung
  return baueFeedback(st, idx);
}

function baueFeedback(st, idx) {
  if (st.feedback) return [el('p', { class: 'klein', text: '✅ Gespeichert – danke!' })];
  const teile = [];
  const genuss = st.fleisch.art !== 'sicher';
  const mess = einstellungen.messModus;
  let ruheFeld = null;
  let notizFeld = null;
  if (mess) {
    ruheFeld = el('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', class: 'temp-eingabe', placeholder: '°C', 'aria-label': 'Kerntemperatur nach der Ruhezeit' });
    notizFeld = el('input', { type: 'text', maxlength: '120', class: 'notiz', placeholder: 'Notiz, z. B. Herdstufe 7, Gusseisen', 'aria-label': 'Notiz' });
    teile.push(
      el('label', { class: 'temp-zeile' }, el('span', { text: '🌡️ Kern nach der Ruhezeit:' }), ruheFeld),
      notizFeld);
  }
  const speichere = (urteil) => {
    if (gesperrt(st, idx) || st.feedback) return;
    const aenderung = {};
    if (mess) {
      const r = leseTemp(ruheFeld.value, TEMP_BEREICH.kern);
      if (r.fehler) { meldeUngueltig(ruheFeld); return; }
      aenderung.nachRuhe = r.leer ? null : r.wert;
      aenderung.notiz = notizFeld.value.trim();
    }
    if (urteil) {
      aenderung.urteil = { roh: 'zu roh', gut: 'genau richtig', durch: 'zu durch' }[urteil];
      if (genuss) {
        // Mehrere Stücke derselben Sorte/Garstufe in einem Durchgang: höchstens ±1 °C nach Mehrheit
        const key = anpassungsSchluessel(st.fleisch, st.stufe);
        lauf.urteile[key] = [...(lauf.urteile[key] || []), urteil];
        const neu = anpassungAusUrteilen(st.plan.anpassung, lauf.urteile[key]);
        if (neu !== anpassungsWert(anpassung, key)) {
          anpassung = { ...anpassung, [key]: neu };
          if (!neu) delete anpassung[key];
          speicher.setAnpassung(anpassung);
          toast(`🎚️ ${st.fleisch.tier} ${STUFEN[st.stufe].label}: künftig ${grad(st.plan.zielBasis + neu)}`);
        }
      }
    }
    if (st.messungId) speicher.aendereMessung(st.messungId, aenderung);
    st.feedback = urteil || 'ok';
    st.dom.aktion.replaceChildren(el('p', { class: 'klein', text: '✅ Gespeichert – danke!' }));
    sichereLauf();
  };
  if (genuss) {
    teile.push(
      el('p', { class: 's-frage', text: 'Wie war der Gargrad auf dem Teller?' }),
      el('div', { class: 'drei' },
        el('button', { type: 'button', class: 'mittel', onclick: () => speichere('roh') }, '🩸 zu roh'),
        el('button', { type: 'button', class: 'mittel', onclick: () => speichere('gut') }, '👌 genau richtig'),
        el('button', { type: 'button', class: 'mittel', onclick: () => speichere('durch') }, '🔥 zu durch')));
  } else if (mess) {
    teile.push(el('button', { type: 'button', class: 'mittel', onclick: () => speichere(null) }, '💾 Speichern'));
  } else {
    teile.push(el('p', { class: 'klein', text: '🛡️ Sicher durchgegart – guten Appetit!' }));
  }
  return teile;
}

function meldeUngueltig(feld) {
  feld.setAttribute('aria-invalid', 'true');
  toast(`🌡️ „${feld.value}“ ist kein plausibler Messwert – bitte prüfen (Komma vergessen?).`);
  feld.focus();
}

function ueberspringe(st, idx) {
  if (gesperrt(st, idx)) return;
  tonEntsperren();
  const s = aktSchritt(st);
  if (s.typ !== 'timer' || s.halte) return;   // BfR-Haltephase ist nie überspringbar
  const vergangen = Math.max(0, s.sek - Math.max(0, restMs(st)) / 1000);
  if (s.kochen) st.gekochtSek += vergangen;
  naechsterSchritt(st, lauf.pausiertSeit || Date.now());
  renderTimer();
}

function antworteMitFeld(st, idx, ja, feld) {
  if (gesperrt(st, idx)) return;
  const m = leseTemp(feld.value, TEMP_BEREICH.kern);
  if (m.fehler) { meldeUngueltig(feld); return; }
  feld.removeAttribute('aria-invalid');
  antworte(st, ja, m.leer ? null : m.wert, feld);
}

function antworte(st, ja, gemessen, feld = null) {
  tonEntsperren();
  const s = aktSchritt(st);
  if (s.typ !== 'check') return;
  const ende = lauf.pausiertSeit || Date.now();
  const sicher = st.fleisch.art === 'sicher';
  const hat = Number.isFinite(gemessen);

  if (sicher && ja && !hat) {
    toast('🛡️ Bitte den gemessenen Wert eintragen – bei Schwein und Geflügel zählt nur die Messung.');
    feld?.focus();
    return;
  }
  // Widerspruch zwischen Messwert und Knopf → nachfragen statt still übernehmen
  if (hat && !ja && gemessen >= s.grenze) {
    const frage = s.art === 'halte'
      ? `${grad(gemessen)} ist mindestens ${s.grenze} °C. Kontrolle bestanden?`
      : `${grad(gemessen)} – die ${s.grenze} °C sind schon erreicht. Jetzt herausnehmen?`;
    if (confirm(frage)) ja = true;
  } else if (hat && ja && gemessen < s.grenze) {
    if (sicher) {
      // Sicherheitsregel: eine eingetragene Temperatur unter der Grenze zählt nie als „Ja“
      ja = false;
      toast(`🛡️ ${grad(gemessen)} ist unter ${s.grenze} °C – weiter garen.`);
    } else if (!confirm(`${grad(gemessen)} ist unter ${s.grenze} °C. Trotzdem jetzt herausnehmen?`)) {
      ja = false;
    }
  }
  if (ja && s.art === 'halte' && !st.halteAbgelaufen) {
    toast('🛡️ Die Haltephase ist noch nicht abgelaufen.');   // zweite Sicherung, normal unerreichbar
    return;
  }

  // Beim Messen vor dem Herausnehmen liegt das Fleisch weiter auf der Hitze → zählt als Garzeit
  if (s.art === 'raus' && Number.isFinite(st.checkSeit)) {
    const warte = Math.max(0, (ende - st.checkSeit) / 1000);
    st.gekochtSek += warte;
    st.messwarteSek = (st.messwarteSek || 0) + warte;
  }
  st.checkSeit = null;

  if (s.erste && !st.ersteErfasst) {
    st.ersteErfasst = true;
    st.ersteMessung = hat ? gemessen : null;
    st.gekochtBeiErster = st.gekochtSek;
  }

  if (!ja) {
    if (s.art === 'raus') st.neinAnzahl += 1;
    const extra = JSON.parse(JSON.stringify(s.neinSchritte));
    const erster = extra[0];
    if (erster?.typ === 'timer' && s.art === 'raus') {
      const z = zusatzzeit({ tStart: st.plan.tStart, grenze: s.grenze, gemessen, gekochtSek: st.gekochtSek });
      erster.sek = z > 0 ? z : ZUSATZ_MIN_SEK;
      if (hat) erster.text = `${grad(gemessen)} – noch ca. ${fmt(erster.sek)} Min. weiter, einmal wenden.`;
    }
    st.schritte.splice(st.idx + 1, 0, ...extra, { ...s, erste: false });
  } else {
    if (s.art === 'halte') st.halteAbgelaufen = false;
    if (s.art === 'raus' && !st.rausErledigt) {
      st.rausErledigt = true;
      erfasseMessung(st, hat ? gemessen : null, ende);
    }
  }
  naechsterSchritt(st, ende);
  renderTimer();
}

/** Beim ersten Herausnehmen: Messung speichern und ggf. Geräte-Faktor lernen. */
function erfasseMessung(st, rausGemessen, zeitpunkt) {
  const p = st.plan;
  const jetzt = new Date(zeitpunkt);
  const sicher = st.fleisch.art === 'sicher';
  let neuerFaktor = null;
  // Nachgeholte Kochschritte (App im Hintergrund) sind ungenau → nicht daraus lernen
  if (einstellungen.lernen && !st.aufgeholt) {
    const k = kalibriere({
      faktor: st.faktorSnapshot, planSek: p.garSek, tStart: p.tStart, raus: p.raus,
      ersteMessung: st.ersteMessung, gekochtBeiErster: st.gekochtBeiErster,
      gekochtGesamt: st.gekochtSek, neinAnzahl: st.neinAnzahl,
    });
    const g = k && geraete.find((x) => x.id === st.cfg.geraetId);
    if (g) {
      if (sicher) {
        g.faktorSicher = lerneFaktor({ alt: effektiverFaktor(g, 'sicher'), snapshot: st.faktorSnapshot, verhaeltnis: k.verhaeltnis });
        g.lernSchritteSicher = (g.lernSchritteSicher || 0) + 1;
        neuerFaktor = g.faktorSicher;
      } else {
        g.faktor = lerneFaktor({ alt: g.faktor ?? 1, snapshot: st.faktorSnapshot, verhaeltnis: k.verhaeltnis });
        g.lernSchritte = (g.lernSchritte || 0) + 1;
        neuerFaktor = g.faktor;
      }
      speicher.setGeraete(geraete);
    }
  }
  const messung = {
    id: neueId(),
    datum: jetzt.toLocaleDateString('de-DE'),
    uhrzeit: jetzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    zeitstempel: jetzt.toISOString(),
    fleisch: st.fleisch.name, tier: st.fleisch.tier, dicke: st.cfg.dicke,
    stufe: p.stufenLabel, ziel: p.ziel, raus: p.raus,
    start: st.start.name, tStart: p.tStart, tStartGemessen: st.tStartGemessen != null,
    geraet: st.geraet.name, geraetTyp: GERAETE_TYPEN[st.geraet.typ]?.name || st.geraet.typ,
    faktor: st.faktorSnapshot,
    planSek: p.garSek, gekochtBeiErster: Math.round(st.gekochtBeiErster ?? st.gekochtSek),
    ersteMessung: st.ersteMessung ?? null, neinAnzahl: st.neinAnzahl,
    gekochtGesamt: Math.round(st.gekochtSek), rausGemessen,
    nachRuhe: null, urteil: null, neuerFaktor,
    messModus: !!einstellungen.messModus, notiz: '',
    messwarteSek: Math.round(st.messwarteSek || 0), ruheSek: p.ruheSek, aufgeholt: !!st.aufgeholt,
  };
  if (speicher.neueMessung(messung)) st.messungId = messung.id;
  if (neuerFaktor != null && Math.abs(neuerFaktor - st.faktorSnapshot) >= 0.01) {
    toast(`🔁 ${st.geraet.name}${sicher ? ' (Schwein/Geflügel)' : ''}: Zeiten künftig × ${faktorText(neuerFaktor)}`);
  } else if (einstellungen.lernen && st.ersteMessung == null && !einstellungen.messModus) {
    toast('💡 Tipp: Messwert eintragen – dann lernt die App die Zeiten für dein Gerät.');
  }
}

function aktualisierePauseKnopf() {
  $('t-pause').textContent = lauf.pausiertSeit ? '▶️ Fortsetzen' : '⏸️ Pause';
}

function pause() {
  if (lauf.alleFertig) return;
  tonEntsperren();
  if (lauf.pausiertSeit) {
    const delta = Date.now() - lauf.pausiertSeit;
    for (const st of lauf.stuecke) {
      const s = aktSchritt(st);
      if (s.typ === 'timer') st.endeUm += delta;
      if (s.typ === 'check' && Number.isFinite(st.checkSeit)) st.checkSeit += delta;
    }
    lauf.pausiertSeit = null;
  } else {
    lauf.pausiertSeit = Date.now();
  }
  aktualisierePauseKnopf();
  sichereLauf();
  renderTimer();
}

function beende() {
  clearInterval(lauf.tick);
  lauf.aktiv = false;
  lauf.alleFertig = false;
  lauf.pausiertSeit = null;
  lauf.stuecke = [];
  lauf.urteile = {};
  speicher.loescheLauf();
  bildschirmFrei();
  stille();
  zeige('v-auswahl');
}

$('start').addEventListener('click', starte);
$('t-pause').addEventListener('click', pause);
$('t-abbruch').addEventListener('click', () => { if (confirm('Garvorgang wirklich abbrechen?')) beende(); });
$('t-neu').addEventListener('click', () => {
  if (Date.now() < lauf.neuSperreBis) return;
  if (teller.length && confirm('Liste der Stücke leeren?')) { teller = []; speicher.setTeller(teller); }
  beende();
});
$('t-ton').addEventListener('click', async () => {
  const ok = await tonReparieren();
  piep(1);
  spracheEntsperren(ok ? 'Ton ist wieder an.' : '');
  toast(ok ? '🔔 Ton ist wieder an.' : '🔇 Ton noch aus – Lautstärke und Stummschalter prüfen.');
  renderTimer();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (!lauf.aktiv) return;
    stille();                                 // veraltete Ansagen verwerfen
    ticke();                                  // erst nachholen …
    if (!lauf.alleFertig) wachHalten();       // … dann nur noch anlassen, wenn nicht alles fertig ist
  } else {
    sichereLauf();
  }
});
window.addEventListener('pagehide', sichereLauf);
// iOS: Ton bei jeder Berührung (re-)aktivieren, z. B. nach Anruf oder Hintergrund.
// WebKit zählt dafür nur touchend/click als Nutzergeste, nicht pointerdown.
document.addEventListener('touchend', () => tonEntsperren(), { capture: true, passive: true });
document.addEventListener('click', () => tonEntsperren(), { capture: true });
window.addEventListener('beforeunload', (e) => {
  if (lauf.aktiv && !lauf.alleFertig) { sichereLauf(); e.preventDefault(); e.returnValue = ''; }
});

// ═════════════════════════ Einstellungen ═════════════════════════
function renderEinstellungen() {
  $('opt-mess').checked = !!einstellungen.messModus;
  $('opt-lernen').checked = !!einstellungen.lernen;
  $('opt-musik').checked = !!einstellungen.musikMischen;

  $('geraet-typ').replaceChildren(...Object.entries(GERAETE_TYPEN).map(([id, t]) =>
    el('option', { value: id, text: `${t.emoji} ${t.name}` })));

  $('geraete-liste').replaceChildren(...geraete.map((g) => {
    const t = GERAETE_TYPEN[g.typ] || GERAETE_TYPEN.pfanne;
    const f = (g.faktor ?? 1);
    const lern = [
      g.lernSchritte ? `Rind/Lamm: Zeit × ${faktorText(f)} (${g.lernSchritte}× gelernt)` : 'Rind/Lamm: noch nicht gelernt',
      g.lernSchritteSicher ? `Schwein/Geflügel: × ${faktorText(g.faktorSicher)} (${g.lernSchritteSicher}×)` : null,
    ].filter(Boolean).join(' · ');
    const nichtsGelernt = !g.lernSchritte && !g.lernSchritteSicher && f === 1;
    return el('li', { class: 'geraet-eintrag' },
      el('div', {}, el('b', { text: `${t.emoji} ${g.name}` }), el('small', { text: `${t.name} · ${lern}` })),
      el('div', { class: 'knopf-reihe' },
        el('button', {
          type: 'button', class: 'mini', 'aria-label': `✏️ ${g.name} umbenennen`,
          onclick: () => {
            const neu = prompt('Neuer Name:', g.name);
            if (neu && neu.trim()) { g.name = neu.trim().slice(0, 24); speicher.setGeraete(geraete); renderEinstellungen(); }
          },
        }, '✏️'),
        el('button', {
          type: 'button', class: 'mini', 'aria-label': `↺ ${g.name}: Gelerntes zurücksetzen`, disabled: nichtsGelernt,
          onclick: () => {
            if (!confirm(`Gelernte Zeiten für „${g.name}“ zurücksetzen?`)) return;
            g.faktor = 1; g.lernSchritte = 0; delete g.faktorSicher; delete g.lernSchritteSicher;
            speicher.setGeraete(geraete); renderEinstellungen();
          },
        }, '↺'),
        el('button', {
          type: 'button', class: 'mini', 'aria-label': `🗑️ ${g.name} löschen`, disabled: geraete.length <= 1,
          onclick: () => {
            if (!confirm(`„${g.name}“ löschen?`)) return;
            geraete = geraete.filter((x) => x.id !== g.id);
            speicher.setGeraete(geraete);
            renderEinstellungen();
          },
        }, '🗑️')));
  }));

  const eintraege = Object.entries(anpassung).filter(([, v]) => v);
  $('anpass-liste').replaceChildren(...(eintraege.length
    ? eintraege.map(([k, v]) => {
      const [tier, stufe] = k.split(':');
      return el('li', { text: `${tier} · ${STUFEN[stufe]?.label || stufe}: ${v > 0 ? '+' : ''}${v} °C` });
    })
    : [el('li', { class: 'klein', text: 'Noch keine Anpassungen – es gelten die Tabellenwerte.' })]));
  $('anpass-reset').disabled = !eintraege.length;

  istDauerhaft().then((dauerhaft) => {
    $('d-status').textContent = dauerhaft
      ? '✅ Der Browser hält die Daten dauerhaft vor.'
      : istIOS() && !istInstalliert()
        ? '⚠️ Safari löscht Daten nach 7 Tagen ohne Besuch. Am besten als Home-Screen-App nutzen und ab und zu sichern.'
        : 'ℹ️ Der Browser darf die Daten bei Platzmangel löschen – ab und zu sichern.';
  });
}

$('opt-mess').addEventListener('change', (e) => {
  einstellungen = { ...einstellungen, messModus: e.target.checked };
  speicher.setEinstellungen(einstellungen);
  toast(e.target.checked ? '🧪 Mess-Modus an' : 'Mess-Modus aus');
});
$('opt-lernen').addEventListener('change', (e) => {
  einstellungen = { ...einstellungen, lernen: e.target.checked };
  speicher.setEinstellungen(einstellungen);
});
$('opt-musik').addEventListener('change', (e) => {
  einstellungen = { ...einstellungen, musikMischen: e.target.checked };
  speicher.setEinstellungen(einstellungen);
  setzeMusikMischen(einstellungen.musikMischen);
  tonEntsperren();
  toast(e.target.checked ? '🎵 Musik läuft weiter – Stummschalter dann aus!' : '🔔 Töne auch im Stummmodus');
});
$('geraet-hinzu').addEventListener('click', () => {
  const name = $('geraet-name').value.trim().slice(0, 24);
  if (!name) { toast('Bitte einen Namen eingeben.'); $('geraet-name').focus(); return; }
  geraete.push({ id: neueId(), name, typ: $('geraet-typ').value, faktor: 1, lernSchritte: 0 });
  speicher.setGeraete(geraete);
  $('geraet-name').value = '';
  renderEinstellungen();
  toast(`➕ ${name} angelegt`);
});
$('anpass-reset').addEventListener('click', () => {
  if (!confirm('Alle persönlichen Gargrad-Anpassungen zurücksetzen?')) return;
  anpassung = {};
  speicher.setAnpassung(anpassung);
  renderEinstellungen();
});

async function signalTest() {
  const tonOk = await tonReparieren();
  spracheEntsperren('Signal-Test. Meat again ist bereit.');
  piep(3);
  vibriere();
  const wake = (await bildschirmAn()) && !wakeLockUnzuverlaessig();
  if (!lauf.aktiv || lauf.alleFertig) bildschirmFrei();
  return [
    [tonOk, tonOk ? 'Piepton gestartet – hörst du ihn? Sonst Lautstärke prüfen.' : 'Ton nicht verfügbar – Lautstärke prüfen und erneut testen'],
    ['speechSynthesis' in window, 'speechSynthesis' in window ? 'Sprachansage gestartet – hörst du „Signal-Test“?' : 'Sprachansage nicht verfügbar'],
    [einstellungen.musikMischen ? null : true, einstellungen.musikMischen ? 'Musik-Modus: Stummschalter muss aus sein' : 'Töne auch im Stummmodus'],
    [kannVibrieren(), kannVibrieren() ? 'Vibration' : 'Vibration nicht verfügbar (auf dem iPhone normal)'],
    [wake, wake ? 'Bildschirm bleibt beim Garen an'
      : wakeLockUnzuverlaessig() ? 'Bildschirm anlassen ist in dieser iOS-Version unzuverlässig – Auto-Sperre auf „Nie“ stellen'
        : 'Bildschirm anlassen nicht möglich – Auto-Sperre manuell ausschalten'],
    [istInstalliert(), istInstalliert() ? 'Als App installiert' : 'Nicht installiert (Tipp: zum Home-Bildschirm hinzufügen)'],
  ];
}
$('test-signal').addEventListener('click', async () => {
  const zeilen = await signalTest();
  const ul = $('test-ergebnis');
  ul.hidden = false;
  ul.replaceChildren(...zeilen.map(([ok, text]) => el('li', { text: `${ok ? '✅' : ok === null ? 'ℹ️' : '➖'} ${text}` })));
});
$('test-schnell').addEventListener('click', async () => {
  await signalTest();
  toast('🔔 Signal-Test: Piepton und Ansage gehört? Details unter ⚙️');
});

// ───────── Datei teilen oder herunterladen ─────────
async function gibDatei(inhalt, dateiname, typ, titel) {
  const blob = new Blob([inhalt], { type: `${typ};charset=utf-8` });
  try {
    const datei = new File([blob], dateiname, { type: typ });
    if (navigator.canShare?.({ files: [datei] })) {
      await navigator.share({ files: [datei], title: titel });
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;   // Teilen abgebrochen
  }
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: dateiname });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
const heute = () => new Date().toISOString().slice(0, 10);

$('d-sichern').addEventListener('click', () => gibDatei(
  JSON.stringify(sicherungErstellen(), null, 1), `meat-again-sicherung-${heute()}.json`, 'application/json', 'Meat again – Sicherung'));
$('d-laden').addEventListener('click', () => {
  if (lauf.aktiv && !lauf.alleFertig) { toast('Bitte erst nach dem Garen Daten laden.'); return; }
  $('d-datei').click();
});
$('d-datei').addEventListener('change', async (e) => {
  const datei = e.target.files?.[0];
  e.target.value = '';
  if (!datei) return;
  try {
    if (datei.size > 5 * 1024 * 1024) throw new Error('Die Datei ist zu groß.');
    const sauber = sicherungPruefen(JSON.parse(await datei.text()));
    if (!confirm(`Sicherung laden? ${sauber.geraete.length} Geräte und ${sauber.messungen.length} Messungen ersetzen die Daten auf diesem Gerät.`)) return;
    if (!sicherungEinspielen(sauber)) throw new Error('Speichern fehlgeschlagen (Speicher voll?).');
    einstellungen = speicher.einstellungen();
    geraete = speicher.geraete();
    anpassung = speicher.anpassung();
    setzeMusikMischen(einstellungen.musikMischen);
    renderEinstellungen();
    toast('📥 Sicherung geladen.');
  } catch (fehler) {
    toast(`⚠️ ${fehler instanceof SyntaxError ? 'Die Datei ist keine gültige Sicherung.' : fehler.message}`);
  }
});

// ═════════════════════════ Messungen ═════════════════════════
function renderMessungen() {
  const alle = speicher.messungen().slice().reverse();
  $('m-anzahl').textContent = alle.length
    ? `${alle.length} ${alle.length === 1 ? 'Messung' : 'Messungen'} gespeichert (neueste zuerst).`
    : 'Noch keine Messungen. Sie entstehen automatisch beim Herausnehmen – mit eingetragenen Temperaturen sind sie am wertvollsten.';
  $('m-export').disabled = !alle.length;
  $('m-loeschen').disabled = !alle.length;
  $('m-liste').replaceChildren(...alle.map((m) => el('li', { class: 'm-eintrag' },
    el('b', { text: `${m.datum} ${m.uhrzeit} · ${m.fleisch} ${cm(m.dicke)} · ${m.stufe}` }),
    el('small', {
      text: [
        `${m.geraet}`,
        `Plan ${fmt(m.planSek)} → tatsächlich ${fmt(m.gekochtGesamt)}`,
        m.ersteMessung != null ? `1. Messung ${grad(m.ersteMessung)}` : null,
        m.rausGemessen != null ? `raus ${grad(m.rausGemessen)}` : null,
        m.nachRuhe != null ? `nach Ruhe ${grad(m.nachRuhe)}` : null,
        m.urteil ? `„${m.urteil}“` : null,
        m.messModus ? '🧪' : null,
      ].filter(Boolean).join(' · '),
    }),
    m.notiz ? el('small', { text: `📝 ${m.notiz}` }) : null)));
}

$('m-export').addEventListener('click', () => gibDatei(
  csv(speicher.messungen()), `meat-again-messungen-${heute()}.csv`, 'text/csv', 'Meat again – Messungen'));
$('m-loeschen').addEventListener('click', () => {
  if (!confirm('Alle Messungen unwiderruflich löschen? Tipp: vorher als CSV exportieren.')) return;
  speicher.setMessungen([]);
  renderMessungen();
});

// ═════════════════════════ Start ═════════════════════════
dauerhaftSpeichern();
if (!wiederherstellen()) zeige('v-auswahl');

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline-Modus optional */ });
}
