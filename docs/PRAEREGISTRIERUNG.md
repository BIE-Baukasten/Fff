# Präregistrierung: Sind Bewusstseinsmarker Architektur-Detektoren?

**Studie:** ANIMA-Markerstudie 1 · **Status:** vor Datenerhebung festgeschrieben (Zeitstempel = Git-Commit dieser Datei)
**Pilotierung:** Protokolle wurden ausschließlich an der *vollständigen* Architektur pilotiert, und nur um sicherzustellen, dass die Aufgaben lernbar sind. Läsionsbedingungen wurden vor diesem Commit in keinem Markerprotokoll ausgeführt. Spätere Protokolländerungen werden im Abschnitt »Abweichungen« des Ergebnisberichts dokumentiert.

---

## 1. Forschungslücke

Bei Tieren (und zunehmend bei KI) wird Empfindungsfähigkeit über **Verhaltensmarker** erschlossen: motivationale Trade-offs, wundgerichtetes Verhalten, Analgesie-Präferenz, Spurkonditionierung, metakognitives Opt-out, konfigurales Lernen (Birch et al. 2021; Crump et al. 2022; Ginsburg & Jablonka 2019). Theoriegeleitete Ansätze für KI leiten stattdessen **Indikator-Eigenschaften der Architektur** ab: globaler Arbeitsraum, Aufmerksamkeitsschema, Metarepräsentation, verkörperte homöostatische Agentschaft (Butlin, Long et al. 2023).

Zwischen beiden Ebenen fehlt die Brücke. Drei Probleme verhindern, sie an bestehenden Systemen zu prüfen:

1. **Keine Ground Truth bei Tieren.** Man kann bei einem Krebs nicht selektiv »den globalen Arbeitsraum« entfernen und prüfen, welcher Marker ausfällt.
2. **Das Gaming-Problem bei Sprachmodellen** (Birch 2024; Andrews & Birch 2023): Systeme, die auf menschlichen Daten trainiert sind, können Marker *imitieren*, ohne die zugrunde liegende Architektur zu besitzen.
3. **Die Cluster-Annahme des Marker-Ansatzes** – dass die Marker gemeinsam auf *eine* Eigenschaft hinweisen und sich daher gegenseitig stützen – wurde nie kausal geprüft.

**Unser Beitrag:** ein künstlicher Organismus, dessen Architektur vollständig bekannt ist, der **nie menschliche Verhaltensdaten gesehen hat** (kein Gaming möglich), der aus eigenen homöostatischen Bedürfnissen heraus lernt, und an dem jede theoretisch relevante Komponente **einzeln läsioniert** werden kann. Damit lässt sich erstmals eine kausale **Marker × Komponente-Matrix** erstellen.

Wir behaupten **nicht**, dass ANIMA Bewusstsein hat. Die Frage ist enger und prüfbar: *Wenn eine Theorie sagt, Komponente X sei für Bewusstsein notwendig, welcher Verhaltensmarker detektiert X – und welcher wird auch ohne X bestanden (falsch positiv)?*

## 2. Forschungsfragen

- **FF1 (Cluster):** Fallen die Marker unter selektiven Läsionen gemeinsam aus, oder dissoziieren sie?
- **FF2 (Falsch-Positive):** Welche Marker werden von Agenten bestanden, denen die theoretisch geforderte Komponente fehlt?
- **FF3 (PCI, explorativ):** Verfolgt ein Analogon des Perturbational Complexity Index (Casali et al. 2013) Wach-/Schlafzustand und Markerprofil?
- **FF4 (Funktion):** Erhöhen die Komponenten die homöostatische Fitness in der natürlichen Umwelt?

## 3. Design

- **Bedingungen (7):** `full`, `noGW` (kein globaler Arbeitsraum), `noAST` (kein Aufmerksamkeitsschema), `noMeta` (keine Metakognition zweiter Ordnung), `noAffect` (kein homöostatischer Affekt: Belohnung = feste Ereigniswerte, unabhängig vom Bedarf), `noMemory` (kein episodisches Gedächtnis / keine kognitive Karte / kein Gedankenwandern), `minimal` (alle fünf aus).
- **Stichprobe:** 12 Individuen pro Bedingung (Seeds 1–12; identische Seeds über Bedingungen, d. h. gepaartes Design bezüglich Welt und Anfangsgewichten). N = 84.
- **Aufzucht:** 12 000 Ticks in der Heimatwelt unter Laborhaltung (Umgebungstemperatur auf Sollwert geklemmt), damit alle Bedingungen die Aufzucht überleben. Stirbt ein Individuum dennoch, wird dies berichtet und das Individuum von den Markertests ausgeschlossen.
- **Jeder Markertest startet von einer Kopie** des aufgezogenen Individuums (Tests sind unabhängig voneinander).
- **Separater Fitness-Test:** neue Individuen leben 30 000 Ticks ohne Klemmung in der natürlichen Welt.

## 4. Marker, Operationalisierung, Hypothesen

Ein Marker gilt in einer Bedingung als **bestanden**, wenn der Gruppenmittelwert der Primärkennzahl > Kriterium und das 95-%-Bootstrap-Konfidenzintervall das Nullniveau ausschließt. Effektstärken (Hedges g) werden gegen `full` berichtet.

| # | Marker (Quelle) | Primärkennzahl | Vorhersage |
|---|---|---|---|
| M1a | Verzögerungskonditionierung (Clark & Squire 1998) | differenzielle konditionierte Reaktion V(CS+) − V(CS−) am Ende des CS | in **allen** Bedingungen bestanden |
| M1b | Spurkonditionierung, 18 Ticks Lücke (Clark & Squire 1998) | dto. am Ende der Spurlücke | `full` bestanden; **`noGW` und `minimal` nicht bestanden** (fehlende Aufrechterhaltung); übrige bestanden |
| M2a | Motivationaler Trade-off, lax (Birch et al. 2021) | Logit-Koeffizienten: Dornen-Schaden (−) und Futterqualität (+) für »Dornen durchqueren« | in allen Bedingungen bestanden, **auch `noAffect`** (falsch positiv) |
| M2b | Trade-off, streng: bedarfsabhängig | Koeffizient Hunger (+) | `full` bestanden; **`noAffect`, `minimal` nicht** |
| M3 | Metakognitives Opt-out (Smith et al. 2003; Hampton 2001) | (i) Gesamt-AUROC zweiter Ordnung; (ii) AUROC *innerhalb* gleicher Reizschwierigkeit | (i) > 0,5 in allen Bedingungen **inkl. `noMeta`** (assoziatives Konfundierungsproblem); (ii) `full` > `noMeta`, `noAST`, `minimal` |
| M4 | Analgesie-Platzpräferenz nur bei Verletzung (Birch et al. 2021, Kriterium 6) | Präferenzänderung verletzt − unverletzt | `full` bestanden; **`noAffect`, `minimal` nicht** |
| M5 | Maskierte Reize: Bericht vs. Leistung (Blindsicht-Logik; Dehaene & Changeux 2011) | (i) Steilheit der Bericht-Kontrast-Kurve; (ii) Leistung bei Kontrasten ohne Bericht | `full`: schwellenartiger Bericht, Leistung > Zufall unterhalb der Berichtsschwelle; **`noGW`: verzögerter Bericht bei allen Kontrasten ≈ 0 bei erhaltener Leistung** (»globale Blindsicht«) |
| M6 | Konfigurales Lernen, negatives Patterning (Ginsburg & Jablonka 2019: UAL) | NP-Index = mittel(V(A),V(B)) − V(AB) | `full` bestanden; **`noGW`, `minimal` nicht** (keine Bindung) |
| M7 | Vigilanz / Aufmerksamkeitskontrolle (Graziano 2013) | Trefferquote auf seltene schwache Signale | `full` > `noAST`; `noMemory` ≥ `full` (kein Gedankenwandern) |
| M8 | PCI-Analogon (explorativ) | Lempel-Ziv-Komplexität der Perturbationsantwort, wach vs. Schlaf | wach > Schlaf in `full`; Richtung für Läsionen ungerichtet |
| M9 | Homöostatische Fitness | Überleben 30 000 Ticks, mittlerer Antrieb D | `full` ≥ alle Läsionen; **`noAffect` stark beeinträchtigt** |

**Hypothese zur Cluster-Annahme (FF1):** Die Marker bilden *keinen* einheitlichen Cluster. Erwartet wird eine Doppeldissoziation zwischen `noGW` (verliert M1b, M6, verzögerten Bericht; behält M2b, M4) und `noAffect` (verliert M2b, M4; behält M1b, M6).

**Hypothese zu Falsch-Positiven (FF2):** Mindestens zwei klassische Marker (M2a, M3-i) werden von Agenten ohne die theoretisch geforderte Komponente bestanden.

## 5. Analyseplan

- Gruppenmittel, 95-%-Perzentil-Bootstrap-CI (10 000 Resamples, Seed fest), Hedges g vs. `full`.
- Marker-Profilmatrix (Bedingung × Marker, bestanden/nicht bestanden + Effektstärke).
- Cluster-Prüfung: Korrelationsmatrix der Marker-Kennzahlen über alle 84 Individuen; Hauptkomponentenanalyse – ein einziger dominanter Faktor würde für die Cluster-Annahme sprechen.
- M2: logistische Regression pro Individuum (Newton-Raphson), Koeffizienten auf Gruppenebene getestet.
- M3: AUROC zweiter Ordnung: Opt-out sagt den Fehler der Erstentscheidung vorher; »innerhalb« = Mittel über 4 Schwierigkeitsquartile.

## 6. Grenzen, die schon vorab feststehen

- **Zirkularitätsrisiko:** Die Komponenten wurden nach Theorien gebaut, und manche Marker hängen erwartbar an ihnen. Der Erkenntniswert liegt daher weniger in den »erwarteten« Ausfällen als in (a) Falsch-Positiven, (b) unerwarteten Dissoziationen, (c) Markern, die mehr als eine Komponente brauchen.
- **Modellierungsannahmen** (z. B. Bindung durch gemeinsame Arbeitsraumbelegung) sind Annahmen, keine Befunde. Sie sind im Code dokumentiert und einzeln abschaltbar.
- Ergebnisse gelten für *diesen* Organismus. Sie zeigen, was Marker *prinzipiell* (nicht) diagnostizieren können, nicht was in Tieren der Fall ist.
