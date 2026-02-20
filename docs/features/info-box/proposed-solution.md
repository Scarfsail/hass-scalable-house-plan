# Proposed Solution: Info-Box as a Regular Element

## Summary

The proposal has two main parts:
1. **Replace `info_box_defaults:` with a general `element_defaults:` mechanism** at the house level — a YAML array of default plan configs keyed by element type, applicable to any element type in any room.
2. **Place the info-box as a regular entity** in each room's `entities:` array — like any other element — with drag-and-drop support and the standard plan/element config pattern.

A **Python migration script** will convert the old format to the new format. No backward compatibility is maintained.

---

## Current Architecture (what needs to change)

### Problem 1: Info-box is special-cased

The renderer synthesizes a virtual `EntityConfig` for the info-box at render time by reading `room.info_box` and `config.info_box_defaults`. This synthetic entity is never part of `room.entities`, so:
- **Drag-and-drop is broken** — the drag system only acts on entities in `room.entities`
- **Editor has a special "Info Box" section** — inconsistent with all other elements
- **Config location is non-obvious** — `info_box:` sits alongside `name`, `boundary`, `entities` at room level

### Problem 2: Defaults are info-box-specific

`info_box_defaults:` is a one-off mechanism that only works for info-box. The new design generalizes this into `element_defaults:` that applies to any element type.

---

## Proposed Solution

### 1. New `element_defaults:` at house level

Replace `info_box_defaults:` with `element_defaults:` — an array of plan-level default configs. Each entry must have `element.type` (used for matching). All other fields follow the same schema as room entity plan configs.

**New YAML format:**
```yaml
element_defaults:
  - left: 0
    top: 0
    element:
      type: custom:info-box-shp
      show_background_overview: false
      types:
        humidity:
          visible_overview: false
  - element:
      type: custom:motion-sensor-shp
      some_default_property: value
```

**Three-tier merge order** (lowest to highest priority):

| Tier | Source | What it provides |
|------|--------|-----------------|
| 1 | `element_defaults[matching type]` | House-level baseline for position and element properties |
| 2 | Auto-detected config from `element-mappings.ts` | Element type + element property defaults (e.g., door-window-shp defaults) |
| 3 | User's explicit `plan:` in room YAML | Highest priority — overrides both tiers above |

Key rules:
- **Position** (`left`, `top`, `right`, `bottom`): Tier 1 baseline, tier 3 overrides if specified. Auto-mapping (tier 2) does not provide position.
- **Element properties** (`element.*`): Shallow merge across all three tiers; tier 3 wins per-key.
- **Element type**: Auto-detected from entity domain/device_class if not explicitly set by user. `element_defaults` does not override an auto-detected type — it provides additional property defaults for the matched type.
- **Multiple matching defaults**: First match in the `element_defaults` array wins.

**Effect on entities without explicit plan**: If an entity's resolved type matches an `element_defaults` entry that includes position properties, those defaults serve as its plan baseline. This means an entity with no explicit `plan:` in the YAML can be rendered if `element_defaults` provides its position.

### 2. Info-box as a regular room entity

The info-box is no longer synthesized by the renderer. Instead, users place it explicitly in `entities:` like any other element:

```yaml
rooms:
  - name: Technická
    entities:
      - entity: binary_sensor.rsc_window_tech_room_contact
        plan:
          left: 0
          top: 22
      - entity: ""                       # No entity — info-box scans the room itself
        plan:
          left: 22
          top: 15
          element:
            type: custom:info-box-shp
            types:
              occupancy:
                icon_position: separate
```

**Rooms without an explicit info-box entity get no info-box** — this is the equivalent of the old `show: false`.

**Default position via `element_defaults`**: When `element_defaults` contains an entry for `custom:info-box-shp` with a position, a room entity of `entity: ""` with `element.type: custom:info-box-shp` but no explicit position will use that default position.

### 3. Auto-injection of runtime properties (internal renderer concern)

The info-box element (`custom:info-box-shp`) currently requires three properties that cannot be user-configured because they are computed at render time:
- `room_entities: string[]` — all entity IDs in the room (for auto-detection of temperature/humidity/motion sensors)
- `mode: 'overview' | 'detail'` — current view mode
- `room_id: string` — unique per-room identifier for element caching

These will continue to be **auto-injected by the renderer** when it detects an element with `type: 'custom:info-box-shp'`. This is transparent to the user — the info-box element behaves exactly as before once placed. No user config needed for these internal properties.

### 4. TypeScript changes required

**`src/cards/types.ts`**:
- Add `ElementDefaultConfig` interface:
  ```ts
  export interface ElementDefaultConfig {
      left?: string | number;
      right?: string | number;
      top?: string | number;
      bottom?: string | number;
      element: ElementConfig & { type: string };  // type is required for matching
  }
  ```
- Add `element_defaults?: ElementDefaultConfig[]` to `ScalableHousePlanConfig`
- Remove `info_box_defaults?: InfoBoxConfig` from `ScalableHousePlanConfig`
- Remove `info_box?: InfoBoxConfig` from `Room`
- Remove `InfoBoxConfig`, `InfoBoxTypeConfig`, `InfoBoxPosition` interfaces

**`src/components/element-renderer-shp.ts`**:
- Remove `createInfoBoxEntity()`, `getOrCreateInfoBoxEntity()`
- Remove info-box entity injection from `renderElements()`
- Add `applyElementDefaults(entityConfig, elementType, defaults)` utility — applies the three-tier merge (defaults → auto-mapped → user plan)
- Update `buildElementMetadata()` to call `applyElementDefaults` after type resolution
- Update `buildElementStructure()` to also consider entities that have no explicit plan but match a `element_defaults` entry with position
- When building card config for `custom:info-box-shp`: auto-inject `room_entities`, `mode`, `room_id`
- Update `ElementRendererOptions` interface: remove `infoBoxCache`, `cachedInfoBoxEntityIds`; add `elementDefaults`

**`src/components/scalable-house-plan-room.ts`**:
- Remove `_infoBoxCache` and `cachedInfoBoxEntityIds` passing
- Pass `element_defaults` from config to `renderElements()`

**`src/cards/scalable-house-plan.ts`**:
- Remove info-box cache computation from `_computeRoomEntityCaches()`
- `RoomEntityCache.infoBoxEntityIds` can be removed (or kept as `allEntityIds` alias)
- Pass `config.element_defaults` down to room renderer

**`src/cards/editor-components/editor-room-shp.ts`** (if it has a special info-box editor section):
- Remove the dedicated "Info Box" config section
- Info-box now appears as a normal entity in the room entity editor list

### 5. Backwards compatibility: None

Per the request, no backward compatibility. Users migrate using the Python script.

---

## Migration Script

The Python script (`docs/features/info-box/migrate-info-box-config.py`) converts the old format to the new format:

**Logic:**

1. **House-level `info_box_defaults:` → `element_defaults:` entry**
   ```
   info_box_defaults.show_background_overview → element_defaults[0].element.show_background_overview
   info_box_defaults.show_background_detail   → element_defaults[0].element.show_background_detail
   info_box_defaults.types                    → element_defaults[0].element.types
   info_box_defaults.position.left/top/…      → element_defaults[0].left/top/…
   ```
   `show:` in defaults is removed (omitting info-box from room entities = disabled)

2. **Per-room `info_box:` → entity entry in room `entities:`**
   - If `info_box.show === false`: skip (no entity added, info-box is disabled for that room)
   - Otherwise, prepend a new entity to `entities:`:
     ```yaml
     - entity: ""
       plan:
         left: {info_box.position.left}    # if present
         top: {info_box.position.top}      # if present
         right: {info_box.position.right}  # if present
         bottom: {info_box.position.bottom} # if present
         element:
           type: custom:info-box-shp
           # Only include these if explicitly set in old config:
           show_background_overview: {info_box.show_background_overview}
           show_background_detail: {info_box.show_background_detail}
           types: {info_box.types}
     ```
   - Remove `info_box:` key from room
   - Do NOT add `overview: true` explicitly (it is the default)

3. **Remove `info_box_defaults:` from top level**, add `element_defaults:`

4. **Write output to a new file** (never overwrite the input file)

**Special cases to handle:**
- Room with `info_box: {left: 0, top: 0}` (Sklep in original file — malformed: position not under `position:`) — treat as `info_box.position: {left: 0, top: 0}`
- Room with no `info_box:` key → no info-box entity added (implicitly disabled)
- `info_box.types.temperature.show: false` in old format — keep as-is under `element.types` (info-box-shp handles it)
- Percentage positions like `left: 50%` — keep as string

---

## Impact Analysis

| Area | Impact |
|------|--------|
| Config YAML | Breaking — requires migration script |
| Drag-and-drop | Fixed — info-box now fully draggable |
| Editor UX | Improved — info-box appears in standard entity list |
| Info-box behavior | Unchanged — behaves exactly as before once placed |
| Other elements | New `element_defaults` feature (additive) |
| Rooms without info-box | No change — just don't add info-box to entities |
| Performance | Slightly better — no special-case entity synthesis per render |
