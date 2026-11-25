// Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLEISCH, START, SICHER, STANDARD_GERAETE, ANPASSUNG_MAX, TEMP_BEREICH } from '../js/data.js';
import {
  berechne, ablauf, nachgaren, zusatzzeit, kalibriere, neueAnpassung, zeitplan, csv, fmt,
  lerneFaktor, effektiverFaktor, anpassungAusUrteilen, anpassungsWert, leseTemp,
  NACHBRATEN_SEK, ZUSATZ_MIN_SEK, ZUSATZ_MAX_SEK, FAKTOR_MIN, FAKTOR_MAX, RUHE_MIN, RUHE_MAX,
} from '../js/model.js';

const f = (id) => FLEISCH.find((x) => x.id === id);
const pfanne = STANDARD_GERAETE[0];
const [kalt, temperiert] = START;
const basis = (x = {}) => ({ fleisch: f('rumpsteak'), stufe: 'medium', dicke: 2.5, tStart: temperiert.temp, geraet: pfanne, ...x });

test('Referenzfall: Rumpsteak 2,5 cm, medium rare, temperiert, Pfanne = 6 Min.', () => {
  const p = berechne(basis({ stufe: 'mediumRare' }));
  assert.equal(p.garSek, 360);
  assert.equal(p.raus, 52);
  assert.equal(p.ziel, 54);
  assert.equal(p.risiko, true);
});

test('Dicker, höhere Garstufe, kälterer Start und größerer Gerätefaktor → jeweils länger', () => {
  const t = (x) => berechne(basis(x)).garSek;
  assert.ok(t({ dicke: 3.5 }) > t({}));
  assert.ok(t({ stufe: 'wellDone' }) > t({}));
  assert.ok(t({ tStart: kalt.temp }) > t({}));
  assert.ok(t({ geraet: { ...pfanne, faktor: 1.3 } }) > t({}));
});

test('Schwein und Geflügel: immer Sicherheitsregel, durch nichts veränderbar', () => {
  const extremeAnpassung = { 'Schwein:sicher': -10, 'Geflügel:sicher': -10, 'Schwein:rare': -10 };
  for (const id of ['schweinekotelett', 'schweinefilet', 'haehnchenbrust']) {
    for (const stufe of ['rare', 'sicher', 'mediumRare']) {
      const p = berechne({ fleisch: f(id), stufe, dicke: 2.5, tStart: 5, geraet: { faktor: 0.1 }, anpassung: extremeAnpassung });
      assert.equal(p.sicher, true);
      assert.equal(p.raus, SICHER.pull);
      assert.equal(p.ziel, SICHER.hold);
      assert.equal(p.risiko, false);
      assert.equal(p.anpassung, 0);
      assert.ok(p.ruheSek >= SICHER.holdSec, 'Ruhezeit muss die Haltephase abdecken');
    }
  }
});

test('Risiko-Hinweis genau unter 63 °C – auch nach persönlicher Anpassung', () => {
  const r = (stufe, anpassung = {}) => berechne(basis({ fleisch: f('filet'), stufe, dicke: 4, anpassung })).risiko;
  assert.equal(r('medium'), true);
  assert.equal(r('mediumWell'), false);
  assert.equal(r('mediumWell', { 'Rind:mediumWell': -1 }), true);   // 62 °C
});

test('Persönliche Anpassung verschiebt Ziel und Herausnehmen, begrenzt auf ±4 °C', () => {
  const p = berechne(basis({ anpassung: { 'Rind:medium': 2 } }));
  assert.equal(p.ziel, 60);
  assert.equal(p.raus, 58);
  const q = berechne(basis({ anpassung: { 'Rind:medium': 99 } }));
  assert.equal(q.ziel, 58 + ANPASSUNG_MAX);
  assert.equal(neueAnpassung(0, 'roh'), 1);
  assert.equal(neueAnpassung(0, 'durch'), -1);
  assert.equal(neueAnpassung(2, 'gut'), 2);
  assert.equal(neueAnpassung(ANPASSUNG_MAX, 'roh'), ANPASSUNG_MAX);
  assert.equal(neueAnpassung(undefined, 'durch'), -1);
});

test('Nachgaren nach Dicke', () => {
  assert.equal(nachgaren(2), 1);
  assert.equal(nachgaren(3), 2);
  assert.equal(nachgaren(5), 3);
});

test('Ablauf Genuss: Seite 1, Seite 2, Messen, Ruhen, Fertig – mit Warteschritt bei Versatz', () => {
  const fl = f('rumpsteak');
  const plan = berechne(basis());
  assert.deepEqual(ablauf(plan, fl).map((s) => s.typ), ['timer', 'timer', 'check', 'timer', 'fertig']);
  const mitWarten = ablauf(plan, fl, 'gasgrill', 90);
  assert.equal(mitWarten[0].warten, true);
  assert.equal(mitWarten[0].sek, 90);
  assert.match(mitWarten[1].text, /Rost/);
  assert.equal(mitWarten.filter((s) => s.kochen).reduce((a, s) => a + s.sek, 0), plan.garSek);
});

test('Ablauf Sicherheit: Haltephase 2 Min. und Kontrollmessung ≥ 70 °C', () => {
  const fl = f('haehnchenbrust');
  const plan = berechne({ fleisch: fl, stufe: 'sicher', dicke: 2.5, tStart: 5, geraet: pfanne });
  const s = ablauf(plan, fl);
  const halte = s.find((x) => x.titel === 'Haltephase');
  const kontrolle = s.find((x) => x.titel === 'Kontrollmessung');
  assert.equal(halte.sek, SICHER.holdSec);
  assert.equal(kontrolle.grenze, SICHER.hold);
  assert.equal(s.find((x) => x.typ === 'check').grenze, SICHER.pull);
  const ruheGesamt = s.filter((x) => x.ruhe).reduce((a, x) => a + x.sek, 0);
  assert.equal(ruheGesamt, plan.ruheSek);
});

test('Haltephasen sind gekennzeichnet (nie überspringbar) – auch im Wiedererhitzen-Zweig', () => {
  for (const id of ['haehnchenbrust', 'schweinekotelett', 'schweinefilet']) {
    const fl = f(id);
    const s = ablauf(berechne({ fleisch: fl, stufe: 'sicher', dicke: 3, tStart: 5, geraet: pfanne }), fl, 'gasgrill', 60);
    const alle = [...s, ...s.flatMap((x) => x.neinSchritte || [])];
    const halte = alle.filter((x) => x.titel === 'Haltephase');
    assert.equal(halte.length, 2, 'Haltephase im Hauptablauf und nach dem Wiedererhitzen');
    for (const h of halte) {
      assert.equal(h.halte, true);
      assert.equal(h.sek, SICHER.holdSec);
    }
    // Kein anderer Schritt trägt das Kennzeichen
    assert.ok(alle.filter((x) => x.halte).every((x) => x.titel === 'Haltephase'));
  }
  const genuss = ablauf(berechne(basis()), f('rumpsteak'));
  assert.ok(!genuss.some((x) => x.halte), 'Rind hat keine Haltephase');
});

test('Ruhezeit: ⅓ der Garzeit, mindestens 3, höchstens 10 Minuten', () => {
  for (const x of [{ dicke: 1 }, { dicke: 2.5 }, { dicke: 6, stufe: 'wellDone', tStart: 5 }]) {
    const p = berechne(basis(x));
    const drittel = p.garSek / 3;
    assert.ok(p.ruheSek >= RUHE_MIN * 60 && p.ruheSek <= RUHE_MAX * 60);
    if (drittel > RUHE_MIN * 60 && drittel < RUHE_MAX * 60) assert.ok(Math.abs(p.ruheSek - drittel) <= 15);
  }
});

test('Ungültige Anpassung im Speicher: zählt als 0, Risiko-Hinweis bleibt (fail-safe)', () => {
  for (const kaputt of ['abc', null, NaN, {}, '']) {
    const p = berechne(basis({ fleisch: f('filet'), stufe: 'rare', anpassung: { 'Rind:rare': kaputt } }));
    assert.equal(p.anpassung, 0);
    assert.equal(p.ziel, 50);
    assert.equal(p.risiko, true);
  }
  assert.equal(anpassungsWert({ 'Rind:rare': '2' }, 'Rind:rare'), 2);
  assert.equal(anpassungsWert({ 'Rind:rare': 99 }, 'Rind:rare'), ANPASSUNG_MAX);
});

test('Zusatzzeit: ohne Messwert 1 Min., mit Messwert geschätzt und begrenzt', () => {
  assert.equal(zusatzzeit({ tStart: 5, grenze: 52, gemessen: null, gekochtSek: 300 }), NACHBRATEN_SEK);
  assert.equal(zusatzzeit({ tStart: 5, grenze: 52, gemessen: 55, gekochtSek: 300 }), 0);
  const knapp = zusatzzeit({ tStart: 5, grenze: 52, gemessen: 50, gekochtSek: 300 });
  const weit = zusatzzeit({ tStart: 5, grenze: 52, gemessen: 35, gekochtSek: 300 });
  assert.ok(knapp >= ZUSATZ_MIN_SEK && knapp < weit && weit <= ZUSATZ_MAX_SEK);
});

test('Kalibrierung: zu kurz → Faktor steigt, zu lang → sinkt, ohne Info → null', () => {
  const d = { faktor: 1, planSek: 360, tStart: 15, raus: 52, gekochtBeiErster: 360, gekochtGesamt: 360, neinAnzahl: 0 };
  const zuKalt = kalibriere({ ...d, ersteMessung: 45 });
  const zuHeiss = kalibriere({ ...d, ersteMessung: 60 });
  const genau = kalibriere({ ...d, ersteMessung: 52 });
  assert.ok(zuKalt.faktor > 1);
  assert.ok(zuHeiss.faktor < 1);
  assert.ok(Math.abs(genau.faktor - 1) < 0.01);
  assert.equal(kalibriere({ ...d, ersteMessung: null }), null);                    // „Ja“ ohne Messwert
  // Ohne Messwert wird auch nach „Noch nicht“ nicht gelernt (sonst nur Richtung „länger“ → Übergaren)
  assert.equal(kalibriere({ ...d, ersteMessung: null, neinAnzahl: 2, gekochtGesamt: 480 }), null);
  // Unplausible Messwerte werden verworfen statt geklemmt
  assert.equal(kalibriere({ ...d, ersteMessung: 685 }), null);
  assert.equal(kalibriere({ ...d, ersteMessung: 16 }), null);
  const extrem = kalibriere({ ...d, faktor: FAKTOR_MAX, ersteMessung: 20 });
  assert.ok(extrem.faktor <= FAKTOR_MAX);
  const extremRunter = kalibriere({ ...d, faktor: FAKTOR_MIN, ersteMessung: 100 });
  assert.ok(extremRunter.faktor >= FAKTOR_MIN);
});

test('Mehrere Stücke auf einem Gerät: Faktor überschießt nicht über die Beobachtung hinaus', () => {
  const snapshot = 1;
  const r = 1.4;
  let faktor = snapshot;
  for (let i = 0; i < 5; i++) faktor = lerneFaktor({ alt: faktor, snapshot, verhaeltnis: r });
  assert.ok(faktor <= r + 1e-9, `nach 5 gleichen Stücken ${faktor} ≤ ${r}`);
  assert.ok(faktor > 1.3);
  // Einzelstück wie bisher: halber Schritt (Lernrate 0,5)
  assert.equal(lerneFaktor({ alt: 1, snapshot: 1, verhaeltnis: 1.44 }), 1.2);
  assert.ok(lerneFaktor({ alt: FAKTOR_MAX, snapshot: FAKTOR_MAX, verhaeltnis: 1.6 }) <= FAKTOR_MAX);
});

test('Gerätefaktor je Hitzeregime: Schwein/Geflügel getrennt, Start vom Genuss-Faktor', () => {
  const g = { faktor: 1.2, lernSchritte: 3 };
  assert.equal(effektiverFaktor(g, 'genuss'), 1.2);
  assert.equal(effektiverFaktor(g, 'sicher'), 1.2, 'noch nichts für Sicherheitsfleisch gelernt');
  const g2 = { ...g, faktorSicher: 1.5, lernSchritteSicher: 1 };
  assert.equal(effektiverFaktor(g2, 'sicher'), 1.5);
  assert.equal(effektiverFaktor(g2, 'genuss'), 1.2);
  assert.equal(effektiverFaktor({ faktor: 'kaputt' }, 'genuss'), 1);
});

test('Feedback mehrerer Stücke in einem Durchgang: höchstens ±1 °C nach Mehrheit', () => {
  assert.equal(anpassungAusUrteilen(0, ['roh', 'roh']), 1);
  assert.equal(anpassungAusUrteilen(0, ['roh', 'durch']), 0);
  assert.equal(anpassungAusUrteilen(2, ['roh', 'roh', 'durch']), 3);
  assert.equal(anpassungAusUrteilen(-1, ['gut']), -1);
  assert.equal(anpassungAusUrteilen(ANPASSUNG_MAX, ['roh']), ANPASSUNG_MAX);
});

test('Temperatur-Eingabe: Komma/Punkt, Unsinn und unplausible Werte werden erkannt', () => {
  assert.deepEqual(leseTemp('68'), { wert: 68 });
  assert.deepEqual(leseTemp('68,5'), { wert: 68.5 });
  assert.deepEqual(leseTemp(' 71.5 °C '), { wert: 71.5 });
  assert.deepEqual(leseTemp(''), { leer: true });
  for (const falsch of ['685', '7,1,5', 'abc', '69,', ',5', '101', '-1', '1e2']) {
    assert.deepEqual(leseTemp(falsch), { fehler: true }, falsch);
  }
  assert.deepEqual(leseTemp('-3', TEMP_BEREICH.start), { wert: -3 });
  assert.deepEqual(leseTemp('45', TEMP_BEREICH.start), { fehler: true });
});

test('Zeitplan: alle Stücke gleichzeitig servierfertig', () => {
  const plaene = [
    berechne(basis({ stufe: 'mediumRare' })),
    berechne({ fleisch: f('haehnchenbrust'), stufe: 'sicher', dicke: 3, tStart: 5, geraet: pfanne }),
    berechne(basis({ stufe: 'wellDone', dicke: 2 })),
  ];
  const { versatz, gesamtSek } = zeitplan(plaene);
  assert.equal(Math.min(...versatz), 0);
  plaene.forEach((p, i) => {
    assert.ok(Math.abs(versatz[i] + p.garSek + p.ruheSek - gesamtSek) <= 5, `Stück ${i} endet gemeinsam`);
  });
  assert.deepEqual(zeitplan([]).versatz, []);
});

test('CSV: Semikolon, Dezimalkomma, Anführungszeichen, BOM', () => {
  const text = csv([{ datum: '25.11.2026', fleisch: 'Entrecôte', dicke: 2.5, notiz: 'Herd 7; "heiß"', messModus: true }]);
  assert.ok(text.startsWith('﻿'));
  const [kopf, zeile] = text.slice(1).trim().split('\r\n');
  assert.equal(kopf.split(';').length, zeile.split(';').length - 1);  // Notiz enthält ein ; in Anführungszeichen
  assert.match(zeile, /2,5/);
  assert.match(zeile, /"Herd 7; ""heiß"""/);
  assert.match(zeile, /;ja;/);
  // Notizen mit führendem =, +, - oder @ werden nicht als Formel ausgeführt
  const formel = csv([{ notiz: '=HYPERLINK("x")' }, { notiz: '+Deckel' }, { notiz: '-5 °C Start' }, { tStart: -5 }]);
  const zeilen = formel.slice(1).trim().split('\r\n').slice(1);
  assert.match(zeilen[0], /"'=HYPERLINK\(""x""\)"/);
  assert.match(zeilen[1], /;'\+Deckel;/);
  assert.match(zeilen[2], /;'-5 °C Start;/);
  assert.match(zeilen[3], /;-5;/, 'Zahlen bleiben Zahlen');
  assert.match(formel, /Messwartezeit_s;Plan_Ruhezeit_s;Ruhezeit_tatsaechlich_s/);
});

test('fmt', () => {
  assert.equal(fmt(0), '0:00');
  assert.equal(fmt(59.2), '1:00');
  assert.equal(fmt(605), '10:05');
  assert.equal(fmt(-3), '0:00');
});
