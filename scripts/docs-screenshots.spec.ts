import { test, expect, type Locator, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";
import { parse } from "yaml";
import { buildDashboardConfig, provisionDashboard } from "../tests/helpers/dashboard";
import { enterDashboardEditMode, openCardEditor } from "../tests/helpers/ha";

/**
 * Regenerates every screenshot of the manual (docs/assets/images/*.png) from
 * the Willow Lane demo in docs/demo/. Run with `npm run docs:screenshots`
 * against the local dev Home Assistant.
 *
 * Nothing of the Home Assistant it runs against may appear: before the card
 * renders, an init script replaces hass.states, entities, devices, areas and
 * floors wholesale with the fictional set from willow-lane-states.json (in
 * hass and in HA's context providers), service and REST calls do nothing, and
 * history returns no data. Every shot is a crop of the
 * card element (or of the card editor), never the page. Language (English),
 * theme (dark) and the hidden sidebar are set in this browser profile only.
 */

const ROOT = path.resolve(__dirname, "..");
const DEMO_DIR = path.join(ROOT, "docs/demo");
const OUT_DIR = path.join(ROOT, "docs/assets/images");

const URL_PATH = "shp-docs-demo";
const TITLE = "Willow Lane";
const DESKTOP = { width: 1280, height: 852 };
const PHONE = { width: 390, height: 844 };
const EDITOR = { width: 1280, height: 1400 };  // Tall enough for the whole editor dialog

const CARD = parse(fs.readFileSync(path.join(DEMO_DIR, "willow-lane.yaml"), "utf8"));
const DEMO = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, "willow-lane-states.json"), "utf8"));
const DEMO_ENTITY_IDS: string[] = DEMO.entities.map((e: { entity_id: string }) => e.entity_id).sort();

/**
 * Runs in the page before Home Assistant's scripts: every hass object the
 * `home-assistant` element receives is swapped for one that only knows Willow Lane.
 */
function installWillowLane(demo: any) {
    // Only Home Assistant's own page, not iframes inside the card.
    if (window !== window.top) return;

    for (const [key, value] of Object.entries({
        selectedLanguage: "en",
        selectedTheme: { theme: "default", dark: true },
        dockedSidebar: "always_hidden",
    })) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    const now = Date.now();
    const states: Record<string, any> = {};
    const entities: Record<string, any> = {};
    const devices: Record<string, any> = {};
    const areas: Record<string, any> = {};
    const floors: Record<string, any> = {};

    for (const a of demo.areas) {
        areas[a.area_id] = { aliases: [], floor_id: null, labels: [], picture: null, ...a };
    }
    for (const d of demo.devices) {
        devices[d.id] = {
            area_id: d.area_id, name: d.name, name_by_user: null, manufacturer: d.manufacturer, model: d.model,
            config_entries: [], connections: [], identifiers: [], labels: [], disabled_by: null,
            entry_type: null, via_device_id: null, primary_config_entry: null, id: d.id,
        };
    }
    for (const e of demo.entities) {
        const changed = new Date(now - (e.changed_minutes_ago ?? 10) * 60_000).toISOString();
        states[e.entity_id] = {
            entity_id: e.entity_id,
            state: e.state,
            attributes: { friendly_name: e.name, ...e.attributes },
            last_changed: changed,
            last_updated: changed,
            last_reported: changed,
            context: { id: "willow-lane", parent_id: null, user_id: null },
        };
        entities[e.entity_id] = {
            entity_id: e.entity_id, name: e.name, platform: "demo", labels: [], hidden: false,
            entity_category: null, area_id: e.area ?? null, device_id: e.device ?? null,
        };
    }

    // What HA's lazy fullEntities context would fetch: the full entity registry.
    const fullEntities = Object.values(entities).map((e) => ({
        ...e, id: e.entity_id, unique_id: e.entity_id, icon: null, original_name: e.name,
        disabled_by: null, hidden_by: null, config_entry_id: null, has_entity_name: false, options: null, categories: {},
    }));

    // Card reads that would otherwise reach the real Home Assistant.
    const stubbedWS: Record<string, unknown> = {
        "alarmo/entities": [],
        "alarmo/sensors": {},
        "history/history_during_period": {},
        "recorder/statistics_during_period": {},
    };
    const wrapCallWS = (callWS: any) => {
        if (callWS.__willowLane) return callWS;
        const wrapped = (msg: any) =>
            msg.type in stubbedWS ? Promise.resolve(stubbedWS[msg.type]) : callWS(msg);
        wrapped.__willowLane = true;
        return wrapped;
    };

    // The user's stored profile settings (language, theme) are overridden in this
    // page only; nothing is saved back to Home Assistant.
    const userData: Record<string, unknown> = {
        language: { language: "en", number_format: "language", time_format: "language", date_format: "language", first_weekday: "language" },
        theme: { theme: "default", dark: true },
    };
    const overrideUserData = (conn: any) => {
        if (!conn || conn.__willowLane) return;
        const subscribeMessage = conn.subscribeMessage.bind(conn);
        conn.subscribeMessage = (callback: any, msg: any, options: any) =>
            msg?.type === "frontend/subscribe_user_data" && msg.key in userData
                ? subscribeMessage((ev: any) => callback({ ...ev, value: { ...ev?.value, ...(userData[msg.key] as object) } }), msg, options)
                : subscribeMessage(callback, msg, options);
        conn.__willowLane = true;
    };

    const callService = async () => ({ context: { id: "willow-lane" } });
    // REST calls (the card's template rendering) return nothing.
    const callApi = async () => "";

    // The registries must keep their identity: HA recomputes its format functions
    // (and sets hass again) whenever one of them changes.
    const toWillowLane = (hass: any) => hass && (overrideUserData(hass.connection), {
        ...hass,
        states,
        entities,
        devices,
        areas,
        floors,
        callService,
        callApi,
        callWS: hass.callWS && wrapCallWS(hass.callWS),
    });

    // HA also hands the raw objects to its context providers (ha-state-icon reads
    // the entities context): those always hold the Willow Lane objects as well.
    const pinContext = (provider: any, value: unknown) => {
        if (!provider?.setValue) throw new Error("home-assistant has no such context provider");
        const setValue = provider.setValue.bind(provider);
        provider.setValue = (_: unknown, force?: boolean) => setValue(value, force);
        provider.setValue(value);
    };

    customElements.whenDefined("home-assistant").then(() => {
        const el = document.querySelector("home-assistant") as any;
        let proto = Object.getPrototypeOf(el);
        let desc: PropertyDescriptor | undefined;
        while (proto && !(desc = Object.getOwnPropertyDescriptor(proto, "hass"))) {
            proto = Object.getPrototypeOf(proto);
        }
        if (!desc?.set) throw new Error("home-assistant has no hass accessor");
        for (const [key, value] of Object.entries({ states, entities, devices, areas, floors })) {
            pinContext(el.__contextProviders?.[key], value);
        }
        pinContext(el.__lazyContextProviders?.fullEntities?._provider, fullEntities);
        Object.defineProperty(el, "hass", {
            configurable: true,
            get() { return desc!.get!.call(this); },
            set(value) { desc!.set!.call(this, toWillowLane(value)); },
        });
        (window as any).__willowLane = true;
        if (el.hass) el.hass = el.hass;
    });
}

/** Leak guard: the page must know exactly the Willow Lane entities and nothing else. */
async function expectOnlyWillowLane(page: Page): Promise<void> {
    const known = await page.evaluate(() => {
        const el = document.querySelector("home-assistant") as any;
        const hass = el?.hass;
        const contexts = el?.__contextProviders ?? {};
        const fullEntities = el?.__lazyContextProviders?.fullEntities?._provider?.value;
        return {
            installed: (window as any).__willowLane === true,
            contexts: ["states", "entities", "devices", "areas", "floors"]
                .filter((key) => contexts[key]?.value !== hass?.[key]),
            fullEntities: (fullEntities ?? []).map((e: { entity_id: string }) => e.entity_id).sort(),
            states: Object.keys(hass?.states ?? {}).sort(),
            entities: Object.keys(hass?.entities ?? {}).sort(),
            areas: Object.keys(hass?.areas ?? {}).length,
            floors: Object.keys(hass?.floors ?? {}).length,
            language: hass?.language,
        };
    });
    expect(known.installed, "Willow Lane injection is not installed").toBe(true);
    expect(known.contexts, "HA context providers hold something besides Willow Lane").toEqual([]);
    expect(known.fullEntities, "the entity registry context holds something besides Willow Lane")
        .toEqual(known.fullEntities.length ? DEMO_ENTITY_IDS : []);
    expect(known.states, "hass.states holds something besides Willow Lane").toEqual(DEMO_ENTITY_IDS);
    expect(known.entities, "hass.entities holds something besides Willow Lane").toEqual(DEMO_ENTITY_IDS);
    expect(known.areas).toBe(DEMO.areas.length);
    expect(known.floors).toBe(0);
    expect(known.language).toBe("en");
}

async function serveDemoFiles(page: Page): Promise<void> {
    await page.route("**/local/willow-lane.jpg", (route) =>
        route.fulfill({ path: path.join(DEMO_DIR, "willow-lane.jpg") }));
    // Cameras and the image entity show one static frame: there is no real stream.
    await page.route((url) => /^\/api\/(camera_proxy|camera_proxy_stream|image_proxy)\//.test(url.pathname), (route) =>
        route.fulfill({ path: path.join(DEMO_DIR, "camera-placeholder.jpg") }));
}

function card(page: Page): Locator {
    return page.locator("hui-panel-view scalable-house-plan").first();
}

async function openPlan(page: Page, viewport: { width: number; height: number }): Promise<void> {
    await page.setViewportSize(viewport);
    await page.goto(`/${URL_PATH}`);
    const room = card(page).locator("scalable-house-plan-room").first();
    // Now and then the dashboard doesn't render on the first load; a reload brings it.
    await room.waitFor({ state: "attached", timeout: 20_000 }).catch(async () => {
        await page.reload();
        await room.waitFor({ state: "attached", timeout: 20_000 });
    });
    await expectOnlyWillowLane(page);
    await settle(page);
}

/** Let images, icons and HA's lazy components finish loading. */
async function settle(page: Page): Promise<void> {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
}

async function cardCall(page: Page, method: string, ...args: unknown[]): Promise<void> {
    await card(page).evaluate((el: any, { method, args }) => el[method](...args), { method, args });
    await settle(page);
}

function roomIndex(name: string): number {
    const index = CARD.rooms.findIndex((room: { name: string }) => room.name === name);
    if (index < 0) throw new Error(`No room ${name} in willow-lane.yaml`);
    return index;
}

/** Opens a room's detail (replacing an open one), as a tap on the room would. */
async function openRoom(page: Page, name: string): Promise<void> {
    await cardCall(page, "_openRoomDetail", roomIndex(name));
    await card(page).locator("scalable-house-plan-detail").waitFor();
}

/** Writes a 256-colour PNG, optionally cropped (in CSS pixels of the shot). */
async function save(name: string, shot: Buffer, crop?: { left: number; top: number; width: number; height: number }): Promise<void> {
    let image = sharp(shot);
    if (crop) {
        // Intersect the crop with the shot.
        const { width = 0, height = 0 } = await image.metadata();
        const left = Math.max(0, Math.round(crop.left));
        const top = Math.max(0, Math.round(crop.top));
        const right = Math.min(width, Math.round(crop.left + crop.width));
        const bottom = Math.min(height, Math.round(crop.top + crop.height));
        if (right <= left || bottom <= top) {
            throw new Error(`${name}: crop ${JSON.stringify(crop)} lies outside the ${width}x${height} shot`);
        }
        image = sharp(shot).extract({ left, top, width: right - left, height: bottom - top });
    }
    fs.mkdirSync(OUT_DIR, { recursive: true });
    await image.png({ palette: true, colors: 256, effort: 10 }).toFile(path.join(OUT_DIR, `${name}.png`));
}

/** Screenshot of a target (the card, or the card editor) once its images are decoded. */
async function capture(target: Locator): Promise<Buffer> {
    for (const img of await target.locator("img").all()) {
        await img.evaluate((el: HTMLImageElement) => el.decode().catch(() => undefined));
    }
    // Freeze animations (the motion pulse) at their start. Playwright's own
    // `animations: "disabled"` cancels them, and after that Chrome stops painting
    // the plan picture in rooms opened later in the same page.
    const freeze = (play: boolean) => target.page().evaluate((play) => {
        for (const animation of document.getAnimations()) {
            if (play) {
                animation.play();
            } else {
                animation.pause();
                animation.currentTime = 0;
            }
        }
    }, play);
    await freeze(false);
    const shot = await target.screenshot();
    await freeze(true);
    return shot;
}

async function shoot(name: string, target: Locator): Promise<void> {
    await save(name, await capture(target));
}

/** Screenshot of the card, cropped to the area around `targets` plus `pad` pixels. */
async function shootAround(page: Page, name: string, targets: Locator[], pad = 40): Promise<void> {
    const cardBox = (await card(page).boundingBox())!;
    const boxes = await Promise.all(targets.map(async (t) => (await t.boundingBox())!));
    const left = Math.min(...boxes.map((b) => b.x)) - pad - cardBox.x;
    const top = Math.min(...boxes.map((b) => b.y)) - pad - cardBox.y;
    const right = Math.max(...boxes.map((b) => b.x + b.width)) + pad - cardBox.x;
    const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + pad - cardBox.y;
    await save(name, await capture(card(page)), {
        left, top, width: right - left, height: bottom - top,
    });
}

/** Screenshot of the card, cropped to an area of the plan picture (overview only). */
async function shootPlanArea(page: Page, name: string, [x0, y0, x1, y1]: number[]): Promise<void> {
    const box = (await card(page).boundingBox())!;
    const sx = box.width / CARD.image_width;
    const sy = box.height / CARD.image_height;
    await save(name, await capture(card(page)), {
        left: x0 * sx, top: y0 * sy, width: (x1 - x0) * sx, height: (y1 - y0) * sy,
    });
}

/** An element placed in the open room detail, by entity ID or (no-entity elements) type prefix. */
function element(page: Page, uniqueKey: string): Locator {
    return card(page).locator(`scalable-house-plan-detail .element-wrapper[data-unique-key^="${uniqueKey}"]`).first();
}

/** Shots of single elements, each taken in its room's detail: [image, room, elements, open its menu]. */
const ELEMENT_SHOTS: [string, string, string[], boolean?][] = [
    ["el-state-icon", "Kitchen & dining", ["light.kitchen_ceiling", "light.kitchen_under_cabinet"]],
    ["el-analog", "Kids' room", ["sensor.kids_room_co2"]],
    ["el-analog-bar", "Utility room", ["sensor.hot_water_tank_temperature"]],
    ["el-badge", "Hallway", ["alarm_control_panel.home"]],
    ["el-badges", "Utility room", ["custom:badges-shp"]],
    ["el-climate", "Main bedroom", ["climate.main_bedroom"], true],
    ["el-camera", "Driveway", ["camera.driveway"]],
    ["el-door-window", "Main bedroom", ["binary_sensor.main_bedroom_window"]],
    ["el-motion-sensor", "Hallway", ["binary_sensor.hallway_motion"]],
    ["el-gate-buttons", "Driveway", ["cover.driveway_gate"]],
    ["el-scripts-buttons-group", "Driveway", ["custom:scripts-buttons-group-shp"]],
    ["el-info-box", "Living room", ["custom:info-box-shp"]],
    ["el-group", "Office", ["custom:group-shp"]],
    ["el-image-last-change", "Driveway", ["image.driveway_snapshot"]],
    ["el-iframe", "Utility room", ["custom:iframe-shp"]],
];

test.describe.configure({ mode: "serial" });

// Every test starts from a fresh page: once a page has been screenshotted, Chrome
// sometimes stops painting the plan picture in rooms opened afterwards.
test.beforeEach(async ({ page }) => {
    await page.addInitScript(installWillowLane, DEMO);
    await serveDemoFiles(page);
});

test("provision the demo dashboard", async ({ page }) => {
    // The demo dashboard may not exist yet (HA answers 404), so provision it from another panel.
    await page.goto("/profile");
    await provisionDashboard(page, URL_PATH, TITLE, buildDashboardConfig(CARD, TITLE), false);
});

test("overview", async ({ page }) => {
    await openPlan(page, DESKTOP);
    await shoot("overview", card(page));
    await shootPlanArea(page, "dynamic-colors", [420, 410, 1240, 760]);
});

test("room detail", async ({ page }) => {
    await openPlan(page, DESKTOP);
    await openRoom(page, "Living room");
    await shoot("room-detail", card(page));
});

test("dashboard room", async ({ page }) => {
    await openPlan(page, DESKTOP);
    await openRoom(page, "Utility room");
    await shoot("dashboard-room", card(page));
});

for (const [name, room, keys, openMenu] of ELEMENT_SHOTS) {
    test(name, async ({ page }) => {
        await openPlan(page, DESKTOP);
        await openRoom(page, room);
        const targets = keys.map((key) => element(page, key));
        // Elements whose content is positioned outside their (empty) wrapper
        const content = await Promise.all(targets.map(async (t) =>
            (await t.boundingBox({ timeout: 15_000 }))?.width ? t : t.locator("ha-button").first()));
        if (openMenu) {
            await targets[0].locator("button.trigger").click();
            const items = targets[0].locator("ha-dropdown-item").filter({ visible: true });
            await items.last().waitFor();
            content.push(items.first(), items.last());
        }
        await shootAround(page, name, content);
    });
}

test("phone overview", async ({ page }) => {
    await openPlan(page, PHONE);
    await shoot("overview-phone", card(page));
});

test("phone room detail", async ({ page }) => {
    await openPlan(page, PHONE);
    await openRoom(page, "Office");
    await shoot("room-detail-phone", card(page));
});

test("phone entities view", async ({ page }) => {
    await openPlan(page, PHONE);
    await openRoom(page, "Utility room");
    await cardCall(page, "_openEntitiesView");
    await shoot("entities-phone", card(page));
});

async function openEditor(page: Page): Promise<Locator> {
    await openPlan(page, EDITOR);
    await enterDashboardEditMode(page);
    await openCardEditor(page, "Edit");
    await settle(page);
    await expectOnlyWillowLane(page);
    return page.locator("scalable-house-plan-editor");
}

test("card editor", async ({ page }) => {
    await shoot("editor", await openEditor(page));
});

test("room outline in the editor", async ({ page }) => {
    const editor = await openEditor(page);
    const livingRoom = editor.locator("editor-room-shp").filter({ hasText: "Living room" });
    await livingRoom.locator('button[title="Show detail preview"]').click();
    const preview = page.locator("hui-dialog-edit-card").locator("scalable-house-plan").first();
    await preview.locator("boundary-handles-shp").waitFor();
    await settle(page);
    await shoot("editor-outline", preview);
});
