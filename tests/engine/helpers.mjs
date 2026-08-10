// Lädt den echten Content aus content/*.json für Node-Tests (ohne fetch).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildContent } from "../../js/engine/content.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function loadRawContent() {
  const read = (name) => JSON.parse(readFileSync(join(root, "content", `${name}.json`), "utf8"));
  return {
    roles: read("roles").roles,
    mois: read("mois").mois,
    injuries: read("injuries").injuries,
    hiddenStates: read("hidden-states").hiddenStates,
    findings: read("findings").findings,
    actions: read("actions").actions,
    progressionRules: read("progression-rules").progressionRules,
    scoringRules: read("scoring-rules").scoringRules,
    caseTemplates: read("case-templates").caseTemplates
  };
}

export function loadTestContent() {
  return buildContent(loadRawContent());
}
