// Meat again – Zeitmodell und Ablaufplanung
//
// ⚠️ STARTWERTE, NOCH NICHT GEEICHT. Die Testbraten (Etappe 5) passen die Parameter an.
//
// Modell:  t_gesamt = REF_MIN · (d / REF_DICKE)^EXPONENT · f_temp · f_geraet
//
//  • Dicke: Reine Wärmeleitung spräche für Exponent 2, die REWE-Faustregel
//    (1 Min. pro cm und Seite) für 1. Startwert 1,5 als Kompromiss.
//  • f_temp: Annäherung an die Kerntemperatur nach einem Exponentialgesetz:
//      ln((T_rand − T_start) / (T_rand − T_raus)), normiert auf den Referenzfall.
//    Damit sind Garstufe UND Ausgangstemperatur (Kühlschrank/temperiert) in einem Faktor abgebildet.
//  • Referenz: Rindersteak 2,5 cm, medium rare (raus bei 52 °C), temperiert (15 °C), Pfanne → 6 Min.
//    (REWE ~2,5 Min./Seite; Weber-Grill 10–12 Min. gesamt)

import { SICHER, RISIKO_GRENZE, STUFEN } from './data.js';

export const PARAM = {
  REF_MIN: 6,
  REF_DICKE: 2.5,
  EXPONENT: 1.5,
  T_RAND: 105,     // effektive Randtemperatur (°C)
  REF_T_START: 15,
  REF_T_RAUS: 52,
};

/** Nachgaren in °C abhängig von der Dicke (Grillfürst/Weber: 1–3 °C). */
export function nachgaren(dickeCm) {
  if (dickeCm < 2.5) return 1;
  if (dickeCm <= 4) return 2;
  return 3;
}

function tempFaktor(tStart, tRaus, p = PARAM) {
  const f = (t0, t1) => Math.log((p.T_RAND - t0) / (p.T_RAND - t1));
  return f(tStart, tRaus) / f(p.REF_T_START, p.REF_T_RAUS);
}

/**
 * Berechnet den Garplan für ein Stück.
 * @returns {{ziel:number, raus:number, garSek:number, seiteSek:number, ruheSek:number, sicher:boolean, risiko:boolean}}
 */
export function berechne({ fleisch, stufe, dicke, start, geraet }, p = PARAM) {
  const sicher = fleisch.art === 'sicher';
  const ziel = sicher ? SICHER.hold : fleisch.stufen[stufe];
  const raus = sicher ? SICHER.pull : ziel - nachgaren(dicke);
  const minuten = p.REF_MIN
    * Math.pow(dicke / p.REF_DICKE, p.EXPONENT)
    * tempFaktor(start.temp, raus, p)
    * geraet.faktor;
  const garSek = Math.round(minuten * 60 / 10) * 10;           // auf 10 s runden
  const seiteSek = Math.round(garSek / 2 / 5) * 5;
  const ruheMin = Math.min(10, Math.max(3, minuten / 3));       // ⅓ der Garzeit, 3–10 Min.
  const ruheSek = Math.round(ruheMin * 60 / 30) * 30;
  return {
    ziel, raus, sicher,
    garSek: seiteSek * 2, seiteSek, ruheSek,
    risiko: !sicher && ziel < RISIKO_GRENZE,
    stufenLabel: STUFEN[sicher ? 'sicher' : stufe].label,
  };
}

/**
 * Erzeugt die Schrittfolge für den Timer.
 * Schritt-Typen:
 *  - { typ:'timer', titel, text, sek }
 *  - { typ:'check', titel, text, frage, neinSchritte:[…] }  → bei „Nein“ werden neinSchritte
 *    eingefügt und danach dieselbe Prüfung wiederholt
 *  - { typ:'fertig', titel, text }
 */
export function ablauf(plan, fleisch, geraet = { id: 'pfanne' }) {
  const nachSek = 60;
  const s = [];
  s.push({ typ: 'timer', titel: 'Seite 1 anbraten', text: geraet.id === 'pfanne'
    ? `${fleisch.name} ins heiße Fett legen und nicht bewegen.`
    : `${fleisch.name} auf den heißen Rost legen und nicht bewegen.`, sek: plan.seiteSek, signal: 'Wenden!' });
  s.push({ typ: 'timer', titel: 'Seite 2', text: fleisch.tipp || 'Gewendet? Weiter geht’s.', sek: plan.seiteSek, signal: 'Messen!' });

  const nachbraten = { typ: 'timer', titel: 'Weiterbraten', text: 'Noch nicht so weit – einmal wenden und kurz weiter.', sek: nachSek, signal: 'Erneut messen!' };

  if (!plan.sicher) {
    s.push({
      typ: 'check', titel: 'Kerntemperatur messen',
      text: `Herausnehmen bei ${plan.raus} °C · Ziel nach Ruhe ${plan.ziel} °C`,
      frage: `Zeigt das Thermometer mindestens ${plan.raus} °C?`,
      neinSchritte: [nachbraten],
    });
    s.push({ typ: 'timer', titel: 'Ruhen lassen', text: `Auf einem Brett ruhen lassen. Die Kerntemperatur steigt noch auf ca. ${plan.ziel} °C.`, sek: plan.ruheSek, signal: 'Servieren!' });
  } else {
    s.push({
      typ: 'check', titel: 'Kerntemperatur messen',
      text: `Herausnehmen erst bei mindestens ${SICHER.pull} °C.`,
      frage: `Zeigt das Thermometer mindestens ${SICHER.pull} °C?`,
      neinSchritte: [nachbraten],
    });
    s.push({ typ: 'timer', titel: 'Haltephase', text: `Ruhen lassen. Der Kern muss 2 Minuten lang über ${SICHER.hold} °C bleiben.`, sek: SICHER.holdSec, signal: 'Kontrollmessung!' });
    s.push({
      typ: 'check', titel: 'Kontrollmessung',
      text: 'Sicherheitsregel (BfR): mindestens 70 °C für 2 Minuten.',
      frage: `Zeigt das Thermometer noch mindestens ${SICHER.hold} °C?`,
      neinSchritte: [
        { typ: 'timer', titel: geraet.id === 'pfanne' ? 'Zurück in die Pfanne' : 'Zurück auf den Grill', text: 'Kern zu kühl geworden – nochmal erhitzen.', sek: nachSek, signal: 'Messen!' },
        { typ: 'check', titel: 'Kerntemperatur messen', text: `Wieder mindestens ${SICHER.pull} °C erreichen.`, frage: `Mindestens ${SICHER.pull} °C?`, neinSchritte: [nachbraten] },
        { typ: 'timer', titel: 'Haltephase', text: `Erneut 2 Minuten über ${SICHER.hold} °C halten.`, sek: SICHER.holdSec, signal: 'Kontrollmessung!' },
      ],
    });
    const rest = plan.ruheSek - SICHER.holdSec;
    if (rest > 0) s.push({ typ: 'timer', titel: 'Restliche Ruhezeit', text: 'Sicher durch ✅ – jetzt nur noch ruhen lassen.', sek: rest, signal: 'Servieren!' });
  }
  s.push({ typ: 'fertig', titel: 'Guten Appetit! 🍽️', text: `${fleisch.name} · ${plan.stufenLabel}` });
  return s;
}

export function fmt(sek) {
  const s = Math.max(0, Math.ceil(sek));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
