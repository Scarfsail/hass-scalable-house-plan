# START PHASE 5 HERE

**Date:** 2026-02-04
**Current Status:** Phases 1-4 Complete, Ready for Phase 5
**Latest Commit:** 733bf00

---

## Quick Context

This is a Home Assistant custom card project implementing an **Interactive Editor Mode** feature in 5 phases.

### What's Complete (Phases 1-4)

**Phase 1: Core State Management**
- Editor mode toggle button (Preview/Editor modes)
- State management infrastructure (_editorMode, _selectedElementKey)
- Config passing pattern via _configChanged()

**Phase 2: Preview Click-to-Select**
- Click elements in preview to select them
- Blue outline (3px) appears on selected elements
- Selection syncs from preview → editor
- Uses window-level events to cross HA's editor/preview boundary

**Phase 3: Bi-Directional Sync (Editor → Preview)**
- Expanding element in editor highlights it in preview
- Clicking anywhere in expanded element content updates highlight
- Only works when Editor mode is enabled (not Preview mode)

**Phase 4: Preview Selection → Editor Expansion**
- Clicking element in preview auto-expands it in editor
- Editor scrolls to make element visible
- Plan (Position & Layout) section auto-expands
- Works with all element types including groups (uniqueKey-based matching)

### What's Next (Phase 5)

**Phase 5: Polish & Edge Cases**

This is the **final phase**! Add polish and handle edge cases to complete the feature.

**Goal:** Make the Interactive Editor Mode production-ready with proper edge case handling and visual polish.

---

## Implementation Quick Start

### 1. Read Documentation
Start with these files in order:
1. This file - implementation guide
2. `docs/features/IMPLEMENTATION_STATUS.md` - current status
3. `docs/features/feature_interactive_editor.md` (lines 1107-1162) - full spec

### 2. Implementation Tasks

**Task 1: Add "Edit Mode" Badge to Preview** (~20 min, ~15 lines)
- File: `scalable-house-plan.ts`
- Add overlay badge when `_editorMode === true`
- Position: top-right or bottom-right corner
- Style: Subtle, non-intrusive (e.g., small badge with "Edit Mode" text)
- Should be visible in both overview and detail views

**Task 2: Clear Selection on Empty Space Click** (~15 min, ~15 lines)
- File: `scalable-house-plan-room.ts`
- Add click handler to room polygon/container
- If `editorMode` and click target is room (not element), emit selection event with `null` key
- Use `e.stopPropagation()` carefully to not block element clicks

**Task 3: Clear Selection on Room Switch** (~10 min, ~5 lines)
- File: `scalable-house-plan-editor.ts`
- Update `_handlePreviewDetail()` to clear `_selectedElementKey` when room changes
- Check if `_selectedRoomIndex` changed, then set `_selectedElementKey = null`

**Task 4: Clear Selection on Element Delete** (~15 min, ~10 lines)
- File: `editor-elements-shp.ts`
- In `_handleElementRemove()`, check if deleted element was selected
- Compare entity ID or uniqueKey with `_selectedElementKey`
- Emit `scalable-house-plan-element-focused` with null if match

**Task 5: Update Cursor Styles** (~10 min, ~5 lines)
- File: `element-renderer-shp.ts`
- Add `cursor: pointer` to element-wrapper style when `editorMode === true`
- Already partially implemented in Phase 2, verify it's working

**Task 6: Verify Nested Group Handling** (~15 min, testing)
- File: `element-renderer-shp.ts`
- Test that clicking nested elements (groups within groups) works correctly
- Verify `stopPropagation()` ensures innermost element is selected
- No code changes needed if working correctly

**Task 7: Test All Use Cases** (~30 min, testing)
- Test Use Case 1: Quick element editing workflow
- Test Use Case 2: Verifying element placement
- Test Use Case 3: Complex layout configuration

**Task 8: Test All Edge Cases** (~30 min, testing)
- Nested groups (click child vs. group)
- Overlapping elements
- No-entity elements
- Empty space click
- Rapid mode toggle
- Element deletion while selected
- Room switching while element selected

---

## Key Technical Patterns

### Adding Overlay Badge
```typescript
// In scalable-house-plan.ts render()
${this._editorMode ? html`
    <div class="edit-mode-badge">
        <ha-icon icon="mdi:pencil"></ha-icon>
        <span>Edit Mode</span>
    </div>
` : ''}
```

### Clear Selection on Empty Space
```typescript
// In scalable-house-plan-room.ts
private _handleRoomClick(e: MouseEvent): void {
    if (!this.editorMode) return;

    // Check if click target is room polygon/container (not an element)
    const target = e.target as HTMLElement;
    if (target.classList.contains('room-polygon') || target === this) {
        // Emit selection event with null key
        window.dispatchEvent(new CustomEvent('scalable-house-plan-element-selected', {
            detail: { uniqueKey: null },
            bubbles: true,
            composed: true
        }));
    }
}
```

### Clear Selection on Room Switch
```typescript
// In scalable-house-plan-editor.ts
private _handlePreviewDetail(room: Room, roomIndex: number) {
    // Clear selection when switching rooms
    if (this._selectedRoomIndex !== roomIndex) {
        this._selectedElementKey = null;
    }
    // ... rest of method
}
```

### Clear Selection on Element Delete
```typescript
// In editor-elements-shp.ts _handleElementRemove()
const deletedEntity = typeof element === 'string' ? element : element.entity;
const deletedKey = deletedEntity || generateElementKey(...);

// Check if deleted element was selected
if (this._selectedElementKey === deletedKey) {
    // Emit focus event with null to clear selection
    window.dispatchEvent(new CustomEvent('scalable-house-plan-element-focused', {
        detail: { uniqueKey: null },
        bubbles: true,
        composed: true
    }));
}
```

---

## Files to Modify

**Estimated:** 4-5 files, ~50 lines of code + testing

1. **scalable-house-plan.ts** (~15 lines)
   - Add edit mode badge overlay
   - Add CSS for badge styling

2. **scalable-house-plan-room.ts** (~15 lines)
   - Add room click handler for empty space detection
   - Emit selection event with null key

3. **scalable-house-plan-editor.ts** (~5 lines)
   - Update `_handlePreviewDetail()` to clear selection on room switch

4. **editor-elements-shp.ts** (~10 lines)
   - Update `_handleElementRemove()` to clear selection if deleted element was selected
   - Need access to `_selectedElementKey` (may need to pass as prop)

5. **element-renderer-shp.ts** (~5 lines, verification)
   - Verify cursor: pointer is applied in editor mode
   - Already implemented in Phase 2, just verify

---

## Testing Checklist

After implementation:
- [ ] Edit mode badge visible when Editor mode enabled
- [ ] Badge hidden when Preview mode active
- [ ] Clicking empty space in room clears selection
- [ ] Clicking element in room still selects it (no regression)
- [ ] Switching rooms clears selection
- [ ] Deleting selected element clears selection
- [ ] Cursor changes to pointer when hovering over elements in editor mode
- [ ] Nested groups: clicking child selects child, not parent
- [ ] Overlapping elements: clicking selects correct element
- [ ] No-entity elements (groups, info boxes) work correctly
- [ ] Rapid mode toggle doesn't cause errors
- [ ] All Phase 1-4 functionality still works (no regressions)

---

## Success Criteria

Phase 5 is complete when:
- [ ] Edit mode badge visible in preview when mode is active
- [ ] Clicking empty space clears selection
- [ ] Switching rooms clears selection
- [ ] Deleting selected element clears selection
- [ ] Cursor styles correct in both modes
- [ ] All edge cases handled gracefully
- [ ] All must-have acceptance criteria met
- [ ] All should-have acceptance criteria met
- [ ] No regression in Phase 1-4 functionality
- [ ] Build succeeds with no TypeScript errors

---

## Debugging Tips

If badge doesn't show:
1. Check that `_editorMode` is true
2. Verify badge div is in render output
3. Check z-index and positioning (should be on top of preview)

If empty space click doesn't work:
1. Check that click handler is attached to correct element
2. Verify target detection logic (use console.log to debug)
3. Check that event is being dispatched to window

If selection not clearing on room switch:
1. Add console.log to verify `_handlePreviewDetail()` is called
2. Check that `_selectedRoomIndex` comparison works
3. Verify `_configChanged()` propagates the null selection

---

## Git Workflow

```bash
# After Phase 5 implementation
git add <modified files>
git commit -m "feat(interactive-editor): implement Phase 5 - polish and edge cases"
```

---

## What Happens After Phase 5?

**Phase 5 is the final phase!** 🎉

After completion, the Interactive Editor Mode feature will be:
- ✅ Fully functional
- ✅ Production-ready
- ✅ Well-tested
- ✅ All acceptance criteria met

Potential future enhancements (not in this release):
- Drag-and-drop repositioning in preview
- Multi-select of elements
- Copy/paste elements via preview
- Keyboard shortcuts for mode toggle

---

**Ready to start?** Begin with Task 1 - adding the edit mode badge to the preview.

_Last Updated: 2026-02-04 | Previous Phase: Phase 4 complete_
