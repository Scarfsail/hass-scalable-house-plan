# Category 4: Alpha/RGBA Configuration Bug

## Problem Analysis

### Description

When users configure room dynamic colors (e.g., in the editor or via YAML), they specify rgba strings like `rgba(255, 245, 170, 0.5)`. The `0.5` is the alpha value that the user intends to control the visibility of the overlay. However, this alpha value is **silently discarded** by the rendering pipeline and replaced with hardcoded values `0.2` (inner gradient stop) and `0.05` (outer gradient stop).

This means:
- A user who sets `rgba(255, 245, 170, 0.05)` (very faint) gets the same rendered result as a user who sets `rgba(255, 245, 170, 0.9)` (very strong) — both produce 0.2 inner opacity
- Users who want to make overlays stronger on a bright background have no way to do so through the alpha channel (the primary, most intuitive way to control opacity)
- The editor placeholder text even shows values like `rgba(255, 250, 220, 0.18)` which implies the alpha matters, further confusing users

### Affected Code

**`src/utils/room-color-helpers.ts`**

`adjustOpacity()` (line 52):
```typescript
export function adjustOpacity(rgbaColor: string, opacity: number): string {
    const match = rgbaColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
    if (!match) return rgbaColor;
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${opacity})`;
    //                                                    ^^^^^^^^ hardcoded opacity from caller
    // The regex optionally captures the original alpha (group 4) but it's never used
}
```

`createGradientDefinition()` (line 63):
```typescript
const innerColor = adjustOpacity(baseColor, 0.2);   // 0.2 hardcoded
const outerColor = adjustOpacity(baseColor, 0.05);  // 0.05 hardcoded
// The user's configured alpha in baseColor is completely ignored here
```

**`src/components/scalable-house-plan-room.ts`**

`_updateDynamicColor()` (line ~320):
```typescript
// For motion inverted gradient, same pattern:
const innerColor = adjustOpacity(colorForInverted, 0.05); // hardcoded
const outerColor = adjustOpacity(colorForInverted, 0.2);  // hardcoded
```

### Secondary Issue: `room.color` Alpha Preservation

For the per-room static `room.color` field (used in detail mode), the alpha **is** preserved because it's passed directly to the SVG `fill` attribute without going through `adjustOpacity`. However, in the visual editor, there is no UI field for `room.color` — it can only be set via YAML. This means users who don't know about the YAML editor cannot set a custom per-room color with a meaningful alpha.

### Impact on User Experience

- Users cannot make overlays stronger to improve visibility on bright backgrounds
- The "alpha" field in the placeholder hints is misleading — it does nothing
- Advanced users who understand rgba() are confused when their alpha value has no effect
- No feedback is shown to indicate the alpha is being overridden

---

## Requirements

### REQ-4.1: Honor User-Configured Alpha as Gradient Inner Opacity

**Priority:** High

The alpha value in the configured `dynamic_colors.*` rgba strings **must** be used as the inner gradient stop opacity, with the outer opacity scaling relative to it.

**Acceptance criteria:**
- `createGradientDefinition()` extracts the alpha from `baseColor` and uses it as `innerColor` opacity
- The outer opacity is `innerAlpha * 0.25` (maintaining the current ratio of 0.05/0.2 = 25%)
- Example: user sets `rgba(255, 245, 170, 0.4)` → inner becomes `rgba(255, 245, 170, 0.4)`, outer becomes `rgba(255, 245, 170, 0.1)`
- Example: user sets `rgba(255, 245, 170, 0.2)` → inner becomes `rgba(255, 245, 170, 0.2)`, outer becomes `rgba(255, 245, 170, 0.05)` (same as current default)
- The default values in `calculateDynamicRoomColor()` should be updated to use `0.2` inner alpha (e.g., `rgba(255, 245, 170, 0.2)`) so defaults produce the same visual output as before

### REQ-4.2: Update Editor Placeholder Values

**Priority:** Low

The editor placeholder hints for dynamic color fields should reflect the new semantic (alpha = inner gradient opacity) and suggest values appropriate for typical use.

**Acceptance criteria:**
- Placeholders updated to reflect the actual meaning of alpha
- Tooltip or helper text explains: "The alpha value sets the overlay intensity at the room center. Edges fade to ~25% of that value."

### REQ-4.3: `room.color` UI Access

**Priority:** Low

Users should be able to set and preview `room.color` without requiring YAML editor access.

**Acceptance criteria:**
- The per-room editor (`editor-room-shp.ts`) includes an `room.color` field
- The field is a color picker or styled text input with a color swatch preview
- Saving updates the YAML config correctly with the rgba string

---

## Technical Notes

The fix for REQ-4.1 involves:

1. In `adjustOpacity()` — no change needed (it's a general utility that accepts any opacity)

2. In `createGradientDefinition()` — extract the alpha from `baseColor`:
```typescript
function extractAlpha(rgbaColor: string): number {
    const match = rgbaColor.match(/rgba?\(\d+,\s*\d+,\s*\d+(?:,\s*([\d.]+))?\)/);
    return match?.[1] !== undefined ? parseFloat(match[1]) : 1.0;
}

// Then in createGradientDefinition:
const userAlpha = extractAlpha(baseColor);
const innerColor = adjustOpacity(baseColor, userAlpha);           // use configured alpha
const outerColor = adjustOpacity(baseColor, userAlpha * 0.25);   // 25% of inner
```

3. Update default rgba values in `calculateDynamicRoomColor()` to explicitly set the intended alpha:
   - `motion_occupancy`: change from `0.15` → `0.2` (so default behavior preserved)
   - `lights`: change from `0.17` → `0.2`
   - `ambient_lights`: change from `0.12` → `0.2`
   - `default`: change from `0.05` → `0.2` (but this becomes transparent under REQ-1.1 anyway)

The ratio `outerAlpha = innerAlpha * 0.25` preserves the visual gradient shape. Alternative: make the ratio itself configurable (`dynamic_colors.gradient_falloff_ratio`), but this is likely over-engineering for now (YAGNI).
