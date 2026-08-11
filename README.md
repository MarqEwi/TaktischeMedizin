# TakMed Trainer – Taktische Verwundetenversorgung (TCCC)

Trainings- und Simulations-App für taktische Verwundetenversorgung nach
TCCC-Grundsätzen (MARCH/PAWS). Kein statisches Quiz, kein fester
Entscheidungsbaum: Eine **generische Simulations-Engine** verarbeitet
Fallverläufe aus Regeln, verdeckten Zuständen und Maßnahmen – die Inhalte
liegen vollständig in Konfigurationsdateien (`content/*.json`).

> **Trainings- und Simulationsanwendung** – privates Projekt, kein Angebot
> der Bundeswehr, kein Medizinprodukt und keine Entscheidungsunterstützung
> für reale Einsätze.

## Didaktisches Kernprinzip

- Im Hintergrund existiert ein **verdeckter Patientenzustand** (Hidden States).
- Befunde werden erst durch **aktive Untersuchung** freigeschaltet.
- **Vitalparameter werden generiert**, nicht gespeichert: Basiswert plus
  Abweichungen aus den aktiven Zuständen, mit Mess-Streuung.
- Verletzungen **verschlechtern sich zeitabhängig** (Progressionsregeln);
  jede Aktion kostet Simulationszeit.
- Bewertet werden **Priorisierung, Reihenfolge, Timing, Vollständigkeit,
  Reassessment und taktische Disziplin** – nicht nur richtig/falsch.
- Rollen (CLS, Combat Medic, …) begrenzen Maßnahmen und Bewertungsmaßstab.

## Funktionen (MVP)

- 3 Fälle (Feuergefecht, IED-Anschlag, Einzelschuss) mit MOI-basierter,
  teils zufälliger Verletzungsauswahl (reproduzierbar per Seed)
- Phasenmodell CUF → TFC → TACEVAC
- Trainingsmodus (direktes Feedback) und Simulationsmodus (Auswertung erst
  im Debriefing)
- Debriefing mit Outcome, Punkten je Bewertungsgruppe, kritischen Fehlern,
  verpassten Maßnahmen und vollständigem Verlauf
- Lernübersicht mit lokalen Bestleistungen (localStorage, Präfix `takmed_`)

## Technik

- Statische Web-App ohne Build-Schritt: `index.html` + ES-Module in `js/` +
  Konfiguration in `content/` (MERCwerk-Prinzip: kein Bundler)
- **Drei Ebenen:** Engine-Code (`js/engine/`) · Konfiguration (`content/`) ·
  UI (`index.html`, `js/app.js`). Die UI erhält den Patientenzustand nie
  direkt, sondern nur die gefilterte View der Engine.
- `npm run sync` kopiert die Web-Dateien nach `www/` (Quelle der Capacitor-App)
- Service Worker (`sw.js`) nur auf `github.io`, nie in der App
- Details: `docs/ARCHITEKTUR.md` · Inhalte pflegen: `docs/INHALTE-PFLEGEN.md`

## Lokal starten

```
python3 -m http.server 8931
# → http://127.0.0.1:8931
```

(Ein beliebiger statischer Webserver genügt; `file://` funktioniert wegen
der JSON-Konfiguration per `fetch` nicht.)

## Tests

```
npm run test:engine   # Unit-Tests der Simulations-Engine (Node, ohne Browser)
npx playwright test   # Smoke-Tests der Web-Oberfläche
```

## Web-Version

Die App läuft als Web-Version unter: <https://marqewi.github.io/TaktischeMedizin/>
(GitHub Pages: Settings → Pages → Deploy from a branch → `main` / root)
