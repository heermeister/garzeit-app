// Meat again – Datengrundlage
// Quelle und fachliche Freigabe: docs/kerntemperaturen.md

/** Garstufen. target = Kerntemperatur nach der Ruhezeit (°C). */
export const STUFEN = {
  rare:        { label: 'Rare',        sub: 'blutig' },
  mediumRare:  { label: 'Medium rare', sub: 'rosa, saftig' },
  medium:      { label: 'Medium',      sub: 'rosa' },
  mediumWell:  { label: 'Medium well', sub: 'fast durch' },
  wellDone:    { label: 'Well done',   sub: 'durch' },
  sicher:      { label: 'Sicher durch', sub: '≥ 70 °C für 2 Min. (BfR)' },
};

/** Unter diesem Zielwert erscheint der Hinweis für Risikogruppen (USDA-Mindestwert für ganze Stücke). */
export const RISIKO_GRENZE = 63;

/**
 * Sicherheitsregel (BfR, freigegeben als Variante B):
 * herausnehmen bei ≥ 72 °C, 2 Min. Haltephase, Kontrollmessung ≥ 70 °C.
 * Diese Werte werden NIE durch persönliche Anpassung oder Kalibrierung verändert.
 */
export const SICHER = Object.freeze({ pull: 72, hold: 70, holdSec: 120 });

/** Plausible Eingaben (°C): Kerntemperatur beim Messen und vor dem Start. Alles andere wird abgelehnt. */
export const TEMP_BEREICH = Object.freeze({ kern: Object.freeze([0, 100]), start: Object.freeze([-20, 40]) });

/** Persönliche Anpassung der Genuss-Zielwerte: maximal ± so viele °C. */
export const ANPASSUNG_MAX = 4;

export const FLEISCH = [
  {
    id: 'rumpsteak', form: 'platte', name: 'Rumpsteak', tier: 'Rind', emoji: '🐄', art: 'genuss',
    stufen: { rare: 50, mediumRare: 54, medium: 58, mediumWell: 63, wellDone: 70 },
    dicke: 2.5,
  },
  {
    id: 'filet', form: 'zylinder', name: 'Rinderfilet', tier: 'Rind', emoji: '🐄', art: 'genuss',
    stufen: { rare: 50, mediumRare: 54, medium: 58, mediumWell: 63, wellDone: 70 },
    dicke: 4,
  },
  {
    id: 'entrecote', form: 'platte', name: 'Entrecôte', tier: 'Rind', emoji: '🐄', art: 'genuss',
    stufen: { rare: 50, mediumRare: 54, medium: 58, mediumWell: 63, wellDone: 70 },
    dicke: 3,
  },
  {
    id: 'lammkotelett', form: 'platte', name: 'Lammkotelett', tier: 'Lamm', emoji: '🐑', art: 'genuss',
    stufen: { mediumRare: 56, medium: 60, mediumWell: 64, wellDone: 70 },
    dicke: 2.5,
  },
  {
    id: 'schweinekotelett', form: 'platte', name: 'Schweinekotelett', tier: 'Schwein', emoji: '🐖', art: 'sicher',
    dicke: 2.5,
    tipp: 'Nach dem Anbraten Hitze auf mittel reduzieren. Neben dem Knochen messen, nicht am Knochen.',
  },
  {
    id: 'schweinefilet', form: 'zylinder', name: 'Schweinefilet', tier: 'Schwein', emoji: '🐖', art: 'sicher',
    dicke: 4,
    tipp: 'Rundum anbraten, dann bei mittlerer Hitze weitergaren. Dicke = Durchmesser an der dicksten Stelle.',
  },
  {
    id: 'haehnchenbrust', form: 'platte', name: 'Hähnchenbrust', tier: 'Geflügel', emoji: '🐔', art: 'sicher',
    dicke: 2.5,
    tipp: 'Nach dem Anbraten Hitze auf mittel reduzieren. An der dicksten Stelle messen.',
  },
];

/** Gerätetypen (Version 1: nur direkte Hitze). */
export const GERAETE_TYPEN = {
  pfanne:    { name: 'Pfanne',             emoji: '🍳', ort: 'Pfanne', rein: 'ins heiße Fett legen' },
  gasgrill:  { name: 'Gasgrill (direkt)',  emoji: '🔥', ort: 'Grill',  rein: 'auf den heißen Rost legen' },
  holzkohle: { name: 'Holzkohle (direkt)', emoji: '⚫', ort: 'Grill',  rein: 'auf den heißen Rost legen',
    hinweis: 'Holzkohle schwankt stark – Zeit nur grob, Thermometer entscheidet.' },
};

/** Start-Profile; der Nutzer kann eigene anlegen. faktor wird durch Kalibrierung gelernt. */
export const STANDARD_GERAETE = [
  { id: 'pfanne',    name: 'Pfanne',    typ: 'pfanne',    faktor: 1, lernSchritte: 0 },
  { id: 'gasgrill',  name: 'Gasgrill',  typ: 'gasgrill',  faktor: 1, lernSchritte: 0 },
  { id: 'holzkohle', name: 'Holzkohle', typ: 'holzkohle', faktor: 1, lernSchritte: 0 },
];

/** Ausgangslage. methoden = für welche Garmethode die Option angeboten wird. */
export const START = [
  { id: 'kalt',       name: 'Aus dem Kühlschrank', emoji: '❄️', temp: 5,   methoden: ['braten', 'sousvide'] },
  { id: 'temperiert', name: 'Temperiert',          emoji: '🌡️', temp: 15,  methoden: ['braten'] },
  { id: 'gefroren',   name: 'Gefroren',            emoji: '🧊', temp: -18, methoden: ['sousvide'] },
];

/** Garmethoden. */
export const METHODEN = [
  { id: 'braten',   name: 'Pfanne & Grill', emoji: '🍳' },
  { id: 'sousvide', name: 'Sous-vide',      emoji: '🛁' },
];

/**
 * Sous-vide – Regeln (Recherche 25.11.2026, Quellen in docs/sous-vide.md).
 * Schwein/Geflügel bleiben bei der freigegebenen BfR-Regel: Bad 72 °C, Kern ≥ 70 °C, Kontrollmessung Pflicht.
 */
export const SOUS_VIDE = Object.freeze({
  sicherBad: 72,            // Bad für Schwein/Geflügel – Kern liegt nach der Aufheizzeit bei ≥ 71,5 °C
  kurzUnter: 55,            // Bad unter 55 °C (rare, medium rare): Zeit im Bad begrenzt (C. perfringens)
  kurzMaxSek: 3 * 3600,     // … auf höchstens 3 h (Baldwin: < 4 h zwischen 5 und 54,4 °C inkl. Vorbereitung/Anbraten)
  zuschlag: 1.25,           // Sicherheitszuschlag auf die berechnete Aufheizzeit
  gefroren: 1.6,            // gefrorener Start: Aufheizzeit × 1,6 (Obergrenze der Verhältnisse in Baldwins Tabellen)
  fensterMinSek: 15 * 60,   // mindestens so viel Spielraum zwischen „fertig ab“ und Höchstzeit
  sicherIdealSek: 45 * 60,  // Schwein/Geflügel: ideal bis „fertig ab“ + 45 min (Saftverlust steigt danach, Park 2020)
  nachBadSek: 15 * 60,      // Kontrollmessung unter 70 °C → so lange zurück ins Bad
  anbratenSek: 45,          // pro Seite, sehr heiß
  anbratenPflichtUnter: 63, // darunter keimt das Bad die Oberfläche nicht ab → Anbraten aller Seiten Pflicht
  kulanzSek: 60,            // so viel über der 3-h-Grenze gilt noch nicht als „überschritten“ (Bedienzeit)
  verwerfenAbSek: 4 * 3600, // ab 4 h unter 55 °C: nicht mehr essen (4-h-Regel: Baldwin, FDA Food Code)
  messToleranz: 1.5,        // Kontrollmessung höher als Bad + 1,5 °C = Fehleingabe oder Fehlmessung
  laufPufferSek: 12 * 3600, // ein Sous-vide-Lauf bleibt bis 12 h nach dem geplanten Ende wiederherstellbar
  dicke: Object.freeze({ platte: Object.freeze([1, 6]), zylinder: Object.freeze([2, 9]) }),   // Gültigkeit der Aufheiz-Formel (cm)
});

/**
 * Zeitfenster im Bad (Stunden ab Einlegen): [ideal bis, höchstens] – danach leidet die Textur.
 * Praxiswerte (Serious Eats/Anova, ChefSteps, Park 2020 für Hähnchen). null = aus der Mindestzeit berechnet.
 */
export const SV_ZEITEN = {
  Rind: { rare: [2, 3], mediumRare: [2.5, 3], medium: [3, 4], mediumWell: [2.5, 3.5], wellDone: [2, 3] },
  Lamm: { mediumRare: [3, 4], medium: [3, 4], mediumWell: [2.5, 3.5], wellDone: [2, 3] },
  Schwein: { sicher: [null, 3] },
  Geflügel: { sicher: [null, 3] },
};
/** Mageres Filet verträgt weniger Zeit. */
export const SV_MAX_FILET_H = 3;

/** Farb-Labels für mehrere Stücke gleichzeitig. */
export const FARBEN = [
  { id: 'gruen',  name: 'Grün',  punkt: '🟢', css: '#2e9e5b' },
  { id: 'blau',   name: 'Blau',  punkt: '🔵', css: '#2f6fd6' },
  { id: 'orange', name: 'Orange', punkt: '🟠', css: '#e07a1f' },
  { id: 'lila',   name: 'Lila',  punkt: '🟣', css: '#8a4fd1' },
  { id: 'gelb',   name: 'Gelb',  punkt: '🟡', css: '#c9a400' },
  { id: 'rot',    name: 'Rot',   punkt: '🔴', css: '#d23a2a' },
];
export const MAX_STUECKE = FARBEN.length;
