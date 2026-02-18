# Solution Design: Element Visibility (cat2)

## Overview

Two independent fixes for elements rendered on top of the room image:

1. **Element backdrop** — a global, configurable semi-transparent background behind each `.element-wrapper` on the plan, providing contrast for icons and text regardless of background brightness
2. **Text shadow strengthening** — unconditionally apply a stronger text shadow in `analog-text-shp.ts` so standalone text labels are readable on light backgrounds

The backdrop is the main feature. The text shadow tweak is a low-cost, always-beneficial independent improvement.

---

## Config Interface Changes

**File: `src/cards/scalable-house-plan.ts` — `ScalableHousePlanConfig`**

The backdrop is configured via `element_appearance` (the full `ElementAppearanceConfig` interface is defined in the Configurability solution design, since it is shared with the `background_mode` preset system). For this solution, the relevant sub-interface used at render time is:

```typescript
export interface ElementAppearanceConfig {
    backdrop_enabled?: boolean;   // When true, all plan elements get a background. Default: resolved from background_mode
    backdrop_color?: string;      // CSS color. Default: 'rgba(0,0,0,0.35)'
    backdrop_border_radius?: number; // px. Default: 4
    backdrop_padding?: number;    // px. Default: 3
}
```

A top-level config field `element_appearance?: ElementAppearanceConfig` is added to `ScalableHousePlanConfig` (see Configurability design for the full type).

---

## Element Renderer Changes

**File: `src/components/element-renderer-shp.ts`**

### Add `elementBackdrop` to `ElementRendererOptions`

The resolved `element_appearance` is passed into the element renderer as a new field:

```typescript
// In ElementRendererOptions interface:
elementBackdrop?: ElementAppearanceConfig;  // Resolved effective config (backdrop fields only)
```

### New helper: `buildBackdropCSS()`

Add as a pure function (zero dependencies, insert before the render functions):

```typescript
function buildBackdropCSS(appearance: ElementAppearanceConfig | undefined): string {
    if (!appearance?.backdrop_enabled) return '';
    const color   = appearance.backdrop_color          ?? 'rgba(0,0,0,0.35)';
    const radius  = appearance.backdrop_border_radius  ?? 4;
    const padding = appearance.backdrop_padding        ?? 3;
    return `background: ${color}; border-radius: ${radius}px; padding: ${padding}px; `;
}
```

Returns an empty string when the backdrop is disabled — zero overhead for the common case.

### Fix `plan.style` application order

Currently `calculatePositionStyles()` applies `plan.style` inside the cached function. This is incorrect for two reasons:
1. `plan.style` is not part of the cache key — style changes don't invalidate the cache
2. We need `plan.style` to come after `backdropCSS` so per-element overrides win

**Remove the `plan.style` block from `calculatePositionStyles()`**. Apply it in the render function after the backdrop CSS.

### Updated style composition in render functions

Both `renderReadOnlyElements()` and `renderEditableElements()`:

```typescript
// Compute backdrop ONCE for all elements (same config for entire room):
const backdropCSS = buildBackdropCSS(options.elementBackdrop);

// Per element in .map():
const planStyleCSS = plan.style
    ? (typeof plan.style === 'string'
        ? plan.style
        : Object.entries(plan.style as Record<string, string | number>)
            .map(([k, v]) => `${k}: ${v}`)
            .join('; '))
    : '';

// Style attribute on .element-wrapper:
// Order: position → backdrop → plan.style (plan.style wins, providing per-element override)
style="${positionData.styleString}; ${backdropCSS}${planStyleCSS}; transform: ${positionData.transform}; transform-origin: ${positionData.transformOrigin};"
```

**Result:** A user can disable the backdrop for a specific element with `plan.style: "background: transparent; padding: 0"`, while all other elements get the global backdrop.

---

## Room Component Changes

**File: `src/components/scalable-house-plan-room.ts`**

Pass resolved `element_appearance` to both `renderElements()` call sites:

```typescript
// Overview call site (~line 446):
const elements = renderElements({
    // ... existing options ...
    elementBackdrop: resolveEffectiveConfig(this.config).element_appearance,
});

// Detail call site (~line 574):
const elements = renderElements({
    // ... existing options ...
    elementBackdrop: resolveEffectiveConfig(this.config).element_appearance,
});
```

`resolveEffectiveConfig` is defined in `config-resolver.ts` (see Configurability design). It applies `background_mode` defaults so `backdrop_enabled` defaults correctly to `true` in 'light' mode without requiring explicit config.

---

## Text Shadow Fix

**File: `src/components/analog-text-shp.ts`**

The current `text-shadow` is only applied in gauge overlay mode (line 114). Apply it unconditionally to all text output by adding it to the `span` selector in the component's `static styles`:

```css
/* BEFORE: no shadow on base span */
span {
    line-height: 1;
}

/* AFTER: dark halo makes white text readable on any background */
span {
    line-height: 1;
    text-shadow: 0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6);
}
```

Also strengthen the existing `.text-overlay` shadow in the same file:

```css
/* BEFORE: */
.text-overlay {
    text-shadow: 0 0 3px rgba(0,0,0,0.8);
}

/* AFTER: */
.text-overlay {
    text-shadow: 0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6);
}
```

This is a safe, always-beneficial change — a dark text shadow on white text is imperceptible on dark backgrounds but provides meaningful contrast on light ones.

---

## Note on Icon Color

State icons (`hui-state-icon-element`) get their color entirely from the HA theme (`--state-icon-color`). This cannot be overridden from this project without injecting CSS custom properties into the shadow DOM. The element backdrop (above) is the solution: the semi-transparent dark background behind the icon wrapper provides the contrast, regardless of what color the icon is.

---

## Semantic Release Commit

Two separate commits are recommended (independent changes):

```
feat(elements): add configurable element backdrop for plan visibility on light backgrounds
```

```
fix(analog-text): strengthen text-shadow for readability on light backgrounds
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/cards/scalable-house-plan.ts` | Add `ElementAppearanceConfig` interface, add `element_appearance?` to config (shared with configurability) |
| `src/components/element-renderer-shp.ts` | Add `elementBackdrop` to options, add `buildBackdropCSS()`, fix `plan.style` extraction from cache, update style composition in render functions |
| `src/components/scalable-house-plan-room.ts` | Pass `elementBackdrop` to both `renderElements()` call sites |
| `src/components/analog-text-shp.ts` | Strengthen text-shadow on `span` and `.text-overlay` CSS rules |

Editor UI for `element_appearance` settings is covered in the Configurability solution design.
