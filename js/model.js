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

import {
  SICHER, RISIKO_GRENZE, STUFEN, ANPASSUNG_MAX, GERAETE_TYPEN, TEMP_BEREICH, SOUS_VIDE, SV_ZEITEN, SV_MAX_FILET_H,
} from './data.js';

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
export const RUHE_MIN = 3;                  // Minuten
export const RUHE_MAX = 10;

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

/** Bereinigter Anpassungswert (ganze °C, begrenzt); Unsinn im Speicher zählt als 0. */
export function anpassungsWert(anpassung, schluessel) {
  const roh = Number(anpassung?.[schluessel]);
  return Number.isFinite(roh) ? klemme(Math.round(roh), -ANPASSUNG_MAX, ANPASSUNG_MAX) : 0;
}

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
    delta = anpassungsWert(anpassung, anpassungsSchluessel(fleisch, stufe));
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
  const ruheMin = klemme(minuten / 3, RUHE_MIN, RUHE_MAX);      // ⅓ der Garzeit, 3–10 Min. (docs/kerntemperaturen.md)
  let ruheSek = runde(ruheMin * 60, 30);
  if (sicher) ruheSek = Math.max(ruheSek, SICHER.holdSec);
  return {
    stufe: stufeKey,
    stufenLabel: STUFEN[stufeKey].label,
    zielBasis, anpassung: delta, ziel, raus, sicher,
    tStart: t0, faktor,
    garSek: seiteSek * 2, seiteSek, ruheSek,
    risiko: !sicher && !(ziel >= RISIKO_GRENZE),   // fail-safe: auch bei ungültigem Wert warnen
    methode: 'braten', machbar: true, grund: '',
  };
}

/**
 * Erzeugt die Schrittfolge für den Timer eines Stücks.
 * Schritt-Typen:
 *  - { typ:'timer', titel, text, sek, signal, kochen?, ruhe?, halte?, warten? }
 *       kochen = Zeit zählt als Garzeit; halte = BfR-Haltephase, darf NIE übersprungen werden
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
    s.push({ typ: 'timer', ruhe: true, halte: true, titel: 'Haltephase', text: `Ruhen lassen. Der Kern muss 2 Minuten lang über ${SICHER.hold} °C bleiben.`, sek: SICHER.holdSec, signal: 'Kontrollmessung!' });
    s.push({
      typ: 'check', art: 'halte', grenze: SICHER.hold, titel: 'Kontrollmessung',
      text: 'Sicherheitsregel (BfR): mindestens 70 °C für 2 Minuten.',
      frage: `Noch mindestens ${SICHER.hold} °C?`,
      neinSchritte: [
        { typ: 'timer', kochen: true, titel: typ.ort === 'Pfanne' ? 'Zurück in die Pfanne' : 'Zurück auf den Grill', text: 'Kern zu kühl geworden – nochmal erhitzen.', sek: NACHBRATEN_SEK, signal: 'Messen!' },
        { typ: 'check', art: 'raus', grenze: SICHER.pull, titel: 'Kerntemperatur messen', text: `Wieder mindestens ${SICHER.pull} °C erreichen.`, frage: `Mindestens ${SICHER.pull} °C?`, neinSchritte: [nachbraten()] },
        { typ: 'timer', ruhe: true, halte: true, titel: 'Haltephase', text: `Erneut 2 Minuten über ${SICHER.hold} °C halten.`, sek: SICHER.holdSec, signal: 'Kontrollmessung!' },
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
  // Nur mit eingetragenem, plausiblem Messwert lernen. Ohne Messwert würde nur „Noch nicht“
  // Information liefern (→ Faktor könnte nur steigen und Steaks würden systematisch übergart).
  const t1 = d.ersteMessung;
  if (!Number.isFinite(t1) || !(d.gekochtBeiErster > 0) || !(d.planSek > 0)) return null;
  if (t1 <= d.tStart + 2 || t1 >= p.T_RAND - 3) return null;
  const benoetigt = d.gekochtBeiErster * F(d.tStart, d.raus, p) / F(d.tStart, t1, p);
  if (!(benoetigt > 0)) return null;
  const verhaeltnis = klemme(benoetigt / d.planSek, 0.6, 1.6);
  const faktor = klemme(d.faktor * Math.pow(verhaeltnis, LERNRATE), FAKTOR_MIN, FAKTOR_MAX);
  return { faktor: Math.round(faktor * 1000) / 1000, verhaeltnis };
}

/**
 * Neuer Gerätefaktor aus einer Beobachtung. Jede Messung wird als Beobachtung des absoluten
 * Zielfaktors (snapshot · verhaeltnis) behandelt – so überschießen mehrere Stücke desselben
 * Geräts in einem Durchgang nicht über den beobachteten Wert hinaus.
 */
export function lerneFaktor({ alt, snapshot, verhaeltnis }) {
  const a = klemme(Number(alt) || 1, FAKTOR_MIN, FAKTOR_MAX);
  const ziel = klemme((Number(snapshot) || 1) * verhaeltnis, FAKTOR_MIN, FAKTOR_MAX);
  return Math.round(klemme(a * Math.pow(ziel / a, LERNRATE), FAKTOR_MIN, FAKTOR_MAX) * 1000) / 1000;
}

/**
 * Gerätefaktor je Hitzeregime: Schwein/Geflügel werden bei reduzierter Hitze gegart und lernen
 * einen eigenen Faktor. Solange dafür nichts gelernt ist, gilt der Genuss-Faktor als Startwert.
 */
export function effektiverFaktor(geraet, art) {
  const genuss = Number(geraet?.faktor);
  const basis = Number.isFinite(genuss) && genuss > 0 ? genuss : 1;
  if (art === 'sicher' && geraet?.lernSchritteSicher > 0 && Number(geraet.faktorSicher) > 0) return Number(geraet.faktorSicher);
  return basis;
}

const urteilsSchritt = (urteil) => (urteil === 'roh' ? 1 : urteil === 'durch' ? -1 : 0);

/** Geschmacks-Feedback → persönliche Anpassung (nur Genuss-Fleisch). */
export function neueAnpassung(bisher, urteil) {
  return klemme((Number(bisher) || 0) + urteilsSchritt(urteil), -ANPASSUNG_MAX, ANPASSUNG_MAX);
}

/**
 * Mehrere Urteile für dieselbe Sorte/Garstufe in EINEM Durchgang: höchstens ±1 °C,
 * Richtung nach Mehrheit (zweimal „zu roh“ = +1, „zu roh“ + „zu durch“ = unverändert).
 * @param {number} basis  Anpassung zu Beginn des Durchgangs
 */
export function anpassungAusUrteilen(basis, urteile) {
  const summe = urteile.reduce((a, u) => a + urteilsSchritt(u), 0);
  return klemme((Number(basis) || 0) + Math.sign(summe), -ANPASSUNG_MAX, ANPASSUNG_MAX);
}

/**
 * Liest eine eingetippte Temperatur („68“, „68,5“, „68.5“, „-3“).
 * @returns {{leer:true}|{wert:number}|{fehler:true}}
 */
export function leseTemp(text, bereich = TEMP_BEREICH.kern) {
  const t = String(text ?? '').trim().replace(/\s+/g, '').replace(/°C?$/i, '');
  if (!t) return { leer: true };
  if (!/^-?\d{1,3}([.,]\d{1,2})?$/.test(t)) return { fehler: true };
  const wert = Number(t.replace(',', '.'));
  if (!Number.isFinite(wert) || wert < bereich[0] || wert > bereich[1]) return { fehler: true };
  return { wert };
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
  const zwei = (n) => String(n).padStart(2, '0');
  if (s >= 3600) return `${Math.floor(s / 3600)}:${zwei(Math.floor((s % 3600) / 60))}:${zwei(s % 60)}`;
  return `${Math.floor(s / 60)}:${zwei(s % 60)}`;
}

/** Dauer in Worten: „45 min“, „1 h 35 min“, „3 h“ – mit geschützten Leerzeichen (kein Umbruch mitten in der Dauer). */
export function dauer(sek) {
  const m = Math.max(0, Math.round(sek / 60));
  const h = Math.floor(m / 60);
  if (!h) return `${m}\u00a0min`;
  return m % 60 ? `${h}\u00a0h\u00a0${m % 60}\u00a0min` : `${h}\u00a0h`;
}

// ───────────────────────── Sous-vide ─────────────────────────
//
// Aufheizzeit = Zeit, bis der Kern höchstens 0,5 °C unter der Badtemperatur liegt (Baldwin-Definition),
// Start aus dem Kühlschrank (5 °C). Polynom-Fit an Baldwins Tabelle (Platte 10–60 mm, Zylinder 20–90 mm,
// Abweichung ≤ ±10 %); physikalisch nachgerechnet (Wärmeleitung, erster Fourier-Term, α ≈ 1,1–1,4·10⁻⁷ m²/s).
// Steaks/Koteletts/Hähnchenbrust = Platte (Dicke), Filet am Stück oder Medaillon = Zylinder (Durchmesser bzw. Höhe).

const runde5min = (sek) => Math.ceil(sek / 300) * 300;

/** Aufheizzeit in Sekunden OHNE Sicherheitszuschlag. */
export function aufheizSek({ form, dickeCm, tBad, gefroren = false }) {
  const d = dickeCm * 10;   // mm
  const basisMin = form === 'zylinder' ? 0.031 * d * d + 0.73 * d : 0.053 * d * d + 1.56 * d;
  // schwache Abhängigkeit von der Badtemperatur (normiert auf 5 °C → 54,5 °C)
  const fT = Math.log(1.24 * Math.max(1, tBad - 5) / 0.5) / Math.log(124);
  return basisMin * 60 * fT * (gefroren ? SOUS_VIDE.gefroren : 1);
}

/**
 * Sous-vide-Plan für ein Stück.
 * @returns {object} u. a. tBad, minSek (fertig ab), idealSek, maxSek (je ab Einlegen), hartMax, machbar, grund
 */
export function berechneSousVide({ fleisch, stufe, dicke, startId = 'kalt', anpassung = {} }) {
  const sicher = fleisch.art === 'sicher';
  const stufeKey = sicher ? 'sicher' : stufe;
  const form = fleisch.form === 'zylinder' ? 'zylinder' : 'platte';
  const gefroren = startId === 'gefroren';
  let zielBasis, delta = 0, ziel, tBad;
  if (sicher) {
    // BfR-Regel, durch nichts veränderbar: Kern ≥ 70 °C; Bad 72 °C, damit der Kern sicher darüber liegt
    zielBasis = ziel = SICHER.hold;
    tBad = SOUS_VIDE.sicherBad;
  } else {
    zielBasis = fleisch.stufen[stufe];
    delta = anpassungsWert(anpassung, anpassungsSchluessel(fleisch, stufe));
    ziel = zielBasis + delta;
    tBad = ziel;   // Sous-vide: Bad = Zielkerntemperatur, kein Nachgaren
  }
  const [dMin, dMax] = SOUS_VIDE.dicke[form];
  const heizSek = runde5min(aufheizSek({ form, dickeCm: dicke, tBad, gefroren }) * SOUS_VIDE.zuschlag);
  const minSek = heizSek + (sicher ? SICHER.holdSec : 0);

  const kurz = tBad < SOUS_VIDE.kurzUnter;
  const [idealH, maxH] = (SV_ZEITEN[fleisch.tier] || {})[stufeKey] || [null, 3];
  let maxTextur = maxH * 3600;
  if (fleisch.id === 'filet') maxTextur = Math.min(maxTextur, SV_MAX_FILET_H * 3600);
  const maxSek = kurz ? Math.min(maxTextur, SOUS_VIDE.kurzMaxSek) : Math.max(maxTextur, minSek + SOUS_VIDE.fensterMinSek);
  const idealRoh = idealH == null ? minSek + SOUS_VIDE.sicherIdealSek : idealH * 3600;
  const idealSek = Math.min(maxSek, Math.max(idealRoh, minSek + SOUS_VIDE.fensterMinSek));

  let machbar = true;
  let grund = '';
  if (dicke < dMin || dicke > dMax) {
    machbar = false;
    grund = `Für ${form === 'zylinder' ? 'Filets am Stück' : 'Steaks und Koteletts'} rechnet die App Sous-vide von ${dMin} bis ${dMax} cm.`;
  } else if (kurz && gefroren) {
    machbar = false;
    grund = `Gefroren ins Bad unter ${SOUS_VIDE.kurzUnter} °C geht nicht: Das Fleisch bliebe zu lange in einem Bereich, in dem sich Keime vermehren.`;
  } else if (kurz && minSek + SOUS_VIDE.fensterMinSek > maxSek) {
    machbar = false;
    grund = `Zu dick für ${STUFEN[stufeKey].label} im Sous-vide: Es braucht mindestens ${dauer(minSek)} plus ${dauer(SOUS_VIDE.fensterMinSek)} Spielraum – unter ${SOUS_VIDE.kurzUnter} °C sind aber höchstens ${dauer(SOUS_VIDE.kurzMaxSek)} im Bad erlaubt. Dünner schneiden oder eine höhere Garstufe wählen.`;
  }
  return {
    methode: 'sousvide',
    stufe: stufeKey, stufenLabel: STUFEN[stufeKey].label,
    zielBasis, anpassung: delta, ziel, raus: tBad, tBad, sicher, form, gefroren,
    tStart: gefroren ? -18 : 5, faktor: 1,
    heizSek, minSek, idealSek, maxSek, hartMax: kurz, kurz,
    textur: minSek > maxTextur,                       // länger als für die Textur empfohlen
    machbar, grund,
    anbratenSek: SOUS_VIDE.anbratenSek,
    anbratenPflicht: !sicher && ziel < SOUS_VIDE.anbratenPflichtUnter,
    // Kompatibilität mit Zeitplan/Anzeige
    garSek: minSek, seiteSek: SOUS_VIDE.anbratenSek, ruheSek: 0,
    risiko: !sicher && !(ziel >= RISIKO_GRENZE),
  };
}

/**
 * Schritte des Sous-vide-Timers:
 * Bad vorheizen → Im Wasserbad (Mindestzeit) → Kann raus (bis ideal) → Länger im Bad (bis Höchstzeit)
 * → Raus aus dem Bad → [Schwein/Geflügel: Kontrollmessung ≥ 70 °C] → Anbraten 2 × → Fertig.
 */
export function ablaufSousVide(plan, fleisch, geraetTyp = 'pfanne') {
  const typ = GERAETE_TYPEN[geraetTyp] || GERAETE_TYPEN.pfanne;
  const bad = `${String(plan.tBad).replace('.', ',')} °C`;
  const s = [];
  s.push({
    typ: 'check', art: 'bad', nurJa: true, titel: 'Wasserbad vorheizen',
    text: `Stick auf ${bad} stellen. Fleisch erst ins Wasser, wenn die Temperatur erreicht ist – keinen verzögerten Start nutzen.`,
    frage: `Hat das Bad ${bad} erreicht?`, knopf: '✅ Bad ist warm',
  });
  s.push({
    // imBad: Das Bad läuft in Echtzeit weiter – auch in der Pause der App
    typ: 'timer', kochen: true, imBad: true, uhr: 'fertig', titel: 'Im Wasserbad',
    text: 'Beutel ganz untertauchen, nicht stapeln, nichts Kaltes nachlegen.',
    sek: plan.minSek, signal: 'Fertig. Kann raus.',
    // Schwein/Geflügel: Mindestzeit enthält die Haltezeit – nie überspringbar
    ...(plan.sicher ? { halte: true } : {}),
  });
  const fenster = plan.idealSek - plan.minSek;
  if (fenster > 0) {
    s.push({
      typ: 'timer', kochen: true, imBad: true, fenster: true, titel: 'Kann raus',
      // Schon länger als für die Textur ideal (sehr dicke Stücke): nicht „ohne Qualitätsverlust“ versprechen
      ...(plan.textur
        ? { uhr: 'spaetestens', text: 'Gar. Für die Textur schon länger als ideal – möglichst bald raus, spätestens' }
        : { uhr: 'bis', text: 'Gar. Ohne Qualitätsverlust im Bad lassen' }),
      sek: fenster, signal: plan.idealSek < plan.maxSek ? (plan.hartMax ? 'Bitte bald raus.' : 'Ideale Zeit vorbei.') : 'Jetzt raus!',
    });
  }
  const spaet = plan.maxSek - Math.max(plan.idealSek, plan.minSek);
  if (spaet > 0) {
    s.push({
      typ: 'timer', kochen: true, imBad: true, fenster: true, uhr: 'spaetestens', titel: plan.hartMax ? 'Bald raus' : 'Länger im Bad',
      text: plan.hartMax
        ? `Höchstzeit unter ${SOUS_VIDE.kurzUnter} °C (Sicherheitsgrenze) – spätestens`
        : 'Die Textur wird jetzt langsam weicher – raus spätestens',
      sek: spaet, signal: 'Jetzt raus!',
    });
  }
  s.push({
    typ: 'check', art: 'svraus', nurJa: true, titel: 'Raus aus dem Bad',
    text: plan.hartMax ? 'Höchstzeit erreicht – jetzt entnehmen und sofort anbraten.' : 'Bitte jetzt aus dem Bad nehmen.',
    frage: 'Ist der Beutel raus?', knopf: '✅ Ist raus',
  });
  if (plan.sicher) {
    s.push({
      typ: 'check', art: 'halte', grenze: SICHER.hold, titel: 'Kontrollmessung',
      text: `Beutel öffnen und sofort an der dicksten Stelle messen (nicht am Knochen). Sicherheitsregel (BfR): mindestens ${SICHER.hold} °C.`,
      frage: `Mindestens ${SICHER.hold} °C?`,
      neinSchritte: [{
        typ: 'timer', kochen: true, halte: true, imBad: true, titel: 'Zurück ins Bad',
        text: `Neu verschließen und ${Math.round(SOUS_VIDE.nachBadSek / 60)} Min. zurück ins ${bad}-Bad. Tipp: Badtemperatur mit einem Thermometer gegenprüfen.`,
        sek: SOUS_VIDE.nachBadSek, signal: 'Erneut messen!',
      }],
    });
  }
  const ort = typ.ort === 'Pfanne' ? 'Pfanne' : 'Grill';
  s.push({
    typ: 'timer', titel: 'Anbraten Seite 1',
    text: `Gut trocken tupfen. ${ort} sehr heiß (Öl raucht leicht).${plan.anbratenPflicht ? ' Pflicht: alle Seiten inkl. Ränder kurz anbraten – das Bad keimt die Oberfläche nicht ab.' : ''}`,
    sek: plan.anbratenSek, signal: 'Wenden!',
  });
  s.push({ typ: 'timer', titel: 'Anbraten Seite 2', text: 'Kurz die Ränder mitnehmen. Ruhen ist nicht nötig.', sek: plan.anbratenSek, signal: 'Servieren!' });
  s.push({ typ: 'fertig', titel: 'Fertig! 🍽️', text: `${fleisch.name} · ${plan.stufenLabel} · Sous-vide` });
  return s;
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
  ['messwarteSek', 'Messwartezeit_s'], ['ruheSek', 'Plan_Ruhezeit_s'], ['ruheTatsaechlichSek', 'Ruhezeit_tatsaechlich_s'],
  ['zeitstempel', 'Zeitstempel_raus'], ['gesamtEnde', 'Zeitstempel_fertig'], ['aufgeholt', 'Hintergrund_aufgeholt'],
  ['methode', 'Methode'], ['tBad', 'Bad_C'], ['badSek', 'Badzeit_tatsaechlich_s'], ['kontrolleGemessen', 'Kern_Kontrolle_C'],
];

function csvFeld(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'ja' : 'nein';
  if (typeof v === 'number') return String(v).replace('.', ',');   // deutsches Excel
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;   // Excel/Numbers sollen Notizen nicht als Formel ausführen
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV mit Semikolon und Dezimalkomma (öffnet direkt korrekt in deutschem Excel/Numbers). */
export function csv(messungen) {
  const kopf = CSV_SPALTEN.map(([, t]) => t).join(';');
  const zeilen = messungen.map((m) => CSV_SPALTEN.map(([k]) => csvFeld(m[k])).join(';'));
  return '﻿' + [kopf, ...zeilen].join('\r\n') + '\r\n';
}
