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

/** Persönliche Anpassung der Genuss-Zielwerte: maximal ± so viele °C. */
export const ANPASSUNG_MAX = 4;

export const FLEISCH = [
  {
    id: 'rumpsteak', name: 'Rumpsteak', tier: 'Rind', emoji: '🐄', art: 'genuss',
    stufen: { rare: 50, mediumRare: 54, medium: 58, mediumWell: 63, wellDone: 70 },
    dicke: 2.5,
  },
  {
    id: 'filet', name: 'Rinderfilet', tier: 'Rind', emoji: '🐄', art: 'genuss',
    stufen: { rare: 50, mediumRare: 54, medium: 58, mediumWell: 63, wellDone: 70 },
    dicke: 4,
  },
  {
    id: 'entrecote', name: 'Entrecôte', tier: 'Rind', emoji: '🐄', art: 'genuss',
    stufen: { rare: 50, mediumRare: 54, medium: 58, mediumWell: 63, wellDone: 70 },
    dicke: 3,
  },
  {
    id: 'lammkotelett', name: 'Lammkotelett', tier: 'Lamm', emoji: '🐑', art: 'genuss',
    stufen: { mediumRare: 56, medium: 60, mediumWell: 64, wellDone: 70 },
    dicke: 2.5,
  },
  {
    id: 'schweinekotelett', name: 'Schweinekotelett', tier: 'Schwein', emoji: '🐖', art: 'sicher',
    dicke: 2.5,
    tipp: 'Nach dem Anbraten Hitze auf mittel reduzieren. Neben dem Knochen messen, nicht am Knochen.',
  },
  {
    id: 'schweinefilet', name: 'Schweinefilet', tier: 'Schwein', emoji: '🐖', art: 'sicher',
    dicke: 4,
    tipp: 'Rundum anbraten, dann bei mittlerer Hitze weitergaren. Dicke = Durchmesser an der dicksten Stelle.',
  },
  {
    id: 'haehnchenbrust', name: 'Hähnchenbrust', tier: 'Geflügel', emoji: '🐔', art: 'sicher',
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

export const START = [
  { id: 'kalt',       name: 'Aus dem Kühlschrank', emoji: '❄️', temp: 5 },
  { id: 'temperiert', name: 'Temperiert',          emoji: '🌡️', temp: 15 },
];

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
