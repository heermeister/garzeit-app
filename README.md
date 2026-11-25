# 🥩 Meat again

Garzeit-Timer für Fleisch – Hobbyprojekt.

Fleisch, Dicke, Garstufe, Ausgangstemperatur und Gerät wählen → die App führt Schritt für Schritt mit
**Signalton und Sprachansage** durch Anbraten, Wenden, Kerntemperatur-Messung und Ruhezeit.
Mehrere Stücke mit unterschiedlichen Garstufen werden so **gestaffelt, dass alle gleichzeitig servierfertig** sind.

> ⚠️ Die Zeiten sind Schätzungen. Maßgeblich ist immer die mit dem Thermometer gemessene Kerntemperatur.

## Funktionen

| | |
|---|---|
| 🍖 **Fleisch** | Rumpsteak, Rinderfilet, Entrecôte, Lammkotelett, Schweinekotelett, Schweinefilet, Hähnchenbrust |
| 🛡️ **Sicherheit** | Schwein & Geflügel nur „sicher durch“ (BfR): raus bei ≥ 72 °C, 2 Min. Haltephase, Kontrollmessung ≥ 70 °C |
| ⚠️ **Risikogruppen** | Hinweis bei Rind/Lamm unter 63 °C |
| ⏱️ **Ablauf** | Seite 1 → Wenden → Seite 2 → Messen (mit geschätzter Zusatzzeit) → Ruhen |
| 👨‍👩‍👧 **Mehrere Stücke** | bis zu 6, mit Farbe und Namen, gestaffelter Start, gemeinsame Pause |
| 🍳 **Geräte-Profile** | eigene Pfannen/Grills; jedes Profil lernt seinen Zeitfaktor aus Messwerten |
| 🎚️ **Mein Gargrad** | „zu roh / zu durch“ verschiebt die Zielwerte für Rind/Lamm (± 4 °C) |
| 🧪 **Mess-Modus** | Protokoll für Testbraten, CSV-Export → [`docs/testbraten.md`](docs/testbraten.md) |
| 📱 **iPhone** | Töne auch im Stummmodus, Bildschirm bleibt an (ab iOS 18.4 als Home-Screen-App), offline nutzbar |

## Stand

- [x] Etappe 1 – Referenztabelle Kerntemperaturen → [`docs/kerntemperaturen.md`](docs/kerntemperaturen.md) (fachlich freigegeben)
- [x] Etappe 2 – Grundgerüst: Auswahl, Zeitmodell, Mehrphasen-Timer
- [x] Etappe 3 – Mehrere Stücke parallel
- [x] Etappe 4 – Geräte-Profile, Mess-Modus, CSV-Export, Kalibrierung
- [ ] Etappe 5 – Testbraten und Eichung → [`docs/testbraten.md`](docs/testbraten.md)

## Aufbau

| Datei | Inhalt |
|---|---|
| `js/data.js` | Fleischarten, Garstufen, Sicherheitsregel, Gerätetypen (aus `docs/kerntemperaturen.md`) |
| `js/model.js` | Zeitmodell, Ablauf der Schritte, Zusatzzeit, Kalibrierung, Zeitplan, CSV – reine Funktionen |
| `js/speicher.js` | lokale Speicherung (bleibt nur auf dem Gerät) |
| `js/signale.js` | Ton, Sprachansage, Vibration, Bildschirm anlassen, iPhone-Besonderheiten |
| `js/app.js` | Oberfläche und Ablaufsteuerung |
| `sw.js`, `manifest.webmanifest` | Offline-Fähigkeit und „Zum Home-Bildschirm“ |

Reines HTML/CSS/JavaScript ohne Build-Schritt.

## Entwickeln und testen

```bash
npm start      # http://localhost:8080
npm test       # Tests für Zeitmodell, Sicherheitsregel, Kalibrierung, CSV
npm run e2e    # Browser-Abläufe mit vorgespulter Uhr (Playwright)
```

## Auf dem iPhone installieren

1. Einmalig: GitHub → **Settings → Pages → Deploy from a branch** → Branch wählen, Ordner `/ (root)` → **Save**.
2. Nach 1–2 Minuten in **Safari** öffnen: `https://heermeister.github.io/garzeit-app/`
3. **Teilen ⬆️ → „Zum Home-Bildschirm“ → „Hinzufügen“** und die App ab jetzt immer darüber starten.
4. ⚙️ → **Signal testen**: Piepton und Ansage hörbar? Medienlautstärke aufdrehen.

Hinweise fürs iPhone: Vibration unterstützt Safari nicht. Bildschirm anlassen funktioniert in Home-Screen-Apps
erst ab iOS 18.4 zuverlässig – bei älteren Versionen für die Kochzeit die automatische Sperre ausschalten.
