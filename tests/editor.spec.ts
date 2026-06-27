import { test, expect } from "@playwright/test";
import {
    openTestDashboard,
    enterDashboardEditMode,
    openCardEditor,
} from "./helpers/ha";
import { provisionTestDashboard } from "./helpers/dashboard";

test.describe("Scalable House Plan - card editor", () => {
    test.beforeEach(async ({ page }) => {
        // Reset the dashboard to a clean (no rooms) state before each test.
        await openTestDashboard(page);
        await provisionTestDashboard(page);

        await openTestDashboard(page);
        await enterDashboardEditMode(page);
        await openCardEditor(page);
    });

    test("adds the first room", async ({ page }) => {
        const editor = page.locator("scalable-house-plan-editor");

        // Precondition: no rooms yet.
        await expect(editor).toContainText("Místnosti - 0");

        // Click the "Přidat místnost" (Add room) button in the rooms section header.
        await editor.locator(".add-button").first().click();

        // One room now exists, both in the header count and as a room editor row.
        await expect(editor).toContainText("Místnosti - 1");
        await expect(editor.locator("editor-rooms-shp editor-room-shp")).toHaveCount(1);
    });
});
