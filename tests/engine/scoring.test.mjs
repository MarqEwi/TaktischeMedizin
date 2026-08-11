import { test } from "node:test";
import assert from "node:assert/strict";
import { createScenario, performAction, wait, endScenario, advanceTime } from "../../js/engine/engine.js";
import { evaluate } from "../../js/engine/scoring.js";
import { loadTestContent } from "./helpers.mjs";

const content = loadTestContent();

/** Spielt den Feuergefecht-Fall als Medic nahezu optimal (leitlinienkonform) durch. */
function perfectRun() {
  const s = createScenario({ content, caseId: "case_feuergefecht", roleId: "medic", mode: "simulation", seed: 42 });
  performAction(s, content, "tq_anlegen"); // M zuerst, noch unter Feuer
  performAction(s, content, "move_to_cover");
  performAction(s, content, "assess_bewusstsein");
  performAction(s, content, "assess_koerpercheck"); // findet Thoraxwunde
  performAction(s, content, "chest_seal");
  performAction(s, content, "tq_kontrolle"); // TQ neu beurteilen (TCCC 6a)
  performAction(s, content, "assess_atmung");
  performAction(s, content, "assess_auskultation");
  performAction(s, content, "entlastungspunktion");
  performAction(s, content, "assess_puls");
  performAction(s, content, "txa_geben");
  performAction(s, content, "analgesie_ketamin");
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

test("Rollenabhängige Bewertung: CLS wird nicht an Medic-Regeln gemessen", () => {
  const s = createScenario({ content, caseId: "case_feuergefecht", roleId: "cls", mode: "simulation", seed: 42 });
  performAction(s, content, "tq_anlegen");
  performAction(s, content, "move_to_cover");
  performAction(s, content, "assess_koerpercheck");
  performAction(s, content, "chest_seal");
  endScenario(s, content, "handover");
  const report = evaluate(s, content);
  assert.ok(!report.rules.some((r) => r.id === "sr_txa"), "TXA-Regel darf für CLS nicht gelten");
  assert.ok(!report.rules.some((r) => r.id === "sr_analgesie_medic"));
  // CLS wird stattdessen an der CWMP-Analgesie gemessen
  assert.ok(report.rules.some((r) => r.id === "sr_analgesie_basis"));
});

test("TQ-Neubeurteilung wird nur gefordert, wenn ein Tourniquet angelegt wurde", () => {
  const withTq = createScenario({ content, caseId: "case_wache", roleId: "cls", mode: "simulation", seed: 3 });
  performAction(withTq, content, "tq_anlegen");
  endScenario(withTq, content, "handover");
  const r1 = evaluate(withTq, content);
  const rule1 = r1.rules.find((r) => r.id === "sr_tq_reassess");
  assert.ok(rule1, "Regel muss nach TQ-Anlage greifen");
  assert.equal(rule1.earned, 0, "ohne Kontrolle keine Punkte");

  const done = createScenario({ content, caseId: "case_wache", roleId: "cls", mode: "simulation", seed: 3 });
  performAction(done, content, "tq_anlegen");
  performAction(done, content, "tq_kontrolle");
  endScenario(done, content, "handover");
  const r2 = evaluate(done, content);
  assert.equal(r2.rules.find((r) => r.id === "sr_tq_reassess").earned, 10);
});

test("TXA ist auch bei bereits kontrollierter schwerer Blutung indiziert (Leitlinie 6d)", () => {
  const s = createScenario({ content, caseId: "case_wache", roleId: "medic", mode: "simulation", seed: 3 });
  performAction(s, content, "tq_anlegen"); // Blutung kontrolliert, Schock noch gering
  const res = performAction(s, content, "txa_geben");
  assert.equal(res.quality, "correct", `TXA bei TQ-versorgter Massivblutung muss korrekt sein (${res.feedback})`);
});

test("Nicht aufgetretene Zustände werden nicht bewertet (generische Regelanwendung)", () => {
  const s = createScenario({ content, caseId: "case_wache", roleId: "medic", mode: "simulation", seed: 3 });
  performAction(s, content, "tq_anlegen");
  endScenario(s, content, "handover");
  const report = evaluate(s, content);
  assert.ok(!report.rules.some((r) => r.id === "sr_chest_seal"), "Ohne Thoraxwunde keine Chest-Seal-Regel");
  assert.ok(!report.rules.some((r) => r.id === "sr_airway"));
});
