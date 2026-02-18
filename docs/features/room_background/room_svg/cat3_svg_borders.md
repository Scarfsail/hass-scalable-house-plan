# Category 3: SVG Borders

## Problem Analysis

### Description

Every SVG room polygon is rendered with `stroke-width="2"` and a hardcoded stroke color. On dark backgrounds, the near-transparent `rgba(0, 0, 0, 0.1)` stroke was essentially invisible. On light photorealistic backgrounds, even a 10%-opacity black stroke creates visible room boundary outlines that feel artificial and overlay the natural textures of the background image.

The borders appear in two distinct scenarios:
1. **Dynamic color active** (any state including default): `strokeColor = 'rgba(0, 0, 0, 0.1)'`
2. **`showRoomBackgrounds` debug mode**: `strokeColor = 'rgba(0, 0, 0, 0.3)'` (more visible)

In normal operation (no debug mode), the fill may be transparent but the stroke is still drawn when dynamic colors are active.

### Affected Code

**`src/components/scalable-house-plan-room.ts`**

`_getRoomColors()` (line 379):
```typescript
// When dynamic colors are active:
return {
    fillColor: `url(#${this._currentGradient.id})`,
    strokeColor: 'rgba(0, 0, 0, 0.1)',  // Hardcoded — no way to configure
    useGradient: true,
    gradientId: this._currentGradient.id
};
```

`_renderOverview()` — polygon elements (lines 496–528):
```svg
stroke="${strokeColor}"
stroke-width="2"   <!-- Always 2, never configurable, never 0 -->
```

The stroke is embedded in the SVG template literal — there is no conditional to set `stroke-width="0"` or `stroke="none"`.

### Impact on User Experience

- Room boundaries are perceptibly outlined on light backgrounds
- The effect is most pronounced near corners and along straight edges where the 2px stroke concentrates
- In idle state, users see room outlines on the floor plan image even though "nothing is happening"
- Inconsistency: when `showRoomBackgrounds=false` and dynamic colors are NOT active (type=transparent), the stroke is `'transparent'` (correct) — but when dynamic colors ARE active with the 'default' gradient, the stroke is still drawn

### Observations

The `showRoomBackgrounds=false` + no dynamic colors path already correctly sets `strokeColor = 'transparent'`. The problem is that the dynamic color path hardcodes `rgba(0, 0, 0, 0.1)` regardless of whether borders are desired.

---

## Requirements

### REQ-3.1: Configurable Border Visibility

**Priority:** High

The polygon stroke (border) should be configurable per-user, defaulting to invisible for light backgrounds.

**Acceptance criteria:**
- A global config option controls border rendering, e.g. `dynamic_colors.show_border: boolean` (default `false`)
- When `false`: `stroke="none"` (or `stroke-width="0"`) on all polygons in dynamic color mode
- When `true`: current behavior — `stroke="rgba(0,0,0,0.1)"` with `stroke-width="2"`
- The existing `showRoomBackgrounds` debug mode continues to show borders regardless of this setting (since it's a debug/editor tool)
- Editable in the UI editor (Dynamic Room Colors section or a dedicated "Appearance" section)

### REQ-3.2: Configurable Border Color and Width

**Priority:** Low

If borders are enabled (REQ-3.1), the color and width should be configurable rather than hardcoded.

**Acceptance criteria:**
- Config options: `dynamic_colors.border_color: string` (default `'rgba(0,0,0,0.1)'`) and `dynamic_colors.border_width: number` (default `2`)
- Applied to all dynamic-color polygon strokes
- Validated as valid CSS color / positive number

### REQ-3.3: No Border in Idle/Transparent State

**Priority:** Medium

When the room is in idle state (no active lights/motion) and the background is transparent (per REQ-1.1 from Category 1), the stroke must also be transparent to avoid drawing invisible room outlines.

**Acceptance criteria:**
- When `fillColor === 'transparent'`, `strokeColor` is automatically `'transparent'` as well
- This is a consequence of implementing REQ-1.1 — the 'default' type becomes 'transparent' and the existing code already handles `strokeColor = 'transparent'` for the non-gradient path

---

## Technical Notes

The cleanest implementation is:
1. In `_getRoomColors()`, when dynamic color type is `'default'` (idle) and REQ-1.1 is implemented, return `strokeColor: 'transparent'` automatically
2. For active states (motion/lights), check the `dynamic_colors.show_border` config to decide the stroke

The `stroke-width="2"` in the SVG template literal should be changed to `stroke-width="${strokeWidth}"` using a variable from `_getRoomColors()`, or alternatively set `stroke="none"` (which already implies zero stroke in SVG).

Using `stroke="none"` is simpler and more semantically correct than `stroke-width="0"`.
