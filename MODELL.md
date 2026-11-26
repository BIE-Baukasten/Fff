# Modellbeschreibung (ODD-Protokoll)

Diese Beschreibung folgt dem ODD-Protokoll für individuenbasierte Modelle
(Grimm et al. 2006, aktualisiert 2020). Sie soll erlauben, das Modell ohne den
Quellcode nachzubauen. Wo Code und Text abweichen, gilt der Code
(`src/world.js`, `src/genome.js`, `src/brain.js`); bitte dann melden.

## 1. Zweck und Muster

Das Gezeitenbecken ist ein Modell für **evolvierende Gemeinschaften**: Wie
entstehen und verschwinden Vielfalt, Räuber-Beute-Beziehungen und Linien,
wenn Verhalten und Körper allein durch Mutation und Selektion entstehen?

Es ist ein *Hypothesengenerator*, kein Abbild eines bestimmten Ökosystems.
Ein Ergebnis zeigt, welche Mechanismen *ausreichen*, um ein Muster zu
erzeugen, nicht, dass es in der Natur so ist.

Muster, die das Modell ohne ausdrückliche Vorgabe hervorbringt und an denen
man seine Plausibilität prüfen kann:

- logistisches Bevölkerungswachstum bis zu einer Tragfähigkeit, die von der
  Primärproduktion abhängt;
- Konkurrenzausschluss: von mehreren Gründerlinien überlebt meist nur eine;
- adaptive Radiation: eine Gründerlinie fächert sich in viele Linien auf;
- Räuberverhalten, das aus einem anfangs zufälligen Angriffsausgang entsteht.

## 2. Einheiten, Zustandsgrößen, Skalen

**Raum.** Ein Torus von 1600 × 1000 Einheiten (Ränder verbunden). Algen
liegen auf einem Raster von 80 × 50 Zellen à 20 × 20 Einheiten.

**Zeit.** Diskrete Takte. 600 Takte sind ein Tag; ein Tag hat einen
Licht-Zyklus. Typische Läufe dauern 40 bis 60 Tage, das sind 25 bis 35
Generationen.

**Zellen** haben die Zustandsgrößen Algendichte `a` (0 bis 2,5; 1 = gesättigt)
und Licht `L` (0,08 bis 1).

**Lichtflecken** (3 Stück) bewegen sich auf Lissajous-Bahnen mit Perioden
zwischen 3 und 9 Tagen und Radien zwischen 130 und 230 Einheiten.

**Wesen** haben Position, Richtung, Energie `E`, Alter, Generation,
Elternteil, Artzugehörigkeit (Linie) und ein Erbgut:

| Gen | Bereich | Wirkung |
| --- | --- | --- |
| Größe `s` | 3 bis 14 | Kosten ∝ s², Ertrag ∝ s^1,7, Höchstenergie 12 s², Lebensdauer, Tempo |
| Sichtweite | 20 bis 150 | Reichweite des Nachbarsinns, Fühlerabstand, Kosten |
| Mutationsrate | 0,01 bis 0,3 | evolviert selbst |
| Pulsfrequenz | 0,005 bis 0,25 | innerer Oszillator als Sinn |
| Farbton | 0 bis 360 | erblicher Erkennungsmarker, der vom Verwandtschafts-Sinn gelesen wird |
| 152 Gewichte | −4 bis 4 | neuronales Netz 14 → 8 → 5, tanh |

## 3. Prozesse und ihre Reihenfolge

Pro Takt, in dieser Reihenfolge:

1. Uhr vor; alle 10 Takte neue Lichtfleck-Positionen und Lichtfeld.
2. **Algenwachstum** in jeder Zelle:
   `a ← a + r · T · Trüb · L · (a + 0,12) · (1 − a)` für `a < 1`, darüber Abbau um
   0,3 % des Überschusses. `r` = `algaeGrowth`, `T` = Tageslicht zwischen 0,2
   und 1 (Sinus), `Trüb` = 0,12 während einer Trübung, sonst 1.
3. Nachbarschafts-Raster neu aufbauen.
4. **Jedes Wesen** in fester Reihenfolge (Geburtsreihenfolge) nacheinander:
   sinnen → denken → drehen und schwimmen → grasen → Kosten → angreifen →
   Energie verbuchen → altern → sterben oder sich teilen. Wesen, die in
   diesem Takt sterben, handeln nicht mehr; Neugeborene handeln erst im
   nächsten Takt.
5. Tote entfernen, Neugeborene anhängen.
6. Gegebenenfalls **Störung** (siehe 7.6).
7. Gegebenenfalls **Einwanderung** (siehe 7.7).
8. Gegebenenfalls Messung.

## 4. Gestaltungsprinzipien

- **Grundprinzip.** Energiehaushalt plus Vererbung mit Mutation. Keine
  Fitnessfunktion; überleben und sich teilen ist die einzige „Bewertung“.
- **Emergenz.** Verhalten (Futtersuche, Jagd, Flucht, Rhythmus), Körpergröße,
  Sichtweite und Mutationsrate entstehen aus Selektion.
- **Anpassung.** Keine Lernfähigkeit zu Lebzeiten; Anpassung nur über
  Generationen. Zwei rückgekoppelte Ausgänge wirken als Kurzzeitgedächtnis.
- **Ziele.** Keine ausdrücklichen.
- **Wahrnehmung.** 14 Eingänge: Algendichte am Ort sowie vorn, links und
  rechts (Fühlerabstand 10 + 0,3 · Sichtweite, ±0,7 rad); Richtung, Nähe,
  relative Größe und Farbton-Ähnlichkeit des nächsten Nachbarn innerhalb der
  Sichtweite; eigene Energie; Licht am Ort; zwei Gedächtniswerte; Puls
  `sin(Alter · Frequenz + Phase)`; Konstante 1.
- **Wechselwirkung.** Indirekt über gemeinsame Algen (Ausbeutungskonkurrenz),
  direkt über Angriffe.
- **Zufall.** Ein deterministischer Generator (mulberry32) je Welt für die
  Dynamik; ein zweiter, getrennter für Namen und Anzeigefarben. Gleiche Saat
  und gleiche Parameter ergeben in jeder JavaScript-Engine bitgenau denselben
  Verlauf, weil `exp`, `log`, `sin`, `cos`, `tanh` und `atan2` aus
  Grundrechenarten nachgebaut sind (`src/detmath.js`).
- **Kollektive.** Arten (Linien), siehe 7.8. Sie sind reine Beobachtung und
  wirken nicht auf die Dynamik zurück; ein Test prüft das.
- **Beobachtung.** Siehe Abschnitt 8.

## 5. Initialisierung

- Lichtflecken mit zufälligen Bahnen; Algen in jeder Zelle `L · U(0,3; 0,9)`.
- Vier Gründergruppen à 10 Tiere. Pro Gruppe wird ein Gründer-Erbgut
  bestimmt: Gewichte N(0; 0,7), Größe U(4; 8), Sichtweite U(35; 90),
  Mutationsrate U(0,04; 0,12), Puls U(0,01; 0,12), Farbton U(0; 360).
  Mit `founderScreening` (Standard) werden zwölf solche Kandidaten erzeugt und
  der behalten, dessen Netz auf 24 zufällige Reizmuster am häufigsten mit
  mäßigem Schub (0,15 bis 0,65) und ohne Angriff antwortet. Ohne diese
  Vorauswahl sterben die meisten Startgruppen sofort aus.
- Die übrigen neun Tiere einer Gruppe sind einmal mutierte Kopien. Sie werden
  um einen zufälligen Ort gestreut (N(0; 90)) und starten mit halber
  Höchstenergie.

## 6. Eingangsdaten

Keine externen Daten. Die Umwelt (Licht, Tageszyklus) ist vollständig
modellintern.

## 7. Teilmodelle

### 7.1 Gehirn
Vollverbundenes Netz ohne eigene Bias-Gewichte (die Konstante-1-Eingabe
übernimmt das): 14 Eingänge → 8 versteckte tanh-Neuronen → 5 tanh-Ausgänge.
Versteckte und Ausgabewerte werden als 32-Bit-Gleitkommazahlen gespeichert.

### 7.2 Bewegung
Drehung `0,22 · o₀` rad pro Takt. Schub `((o₁ + 1)/2)^1,5`. Tempo
`Schub · 2,2 · (6/s)^0,35`: kleine Wesen sind flinker.

### 7.3 Grasen
Entnahme `a · 0,0028 · 6 · (s/6)^1,7 · (1 − 0,6 · Schub) · 1,6`, höchstens `a`.
Energiegewinn: Entnahme · 60. Wer stillhält, frisst gründlicher.

### 7.4 Kosten
`0,0042 · s² + 0,006 · s² · Schub² + 0,0015 · Sichtweite`, bei aktivem Angriff
zusätzlich `0,004 · s²`. In den letzten 20 % der Lebensspanne steigen die Kosten
linear bis auf das Dreifache.

### 7.5 Angriff
Aktiv, wenn `o₂ > 0,5` und `predation` eingeschaltet ist. Gelingt, wenn der
nächste Nachbar näher als `1,1 · (s + s_Beute)` ist und `s > 0,75 · s_Beute`.
Schaden `min(E_Beute; 0,09 · s²)`, davon 75 % als Energie für den Angreifer.
Beute mit `E ≤ 0` stirbt („gefressen“) und hinterlässt keinen Dünger.

### 7.6 Tod, Teilung, Störung
- Tod bei `E ≤ 0` (verhungert) oder Alter `> 600 · (4 + 0,45 · s)` Takte
  (Altersschwäche). Leichen düngen die 3 × 3 Nachbarzellen mit
  `0,02 · s² + 0,5 · max(0; E)/60` Algen.
- Teilung bei `E > 0,7 · E_max` und Alter `> 160` Takte. Das Kind bekommt
  40 % der Energie, die Mutter behält 50 %, 10 % gehen verloren. Das Kind
  erbt ein mutiertes Erbgut (7.9) und erscheint `2s` hinter der Mutter.
- **Störung** (Versuchsparameter): ab Tag `disturbFrom` alle `disturbEvery`
  Tage stirbt jedes Tier unabhängig mit Wahrscheinlichkeit `disturbStrength`.
  Leichen düngen wie oben.

### 7.7 Einwanderung
Ist `immigration` an, die Einwanderungsphase (`immigrationUntil`) nicht
vorbei, der Bestand unter `minPopulation` (14) und die letzte Einwanderung
mehr als 240 Takte her, kommt eine neue Gründergruppe (wie in 5). Sie bildet
eine neue Gründerlinie. Die Versuche schließen die Einwanderung nach Tag 10,
damit Vielfalt nicht von außen kommt.

### 7.8 Arten (Beobachtung)
Jede Linie speichert das Erbgut ihres Gründers. Ist ein Kind bei der Geburt
weiter als `speciation` (2,5) vom Gründer seiner Linie entfernt, gründet es
eine neue Linie. Erreicht eine Linie `establishAt` (10) lebende Mitglieder,
gilt sie als benannte Art; kleinere Linien werden ihrem nächsten benannten
Vorfahren zugerechnet. Abstand zweier Erbgute:

`√(mittleres quadriertes Gewichts-Δ)/0,3 + |Δs|/1,5 + |ΔSicht|/25 + Farbton-Δ/40`

Da es nur ungeschlechtliche Vermehrung gibt, sind diese Arten Abstammungs-
Cluster (ähnlich Morphospezies), keine Fortpflanzungsgemeinschaften.

### 7.9 Mutation
Je Gewicht mit Wahrscheinlichkeit `Mutationsrate · mutationScale`: + N(0; 0,25),
in 8 % der Fälle stattdessen + N(0; 1,2); begrenzt auf ±4. Farbton + N(0; 2,5).
Größe mit p = 0,6 + N(0; 0,35). Sichtweite mit p = 0,6 + N(0; 4). Puls mit
p = 0,4 · exp(N(0; 0,15)). Mutationsrate · exp(N(0; 0,08)). Alle Schrittweiten
werden mit `mutationScale` multipliziert; alle Werte bleiben in ihren Grenzen.

## 8. Beobachtung und Messgrößen

Definiert in `src/metrics.js`. Die wichtigsten:

| Größe | Definition | Hängt von der Artdefinition ab? |
| --- | --- | --- |
| evolvierte Vielfalt | mittlerer Erbgut-Abstand zweier Tiere derselben Gründerlinie | nein |
| genetische Vielfalt | mittlerer Erbgut-Abstand zweier beliebiger Tiere | nein |
| Gründerlinien | Zahl überlebender Gründerlinien | nein |
| Artenzahl, Shannon H′, effektive Arten exp(H′), Simpson 1 − D | über benannte Arten | ja |
| Merkmale | Mittel und Streuung von Größe, Sicht, Mutationsrate, Schub | nein |
| Jägeranteil | Anteil der Tiere mit mindestens einer Beute | nein |

Die Abstände werden über eine gleichmäßige Stichprobe von höchstens 60
Tieren gemittelt (jedes k-te Tier, ohne Zufall).

## 9. Parameter

Alle Standardwerte stehen in `PARAMS` in `src/world.js`. Sie sind so
gewählt, dass Welten zuverlässig anlaufen und Arten bilden. Sie sind **nicht**
an ein reales System angepasst.

## 10. Bekannte Grenzen

- **Kleine Welt, kurze Zeit.** Einige hundert Tiere über 25 bis 35
  Generationen. Drift ist stark, seltene Ereignisse sind selten.
- **Ungeschlechtlich.** Keine Rekombination, kein Genfluss zwischen Linien.
  Aussagen über Artbildung betreffen Linienaufspaltung, nicht reproduktive
  Isolation.
- **Eine Ressource.** Nischen entstehen nur über Raum, Zeit, Größe und
  Räuberei, nicht über verschiedene Nahrung.
- **Willkürliche Abstandsgewichte.** Die Gewichtung von Gehirn, Größe, Sicht
  und Farbton im Erbgut-Abstand ist eine Wahl. Vielfaltsmaße hängen von ihr
  ab, nicht aber die Dynamik.
- **Gründer-Vorauswahl.** Sie verzerrt die Startbedingungen zugunsten
  „brauchbarer“ Gehirne; abschaltbar mit `founderScreening: false`.
- **Gleichgewicht.** Die evolvierte Vielfalt steigt in den ersten etwa 35
  Tagen und pendelt sich dann ein. Die Versuche messen deshalb über die Tage
  40 bis 60.

## Quellen

- Grimm, V. et al. (2006): A standard protocol for describing individual-based
  and agent-based models. *Ecological Modelling* 198, 115–126.
- Grimm, V. et al. (2020): The ODD protocol for describing agent-based and
  other simulation models: a second update. *JASSS* 23(2), 7.
- Paine, R. T. (1966): Food web complexity and species diversity.
  *American Naturalist* 100, 65–75.
- Connell, J. H. (1978): Diversity in tropical rain forests and coral reefs.
  *Science* 199, 1302–1310.
