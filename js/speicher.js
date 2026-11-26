// Meat again – lokale Speicherung auf dem Gerät (localStorage, robust gegen Fehler)
import { STANDARD_GERAETE, GERAETE_TYPEN, ANPASSUNG_MAX } from './data.js';

const K = {
  auswahl: 'meatagain.auswahl.v1',
  teller: 'meatagain.teller.v1',
  tellerZeit: 'meatagain.tellerzeit.v1',
  geraete: 'meatagain.geraete.v1',
  anpassung: 'meatagain.anpassung.v1',
  messungen: 'meatagain.messungen.v1',
  einstellungen: 'meatagain.einstellungen.v1',
  lauf: 'meatagain.lauf.v1',
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
function entferne(key) {
  try { localStorage.removeItem(key); } catch { /* egal */ }
}

const zahlOder = (v, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback);

/** Nur ganze, begrenzte Zahlen übernehmen – Unsinn im Speicher darf keine Zielwerte verschieben. */
export function bereinigeAnpassung(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return {};
  const aus = {};
  for (const [k, v] of Object.entries(a)) {
    const n = Number(v);
    if (typeof k === 'string' && /^[^:]+:[a-zA-Z]+$/.test(k) && Number.isFinite(n) && Math.round(n)) {
      aus[k] = Math.max(-ANPASSUNG_MAX, Math.min(ANPASSUNG_MAX, Math.round(n)));
    }
  }
  return aus;
}

function bereinigeGeraet(g) {
  if (!g || typeof g !== 'object' || typeof g.id !== 'string' || !g.id) return null;
  const typ = GERAETE_TYPEN[g.typ] ? g.typ : 'pfanne';
  const aus = {
    id: g.id.slice(0, 40),
    name: String(g.name || GERAETE_TYPEN[typ].name).slice(0, 24),
    typ,
    faktor: Math.min(2.5, Math.max(0.4, zahlOder(g.faktor, 1))),
    lernSchritte: Math.max(0, Math.round(zahlOder(g.lernSchritte, 0))),
  };
  if (g.lernSchritteSicher > 0) {
    aus.faktorSicher = Math.min(2.5, Math.max(0.4, zahlOder(g.faktorSicher, aus.faktor)));
    aus.lernSchritteSicher = Math.round(zahlOder(g.lernSchritteSicher, 0));
  }
  return aus;
}

export function bereinigeGeraete(liste) {
  const g = Array.isArray(liste) ? liste.map(bereinigeGeraet).filter(Boolean) : [];
  const ids = new Set();
  const eindeutig = g.filter((x) => (ids.has(x.id) ? false : ids.add(x.id)));
  return eindeutig.length ? eindeutig : STANDARD_GERAETE.map((x) => ({ ...x }));
}

export const speicher = {
  auswahl: () => { const a = lies(K.auswahl, null); return a && typeof a === 'object' ? a : null; },
  setAuswahl: (v) => schreib(K.auswahl, v),

  teller: () => {
    const t = lies(K.teller, []);
    return Array.isArray(t) ? t.filter((x) => x && typeof x === 'object' && x.id && x.fleischId) : [];
  },
  tellerZeit: () => lies(K.tellerZeit, null),
  setTeller: (v) => { schreib(K.tellerZeit, v.length ? Date.now() : null); return schreib(K.teller, v); },

  geraete: () => bereinigeGeraete(lies(K.geraete, null)),
  setGeraete: (v) => schreib(K.geraete, v),

  anpassung: () => bereinigeAnpassung(lies(K.anpassung, {})),
  setAnpassung: (v) => schreib(K.anpassung, bereinigeAnpassung(v)),

  messungen: () => {
    const m = lies(K.messungen, []);
    return Array.isArray(m) ? m.filter((x) => x && typeof x === 'object') : [];
  },
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

  einstellungen: () => {
    const e = lies(K.einstellungen, {});
    const roh = e && typeof e === 'object' ? e : {};
    return {
      messModus: roh.messModus === true,
      lernen: roh.lernen !== false,
      musikMischen: roh.musikMischen === true,
    };
  },
  setEinstellungen: (v) => schreib(K.einstellungen, v),

  /** Laufender Garvorgang – damit ein Neuladen oder Beenden durch iOS keine Timer verliert. */
  lauf: () => { const l = lies(K.lauf, null); return l && typeof l === 'object' && Array.isArray(l.stuecke) ? l : null; },
  setLauf: (v) => schreib(K.lauf, v),
  loescheLauf: () => entferne(K.lauf),
};

// ───────── Datensicherung (z. B. von Safari in die Home-Screen-App umziehen) ─────────
export const SICHERUNG_KENNUNG = 'meat-again-sicherung';

export function sicherungErstellen() {
  return {
    app: SICHERUNG_KENNUNG, version: 1, erstellt: new Date().toISOString(),
    geraete: speicher.geraete(),
    anpassung: speicher.anpassung(),
    einstellungen: speicher.einstellungen(),
    messungen: speicher.messungen(),
  };
}

/**
 * Prüft eine Sicherung. Gibt die bereinigten Daten zurück oder wirft einen Fehler mit lesbarer Meldung.
 */
export function sicherungPruefen(daten) {
  if (!daten || typeof daten !== 'object' || daten.app !== SICHERUNG_KENNUNG) {
    throw new Error('Das ist keine Meat-again-Sicherung.');
  }
  if (!Array.isArray(daten.geraete) || !Array.isArray(daten.messungen)) {
    throw new Error('Die Sicherung ist unvollständig.');
  }
  const e = daten.einstellungen && typeof daten.einstellungen === 'object' ? daten.einstellungen : {};
  return {
    geraete: bereinigeGeraete(daten.geraete),
    anpassung: bereinigeAnpassung(daten.anpassung),
    einstellungen: { messModus: e.messModus === true, lernen: e.lernen !== false, musikMischen: e.musikMischen === true },
    messungen: daten.messungen.filter((m) => m && typeof m === 'object' && !Array.isArray(m)),
  };
}

export function sicherungEinspielen(sauber) {
  return speicher.setGeraete(sauber.geraete)
    && speicher.setAnpassung(sauber.anpassung)
    && speicher.setEinstellungen(sauber.einstellungen)
    && speicher.setMessungen(sauber.messungen);
}

/** Bittet den Browser, die Daten nicht automatisch zu löschen (wo unterstützt). */
export async function dauerhaftSpeichern() {
  try { if (navigator.storage?.persist) return await navigator.storage.persist(); } catch { /* egal */ }
  return false;
}
export async function istDauerhaft() {
  try { if (navigator.storage?.persisted) return await navigator.storage.persisted(); } catch { /* egal */ }
  return false;
}
