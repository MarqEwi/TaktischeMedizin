// Bewertungs- und Debriefing-Engine.
// Reine Funktion über (ScenarioInstance, Content): wertet Priorisierung, Reihenfolge,
// Timing, Vollständigkeit, Reassessment und taktische Disziplin regelbasiert aus.

const GRUPPEN_LABELS = {
  massnahmen: "Maßnahmen & Timing",
  prioritaet: "Priorisierung (MARCH)",
  reassessment: "Reassessment",
  taktik: "Taktik & Phasen",
  sorgfalt: "Sorgfalt"
};

const fmtTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

/**
 * Wertet ein (beendetes) Szenario aus.
 * @returns Debriefing-Report mit Outcome, Punkten je Regel/Gruppe und Ereignisliste.
 */
export function evaluate(scenario, content) {
  const results = []; // je Regel: {rule, earned, max, events: DebriefingEvent[]}

  for (const rule of content.scoringRules) {
    if (rule.roles && rule.roles.length > 0 && !rule.roles.includes(scenario.roleId)) continue;
    const r = evaluateRule(scenario, content, rule);
    if (r) results.push(r);
  }

  const earned = results.reduce((s, r) => s + r.earned, 0);
  const max = results.reduce((s, r) => s + r.max, 0);
  const percent = max > 0 ? Math.round((earned / max) * 100) : 0;

  const allEvents = results.flatMap((r) => r.events);
  const criticalErrors = allEvents.filter((e) => e.kind === "critical");
  const outcome = computeOutcome(scenario, content);
  if (outcome.status === "verstorben") {
    criticalErrors.push({ kind: "critical", text: "Der Patient ist verstorben.", atSec: scenario.endedAtSec });
  }

  let grade;
  if (criticalErrors.length > 0) grade = "Nicht bestanden (kritischer Fehler)";
  else if (percent >= 90) grade = "Sehr gut";
  else if (percent >= 75) grade = "Gut";
  else if (percent >= 60) grade = "Befriedigend";
  else if (percent >= 45) grade = "Ausreichend";
  else grade = "Nicht bestanden";

  const gruppen = {};
  for (const r of results) {
    const g = r.rule.gruppe;
    gruppen[g] = gruppen[g] || { key: g, label: GRUPPEN_LABELS[g] || g, earned: 0, max: 0 };
    gruppen[g].earned += r.earned;
    gruppen[g].max += r.max;
  }

  return {
    outcome,
    score: { earned, max, percent, grade },
    gruppen: Object.values(gruppen),
    rules: results.map((r) => ({
      id: r.rule.id,
      label: r.rule.label,
      gruppe: r.rule.gruppe,
      earned: r.earned,
      max: r.max,
      events: r.events
    })),
    criticalErrors,
    missed: allEvents.filter((e) => e.kind === "missed"),
    good: allEvents.filter((e) => e.kind === "good"),
    partial: allEvents.filter((e) => e.kind === "partial"),
    durationSec: scenario.endedAtSec ?? scenario.timeSec,
    seed: scenario.seed
  };
}

function evaluateRule(scenario, content, rule) {
  switch (rule.type) {
    case "requiredTreatment":
      return evalRequiredTreatment(scenario, content, rule);
    case "requiredAction":
      return evalRequiredAction(scenario, content, rule);
    case "orderPriority":
      return evalOrder(scenario, content, rule);
    case "reassessment":
      return evalReassessment(scenario, content, rule);
    case "phaseViolation":
      return evalPhaseViolations(scenario, content, rule);
    case "unnecessaryTreatment":
      return evalUnnecessary(scenario, content, rule);
    default:
      return null;
  }
}

function evalRequiredTreatment(scenario, content, rule) {
  const st = scenario.states[rule.stateId];
  // Regel greift nur, wenn der Zustand im Fall überhaupt relevant wurde
  if (!st || st.maxSeverityReached < rule.minSeverity) return null;

  const stateDef = content.hiddenStates.get(rule.stateId);
  const optionIds = rule.options.map((o) => o.actionId);
  const treat = st.treatedBy
    .filter((t) => optionIds.includes(t.actionId))
    .sort((a, b) => a.atSec - b.atSec)[0];

  if (!treat) {
    return {
      rule,
      earned: 0,
      max: rule.points,
      events: [
        {
          kind: rule.critical ? "critical" : "missed",
          text: rule.missText || `${stateDef.name} wurde nicht behandelt.`,
          maxPoints: rule.points
        }
      ]
    };
  }

  const option = rule.options.find((o) => o.actionId === treat.actionId);
  const basisSec = rule.basis === "revealed" ? (st.visibleAtSec ?? st.onsetSec) : st.onsetSec;
  const elapsed = Math.max(0, treat.atSec - basisSec);
  const timingFactor = elapsed <= rule.fullWithinSec ? 1 : elapsed <= rule.partialWithinSec ? 0.6 : 0.3;
  const earned = Math.round(rule.points * option.factor * timingFactor);

  const actionName = content.actions.get(treat.actionId).name;
  let kind = "good";
  let text = `${rule.label}: ${actionName} nach ${fmtTime(elapsed)} – korrekt und rechtzeitig.`;
  if (timingFactor < 1 && option.factor === 1) {
    kind = "partial";
    text = `${rule.label}: ${actionName} erst nach ${fmtTime(elapsed)} – richtige Maßnahme, aber zu spät (Zeitverlust).`;
  } else if (option.factor < 1) {
    kind = "partial";
    text = `${rule.label}: ${actionName} nach ${fmtTime(elapsed)} – wirksam, aber nicht die Maßnahme der ersten Wahl.`;
  }
  return { rule, earned, max: rule.points, events: [{ kind, text, atSec: treat.atSec, points: earned, maxPoints: rule.points }] };
}

function conditionApplies(scenario, cond) {
  if (!cond || cond.always) return true;
  if (cond.stateEver) {
    const st = scenario.states[cond.stateEver];
    return !!st && st.maxSeverityReached >= (cond.minSeverity ?? 1);
  }
  if (cond.phaseOccurred) {
    return scenario.phaseHistory.some((p) => p.phase === cond.phaseOccurred);
  }
  if (cond.tagSet) {
    return scenario.tags.includes(cond.tagSet);
  }
  return false;
}

function evalRequiredAction(scenario, content, rule) {
  if (!conditionApplies(scenario, rule.condition)) return null;
  const entry = scenario.log.find((l) => l.kind === "action" && l.actionId === rule.actionId);
  const actionName = content.actions.get(rule.actionId).name;
  if (entry) {
    return {
      rule,
      earned: rule.points,
      max: rule.points,
      events: [
        { kind: "good", text: `${rule.label}: ${actionName} durchgeführt.`, atSec: entry.atSec, points: rule.points, maxPoints: rule.points }
      ]
    };
  }
  return {
    rule,
    earned: 0,
    max: rule.points,
    events: [{ kind: rule.critical ? "critical" : "missed", text: rule.missText || `${actionName} wurde nicht durchgeführt.`, maxPoints: rule.points }]
  };
}

function evalOrder(scenario, content, rule) {
  const events = scenario.orderViolations.map((v) => {
    const action = content.actions.get(v.actionId);
    const state = content.hiddenStates.get(v.stateId);
    return {
      kind: "missed",
      text: `Priorisierungsfehler bei ${fmtTime(v.atSec)}: „${action.name}“, während „${state.name}“ erkannt und unversorgt war.`,
      atSec: v.atSec
    };
  });
  const earned = Math.max(0, rule.pointsPool - rule.penaltyPerViolation * events.length);
  if (events.length === 0) {
    events.push({ kind: "good", text: "MARCH-Priorisierung durchgehend eingehalten.", points: rule.pointsPool, maxPoints: rule.pointsPool });
  }
  return { rule, earned, max: rule.pointsPool, events };
}

function evalReassessment(scenario, content, rule) {
  const isAssessment = (actionId) => content.actions.get(actionId)?.kind === "assessment";
  const actionEntries = scenario.log.filter((l) => l.kind === "action" && l.actionId && l.actionId !== "__wait");
  const firstTreatment = actionEntries.find((l) => !isAssessment(l.actionId));
  if (!firstTreatment) return { rule, earned: rule.pointsPool, max: rule.pointsPool, events: [] };

  const end = scenario.endedAtSec ?? scenario.timeSec;
  const checkpoints = [
    firstTreatment.atSec,
    ...actionEntries.filter((l) => isAssessment(l.actionId) && l.atSec > firstTreatment.atSec).map((l) => l.atSec),
    end
  ].sort((a, b) => a - b);

  let misses = 0;
  const events = [];
  for (let i = 1; i < checkpoints.length; i++) {
    const gap = checkpoints[i] - checkpoints[i - 1];
    if (gap > rule.everySec) {
      misses++;
      events.push({
        kind: "missed",
        text: `${rule.missText} (${fmtTime(checkpoints[i - 1])} bis ${fmtTime(checkpoints[i])}, ${Math.round(gap / 60)} min ohne Kontrolle)`,
        atSec: checkpoints[i]
      });
    }
  }
  const earned = Math.max(0, rule.pointsPool - rule.penaltyPerMiss * misses);
  if (misses === 0) {
    events.push({ kind: "good", text: "Regelmäßiges Reassessment durchgeführt.", points: rule.pointsPool, maxPoints: rule.pointsPool });
  }
  return { rule, earned, max: rule.pointsPool, events };
}

function evalPhaseViolations(scenario, content, rule) {
  const events = scenario.phaseViolationsLog.map((v) => ({
    kind: "missed",
    text: `${rule.violationText} („${content.actions.get(v.actionId).name}“ in Phase ${v.phase}, ${fmtTime(v.atSec)})`,
    atSec: v.atSec
  }));
  const earned = Math.max(0, rule.pointsPool - rule.penaltyPerViolation * events.length);
  if (events.length === 0) {
    events.push({ kind: "good", text: "Taktische Phasen eingehalten.", points: rule.pointsPool, maxPoints: rule.pointsPool });
  }
  return { rule, earned, max: rule.pointsPool, events };
}

function evalUnnecessary(scenario, content, rule) {
  const events = scenario.unnecessaryLog.map((v) => ({
    kind: "missed",
    text: `${rule.violationText} („${content.actions.get(v.actionId).name}“, ${fmtTime(v.atSec)})`,
    atSec: v.atSec
  }));
  const earned = Math.max(0, rule.pointsPool - rule.penaltyPerAction * events.length);
  if (events.length === 0) {
    events.push({ kind: "good", text: "Keine unnötigen Maßnahmen.", points: rule.pointsPool, maxPoints: rule.pointsPool });
  }
  return { rule, earned, max: rule.pointsPool, events };
}

function computeOutcome(scenario, content) {
  const dead = Object.values(scenario.states).some(
    (s) => s.severity > 0 && content.hiddenStates.get(s.stateId)?.terminal
  );
  if (dead) {
    return { status: "verstorben", text: "Der Patient hat die Versorgung nicht überlebt." };
  }
  let worst = 0;
  const offen = [];
  for (const st of Object.values(scenario.states)) {
    if (st.severity <= 0) continue;
    const def = content.hiddenStates.get(st.stateId);
    if (def.priority === null || def.priority === undefined) continue; // Schmerz u. Ä. zählen nicht
    worst = Math.max(worst, st.severity);
    if (!st.controlled && st.severity >= 3) offen.push(def.name);
  }
  if (worst >= 8) {
    return { status: "kritisch", text: `Der Patient ist bei Übergabe kritisch instabil.${offen.length ? " Unversorgt: " + offen.join(", ") + "." : ""}` };
  }
  if (worst >= 4) {
    return { status: "instabil", text: `Der Patient ist bei Übergabe instabil.${offen.length ? " Unversorgt: " + offen.join(", ") + "." : ""}` };
  }
  return { status: "stabilisiert", text: "Der Patient ist bei Übergabe stabilisiert." };
}

export { fmtTime };
