# Feature: Interactive Editor Mode

## Document Status

- **Phase**: Ready for Implementation
- **Last Updated**: 2026-02-02
- **Status**:
  - Requirements: Complete ✅
  - Technical Design: Complete ✅
  - Approval:
    - Requirements: Approved ✅
    - Technical Design: Approved ✅

---

# Intro

Currently, the visual editor displays a live preview on the right side that behaves like the normal user interface - clicking elements triggers their configured actions. There's no way to select elements in the preview to edit them, and no visual feedback connecting the preview with the editor panel. Users must manually find and expand elements in the left-side editor panel to configure them.

# Proposal - High Level

Add an **Interactive Editor Mode** toggle that switches the preview between two modes:

1. **Normal Mode** (current behavior): Preview behaves as it would for end users - elements trigger their configured actions when clicked
2. **Editor Mode**: Preview becomes an interactive editing surface where clicking elements selects them for editing

## Goals
- Click an element in the preview → automatically expand and focus that element in the editor panel
- Navigate to an element in the editor → highlight the corresponding element in the preview
- Bi-directional sync between editor panel and preview selection
- Clear visual indication of which mode is active

## Non-Goals (This Release)
- Drag-and-drop repositioning of elements (planned for next iteration)

## Future Iterations
- **Drag & Drop Support**: When in editor mode, drag elements to reposition them, updating their `left`, `top`, `right`, `bottom` properties in the plan configuration

---

# Prerequisites

### Prerequisite: Detail View Mode ✅
Interactive element selection only works when in detail view (room expanded), not in overview mode.
- Status: Implemented - uses `_previewRoomIndex` to show detail view during editing

---

# Detailed Specification

## 1. Overview

The **Interactive Editor Mode** allows users to toggle the preview between normal operation and an editing mode where clicking elements selects them for configuration.

### Key Characteristics:
- **Mode Toggle**: Clear UI control to switch between Normal and Editor modes
- **Bi-directional Sync**: Selection in preview ↔ expansion in editor panel
- **Visual Feedback**: Selected elements highlighted in preview, expanded in editor
- **Detail Mode Only**: Element selection works only when viewing a room in detail mode

## 2. User Experience

### 2.1 Mode Toggle
- **Location**: Main editor header (top of editor panel)
- **Appearance**: Toggle switch with clear labels (e.g., "Preview" / "Edit" or icon-based)
- **Always Visible**: Toggle shown at all times, but selection functionality only active in detail view
- **Default State**: Normal/Preview mode (current behavior preserved)

### 2.2 Editor Mode Behavior

**Clicking an Element in Preview:**
1. Element becomes visually selected (highlight/outline)
2. Corresponding element in editor panel:
   - Parent room section expands (if collapsed)
   - Element entry expands to show configuration
   - Editor scrolls to make the element visible
   - Element receives focus indication

**Navigating in Editor Panel:**
1. When user expands an element in the editor
2. Corresponding element in preview:
   - Receives selection highlight
   - Optionally scrolls/pans to ensure visibility

### 2.3 Normal Mode Behavior
- Current behavior preserved
- Elements are clickable with their configured tap/hold actions
- No selection highlighting

### 2.4 Visual Indicators
- **Selected Element**: Colored outline (blue or theme accent color) around the element
- **Outline Style**: Solid border, 2-3px width, visible against any background
- **In Editor Mode**: Cursor changes to pointer when hovering over selectable elements
- **Edit Mode Badge**: Subtle badge/indicator in preview corner showing "Edit Mode" when active
- **Empty Space Click**: Clicking empty space in preview clears the current selection

## 3. Configuration Structure

### 3.1 No YAML Configuration Required
This is purely a UI feature during editing - no configuration is persisted to the card config.

## 4. Edge Cases

1. **Clicking in Overview Mode**: Selection should not activate; only works in detail view
2. **Nested Elements (Groups)**: Select the innermost element clicked; if clicking empty space in a group, select the group itself
3. **Overlapping Elements**: Which element gets selected when multiple overlap?
4. **No-Entity Elements**: Selection should work for custom elements without entities
5. **Element Deleted While Selected**: Clear selection state when element is removed
6. **Empty Space Click**: Clicking outside any element clears the current selection
7. **Very Small Elements**: Elements may be small; clicking visible bounds requires precision

---

# Acceptance Criteria

## Must Have
- [ ] Toggle control visible in main editor header to switch between Normal/Editor modes
- [ ] Default mode is Normal (preserve current behavior)
- [ ] In Editor mode, clicking element in preview expands corresponding element in editor
- [ ] In Editor mode, expanding element in editor highlights it in preview (blue/accent outline)
- [ ] Selected element has colored outline (2-3px) visible in preview
- [ ] Selection only works in detail view (room expanded)
- [ ] Mode state persists during editing session
- [ ] Clicking empty space in preview clears selection
- [ ] Subtle "Edit Mode" badge visible in preview when editor mode is active
- [ ] Cursor changes to pointer when hovering over selectable elements
- [ ] Nested elements (groups): clicking selects the innermost element

## Should Have
- [ ] Editor panel scrolls to make expanded element visible
- [ ] Selection cleared when switching rooms
- [ ] Clicking group empty space selects the group itself

## Won't Have (This Release)
- [ ] Drag and drop repositioning (planned for next iteration)
- [ ] Multi-select of elements
- [ ] Copy/paste elements via preview
- [ ] Keyboard shortcut to toggle modes

---

# Use Cases

### Use Case 1: Quick Element Editing
User wants to adjust the position of a light icon but doesn't remember which element it is.

1. Enable Editor Mode
2. Click on the light icon in preview
3. Element configuration expands in editor panel
4. Adjust position values
5. See changes reflected in preview

### Use Case 2: Verifying Element Placement
User is configuring multiple elements and wants to verify which editor entry corresponds to which visual element.

1. Enable Editor Mode
2. Expand an element in the editor
3. See the element highlighted in preview
4. Confirm it's the correct one

### Use Case 3: Complex Layout Configuration
User is building a room with many elements and wants visual guidance.

1. Enable Editor Mode
2. Work through elements one by one in editor
3. Each expanded element shows highlight in preview
4. Easy to understand spatial layout while configuring

---

# Open Questions

### Q1: Toggle Control Placement ✅
**Status**: Resolved
**Question**: Where should the Editor Mode toggle be placed?
**Decision**: Main editor header - toggle appears at the top of the entire editor, next to other global controls

### Q2: Selection Visual Style ✅
**Status**: Resolved
**Question**: How should selected elements appear in the preview?
**Decision**: Colored outline - blue or accent-colored border around the selected element

### Q3: Nested Element Selection ✅
**Status**: Resolved
**Question**: When clicking inside a `group-shp` element, should we select the group or the child element?
**Decision**: Select innermost element - clicking selects the specific child element under the cursor

### Q4: Toggle Visibility ✅
**Status**: Resolved
**Question**: Should the toggle be visible only when in detail view?
**Decision**: Always visible - toggle is always shown in editor header, but selection only works when in detail view (room expanded)

### Q5: Element Click Area ✅
**Status**: Resolved
**Question**: What is the clickable area for element selection?
**Decision**: Visible element bounds - click the rendered visual element (icon, badge, etc.)

### Q6: Empty Space Click ✅
**Status**: Resolved
**Question**: What should happen when clicking empty space in editor mode?
**Decision**: Clear selection - clicking empty space deselects the current element

### Q7: Preview Mode Indicator ✅
**Status**: Resolved
**Question**: Should there be a visual indicator in the preview showing edit mode?
**Decision**: Subtle border/badge - small indicator showing "Edit Mode" in preview corner

---

# Design Decisions

### D1: Toggle Placement
**Decision**: Main editor header (global control)
**Rationale**:
- Single point of control, no confusion about which mode is active
- Visible at all times for quick access
- Consistent with other global editor settings
**Alternatives Considered**:
- Per-room toggle: Rejected as it adds complexity and confusion about state

### D2: Selection Visual Style
**Decision**: Colored outline (blue/accent border)
**Rationale**:
- Clean, unobtrusive visual feedback
- Doesn't obscure element content
- Familiar pattern from design tools
**Alternatives Considered**:
- Overlay: Could obscure element content
- Animation: May be distracting during extended editing

### D3: Group Element Handling
**Decision**: Select innermost element clicked
**Rationale**:
- Most intuitive - what you click is what you get
- Allows direct access to child elements without extra clicks
- Group can still be selected by clicking its empty space
**Alternatives Considered**:
- Drill-down: Adds friction with extra clicks required

### D4: Click Target Area
**Decision**: Visible element bounds only
**Rationale**:
- Most intuitive - click what you see
- Avoids confusion with invisible hit areas
- Matches user expectation from other editors
**Alternatives Considered**:
- Position box: Confusing when elements overlap
- With padding: May cause unexpected selections

### D5: Empty Space Behavior
**Decision**: Clear selection on empty space click
**Rationale**:
- Standard pattern in design/editing tools
- Provides easy way to deselect
- Reduces clutter in editor panel
**Alternatives Considered**:
- Keep selection: Requires explicit deselect action, less intuitive

---

# Technical Solution

## Document Status Update

- **Phase**: Ready for Implementation
- **Last Updated**: 2026-02-02
- **Status**:
  - Requirements: Complete ✅
  - Technical Design: Complete ✅
  - Approval: Requirements Approved ✅, Technical Design Approved ✅

---

## Overview

The Interactive Editor Mode will be implemented by:
1. Adding a toggle control in the main editor component to switch between Normal and Editor modes
2. Creating a new state property `_selectedElementKey` in the main card to track selected elements
3. Modifying the element renderer to intercept clicks in editor mode and emit selection events
4. Enhancing the editor panel to listen for selection events and programmatically expand elements
5. Implementing bi-directional sync: preview clicks → editor expansion, editor expansion → preview highlight

## Architecture Decisions

- **Single Global Mode Toggle**: Place toggle in `scalable-house-plan-editor.ts` header, pass mode state down via config `_editorMode` property
- **Click Interception at Wrapper Level**: Modify `element-renderer-shp.ts` to add click handlers on `.element-wrapper` divs when in editor mode
- **Selection by uniqueKey**: Use existing `uniqueKey` (entity ID or generated key) to identify elements across editor and preview
- **Visual Highlight via CSS Class**: Add `.selected-element` class to element wrapper, styled with accent-colored outline
- **Event-Based Communication**: Emit `element-selected` events from preview, listen in editor to trigger expansion

## Key Principles Applied

- **DRY**: Reuse existing patterns:
  - `_previewRoomIndex` pattern for passing editor state via config
  - `expandedElements: Set<number>` pattern for tracking selection state
  - `room-preview-detail` event pattern for preview-editor communication
  - Existing `uniqueKey` generation in element renderer for stable element identification

- **YAGNI**: Intentionally excluded:
  - Drag-and-drop repositioning (deferred to next iteration as documented)
  - Multi-select functionality (not in requirements)
  - Keyboard shortcuts for mode toggle (not in requirements)
  - Persistence of mode state across sessions (mode resets to Normal on editor reload)

- **KISS**: Simple approach chosen:
  - Use CSS class toggle for visual highlighting (no complex overlays)
  - Leverage existing event bubbling for click handling
  - Single source of truth for selection state in main card component
  - No state synchronization complexity - direct event emission and handling

---

## Codebase Analysis

### Relevant Existing Components

Based on comprehensive codebase analysis, here are the key components and patterns we'll build upon:

1. **[scalable-house-plan-editor.ts](d:\hass\hass-scalable-house-plan\src\cards\scalable-house-plan-editor.ts)**
   - Main editor component with state management (`_config`, `_previewRoomIndex`)
   - Event handling pattern: `room-preview-detail` → `_handlePreviewDetail()` → `_configChanged()`
   - Config passing pattern: Attach internal state to config via `_previewRoomIndex` property (line 421)

2. **[scalable-house-plan.ts](d:\hass\hass-scalable-house-plan\src\cards\scalable-house-plan.ts)**
   - Main card component with edit mode detection: `_isEditMode()` (lines 132-135)
   - Receives config updates via `setConfig()` (lines 143-158)
   - Automatically shows detail view when `_previewRoomIndex` is set (lines 150-157)

3. **[element-renderer-shp.ts](d:\hass\hass-scalable-house-plan\src\components\element-renderer-shp.ts)**
   - Core rendering function `renderElements()` (lines 334-396)
   - Element wrapper structure with `pointer-events` control (line 389)
   - `uniqueKey` generation for stable element identity (used with `keyed()` directive)

4. **[editor-elements-shp.ts](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-elements-shp.ts)**
   - Element list with expansion state: `expandedElements: Set<number>` (line 26)
   - Toggle handling: `_handleElementToggle()` (lines 124-138)
   - Auto-expansion on duplicate: adds to Set and triggers update (lines 175-178)

5. **[editor-room-shp.ts](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-room-shp.ts)**
   - Preview toggle button with icon state: `<ha-icon icon="mdi:eye${_previewDetailView ? '-off' : ''}">` (line 130)
   - Event dispatch pattern: `_dispatchPreviewEvent()` (lines 459-466)

### Reusable Code Identified

1. **Preview State Communication Pattern**
   - Location: [scalable-house-plan-editor.ts:246-251](d:\hass\hass-scalable-house-plan\src\cards\scalable-house-plan-editor.ts#L246-L251)
   - Purpose: Handle events from editor and update preview state
   - Reuse Strategy: Create similar `_handleElementSelection()` handler for element selection events

   ```typescript
   private _handlePreviewDetail(ev: CustomEvent): void {
       const { roomIndex, showPreview } = ev.detail;
       this._previewRoomIndex = showPreview ? roomIndex : null;
       this._configChanged();
   }
   ```

2. **Config Internal State Passing**
   - Location: [scalable-house-plan-editor.ts:416-428](d:\hass\hass-scalable-house-plan\src\cards\scalable-house-plan-editor.ts#L416-L428)
   - Purpose: Pass editor-only state to preview via config object
   - Reuse Strategy: Add `_editorMode` and `_selectedElementKey` to config

   ```typescript
   private _configChanged(): void {
       const event = new CustomEvent("config-changed", {
           detail: {
               config: {
                   ...this._config,
                   _previewRoomIndex: this._previewRoomIndex
               }
           },
           bubbles: true,
           composed: true,
       });
       this.dispatchEvent(event);
   }
   ```

3. **Element Expansion State Management**
   - Location: [editor-elements-shp.ts:124-138](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-elements-shp.ts#L124-L138)
   - Purpose: Track and toggle element expansion
   - Reuse Strategy: Add method to programmatically expand element by entity ID or index

   ```typescript
   private _handleElementToggle(e: CustomEvent) {
       e.stopPropagation();
       const index = e.detail.index;
       if (this.expandedElements.has(index)) {
           this.expandedElements.delete(index);
       } else {
           this.expandedElements.add(index);
       }
       this.expandedElements = new Set(this.expandedElements);
       this.requestUpdate();
   }
   ```

4. **Toggle Button Component Pattern**
   - Location: [editor-room-shp.ts:126-132](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-room-shp.ts#L126-L132)
   - Purpose: Visual toggle with state-based icon
   - Reuse Strategy: Create mode toggle button with similar structure

   ```typescript
   <button
       class="icon-button ${this._previewDetailView ? 'toggled' : ''}"
       @click=${this._togglePreviewDetail}
   >
       <ha-icon icon="mdi:eye${this._previewDetailView ? '-off' : ''}"></ha-icon>
   </button>
   ```

### Patterns to Follow

1. **Event Emission with Detail**
   - Pattern: `new CustomEvent('event-name', { detail: {...}, bubbles: true, composed: true })`
   - Reference: [editor-room-shp.ts:459-466](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-room-shp.ts#L459-L466)
   - Usage: Emit `element-selected` event with `{ uniqueKey, roomIndex, elementIndex }`

2. **Immutable State Updates for Reactivity**
   - Pattern: Replace Set/Array with new instance to trigger Lit reactivity
   - Reference: [editor-elements-shp.ts:136](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-elements-shp.ts#L136)
   - Usage: `this.expandedElements = new Set(this.expandedElements)`

3. **Conditional CSS Classes**
   - Pattern: `class="${condition ? 'active-class' : ''}"`
   - Reference: [editor-room-shp.ts:127](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-room-shp.ts#L127)
   - Usage: `class="element-wrapper ${isSelected ? 'selected-element' : ''}"`

4. **Edit Mode Detection**
   - Pattern: Check URL params for `edit=1`
   - Reference: [scalable-house-plan.ts:132-135](d:\hass\hass-scalable-house-plan\src\cards\scalable-house-plan.ts#L132-L135)
   - Usage: Only enable editor mode click handling when `_isEditMode() && config._editorMode`

### Similar Implementations

1. **Room Preview Toggle** ([editor-room-shp.ts](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-room-shp.ts))
   - How it works: Button click → toggle state → emit event → parent updates config → preview reacts
   - What to learn: Use same event-driven pattern for mode toggle
   - Reuse: Copy toggle button structure and event dispatch pattern

2. **Element Expansion** ([editor-elements-shp.ts](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-elements-shp.ts))
   - How it works: Set-based expansion tracking with immutable updates
   - What to learn: Use Set for O(1) lookups and add/remove operations
   - Reuse: Follow same pattern for tracking selected element (though single selection, could use `string | null`)

---

## Implementation Details

### Files to Modify

1. **[scalable-house-plan-editor.ts](d:\hass\hass-scalable-house-plan\src\cards\scalable-house-plan-editor.ts)**
   - Add `_editorMode: boolean` state property (default: false)
   - Add `_selectedElementKey: string | null` state property
   - Add mode toggle button to header
   - Add `_handleElementSelection()` event handler
   - Update `_configChanged()` to pass `_editorMode` and `_selectedElementKey` in config
   - Add event listener `@element-selected=${this._handleElementSelection}`

2. **[scalable-house-plan.ts](d:\hass\hass-scalable-house-plan\src\cards\scalable-house-plan.ts)**
   - Add `_editorMode: boolean` state property
   - Add `_selectedElementKey: string | null` state property
   - Update `setConfig()` to read `config._editorMode` and `config._selectedElementKey`
   - Pass editor mode state down to room components via props
   - Add "Edit Mode" badge overlay when `_editorMode === true`

3. **[scalable-house-plan-room.ts](d:\hass\hass-scalable-house-plan\src\components\scalable-house-plan-room.ts)**
   - Add `@property() editorMode: boolean` property
   - Add `@property() selectedElementKey?: string | null` property
   - Pass editor mode and selection to `renderElements()` in ElementRendererOptions
   - Add event listener to bubble `element-selected` events from element-wrapper clicks

4. **[element-renderer-shp.ts](d:\hass\hass-scalable-house-plan\src\components\element-renderer-shp.ts)**
   - Add `editorMode?: boolean` to `ElementRendererOptions` interface
   - Add `selectedElementKey?: string | null` to `ElementRendererOptions`
   - Add `onElementClick?: (uniqueKey: string) => void` callback to options
   - Modify element wrapper rendering to:
     - Add click handler when `editorMode === true`
     - Add `selected-element` class when `uniqueKey === selectedElementKey`
     - Call `onElementClick(uniqueKey)` on click, `stopPropagation()` to prevent room action

5. **[editor-elements-shp.ts](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-elements-shp.ts)**
   - Add method `expandElementByEntityId(entityId: string): void`
   - Find element index by matching entity ID
   - Add to `expandedElements` Set
   - Trigger update and scroll element into view

6. **[editor-room-shp.ts](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-room-shp.ts)**
   - Add method `expandElementInRoom(entityId: string): void`
   - Ensure room is expanded (`_expanded = true`)
   - Call `editor-elements-shp` component's `expandElementByEntityId()` method
   - Add event listener for `element-selected` to trigger expansion

7. **[editor-rooms-shp.ts](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-rooms-shp.ts)**
   - Add method `expandElementAtPath(roomIndex: number, entityId: string): void`
   - Find room by index
   - Call room component's `expandElementInRoom()` method

8. **[types.ts](d:\hass\hass-scalable-house-plan\src\cards\types.ts)** (ScalableHousePlanConfig interface)
   - Add `_editorMode?: boolean` property
   - Add `_selectedElementKey?: string | null` property

9. **[shared-styles.ts](d:\hass\hass-scalable-house-plan\src\cards\editor-components\shared-styles.ts)**
   - Add CSS for `.selected-element` class with accent-colored outline
   - Add CSS for editor mode badge overlay
   - Add hover cursor styles for selectable elements

### Type Definitions

**File**: [types.ts](d:\hass\hass-scalable-house-plan\src\cards\types.ts)

```typescript
export interface ScalableHousePlanConfig extends LovelaceCardConfig {
    // ... existing properties ...
    _previewRoomIndex?: number;  // Existing: room index for detail preview
    _editorMode?: boolean;       // NEW: interactive editor mode enabled
    _selectedElementKey?: string | null;  // NEW: currently selected element uniqueKey
}
```

**File**: [element-renderer-shp.ts](d:\hass\hass-scalable-house-plan\src\components\element-renderer-shp.ts)

```typescript
export interface ElementRendererOptions {
    // ... existing properties ...
    elementsClickable: boolean;

    // NEW: Interactive editor mode properties
    editorMode?: boolean;  // Enable click-to-select behavior
    selectedElementKey?: string | null;  // Currently selected element
    onElementClick?: (uniqueKey: string, elementIndex: number) => void;  // Click callback
}
```

### Integration Points

#### 1. Event Flow: Preview Click → Editor Expansion

```
User clicks element in preview (editor mode enabled)
    ↓
element-wrapper click handler (element-renderer-shp.ts)
    ↓
onElementClick(uniqueKey, elementIndex) callback
    ↓
scalable-house-plan-room.ts emits 'element-selected' event
    ↓
Event bubbles to scalable-house-plan.ts
    ↓
Bubbles to scalable-house-plan-editor.ts
    ↓
_handleElementSelection() updates _selectedElementKey
    ↓
_configChanged() passes new selection to preview
    ↓
Also calls editor-rooms-shp.expandElementAtPath()
    ↓
Expands room → expands element in editor panel
```

#### 2. Event Flow: Editor Expansion → Preview Highlight

```
User expands element in editor panel
    ↓
editor-element-shp.ts emits 'element-toggle' event
    ↓
editor-elements-shp.ts handles toggle
    ↓
NEW: Also emit 'element-focused' event with entity ID
    ↓
Event bubbles to scalable-house-plan-editor.ts
    ↓
_handleElementFocus() updates _selectedElementKey
    ↓
_configChanged() passes selection to preview
    ↓
scalable-house-plan.ts receives config update
    ↓
Passes selectedElementKey to room components
    ↓
element-renderer adds 'selected-element' class to matching element
```

#### 3. Mode Toggle Flow

```
User clicks mode toggle button
    ↓
scalable-house-plan-editor.ts: _toggleEditorMode()
    ↓
_editorMode = !_editorMode
    ↓
If switching to Normal mode: _selectedElementKey = null
    ↓
_configChanged() passes new mode to preview
    ↓
scalable-house-plan.ts receives config update
    ↓
_editorMode state updated
    ↓
Passed to room components
    ↓
element-renderer changes behavior based on editorMode
```

---

## Data Flow

### Input: Mode Toggle

**User Action**: Clicks toggle button in editor header

**State Changes**:
```typescript
// In scalable-house-plan-editor.ts
_editorMode: false → true
_selectedElementKey: null (cleared on mode change)

// Passed via config
config._editorMode: true
config._selectedElementKey: null
```

**Rendering Changes**:
- Toggle button updates icon/label
- Preview shows "Edit Mode" badge
- Element wrappers add click handlers
- Cursor changes to pointer on hover

### Input: Preview Element Click (Editor Mode)

**User Action**: Clicks element in preview while in editor mode

**Event Emission**:
```typescript
// From element wrapper click handler
{
    type: 'element-selected',
    detail: {
        uniqueKey: 'light.living_room',
        roomIndex: 0,
        elementIndex: 2
    },
    bubbles: true,
    composed: true
}
```

**State Changes**:
```typescript
// In scalable-house-plan-editor.ts
_selectedElementKey: null → 'light.living_room'

// In editor-room-shp.ts (room 0)
_expanded: true  // Ensure room is expanded

// In editor-elements-shp.ts (room 0)
expandedElements: Set() → Set(2)  // Add element index 2
```

**Rendering Changes**:
- Editor panel scrolls to room 0
- Room 0 expands (if collapsed)
- Element 2 in room 0 expands to show config
- Preview highlights element with outline

### Input: Editor Panel Element Expansion

**User Action**: Clicks to expand element in editor panel

**Event Emission**:
```typescript
// From editor-element-shp.ts
{
    type: 'element-focused',  // NEW event
    detail: {
        entityId: 'light.living_room',
        roomIndex: 0,
        elementIndex: 2
    },
    bubbles: true,
    composed: true
}
```

**State Changes**:
```typescript
// In scalable-house-plan-editor.ts
_selectedElementKey: null → 'light.living_room'
```

**Rendering Changes**:
- Preview adds outline to element with uniqueKey='light.living_room'

---

## Key Algorithms

### Algorithm 1: Find Element Index by Entity ID

**Purpose**: Locate element in list by entity ID for programmatic expansion

**Implementation**: [editor-elements-shp.ts](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-elements-shp.ts)

```typescript
public expandElementByEntityId(entityId: string): boolean {
    // Find index of element with matching entity ID
    const index = this.elements.findIndex(element => {
        const elEntityId = typeof element === 'string'
            ? element
            : element.entity;
        return elEntityId === entityId;
    });

    if (index === -1) {
        return false;  // Element not found
    }

    // Add to expanded set
    this.expandedElements.add(index);
    this.expandedElements = new Set(this.expandedElements);

    // Scroll element into view
    this.updateComplete.then(() => {
        const elementNode = this.shadowRoot?.querySelector(
            `.element-item:nth-child(${index + 1})`
        );
        elementNode?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
        });
    });

    return true;
}
```

**Complexity**: O(n) time where n = number of elements, O(1) space

**Edge Cases Handled**:
- **Element not found**: Returns false, no state change
- **Already expanded**: Set handles duplicates automatically
- **No-entity elements**: Won't match entityId, expected behavior
- **Element node not in DOM yet**: `updateComplete.then()` waits for render

### Algorithm 2: Nested Group Click Target Detection

**Purpose**: Determine which element was clicked when groups contain child elements

**Implementation**: [element-renderer-shp.ts](d:\hass\hass-scalable-house-plan\src\components\element-renderer-shp.ts)

```typescript
// Click handler added to element-wrapper
const handleElementClick = (ev: MouseEvent, uniqueKey: string, index: number) => {
    // Only handle in editor mode
    if (!options.editorMode || !options.onElementClick) {
        return;
    }

    // Stop propagation to prevent:
    // 1. Parent group from handling click
    // 2. Room polygon click action
    ev.stopPropagation();
    ev.preventDefault();

    // Notify parent of selection
    options.onElementClick(uniqueKey, index);
};

// Applied to wrapper div
<div
    class="element-wrapper ${uniqueKey === options.selectedElementKey ? 'selected-element' : ''}"
    style="..."
    @click=${(ev: MouseEvent) => handleElementClick(ev, uniqueKey, index)}
>
```

**How it handles nesting**:
- Click on child element → child's wrapper handles it first → `stopPropagation()` prevents parent group
- Click on group empty space → only group wrapper receives click (no child wrapper to intercept)
- Natural event bubbling determines innermost element

**Edge Cases Handled**:
- **Overlapping elements**: First element in DOM order receives click (predictable)
- **Very small elements**: Click target matches visible bounds (wrapper div)
- **Group empty space**: Group wrapper handles click directly

---

## Code Reuse Strategy

### Shared Patterns Reused

1. **Editor-Preview Communication Pattern**
   - **Existing**: `_previewRoomIndex` via config, `room-preview-detail` event
   - **Location**: [scalable-house-plan-editor.ts:246-251, 416-428](d:\hass\hass-scalable-house-plan\src\cards\scalable-house-plan-editor.ts)
   - **Reuse**: Add `_editorMode` and `_selectedElementKey` to same config-passing pattern
   - **Why shared**: Proven pattern, minimal changes needed, maintains consistency

2. **Set-Based State Tracking**
   - **Existing**: `expandedElements: Set<number>`
   - **Location**: [editor-elements-shp.ts:26](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-elements-shp.ts#L26)
   - **Reuse**: Use `string | null` for single selection (simpler than Set for single item)
   - **Why shared**: Consistent pattern for tracking UI state, efficient O(1) operations

3. **Toggle Button Component**
   - **Existing**: Preview detail toggle in room editor
   - **Location**: [editor-room-shp.ts:126-132](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-room-shp.ts#L126-L132)
   - **Reuse**: Copy structure for mode toggle button
   - **Why shared**: Consistent UI, familiar interaction pattern

4. **Event Emission Pattern**
   - **Existing**: `room-preview-detail` event with bubbling
   - **Location**: [editor-room-shp.ts:459-466](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-room-shp.ts#L459-L466)
   - **Reuse**: Create `element-selected` and `element-focused` events with same structure
   - **Why shared**: Works well with component hierarchy, Lit-friendly

### Existing Utilities Reused

1. **uniqueKey Generation** (element-renderer-shp.ts)
   - Already generates stable keys for elements
   - Reuse directly for selection tracking
   - No changes needed

2. **Edit Mode Detection** (scalable-house-plan.ts:132-135)
   - Already checks for edit mode
   - Use to conditionally enable editor mode features
   - No changes needed

3. **Immutable State Update Pattern**
   - Used throughout for Lit reactivity
   - Apply to selection state updates
   - No new utilities needed

---

## Performance Considerations

### Optimization Strategies

1. **Single State Property for Selection**
   - Use `string | null` instead of `Set<string>` for single selection
   - Avoids Set overhead for single-item tracking
   - O(1) comparison: `uniqueKey === selectedElementKey`

2. **Conditional Event Listeners**
   - Only add click handlers to element wrappers when `editorMode === true`
   - Reduces event listener overhead in normal mode
   - No performance impact on existing behavior

3. **CSS Class Toggle for Visual Feedback**
   - Simple class addition/removal: `.selected-element`
   - Browser-optimized CSS rendering
   - No JavaScript-driven animations or overlays

4. **Lazy Expansion**
   - Only expand elements when selection event received
   - Use `updateComplete.then()` to wait for render before scrolling
   - Smooth scroll with `behavior: 'smooth', block: 'nearest'`

### Potential Bottlenecks

1. **Finding Element by Entity ID**
   - Risk: Linear search through elements array on each selection
   - Typical scale: 5-20 elements per room, negligible impact
   - Mitigation: Already O(n) where n is small; no optimization needed (YAGNI)

2. **Scroll-into-View Operations**
   - Risk: Layout thrashing if multiple scroll operations occur rapidly
   - Typical usage: Single selection at a time, manual user interaction
   - Mitigation: `updateComplete.then()` batches with render cycle

### Rendering Performance

- **No additional re-renders**: Selection state passed via props, Lit handles efficiently
- **No layout shifts**: Outline is applied without changing element dimensions
- **Minimal DOM changes**: Only class attribute changes on selection

### Memory Impact

- **Two new state properties**: `_editorMode: boolean`, `_selectedElementKey: string | null`
- **Memory overhead**: ~8 bytes (boolean) + ~50-100 bytes (string reference)
- **Negligible impact**: Total < 150 bytes per editor instance

---

## Error Handling

### Validation Errors

1. **Element Not Found by Entity ID**
   - Condition: `expandElementByEntityId()` called with unknown entity ID
   - Handling: Return `false`, no state change
   - User Feedback: No visual change (expected - element doesn't exist)

2. **Invalid uniqueKey in Selection Event**
   - Condition: `element-selected` event with malformed uniqueKey
   - Handling: Set `_selectedElementKey` anyway (will match nothing in preview)
   - User Feedback: No highlight appears in preview

### Runtime Errors

1. **Room Component Not Found**
   - Condition: Trying to expand element in room that doesn't exist
   - Handling: Early return if room index out of bounds
   - Fallback: Selection state still updated, partial sync

2. **Editor Panel Not Rendered**
   - Condition: Selection event received before editor panel renders
   - Handling: `updateComplete.then()` waits for render
   - Fallback: If component destroyed, promise never resolves (safe)

### Edge Cases

1. **Element Deleted While Selected**
   - Handling: Next render won't find matching uniqueKey, outline disappears naturally
   - Cleanup: Clear `_selectedElementKey` on room/element deletion (added to delete handlers)

2. **Switching Rooms While Element Selected**
   - Handling: Selection persists if element exists in new room (by entity ID)
   - Expected: Highlight appears on same entity in different room (acceptable)
   - Alternative: Clear selection on room switch (add to `_handlePreviewDetail()`)

3. **Mode Toggle While Element Selected**
   - Handling: Switching to Normal mode clears `_selectedElementKey`
   - Reasoning: Normal mode has no selection concept

4. **Rapid Clicks**
   - Handling: Each click updates `_selectedElementKey`, last one wins
   - Debouncing: Not needed, state updates are cheap

---

## Implementation Plan

### Phase 1: Core State Management & Mode Toggle

**Goal**: Add editor mode toggle and state infrastructure

**Tasks**:

1. ❌ **Add type definitions**
   - File: [types.ts](d:\hass\hass-scalable-house-plan\src\cards\types.ts)
   - Add `_editorMode?: boolean` to `ScalableHousePlanConfig`
   - Add `_selectedElementKey?: string | null` to `ScalableHousePlanConfig`
   - Add `editorMode?`, `selectedElementKey?`, `onElementClick?` to `ElementRendererOptions` interface

2. ❌ **Add editor state properties**
   - File: [scalable-house-plan-editor.ts](d:\hass\hass-scalable-house-plan\src\cards\scalable-house-plan-editor.ts)
   - Add `@state() private _editorMode = false;`
   - Add `@state() private _selectedElementKey: string | null = null;`

3. ❌ **Add mode toggle button to editor header**
   - File: [scalable-house-plan-editor.ts](d:\hass\hass-scalable-house-plan\src\cards\scalable-house-plan-editor.ts)
   - Add button to render() method in header section
   - Style: Follow preview toggle button pattern from editor-room-shp.ts
   - Icon: `mdi:cursor-default-click` (normal) / `mdi:cursor-default-click-outline` (editor)
   - Label: "Editor Mode" with toggle state indication

4. ❌ **Implement mode toggle handler**
   - File: [scalable-house-plan-editor.ts](d:\hass\hass-scalable-house-plan\src\cards\scalable-house-plan-editor.ts)
   - Add `_toggleEditorMode()` method
   - Toggle `_editorMode` state
   - Clear `_selectedElementKey` when switching to Normal mode
   - Call `_configChanged()`

5. ❌ **Update config passing**
   - File: [scalable-house-plan-editor.ts](d:\hass\hass-scalable-house-plan\src\cards\scalable-house-plan-editor.ts)
   - Modify `_configChanged()` to include `_editorMode` and `_selectedElementKey`

6. ❌ **Receive mode state in main card**
   - File: [scalable-house-plan.ts](d:\hass\hass-scalable-house-plan\src\cards\scalable-house-plan.ts)
   - Add `@state() private _editorMode = false;`
   - Add `@state() private _selectedElementKey: string | null = null;`
   - Update `setConfig()` to read `config._editorMode` and `config._selectedElementKey`

**Validation**:
- [ ] Toggle button visible in editor header
- [ ] Button click changes state (verify in dev tools)
- [ ] State passed to main card via config
- [ ] Default mode is Normal (false)

---

### Phase 2: Preview Click-to-Select

**Goal**: Make elements selectable in preview, emit selection events

**Tasks**:

1. ❌ **Pass editor mode to room components**
   - File: [scalable-house-plan.ts](d:\hass\hass-scalable-house-plan\src\cards\scalable-house-plan.ts)
   - Add `editorMode` and `selectedElementKey` props to `scalable-house-plan-room` components
   - Update overview and detail view rendering

2. ❌ **Accept editor mode in room component**
   - File: [scalable-house-plan-room.ts](d:\hass\hass-scalable-house-plan\src\components\scalable-house-plan-room.ts)
   - Add `@property({ type: Boolean }) editorMode = false;`
   - Add `@property({ attribute: false }) selectedElementKey?: string | null;`

3. ❌ **Pass to element renderer**
   - File: [scalable-house-plan-room.ts](d:\hass\hass-scalable-house-plan\src\components\scalable-house-plan-room.ts)
   - Add `editorMode`, `selectedElementKey`, `onElementClick` to `ElementRendererOptions` in `_renderOverview()` and `_renderDetail()`
   - Implement `onElementClick` callback to emit `element-selected` event

4. ❌ **Add click handlers to element wrappers**
   - File: [element-renderer-shp.ts](d:\hass\hass-scalable-house-plan\src\components\element-renderer-shp.ts)
   - Add conditional click handler to element-wrapper div when `options.editorMode === true`
   - Handler: `stopPropagation()`, call `options.onElementClick(uniqueKey, index)`
   - Add `cursor: pointer` style when editor mode enabled

5. ❌ **Add visual selection class**
   - File: [element-renderer-shp.ts](d:\hass\hass-scalable-house-plan\src\components\element-renderer-shp.ts)
   - Add conditional class: `${uniqueKey === options.selectedElementKey ? 'selected-element' : ''}`

6. ❌ **Style selected element outline**
   - File: [shared-styles.ts](d:\hass\hass-scalable-house-plan\src\cards\editor-components\shared-styles.ts) OR inline in element-renderer-shp.ts
   - Add `.selected-element` class with blue/accent-colored outline (2-3px solid)
   - Add transition for smooth appearance

7. ❌ **Handle selection event in editor**
   - File: [scalable-house-plan-editor.ts](d:\hass\hass-scalable-house-plan\src\cards\scalable-house-plan-editor.ts)
   - Add event listener `@element-selected=${this._handleElementSelection}` to card element
   - Implement `_handleElementSelection(ev: CustomEvent)` to update `_selectedElementKey`
   - Call `_configChanged()` to sync with preview

**Validation**:
- [ ] In editor mode, clicking element in preview updates selection state
- [ ] Selected element shows outline in preview
- [ ] Clicking different element changes selection
- [ ] Clicking empty space clears selection (if implemented)
- [ ] In normal mode, clicks trigger normal actions (not selection)

---

### Phase 3: Bi-Directional Sync (Editor Expansion → Preview Highlight)

**Goal**: Expanding element in editor highlights it in preview

**Tasks**:

1. ❌ **Emit focus event on element expansion**
   - File: [editor-element-shp.ts](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-element-shp.ts)
   - Modify `_toggleExpansion()` to emit `element-focused` event when expanding (not collapsing)
   - Event detail: `{ entityId, roomIndex, elementIndex }`

2. ❌ **Handle focus event in editor**
   - File: [scalable-house-plan-editor.ts](d:\hass\hass-scalable-house-plan\src\cards\scalable-house-plan-editor.ts)
   - Add event listener `@element-focused=${this._handleElementFocus}`
   - Implement handler to update `_selectedElementKey` from entityId
   - Call `_configChanged()`

3. ❌ **Highlight flows to preview**
   - Already implemented in Phase 2 via config passing
   - Verify: Expanding element in editor adds outline in preview

**Validation**:
- [ ] Expanding element in editor highlights it in preview
- [ ] Collapsing element keeps highlight (outline persists)
- [ ] Switching between elements updates highlight

---

### Phase 4: Preview Selection → Editor Expansion

**Goal**: Clicking element in preview expands it in editor panel

**Tasks**:

1. ❌ **Add method to expand element by entity ID**
   - File: [editor-elements-shp.ts](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-elements-shp.ts)
   - Add public method `expandElementByEntityId(entityId: string): boolean`
   - Implementation: Find index, add to Set, scroll into view (see Algorithm 1)

2. ❌ **Add method to expand element in room**
   - File: [editor-room-shp.ts](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-room-shp.ts)
   - Add public method `expandElementInRoom(entityId: string): void`
   - Ensure room is expanded (`this._expanded = true`)
   - Call child `editor-elements-shp.expandElementByEntityId()`

3. ❌ **Add method to expand element at path**
   - File: [editor-rooms-shp.ts](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-rooms-shp.ts)
   - Add public method `expandElementAtPath(roomIndex: number, entityId: string): void`
   - Find room component by index (via ref or query)
   - Call room's `expandElementInRoom()`

4. ❌ **Call expansion from selection handler**
   - File: [scalable-house-plan-editor.ts](d:\hass\hass-scalable-house-plan\src\cards\scalable-house-plan-editor.ts)
   - Update `_handleElementSelection()` to call rooms component expansion method
   - Extract `roomIndex` and `entityId` from event detail
   - Get reference to `editor-rooms-shp` component (via `@query` decorator or `querySelector`)

5. ❌ **Scroll editor panel to element**
   - File: [editor-elements-shp.ts](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-elements-shp.ts)
   - Already implemented in `expandElementByEntityId()` via `scrollIntoView()`

**Validation**:
- [ ] Clicking element in preview expands corresponding element in editor
- [ ] Editor scrolls to make expanded element visible
- [ ] If element is in collapsed room, room expands first
- [ ] Works for elements across different rooms

---

### Phase 5: Polish & Edge Cases

**Goal**: Handle edge cases, add visual indicators, test thoroughly

**Tasks**:

1. ❌ **Add "Edit Mode" badge to preview**
   - File: [scalable-house-plan.ts](d:\hass\hass-scalable-house-plan\src\cards\scalable-house-plan.ts)
   - Add overlay badge in corner when `_editorMode === true`
   - Style: Subtle, non-intrusive, "Edit Mode" text or icon
   - Position: Top-right or bottom-right corner

2. ❌ **Clear selection on empty space click**
   - File: [scalable-house-plan-room.ts](d:\hass\hass-scalable-house-plan\src\components\scalable-house-plan-room.ts)
   - Add click handler to room container (overview or detail)
   - If `editorMode` and click target is room polygon or container (not element), emit `element-selected` with `null` key

3. ❌ **Clear selection on room switch**
   - File: [scalable-house-plan-editor.ts](d:\hass\hass-scalable-house-plan\src\cards\scalable-house-plan-editor.ts)
   - Update `_handlePreviewDetail()` to clear `_selectedElementKey` when room changes

4. ❌ **Clear selection on element delete**
   - File: [editor-elements-shp.ts](d:\hass\hass-scalable-house-plan\src\cards\editor-components\editor-elements-shp.ts)
   - Check if deleted element was selected (compare entity ID)
   - Emit `element-focused` with null if match

5. ❌ **Handle nested group clicks**
   - File: [element-renderer-shp.ts](d:\hass\hass-scalable-house-plan\src\components\element-renderer-shp.ts)
   - Already handled via `stopPropagation()` in wrapper click handler
   - Verify: Innermost element receives click (Algorithm 2)

6. ❌ **Cursor style for selectable elements**
   - File: [element-renderer-shp.ts](d:\hass\hass-scalable-house-plan\src\components\element-renderer-shp.ts)
   - Add `cursor: pointer` to element-wrapper style when `editorMode === true`
   - Remove when `editorMode === false`

7. ❌ **Test all use cases**
   - Use Case 1: Quick element editing (click element → edit config → see changes)
   - Use Case 2: Verifying element placement (expand in editor → see highlight)
   - Use Case 3: Complex layout configuration (iterate through elements)

8. ❌ **Test all edge cases**
   - Nested groups (click child vs. group)
   - Overlapping elements
   - No-entity elements
   - Empty space click
   - Rapid mode toggle
   - Element deletion while selected

**Validation**:
- [ ] All must-have acceptance criteria met
- [ ] All should-have acceptance criteria met
- [ ] All edge cases handled gracefully
- [ ] "Edit Mode" badge visible when mode active
- [ ] No regression in normal mode behavior

---

## Questions for Clarification

### Q1: Should Selection Persist Across Room Changes?

**Context**: When user switches rooms (via preview detail toggle), should the selected element remain selected if it doesn't exist in the new room?

**Options**:
- **Option A**: Clear selection on room switch
  - Pros: Clean state, no confusion about what's selected
  - Cons: Lose selection if accidentally switch rooms

- **Option B**: Persist selection, highlight if element exists in new room
  - Pros: Allows selecting same entity across multiple rooms
  - Cons: May be confusing if entity doesn't exist in new room

**Recommendation**: Option A - Clear selection on room switch
- Simpler mental model
- Aligns with "selection is contextual to current view" principle
- Easy to implement in `_handlePreviewDetail()`

**Decision**: To be confirmed by user ✅

### Q2: Should Empty Space Click Clear Selection?

**Context**: Already specified in requirements as "Should Have"

**Implementation Confirmed**:
- Click on room polygon or container (not element) → emit `element-selected` with `null`
- Handled in Phase 5, Task 2

**Decision**: Confirmed from requirements ✅

### Q3: Should Mode State Persist Across Editor Reload?

**Context**: When user closes and reopens the editor, should it remember the previous mode?

**Current Design**: Mode resets to Normal (false) on editor initialization

**Alternative**: Store in localStorage and restore on init

**Recommendation**: Keep current design (no persistence)
- YAGNI: Not in requirements, adds complexity
- Expected behavior: Editor starts in safe "preview" mode
- Easy to toggle if user wants editor mode

**Decision**: No persistence (follows YAGNI) ✅

---

## Dependencies & Prerequisites

### Required Before Implementation

- [x] Requirements finalized and approved
- [x] Detail view mode implemented (prerequisite confirmed)
- [x] Existing `_previewRoomIndex` pattern working

### External Dependencies

None - feature uses only existing dependencies (Lit, Home Assistant frontend components)

### Internal Dependencies

- **element-renderer-shp.ts**: Core rendering logic must remain stable
- **editor-elements-shp.ts**: Expansion state management pattern
- **scalable-house-plan-editor.ts**: Event handling infrastructure
- **types.ts**: Config interface for type safety

### Environment Setup

No special setup required - standard development environment for this project

---

## Summary

This technical solution implements Interactive Editor Mode by:

1. **Reusing proven patterns**: Config-passing for state, event-driven communication, Set-based tracking
2. **Applying KISS principle**: CSS class toggle for highlights, simple string state for selection, no complex overlays
3. **Following DRY principle**: Leveraging existing `uniqueKey`, toggle button pattern, event emission structure
4. **Respecting YAGNI**: No drag-drop (next iteration), no multi-select, no persistence, no keyboard shortcuts

The implementation is broken into 5 clear phases with specific validation criteria, ensuring each piece works before moving to the next. All edge cases are handled gracefully, and the solution integrates seamlessly with the existing architecture.

**Ready for user approval before implementation.**
