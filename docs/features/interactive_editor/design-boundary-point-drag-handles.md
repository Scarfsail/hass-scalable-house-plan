# Design: Interactive Room Boundary Point Drag Handles

## Overview

Add draggable handles at each vertex of a room's boundary polygon. In editor mode (detail view), each boundary point displays a small rectangular handle that can be dragged to reposition the vertex. Holding CTRL during drag copies the point to a new position instead of moving it, inserting a new vertex into the polygon.

## Current Architecture

### Room Boundary Data Model
```typescript
// src/cards/types.ts
interface Room {
    boundary: [number, number][];  // Absolute pixel coordinates on floor plan
    // ...
}
```

### Where Polygons Are Rendered
- **`scalable-house-plan-room.ts`** renders SVG `<polygon>` elements
- Detail mode coordinate transform: `screenXY = (configXY - roomBounds.minXY) * scale`
- Polygons already have editor-mode click handlers (`_handleRoomBackgroundClick`)

### Existing Drag System
- **`DragController`** handles element drag-and-drop with threshold detection, scale compensation, and escape support
- **`scalable-house-plan-editor.ts`** listens for `scalable-house-plan-element-moved` window events and updates config
- Raw screen-space deltas are dispatched; the editor converts to config coordinates

---

## Design

### 1. New Component: `BoundaryHandles`

**File:** `src/components/boundary-handles-shp.ts`

A standalone LitElement that renders drag handles as an SVG overlay. Keeping this separate from `scalable-house-plan-room.ts` avoids bloating the room component and follows the existing separation pattern (room renders, element-renderer handles interactivity).

```typescript
@customElement("boundary-handles-shp")
export class BoundaryHandles extends LitElement {
    @property({ attribute: false }) boundary!: [number, number][];
    @property({ type: Number }) roomIndex!: number;
    @property({ type: Number }) scale!: number;
    @property({ attribute: false }) roomBounds!: RoomBounds;
    @property({ type: Boolean }) editorMode = false;
}
```

### 2. Handle Rendering (SVG)

Render within the room's detail mode container, as an absolutely positioned SVG overlay that matches the polygon coordinate space:

```
room-container (div, relative)
  ├── room-svg (svg, polygon + gradients)       ← existing
  ├── boundary-handles-shp (svg overlay)         ← NEW
  └── elements-container (div, entity cards)     ← existing
```

Each handle is an SVG `<rect>` centered on the vertex:

```svg
<rect
    x="${screenX - HANDLE_SIZE/2}"
    y="${screenY - HANDLE_SIZE/2}"
    width="${HANDLE_SIZE}"
    height="${HANDLE_SIZE}"
    class="boundary-handle"
    @pointerdown=${(e) => this._onHandlePointerDown(e, pointIndex)}
/>
```

**Visual design:**
- Size: 10x10px rectangles (constant, not affected by zoom)
- Default: white fill, 2px blue border (`#2196F3`)
- Hover: blue fill, white border
- Dragging: orange fill
- CTRL held during drag: green fill (visual feedback for "copy" mode)

**Edge midpoint handles (stretch goal):** Optionally render smaller diamond handles at edge midpoints to allow inserting new points by dragging from an edge. This is a nice-to-have for v2.

### 3. Drag Handling (Inline, No DragController Reuse)

The existing `DragController` is tailored for HTML element transforms with complex scale compensation and group element support. Boundary point dragging is simpler (pure SVG coordinate math), so inline pointer event handling is cleaner:

```typescript
// State
private _dragState: {
    pointIndex: number;
    startClientX: number;
    startClientY: number;
    originalPoint: [number, number];  // Config coordinates
    isCtrlHeld: boolean;
    pointerId: number;
} | null = null;

_onHandlePointerDown(e: PointerEvent, pointIndex: number) {
    if (e.button !== 0) return;
    e.stopPropagation();  // Prevent room background click

    this._dragState = {
        pointIndex,
        startClientX: e.clientX,
        startClientY: e.clientY,
        originalPoint: [...this.boundary[pointIndex]],
        isCtrlHeld: e.ctrlKey,
        pointerId: e.pointerId,
    };

    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
}

_onHandlePointerMove(e: PointerEvent) {
    if (!this._dragState || this._dragState.pointerId !== e.pointerId) return;

    // Update CTRL state live (user can press/release during drag)
    this._dragState.isCtrlHeld = e.ctrlKey;

    // Screen-space delta
    const dxScreen = e.clientX - this._dragState.startClientX;
    const dyScreen = e.clientY - this._dragState.startClientY;

    // Compensate for parent CSS scale (same walk-up logic as DragController)
    const { dx, dy } = this._compensateParentScale(dxScreen, dyScreen, e.currentTarget);

    // Convert to config-space delta
    const dxConfig = dx / this.scale;
    const dyConfig = dy / this.scale;

    // Visually move the handle (and optionally a preview line)
    this._dragPreview = {
        pointIndex: this._dragState.pointIndex,
        screenX: this._toScreenX(this._dragState.originalPoint[0]) + dx,
        screenY: this._toScreenY(this._dragState.originalPoint[1]) + dy,
        isCopy: this._dragState.isCtrlHeld,
    };
    this.requestUpdate();
}

_onHandlePointerUp(e: PointerEvent) {
    if (!this._dragState || this._dragState.pointerId !== e.pointerId) return;

    const dxScreen = e.clientX - this._dragState.startClientX;
    const dyScreen = e.clientY - this._dragState.startClientY;
    const { dx, dy } = this._compensateParentScale(dxScreen, dyScreen, e.currentTarget);

    // Apply threshold - ignore tiny movements (< 3px)
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) {
        this._dragState = null;
        this._dragPreview = null;
        this.requestUpdate();
        return;
    }

    const dxConfig = dx / this.scale;
    const dyConfig = dy / this.scale;
    const newX = Math.round(this._dragState.originalPoint[0] + dxConfig);
    const newY = Math.round(this._dragState.originalPoint[1] + dyConfig);

    // Dispatch event
    window.dispatchEvent(new CustomEvent('scalable-house-plan-boundary-point-changed', {
        detail: {
            roomIndex: this.roomIndex,
            pointIndex: this._dragState.pointIndex,
            newPoint: [newX, newY] as [number, number],
            mode: this._dragState.isCtrlHeld ? 'copy' : 'move',
        }
    }));

    this._dragState = null;
    this._dragPreview = null;
    this.requestUpdate();
}
```

### 4. Coordinate Math

**Config to screen (for rendering handles):**
```typescript
screenX = (configX - roomBounds.minX) * scale
screenY = (configY - roomBounds.minY) * scale
```

**Screen delta to config delta (for updating config):**
```typescript
dxConfig = dxScreen / scale
dyConfig = dyScreen / scale
```

**New config coordinate:**
```typescript
newConfigX = originalConfigX + dxConfig
newConfigY = originalConfigY + dyConfig
```

### 5. Visual Feedback During Drag

During drag, render:
1. **The handle at its new position** (moved visually)
2. **A ghost polygon** showing the would-be boundary shape with the point in its new position (dashed stroke, semi-transparent)
3. **For CTRL (copy) mode**: show the original handle still in place (faded) + the new handle at the drag position, plus a ghost polygon with the extra point inserted

```svg
<!-- Ghost polygon preview -->
<polygon
    points="${previewPoints}"
    fill="none"
    stroke="#2196F3"
    stroke-width="1.5"
    stroke-dasharray="4,4"
    opacity="0.6"
/>
```

### 6. Config Update in Editor

**File:** `scalable-house-plan-editor.ts`

Add a new event listener alongside `_handleElementMoved`:

```typescript
// In connectedCallback / constructor
window.addEventListener(
    'scalable-house-plan-boundary-point-changed',
    this._handleBoundaryPointChanged
);

private _handleBoundaryPointChanged = (ev: CustomEvent): void => {
    const { roomIndex, pointIndex, newPoint, mode } = ev.detail;

    const rooms = [...(this._config.rooms || [])];
    if (roomIndex < 0 || roomIndex >= rooms.length) return;

    const room = { ...rooms[roomIndex] };
    const boundary = [...room.boundary];

    if (mode === 'move') {
        // Replace existing point
        boundary[pointIndex] = newPoint;
    } else if (mode === 'copy') {
        // Insert new point AFTER the dragged point
        boundary.splice(pointIndex + 1, 0, newPoint);
    }

    room.boundary = boundary;
    rooms[roomIndex] = room;
    this._config = { ...this._config, rooms };
    this._configChanged();
};
```

### 7. Escape Key Support

On `Escape` key during drag:
- Cancel the drag
- Restore handle to original position
- Do not dispatch any event

```typescript
private _handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this._dragState) {
        // Release pointer capture
        // Reset _dragState and _dragPreview
        // requestUpdate()
    }
};
```

### 8. Integration in Room Component

**File:** `scalable-house-plan-room.ts` (`_renderDetail()`)

Add the boundary handles component between the SVG and the elements container:

```typescript
private _renderDetail(): TemplateResult {
    // ... existing code ...

    return html`
        <div class="room-container" style="width: ${scaledWidth}px; height: ${scaledHeight}px;">
            ${svg`...existing polygon SVG...`}

            ${this.editorMode ? html`
                <boundary-handles-shp
                    .boundary=${this.room.boundary}
                    .roomIndex=${this.roomIndex}
                    .scale=${scale}
                    .roomBounds=${roomBounds}
                    .editorMode=${this.editorMode}
                ></boundary-handles-shp>
            ` : ''}

            <div class="elements-container" ...>
                ${elements}
            </div>
        </div>
    `;
}
```

### 9. Point Deletion

Since we're adding the ability to create new points via CTRL+drag, we should also support deleting points. A right-click context menu or a delete key when a handle is selected would work, but to keep scope minimal:

- **Click a handle** to select it (highlight)
- **Press Delete/Backspace** to remove the selected point
- Minimum 3 points enforced (can't delete if only 3 remain)

This reuses the keyboard handling infrastructure already in place.

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/components/boundary-handles-shp.ts` | **NEW** - Boundary handles component |
| `src/components/scalable-house-plan-room.ts` | Add `<boundary-handles-shp>` to detail render |
| `src/cards/scalable-house-plan-editor.ts` | Add `_handleBoundaryPointChanged` event handler |

---

## Edge Cases

1. **Minimum points**: Prevent boundary from having fewer than 3 points (not a polygon otherwise)
2. **Overlapping points**: Allow it (user's choice), but could show a warning
3. **Point order**: Maintain winding order; copy inserts after the source point to preserve polygon shape
4. **CTRL key timing**: Track `ctrlKey` on every pointermove, not just pointerdown. User can press/release CTRL during drag to switch between move/copy modes
5. **Scale compensation**: Must compensate for parent CSS scale (overview zoom) using the same DOM walk-up as DragController
6. **Re-render during drag**: If config updates trigger a re-render while dragging, the component must preserve drag state. Using pointer capture ensures events continue to fire
7. **Room bounds shift**: When a boundary point moves, roomBounds (minX/minY/width/height) change. The editor's `_configChanged()` triggers a full re-render which recalculates bounds. This is correct behavior - the room visually adjusts

## Non-Goals (Future Enhancements)

- Edge midpoint handles for inserting points between existing vertices
- Multi-point selection and batch move
- Snap-to-grid or alignment guides
- Undo/redo support (would need broader architecture)
- Boundary editing in overview mode (only detail mode for now)
