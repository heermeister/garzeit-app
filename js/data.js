// Meat again – Datengrundlage
// Quelle und fachliche Freigabe: docs/kerntemperaturen.md

/** Garstufen für Genuss-Fleisch (Rind, Lamm). target = Kerntemperatur nach der Ruhezeit (°C). */
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

/** Sicherheitsregel (BfR, Variante B): herausnehmen bei ≥ 72 °C, 2 Min. halten, Kontrolle ≥ 70 °C. */
export const SICHER = { pull: 72, hold: 70, holdSec: 120 };

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

export const GERAETE = [
  { id: 'pfanne',    name: 'Pfanne',    emoji: '🍳', faktor: 1.0 },
  { id: 'gasgrill',  name: 'Gasgrill (direkt)',  emoji: '🔥', faktor: 1.0 },
  { id: 'holzkohle', name: 'Holzkohle (direkt)', emoji: '⚫', faktor: 1.0,
    hinweis: 'Holzkohle schwankt stark – Zeit nur grob, Thermometer entscheidet.' },
];

export const START = [
  { id: 'kalt',       name: 'Aus dem Kühlschrank', emoji: '❄️', temp: 5 },
  { id: 'temperiert', name: 'Temperiert',          emoji: '🌡️', temp: 15 },
];
