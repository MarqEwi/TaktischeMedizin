// Validierung der Konfigurationsdateien.
// Prüft Pflichtfelder und alle ID-Relationen (Vorstufe des späteren Admin-Editors:
// dieselben Prüfungen laufen dann hinter den Editor-Formularen).

/**
 * @param {Object} raw  rohe Content-Objekte (siehe content.js buildContent)
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateContent(raw) {
  const errors = [];
  const warnings = [];
  const err = (msg) => errors.push(msg);
  const warn = (msg) => warnings.push(msg);

  const ids = (arr) => new Set((arr || []).map((x) => x.id));
  const roleIds = ids(raw.roles);
  const moiIds = ids(raw.mois);
  const injuryIds = ids(raw.injuries);
  const stateIds = ids(raw.hiddenStates);
  const findingIds = ids(raw.findings);
  const actionIds = ids(raw.actions);

  const requireFields = (item, fields, where) => {
    for (const f of fields) {
      if (item[f] === undefined || item[f] === null || item[f] === "") {
        err(`${where} "${item.id ?? "?"}": Pflichtfeld "${f}" fehlt.`);
      }
    }
  };
  const checkUnique = (arr, where) => {
    const seen = new Set();
    for (const item of arr || []) {
      if (seen.has(item.id)) err(`${where}: doppelte ID "${item.id}".`);
      seen.add(item.id);
    }
  };

  checkUnique(raw.roles, "roles");
  checkUnique(raw.mois, "mois");
  checkUnique(raw.injuries, "injuries");
  checkUnique(raw.hiddenStates, "hidden-states");
  checkUnique(raw.findings, "findings");
  checkUnique(raw.actions, "actions");
  checkUnique(raw.progressionRules, "progression-rules");
  checkUnique(raw.scoringRules, "scoring-rules");
  checkUnique(raw.caseTemplates, "case-templates");

  for (const r of raw.roles || []) {
    requireFields(r, ["id", "name", "kurz", "beschreibung"], "Rolle");
    if (typeof r.playable !== "boolean") err(`Rolle "${r.id}": "playable" (boolean) fehlt.`);
  }

  for (const m of raw.mois || []) {
    requireFields(m, ["id", "name", "beschreibung"], "MOI");
    if (!Array.isArray(m.pool) || m.pool.length === 0) err(`MOI "${m.id}": leerer Verletzungs-Pool.`);
    for (const p of m.pool || []) {
      if (!injuryIds.has(p.injuryId)) err(`MOI "${m.id}": unbekannte Verletzung "${p.injuryId}".`);
      if (typeof p.weight !== "number" || p.weight <= 0) err(`MOI "${m.id}": Pool-Eintrag "${p.injuryId}" braucht weight > 0.`);
    }
  }

  for (const inj of raw.injuries || []) {
    requireFields(inj, ["id", "name", "bodyRegion", "beschreibung"], "Verletzung");
    if (!Array.isArray(inj.states) || inj.states.length === 0) err(`Verletzung "${inj.id}": keine Zustände definiert.`);
    for (const s of inj.states || []) {
      if (!stateIds.has(s.stateId)) err(`Verletzung "${inj.id}": unbekannter Zustand "${s.stateId}".`);
      if (typeof s.severity !== "number" || s.severity < 0 || s.severity > 10)
        err(`Verletzung "${inj.id}": Schweregrad für "${s.stateId}" muss 0–10 sein.`);
    }
    for (const f of inj.immediateFindings || []) {
      if (!findingIds.has(f)) err(`Verletzung "${inj.id}": unbekannter Befund "${f}".`);
    }
  }

  for (const st of raw.hiddenStates || []) {
    requireFields(st, ["id", "name", "beschreibung"], "Zustand");
    if (typeof st.maxSeverity !== "number") err(`Zustand "${st.id}": "maxSeverity" fehlt.`);
    for (const f of st.findings || []) {
      if (!findingIds.has(f.findingId)) err(`Zustand "${st.id}": unbekannter Befund "${f.findingId}".`);
      if (typeof f.minSeverity !== "number") err(`Zustand "${st.id}": Befund "${f.findingId}" braucht minSeverity.`);
    }
    for (const t of st.triggers || []) {
      if (!stateIds.has(t.addStateId)) err(`Zustand "${st.id}": Trigger auf unbekannten Zustand "${t.addStateId}".`);
    }
  }

  for (const f of raw.findings || []) {
    requireFields(f, ["id", "text", "category"], "Befund");
  }

  const validPhases = new Set(["CUF", "TFC", "TACEVAC"]);
  for (const a of raw.actions || []) {
    requireFields(a, ["id", "kind", "name", "beschreibung", "category"], "Aktion");
    if (!["assessment", "treatment", "tactic"].includes(a.kind)) err(`Aktion "${a.id}": ungültiger kind "${a.kind}".`);
    if (typeof a.timeCostSec !== "number" || a.timeCostSec < 0) err(`Aktion "${a.id}": "timeCostSec" fehlt oder ungültig.`);
    if (!Array.isArray(a.roles) || a.roles.length === 0) err(`Aktion "${a.id}": keine Rollenfreigabe.`);
    for (const r of a.roles || []) if (!roleIds.has(r)) err(`Aktion "${a.id}": unbekannte Rolle "${r}".`);
    for (const p of a.phases || []) if (!validPhases.has(p)) err(`Aktion "${a.id}": unbekannte Phase "${p}".`);
    if (a.kind === "assessment") {
      if (!a.assessment) err(`Aktion "${a.id}": assessment-Block fehlt.`);
    } else {
      if (!a.treatment || !Array.isArray(a.treatment.effects) || a.treatment.effects.length === 0)
        err(`Aktion "${a.id}": treatment.effects fehlt.`);
      for (const br of a.treatment?.effects || []) {
        if (br.if && !stateIds.has(br.if.stateActive)) err(`Aktion "${a.id}": Bedingung auf unbekannten Zustand "${br.if.stateActive}".`);
        if (!["correct", "partial", "unnecessary", "neutral"].includes(br.quality))
          err(`Aktion "${a.id}": ungültige quality "${br.quality}".`);
        for (const e of br.apply || []) {
          if (["controlState", "modifySeverity", "removeState", "addState"].includes(e.op) && !stateIds.has(e.stateId))
            err(`Aktion "${a.id}": Effekt auf unbekannten Zustand "${e.stateId}".`);
          if (e.op === "addTag" && !e.tag) err(`Aktion "${a.id}": addTag ohne tag.`);
        }
      }
      const hasElse = (a.treatment?.effects || []).some((b) => b.if === null);
      if (!hasElse) warn(`Aktion "${a.id}": kein else-Zweig (if: null) – ohne Treffer passiert nichts.`);
    }
  }

  for (const pr of raw.progressionRules || []) {
    requireFields(pr, ["id", "beschreibung", "target"], "Progressionsregel");
    if (!pr.source || !stateIds.has(pr.source.stateId)) err(`Progressionsregel "${pr.id}": unbekannte Quelle.`);
    if (!stateIds.has(pr.target)) err(`Progressionsregel "${pr.id}": unbekanntes Ziel "${pr.target}".`);
    if (typeof pr.deltaPerMin !== "number") err(`Progressionsregel "${pr.id}": "deltaPerMin" fehlt.`);
    for (const u of pr.unless || []) {
      if (!stateIds.has(u.stateId)) err(`Progressionsregel "${pr.id}": unless auf unbekannten Zustand "${u.stateId}".`);
    }
  }

  for (const sr of raw.scoringRules || []) {
    requireFields(sr, ["id", "type", "gruppe", "label"], "Bewertungsregel");
    for (const r of sr.roles || []) if (!roleIds.has(r)) err(`Bewertungsregel "${sr.id}": unbekannte Rolle "${r}".`);
    if (sr.type === "requiredTreatment") {
      if (!stateIds.has(sr.stateId)) err(`Bewertungsregel "${sr.id}": unbekannter Zustand "${sr.stateId}".`);
      if (!Array.isArray(sr.options) || sr.options.length === 0) err(`Bewertungsregel "${sr.id}": keine options.`);
      for (const o of sr.options || []) {
        if (!actionIds.has(o.actionId)) err(`Bewertungsregel "${sr.id}": unbekannte Aktion "${o.actionId}".`);
      }
      if (typeof sr.points !== "number") err(`Bewertungsregel "${sr.id}": "points" fehlt.`);
    } else if (sr.type === "requiredAction") {
      if (!actionIds.has(sr.actionId)) err(`Bewertungsregel "${sr.id}": unbekannte Aktion "${sr.actionId}".`);
      if (typeof sr.points !== "number") err(`Bewertungsregel "${sr.id}": "points" fehlt.`);
    } else if (["orderPriority", "reassessment", "phaseViolation", "unnecessaryTreatment"].includes(sr.type)) {
      if (typeof sr.pointsPool !== "number") err(`Bewertungsregel "${sr.id}": "pointsPool" fehlt.`);
    } else {
      err(`Bewertungsregel "${sr.id}": unbekannter type "${sr.type}".`);
    }
  }

  for (const c of raw.caseTemplates || []) {
    requireFields(c, ["id", "name", "moiId"], "Fall-Template");
    if (!moiIds.has(c.moiId)) err(`Fall "${c.id}": unbekanntes MOI "${c.moiId}".`);
    for (const r of c.roles || []) if (!roleIds.has(r)) err(`Fall "${c.id}": unbekannte Rolle "${r}".`);
    for (const f of c.injuries?.forced || []) {
      if (!injuryIds.has(f)) err(`Fall "${c.id}": unbekannte erzwungene Verletzung "${f}".`);
      const moi = (raw.mois || []).find((m) => m.id === c.moiId);
      if (moi && !moi.pool.some((p) => p.injuryId === f))
        warn(`Fall "${c.id}": erzwungene Verletzung "${f}" liegt nicht im MOI-Pool.`);
    }
    if (!Array.isArray(c.phases) || c.phases.length === 0) err(`Fall "${c.id}": keine Phasen definiert.`);
    for (const p of c.phases || []) if (!validPhases.has(p.phase)) err(`Fall "${c.id}": unbekannte Phase "${p.phase}".`);
    for (const p of c.phases || []) {
      if (p.advanceOnAction && !actionIds.has(p.advanceOnAction))
        err(`Fall "${c.id}": advanceOnAction verweist auf unbekannte Aktion "${p.advanceOnAction}".`);
    }
    if (typeof c.maxDurationSec !== "number" || c.maxDurationSec <= 0) err(`Fall "${c.id}": "maxDurationSec" fehlt.`);
  }

  return { errors, warnings };
}
