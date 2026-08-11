// Vitalparameter-Generator: Es gibt KEINE gespeicherten Soll-Vitalwerte.
// Werte werden bei jeder Messung aus den aktiven verdeckten Zuständen abgeleitet
// (Basiswert + additive Abweichungen je Schweregrad) plus deterministischem
// Mess-Jitter, damit wiederholte Messungen leicht streuen, aber reproduzierbar sind.

import { jitter } from "./rng.js";

const BASE = { hr: 75, rr: 14, sbp: 120, spo2: 98 };
const CLAMP = { hr: [0, 190], rr: [0, 45], sbp: [0, 145], spo2: [40, 100] };
const JITTER = { hr: 4, rr: 1.5, sbp: 4, spo2: 1 };

/**
 * Berechnet die aktuellen "wahren" Vitalwerte aus den aktiven Zuständen.
 * @returns {{hr: number, rr: number, sbp: number, spo2: number, avpu: string}}
 */
export function computeVitals(scenario, content) {
  const arrested = Object.values(scenario.states).some(
    (s) => s.severity > 0 && content.hiddenStates.get(s.stateId)?.terminal
  );
  if (arrested) return { hr: 0, rr: 0, sbp: 0, spo2: 0, avpu: "U" };

  const v = { ...BASE };
  let avpuPenalty = 0;
  for (const s of Object.values(scenario.states)) {
    if (s.severity <= 0) continue;
    const def = content.hiddenStates.get(s.stateId);
    if (!def) continue;
    for (const [param, per] of Object.entries(def.vitalsPerSeverity || {})) {
      v[param] += per * s.severity;
    }
    avpuPenalty += (def.avpuPenaltyPerSeverity || 0) * s.severity;
  }
  for (const p of Object.keys(v)) {
    v[p] = Math.min(CLAMP[p][1], Math.max(CLAMP[p][0], v[p]));
  }
  const avpu = avpuPenalty < 1.5 ? "A" : avpuPenalty < 3 ? "V" : avpuPenalty < 4.5 ? "P" : "U";
  return { hr: v.hr, rr: v.rr, sbp: v.sbp, spo2: v.spo2, avpu };
}

/**
 * "Misst" einen Parameter: wahrer Wert + deterministischer Jitter, gerundet.
 * @param {"hr"|"rr"|"sbp"|"spo2"|"avpu"} param
 */
export function measureVital(scenario, content, param) {
  const truth = computeVitals(scenario, content);
  if (param === "avpu") return truth.avpu;
  const key = `${param}:${Math.floor(scenario.timeSec / 15)}`;
  const value = truth[param] + jitter(scenario.seed, key) * JITTER[param];
  const clamped = Math.min(CLAMP[param][1], Math.max(CLAMP[param][0], value));
  return Math.round(clamped);
}
