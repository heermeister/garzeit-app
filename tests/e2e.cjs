// Browser-Test mit vorgespulter Uhr. Ausführen mit: npm run e2e
// Startet einen lokalen Server, spielt mehrere Abläufe auf einem simulierten iPhone und Android-Handy durch.
const { chromium, webkit, devices } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const ROOT = path.join(__dirname, '..');
const TYPEN = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const AUSGABE = process.env.SCREENSHOTS || '';

function server() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      const datei = p.endsWith('/') ? path.join(p, 'index.html') : p;
      if (!datei.startsWith(ROOT) || !fs.existsSync(datei)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': TYPEN[path.extname(datei)] || 'application/octet-stream' });
      fs.createReadStream(datei).pipe(res);
    }).listen(0, () => resolve(s));
  });
}

async function neueSeite(browser, geraet, url) {
  const { defaultBrowserType, ...profil } = devices[geraet];
  const ctx = await browser.newContext({ ...profil, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const fehler = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });
  page.dialoge = [];
  page.on('dialog', (d) => { page.dialoge.push(d.message()); d.accept(); });
  await page.clock.install();
  await page.goto(url);
  return { ctx, page, fehler };
}

const vorspulen = async (page, sek) => { await page.clock.runFor(sek * 1000); };
// Lange Wartezeiten: Uhr springt (wie ein gesperrtes Handy, Timer feuern einmal), dann kurz weiterlaufen
const springe = async (page, sek) => { await page.clock.fastForward(sek * 1000); await page.clock.runFor(1000); };
const text = (page, sel) => page.locator(sel).first().textContent();
const sekunden = (zeit) => zeit.trim().split(':').map(Number).reduce((a, x) => a * 60 + x, 0);   // m:ss oder h:mm:ss
const setzeDicke = (page, cm) => page.$eval('#dicke', (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, String(cm));
const abbrechen = async (page) => { await page.click('#t-abbruch'); assert.equal(await page.isVisible('#v-auswahl'), true); };
const lies = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
const letzteMessung = async (page) => (await lies(page, 'meatagain.messungen.v1')).at(-1);
/**
 * Simuliert „iOS hat die App im Hintergrund beendet und sie wird X Stunden später geöffnet“:
 * gespeicherten Lauf um X h in die Vergangenheit schieben, weiteres Speichern (pagehide) verhindern, neu laden.
 */
async function spaeterOeffnen(page, stunden, { altesFormat = false } = {}) {
  await page.evaluate(([h, alt]) => {
    const k = 'meatagain.lauf.v1';
    const l = JSON.parse(localStorage.getItem(k));
    const d = h * 3600 * 1000;
    const schiebe = (o, felder) => { for (const f of felder) if (Number.isFinite(o[f])) o[f] -= d; };
    schiebe(l, ['gespeichertUm', 'gueltigBis', 'pausiertSeit']);
    for (const st of l.stuecke) schiebe(st, ['endeUm', 'checkSeit', 'badSeit']);
    if (alt) {
      // Speicherstand wie vor dem Update: ohne gueltigBis, badSeit und imBad
      delete l.gueltigBis;
      for (const st of l.stuecke) {
        delete st.badSeit;
        for (const x of st.schritte) { delete x.imBad; for (const y of x.neinSchritte || []) delete y.imBad; }
      }
    }
    localStorage.setItem(k, JSON.stringify(l));
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, v) { if (key !== k) orig.call(this, key, v); };
  }, [stunden, altesFormat]);
  await page.reload();
}
const shot = async (page, name) => { if (AUSGABE) await page.screenshot({ path: path.join(AUSGABE, `${name}.png`), fullPage: true }); };

async function einzelStueckGenuss(page) {
  const iphone = await page.evaluate(() => /iPhone/.test(navigator.userAgent));
  assert.equal(await page.isVisible('#ios-banner'), iphone, 'Installations-Tipp nur auf dem iPhone');
  await page.click('text=Rumpsteak');
  await page.click('button.chip:has-text("Medium rare")');
  assert.equal(await page.isVisible('#risiko-info'), true, 'Risiko-Hinweis bei medium rare');
  // Dicke-Hinweis erst ab 5 cm; ± verstellt in 0,5-cm-Schritten
  assert.equal(await page.isVisible('#dicke-info'), false);
  for (let i = 0; i < 5; i++) await page.click('#dicke-plus');
  assert.equal(await text(page, '#dicke-wert'), '5 cm');
  assert.equal(await page.isVisible('#dicke-info'), true, 'Hinweis für dicke Stücke');
  for (let i = 0; i < 5; i++) await page.click('#dicke-minus');
  assert.equal(await text(page, '#dicke-wert'), '2,5 cm');
  await page.click('button.chip:has-text("Temperiert")');
  await page.click('button.chip:has-text("Pfanne")');
  assert.equal(await text(page, '#p-gar'), '6:00 Min.');
  await shot(page, '01-auswahl');
  await page.click('#start');
  assert.equal(await text(page, '#h-titel'), 'Seite 1 anbraten');
  assert.equal(await text(page, '#h-zeit'), '3:00');
  assert.equal(await text(page, '.s-aktion .weiter'), '⏭️ Überspringen');
  await shot(page, '02-timer');
  await vorspulen(page, 181);
  assert.equal(await text(page, '#h-titel'), 'Seite 2', 'nach 3 Min. automatisch Seite 2');
  await vorspulen(page, 180);
  assert.match(await text(page, '#h-titel'), /Kerntemperatur messen/);
  // 45 °C eingetragen → „Noch nicht“ → geschätzte Zusatzzeit
  await page.fill('.temp-eingabe', '45');
  await page.click('button:has-text("Noch nicht")');
  assert.equal(await text(page, '.s-titel'), 'Weiterbraten');
  const zusatz = await text(page, '#h-zeit');
  assert.notEqual(zusatz, '1:00', 'mit Messwert wird die Zusatzzeit geschätzt');
  await vorspulen(page, 400);
  await shot(page, '03-messen');
  // 51 °C und „Ja“ bei Grenze 52 °C → Rückfrage statt stiller Übernahme
  page.dialoge.length = 0;
  await page.fill('.temp-eingabe', '51');
  await page.click('button:has-text("Ja")');
  assert.match(page.dialoge.join(' | '), /51 °C ist unter 52 °C\. Trotzdem/);
  assert.equal(await text(page, '#h-titel'), 'Ruhen lassen');
  await vorspulen(page, 600);
  assert.equal(await text(page, '#h-titel'), 'Guten Appetit! 🍽️');
  await page.click('button:has-text("zu roh")');
  assert.match(await text(page, '.s-aktion'), /Gespeichert/);
  await shot(page, '04-fertig');
  await page.click('#t-neu');
  // Lernen + persönliche Anpassung sichtbar
  await page.click('button.chip:has-text("Medium rare")');
  assert.match(await text(page, '#stufen-liste button[aria-pressed="true"]'), /55 °C ✱/);
  assert.equal(await page.isVisible('#p-faktor'), true, 'gelernter Gerätefaktor wird angezeigt');
}

async function sicherheitsAblauf(page) {
  await page.click('text=Hähnchenbrust');
  assert.equal(await page.isVisible('#sicher-info'), true);
  await page.click('#start');
  await vorspulen(page, 3600);   // alle Bratzeiten vorbei → wartet auf Messung, ohne weiterzulaufen
  assert.match(await text(page, '#h-titel'), /Kerntemperatur messen/);
  // „Ja“ ohne Messwert zählt bei Geflügel nicht
  await page.click('button:has-text("Ja")');
  assert.match(await text(page, '#h-titel'), /Kerntemperatur messen/, 'Ja ohne Wert wird abgelehnt');
  // „Ja“ mit eingetragenen 68 °C darf NICHT als Ja zählen
  await page.fill('.temp-eingabe', '68');
  await page.click('button:has-text("Ja")');
  assert.equal(await text(page, '.s-titel'), 'Weiterbraten', 'unter 72 °C → weiter garen');
  await vorspulen(page, 400);
  // Unsinnige Eingaben werden nicht übernommen (z. B. vergessenes Komma)
  for (const falsch of ['7,1,5', '725']) {
    await page.fill('.temp-eingabe', falsch);
    await page.click('button:has-text("Ja")');
    assert.match(await text(page, '#h-titel'), /Kerntemperatur messen/, `${falsch} wird abgelehnt`);
    assert.equal(await page.getAttribute('.temp-eingabe', 'aria-invalid'), 'true');
  }
  await page.fill('.temp-eingabe', '73,5');
  await page.click('button:has-text("Ja")');
  assert.equal(await text(page, '#h-titel'), 'Haltephase');
  // Die Haltephase lässt sich nicht überspringen – auch nicht in der Pause
  assert.equal(await page.locator('.s-aktion .weiter').count(), 0, 'kein Überspringen in der Haltephase');
  assert.equal(await page.isVisible('.halte-hinweis'), true);
  await page.click('#t-pause');
  assert.equal(await text(page, '#t-pause'), '▶️ Fortsetzen');
  assert.equal(await page.locator('button.weiter').count(), 0);
  await vorspulen(page, 300);
  assert.equal(await text(page, '#h-titel'), 'Haltephase', 'Pause hält auch die Haltephase an');
  await page.click('#t-pause');
  await vorspulen(page, 118);
  assert.equal(await text(page, '#h-titel'), 'Haltephase', 'vor Ablauf der 2 Minuten keine Kontrollmessung');
  await vorspulen(page, 3);
  assert.match(await text(page, '#h-titel'), /Kontrollmessung/);
  await shot(page, '03b-kontrolle');
  await page.click('button:has-text("Noch nicht")');
  assert.match(await text(page, '.s-titel'), /Zurück in die Pfanne/);
  await vorspulen(page, 61);
  await page.fill('.temp-eingabe', '74');
  await page.click('button:has-text("Ja")');   // ≥ 72 °C
  assert.equal(await text(page, '#h-titel'), 'Haltephase', 'nach Wiedererhitzen erneut 2 Min. Haltephase');
  assert.equal(await page.locator('.s-aktion .weiter').count(), 0, 'auch die zweite Haltephase ist nicht überspringbar');
  await vorspulen(page, 121);
  await page.fill('.temp-eingabe', '71');
  await page.click('button:has-text("Ja")');   // Kontrolle ok
  const m = await letzteMessung(page);
  assert.equal(m.rausGemessen, 73.5, 'Pfanne: „Kern beim Rausnehmen“ bleibt der Wert vor der Haltephase');
  assert.equal(m.kontrolleGemessen, 71, 'Kontrollmessung eigenes Feld');
  await vorspulen(page, 900);
  assert.equal(await text(page, '#h-titel'), 'Guten Appetit! 🍽️');
  await page.click('#t-neu');
}

async function doppelTipp(page) {
  await page.click('text=Rumpsteak');
  await page.click('#start');
  await vorspulen(page, 1);
  await page.click('.s-aktion .weiter');
  assert.equal(await text(page, '#h-titel'), 'Seite 2');
  // zweiter Tipp direkt hinterher trifft den neuen Knopf → wird ignoriert
  await page.click('.s-aktion .weiter');
  assert.equal(await text(page, '#h-titel'), 'Seite 2', 'Doppel-Tipp überspringt nicht gleich den nächsten Schritt');
  await vorspulen(page, 1);
  await page.click('.s-aktion .weiter');
  assert.match(await text(page, '#h-titel'), /Kerntemperatur messen/);
  await vorspulen(page, 1);
  await page.fill('.temp-eingabe', '53');
  await page.click('button:has-text("Ja")');
  await page.click('.s-aktion .weiter');
  assert.equal(await text(page, '#h-titel'), 'Ruhen lassen', 'Ruhezeit nicht versehentlich übersprungen');
  await abbrechen(page);
}

async function neuLaden(page) {
  // Läuft als erstes Szenario: Playwrights Test-Uhr verschiebt sich beim Neuladen um die
  // Rechenzeit früherer runFor-Aufrufe. Verglichen wird deshalb mit der Uhr der Seite selbst.
  await page.click('text=Rumpsteak');
  await page.click('#start');
  await vorspulen(page, 100);
  await page.reload();
  assert.equal(await page.isVisible('#v-timer'), true, 'nach dem Neuladen läuft der Garvorgang weiter');
  assert.equal(await text(page, '#h-titel'), 'Seite 1 anbraten');
  const [endeUm, jetzt] = await page.evaluate(() => [JSON.parse(localStorage.getItem('meatagain.lauf.v1')).stuecke[0].endeUm, Date.now()]);
  const rest = sekunden(await text(page, '#h-zeit'));
  assert.ok(Math.abs(rest - (endeUm - jetzt) / 1000) <= 2, 'Restzeit aus dem gespeicherten Zustand');
  const seite = sekunden(await text(page, '.s-danach').then((t) => t.match(/\((\d+:\d+)\)/)[1]));
  assert.ok(rest < seite - 90, `Zeit lief weiter (Rest ${rest} s, Seite ${seite} s)`);
  await vorspulen(page, rest + 1);
  assert.equal(await text(page, '#h-titel'), 'Seite 2');
  await abbrechen(page);
  assert.equal(await page.evaluate(() => localStorage.getItem('meatagain.lauf.v1')), null, 'nach Abbruch nichts mehr gespeichert');
  await page.reload();
  assert.equal(await page.isVisible('#v-auswahl'), true);
}

async function auflegenVerpasst(page) {
  // Zwei Stücke: das kürzere wartet. Die App „schläft“ (Hintergrund) über den Auflege-Zeitpunkt hinweg.
  await page.click('text=Hähnchenbrust');
  await page.click('#hinzu');
  await page.click('text=Rumpsteak');
  await page.click('button.chip:has-text("Medium rare")');
  await page.click('#hinzu');
  await page.click('#start');
  const karte = page.locator('.stueck').nth(1);
  assert.equal(await karte.locator('.s-titel').textContent(), 'Wartet');
  const warten = sekunden(await karte.locator('.s-zeit').textContent());
  const seite = sekunden((await karte.locator('.s-danach').textContent()).match(/\((\d+:\d+)\)/)[1]);
  await page.clock.fastForward((warten + 60) * 1000);   // wie ein gesperrtes iPhone: Timer feuern nur einmal
  await vorspulen(page, 0.5);
  assert.equal(await karte.locator('.s-titel').textContent(), 'Seite 1 anbraten');
  const rest = sekunden(await karte.locator('.s-zeit').textContent());
  assert.ok(rest >= seite - 2, `Seite 1 beginnt erst jetzt (Rest ${rest} s, geplant ${seite} s)`);
  await abbrechen(page);
  await page.click('#teller-leeren');
}

async function mehrereStuecke(page) {
  await page.click('text=Hähnchenbrust');
  await page.fill('#name', 'Kind');
  await page.click('#hinzu');
  await page.click('text=Rumpsteak');
  await page.click('button.chip:has-text("Medium rare")');
  await page.fill('#name', 'Papa');
  await page.click('#hinzu');
  assert.equal(await page.isVisible('#teller-risiko'), true, 'Risiko-Hinweis auch für Stücke auf der Liste');
  assert.match(await text(page, '#teller-risiko'), /Papa/);
  await page.click('button.chip:has-text("Well done")');
  await page.click('#hinzu');
  assert.equal(await page.locator('.teller-eintrag').count(), 3);
  assert.equal(await page.isVisible('#plan-hinweis'), true, 'Plan oben ist nur eine Vorschau');
  assert.equal(await page.isVisible('#teller-plan'), true);
  assert.match(await text(page, '#start'), /3 Stücke/);
  await shot(page, '05-teller');
  // Auswahl oben geändert, aber nicht hinzugefügt → Start fragt nach
  await page.click('text=Lammkotelett');
  page.dialoge.length = 0;
  await page.click('#start');
  assert.match(page.dialoge.join(' | '), /Lammkotelett .* ist noch nicht auf der Liste/);
  assert.equal(await page.locator('.stueck').count(), 4);
  // Kind (Hähnchen, längste Zeit) startet sofort, die anderen warten
  const titel = await page.locator('.s-titel').allTextContents();
  assert.equal(titel[0], 'Seite 1 anbraten');
  assert.equal(titel[1], 'Wartet');
  assert.match(await text(page, '#h-wer'), /Als Nächstes/);
  await shot(page, '06-parallel');
  // Pause hält alle Uhren an
  const vorher = await page.locator('.s-zeit').allTextContents();
  await page.click('#t-pause');
  await vorspulen(page, 30);
  assert.deepEqual(await page.locator('.s-zeit').allTextContents(), vorher, 'Pause friert alle Timer ein');
  await page.click('#t-pause');
  // Unterwegs in ⚙️: Leiste führt zurück zum Timer
  await page.click('#nav-einstellungen');
  assert.equal(await page.isVisible('#laufleiste'), true);
  await page.click('#laufleiste');
  assert.equal(await page.isVisible('#v-timer'), true);
  // Durchspielen: alle Messungen mit 75 °C und Ja beantworten, bis alles fertig ist
  for (let i = 0; i < 60; i++) {
    await vorspulen(page, 60);
    const wartend = page.locator('.stueck.wartet-auf-dich');
    while (await wartend.count()) {
      const k = wartend.first();
      await k.locator('.temp-eingabe').fill('75');
      await k.locator('button:has-text("✅ Ja")').click();
    }
    if ((await text(page, '#h-titel')) === 'Guten Appetit! 🍽️') break;
  }
  assert.equal(await text(page, '#h-titel'), 'Guten Appetit! 🍽️');
  // Nach „fertig“ ist die Rückmeldung über 🥩 wieder erreichbar
  await page.click('#nav-einstellungen');
  await page.click('#nav-home');
  assert.equal(await page.isVisible('#v-timer'), true);
  assert.equal(await page.locator('.stueck button:has-text("zu roh")').count(), 3, 'Rückmeldung für alle Rind- und Lamm-Stücke');
  await page.click('#t-neu');
}

async function sousVideRind(page) {
  await page.click('text=Rumpsteak');
  await page.click('#methode-liste button:has-text("Sous-vide")');
  assert.equal(await page.isVisible('#sv-info'), true);
  assert.equal(await page.locator('#start-liste button:has-text("Temperiert")').count(), 0, 'Sous-vide: nur Kühlschrank oder gefroren');
  await page.locator('#stufen-liste button').first().click();   // Rare, Bad 50 °C
  assert.match(await text(page, '#stufen-liste button'), /Bad 50 °C/);
  await setzeDicke(page, 4);
  assert.equal(await page.isDisabled('#start'), true, '4 cm rare: zu lange unter 55 °C');
  assert.match(await text(page, '#sv-warn'), /höchstens 3\u00a0h/);
  assert.match(await text(page, '#sv-warn'), /Spielraum/);
  assert.equal(await text(page, '#p-ruhe'), '–', 'gesperrt: kein Zeitfenster');
  await page.click('#start-liste button:has-text("Gefroren")');
  await setzeDicke(page, 2);
  assert.match(await text(page, '#sv-warn'), /Gefroren/);
  await page.click('#start-liste button:has-text("Kühlschrank")');
  await setzeDicke(page, 2.5);
  assert.equal(await page.isDisabled('#start'), false);
  assert.equal(await text(page, '#p-gar'), '50 °C');
  assert.match(await text(page, '#sv-warn'), /Anbraten ist Pflicht/);
  await shot(page, '09-sousvide');
  // Im selben Bad nur eine Temperatur
  await page.click('#hinzu');
  await page.click('text=Hähnchenbrust');
  await page.click('#hinzu');
  assert.equal(await page.locator('.teller-eintrag').count(), 1, 'Hähnchen (72 °C) passt nicht ins 50-°C-Bad');
  assert.match(await text(page, '#toast'), /nur eine Temperatur/);
  page.dialoge.length = 0;
  await page.click('#start');
  assert.match(page.dialoge.join(' | '), /Auch mitgaren/);
  assert.equal(await page.isVisible('#v-auswahl'), true, '„Ja“, aber Stück passt nicht ins Bad → nicht ohne es starten');
  assert.match(await text(page, '#toast'), /nur eine Temperatur/);
  await page.click('#teller-leeren');
  await page.click('text=Rumpsteak');
  await page.locator('#stufen-liste button').first().click();
  await setzeDicke(page, 2.5);
  await page.click('#start');
  assert.equal(await text(page, '#h-titel'), '🛁 Wasserbad vorheizen');
  await springe(page, 1200);
  assert.equal(await text(page, '#h-titel'), '🛁 Wasserbad vorheizen', 'Vorheizen wartet auf Bestätigung');
  await page.click('button:has-text("Bad ist warm")');
  assert.equal(await text(page, '#h-titel'), 'Im Wasserbad');
  assert.match(await text(page, '.s-text'), /Fertig ab \d\d:\d\d/);
  await shot(page, '10-sousvide-bad');
  const ab = sekunden(await text(page, '#h-zeit'));
  assert.ok(ab > 3600, 'Mindestzeit über eine Stunde');
  await springe(page, ab + 1);
  assert.equal(await text(page, '#h-titel'), 'Kann raus');
  await vorspulen(page, 1);
  await page.click('button:has-text("Jetzt raus")');
  assert.equal(await text(page, '#h-titel'), 'Anbraten Seite 1');
  assert.match(await text(page, '.s-text'), /Pflicht/);
  await vorspulen(page, 46);
  assert.equal(await text(page, '#h-titel'), 'Anbraten Seite 2');
  await vorspulen(page, 46);
  assert.equal(await text(page, '#h-titel'), 'Guten Appetit! 🍽️');
  await page.click('#t-neu');
}

async function sousVideHaehnchen(page) {
  await page.click('text=Hähnchenbrust');
  assert.equal(await text(page, '#p-gar'), '72 °C');
  await page.click('#start');
  // Doppel-Tipp-Schutz: direkt nach dem Start wird „Bad ist warm“ ignoriert
  await page.click('button:has-text("Bad ist warm")');
  assert.equal(await text(page, '#h-titel'), '🛁 Wasserbad vorheizen', 'Doppel-Tipp auf „Los!“ bestätigt nicht das Bad');
  await vorspulen(page, 1);
  await page.click('button:has-text("Bad ist warm")');
  assert.equal(await text(page, '#h-titel'), 'Im Wasserbad');
  assert.equal(await page.locator('.s-aktion .weiter').count(), 0, 'Mindestzeit bei Hähnchen nicht überspringbar');
  assert.equal(await page.isVisible('.halte-hinweis'), true);
  const ab = sekunden(await text(page, '#h-zeit'));
  await springe(page, ab - 60);
  assert.equal(await text(page, '#h-titel'), 'Im Wasserbad');
  await vorspulen(page, 61);
  assert.equal(await text(page, '#h-titel'), 'Kann raus');
  await vorspulen(page, 1);
  await page.click('button:has-text("Jetzt raus")');
  assert.match(await text(page, '#h-titel'), /Kontrollmessung/);
  await vorspulen(page, 1);
  await page.click('button:has-text("Ja")');
  assert.match(await text(page, '#h-titel'), /Kontrollmessung/, 'Ja ohne Messwert wird abgelehnt');
  assert.match(await text(page, '#toast'), /Wert eintragen/);
  await page.fill('.temp-eingabe', '68');
  await page.click('button:has-text("Ja")');
  assert.equal(await text(page, '.s-titel'), 'Zurück ins Bad', 'unter 70 °C → zurück ins Bad');
  assert.equal(await page.locator('.s-aktion .weiter').count(), 0);
  await springe(page, 15 * 60 + 1);
  // Heißer als das 72-°C-Bad geht nicht → Tippfehler/Fehlmessung, nicht als „Ja“ werten
  page.dialoge.length = 0;
  await page.fill('.temp-eingabe', '95');
  await page.click('button:has-text("Ja")');
  assert.match(await text(page, '#h-titel'), /Kontrollmessung/, '95 °C im 72-°C-Bad wird nicht angenommen');
  assert.match(await text(page, '#toast'), /heißer als das Bad/);
  assert.equal(page.dialoge.length, 0, 'unmöglicher Wert: keine Rückfrage, sondern Ablehnung');
  // Etwas über dem Bad (Stick/Thermometer weichen ab): Rückfrage statt Sackgasse
  await page.fill('.temp-eingabe', '74');
  await page.click('button:has-text("Ja")');
  assert.match(page.dialoge.join(' | '), /heißer als das 72/);
  assert.equal(await text(page, '#h-titel'), 'Anbraten Seite 1');
  const m = await letzteMessung(page);
  assert.equal(m.rausGemessen, 74);
  assert.equal(m.kontrolleGemessen, 74);
  assert.ok(m.badSek > 0, 'tatsächliche Badzeit gespeichert');
  await vorspulen(page, 100);
  assert.equal(await text(page, '#h-titel'), 'Guten Appetit! 🍽️');
  await page.click('#t-neu');
  await page.click('#methode-liste button:has-text("Pfanne")');
}

async function sousVidePauseHoechstzeit(page) {
  // Rumpsteak rare, 50 °C: harte Grenze 3 h – die Pause darf sie nicht verschieben
  // (medium rare liegt hier schon bei 55 °C: persönliche Anpassung aus „Einzelstück Genuss“)
  await page.click('text=Rumpsteak');
  await page.click('#methode-liste button:has-text("Sous-vide")');
  await page.locator('#stufen-liste button').first().click();
  assert.match(await text(page, '#stufen-liste button[aria-pressed="true"]'), /Bad 50 °C/);
  await setzeDicke(page, 2.5);
  await page.click('#start');
  await vorspulen(page, 1);
  await page.click('button:has-text("Bad ist warm")');
  assert.match(await text(page, '.s-hinweis'), /max\. 3\u00a0h im Bad/, 'Karte nennt die Höchstzeit');
  assert.equal(await page.isVisible('.s-hinweis'), true, 'auch bei einem einzelnen Stück sichtbar');
  await vorspulen(page, 1);
  await page.click('#t-pause');
  assert.match(await text(page, '#toast'), /Wasserbad läuft weiter/);
  assert.equal(await text(page, '#t-pause'), '⏸️ Pause', 'im Bad gibt es keine Pause');
  await springe(page, 3 * 3600 + 120);
  assert.equal(await text(page, '#h-titel'), '🛁 Raus aus dem Bad!', 'nach 3 h raus – nicht später');
  assert.match(await text(page, '.s-warn'), /Sicherheitsgrenze/, 'Überschreitung wird gemeldet');
  assert.match(await text(page, '.s-warn-zeit'), /3\u00a0h\u00a02\u00a0min/, 'tatsächliche Badzeit getrennt vom Warnsatz');
  await page.click('button:has-text("Ist raus")');
  assert.equal(await text(page, '#h-titel'), 'Anbraten Seite 1', '3 h bis 3 h 45 min: sofort anbraten');
  assert.equal(await page.isVisible('.s-warn'), true, 'Warnung bleibt sichtbar');
  const m = await letzteMessung(page);
  assert.ok(m.badSek >= 3 * 3600 + 120 && m.badSek < 3 * 3600 + 600, `tatsächliche Badzeit ${m.badSek} s`);
  assert.ok(m.gekochtGesamt >= 3 * 3600 + 120, 'Wartezeit bis „Ist raus“ zählt als Badzeit');
  // Beim Anbraten hält die Pause die Uhr an
  await vorspulen(page, 1);
  await page.click('#t-pause');
  assert.equal(await text(page, '#t-pause'), '▶️ Fortsetzen');
  const vorher = await text(page, '#h-zeit');
  await vorspulen(page, 30);
  assert.equal(await text(page, '#h-zeit'), vorher, 'Anbraten pausiert');
  await page.click('#t-pause');
  await vorspulen(page, 100);
  assert.equal(await text(page, '#h-titel'), 'Guten Appetit! 🍽️');
  await page.click('#t-neu');
  // Ab 3 h 45 min unter 55 °C (freigegeben 26.11.2026): herausnehmen und entsorgen – kein Anbraten, kein „Guten Appetit“, nichts lernen
  const anpassungVorher = await lies(page, 'meatagain.anpassung.v1');
  await page.click('#start');
  await vorspulen(page, 1);
  await page.click('button:has-text("Bad ist warm")');
  await springe(page, 3 * 3600 + 46 * 60);
  assert.equal(await text(page, '#h-titel'), '⛔ Raus & entsorgen!');
  assert.match(await text(page, '.s-text'), /entsorgen/);
  assert.match(await text(page, '.s-warn'), /nicht mehr essen/);
  assert.doesNotMatch(await text(page, '.s-hinweis'), /Anbraten/, 'kein „Anbraten Pflicht“ beim Entsorgen');
  await page.click('#nav-messungen');
  assert.match(await text(page, '#laufleiste'), /⛔ Raus & entsorgen/, 'Laufleiste nennt das Entsorgen');
  await page.click('#laufleiste');
  await vorspulen(page, 1);
  await page.click('button:has-text("Ist raus")');
  assert.equal(await text(page, '#h-titel'), '⛔ Bitte entsorgen – nicht essen');
  assert.equal(await page.locator('button:has-text("zu roh")').count(), 0, 'keine Gargrad-Frage');
  const weg = await letzteMessung(page);
  assert.equal(weg.verworfen, true);
  assert.ok(weg.badSek >= 3 * 3600 + 45 * 60, `Badzeit ${weg.badSek} s`);
  assert.deepEqual(await lies(page, 'meatagain.anpassung.v1'), anpassungVorher, 'Anpassung unverändert');
  await page.click('#t-neu');
}

async function sousVideMehrereBaeder(page) {
  // Liste aus einer früheren Sitzung: Anpassung hat sich geändert → zwei Badtemperaturen
  await page.evaluate(() => {
    const st = (id, fleischId, farbeId) => ({ id, name: '', farbeId, fleischId, stufe: 'mediumRare', dicke: 2.5, startId: 'kalt', geraetId: 'pfanne', methode: 'sousvide', tStartGemessen: null });
    localStorage.setItem('meatagain.teller.v1', JSON.stringify([st('a', 'rumpsteak', 'gruen'), st('b', 'lammkotelett', 'blau')]));
    localStorage.setItem('meatagain.anpassung.v1', '{}');   // z. B. „Anpassungen zurücksetzen“: Rind MR wieder 54 °C
  });
  await page.reload();
  assert.equal(await page.isVisible('#teller-konflikt'), true);
  assert.match(await text(page, '#teller-konflikt'), /nur eine Temperatur: Rumpsteak 54 °C, Lammkotelett 56 °C/);
  assert.equal(await page.isDisabled('#start'), true, 'zwei Badtemperaturen → kein Start');
  assert.match(await text(page, '#teller-liste'), /max\. 3\u00a0h im Bad/, 'Kürzel auch auf der Liste');
  assert.match(await text(page, '#teller-risiko'), /ganzen, unbehandelten Stücken/);
  assert.match(await text(page, '#teller-risiko'), /Toxoplasmose/);
  await page.click('#teller-liste li:nth-child(2) button');
  assert.equal(await page.isVisible('#teller-konflikt'), false);
  assert.equal(await page.isDisabled('#start'), false);
  await page.click('#teller-leeren');
  await page.click('#methode-liste button:has-text("Pfanne")');
}

async function sousVideWiederherstellen(page) {
  // Läuft früh (Test-Uhr springt beim Neuladen um die Rechenzeit früherer runFor-Aufrufe).
  // Entrecôte 4 cm medium: fertig ab 3 h 10 min – der Lauf muss auch nach mehr als 3 h wiederkommen.
  await page.click('text=Entrecôte');
  await page.click('#methode-liste button:has-text("Sous-vide")');
  await page.locator('#stufen-liste button').nth(2).click();   // Medium, Bad 58 °C
  assert.match(await text(page, '#stufen-liste button[aria-pressed="true"]'), /Bad 58 °C/);
  await setzeDicke(page, 4);
  await page.click('#start');
  await vorspulen(page, 1);
  await page.click('button:has-text("Bad ist warm")');
  await spaeterOeffnen(page, 3.2);
  assert.equal(await page.isVisible('#v-timer'), true, 'Sous-vide-Lauf nach 3,2 h wiederhergestellt');
  assert.match(await text(page, '#h-titel'), /Kann raus|Länger im Bad/);
  await abbrechen(page);
  // Hähnchen: viel zu alter Lauf mit offener Kontrollmessung → nicht kommentarlos verwerfen
  await page.click('text=Hähnchenbrust');
  await page.click('#start');
  await vorspulen(page, 1);
  await page.click('button:has-text("Bad ist warm")');
  page.dialoge.length = 0;
  await spaeterOeffnen(page, 30);
  assert.equal(await page.isVisible('#v-auswahl'), true);
  assert.match(page.dialoge.join(' | '), /Kontrollmessung/, 'Hinweis auf die fehlende Kontrollmessung');
  assert.equal(await page.evaluate(() => localStorage.getItem('meatagain.lauf.v1')), null);
  // Bad nie bestätigt (Fleisch blieb im Kühlschrank) → kein „nicht mehr essen“
  await page.click('text=Rumpsteak');
  await page.locator('#stufen-liste button').first().click();   // Rare, 50 °C
  await setzeDicke(page, 2);
  await page.click('#start');
  await vorspulen(page, 1);
  page.dialoge.length = 0;
  await spaeterOeffnen(page, 30);
  const meldung = page.dialoge.join(' | ');
  assert.match(meldung, /nie bestätigt/);
  assert.doesNotMatch(meldung, /weit überschritten|Kontrollmessung/, 'kein falscher Entsorgen-Hinweis');
  // Speicherstand von vor dem Update: Bad-Schritte werden nachgerüstet (Pause hält das Bad nicht an)
  await page.click('#start');
  await vorspulen(page, 1);
  await page.click('button:has-text("Bad ist warm")');
  await vorspulen(page, 600);
  page.dialoge.length = 0;
  await spaeterOeffnen(page, 0, { altesFormat: true });
  assert.equal(await page.isVisible('#v-timer'), true);
  assert.match(page.dialoge.join(' | '), /aktualisiert/, 'Hinweis bei altem Speicherstand unter 55 °C');
  assert.match(await text(page, '#h-titel'), /Im Wasserbad|Kann raus/);   // Test-Uhr springt beim Neuladen etwas vor
  await vorspulen(page, 1);
  await page.click('#t-pause');
  assert.match(await text(page, '#toast'), /Wasserbad läuft weiter/, 'alter Lauf: Bad läuft in Echtzeit');
  // Fertiger Lauf kommt nach 3,5 h nicht wieder (12-h-Puffer nur bei offenem Bad)
  const ab = sekunden(await text(page, '#h-zeit'));
  await springe(page, ab + 1);
  await vorspulen(page, 1);
  await page.click('button:has-text("Jetzt raus")');
  await vorspulen(page, 100);
  assert.equal(await text(page, '#h-titel'), 'Guten Appetit! 🍽️');
  await spaeterOeffnen(page, 3.5);
  assert.equal(await page.isVisible('#v-auswahl'), true, 'fertiger Lauf wird nicht wiederhergestellt');
  await page.click('#methode-liste button:has-text("Pfanne")');
  await setzeDicke(page, 2.5);   // Ausgangslage für die folgenden Szenarien
}

async function einstellungenUndMessungen(page) {
  await page.click('#nav-einstellungen');
  await page.check('#opt-mess');
  await page.fill('#geraet-name', 'Gusseisen groß');
  await page.click('#geraet-hinzu');
  assert.match(await page.locator('#geraete-liste').textContent(), /Gusseisen groß/);
  assert.match(await page.locator('#geraete-liste').textContent(), /gelernt/);
  await shot(page, '07-einstellungen');
  await page.click('#nav-home');
  assert.equal(await page.isVisible('#tstart-feld'), true, 'Mess-Modus zeigt Starttemperatur');
  await page.click('button.chip:has-text("Gusseisen groß")');
  await page.click('#nav-messungen');
  const anzahl = await text(page, '#m-anzahl');
  assert.match(anzahl, /\d+ Messung/);
  await shot(page, '08-messungen');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#m-export')]);
  const inhalt = fs.readFileSync(await download.path(), 'utf8');
  assert.match(inhalt, /Datum;Uhrzeit;Fleisch/);
  assert.match(inhalt, /Messwartezeit_s/);
  assert.match(inhalt, /;Sous-vide;72;\d+;74;nein\r\n/, 'Sous-vide-Messung: Bad, tatsächliche Badzeit, Kontrollmessung');
  assert.match(inhalt, /;Pfanne\/Grill;;;71;\r\n/, 'Pfannen-Messung ohne Bad, mit Kontrollmessung');
  assert.match(inhalt, /;Sous-vide;50;\d+;;ja\r\n/, 'entsorgtes Stück ist markiert');
  assert.ok(inhalt.trim().split('\r\n').length >= 3, 'mindestens 2 Messungen im CSV');
  await page.click('#v-messungen [data-zurueck]');
  assert.equal(await page.isVisible('#v-auswahl'), true, 'Zurück führt zur Auswahl');
  // Sicherung: exportieren, verändern, wieder einlesen
  await page.click('#nav-einstellungen');
  const [sich] = await Promise.all([page.waitForEvent('download'), page.click('#d-sichern')]);
  const daten = JSON.parse(fs.readFileSync(await sich.path(), 'utf8'));
  assert.equal(daten.app, 'meat-again-sicherung');
  assert.ok(daten.messungen.length >= 2);
  daten.geraete.push({ id: 'import', name: 'Import-Grill', typ: 'gasgrill', faktor: 1.1, lernSchritte: 2 });
  await page.setInputFiles('#d-datei', { name: 'sicherung.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(daten)) });
  await page.waitForFunction(() => document.querySelector('#geraete-liste').textContent.includes('Import-Grill'));
  await page.setInputFiles('#d-datei', { name: 'falsch.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"x"}') });
  await page.waitForFunction(() => /keine Meat-again-Sicherung/.test(document.querySelector('#toast').textContent));
  await page.click('#v-einstellungen [data-zurueck]');
}

(async () => {
  const s = await server();
  const url = `http://localhost:${s.address().port}/`;
  // WebKit (Safari-Engine) wird genutzt, falls installiert; sonst Chromium mit iPhone-Kennung,
  // damit wenigstens die iPhone-spezifischen Codepfade (Banner, Hinweise) durchlaufen werden.
  const laeufe = [
    ['chromium (Android)', chromium, 'Pixel 7'],
    ['chromium (iPhone-Kennung)', chromium, 'iPhone 14'],
    ['webkit (iPhone)', webkit, 'iPhone 14'],
  ];
  let ok = true;
  for (const [name, typ, geraet] of laeufe) {
    let browser;
    try { browser = await typ.launch(); } catch (e) { console.log(`⏭️  ${name}: nicht verfügbar (${e.message.split('\n')[0]})`); continue; }
    const { page, fehler } = await neueSeite(browser, geraet, url);
    if (AUSGABE) process.env.PREFIX = name;
    for (const [titel, fn] of [
      ['Neuladen während des Garens', neuLaden],
      ['Sous-vide: Wiederherstellen nach mehr als 3 h', sousVideWiederherstellen],
      ['Einzelstück Genuss', einzelStueckGenuss],
      ['Sicherheitsablauf Hähnchen', sicherheitsAblauf],
      ['Doppel-Tipp-Schutz', doppelTipp],
      ['Auflegen im Hintergrund verpasst', auflegenVerpasst],
      ['Mehrere Stücke parallel', mehrereStuecke],
      ['Sous-vide Rind', sousVideRind],
      ['Sous-vide Hähnchen', sousVideHaehnchen],
      ['Sous-vide: Pause und Höchstzeit', sousVidePauseHoechstzeit],
      ['Sous-vide: verschiedene Badtemperaturen', sousVideMehrereBaeder],
      ['Einstellungen und Messungen', einstellungenUndMessungen],
    ]) {
      try { await fn(page); console.log(`✅ ${name} · ${titel}`); }
      catch (e) { ok = false; console.log(`❌ ${name} · ${titel}: ${e.message}`); await shot(page, `fehler-${name}-${titel}`); break; }
    }
    // Kein horizontales Scrollen auf Handybreite
    const breit = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (breit) { ok = false; console.log(`❌ ${name}: horizontaler Überlauf`); }
    if (fehler.length) { ok = false; console.log(`❌ ${name}: Konsolenfehler`, fehler); }
    await browser.close();
  }
  s.close();
  process.exit(ok ? 0 : 1);
})();
