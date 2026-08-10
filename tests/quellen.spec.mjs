// Quell-Links zu den amtlichen Informationen.
//
// Google Play verlangt (Richtlinie zu irreführenden Behauptungen), dass Apps,
// die Behördeninformationen wiedergeben, sichtbare Links zu den Originalquellen
// führen und klar erkennen lassen, dass sie keine Behörde vertreten. Der erste
// Anlauf des SGT Rechners wurde genau deswegen abgelehnt – dieser Test hält die
// Links fest, damit sie bei künftigen Umbauten nicht stillschweigend verschwinden.
import { test, expect } from "@playwright/test";

const HANDANWEISUNG =
  "https://wmm.pic-mediaserver.de/z202003/downloads/SGT_Handanweisung_190404_Intranet.pdf";

test("Einstellungen: Quellen verlinken die Originalquellen und distanzieren von Behörden", async ({ page }) => {
  await page.goto("/");
  await page.click("#ob-skip");
  await page.click("#btn-settings");

  const quellen = page.locator("#modal-settings details.acc", { hasText: "Quellen" }).last();
  await quellen.locator("summary").click();

  await expect(quellen).toContainText("vertritt keine Behörde");
  await expect(quellen.locator(`a[href="${HANDANWEISUNG}"]`)).toBeVisible();
  // Mindestens eine offizielle bundeswehr.de-Fundstelle
  await expect(quellen.locator('a[href^="https://www.bundeswehr.de/"]').first()).toBeVisible();

  // "Über diese App" trägt denselben Hinweis samt Link
  const ueber = page.locator("#modal-settings details.acc", { hasText: "Über diese App" }).last();
  await ueber.locator("summary").click();
  await expect(ueber).toContainText("vertritt keine Behörde");
  await expect(ueber.locator(`a[href="${HANDANWEISUNG}"]`)).toBeVisible();

  // Rechenweg-Abschnitt verlinkt die Handanweisung ebenfalls
  await expect(page.locator(`#s-berechnung a[href="${HANDANWEISUNG}"]`)).toHaveCount(1);
});

test("Aufbau-Tab nennt die Originalquelle", async ({ page }) => {
  await page.goto("/");
  await page.click("#ob-skip");
  await page.click("#go-pruefer");
  await page.click("#ptab-aufbau-btn");
  await expect(page.locator(`#pruefer-tab-aufbau a[href="${HANDANWEISUNG}"]`)).toBeVisible();
});

test("Datenschutzseite führt die Quellen und den Behörden-Hinweis", async ({ page }) => {
  await page.goto("/datenschutz.html");
  await expect(page.locator("body")).toContainText("keine Behörde");
  await expect(page.locator(`a[href="${HANDANWEISUNG}"]`)).toBeVisible();
});
