// Meat again – Zeitmodell, Ablaufplanung, Kalibrierung (reine Funktionen, ohne DOM)
//
// ⚠️ STARTWERTE, NOCH NICHT GEEICHT. Testbraten + Kalibrierung passen sie an.
//
// Modell:  t_gesamt = REF_MIN · (d / REF_DICKE)^EXPONENT · f_temp · f_geraet
//
//  • Dicke: Reine Wärmeleitung spräche für Exponent 2, die REWE-Faustregel
//    (1 Min. pro cm und Seite) für 1. Startwert 1,5 als Kompromiss.
//  • f_temp: Annäherung der Kerntemperatur nach einem Exponentialgesetz:
//      F(T) = ln((T_rand − T_start) / (T_rand − T)), normiert auf den Referenzfall.
//    Damit sind Garstufe UND Ausgangstemperatur in einem Faktor abgebildet.
//  • f_geraet: pro Geräte-Profil gelernt (Kalibrierung), Start = 1.
//  • Referenz: Rindersteak 2,5 cm, medium rare (raus bei 52 °C), temperiert (15 °C), Pfanne → 6 Min.
//    (REWE ~2,5 Min./Seite; Weber-Grill 10–12 Min. gesamt)

import { SICHER, RISIKO_GRENZE, STUFEN, ANPASSUNG_MAX, GERAETE_TYPEN } from './data.js';

export const PARAM = Object.freeze({
  REF_MIN: 6,
  REF_DICKE: 2.5,
  EXPONENT: 1.5,
  T_RAND: 105,     // effektive Randtemperatur (°C)
  REF_T_START: 15,
  REF_T_RAUS: 52,
});

export const NACHBRATEN_SEK = 60;           // Standard-Zusatzzeit bei „Noch nicht“ ohne Messwert
export const ZUSATZ_MIN_SEK = 30;
export const ZUSATZ_MAX_SEK = 300;
export const FAKTOR_MIN = 0.4;
export const FAKTOR_MAX = 2.5;
export const LERNRATE = 0.5;                // 0 = nie lernen, 1 = Messung voll übernehmen

const klemme = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const runde = (x, auf) => Math.round(x / auf) * auf;

/** Nachgaren in °C abhängig von der Dicke (Grillfürst/Weber: 1–3 °C). */
export function nachgaren(dickeCm) {
  if (dickeCm < 2.5) return 1;
  if (dickeCm <= 4) return 2;
  return 3;
}

/** Exponentielle Annäherung: „Zeitbedarf“ von tStart bis t (dimensionslos). */
function F(tStart, t, p = PARAM) {
  const tt = Math.min(t, p.T_RAND - 1);
  return Math.log((p.T_RAND - tStart) / (p.T_RAND - tt));
}

function tempFaktor(tStart, tRaus, p = PARAM) {
  return F(tStart, tRaus, p) / F(p.REF_T_START, p.REF_T_RAUS, p);
}

/** Schlüssel für persönliche Anpassungen, z. B. „Rind:medium“. */
export const anpassungsSchluessel = (fleisch, stufe) => `${fleisch.tier}:${stufe}`;

/**
 * Berechnet den Garplan für ein Stück.
 * @param {object} e
 * @param {object} e.fleisch   Eintrag aus FLEISCH
 * @param {string} e.stufe     Schlüssel aus STUFEN (bei Sicherheitsfleisch ignoriert)
 * @param {number} e.dicke     cm
 * @param {number} e.tStart    Kerntemperatur beim Start (°C)
 * @param {object} e.geraet    Geräte-Profil { typ, faktor }
 * @param {object} [e.anpassung] persönliche Anpassungen { 'Rind:medium': +1, … }
 */
export function berechne({ fleisch, stufe, dicke, tStart, geraet, anpassung = {} }, p = PARAM) {
  const sicher = fleisch.art === 'sicher';
  const stufeKey = sicher ? 'sicher' : stufe;
  let zielBasis, delta = 0, ziel, raus;
  if (sicher) {
    // Sicherheitsregel: niemals anpassbar
    zielBasis = ziel = SICHER.hold;
    raus = SICHER.pull;
  } else {
    zielBasis = fleisch.stufen[stufe];
    delta = klemme(Math.round(anpassung[anpassungsSchluessel(fleisch, stufe)] || 0), -ANPASSUNG_MAX, ANPASSUNG_MAX);
    ziel = zielBasis + delta;
    raus = ziel - nachgaren(dicke);
  }
  const faktor = klemme(Number(geraet?.faktor) || 1, FAKTOR_MIN, FAKTOR_MAX);
  const t0 = Math.min(Number.isFinite(tStart) ? tStart : 5, raus - 5);
  const minuten = p.REF_MIN
    * Math.pow(dicke / p.REF_DICKE, p.EXPONENT)
    * tempFaktor(t0, raus, p)
    * faktor;
  const seiteSek = Math.max(30, runde(minuten * 60 / 2, 5));
  const ruheMin = klemme(minuten / 3, 3, 10);                   // ⅓ der Garzeit, 3–10 Min.
  let ruheSek = runde(ruheMin * 60, 30);
  if (sicher) ruheSek = Math.max(ruheSek, SICHER.holdSec);
  return {
    stufe: stufeKey,
    stufenLabel: STUFEN[stufeKey].label,
    zielBasis, anpassung: delta, ziel, raus, sicher,
    tStart: t0, faktor,
    garSek: seiteSek * 2, seiteSek, ruheSek,
    risiko: !sicher && ziel < RISIKO_GRENZE,
  };
}

/**
 * Erzeugt die Schrittfolge für den Timer eines Stücks.
 * Schritt-Typen:
 *  - { typ:'timer', titel, text, sek, signal, kochen? }   kochen = Zeit zählt als Garzeit
 *  - { typ:'check', titel, text, frage, grenze, art:'raus'|'halte', erste?, neinSchritte:[…] }
 *       „Nein“ → neinSchritte werden eingefügt, danach dieselbe Prüfung erneut.
 *  - { typ:'fertig', titel, text }
 */
export function ablauf(plan, fleisch, geraetTyp = 'pfanne', warteSek = 0) {
  const typ = GERAETE_TYPEN[geraetTyp] || GERAETE_TYPEN.pfanne;
  const s = [];
  const nachbraten = () => ({
    typ: 'timer', kochen: true, titel: 'Weiterbraten',
    text: 'Noch nicht so weit – einmal wenden und kurz weiter.', sek: NACHBRATEN_SEK, signal: 'Erneut messen!',
  });

  if (warteSek > 0) {
    s.push({ typ: 'timer', warten: true, titel: 'Wartet', text: `Kommt gleich ${typ.ort === 'Pfanne' ? 'in die Pfanne' : 'auf den Grill'} – noch nicht auflegen.`, sek: warteSek, signal: `Jetzt ${typ.ort === 'Pfanne' ? 'in die Pfanne' : 'auf den Grill'}!` });
  }
  s.push({ typ: 'timer', kochen: true, titel: 'Seite 1 anbraten', text: `${fleisch.name} ${typ.rein} und nicht bewegen.`, sek: plan.seiteSek, signal: 'Wenden!' });
  s.push({ typ: 'timer', kochen: true, titel: 'Seite 2', text: fleisch.tipp || 'Gewendet? Weiter geht’s.', sek: plan.seiteSek, signal: 'Messen!' });

  if (!plan.sicher) {
    s.push({
      typ: 'check', art: 'raus', erste: true, grenze: plan.raus, titel: 'Kerntemperatur messen',
      text: `Herausnehmen bei ${plan.raus} °C · Ziel nach Ruhe ${plan.ziel} °C`,
      frage: `Mindestens ${plan.raus} °C?`,
      neinSchritte: [nachbraten()],
    });
    s.push({ typ: 'timer', ruhe: true, titel: 'Ruhen lassen', text: `Auf einem Brett ruhen lassen. Der Kern steigt noch auf ca. ${plan.ziel} °C.`, sek: plan.ruheSek, signal: 'Servieren!' });
  } else {
    s.push({
      typ: 'check', art: 'raus', erste: true, grenze: SICHER.pull, titel: 'Kerntemperatur messen',
      text: `Herausnehmen erst bei mindestens ${SICHER.pull} °C.`,
      frage: `Mindestens ${SICHER.pull} °C?`,
      neinSchritte: [nachbraten()],
    });
    s.push({ typ: 'timer', ruhe: true, titel: 'Haltephase', text: `Ruhen lassen. Der Kern muss 2 Minuten lang über ${SICHER.hold} °C bleiben.`, sek: SICHER.holdSec, signal: 'Kontrollmessung!' });
    s.push({
      typ: 'check', art: 'halte', grenze: SICHER.hold, titel: 'Kontrollmessung',
      text: 'Sicherheitsregel (BfR): mindestens 70 °C für 2 Minuten.',
      frage: `Noch mindestens ${SICHER.hold} °C?`,
      neinSchritte: [
        { typ: 'timer', kochen: true, titel: typ.ort === 'Pfanne' ? 'Zurück in die Pfanne' : 'Zurück auf den Grill', text: 'Kern zu kühl geworden – nochmal erhitzen.', sek: NACHBRATEN_SEK, signal: 'Messen!' },
        { typ: 'check', art: 'raus', grenze: SICHER.pull, titel: 'Kerntemperatur messen', text: `Wieder mindestens ${SICHER.pull} °C erreichen.`, frage: `Mindestens ${SICHER.pull} °C?`, neinSchritte: [nachbraten()] },
        { typ: 'timer', ruhe: true, titel: 'Haltephase', text: `Erneut 2 Minuten über ${SICHER.hold} °C halten.`, sek: SICHER.holdSec, signal: 'Kontrollmessung!' },
      ],
    });
    const rest = plan.ruheSek - SICHER.holdSec;
    if (rest > 0) s.push({ typ: 'timer', ruhe: true, titel: 'Restliche Ruhezeit', text: 'Sicher durch ✅ – jetzt nur noch ruhen lassen.', sek: rest, signal: 'Servieren!' });
  }
  s.push({ typ: 'fertig', titel: 'Fertig! 🍽️', text: `${fleisch.name} · ${plan.stufenLabel}` });
  return s;
}

/**
 * Schätzt die Zusatzzeit, wenn die Messung unter der Grenze liegt.
 * Ohne Messwert: NACHBRATEN_SEK.
 */
export function zusatzzeit({ tStart, grenze, gemessen, gekochtSek }, p = PARAM) {
  if (!Number.isFinite(gemessen) || !(gekochtSek > 0) || gemessen <= tStart + 1) return NACHBRATEN_SEK;
  if (gemessen >= grenze) return 0;
  const benoetigt = gekochtSek * F(tStart, grenze, p) / F(tStart, gemessen, p);
  return klemme(runde(benoetigt - gekochtSek, 15), ZUSATZ_MIN_SEK, ZUSATZ_MAX_SEK);
}

/**
 * Kalibrierung des Geräte-Faktors nach dem Herausnehmen.
 * @param {object} d
 * @param {number} d.faktor           bisheriger Faktor des Profils
 * @param {number} d.planSek          geplante Garzeit (mit bisherigem Faktor)
 * @param {number} d.tStart
 * @param {number} d.raus             Herausnehm-Temperatur
 * @param {number|null} d.ersteMessung  °C bei der ersten Messung (falls eingegeben)
 * @param {number} d.gekochtBeiErster  Garzeit bis zur ersten Messung (s)
 * @param {number} d.gekochtGesamt     Garzeit bis „Ja“ (s)
 * @param {number} d.neinAnzahl
 * @returns {{faktor:number, verhaeltnis:number}|null}  null = keine verwertbare Information
 */
export function kalibriere(d, p = PARAM) {
  let benoetigt = null;
  if (Number.isFinite(d.ersteMessung) && d.gekochtBeiErster > 0 && d.ersteMessung > d.tStart + 2) {
    const t1 = Math.min(d.ersteMessung, p.T_RAND - 3);
    benoetigt = d.gekochtBeiErster * F(d.tStart, d.raus, p) / F(d.tStart, t1, p);
  } else if (d.neinAnzahl > 0 && d.gekochtGesamt > 0) {
    benoetigt = d.gekochtGesamt - NACHBRATEN_SEK / 2;   // irgendwo in der letzten Zusatzminute erreicht
  }
  if (!(benoetigt > 0) || !(d.planSek > 0)) return null;
  const verhaeltnis = klemme(benoetigt / d.planSek, 0.6, 1.6);
  const faktor = klemme(d.faktor * Math.pow(verhaeltnis, LERNRATE), FAKTOR_MIN, FAKTOR_MAX);
  return { faktor: Math.round(faktor * 1000) / 1000, verhaeltnis };
}

/** Geschmacks-Feedback → persönliche Anpassung (nur Genuss-Fleisch). */
export function neueAnpassung(bisher, urteil) {
  const d = urteil === 'roh' ? 1 : urteil === 'durch' ? -1 : 0;
  return klemme((bisher || 0) + d, -ANPASSUNG_MAX, ANPASSUNG_MAX);
}

/**
 * Staffelung mehrerer Stücke: alle sollen gleichzeitig servierfertig sein
 * (Garzeit + Ruhezeit enden gemeinsam).
 * @param {Array<{garSek:number, ruheSek:number}>} plaene
 */
export function zeitplan(plaene) {
  const gesamt = plaene.map((pl) => pl.garSek + pl.ruheSek);
  const max = Math.max(0, ...gesamt);
  return { versatz: gesamt.map((g) => runde(max - g, 5)), gesamtSek: max };
}

export function fmt(sek) {
  const s = Math.max(0, Math.ceil(sek));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ───────────────────────── CSV ─────────────────────────
export const CSV_SPALTEN = [
  ['datum', 'Datum'], ['uhrzeit', 'Uhrzeit'], ['fleisch', 'Fleisch'], ['tier', 'Tier'],
  ['dicke', 'Dicke_cm'], ['stufe', 'Garstufe'], ['ziel', 'Ziel_C'], ['raus', 'Raus_bei_C'],
  ['start', 'Start'], ['tStart', 'Kern_Start_C'], ['tStartGemessen', 'Kern_Start_gemessen'],
  ['geraet', 'Geraet'], ['geraetTyp', 'Geraetetyp'], ['faktor', 'Faktor'],
  ['planSek', 'Plan_Garzeit_s'], ['gekochtBeiErster', 'Garzeit_bis_1_Messung_s'],
  ['ersteMessung', 'Erste_Messung_C'], ['neinAnzahl', 'Nachbraten_Anzahl'],
  ['gekochtGesamt', 'Garzeit_gesamt_s'], ['rausGemessen', 'Kern_beim_Rausnehmen_C'],
  ['nachRuhe', 'Kern_nach_Ruhe_C'], ['urteil', 'Urteil'], ['neuerFaktor', 'Faktor_neu'],
  ['messModus', 'Mess_Modus'], ['notiz', 'Notiz'],
];

function csvFeld(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'ja' : 'nein';
  if (typeof v === 'number') return String(v).replace('.', ',');   // deutsches Excel
  const s = String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV mit Semikolon und Dezimalkomma (öffnet direkt korrekt in deutschem Excel/Numbers). */
export function csv(messungen) {
  const kopf = CSV_SPALTEN.map(([, t]) => t).join(';');
  const zeilen = messungen.map((m) => CSV_SPALTEN.map(([k]) => csvFeld(m[k])).join(';'));
  return '﻿' + [kopf, ...zeilen].join('\r\n') + '\r\n';
}
