import { test } from "node:test";
import assert from "node:assert/strict";
import { createScenario, performAction, wait, endScenario, advanceTime } from "../../js/engine/engine.js";
import { evaluate } from "../../js/engine/scoring.js";
import { loadTestContent } from "./helpers.mjs";

const content = loadTestContent();

/** Spielt den Feuergefecht-Fall als Medic nahezu optimal durch. */
function perfectRun() {
  const s = createScenario({ content, caseId: "case_feuergefecht", roleId: "medic", mode: "simulation", seed: 42 });
  performAction(s, content, "tq_anlegen"); // M zuerst, noch unter Feuer
  performAction(s, content, "move_to_cover");
  performAction(s, content, "assess_bewusstsein");
  performAction(s, content, "assess_koerpercheck"); // findet Thoraxwunde
  performAction(s, content, "chest_seal");
  performAction(s, content, "assess_atmung");
  performAction(s, content, "assess_auskultation");
  performAction(s, content, "entlastungspunktion");
  performAction(s, content, "assess_puls");
  performAction(s, content, "txa_geben");
  performAction(s, content, "waermeerhalt");
  performAction(s, content, "assess_haut_rekap");
  performAction(s, content, "assess_spo2");
  endScenario(s, content, "handover");
  return s;
}

test("Guter Durchlauf: Patient überlebt, hoher Score, keine kritischen Fehler", () => {
  const s = perfectRun();
  const report = evaluate(s, content);
  assert.notEqual(report.outcome.status, "verstorben");
  assert.equal(report.criticalErrors.length, 0, JSON.stringify(report.criticalErrors));
  assert.ok(report.score.percent >= 75, `erwartet >= 75 %, war ${report.score.percent} % – ${JSON.stringify(report.rules.map((r) => [r.label, r.earned, r.max]))}`);
});

test("Blutung ignorieren: kritischer Fehler und schlechtes Outcome", () => {
  const s = createScenario({ content, caseId: "case_feuergefecht", roleId: "medic", mode: "simulation", seed: 42 });
  performAction(s, content, "move_to_cover");
  performAction(s, content, "npa_einlegen"); // Priorisierungsfehler
  advanceTime(s, content, 900); // Blutung läuft weiter → Tod
  const report = evaluate(s, content);
  assert.equal(report.outcome.status, "verstorben");
  assert.ok(report.criticalErrors.length >= 1);
  assert.ok(report.score.grade.startsWith("Nicht bestanden"));
  assert.ok(report.rules.some((r) => r.id === "sr_march_order" && r.earned < r.max), "Reihenfolgefehler muss Punkte kosten");
});

test("Richtige Maßnahme zu spät gibt nur Teilpunkte", () => {
  const s = createScenario({ content, caseId: "case_wache", roleId: "cls", mode: "simulation", seed: 3 });
  wait(s, content, 60);
  wait(s, content, 60);
  wait(s, content, 60);
  wait(s, content, 60); // 4 min gewartet – Patient lebt noch, aber Zeitfenster verpasst
  performAction(s, content, "tq_anlegen");
  endScenario(s, content, "handover");
  const report = evaluate(s, content);
  const tq = report.rules.find((r) => r.id === "sr_tq_massive");
  assert.ok(tq.earned > 0 && tq.earned < tq.max, `Teilpunkte erwartet, war ${tq.earned}/${tq.max}`);
});

test("Fehlendes Reassessment kostet Punkte", () => {
  const s = createScenario({ content, caseId: "case_wache", roleId: "cls", mode: "simulation", seed: 3 });
  performAction(s, content, "tq_anlegen");
  for (let i = 0; i < 9; i++) wait(s, content, 60); // 9 min ohne jede Kontrolle
  if (!s.ended) endScenario(s, content, "handover");
  const report = evaluate(s, content);
  const re = report.rules.find((r) => r.id === "sr_reassessment");
  assert.ok(re.earned < re.max, "Reassessment-Regel muss Abzug ergeben");
});

test("Rollenabhängige Bewertung: CLS wird nicht an der Entlastungspunktion gemessen", () => {
  const s = createScenario({ content, caseId: "case_feuergefecht", roleId: "cls", mode: "simulation", seed: 42 });
  performAction(s, content, "tq_anlegen");
  performAction(s, content, "move_to_cover");
  performAction(s, content, "assess_koerpercheck");
  performAction(s, content, "chest_seal");
  endScenario(s, content, "handover");
  const report = evaluate(s, content);
  assert.ok(!report.rules.some((r) => r.id === "sr_needle_decomp"), "Medic-Regel darf für CLS nicht gelten");
  assert.ok(!report.rules.some((r) => r.id === "sr_txa"));
});

test("Nicht aufgetretene Zustände werden nicht bewertet (generische Regelanwendung)", () => {
  const s = createScenario({ content, caseId: "case_wache", roleId: "medic", mode: "simulation", seed: 3 });
  performAction(s, content, "tq_anlegen");
  endScenario(s, content, "handover");
  const report = evaluate(s, content);
  assert.ok(!report.rules.some((r) => r.id === "sr_chest_seal"), "Ohne Thoraxwunde keine Chest-Seal-Regel");
  assert.ok(!report.rules.some((r) => r.id === "sr_airway"));
});
