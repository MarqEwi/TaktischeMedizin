// Kopiert die Web-App in den www/-Ordner (Quelle für Capacitor).
// Als Node-Skript, damit es auf Windows, Mac und Linux gleich funktioniert.
import { cpSync, mkdirSync, rmSync } from "node:fs";

mkdirSync("www", { recursive: true });

for (const f of ["index.html", "datenschutz.html", "manifest.webmanifest", "sw.js"]) {
  cpSync(f, `www/${f}`);
}
for (const dir of ["icons", "js", "content"]) {
  rmSync(`www/${dir}`, { recursive: true, force: true });
  cpSync(dir, `www/${dir}`, { recursive: true });
}

console.log("www/ aktualisiert.");
