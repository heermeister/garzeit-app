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
const text = (page, sel) => page.locator(sel).first().textContent();
const sekunden = (mmss) => { const [m, s] = mmss.trim().split(':').map(Number); return m * 60 + s; };
const abbrechen = async (page) => { await page.click('#t-abbruch'); assert.equal(await page.isVisible('#v-auswahl'), true); };
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
  assert.match(await text(page, 'button.chip[aria-pressed="true"]'), /55 °C ✱/);
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
      ['Einzelstück Genuss', einzelStueckGenuss],
      ['Sicherheitsablauf Hähnchen', sicherheitsAblauf],
      ['Doppel-Tipp-Schutz', doppelTipp],
      ['Auflegen im Hintergrund verpasst', auflegenVerpasst],
      ['Mehrere Stücke parallel', mehrereStuecke],
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
