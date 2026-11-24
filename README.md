# 🥩 Meat again

Garzeit-Rechner mit Mehrphasen-Timer für Fleisch – Hobbyprojekt.

Pfanne oder Grill, Fleischart, Dicke, Garstufe → die App führt Schritt für Schritt mit Signaltönen durch Anbraten, Wenden, Thermometer-Check und Ruhezeit. Mehrere Stücke mit unterschiedlichen Garstufen werden so gestaffelt, dass alle gleichzeitig fertig sind.

## Stand

- [x] Etappe 1 – Referenztabelle Kerntemperaturen → [`docs/kerntemperaturen.md`](docs/kerntemperaturen.md) (fachlich freigegeben)
- [x] Etappe 2 – Grundgerüst: Auswahl, Zeitformel, Mehrphasen-Timer
- [ ] Etappe 3 – Mehrere Stücke parallel
- [ ] Etappe 4 – Geräte-Profile, Mess-Modus, CSV-Export
- [ ] Etappe 5 – Testbraten und Kalibrierung

> ⚠️ Die Zeiten sind Schätzungen. Maßgeblich ist immer die mit dem Thermometer gemessene Kerntemperatur.

## Aufbau

| Datei | Inhalt |
|---|---|
| `js/data.js` | Fleischarten, Garstufen, Sicherheitsregel (aus `docs/kerntemperaturen.md`) |
| `js/model.js` | Zeitmodell (Startwerte, noch ungeeicht) und Ablauf der Timer-Schritte |
| `js/app.js` | Oberfläche, Timer, Signalton, Sprachansage, Bildschirm-anlassen |
| `sw.js`, `manifest.webmanifest` | Offline-Fähigkeit und „Zum Startbildschirm hinzufügen“ |

Reines HTML/CSS/JavaScript ohne Build-Schritt.

## Lokal starten und testen

```bash
npm start     # http://localhost:8080
npm test      # Tests für das Zeitmodell
```

## Auf dem Handy nutzen (GitHub Pages)

Settings → Pages → *Deploy from a branch* → Branch wählen, Ordner `/ (root)` → Save.
Nach 1–2 Minuten ist die App unter `https://heermeister.github.io/garzeit-app/` erreichbar.
Im Browser „Zum Startbildschirm hinzufügen“ wählen.
