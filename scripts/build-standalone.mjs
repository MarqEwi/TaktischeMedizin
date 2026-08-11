// Baut eine in sich geschlossene Einzeldatei-Version der App (für Demos/Vorschau):
// Engine-Module, Konfiguration und Bilder werden in eine HTML-Datei eingebettet.
// Aufruf: node scripts/build-standalone.mjs [ausgabedatei]   (Standard: dist/takmed-trainer.html)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const out = process.argv[2] || "dist/takmed-trainer.html";

const dataUri = (path, mime) => `data:${mime};base64,${readFileSync(path).toString("base64")}`;

// 1) Konfiguration einsammeln (Schlüssel wie in buildContent erwartet)
const CONTENT_KEYS = {
  "roles": "roles",
  "mois": "mois",
  "injuries": "injuries",
  "hidden-states": "hiddenStates",
  "findings": "findings",
  "actions": "actions",
  "progression-rules": "progressionRules",
  "scoring-rules": "scoringRules",
  "case-templates": "caseTemplates",
  "skillcards": "skillcards",
  "quiz": "quizFragen"
};
const raw = {};
for (const [file, key] of Object.entries(CONTENT_KEYS)) {
  raw[key] = JSON.parse(readFileSync(`content/${file}.json`, "utf8"))[key];
}
// Skillcard- und Fallbilder einbetten
for (const sc of raw.skillcards) {
  if (sc.bild) sc.bild = dataUri(sc.bild, "image/webp");
}
for (const tpl of raw.caseTemplates) {
  if (tpl.briefing?.bild) tpl.briefing.bild = dataUri(tpl.briefing.bild, "image/webp");
}

// 2) Engine + UI zu einem Modul zusammensetzen (Importe/Exporte entfernen)
const MODULES = [
  "js/engine/rng.js",
  "js/engine/vitals.js",
  "js/engine/content.js",
  "js/engine/validate.js",
  "js/engine/engine.js",
  "js/engine/scoring.js",
  "js/app.js"
];
let bundle = MODULES.map((f) =>
  readFileSync(f, "utf8")
    .split("\n")
    .filter((line) => !/^\s*import\s/.test(line) && !/^\s*export\s*\{/.test(line))
    .map((line) => line.replace(/^export\s+(function|const|let|class|async)/, "$1"))
    .join("\n")
).join("\n\n");

// Kein fetch in der Einzeldatei: Konfiguration liegt inline vor
bundle = bundle.replace(
  'state.content = await loadContent("content");',
  "state.content = buildContent(RAW_CONTENT);"
);
if (bundle.includes("loadContent(\"content\")")) {
  throw new Error("loadContent-Ersetzung fehlgeschlagen – app.js prüfen.");
}

// 3) HTML transformieren
let html = readFileSync("index.html", "utf8");
html = html
  .replace(/\s*<link rel="manifest"[^>]*>/, "")
  .replace('href="icons/icon-192.png"', `href="${dataUri("icons/icon-192.png", "image/png")}"`)
  .replace('src="icons/icon-192.png"', `src="${dataUri("icons/icon-192.png", "image/png")}"`)
  .replace('--hero-img: url("img/hero.webp");', `--hero-img: url("${dataUri("img/hero.webp", "image/webp")}");`)
  // Service-Worker-Registrierung und Datenschutz-Link entfallen in der Einzeldatei
  .replace(/<script>\s*\/\/ Service Worker[\s\S]*?<\/script>/, "")
  .replace(/<a href="datenschutz\.html">([^<]*)<\/a>/, "$1")
  .replace(
    '<script type="module" src="js/app.js"></script>',
    `<script type="module">\nconst RAW_CONTENT = ${JSON.stringify(raw)};\n${bundle}\n</script>`
  );

if (html.includes('src="js/app.js"')) throw new Error("Skript-Ersetzung fehlgeschlagen.");

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`${out} geschrieben (${Math.round(html.length / 1024)} KB).`);
