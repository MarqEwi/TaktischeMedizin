import { test } from "node:test";
import assert from "node:assert/strict";
import { createScenario, performAction, wait, advanceTime, endScenario, getView } from "../../js/engine/engine.js";
import { computeVitals } from "../../js/engine/vitals.js";
import { loadTestContent } from "./helpers.mjs";

const content = loadTestContent();
const newScenario = (over = {}) =>
  createScenario({ content, caseId: "case_feuergefecht", roleId: "medic", mode: "training", seed: 42, ...over });

test("Fallinitialisierung: erzwungene Verletzungen und deterministischer Seed", () => {
  const s1 = newScenario();
  assert.deepEqual(s1.injuries, ["gsw_thigh", "gsw_thorax"]);
  assert.ok(s1.states.massive_extremity_bleeding.severity === 6);
  assert.ok(s1.states.open_chest_wound.severity === 4);

  // Zufallsauswahl ist mit gleichem Seed reproduzierbar
  const a = createScenario({ content, caseId: "case_ied", roleId: "medic", mode: "training", seed: 7 });
  const b = createScenario({ content, caseId: "case_ied", roleId: "medic", mode: "training", seed: 7 });
  assert.deepEqual(a.injuries, b.injuries);
  assert.equal(a.injuries.length, 2, "IED-Fall: 1 erzwungene + 1 zufällige Verletzung");
});

test("Hidden State bleibt verdeckt: View enthält keine Zustände, nur freigeschaltete Befunde", () => {
  const s = newScenario();
  const view = getView(s, content);
  assert.equal(view.states, undefined);
  const ids = view.findings.map((f) => f.id);
  assert.ok(ids.includes("f_bleed_thigh_massive"), "sofort sichtbarer Befund fehlt");
  assert.ok(!ids.includes("f_chest_entry"), "Thoraxwunde darf ohne Untersuchung nicht sichtbar sein");
});

test("Assessment schaltet Befunde frei", () => {
  const s = newScenario();
  performAction(s, content, "move_to_cover");
  const res = performAction(s, content, "assess_thorax");
  assert.ok(res.ok);
  const ids = getView(s, content).findings.map((f) => f.id);
  assert.ok(ids.includes("f_chest_entry"), "Thoraxinspektion muss die Thoraxwunde freischalten");
});

test("Vitalwerte werden aus Zuständen generiert und verschlechtern sich mit Progression", () => {
  const s = newScenario();
  const v0 = computeVitals(s, content);
  advanceTime(s, content, 240); // 4 min unbehandelt: Schock + Spannungspneu bauen sich auf
  const v1 = computeVitals(s, content);
  assert.ok(v1.hr > v0.hr, "Herzfrequenz muss steigen");
  assert.ok(v1.sbp < v0.sbp, "Blutdruck muss fallen");
  assert.ok(v1.spo2 < v0.spo2, "SpO2 muss fallen");
});

test("Unbehandelt stirbt der Patient, Szenario endet", () => {
  const s = newScenario();
  advanceTime(s, content, 1200);
  assert.ok(s.ended);
  assert.equal(s.endReason, "death");
  assert.ok(s.states.cardiac_arrest?.severity > 0);
});

test("Tourniquet kontrolliert die Blutung, Schock stabilisiert sich danach", () => {
  const s = newScenario();
  const res = performAction(s, content, "tq_anlegen");
  assert.equal(res.quality, "correct");
  assert.ok(s.states.massive_extremity_bleeding.controlled);

  performAction(s, content, "move_to_cover");
  performAction(s, content, "chest_seal"); // Thoraxwunde dicht → keine weitere Spannung
  performAction(s, content, "entlastungspunktion");
  const shockBefore = s.states.hypovolemic_shock?.severity ?? 0;
  advanceTime(s, content, 240);
  const shockAfter = s.states.hypovolemic_shock?.severity ?? 0;
  assert.ok(shockAfter <= shockBefore, "Schock darf nach Blutungskontrolle nicht weiter steigen");
  assert.ok(!s.ended || s.endReason !== "death");
});

test("Entlastungspunktion ohne Indikation erzeugt Komplikation und zählt als unnötig", () => {
  const s = createScenario({ content, caseId: "case_wache", roleId: "medic", mode: "training", seed: 1 });
  const res = performAction(s, content, "entlastungspunktion");
  assert.equal(res.quality, "unnecessary");
  assert.ok(s.states.iatrogenic_pneumothorax?.severity > 0);
  assert.equal(s.unnecessaryLog.length, 1);
});

test("Rollenfreigabe: CLS darf punktieren (CLS-Skillcard SC1-24), aber kein TXA geben", () => {
  const s = createScenario({ content, caseId: "case_feuergefecht", roleId: "cls", mode: "training", seed: 42 });
  const view = getView(s, content);
  assert.ok(view.actions.some((a) => a.id === "entlastungspunktion"), "NDC gehört zum CLS-Skillset");
  const res = performAction(s, content, "txa_geben");
  assert.equal(res.ok, false, "TXA bleibt Medic/Paramedic vorbehalten");
  assert.ok(!view.actions.some((a) => a.id === "txa_geben"));
  assert.ok(!view.actions.some((a) => a.id === "assess_auskultation"));
});

test("Phasenlogik: CUF endet durch 'in Deckung verbringen', Verstoß wird protokolliert", () => {
  const s = newScenario();
  assert.equal(getView(s, content).phase, "CUF");
  performAction(s, content, "assess_puls"); // in CUF nicht vorgesehen
  assert.equal(s.phaseViolationsLog.length, 1);
  performAction(s, content, "move_to_cover");
  assert.equal(getView(s, content).phase, "TFC");
});

test("MARCH-Priorisierung: Atemwegsmaßnahme vor sichtbarer Massivblutung ist Reihenfolgefehler", () => {
  const s = newScenario();
  performAction(s, content, "move_to_cover");
  performAction(s, content, "npa_einlegen"); // massive Blutung sichtbar & unversorgt
  assert.equal(s.orderViolations.length, 1);
  assert.equal(s.orderViolations[0].stateId, "massive_extremity_bleeding");

  // Umgekehrt: erst TQ, dann Atemweg → kein Fehler
  const s2 = newScenario();
  performAction(s2, content, "tq_anlegen");
  performAction(s2, content, "move_to_cover");
  performAction(s2, content, "npa_einlegen");
  assert.equal(s2.orderViolations.length, 0);
});

test("Nicht erkannte Probleme lösen keinen Reihenfolgefehler aus", () => {
  const s = newScenario();
  performAction(s, content, "tq_anlegen");
  performAction(s, content, "move_to_cover");
  // Thoraxwunde noch nicht entdeckt → Wärmeerhalt (H) ist kein Priorisierungsfehler
  performAction(s, content, "waermeerhalt");
  assert.equal(s.orderViolations.length, 0);
});

test("Wiederholte Messung nach Verlauf liefert aktualisierte Werte (Reassessment-Mechanik)", () => {
  const s = newScenario();
  performAction(s, content, "tq_anlegen"); // Blutung kontrolliert – aber die Thoraxwunde bleibt unentdeckt
  performAction(s, content, "move_to_cover");
  performAction(s, content, "assess_puls");
  const hr1 = s.measured.hr.value;
  wait(s, content, 120);
  wait(s, content, 120); // Spannungspneumothorax entwickelt sich weiter
  performAction(s, content, "assess_puls");
  const hr2 = s.measured.hr.value;
  assert.ok(!s.ended, "Patient darf in diesem Zeitfenster nicht sterben");
  assert.ok(hr2 > hr1, `Herzfrequenz muss nach Verschlechterung höher gemessen werden (${hr1} → ${hr2})`);
});

test("Nach Chest-Seal-Anlage baut sich langsam erneut Spannung auf, Lüften entlastet (Leitlinie 5b)", () => {
  const s = newScenario();
  performAction(s, content, "tq_anlegen");
  performAction(s, content, "move_to_cover");
  performAction(s, content, "assess_koerpercheck");
  performAction(s, content, "chest_seal");
  const afterSeal = s.states.tension_pneumothorax?.severity ?? 0;
  advanceTime(s, content, 300);
  const later = s.states.tension_pneumothorax.severity;
  assert.ok(later > afterSeal, `Residualprogression erwartet (${afterSeal} → ${later})`);
  const res = performAction(s, content, "chest_seal_lueften");
  assert.equal(res.quality, "correct");
  assert.ok(s.states.tension_pneumothorax.severity < later, "Lüften muss die Spannung reduzieren");
});

test("Fall endet spätestens nach maxDurationSec", () => {
  const s = createScenario({ content, caseId: "case_wache", roleId: "cls", mode: "training", seed: 3 });
  performAction(s, content, "tq_anlegen");
  for (let i = 0; i < 30 && !s.ended; i++) wait(s, content, 60);
  assert.ok(s.ended);
  assert.equal(s.endReason, "timeout");
});

test("Simulationsmodus versteckt Feedback im Protokoll, Trainingsmodus zeigt es", () => {
  const st = newScenario({ mode: "training" });
  performAction(st, content, "tq_anlegen");
  const vt = getView(st, content);
  assert.ok(vt.log.some((l) => l.feedback));

  const ss = newScenario({ mode: "simulation" });
  performAction(ss, content, "tq_anlegen");
  const vs = getView(ss, content);
  assert.ok(!vs.log.some((l) => l.feedback));
});

test("endScenario per Übergabe", () => {
  const s = newScenario();
  performAction(s, content, "tq_anlegen");
  endScenario(s, content, "handover");
  assert.ok(s.ended);
  assert.equal(s.endReason, "handover");
});
