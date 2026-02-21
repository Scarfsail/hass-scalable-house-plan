# Analysis: Different Size & Content for Overview vs Detail View

## Problem Statement

Currently, when a user clicks a room on the overview, the detail view renders using the **same** room definition — same boundary polygon and same entities list (filtered only by `plan.overview` flag). This means the detail view's size and shape are locked to the room's overview boundary.

The user needs:
1. **Different room size/shape** for detail view (e.g., a larger canvas for dashboard rooms)
2. **Different entity content** for overview vs detail (e.g., overview shows a compact summary; detail shows full controls)

---

## Current Architecture Summary

### Room Data Model (`Room` interface in `src/cards/types.ts`)
```typescript
export interface Room {
    name: string;
    area?: string;
    boundary: [number, number][];  // Single boundary, used for BOTH overview and detail
    entities: EntityConfig[];      // Single entity list
    // ... dashboard flags, color, etc.
}
```

### Rendering Flow

1. **Main card** (`scalable-house-plan.ts`) manages view state (`overview` | `detail` | `entities`)
2. **Overview** (`scalable-house-plan-overview.ts`) renders all rooms on the floor plan image
   - Each room is a `<scalable-house-plan-room mode="overview">` at absolute coordinates matching the floor plan
   - Scale is non-uniform (scaleX/scaleY) to fit the viewport
   - Room boundary is in floor-plan pixel coordinates
3. **Detail** (`scalable-house-plan-detail.ts`) renders ONE room filling the screen
   - Uses `<scalable-house-plan-room mode="detail">`
   - `roomBounds = getRoomBounds(room)` computes bounding box from **the same** `room.boundary`
   - Uniform scale = min(viewportWidth/roomWidth, viewportHeight/roomHeight)
   - Background image is clipped to the boundary polygon
4. **Room component** (`scalable-house-plan-room.ts`)
   - `willUpdate()` computes `_cachedOverviewRoom` by filtering entities where `plan.overview !== false`
   - Overview renders `_cachedOverviewRoom.entities`, detail renders `room.entities`
   - Both share the same `room.boundary`
5. **Element renderer** (`element-renderer-shp.ts`)
   - Elements are positioned using `plan.left/top/right/bottom` as percentages of room bounds
   - `getRoomBounds()` derives dimensions from `room.boundary`

### Key Constraints
- Boundary is in floor-plan pixel coordinates → overview position depends on it
- Detail view calculates its content size from `getRoomBounds(room)`
- Elements reference their positions relative to boundary bounds
- Entity cache (`_roomEntityCache`) is keyed by `room.name`
- Editor interacts via room index (not name) for preview, element selection, etc.

---

## Proposal 1: Detail Subroom (Recommended)

### Concept
Add an optional `detail` sub-object on the `Room` that overrides boundary and entities when rendering the detail view. The overview keeps using the parent room's boundary/entities. If `detail` is absent, behavior is unchanged (backward compatible).

### Data Model
```typescript
export interface DetailRoomConfig {
    boundary: [number, number][];   // Separate boundary for detail view
    entities?: EntityConfig[];      // If set, replaces parent entities in detail; if absent, inherits parent
}

export interface Room {
    // ... existing fields ...
    detail?: DetailRoomConfig;      // Optional override for detail view
}
```

### How It Works
- **Overview**: unchanged — uses `room.boundary` and `room.entities` (filtered by `plan.overview`)
- **Detail**: if `room.detail` exists:
  - `getRoomBounds()` uses `room.detail.boundary` instead of `room.boundary`
  - Entities come from `room.detail.entities` (if specified) or fall back to `room.entities`
  - Background image clip uses detail boundary
- **Editor**: the "Detail" section would show an expandable panel for configuring `detail.boundary` and `detail.entities`

### Affected Files
| File | Change |
|------|--------|
| `src/cards/types.ts` | Add `DetailRoomConfig` interface, add `detail?` field to `Room` |
| `src/cards/scalable-house-plan-detail.ts` | Use `room.detail?.boundary ?? room.boundary` for bounds calc |
| `src/components/scalable-house-plan-room.ts` | In `_renderDetail()`, swap boundary and entities when `detail` exists |
| `src/components/element-renderer-shp.ts` | No change (receives room with correct entities already) |
| `src/cards/scalable-house-plan.ts` | Entity cache considers detail entities too |
| `src/cards/editor-components/editor-room-shp.ts` | Add "Detail View" section for boundary + entities |

### Pros
- Clean separation of concerns — overview and detail are independent
- Backward compatible — no `detail` = current behavior
- Detail boundary can be any shape/size (doesn't need to overlap overview boundary)
- Entities can be completely different (dashboard overview shows clock, detail shows full controls)
- Matches existing mental model: "a room has a detail view you can configure"

### Cons
- Two sets of boundary points to maintain per room (if used)
- Entity positions in the detail view reference the detail boundary, which is a different coordinate space than the overview boundary — need to be careful about documentation
- Slightly more complex editor UI

### Variant: Full Subroom Definition
```typescript
export interface Room {
    // ... existing fields ...
    detail?: Omit<Room, 'name' | 'area' | 'detail'>;  // Full room override minus meta
}
```
This allows detail to also override `color`, `show_as_dashboard`, `dashboard_glare`, etc. More flexible but heavier.

---

## Proposal 2: Separate Entity & Boundary Lists per View

### Concept
Instead of a sub-object, add parallel fields directly on the Room for detail-specific overrides.

### Data Model
```typescript
export interface Room {
    // ... existing fields ...
    boundary: [number, number][];            // Used in overview (and detail if detail_boundary absent)
    detail_boundary?: [number, number][];    // If set, used instead of boundary for detail view
    detail_entities?: EntityConfig[];         // If set, used instead of entities for detail view
}
```

### How It Works
Same logic as Proposal 1, but flat fields instead of a nested object.

### Pros
- Simpler data model — no nesting, easy to understand in YAML
- Easy to add one override without touching the other (e.g., only override boundary, keep entities)
- YAML config stays flat and scannable

### Cons
- Pollutes the Room interface with many `detail_*` prefixed fields as we add more overrides
- Doesn't scale well if we later need overview-specific overrides too (would need `overview_*` fields)
- Less semantic grouping — related detail config is scattered across the Room interface
- Hard to know which fields can be overridden at a glance

---

## Proposal 3: View Configurations Map

### Concept
Generalize view-specific overrides into a keyed map, allowing any view to override any subset of room properties.

### Data Model
```typescript
export interface ViewConfig {
    boundary?: [number, number][];
    entities?: EntityConfig[];
    color?: string;
    show_as_dashboard?: boolean;
    dashboard_glare?: string;
    dashboard_overview_opacity?: number;
}

export interface Room {
    // ... existing fields (serve as defaults) ...
    views?: {
        overview?: ViewConfig;    // Overrides for overview rendering
        detail?: ViewConfig;      // Overrides for detail rendering
    };
}
```

### How It Works
- Room-level fields are the defaults
- `views.detail` overrides specific fields when rendering detail view
- `views.overview` overrides specific fields when rendering overview view
- Merge logic: `effectiveRoom = { ...room, ...(room.views?.[currentMode] ?? {}) }`

### Pros
- Most flexible and extensible — any new view mode just needs an entry
- Clean separation: base config + per-view overrides
- Could later support custom named views beyond overview/detail
- Works symmetrically for both directions (override overview OR detail)

### Cons
- Most complex to implement and maintain
- Over-engineered for current needs (YAGNI) — only two views exist
- YAML configuration becomes deeply nested and harder for users to write
- Merge logic needs careful handling (partial overrides, arrays vs objects)
- Editor UI becomes significantly more complex with a "views" tab

---

## Proposal 4: Linked Rooms (Virtual Detail Room)

### Concept
Allow a room to reference another room by name as its detail view. The "detail room" is a regular room entry in the `rooms` array but marked as hidden from overview.

### Data Model
```typescript
export interface Room {
    // ... existing fields ...
    detail_room?: string;          // Name of another room to use as detail view
    hidden_from_overview?: boolean; // Don't render this room on the overview
}
```

### YAML Example
```yaml
rooms:
  - name: "Dashboard"
    boundary: [[100,100], [300,100], [300,200], [100,200]]
    entities:
      - entity: sensor.time
        plan: { left: 50%, top: 50% }
    show_as_dashboard: true
    detail_room: "Dashboard Detail"
    
  - name: "Dashboard Detail"
    hidden_from_overview: true
    boundary: [[0,0], [800,0], [800,600], [0,600]]
    entities:
      - entity: sensor.temperature
        plan: { left: 30%, top: 40% }
      - entity: light.living_room
        plan: { left: 70%, top: 40% }
    show_as_dashboard: true
```

### How It Works
- Overview renders only rooms where `hidden_from_overview !== true`
- When user clicks a room with `detail_room` set, detail view opens the referenced room instead
- The linked room is a full `Room` with its own boundary, entities, dashboard settings
- Entity cache works per-room as usual

### Affected Files
| File | Change |
|------|--------|
| `src/cards/types.ts` | Add `detail_room?` and `hidden_from_overview?` to Room |
| `src/cards/scalable-house-plan.ts` | `_openRoomDetail()` resolves `detail_room` reference to find the target room index |
| `src/cards/scalable-house-plan-overview.ts` | Filter out rooms with `hidden_from_overview: true` |
| `src/cards/scalable-house-plan-detail.ts` | No change (receives the resolved room) |
| `src/components/scalable-house-plan-room.ts` | No change |

### Pros
- **Reuses existing room infrastructure entirely** — no new rendering code
- Each "view" is a full room → full power of the Room interface (boundary, entities, dashboard config, color, area, etc.)
- Easy to understand: "this room opens that room when clicked"
- Editor can reuse existing room editing UI for the detail room
- Could be used for non-dashboard scenarios too (e.g., a room that zooms into a different area)

### Cons
- Two room entries in the config for one logical room — could be confusing
- `hidden_from_overview` is a somewhat awkward concept (room exists but isn't visible)
- Room index references from editor become more complex (room 3 might be a hidden detail room)
- Entity cache / dynamic colors for the hidden room are computed but never shown in overview
- Room naming: the detail room needs a unique name, creating a naming convention burden

---

## Proposal 5: Detail Subroom with Inheritance (Hybrid of 1 & 4)

### Concept
Same as Proposal 1 but with an explicit inheritance model: the detail subroom inherits all parent room properties by default and selectively overrides only what's different.

### Data Model
```typescript
export interface Room {
    // ... existing fields ...
    detail?: {
        boundary?: [number, number][];  // Override boundary (if absent, inherits parent)
        entities?: EntityConfig[];       // Override entities (if absent, inherits parent)
        // Any other Room field can be overridden here:
        color?: string;
        show_as_dashboard?: boolean;
        dashboard_glare?: string;
        // etc.
    };
}
```

### Merge Logic
```typescript
function getEffectiveDetailRoom(room: Room): Room {
    if (!room.detail) return room;
    return {
        ...room,           // Base properties
        ...room.detail,    // Override with detail-specific
        name: room.name,   // Name always from parent
        area: room.area,   // Area always from parent
    };
}
```

### Pros
- Single room entry with optional detail customization
- Only override what you need — most fields inherited
- Avoids hidden rooms cluttering the config
- Forward compatible: new Room fields are automatically inheritable

### Cons
- Merge logic needs careful implementation (especially for arrays like entities — replace, not merge)
- Need to decide semantics: does `detail.entities` **replace** or **extend** parent entities?
- Documentation must clearly explain inheritance rules

---

## Comparison Matrix

| Criteria | P1: Subroom | P2: Flat Fields | P3: Views Map | P4: Linked Rooms | P5: Subroom+Inherit |
|----------|:-----------:|:---------------:|:-------------:|:----------------:|:-------------------:|
| Backward compatible | ✅ | ✅ | ✅ | ✅ | ✅ |
| YAML simplicity | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Implementation effort | Medium | Low | High | Low-Medium | Medium |
| Extensibility | Good | Poor | Excellent | Good | Good |
| Reuses existing code | Partial | Partial | Partial | Full | Partial |
| YAGNI compliance | ✅ | ✅ | ❌ | ✅ | ✅ |
| Editor complexity | Medium | Low | High | Low | Medium |
| Conceptual simplicity | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

---

## Recommendation

**Proposal 1 (Detail Subroom)** is the best balance of simplicity, power, and maintainability, with elements of Proposal 5's inheritance for convenience. Here is the refined recommendation:

### Recommended Data Model
```typescript
export interface DetailViewConfig {
    boundary: [number, number][];    // Required — the whole point is a different size
    entities?: EntityConfig[];       // Optional — if absent, inherits parent room's entities
}

export interface Room {
    // ... existing fields ...
    detail?: DetailViewConfig;
}
```

### Key Design Decisions
1. **`boundary` is required** in `detail` — if you're adding a detail config, it's because you want a different boundary
2. **`entities` is optional** with fallback to parent — most users will want different content, but inheriting is the safe default
3. **No other overrides initially** — `color`, `show_as_dashboard` etc. inherit from parent. Can be added later if needed (YAGNI)
4. **Entity positions** in the detail subroom reference the detail boundary coordinate space

### YAML Example
```yaml
rooms:
  - name: "Status Dashboard"
    boundary: [[520,280], [720,280], [720,380], [520,380]]
    show_as_dashboard: true
    entities:
      - entity: sensor.time
        plan: { left: 50%, top: 50%, overview: true }
    detail:
      boundary: [[0,0], [900,0], [900,600], [0,600]]
      entities:
        - entity: sensor.temperature
          plan: { left: 20%, top: 30% }
        - entity: sensor.humidity
          plan: { left: 50%, top: 30% }
        - entity: light.living_room
          plan: { left: 80%, top: 30% }
```

---

## Open Questions

1. **Should detail entities inherit `plan.overview` filtering?** Probably not — detail entities are detail-only by definition. The `overview` flag only matters for the parent room's entities.
Answer: correct

2. **Should the floor plan image show through the detail boundary?** For dashboard rooms, no (dashboard background). For regular rooms with detail override, yes — the image clips to the detail boundary, which may show a different/larger area of the floor plan.
Answer: yes

3. **Editor UX**: Should the detail subroom have its own "preview" mode? Or should clicking the room eye icon in the editor show the detail subroom if it exists?
Answer: Yes - when detail room is shown in the editor, the preview should reflect the detail room's boundary and entities. The eye icon could toggle between overview and detail preview modes as currently.

4. **Entity badge count**: Should `_entitiesNotOnDetailCount` consider the detail subroom's entities (if present) instead of the parent entities?
Answer: yes

5. **Dynamic colors**: Should the detail subroom calculate its own dynamic colors, or inherit the parent room's dynamic color state?
Answer: inherit

# My consideration
I like the proposal 5. Also, always inherit and don't allow to override: 
- name - the name should be '${parent_name}_detail' and it should be generated automatically, so the user doesn't have to care about it. It also simplifies the editor UI, because we don't have to show the name field for the detail subroom.
- area - the area should be inherited as well, because it doesn't make sense to have a
- disable_dynamic_color
- show_as_dashboard
- dashboard_glare


