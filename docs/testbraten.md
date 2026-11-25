# 🧪 Testbraten – Protokoll zur Eichung (Etappe 5)

Ziel: Die Zeitformel ist bisher nur eine begründete Schätzung. Mit wenigen, sauber protokollierten Testbraten
klären wir zwei Fragen:

1. **Stimmt die Grundzeit für dein Gerät?** → wird automatisch gelernt (Geräte-Faktor).
2. **Wie stark wächst die Garzeit mit der Dicke?** Linear (REWE-Faustregel), quadratisch (Wärmeleitung)
   oder dazwischen (aktueller Startwert: Exponent 1,5)? → wird aus dem CSV-Export ausgewertet.

## Vorbereitung

- ⚙️ **Einstellungen → Mess-Modus einschalten.** „Automatisch lernen“ eingeschaltet lassen.
- ⚙️ **Eigenes Geräte-Profil anlegen**, z. B. „Gusseisen groß“, und für alle Testbraten dieses Profil wählen.
- 🌡️ Ein Einstich-Thermometer, das schnell anzeigt. Immer an der **dicksten Stelle in der Mitte** messen.
- 📏 Die Dicke mit einem Lineal messen, nicht schätzen.

## Versuchsplan (Minimum)

| Lauf | Fleisch | Dicke | Garstufe | Start |
|---|---|---|---|---|
| 1 | Rumpsteak | 2 cm | Medium rare | aus dem Kühlschrank |
| 2 | Rumpsteak | 3 cm | Medium rare | aus dem Kühlschrank |
| 3 | Rumpsteak | 4 cm | Medium rare | aus dem Kühlschrank |

Konstant halten: **dieselbe Pfanne, dieselbe Herdstufe, dieselbe Fettmenge, gleiches Vorheizen** (z. B. 5 Minuten).
Die Herdstufe in der Notiz am Ende eintragen.

Optional danach: dasselbe mit Hähnchenbrust (2 und 3 cm), um die Sicherheits-Abläufe zu prüfen.

## Während des Bratens

1. Vor dem Start **Kerntemperatur vor dem Start** messen und eintragen (Feld erscheint im Mess-Modus).
2. Bei „Kerntemperatur messen“ **immer den Messwert eintragen** – auch wenn du „Ja“ drückst.
   Gerade die erste Messung ist für die Eichung entscheidend.
3. Nach der Ruhezeit **nochmal messen** und eintragen (zeigt, wie stark das Fleisch nachgezogen hat).
4. Gargrad beurteilen: zu roh / genau richtig / zu durch.

## Auswertung

📊 **Messungen → CSV exportieren** und die Datei an Claude schicken. Ausgewertet werden:

- Verhältnis tatsächliche / geplante Garzeit je Dicke → Exponent der Dicke
- Temperaturanstieg in der Ruhezeit (Nachgaren) je Dicke → Abgleich mit den 1–3 °C aus der Literatur
- Streuung zwischen den Läufen → wie verlässlich die Zeiten überhaupt sein können

> Hinweis: Jeder Lauf mit eingetragenem Messwert verbessert den Geräte-Faktor bereits automatisch.
> Der Export dient der tieferen Auswertung (Dicken-Exponent, Nachgaren), die die App nicht selbst lernt.
