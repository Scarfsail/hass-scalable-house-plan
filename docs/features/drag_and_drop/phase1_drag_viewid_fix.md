# Phase 1 Drag-Drop: ViewId Fix Documentation

**Status**: ✅ Position Bug Fixed | ⚠️ Performance Issue Remains  
**Date**: 2026-02-09  
**Issue**: Elements landing at wrong positions after drag-drop due to scale interference between views  

---

## Problem Summary

### Original Issue
When dragging elements in the detail dialog editor, they would appear correct during drag but land at wrong positions on release. Investigation revealed that the main card overview and detail dialog both render the same room simultaneously, and they were sharing the same global DragController instances, causing scale interference.

### Scale Values Context
- **Main Card Overview**: scale ≈ 0.3426 (all rooms visible)
- **Detail Dialog Overview**: scale ≈ 1.3117 (single room zoomed - when NOT in room detail mode)
- **Detail Dialog Editor**: scale ≈ 2.7738 (single room enlarged for editing)

### Architecture Discovery
The application has a dual-view architecture:
1. **Main Card**: Shows overview of ALL rooms (including the one opened in detail)
2. **Detail Dialog**: Shows ONE room enlarged in a modal dialog

**Critical Insight**: When detail dialog is open, the SAME room renders in BOTH views simultaneously, both calling `renderElements()` with `editorMode=true`.

---

## Root Cause Analysis

### Initial Approach (Failed)
**Attempt**: Used `viewContext = editorMode ? 'editor' : 'overview'` to separate controllers  
**Why It Failed**: Both main card and detail dialog use `editorMode=true` when editor is enabled, making viewContext identical for both views

### Successful Solution
**Implementation**: Added `viewId` parameter to distinguish between card instances
- Main Card: `viewId='main-card'`
- Detail Dialog: `viewId='detail-dialog'`
- Controller Keys: `${uniqueKey}-${viewId}` instead of `${uniqueKey}-${viewContext}`

**Result**: ✅ Drag-drop position bug FIXED - elements now land at correct positions

---

## Implementation Details

### Files Modified

<details>
<summary>src/components/element-renderer-shp.ts</summary>

**Changes**:
1. Added `viewId?: string` to `ElementRendererOptions` interface (line 63)
   - Comment: "Unique identifier for the rendering view (e.g., 'main-card', 'detail-dialog'). Used to separate controller instances."
   
2. Modified `renderElements()` function signature (line 345)
   - Added `viewId = 'default'` with default value
   
3. Controller key generation (line 453)
   - Changed from: `${uniqueKey}-${viewContext}`
   - Changed to: `${uniqueKey}-${viewId}`
   - Updated console log to show `viewId` instead of `viewContext`

4. Controller cleanup logic (line 524)
   - Updated to use `viewId` in key construction
   - Still DISABLED (commented out) to prevent render loop
</details>

<details>
<summary>src/components/scalable-house-plan-room.ts</summary>

**Changes**:
1. Added `viewId` property (line 64)
   ```typescript
   @property({ type: String }) public viewId?: string;
   ```
   
2. Passed `viewId` to `renderElements()` in overview mode (line 458)
   ```typescript
   viewId: this.viewId || 'default',
   ```
   
3. Passed `viewId` to `renderElements()` in detail mode (line 584)
   ```typescript
   viewId: this.viewId || 'default',
   ```
</details>

<details>
<summary>src/cards/scalable-house-plan-overview.ts</summary>

**Changes**:
1. Set `viewId` on room component (line 120)
   ```typescript
   .viewId=${'main-card'}
   ```
</details>

<details>
<summary>src/cards/scalable-house-plan-detail.ts</summary>

**Changes**:
1. Set `viewId` on room component (line 224)
   ```typescript
   .viewId=${'detail-dialog'}
   ```
</details>

---

## Current State Analysis

### ✅ What Works
- **Drag-Drop Positioning**: Elements land at correct positions after drag
- **Transform Preservation**: Elements maintain visual size during drag (dragStartTransform immutable)
- **Controller Isolation**: Main card and detail dialog have separate controller instances
- **Scale Synchronization**: `updateOptions()` keeps scale/roomBounds in sync on every render

### ⚠️ Performance Issue: Excessive Logging

**Symptom**: Console flooded with `[CONTROLLER-UPDATE]` logs even when idle

**Example Log Pattern**:
```
[CONTROLLER-UPDATE] key=sensor.solax_battery_capacity instanceId=17 state=idle 
  oldScale=1.311764705882353 newScale=0.3426470588235294 oldRatio=0 newRatio=0
```

**Analysis**:
1. **ALL controllers** log scale updates constantly
2. Scales flip-flop between two values (1.3117 ↔ 0.3426)
3. All controllers are `state=idle` (not actively dragging)
4. Happens even when user does nothing

### Root Cause: Unconditional updateOptions() Calls

**Location**: `element-renderer-shp.ts` lines 488-499

```typescript
// CRITICAL: Update controller options on every render to keep scale/roomBounds in sync
if (controller) {
    controller.updateOptions({
        roomIndex,
        entityId: entity,
        scale,
        scaleRatio,
        roomBoundsWidth: roomBounds.width,
        roomBoundsHeight: roomBounds.height,
        isGroupElement: isGroupElementType(elementConfig),
        originalTransform: positionData.transform
    });
}
```

**Problem**: 
- Called on **EVERY render** for **EVERY controller**
- No change detection - updates even when values unchanged
- Both views re-render frequently, each triggering updateOptions() for all their controllers
- Results in constant logging and unnecessary work

**Debug Code**: `drag-controller.ts` lines 63-73 log every update
```typescript
if (this.scale !== options.scale || this.scaleRatio !== options.scaleRatio) {
    console.log(`[CONTROLLER-UPDATE] key=${this.elementKey} instanceId=${this.instanceId} state=${this.state} oldScale=${this.scale} newScale=${options.scale} oldRatio=${this.scaleRatio} newRatio=${options.scaleRatio}`);
}
```

---

## Disabled Features

### Controller Cleanup (STILL DISABLED)
**Location**: `element-renderer-shp.ts` lines 524-540  
**Status**: Commented out with `/* ... */`  
**Reason**: Originally disabled to prevent infinite render loop during debugging

**Code**:
```typescript
// TEMPORARILY DISABLED TO DEBUG RENDER LOOP
/*
const controllersToRemove: string[] = [];
dragControllers.forEach((controller, controllerKey) => {
    // Only clean up controllers belonging to THIS room AND viewId
    if (dragControllerRoomIndex.get(controllerKey) === roomIndex && 
        !currentControllerKeys.has(controllerKey) && 
        controller.getState() === 'idle') {
        console.log(`[CONTROLLER-CLEANUP] Removing controllerKey=${controllerKey} state=${controller.getState()}`);
        controller.detach();
        controllersToRemove.push(controllerKey);
    }
});
controllersToRemove.forEach(controllerKey => {
    dragControllers.delete(controllerKey);
    dragControllerRoomIndex.delete(controllerKey);
});
*/
```

**Impact**: Controllers accumulate in memory and never get cleaned up when elements move (position changes → uniqueKey changes)

---

## Technical Context

### Controller Lifecycle
1. **Creation**: `renderElements()` creates controller if not exists (lines 444-473)
2. **Update**: `updateOptions()` called on every render (lines 488-499)
3. **Usage**: User drags element → controller manages drag state
4. **Cleanup**: DISABLED - should remove controllers for old uniqueKeys

### Global State Structure
```typescript
// Module-level Maps (shared across all card instances)
const dragControllers: Map<string, DragController> = new Map();
const dragControllerRoomIndex: Map<string, number> = new Map();
const currentKeysPerRoom: Map<number, Set<string>> = new Map();
```

### Controller Key Format
**Before viewId**: `${uniqueKey}-${viewContext}`
- Example: `sensor.battery-main-card`

**After viewId**: `${uniqueKey}-${viewId}`
- Main card: `sensor.battery-main-card`
- Detail dialog: `sensor.battery-detail-dialog`

### DragController Class
**Location**: `src/utils/drag-controller.ts`

**Key Features**:
- `state`: 'idle' | 'dragging' (tracks drag state)
- `dragStartTransform`: Captured at pointerdown, immutable during drag
- `updateOptions()`: Only updates `originalTransform` when `state='idle'` (line 73)
- Debug logging: Extensive console.log statements for debugging

---

## Next Steps: Performance & Cleanup

### Priority 1: Stop Unnecessary Updates
**Issue**: `updateOptions()` called on every render even when unchanged  
**Solution Options**:

1. **Change Detection**: Only call updateOptions() if values actually changed
   ```typescript
   const needsUpdate = (
       controller.scale !== scale ||
       controller.scaleRatio !== scaleRatio ||
       // ... other checks
   );
   if (needsUpdate) {
       controller.updateOptions({ ... });
   }
   ```

2. **Cache Scale Per View**: Store last scale per viewId, only update on change
   ```typescript
   const lastScalesPerView: Map<string, number> = new Map();
   const lastScale = lastScalesPerView.get(viewId);
   if (lastScale !== scale) {
       controller.updateOptions({ ... });
       lastScalesPerView.set(viewId, scale);
   }
   ```

3. **Debounce Updates**: Limit update frequency using requestAnimationFrame or debounce

### Priority 2: Re-enable Controller Cleanup
**Issue**: Controllers accumulate in memory, never cleaned up  
**Risk**: Must not cause infinite render loop  
**Test**: Uncomment lines 524-540, test drag-drop with position changes

### Priority 3: Remove Debug Logging
**Issue**: Console flooded with logs, impacts performance  
**Locations**:
- `drag-controller.ts`: Lines 63-73 (updateOptions logging)
- `element-renderer-shp.ts`: Line 454 (controller creation logging)
- Multiple `[DRAG-DOWN]`, `[DRAG-UP]`, `[EDITOR-MOVE]` logs throughout

**Strategy**: Keep error logging, remove debug console.logs or add debug flag

### Priority 4: Optimize Non-Edit Mode
**Goal**: Ensure drag controller logic doesn't impact performance when `editorMode=false`  
**Current State**: Controllers only created when `isDraggable = editorMode && plan` (line 440)  
**Verify**: No controller creation or updates when editorMode=false

### Priority 5: Code Clarity & Maintainability
**Issues**:
1. Complex controller key logic scattered across files
2. Global Maps with unclear lifecycle
3. viewContext vs viewId confusion (old code comments remain)
4. Extensive inline comments (both helpful and outdated)

**Refactoring Ideas**:
1. Extract controller management to dedicated class/module
2. Document controller lifecycle clearly
3. Remove obsolete comments mentioning viewContext
4. Consider dependency injection instead of global Maps

---

## Testing Checklist

### Functional Tests
- [ ] Drag element in detail dialog → lands at correct position
- [ ] Drag element in main card (if editor enabled) → correct position
- [ ] Element maintains visual size during drag (no shrinking)
- [ ] ESC key cancels drag and restores position
- [ ] Multiple elements can be dragged in sequence
- [ ] Groups can be dragged (group drag working per bug_group_drag.md)

### Performance Tests
- [ ] No console flood when idle (target: <10 logs/second idle)
- [ ] Smooth 60fps drag performance
- [ ] No memory leaks (controllers cleaned up after element moves)
- [ ] Non-edit mode unaffected (no controller overhead)

### Edge Cases
- [ ] Switch between main card and detail dialog during drag
- [ ] Close detail dialog during drag
- [ ] Change element position in config → controller cleanup works
- [ ] Multiple rooms with editor enabled simultaneously

---

## Known Issues & Limitations

### Issue 1: Render Loop Risk
**Description**: Synchronous re-renders during drag can cause infinite loops  
**Mitigation**: Controller cleanup only targets `state='idle'` controllers  
**Status**: Cleanup disabled until render loop thoroughly debugged

### Issue 2: Position Key in uniqueKey
**Description**: uniqueKey includes position values, causing key changes when element moves  
**Impact**: Old controller not reused after drag, new one created  
**Consequence**: Cleanup logic essential to prevent controller accumulation  
**Context**: Documented in repository memory as "drag-drop caching" fact

### Issue 3: Scale Precision
**Description**: Scale values have many decimal places (1.311764705882353)  
**Impact**: Float comparison in updateOptions() may have precision issues  
**Mitigation**: Consider epsilon comparison or rounding

---

## Code References

### Key Files
1. `src/utils/drag-controller.ts` - DragController class
2. `src/components/element-renderer-shp.ts` - Controller lifecycle management
3. `src/cards/scalable-house-plan-editor.ts` - Element move event handling

### Key Functions
- `renderElements()` - Creates/updates controllers, renders elements
- `DragController.updateOptions()` - Synchronizes scale/transform
- `DragController.handlePointerDown/Move/Up()` - Drag event handlers

### Debug Logging Prefixes
- `[CONTROLLER-CREATE]` - New controller instantiated
- `[CONTROLLER-UPDATE]` - Controller options updated (NOISY)
- `[CONTROLLER-CLEANUP]` - Controller removed (DISABLED)
- `[DRAG-DOWN]` - Pointer down on element
- `[DRAG-UP]` - Pointer up after drag
- `[EDITOR-MOVE]` - Element move event dispatched

---

## Architecture Insights

### Dual-View Pattern
The application uses a sophisticated dual-view architecture where:
1. Main card always renders (all rooms overview)
2. Detail dialog optionally renders (single room detail)
3. BOTH can render the SAME room simultaneously
4. BOTH use `editorMode=true` when editor is active
5. Each needs its own controller instances (hence viewId)

### Why Global Controllers?
Controllers are module-level (not component-level) because:
1. Need to persist across re-renders
2. Need to maintain drag state during render cycles
3. Need to be accessible from event handlers
4. Component unmount during drag would lose state

**Trade-off**: Requires explicit cleanup logic to prevent memory leaks

### Transform Capture Strategy
**Problem**: `wrapper.style.transform` gets cleared during re-renders  
**Solution**: Capture transform at drag START (pointerdown), store immutable  
**Implementation**: `dragStartTransform` field, only set when state transitions to 'dragging'  
**Benefit**: Transform restoration works even if element re-renders during drag

---

## Performance Considerations

### Current Overhead
1. **Every Render**: All controllers call updateOptions()
2. **Every Update**: Debug logging to console
3. **No Cleanup**: Controllers accumulate in memory

### Target Optimizations
1. **Conditional Updates**: Only update on actual value changes
2. **Remove Debug Logs**: Or gate behind debug flag
3. **Enable Cleanup**: Remove stale controllers
4. **Lazy Initialization**: Consider creating controllers on first drag, not first render

### Non-Edit Mode Impact
**Current**: Controllers only created when `editorMode=true`  
**Verify**: Ensure ZERO drag-controller code runs when `editorMode=false`  
**Test**: Performance profile with editor disabled vs enabled

---

## Summary

**What Was Fixed**: ✅ Position bug - elements land correctly after drag  
**How It Was Fixed**: Separate controller instances per view using unique viewId  
**What Remains**: ⚠️ Performance issue - excessive updateOptions() calls flooding console  
**Next Focus**: Optimize update logic, re-enable cleanup, remove debug logs, improve maintainability  

**Success Metric**: Console should be quiet when idle (<10 logs/second), smooth 60fps drag, no memory leaks, zero impact on non-edit mode performance.
