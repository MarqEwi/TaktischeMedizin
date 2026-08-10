// Content-Layer: lädt die Konfigurationsdateien und indexiert sie für die Engine.
// Läuft im Browser (fetch) und in Node-Tests (Objekte direkt übergeben).

export const CONTENT_FILES = [
  "roles",
  "mois",
  "injuries",
  "hidden-states",
  "findings",
  "actions",
  "progression-rules",
  "scoring-rules",
  "case-templates"
];

/**
 * Baut aus den rohen JSON-Objekten den indexierten Content für die Engine.
 * @param {Object} raw  {roles, mois, injuries, hiddenStates, findings, actions, progressionRules, scoringRules, caseTemplates}
 */
export function buildContent(raw) {
  const byId = (arr) => {
    const m = new Map();
    for (const item of arr) m.set(item.id, item);
    return m;
  };
  return {
    raw,
    roles: byId(raw.roles),
    mois: byId(raw.mois),
    injuries: byId(raw.injuries),
    hiddenStates: byId(raw.hiddenStates),
    findings: byId(raw.findings),
    actions: byId(raw.actions),
    caseTemplates: byId(raw.caseTemplates),
    progressionRules: raw.progressionRules,
    scoringRules: raw.scoringRules
  };
}

/** Lädt alle Content-Dateien per fetch (Browser). basePath ohne abschließenden Slash. */
export async function loadContent(basePath = "content") {
  const [roles, mois, injuries, hiddenStates, findings, actions, progressionRules, scoringRules, caseTemplates] =
    await Promise.all(
      CONTENT_FILES.map(async (name) => {
        const res = await fetch(`${basePath}/${name}.json`);
        if (!res.ok) throw new Error(`Konfigurationsdatei ${name}.json konnte nicht geladen werden (${res.status})`);
        return res.json();
      })
    );
  return buildContent({
    roles: roles.roles,
    mois: mois.mois,
    injuries: injuries.injuries,
    hiddenStates: hiddenStates.hiddenStates,
    findings: findings.findings,
    actions: actions.actions,
    progressionRules: progressionRules.progressionRules,
    scoringRules: scoringRules.scoringRules,
    caseTemplates: caseTemplates.caseTemplates
  });
}
