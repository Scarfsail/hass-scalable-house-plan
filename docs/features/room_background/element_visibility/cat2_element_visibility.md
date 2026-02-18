# Category 2: Element Visibility

## Problem Analysis

### Description

With a light photorealistic background, three classes of elements become hard to see:

1. **State icons** (`state-icon-shp` / `hui-state-icon-element`): Rendered in the HA theme's light-blue "off state" color (`--state-icon-color`). Light blue on a light beige/cream background has very low contrast.

2. **Text/value labels** (temperature, humidity, sensor values from `analog-text-shp`): Rendered as white text. White on a light background is nearly invisible. The existing `text-shadow: 0 0 3px rgba(0,0,0,0.8)` in the gauge overlay mode partially helps, but standalone labels or those in direct placement lack this protection.

3. **Dynamic color overlays** (light/motion gradients from `room-color-helpers.ts`): The default gradient strengths were tuned for dark backgrounds. On a dark background, `rgba(255, 245, 170, 0.2)` warm yellow is clearly visible. On a bright cream/white room image, the same color at the same opacity is barely noticeable.

### Affected Code

**Icon visibility:**
- `src/elements/state-icon-shp.ts`: Creates `<hui-state-icon-element>` and delegates all color rendering to HA. No wrapper background or contrast layer.
- Icon color is set by HA theme's `--state-icon-color` CSS variable — uncontrollable from this project directly.

**Text/value visibility:**
- `src/components/analog-text-shp.ts`: Text renders with `color` inherited from parent or HA theme. The `.text-overlay` style has `text-shadow: 0 0 3px rgba(0,0,0,0.8)` only in gauge overlay mode (line 114).
- `src/elements/info-box-shp.ts`: When elements are inside an info box, the `background: rgba(0,0,0,0.6)` provides contrast. But standalone elements outside info boxes have no backdrop.

**Overlay visibility:**
- `src/utils/room-color-helpers.ts`: `adjustOpacity()` forces `0.2` (inner) / `0.05` (outer) — these were chosen for dark backgrounds. Light backgrounds need higher values (e.g., `0.4`/`0.15`) to achieve equivalent perceived contrast.
- `src/components/scalable-house-plan-room.ts`: The gradient radial spread (`r="70%"`) and the hardcoded inner/outer opacity ratio determine visual strength.

### Scenarios

| Element Type | Dark Background | Light Background |
|---|---|---|
| State icon (off) | Visible light-blue | Barely visible — low contrast |
| State icon (on) | Visible bright color | Usually OK — bright colors |
| Temperature value (standalone) | White text OK | White nearly invisible |
| Temperature in info box | White on dark: OK | White on dark: OK (info box helps) |
| Light gradient overlay | Clearly visible | Faint, barely noticeable |
| Motion pulsing overlay | Clearly visible | Noticeable but weaker |

---

## Requirements

### REQ-2.1: Element Backdrop Option

**Priority:** High

A configurable semi-transparent backdrop should optionally be rendered behind each element (or element group) on the plan, providing contrast for both icons and text values regardless of the background image brightness.

**Acceptance criteria:**
- A global config option `element_backdrop` (e.g., `{ enabled: boolean, color: string }`) with default `{ enabled: false, color: 'rgba(0,0,0,0.4)' }` controls backdrop rendering
- When enabled, each `.element-wrapper` div gets a background color applied (or a CSS backdrop-filter blur)
- The backdrop color and alpha are user-configurable
- Per-element override via `plan.style` (existing mechanism) remains possible
- The backdrop is rounded (e.g., `border-radius: 4px`) for a polished look

### REQ-2.2: Configurable Gradient Strength Multiplier

**Priority:** Medium

The dynamic color gradient opacity should be tunable to accommodate different background brightness levels without requiring users to recalculate and re-enter rgba strings.

**Acceptance criteria:**
- A global config option `dynamic_colors.opacity_multiplier` (number, default `1.0`) scales the inner (`0.2`) and outer (`0.05`) gradient stop opacities
- E.g., `opacity_multiplier: 2.0` would produce inner `0.4`, outer `0.1`
- Value of `0.0` effectively disables the gradient
- Editable in the UI editor in the Dynamic Room Colors section

### REQ-2.3: Respect User-Configured Alpha in Dynamic Colors

**Priority:** Medium (linked with REQ-4.1 from cat4_alpha_rgba_bug.md)

The alpha value of configured `dynamic_colors.*` rgba strings should be used as the gradient inner opacity (instead of the hardcoded `0.2`) while the outer opacity scales proportionally.

**Note:** This requirement overlaps with Category 4 (Alpha/RGBA Bug). See `cat4_alpha_rgba_bug.md` for the full analysis. Resolving that bug simultaneously satisfies this requirement.

### REQ-2.4: Text Contrast for Standalone Labels

**Priority:** Medium

Text labels placed directly on the plan (outside info boxes) should have sufficient contrast on both light and dark backgrounds.

**Acceptance criteria:**
- `analog-text-shp.ts` applies `text-shadow: 0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6)` to all text (not just gauge overlay mode)
- This provides a dark halo around white text making it readable on light backgrounds
- Alternatively, if REQ-2.1 is implemented, the backdrop serves this purpose and explicit text shadow can remain minimal

---

## Technical Notes

- Icon color from `hui-state-icon-element` cannot be overridden via CSS properties from this project's shadow DOM without a CSS custom property injection or a wrapper element approach. The cleanest solution is REQ-2.1 (element backdrop) which makes all elements visible regardless of icon color.
- The `plan.style` mechanism already allows per-element CSS overrides — this is the escape hatch for advanced users now, but REQ-2.1 makes it automatic.
- CSS `backdrop-filter: blur(4px)` is an alternative to a solid backdrop and creates a "frosted glass" effect that works on any background — but browser support and performance should be evaluated.
