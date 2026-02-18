# Category 1: SVG Background Transparency

## Problem Analysis

### Description

On dark backgrounds, SVG room polygons rendered a near-invisible gradient overlay at all times (including idle/default state with ~5% gray). This was imperceptible. On light photorealistic backgrounds, the polygon overlay is now visible as a subtle "film" over the underlying image, reducing texture contrast and creating a painted-over appearance even when no lights are on and no motion is detected.

Additionally, in normal operation (overview mode, no events), when `showRoomBackgrounds` is `false`, the fill is correctly `'transparent'` — but this only applies to the *no-dynamic-color* code path. The *dynamic color* code path (which is the normal path) always renders a gradient, even for the `'default'` state which is meant to represent "nothing active".

### Affected Code

**`src/utils/room-color-helpers.ts`**
- `calculateDynamicRoomColor()` (line 181): Returns `{ color: defaultColor, type: 'default' }` even when nothing is active. The `type` is `'default'`, not `'transparent'`.
- `createGradientDefinition()` (line 63): Always creates a gradient from the base color, never produces a zero-opacity result.

**`src/components/scalable-house-plan-room.ts`**
- `_getRoomColors()` (line 379): Only returns transparent fill when `_currentColor.type === 'transparent'`. The `'default'` type is treated the same as `'motion'` or `'lights'` — it always produces a gradient URL fill.
- `_renderOverview()` (line 428): The SVG polygon always gets a `fill` value (either a gradient URL or `'transparent'`), but in gradient mode it is never `'transparent'`.

### Scenarios

| State | Expected (light bg) | Actual |
|-------|---------------------|--------|
| Nothing active (idle) | Fully transparent, image shows through | Very faint gradient overlay visible |
| Lights on | Warm gradient visible | Warm gradient visible (correct) |
| Motion detected | Blue pulsing gradient | Blue pulsing gradient (correct) |
| `disable_dynamic_color: true` | Transparent | Transparent (correct) |
| `showRoomBackgrounds: true` (debug) | Room color shown | Room color shown (correct) |

### Impact on User Experience

- Photorealistic backgrounds appear "washed out" or dull in idle state
- Room boundaries are subtly but perceptibly visible at all times
- The spatial separation between the image textures and the SVG overlay layer is lost

---

## Requirements

### REQ-1.1: Transparent Default State

**Priority:** High

The SVG room polygon fill **must** be fully transparent when the room is in the default/idle state (no lights on, no motion detected, no occupancy).

**Acceptance criteria:**
- When no entities in a room are active, the SVG polygon fill is `'transparent'` (or `fill-opacity: 0`)
- The underlying photorealistic background image is fully visible without any overlay film
- No gradient is created or rendered for the default state

### REQ-1.2: Configurable Default State Rendering

**Priority:** Medium

Users **should** be able to optionally configure a non-transparent idle/default color for rooms if they prefer the visual separation that a subtle overlay provides (e.g., users with very dark backgrounds may prefer to keep the subtle gray).

**Acceptance criteria:**
- A configuration option (e.g., `dynamic_colors.show_default_overlay: boolean`, default `false`) controls whether the default gradient overlay is rendered
- When `false` (default): idle rooms are fully transparent
- When `true`: idle rooms render with the configured `dynamic_colors.default` color as before
- This config is editable in the UI editor (Dynamic Room Colors section)

### REQ-1.3: No Regression for Dark Backgrounds

**Priority:** High

Users who have dark backgrounds and rely on the current behavior (subtle gray overlay for visual room boundaries) must not lose functionality.

**Acceptance criteria:**
- The `show_default_overlay` option (or equivalent) when `true` preserves identical current behavior
- Existing YAML configurations without `show_default_overlay` specified default to `false` (transparent idle state) — this is the breaking change that improves light background compatibility
- Migration note documented

---

## Technical Notes

The simplest fix is to change `calculateDynamicRoomColor()` to return `type: 'transparent'` for the `'default'` state, making the gradient path skip for idle rooms. However, this removes the subtle room delineation for all users. The REQ-1.2 config option preserves backward compatibility.

The `type: 'transparent'` shortcut already exists in the code — `disable_dynamic_color: true` at room level and `show_room_backgrounds: true` at config level both use it. The fix is to add a third path for idle state using the same mechanism.
