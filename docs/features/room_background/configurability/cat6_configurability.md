# Category 6: Configurability for Light Backgrounds

## Problem Analysis

### Description

Any improvements made to address the other categories (SVG transparency, element visibility, borders) will introduce new rendering behaviors that may not suit every user. Users have diverse backgrounds:
- Light photorealistic backgrounds (the problem case triggering this analysis)
- Dark/black floor plan backgrounds (the original use case)
- Medium-tone, textured, or colorful backgrounds

A one-size-fits-all change risks breaking the experience for users who have set up their cards for dark backgrounds. Changes must be opt-in or configurable with sensible defaults that work for the majority.

Additionally, there is currently no mechanism for globally configuring element appearance (backdrop, text contrast) separate from element-level `plan.style` overrides. This creates friction for users who want to improve visibility for all elements without editing each one individually.

### Current Configuration Landscape

**Currently configurable (global):**
- `dynamic_colors.motion_occupancy`, `.lights`, `.ambient_lights`, `.default` — rgba color strings (but alpha is discarded — see Category 4)
- `dynamic_colors.motion_delay_seconds` — motion linger time
- `show_room_backgrounds` — debug mode to show static room colors

**Currently configurable (per-room):**
- `room.disable_dynamic_color` — skip all dynamic colors for this room
- `room.color` — static color (YAML only)

**Currently configurable (per-element):**
- `plan.style` — arbitrary CSS on the element wrapper
- `plan.disable_dynamic_color` — opt-out from influencing room color state

**Not configurable (hardcoded):**
- SVG polygon stroke color and width
- Default (idle) state transparency
- Gradient inner/outer opacity ratio
- Element backdrop color/alpha
- Text shadow strength

### Impact on User Experience

- Dark background users: any transparency fix (REQ-1.1) means their subtle room delineation disappears unless they explicitly opt back in
- Users with different background tones need to tune multiple independent settings to achieve good visibility
- No centralized "background type" toggle that adjusts a set of defaults at once

---

## Requirements

### REQ-6.1: Background Mode Preset

**Priority:** Medium

Provide a high-level "background mode" or "theme" config option that sets appropriate defaults for common background types, without requiring users to understand and tune every individual setting.

**Acceptance criteria:**
- A config option `background_mode: 'light' | 'dark' | 'custom'` (default `'light'`)
- `'dark'` mode: sets defaults to preserve current behavior — default overlay enabled, borders visible at `0.1` opacity, element backdrop disabled
- `'light'` mode: sets defaults for light photorealistic backgrounds — default overlay disabled (transparent idle), borders invisible, element backdrop enabled with a subtle dark semi-transparent color
- `'custom'` mode: no defaults are applied; each individual setting must be specified explicitly
- The mode can be set from the editor UI as a dropdown or radio buttons
- Mode-specific defaults are only used for settings not explicitly set in `dynamic_colors`/`appearance` config

### REQ-6.2: Global Element Appearance Config

**Priority:** Medium (linked with REQ-2.1 from Category 2)

A top-level config section for controlling the visual appearance of elements globally.

**Acceptance criteria:**
- A new config section `element_appearance` (or similar) with the following options:
  - `backdrop_enabled: boolean` — whether to render a backdrop behind elements (default depends on `background_mode`)
  - `backdrop_color: string` — rgba color for the backdrop (default `'rgba(0,0,0,0.35)'`)
  - `backdrop_border_radius: number` — rounding in pixels (default `4`)
  - `backdrop_padding: number` — padding around the element in pixels (default `3`)
- All options have sensible defaults
- Options are editable in the UI editor
- Per-element override via `plan.style` remains the escape hatch for individual customization

### REQ-6.3: Gradient Appearance Config

**Priority:** Medium

Fine-grained control over the SVG gradient rendering, beyond just the color hue.

**Acceptance criteria:**
- `dynamic_colors.border_visible: boolean` — whether to draw polygon borders (default: `false` in 'light' mode, `true` in 'dark' mode)
- `dynamic_colors.border_color: string` — border rgba color (default `'rgba(0,0,0,0.1)'`)
- `dynamic_colors.show_idle_overlay: boolean` — whether to render the default/idle gradient (default: `false` in 'light' mode, `true` in 'dark' mode)
- All options editable in the UI (Dynamic Room Colors section or dedicated Appearance section)

### REQ-6.4: Backward Compatibility

**Priority:** High

Existing configurations (YAML) that do not specify the new options must continue to render identically (no visual regression) until the user explicitly opts in to new behavior.

**Acceptance criteria:**
- The default value of `background_mode` is `'light'` (since this is the intended direction)
  - **Exception**: if `dynamic_colors` is already configured in the YAML (indicating the user has tuned their colors), the system should not change behavior silently — a migration note or a config warning would help
- All new config options have defaults that match the `'light'` mode behavior
- A CHANGELOG entry documents any defaults that differ from previous behavior
- The `showRoomBackgrounds` debug flag continues to work as before (unaffected by new options)

---

## Technical Notes

The `background_mode` preset approach is a UI-level convenience — the underlying rendering logic only needs to read the individual config properties. The preset would pre-populate defaults in the config or apply them in a priority-resolution function.

Example priority resolution:
```typescript
function resolveConfig(config: ScalableHousePlanConfig) {
    const mode = config.background_mode ?? 'light';
    const modeDefaults = BACKGROUND_MODE_DEFAULTS[mode];

    return {
        ...modeDefaults,
        ...config,  // User-explicit settings override mode defaults
    };
}

const BACKGROUND_MODE_DEFAULTS = {
    light: {
        dynamic_colors: {
            border_visible: false,
            show_idle_overlay: false,
        },
        element_appearance: {
            backdrop_enabled: true,
            backdrop_color: 'rgba(0,0,0,0.35)',
        }
    },
    dark: {
        dynamic_colors: {
            border_visible: true,
            show_idle_overlay: true,
        },
        element_appearance: {
            backdrop_enabled: false,
        }
    }
};
```

This keeps the actual rendering components simple (they just read resolved config values) while the editor UI can present mode selection as a top-level, easy-to-understand choice.
