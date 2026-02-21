# Proposal: Dashboard View Instead of Detail Room

## Summary

Replace the current SVG-based detail view with the ability to reference an existing Home Assistant dashboard view for any room. When a user taps a room that has a `detail_view` configured, the card navigates to (or later embeds) that dashboard view instead of showing the clipped floor plan detail.

This **supersedes** `detail_view_customization_proposal.md` — instead of defining a detail subroom with boundary/entities overrides, users simply point to a real HA dashboard view.

---

## Problem

The current detail view renders the floor plan clipped to the room boundary with positioned entities. While useful, it has limitations:

- Dashboard-style rooms (status panels, control screens) need richer layouts than SVG entity positioning allows
- Users already build detailed views in HA's native dashboard editor with sections, grids, and cards
- Maintaining two layout systems (SVG positioning + HA dashboard) is redundant
- The detail subroom approach from the previous proposal adds complexity to the card config without solving the core layout limitation

---

## Inspiration

The [embedded-view-card](https://github.com/redkanoon/embedded-view-card) demonstrates that it's technically feasible to render another dashboard view inline using HA's internal `hui-view` component. Key takeaways:

- Views can be loaded from the current or another dashboard via WebSocket (`lovelace/config`)
- The `hui-view` element can be instantiated programmatically with `hass`, `lovelace`, `index`, and `viewConfig` properties
- This relies on internal HA components (`hui-root`, `hui-view`) which may change across HA versions

---

## Design

### Configuration

A single `detail_view` field on the `Room` interface, using the format `dashboard_path/view_path`:

```typescript
export interface Room {
    name: string;
    // ... existing fields ...
    detail_view?: string;  // "dashboard_path/view_path" — open this view instead of detail room
}
```

**Parsing rules** (same as embedded-view-card's target string):
- `"my-dashboard/my-view"` → navigate to view `my-view` on dashboard `my-dashboard`
- `"/my-view"` or `"my-view"` → navigate to view `my-view` on the current dashboard
- If `detail_view` is not set → current behavior (SVG detail room) is preserved

### Available for All Room Types

Any room (regular or `show_as_dashboard: true`) can use `detail_view`. This is useful for:
- **Dashboard rooms**: Small overview tile → full dashboard view on tap
- **Regular rooms**: Floor plan overview → detailed HA view with cards, sections, etc.

### Behavior When `detail_view` Is Set

- Tapping the room **does not** open the SVG detail overlay
- Instead, the card navigates to (or embeds) the referenced dashboard view
- Long-press behavior (toggle lights) remains unchanged
- The entities badge / entities list view is still accessible (from the overview, not detail)

---

## YAML Examples

### Dashboard Room Navigating to a Full View

```yaml
rooms:
  - name: "Status Panel"
    boundary: [[520,280], [720,280], [720,380], [520,380]]
    show_as_dashboard: true
    detail_view: "my-dashboard/status-detail"
    entities:
      - entity: sensor.time
        plan: { left: 50%, top: 50% }
```

### Regular Room with Dashboard Detail

```yaml
rooms:
  - name: "Kitchen"
    boundary: [[100,200], [300,200], [300,350], [100,350]]
    detail_view: "rooms-dashboard/kitchen"
    entities:
      - entity: light.kitchen_main
        plan: { left: 50%, top: 50% }
```

### View on Current Dashboard

```yaml
rooms:
  - name: "Living Room"
    boundary: [[50,50], [250,50], [250,200], [50,200]]
    detail_view: "/living-room-detail"
    entities:
      - entity: light.living_room
        plan: { left: 50%, top: 50% }
```

---

## Implementation Plan — Incremental

### Increment 1: Navigate to View (Simplest)

**Goal**: When a room has `detail_view`, tapping it navigates to the referenced dashboard view using HA's standard navigation pattern.

**How it works**:
1. User taps a room with `detail_view` set
2. Instead of `_openRoomDetail()`, the card calls HA's navigate: `history.pushState(null, "", navigation_path)` + fires `location-changed` event
3. The browser navigates away from the floor plan card to the target dashboard view
4. User uses the browser back button (or HA navigation) to return

**Affected Files**:

| File | Change |
|------|--------|
| `src/cards/types.ts` | Add `detail_view?: string` to `Room` interface |
| `src/cards/scalable-house-plan.ts` | In `_openRoomDetail()`, check if room has `detail_view` — if yes, navigate instead of showing SVG detail |
| `src/cards/editor-components/editor-room-shp.ts` | Add `detail_view` text field in room editor |

**Navigation logic** (in `_openRoomDetail`):

```typescript
private _openRoomDetail(roomIndex: number) {
    const room = this.config.rooms[roomIndex];
    
    if (room.detail_view) {
        this._navigateToView(room.detail_view);
        return;
    }
    
    // Existing detail overlay logic
    this._selectedRoomIndex = roomIndex;
    this._currentView = 'detail';
    if (!this._isEditMode()) {
        history.pushState({ view: 'room-detail', roomIndex }, '', '');
    }
    this.requestUpdate();
}

private _navigateToView(detailView: string) {
    // Parse "dashboard/view" or "/view" format
    const path = detailView.startsWith('/') ? detailView : `/${detailView}`;
    
    window.history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", {
        detail: { replace: false },
        bubbles: true,
        composed: true,
    }));
}
```

**Effort**: Small — a few lines of logic + one config field.

---

### Increment 2: Embed View in Detail Overlay (Future)

**Goal**: Instead of navigating away, render the referenced dashboard view inside the existing detail overlay (same UX as the current SVG detail — dialog slides in with header and back button).

**How it works**:
1. User taps a room with `detail_view`
2. The detail overlay opens (same animation/backdrop as current SVG detail)
3. Instead of `scalable-house-plan-room` in detail mode, the overlay renders a `hui-view` element loaded with the target view's config
4. The header still shows room name, back button, and entity badge
5. Back button closes the overlay, returning to the floor plan

**Technical approach** (inspired by embedded-view-card):
- Fetch the target dashboard's lovelace config via WebSocket: `hass.callWS({ type: "lovelace/config", url_path: dashboardPath })`
- Find the matching view by `path` in the config's `views` array
- Create a `hui-view` element and set `hass`, `lovelace`, `index`, `viewConfig`
- Render it in the detail overlay's content area

**New component**: `scalable-house-plan-detail-view.ts` — a sibling to `scalable-house-plan-detail.ts` that renders a `hui-view` instead of `scalable-house-plan-room`.

**Affected Files**:

| File | Change |
|------|--------|
| `src/cards/scalable-house-plan-detail-view.ts` | **New** — component that renders `hui-view` in the detail overlay |
| `src/cards/scalable-house-plan.ts` | In render, use `scalable-house-plan-detail-view` when room has `detail_view`, else use existing `scalable-house-plan-detail` |

**Risks**:
- Uses internal HA components (`hui-view`, `hui-root`) that may change between HA versions
- Need to handle errors (dashboard not found, view not found, permissions)
- Cache management for fetched lovelace configs
- Self-embedding loop detection (room on floor plan view → embeds same view → infinite loop)

---

## Backward Compatibility

- No `detail_view` field = current behavior (SVG detail overlay)
- Existing configurations are completely unaffected
- The field is fully optional

---

## Comparison with Previous Proposal

| Aspect | Detail Subroom (previous) | Dashboard View (this proposal) |
|--------|--------------------------|-------------------------------|
| Config complexity | New `detail` object with boundary, entities, color | Single `detail_view` string |
| Layout capabilities | SVG-positioned entities only | Full HA dashboard (sections, grids, cards) |
| Maintenance | Two layout systems to maintain | Leverages existing HA dashboard editor |
| Editor support | Need custom boundary/entities editor | Simple text field (dashboard/view path) |
| Reusability | Detail defined per room | Dashboard views reusable across rooms/dashboards |
| HA integration | Self-contained | Depends on internal HA components (for embedded mode) |

---

## Open Items / Future Considerations

- **Loop detection**: When embedding (increment 2), prevent embedding a view that contains the house plan card pointing to itself
- **HA version compatibility**: `hui-view` is an internal component — monitor for breaking changes across HA releases
- **Editor UX**: Could provide a dashboard/view picker dropdown (like embedded-view-card editor) instead of requiring manual path entry
- **Dynamic mode**: Could support an entity-based dynamic target (like embedded-view-card's dynamic mode) where the view changes based on entity state
- **Back navigation**: For increment 1, ensure browser back button returns cleanly to the floor plan
- **Mobile**: Verify navigation and overlay behavior on mobile/companion app
