// Domain-Modell der Simulations-Engine als JSDoc-Typdefinitionen.
// Bewusst ohne TypeScript-Compile-Schritt (MERCwerk-Prinzip: kein Build-Schritt),
// aber mit denselben klaren Interfaces – prüfbar mit `npx tsc --checkJs --noEmit`.
//
// STATISCH (Konfiguration, content/*.json – später über den Admin-Editor pflegbar):
//   Role, Moi, Injury, HiddenStateDef, FindingDef, ActionDef,
//   ProgressionRule, ScoringRule, CaseTemplate
// LAUFZEIT (von der Engine instanziiert, verlässt die Engine nur gefiltert als View):
//   ScenarioInstance, StateInstance, LogEntry, DebriefingEvent, ScenarioView

/**
 * @typedef {Object} Role
 * @property {string} id
 * @property {string} name          Pflicht
 * @property {string} kurz          Pflicht
 * @property {string} beschreibung  Pflicht
 * @property {boolean} playable     Pflicht: im MVP wählbar?
 * @property {string[]} [equipment] optional
 */

/**
 * @typedef {Object} MoiPoolEntry
 * @property {string} injuryId
 * @property {number} weight        Auswahlgewicht
 * @property {string} [group]       höchstens eine Verletzung je Gruppe
 *
 * @typedef {Object} Moi
 * @property {string} id
 * @property {string} name
 * @property {string} beschreibung
 * @property {MoiPoolEntry[]} pool
 */

/**
 * @typedef {Object} InjuryStateRef
 * @property {string} stateId
 * @property {number} severity            Startschweregrad 0–10
 * @property {number} [delaySec]          verzögerter Beginn
 * @property {boolean} [visibleImmediately] Problem ist ohne Untersuchung offensichtlich
 *
 * @typedef {Object} Injury
 * @property {string} id
 * @property {string} name
 * @property {string} bodyRegion
 * @property {string} beschreibung
 * @property {InjuryStateRef[]} states
 * @property {string[]} immediateFindings  ab Fallstart sichtbare Befunde
 */

/**
 * @typedef {Object} StateFindingRef
 * @property {string} findingId
 * @property {number} minSeverity   Befund aktiv ab diesem Schweregrad
 *
 * @typedef {Object} StateTrigger
 * @property {number} atSeverity
 * @property {string} addStateId
 * @property {number} severity
 *
 * @typedef {Object} HiddenStateDef
 * @property {string} id
 * @property {string} name
 * @property {string} beschreibung
 * @property {"M"|"A"|"R"|"C"|"H"|null} marchCategory
 * @property {number|null} priority          1 = dringlichst (MARCH), null = nicht priorisiert
 * @property {number} maxSeverity            i. d. R. 10
 * @property {boolean} [terminal]            beendet das Szenario (Tod)
 * @property {Object<string, number>} vitalsPerSeverity  additive Abweichung je Schweregrad-Punkt (hr, rr, sbp, spo2)
 * @property {number} avpuPenaltyPerSeverity
 * @property {StateFindingRef[]} findings
 * @property {StateTrigger[]} triggers
 */

/**
 * @typedef {Object} FindingDef
 * @property {string} id
 * @property {string} text
 * @property {string} category    Freischalt-Kategorie (inspektion, thorax, auskultation, puls, atmung, haut, bewusstsein)
 * @property {boolean} [autoReveal] wird ohne Untersuchung sichtbar, sobald aktiv
 */

/**
 * @typedef {Object} EffectCondition
 * @property {string} stateActive   Zustands-ID, die aktiv (severity > 0) sein muss
 * @property {number} [minSeverity]
 *
 * @typedef {Object} Effect
 * @property {"controlState"|"modifySeverity"|"removeState"|"addState"|"addTag"} op
 * @property {string} [stateId]
 * @property {number} [delta]
 * @property {number} [severity]
 * @property {string} [tag]
 *
 * @typedef {Object} EffectBranch
 * @property {EffectCondition|null} if   null = else-Zweig
 * @property {Effect[]} apply
 * @property {string} feedback
 * @property {"correct"|"partial"|"unnecessary"|"neutral"} quality
 *
 * @typedef {Object} ActionDef
 * @property {string} id
 * @property {"assessment"|"treatment"|"tactic"} kind
 * @property {string} name
 * @property {string} beschreibung
 * @property {string[]} roles       Rollenfreigabe (Pflicht)
 * @property {string[]} phases      erlaubte Phasen; leer = alle
 * @property {number} timeCostSec
 * @property {boolean} repeatable
 * @property {"M"|"A"|"R"|"C"|"H"|"S"} category
 * @property {{revealCategories: string[], measureVitals: string[]}} [assessment]
 * @property {{effects: EffectBranch[]}} [treatment]
 */

/**
 * @typedef {Object} ProgressionRule
 * @property {string} id
 * @property {string} beschreibung
 * @property {{stateId: string, minSeverity: number, requireUncontrolled: boolean}} source
 * @property {string} target
 * @property {number} deltaPerMin
 * @property {{stateId: string, uncontrolled?: boolean}[]} [unless]
 */

/**
 * @typedef {Object} ScoringRule  Felder je nach type, siehe content/scoring-rules.json
 * @property {string} id
 * @property {"requiredTreatment"|"requiredAction"|"orderPriority"|"reassessment"|"phaseViolation"|"unnecessaryTreatment"} type
 * @property {string} gruppe
 * @property {string} label
 * @property {string[]} [roles]
 */

/**
 * @typedef {Object} CasePhase
 * @property {"CUF"|"TFC"|"TACEVAC"} phase
 * @property {string} [advanceOnAction]
 * @property {number} [advanceAfterSec]
 *
 * @typedef {Object} CaseTemplate
 * @property {string} id
 * @property {string} name
 * @property {string} untertitel
 * @property {number} difficulty
 * @property {string[]} roles
 * @property {string} moiId
 * @property {{lage: string, auftrag: string, patient: string}} briefing
 * @property {{forced: string[], randomCount: number}} injuries
 * @property {CasePhase[]} phases
 * @property {number} maxDurationSec
 * @property {string[]} learningObjectives
 */

/**
 * @typedef {Object} StateInstance   Laufzeitzustand eines Hidden State
 * @property {string} stateId
 * @property {number} severity       aktuell (0 = inaktiv)
 * @property {boolean} controlled    durch Maßnahme kontrolliert
 * @property {boolean} removed
 * @property {number} onsetSec
 * @property {number} maxSeverityReached
 * @property {number|null} visibleAtSec    erster freigeschalteter Befund dieses Zustands
 * @property {number|null} controlledAtSec
 * @property {{actionId: string, atSec: number}[]} treatedBy
 */

/**
 * @typedef {Object} LogEntry
 * @property {number} atSec
 * @property {"action"|"phase"|"system"|"warn"} kind
 * @property {string} text
 * @property {string} [actionId]
 * @property {string} [quality]
 * @property {string} [feedback]   nur im Trainingsmodus anzeigen
 */

/**
 * @typedef {Object} DebriefingEvent
 * @property {"good"|"partial"|"missed"|"critical"|"info"} kind
 * @property {string} text
 * @property {number} [atSec]
 * @property {number} [points]
 * @property {number} [maxPoints]
 */

/**
 * @typedef {Object} ScenarioInstance  Interner Zustand – NIE direkt an die UI geben (getView benutzen)
 * @property {string} caseId
 * @property {string} roleId
 * @property {"training"|"simulation"} mode
 * @property {number} seed
 * @property {number} timeSec
 * @property {number} phaseIndex
 * @property {{phase: string, atSec: number}[]} phaseHistory
 * @property {string[]} injuries
 * @property {{stateId: string, severity: number, atSec: number, visibleImmediately?: boolean}[]} pendingStates
 * @property {Object<string, StateInstance>} states
 * @property {string[]} tags
 * @property {Object<string, {firstAtSec: number, lastAtSec: number}>} revealed
 * @property {Object<string, {value: number|string, atSec: number}>} measured
 * @property {LogEntry[]} log
 * @property {{atSec: number, actionId: string, stateId: string}[]} orderViolations
 * @property {{atSec: number, actionId: string, phase: string}[]} phaseViolationsLog
 * @property {{atSec: number, actionId: string}[]} unnecessaryLog
 * @property {boolean} ended
 * @property {string|null} endReason  "handover" | "death" | "timeout"
 * @property {number|null} endedAtSec
 */

export {};
