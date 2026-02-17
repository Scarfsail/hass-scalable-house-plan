# Phase 1 Drag Refactoring - Current Issue Summary

**Date:** February 8, 2026  
**Status:** ⚠️ **IN PROGRESS** - Intermittent drag failure on room-level elements

---

## What We Accomplished

### ✅ Completed Refactoring
1. **Created DragController** (`src/utils/drag-controller.ts`)
   - Reusable class for all drag-and-drop logic
   - 5px threshold, Escape key, pointer capture, scale compensation
   - Public methods for direct event binding: `handlePointerDown()`, `handlePointerMove()`, `handlePointerUp()`
   - Public `getState()` method for lifecycle coordination

2. **Refactored element-renderer-shp.ts**
   - Removed ~155 lines of duplicate drag code
   - Direct event bindings in template: `@pointerdown=${controller ? (e) => controller.handlePointerDown(e) : null}`
   - Module-level `dragControllers` Map for lifecycle management
   - Controller cleanup after each render

3. **Refactored group-shp.ts**
   - Removed ~138 lines of duplicate drag code
   - Fixed memory leak (document.addEventListener cleanup)
   - Component-level `_dragControllers` Map
   - Controller cleanup in `renderContent()`

### ✅ Bugs Fixed Along the Way
1. **Transform accumulation** - Use `removeProperty()` instead of empty string
2. **Aggressive cleanup interrupting drags** - Added state check: only cleanup if `controller.getState() === 'idle'`
3. **Null wrapper errors** - Store wrapper from `e.currentTarget` in each handler

---

## Current Problem

### Symptoms
- ✅ **Group element drag works reliably**
- ⚠️ **Room-level element drag works intermittently**
  - Sometimes works fine
  - Sometimes stops working (drag doesn't initiate or drops mid-drag)
  - No console errors
  - No pattern identified yet

### What We Discovered

**Root Cause (Partial):**
`renderElements()` is called separately for **each room** in the house. Each call:
1. Creates its own `currentKeys` Set (tracks only elements in THIS render call)
2. Runs cleanup at the end, removing controllers NOT in its `currentKeys`
3. **Problem:** Each room's cleanup may remove controllers from OTHER rooms!

**The Fix We Attempted:**
```typescript
// Track this key as active in current render (ALWAYS, not just when creating)
if (isDraggable) {
    currentKeys.add(uniqueKey);  // ← Track ALL draggable elements, not just new ones
}
```

**Why This Helped:**
- Before: Only tracked NEW controllers being created (`if (!dragControllers.has(uniqueKey))`)
- After: Tracks ALL draggable elements in current render
- This made groups work consistently

**Why Room-Level Still Fails:**
- Unclear - needs further investigation
- Possible multi-room cleanup conflict still happening
- Timing issue with controller creation/cleanup?
- Different code path for room vs group rendering?

---

## Key Code Sections

### Controller Lifecycle (element-renderer-shp.ts ~line 460-485)

```typescript
// Drag controller setup (only in editor mode)
const isDraggable = editorMode && plan;

// Track this key as active in current render (ALWAYS, not just when creating)
if (isDraggable) {
    currentKeys.add(uniqueKey);  // ← CRITICAL: Must track all, not just new
}

// Get or create drag controller
if (isDraggable && !dragControllers.has(uniqueKey)) {
    const controller = new DragController(
        null as any, // wrapper not needed with direct binding
        uniqueKey,
        { /* options */ }
    );
    controller.attach(); // Only attaches document keydown listener
    dragControllers.set(uniqueKey, controller);
}
const controller = isDraggable ? dragControllers.get(uniqueKey) : undefined;
```

### Controller Cleanup (element-renderer-shp.ts ~line 505-520)

```typescript
// Cleanup: Remove controllers for keys that weren't in this render
// IMPORTANT: Only cleanup idle controllers to prevent interrupting active drags.
if (editorMode) {
    const controllersToRemove: string[] = [];
    dragControllers.forEach((controller, key) => {
        if (!currentKeys.has(key) && controller.getState() === 'idle') {
            controller.detach();
            controllersToRemove.push(key);
        }
    });
    controllersToRemove.forEach(key => dragControllers.delete(key));
}
```

### Template Event Binding (element-renderer-shp.ts ~line 487-491)

```typescript
@pointerdown=${controller ? (e: PointerEvent) => controller.handlePointerDown(e) : null}
@pointermove=${controller ? (e: PointerEvent) => controller.handlePointerMove(e) : null}
@pointerup=${controller ? (e: PointerEvent) => controller.handlePointerUp(e) : null}
```

---

## Debugging Strategy for Next Session

### 1. Add Targeted Logging

**In element-renderer-shp.ts after cleanup:**
```typescript
if (editorMode) {
    console.log(`[Cleanup] Room: ${room?.name}, tracked: ${currentKeys.size}, total: ${dragControllers.size}, removed: ${controllersToRemove.length}`);
}
```

**In DragController.handlePointerDown:**
```typescript
console.log(`[Drag] Starting drag for: ${this.uniqueKey}, wrapper exists: ${!!this.wrapper}`);
```

### 2. Test Specific Scenarios

1. **Single room house** - Does drag work reliably with only one room?
2. **Multi-room render order** - Which rooms render first? Last?
3. **Room vs overview mode** - Does it matter?
4. **Element type** - Does it affect certain element types only?

### 3. Investigate Architecture Question

**Is cleanup too aggressive?**
- Option A: Only cleanup when position actually changes (detect in ElementMovedEvent handler)
- Option B: Use global `activeRoomKeys` Set across all `renderElements()` calls
- Option C: Move cleanup to a higher level (per-card, not per-room)
- Option D: Debounce cleanup with setTimeout

### 4. Check for Race Conditions

- Controller created in one render
- Immediately cleaned up in another render (parallel calls?)
- Template binds to undefined controller

---

## Alternative Approaches to Consider

### Option 1: Room-Level Controller Map
Instead of module-level `dragControllers`, pass room-specific map:
```typescript
const roomDragControllers = new Map<string, DragController>();
// Pass to renderElements as option
// Each room manages its own controllers
```

### Option 2: Defer Cleanup
Don't cleanup every render - only when:
- Editor mode disabled
- Element actually removed from config
- Manual trigger after drag completes

### Option 3: Different Key Strategy
Don't include position in uniqueKey:
- Use entity ID + room index + element index
- Stable across position changes
- No cleanup needed during drag

### Option 4: Controller Per Room/Card
Move controller management to ScalableHousePlanRoom component level instead of per-render-call.

---

## Files to Review

1. **src/components/element-renderer-shp.ts** (lines 360-520)
   - `renderElements()` function
   - Controller creation and cleanup logic

2. **src/components/scalable-house-plan-room.ts**
   - How many times does it call `renderElements()`?
   - Is there parallel rendering?

3. **src/cards/scalable-house-plan.ts**
   - How are rooms rendered?
   - Is there a higher-level place for controller management?

4. **src/utils/drag-controller.ts**
   - Verify all handlers work correctly
   - Check state transitions

---

## Next Steps

**Immediate:**
1. Add minimal logging to track cleanup behavior across rooms
2. Test in single-room vs multi-room house
3. Verify controller existence in template bindings

**If Still Broken:**
1. Consider Option 2: Defer cleanup (safest quick fix)
2. Move cleanup out of per-render cycle

**Long Term:**
1. Consider Option 3: Stable keys (architectural fix)
2. Document cleanup strategy clearly
3. Add unit tests for controller lifecycle

---

## Test Command for Next Session

```bash
npm run build-dev
# Then reload Home Assistant and test drag in both:
# - Room-level elements (problematic)
# - Group elements (working)
```

## Commit Status

**Uncommitted changes:**
- `src/utils/drag-controller.ts` (new file)
- `src/components/element-renderer-shp.ts` (modified)
- `src/elements/group-shp.ts` (modified)
- `docs/features/phase1_drag_refactor_completion.md` (new doc)

**Recommended:**
Don't commit until drag works reliably for both room and group elements.
