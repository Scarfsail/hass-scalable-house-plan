import type { Page } from "@playwright/test";

/**
 * Dedicated Lovelace dashboard used by the e2e tests.
 * A single-view, panel-mode dashboard containing one `custom:scalable-house-plan`
 * card. The config is reset to a clean state before each test run so tests are
 * deterministic.
 */
export const TEST_DASHBOARD_URL_PATH = "shp-e2e-test";
export const TEST_DASHBOARD_TITLE = "SHP E2E Test";

/** Minimal, valid card config with no rooms - the starting point for editor tests. */
export const CLEAN_CARD_CONFIG = {
    type: "custom:scalable-house-plan",
    image: "/local/scalable-house-plan-test.png",
    image_width: 1360,
    image_height: 849,
    rooms: [] as unknown[],
};

/** Panel-mode dashboard config wrapping the card in a single full-width view. */
export function buildDashboardConfig(card: Record<string, unknown> = CLEAN_CARD_CONFIG, title = TEST_DASHBOARD_TITLE) {
    return {
        views: [
            {
                title,
                panel: true,
                cards: [card],
            },
        ],
    };
}

/** Create (if missing) the test dashboard and reset its config to a clean state. */
export function provisionTestDashboard(
    page: Page,
    config: ReturnType<typeof buildDashboardConfig> = buildDashboardConfig()
): Promise<void> {
    return provisionDashboard(page, TEST_DASHBOARD_URL_PATH, TEST_DASHBOARD_TITLE, config);
}

/**
 * Create (if missing) a storage-mode dashboard and (re)write its config,
 * talking to the Home Assistant websocket connection the frontend has already
 * opened. Must be called on a page that is logged in and has finished loading
 * a Home Assistant panel. `showInSidebar` is applied to an existing dashboard too.
 */
export async function provisionDashboard(
    page: Page,
    urlPath: string,
    title: string,
    config: ReturnType<typeof buildDashboardConfig>,
    showInSidebar = true
): Promise<void> {
    await page.waitForFunction(() => {
        const ha = document.querySelector("home-assistant") as any;
        return !!ha?.hass?.connection;
    }, { timeout: 30_000 });

    await page.evaluate(
        async ({ urlPath, title, cfg, showInSidebar }) => {
            const ha = document.querySelector("home-assistant") as any;
            const conn = ha.hass.connection;

            const dashboards: Array<{ id: string; url_path: string; show_in_sidebar: boolean }> =
                await conn.sendMessagePromise({ type: "lovelace/dashboards/list" });
            const existing = dashboards.find((d) => d.url_path === urlPath);

            if (!existing) {
                await conn.sendMessagePromise({
                    type: "lovelace/dashboards/create",
                    url_path: urlPath,
                    mode: "storage",
                    title,
                    show_in_sidebar: showInSidebar,
                    require_admin: false,
                });
            } else if (existing.show_in_sidebar !== showInSidebar) {
                await conn.sendMessagePromise({
                    type: "lovelace/dashboards/update",
                    dashboard_id: existing.id,
                    show_in_sidebar: showInSidebar,
                });
            }

            await conn.sendMessagePromise({
                type: "lovelace/config/save",
                url_path: urlPath,
                config: cfg,
            });
        },
        { urlPath, title, cfg: config, showInSidebar }
    );
}
