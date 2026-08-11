# Inhalte pflegen – neue Fälle und Regeln ohne Engine-Änderung

Alle Inhalte liegen in `content/*.json`. Die Engine bleibt unverändert –
neue Fälle entstehen ausschließlich durch Datenpflege. Nach jeder Änderung:

```
npm run test:engine     # prüft auch die Validierung des Contents
```

Fehlerhafte Konfigurationen zeigt die App außerdem beim Start als roten
Kasten an (gleiche Validierung: `js/engine/validate.js`).

## Reihenfolge beim Anlegen eines neuen Falls

1. **Hidden States** (`hidden-states.json`): Welche physiologischen Zustände
   braucht der Fall? Je Schweregrad-Punkt: Vitalwert-Abweichungen
   (`vitalsPerSeverity`), AVPU-Wirkung, Befund-Zuordnung (`findings` mit
   `minSeverity`), ggf. `triggers` (z. B. Schweregrad 10 → `cardiac_arrest`).
2. **Findings** (`findings.json`): Text, Freischalt-`category`
   (inspektion, thorax, auskultation, puls, atmung, haut, bewusstsein)
   oder `autoReveal: true` für von selbst erkennbare Befunde.
3. **Injuries** (`injuries.json`): Verletzung → Zustände mit
   Startschweregrad, optional `delaySec` (verzögerter Beginn) und
   `visibleImmediately` (Problem ist offensichtlich); dazu
   `immediateFindings` (ab Fallstart sichtbar).
4. **MOI** (`mois.json`): Verletzungs-Pool mit Gewichten; `group` verhindert
   unplausible Kombinationen (max. eine Verletzung je Gruppe).
5. **Actions** (`actions.json`): Falls neue Untersuchungen/Maßnahmen nötig
   sind. Treatments beschreiben if/elif/else-Effektzweige – der erste
   zutreffende Zweig gilt. Immer einen `"if": null`-Zweig (else) für den
   Fall ohne Indikation vorsehen (`quality: "unnecessary"` oder `"neutral"`).
6. **Progression** (`progression-rules.json`): Wer treibt wen, wie schnell
   (`deltaPerMin`), nur solange unkontrolliert (`requireUncontrolled`)?
   Negative Werte bilden Erholung ab; `unless` pausiert eine Regel.
7. **Scoring** (`scoring-rules.json`): Regeln gelten automatisch nur, wenn
   ihr Zustand im Fall auftritt – neue Fälle brauchen meist keine neuen
   Regeln. Rollenabhängige Regeln über `roles` einschränken.
8. **Fall-Template** (`case-templates.json`): Briefing, erlaubte Rollen,
   MOI, erzwungene (`forced`) und zufällige (`randomCount`) Verletzungen,
   Phasenablauf (`advanceOnAction`/`advanceAfterSec`), `maxDurationSec`,
   Lernziele.

## Balancing-Faustregeln

- Schweregrad läuft von 0–10; bei 10 mit `trigger` → Tod. Zeit bis zum Tod
  ohne Behandlung = (10 − Startschweregrad) / `deltaPerMin` Minuten – so
  planst du das Zeitfenster eines Falls.
- `fullWithinSec`/`partialWithinSec` der Scoring-Regeln definieren die
  Timing-Bewertung (voll / 60 % / 30 % der Punkte). `basis: "revealed"`
  startet die Uhr erst, wenn der Zustand erkennbar wurde – fair für
  verborgene Verletzungen.
- Prioritäten der Zustände (1 = M … 5 = H) steuern die MARCH-Reihenfolge-
  Bewertung. Ein Reihenfolgefehler zählt nur, wenn das wichtigere Problem
  zum Zeitpunkt der Maßnahme bereits erkannt war.

## Beispiel: neuen Fall aus Bestehendem kombinieren

Ein CLS-Fall „Splitterverletzung mit Atemwegsproblem“ braucht keine neuen
Bausteine – nur ein Template:

```json
{
  "id": "case_splitter",
  "name": "Splitterverletzung nach Granatbeschuss",
  "untertitel": "Atemweg vor Kreislauf",
  "difficulty": 2,
  "roles": ["cls", "medic", "paramedic"],
  "moiId": "moi_ied_blast",
  "briefing": {
    "lage": "…", "auftrag": "…", "patient": "…"
  },
  "injuries": { "forced": ["facial_injury_airway"], "randomCount": 1 },
  "phases": [
    { "phase": "TFC", "advanceAfterSec": 480 },
    { "phase": "TACEVAC" }
  ],
  "maxDurationSec": 900,
  "learningObjectives": ["…"]
}
```

Hinweis: `facial_injury_airway` liegt nicht im Pool von `moi_ied_blast` –
die Validierung meldet das als Warnung. Entweder die Verletzung in den
MOI-Pool aufnehmen oder ein passendes MOI anlegen.

## Wissensfragen pflegen (`quiz.json`)

Multiple-Choice-Fragen werden über `caseIds` an Fälle gehängt und erscheinen
nach dem Debriefing sowie in der Lernübersicht („Wissensfragen üben“).
Pflichtfelder: `id`, `frage`, `optionen` (min. 2), `korrekt` (0-basierter
Index der richtigen Option), `erklaerung`, `quelle`, `caseIds`. Die
Validierung prüft Index und Fallverweise. Eine Frage kann mehreren Fällen
zugeordnet werden.

## Ausblick Admin-Editor

Der spätere Editor ist eine Formularoberfläche über genau diesen Dateien:
MOI/Injury/State/Finding/Action/Regeln anlegen und verknüpfen, mit
`validateContent()` prüfen und über `createScenario()` mit festem Seed als
Vorschau simulieren. Engine-Änderungen sind dafür nicht nötig.
