// UI-Controller: reine Darstellung und Bedienung.
// Sämtliche Simulations- und Bewertungslogik liegt in js/engine/ –
// diese Datei kennt nur die gefilterte View (getView) und den Debriefing-Report.

import { loadContent } from "./engine/content.js";
import { validateContent } from "./engine/validate.js";
import { createScenario, performAction, wait, endScenario, getView } from "./engine/engine.js";
import { evaluate, fmtTime } from "./engine/scoring.js";

const STORAGE_KEY = "takmed_results";

const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, html = "") => {
  const node = document.createElement(tag);
  Object.assign(node, attrs);
  if (html) node.innerHTML = html;
  return node;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const state = {
  content: null,
  roleId: null,
  mode: null,
  caseId: null,
  scenario: null,
  report: null,
  tab: "assess"
};

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function show(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(`#${screenId}`).classList.add("active");
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------------
// Startbildschirm: Rolle, Modus, Fall
// ---------------------------------------------------------------------------

const MODES = [
  { id: "training", name: "Trainingsmodus", desc: "Mit direktem Feedback nach jeder Maßnahme – zum Lernen." },
  { id: "simulation", name: "Simulationsmodus", desc: "Ohne Hilfen; Auswertung erst im Debriefing – zum Prüfen." }
];

// Kleine Inline-Piktogramme (Stroke-SVG), damit keine externen Assets nötig sind
const GLYPHS = {
  cls: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.2 7.7-8 9-4.8-1.3-8-4.5-8-9V6z"/><path d="M12 8v6M9 11h6"/></svg>',
  medic: '<svg viewBox="0 0 24 24"><path d="M6 3v5a6 6 0 0 0 12 0V3"/><path d="M12 14v3a4 4 0 0 0 8 0v-1"/><circle cx="20" cy="14" r="2"/></svg>',
  training: '<svg viewBox="0 0 24 24"><path d="M4 6h9a4 4 0 0 1 4 4v9"/><path d="M4 6v13h9"/><path d="M21 3l-4 4"/><path d="M17 3h4v4"/></svg>',
  simulation: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>'
};

function renderStart() {
  const roleWrap = $("#role-cards");
  roleWrap.innerHTML = "";
  for (const role of state.content.roles.values()) {
    if (!role.playable) continue;
    const btn = el("button", { className: "card" + (state.roleId === role.id ? " selected" : "") });
    btn.innerHTML = `<span class="glyph">${GLYPHS[role.id] || GLYPHS.cls}</span>
      <div class="title">${esc(role.name)}</div><div class="desc">${esc(role.beschreibung)}</div>`;
    btn.onclick = () => { state.roleId = role.id; renderStart(); };
    roleWrap.append(btn);
  }

  const modeWrap = $("#mode-cards");
  modeWrap.innerHTML = "";
  for (const mode of MODES) {
    const btn = el("button", { className: "card" + (state.mode === mode.id ? " selected" : "") });
    btn.innerHTML = `<span class="glyph">${GLYPHS[mode.id]}</span>
      <div class="title">${esc(mode.name)}</div><div class="desc">${esc(mode.desc)}</div>`;
    btn.onclick = () => { state.mode = mode.id; renderStart(); };
    modeWrap.append(btn);
  }

  const caseWrap = $("#case-cards");
  caseWrap.innerHTML = "";
  for (const tpl of state.content.caseTemplates.values()) {
    const allowed = !state.roleId || tpl.roles.includes(state.roleId);
    const btn = el("button", { className: "card" + (state.caseId === tpl.id ? " selected" : ""), disabled: !allowed });
    const stars = "●".repeat(tpl.difficulty) + "○".repeat(3 - tpl.difficulty);
    btn.innerHTML = `<div class="title">${esc(tpl.name)} <span class="badge">${stars}</span></div>
      <div class="desc">${esc(tpl.untertitel)}${allowed ? "" : " – für die gewählte Rolle nicht verfügbar"}</div>`;
    btn.onclick = () => { state.caseId = tpl.id; renderStart(); };
    caseWrap.append(btn);
  }
  if (state.caseId && state.roleId && !state.content.caseTemplates.get(state.caseId).roles.includes(state.roleId)) {
    state.caseId = null;
  }
  $("#btn-to-briefing").disabled = !(state.roleId && state.mode && state.caseId);
}

// ---------------------------------------------------------------------------
// Briefing
// ---------------------------------------------------------------------------

function renderBriefing() {
  const tpl = state.content.caseTemplates.get(state.caseId);
  const role = state.content.roles.get(state.roleId);
  const objectives = state.mode === "training"
    ? `<h2>Lernziele</h2><div class="panel"><ul>${tpl.learningObjectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ul></div>`
    : "";
  $("#briefing-content").innerHTML = `
    <h2>${esc(tpl.name)}</h2>
    <p class="muted">${esc(tpl.untertitel)} · Rolle: ${esc(role.name)} · ${state.mode === "training" ? "Trainingsmodus" : "Simulationsmodus"}</p>
    <div class="panel"><h3 style="margin-top:0">Lage</h3><p>${esc(tpl.briefing.lage)}</p></div>
    <div class="panel"><h3 style="margin-top:0">Auftrag</h3><p>${esc(tpl.briefing.auftrag)}</p></div>
    <div class="panel"><h3 style="margin-top:0">Patient</h3><p>${esc(tpl.briefing.patient)}</p></div>
    ${objectives}
    <p class="muted">Jede Aktion kostet Simulationszeit – der Zustand des Patienten entwickelt sich währenddessen weiter.</p>`;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

function startSimulation() {
  const seed = Math.floor(Math.random() * 2 ** 31);
  state.scenario = createScenario({
    content: state.content,
    caseId: state.caseId,
    roleId: state.roleId,
    mode: state.mode,
    seed
  });
  state.tab = "assess";
  hideFeedback();
  show("screen-sim");
  renderSim();
}

const VITAL_DEFS = [
  { key: "avpu", label: "AVPU" },
  { key: "hr", label: "HF", unit: "/min" },
  { key: "rr", label: "AF", unit: "/min" },
  { key: "sbp", label: "RRsys", unit: "mmHg" },
  { key: "spo2", label: "SpO₂", unit: "%" }
];

function ageText(nowSec, atSec) {
  const d = nowSec - atSec;
  if (d < 45) return "aktuell";
  return `vor ${Math.round(d / 60)} min`;
}

function renderSim() {
  const view = getView(state.scenario, state.content);
  $("#sim-clock").textContent = fmtTime(view.timeSec);
  const phaseBadge = $("#sim-phase");
  phaseBadge.textContent = view.phase;
  phaseBadge.className = `badge phase-${view.phase}`;
  $("#sim-mode").textContent = view.mode === "training" ? "Training" : "Simulation";
  $("#sim-case").textContent = view.caseName;

  // Vitalwerte: nur, was gemessen wurde – mit Alter der Messung
  const vitalsWrap = $("#sim-vitals");
  vitalsWrap.innerHTML = "";
  for (const v of VITAL_DEFS) {
    const m = view.measured[v.key];
    const stale = m && view.timeSec - m.atSec > 120;
    const box = el("div", { className: "vital" + (stale ? " stale" : "") });
    box.innerHTML = `<div class="label">${v.label}</div>
      <div class="value">${m ? esc(m.value) + (v.unit ? `<small> ${v.unit}</small>` : "") : "–"}</div>
      <div class="age">${m ? ageText(view.timeSec, m.atSec) : "nicht gemessen"}</div>`;
    vitalsWrap.append(box);
  }

  // Befunde (nur freigeschaltete)
  const fWrap = $("#sim-findings");
  if (view.findings.length === 0) {
    fWrap.innerHTML = '<p class="muted">Noch keine Befunde erhoben.</p>';
  } else {
    fWrap.innerHTML = "";
    for (const f of view.findings) {
      const stale = view.timeSec - f.lastAtSec > 120;
      const row = el("div", { className: "finding" + (stale ? " stale" : "") });
      row.innerHTML = `${esc(f.text)}<span class="age">${ageText(view.timeSec, f.lastAtSec)}${f.stillActive ? "" : " · nicht mehr feststellbar"}</span>`;
      fWrap.append(row);
    }
  }

  renderActions(view);
  renderLog(view);
  $("#btn-wait").disabled = view.ended;
  $("#btn-handover").disabled = view.ended;
}

function actionButton(a, view) {
  const btn = el("button", { className: "action-btn", disabled: a.disabled });
  const done = a.done && !a.repeatable ? " ✓" : "";
  const warn = a.phaseWarning ? `<span class="warnphase">⚠ nicht für Phase ${esc(view.phase)} vorgesehen</span>` : "";
  btn.innerHTML = `<span class="chip chip-${esc(a.category)}">${esc(a.category)}</span>
    <span class="body"><span class="name">${esc(a.name)}${done}</span>
    <span class="desc">${esc(a.beschreibung)}</span>${warn}</span>
    <span class="cost">${a.timeCostSec} s</span>`;
  btn.onclick = () => runAction(a.id);
  return btn;
}

function renderActions(view) {
  const assessWrap = $("#tab-assess");
  const treatWrap = $("#tab-treat");
  assessWrap.innerHTML = "";
  treatWrap.innerHTML = "";
  for (const a of view.actions) {
    (a.kind === "assessment" ? assessWrap : treatWrap).append(actionButton(a, view));
  }
}

function renderLog(view) {
  const wrap = $("#tab-log");
  wrap.innerHTML = "";
  for (const l of [...view.log].reverse()) {
    const row = el("div", { className: `logline k-${l.kind}` });
    let html = `<span class="t">${fmtTime(l.atSec)}</span>${esc(l.text)}`;
    if (l.feedback) html += `<span class="fb q-${esc(l.quality || "neutral")}">${esc(l.feedback)}</span>`;
    row.innerHTML = html;
    wrap.append(row);
  }
  if (!view.log.length) wrap.innerHTML = '<p class="muted">Noch keine Einträge.</p>';
}

function showFeedback(text, quality) {
  const bar = $("#sim-feedback");
  bar.textContent = text;
  bar.className = `feedbackbar show q-${quality || "neutral"}`;
}
function hideFeedback() {
  $("#sim-feedback").className = "feedbackbar";
}

function runAction(actionId) {
  const res = performAction(state.scenario, state.content, actionId);
  if (!res.ok) {
    showFeedback(res.error, "unnecessary");
  } else if (state.mode === "training") {
    showFeedback(res.feedback, res.quality === "assessment" ? "neutral" : res.quality);
  } else {
    showFeedback("Durchgeführt.", "neutral");
  }
  afterEngineStep();
}

function afterEngineStep() {
  if (state.scenario.ended) {
    finishScenario();
  } else {
    renderSim();
  }
}

function finishScenario() {
  if (!state.scenario.ended) endScenario(state.scenario, state.content, "handover");
  state.report = evaluate(state.scenario, state.content);
  saveResult();
  renderDebrief();
  show("screen-debrief");
}

// ---------------------------------------------------------------------------
// Debriefing
// ---------------------------------------------------------------------------

function debriefSection(title, events, kind) {
  if (!events.length) return "";
  return `<h2>${esc(title)}</h2>` + events
    .map((e) => `<div class="debrief-item k-${kind}">${e.atSec !== undefined ? `<span class="muted">${fmtTime(e.atSec)} · </span>` : ""}${esc(e.text)}</div>`)
    .join("");
}

function renderDebrief() {
  const r = state.report;
  const s = state.scenario;
  const outcomeClass = `outcome-${r.outcome.status}`;

  const bars = r.gruppen
    .map((g) => {
      const pct = g.max > 0 ? Math.round((g.earned / g.max) * 100) : 0;
      return `<div class="scorebar"><div class="label"><span>${esc(g.label)}</span><span>${g.earned}/${g.max}</span></div>
        <div class="track"><div class="fill" style="width:${pct}%"></div></div></div>`;
    })
    .join("");

  const rulesRows = r.rules
    .map((rule) => `<tr><td>${esc(rule.label)}</td><td>${rule.earned}/${rule.max}</td></tr>`)
    .join("");

  // Im Debriefing wird das vollständige Protokoll inklusive Feedback gezeigt –
  // hier endet die Verdeckung, das ist der Lernmoment.
  const timeline = s.log
    .map((l) => {
      let html = `<div class="logline k-${l.kind}"><span class="t">${fmtTime(l.atSec)}</span>${esc(l.text)}`;
      if (l.feedback) html += `<span class="fb q-${esc(l.quality || "neutral")}">${esc(l.feedback)}</span>`;
      return html + "</div>";
    })
    .join("");

  // Score-Ring (SVG): Kreisumfang 2·π·r, Füllstand über stroke-dashoffset
  const R = 52;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - r.score.percent / 100);
  const ring = `
    <div class="score-ring">
      <svg width="116" height="116" viewBox="0 0 116 116" aria-hidden="true">
        <circle class="track" cx="58" cy="58" r="${R}" fill="none" stroke-width="9"/>
        <circle class="fill" cx="58" cy="58" r="${R}" fill="none" stroke-width="9" stroke-linecap="round"
          stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"/>
      </svg>
      <div class="num">${r.score.percent}<small> %</small></div>
    </div>`;

  $("#debrief-content").innerHTML = `
    <h2>Debriefing</h2>
    <div class="outcome-banner ${outcomeClass}">${esc(r.outcome.text)}</div>
    <div class="panel">
      <div class="score-hero">
        ${ring}
        <div class="score-meta">
          <div class="grade">${esc(r.score.grade)}</div>
          <p class="muted" style="margin:2px 0 10px">${r.score.earned} von ${r.score.max} Punkten · Dauer ${fmtTime(r.durationSec)} · Szenario-Seed ${s.seed}</p>
          ${bars}
        </div>
      </div>
    </div>
    ${debriefSection("Kritische Fehler", r.criticalErrors, "critical")}
    ${debriefSection("Verpasst / Abzüge", r.missed, "missed")}
    ${debriefSection("Teilweise richtig", r.partial, "partial")}
    ${debriefSection("Richtige Entscheidungen", r.good, "good")}
    <h2>Bewertung im Detail</h2>
    <div class="panel"><table class="rules">${rulesRows}</table></div>
    <h2>Verlauf</h2>
    <div class="panel">${timeline}</div>`;
}

// ---------------------------------------------------------------------------
// Ergebnis-Speicherung und Lernübersicht (localStorage, Präfix takmed_)
// ---------------------------------------------------------------------------

function loadResults() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveResult() {
  const results = loadResults();
  const r = state.report;
  const entry = results[state.caseId] || { attempts: 0, bestPercent: 0, bestGrade: "–" };
  entry.attempts += 1;
  entry.lastPercent = r.score.percent;
  entry.lastGrade = r.score.grade;
  entry.lastRole = state.roleId;
  entry.lastAt = new Date().toISOString();
  if (r.score.percent > entry.bestPercent || entry.attempts === 1) {
    entry.bestPercent = r.score.percent;
    entry.bestGrade = r.score.grade;
  }
  results[state.caseId] = entry;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
  } catch { /* Speicher voll oder blockiert – Ergebnis geht nur lokal verloren */ }
}

function renderLearn() {
  const results = loadResults();
  const wrap = $("#learn-content");
  wrap.innerHTML = "";
  for (const tpl of state.content.caseTemplates.values()) {
    const res = results[tpl.id];
    const stats = res
      ? `${res.attempts}× bearbeitet · Bestes Ergebnis: <strong>${res.bestPercent} %</strong> (${esc(res.bestGrade)})`
      : "Noch nicht bearbeitet";
    const panel = el("div", { className: "panel" });
    panel.innerHTML = `
      <div class="learn-case"><div><strong>${esc(tpl.name)}</strong><br><span class="muted">${esc(tpl.untertitel)}</span></div></div>
      <p class="muted">${stats}</p>
      <details><summary class="muted">Lernziele</summary>
        <ul>${tpl.learningObjectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>
      </details>`;
    wrap.append(panel);
  }
}

// ---------------------------------------------------------------------------
// Initialisierung
// ---------------------------------------------------------------------------

function bindEvents() {
  $("#btn-to-briefing").onclick = () => { renderBriefing(); show("screen-briefing"); };
  $("#btn-briefing-back").onclick = () => show("screen-start");
  $("#btn-start-sim").onclick = startSimulation;
  $("#btn-learn").onclick = () => { renderLearn(); show("screen-learn"); };
  $("#btn-learn-back").onclick = () => show("screen-start");
  $("#btn-wait").onclick = () => {
    const res = wait(state.scenario, state.content, 30);
    if (res.ok) hideFeedback();
    afterEngineStep();
  };
  $("#btn-handover").onclick = () => {
    if (confirm("Fall wirklich beenden und den Patienten übergeben?")) finishScenario();
  };
  $("#btn-retry").onclick = () => { renderBriefing(); show("screen-briefing"); };
  $("#btn-debrief-home").onclick = () => show("screen-start");
  $("#btn-debrief-learn").onclick = () => { renderLearn(); show("screen-learn"); };

  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.onclick = () => {
      state.tab = btn.dataset.tab;
      document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b === btn));
      $("#tab-assess").style.display = state.tab === "assess" ? "" : "none";
      $("#tab-treat").style.display = state.tab === "treat" ? "" : "none";
      $("#tab-log").style.display = state.tab === "log" ? "" : "none";
    };
  });

  // Android-Zurück-Taste (nur in der Capacitor-App relevant)
  if (window.Capacitor?.isNativePlatform?.()) {
    window.Capacitor.Plugins.App?.addListener("backButton", () => {
      const active = document.querySelector(".screen.active")?.id;
      if (active === "screen-start") {
        window.Capacitor.Plugins.App.exitApp();
      } else if (active === "screen-sim") {
        // Während der Simulation nicht versehentlich verlassen
        showFeedback("Fall über „Übergabe / Fall beenden“ abschließen.", "neutral");
      } else {
        show("screen-start");
      }
    });
  }
}

async function init() {
  try {
    state.content = await loadContent("content");
  } catch (e) {
    const box = $("#config-error");
    box.style.display = "block";
    box.textContent = `Konfiguration konnte nicht geladen werden: ${e.message}`;
    return;
  }
  const { errors, warnings } = validateContent(state.content.raw);
  if (warnings.length) console.warn("Content-Warnungen:", warnings);
  if (errors.length) {
    const box = $("#config-error");
    box.style.display = "block";
    box.textContent = "Fehler in den Konfigurationsdateien:\n" + errors.join("\n");
    return;
  }
  bindEvents();
  renderStart();
}

init();
