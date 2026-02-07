# Feature: Drag & Drop Element Repositioning

## Document Status

- **Phase**: Ready for Implementation
- **Last Updated**: 2026-02-06
- **Requirements**: Complete ✅
- **Technical Design**: Complete ✅
- **User Approval**:
  - Requirements: Approved ✅
  - Technical Design: Approved ✅
  - Technical Design: Pending 🚧

---

# Intro

Currently, element positions in the house plan are configured manually by editing numeric values in the YAML/plan configuration (`left`, `top`, `right`, `bottom`). When a user wants to move an element, they must guess coordinates, save, and check the result — a tedious trial-and-error process. The interactive editor already supports clicking on elements to select and highlight them, but there is no way to visually reposition them by dragging.

# Proposal - High Level

Allow users to drag and drop elements directly on the house plan preview (when the editor is in edit mode) to reposition them visually. When an element is dropped at a new location, the underlying plan configuration is automatically updated with the new position values, preserving the original units and coordinate anchoring (top vs bottom, left vs right).

## Goals
- Enable visual repositioning of elements by dragging them in the house plan preview
- Automatically update the plan's position configuration (`left`/`right`/`top`/`bottom`) with new values
- Preserve the original units (px, %, or unitless) and anchor direction (e.g., if the element is anchored with `right` and `bottom`, those properties are updated — not replaced with `left` and `top`)

## Non-Goals
- Resizing elements via drag (width/height)
- Drag-and-drop to reorder elements in the entities list
- Drag elements between rooms
- Snapping or grid alignment (can be added later)

---

# Prerequisites

### Prerequisite: Interactive Editor with Click-to-Select ✅
The visual editor must support edit mode where elements are clickable and selectable, with highlighting and editor panel synchronization.
- Status: Implemented (Phases 1–5 of `feature_interactive_editor.md`)

---

# Detailed Specification

## 1. Overview

The **Drag & Drop Element Repositioning** feature allows users in editor mode to click and drag any element on the house plan to move it to a new position. When the element is dropped, the plan configuration is updated with new coordinates that match the drop location.

### Key Characteristics:
- **Editor mode only**: Drag is only available when the editor is in edit mode (the same mode that enables click-to-select)
- **Preserves anchor direction**: If an element's position is defined using `right` and `bottom`, those properties are updated — the system does not switch to `left` and `top`
- **Preserves units**: If `left` is `"50%"`, the new value will also be in `%`. If `left` is `100` (unitless/px), the new value will also be a number
- **Visual feedback**: During drag, the element visually follows the cursor so the user can see the target position
- **Updates config on drop**: When the drag ends, the configuration is updated and the editor fires a config-changed event so it persists

## 2. User Experience

### 2.1 Initiating a Drag

1. User is in the card editor with **Edit mode** active
2. User hovers over an element on the house plan preview — cursor shows `grab` (or `pointer` as currently)
3. User presses and holds the mouse button on the element
4. After a small movement threshold (e.g., 3–5px), drag mode activates
5. The element visually moves with the cursor

### 2.2 During Drag

- The element follows the mouse/touch position
- The element shows a visual cue that it's being dragged (e.g. slight opacity change or a shadow)
- Other elements remain in place (no reflow)
- The selected-element highlight remains visible

### 2.3 Dropping the Element

- User releases the mouse button
- The element snaps to the final position
- The plan configuration is updated with the new position values
- The config-changed event fires, updating the YAML in the editor panel
- The element remains selected after the drop

### 2.4 Cancelling a Drag

- User presses `Escape` during drag — element returns to original position
- Dragging the element outside the room boundaries — TBD (see Open Questions)

## 3. Position Update Logic

### 3.1 Coordinate Mapping

When the user drops an element, the pixel offset is converted back to the original coordinate system:

| Original Property | Unit | Conversion |
|---|---|---|
| `left: 100` | unitless (px) | `left: <new_px_value>` (number) |
| `left: "50%"` | percentage | `left: "<new_pct>%"` (string) |
| `top: 200` | unitless (px) | `top: <new_px_value>` (number) |
| `right: 50` | unitless (px) | `right: <new_px_value>` (number) |
| `bottom: "10%"` | percentage | `bottom: "<new_pct>%"` (string) |

### 3.2 Anchor Preservation Rules

- If the element is positioned with `left`, update `left` only (do not add or switch to `right`)
- If the element is positioned with `right`, update `right` only
- Same for `top` / `bottom`
- If both `left` and `right` are set, update both (maintaining the width constraint they imply)

### 3.3 Reverse Calculation

The current rendering converts config values → percentage-based CSS:
```
scaledLeft = plan.left * horizontalPositionScale
percentage = (scaledLeft / (roomBounds.width * scale)) * 100
style.left = percentage%
```

The drag-drop needs the reverse:
```
// From the pixel offset of the element within the room container:
newConfigValue = (pixelOffset / containerPixelSize) * roomBounds.dimension * scale / positionScale
```

For percentage values:
```
newConfigValue = (pixelOffset / containerPixelSize) * 100 → "<value>%"
```

## 4. Edge Cases

1. **Elements with both horizontal anchors (`left` + `right`)**: Both values should be updated to maintain the implied width constraint. The delta from the drag should be applied to both.
2. **Elements with no position (detail-only entities)**: These don't have plan coordinates — drag should not be available for them (no plan section = no drag)
3. **Elements inside a group**: The drag should update the child's position within the group, not the group's position. The coordinate space is relative to the group container.
4. **Percentage-based positions**: The new value should be calculated as a percentage of the room/container dimensions.
5. **Negative position values**: Should still be supported — elements can be positioned outside room boundaries.
6. **Elements at room edges**: The drag should not clamp values — let users position elements wherever they want.
7. **Scale and zoom**: Position calculations must account for the current scale factor and element scale.

---

# Acceptance Criteria

## Must Have
- [ ] User can drag an element in the house plan preview when editor is in edit mode
- [ ] Dragging updates the element's position in the configuration
- [ ] The original anchor properties are preserved (e.g., `right`/`bottom` stay as `right`/`bottom`)
- [ ] The original units are preserved (number stays number, `"50%"` stays percentage format)
- [ ] Visual feedback is shown during drag (element follows cursor)
- [ ] Config-changed event fires after drop, so the config persists
- [ ] Pressing Escape during drag cancels and returns the element to original position
- [ ] The drag works in both overview and detail preview modes

## Should Have
- [ ] Cursor changes to `grab`/`grabbing` during hover and drag
- [ ] Elements inside groups can be dragged to update their position within the group
- [ ] Small movement threshold before drag activates (to distinguish from click-to-select)

## Won't Have (This Release)
- [ ] Snap-to-grid or alignment guides
- [ ] Multi-element drag (select and drag multiple at once)
- [ ] Undo/redo for drag operations
- [ ] Drag elements between rooms
- [ ] Resize via drag handles

---

# Use Cases

### Use Case 1: Repositioning a Light Icon
User has a ceiling light positioned at `left: 250, top: 200`. They drag it 50px to the right and 30px down in the preview. The config updates to `left: 300, top: 230` (approximately, accounting for scale).

### Use Case 2: Moving a Right-Anchored Sensor
An element is positioned with `right: 50, top: 10`. The user drags it leftward. Only the `right` value increases (e.g., `right: 100`), `top` also updates. No `left` property is introduced.

### Use Case 3: Percentage-Based Element
A switch is at `left: "50%", top: "25%"`. The user drags it slightly. The new values remain in percentage format: `left: "55%", top: "30%"`.

### Use Case 4: Group Child Element
A group contains a child with `plan: { left: 10, top: 20 }`. The user drags the child within the group. The child's `left` and `top` update relative to the group container. The group itself doesn't move.

### Use Case 5: Element with Custom Style
An element has `plan: { left: 100, top: 50, style: { z-index: 999 } }`. After dragging, only `left` and `top` change — `style` and other properties are untouched.

---

# Open Questions

### Q1: What happens when dragging near/beyond room boundaries?
**Status**: Resolved ✅
**Options**:
- **Option A: Allow unrestricted dragging** — element can be placed anywhere, including outside room bounds (supports negative values and existing behavior)
- Option B: Clamp to room boundaries — prevent elements from going outside
- Option C: Allow with visual warning — show a subtle indicator when outside bounds

**Decision**: Option A (unrestricted) — matches current behavior where negative values and out-of-bounds positions are supported.

### Q2: Should dragging work in overview mode or only detail mode?
**Status**: Resolved ✅
**Options**:
- **Option A: Both overview and detail mode** (when editor mode is active)
- Option B: Detail mode only (overview is too zoomed out for precise positioning)

**Decision**: Option A — both modes supported. Coordinate math is the same; practical use will be mostly in detail mode.

### Q3: How should dragging interact with element scaling (`scaleRatio`)?
**Status**: Resolved ✅
**Description**: Elements can have a scaling ratio that affects their visual size. When the element is scaled, the drag offset must account for the element scale vs. the plan scale to produce correct config values.

**Decision**: The drag implementation must account for scale and scaleRatio when converting pixel deltas back to config values. The reverse calculation must use the same `horizontalPositionScale` / `verticalPositionScale` factors used in rendering.

### Q4: Touch device support?
**Status**: Resolved ✅
**Options**:
- Option A: Mouse-only for initial implementation
- **Option B: Mouse + touch (using pointer events)**

**Decision**: Option B — use pointer events (`pointerdown`, `pointermove`, `pointerup`) for mouse and touch support from the start.

### Q5: How should elements with both left+right or top+bottom defined be handled during drag?
**Status**: Resolved ✅
**Description**: If an element has both `left: 100` and `right: 50`, dragging it means both values need to shift by the same delta. Should we update both, or only the primary anchor?

**Decision**: Update both by applying the same delta — this preserves the width implied by both anchors.

---

# Design Decisions

### D1: Unrestricted Boundary Dragging
**Decision**: Elements can be dragged anywhere, including outside room boundaries.
**Rationale**: Matches existing behavior where negative values and out-of-bounds positions are already supported in config.

### D2: Both Overview and Detail Modes
**Decision**: Drag works in both overview and detail preview modes when editor mode is active.
**Rationale**: The coordinate math is identical in both modes; no reason to restrict.

### D3: Pointer Events for Cross-Device Support
**Decision**: Use pointer events (`pointerdown`, `pointermove`, `pointerup`) instead of mouse-only events.
**Rationale**: Minimal extra effort for touch support; pointer events are the modern standard.

### D4: Dual-Anchor Delta Update
**Decision**: When both `left`+`right` or `top`+`bottom` are defined, apply the same delta to both values.
**Rationale**: Preserves the implied width/height constraint defined by having both anchors.

### D5: Scale-Aware Reverse Calculation
**Decision**: Drag position conversion must use the same scaling factors (`horizontalPositionScale`, `verticalPositionScale`) as the forward rendering pipeline.
**Rationale**: Ensures pixel-perfect correspondence between where the user drops the element and the resulting config values.

---

# Technical Solution

## Overview

The drag-and-drop repositioning will be implemented by adding pointer event handlers to the existing `element-wrapper` divs in `renderElements()`. During a drag, the element's position is updated visually via inline CSS transforms. On drop, a new window-level event (`scalable-house-plan-element-moved`) carries the pixel delta to the editor, which performs the reverse position calculation and updates the config.

### Architecture Decisions
- **No new components**: Drag logic is added directly to the existing `element-wrapper` render in `renderElements()` — keeping it in the same place as the existing click handlers
- **Window-level event for config update**: Same pattern as `scalable-house-plan-element-selected` — needed because HA editor and card preview are in separate DOM contexts
- **Editor owns the config math**: The reverse calculation (pixel delta → config value) happens in the editor, not in the preview. This keeps the preview purely visual and the editor solely responsible for config mutations
- **CSS translate for drag visual**: During drag, `transform: translate(dx, dy)` is applied to the wrapper, avoiding re-rendering

### Key Principles Applied
- **DRY**: Reuses the existing element-wrapper click handler pattern, event dispatch pattern (`window.dispatchEvent`), and config update chain (`_updateRoom → _configChanged`)
- **YAGNI**: No snap-to-grid, no multi-select drag, no undo — only what's specified in requirements
- **KISS**: Pure pointer events + CSS translate during drag; reverse math done once on drop. No drag libraries.

## Codebase Analysis

### Relevant Existing Components

| Component | Location | Relevance |
|---|---|---|
| `renderElements()` | [element-renderer-shp.ts](src/components/element-renderer-shp.ts#L338-L450) | Where element wrappers are rendered — drag handlers will attach here |
| `calculatePositionStyles()` | [element-renderer-shp.ts](src/components/element-renderer-shp.ts#L220-L330) | Forward position math (config → CSS %) — reverse calculation mirrors this |
| `_handleElementClick()` | [scalable-house-plan-room.ts](src/components/scalable-house-plan-room.ts#L700-L730) | Window-level event dispatch pattern to reuse |
| `_handleElementSelection` | [scalable-house-plan-editor.ts](src/cards/scalable-house-plan-editor.ts#L315-L330) | Window event listener pattern |
| `_updateRoom()` | [scalable-house-plan-editor.ts](src/cards/scalable-house-plan-editor.ts#L363-L374) | Config update pattern — `room-update → _configChanged()` |
| `group-shp._calculateChildPosition()` | [group-shp.ts](src/elements/group-shp.ts#L234-L280) | Group children use pixel positioning (not percentage) |

### Reusable Code
1. **Window-level event pattern**: `_handleElementClick` dispatches `scalable-house-plan-element-selected` via `window.dispatchEvent()`. The drag will use the same pattern with a new event name.
2. **Config update chain**: `editor-element-shp` → `editor-elements-shp` → `editor-room-shp` → `editor-rooms-shp` → `scalable-house-plan-editor._updateRoom()` → `_configChanged()`. The drag bypass this chain — the editor directly mutates config in `_handleElementMoved()`.
3. **Position scaling logic**: The `getPositionScale()` function and scaling modes (`plan`, `element`, `fixed`) are already implemented. The reverse calculation must use the same logic.

### Key Architecture Constraints
- **Separate DOM contexts**: HA's card editor (`scalable-house-plan-editor`) and card preview (`scalable-house-plan-overview` / detail) live in separate shadow DOMs. Communication must use `window.dispatchEvent()`.
- **Immutable config updates**: Config must be updated via `this._config = { ...this._config, rooms }` pattern followed by `_configChanged()`.
- **Overview CSS transform scaling**: In overview mode, the entire room container is scaled via CSS `transform: scale(scaleX, scaleY)` on the parent. Pointer positions must be adjusted for this transform.

## Implementation Details

### Files to Modify

1. **[element-renderer-shp.ts](src/components/element-renderer-shp.ts)** — Core drag logic
   - Add `onElementDrop` callback to `ElementRendererOptions`
   - Add pointer event handlers (`pointerdown`, `pointermove`, `pointerup`) to element wrappers
   - Implement drag visual (CSS `translate`) during drag
   - Dispatch `scalable-house-plan-element-moved` window event on drop

2. **[scalable-house-plan-editor.ts](src/cards/scalable-house-plan-editor.ts)** — Config update on drop
   - Listen for `scalable-house-plan-element-moved` window event
   - Implement `_handleElementMoved()` — reverse position calculation + config update
   - Find the entity in config by roomIndex + uniqueKey
   - Update plan position values preserving units and anchors

3. **[scalable-house-plan-room.ts](src/components/scalable-house-plan-room.ts)** — Pass room context
   - Pass `roomIndex` and `roomBounds` to `renderElements()` for the drag event payload
   - Add `onElementDrop` callback to forward drag completion to editor

4. **[group-shp.ts](src/elements/group-shp.ts)** — Group child drag
   - Add pointer drag handlers to child-wrapper divs
   - On drop, dispatch `scalable-house-plan-element-moved` with `parentGroupKey` and pixel-based delta (no percentage conversion needed)

### No New Files
All changes are modifications to existing files — no new files or components needed.

### Type Definitions

Add to `ElementRendererOptions` in [element-renderer-shp.ts](src/components/element-renderer-shp.ts):

```typescript
export interface ElementRendererOptions {
    // ... existing properties ...
    onElementDrop?: (uniqueKey: string, elementIndex: number, entity: string, 
                     deltaXPx: number, deltaYPx: number, parentGroupKey?: string) => void;
}
```

Event detail type for `scalable-house-plan-element-moved`:

```typescript
interface ElementMovedEventDetail {
    uniqueKey: string;        // Element's unique key
    roomIndex: number;        // Room containing the element
    entityId: string;         // Entity ID (or empty for no-entity elements)
    deltaXPx: number;         // Pixel delta in X within the elements-container
    deltaYPx: number;         // Pixel delta in Y within the elements-container
    parentGroupKey?: string;  // If child of a group, the group's uniqueKey
    scale: number;            // Current scale factor (for reverse calculation)
    scaleRatio: number;       // Current scaleRatio
    roomBoundsWidth: number;  // Room bounds width (for reverse calculation)
    roomBoundsHeight: number; // Room bounds height (for reverse calculation)
}
```

## Data Flow

### Drag Flow (pointer events → config update)

```
1. pointerdown on element-wrapper
   ├─ Record startX, startY (pointer position)
   ├─ Record element's current position
   ├─ Set pointer capture
   └─ Mark drag state = "pending" (not yet dragging)

2. pointermove (repeated)
   ├─ Check movement threshold (5px) — if not met, ignore
   ├─ Set drag state = "dragging"
   ├─ Calculate deltaX, deltaY from start position
   ├─ Apply CSS: transform += translate(deltaX, deltaY) to wrapper  
   └─ Prevent default (block text selection, scrolling)

3. pointerup
   ├─ Release pointer capture
   ├─ If drag state = "dragging":
   │   ├─ Calculate final deltaXPx, deltaYPx
   │   ├─ Remove CSS translate (reset visual)
   │   ├─ Dispatch window event: 'scalable-house-plan-element-moved'
   │   │   with { uniqueKey, roomIndex, entityId, deltaXPx, deltaYPx,
   │   │          scale, scaleRatio, roomBoundsWidth, roomBoundsHeight,
   │   │          parentGroupKey }
   │   └─ Do NOT trigger click (drag consumed the interaction)
   └─ If drag state = "pending":
       └─ Let regular click handler fire (was just a click, not drag)

4. Editor receives 'scalable-house-plan-element-moved'
   ├─ Find entity config: rooms[roomIndex].entities[entityIndex]
   │   (using uniqueKey → entity matching, same as _findElementIndex)
   ├─ Reverse calculate new position values:
   │   For numeric (px) values:
   │     newValue = oldValue + (deltaXPx / (roomBoundsWidth * scale)) * roomBoundsWidth * scale / positionScale
   │     simplified: newValue = oldValue + deltaXPx / positionScale
   │   For percentage values:
   │     newPct = oldPct + (deltaXPx / (roomBoundsWidth * scale)) * 100
   │   For right/bottom (inverted direction):
   │     Apply negative delta (moving right increases left but decreases right)
   ├─ Create updated entity config with new plan values
   ├─ Construct updated room → updated rooms array
   └─ Call _configChanged()

5. Escape key during drag
   ├─ Reset CSS translate to (0, 0)
   ├─ Set drag state = "idle"
   └─ Release pointer capture
```

### Reverse Position Calculation

The forward calculation is:
```
percentage = (configValue * positionScale) / (roomDimension * scale) * 100
```

The reverse needs: given a pixel delta in the container, what's the config value delta?

The container size is `roomDimension * scale` pixels. So:

```typescript
// For numeric (px) config values:
// Forward: percentage = (value * positionScale) / (roomDim * scale) * 100
// The element moved deltaXPx in a container of (roomDim * scale) pixels.
// That corresponds to: deltaConfigValue = deltaXPx / positionScale
// Because: the element at (value * positionScale) pixels moved by deltaXPx pixels
//          new position = (value * positionScale + deltaXPx) pixels
//          newValue * positionScale = value * positionScale + deltaXPx
//          newValue = value + deltaXPx / positionScale

configDelta = deltaXPx / positionScale;
newValue = Math.round(oldValue + configDelta);  // Round to integer px

// For percentage config values:
// Forward: cssPercentage = configPercentage (passed directly)
// Container is (roomDim * scale) pixels, so:
// deltaPercent = (deltaXPx / containerSizePx) * 100
newPct = oldPct + (deltaXPx / containerSizePx) * 100;
newValue = `${Math.round(newPct * 10) / 10}%`;  // Round to 1 decimal

// For right/bottom: negate the delta
// Moving element right by +50px means right value decreases by that amount
configDelta = -deltaXPx / positionScale;  // (for right)
configDelta = -deltaYPx / positionScale;  // (for bottom)
```

### Position Scale Calculation (reused from existing code)

```typescript
function getPositionScale(mode: PositionScalingMode, scale: number, scaleRatio: number): number {
    if (scaleRatio === 0) return scale;
    switch (mode) {
        case "element": return 1 + (scale - 1) * scaleRatio;
        case "fixed": return 1;
        case "plan":
        default: return scale;
    }
}
```

### Group Child Drag (pixel-based — simpler)

Group children use raw pixel positioning (`left: 50px`, not percentages). The reverse calculation is trivial:

```typescript
// Group child: position is in raw pixels, no scaling
// The group container is NOT scaled — element scale is 1
newLeft = oldLeft + deltaXPx;
newRight = oldRight - deltaXPx;  // Inverted for right
newTop = oldTop + deltaYPx;
newBottom = oldBottom - deltaYPx; // Inverted for bottom
```

## Key Algorithms

### Algorithm: Drag Handler on Element Wrapper

```typescript
// State variables (per-drag, stored in closure or on wrapper dataset)
let dragState: 'idle' | 'pending' | 'dragging' = 'idle';
let startX = 0, startY = 0;
const DRAG_THRESHOLD = 5; // px

// pointerdown handler
function handlePointerDown(e: PointerEvent) {
    if (!editorMode || !plan) return;  // Only in editor mode, only elements with plan
    startX = e.clientX;
    startY = e.clientY;
    dragState = 'pending';
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    // Don't prevent default yet — allow click to fire if threshold not met
}

// pointermove handler  
function handlePointerMove(e: PointerEvent) {
    if (dragState === 'idle') return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    if (dragState === 'pending') {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        dragState = 'dragging';
    }
    
    // Account for CSS parent scaling (overview mode has scaleX/scaleY transform)
    const wrapper = e.currentTarget as HTMLElement;
    const adjustedDx = dx / parentScaleX;  // Will need to resolve parent scale
    const adjustedDy = dy / parentScaleY;
    
    wrapper.style.transform = `${originalTransform} translate(${adjustedDx}px, ${adjustedDy}px)`;
    e.preventDefault();
}

// pointerup handler
function handlePointerUp(e: PointerEvent) {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    
    if (dragState === 'dragging') {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        // Reset visual transform
        const wrapper = e.currentTarget as HTMLElement;
        wrapper.style.transform = originalTransform;
        
        // Adjust for parent CSS scaling
        const adjustedDx = dx / parentScaleX;
        const adjustedDy = dy / parentScaleY;
        
        // Dispatch move event
        window.dispatchEvent(new CustomEvent('scalable-house-plan-element-moved', {
            detail: { uniqueKey, roomIndex, entityId, 
                      deltaXPx: adjustedDx, deltaYPx: adjustedDy,
                      scale, scaleRatio, roomBoundsWidth, roomBoundsHeight,
                      parentGroupKey }
        }));
        
        // Prevent the click handler from firing
        e.stopPropagation();
        e.preventDefault();
    }
    
    dragState = 'idle';
}

// keydown handler (escape to cancel)
function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && dragState === 'dragging') {
        const wrapper = ...;
        wrapper.style.transform = originalTransform;
        wrapper.releasePointerCapture(...);
        dragState = 'idle';
    }
}
```

### Algorithm: Reverse Position Calculation (in editor)

```typescript
function calculateNewPosition(
    plan: PlanConfig,
    deltaXPx: number, 
    deltaYPx: number,
    scale: number,
    scaleRatio: number,
    roomBoundsWidth: number,
    roomBoundsHeight: number
): Partial<PlanConfig> {
    const updated: Partial<PlanConfig> = {};
    
    const hScale = getPositionScale(
        plan.position_scaling_horizontal || 'plan', scale, scaleRatio);
    const vScale = getPositionScale(
        plan.position_scaling_vertical || 'plan', scale, scaleRatio);
    
    const containerW = roomBoundsWidth * scale;
    const containerH = roomBoundsHeight * scale;
    
    // Horizontal: left and/or right
    if (plan.left !== undefined) {
        if (typeof plan.left === 'string' && plan.left.includes('%')) {
            const oldPct = parseFloat(plan.left);
            const newPct = oldPct + (deltaXPx / containerW) * 100;
            updated.left = `${Math.round(newPct * 10) / 10}%`;
        } else if (typeof plan.left === 'number') {
            updated.left = Math.round(plan.left + deltaXPx / hScale);
        }
    }
    if (plan.right !== undefined) {
        if (typeof plan.right === 'string' && plan.right.includes('%')) {
            const oldPct = parseFloat(plan.right);
            const newPct = oldPct - (deltaXPx / containerW) * 100;  // Inverted
            updated.right = `${Math.round(newPct * 10) / 10}%`;
        } else if (typeof plan.right === 'number') {
            updated.right = Math.round(plan.right - deltaXPx / hScale);  // Inverted
        }
    }
    
    // Vertical: top and/or bottom
    if (plan.top !== undefined) {
        if (typeof plan.top === 'string' && plan.top.includes('%')) {
            const oldPct = parseFloat(plan.top);
            const newPct = oldPct + (deltaYPx / containerH) * 100;
            updated.top = `${Math.round(newPct * 10) / 10}%`;
        } else if (typeof plan.top === 'number') {
            updated.top = Math.round(plan.top + deltaYPx / vScale);
        }
    }
    if (plan.bottom !== undefined) {
        if (typeof plan.bottom === 'string' && plan.bottom.includes('%')) {
            const oldPct = parseFloat(plan.bottom);
            const newPct = oldPct - (deltaYPx / containerH) * 100;  // Inverted
            updated.bottom = `${Math.round(newPct * 10) / 10}%`;
        } else if (typeof plan.bottom === 'number') {
            updated.bottom = Math.round(plan.bottom - deltaYPx / vScale);  // Inverted
        }
    }
    
    return updated;
}
```

## Code Reuse Strategy

| What | Reused From | How |
|---|---|---|
| Window event dispatch | `_handleElementClick()` | Same `window.dispatchEvent(new CustomEvent(...))` pattern |
| Window event listener | `_handleElementSelection` | Add `_handleElementMoved` using same `window.addEventListener` in `connectedCallback` |
| Config update | `_updateRoom()` | Directly mutate room entity and call `_configChanged()` |
| Position scale logic | `calculatePositionStyles()` / `getPositionScale()` | Extract `getPositionScale()` as exported utility or inline the same logic in the editor's reverse calc |
| Entity lookup by key | `editor-elements-shp._findElementIndex()` | Use similar logic to find entity by uniqueKey in rooms array |

## Performance Considerations

- **No re-rendering during drag**: CSS `translate()` is applied directly to the wrapper element's `style.transform` — no Lit re-render cycle is triggered. This ensures 60fps drag performance.
- **Single event on drop**: The `scalable-house-plan-element-moved` event fires once on pointerup, not on every pointermove. Config update and re-render happen only once.
- **Position cache invalidation**: After config update, the position cache will naturally recompute on next render since the plan values change (cache key includes position values).

## Error Handling

- **No plan config**: Elements without a `plan` section (string-only entities) don't get drag handlers — they can't be repositioned since they have no position to update.
- **Unknown element**: If `uniqueKey` can't be matched to an entity in config, the move event is silently ignored (log warning).
- **Zero scale**: If `positionScale` is 0, skip the update (division by zero guard).

## Implementation Plan

### Phase 1: Core Drag in element-renderer-shp (~60 lines)
**Goal**: Elements can be visually dragged in the preview

1. ✅ **Add pointer event handlers to element-wrapper in `renderElements()`**
   - Add `pointerdown`, `pointermove`, `pointerup` handlers
   - Implement drag threshold (5px)
   - Apply CSS `translate()` during drag
   - Change cursor to `grabbing` during drag
   - Handle Escape key to cancel

2. ✅ **Dispatch `scalable-house-plan-element-moved` window event on drop**
   - Include all data needed for reverse calculation
   - Prevent click handler from firing after drag

**Validation**: Elements visually move when dragged (but config doesn't update yet)

**Status**: ✅ **COMPLETE** (Commit 02ca772)

### Phase 2: Config update in editor (~80 lines)
**Goal**: Dropping an element updates the configuration

1. ✅ **Add `_handleElementMoved` listener in `scalable-house-plan-editor.ts`**
   - Listen for `scalable-house-plan-element-moved` on window (same as element-selected)
   - Implement reverse position calculation
   - Find entity in config by roomIndex + uniqueKey
   - Update plan values preserving units and anchors
   - Call `_configChanged()`

2. ✅ **Handle all position unit types**
   - Numeric (unitless px): `left: 100` → `left: 150`
   - Percentage string: `left: "50%"` → `left: "55%"`
   - Right/bottom inversion: negate delta
   - Dual-anchor update: apply delta to both `left` and `right`

**Validation**: Dropping an element updates the YAML in the editor panel. Element renders at new position.

**Status**: ✅ **COMPLETE** (2026-02-07)

**Implementation Summary**:
- Added `_handleElementMoved` listener in `scalable-house-plan-editor.ts`
- Implemented reverse position calculation for all unit types (px, %, right/bottom anchors)
- Fixed group position persistence by adding `_findEntityIndex()` helper that matches no-entity elements by generated key
- Fixed YAML editor reactivity by switching from `.defaultValue` to `.value` with `auto-update` in all editor components
- Successfully handles both regular entities and groups (including nested group children via `parentGroupKey`)

### Phase 3: Group child drag support (~30 lines) - READY FOR IMPLEMENTATION
**Goal**: Children inside groups can be dragged independently to reposition them within the group

**Prerequisites**: Phase 2 complete ✅ (editor already handles `parentGroupKey` and group child updates)

**What needs to be done**:

1. ✅ **Backend support already complete** - Phase 2 implemented group child handling:
   - Editor finds parent group by `parentGroupKey`
   - Locates child in `plan.element.children[]` array
   - Updates child's position values
   
2. ❌ **Add drag handlers to child-wrapper in `group-shp.ts`** (~30 lines)
   - Same pointer event pattern as room-level elements (see `element-renderer-shp.ts` lines 490-625)
   - Apply to `.child-wrapper` divs during rendering (around line 220)
   - Dispatch `scalable-house-plan-element-moved` with `parentGroupKey: this.groupUniqueKey`
   - Children use pixel-based positioning (no percentage math needed)
   - Threshold, escape key, pointer capture - same as room elements

**Key Differences from Room Elements**:
- Add `parentGroupKey` to event detail
- No percentage calculations (groups use absolute px positioning for children)
- Simpler reverse math (just `newValue = oldValue + delta` for all cases)

**Files to modify**:
- `src/elements/group-shp.ts` - add drag handlers to child-wrapper rendering

**Validation**: Group children can be dragged independently within their group; group container stays in place. Child positions update in config.

### Phase 4: Overview mode scaling adjustment (~10 lines)
**Goal**: Drag works correctly in overview mode despite parent CSS transform

1. ❌ **Account for parent CSS scaling in pointermove/pointerup**
   - In overview, the container has `transform: scale(scaleX, scaleY)` applied by parent
   - Pointer deltas (clientX/clientY based) must be divided by the parent's CSS scale to get actual element-container-relative deltas
   - Detect if in overview mode and get the parent scale factors

**Validation**: Dragging in overview mode positions elements correctly.

---

# Implementation Quick Start

## Start Here

Implement the 4 phases in order. Each phase builds on the previous one. **Do NOT commit after each phase.** Instead, provide testing instructions after each phase so the user can test manually. Only commit once the user has tested and explicitly approved.

## Workflow Per Phase

1. Implement the phase changes
2. Run `npm run build-dev` to verify compilation
3. Provide clear testing instructions (what to do, what to expect)
4. Wait for user to test and approve
5. Only then commit with appropriate semantic commit message
6. Move to next phase

## Phase Order & Key Files

| Phase | File | What to do |
|---|---|---|
| 1 | `src/components/element-renderer-shp.ts` | Add `pointerdown`/`pointermove`/`pointerup` handlers to `element-wrapper` div in `renderElements()`. Use CSS `translate()` during drag. Dispatch `scalable-house-plan-element-moved` window event on drop. |
| 2 | `src/cards/scalable-house-plan-editor.ts` | Add `_handleElementMoved` listener (same pattern as `_handleElementSelection`). Implement reverse position calculation. Find entity by roomIndex+uniqueKey, update plan values preserving units/anchors, call `_configChanged()`. |
| 3 | `src/elements/group-shp.ts` | Same drag pattern on `child-wrapper` divs. Pixel-based delta (simpler — no percentage math). Include `parentGroupKey` in event. Handle group child lookup in editor. |
| 4 | `src/components/element-renderer-shp.ts` | Adjust pointer deltas for parent CSS `transform: scale()` in overview mode. Divide `dx`/`dy` by parent scale factors. |

## Critical References

- **Forward position math**: `calculatePositionStyles()` in `element-renderer-shp.ts` lines 220-330
- **Reverse formula**: `newValue = oldValue + deltaXPx / positionScale` (numeric), `newPct = oldPct + (deltaXPx / containerSizePx) * 100` (%), negate for right/bottom
- **Config update chain**: Direct mutation in editor via `_updateRoom` pattern → `_configChanged()`
- **Window event pattern**: Same as `scalable-house-plan-element-selected` in `_handleElementClick()`
- **Event detail**: `{ uniqueKey, roomIndex, entityId, deltaXPx, deltaYPx, scale, scaleRatio, roomBoundsWidth, roomBoundsHeight, parentGroupKey? }`

---
