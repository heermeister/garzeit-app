// Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANPASSUNG_MAX, STANDARD_GERAETE } from '../js/data.js';
import { bereinigeAnpassung, bereinigeGeraete, sicherungPruefen, SICHERUNG_KENNUNG } from '../js/speicher.js';

test('Anpassungen aus dem Speicher: nur ganze, begrenzte Zahlen', () => {
  assert.deepEqual(bereinigeAnpassung({ 'Rind:rare': '2', 'Rind:medium': 'abc', 'Lamm:medium': 99, 'Rind:wellDone': 0, kaputt: 1 }),
    { 'Rind:rare': 2, 'Lamm:medium': ANPASSUNG_MAX });
  assert.deepEqual(bereinigeAnpassung(null), {});
  assert.deepEqual(bereinigeAnpassung([1, 2]), {});
});

test('Geräte aus dem Speicher: kaputte Einträge raus, Faktor begrenzt, nie leer', () => {
  const g = bereinigeGeraete([null, { id: 'a', name: 'Gusseisen', typ: 'pfanne', faktor: '9' }, { id: 'a', name: 'doppelt' },
    { id: 'b', typ: 'unbekannt', faktor: 'x' }, { name: 'ohne id' }]);
  assert.equal(g.length, 2);
  assert.equal(g[0].faktor, 2.5);
  assert.equal(g[1].typ, 'pfanne');
  assert.equal(g[1].faktor, 1);
  assert.deepEqual(bereinigeGeraete('Unsinn').map((x) => x.id), STANDARD_GERAETE.map((x) => x.id));
});

test('Sicherung: fremde oder unvollständige Dateien werden abgelehnt, gültige bereinigt', () => {
  assert.throws(() => sicherungPruefen({ app: 'etwas-anderes' }), /keine Meat-again-Sicherung/);
  assert.throws(() => sicherungPruefen({ app: SICHERUNG_KENNUNG, geraete: [] }), /unvollständig/);
  const s = sicherungPruefen({
    app: SICHERUNG_KENNUNG, version: 1,
    geraete: [{ id: 'grill', name: 'Weber', typ: 'gasgrill', faktor: 1.2, lernSchritte: 3 }],
    anpassung: { 'Rind:medium': 1, 'Rind:rare': 'x' },
    einstellungen: { messModus: 'ja', lernen: false },
    messungen: [{ fleisch: 'Rumpsteak' }, null, 'Unsinn'],
  });
  assert.equal(s.geraete[0].name, 'Weber');
  assert.deepEqual(s.anpassung, { 'Rind:medium': 1 });
  assert.deepEqual(s.einstellungen, { messModus: false, lernen: false, musikMischen: false });
  assert.equal(s.messungen.length, 1);
});
