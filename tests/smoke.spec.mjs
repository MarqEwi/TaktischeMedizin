// Smoke-Tests der Web-Version: App lädt ohne Konsolenfehler, der Kernablauf
// (Rolle → Modus → Fall → Simulation → Debriefing) funktioniert, und im
// localStorage landen nur Schlüssel mit dem eigenen Präfix.
import { test, expect } from "@playwright/test";

test.describe("TakMed Trainer – Smoke", () => {
  let consoleErrors;

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));
    await page.goto("/");
  });

  test("App lädt ohne Konsolenfehler, Startbildschirm zeigt Rollen, Modi und Fälle", async ({ page }) => {
    await expect(page.locator("#screen-start")).toBeVisible();
    await expect(page.locator("#role-cards .card")).toHaveCount(2); // CLS + Combat Medic spielbar
    await expect(page.locator("#mode-cards .card")).toHaveCount(2);
    await expect(page.locator("#case-cards .card")).toHaveCount(4);
    await expect(page.locator("#config-error")).toBeHidden();
    expect(consoleErrors).toEqual([]);
  });

  test("Kompletter Ablauf: Fall starten, Maßnahmen durchführen, Debriefing erreichen", async ({ page }) => {
    await page.locator("#role-cards .card", { hasText: "Combat Medic" }).click();
    await page.locator("#mode-cards .card", { hasText: "Trainingsmodus" }).click();
    await page.locator("#case-cards .card", { hasText: "Einzelschuss" }).click();
    await page.locator("#btn-to-briefing").click();
    await expect(page.locator("#screen-briefing")).toBeVisible();
    await expect(page.locator("#briefing-content")).toContainText("Lage");

    await page.locator("#btn-start-sim").click();
    await expect(page.locator("#screen-sim")).toBeVisible();
    await expect(page.locator("#sim-phase")).toHaveText("TFC");

    // Sichtbarer Befund vorhanden, aber keine Vitalwerte vor der Messung
    await expect(page.locator("#sim-findings")).toContainText("Blutung");
    await expect(page.locator("#sim-vitals")).toContainText("nicht gemessen");

    // Behandeln: Tourniquet, dann Puls messen
    await page.locator(".tabs button", { hasText: "Maßnahmen" }).click();
    await page.locator("#tab-treat .action-btn", { hasText: "Tourniquet anlegen" }).click();
    await expect(page.locator("#sim-feedback")).toContainText("Blutung steht");
    await page.locator(".tabs button", { hasText: "Untersuchen" }).click();
    await page.locator("#tab-assess .action-btn", { hasText: "Puls tasten" }).click();
    await expect(page.locator("#sim-vitals")).toContainText("/min");

    // Übergabe → Debriefing
    page.once("dialog", (d) => d.accept());
    await page.locator("#btn-handover").click();
    await expect(page.locator("#screen-debrief")).toBeVisible();
    await expect(page.locator("#debrief-content")).toContainText("Debriefing");
    await expect(page.locator("#debrief-content")).toContainText("%");
    expect(consoleErrors).toEqual([]);
  });

  test("Rollenmodell: CLS hat Skillcard-Maßnahmen (inkl. NDC), aber keine Medic-Maßnahmen", async ({ page }) => {
    await page.locator("#role-cards .card", { hasText: "Combat Lifesaver" }).click();
    await page.locator("#mode-cards .card", { hasText: "Simulationsmodus" }).click();
    await page.locator("#case-cards .card", { hasText: "Feuergefecht" }).click();
    await page.locator("#btn-to-briefing").click();
    await page.locator("#btn-start-sim").click();
    await page.locator(".tabs button", { hasText: "Maßnahmen" }).click();
    await expect(page.locator("#tab-treat")).toContainText("Entlastungspunktion"); // CLS-Skillcard SC1-24
    await expect(page.locator("#tab-treat")).not.toContainText("TXA");
    await expect(page.locator("#tab-treat")).toContainText("Tourniquet");
  });

  test("Skillcard-Dialog öffnet sich über das Info-Symbol", async ({ page }) => {
    await page.locator("#role-cards .card", { hasText: "Combat Lifesaver" }).click();
    await page.locator("#mode-cards .card", { hasText: "Trainingsmodus" }).click();
    await page.locator("#case-cards .card", { hasText: "Einzelschuss" }).click();
    await page.locator("#btn-to-briefing").click();
    await page.locator("#btn-start-sim").click();
    await page.locator(".tabs button", { hasText: "Maßnahmen" }).click();
    await page.locator(".action-row", { hasText: "Tourniquet anlegen" }).locator(".info-btn").click();
    await expect(page.locator("#skillcard-dialog")).toBeVisible();
    await expect(page.locator("#sc-titel")).toContainText("Tourniquet");
    await expect(page.locator("#sc-body")).toContainText("Knebel");
    await page.locator("#sc-close").click();
    await expect(page.locator("#skillcard-dialog")).toBeHidden();
  });

  test("localStorage enthält nur Schlüssel mit takmed_-Präfix", async ({ page }) => {
    await page.locator("#role-cards .card", { hasText: "Combat Medic" }).click();
    await page.locator("#mode-cards .card", { hasText: "Trainingsmodus" }).click();
    await page.locator("#case-cards .card", { hasText: "Einzelschuss" }).click();
    await page.locator("#btn-to-briefing").click();
    await page.locator("#btn-start-sim").click();
    page.once("dialog", (d) => d.accept());
    await page.locator("#btn-handover").click();
    await expect(page.locator("#screen-debrief")).toBeVisible();

    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(key).toMatch(/^takmed_/);
  });

  test("Lernübersicht zeigt Skillcards und alle Fälle", async ({ page }) => {
    await expect(page.locator("#role-cards .card").first()).toBeVisible(); // App fertig initialisiert
    await page.locator("#btn-learn").click();
    await expect(page.locator("#screen-learn")).toBeVisible();
    await expect(page.locator("#learn-content .panel")).toHaveCount(6); // Skillcards + CLS-Ausbildungsprofil + 4 Fälle
    await expect(page.locator("#learn-content .skillcard-link")).toHaveCount(7);
    await expect(page.locator("#learn-content")).toContainText("Ausbildungsprofil Combat Lifesaver");
  });

  test("Wissensfragen: Quiz aus der Lernübersicht, Antwort mit Erklärung", async ({ page }) => {
    await expect(page.locator("#role-cards .card").first()).toBeVisible();
    await page.locator("#btn-learn").click();
    await page.locator(".panel", { hasText: "CLS-Probefall" }).locator("button", { hasText: "Wissensfragen üben" }).click();
    await expect(page.locator("#screen-quiz")).toBeVisible();
    await expect(page.locator("#quiz-content .panel")).toHaveCount(11);

    // Erste Frage (MARCH): richtige Antwort anklicken → grün + Erklärung
    const frage1 = page.locator("#quiz-content .panel").first();
    await frage1.locator(".quiz-option").first().click();
    await expect(frage1.locator(".quiz-option.richtig")).toHaveCount(1);
    await expect(frage1.locator(".quiz-erklaerung")).toContainText("Quelle");
    await expect(frage1.locator(".quiz-option").first()).toBeDisabled();
  });
});
