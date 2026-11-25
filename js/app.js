// Meat again – Oberfläche und Ablaufsteuerung
import { FLEISCH, STUFEN, START, FARBEN, MAX_STUECKE, GERAETE_TYPEN, SICHER } from './data.js';
import {
  berechne, ablauf, zusatzzeit, kalibriere, neueAnpassung, anpassungsSchluessel,
  zeitplan, fmt, csv, ZUSATZ_MIN_SEK, FAKTOR_MIN, FAKTOR_MAX,
} from './model.js';
import { speicher, dauerhaftSpeichern } from './speicher.js';
import {
  istIOS, istInstalliert, tonEntsperren, piep, spracheEntsperren, sprich, stille,
  kannVibrieren, vibriere, bildschirmAn, bildschirmFrei, signal,
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
const zahl = (v) => {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const cm = (d) => `${String(d).replace('.', ',')} cm`;
const neueId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

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

const auswahl = {
  fleischId: 'rumpsteak', dicke: 2.5, stufe: 'mediumRare', startId: 'kalt', geraetId: 'pfanne',
  ...(speicher.auswahl() || {}),
};

const finde = (liste, id) => liste.find((x) => x.id === id) || liste[0];
const findeGeraet = (id) => geraete.find((g) => g.id === id) || geraete[0];

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
  const tGem = zahl(cfg.tStartGemessen);
  const stufe = stufePassend(fleisch, cfg.stufe);
  const plan = berechne({
    fleisch, stufe, dicke: cfg.dicke,
    tStart: tGem ?? start.temp, geraet, anpassung,
  });
  return { fleisch, start, geraet, stufe, plan, tStartGemessen: tGem };
}

// ═════════════════════════ Navigation ═════════════════════════
const ANSICHTEN = ['v-auswahl', 'v-timer', 'v-einstellungen', 'v-messungen'];
function zeige(id) {
  if (lauf.aktiv && id !== 'v-timer' && !lauf.alleFertig) {
    // Während des Garens nicht aus Versehen wegnavigieren
    if (id === 'v-auswahl') return zeige('v-timer');
  }
  for (const a of ANSICHTEN) $(a).hidden = a !== id;
  if (lauf.aktiv && !lauf.alleFertig && id !== 'v-timer') toast('⏱️ Der Timer läuft weiter – oben auf 🥩 tippen, um zurückzukehren.');
  if (id === 'v-auswahl') renderAuswahl();
  if (id === 'v-einstellungen') renderEinstellungen();
  if (id === 'v-messungen') renderMessungen();
  window.scrollTo(0, 0);
}
$('nav-home').addEventListener('click', () => zeige(lauf.aktiv && !lauf.alleFertig ? 'v-timer' : 'v-auswahl'));
$('nav-einstellungen').addEventListener('click', () => zeige('v-einstellungen'));
$('nav-messungen').addEventListener('click', () => zeige('v-messungen'));

// ═════════════════════════ Auswahl ═════════════════════════
function knopf(cls, gedrueckt, kinder, onClick, extra = {}) {
  return el('button', { type: 'button', class: cls, 'aria-pressed': String(gedrueckt), onclick: onClick, ...extra }, kinder);
}

function speichereAuswahl() { speicher.setAuswahl(auswahl); }

function renderAuswahl() {
  const a = aufloesen(auswahl);
  auswahl.stufe = a.stufe === 'sicher' ? auswahl.stufe : a.stufe;
  if (!geraete.some((g) => g.id === auswahl.geraetId)) auswahl.geraetId = geraete[0].id;

  $('ios-banner').hidden = !(istIOS() && !istInstalliert());
  $('mess-badge').hidden = !einstellungen.messModus;

  // Fleisch
  $('fleisch-liste').replaceChildren(...FLEISCH.map((f) => knopf('karte', f.id === a.fleisch.id,
    [`${f.emoji} ${f.name}`, el('small', { text: f.tier })],
    () => {
      if (auswahl.fleischId !== f.id) { auswahl.fleischId = f.id; auswahl.dicke = f.dicke; }
      aktualisiere();
    })));

  // Dicke
  $('dicke').value = auswahl.dicke;
  $('dicke-wert').textContent = cm(auswahl.dicke);

  // Garstufen
  if (a.fleisch.art === 'sicher') {
    $('stufen-liste').replaceChildren(knopf('chip', true,
      [`🛡️ ${STUFEN.sicher.label}`, el('small', { text: STUFEN.sicher.sub })], () => {}));
  } else {
    $('stufen-liste').replaceChildren(...Object.entries(a.fleisch.stufen).map(([key, basis]) => {
      const d = anpassung[anpassungsSchluessel(a.fleisch, key)] || 0;
      const t = basis + Math.max(-4, Math.min(4, Math.round(d)));
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
  if (document.activeElement !== $('tstart')) $('tstart').value = auswahl.tStartGemessen ?? '';
  $('geraet-liste').replaceChildren(...geraete.map((g) => knopf('chip', g.id === a.geraet.id,
    `${GERAETE_TYPEN[g.typ]?.emoji || '🍳'} ${g.name}`, () => { auswahl.geraetId = g.id; aktualisiere(); })));
  const typInfo = GERAETE_TYPEN[a.geraet.typ];
  $('geraet-info').hidden = !typInfo?.hinweis;
  $('geraet-info').textContent = typInfo?.hinweis ? `⚠️ ${typInfo.hinweis}` : '';

  // Plan
  const p = a.plan;
  $('sicher-info').hidden = !p.sicher;
  $('risiko-info').hidden = !p.risiko;
  $('p-gar').textContent = `${fmt(p.garSek)} Min.`;
  $('p-seite').textContent = `${fmt(p.seiteSek)} Min.`;
  $('p-raus').textContent = `${p.raus} °C`;
  $('p-ruhe').textContent = `${fmt(p.ruheSek)} Min.`;
  $('p-ziel').textContent = p.sicher ? `≥ ${SICHER.hold} °C (2 Min.)` : `${p.ziel} °C`;
  const gelernt = Math.abs(p.faktor - 1) >= 0.005;
  $('p-faktor').hidden = !gelernt;
  $('p-faktor').textContent = gelernt
    ? `🔁 Gelernt für „${a.geraet.name}“: Zeit × ${p.faktor.toFixed(2).replace('.', ',')}` : '';

  renderTeller();
}

function aktualisiere() { speichereAuswahl(); renderAuswahl(); }

$('dicke').addEventListener('input', (e) => { auswahl.dicke = Number(e.target.value); aktualisiere(); });
$('tstart').addEventListener('input', (e) => {
  const v = zahl(e.target.value);
  auswahl.tStartGemessen = v;
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

function renderTeller() {
  const liste = $('teller-liste');
  liste.replaceChildren(...teller.map((s) => {
    const r = aufloesen(s);
    const farbe = finde(FARBEN, s.farbeId);
    return el('li', { class: 'teller-eintrag', style: `--farbe:${farbe.css}` },
      el('span', { class: 'punkt', 'aria-hidden': 'true' }),
      el('div', { class: 'teller-text' },
        el('b', { text: `${s.name ? `${s.name} · ` : ''}${r.fleisch.emoji} ${r.fleisch.name}` }),
        el('small', { text: `${farbe.name} · ${cm(s.dicke)} · ${r.plan.stufenLabel} · ${r.geraet.name} · ${fmt(r.plan.garSek + r.plan.ruheSek)} Min.` })),
      el('button', {
        type: 'button', class: 'mini', 'aria-label': `${stueckLabel(s, teller)} entfernen`,
        onclick: () => { teller = teller.filter((x) => x.id !== s.id); speicher.setTeller(teller); renderTeller(); },
      }, '✖'));
  }));

  const n = teller.length;
  $('hinzu').disabled = n >= MAX_STUECKE;
  $('teller-hinweis').textContent = n
    ? 'Die Auswahl oben wird erst mit ➕ hinzugefügt. Start nimmt alle Stücke auf dieser Liste.'
    : 'Für ein einzelnes Stück einfach direkt starten.';
  $('start').textContent = n ? `▶️ Los – ${n} ${n === 1 ? 'Stück' : 'Stücke'}` : '▶️ Los!';

  // Zeitplan-Vorschau
  const plan = $('teller-plan');
  plan.hidden = n < 2;
  if (n >= 2) {
    const aufgeloest = teller.map(aufloesen);
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

$('hinzu').addEventListener('click', () => {
  if (teller.length >= MAX_STUECKE) return toast(`Maximal ${MAX_STUECKE} Stücke gleichzeitig.`);
  const frei = FARBEN.find((f) => !teller.some((s) => s.farbeId === f.id)) || FARBEN[0];
  const name = $('name').value.trim().slice(0, 14);
  teller.push({
    id: neueId(), name, farbeId: frei.id,
    fleischId: auswahl.fleischId, stufe: auswahl.stufe, dicke: auswahl.dicke,
    startId: auswahl.startId, geraetId: auswahl.geraetId,
    tStartGemessen: einstellungen.messModus ? zahl(auswahl.tStartGemessen) : null,
  });
  speicher.setTeller(teller);
  $('name').value = '';
  renderTeller();
  toast(`${frei.punkt} ${name || finde(FLEISCH, auswahl.fleischId).name} hinzugefügt`);
});

// ═════════════════════════ Timer (mehrere Stücke) ═════════════════════════
const lauf = {
  aktiv: false, alleFertig: false, stuecke: [], tick: null,
  pausiertSeit: null, letzteErinnerung: 0, wakeOk: true,
};

function starte() {
  tonEntsperren();
  spracheEntsperren('Los geht’s!');
  dauerhaftSpeichern();

  const konfigs = teller.length ? teller : [{
    ...auswahl, id: neueId(), name: $('name').value.trim().slice(0, 14), farbeId: FARBEN[0].id,
    tStartGemessen: einstellungen.messModus ? zahl(auswahl.tStartGemessen) : null,
  }];
  // gemessene Starttemperatur gilt nur für diesen Durchgang
  if (auswahl.tStartGemessen != null) { auswahl.tStartGemessen = null; speichereAuswahl(); }
  const aufgeloest = konfigs.map(aufloesen);
  const { versatz } = zeitplan(aufgeloest.map((r) => r.plan));
  const jetzt = Date.now();

  lauf.stuecke = konfigs.map((cfg, i) => {
    const r = aufgeloest[i];
    const farbe = finde(FARBEN, cfg.farbeId);
    const label = stueckLabel(cfg, konfigs);
    const schritte = ablauf(r.plan, r.fleisch, r.geraet.typ, versatz[i]);
    return {
      id: cfg.id, cfg, farbe, label, ...r,
      geraetSnapshot: { ...r.geraet },
      schritte, idx: 0, endeUm: jetzt + schritte[0].sek * 1000,
      gekochtSek: 0, neinAnzahl: 0, ersteErfasst: false, rausErledigt: false,
      messungId: null, feedback: null, dom: null, renderIdx: -1,
    };
  });
  lauf.aktiv = true;
  lauf.alleFertig = false;
  lauf.pausiertSeit = null;
  lauf.letzteErinnerung = jetzt;

  baueStueckKarten();
  zeige('v-timer');
  $('t-steuer').hidden = false;
  $('t-neu').hidden = true;
  $('t-pause').textContent = '⏸️ Pause';
  wachHalten();
  clearInterval(lauf.tick);
  lauf.tick = setInterval(ticke, 250);
  ticke();
}

async function wachHalten() {
  const ok = await bildschirmAn();
  lauf.wakeOk = ok;
  $('t-wake').hidden = ok;
  $('t-wake').textContent = istIOS()
    ? '⚠️ Der Bildschirm kann nicht automatisch angehalten werden. Bitte für die Kochzeit: Einstellungen → Anzeige & Helligkeit → Automatische Sperre → „Nie“. Sonst kommen keine Signale.'
    : '⚠️ Bildschirm-Sperre konnte nicht verhindert werden – bitte Bildschirm anlassen, sonst kommen die Signale evtl. nicht.';
}

const aktSchritt = (st) => st.schritte[st.idx];
const restMs = (st, jetzt = Date.now()) => (lauf.pausiertSeit ? st.endeUm - lauf.pausiertSeit : st.endeUm - jetzt);

/** Schritt beenden und zum nächsten wechseln. startUm = Startzeitpunkt des nächsten Timers. */
function naechsterSchritt(st, startUm) {
  st.idx = Math.min(st.idx + 1, st.schritte.length - 1);
  const s = aktSchritt(st);
  if (s.typ === 'timer') st.endeUm = startUm + s.sek * 1000;
  if (s.typ === 'fertig') stueckFertig(st);
}

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
        if (s.kochen) st.gekochtSek += s.sek;
        ansagen.push(lauf.stuecke.length > 1 ? `${st.label}: ${s.signal}` : s.signal);
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

function stueckFertig(st) {
  if (lauf.stuecke.every((x) => aktSchritt(x).typ === 'fertig')) {
    lauf.alleFertig = true;
    bildschirmFrei();
  }
  const m = st.messungId;
  if (m) speicher.aendereMessung(m, { gesamtEnde: new Date().toISOString() });
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
    dom.info.textContent = `${st.fleisch.emoji} ${st.fleisch.name} · ${cm(st.cfg.dicke)} · ${st.plan.stufenLabel} · ${st.geraet.name}`;
    return el('article', { class: 'stueck', style: `--farbe:${st.farbe.css}` },
      el('header', { class: 's-kopf' }, dom.name, dom.nr),
      dom.info,
      el('div', { class: 's-zeile' }, dom.titel, dom.zeit),
      el('div', { class: 'balken' }, dom.balken),
      dom.text, dom.aktion, dom.danach);
  }));
}

function renderTimer() {
  const jetzt = Date.now();
  const n = lauf.stuecke.length;

  for (const st of lauf.stuecke) {
    const s = aktSchritt(st);
    const d = st.dom;
    if (st.renderIdx !== st.idx) {
      st.renderIdx = st.idx;
      d.titel.textContent = s.titel;
      d.text.textContent = s.text;
      const ohneFertig = st.schritte.filter((x) => x.typ !== 'fertig').length;
      d.nr.textContent = s.typ === 'fertig' ? '✅' : `Schritt ${Math.min(st.idx + 1, ohneFertig)}/${ohneFertig}`;
      const nx = st.schritte[st.idx + 1];
      d.danach.textContent = nx && nx.typ !== 'fertig' ? `Danach: ${nx.titel}${nx.typ === 'timer' ? ` (${fmt(nx.sek)})` : ''}` : '';
      d.aktion.replaceChildren(...baueAktion(st, s));
      d.zeit.hidden = s.typ !== 'timer';
      d.balken.parentElement.hidden = s.typ !== 'timer';
      d.titel.closest('.stueck').classList.toggle('wartet-auf-dich', s.typ === 'check');
      d.titel.closest('.stueck').classList.toggle('erledigt', s.typ === 'fertig');
    }
    if (s.typ === 'timer') {
      const rest = restMs(st, jetzt);
      d.zeit.textContent = fmt(rest / 1000);
      d.balken.style.width = `${Math.min(100, Math.max(0, 100 * (1 - rest / (s.sek * 1000))))}%`;
    }
  }

  // Held: das Dringendste zuerst
  const checks = lauf.stuecke.filter((st) => aktSchritt(st).typ === 'check');
  const timer = lauf.stuecke.filter((st) => aktSchritt(st).typ === 'timer')
    .sort((a, b) => a.endeUm - b.endeUm);
  const held = $('held');
  held.classList.toggle('dringend', checks.length > 0);
  if (lauf.alleFertig) {
    $('h-wer').textContent = n > 1 ? 'Alle Stücke sind fertig' : `${lauf.stuecke[0].fleisch.emoji} ${lauf.stuecke[0].fleisch.name}`;
    $('h-titel').textContent = 'Guten Appetit! 🍽️';
    $('h-zeit').hidden = true;
    $('t-steuer').hidden = true;
    $('t-neu').hidden = false;
  } else if (checks.length) {
    $('h-wer').textContent = n > 1 ? checks.map((st) => `${st.farbe.punkt} ${st.label}`).join(' · ') : '';
    $('h-titel').textContent = checks.length > 1 ? '🌡️ Jetzt messen!' : `🌡️ ${aktSchritt(checks[0]).titel}`;
    $('h-zeit').hidden = true;
  } else if (timer.length) {
    const st = timer[0];
    const s = aktSchritt(st);
    $('h-wer').textContent = n > 1 ? `Als Nächstes: ${st.farbe.punkt} ${st.label}` : `${st.fleisch.emoji} ${st.label} · ${cm(st.cfg.dicke)} · ${st.plan.stufenLabel}`;
    $('h-titel').textContent = n > 1 ? `${s.titel} → ${s.signal}` : s.titel;
    $('h-zeit').hidden = false;
    $('h-zeit').textContent = fmt(restMs(st, jetzt) / 1000);
  }
  $('h-zeit').classList.toggle('pausiert', !!lauf.pausiertSeit);
}

/** Aktionsbereich eines Stücks, abhängig vom Schritt. */
function baueAktion(st, s) {
  if (s.typ === 'timer') {
    return [el('button', {
      type: 'button', class: 'mini weiter', onclick: () => ueberspringe(st),
      'aria-label': `${st.label}: Schritt überspringen`,
    }, s.warten ? '⏭️ Jetzt schon auflegen' : '⏭️ Weiter')];
  }
  if (s.typ === 'check') {
    const pflicht = einstellungen.messModus;
    const feld = el('input', {
      type: 'number', inputmode: 'decimal', step: '0.5', min: '-20', max: '110', class: 'temp-eingabe',
      placeholder: '°C', 'aria-label': `${st.label}: gemessene Kerntemperatur in °C`,
    });
    return [
      el('p', { class: 's-frage', text: s.frage }),
      el('label', { class: 'temp-zeile' },
        el('span', { text: pflicht ? 'Gemessen (bitte eintragen):' : 'Gemessen (optional, hilft beim Lernen):' }), feld),
      el('div', { class: 'zwei' },
        el('button', { type: 'button', class: 'gross primaer', onclick: () => antworte(st, true, zahl(feld.value)) }, '✅ Ja'),
        el('button', { type: 'button', class: 'gross', onclick: () => antworte(st, false, zahl(feld.value)) }, '⏳ Noch nicht')),
    ];
  }
  // fertig: Rückmeldung
  return baueFeedback(st);
}

function baueFeedback(st) {
  const teile = [];
  const genuss = st.fleisch.art !== 'sicher';
  const mess = einstellungen.messModus;
  let ruheFeld = null;
  let notizFeld = null;
  if (mess) {
    ruheFeld = el('input', { type: 'number', inputmode: 'decimal', step: '0.5', class: 'temp-eingabe', placeholder: '°C', 'aria-label': 'Kerntemperatur nach der Ruhezeit' });
    notizFeld = el('input', { type: 'text', maxlength: '120', class: 'notiz', placeholder: 'Notiz, z. B. Herdstufe 7, Gusseisen', 'aria-label': 'Notiz' });
    teile.push(
      el('label', { class: 'temp-zeile' }, el('span', { text: '🌡️ Kern nach der Ruhezeit:' }), ruheFeld),
      notizFeld);
  }
  const speichere = (urteil) => {
    const aenderung = {};
    if (mess) {
      aenderung.nachRuhe = zahl(ruheFeld.value);
      aenderung.notiz = notizFeld.value.trim();
    }
    if (urteil) {
      aenderung.urteil = { roh: 'zu roh', gut: 'genau richtig', durch: 'zu durch' }[urteil];
      if (genuss) {
        const key = anpassungsSchluessel(st.fleisch, st.stufe);
        const neu = neueAnpassung(anpassung[key], urteil);
        if (neu !== (anpassung[key] || 0)) {
          anpassung = { ...anpassung, [key]: neu };
          if (!neu) delete anpassung[key];
          speicher.setAnpassung(anpassung);
          toast(`🎚️ ${st.fleisch.tier} ${STUFEN[st.stufe].label}: künftig ${st.plan.zielBasis + neu} °C`);
        }
      }
    }
    if (st.messungId) speicher.aendereMessung(st.messungId, aenderung);
    st.feedback = urteil || 'ok';
    st.dom.aktion.replaceChildren(el('p', { class: 'klein', text: '✅ Gespeichert – danke!' }));
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

function ueberspringe(st) {
  tonEntsperren();
  const s = aktSchritt(st);
  if (s.typ !== 'timer') return;
  const vergangen = Math.max(0, s.sek - Math.max(0, restMs(st)) / 1000);
  if (s.kochen) st.gekochtSek += vergangen;
  naechsterSchritt(st, lauf.pausiertSeit || Date.now());
  renderTimer();
}

function antworte(st, ja, gemessen) {
  tonEntsperren();
  const s = aktSchritt(st);
  if (s.typ !== 'check') return;

  // Sicherheitsregel: eine eingetragene Temperatur unter der Grenze zählt nie als „Ja“
  if (ja && st.fleisch.art === 'sicher' && Number.isFinite(gemessen) && gemessen < s.grenze) {
    ja = false;
    toast(`🛡️ ${gemessen} °C ist unter ${s.grenze} °C – weiter garen.`);
  }

  if (s.erste && !st.ersteErfasst) {
    st.ersteErfasst = true;
    st.ersteMessung = Number.isFinite(gemessen) ? gemessen : null;
    st.gekochtBeiErster = st.gekochtSek;
  }

  if (!ja) {
    if (s.art === 'raus') st.neinAnzahl += 1;
    const extra = s.neinSchritte.map((x) => ({ ...x, neinSchritte: x.neinSchritte?.map((y) => ({ ...y })) }));
    const erster = extra[0];
    if (erster?.typ === 'timer' && s.art === 'raus') {
      const z = zusatzzeit({ tStart: st.plan.tStart, grenze: s.grenze, gemessen, gekochtSek: st.gekochtSek });
      erster.sek = z > 0 ? z : ZUSATZ_MIN_SEK;
      if (Number.isFinite(gemessen)) erster.text = `${gemessen} °C – noch ca. ${fmt(erster.sek)} Min. weiter, einmal wenden.`;
    }
    const wiederholung = { ...s, erste: false };
    st.schritte.splice(st.idx + 1, 0, ...extra, wiederholung);
  } else if (s.art === 'raus' && !st.rausErledigt) {
    st.rausErledigt = true;
    erfasseMessung(st, gemessen);
  }
  naechsterSchritt(st, lauf.pausiertSeit || Date.now());
  renderTimer();
}

/** Beim ersten Herausnehmen: Messung speichern und ggf. Geräte-Faktor lernen. */
function erfasseMessung(st, rausGemessen) {
  const p = st.plan;
  const jetzt = new Date();
  let neuerFaktor = null;
  if (einstellungen.lernen) {
    const k = kalibriere({
      faktor: st.geraetSnapshot.faktor ?? 1,
      planSek: p.garSek, tStart: p.tStart, raus: p.raus,
      ersteMessung: st.ersteMessung, gekochtBeiErster: st.gekochtBeiErster,
      gekochtGesamt: st.gekochtSek, neinAnzahl: st.neinAnzahl,
    });
    if (k) {
      // auf das aktuelle Profil anwenden (falls mehrere Stücke dasselbe Gerät nutzen: nacheinander)
      const g = geraete.find((x) => x.id === st.geraet.id);
      if (g) {
        const alt = g.faktor ?? 1;
        const neu = alt * (k.faktor / (st.geraetSnapshot.faktor ?? 1));
        g.faktor = Math.round(Math.min(FAKTOR_MAX, Math.max(FAKTOR_MIN, neu)) * 1000) / 1000;
        g.lernSchritte = (g.lernSchritte || 0) + 1;
        speicher.setGeraete(geraete);
        neuerFaktor = g.faktor;
      }
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
    faktor: st.geraetSnapshot.faktor ?? 1,
    planSek: p.garSek, gekochtBeiErster: Math.round(st.gekochtBeiErster ?? st.gekochtSek),
    ersteMessung: st.ersteMessung ?? null, neinAnzahl: st.neinAnzahl,
    gekochtGesamt: Math.round(st.gekochtSek), rausGemessen: Number.isFinite(rausGemessen) ? rausGemessen : null,
    nachRuhe: null, urteil: null, neuerFaktor,
    messModus: !!einstellungen.messModus, notiz: '',
  };
  if (speicher.neueMessung(messung)) st.messungId = messung.id;
  if (neuerFaktor != null && Math.abs(neuerFaktor - (st.geraetSnapshot.faktor ?? 1)) >= 0.01) {
    toast(`🔁 ${st.geraet.name}: Zeiten künftig × ${neuerFaktor.toFixed(2).replace('.', ',')}`);
  }
}

function pause() {
  if (lauf.alleFertig) return;
  tonEntsperren();
  if (lauf.pausiertSeit) {
    const delta = Date.now() - lauf.pausiertSeit;
    for (const st of lauf.stuecke) if (aktSchritt(st).typ === 'timer') st.endeUm += delta;
    lauf.pausiertSeit = null;
    $('t-pause').textContent = '⏸️ Pause';
  } else {
    lauf.pausiertSeit = Date.now();
    $('t-pause').textContent = '▶️ Weiter';
  }
  renderTimer();
}

function beende() {
  clearInterval(lauf.tick);
  lauf.aktiv = false;
  lauf.alleFertig = false;
  lauf.pausiertSeit = null;
  bildschirmFrei();
  stille();
  zeige('v-auswahl');
}

$('start').addEventListener('click', starte);
$('t-pause').addEventListener('click', pause);
$('t-abbruch').addEventListener('click', () => { if (confirm('Garvorgang wirklich abbrechen?')) beende(); });
$('t-neu').addEventListener('click', () => {
  if (teller.length && confirm('Liste der Stücke leeren?')) { teller = []; speicher.setTeller(teller); }
  beende();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && lauf.aktiv) {
    if (!lauf.alleFertig) wachHalten();
    ticke();
  }
});
// iOS: Ton bei jeder Berührung (re-)aktivieren, z. B. nach Anruf oder Hintergrund
document.addEventListener('pointerdown', () => tonEntsperren(), { passive: true });
window.addEventListener('beforeunload', (e) => {
  if (lauf.aktiv && !lauf.alleFertig) { e.preventDefault(); e.returnValue = ''; }
});

// ═════════════════════════ Einstellungen ═════════════════════════
function renderEinstellungen() {
  $('opt-mess').checked = !!einstellungen.messModus;
  $('opt-lernen').checked = !!einstellungen.lernen;

  $('geraet-typ').replaceChildren(...Object.entries(GERAETE_TYPEN).map(([id, t]) =>
    el('option', { value: id, text: `${t.emoji} ${t.name}` })));

  $('geraete-liste').replaceChildren(...geraete.map((g) => {
    const t = GERAETE_TYPEN[g.typ] || GERAETE_TYPEN.pfanne;
    const f = (g.faktor ?? 1);
    const lern = g.lernSchritte
      ? `Zeit × ${f.toFixed(2).replace('.', ',')} · ${g.lernSchritte}× gelernt`
      : 'noch nicht gelernt';
    return el('li', { class: 'geraet-eintrag' },
      el('div', {}, el('b', { text: `${t.emoji} ${g.name}` }), el('small', { text: `${t.name} · ${lern}` })),
      el('div', { class: 'knopf-reihe' },
        el('button', {
          type: 'button', class: 'mini', 'aria-label': `${g.name} umbenennen`,
          onclick: () => {
            const neu = prompt('Neuer Name:', g.name);
            if (neu && neu.trim()) { g.name = neu.trim().slice(0, 24); speicher.setGeraete(geraete); renderEinstellungen(); }
          },
        }, '✏️'),
        el('button', {
          type: 'button', class: 'mini', 'aria-label': `${g.name}: Gelerntes zurücksetzen`, disabled: !g.lernSchritte && f === 1,
          onclick: () => {
            if (!confirm(`Gelernte Zeiten für „${g.name}“ zurücksetzen?`)) return;
            g.faktor = 1; g.lernSchritte = 0; speicher.setGeraete(geraete); renderEinstellungen();
          },
        }, '↺'),
        el('button', {
          type: 'button', class: 'mini', 'aria-label': `${g.name} löschen`, disabled: geraete.length <= 1,
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
  tonEntsperren();
  spracheEntsperren('Signal-Test. Meat again ist bereit.');
  const tonOk = piep(3);
  vibriere();
  const wake = await bildschirmAn();
  if (!lauf.aktiv) bildschirmFrei();
  const zeilen = [
    [tonOk, tonOk ? 'Piepton gestartet – hörst du ihn? Sonst Lautstärke prüfen.' : 'Ton nicht verfügbar'],
    ['speechSynthesis' in window, 'speechSynthesis' in window ? 'Sprachansage gestartet – hörst du „Signal-Test“?' : 'Sprachansage nicht verfügbar'],
    [kannVibrieren(), kannVibrieren() ? 'Vibration' : 'Vibration nicht verfügbar (auf dem iPhone normal)'],
    [wake, wake ? 'Bildschirm bleibt beim Garen an' : 'Bildschirm anlassen nicht möglich – Auto-Sperre manuell ausschalten'],
    [istInstalliert(), istInstalliert() ? 'Als App installiert' : 'Nicht installiert (Tipp: zum Home-Bildschirm hinzufügen)'],
  ];
  return zeilen;
}
$('test-signal').addEventListener('click', async () => {
  const zeilen = await signalTest();
  const ul = $('test-ergebnis');
  ul.hidden = false;
  ul.replaceChildren(...zeilen.map(([ok, text]) => el('li', { text: `${ok ? '✅' : '➖'} ${text}` })));
});
$('test-schnell').addEventListener('click', async () => {
  await signalTest();
  toast('🔔 Signal-Test: Piepton und Ansage gehört? Details unter ⚙️');
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
        m.ersteMessung != null ? `1. Messung ${m.ersteMessung} °C` : null,
        m.rausGemessen != null ? `raus ${m.rausGemessen} °C` : null,
        m.nachRuhe != null ? `nach Ruhe ${m.nachRuhe} °C` : null,
        m.urteil ? `„${m.urteil}“` : null,
        m.messModus ? '🧪' : null,
      ].filter(Boolean).join(' · '),
    }),
    m.notiz ? el('small', { text: `📝 ${m.notiz}` }) : null)));
}

$('m-export').addEventListener('click', async () => {
  const inhalt = csv(speicher.messungen());
  const dateiname = `meat-again-messungen-${new Date().toISOString().slice(0, 10)}.csv`;
  const blob = new Blob([inhalt], { type: 'text/csv;charset=utf-8' });
  try {
    const datei = new File([blob], dateiname, { type: 'text/csv' });
    if (navigator.canShare?.({ files: [datei] })) {
      await navigator.share({ files: [datei], title: 'Meat again – Messungen' });
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
});
$('m-loeschen').addEventListener('click', () => {
  if (!confirm('Alle Messungen unwiderruflich löschen? Tipp: vorher als CSV exportieren.')) return;
  speicher.setMessungen([]);
  renderMessungen();
});

// ═════════════════════════ Start ═════════════════════════
renderAuswahl();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline-Modus optional */ });
}
