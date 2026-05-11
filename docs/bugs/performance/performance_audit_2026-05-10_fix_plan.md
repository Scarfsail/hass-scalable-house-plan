# Performance Audit 2026-05-10 — Implementation Plan

**Audit doc:** `performance_audit_2026-05-10.md`
**Created:** 2026-05-10
**Reviewed:** 2026-05-10 (cross-checked by code-reviewer subagent; revisions below incorporate that feedback)
**Goal:** Implement all 7 fixes incrementally, smallest-blast-radius first, with explicit regression analysis on each. Each fix is a separate commit so any regression can be bisected to a single change.

> **Review revisions applied:** Fix F now invalidates on config-flag change (was missing). Fix E dropped sub-step E2 (rect cache had stale-on-scroll regression risk). Fix G moves `tap_action`/`hold_action` injection out of the cached path (they depend on `hass.states.attributes.icon`). Documentation notes added for B, D, G.

---

## Session Workflow (per fix)

1. Re-read the affected code; confirm the fix premise still matches reality.
2. Implement the fix exactly as specified below — no scope creep.
3. Tell the user the specific test steps in **Verification** for that fix.
4. After user confirms: commit with `perf:` prefix (Angular convention → patch release).
5. Mark the fix DONE in the **Status** column at the bottom.

**Do not skip the verification step.** Each fix has a specific behavior to confirm.

---

## Fix Order Rationale

The order minimizes the chance one fix masks a regression in another:

1. Pure utility fixes first (#7 dead-code, #6 dayjs, #2 template cache, #4 actionHandler) — these are local to one function, with trivially equivalent semantics.
2. Single-component fixes next (#5 overview willUpdate) — touches one component, contained blast radius.
3. Caching fixes last (#1 buildElementStructure, #3 sensor-scan gating) — these modify shared hot paths that could mask state-staleness bugs in earlier fixes.

---

## Fix A — Remove dead Maps from `HouseCache` (was #7)

**File:** `src/cards/scalable-house-plan.ts:42-46`

**Change:** Delete `elementMetadata` and `elementStructure` fields from `HouseCache`. Keep only `position`.

**Regression analysis:**
- Repo-wide grep for `.elementMetadata` and `.elementStructure` shows zero writes; the Maps are allocated but never populated or read.
- Type system catches any accidental external use after removal.

**Verification:**
- `npm run build-prod` succeeds.
- App loads, overview & detail render normally.

**Commit:** `perf(cache): remove unused HouseCache.elementMetadata and elementStructure maps`

---

## Fix B — Replace `dayjs` calls in `last-change-text-shp.render()` (was #6)

**File:** `src/components/last-change-text-shp.ts:71-73`

**Change:**
```ts
// Before:
const lastChangeBefore = lastChanged && dayjs.duration(dayjs().diff(lastChanged));
const secondsSinceChange = lastChangeBefore ? lastChangeBefore.asSeconds() : Infinity;

// After:
const secondsSinceChange = lastChanged
  ? (Date.now() - new Date(lastChanged).getTime()) / 1000
  : Infinity;
```

(Remove the `dayjs` and `Utils` imports if they become unused after this and Fix B's neighbors — likely still used by `_onTimerTick` via `Utils.formatDurationFromTo`, so keep import.)

**Regression analysis:**
- `dayjs.duration(dayjs().diff(x)).asSeconds()` and `(Date.now() - new Date(x).getTime()) / 1000` are mathematically identical for any valid ISO string `x` — both compute elapsed milliseconds and divide by 1000.
- Edge case: when `lastChanged` is undefined/null/empty, the original code's `lastChanged && …` guard set `lastChangeBefore = false`, yielding `secondsSinceChange = Infinity`. New code preserves this via the ternary.
- Edge case: invalid date string → `new Date('garbage').getTime()` returns `NaN` → `(now - NaN)/1000 = NaN` → comparisons return false → falls through to "muted" branch. Same as the dayjs path which would also produce NaN/0. Acceptable.

**Verification:**
- Trigger a recent state change (within 30 s) on a motion sensor; the text shows recent-color highlight.
- After 30 s, color shifts to mid; after 120 s, to muted.
- A sensor that has never changed (no `last_changed`) still renders without throwing.

**Note:** dayjs remains a dependency after this fix — `Utils.formatDurationFromTo` (called in `_onTimerTick`) still uses it. Bundle size will not shrink. This is intentional: the goal of Fix B is to remove per-render allocations on the hot path, not to eliminate dayjs entirely.

**Commit:** `perf(last-change): replace dayjs duration with native math in render`

---

## Fix C — Memoize `evalJsTemplate` compiled functions (was #2)

**File:** `src/utils/js-templates.ts`

**Change:** Add a module-level cache of compiled `Function` objects keyed by the template body string. Cap size to 200 to bound memory.

```ts
const compiledCache = new Map<string, Function>();
const MAX_COMPILED_CACHE = 200;

export function evalJsTemplate(thisArg: any, hass: HomeAssistant, entity: HassEntity | undefined, jsTemplate: any): any {
    const regMatches = jsTemplateRegex.exec(jsTemplate);
    jsTemplateRegex.lastIndex = 0;
    if (!regMatches || regMatches.length < 2) return jsTemplate;

    const func = regMatches[1];
    let compiled = compiledCache.get(func);
    if (!compiled) {
        if (compiledCache.size >= MAX_COMPILED_CACHE) compiledCache.clear();
        try {
            compiled = new Function('states', 'entity', 'user', 'hass', 'html',
                `'use strict'; ${func}`);
        } catch (err) {
            console.error(`Error compiling template (${func}):`, err);
            return "Error compiling template.";
        }
        compiledCache.set(func, compiled);
    }

    try {
        return compiled.call(thisArg, hass.states, entity, hass.user, hass, html);
    } catch (err) {
        console.error(`Error evaluating template (${func}):`, err);
        return "Error evaluating template.";
    }
}
```

**Regression analysis:**
- Compilation is the only cached step. Execution still happens with current `hass`/`entity`/`thisArg` arguments — runtime behavior unchanged.
- The compiled `Function` closes over **no** outer scope (constructed via `new Function`, not arrow) — no stale-state risk.
- If a user edits a template (in YAML), the new template body has a different string → cache miss → recompile. Old compiled function lingers until eviction. Bounded by `MAX_COMPILED_CACHE = 200`; full clear when exceeded. Memory bounded.
- Error path split into compile-error vs eval-error so a recurring eval-error doesn't poison the cache with a non-callable entry. The original code conflated the two — minor logging improvement, no behavior regression.

**Verification:**
- Configure a card with a JS template like `[[[ return states['sensor.foo'].state > 50 ? 'red' : 'green' ]]]`.
- Trigger a state change that crosses the threshold; color updates correctly.
- Reload the dashboard; behavior identical.

**Commit:** `perf(js-templates): cache compiled Function objects to avoid re-parsing per render`

---

## Fix D — Skip `actionHandler` rebind when options unchanged (was #4)

**File:** `src/utils/action-handler.ts:82-104`

**Change:** Early-return from `bind()` when the new `options` are equivalent to the previously stored `options` for that element. Only `hasHold`, `disabled`, and `hasDoubleClick` actually affect bind behavior, so a shallow compare on those is sufficient.

```ts
public bind(element: ActionHandlerElement, options: ActionHandlerOptions = {}) {
    const existing = element.actionHandler;

    // Skip rebind when nothing relevant changed
    if (existing &&
        existing.options.hasHold === options.hasHold &&
        existing.options.disabled === options.disabled &&
        existing.options.hasDoubleClick === options.hasDoubleClick) {
        return;
    }

    if (existing) {
        element.removeEventListener('touchstart', existing.start!);
        element.removeEventListener('touchend', existing.end!);
        element.removeEventListener('touchcancel', existing.end!);
        element.removeEventListener('mousedown', existing.start!);
        element.removeEventListener('click', existing.end!);
        element.removeEventListener('keydown', existing.handleKeyDown!);
    } else {
        // First-time only: install contextmenu blocker
        element.addEventListener('contextmenu', /* … unchanged … */);
    }

    // … rest of method unchanged …
}
```

**Regression analysis:**
- The compared fields are the **only** ones consumed by the bind logic (verified by reading the rest of the method — line 107 reads `disabled`, line 133 reads `hasHold`).
- The first call always proceeds (no `existing`).
- If someone introduces a new option later, they must add it to the comparison. Add a comment to that effect.
- Memory: not affected.
- Bug-equivalent edge case: `actionHandler({})` followed by `actionHandler({hasHold: true})` correctly rebinds (false === undefined would falsely match). Use explicit `!==` against the stored value, including `undefined`. The proposed comparison handles this because `undefined === undefined` initially, then `true !== undefined` triggers rebind. Walk through:
  - First call: `existing` undefined → proceed (full bind), store `{hasHold: undefined, …}`.
  - Second call `{hasHold: true}`: `existing.options.hasHold` (undefined) `=== options.hasHold` (true)? No → proceed. ✓
  - Subsequent identical calls: all three match → return early. ✓

**Verification:**
- Tap a room polygon → navigates to detail view (tap action works).
- Long-press a room polygon → toggles lights (hold action works).
- In editor mode, drag elements → drag still works (drag uses pointer events, unaffected, but verify no interaction).
- Tap an entity element → its tap action fires.

**Pre-existing limitation (not made worse by this fix):** `ActionHandlerController` is a module-level singleton with mutable gesture state (`timer`, `held`, `cancelled`, `startX/Y`). Two polygons (motion-normal + motion-inverted) on the same room both bind to this singleton; concurrent gestures across them would interfere. Fix D does not change this — it only skips redundant listener rebinds when options match.

**Commit:** `perf(action-handler): skip listener rebind when options unchanged`

---

## Fix E — Trim `scalable-house-plan-overview.willUpdate` (was #5)

**File:** `src/cards/scalable-house-plan-overview.ts`

> **Revised after review:** original plan had three sub-changes (E1 drop requestUpdate, E2 cache rect, E3 cache handlers). Sub-change E2 (rect cache) is **DROPPED** because scroll-induced shifts of `clientRect.top`/`bottom` don't fire `ResizeObserver` on the overview element, and stale cached rect components would feed wrong `visibleHeight`/`visibleWidth` into the viewport `<div>` style — a visible rendering defect. The forced layout from `getBoundingClientRect()` on every render is a pre-existing cost; eliminating it safely needs a more involved solution (e.g., IntersectionObserver) that's out of scope here.

Two independent sub-changes in one commit:

**E1.** Remove the `requestUpdate()` call from inside `willUpdate()` (line 67–69). The viewport-changed branch leaves `visibleHeight`/`visibleWidth` at 0 deliberately to fall back to `fitIntoHeight`/`fitIntoWidth` on first measurement. This kludge schedules a second render to re-enter willUpdate with `previousViewport` already updated, so the `else` branch runs and computes real visible dimensions.

  Replacement: compute visible dimensions in one pass regardless of viewport-change. Keep the `hasViewportChanged` call for its side-effect of updating `previousViewport`:
  ```ts
  hasViewportChanged(this.previousViewport); // side-effect: updates previousViewport
  visibleHeight = Math.max(0, Math.min(viewportHeight, clientRect.bottom) - Math.max(0, clientRect.top));
  visibleWidth  = Math.max(0, Math.min(viewportWidth,  clientRect.right ) - Math.max(0, clientRect.left));
  ```
  Keep the existing fallback at line 74–77 (`if (visibleHeight === 0 || visibleWidth === 0)`) — that guard still serves the first-render case before DOM layout.

**E3.** Cache per-room click handlers so each render doesn't pass new closures down to `<scalable-house-plan-room>`:

  ```ts
  private _roomClickHandlers = new WeakMap<Room, () => void>();

  private _getRoomClickHandler(room: Room, index: number): () => void {
      let h = this._roomClickHandlers.get(room);
      if (!h) {
          h = () => this._handleRoomClick(room, index);
          this._roomClickHandlers.set(room, h);
      }
      return h;
  }
  // In _renderRooms: .onClick=${this._getRoomClickHandler(room, index)}
  ```

  WeakMap auto-evicts when the room object is garbage-collected (e.g., after config replacement creates new Room instances).

**Regression analysis:**
- **E1:** The original `requestUpdate()` was a kludge to re-run willUpdate so the `else` branch could compute real `visibleWidth`/`visibleHeight`. By computing them unconditionally we skip that second render. Risk: if `getBoundingClientRect` returns stale values immediately after a viewport resize (browser hasn't laid out yet), we'd compute slightly wrong values for one frame. The root card's debounced `ResizeObserver` already triggers another render after layout settles, so the wrong frame is replaced quickly. Visually indistinguishable. The existing zero-rect fallback at line 74 still protects the first-render case.
- **E3:** WeakMap keyed on Room object. When the user edits config and rooms get new object references, the cache transparently misses and recreates handlers. Old handlers GC'd with old Room objects. No leak. Closure captures the `index` from the time of creation — if the same Room object is re-used at a different index (extremely unusual; would require manual array reorder while keeping object identity), the handler would dispatch with a stale index. Editor always replaces room objects on save, so this isn't a practical concern.

**Verification:**
- Resize the browser window → overview re-fits correctly.
- Toggle HA sidebar (changes available width) → overview re-fits.
- Click a room → opens detail. Click another room → opens detail.
- Pinch-zoom on overview → still works (zoom controller untouched).
- Reorder rooms in the editor → click correctly opens the detail view for the room shown at the clicked position (verifies E3 invalidation works).

**Commit:** `perf(overview): drop willUpdate self-requestUpdate and memoize room click handlers`

---

## Fix F — Gate `_updateDynamicColor` sensor scans on relevant state changes (was #3)

**File:** `src/components/scalable-house-plan-room.ts`

**Change:** Pre-check whether anything tracked actually changed before running `calculateDynamicRoomColor`. If not, return early. Track motion-delay expiry so visual transitions still fire after the delay window even with no other state changes.

```ts
// Add to the class fields:
private _trackedStateRefs = new Map<string, any>();
private _nextDelayExpiryMs = 0;  // 0 = "always recompute next time" (initial state)
private _delayTimer?: number;
private _prevConfigGateKey?: string;  // captures config flags that change calculateDynamicRoomColor's output

// Modify _updateDynamicColor:
private _updateDynamicColor(): void {
    if (!this.hass || !this.room || !this._cachedRoomBounds || !this._cachedEntityIds) return;

    if (this.room.show_as_dashboard) {
        // … existing dashboard short-circuit unchanged …
        return;
    }

    // Capture all config/room flags that gate output inside calculateDynamicRoomColor.
    // Any change to these must force a recompute even when no entity state changed.
    // (calculateDynamicRoomColor reads: room.disable_dynamic_color, config.show_room_backgrounds,
    //  config.dynamic_colors.{motion_occupancy,lights,ambient_lights,default,motion_delay_seconds,show_idle_overlay}.)
    const dc = this.config?.dynamic_colors;
    const configGateKey =
        `${this.room.disable_dynamic_color ?? false}|${this.config?.show_room_backgrounds ?? false}` +
        `|${this.room.color ?? ''}|${dc?.motion_occupancy ?? ''}|${dc?.lights ?? ''}` +
        `|${dc?.ambient_lights ?? ''}|${dc?.default ?? ''}|${dc?.motion_delay_seconds ?? 60}` +
        `|${dc?.show_idle_overlay ?? false}|${dc?.show_border ?? false}`;
    const configChanged = configGateKey !== this._prevConfigGateKey;
    this._prevConfigGateKey = configGateKey;

    // Cheap pre-check: skip the heavy scan unless something changed OR a motion-delay window expired
    const now = Date.now();
    const trackedIds = [
        ...this._cachedEntityIds.motionSensors,
        ...this._cachedEntityIds.occupancySensors,
        ...this._cachedEntityIds.lights,
        ...this._cachedEntityIds.ambientLights,
    ];
    let anyChanged = false;
    for (const id of trackedIds) {
        const cur = this.hass.states[id];
        if (cur !== this._trackedStateRefs.get(id)) {
            anyChanged = true;
            this._trackedStateRefs.set(id, cur);
        }
    }
    if (!anyChanged && !configChanged && now < this._nextDelayExpiryMs) {
        return;
    }

    // … existing calculateDynamicRoomColor + memoization + gradient logic unchanged …

    // After computing, schedule next mandatory recompute based on motion delay windows
    this._nextDelayExpiryMs = this._computeNextDelayExpiry(now);
    this._scheduleDelayTimer(this._nextDelayExpiryMs - now);
}

private _computeNextDelayExpiry(now: number): number {
    const delaySeconds = this.config?.dynamic_colors?.motion_delay_seconds ?? 60;
    let earliest = Number.POSITIVE_INFINITY;
    for (const id of this._cachedEntityIds!.motionSensors) {
        const s = this.hass.states[id];
        if (s?.state === 'off') {
            const lastChangedMs = new Date(s.last_changed).getTime();
            const expiry = lastChangedMs + delaySeconds * 1000;
            if (expiry > now && expiry < earliest) earliest = expiry;
        }
    }
    return earliest;
}

private _scheduleDelayTimer(deltaMs: number) {
    if (this._delayTimer) {
        clearTimeout(this._delayTimer);
        this._delayTimer = undefined;
    }
    if (!isFinite(deltaMs)) return;
    // +50 ms buffer to ensure the window has fully expired
    this._delayTimer = window.setTimeout(() => {
        this._delayTimer = undefined;
        this._prevColorKey = undefined;  // force the existing memoization to update
        this.requestUpdate();
    }, Math.max(0, deltaMs) + 50);
}

// Add to disconnectedCallback:
disconnectedCallback() {
    super.disconnectedCallback();
    if (this._delayTimer) {
        clearTimeout(this._delayTimer);
        this._delayTimer = undefined;
    }
    this._trackedStateRefs.clear();
}

// Reset tracked state refs when entity list changes:
// Already in willUpdate where 'cachedEntityIds' changes — also clear _trackedStateRefs and reset _nextDelayExpiryMs to 0.
```

**Regression analysis:**
- **First-call correctness:** `_trackedStateRefs` starts empty → every entity reports `undefined !== currentState` → `anyChanged = true` → first call always runs the full computation. ✓
- **State-change correctness:** HA mutates `hass.states` by replacing the whole `states` object on each update; entity state objects within are also new references when their state/attributes change. So `cur !== prev` correctly fires for any tracked entity change. ✓
- **Skipped scan correctness:** when only an unrelated entity changes (e.g., a sensor not in this room), `anyChanged` is false. With no pending motion delay, we skip the whole `calculateDynamicRoomColor` call. The previous code's `_prevColorKey` would have produced the same final visual outcome (no state writes), so we're skipping equivalent work. ✓
- **Delay-window correctness:** when a motion sensor flips off, that's a state change (`anyChanged = true`) → recompute → `_nextDelayExpiryMs` set to expiry+now. The setTimeout fires at expiry → `requestUpdate` → next willUpdate runs `_updateDynamicColor` → pre-check now triggers because `now >= _nextDelayExpiryMs` → recompute → motion no longer "active". ✓
- **Multi-sensor delay:** `_computeNextDelayExpiry` returns the earliest pending expiry. When that one fires, we recompute; if other sensors still have pending expiries, the next computation finds them and reschedules. ✓
- **Disconnection:** timer cleared in `disconnectedCallback`. No leak.
- **Entity-list change:** when the parent updates `cachedEntityIds`, we already invalidate `_prevColorKey` (line 141). Add `_trackedStateRefs.clear()` and `_nextDelayExpiryMs = 0` next to that to ensure the next compute is unconditional.
- **Config-flag changes** (`config.show_room_backgrounds`, `room.disable_dynamic_color`, any of the `dynamic_colors.*` colors/flags, motion_delay_seconds): captured in `_prevConfigGateKey`. Any change forces a recompute on the next willUpdate even when no entity state changed. Without this gate, a runtime YAML edit toggling e.g. `show_room_backgrounds: true` could leave the room stuck on the prior motion color indefinitely until an unrelated entity-state change.
- **Day boundary / system clock change:** `Date.now()` jumps; the timer might fire slightly early/late. Same behavior as the existing code which already uses `Date.now()` in `hasActiveMotionOrOccupancy`. Not worse.

**Verification:**
- Quiet system (no other state changes for 30 s): a motion sensor turns on → room color shifts to motion within one HA update. Sensor turns off → color persists for `motion_delay_seconds`, then fades to next-priority (lights/ambient/transparent). Time the transition with a stopwatch; should be ±1 s of `motion_delay_seconds`.
- Active system: trigger many unrelated state changes during the delay window → no flicker, no color thrash, color stays stable until expiry.
- Multiple motion sensors with staggered triggers in the same room: each delay window fires independently; the most recent activity dominates while any sensor is recent.
- Editor: change `motion_delay_seconds` in YAML → save → next motion event uses the new delay.
- Editor: toggle `show_room_backgrounds: true` ↔ `false` while nothing else is changing → room visual updates within one render (verifies `_prevConfigGateKey` gating).
- Editor: change `dynamic_colors.lights` to a different rgba while a light is on → color updates immediately.

**Commit:** `perf(room): gate dynamic color scans on tracked state changes with delay-expiry timer`

---

## Fix G — Cache `buildElementStructure` results (was #1)

**File:** `src/components/element-renderer-shp.ts`

> **Revised after review:** the existing `buildElementMetadata` injects default `tap_action`/`hold_action` via `isEntityActionable` and `getDefaultTapAction`, which both read `hass.states[id].attributes.icon` (verified in `src/utils/default-actions.ts:46-50`). Caching the full `elementConfig` would freeze the tap-action decision until `hass.entities` changes. **Fix G splits the metadata build:** the cache stores only the parts that don't depend on `hass.states` (default element type + 3-tier merge); the tap/hold action injection moves to a post-cache pass that runs each render, mirroring how info-box's `room_entities` is already applied at lines 810–819.

**Change:** Add a WeakMap-backed cache keyed on `room.entities` array reference. Invalidate on changes to `elementDefaults`, `hass.entities`, `hass.devices` references. **Move the `tap_action`/`hold_action` injection out of `buildElementMetadata` into the existing post-build loop so it re-runs each render against current `hass.states`.**

**Step 1 — split `buildElementMetadata`:** remove the `tap_action`/`hold_action` injection block (currently lines 259–266) from `buildElementMetadata`. The cached `elementConfig` will no longer contain those fields.

**Step 2 — add the cache wrapper:**
```ts
interface BuildCacheEntry {
    elementDefaults?: ElementDefaultConfig[];
    hassEntities: any;  // hass.entities reference
    hassDevices: any;   // hass.devices reference
    allStatesPresent: boolean;
    result: Array<{ entity: string; plan: any; elementConfig: any; uniqueKey: string }>;
}

const buildStructureCache = new WeakMap<EntityConfig[], BuildCacheEntry>();

function buildElementStructureCached(
    entities: EntityConfig[],
    hass: HomeAssistant,
    roomIndex?: number,
    elementDefaults?: ElementDefaultConfig[]
): Array<{ entity: string; plan: any; elementConfig: any; uniqueKey: string }> {
    const cached = buildStructureCache.get(entities);
    if (cached &&
        cached.elementDefaults === elementDefaults &&
        cached.hassEntities === hass.entities &&
        cached.hassDevices === hass.devices &&
        cached.allStatesPresent) {
        return cached.result;
    }

    const result = buildElementStructure(entities, hass, roomIndex, elementDefaults);

    // "all states present" check: all entity-bearing items have a state object
    const allStatesPresent = result.every(el => !el.entity || hass.states[el.entity] !== undefined);

    buildStructureCache.set(entities, {
        elementDefaults,
        hassEntities: hass.entities,
        hassDevices: hass.devices,
        allStatesPresent,
        result,
    });

    return result;
}
```

**Step 3 — replace the call at line 806** with `buildElementStructureCached(...)`.

**Step 4 — extend the existing post-build loop** at lines 810–819 to re-derive tap/hold actions every render against the current `hass.states`. Critical: the gate must check `el.plan?.tap_action` (the source-of-truth user override from config), **not** `el.elementConfig.tap_action` (which may carry over a stale write from a previous render when the entity has since flipped to non-actionable):

```ts
for (const el of elements) {
    // Existing info-box mutations remain (room_entities / mode / show_background) …

    // Re-derive default tap/hold each render — these depend on hass.states.attributes.icon
    // via isEntityActionable, so they cannot live inside the cached metadata.
    if (el.entity) {
        // tap_action
        if (el.plan?.tap_action) {
            el.elementConfig.tap_action = el.plan.tap_action;        // user override wins
        } else if (isEntityActionable(el.entity, hass)) {
            el.elementConfig.tap_action = getDefaultTapAction(el.entity, hass); // 'toggle'
        } else {
            delete el.elementConfig.tap_action;                       // clears any prior cached default
        }
        // hold_action (mirror of above)
        if (el.plan?.hold_action) {
            el.elementConfig.hold_action = el.plan.hold_action;
        } else if (isEntityActionable(el.entity, hass)) {
            el.elementConfig.hold_action = getDefaultHoldAction();   // 'more-info'
        } else {
            delete el.elementConfig.hold_action;
        }
    }
}
```

This restores exact pre-cache behavior for every render path:
- User-configured `tap_action` in YAML → wins (matches original `if (!elementConfig.tap_action)` semantics, because when user sets it, the original code's `if` short-circuited and the value passed through unchanged from `mergeElementProperties`).
- Actionable entity, no user override → `toggle` (or whatever `getDefaultTapAction` returns).
- Non-actionable entity → no tap_action injected (matches original behavior of the `if (entity && isEntityActionable(...))` outer guard).

**Step 5 — update the stale comment** at lines 167–173 (which currently says "IMPORTANT: This is NOT cached") to describe the new WeakMap-keyed cache strategy and its invalidation triggers, so future maintainers don't get misled.

**IMPORTANT — preserve existing mutation semantics.** The existing code at line 810–819 mutates `el.elementConfig.room_entities`, `el.elementConfig.mode`, `el.elementConfig.show_background` for `info-box-shp`. With the cache, the same array of objects is returned; those mutations now persist across renders. Verify this is harmless:

- These properties are reset on every `renderElements` call before any consumer reads them. ✓
- Cards consume `elementConfig` only at first creation via `getOrCreateElementCard` → `setConfig`; they store the values internally and don't re-read `elementConfig` later. So a "stale" `elementConfig.mode` does not propagate after card creation. ✓
- Step 4's tap/hold logic unconditionally assigns or deletes — never leaves a stale carry-over from a previous render. ✓

**Regression analysis:**
- **Drag-drop:** the editor replaces `room.entities` with a new array on every config update (verified — `editor-rooms-shp.ts` and friends use spread). New array reference → WeakMap miss → fresh build. ✓
- **Entity registry change** (entity reassigned to area in HA UI): HA replaces `hass.entities` with a new object → ref mismatch → fresh build. ✓
- **Device registry change** (device assigned to area): `hass.devices` ref change → fresh build. ✓
- **`elementDefaults` change** (rare): new ref → fresh build. ✓
- **State-not-yet-loaded edge case:** on initial app load, an entity might be referenced before its state arrives. Without protection, we'd cache a metadata where `device_class` lookup returned undefined → wrong default element type. The `allStatesPresent` flag forces re-build on subsequent calls until all states are present. Once all are loaded, cache locks in. ✓
- **Device class changing for a loaded entity** (extremely rare — requires HA restart or entity reconfigure): triggers `hass.entities` ref change → fresh build. ✓
- **Mutation of `el.elementConfig` between renders:** the for-loop at line 810–819 keeps re-assigning the same fields each render. As long as `room_entities`, `mode`, `show_background`, `tap_action`, `hold_action` are always reassigned before any consumer reads them, caching the *enclosing* objects is safe. We must NOT cache something that depends on a value computed downstream of the cache.
  - **Audit point:** verify nothing reads `elementConfig.mode` etc. *between* the `buildElementStructureCached` call (line ~806) and the for-loop (line ~810). It does not — the for-loop runs immediately after the cache call, before any consumer.
- **Tap/hold action staleness:** addressed by Step 4 — actions are re-injected each render against current `hass.states`. The fix is needed because `isEntityActionable` reads `hass.states[id].attributes.icon` (verified at `src/utils/default-actions.ts:46-50`), which can change without the entity registry changing.
- **No other callers of `buildElementStructure`:** grep confirms the function is only called from line 806 inside `renderElements`. No external consumers, no risk of bypassing the cache.
- **Memory:** WeakMap auto-releases when `entities` array is GC'd. No size cap needed.

**Verification:**
- Normal render: rooms render with correct element types.
- Drag an element: position updates correctly (config replaces entities array → cache invalidates → fresh build with new plan).
- Edit an entity in the YAML editor (change type or default): visible immediately on save.
- Reassign an entity to a different area in HA → reload page → cache rebuilds, new entity appears in the right room.
- **Actionability flip test:** create an automation or HA template that changes a light entity's icon to `mdi:fuse` (which `NON_ACTIONABLE_ICONS` lists) at runtime. Before the icon change, tapping the element toggles the light. After the icon change, tapping should switch to `more-info`. This verifies Step 4's per-render tap-action injection works.
- (Defensive) Profile with Chrome DevTools: `buildElementMetadata` should drop from "called per render" to "called once per config".

**Commit:** `perf(renderer): cache buildElementStructure results keyed on room.entities reference`

---

## Cross-Fix Interaction Notes

- Fix F (sensor-scan gating) and Fix G (structure cache) both rely on hass-reference stability. HA's behavior of replacing per-state `state` objects but keeping `entities`/`devices` stable is the same assumption used by the existing parent-card cache (`scalable-house-plan.ts:225-230`). If that assumption ever breaks, **all three caches** invalidate together — consistent failure mode, easy to diagnose.
- Fix E3 (room click handlers via WeakMap) and Fix G (structure cache via WeakMap) both rely on the editor replacing object references on edit. Same assumption — and explicitly documented in the existing code (`buildElementStructure` comment at line 167–173).
- Fix D (actionHandler skip) is independent of all caching changes.
- Fix C (template cache) is independent.
- Fix B and A are trivial cleanups, no interaction.

---

## Status

| Fix | Description | Commit | Status |
|-----|-------------|--------|--------|
| A | Remove dead `HouseCache` Maps | 8c54978 | DONE |
| B | Replace dayjs in `last-change-text-shp` | 5380b35 | DONE |
| C | Cache compiled JS templates | d887837 | DONE |
| D | Skip `actionHandler` rebind when options unchanged | c67928b | DONE |
| E | Trim overview willUpdate (E1 + E3; E2 dropped per review) | 853b5d8 | DONE |
| F | Gate dynamic-color scans on tracked state changes | 368b5ac | DONE |
| G | Cache `buildElementStructure` results | fecb8e7 | DONE |

---

## Session Prompt Template

> Read `docs/bugs/performance/performance_audit_2026-05-10_fix_plan.md`. Implement Fix [X] exactly as specified, including the regression-analysis safeguards. Don't expand scope. Tell me what to test, then after I confirm, commit and update the Status table.
