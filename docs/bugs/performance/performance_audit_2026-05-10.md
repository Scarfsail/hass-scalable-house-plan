# Performance Audit — Remaining Inefficiencies

**Date:** 2026-05-10
**Scope:** Full codebase review for CPU waste / unnecessary work on the hot render path.
**Verification:** Each finding cross-checked by an independent agent against the actual code (all confirmed TRUE).
**Context:** Prior audit `performance_issue_when_running_longer.md` plus the fix log `performance_issue_fixing.md` already addressed 7 issues (memoized dynamic color, capped position cache, debounced resize, fixed `requestUpdate` in render, leaked subscriptions, leaked drag controllers). The findings below are **new** issues observed after those fixes.

---

## Priority Summary

| # | Severity | Area | Finding | Approx. cost (per HA state update) |
|---|----------|------|---------|-------------------------------------|
| 1 | **HIGH** | `element-renderer-shp.ts` | `buildElementStructure` rebuilds every element's metadata on every render (uncached) | O(rooms × elements) object allocations + hass.states lookups |
| 2 | **HIGH** | `js-templates.ts` | `evalJsTemplate` re-compiles via `new Function(...)` on every call — no cache | 1 function compilation per template eval per render |
| 3 | **HIGH** | `scalable-house-plan-room.ts` / `room-color-helpers.ts` | `_updateDynamicColor` short-circuits state writes but still scans every motion/light/occupancy sensor on every hass update | O(sensors) per room per state update |
| 4 | **MEDIUM** | `action-handler.ts` | `actionHandler` directive removes & re-adds 6 listeners on every render | 12 DOM listener mutations × bound elements per render |
| 5 | **MEDIUM** | `scalable-house-plan-overview.ts` | `willUpdate()` calls `getBoundingClientRect()` and may call `requestUpdate()`; render uses inline closures that force room re-renders | Forced layout read + extra render cycle on viewport change |
| 6 | **LOW** | `last-change-text-shp.ts` | `render()` allocates `dayjs()` + `dayjs.duration(...)` unconditionally; ~30 instances tick every second | 30+ duration objects/sec |
| 7 | **LOW** | `scalable-house-plan.ts` | `HouseCache` declares two Maps (`elementMetadata`, `elementStructure`) that are never written | Trivial — dead code |

---

## Details

### 1. `buildElementStructure` runs uncached on every render — HIGH

**File:** `src/components/element-renderer-shp.ts:175-207` (function), `:806` (call site).

**What happens:** `renderElements()` is called from `scalable-house-plan-room.render()` (`_renderOverview` line 554, `_renderDetail` line 691). It unconditionally calls `buildElementStructure(room.entities || [], hass, roomIndex, elementDefaults)`, which:

- filters & maps over every entity in the room,
- calls `buildElementMetadata` for each entity (line 202): a hass.states lookup for `device_class`, `getElementTypeForEntity`, then 1–3 layers of object spread / recursive merge via `mergeElementConfigLayers` (line 117).

The comment at lines 167–173 explicitly says "NOT cached" because plan references go stale after drag-drop. The room's `render()` runs on every HA state change (because `hass` is a `@property` that propagates through every parent), so this work runs **per render × per room × per element**.

**Idea for fix:** Cache by a stable key composed of `(room.entities reference, elementDefaults reference, entity registry version)`. Drag-drop already replaces `room.entities`, so caching by reference is safe. Invalidate when reference changes. Avoid stale-position concerns because the cache key changes whenever the editor mutates entities.

---

### 2. `evalJsTemplate` re-compiles `new Function()` every call — HIGH

**File:** `src/utils/js-templates.ts:17`.

**What happens:** Every call constructs a brand-new `Function` from the template source. There's no memoization map. Callers (`analog-bar-shp.ts:50`, `analog-text-shp.ts:327`) invoke this from inside their render paths, so each re-render of an element with a JS template re-compiles the same function. JS engine compilation of a `new Function` body is on the order of tens to hundreds of microseconds per template — small individually, but multiplied by element count × render frequency it becomes measurable.

**Idea for fix:** Memoize compiled functions by template string. A single module-level `Map<string, Function>` is sufficient — the regex-extracted body is the cache key. Reset / cap size if needed (templates rarely exceed a few dozen distinct strings, so unbounded growth is unlikely in practice; an LRU cap of e.g. 200 is a safe upper bound).

---

### 3. `_updateDynamicColor` iterates all sensors on every hass update — HIGH

**File:** `src/components/scalable-house-plan-room.ts:145-147` (call site), `:313-399` (body); `src/utils/room-color-helpers.ts:110-183` (sensor scans).

**What happens:** The prior fix added a `_prevColorKey` short-circuit (line 345–346) that prevents redundant `@state` writes. **However, the early-exit happens *after* `calculateDynamicRoomColor` has already run.** That function unconditionally iterates `motionSensors`, `occupancySensors`, `lights`, `ambientLights` for the room (calls `hasActiveMotionOrOccupancy` + `hasActiveLights` + `hasActiveAmbientLights`). With ~10 rooms and a handful of sensors each, every HA state update — including states for entities that are not even in the house plan — triggers full sensor scans across every room.

**Idea for fix:** Coarse pre-check. Track the set of entity IDs the room cares about (already in `_cachedEntityIds`); on a hass change, compare `prevHass.states[id]` vs `this.hass.states[id]` for each tracked id and only run `calculateDynamicRoomColor` if any of those state objects changed by reference (HA replaces state objects on change, keeps refs stable otherwise). For motion-delay logic that depends on elapsed time, additionally re-run when any motion sensor in `_cachedEntityIds.motionSensors` is currently `off` and within the delay window — handled cheaply by tracking the next pending expiry timestamp.

---

### 4. `actionHandler` directive rebinds 6 listeners every render — MEDIUM

**File:** `src/utils/action-handler.ts:82-104` (`bind`), `:201-210` (directive).

**What happens:** The Lit directive's `update()` calls `controller.bind(element, options)` unconditionally on every render. After the first bind, `bind()` enters the `if (element.actionHandler)` branch and **removes 6 listeners then immediately adds 6 new ones** (lines 84–89 → 190–195). Used on every room polygon and many element wrappers (`scalable-house-plan-room.ts:610, 621, 634`). That's ~12 listener mutations per bound element per render. Listener add/remove is fast individually but contributes consistent overhead and pressure on the event-target internal listener list.

**Idea for fix:** Cache the previous `options` shape on the element (`element.actionHandler.options`) and skip rebinding if the new options are deeply equal. Even simpler: only the `disabled` and `hasHold` flags actually affect bind behavior — compare those two fields and short-circuit when unchanged.

---

### 5. `scalable-house-plan-overview.willUpdate` does forced layout + closure churn — MEDIUM

**File:** `src/cards/scalable-house-plan-overview.ts:55-89` (`willUpdate`), `:146-164` (`_renderRooms`).

**What happens:**

- `willUpdate()` calls `getBoundingClientRect()` (line 58) on every update. This is a forced layout flush — fine in isolation, but if any DOM mutation happened earlier in the same task (e.g., another component's `updated`), it triggers a synchronous layout recompute.
- Line 67–68 calls `this.requestUpdate()` from inside `willUpdate` when the viewport changed. This schedules an additional render cycle on top of the current one. The prior fix removed the same anti-pattern from `scalable-house-plan-detail.ts` but left this one in.
- Line 157 creates a fresh `() => this._handleRoomClick(room, index)` closure for each room on every render. Lit treats `@property({attribute:false})` props as changed when the reference differs, so this guarantees the room component sees `onClick` as "changed" each render (the room's `willUpdate` ignores it, but `render()` still re-runs because Lit batches by any property change).

**Idea for fix:** (a) Cache the last `getBoundingClientRect` result and only re-read on a real resize (the root card already has a debounced ResizeObserver — wire its result down). (b) Move the viewport check into a `ResizeObserver` callback or compute the new layout values inside the same `willUpdate` instead of re-scheduling. (c) Pre-bind room click handlers once per room index (e.g., `this._roomClickHandlers[index] ??= () => this._handleRoomClick(room, index)`) or eliminate the prop and use event bubbling.

---

### 6. `last-change-text-shp` allocates dayjs objects per render — LOW

**File:** `src/components/last-change-text-shp.ts:71-73`.

**What happens:** `render()` runs `dayjs.duration(dayjs().diff(lastChanged))` to compute `secondsSinceChange` for the highlight color decision. The component subscribes to `timerService` (1 Hz) and forces a re-render every second (when `_lastRenderedText` differs). With multiple motion-sensor / image-last-change instances across all rooms, this can be 20–50 dayjs allocations per second — small but constant background CPU.

**Idea for fix:** Compute `secondsSinceChange` from `(Date.now() - new Date(lastChanged).getTime()) / 1000` without going through dayjs. The dayjs duration object is unused in the render output (only its `.asSeconds()` is read).

---

### 7. `HouseCache` has dead Maps — LOW

**File:** `src/cards/scalable-house-plan.ts:42-46`.

**What happens:** `elementMetadata` and `elementStructure` Maps are instantiated but never written to (verified by repo-wide grep). Only `position` is in use. Pure dead weight; cosmetic.

**Idea for fix:** Delete the two unused fields. (Mentioned because the prior audit also noted them and they're still present.)

---

## Suggested Fix Order

1. **#2 (template caching)** — smallest diff, biggest unambiguous win, zero regression risk.
2. **#3 (sensor-scan gating)** — biggest CPU win on idle dashboards with many rooms; medium care needed for the motion-delay timing semantics.
3. **#1 (buildElementStructure caching)** — high impact but requires careful invalidation (drag-drop).
4. **#4 (actionHandler rebind skip)** — easy.
5. **#5 (overview layout/closure)** — split into the three sub-fixes; each is small.
6. **#6 (dayjs in last-change)** — trivial.
7. **#7 (HouseCache cleanup)** — trivial cosmetic.
