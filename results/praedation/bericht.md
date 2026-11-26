# Erhöhen Räuber die Vielfalt?

**Hypothese.** Wenn Angriffe möglich sind, ist die evolvierte Vielfalt (Erbgut-Abstände innerhalb einer Gründerlinie) der Gemeinschaft höher als ohne Angriffe (Schlüsselräuber-Hypothese nach Paine 1966: Räuber halten dominante Konkurrenten kurz und schaffen so Platz für andere).

Der Faktor schaltet nur die Wirkung des Angriffsausgangs ab. Gehirne, Kosten und alles andere bleiben gleich. Nach Tag 10 wandert niemand mehr ein; die Gemeinschaft entwickelt sich danach als geschlossenes System.

## Versuchsaufbau

| | |
| --- | --- |
| Faktor | `predation` mit den Stufen ohne Räuber (`false`), mit Räubern (`true`) |
| Wiederholungen | 12 Saaten (1000 bis 1011), jede auf jeder Stufe (gepaart) |
| Dauer | 60 Tage, gemessen wird der Mittelwert über Tag 40 bis 60 |
| Weitere Einstellungen | `immigrationUntil` = 10 |
| Primäre Messgröße | evolvierte Vielfalt (vorab festgelegt), alle übrigen explorativ |
| Code-Stand | `6046d10`, Node v22.23.5, Rechenzeit 237 s |

## Ergebnisse

Mittelwerte mit 95-%-Bootstrap-Intervall. Δ ist die mittlere gepaarte Differenz (zweite minus erste Stufe), getestet mit einem exakten Vorzeichen-Permutationstest; d_z ist die Effektstärke der Differenzen. Die p-Werte sind zusätzlich nach Holm über alle Messgrößen korrigiert.

| Messgröße | ohne Räuber | mit Räubern | Δ [95 %] | d_z | p | p (Holm) |
| --- | --- | --- | --- | --- | --- | --- |
| **evolvierte Vielfalt** | 2,89 [2,64; 3,13] | 3,13 [2,95; 3,32] | 0,25 [0,02; 0,44] | 0,63 | 0,056 | 0,299 |
| genetische Vielfalt | 2,93 [2,68; 3,17] | 3,21 [3,05; 3,38] | 0,28 [0,08; 0,48] | 0,77 | 0,024 | 0,195 |
| Gründerlinien | 1,11 [1,00; 1,26] | 1,18 [1,02; 1,38] | 0,07 [-0,15; 0,31] | 0,16 | 0,625 | 0,625 |
| Artenzahl | 18,71 [14,59; 23,03] | 14,61 [12,65; 16,77] | -4,11 [-7,59; -0,62] | -0,63 | 0,050 | 0,299 |
| effektive Arten | 7,97 [6,08; 9,89] | 6,49 [5,37; 7,60] | -1,48 [-3,12; 0,07] | -0,51 | 0,103 | 0,309 |
| Tiere | 748,50 [615,67; 875,59] | 579,92 [476,67; 692,56] | -168,58 [-285,55; -33,57] | -0,69 | 0,041 | 0,287 |
| Größe ⌀ | 3,94 [3,59; 4,31] | 4,25 [3,90; 4,59] | 0,31 [-0,15; 0,72] | 0,37 | 0,221 | 0,442 |
| Algen ⌀ | 0,33 [0,31; 0,35] | 0,36 [0,34; 0,39] | 0,04 [0,00; 0,07] | 0,58 | 0,069 | 0,299 |

![evolvierte Vielfalt je Stufe](evolvedDiv.svg)

![Verlauf: evolvierte Vielfalt](verlauf-evolvedDiv.svg)

## Dateien

- `runs.csv`: ein Lauf pro Zeile, mit den Fenster-Mittelwerten aller Messgrößen
- `timeseries.csv`: alle Messungen aller Läufe (alle halbe Tage)
- `manifest.json`: vollständige Parameter je Stufe, Saaten, Code-Stand
- `<messgröße>.svg`: Einzelwerte je Saat, Mittelwert und 95-%-Intervall

Neu erzeugen: `node tools/experiment.mjs experiments/praedation.json`
