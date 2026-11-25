# 🛁 Meat again – Sous-vide: Regeln und Quellen

> **Status:** umgesetzt am 25.11.2026 als konservativer Standard. Er hält die freigegebenen Regeln F1–F4 ein
> (siehe `docs/kerntemperaturen.md`). Offene Entscheidungen stehen am Ende.
>
> Recherche: vier Themen, jeder Befund adversariell gegengeprüft. Primärstudien wurden über PubMed gelesen.
> **Einschränkung:** Behördenseiten (bfr.bund.de, fsis.usda.gov, food.gov.uk, fsai.ie) und douglasbaldwin.com
> waren aus der Arbeitsumgebung nicht abrufbar. Behördenzahlen sind deshalb nur über Suchauszüge belegt.
> Die App ist so gebaut, dass ihre **Sicherheit nicht an diesen ungeprüften Tabellen hängt**.

## 1. Was die App macht

| | Regel in der App | Begründung |
|---|---|---|
| 🐖🐔 **Schwein, Geflügel** | Bad **72 °C** · Mindestzeit = Aufheizzeit × 1,25 + 2 min, **nicht überspringbar** · danach **Kontrollmessung ≥ 70 °C (Pflicht, mit Wert)** · darunter 15 min zurück ins Bad | BfR-Regel 70 °C/2 min unverändert (F2). Das Bad steht auf 72 °C, weil sich der Kern der Badtemperatur nur annähert. |
| 🐄🐑 **Rind, Lamm** | Bad = **Zielkerntemperatur** der freigegebenen Tabelle (inkl. persönlicher Anpassung) · kein Nachgaren | Sous-vide gart genau auf Badtemperatur. |
| ⏱️ **Bad unter 55 °C** (Rind rare 50 °C, medium rare 54 °C) | **höchstens 3 h im Bad** (harte Grenze). Ist die Mindestzeit dafür zu lang, sperrt die App die Kombination (zu dick). **Gefrorener Start gesperrt.** | *C. perfringens* wächst bis ca. 50,5–52,3 °C. Baldwin leitet eine Grenze von < 4 h zwischen 5 und 54,4 °C ab, inkl. Vorbereitung und Anbraten. |
| 🔥 **Anbraten** | 2 × 45 s sehr heiß; unter 63 °C **Pflicht**, alle Seiten inkl. Ränder | Das Bad keimt die Oberfläche bei rosa Garstufen nicht ab. |
| 📐 **Aufheizzeit** | Fit an Baldwins Tabelle (Start 5 °C → Bad − 0,5 °C), × 1,25 Reserve, auf 5 min gerundet. Gefroren × 1,6. | Physik nachgerechnet (Wärmeleitung, α ≈ 1,1–1,4·10⁻⁷ m²/s). |
| 📏 **Dicke** | Platte (Steak, Kotelett, Hähnchenbrust) 1–6 cm · Zylinder (Filet am Stück, Medaillon) 2–9 cm | Gültigkeitsbereich der Formel. |
| 🪟 **Zeitfenster** | „fertig ab“ → „ideal bis“ → „höchstens“, mit Uhrzeit und Signal | Danach leidet die Textur (Praxiswerte, Tab. 3). |
| ⚠️ **Hinweise** | Risikogruppen < 63 °C (wie bisher) · rosa nur mit **ganzen, unbehandelten Stücken** · Lamm: **Toxoplasmose** (Schwangere besser well done) · kein roher Knoblauch, keine Butter/kein Öl im Beutel · sofort essen, kein Vorgaren und Aufbewahren | siehe Abschnitt 2 |
| 🛁 **Bedienung** | Vorheizen bestätigen, erst dann läuft der Timer (kein verzögerter Start) · alle Beutel gleichzeitig ins Bad, nichts Kaltes nachlegen · im selben Bad nur eine Temperatur (wird auch beim Start geprüft, weil sich die persönliche Anpassung seit dem Hinzufügen geändert haben kann) | Aufheizphase zählt mit; kalte Beutel kühlen das Bad. |
| ⏸️ **Pause** | Die Zeit im Bad läuft in der Pause **weiter** (Echtzeit ab „Bad ist warm“). Die Pause hält nur das Anbraten an. | Der Beutel liegt weiter im Wasser – sonst würde die 3-h-Grenze verschoben. |
| ⛔ **Höchstzeit überschritten** (unter 55 °C, z. B. App im Hintergrund) | Über 3 h: dauerhafte Warnung „sofort scharf anbraten und gleich essen – nicht für Risikogruppen“. **Über 4 h: „bitte nicht mehr essen“.** Die tatsächliche Badzeit wird gespeichert (CSV `Badzeit_tatsaechlich_s`). | 4-Stunden-Regel: Baldwin (< 4 h zwischen 5 und 54,4 °C) und FDA Food Code 3-501.19 (Zeit als einzige Kontrolle: höchstens 4 h, danach verwerfen) |
| 🌡️ **Plausibilität** | Kontrollmessung über Bad + 1,5 °C wird nicht angenommen („Eingabe und Thermometer prüfen“) | Im Bad kann der Kern nicht heißer werden als das Wasser (Tippfehler wie 57 → 75). |
| ♻️ **Wiederherstellen** | bis 12 h nach dem geplanten Ende; ist ein Lauf älter und war die Kontrollmessung oder „Raus aus dem Bad“ noch offen, erscheint ein deutlicher Hinweis | Lange Badzeiten dürfen nicht verloren gehen. |

## 2. Fachliche Grundlage

### 2.1 Schwein: warum nicht unter 70 °C

Ausschlaggebend ist das **Hepatitis-E-Virus (HEV)**:

- **Stunnenberg et al. 2023** (Leberhomogenat): Nach 65 °C/60 min waren es nur 3,56 log, und noch infektiöses Virus war nachweisbar. 71 °C/5 min ergaben > 6 log. PMID 37894109, DOI 10.3390/microorganisms11102451
- **Feagins et al. 2008:** Nach 56 °C/1 h waren 4 von 5 Schweinen im Bioassay infiziert. PMID 18166239
- **Barnaud et al. 2012** (Pâté): Erst 71 °C/20 min reichten aus. PMID 22610436
- **Johne et al. 2016:** 70 °C/2 min ergaben > 3,9 log. PMID 27208095
- **Schilling-Loeffler et al. 2025** (BfR): Kern 70 °C plus 2 min ergaben > 4,3 log. PMID 39700675, DOI 10.1016/j.ijfoodmicro.2024.111018
- **EFSA 2017:** Die genauen Zeit-Temperatur-Bedingungen für HEV in Fleischprodukten sind „not well known“. DOI 10.2903/j.efsa.2017.4886

Andere Erreger wären bei 60–65 °C beherrschbar:

- *Toxoplasma*: ab 61 °C/3,6 min in der Regel abgetötet (Dubey et al. 1990, PMID 2319420).
- *Trichinella*: 60 °C sofort (Kotula et al. 1983, PMID 6873222).

Hinzu kommt die Entscheidung „Schwein nie rosa“.

### 2.2 Geflügel: warum vorerst ebenfalls 72 °C

Zeit-Temperatur-Äquivalente unter 70 °C gibt es, zum Beispiel:

- **USDA FSIS** (7-log *Salmonella*): bei 60 °C etwa 25–35 min Kern-Haltezeit, je nach Fettgehalt.
- **UK FSA:** 60 °C/45 min, 65 °C/10 min.

Diese Werte sind aber **nicht an der Primärquelle geprüft**. Außerdem decken sie *Listeria* nicht sicher ab:

- **Karyotis et al. 2017** (Sous-vide-Brust): D60 = 10,39 min für *Listeria*. PMID 28873764
- **Shimojima et al. 2022:** *Listeria* bis 60 min Badzeit bei 65 °C, 300 g. PMID 35687739

Das **BfR** nennt in allen gefundenen Texten nur 70 °C/2 min und keine Äquivalente. → Mögliche spätere Option, siehe Abschnitt 4.

### 2.3 Rind und Lamm, rosa

- **Intakte, ganze Muskelstücke:** Die Keime sitzen an der Oberfläche, deshalb ist das Anbraten Pflicht.
- **Nicht intaktes Fleisch** (nadeliert, gespritzt, gerollt, zusammengesetzt): Keime gelangen ins Innere, rosa ist dann nicht sicher.
  - Hunt et al. 2023, PMID 36916593
  - Patil et al. 2024, PMID 38484845
  - Chancey et al. 2013, PMID 24112580
- ***Listeria* in Sous-vide-Rindersteak** ist 1,7–4-mal hitzeresistenter als *Salmonella* (Manzoor et al. 2026, PMID 41759584).
- **Toxoplasma bei Lamm:** Gewebezysten waren bei 52 °C/9,5 min noch lebensfähig (Dubey 1990). → eigener Hinweis für Schwangere.

### 2.4 Lagerung (bewusst nicht unterstützt)

Sous-vide-Temperaturen inaktivieren Sporen von *C. botulinum* nicht:

- **Wachnicka et al. 2016:** Gruppe II wächst schon ab 3,0–3,3 °C. PMID 27474721
- **Hyytiä-Trees et al. 2000:** Toxinbildung bei 8 °C. PMID 10618228
- **Romeo et al. 2024:** Sporen bei 65 °C/75 min nur um 1,0–1,2 log reduziert. PMID 39410222

→ Die App sagt „sofort essen“. Für Vorgaren und Kühllagern gelten strengere Regeln (schnell abkühlen, ≤ 3 °C, kurze Fristen); das ist nicht umgesetzt.

## 3. Tabellen

**Tab. 1 – Aufheizzeit** (Start Kühlschrank 5 °C bis Bad − 0,5 °C). Ohne Reserve = Fit an Baldwin; die App rechnet × 1,25.

| Dicke | Platte (Steak) | Zylinder (Filet) |
|---|---|---|
| 2 cm | ~50 min | ~30 min |
| 2,5 cm | ~75 min | ~40 min |
| 3 cm | ~95 min | ~50 min |
| 4 cm | ~150 min | ~80 min |
| 5 cm | ~210 min | ~115 min |

Quelle: Baldwin DE (2012), *Sous vide cooking: A review*, Int J Gastronomy Food Sci 1:15–30, Tab. 1; nur über Kopien belegt.
Modell: Platte 0,053·d² + 1,56·d, Zylinder 0,031·d² + 0,73·d (d in mm, t in min).

**Tab. 2 – Beispiele aus der App** (Kühlschrank):

| Stück | Bad | fertig ab | ideal bis | höchstens |
|---|---|---|---|---|
| Rumpsteak 2,5 cm medium rare | 54 °C | 1 h 30 min | 2 h 30 min | 3 h (Sicherheit) |
| Rumpsteak 4 cm medium rare | 54 °C | (3 h 5 min) | – | **gesperrt** (bräuchte > 3 h inkl. 15 min Spielraum) |
| Rinderfilet-Medaillon 4 cm medium rare | 54 °C | 1 h 40 min | 2 h 30 min | 3 h (Sicherheit) |
| Entrecôte 4 cm medium | 58 °C | 3 h 10 min | 3 h 25 min | 4 h |
| Lammkotelett 2,5 cm medium rare | 56 °C | 1 h 35 min | 3 h | 4 h |
| Hähnchenbrust 2,5 cm | 72 °C | 1 h 42 min | 2 h 27 min | 3 h |
| Schweinefilet Ø 4,5 cm | 72 °C | 2 h 12 min | 2 h 57 min | 3 h |

**Tab. 3 – Zeitfenster (Textur)**, Stunden ab Einlegen:
- Rind: rare 2/3, medium rare 2,5/3, medium 3/4, medium well 2,5/3,5, well done 2/3; Filet höchstens 3.
- Lamm: medium rare/medium 3/4, medium well 2,5/3,5, well done 2/3.
- Schwein/Geflügel: „fertig ab“ + 45 min / 3.

Quellen: Serious Eats/Anova, ChefSteps (Praxis). Hähnchen: Park et al. 2020, PMID 32475464 – bei 70 °C steigt der Kochverlust von 17 % (1 h) auf 25 % (3 h).

## 4. Offene Entscheidungen (zur Freigabe)

1. **Medium rare Rind bei 54 °C** ist durch die 3-h-Grenze auf etwa 3,5 cm (Platte) begrenzt. Mögliche Alternative wäre ein Bad von 55 °C: Damit entfällt die Grenze, aber das weicht 1 °C von F3 ab. → Aktuell bleibt es bei 54 °C.
2. **Hähnchen unter 70 °C** (z. B. 60–65 °C mit langer Haltezeit) ist nur denkbar mit Prüfung der Primärtexte (FSIS, FSA, FSAI, BfR) und *Listeria* als Leitkeim, nie für Risikogruppen. → Nicht umgesetzt.
3. **Vorgaren und Kühllagern (Cook-Chill):** nicht umgesetzt.
4. **Wortlaut bei überschrittener Höchstzeit** (Abschnitt 1, ⛔): 3–4 h „sofort anbraten, gleich essen, nicht für Risikogruppen“, über 4 h „nicht mehr essen“. → Zur fachlichen Freigabe.
5. **Medaillons (flacher als breit):** Die Zylinderformel mit der Höhe ist dafür etwas zu optimistisch (Gegenrechnung: Ø 8 cm, Höhe 2–2,5 cm erreicht bei ungünstiger Temperaturleitfähigkeit zur Mindestzeit nur 69,3–69,8 °C; Ø ≤ 6 cm ≥ 4 min Reserve). Bei Schwein fängt die Pflicht-Kontrollmessung das ab. Option: Schalter „Medaillon“, der wie eine Platte (Steak) rechnet – das ist konservativ.
6. **Prüfung an der Primärquelle:** Mit freigeschalteten Hosts (bfr.bund.de, fsis.usda.gov, douglasbaldwin.com) lassen sich die Behördenzahlen und Baldwins Tabellen direkt abgleichen.
