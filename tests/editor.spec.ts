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

    test("room dimensions/shape section shows X/Y coordinate inputs", async ({ page }) => {
        const editor = page.locator("scalable-house-plan-editor");

        // Add a room and expand it.
        await editor.locator(".add-button").first().click();
        const room = editor.locator("editor-rooms-shp editor-room-shp").first();
        await room.locator(".room-header").click();

        // Expand the "Rozměry a tvar místnosti" (room dimensions & shape) section.
        await room
            .locator(".section-header")
            .filter({ hasText: "Rozměry a tvar místnosti" })
            .click();

        // A default room has 4 boundary points, each rendered as a row with a
        // delete button plus X and Y number inputs.
        const points = room.locator(".boundary-point");
        await expect(points).toHaveCount(4);

        // The section is expanded: the per-point delete buttons are visible
        // (the symptom is that only these show up).
        await expect(room.locator(".boundary-point ha-icon-button").first()).toBeVisible();

        // Each point must also expose visible X and Y coordinate edit fields.
        // (Regression guard: HA 2026.6 removed ha-textfield in favour of
        // ha-input; using the old tag left these rendering blank/hidden.)
        const coordFields = room.locator(".boundary-point ha-input");
        await expect(coordFields).toHaveCount(8);
        await expect(coordFields.first()).toBeVisible();
    });
});
