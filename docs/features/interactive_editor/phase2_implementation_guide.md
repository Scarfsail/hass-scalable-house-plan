# Phase 2 Implementation Guide - Preview Click-to-Select

## Status: 🔄 READY FOR IMPLEMENTATION

**Feature:** Interactive Editor Mode - Phase 2: Preview Click-to-Select
**Prerequisites:** ✅ Phase 1 Complete

---

## Overview

Phase 2 enables click-to-select functionality in the preview. When editor mode is active, clicking an element in the preview will:
1. Emit an `element-selected` event with the element's `uniqueKey`
2. Add visual selection outline to the clicked element
3. Update the `_selectedElementKey` state in the editor

---

## Architecture Overview

### Event Flow
```
User clicks element in preview (when _editorMode = true)
    ↓
element-wrapper click handler (element-renderer-shp.ts)
    ↓
calls options.onElementClick(uniqueKey, elementIndex)
    ↓
scalable-house-plan-room.ts emits 'element-selected' event
    ↓
Event bubbles to scalable-house-plan.ts
    ↓
Bubbles to scalable-house-plan-editor.ts
    ↓
_handleElementSelection() updates _selectedElementKey
    ↓
_configChanged() passes new selection back to preview
    ↓
Element renderer adds 'selected-element' class to matching element
```

---

## Implementation Tasks

### Task 1: Pass Editor Mode to Room Components

**File:** `src/cards/scalable-house-plan.ts`

**Location:** In `render()` method where `<scalable-house-plan-room>` components are created (both overview and detail views)

**Changes Needed:**

Find the overview rendering (around line 238-244):
```typescript
<scalable-house-plan-overview
    .hass=${this.hass}
    .config=${this.config}
    .onRoomClick=${(room: Room, index: number) => this._openRoomDetail(index)}
    .roomEntityCache=${this._roomEntityCache}
    .houseCache=${this._houseCache}
></scalable-house-plan-overview>
```

Add:
```typescript
<scalable-house-plan-overview
    .hass=${this.hass}
    .config=${this.config}
    .onRoomClick=${(room: Room, index: number) => this._openRoomDetail(index)}
    .roomEntityCache=${this._roomEntityCache}
    .houseCache=${this._houseCache}
    .editorMode=${this._editorMode}
    .selectedElementKey=${this._selectedElementKey}
></scalable-house-plan-overview>
```

Find the detail rendering (around line 253-261):
```typescript
<scalable-house-plan-detail
    .hass=${this.hass}
    .room=${this.config.rooms[this._selectedRoomIndex]}
    .config=${this.config}
    .onBack=${() => this._closeRoomDetail()}
    .onShowEntities=${() => this._openEntitiesView()}
    .roomEntityCache=${this._roomEntityCache}
    .houseCache=${this._houseCache}
></scalable-house-plan-detail>
```

Add:
```typescript
<scalable-house-plan-detail
    .hass=${this.hass}
    .room=${this.config.rooms[this._selectedRoomIndex]}
    .config=${this.config}
    .onBack=${() => this._closeRoomDetail()}
    .onShowEntities=${() => this._openEntitiesView()}
    .roomEntityCache=${this._roomEntityCache}
    .houseCache=${this._houseCache}
    .editorMode=${this._editorMode}
    .selectedElementKey=${this._selectedElementKey}
></scalable-house-plan-detail>
```

**Notes:**
- Both overview and detail components need these props
- Props are reactive state, will update automatically

---

### Task 2: Accept Editor Mode in Room Component

**File:** `src/components/scalable-house-plan-room.ts`

**Location:** Add property decorators near top of class

**Changes Needed:**

Add these properties (find where other `@property()` decorators are):
```typescript
@property({ type: Boolean }) editorMode = false;
@property({ attribute: false }) selectedElementKey?: string | null;
```

**Notes:**
- `editorMode` is a boolean attribute
- `selectedElementKey` is non-attribute (object property only)

---

### Task 3: Pass to Element Renderer

**File:** `src/components/scalable-house-plan-room.ts`

**Location:** In methods that call `renderElements()` - typically `_renderOverview()` and `_renderDetail()`

**Context:** Need to find where `ElementRendererOptions` is being constructed and passed to `renderElements()`

**Changes Needed:**

Find the `renderElements()` call. It will look something like:
```typescript
const elements = renderElements({
    hass: this.hass,
    room: room,
    roomBounds: bounds,
    createCardElement: this.createCardElement,
    elementCards: this.elementCards,
    scale: scale,
    scaleRatio: scaleRatio,
    config: this.config,
    elementsClickable: true/false,
    houseCache: this.houseCache,
    // ... other options
});
```

Add these three options:
```typescript
const elements = renderElements({
    hass: this.hass,
    room: room,
    roomBounds: bounds,
    createCardElement: this.createCardElement,
    elementCards: this.elementCards,
    scale: scale,
    scaleRatio: scaleRatio,
    config: this.config,
    elementsClickable: true/false,
    houseCache: this.houseCache,
    // NEW: Interactive editor options
    editorMode: this.editorMode,
    selectedElementKey: this.selectedElementKey,
    onElementClick: (uniqueKey: string, elementIndex: number) => {
        this._handleElementClick(uniqueKey, elementIndex);
    },
    // ... other options
});
```

Create the click handler method:
```typescript
private _handleElementClick(uniqueKey: string, elementIndex: number): void {
    // Emit element-selected event to bubble up to editor
    const event = new CustomEvent('element-selected', {
        detail: {
            uniqueKey: uniqueKey,
            elementIndex: elementIndex,
            // Include room index if available (helpful for editor)
            roomIndex: this.roomIndex  // Add this property if it exists
        },
        bubbles: true,
        composed: true
    });
    this.dispatchEvent(event);
}
```

**Notes:**
- Apply to BOTH overview and detail render methods
- Make sure `onElementClick` is only called when `editorMode === true` (renderer will check this)

---

### Task 4: Add Click Handlers to Element Wrappers

**File:** `src/components/element-renderer-shp.ts`

**Location:** In `renderElements()` function, find where element wrappers are rendered (around line 388-392)

**Current Code:**
```typescript
return keyed(uniqueKey, html`
    <div class="element-wrapper" style="${positionData.styleString}; transform: ${positionData.transform}; transform-origin: ${positionData.transformOrigin}; pointer-events: ${elementsClickable ? 'auto' : 'none'};">
        ${card}
    </div>
`);
```

**Changes Needed:**

1. Create click handler function (add at top of map function, before the return):
```typescript
// Handle element click in editor mode
const handleClick = (e: MouseEvent) => {
    if (options.editorMode && options.onElementClick) {
        e.stopPropagation();
        e.preventDefault();
        options.onElementClick(uniqueKey, elements.indexOf({ entity, plan, elementConfig, uniqueKey }));
    }
};
```

2. Update the wrapper div:
```typescript
return keyed(uniqueKey, html`
    <div
        class="element-wrapper ${uniqueKey === options.selectedElementKey ? 'selected-element' : ''}"
        style="${positionData.styleString}; transform: ${positionData.transform}; transform-origin: ${positionData.transformOrigin}; pointer-events: ${elementsClickable || options.editorMode ? 'auto' : 'none'}; ${options.editorMode ? 'cursor: pointer;' : ''}"
        @click=${handleClick}
    >
        ${card}
    </div>
`);
```

**Key Changes:**
- Add `selected-element` class when `uniqueKey === selectedElementKey`
- Update `pointer-events` to be 'auto' when editor mode is active
- Add `cursor: pointer` style when editor mode is active
- Add `@click` event handler

**Notes:**
- `stopPropagation()` prevents parent room from handling click
- Element index calculation: use `elements.indexOf()` to find current index

---

### Task 5: Style Selected Element Outline

**File:** `src/cards/editor-components/shared-styles.ts` OR create inline styles in element renderer

**Option A - Add to shared-styles.ts (Recommended):**

Add at the end of the CSS template literal:
```css
/* Interactive Editor Mode - Selected Element Styles */
.selected-element {
    outline: 3px solid var(--primary-color) !important;
    outline-offset: 2px;
    border-radius: 4px;
    transition: outline 0.2s ease;
    z-index: 1000;
    position: relative;
}

.selected-element::after {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 4px;
    background: var(--primary-color);
    opacity: 0.1;
    pointer-events: none;
}
```

**Option B - Inline in element renderer:**

If shared-styles can't be imported easily, add CSS in the element-wrapper style attribute:
```typescript
style="${positionData.styleString}; transform: ${positionData.transform}; transform-origin: ${positionData.transformOrigin}; ${uniqueKey === options.selectedElementKey ? 'outline: 3px solid var(--primary-color); outline-offset: 2px; border-radius: 4px; z-index: 1000; position: relative;' : ''}"
```

**Design Specs:**
- Outline: 3px solid, primary color
- Offset: 2px from element edge
- Border radius: 4px
- Transition: 0.2s ease
- Optional: Subtle background overlay (10% opacity)

---

### Task 6: Handle Selection Event in Editor

**File:** `src/cards/scalable-house-plan-editor.ts`

**Location:** Add event handler method and attach listener

**Changes Needed:**

1. Add event handler method (after `_toggleEditorMode()`):
```typescript
// Handle element selection from preview
private _handleElementSelection(ev: CustomEvent): void {
    const { uniqueKey } = ev.detail;
    this._selectedElementKey = uniqueKey;

    // Update preview with new selection
    this._configChanged();
}
```

2. Attach event listener to card element in render():

Find where the card is rendered (should be wrapped in the editor). Need to find the element that renders `scalable-house-plan` and add the event listener:

```typescript
@element-selected=${this._handleElementSelection}
```

**Example:**
If there's a preview card rendered in the editor, add the listener:
```typescript
<scalable-house-plan
    .hass=${this.hass}
    .config=${this.config}
    @element-selected=${this._handleElementSelection}
></scalable-house-plan>
```

**Notes:**
- Event bubbles up automatically through Lit components
- May need to add listener at parent level if card is in different component

---

## Validation Checklist

After implementing Phase 2:

### Functional Tests
- [ ] Editor mode toggle shows "Editor" state
- [ ] Clicking element in preview (editor mode) selects it
- [ ] Selected element shows blue outline (3px, primary color)
- [ ] Clicking different element changes selection
- [ ] Only one element selected at a time
- [ ] Cursor changes to pointer on hover (editor mode)
- [ ] Normal mode preserves existing click behavior

### Visual Tests
- [ ] Outline visible on all element types (icons, badges, groups)
- [ ] Outline doesn't obscure element content
- [ ] Selection highlight visible on dark and light backgrounds
- [ ] No layout shift when selecting/deselecting

### Edge Case Tests
- [ ] Clicking empty space (handled in Phase 5)
- [ ] Rapid clicking multiple elements
- [ ] Switching editor mode clears selection
- [ ] Very small elements are clickable

---

## Common Issues & Solutions

### Issue: Click handler not firing
**Solution:** Check that `editorMode` prop is being passed and is `true`

### Issue: Outline not visible
**Solution:** Verify `.selected-element` CSS is loaded; check z-index

### Issue: Selection not updating
**Solution:** Verify `_configChanged()` is called after state update

### Issue: TypeScript errors on event detail
**Solution:** Add type for event detail:
```typescript
interface ElementSelectedDetail {
    uniqueKey: string;
    elementIndex: number;
    roomIndex?: number;
}
```

---

## Files to Modify Summary

| File | Estimated Lines | Purpose |
|------|-----------------|---------|
| `src/cards/scalable-house-plan.ts` | +4 | Pass props to room components |
| `src/components/scalable-house-plan-room.ts` | +20 | Accept props, handle click, emit event |
| `src/components/element-renderer-shp.ts` | +15 | Click handler, selection class |
| `src/cards/editor-components/shared-styles.ts` | +15 | Selection outline styles |
| `src/cards/scalable-house-plan-editor.ts` | +8 | Handle selection event |

**Total Estimated:** ~60-70 lines

---

## Next Phase: Phase 3

After Phase 2, implement Phase 3: Bi-directional Sync (Editor → Preview)
- Expanding element in editor highlights it in preview
- Requires emitting `element-focused` event from editor components

---

## Reference

- Feature Spec: `docs/features/feature_interactive_editor.md` (lines 987-1036)
- Phase 1 Summary: `docs/features/phase1_completion_summary.md`
- Existing patterns: Room preview toggle in `editor-room-shp.ts` (lines 126-132)
