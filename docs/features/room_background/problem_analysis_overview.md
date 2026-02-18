# Problem Analysis: Light Room Background Compatibility

## Overview

The transition from dark/black room backgrounds to lighter, photorealistic backgrounds has exposed several issues that were previously hidden by the forgiving nature of dark backgrounds. This document categorizes these issues and links to detailed analysis for each.

## Solution Groups

Problems are grouped into three independent solution areas. Each group shares the same code layer and can be designed/implemented without overlapping the others.

### Group A — Room SVG Layer (`room_svg/`)

Covers how the room polygon is filled, stroked, and how colors/alpha flow through the rendering pipeline. All three issues share the same two source files and their fixes are mechanically coupled.

| # | Category | Severity | Document |
|---|----------|----------|----------|
| 1 | [SVG Background Transparency](#1-svg-background-transparency) | High | [room_svg/cat1_svg_background_transparency.md](room_svg/cat1_svg_background_transparency.md) |
| 3 | [SVG Borders](#3-svg-borders) | Medium | [room_svg/cat3_svg_borders.md](room_svg/cat3_svg_borders.md) |
| 4 | [Alpha/RGBA Configuration Bug](#4-alphargba-configuration-bug) | Medium | [room_svg/cat4_alpha_rgba_bug.md](room_svg/cat4_alpha_rgba_bug.md) |

### Group B — Element Visibility (`element_visibility/`)

Covers the elements rendered on top of the room (icons, text values). Entirely separate component layer from the SVG polygon.

| # | Category | Severity | Document |
|---|----------|----------|----------|
| 2 | [Element Visibility](#2-element-visibility) | High | [element_visibility/cat2_element_visibility.md](element_visibility/cat2_element_visibility.md) |

### Group C — Configurability & Editor UX (`configurability/`)

Meta-group covering how users control the behaviors from Groups A and B: config schema, editor UI, presets, and backward compatibility.

| # | Category | Severity | Document |
|---|----------|----------|----------|
| 6 | [Configurability for Light Backgrounds](#6-configurability) | Medium | [configurability/cat6_configurability.md](configurability/cat6_configurability.md) |
| 5 | [Color Editor Visual Preview](#5-color-editor-visual-preview) | Low | [configurability/cat5_color_editor_preview.md](configurability/cat5_color_editor_preview.md) |

---

## 1. SVG Background Transparency

**Summary:** In normal (idle) state, the SVG room polygon renders a barely-visible gradient overlay instead of being fully transparent. On a light background this makes rooms look "painted over" even when nothing is happening. The photorealistic background image textures and colors should show through completely unless a light/motion event triggers the overlay.

**Root cause:** The `default` dynamic color type (e.g., `rgba(100, 100, 100, 0.05)`) is still rendered as a gradient — it is never truly `'transparent'`. This was acceptable on dark backgrounds where a 5% gray overlay is imperceptible, but on light photorealistic backgrounds it creates a slight but noticeable film.

---

## 2. Element Visibility

**Summary:** Icons (light blue off-state from HA theme) and text/value labels (white) are hard to see on the light photorealistic background. The dynamic SVG light/motion overlays are also harder to perceive since they were tuned for dark backgrounds.

**Root cause:** Icon color is entirely controlled by the Home Assistant theme (`hui-state-icon-element`) — this project currently has no way to add a contrasting backdrop behind icons. Text labels inherit color from parent CSS or the dark `info-box-shp` container, but elements placed directly on the plan (outside an info box) rely on HA theme defaults or a light text-shadow that may be insufficient on very light backgrounds.

---

## 3. SVG Borders

**Summary:** Every room polygon has a visible `stroke-width="2"` border. On dark backgrounds, the near-transparent `rgba(0,0,0,0.1)` stroke was invisible. On light backgrounds, even a 10%-opacity black border becomes noticeable and creates unwanted room outlines.

**Root cause:** `stroke-width="2"` and the stroke color `rgba(0, 0, 0, 0.1)` are hardcoded in the SVG polygon template in `scalable-house-plan-room.ts`. There is no configuration option to control or disable the border.

---

## 4. Alpha/RGBA Configuration Bug

**Summary:** When users configure dynamic colors with a custom alpha value (e.g., `rgba(255, 245, 170, 0.5)` to make lights more visible on a bright background), the alpha is silently discarded. The system always uses hardcoded inner opacity `0.2` and outer opacity `0.05` regardless of the configured alpha.

**Root cause:** The `adjustOpacity()` utility and `createGradientDefinition()` in `room-color-helpers.ts` extract only the RGB components and force hardcoded alpha values. The user-configured alpha in `dynamic_colors.*` is never applied to the rendered gradient.

---

## 5. Color Editor Visual Preview

**Summary:** The Dynamic Room Colors editor section shows plain text fields for entering rgba strings. There is no color swatch or visual preview of the entered color, making it difficult for users to understand what color they are configuring.

**Root cause:** The editor uses `ha-textfield` plain text inputs — no `<input type="color">` or Home Assistant color picker component. No color swatch is rendered next to or inside the field.

---

## 6. Configurability for Light Backgrounds

**Summary:** Any improvements made to element visibility (e.g., a semi-transparent backdrop behind icons/values, adjusted gradient strengths, border visibility) need to be user-configurable. Users have different backgrounds with different tones and textures, and there is no one-size-fits-all setting.

**Root cause:** The current system has limited per-user configurability for background-related visual settings. Global `dynamic_colors.*` controls only the color hue, not the rendering approach. There is no setting for icon backdrop, border visibility, or gradient strength multiplier.
