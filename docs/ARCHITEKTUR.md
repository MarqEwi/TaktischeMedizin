# Architektur – TakMed Trainer

## Drei Ebenen

```
┌────────────────────────────────────────────────────────────┐
│ UI (index.html, js/app.js)                                 │
│   nur Darstellung; kennt ausschließlich getView() und den  │
│   Debriefing-Report – nie Hidden States                    │
├────────────────────────────────────────────────────────────┤
│ Engine (js/engine/)                                        │
│   generische Simulationslogik, DOM-frei, in Node testbar   │
│   engine.js   Szenario-Fabrik, Aktionen, Zeit/Progression  │
│   vitals.js   Vitalwert-Generierung aus Zuständen          │
│   scoring.js  Bewertung + Debriefing                       │
│   validate.js Validierung der Konfiguration                │
│   content.js  Laden/Indexieren der Konfiguration           │
│   types.js    Domain-Modell (JSDoc-Interfaces)             │
│   rng.js      deterministischer Zufall (Seed)              │
├────────────────────────────────────────────────────────────┤
│ Konfiguration (content/*.json)                             │
│   roles, mois, injuries, hidden-states, findings, actions, │
│   progression-rules, scoring-rules, case-templates         │
└────────────────────────────────────────────────────────────┘
```

Kein Bundler, kein Build-Schritt (MERCwerk-Prinzip). Die Engine-Module sind
trotzdem echte ES-Module, damit die Kernlogik ohne Browser in Node-Tests
läuft (`npm run test:engine`).

## Domain-Modell

**Statisch (Konfiguration):** Role, MOI, Injury, HiddenState, Finding,
Action (Assessment/Treatment/Tactic), ProgressionRule, ScoringRule,
CaseTemplate. Pflicht- und Optionalfelder sind in `js/engine/types.js`
dokumentiert und werden von `validate.js` geprüft.

**Laufzeit (Engine-intern):** ScenarioInstance mit StateInstances
(Schweregrad 0–10, controlled/removed, Onset-/Sichtbarkeitszeitpunkte,
Behandlungshistorie), freigeschalteten Befunden, gemessenen Vitalwerten,
Protokoll und Verstoß-Listen. DebriefingEvents entstehen erst bei der
Auswertung.

## Simulationsfluss

1. **Fallstart:** `createScenario()` wählt aus dem MOI-Pool Verletzungen
   (erzwungene + gewichtete Zufallsauswahl, max. eine je `group`,
   reproduzierbar per Seed). Verletzungen setzen Hidden States; sofort
   sichtbare Befunde werden freigeschaltet.
2. **Zeit:** Jede Aktion kostet Sekunden. `advanceTime()` integriert in
   5-s-Schritten: Progressionsregeln übertragen Schweregrad zwischen
   Zuständen (z. B. unkontrollierte Blutung → Schock), Trigger lösen
   Folgezustände aus (Schweregrad 10 → Kreislaufstillstand), `autoReveal`-
   Befunde werden von selbst sichtbar, Phasen wechseln nach Zeit.
3. **Assessments** schalten Befunde ihrer Kategorien frei und messen
   Vitalwerte (Snapshot mit Zeitstempel – veraltete Werte erzwingen
   Reassessment). Vitalwerte = Basiswert + Σ(Zustandseffekte × Schweregrad),
   geklemmt, plus deterministischem Jitter.
4. **Treatments** werten if/elif/else-Effektzweige aus (erster passender
   Zweig): controlState, modifySeverity, removeState, addState, addTag.
   Qualität (correct/partial/unnecessary/neutral) steuert Feedback und
   Bewertung. Reihenfolge-Verstöße (MARCH) und Phasenverstöße werden zum
   Ausführungszeitpunkt protokolliert – ein Verstoß zählt nur, wenn das
   höherprioritäre Problem zu diesem Zeitpunkt bereits **erkannt** war.
5. **Ende:** Übergabe durch Nutzer, Tod (terminaler Zustand) oder
   Maximaldauer. `evaluate()` wertet regelbasiert aus und erstellt das
   Debriefing (Outcome, Punkte je Regel/Gruppe, kritische Fehler,
   Zeitverluste, Reihenfolge- und Reassessment-Defizite).

## Editor-Vorbereitung

- Alle Inhalte sind reine Daten mit IDs und expliziten Relationen –
  ein späterer Admin-Editor ist eine Formularoberfläche über genau diesen
  JSON-Strukturen.
- `validateContent()` liefert menschenlesbare Fehler je Objekt – dieselbe
  Funktion läuft später hinter den Editor-Formularen.
- Die "Fall testen"-Funktion des Editors existiert im Kern schon:
  `createScenario()` mit festem Seed + Engine-Aufrufe = reproduzierbare
  Vorschau (so arbeiten bereits die Unit-Tests).
- Keine Falllogik in der UI: Neue Fälle/Regeln erfordern keine Änderung an
  `app.js` oder `index.html`.

## Bewusste MVP-Vereinfachungen

- Hidden States sind global je Typ, nicht je Körperstelle: zwei massive
  Blutungen an verschiedenen Extremitäten verschmelzen zu einem Zustand.
  Fälle sind so gebaut, dass das nicht auftritt; für später ist eine
  Instanzierung je `bodyRegion` vorgesehen.
- Kein Medikamenten-/Dosismodell, keine Flüssigkeitstherapie, keine
  Analgesie-Kette – die Effekt-DSL trägt diese Erweiterungen bereits.
- Kein Multi-Patient, kein Backend, kein Login, kein Editor-UI.
- AdMob/Premium sind in der Capacitor-Hülle vorbereitet (Plugins, Manifest
  mit Test-App-ID), aber im MVP nicht aktiviert.
