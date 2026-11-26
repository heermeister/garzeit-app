# 🌡️ Meat again – Referenztabelle Kerntemperaturen (Etappe 1)

> **Status: FACHLICH FREIGEGEBEN (24.11.2026).**
> Diese Tabelle ist die Datengrundlage der App (`js/data.js`).
>
> **Entscheidungen:**
> - **F1:** Rare und medium rare bei Rind und Lamm sind frei wählbar, **mit Hinweis** für Risikogruppen.
> - **F2:** **Variante B:** Herausnehmen bei ≥ 72 °C, 2 Minuten Haltephase während der Ruhezeit, danach Kontrollmessung ≥ 70 °C.
> - **F3:** Die Zielwerte für Rind und Lamm werden wie vorgeschlagen übernommen.
>
> - **F4:** Ruhezeit ⅓ der Garzeit, mindestens 3, **höchstens 10 Minuten**. Für die Lebensmittelsicherheit ohne
>   Belang: Haltephase und Kontrollmessung laufen bei Schwein und Geflügel unabhängig davon.
>
> **Umsetzung der Sicherheitsregel (freigegeben 25.11.2026):**
> - Die 2-Minuten-Haltephase lässt sich **nicht überspringen**, auch nicht in der Pause oder per Doppel-Tipp.
> - Bei Schwein und Geflügel zählt „Ja“ **nur mit eingetragenem Messwert** – beim Herausnehmen (≥ 72 °C) und bei der Kontrollmessung (≥ 70 °C). Ein Wert unter der Grenze wird immer als „Noch nicht“ gewertet.
> - Unplausible Eingaben (z. B. „725“ statt „72,5“) werden abgelehnt (gültig: 0–100 °C).

## 1. Grundprinzip

- Die **Kerntemperatur** entscheidet über den Gargrad, die **Zeit** ist nur eine Schätzung.
- **Zielwert** = Kerntemperatur nach der Ruhezeit (das, was auf dem Teller ankommt).
- **Herausnehmen bei** = Zielwert minus Nachgaren. Grillfürst empfiehlt 1–2 °C unter Ziel, bei sehr magerem Fleisch ca. 3 °C; Weber beschreibt einen Anstieg um 1–3 °C.
- Vorschlag für die App: Steaks < 2,5 cm → 1 °C, 2,5–4 cm → 2 °C, > 4 cm → 3 °C.
- **Ruhezeit:** etwa ⅓ der Garzeit (REWE), mindestens 3 Minuten (USDA für ganze Stücke), in der App höchstens 10 Minuten (F4, freigegeben).

## 2. Genuss-Garstufen (Rind, Lamm)

Die Quellen widersprechen sich hier deutlich. Die gewählten Werte orientieren sich überwiegend an Weber.

### 🐄 Rind – Rumpsteak, Filet, Entrecôte

| Garstufe | Zielwert (nach Ruhe) | Spanne in den Quellen |
|---|---|---|
| Rare (blutig) | **50 °C** | ca. 48 °C (Weber) |
| Medium rare | **54 °C** | 48–55 °C (Grillfürst, Don Carne, Weber) |
| Medium | **58 °C** | 54–60 °C (Weber, REWE, inFranken) |
| Medium well | **63 °C** | 58–65 °C (Don Carne, inFranken) |
| Well done | **70 °C** | 62–71 °C (Weber, Don Carne) |

### 🐑 Lamm – Lammkotelett

| Garstufe | Zielwert (nach Ruhe) | Spanne in den Quellen |
|---|---|---|
| Medium rare (rosa) | **56 °C** | ca. 52 °C (Chefstemp) bis 60–62 °C (Grillfürst, Keule) |
| Medium | **60 °C** | 61–67 °C (Grillfürst) |
| Medium well | **64 °C** | – |
| Well done | **70 °C** | 68 °C (Grillfürst, Keule) |

⚠️ **Zur Einordnung:** Die USDA nennt für ganze Stücke von Rind, Schwein, Kalb und Lamm 63 °C plus 3 Minuten Ruhe als Sicherheitsminimum. Rare bis medium bei Rind und Lamm liegen darunter. → **Offene Frage F1.**

## 3. Sicherheits-Garstufe (Schwein, Geflügel)

Entscheidung: **Schwein wird nicht rosa angeboten.** Für Schwein und Geflügel gilt einheitlich die BfR-Regel:

| Fleisch | Regel | Quelle |
|---|---|---|
| 🐖 Schweinekotelett, Schweinefilet | **mind. 70 °C im Kern für 2 Minuten** | BfR-Regel, analog Geflügel/Hack/Wild |
| 🐔 Hähnchenbrust | **mind. 70 °C im Kern für 2 Minuten** | BfR (Geflügel) |
| *(zum Vergleich)* | Geflügel 74 °C (Momentwert), Hack 71 °C | USDA |

Bei diesen Stücken gibt es **keine Garstufen-Auswahl**, sondern nur „sicher durch“. Die Haltephase von 2 Minuten wird als eigene Timer-Phase abgebildet. → **Offene Frage F2.**

## 4. Startwerte für die Zeiten (nur Orientierung, werden durch Testbraten geeicht)

| Stück | Richtwert aus Quellen |
|---|---|
| Rindersteak 2,5 cm | ca. 1 Min. pro cm Dicke und Seite (REWE) → ca. 2,5 Min./Seite; Weber (Grill, 200–220 °C): 10–12 Min. gesamt |
| Lammkotelett 2,5–3 cm | Weber (Grill, 180 °C): 10–12 Min. gesamt |
| Schweinekotelett | 3–5 Min./Seite bei mittlerer Hitze (verschiedene Rezepte) |
| Hähnchenbrust | dünn: 3–4 Min./Seite; dick: deutlich länger, mit reduzierter Hitze bzw. Deckel |

📐 **Hinweis zur Formel:** Die REWE-Faustregel ist *linear* (Zeit ∝ Dicke), die Wärmeleitung spricht eher für *quadratisch* (Zeit ∝ Dicke²). Die Testbraten in drei Dicken sollen genau das klären.

## 5. Fragen zur fachlichen Freigabe (beantwortet, siehe oben)

- **F1 – Rind und Lamm unter 63 °C:** Die übliche Begründung ist, dass Keime bei intakten ganzen Muskelstücken vorwiegend an der Oberfläche sitzen und beim Anbraten abgetötet werden. Sollen rare und medium rare also frei wählbar sein, ggf. mit einem Hinweis für Schwangere, Kleinkinder und Immungeschwächte?
- **F2 – Umsetzung der 2-Minuten-Haltephase bei Schwein und Geflügel:**
  - **Variante A:** Bei 70 °C Kerntemperatur bleibt das Fleisch weitere 2 Minuten bei reduzierter Hitze in der Pfanne.
  - **Variante B (Vorschlag):** Herausnehmen bei ≥ 72 °C. Während der Ruhezeit läuft ein 2-Minuten-Timer, danach folgt eine Kontrollmessung, ob die Kerntemperatur noch ≥ 70 °C ist.
- **F3 – Garstufen-Werte:** Passen die gewählten Zielwerte für Rind und Lamm so, oder möchtest du eigene setzen? (Die App wird ohnehin erlauben, sie persönlich anzupassen.)

## Quellen

- BfR – Presseinformation Salmonellen/Geflügel: https://www.bfr.bund.de/presseinformation/mehr-salmonellen-infektionen-in-europa-hygieneregeln-helfen-gefluegel-sicher-zuzubereiten/
- BfR – Verbrauchertipps Lebensmittelinfektionen im Privathaushalt: https://www.bfr.bund.de/cm/350/verbrauchertipps_schutz_vor_lebensmittelinfektionen_im_privathaushalt.pdf
- BfR – Infografik Wildbrethygiene: https://www.bfr.bund.de/assets/Bild/12_Infografiken/02_Wildbret/260506_Wildbrethygiene_TT.pdf
- USDA FSIS – Safe Minimum Internal Temperature Chart: https://www.fsis.usda.gov/es/node/3293
- FoodSafety.gov – Safe Minimum Cooking Temperatures: https://www.foodsafety.gov/print/pdf/node/10
- Weber – Garzeitentabelle & Kerntemperaturen: https://www.weber.com/DE/de/garzeitentabelle/weber-49361.html
- Weber – Steak grillen: https://www.weber.com/DE/de/grillgeschichten/grill-know-how/steak-grillen-so-gelingt-es-perfekt/weber-15850.html
- Weber – Sous-vide-Steak (Nachgaren 1–3 °C): https://www.weber.com/DE/de/grillgeschichten/grill-know-how/sous-vide-steak-garen-und-grillen-in-perfektion/weber-146880.html
- Grillfürst – Kerntemperatur Steak: https://www.grillfuerst.de/magazin/kerntemperatur/steak/
- Grillfürst – Kerntemperatur Rind: https://www.grillfuerst.de/magazin/kerntemperatur/rind/
- Grillfürst – Schweinekotelett: https://www.grillfuerst.de/magazin/kerntemperatur/schweinefleisch/schweinekotelett/
- REWE – Steak-Garstufen: https://www.rewe.de/ernaehrung/steak/steak-garstufen/
- REWE – Steak grillen: https://www.rewe.de/ernaehrung/steak/steak-grillen
- Don Carne – Steak-Zubereitung: https://doncarne.de/de/blog/steak-zubereitung/
- inFranken – Rinderfilet: https://www.infranken.de/ratgeber/genuss/rezepte/so-gelingt-dir-das-perfekte-rinderfilet-art-6341138
- Chefstemp – Lamm: https://www.chefstemp.com/de/?p=9222
