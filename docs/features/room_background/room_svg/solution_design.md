# Solution Design: Room SVG Layer (cat1 + cat3 + cat4)

## Overview

Three tightly coupled fixes to the SVG polygon rendering pipeline. All changes are confined to `room-color-helpers.ts` and `scalable-house-plan-room.ts` (plus config types). The fixes form a single coherent unit:

- **cat4** (alpha bug) is fixed in the helper layer — `extractAlpha()` makes the user-configured alpha drive the gradient
- **cat1** (idle transparency) is fixed in `calculateDynamicRoomColor()` — idle state returns `type: 'transparent'`
- **cat3** (borders) is fixed in `_getRoomColors()` — `strokeColor` respects a config flag

---

## Config Interface Changes

**File: `src/cards/types.ts` — `DynamicColorsConfig`**

Two new optional boolean fields:

```typescript
export interface DynamicColorsConfig {
    motion_occupancy?: string;
    ambient_lights?: string;
    lights?: string;
    default?: string;
    motion_delay_seconds?: number;
    // cat1: when false (default), idle rooms are transparent; no default gradient overlay
    show_idle_overlay?: boolean;
    // cat3: when false (default), polygon borders are invisible in dynamic color mode
    show_border?: boolean;
}
```

Both default to `false`, meaning the new behavior (transparent idle, no borders) is the default. This is intentional — these are improvements for light backgrounds.

---

## Helper Layer Changes

**File: `src/utils/room-color-helpers.ts`**

### New function: `extractAlpha()`

Insert after `adjustOpacity()` (after line 58):

```typescript
/**
 * Extract alpha channel from rgba/rgb color string.
 * Returns the alpha value (0.0–1.0), defaulting to 1.0 if absent or unparseable.
 */
export function extractAlpha(rgbaColor: string): number {
    const match = rgbaColor.match(/rgba?\(\d+,\s*\d+,\s*\d+(?:,\s*([\d.]+))?\)/);
    if (!match || match[1] === undefined) return 1.0;
    const alpha = parseFloat(match[1]);
    return isNaN(alpha) ? 1.0 : Math.max(0, Math.min(1, alpha));
}
```

### Fix `createGradientDefinition()` — cat4

Replace the two hardcoded `adjustOpacity` calls (lines 75–76):

```typescript
// BEFORE (hardcoded, ignores user alpha):
const innerColor = adjustOpacity(baseColor, 0.2);
const outerColor = adjustOpacity(baseColor, 0.05);

// AFTER (cat4: honors user-configured alpha; outer is 25% of inner to preserve gradient shape):
const userAlpha = extractAlpha(baseColor);
const innerColor = adjustOpacity(baseColor, userAlpha);
const outerColor = adjustOpacity(baseColor, userAlpha * 0.25);
```

**Backward compatibility note:** The old code produced `inner=0.2` regardless of configured alpha. Users who have set e.g. `rgba(255, 245, 170, 0.17)` will now see inner opacity `0.17` instead of `0.2` — a slightly dimmer gradient. This is the correct behavior. The default values in `calculateDynamicRoomColor` (see below) are updated so unmodified configs produce visually equivalent output.

### Fix default values — cat4 compatibility

The existing defaults were chosen to compensate for the hardcoded `0.2` inner opacity:

```typescript
// In calculateDynamicRoomColor() — update the default rgba values
// so that after the cat4 fix, unmodified configs produce the same visual:
const motionColor   = config?.dynamic_colors?.motion_occupancy || 'rgba(135, 206, 250, 0.20)'; // was 0.15
const lightsColor   = config?.dynamic_colors?.lights           || 'rgba(255, 245, 170, 0.20)'; // was 0.17
const ambientColor  = config?.dynamic_colors?.ambient_lights   || 'rgba(220, 180, 255, 0.20)'; // was 0.12
const defaultColor  = config?.dynamic_colors?.default          || 'rgba(100, 100, 100, 0.20)'; // was 0.05
```

All defaults are updated to `0.20` because the old code hardcoded `0.20` as the inner stop. This preserves identical visual output for existing users who have not customized their colors.

### Fix idle transparency — cat1

Replace the idle return at the end of `calculateDynamicRoomColor()` (lines 226–228):

```typescript
// BEFORE:
activeTypes.push('default');
return { color: defaultColor, type: 'default', activeTypes };

// AFTER (cat1: transparent by default, opt-in to overlay via show_idle_overlay):
activeTypes.push('default');
if (!(config?.dynamic_colors?.show_idle_overlay ?? false)) {
    return { color: 'transparent', type: 'transparent', activeTypes };
}
return { color: defaultColor, type: 'default', activeTypes };
```

---

## Component Layer Changes

**File: `src/components/scalable-house-plan-room.ts`**

### Import `extractAlpha`

Add to the existing import from `room-color-helpers`:

```typescript
import {
    createGradientDefinition,
    calculatePolygonCenter,
    adjustOpacity,
    extractAlpha,          // NEW
    type DynamicColorResult,
    type GradientDefinition,
    type CachedEntityIds,
    calculateDynamicRoomColor
} from "../utils/room-color-helpers";
```

### Fix inverted gradient (motion animation) — cat4

In `_updateDynamicColor()`, the motion animation uses a separate inverted gradient. Apply same `extractAlpha` treatment (around line 349):

```typescript
// BEFORE:
const innerColor = adjustOpacity(colorForInverted, 0.05);
const outerColor = adjustOpacity(colorForInverted, 0.2);

// AFTER (inverted gradient: center dim, outer bright — swap the ratio):
const userAlpha = extractAlpha(colorForInverted);
const innerColor = adjustOpacity(colorForInverted, userAlpha * 0.25);
const outerColor = adjustOpacity(colorForInverted, userAlpha);
```

### Fix stroke color — cat3

In `_getRoomColors()`, update the gradient path return (lines 383–391):

```typescript
// BEFORE:
return {
    fillColor: `url(#${this._currentGradient.id})`,
    strokeColor: 'rgba(0, 0, 0, 0.1)',
    useGradient: true,
    gradientId: this._currentGradient.id
};

// AFTER (cat3: show border only when explicitly opted in, or in debug mode):
const showBorder = this.showRoomBackgrounds || (this.config?.dynamic_colors?.show_border ?? false);
return {
    fillColor: `url(#${this._currentGradient.id})`,
    strokeColor: showBorder ? 'rgba(0, 0, 0, 0.1)' : 'none',
    useGradient: true,
    gradientId: this._currentGradient.id
};
```

**No SVG template changes needed.** The polygon templates already use `stroke="${strokeColor}"`. Passing `'none'` is valid SVG that suppresses the stroke.

---

## Data Flow (After Fix)

```
User YAML: dynamic_colors.lights = 'rgba(255, 200, 100, 0.4)'
                │
                ▼
calculateDynamicRoomColor()
  if idle + !show_idle_overlay → type: 'transparent'  ← cat1
  if lights active             → color: 'rgba(255,200,100,0.4)', type: 'lights'
                │
                ▼ (only for non-transparent type)
createGradientDefinition(color, ...)
  extractAlpha('rgba(255,200,100,0.4)') → 0.4         ← cat4
  innerColor = adjustOpacity(color, 0.4)
  outerColor = adjustOpacity(color, 0.1)  (= 0.4 * 0.25)
                │
                ▼
_getRoomColors()
  fillColor = 'url(#gradient-id)'
  strokeColor = show_border ? 'rgba(0,0,0,0.1)' : 'none'  ← cat3
                │
                ▼
SVG <polygon fill="url(#gradient-id)" stroke="none" stroke-width="2">
```

---

## Semantic Release Commit

```
fix(room-svg): transparent idle overlay, configurable borders, honor rgba alpha

- cat1: idle rooms are transparent by default (opt in via show_idle_overlay)
- cat3: room borders hidden by default (opt in via show_border)
- cat4: user-configured rgba alpha drives gradient inner opacity; outer = inner * 0.25

BREAKING CHANGE: rooms with no active entities no longer render a default gray
overlay. Users relying on the subtle room delineation should add
dynamic_colors.show_idle_overlay: true to their config.
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/cards/types.ts` | Add `show_idle_overlay?` and `show_border?` to `DynamicColorsConfig` |
| `src/utils/room-color-helpers.ts` | Add `extractAlpha()`, fix `createGradientDefinition()`, fix idle return in `calculateDynamicRoomColor()`, update default alpha values |
| `src/components/scalable-house-plan-room.ts` | Add `extractAlpha` import, fix inverted gradient, fix `_getRoomColors()` stroke logic |

Editor UI for the two new toggles is covered in the Configurability solution design.
