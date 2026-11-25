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
  page.on('dialog', (d) => d.accept());
  await page.clock.install();
  await page.goto(url);
  return { ctx, page, fehler };
}

const vorspulen = async (page, sek) => { await page.clock.runFor(sek * 1000); };
const text = (page, sel) => page.locator(sel).first().textContent();
const shot = async (page, name) => { if (AUSGABE) await page.screenshot({ path: path.join(AUSGABE, `${name}.png`), fullPage: true }); };

async function einzelStueckGenuss(page) {
  const iphone = await page.evaluate(() => /iPhone/.test(navigator.userAgent));
  assert.equal(await page.isVisible('#ios-banner'), iphone, 'Installations-Tipp nur auf dem iPhone');
  await page.click('text=Rumpsteak');
  await page.click('button.chip:has-text("Medium rare")');
  assert.equal(await page.isVisible('#risiko-info'), true, 'Risiko-Hinweis bei medium rare');
  await page.click('button.chip:has-text("Temperiert")');
  await page.click('button.chip:has-text("Pfanne")');
  assert.equal(await text(page, '#p-gar'), '6:00 Min.');
  await shot(page, '01-auswahl');
  await page.click('#start');
  assert.equal(await text(page, '#h-titel'), 'Seite 1 anbraten');
  assert.equal(await text(page, '#h-zeit'), '3:00');
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
  await page.fill('.temp-eingabe', '52');
  await page.click('button:has-text("Ja")');
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
  // „Ja“ mit eingetragenen 68 °C darf NICHT als Ja zählen
  await page.fill('.temp-eingabe', '68');
  await page.click('button:has-text("Ja")');
  assert.equal(await text(page, '.s-titel'), 'Weiterbraten', 'unter 72 °C → weiter garen');
  await vorspulen(page, 400);
  await page.fill('.temp-eingabe', '73');
  await page.click('button:has-text("Ja")');
  assert.equal(await text(page, '#h-titel'), 'Haltephase');
  await vorspulen(page, 121);
  assert.match(await text(page, '#h-titel'), /Kontrollmessung/);
  await page.click('button:has-text("Noch nicht")');
  assert.match(await text(page, '.s-titel'), /Zurück in die Pfanne/);
  await vorspulen(page, 61);
  await page.click('button:has-text("Ja")');   // ≥ 72 °C
  assert.equal(await text(page, '#h-titel'), 'Haltephase', 'nach Wiedererhitzen erneut 2 Min. Haltephase');
  await vorspulen(page, 121);
  await page.click('button:has-text("Ja")');   // Kontrolle ok
  await vorspulen(page, 900);
  assert.equal(await text(page, '#h-titel'), 'Guten Appetit! 🍽️');
  await page.click('#t-neu');
}

async function mehrereStuecke(page) {
  await page.click('text=Hähnchenbrust');
  await page.fill('#name', 'Kind');
  await page.click('#hinzu');
  await page.click('text=Rumpsteak');
  await page.click('button.chip:has-text("Medium rare")');
  await page.fill('#name', 'Papa');
  await page.click('#hinzu');
  await page.click('button.chip:has-text("Well done")');
  await page.click('#hinzu');
  assert.equal(await page.locator('.teller-eintrag').count(), 3);
  assert.equal(await page.isVisible('#teller-plan'), true);
  assert.match(await text(page, '#start'), /3 Stücke/);
  await shot(page, '05-teller');
  await page.click('#start');
  assert.equal(await page.locator('.stueck').count(), 3);
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
  // Durchspielen: alle Messungen mit Ja beantworten, bis alles fertig ist
  for (let i = 0; i < 60; i++) {
    await vorspulen(page, 60);
    const jaKnoepfe = page.locator('.stueck button:has-text("✅ Ja")');
    while (await jaKnoepfe.count()) await jaKnoepfe.first().click();
    if ((await text(page, '#h-titel')) === 'Guten Appetit! 🍽️') break;
  }
  assert.equal(await text(page, '#h-titel'), 'Guten Appetit! 🍽️');
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
  assert.ok(inhalt.trim().split('\r\n').length >= 3, 'mindestens 2 Messungen im CSV');
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
      ['Einzelstück Genuss', einzelStueckGenuss],
      ['Sicherheitsablauf Hähnchen', sicherheitsAblauf],
      ['Drei Stücke parallel', mehrereStuecke],
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
