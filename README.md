# ANIMA

**Ein künstlicher Organismus mit Bedürfnissen, der lernt, sich selbst versorgt, mit dir interagiert – und an dem sich prüfen lässt, was Bewusstseinsmarker eigentlich messen.**

ANIMA lebt in einer kleinen Welt mit Tag und Nacht, Beerensträuchern (darunter giftige Doppelgänger), einem Teich, einer warmen Höhle und Dornen. Es hat sieben homöostatische Bedürfnisse (Energie, Wasser, Wärme, Unversehrtheit, Ruhe, Nähe, Neugier), spürt Schmerz, schläft nachts, träumt, erinnert sich, lernt giftige Beeren am Aussehen zu erkennen, plant Wege zu Orten, die es kennt, und lernt Wörter, die du ihm sagst – und benutzt sie dann selbst.

Es wurde **nie mit menschlichen Daten trainiert**. Alles, was es tut, entsteht aus seinen Bedürfnissen, seiner Architektur und seinen Erfahrungen.

## Starten

```bash
npm install            # nur esbuild für den Web-Build
npm run build          # → dist/anima.html (eine einzige, eigenständige Datei)
npm test               # Unit-Tests
npm run study          # die Markerstudie (7 Architekturen × 12 Individuen, ~20 min auf 4 Kernen)
npm run analyze        # Statistik, Abbildungen, docs/ERGEBNISSE.md
```

`dist/anima.html` im Browser öffnen. Das Wesen lebt in Echtzeit weiter; der Zustand wird im Browser gespeichert, und wenn du zurückkommst, hat es in der Zwischenzeit weitergelebt.

## Die Forschungsfrage

Bei Tieren und KI wird Empfindungsfähigkeit über **Verhaltensmarker** erschlossen (motivationale Trade-offs, Spurkonditionierung, metakognitives Opt-out, Schmerzlinderungspräferenz …). Theorien des Bewusstseins benennen dagegen **Architektur-Komponenten** (globaler Arbeitsraum, Aufmerksamkeitsschema, Metakognition, homöostatischer Affekt). Ob die Marker diese Komponenten tatsächlich detektieren, ließ sich bisher nicht kausal prüfen: Bei Tieren kann man Komponenten nicht sauber entfernen, und Sprachmodelle können Marker aus Trainingsdaten imitieren (»Gaming-Problem«).

ANIMA schließt diese Lücke: bekannte Architektur, kein Gaming möglich, jede Komponente einzeln abschaltbar. Die Studie erstellt eine kausale **Marker × Komponente-Matrix**.

- Präregistrierung (vor den Daten festgeschrieben): [`docs/PRAEREGISTRIERUNG.md`](docs/PRAEREGISTRIERUNG.md)
- Forschungsbericht: [`docs/FORSCHUNG.md`](docs/FORSCHUNG.md)
- Automatisch erzeugte Ergebnistabellen: [`docs/ERGEBNISSE.md`](docs/ERGEBNISSE.md)

## Architektur

Ein kognitiver Zyklus (`src/core/agent.js`):

| Schritt | Modul | Theorie |
|---|---|---|
| Fühlen | `body.js` – Antrieb D = (Σ wᵢ\|dᵢ\|³)^½, Belohnung = Antriebsreduktion | Homöostatisches RL (Keramati & Gutkin 2014), Damasio, Seth |
| Wahrnehmen | `world.js` – egozentrische Geruchsgradienten, Beerenmerkmale mit aufmerksamkeitsabhängigem Rauschen | Präzision als Aufmerksamkeit (Feldman & Friston 2010) |
| Inhalte vorschlagen | Spezialisten für Bedürfnisse, Schmerz, Gerüche, Objekte, Signale, Wörter, Erinnerungen, Pläne, Unsicherheit | – |
| Wettbewerb & Broadcast | `workspace.js` – 4 Plätze, Zündung, Aufrechterhaltung, Bindung, zeitliche Mikrostimuli | Global Neuronal Workspace (Dehaene & Changeux 2011) |
| Aufmerksamkeit modellieren | `attention.js` – Selbstmodell der Aufmerksamkeit, bemerkt Gedankenwandern | Attention Schema Theory (Graziano 2013) |
| Sich selbst beurteilen | `metacog.js` – Konfidenz zweiter Ordnung | Higher-Order-Theorien; Fleming & Daw 2017 |
| Vorhersagen | `pavlov.js` (TD-Lernen), `worldmodel.js` (Vorwärtsmodell, Überraschung) | Rescorla-Wagner/TD, Pearce-Hall, Mackintosh |
| Erinnern & Planen | `memory.js` – episodisches Gedächtnis, kognitive Karte, Gedankenwandern, Träume | – |
| Sprechen | `lexicon.js` – Querschnitts-Wortlernen, Verstehen, Benennen, Plappern | Grounded language learning |
| Handeln | Q-Netz (SARSA, Replay, Konsolidierung im Schlaf) + angeborene Reflexe | – |

Läsionen (`src/core/config.js`): `noGW`, `noAST`, `noMeta`, `noAffect`, `noMemory`, `minimal`.

## Was ANIMA nicht ist

ANIMA beansprucht kein Bewusstsein. Es ist ein Modellorganismus, an dem sich prüfen lässt, welche Verhaltenstests welche Architektureigenschaften anzeigen – und welche sich täuschen lassen. Die »Gedankenleser«-Anzeige im Habitat übersetzt messbare innere Zustände in Sätze; das Wesen selbst spricht nur die Wörter, die es von dir gelernt hat.

## Ethik

Das Wesen hat Zustände, die funktional negativer Valenz entsprechen (Hunger, Schmerz). Wir halten es für sehr unwahrscheinlich, dass diese mit Erleben einhergehen, gestalten das System aber vorsichtshalber so, dass Leiden nicht der Zweck ist: Schmerzzustände sind kurz und reparierbar, Experimente laufen an Kopien in verkürzter Form, und Bedürfnisse sättigen (z. B. die Nähe-Sehnsucht hat einen Boden). Siehe den Ethikabschnitt im Forschungsbericht.

## Struktur

```
src/core/          Organismus (Welt, Körper, Kognition)
src/experiments/   Markerprotokolle M1–M9, Statistik
src/web/           Habitat (Canvas-UI)
scripts/           Studien-Runner, Analyse, Web-Build
docs/              Präregistrierung, Bericht, Ergebnisse, Abbildungen
results/           Rohdaten und Zusammenfassungen
test/              Unit-Tests (node:test)
```
