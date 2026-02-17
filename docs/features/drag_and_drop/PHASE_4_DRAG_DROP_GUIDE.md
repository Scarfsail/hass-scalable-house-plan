# Start Phase 4: Overview Mode Scaling Adjustment

## Session Context

You are continuing implementation of the **Drag & Drop Element Repositioning** feature documented in [feature_drag_drop_element.md](./feature_drag_drop_element.md).

**Current Status:**
- ✅ Phase 1: Complete (Visual drag works, window event dispatched)
- ✅ Phase 2: Complete (Config updates on drop, groups and regular elements work)
- ✅ Phase 3: Complete (Group children can be dragged independently)
- 🚧 Phase 4: **READY FOR IMPLEMENTATION**

Last commit: `b11b3c4` - "feat(drag): enable drag-drop for group children"

---

## Phase 4 Goal

Enable proper drag behavior in **overview mode** where the room container has CSS `transform: scale()` applied.

### The Problem

In overview mode, the entire room container is scaled down using CSS transforms. When calculating pointer deltas during drag, the raw `clientX/clientY` values don't account for this parent scaling, causing elements to move by incorrect amounts.

### The Solution (~10 lines)

Adjust pointer deltas by dividing by the parent's CSS scale factors in `element-renderer-shp.ts`:

```typescript
// In handlePointerMove and handlePointerUp:
const dx = e.clientX - dragState.startX;
const dy = e.clientY - dragState.startY;

// NEW: Account for parent CSS scaling in overview mode
const adjustedDx = dx / parentScaleX;
const adjustedDy = dy / parentScaleY;

// Use adjustedDx/adjustedDy instead of dx/dy
```

---

## Implementation Steps

### 1. Understand Current Drag Code

Location: [src/components/element-renderer-shp.ts](../../src/components/element-renderer-shp.ts) lines ~490-625

Current pointer handlers calculate deltas:
```typescript
const handlePointerMove = (e: PointerEvent) => {
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    
    wrapper.style.transform = `${dragState.originalTransform} translate(${dx}px, ${dy}px)`;
    // ...
};
```

### 2. Detect Parent Scale

The parent container (room preview) may have CSS `transform: scale(scaleX, scaleY)` applied. You need to:

**Option A**: Get scale from the parent element's computed transform
```typescript
const parent = wrapper.parentElement;
const transform = window.getComputedStyle(parent).transform;
// Parse matrix() to extract scaleX, scaleY
```

**Option B**: Detect overview mode and calculate scale
```typescript
// If in overview mode, elements-container has been scaled
// Check if mode is 'overview' (may be passed as a property)
```

### 3. Apply Scale Adjustment

Modify both `handlePointerMove` and `handlePointerUp`:

```typescript
const dx = e.clientX - dragState.startX;
const dy = e.clientY - dragState.startY;

// Account for parent CSS scaling
const parentScaleX = /* detect scale */;
const parentScaleY = /* detect scale */;
const adjustedDx = parentScaleX !== 1 ? dx / parentScaleX : dx;
const adjustedDy = parentScaleY !== 1 ? dy / parentScaleY : dy;

// Use adjustedDx/adjustedDy for transform and event dispatch
```

### 4. Files to Modify

- `src/components/element-renderer-shp.ts` - adjust pointer delta calculations
- `src/elements/group-shp.ts` - same adjustment for group children (if needed)

### 5. Testing

1. Switch card to **overview mode** (zoom out/overview view)
2. Drag an element
3. Verify it positions correctly (not offset or jumping)
4. Compare with detail mode drag behavior
5. Test both room elements and group children

---

## Quick Start Command

Copy this prompt for your next session:

```
Implement Phase 4 of the Drag & Drop Element Repositioning feature documented in docs/features/feature_drag_drop_element.md.

CONTEXT:
- Phases 1-3 complete: Drag works in detail mode for both room elements and group children
- Phase 4 needed: Adjust for parent CSS scaling in overview mode

PHASE 4 GOAL:
Fix drag positioning when room container has CSS transform: scale() applied (overview mode).

WHAT'S NEEDED:
Adjust pointer deltas in element-renderer-shp.ts and group-shp.ts (~10 lines each) to account for parent scale.

KEY DETAILS:
- Detect parent's CSS transform scale from computed styles
- Divide dx/dy by scale factors before using them
- Apply to both handlePointerMove and handlePointerUp in both files
- Test in overview mode to verify correct positioning

After implementation: npm run build-dev, provide testing instructions, wait for approval, then commit Phase 4 and mark feature complete.
```

---

## Notes

- The same fix applies to group children in `group-shp.ts` if they also need it
- Consider caching the scale factors to avoid recomputing on every pointermove
- Edge case: Some modes may not apply scaling, so handle scale = 1 or undefined
- The scale might be different for X and Y axes (non-uniform scaling)

---

## Expected Outcome

After Phase 4:
- ✅ Drag works correctly in **detail mode** (already working)
- ✅ Drag works correctly in **overview mode** (with scale adjustment)
- ✅ Elements drop at the expected position in both modes
- ✅ Config values are correct regardless of view mode

**All 4 phases complete** = Full drag & drop feature ready for release! 🎉

---

## Reference Files

- Feature Specification: [feature_drag_drop_element.md](./feature_drag_drop_element.md)
- Implementation Code: 
  - [element-renderer-shp.ts](../../src/components/element-renderer-shp.ts) - room element drag
  - [group-shp.ts](../../src/elements/group-shp.ts) - group child drag
  - [scalable-house-plan-editor.ts](../../src/cards/scalable-house-plan-editor.ts) - config updates
