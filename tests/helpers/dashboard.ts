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
export function buildDashboardConfig(card: Record<string, unknown> = CLEAN_CARD_CONFIG) {
    return {
        views: [
            {
                title: TEST_DASHBOARD_TITLE,
                panel: true,
                cards: [card],
            },
        ],
    };
}

/**
 * Create (if missing) the test dashboard and (re)write its config to a clean
 * state, talking to the Home Assistant websocket connection the frontend has
 * already opened. Must be called on a page that is logged in and has finished
 * loading a Home Assistant panel.
 */
export async function provisionTestDashboard(
    page: Page,
    config: ReturnType<typeof buildDashboardConfig> = buildDashboardConfig()
): Promise<void> {
    await page.waitForFunction(() => {
        const ha = document.querySelector("home-assistant") as any;
        return !!ha?.hass?.connection;
    }, { timeout: 30_000 });

    await page.evaluate(
        async ({ urlPath, title, cfg }) => {
            const ha = document.querySelector("home-assistant") as any;
            const conn = ha.hass.connection;

            const dashboards: Array<{ url_path: string }> =
                await conn.sendMessagePromise({ type: "lovelace/dashboards/list" });

            if (!dashboards.some((d) => d.url_path === urlPath)) {
                await conn.sendMessagePromise({
                    type: "lovelace/dashboards/create",
                    url_path: urlPath,
                    mode: "storage",
                    title,
                    show_in_sidebar: true,
                    require_admin: false,
                });
            }

            await conn.sendMessagePromise({
                type: "lovelace/config/save",
                url_path: urlPath,
                config: cfg,
            });
        },
        { urlPath: TEST_DASHBOARD_URL_PATH, title: TEST_DASHBOARD_TITLE, cfg: config }
    );
}
