# Category 5: Color Editor Visual Preview

## Problem Analysis

### Description

The Dynamic Room Colors section in the card editor uses plain `ha-textfield` text inputs for entering rgba color strings. There is no visual color preview, swatch, or color picker. This makes it difficult for users to:
- Know what color they've entered without switching to the live plan view
- Pick colors intuitively without knowing rgba syntax
- Verify that an rgba string is valid before saving

The same issue applies to the `room.color` field (per-room static color), which has no UI field at all and is only accessible through the raw YAML editor in the room's detail editor.

### Affected Code

**`src/cards/scalable-house-plan-editor.ts`** — Dynamic Room Colors section (lines 209–244):
```html
<ha-textfield
    label="${this.localize('editor.lights_color')}"
    .value=${this._config.dynamic_colors?.lights || 'rgba(255, 250, 250, 0.18)'}
    @input=${this._lightsColorChanged}
    placeholder="rgba(255, 250, 220, 0.18)"
></ha-textfield>
<!-- Similar pattern for all 4 dynamic color fields -->
```

No color swatch element, no color input, no visual feedback.

**`src/cards/editor-components/editor-room-shp.ts`** — Room editor panel:
- No `room.color` input field — completely absent from the UI
- Only accessible via the "YAML mode" toggle which reveals the raw YAML editor

### Impact on User Experience

- Steep learning curve: users must know rgba() syntax
- Iterative workflow: users must type → save → check plan → go back → adjust
- No error feedback for invalid color strings
- The `room.color` field is essentially hidden from non-technical users

---

## Requirements

### REQ-5.1: Color Swatch Preview in Dynamic Color Text Fields

**Priority:** Medium

Each dynamic color text field should display a small color swatch showing the currently entered color, updating in real-time as the user types.

**Acceptance criteria:**
- A colored rectangle (e.g., 20×20px, border-radius: 4px) is displayed inline with or adjacent to each color text field
- The swatch updates live as the user types in the field
- If the entered string is not a valid color, the swatch shows a neutral/error state (e.g., checkerboard or red border)
- The swatch includes a white/dark checkerboard background behind it to represent the alpha channel visually
- This is purely a UI enhancement — no behavior change

### REQ-5.2: HA Color Picker Integration (Optional Enhancement)

**Priority:** Low

Optionally, a color picker button next to each text field could open the Home Assistant native `ha-colorpicker` or `<input type="color">` for graphical color selection.

**Acceptance criteria:**
- A small color picker icon/button next to each text field
- Clicking it opens a color picker popover
- Selecting a color populates the text field with the rgba() string
- The alpha channel is selectable (HA's `ha-color-picker` or a custom `<input type="color">` + alpha slider)
- This is an optional improvement — REQ-5.1 provides immediate value without it

### REQ-5.3: `room.color` Field in Per-Room Editor

**Priority:** Low

The per-room editor should expose the `room.color` field with a color swatch preview and/or color picker.

**Acceptance criteria:**
- `editor-room-shp.ts` includes a color input/text field for `room.color`
- The field shows a color swatch preview (same as REQ-5.1)
- Saving updates `room.color` in the config
- Clearing the field removes `room.color` from the config (uses the default)

---

## Technical Notes

For REQ-5.1, a color swatch can be implemented as a simple inline `<div>` or `<span>` with a `background-color` style set dynamically:

```typescript
// In the editor template, next to each color field:
html`
<div class="color-field-wrapper">
    <ha-textfield .value=${colorValue} @input=${handler}></ha-textfield>
    <div class="color-swatch"
         style="background-color: ${colorValue};
                background-image: ${this._isValidColor(colorValue) ? 'none' : 'url(data:image/png;base64,...)'}">
    </div>
</div>
`
```

The checkerboard pattern for alpha visualization can be:
- A small inline base64-encoded PNG
- A CSS `background-image` repeating-linear-gradient pattern
- Or simply a contrasting solid background behind the swatch div

The `_isValidColor()` helper can use CSS.supports('color', value) or a lightweight regex check.

For the text field, a max-width may be needed to accommodate the swatch without layout shift.
