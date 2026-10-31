import { test, expect } from "@playwright/test";

test("isolated demo supports mutation refresh without console errors", async ({ page }) => {
  const errors: string[] = []; page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); }); page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/"); await page.getByRole("link", { name: /try isolated demo/i }).click(); await expect(page.getByRole("heading", { name: "Operations overview" })).toBeVisible();
  await page.getByRole("link", { name: "Orders", exact: true }).click(); await expect(page.getByRole("heading", { name: "Orders", exact: true })).toBeVisible(); const rows = page.locator("table tbody tr"); const initialCount = await rows.count(); await page.getByLabel("Description").fill(`E2E services ${Date.now()}`); await page.getByRole("button", { name: "Create draft" }).click(); await expect(rows).toHaveCount(initialCount + 1); expect(errors).toEqual([]);
});

test("mobile navigation is keyboard-operable and logout protects the app", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/api/session/demo"); const menu = page.getByRole("button", { name: "Open navigation" }); await expect(menu).toBeVisible(); await menu.focus(); await page.keyboard.press("Enter"); await expect(page.getByRole("navigation", { name: "Application navigation" })).toBeVisible(); await page.keyboard.press("Escape"); await expect(page.getByRole("navigation", { name: "Application navigation" })).toBeHidden(); await menu.click(); await page.getByRole("button", { name: "Sign out" }).click(); await expect(page).toHaveURL(/\/login$/); await page.goto("/app"); await expect(page).toHaveURL(/\/login$/);
});

test("login offers a credential-free public demo", async ({ page }) => {
  await page.goto("/login"); await expect(page.getByRole("heading", { name: /Welcome to Second Entry/ })).toBeVisible(); await expect(page.getByRole("heading", { name: "Explore the demo" })).toBeVisible(); await page.getByRole("link", { name: "Enter public demo" }).click(); await expect(page.getByRole("heading", { name: "Operations overview" })).toBeVisible();
});

test("local approver account can record a reasoned decision", async ({ page }) => {
  await page.goto("/login"); await page.getByLabel("Email").fill("approver@secondentry.local"); await page.getByLabel("Password").fill("Approver-Demo-2026!"); await page.getByRole("button", { name: "Sign in" }).click(); await expect(page.getByText("finance approver")).toBeVisible(); await page.getByRole("link", { name: "Exception Center" }).click(); const approve = page.getByRole("button", { name: "Approve resolution" }).first(); await expect(approve).toBeVisible(); const form = approve.locator("xpath=ancestor::form"); await form.getByLabel("Approval reason").fill("Evidence verified during isolated role UAT"); await approve.click(); await expect(page.getByText("resolved approved").first()).toBeVisible();
});
