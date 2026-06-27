import { test as setup, expect } from "@playwright/test";
import { STORAGE_STATE } from "../../playwright.config";
import { login } from "../helpers/ha";
import { provisionTestDashboard } from "../helpers/dashboard";

const USERNAME = process.env.HASS_USERNAME ?? "";
const PASSWORD = process.env.HASS_PASSWORD ?? "";

setup("authenticate and provision test dashboard", async ({ page }) => {
    expect(
        USERNAME && PASSWORD,
        "HASS_USERNAME and HASS_PASSWORD must be set in .env"
    ).toBeTruthy();

    await page.goto("/");
    await login(page, USERNAME, PASSWORD);

    // A panel must be loaded so the websocket connection is available.
    await page.waitForFunction(() => {
        const ha = document.querySelector("home-assistant") as any;
        return !!ha?.hass?.connection;
    }, { timeout: 30_000 });

    // Create / reset the dedicated panel-mode test dashboard with a clean card.
    await provisionTestDashboard(page);

    // Persist authentication (localStorage hassTokens) for the test project.
    await page.context().storageState({ path: STORAGE_STATE });
});
