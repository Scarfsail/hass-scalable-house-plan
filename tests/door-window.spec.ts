import { test, expect, type Page } from "@playwright/test";
import { openTestDashboard } from "./helpers/ha";
import { provisionTestDashboard, buildDashboardConfig, CLEAN_CARD_CONFIG } from "./helpers/dashboard";

/**
 * Door/window element with a control (issue #19): the control chip, the bar length
 * following the plan, the popup on tap, hold toggling the control, and control_entity
 * counted as placed on the plan.
 *
 * HA's live hass is replaced by test copies with patched states and a mocked
 * callService, so no real lock or gate is ever operated. realtime_updates makes the
 * card publish every pushed object at once.
 */

const DOOR = "binary_sensor.rsc_door_entrance_contact";
const LOCK = "lock.dvere_predsin";
const GATE_SENSOR = "binary_sensor.rsc_gate_street";
const GATE = "cover.rsc_gate_street_control";
const WINDOW = "binary_sensor.rsc_window_office_contact1";

const DOOR_WIDTH = 40;
const DOOR_HEIGHT = 7;

function fixture(doorElement: Record<string, unknown> = { control_entity: LOCK }, extraEntities: unknown[] = []) {
    return {
        ...CLEAN_CARD_CONFIG,
        realtime_updates: true,
        rooms: [
            {
                name: "Předsíň",
                boundary: [[100, 100], [500, 100], [500, 400], [100, 400]],
                elements_clickable_on_overview: true,
                entities: [
                    { entity: DOOR, plan: { left: 100, top: 150, element: { type: "custom:door-window-shp", width: DOOR_WIDTH, height: DOOR_HEIGHT, orientation: "horizontal", ...doorElement } } },
                    { entity: GATE_SENSOR, plan: { left: 200, top: 50, element: { type: "custom:door-window-shp", width: 60, orientation: "horizontal", control_entity: GATE } } },
                    { entity: WINDOW, plan: { left: 300, top: 250, tap_action: { action: "more-info" }, element: { type: "custom:door-window-shp", width: 30, orientation: "horizontal" } } },
                    ...extraEntities,
                ],
            },
        ],
    };
}

type StatePatch = Record<string, { state?: string; attributes?: Record<string, unknown> }>;

async function setupPlan(page: Page, card = fixture()): Promise<void> {
    await openTestDashboard(page);
    await provisionTestDashboard(page, buildDashboardConfig(card));
    await openTestDashboard(page);
    await page.locator("scalable-house-plan-room").first().waitFor({ state: "attached", timeout: 30_000 });

    await page.locator("scalable-house-plan").first().evaluate((el: any) => {
        const proto = customElements.get("scalable-house-plan")!.prototype;
        const hassDesc = Object.getOwnPropertyDescriptor(proto, "hass")!;
        // Drop HA's live assignments; the test feeds the card through its real setter.
        Object.defineProperty(el, "hass", { get: hassDesc.get, set: () => {}, configurable: true });

        const deepQuery = (root: Document | ShadowRoot, selector: string): any => {
            const stack: (Document | ShadowRoot)[] = [root];
            while (stack.length) {
                const r = stack.shift()!;
                const found = r.querySelector(selector);
                if (found) return found;
                r.querySelectorAll("*").forEach((n) => {
                    if ((n as any).shadowRoot) stack.push((n as any).shadowRoot);
                });
            }
            return null;
        };

        const haHass = (document.querySelector("home-assistant") as any).hass;
        const w = window as any;
        w.__dw = {
            el,
            deepQuery,
            calls: [] as unknown[][],
            ws: [] as any[],
            base: undefined as any,
            push(patch: StatePatch = {}) {
                const states = { ...this.base.states };
                for (const [id, p] of Object.entries(patch)) {
                    const prev = states[id];
                    states[id] = { ...prev, state: p.state ?? prev.state, attributes: { ...prev.attributes, ...p.attributes } };
                }
                this.base = { ...this.base, states };
                hassDesc.set!.call(el, this.base);
            },
        };
        w.__dw.base = {
            ...haHass,
            callService: (...args: unknown[]) => { w.__dw.calls.push(args); return Promise.resolve({ context: {} }); },
            callWS: (msg: any) => { w.__dw.ws.push(msg); return haHass.callWS(msg); },
        };
    });
    await push(page, {
        [DOOR]: { state: "off" },
        [LOCK]: { state: "locked" },
        [GATE]: { state: "closed", attributes: { current_position: 0 } },
    });
    // Let the overview settle its scale (debounced resize) before measuring or clicking
    await page.waitForTimeout(1_000);
}

async function push(page: Page, patch: StatePatch): Promise<void> {
    await page.evaluate((patch) => (window as any).__dw.push(patch), patch);
    await page.evaluate(async () => {
        const el = (window as any).__dw.el;
        await el.updateComplete;
        await new Promise((r) => requestAnimationFrame(r));
    });
}

/** The door-window-shp of an entity in the given view (overview or room detail). */
async function doorInfo(page: Page, entityId: string, view: "overview" | "detail") {
    return page.evaluate(({ entityId, view }) => {
        const dw = (window as any).__dw;
        const host = view === "overview"
            ? dw.el.shadowRoot.querySelector("scalable-house-plan-overview")
            : dw.el.shadowRoot.querySelector("scalable-house-plan-detail");
        const room = dw.deepQuery(host.shadowRoot, "scalable-house-plan-room");
        const wrapper = room.shadowRoot.querySelector(`.element-wrapper[data-unique-key="${entityId}"]`);
        const door = wrapper.querySelector("door-window-shp");
        const shape = door.shadowRoot.querySelector(".shape").getBoundingClientRect();
        const hostRect = door.getBoundingClientRect();
        const chip = door.shadowRoot.querySelector(".control");
        const icon = chip?.querySelector("ha-state-icon");
        return {
            roomScale: room.scale,
            shape: { width: shape.width, height: shape.height, x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 },
            // Where the bar is drawn, relative to the element's own box (the configured position and size)
            barOffset: { left: shape.left - hostRect.left, top: shape.top - hostRect.top, width: shape.width - hostRect.width, height: shape.height - hostRect.height },
            chip: chip ? {
                background: chip.style.backgroundColor,
                icon: icon.style.color,
                dimmed: icon.classList.contains("dimmed"),
                text: chip.textContent.trim(),
            } : null,
        };
    }, { entityId, view });
}

async function popupOpen(page: Page): Promise<boolean> {
    return page.evaluate(() => !!(window as any).__dw.el.shadowRoot.querySelector("door-window-detail-shp"));
}

test.describe("Door/window with a control", () => {
    test("control chip follows the lock and cover state", async ({ page }) => {
        await setupPlan(page);

        // No chip without control_entity
        expect((await doorInfo(page, WINDOW, "overview")).chip).toBeNull();

        const lockCases: Array<[string, string, string, boolean]> = [
            ["locked", "var(--shp-gauge-text-bg-track, rgba(0, 0, 0, 0.4))", "var(--state-lock-locked-color)", false],
            ["unlocked", "rgb(100, 100, 255)", "white", false],
            ["open", "rgb(100, 100, 255)", "white", false],
            ["locking", "var(--shp-gauge-text-bg-track, rgba(0, 0, 0, 0.4))", "var(--state-lock-locking-color)", false],
            ["jammed", "var(--state-lock-jammed-color)", "white", false],
            ["unavailable", "var(--shp-gauge-text-bg-track, rgba(0, 0, 0, 0.4))", "white", true],
        ];
        for (const [state, background, icon, dimmed] of lockCases) {
            await push(page, { [LOCK]: { state } });
            const { chip } = await doorInfo(page, DOOR, "overview");
            expect(chip, state).toEqual({ background, icon, dimmed, text: "" });
        }

        // A cover open part way shows its position after the icon
        await push(page, { [GATE]: { state: "open", attributes: { current_position: 40 } } });
        expect((await doorInfo(page, GATE_SENSOR, "overview")).chip).toMatchObject({ background: "rgb(100, 100, 255)", text: "40%" });
        await push(page, { [GATE]: { state: "closing", attributes: { current_position: 100 } } });
        expect((await doorInfo(page, GATE_SENSOR, "overview")).chip).toMatchObject({ icon: "var(--state-lock-locking-color)", text: "" });
    });

    test("bar length follows the plan, thickness the element scale", async ({ page }) => {
        await setupPlan(page);

        // Overview: the whole plan is scaled by the overview, the bar is width × scaleX on screen
        const scaleX = await page.evaluate(() => (window as any).__dw.el.shadowRoot.querySelector("scalable-house-plan-overview")._lastScaleX);
        const overview = await doorInfo(page, DOOR, "overview");
        expect(overview.shape.width).toBeCloseTo(DOOR_WIDTH * scaleX, 0);

        // Detail: length × room scale, thickness × element scale (default ratio 0.25)
        await page.evaluate(() => (window as any).__dw.el._openRoomDetail(0));
        await page.locator("scalable-house-plan-detail").waitFor({ state: "attached" });
        await page.waitForTimeout(500);
        const detail = await doorInfo(page, DOOR, "detail");
        expect(detail.roomScale).toBeGreaterThan(1.5);
        expect(detail.shape.width).toBeCloseTo(DOOR_WIDTH * detail.roomScale, 0);
        expect(detail.shape.height).toBeCloseTo(DOOR_HEIGHT * (1 + (detail.roomScale - 1) * 0.25), 0);
    });

    test("a label wider than the bar does not move the bar", async ({ page }) => {
        for (const orientation of ["horizontal", "vertical"]) {
            // A 40 px door with a gate open part way: time pill + chip are wider than the bar
            await setupPlan(page, fixture({ control_entity: GATE, orientation }));
            await push(page, { [GATE]: { state: "open", attributes: { current_position: 40 } } });
            const zero = { left: 0, top: 0, width: 0, height: 0 };
            const near = (o: typeof zero) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)]));
            expect(near((await doorInfo(page, DOOR, "overview")).barOffset), `${orientation} overview`).toEqual(zero);

            await page.evaluate(() => (window as any).__dw.el._openRoomDetail(0));
            await page.locator("scalable-house-plan-detail").waitFor({ state: "attached" });
            await page.waitForTimeout(500);
            expect(near((await doorInfo(page, DOOR, "detail")).barOffset), `${orientation} detail`).toEqual(zero);
        }
    });

    test("tap opens the popup above the overview and the room detail", async ({ page }) => {
        await setupPlan(page);

        // Overview
        let { shape } = await doorInfo(page, DOOR, "overview");
        await page.mouse.click(shape.x, shape.y);
        await expect.poll(() => popupOpen(page)).toBe(true);
        const historyCalls = await page.evaluate(() => (window as any).__dw.ws.filter((m: any) => m.type === "history/history_during_period"));
        expect(historyCalls).toHaveLength(1);
        expect(historyCalls[0]).toMatchObject({ entity_ids: ["binary_sensor.rsc_door_entrance_contact"], minimal_response: true, no_attributes: true });
        await page.keyboard.press("Escape");
        await expect.poll(() => popupOpen(page)).toBe(false);

        // Room detail: the popup is the topmost element of the card
        await page.evaluate(() => (window as any).__dw.el._openRoomDetail(0));
        await page.locator("scalable-house-plan-detail").waitFor({ state: "attached" });
        await page.waitForTimeout(500);
        ({ shape } = await doorInfo(page, DOOR, "detail"));
        await page.mouse.click(shape.x, shape.y);
        await expect.poll(() => popupOpen(page)).toBe(true);
        const topmost = await page.evaluate(() => {
            const el = (window as any).__dw.el;
            return el.shadowRoot.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.localName;
        });
        expect(topmost).toBe("door-window-detail-shp");
    });

    test("a configured tap_action wins over the popup", async ({ page }) => {
        await setupPlan(page);
        await page.evaluate(() => {
            (window as any).__moreInfo = [];
            window.addEventListener("hass-more-info", (e: any) => { (window as any).__moreInfo.push(e.detail.entityId); e.stopPropagation(); }, { capture: true });
        });
        const { shape } = await doorInfo(page, WINDOW, "overview");
        await page.mouse.click(shape.x, shape.y);
        await expect.poll(() => page.evaluate(() => (window as any).__moreInfo)).toEqual([WINDOW]);
        expect(await popupOpen(page)).toBe(false);
    });

    test("hold toggles the control", async ({ page }) => {
        await setupPlan(page);

        const hold = async (entityId: string) => {
            const { shape } = await doorInfo(page, entityId, "overview");
            await page.mouse.move(shape.x, shape.y);
            await page.mouse.down();
            await page.waitForTimeout(700);
            await page.mouse.up();
        };
        const calls = () => page.evaluate(() => (window as any).__dw.calls);

        await hold(DOOR);
        await expect.poll(calls).toEqual([["lock", "unlock", { entity_id: LOCK }]]);
        await push(page, { [LOCK]: { state: "unlocked" } });
        await hold(DOOR);
        await expect.poll(calls).toEqual([["lock", "unlock", { entity_id: LOCK }], ["lock", "lock", { entity_id: LOCK }]]);
        await hold(GATE_SENSOR);
        await expect.poll(calls).toHaveLength(3);
        expect((await calls())[2]).toEqual(["cover", "toggle", { entity_id: GATE }]);

        // A lock neither locked nor unlocked is left alone
        await push(page, { [LOCK]: { state: "jammed" } });
        await hold(DOOR);
        await page.waitForTimeout(500);
        expect(await calls()).toHaveLength(3);
        expect(await popupOpen(page)).toBe(false);
    });

    test("control_entity counts as placed on the plan", async ({ page }) => {
        const notOnDetail = async () => {
            await page.evaluate(() => (window as any).__dw.el._openRoomDetail(0));
            await page.locator("scalable-house-plan-detail").waitFor({ state: "attached" });
            return page.evaluate(() => (window as any).__dw.el.shadowRoot.querySelector("scalable-house-plan-detail")._entitiesNotOnDetailCount);
        };

        // The lock listed in the room without a plan of its own
        await setupPlan(page, fixture({}, [LOCK]));
        expect(await notOnDetail()).toBe(1);

        await setupPlan(page, fixture({ control_entity: LOCK }, [LOCK]));
        expect(await notOnDetail()).toBe(0);
    });
});
