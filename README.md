# Gezeitenbecken

Ein Becken voller Arten, die es nie gab.

Kleine Wesen mit einem winzigen neuronalen Netz grasen Algen unter wanderndem
Licht, jagen einander, vermehren sich und mutieren dabei. Wenn sich eine Linie
weit genug von ihren Vorfahren entfernt hat, spaltet sie sich als neue Art ab
und bekommt einen erfundenen lateinischen Namen. Eine Chronik schreibt mit, was
passiert: Abspaltungen, Aussterben, die erste Jagd, Altersrekorde und Einbrüche.

Ich habe das in einer freien Nacht gebaut, ohne Vorgaben, einfach weil ich
sehen wollte, was in so einem Becken entsteht.

## Starten

- **Ohne alles:** `dist/gezeitenbecken.html` im Browser öffnen (Doppelklick
  genügt). Die Datei enthält alles außer den Schriften.
- **Aus den Quellen:** einen beliebigen statischen Server im Projektordner
  starten, etwa `python3 -m http.server`, und `index.html` öffnen. Über
  `file://` laden Browser keine ES-Module, darum gibt es das Bündel.

Nach Änderungen an `src/` baut `npm run build` (oder `node tools/build.mjs`)
das Bündel neu. Abhängigkeiten gibt es keine, Node 18 oder neuer reicht.

## Bedienung

| Was | Wie |
| --- | --- |
| Wesen beobachten | antippen; rechts erscheinen Lebenslauf und Gehirn |
| Kamera folgen | „Kamera folgt“ oder Taste `F` |
| Familie folgen | stirbt das Tier, geht die Beobachtung zum ältesten Kind |
| Art ansehen | Artnamen in Liste, Chronik oder Stammbaum antippen |
| Verschieben, Zoomen | ziehen, Mausrad oder `+` / `−` |
| Algen streuen | Werkzeug „Füttern“ oder mit gedrückter Umschalttaste ziehen |
| Eingreifen | Algenblüte, Trübung (ein Tag fast ohne Licht), Strömung (mischt alle Tiere) oder Sturm (tötet die Hälfte) |
| Pause, Tempo | Leertaste, Tasten `1` bis `4` |
| Eine bestimmte Welt | Zahl oder Wort ins Feld „Saat“, dann „Säen“ |

Die Saat steht in der Adresse (`#saat-12345`). Gleiche Saat, gleiche
Geschichte, und zwar in jedem Browser: Die Simulation rechnet mit eigenen
Fassungen von `exp`, `log`, `sin`, `cos`, `tanh` und `atan2` (`src/detmath.js`),
weil die eingebauten in jeder JavaScript-Engine im letzten Bit anders runden
dürfen. Ein chaotisches Ökosystem macht aus so einem Bit nach wenigen Tagen
eine andere Welt. Füttern und Eingriffe verändern die Geschichte natürlich.

## Wie das Becken funktioniert

**Welt.** 1600 × 1000 Einheiten, an den Rändern verbunden (ein Torus). Das
Algenfeld ist ein Raster aus 80 × 50 Zellen. Algen wachsen logistisch, aber nur
unter Licht. Drei Lichtflecken ziehen auf langsamen Lissajous-Bahnen durchs
Becken, dazu kommt ein Tag-Nacht-Wechsel (ein Tag sind 600 Takte). Nachts
wächst wenig, und die Wesen leuchten.

**Wesen.** Jedes Wesen trägt ein Erbgut aus Körpergröße, Sichtweite,
Mutationsrate, Pulsfrequenz, Farbton und 152 Gewichten seines Gehirns:

- 14 Sinne: Algen hier, vorn, links und rechts; Richtung, Nähe, Größe und
  Verwandtschaft des nächsten Nachbarn; die eigene Energie; Licht; zwei
  Gedächtniswerte; ein innerer Puls; eine Konstante.
- 8 versteckte Neuronen (tanh).
- 5 Ausgänge: Drehen, Schub, Angriff und zwei Gedächtniswerte, die im nächsten
  Takt wieder als Sinne ankommen.

Im Inspektor sieht man dieses Netz live: Bernstein verstärkt, Blau hemmt.

**Energie.** Grundumsatz wächst mit der Fläche (Größe²), Bewegung kostet mit
dem Quadrat des Schubs, gute Augen kosten auch. Der Ertrag beim Grasen wächst
nur mit Größe^1,7, der Grundumsatz aber mit Größe². Je größer ein Wesen, desto
knapper wird also die Rechnung beim Grasen; große Körper lohnen sich vor allem
für Jäger, denn angreifen darf nur, wer
mindestens drei Viertel so groß ist wie die Beute. Wer stillhält, frisst
gründlicher. Ab 70 % voller Energie und einem Mindestalter teilt sich ein
Wesen; das Kind erbt ein mutiertes Erbgut.

**Arten.** Jede Art merkt sich das Erbgut ihres Gründers. Entfernt sich ein
Kind weiter als ein Schwellenwert davon, beginnt es eine neue Linie, und sein
Farbton springt, damit man den Zweig sieht. Erst wenn eine Linie zehn Tiere
erreicht, gilt sie als Art und bekommt einen Namen: die Gattung wird vererbt
(nach vier Abspaltungen entsteht eine neue), das Epitheton beschreibt, was an
der Art auffällt: *vorax* für Jäger, *minima* für Winzlinge, *caeca* für
Kurzsichtige, *velox* für Schnelle, sonst die Farbe. Linien, die vorher
verschwinden, werden vergessen.

**Einwanderung.** Fällt der Bestand unter 14 Tiere, treiben neue Siedler mit
zufälligem Erbgut heran. Von zwölf Zufallsgenomen kommt das, dessen Gehirn auf
zufällige Reize am ehesten gemächlich schwimmt; reiner Zufall wäre fast
immer sofort verhungert.

## Forschen mit dem Becken

Das Becken ist auch ein Werkzeug für kleine Versuche zur Evolution von
Gemeinschaften. Die vollständige Modellbeschreibung nach dem ODD-Protokoll
steht in [`MODELL.md`](MODELL.md), durchgeführte Versuche mit Ergebnissen in
[`EXPERIMENTE.md`](EXPERIMENTE.md).

**Im Browser.** Unter *Versuchsaufbau* lassen sich Räuber, Einwanderung,
Algenwachstum, Mutationsfaktor, Stürme und die Artschwelle einstellen. *Messwerte*
zeigt die Vielfaltsmaße live und als Verlauf; *Messreihe kopieren* liefert alle
Messungen als CSV, mit Saat und allen Parametern im Kopf.

**Versuche mit Statistik.** Ein Versuch ist eine JSON-Datei in `experiments/`:
ein Faktor mit mehreren Stufen, eine Zahl von Wiederholungen, die Messgrößen.

```
node tools/experiment.mjs experiments/praedation.json
node tools/experiment.mjs experiments/praedation.json --replicates 4 --days 20   # Probelauf
```

Der Läufer verwendet alle Prozessorkerne. Jede Saat läuft auf jeder Stufe
(gepaarter Plan), und die Auswertung umfasst:

- 95-%-Bootstrap-Intervalle für die Mittelwerte;
- exakte Vorzeichen-Permutationstests für zwei Stufen;
- einen Trendtest (Spearman mit Blockpermutation) für mehr als zwei Stufen;
- optional einen vorab festgelegten Höckertest;
- eine Holm-Korrektur über alle Messgrößen.

Die Ergebnisse landen in `results/<versuch>/`:

- `bericht.md` mit Aufbau, Tabelle und Diagrammen;
- `runs.csv` und, nicht eingecheckt, `timeseries.csv`;
- SVG-Diagramme;
- ein Manifest mit Parametern, Saaten und Code-Stand.

Weil die Simulation deterministisch ist, erzeugt derselbe Aufruf auf demselben
Code-Stand bitgenau dieselben Zahlen.

Zwei Dinge sind beim Auswerten wichtig:

- **Artenzahlen hängen von der Artdefinition ab.** Die Artschwelle verändert
  die Dynamik nicht (ein Test prüft das), wohl aber, wie viele Arten man zählt.
  Die Versuche verwenden deshalb die *evolvierte Vielfalt* als primäre
  Messgröße: den mittleren Erbgut-Abstand zwischen Tieren derselben
  Gründerlinie.
- **Ein Modell ist kein Ökosystem.** Ergebnisse zeigen, was in *diesem* Modell
  passiert und welche Mechanismen ein Muster erzeugen können. Sie sind
  Hypothesen für die Natur, keine Belege. Die Grenzen stehen in
  [`MODELL.md`](MODELL.md#10-bekannte-grenzen).

## Dateien

```
index.html          Seite und Gestaltung
src/rng.js          deterministischer Zufall (mulberry32)
src/detmath.js      exp, log, sin, cos, tanh, atan2 bitgenau in jeder Engine
src/genome.js       Erbgut, Mutation, genetischer Abstand
src/brain.js        das kleine neuronale Netz
src/names.js        Gattungen und Epitheta
src/world.js        die Simulation, ohne DOM; Parameter in PARAMS
src/metrics.js      Messgrößen und CSV
src/render.js       Zeichnung des Beckens
src/charts.js       Bestandsdiagramm, Stammbaum, Gehirnansicht
src/main.js         Schleife, Journal, Bedienung
tools/build.mjs     bündelt alles zu dist/gezeitenbecken.html
tools/probe.mjs     lässt eine Welt ohne Browser laufen und druckt den Verlauf
tools/experiment.mjs  Versuchsläufer (parallel, mit Statistik und Bericht)
tools/stats.mjs     Bootstrap, Permutationstests, Trend- und Höckertest
experiments/        Versuchsdefinitionen
results/            Ergebnisse der Versuche
tests/              Node-Tests: Determinismus, Grenzen, Buchführung der Arten
```

`npm test` läuft die Tests, `node tools/probe.mjs <saat> <tage>` zeigt, wie
sich eine Welt ohne Browser entwickelt. In der Browserkonsole liegen Welt und
Parameter unter `gezeiten`.
