// Meat again – lokale Speicherung auf dem Gerät (localStorage, robust gegen Fehler)
import { STANDARD_GERAETE } from './data.js';

const K = {
  auswahl: 'meatagain.auswahl.v1',
  teller: 'meatagain.teller.v1',
  geraete: 'meatagain.geraete.v1',
  anpassung: 'meatagain.anpassung.v1',
  messungen: 'meatagain.messungen.v1',
  einstellungen: 'meatagain.einstellungen.v1',
};

function lies(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch { return fallback; }
}
function schreib(key, wert) {
  try { localStorage.setItem(key, JSON.stringify(wert)); return true; } catch { return false; }
}

export const speicher = {
  auswahl: () => lies(K.auswahl, null),
  setAuswahl: (v) => schreib(K.auswahl, v),

  teller: () => { const t = lies(K.teller, []); return Array.isArray(t) ? t : []; },
  setTeller: (v) => schreib(K.teller, v),

  geraete: () => {
    const g = lies(K.geraete, null);
    return Array.isArray(g) && g.length ? g : STANDARD_GERAETE.map((x) => ({ ...x }));
  },
  setGeraete: (v) => schreib(K.geraete, v),

  anpassung: () => { const a = lies(K.anpassung, {}); return a && typeof a === 'object' ? a : {}; },
  setAnpassung: (v) => schreib(K.anpassung, v),

  messungen: () => { const m = lies(K.messungen, []); return Array.isArray(m) ? m : []; },
  setMessungen: (v) => schreib(K.messungen, v),
  neueMessung: (m) => {
    const alle = speicher.messungen();
    alle.push(m);
    return schreib(K.messungen, alle);
  },
  aendereMessung: (id, aenderung) => {
    const alle = speicher.messungen();
    const i = alle.findIndex((m) => m.id === id);
    if (i < 0) return false;
    alle[i] = { ...alle[i], ...aenderung };
    return schreib(K.messungen, alle);
  },

  einstellungen: () => ({ messModus: false, lernen: true, ...lies(K.einstellungen, {}) }),
  setEinstellungen: (v) => schreib(K.einstellungen, v),
};

/** Bittet den Browser, die Daten nicht automatisch zu löschen (wo unterstützt). */
export async function dauerhaftSpeichern() {
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch { /* egal */ }
}
