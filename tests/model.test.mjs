// Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLEISCH, GERAETE, START, SICHER } from '../js/data.js';
import { berechne, ablauf, nachgaren } from '../js/model.js';

const f = (id) => FLEISCH.find((x) => x.id === id);
const pfanne = GERAETE[0];
const [kalt, temperiert] = START;

test('Referenzfall: Rumpsteak 2,5 cm, medium rare, temperiert, Pfanne ≈ 6 Min.', () => {
  const p = berechne({ fleisch: f('rumpsteak'), stufe: 'mediumRare', dicke: 2.5, start: temperiert, geraet: pfanne });
  assert.equal(p.garSek, 360);
  assert.equal(p.raus, 52);
  assert.equal(p.ziel, 54);
  assert.equal(p.risiko, true);
});

test('Dickeres Fleisch, höhere Garstufe und Kühlschrank brauchen jeweils länger', () => {
  const basis = { fleisch: f('rumpsteak'), stufe: 'medium', dicke: 2.5, start: temperiert, geraet: pfanne };
  const t = (x) => berechne({ ...basis, ...x }).garSek;
  assert.ok(t({ dicke: 3.5 }) > t({}));
  assert.ok(t({ stufe: 'wellDone' }) > t({}));
  assert.ok(t({ start: kalt }) > t({}));
});

test('Schwein und Geflügel: immer Sicherheitsregel, nie Risiko-Hinweis', () => {
  for (const id of ['schweinekotelett', 'schweinefilet', 'haehnchenbrust']) {
    const p = berechne({ fleisch: f(id), stufe: 'rare', dicke: 2.5, start: kalt, geraet: pfanne });
    assert.equal(p.sicher, true);
    assert.equal(p.raus, SICHER.pull);
    assert.equal(p.ziel, SICHER.hold);
    assert.equal(p.risiko, false);
    assert.ok(p.ruheSek >= SICHER.holdSec, 'Ruhezeit muss die Haltephase abdecken');
  }
});

test('Risiko-Hinweis genau unter 63 °C', () => {
  const p = (stufe) => berechne({ fleisch: f('filet'), stufe, dicke: 4, start: kalt, geraet: pfanne }).risiko;
  assert.equal(p('medium'), true);
  assert.equal(p('mediumWell'), false);
});

test('Nachgaren nach Dicke', () => {
  assert.equal(nachgaren(2), 1);
  assert.equal(nachgaren(3), 2);
  assert.equal(nachgaren(5), 3);
});

test('Ablauf Sicherheitsfleisch enthält Haltephase und Kontrollmessung', () => {
  const fl = f('haehnchenbrust');
  const plan = berechne({ fleisch: fl, stufe: 'sicher', dicke: 2.5, start: kalt, geraet: pfanne });
  const titel = ablauf(plan, fl).map((s) => s.titel);
  assert.ok(titel.includes('Haltephase'));
  assert.ok(titel.includes('Kontrollmessung'));
  assert.equal(titel.at(-1), 'Guten Appetit! 🍽️');
});
