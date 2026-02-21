# Proposal: Room as Dashboard

## Feature Summary

Add a `show_as_dashboard` flag to rooms that transforms a room's visual appearance to look like a standalone screen/display panel. The floor plan background image is hidden and replaced with a black background, a configurable glare effect, and a thin glowing border. All entity positioning and interaction logic stays identical to a regular room.

---

## Data Model Changes

Add three optional fields to the `Room` interface in `src/cards/types.ts`:

```typescript
export interface Room {
    // ... existing fields ...
    show_as_dashboard?: boolean;             // Default: false — enables dashboard mode
    dashboard_glare?: 'top-center' | 'full'; // Default: 'top-center'
    dashboard_overview_opacity?: number;     // Default: 100 — background opacity in overview (0-100)
}
```

### Field descriptions

| Field | Type | Default | Description |
|---|---|---|---|
| `show_as_dashboard` | `boolean` | `false` | Activates dashboard rendering for this room |
| `dashboard_glare` | `'top-center' \| 'full'` | `'top-center'` | Glare effect style. `top-center` = elliptical highlight near the top (screen reflection). `full` = soft radial glow from the center outward (backlit panel). |
| `dashboard_overview_opacity` | `number` | `100` | Background opacity in overview view (0 = transparent, 100 = fully black). Detail view is always 100. |

---

## Visual Design

### Black background
The room polygon is filled with solid black. In overview the opacity is controlled by `dashboard_overview_opacity`; in detail it is always fully opaque.

### Glare effects

**`top-center`** (default): An elliptical white-to-transparent gradient anchored at the top-center of the room polygon. Simulates an overhead screen reflection or a status-board glow.

```
SVG radialGradient: cx=50%, cy=0%, r=55%
  stop 0%:  rgba(255,255,255,0.13)
  stop 100%: rgba(255,255,255,0)
```

**`full`**: A soft radial glow from the polygon centroid outward. Simulates a backlit display panel.

```
SVG radialGradient: cx=centroid.x, cy=centroid.y, r=65%
  stop 0%:  rgba(255,255,255,0.08)
  stop 100%: rgba(255,255,255,0)
```

Both gradients are rendered as an extra `<polygon>` on top of the black background, using the same boundary points and the same clip path as the rest of the room.

### Glowing border
A thin polygon stroke with an SVG blur glow filter:

```
stroke:       rgba(80, 80, 120, 0.9)   ← subtle blue-grey, monitor bezel tone
stroke-width: 2px
filter:       feGaussianBlur(stdDeviation=2) merged with SourceGraphic
```

The border applies in both overview and detail.

### Dynamic colors in dashboard mode
Dynamic room color overlays (motion, lights) are **disabled** when `show_as_dashboard` is true — equivalent to `disable_dynamic_color: true`. This is intentional: the black dashboard background provides its own visual identity; overlaying a motion/light color would clash. Individual entities on the dashboard still react to state changes as usual.

---

## Implementation Plan

### Files to modify

#### 1. `src/cards/types.ts`
Add the three new optional fields to the `Room` interface (see Data Model above).

#### 2. `src/components/scalable-house-plan-room.ts`

This is the only rendering file that needs changes; both overview and detail rendering are contained here.

**Add a private helper method `_renderDashboardBackground()`**

Returns the SVG fragment (defs + elements) that renders: black fill rect → glare overlay polygon → glowing border polygon. Used from both `_renderOverview()` and `_renderDetail()`.

```typescript
private _renderDashboardBackground(
    points: string,
    scaledWidth: number,
    scaledHeight: number,
    opacity: number,       // 0–1 float
): TemplateResult { ... }
```

It generates unique SVG IDs based on `this.room.name` and `this.mode` (same pattern used for clip paths and gradients throughout the component) to prevent collisions when multiple dashboard rooms are on screen:

```
glare-gradient-${roomSlug}-${mode}
dashboard-border-glow-${roomSlug}-${mode}
```

**Modify `_renderDetail()`**

- Wrap the existing `<image>` element in a conditional: `${!this.room.show_as_dashboard ? svg`<image .../>` : ''}`
- Insert `${this.room.show_as_dashboard ? this._renderDashboardBackground(points, scaledWidth, scaledHeight, 1.0) : ''}` after the `<defs>` block and before the color polygons.

**Modify `_renderOverview()`**

- After the existing SVG polygon for the room boundary, insert the dashboard background SVG fragment when `show_as_dashboard` is true:

```typescript
${this.room.show_as_dashboard
  ? this._renderDashboardBackground(
      this._cachedRelativePoints!,
      roomBounds.width * scaleX,
      roomBounds.height * scaleY,
      (this.room.dashboard_overview_opacity ?? 100) / 100
    )
  : ''}
```

Because the dashboard background is rendered as filled SVG polygons in the same SVG layer as the existing room polygon, it sits on top of the floor plan `<img>` automatically — no changes needed to `scalable-house-plan-overview.ts`.

**Modify `_updateDynamicColor()` / `_getRoomColors()`**

Add an early return in `_updateDynamicColor()` (before any state calculations) when `this.room.show_as_dashboard` is true, treating the room as transparent for the purposes of motion/light overlays:

```typescript
if (this.room.show_as_dashboard) {
    // Dashboard rooms never use dynamic color overlays
    this._currentColor = { type: 'transparent', color: 'transparent', activeTypes: [] };
    this._currentGradient = undefined;
    this._currentGradientInverted = undefined;
    return;
}
```

#### 3. `src/cards/editor-components/editor-room-shp.ts`

Add to the "Basic Configuration" section, after the existing `disable_dynamic_color` switch:

```html
<!-- Show as Dashboard switch -->
<div class="room-field">
    <ha-formfield .label=${localize('editor.show_as_dashboard')}>
        <ha-switch
            .checked=${this.room.show_as_dashboard ?? false}
            @change=${this._showAsDashboardChanged}
        ></ha-switch>
    </ha-formfield>
</div>

<!-- Dashboard options (only when enabled) -->
${this.room.show_as_dashboard ? html`
    <div class="room-field">
        <ha-select
            .label=${localize('editor.dashboard_glare')}
            .value=${this.room.dashboard_glare ?? 'top-center'}
            @selected=${this._dashboardGlareChanged}
        >
            <mwc-list-item value="top-center">
                ${localize('editor.dashboard_glare_top_center')}
            </mwc-list-item>
            <mwc-list-item value="full">
                ${localize('editor.dashboard_glare_full')}
            </mwc-list-item>
        </ha-select>
    </div>
    <div class="room-field">
        <ha-textfield
            label="${localize('editor.dashboard_overview_opacity')}"
            type="number"
            min="0"
            max="100"
            .value=${String(this.room.dashboard_overview_opacity ?? 100)}
            @input=${this._dashboardOpacityChanged}
            helper-persistent
            helper-text="${localize('editor.dashboard_overview_opacity_helper')}"
        ></ha-textfield>
    </div>
` : ''}
```

Add event handlers:
- `_showAsDashboardChanged(e)` → dispatch room update with `show_as_dashboard: e.target.checked`
- `_dashboardGlareChanged(e)` → dispatch room update with `dashboard_glare: e.detail.value`
- `_dashboardOpacityChanged(e)` → dispatch room update with `dashboard_overview_opacity: Number(e.target.value)`

#### 4. `src/localize/translations/cs.json`

Add the following keys to the `editor` section:

```json
"show_as_dashboard": "Zobrazit jako dashboard",
"dashboard_glare": "Efekt odlesku",
"dashboard_glare_top_center": "Horní střed (výchozí)",
"dashboard_glare_full": "Celoplošný záblesk",
"dashboard_overview_opacity": "Průhlednost v přehledu (%)",
"dashboard_overview_opacity_helper": "0 = průhledný, 100 = plně černý"
```

---

## What is NOT changing

- Entity positioning, scaling, click handling, info boxes — all identical to a regular room.
- The detail view header (back button, room name, entity count badge) — unchanged.
- The overview floor plan `<img>` element — untouched. The dashboard background is drawn on top via the room polygon SVG layer.
- The `scalable-house-plan-overview.ts` and `scalable-house-plan-detail.ts` components — no changes needed.
- YAML configuration structure — `show_as_dashboard` is a simple optional boolean on the room object.

---

## SVG Structure (detail view, dashboard mode)

```
<svg class="room-svg" ...>
  <defs>
    <clipPath id="room-clip-{name}-detail">
      <polygon points="..." />
    </clipPath>
    <!-- Glare gradient (top-center or full) -->
    <radialGradient id="glare-gradient-{name}-detail" ...>
      <stop offset="0%" stop-color="rgba(255,255,255,0.13)" />
      <stop offset="100%" stop-color="rgba(255,255,255,0)" />
    </radialGradient>
    <!-- Border glow filter -->
    <filter id="dashboard-border-glow-{name}-detail">
      <feGaussianBlur stdDeviation="2" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <!-- (1) Background image: HIDDEN when show_as_dashboard=true -->

  <!-- (2) Dashboard background: black fill -->
  <rect x="0" y="0" width="W" height="H"
        fill="black"
        clip-path="url(#room-clip-{name}-detail)" />

  <!-- (3) Glare overlay -->
  <polygon points="..."
           fill="url(#glare-gradient-{name}-detail)"
           stroke="none" />

  <!-- (4) Glowing border -->
  <polygon points="..."
           fill="none"
           stroke="rgba(80,80,120,0.9)"
           stroke-width="2"
           filter="url(#dashboard-border-glow-{name}-detail)" />

  <!-- (5) Dynamic color polygons: skipped (always transparent) -->
</svg>
```

---

## Open Questions / Future Considerations

- **Hover glare in overview**: Currently the glare is always visible in overview (at the configured opacity). A hover-brightening effect could be added later via CSS animation on the glare polygon, but is not part of this iteration.
- **Dynamic colors opt-in**: If a user wants motion/light overlays on a dashboard room, they can use `disable_dynamic_color: false` explicitly — however the current proposal always disables them. This could be made configurable in a future iteration.
- **Custom border color**: The border color is currently hardcoded to `rgba(80, 80, 120, 0.9)`. A future `dashboard_border_color` field could expose this.
