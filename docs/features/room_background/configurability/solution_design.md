# Solution Design: Configurability & Editor UX (cat5 + cat6)

## Overview

This group defines the config schema for all new settings introduced by the room_svg and element_visibility solutions, and specifies how they are exposed in the editor UI.

Three concerns:
1. **Config schema** — complete type definitions for all new fields, including the `background_mode` preset
2. **`resolveEffectiveConfig()`** — runtime resolution of mode defaults vs explicit user values
3. **Editor UI** — color swatches, new controls, new sections, `room.color` field

---

## Complete Config Schema

### `src/cards/types.ts` — Extended `DynamicColorsConfig`

```typescript
export interface DynamicColorsConfig {
    // Existing fields (unchanged):
    motion_occupancy?: string;
    ambient_lights?: string;
    lights?: string;
    default?: string;
    motion_delay_seconds?: number;
    // New — from room_svg solution:
    show_idle_overlay?: boolean;   // Default from background_mode; 'light'=false, 'dark'=true
    show_border?: boolean;         // Default from background_mode; 'light'=false, 'dark'=true
}
```

### `src/cards/scalable-house-plan.ts` — Extended `ScalableHousePlanConfig`

```typescript
export type BackgroundMode = 'light' | 'dark' | 'custom';

export interface ElementAppearanceConfig {
    backdrop_enabled?: boolean;          // Default from background_mode; 'light'=true, 'dark'=false
    backdrop_color?: string;             // Default: 'rgba(0,0,0,0.35)'
    backdrop_border_radius?: number;     // Default: 4 (px)
    backdrop_padding?: number;           // Default: 3 (px)
}

export interface ScalableHousePlanConfig extends LovelaceCardConfig {
    // ... all existing fields unchanged ...
    // New:
    background_mode?: BackgroundMode;          // Default: 'light'
    element_appearance?: ElementAppearanceConfig;
}
```

---

## Config Resolver

**New file: `src/cards/config-resolver.ts`**

```typescript
import type { ScalableHousePlanConfig, BackgroundMode, ElementAppearanceConfig } from "./scalable-house-plan";
import type { DynamicColorsConfig } from "./types";

const MODE_DEFAULTS: Record<BackgroundMode, {
    dynamic_colors: Partial<DynamicColorsConfig>,
    element_appearance: ElementAppearanceConfig
}> = {
    light: {
        dynamic_colors: {
            show_idle_overlay: false,
            show_border: false,
        },
        element_appearance: {
            backdrop_enabled: true,
            backdrop_color: 'rgba(0,0,0,0.35)',
            backdrop_border_radius: 4,
            backdrop_padding: 3,
        }
    },
    dark: {
        dynamic_colors: {
            show_idle_overlay: true,
            show_border: true,
        },
        element_appearance: {
            backdrop_enabled: false,
            backdrop_color: 'rgba(0,0,0,0.35)',
            backdrop_border_radius: 4,
            backdrop_padding: 3,
        }
    },
    custom: {
        dynamic_colors: {},
        element_appearance: {}  // No defaults applied; every field must be set explicitly
    }
};

/**
 * Resolves the effective config by merging background_mode defaults
 * under any explicitly-set user values. User values always win.
 *
 * Used only by rendering code — the editor always reads/writes raw config
 * so that auto-defaults are never silently written to YAML.
 */
export function resolveEffectiveConfig(config: ScalableHousePlanConfig): ScalableHousePlanConfig {
    const mode = config.background_mode ?? 'light';
    const defaults = MODE_DEFAULTS[mode] ?? MODE_DEFAULTS.light;

    return {
        ...config,
        dynamic_colors: {
            ...defaults.dynamic_colors,
            ...config.dynamic_colors,   // User values override mode defaults
        },
        element_appearance: {
            ...defaults.element_appearance,
            ...config.element_appearance,
        }
    };
}
```

**Key rule:** The editor always reads and writes `this._config` directly (raw, never resolved). `resolveEffectiveConfig` is called only in the rendering components (`scalable-house-plan-room.ts`, `element-renderer-shp.ts`). This prevents mode defaults from being silently persisted to the user's YAML.

---

## Color Swatch — CSS-only Implementation

### Shared CSS (add to `src/cards/editor-components/shared-styles.ts`)

```css
.color-field-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
}
.color-field-wrapper ha-textfield {
    flex: 1;
    min-width: 0;
}
.color-swatch {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    flex-shrink: 0;
    border: 1px solid var(--divider-color);
    /* Checkerboard to visualize alpha */
    background-image:
        linear-gradient(45deg, #ccc 25%, transparent 25%),
        linear-gradient(-45deg, #ccc 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #ccc 75%),
        linear-gradient(-45deg, transparent 75%, #ccc 75%);
    background-size: 8px 8px;
    background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
    background-color: white;
    position: relative;
    overflow: hidden;
}
.color-swatch::after {
    content: '';
    position: absolute;
    inset: 0;
    background-color: inherit;  /* The actual color sits above the checkerboard */
}
```

Both `scalable-house-plan-editor.ts` and `editor-room-shp.ts` already import `sharedStyles`, so no new imports are needed.

### Helper method in `ScalableHousePlanEditor`

```typescript
private _renderColorField(
    label: string,
    value: string,
    placeholder: string,
    handler: (ev: Event) => void
) {
    return html`
        <div class="color-field-wrapper">
            <ha-textfield
                label="${label}"
                .value=${value}
                @input=${handler}
                placeholder="${placeholder}"
            ></ha-textfield>
            <div class="color-swatch" style="background-color: ${value}" title="${value}"></div>
        </div>
    `;
}
```

If the value is an invalid CSS color, the browser ignores `background-color` and the checkerboard shows through — no JavaScript validation needed.

---

## Editor UI Layout

### Basic Configuration section — add `background_mode` selector

As the first control inside the Basic Configuration section content:

```html
<ha-select
    label="${this.localize('editor.background_mode')}"
    .value=${this._config.background_mode ?? 'light'}
    @selected=${this._backgroundModeChanged}
    @closed=${(e: Event) => e.stopPropagation()}
>
    <ha-list-item value="light">${this.localize('editor.background_mode_light')}</ha-list-item>
    <ha-list-item value="dark">${this.localize('editor.background_mode_dark')}</ha-list-item>
    <ha-list-item value="custom">${this.localize('editor.background_mode_custom')}</ha-list-item>
</ha-select>
```

### Dynamic Room Colors section — replace plain textfields with swatches + add toggles

Replace the four existing `ha-textfield` color inputs with `_renderColorField()` calls. Add below them:

```
[swatch] Ambient Lights Color        [swatch] Lights Color
[swatch] Motion/Occupancy Color      [swatch] Default Overlay Color
         Motion Delay (s)
[toggle] Show idle room overlay      (ha-switch via ha-formfield)
[toggle] Show room borders           (ha-switch via ha-formfield)
```

### New "Element Appearance" collapsible section

Insert between Dynamic Room Colors and Info Box Defaults:

```
icon: mdi:image-filter-frames
title: "Element Appearance"

[toggle] Show element backdrop       (ha-switch)
  ↳ if true, show:
  [swatch] Backdrop color            Border radius (px)
           Padding (px)
```

Conditional fields (backdrop color, radius, padding) only render when `backdrop_enabled` is checked in the current raw config. Since `backdrop_enabled` may be `undefined` (resolved from mode), the condition should check: `this._config.element_appearance?.backdrop_enabled === true`.

### Per-room editor — add `room.color` field

**File: `src/cards/editor-components/editor-room-shp.ts`**

Add to the Basic Configuration section, after the `disable_dynamic_color` switch:

```html
<div class="color-field-wrapper">
    <ha-textfield
        label="${this.localize('editor.room_color')}"
        .value=${this.room.color || ''}
        @input=${this._colorChanged}
        placeholder="rgba(100, 150, 200, 0.3)"
        helper-persistent
        helper-text="${this.localize('editor.room_color_helper')}"
    ></ha-textfield>
    <div class="color-swatch"
         style="background-color: ${this.room.color || 'transparent'}"
         title="${this.room.color || ''}">
    </div>
</div>
```

Handler:
```typescript
private _colorChanged(e: Event) {
    const value = (e.target as HTMLInputElement).value.trim();
    this._dispatchUpdate({ ...this.room, color: value || undefined });
}
```

Setting `color: undefined` removes it from YAML serialization when the field is cleared.

---

## Change Handlers to Add

All follow the existing spread pattern in `scalable-house-plan-editor.ts`:

```typescript
private _backgroundModeChanged(ev: CustomEvent) {
    this._config = { ...this._config, background_mode: (ev.target as any).value };
    this._configChanged();
}

private _showIdleOverlayChanged(ev: Event) {
    this._config = {
        ...this._config,
        dynamic_colors: { ...this._config.dynamic_colors, show_idle_overlay: (ev.target as any).checked }
    };
    this._configChanged();
}

private _showBorderChanged(ev: Event) {
    this._config = {
        ...this._config,
        dynamic_colors: { ...this._config.dynamic_colors, show_border: (ev.target as any).checked }
    };
    this._configChanged();
}

private _backdropEnabledChanged(ev: Event) {
    this._config = {
        ...this._config,
        element_appearance: { ...this._config.element_appearance, backdrop_enabled: (ev.target as any).checked }
    };
    this._configChanged();
}

private _backdropColorChanged(ev: Event) {
    this._config = {
        ...this._config,
        element_appearance: { ...this._config.element_appearance, backdrop_color: (ev.target as HTMLInputElement).value }
    };
    this._configChanged();
}
// ... similar for backdrop_border_radius, backdrop_padding
```

---

## Localization Keys to Add

```
editor.background_mode             = "Background mode"
editor.background_mode_light       = "Light (photorealistic)"
editor.background_mode_dark        = "Dark (schematic)"
editor.background_mode_custom      = "Custom (manual)"
editor.show_idle_overlay           = "Show idle room overlay"
editor.show_border                 = "Show room borders"
editor.element_appearance          = "Element Appearance"
editor.backdrop_enabled            = "Show element backdrop"
editor.backdrop_color              = "Backdrop color"
editor.backdrop_border_radius      = "Backdrop corner radius (px)"
editor.backdrop_padding            = "Backdrop padding (px)"
editor.room_color                  = "Room color override"
editor.room_color_helper           = "Overrides dynamic color. Leave empty to use dynamic colors."
```

---

## Backward Compatibility Summary

| Existing config | Behavior change | Migration |
|---|---|---|
| No `background_mode` set | Resolves as `'light'` — transparent idle, no borders, backdrop enabled | Set `background_mode: dark` to restore original behavior |
| `dynamic_colors.*` set | User values always win over mode defaults | No change needed |
| `show_room_backgrounds: true` (debug) | Unchanged — debug mode always shows colors and borders | N/A |
| `disable_dynamic_color: true` on room | Unchanged — room stays transparent | N/A |

---

## Files to Modify/Create

| File | Action |
|------|--------|
| `src/cards/types.ts` | Add `show_idle_overlay?`, `show_border?` to `DynamicColorsConfig` |
| `src/cards/scalable-house-plan.ts` | Add `BackgroundMode`, `ElementAppearanceConfig`, extend `ScalableHousePlanConfig` |
| `src/cards/config-resolver.ts` | **Create** — `MODE_DEFAULTS` + `resolveEffectiveConfig()` |
| `src/cards/editor-components/shared-styles.ts` | Add color swatch CSS |
| `src/cards/scalable-house-plan-editor.ts` | `background_mode` select, color swatches, new toggles, Element Appearance section, `_renderColorField()` helper, change handlers |
| `src/cards/editor-components/editor-room-shp.ts` | Add `room.color` field with swatch, `_colorChanged` handler |
| `src/localize/` (translations file) | Add 13 new localization keys |
