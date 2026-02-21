# Proposal: Detail View Customization — Detail Subroom with Inheritance

## Summary

Add an optional `detail` sub-object on the `Room` interface that overrides boundary and entities when rendering the detail view. The detail subroom inherits all parent room properties by default and selectively overrides only what's different. If `detail` is absent, behavior is unchanged (fully backward compatible).

**Chosen approach**: Proposal 5 from the analysis — Detail Subroom with Inheritance.

---

## Problem

Currently, the detail view renders using the **same** room definition as the overview — same boundary polygon and same entities list. This means:
- The detail view's size and shape are locked to the room's overview boundary
- No way to show different/more entities in detail vs overview
- Dashboard rooms can't have a small overview tile but a large detail canvas

---

## Design Decisions

### Inheritance Rules

The detail subroom **always inherits** the following fields from the parent room — they cannot be overridden:

| Field | Reason |
|-------|--------|
| `name` | Auto-generated as `${parent_name}_detail` — user doesn't configure it |
| `area` | Logically the same room, same HA area |
| `disable_dynamic_color` | Dynamic color is a room-level concept, detail inherits parent state |
| `show_as_dashboard` | Dashboard mode applies to the entire room (both views) |
| `dashboard_glare` | Tied to dashboard mode, must be consistent |

### Overridable Fields

The detail subroom **can optionally override**:

| Field | Default (if not specified) |
|-------|---------------------------|
| `boundary` | Inherits parent's boundary |
| `entities` | Inherits parent's entities |
| `color` | Inherits parent's color |
| `elements_clickable_on_overview` | N/A (not relevant for detail) |
| `dashboard_overview_opacity` | N/A (overview-only field) |

### Entity Behavior

- Detail entities do **not** use `plan.overview` filtering — detail entities are detail-only by definition
- The `plan.overview` flag only applies to the parent room's entities on the overview
- `detail.entities` **replaces** (not merges with) parent entities when present

### Floor Plan Image

- For **dashboard rooms** (`show_as_dashboard: true`): dashboard background renders in both views (inherited)
- For **regular rooms**: the floor plan image clips to the detail boundary, which may show a different/larger area of the floor plan than the overview boundary

### Dynamic Colors

- Dynamic colors are **inherited** from the parent room — the detail subroom does not calculate its own dynamic color state

### Entity Badge Count

- `_entitiesNotOnDetailCount` (badge in detail header) considers the detail subroom's entities when `room.detail.entities` is present

### Editor Preview

- When the detail view is shown in the editor, the preview reflects the detail room's boundary and entities
- The eye icon toggles between overview and detail preview modes (as currently)

---

## Data Model

### New Interface

```typescript
/**
 * Optional detail view configuration for a room.
 * Inherits all parent room properties by default.
 * Only override what's different for the detail view.
 */
export interface DetailViewConfig {
    boundary?: [number, number][];   // Override boundary for detail view
    entities?: EntityConfig[];        // Override entities for detail view (replaces parent, not merges)
    color?: string;                   // Override background color for detail view
}
```

### Updated Room Interface

```typescript
export interface Room {
    name: string;
    area?: string;
    boundary: [number, number][];
    entities: EntityConfig[];
    color?: string;
    elements_clickable_on_overview?: boolean;
    disable_dynamic_color?: boolean;
    show_as_dashboard?: boolean;
    dashboard_glare?: 'top-center' | 'left-center' | 'full' | 'lcd';
    dashboard_overview_opacity?: number;
    detail?: DetailViewConfig;  // Optional detail view override
}
```

### Resolution Helper

```typescript
/**
 * Resolves the effective room config for the detail view.
 * Returns the room with detail overrides applied (boundary, entities, color).
 * Always inherits: name, area, disable_dynamic_color, show_as_dashboard, dashboard_glare.
 */
function getEffectiveDetailRoom(room: Room): Room {
    if (!room.detail) return room;
    return {
        ...room,
        boundary: room.detail.boundary ?? room.boundary,
        entities: room.detail.entities ?? room.entities,
        color: room.detail.color ?? room.color,
        // name is always parent name (auto-generated _detail suffix is internal only)
        // area, disable_dynamic_color, show_as_dashboard, dashboard_glare — always inherited (not in DetailViewConfig)
    };
}
```

---

## YAML Examples

### Dashboard Room with Different Size and Content

```yaml
rooms:
  - name: "Status Dashboard"
    boundary: [[520,280], [720,280], [720,380], [520,380]]
    show_as_dashboard: true
    entities:
      - entity: sensor.time
        plan: { left: 50%, top: 50% }
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

### Regular Room with Larger Detail Area

```yaml
rooms:
  - name: "Kitchen"
    boundary: [[100,200], [300,200], [300,350], [100,350]]
    entities:
      - entity: light.kitchen_main
        plan: { left: 50%, top: 50% }
      - entity: sensor.kitchen_temp
        plan: { left: 20%, top: 80%, overview: false }
    detail:
      boundary: [[50,150], [350,150], [350,400], [50,400]]
```
*In this example, the detail boundary is larger than the overview boundary, showing more of the surrounding floor plan. Entities are inherited from the parent (including `sensor.kitchen_temp` which is hidden on overview via `overview: false` but visible on detail).*

### Room with Only Boundary Override (Entities Inherited)

```yaml
rooms:
  - name: "Bedroom"
    boundary: [[400,100], [550,100], [550,250], [400,250]]
    entities:
      - entity: light.bedroom
        plan: { left: 50%, top: 40% }
      - entity: climate.bedroom
        plan: { left: 50%, top: 70% }
    detail:
      boundary: [[380,80], [570,80], [570,270], [380,270]]
```
*Detail uses a slightly larger boundary but the same entities.*

---

## Affected Files

| File | Change Description |
|------|-------------------|
| `src/cards/types.ts` | Add `DetailViewConfig` interface, add `detail?` field to `Room`, add `getEffectiveDetailRoom()` helper |
| `src/cards/scalable-house-plan-detail.ts` | Use resolved detail room for bounds calculation and rendering |
| `src/components/scalable-house-plan-room.ts` | In `_renderDetail()`, use resolved detail boundary and entities |
| `src/cards/scalable-house-plan.ts` | `_roomEntityCache` considers detail entities; entity badge count uses detail entities when present |
| `src/cards/editor-components/editor-room-shp.ts` | Add "Detail View" expandable section for `detail.boundary` and `detail.entities` |
| `src/components/element-renderer-shp.ts` | No change — receives room with correct entities already resolved |

---

## Implementation Plan

### Phase 1: Data Model & Core Rendering
1. Add `DetailViewConfig` interface and `detail?` field to `Room` in `types.ts`
2. Add `getEffectiveDetailRoom()` helper function
3. Update `scalable-house-plan-detail.ts` to resolve detail room before rendering
4. Update `scalable-house-plan-room.ts` `_renderDetail()` to use resolved boundary/entities

### Phase 2: Cache & Badge Fixes
5. Update `_roomEntityCache` in `scalable-house-plan.ts` to account for detail entities
6. Update `_entitiesNotOnDetailCount` to use detail entities when present

### Phase 3: Editor Support
7. Add "Detail View" section in `editor-room-shp.ts` with boundary and entities configuration
8. Implement editor preview toggle for detail subroom

---

## Backward Compatibility

- No `detail` field = current behavior (detail view uses parent boundary and entities)
- Existing configurations are unaffected
- The `detail` field is fully optional

---

## Open Items / Future Considerations

- **Drag-and-drop for detail entities**: The interactive editor positions elements relative to room bounds. When detail boundary differs from overview boundary, the editor needs to use the correct coordinate space based on which view is being edited.
- **Element defaults**: `element_defaults` at the house level should apply to detail entities the same way they apply to regular entities.
- **Validation**: Editor should validate that detail boundary points are valid (at least 3 points forming a polygon).
