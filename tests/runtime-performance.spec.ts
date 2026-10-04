import { test, expect, type Page } from "@playwright/test";
import { openTestDashboard, enterDashboardEditMode, openCardEditor } from "./helpers/ha";
import { provisionTestDashboard, buildDashboardConfig, CLEAN_CARD_CONFIG } from "./helpers/dashboard";

/**
 * Runtime tests for hass coalescing at the top card (issue #1).
 *
 * The card is isolated from the live HA stream: HA's own `hass` assignments are
 * dropped by an instance-level property, and the test pushes shallow-copied
 * `hass` objects (with modified `states` and a mocked `callService`) through the
 * card's real setter. Timers are controlled with `page.clock`. No backend entity
 * writes and no real device calls happen.
 */

const LIGHT = "light.svetlo_obyvak";
const OTHER_LIGHT = "light.svetlo_kuchyn";
const MOTION = "binary_sensor.pohyb_u_terasy_filtrovany";
// climate.obyvak exists locally but is unavailable; tests inject a "heat" state for it.
const CLIMATE = "climate.obyvak";

const FIXTURE_CARD = {
    ...CLEAN_CARD_CONFIG,
    dynamic_colors: { motion_delay_seconds: 10 },
    rooms: [
        {
            name: "Obývák",
            boundary: [[100, 100], [500, 100], [500, 400], [100, 400]],
            entities: [
                { entity: LIGHT, plan: { left: 50, top: 50 } },
                { entity: MOTION, plan: { left: 150, top: 50 } },
                { entity: CLIMATE, plan: { left: 250, top: 50 } },
            ],
        },
        {
            name: "Kuchyň",
            boundary: [[600, 100], [900, 100], [900, 400], [600, 400]],
            entities: [{ entity: OTHER_LIGHT, plan: { left: 50, top: 50 } }],
        },
        {
            name: "Garáž",
            boundary: [[100, 500], [500, 500], [500, 800], [100, 800]],
            entities: [{ entity: "light.svetlo_garaz", plan: { left: 50, top: 50 } }],
        },
    ],
};

type StatePatch = Record<string, { state?: string; attributes?: Record<string, unknown>; last_changed_ago_ms?: number }>;

/**
 * Provision the fixture, open it with a controllable clock, and install the
 * in-page harness (`window.__shp`).
 */
async function setupPlan(page: Page, cardOverrides: Record<string, unknown> = {}): Promise<void> {
    await page.clock.install();
    await openTestDashboard(page);
    await provisionTestDashboard(page, buildDashboardConfig({ ...FIXTURE_CARD, ...cardOverrides }));
    await openTestDashboard(page);
    await page.locator("scalable-house-plan-room").first().waitFor({ state: "attached", timeout: 30_000 });

    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now + 500);

    await page.locator("scalable-house-plan").first().evaluate((el: any) => {
        const w = window as any;
        const proto = customElements.get("scalable-house-plan")!.prototype;
        const hassDesc = Object.getOwnPropertyDescriptor(proto, "hass")!;

        // Drop HA's live assignments; the test feeds the card through its real setter.
        Object.defineProperty(el, "hass", { get: hassDesc.get, set: () => {}, configurable: true });

        // Count publishes (assignments of the reactive `_hass`).
        const stateDesc = Object.getOwnPropertyDescriptor(proto, "_hass")!;
        Object.defineProperty(proto, "_hass", {
            get: stateDesc.get,
            set(value) {
                w.__shp.publishes.push({ t: Date.now(), value });
                stateDesc.set!.call(this, value);
            },
            configurable: true,
        });

        // Count overview room renders.
        const roomProto = customElements.get("scalable-house-plan-room")!.prototype as any;
        const origRender = roomProto.render;
        roomProto.render = function (...args: unknown[]) {
            if (this.mode === "overview") w.__shp.roomRenders++;
            return origRender.apply(this, args);
        };

        const deepAll = (root: Document | ShadowRoot, selector: string): any[] => {
            const out: any[] = [];
            const stack: (Document | ShadowRoot)[] = [root];
            while (stack.length) {
                const r = stack.shift()!;
                out.push(...r.querySelectorAll(selector));
                r.querySelectorAll("*").forEach((n) => {
                    if ((n as any).shadowRoot) stack.push((n as any).shadowRoot);
                });
            }
            return out;
        };

        const haHass = (document.querySelector("home-assistant") as any).hass;
        const calls: any[] = [];
        const mockCallService = (...args: unknown[]) => {
            const call: any = { args };
            call.promise = new Promise((resolve, reject) => {
                call.resolve = resolve;
                call.reject = reject;
            });
            calls.push(call);
            return call.promise;
        };

        w.__shp = {
            el,
            deepAll,
            calls,
            haCallService: haHass.callService,
            publishes: [] as any[],
            roomRenders: 0,
            // Never mutate HA's shared object: the test base is a copy.
            base: { ...haHass, callService: mockCallService },
            last: undefined as any,
            push(patch: StatePatch = {}, newRegistry = false) {
                const states = { ...this.base.states };
                for (const [id, p] of Object.entries(patch)) {
                    const prev = states[id];
                    states[id] = {
                        ...prev,
                        state: p.state ?? prev.state,
                        attributes: { ...prev.attributes, ...p.attributes },
                        last_changed: p.last_changed_ago_ms !== undefined
                            ? new Date(Date.now() - p.last_changed_ago_ms).toISOString()
                            : prev.last_changed,
                    };
                }
                this.base = { ...this.base, states, ...(newRegistry ? { entities: { ...this.base.entities } } : {}) };
                this.last = { ...this.base };
                hassDesc.set!.call(el, this.last);
            },
            reset() {
                this.publishes.length = 0;
                this.roomRenders = 0;
            },
            async settle() {
                await el.updateComplete;
                for (const c of deepAll(el.shadowRoot, "*")) {
                    if (c.updateComplete) await c.updateComplete;
                }
            },
        };
    });

    // Initial snapshot: an active climate (shown on overview) and a recent motion change.
    await push(page, {
        [CLIMATE]: {
            state: "heat",
            attributes: { hvac_modes: ["off", "heat"], temperature: 21, min_temp: 7, max_temp: 30, target_temp_step: 0.5 },
        },
        [MOTION]: { state: "off", last_changed_ago_ms: 30_000 },
        [LIGHT]: { state: "off" },
    });
    await idle(page);
    await page.evaluate(() => (window as any).__shp.reset());
}

async function push(page: Page, patch: StatePatch = {}, newRegistry = false): Promise<void> {
    await page.evaluate(({ patch, newRegistry }) => (window as any).__shp.push(patch, newRegistry), { patch, newRegistry });
}

/** Push an object whose only change is a sequence number on OTHER_LIGHT. */
async function pushSeq(page: Page, seq: number): Promise<void> {
    await push(page, { [OTHER_LIGHT]: { attributes: { seq } } });
}

async function publishCount(page: Page): Promise<number> {
    return page.evaluate(() => (window as any).__shp.publishes.length);
}

/** seq attribute of OTHER_LIGHT in the currently published hass. */
async function publishedSeq(page: Page): Promise<unknown> {
    return page.evaluate((id) => (window as any).__shp.el._hass.states[id].attributes.seq, OTHER_LIGHT);
}

async function cardTimers(page: Page) {
    return page.evaluate(() => {
        const el = (window as any).__shp.el;
        return {
            publish: el._hassPublishTimer !== undefined,
            settle: el._serviceSettleTimer !== undefined,
            pendingCalls: el._pendingServiceCalls,
        };
    });
}

async function openDetail(page: Page): Promise<void> {
    await page.evaluate(() => (window as any).__shp.el._openRoomDetail(0));
    await settle(page);
}

/** Close detail and wait for the history.back() it issues to land. */
async function closeDetail(page: Page): Promise<void> {
    await page.evaluate(async () => {
        const popped = new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true }));
        (window as any).__shp.el._closeRoomDetail();
        await popped;
    });
    await settle(page);
}

async function settle(page: Page): Promise<void> {
    await page.evaluate(() => (window as any).__shp.settle());
}

/** Let a pending trailing publish fire and a full interval pass after it, so the card is idle. */
async function idle(page: Page): Promise<void> {
    await page.clock.runFor(2_100);
    await settle(page);
}

/** Start a service call through the wrapper the children receive; returns the call index. */
async function startCall(page: Page, domain = "light", service = "turn_on"): Promise<number> {
    return page.evaluate(({ domain, service, entity }) => {
        const shp = (window as any).__shp;
        const returned = shp.el._hass.callService(domain, service, { entity_id: entity });
        const call = shp.calls[shp.calls.length - 1];
        if (returned !== call.promise) throw new Error("wrapper did not return the original promise");
        call.returned = returned;
        return shp.calls.length - 1;
    }, { domain, service, entity: LIGHT });
}

async function resolveCall(page: Page, index: number): Promise<void> {
    await page.evaluate(async (i) => {
        const call = (window as any).__shp.calls[i];
        call.resolve({ context: {} });
        await call.returned;
    }, index);
}

/**
 * Assert that pushing an object publishes it at once (immediate mode),
 * even right after a previous publish.
 */
async function expectImmediate(page: Page, seq: number): Promise<void> {
    const before = await publishCount(page);
    await pushSeq(page, seq);
    expect(await publishCount(page)).toBe(before + 1);
    expect(await publishedSeq(page)).toBe(seq);
}

/** Assert that a push right after a publish is held back by the throttle. */
async function expectThrottled(page: Page, seq: number): Promise<void> {
    const before = await publishCount(page);
    await pushSeq(page, seq);
    expect(await publishCount(page)).toBe(before);
    expect((await cardTimers(page)).publish).toBe(true);
}

test.describe("Scalable House Plan - hass coalescing", () => {
    test("runs the coalescing bundle", async ({ page }) => {
        await setupPlan(page);
        // Guards against a stale dist/ bundle: the coalescing members must exist.
        const hasCoalescing = await page.evaluate(() => {
            const el = (window as any).__shp.el;
            return typeof el._callService === "function" && "_pendingServiceCalls" in el;
        });
        expect(hasCoalescing).toBe(true);
    });

    test("throttle: burst, steady stream, idle, latest states", async ({ page }) => {
        await setupPlan(page);

        // 50 objects within 1 s: the immediate first one and one trailing publish.
        for (let i = 0; i < 50; i++) {
            await pushSeq(page, i);
            if (i < 49) await page.clock.runFor(19);
        }
        expect(await publishCount(page)).toBe(1);
        await page.clock.runFor(100);
        await settle(page);
        expect(await publishCount(page)).toBe(2);
        expect(await publishedSeq(page)).toBe(49);
        // Every overview room re-rendered once per publish, not once per object.
        expect(await page.evaluate(() => (window as any).__shp.roomRenders)).toBe(2 * FIXTURE_CARD.rooms.length);

        // Idle: no publishes and no running timer.
        await page.clock.runFor(5_000);
        expect(await publishCount(page)).toBe(2);
        expect(await cardTimers(page)).toEqual({ publish: false, settle: false, pendingCalls: 0 });

        // Steady 6/s for 5 s: one publish per second.
        await page.evaluate(() => (window as any).__shp.reset());
        let seq = 100;
        for (let i = 0; i < 30; i++) {
            await pushSeq(page, seq++);
            await page.clock.runFor(167);
        }
        await page.clock.runFor(1_000);
        const times: number[] = await page.evaluate(() => (window as any).__shp.publishes.map((p: any) => p.t));
        expect(times.length).toBe(6);
        for (let i = 1; i < times.length; i++) {
            expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(1_000);
        }
        expect(await publishedSeq(page)).toBe(seq - 1);
        expect((await cardTimers(page)).publish).toBe(false);
    });

    test("navigation flushes the pending state", async ({ page }) => {
        await setupPlan(page);

        await pushSeq(page, 1);
        await page.clock.runFor(100);
        await pushSeq(page, 2);
        await page.clock.runFor(200);
        expect(await publishedSeq(page)).toBe(1);

        // Open detail: shows the state that arrived 200 ms earlier without waiting for the tick.
        await openDetail(page);
        const detailSeq = await page.evaluate((id) => {
            const detail = (window as any).__shp.el.shadowRoot.querySelector("scalable-house-plan-detail");
            return detail.hass.states[id].attributes.seq;
        }, OTHER_LIGHT);
        expect(detailSeq).toBe(2);

        // Close detail the same way.
        await pushSeq(page, 3);
        await page.clock.runFor(200);
        expect(await publishedSeq(page)).toBe(2);
        await closeDetail(page);
        const overviewSeq = await page.evaluate((id) => {
            const shp = (window as any).__shp;
            if (shp.el.shadowRoot.querySelector("scalable-house-plan-detail")) throw new Error("detail still open");
            return shp.el.shadowRoot.querySelector("scalable-house-plan-overview").hass.states[id].attributes.seq;
        }, OTHER_LIGHT);
        expect(overviewSeq).toBe(3);
    });

    test("detail renders the info box without waiting for a hass publish", async ({ page }) => {
        const [livingRoom, ...otherRooms] = FIXTURE_CARD.rooms;
        await setupPlan(page, {
            // An info box needs a matching element_defaults entry: without one its frozen
            // config is used as-is and renderElements can't write room_entities into it.
            element_defaults: [{ element: { type: "custom:info-box-shp" } }],
            rooms: [
                {
                    ...livingRoom,
                    entities: [
                        ...livingRoom.entities,
                        { entity: "", plan: { left: 350, top: 50, element: { type: "custom:info-box-shp" } } },
                    ],
                },
                ...otherRooms,
            ],
        });

        // The clock stays paused and nothing is pushed, so no further publish can re-render the detail.
        const before = await publishCount(page);
        await openDetail(page);
        await expect.poll(() => page.evaluate(() => {
            const detail = (window as any).__shp.el.shadowRoot.querySelector("scalable-house-plan-detail");
            const infoBox = detail?.shadowRoot.querySelector("scalable-house-plan-room")?.shadowRoot.querySelector("info-box-shp");
            return infoBox?.shadowRoot?.querySelectorAll(".info-item").length ?? 0;
        }), { timeout: 5_000 }).toBeGreaterThan(0);
        expect(await publishCount(page)).toBe(before);
    });

    test("actions: immediate publishing until 5 s after the last call settles", async ({ page }) => {
        await setupPlan(page);
        const haCallServiceSame = () =>
            page.evaluate(() => (document.querySelector("home-assistant") as any).hass.callService === (window as any).__shp.haCallService);
        expect(await haCallServiceSame()).toBe(true);

        // Confirmation arriving before the call resolves.
        await pushSeq(page, 1);
        const c0 = await startCall(page);
        expect((await cardTimers(page)).pendingCalls).toBe(1);
        await expectImmediate(page, 2);
        await expectImmediate(page, 3);
        await resolveCall(page, c0);

        // Confirmation arriving after it resolves but within 5 s.
        await page.clock.runFor(2_000);
        await expectImmediate(page, 4);
        await page.clock.runFor(100);
        await expectImmediate(page, 5);
        await page.clock.runFor(2_800);   // 4.9 s after settle
        await expectImmediate(page, 6);
        await page.clock.runFor(200);     // 5.1 s after settle: throttling resumes
        expect((await cardTimers(page)).settle).toBe(false);
        await expectThrottled(page, 7);
        await idle(page);

        // Two overlapping calls: immediate until 5 s after the second settles.
        const c1 = await startCall(page);
        const c2 = await startCall(page);
        expect((await cardTimers(page)).pendingCalls).toBe(2);
        await resolveCall(page, c1);
        await page.clock.runFor(6_000);
        await expectImmediate(page, 10);
        await expectImmediate(page, 11);
        await resolveCall(page, c2);
        await page.clock.runFor(4_900);
        await expectImmediate(page, 12);
        await page.clock.runFor(200);
        await expectThrottled(page, 13);
        await idle(page);

        // A rejected call: the rejection reaches the caller unchanged.
        const c3 = await startCall(page);
        await expectImmediate(page, 20);
        const sameError = await page.evaluate(async (i) => {
            const call = (window as any).__shp.calls[i];
            const err = new Error("boom");
            call.reject(err);
            try {
                await call.returned;
                return false;
            } catch (e) {
                return e === err;
            }
        }, c3);
        expect(sameError).toBe(true);
        await page.clock.runFor(4_900);
        await expectImmediate(page, 21);
        await page.clock.runFor(200);
        await expectThrottled(page, 22);

        expect(await haCallServiceSame()).toBe(true);
    });

    test("receivers: room long-press and climate control use the wrapper", async ({ page }) => {
        await setupPlan(page);

        // Room long-press toggles the room's lights.
        await page.evaluate(() => {
            const shp = (window as any).__shp;
            const room = shp.deepAll(shp.el.shadowRoot, "scalable-house-plan-room")
                .find((r: any) => r.mode === "overview" && r.room.name === "Obývák");
            if (room.hass.callService !== shp.el._callService) throw new Error("room did not receive the wrapper");
            room.shadowRoot.querySelector(".room-polygon")
                .dispatchEvent(new CustomEvent("action", { detail: { action: "hold" } }));
        });
        let calls = await page.evaluate(() => (window as any).__shp.calls.map((c: any) => c.args));
        expect(calls).toEqual([["light", "turn_on", { entity_id: LIGHT }]]);
        expect((await cardTimers(page)).pendingCalls).toBe(1);

        // Climate HVAC mode selection.
        await page.evaluate(() => {
            const shp = (window as any).__shp;
            const climate = shp.deepAll(shp.el.shadowRoot, "climate-shp")[0];
            if (!climate) throw new Error("climate-shp not rendered");
            climate._handleMenuSelect({ detail: { item: { value: "off" } } });
        });
        calls = await page.evaluate(() => (window as any).__shp.calls.map((c: any) => c.args));
        expect(calls[1]).toEqual(["climate", "set_hvac_mode", { entity_id: CLIMATE, hvac_mode: "off" }]);
        expect((await cardTimers(page)).pendingCalls).toBe(2);
    });

    test("opt-out: realtime_updates publishes every object as-is", async ({ page }) => {
        await setupPlan(page, { realtime_updates: true });

        for (let i = 0; i < 5; i++) {
            await pushSeq(page, i);
            const sameObject = await page.evaluate(() => (window as any).__shp.el._hass === (window as any).__shp.last);
            expect(sameObject).toBe(true);
            expect(await cardTimers(page)).toEqual({ publish: false, settle: false, pendingCalls: 0 });
        }
        expect(await publishCount(page)).toBe(5);

        // No wrapper: children call the mocked (incoming) callService directly.
        await page.evaluate(() => {
            (window as any).__shp.el._hass.callService("light", "turn_on", {});
        });
        expect(await cardTimers(page)).toEqual({ publish: false, settle: false, pendingCalls: 0 });
    });

    test("opt-out: runtime switch flushes pending state and back resumes throttling", async ({ page }) => {
        await setupPlan(page);

        // Throttle timer pending with a dirty object.
        await pushSeq(page, 3);
        await expectThrottled(page, 4);
        // false -> true: pending object published as-is, no timers left.
        await page.evaluate(() => {
            const el = (window as any).__shp.el;
            el.setConfig({ ...el.config, realtime_updates: true });
        });
        expect(await page.evaluate(() => (window as any).__shp.el._hass === (window as any).__shp.last)).toBe(true);
        expect(await publishedSeq(page)).toBe(4);
        expect(await cardTimers(page)).toEqual({ publish: false, settle: false, pendingCalls: 0 });

        await pushSeq(page, 5);
        expect(await page.evaluate(() => (window as any).__shp.el._hass === (window as any).__shp.last)).toBe(true);

        // A call started before the switch and settling after it leaves no timer behind.
        await page.evaluate(() => {
            const el = (window as any).__shp.el;
            el.setConfig({ ...el.config, realtime_updates: false });
        });
        await idle(page);
        await pushSeq(page, 10);
        const c0 = await startCall(page);
        await page.evaluate(() => {
            const el = (window as any).__shp.el;
            el.setConfig({ ...el.config, realtime_updates: true });
        });
        expect(await cardTimers(page)).toEqual({ publish: false, settle: false, pendingCalls: 0 });
        await resolveCall(page, c0);
        expect(await cardTimers(page)).toEqual({ publish: false, settle: false, pendingCalls: 0 });

        // true -> false: throttling resumes.
        await page.evaluate(() => {
            const el = (window as any).__shp.el;
            el.setConfig({ ...el.config, realtime_updates: false });
        });
        await idle(page);
        await expectImmediate(page, 6);
        expect(await page.evaluate(() => (window as any).__shp.el._hass !== (window as any).__shp.last)).toBe(true);
        await expectThrottled(page, 7);
    });

    test("lifecycle: disconnect clears timers, reconnect publishes, detail cycles leave no timers", async ({ page }) => {
        await setupPlan(page);
        // Move the card into a detached holder: hui-card re-appends a card left without a parent.
        const detach = () => page.evaluate(() => {
            const shp = (window as any).__shp;
            shp.parent = shp.el.parentNode;
            shp.next = shp.el.nextSibling;
            document.createElement("div").appendChild(shp.el);
        });
        const reattach = () => page.evaluate(() => {
            const shp = (window as any).__shp;
            shp.parent.insertBefore(shp.el, shp.next);
        });

        // Settle timer pending -> cleared on disconnect.
        const c0 = await startCall(page);
        await resolveCall(page, c0);
        expect((await cardTimers(page)).settle).toBe(true);
        await detach();
        expect(await cardTimers(page)).toEqual({ publish: false, settle: false, pendingCalls: 0 });
        await reattach();
        await idle(page);

        // Throttle timer pending with a dirty object -> cleared; reconnect publishes at once.
        await pushSeq(page, 1);
        await expectThrottled(page, 2);
        await detach();
        expect((await cardTimers(page)).publish).toBe(false);
        const before = await publishCount(page);
        await page.clock.runFor(2_000);
        expect(await publishCount(page)).toBe(before);
        await reattach();
        expect(await publishCount(page)).toBe(before + 1);
        expect(await publishedSeq(page)).toBe(2);
        await idle(page);

        // 30 detail open/close cycles with incoming objects in between.
        for (let i = 0; i < 30; i++) {
            await pushSeq(page, 100 + i);
            await openDetail(page);
            await page.clock.runFor(50);
            await pushSeq(page, 200 + i);
            await closeDetail(page);
            await page.clock.runFor(50);
        }
        expect(await publishedSeq(page)).toBe(229);
        expect(await cardTimers(page)).toEqual({ publish: false, settle: false, pendingCalls: 0 });
    });

    test("regression: elapsed labels tick, motion delay expires, registry change recomputes caches", async ({ page }) => {
        await setupPlan(page);

        // Elapsed-time label ticks without any publish.
        await push(page, { [MOTION]: { state: "off", last_changed_ago_ms: 10_000 } });
        await settle(page);
        const labelText = () => page.evaluate(() => {
            const shp = (window as any).__shp;
            return shp.deepAll(shp.el.shadowRoot, "last-change-text-shp")[0]._text as string;
        });
        const first = await labelText();
        const publishesBefore = await publishCount(page);
        await page.clock.runFor(3_000);
        await settle(page);
        expect(await labelText()).not.toBe(first);
        expect(await publishCount(page)).toBe(publishesBefore);

        // Motion-delay expiry recolors the room (motion_delay_seconds: 10).
        const roomColor = () => page.evaluate(() => {
            const shp = (window as any).__shp;
            const room = shp.deepAll(shp.el.shadowRoot, "scalable-house-plan-room")
                .find((r: any) => r.mode === "overview" && r.room.name === "Obývák");
            return room._currentColor?.type as string;
        });
        await push(page, { [MOTION]: { state: "on", last_changed_ago_ms: 0 } });
        await settle(page);
        expect(await roomColor()).toBe("motion");
        await idle(page);
        await push(page, { [MOTION]: { state: "off", last_changed_ago_ms: 0 } });
        await settle(page);
        expect(await roomColor()).toBe("motion");
        // The room recomputes its color on the next published hass after the delay
        // expires; feed a steady 6/s stream of unrelated updates as HA does.
        const streamFor = async (ms: number) => {
            for (let t = 0; t < ms; t += 167) {
                await pushSeq(page, t);
                await page.clock.runFor(167);
            }
            await settle(page);
        };
        await streamFor(9_500);
        expect(await roomColor()).toBe("motion");
        await streamFor(1_700);   // delay expired at 10 s; at most one publish interval later
        expect(await roomColor()).not.toBe("motion");

        // Registry change (new `entities` ref) recomputes room caches; a states-only change does not.
        await page.evaluate(() => {
            const el = (window as any).__shp.el;
            const orig = el._computeRoomEntityCaches;
            el.__cacheRuns = 0;
            el._computeRoomEntityCaches = function () {
                el.__cacheRuns++;
                return orig.call(this);
            };
            el.__cacheBefore = el._roomEntityCache.get("Obývák");
        });
        await idle(page);
        await pushSeq(page, 1);
        await settle(page);
        expect(await page.evaluate(() => (window as any).__shp.el.__cacheRuns)).toBe(0);
        await idle(page);
        await push(page, {}, true);
        await settle(page);
        const recomputed = await page.evaluate(() => {
            const el = (window as any).__shp.el;
            return { runs: el.__cacheRuns, replaced: el._roomEntityCache.get("Obývák") !== el.__cacheBefore };
        });
        expect(recomputed).toEqual({ runs: 1, replaced: true });
    });
});

test.describe("Scalable House Plan - realtime_updates editor switch", () => {
    test("writes the realtime_updates option", async ({ page }) => {
        await openTestDashboard(page);
        await provisionTestDashboard(page);
        await openTestDashboard(page);
        await enterDashboardEditMode(page);
        await openCardEditor(page);

        const editor = page.locator("scalable-house-plan-editor");
        // Expand the basic configuration section (first collapsible section).
        await editor.locator(".config-section .section-header").first().click();
        const toggle = editor.locator('ha-formfield[label^="Aktualizace v reálném čase"] ha-switch');
        await toggle.click();

        const value = await editor.evaluate((el: any) => el._config.realtime_updates);
        expect(value).toBe(true);
    });
});
