# Performance Issue — `getAreaEntities` Called on Every Render

**Date:** 2026-02-20
**Discovered via:** Chrome Performance Profiler (10 s recording on overview view)
**Symptom:** `getAreaEntities` consumed **2,523 ms out of 10,000 ms** (59.8 % self time, 60 % total time).

---

## Root Cause

`getAreaEntities` iterates over **every entity in the HA entity registry** on each call:

```ts
// src/utils/area-helpers.ts:31-56
export function getAreaEntities(hass: HomeAssistant, areaId: string): string[] {
    for (const [entityId, entityEntry] of Object.entries(hass.entities)) {
        if (entityEntry.area_id === areaId) { ... }
        if (entityEntry.device_id) {
            const device = hass.devices[entityEntry.device_id];
            if (device?.area_id === areaId) { ... }
        }
    }
}
```

Cost: **O(E)** where E = total entities in HA (commonly 500–3 000+).

---

## Call Chain (from profiler)

```
render()                               scalable-house-plan-room.ts:436
  └─ _renderOverview()                 scalable-house-plan-room.ts:451
       └─ renderElements()             element-renderer-shp.ts:754
            └─ getAllRoomEntityIds()   room-entity-helpers.ts:224
                 └─ getAreaEntities() area-helpers.ts:31   ← HOT PATH
```

Specific trigger inside `renderElements`:

```ts
// element-renderer-shp.ts:781
el.elementConfig.room_entities = getAllRoomEntityIds(hass, roomForInfoBox, null);
//                                                                          ^^^
//                          null forces getAllRoomEntityIds to call getAreaEntities every time
```

`getAllRoomEntityIds` accepts a pre-computed `areaEntityIds` array as the third argument, but `renderElements` always passes `null`, so it falls through to the live `getAreaEntities` call on every render.

---

## Why This Is Called So Frequently

- `render()` on each `scalable-house-plan-room` fires on every HA state update (any entity in the system).
- With N rooms × M state updates per second, `getAreaEntities` runs N × M times per second.
- A typical 10-room overview with moderate HA activity (~6 state updates/s) = **60 calls/s**, each scanning thousands of entities.

There are also two additional call sites in `room-entity-helpers.ts` (lines 165 and 381) and direct calls in `scalable-house-plan.ts:232` and `scalable-house-plan-detail.ts:157`, all similarly unbounded.

---

## Why the Existing Room-Level Cache Does Not Help

`scalable-house-plan-room._computeEntityIdCache()` (line 250) calls `getRoomEntities` which internally calls `getAreaEntities`, but that cache is only for the color/sensor computation path (`_updateDynamicColor`). The hot path goes through `renderElements` → `getAllRoomEntityIds(…, null)`, which **bypasses the room-level cache entirely**.

---

## Proposed Fix — Memoize `getAreaEntities` at Module Level

Add a module-level cache in `area-helpers.ts` keyed by `areaId`, validated by **reference equality** on `hass.entities` and `hass.devices`.

### Why reference equality is safe

Home Assistant uses an immutable-update pattern for its registries: when any entity or device area assignment changes, HA replaces `hass.entities` and/or `hass.devices` with **new object references**. Comparing `hass.entities === cache.entitiesRef` is therefore a reliable, O(1) staleness check. The cache for a given `areaId` is valid as long as both registry references are identical to what was used to compute it.

### Implementation sketch

```ts
// src/utils/area-helpers.ts

interface AreaEntitiesEntry {
    entitiesRef: HomeAssistant['entities'];
    devicesRef: HomeAssistant['devices'];
    result: string[];
}

const _areaEntitiesCache = new Map<string, AreaEntitiesEntry>();

export function getAreaEntities(hass: HomeAssistant, areaId: string): string[] {
    if (!hass.entities || !hass.devices) return [];

    const cached = _areaEntitiesCache.get(areaId);
    if (
        cached &&
        cached.entitiesRef === hass.entities &&
        cached.devicesRef === hass.devices
    ) {
        return cached.result;
    }

    // Cache miss — compute
    const entityIds: string[] = [];
    for (const [entityId, entityEntry] of Object.entries(hass.entities)) {
        if (entityEntry.area_id === areaId) {
            entityIds.push(entityId);
            continue;
        }
        if (entityEntry.device_id) {
            const device = hass.devices[entityEntry.device_id];
            if (device?.area_id === areaId) {
                entityIds.push(entityId);
            }
        }
    }

    _areaEntitiesCache.set(areaId, {
        entitiesRef: hass.entities,
        devicesRef: hass.devices,
        result: entityIds,
    });

    return entityIds;
}
```

### Cache characteristics

| Property | Value |
|---|---|
| Hit cost | O(1) — one Map lookup + two reference comparisons |
| Miss cost | O(E) — same as today (unavoidable) |
| Invalidation trigger | `hass.entities` or `hass.devices` reference change |
| Memory footprint | One entry per distinct `areaId` (typically ≤ 30 rooms) |
| Stale-data risk | None — HA always replaces the registry objects on any change |

---

## Regression Risk

**None.** The memoization is purely additive:

- Cache is invalidated whenever HA updates the entity or device registry (which is the only event that can change `getAreaEntities` results).
- Returned array is fresh on any registry change; callers that mutate the returned array get a fresh copy each cycle.
- No changes to callers required — the public API of `getAreaEntities` is unchanged.

---

## Fix Tracking

See [performance_issue_fixing.md](performance_issue_fixing.md) for the fix workflow and commit convention.

**Next step:** Implement the memoization in `src/utils/area-helpers.ts`, test that overview renders are fast after a cold load, confirm that entity area reassignment (in the HA UI) is reflected immediately on the next render, then commit with prefix `perf(area-helpers):`.
