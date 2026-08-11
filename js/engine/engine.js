// Generische Simulations-Engine.
// Arbeitet ausschließlich auf dem Content (Konfiguration) und dem ScenarioInstance –
// keinerlei fallspezifische Logik, kein DOM-Zugriff. Läuft identisch im Browser und in Node-Tests.
//
// Wichtigste Invariante: Der verdeckte Patientenzustand (scenario.states) verlässt
// die Engine nur gefiltert über getView(). Die UI erhält nie Hidden States.

import { createRng, weightedPick } from "./rng.js";
import { computeVitals, measureVital } from "./vitals.js";

const TICK_SEC = 5; // Integrationsschritt der Progressionslogik
const CATEGORY_PRIORITY = { M: 1, A: 2, R: 3, C: 4, H: 5 }; // S/Taktik: keine

// ---------------------------------------------------------------------------
// Fallinitialisierung
// ---------------------------------------------------------------------------

/**
 * Erzeugt aus einem Fall-Template eine konkrete ScenarioInstance.
 * @param {{content: Object, caseId: string, roleId: string, mode: "training"|"simulation", seed: number}} opts
 */
export function createScenario({ content, caseId, roleId, mode, seed }) {
  const tpl = content.caseTemplates.get(caseId);
  if (!tpl) throw new Error(`Unbekannter Fall: ${caseId}`);
  if (!content.roles.get(roleId)) throw new Error(`Unbekannte Rolle: ${roleId}`);
  const rng = createRng(seed);

  const injuries = selectInjuries(content, tpl, rng);

  /** @type {import("./types.js").ScenarioInstance} */
  const scenario = {
    caseId,
    roleId,
    mode,
    seed,
    timeSec: 0,
    phaseIndex: 0,
    phaseHistory: [{ phase: tpl.phases[0].phase, atSec: 0 }],
    injuries,
    pendingStates: [],
    states: {},
    tags: [],
    revealed: {},
    measured: {},
    log: [],
    orderViolations: [],
    phaseViolationsLog: [],
    unnecessaryLog: [],
    ended: false,
    endReason: null,
    endedAtSec: null,
    firedTriggers: []
  };

  for (const injuryId of injuries) {
    const injury = content.injuries.get(injuryId);
    for (const ref of injury.states) {
      if (ref.delaySec) {
        scenario.pendingStates.push({
          stateId: ref.stateId,
          severity: ref.severity,
          atSec: ref.delaySec,
          visibleImmediately: !!ref.visibleImmediately
        });
      } else {
        ensureState(scenario, content, ref.stateId, ref.severity, 0, !!ref.visibleImmediately);
      }
    }
    for (const findingId of injury.immediateFindings) {
      revealFinding(scenario, content, findingId);
    }
  }
  applyAutoReveals(scenario, content);
  pushLog(scenario, "system", `Fall gestartet – Phase ${currentPhase(scenario, content)}.`);
  return scenario;
}

/** MOI-basierte Verletzungsauswahl: erzwungene + gewichtete Zufallsauswahl (max. eine je group). */
function selectInjuries(content, tpl, rng) {
  const moi = content.mois.get(tpl.moiId);
  const chosen = [...(tpl.injuries?.forced || [])];
  const usedGroups = new Set(
    chosen
      .map((id) => moi.pool.find((p) => p.injuryId === id)?.group)
      .filter(Boolean)
  );
  let candidates = moi.pool.filter((p) => !chosen.includes(p.injuryId));
  for (let i = 0; i < (tpl.injuries?.randomCount || 0) && candidates.length > 0; i++) {
    const pick = weightedPick(candidates, rng);
    chosen.push(pick.injuryId);
    if (pick.group) usedGroups.add(pick.group);
    candidates = candidates.filter(
      (p) => p.injuryId !== pick.injuryId && (!p.group || !usedGroups.has(p.group))
    );
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// Zustands- und Befundverwaltung (intern)
// ---------------------------------------------------------------------------

function ensureState(scenario, content, stateId, severity, atSec, visibleImmediately = false) {
  const def = content.hiddenStates.get(stateId);
  let st = scenario.states[stateId];
  if (!st) {
    st = {
      stateId,
      severity: 0,
      controlled: false,
      removed: false,
      onsetSec: atSec,
      maxSeverityReached: 0,
      visibleAtSec: null,
      controlledAtSec: null,
      treatedBy: []
    };
    scenario.states[stateId] = st;
  }
  st.removed = false;
  st.severity = Math.min(def.maxSeverity, Math.max(st.severity, severity));
  st.maxSeverityReached = Math.max(st.maxSeverityReached, st.severity);
  if (visibleImmediately && st.visibleAtSec === null) st.visibleAtSec = atSec;
  return st;
}

function revealFinding(scenario, content, findingId) {
  const now = scenario.timeSec;
  const rec = scenario.revealed[findingId];
  if (rec) {
    rec.lastAtSec = now;
  } else {
    scenario.revealed[findingId] = { firstAtSec: now, lastAtSec: now };
  }
  // Zustände, die diesen Befund erzeugen, gelten ab jetzt als "erkennbar geworden"
  for (const st of Object.values(scenario.states)) {
    if (st.severity <= 0 || st.visibleAtSec !== null) continue;
    const def = content.hiddenStates.get(st.stateId);
    if ((def.findings || []).some((f) => f.findingId === findingId && st.severity >= f.minSeverity)) {
      st.visibleAtSec = now;
    }
  }
}

/** Alle Befund-IDs, die aktuell aktiv sind (durch Zustände oder Verletzungen erzeugt). */
export function getActiveFindingIds(scenario, content) {
  const active = new Set();
  for (const injuryId of scenario.injuries) {
    for (const f of content.injuries.get(injuryId).immediateFindings) active.add(f);
  }
  for (const st of Object.values(scenario.states)) {
    if (st.severity <= 0) continue;
    const def = content.hiddenStates.get(st.stateId);
    for (const f of def.findings || []) {
      if (st.severity >= f.minSeverity) active.add(f.findingId);
    }
  }
  return active;
}

function applyAutoReveals(scenario, content) {
  for (const findingId of getActiveFindingIds(scenario, content)) {
    const def = content.findings.get(findingId);
    if (def?.autoReveal && !scenario.revealed[findingId]) {
      revealFinding(scenario, content, findingId);
      pushLog(scenario, "warn", `Neu erkennbar: ${def.text}`);
    }
  }
}

function pushLog(scenario, kind, text, extra = {}) {
  scenario.log.push({ atSec: scenario.timeSec, kind, text, ...extra });
}

function currentPhase(scenario, content) {
  const tpl = content.caseTemplates.get(scenario.caseId);
  return tpl.phases[scenario.phaseIndex].phase;
}

function advancePhase(scenario, content) {
  const tpl = content.caseTemplates.get(scenario.caseId);
  if (scenario.phaseIndex >= tpl.phases.length - 1) return;
  scenario.phaseIndex++;
  const phase = tpl.phases[scenario.phaseIndex].phase;
  scenario.phaseHistory.push({ phase, atSec: scenario.timeSec });
  pushLog(scenario, "phase", `Phasenwechsel: ${phase}.`);
}

// ---------------------------------------------------------------------------
// Zeit- und Progressionslogik
// ---------------------------------------------------------------------------

/** Lässt die Simulationszeit (und alle Progressionen) um `seconds` weiterlaufen. */
export function advanceTime(scenario, content, seconds) {
  const tpl = content.caseTemplates.get(scenario.caseId);
  let remaining = seconds;
  while (remaining > 0 && !scenario.ended) {
    const step = Math.min(TICK_SEC, remaining);
    remaining -= step;
    scenario.timeSec += step;

    // verzögerte Zustände aktivieren
    for (const p of scenario.pendingStates) {
      if (!p.applied && scenario.timeSec >= p.atSec) {
        p.applied = true;
        ensureState(scenario, content, p.stateId, p.severity, scenario.timeSec, p.visibleImmediately);
      }
    }

    // Progressionsregeln anwenden
    for (const rule of content.progressionRules) {
      const src = scenario.states[rule.source.stateId];
      if (!src || src.severity < rule.source.minSeverity) continue;
      if (rule.source.requireUncontrolled && src.controlled) continue;
      if (rule.source.requireControlled && !src.controlled) continue;
      if (
        (rule.unless || []).some((u) => {
          const st = scenario.states[u.stateId];
          if (!st || st.severity <= 0) return false;
          return u.uncontrolled === undefined || st.controlled === !u.uncontrolled;
        })
      )
        continue;
      const target = ensureState(scenario, content, rule.target, 0, scenario.timeSec);
      const wasInactive = target.severity <= 0;
      const def = content.hiddenStates.get(rule.target);
      target.severity = Math.min(
        def.maxSeverity,
        Math.max(0, target.severity + rule.deltaPerMin * (step / 60))
      );
      target.maxSeverityReached = Math.max(target.maxSeverityReached, target.severity);
      if (wasInactive && target.severity > 0) target.onsetSec = scenario.timeSec;
    }

    // Trigger (z. B. Schweregrad 10 → Kreislaufstillstand)
    for (const st of Object.values(scenario.states)) {
      if (st.severity <= 0) continue;
      const def = content.hiddenStates.get(st.stateId);
      for (const trig of def.triggers || []) {
        const key = `${st.stateId}:${trig.atSeverity}:${trig.addStateId}`;
        if (st.severity >= trig.atSeverity && !scenario.firedTriggers.includes(key)) {
          scenario.firedTriggers.push(key);
          ensureState(scenario, content, trig.addStateId, trig.severity, scenario.timeSec, true);
        }
      }
    }

    applyAutoReveals(scenario, content);

    // Phasenwechsel nach Zeit
    const phaseDef = tpl.phases[scenario.phaseIndex];
    if (phaseDef.advanceAfterSec !== undefined && scenario.timeSec >= phaseDef.advanceAfterSec) {
      advancePhase(scenario, content);
    }

    // Terminaler Zustand → Tod
    const dead = Object.values(scenario.states).some(
      (s) => s.severity > 0 && content.hiddenStates.get(s.stateId)?.terminal
    );
    if (dead) {
      endScenario(scenario, content, "death");
      return;
    }

    // Fallende nach Maximaldauer (Übergabe an MEDEVAC)
    if (scenario.timeSec >= tpl.maxDurationSec) {
      endScenario(scenario, content, "timeout");
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Aktionslogik
// ---------------------------------------------------------------------------

/**
 * Führt eine Aktion aus. Zeitkosten laufen VOR der Wirkung ab
 * (die Blutung läuft weiter, während das Tourniquet angelegt wird).
 * @returns {{ok: boolean, error?: string, feedback?: string, quality?: string}}
 */
export function performAction(scenario, content, actionId) {
  if (scenario.ended) return { ok: false, error: "Der Fall ist bereits beendet." };
  const action = content.actions.get(actionId);
  if (!action) return { ok: false, error: `Unbekannte Aktion: ${actionId}` };
  if (!action.roles.includes(scenario.roleId)) {
    return { ok: false, error: "Diese Maßnahme ist für Ihre Rolle nicht freigegeben." };
  }
  if (!action.repeatable && scenario.log.some((l) => l.kind === "action" && l.actionId === actionId)) {
    return { ok: false, error: "Diese Maßnahme wurde bereits durchgeführt." };
  }

  // Phasendisziplin: Ausführung ist möglich, wird aber protokolliert und bewertet.
  const phaseBefore = currentPhase(scenario, content);
  const phaseViolation = action.phases.length > 0 && !action.phases.includes(phaseBefore);
  if (phaseViolation) {
    scenario.phaseViolationsLog.push({ atSec: scenario.timeSec, actionId, phase: phaseBefore });
  }

  advanceTime(scenario, content, action.timeCostSec);
  if (scenario.ended && scenario.endReason === "death") {
    pushLog(scenario, "action", action.name, { actionId, quality: "neutral" });
    return { ok: true, feedback: "Während der Maßnahme sind die Lebenszeichen erloschen.", quality: "neutral" };
  }

  let feedback = "";
  let quality = "neutral";

  if (action.kind === "assessment") {
    ({ feedback } = runAssessment(scenario, content, action));
    quality = "assessment";
  } else {
    ({ feedback, quality } = runTreatment(scenario, content, action));
  }

  pushLog(scenario, "action", action.name, {
    actionId,
    quality,
    feedback,
    phaseViolation: phaseViolation || undefined
  });

  // Phasenwechsel durch Aktion (z. B. "in Deckung verbringen" beendet CUF)
  const tpl = content.caseTemplates.get(scenario.caseId);
  if (!scenario.ended && tpl.phases[scenario.phaseIndex].advanceOnAction === actionId) {
    advancePhase(scenario, content);
  }

  return { ok: true, feedback, quality, phaseViolation };
}

function runAssessment(scenario, content, action) {
  const found = [];
  const activeIds = getActiveFindingIds(scenario, content);
  for (const findingId of activeIds) {
    const def = content.findings.get(findingId);
    if (action.assessment.revealCategories.includes(def.category)) {
      const wasNew = !scenario.revealed[findingId];
      revealFinding(scenario, content, findingId);
      if (wasNew) found.push(def.text);
    }
  }
  const measuredTexts = [];
  for (const param of action.assessment.measureVitals) {
    const value = measureVital(scenario, content, param);
    scenario.measured[param] = { value, atSec: scenario.timeSec };
    measuredTexts.push(formatVital(param, value));
  }
  const parts = [];
  if (action.assessment.staticFeedback) parts.push(action.assessment.staticFeedback);
  if (measuredTexts.length) parts.push(measuredTexts.join(", "));
  if (found.length) parts.push(`Neue Befunde: ${found.join("; ")}`);
  if (!parts.length) parts.push("Keine neuen Auffälligkeiten.");
  return { feedback: parts.join(" – ") };
}

function runTreatment(scenario, content, action) {
  // if/elif/else: erster zutreffender Zweig gewinnt
  let branch = null;
  for (const b of action.treatment.effects) {
    if (b.if === null) {
      branch = branch ?? b;
      continue;
    }
    const st = scenario.states[b.if.stateActive];
    const matches =
      st && st.severity > 0 && !st.removed && st.severity >= (b.if.minSeverity ?? 1) &&
      (b.if.allowControlled || !st.controlled);
    if (matches) {
      branch = b;
      break;
    }
  }
  // Fallback: kontrollierte Zustände erfüllen die Bedingung nicht mehr → else-Zweig
  if (!branch) branch = action.treatment.effects.find((b) => b.if === null) || { apply: [], feedback: "", quality: "neutral" };

  const treatedStates = [];
  for (const eff of branch.apply || []) {
    applyEffect(scenario, content, eff, action, treatedStates);
  }

  if (branch.quality === "unnecessary") {
    scenario.unnecessaryLog.push({ atSec: scenario.timeSec, actionId: action.id });
  }

  // MARCH-Prioritätsprüfung: Gab es zum Zeitpunkt der Maßnahme ein ERKANNTES,
  // unversorgtes Problem höherer Priorität, das diese Maßnahme nicht behandelt?
  const prio = CATEGORY_PRIORITY[action.category];
  if (prio !== undefined && action.kind === "treatment") {
    let worst = null;
    for (const st of Object.values(scenario.states)) {
      if (st.severity <= 0 || st.controlled || st.visibleAtSec === null) continue;
      if (treatedStates.includes(st.stateId)) continue;
      const def = content.hiddenStates.get(st.stateId);
      if (def.priority !== null && def.priority !== undefined && def.priority < prio) {
        if (!worst || def.priority < content.hiddenStates.get(worst).priority) worst = st.stateId;
      }
    }
    if (worst) {
      scenario.orderViolations.push({ atSec: scenario.timeSec, actionId: action.id, stateId: worst });
    }
  }

  return { feedback: branch.feedback || "Maßnahme durchgeführt.", quality: branch.quality || "neutral" };
}

function applyEffect(scenario, content, eff, action, treatedStates) {
  const now = scenario.timeSec;
  switch (eff.op) {
    case "controlState": {
      const st = scenario.states[eff.stateId];
      if (st && st.severity > 0) {
        st.controlled = true;
        st.controlledAtSec = st.controlledAtSec ?? now;
        st.treatedBy.push({ actionId: action.id, atSec: now });
        treatedStates.push(eff.stateId);
      }
      break;
    }
    case "modifySeverity": {
      const st = scenario.states[eff.stateId];
      if (st) {
        const def = content.hiddenStates.get(eff.stateId);
        st.severity = Math.min(def.maxSeverity, Math.max(0, st.severity + eff.delta));
        st.maxSeverityReached = Math.max(st.maxSeverityReached, st.severity);
        if (eff.delta < 0) {
          st.treatedBy.push({ actionId: action.id, atSec: now });
          treatedStates.push(eff.stateId);
        }
      }
      break;
    }
    case "removeState": {
      const st = scenario.states[eff.stateId];
      if (st && st.severity > 0) {
        st.severity = 0;
        st.removed = true;
        st.treatedBy.push({ actionId: action.id, atSec: now });
        treatedStates.push(eff.stateId);
      }
      break;
    }
    case "addState":
      ensureState(scenario, content, eff.stateId, eff.severity, now);
      break;
    case "addTag":
      if (!scenario.tags.includes(eff.tag)) scenario.tags.push(eff.tag);
      break;
  }
}

/** Abwarten/Beobachten – Zeit vergeht ohne Maßnahme. */
export function wait(scenario, content, seconds = 30) {
  if (scenario.ended) return { ok: false, error: "Der Fall ist bereits beendet." };
  advanceTime(scenario, content, seconds);
  pushLog(scenario, "action", `Abwarten (${seconds} s)`, { actionId: "__wait", quality: "neutral" });
  return { ok: true };
}

export function endScenario(scenario, content, reason) {
  if (scenario.ended) return;
  scenario.ended = true;
  scenario.endReason = reason;
  scenario.endedAtSec = scenario.timeSec;
  const text =
    reason === "death"
      ? "Der Patient ist verstorben."
      : reason === "timeout"
        ? "Übergabe an MEDEVAC – die Maximaldauer des Falls ist erreicht."
        : "Fall abgeschlossen – Patient übergeben.";
  pushLog(scenario, "system", text);
  if (reason === "death") applyAutoReveals(scenario, content);
}

// ---------------------------------------------------------------------------
// View: Das Einzige, was die UI sehen darf
// ---------------------------------------------------------------------------

function formatVital(param, value) {
  const labels = { hr: "HF", rr: "AF", sbp: "RRsys", spo2: "SpO₂", avpu: "AVPU" };
  const units = { hr: "/min", rr: "/min", sbp: " mmHg", spo2: " %", avpu: "" };
  return `${labels[param]} ${value}${units[param]}`;
}

/**
 * Gefilterte Sicht für die UI: nur freigeschaltete Befunde, gemessene Vitalwerte,
 * Rollen-/Phasen-Status der Aktionen, Protokoll. KEINE Hidden States, keine Schweregrade.
 */
export function getView(scenario, content) {
  const tpl = content.caseTemplates.get(scenario.caseId);
  const activeIds = getActiveFindingIds(scenario, content);

  const findings = Object.entries(scenario.revealed)
    .map(([id, rec]) => {
      const def = content.findings.get(id);
      return {
        id,
        text: def.text,
        category: def.category,
        firstAtSec: rec.firstAtSec,
        lastAtSec: rec.lastAtSec,
        stillActive: activeIds.has(id)
      };
    })
    .sort((a, b) => a.firstAtSec - b.firstAtSec);

  const phase = currentPhase(scenario, content);
  const actions = [...content.actions.values()]
    .filter((a) => a.roles.includes(scenario.roleId))
    .map((a) => {
      const done = scenario.log.some((l) => l.kind === "action" && l.actionId === a.id);
      return {
        id: a.id,
        kind: a.kind,
        name: a.name,
        beschreibung: a.beschreibung,
        category: a.category,
        timeCostSec: a.timeCostSec,
        repeatable: a.repeatable,
        done,
        disabled: (!a.repeatable && done) || scenario.ended,
        phaseWarning: a.phases.length > 0 && !a.phases.includes(phase)
      };
    });

  const log = scenario.log.map((l) => ({
    atSec: l.atSec,
    kind: l.kind,
    text: l.text,
    actionId: l.actionId,
    quality: scenario.mode === "training" ? l.quality : undefined,
    feedback: scenario.mode === "training" ? l.feedback : undefined
  }));

  return {
    caseId: scenario.caseId,
    caseName: tpl.name,
    roleId: scenario.roleId,
    mode: scenario.mode,
    seed: scenario.seed,
    timeSec: scenario.timeSec,
    phase,
    maxDurationSec: tpl.maxDurationSec,
    ended: scenario.ended,
    endReason: scenario.endReason,
    findings,
    measured: { ...scenario.measured },
    actions,
    log
  };
}

export { currentPhase, formatVital };
