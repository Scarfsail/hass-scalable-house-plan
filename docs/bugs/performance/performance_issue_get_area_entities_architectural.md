# Performance Issue — Architectural Root Cause: Cache Not Threaded into `renderElements`

**Date:** 2026-02-20
**Supersedes:** `performance_issue_get_area_entities.md` (single-function memoization proposal — obsolete after this analysis)
**Discovered via:** Code review of existing cache infrastructure after Chrome profiler finding

---

## Executive Summary

A robust cache (`_computeRoomEntityCaches`) already exists in `scalable-house-plan.ts` and computes `allEntityIds` / `areaEntityIds` per room once on config change. The cache is correctly threaded to `scalable-house-plan-room` via the `cachedEntityIds` prop. However, `renderElements()` — called inside `_renderOverview()` and `_renderDetail()` — does **not** receive this cached data. It always calls `getAllRoomEntityIds(hass, room, null)`, which calls `getAreaEntities` live, scanning all HA entities on every render of every room.

The fix is not to add a second memoization layer. It is to thread the already-computed data into `renderElements`.

---

## Current Architecture

### What exists and works ✅

**`scalable-house-plan.ts` — computes the cache once on config change:**

```ts
// scalable-house-plan.ts:202-209
willUpdate(changedProperties) {
    if (changedProperties.has('config') && this.config && this.hass) {
        this._computeRoomEntityCaches();
    }
}
```

```ts
// scalable-house-plan.ts:225-255
private _computeRoomEntityCaches(): void {
    for (const room of this.config.rooms) {
        const areaEntityIds = room.area ? getAreaEntities(this.hass, room.area) : [];
        const allEntityIds = getAllRoomEntityIds(this.hass, room, areaEntityIds);
        // ... analyzeRoomEntities ...
        this._roomEntityCache.set(room.name, {
            allEntityIds, areaEntityIds, motionSensorIds, ...
        });
    }
}
```

**Cache propagation to the room component (both overview and detail paths):**

```
scalable-house-plan
  ├─ scalable-house-plan-overview
  │    └─ scalable-house-plan-room  ← .cachedEntityIds=${roomEntityCache.get(room.name)}  ✅
  └─ scalable-house-plan-detail
       └─ scalable-house-plan-room  ← .cachedEntityIds=${roomEntityCache.get(room.name)}  ✅
```

**`scalable-house-plan-room` — uses the cache for dynamic color calculation:**

```ts
// scalable-house-plan-room.ts:131-141
if (changedProperties.has('cachedEntityIds') && this.cachedEntityIds) {
    this._cachedEntityIds = {
        all: this.cachedEntityIds.allEntityIds,
        motionSensors: this.cachedEntityIds.motionSensorIds,
        ...
    };
}
// _updateDynamicColor() then uses this._cachedEntityIds  ✅
```

### Where the cache is dropped ❌

**`scalable-house-plan-room._renderOverview()` (line 469) calls `renderElements` without passing any entity cache:**

```ts
// scalable-house-plan-room.ts:469
const elements = renderElements({
    hass: this.hass,
    room: this._cachedOverviewRoom,
    originalRoom: this.room,   // ← the full room with all entities
    houseCache: this.houseCache,
    // ... NO areaEntityIds, NO allEntityIds passed
});
```

**`renderElements` then calls `getAllRoomEntityIds` with `null` for every info-box element:**

```ts
// element-renderer-shp.ts:781
el.elementConfig.room_entities = getAllRoomEntityIds(hass, roomForInfoBox, null);
//                                                                          ^^^
//  null = "I have no cache, please call getAreaEntities live"
```

`getAllRoomEntityIds(…, null)` calls `getAreaEntities`, which iterates all HA entities (O(E)).
This runs **on every render of every room that has an info-box element**, i.e., multiple times per HA state update.

---

## The Two Diverged Paths

| Path | Trigger | Cache used? | Cost per render |
|---|---|---|---|
| `_updateDynamicColor()` (color/sensors) | `hass` change | ✅ Yes — `this._cachedEntityIds` | O(1) |
| `renderElements()` → info-box `room_entities` | `render()` | ❌ No — calls `getAreaEntities` live | O(E) |

---

## Secondary Call Sites (Non-Hot-Path)

These call `getAreaEntities` outside the render loop, so they are not responsible for the profiler hit, but they are structurally inconsistent and should use the cache.

| Location | Trigger | Severity |
|---|---|---|
| `scalable-house-plan-detail._calculateEntitiesNotOnDetail()` (line 157) | `updated()` when `room` changes | Low — one call per room open |
| `scalable-house-plan-entities._fetchAreaEntities()` (line 72) | `updated()` when `room` changes | Low — one call per entities view open |
| `editor-element-shp.ts` (lines 234, 448) | Editor interactions | Low — editor only |

---

## Proposed Fix

### 1. Thread entity IDs into `renderElements` via `ElementRendererOptions`

Add one optional field to the options interface:

```ts
// element-renderer-shp.ts — ElementRendererOptions
export interface ElementRendererOptions {
    // ... existing fields ...
    roomEntityIds?: string[];  // Pre-computed entity IDs for the room (avoids getAllRoomEntityIds call)
}
```

In `renderElements`, use it when provided:

```ts
// element-renderer-shp.ts:779-788 (current)
for (const el of elements) {
    if (el.elementConfig?.type === 'custom:info-box-shp') {
        el.elementConfig.room_entities = getAllRoomEntityIds(hass, roomForInfoBox, null);
    }
}

// Fixed:
for (const el of elements) {
    if (el.elementConfig?.type === 'custom:info-box-shp') {
        el.elementConfig.room_entities = options.roomEntityIds
            ?? getAllRoomEntityIds(hass, roomForInfoBox, null);
    }
}
```

In `scalable-house-plan-room._renderOverview()` and `_renderDetail()`, pass the cached value:

```ts
// scalable-house-plan-room.ts — _renderOverview()
const elements = renderElements({
    hass: this.hass,
    room: this._cachedOverviewRoom,
    originalRoom: this.room,
    roomEntityIds: this.cachedEntityIds?.allEntityIds,  // ← add this
    // ...
});
```

The `cachedEntityIds` property already holds the `RoomEntityCache` passed from the parent, which contains `allEntityIds` = the exact result `getAllRoomEntityIds` would compute.

**Result:** When the cache is warm (after first config load), `renderElements` never calls `getAreaEntities`. The O(E) scan is done once per config change, not once per render.

### 2. Use cached `areaEntityIds` in secondary call sites

`scalable-house-plan-detail._calculateEntitiesNotOnDetail()` can use `roomEntityCache`:

```ts
private _calculateEntitiesNotOnDetail() {
    if (!this.room || !this.hass) { this._entitiesNotOnDetailCount = 0; return; }

    // Use cached area entity IDs from parent (avoid live scan)
    const areaEntityIds = this.roomEntityCache?.get(this.room.name)?.areaEntityIds
        ?? (this.room.area ? getAreaEntities(this.hass, this.room.area) : []);

    this._entitiesNotOnDetailCount = getEntitiesNotOnDetailCount(this.hass, this.room, areaEntityIds);
}
```

`scalable-house-plan-entities` receives `room` but not `roomEntityCache`. Not a hot path — low priority, can be addressed if needed.

---

## No New Abstraction Needed

The cache exists and is correct; it just needs to be passed one level deeper into `renderElements`. No new class, no second memoization layer. The change is:

- 1 field added to `ElementRendererOptions`
- 1 line changed in `renderElements`
- 1 line added in `_renderOverview()` (pass `roomEntityIds`)
- 1 line added in `_renderDetail()` (pass `roomEntityIds`)

---

## Cache Invalidation — Known Limitation (Optional Follow-Up)

`_computeRoomEntityCaches()` only fires when `changedProperties.has('config')`. If a user reassigns an entity to a different area in the HA UI, `hass.entities` reference changes **but config does not**, so the cache would show stale results until the next config change (e.g., page reload or card save).

In practice this is an edge case: area assignments are changed infrequently via the HA UI, and a page reload is an acceptable recovery. **Test first** — if stale-cache issues surface during testing, the fix is straightforward:

```ts
// scalable-house-plan.ts — willUpdate (only if staleness is observed during testing)
const prevHass = changedProperties.get('hass') as HomeAssistant | undefined;
const entityRegistryChanged = changedProperties.has('hass') &&
    prevHass &&
    (prevHass.entities !== this.hass?.entities || prevHass.devices !== this.hass?.devices);

if ((changedProperties.has('config') || entityRegistryChanged) && this.config && this.hass) {
    this._computeRoomEntityCaches();
}
```

`hass.entities` and `hass.devices` are replaced by new object references on any registry change (HA's immutable-update pattern), so the comparison is O(1) and reliable.

---

## Fix Tracking

See [performance_issue_fixing.md](performance_issue_fixing.md) for the commit workflow.

**Commit prefix:** `perf(render):`
**Files to change:**
- `src/components/element-renderer-shp.ts` — add `roomEntityIds?` to options, use it in `renderElements`
- `src/components/scalable-house-plan-room.ts` — pass `this.cachedEntityIds?.allEntityIds` in both render calls
- `src/cards/scalable-house-plan-detail.ts` — use `roomEntityCache` in `_calculateEntitiesNotOnDetail` (low priority)
