import { expect, type Page } from "@playwright/test";
import { TEST_DASHBOARD_URL_PATH } from "./dashboard";

/**
 * Log in to Home Assistant through the UI login form.
 * No-op if the page is already authenticated (no login form shown).
 */
export async function login(page: Page, username: string, password: string): Promise<void> {
    const usernameField = page.locator('input[autocomplete="username"]');

    // If we are already authenticated, the login form is never rendered.
    try {
        await usernameField.waitFor({ state: "visible", timeout: 15_000 });
    } catch {
        return;
    }

    await usernameField.fill(username);
    await page.locator('input[autocomplete="current-password"]').fill(password);

    // Submitting the auth form (Enter inside the form) starts the login flow.
    await page.locator('input[autocomplete="current-password"]').press("Enter");

    // Wait until we leave the auth/authorize screen and a panel is loaded.
    await expect(usernameField).toBeHidden({ timeout: 30_000 });
}

/** Navigate to the dedicated test dashboard and wait for the card to render. */
export async function openTestDashboard(page: Page): Promise<void> {
    await page.goto(`/${TEST_DASHBOARD_URL_PATH}`);
    await page.locator("scalable-house-plan").first().waitFor({ state: "attached", timeout: 30_000 });
}

/**
 * Put the currently open Lovelace dashboard into edit mode.
 * Calls `lovelace.setEditMode(true)` on the `ha-panel-lovelace` element, which
 * also adds `?edit=1` to the URL (the state the card itself reacts to). This is
 * far more robust than driving the overflow menu across HA versions.
 */
export async function enterDashboardEditMode(page: Page): Promise<void> {
    await page.evaluate(() => {
        const deepQuery = (selector: string): any => {
            const stack: (Document | ShadowRoot)[] = [document];
            while (stack.length) {
                const root = stack.shift()!;
                const found = root.querySelector(selector);
                if (found) return found;
                root.querySelectorAll("*").forEach((el) => {
                    if ((el as any).shadowRoot) stack.push((el as any).shadowRoot);
                });
            }
            return null;
        };
        const panel = deepQuery("ha-panel-lovelace");
        if (!panel?.lovelace) throw new Error("ha-panel-lovelace / lovelace not found");
        panel.lovelace.setEditMode(true);
    });

    // In edit mode the panel view wraps the card in <hui-card-options>.
    await page.locator("hui-card-options").first().waitFor({ state: "attached", timeout: 15_000 });
    await expect(page).toHaveURL(/edit=1/);
}

/**
 * Click the card's "Upravit" (Edit) button rendered at the bottom of the panel
 * view in edit mode, opening the card configuration dialog. Playwright auto
 * scrolls the (tall) card so the button comes into view before clicking.
 */
export async function openCardEditor(page: Page): Promise<void> {
    const editButton = page
        .locator("hui-card-options")
        .first()
        .getByRole("button", { name: "Upravit", exact: true });

    await editButton.scrollIntoViewIfNeeded();
    await editButton.click();

    // The card editor dialog hosts our custom editor element.
    await page.locator("scalable-house-plan-editor").waitFor({ state: "visible", timeout: 15_000 });
}
