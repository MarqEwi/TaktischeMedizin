import { test } from "node:test";
import assert from "node:assert/strict";
import { validateContent } from "../../js/engine/validate.js";
import { loadRawContent } from "./helpers.mjs";

test("mitgelieferter Content ist fehlerfrei", () => {
  const { errors, warnings } = validateContent(loadRawContent());
  assert.deepEqual(errors, [], `Validierungsfehler: ${errors.join(" | ")}`);
  assert.deepEqual(warnings, [], `Warnungen: ${warnings.join(" | ")}`);
});

test("Validierung findet kaputte Referenzen", () => {
  const raw = loadRawContent();
  raw.injuries[0].states[0].stateId = "gibt_es_nicht";
  raw.actions.push({ id: "kaputt", kind: "treatment", name: "x", beschreibung: "x", category: "M", roles: ["cls"], phases: [], timeCostSec: 10, repeatable: false, treatment: { effects: [{ if: { stateActive: "auch_nicht" }, apply: [], feedback: "x", quality: "correct" }] } });
  const { errors } = validateContent(raw);
  assert.ok(errors.some((e) => e.includes("gibt_es_nicht")), "unbekannter Zustand in Verletzung muss gemeldet werden");
  assert.ok(errors.some((e) => e.includes("auch_nicht")), "unbekannter Zustand in Aktionsbedingung muss gemeldet werden");
});

test("Validierung findet fehlende Pflichtfelder", () => {
  const raw = loadRawContent();
  delete raw.caseTemplates[0].moiId;
  const { errors } = validateContent(raw);
  assert.ok(errors.some((e) => e.includes("moiId")));
});
