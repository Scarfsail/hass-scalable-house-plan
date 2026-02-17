# START PHASE 4 HERE

**Date:** 2026-02-03
**Current Status:** Phases 1-3 Complete, Ready for Phase 4
**Latest Commit:** ea467ca

---

## Quick Context

This is a Home Assistant custom card project implementing an **Interactive Editor Mode** feature in 5 phases.

### What's Complete (Phases 1-3)

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

### What's Next (Phase 4)

**Phase 4: Preview Selection → Editor Expansion**

Make clicking an element in the preview auto-expand it in the editor panel.

**Goal:** When user clicks an element in the house map preview (in Editor mode):
1. The corresponding element auto-expands in the editor panel
2. The editor scrolls to make it visible
3. **The "Plan (Position & Layout)" section should be expanded/focused** - this is what users typically want to edit when clicking a positioned element

---

## Implementation Quick Start

### 1. Read Documentation
Start with these files in order:
1. This file - implementation guide
2. `docs/features/IMPLEMENTATION_STATUS.md` - current status
3. `docs/features/feature_interactive_editor.md` (lines 1066-1105) - full spec

### 2. Understand the Component Hierarchy

```
scalable-house-plan-editor.ts
  └── editor-rooms-shp.ts
        └── editor-room-shp.ts
              └── editor-elements-shp.ts
                    └── editor-element-shp.ts  (individual element editor)
```

### 3. Implementation Steps

**Step 1: Add expansion method to editor-element-shp.ts**
- Add public method to programmatically expand the element
- Optionally expand specific sections (Plan section)

**Step 2: Add expansion method to editor-elements-shp.ts**
- Add public method `expandElementByEntityId(entityId: string, expandPlanSection?: boolean): boolean`
- Find element by entity ID, expand it
- Call `scrollIntoView()` on the element

**Step 3: Add expansion method to editor-room-shp.ts**
- Add public method `expandElementInRoom(entityId: string): void`
- Ensure room is expanded first (`this._expanded = true`)
- Call child `editor-elements-shp.expandElementByEntityId()`

**Step 4: Add expansion method to editor-rooms-shp.ts**
- Add public method `expandElementAtPath(roomIndex: number, entityId: string): void`
- Find room component by index
- Call room's `expandElementInRoom()`

**Step 5: Wire up in scalable-house-plan-editor.ts**
- Update `_handleElementSelection()` to call expansion
- Get reference to `editor-rooms-shp` via `@query` decorator
- Extract roomIndex from event detail (need to add this to the event)

**Step 6: Update event to include roomIndex**
- Modify element selection event in element-renderer-shp.ts
- Add `roomIndex` to event detail so editor knows which room

---

## Key Technical Patterns

### Getting Component References
```typescript
// Using @query decorator
@query('editor-rooms-shp') private _roomsEditor!: EditorRoomsShp;

// Then in method
this._roomsEditor?.expandElementAtPath(roomIndex, entityId);
```

### Scrolling to Element
```typescript
// In editor-elements-shp after expanding
const elementDiv = this.shadowRoot?.querySelector(`[data-entity-id="${entityId}"]`);
elementDiv?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
```

### Expanding Plan Section Specifically
When clicking an element in the preview, the user likely wants to edit its position. The `editor-element-shp` component has:
- `_planSectionExpanded: boolean` - controls "Plan (Position & Layout)" section
- `_elementSectionExpanded: boolean` - controls "Element (Type & Properties)" section

When auto-expanding from preview click:
```typescript
// In editor-element-shp, add method:
public expandWithPlanFocus(): void {
    this.isExpanded = true;
    this._planSectionExpanded = true;  // Ensure plan section is open
}
```

---

## Event Detail Enhancement

Current event (from Phase 2):
```typescript
detail: { uniqueKey: string }
```

Enhanced event (for Phase 4):
```typescript
detail: {
    uniqueKey: string,
    roomIndex: number,  // Add this
    entityId: string    // Add this for convenience
}
```

Update in `element-renderer-shp.ts` where the selection event is dispatched.

---

## Files to Modify

**Estimated:** 4-5 files, ~80-100 lines

1. **element-renderer-shp.ts** (~5 lines)
   - Add roomIndex and entityId to selection event detail

2. **editor-element-shp.ts** (~10 lines)
   - Add `expandWithPlanFocus()` public method
   - Add `data-entity-id` attribute for querying

3. **editor-elements-shp.ts** (~25 lines)
   - Add `expandElementByEntityId()` method
   - Handle scrolling into view

4. **editor-room-shp.ts** (~15 lines)
   - Add `expandElementInRoom()` method
   - Ensure room expands first

5. **editor-rooms-shp.ts** (~15 lines)
   - Add `expandElementAtPath()` method
   - Find room by index

6. **scalable-house-plan-editor.ts** (~15 lines)
   - Add `@query` for rooms editor
   - Update `_handleElementSelection()` to call expansion

---

## Testing Checklist

After implementation:
- [ ] Click element in preview (Editor mode) → element expands in editor
- [ ] Editor scrolls to show the expanded element
- [ ] "Plan (Position & Layout)" section is expanded (for position editing)
- [ ] Works for elements in collapsed rooms (room expands first)
- [ ] Works alongside Phase 3 (expanding in editor still highlights preview)
- [ ] Build succeeds with no TypeScript errors

---

## Success Criteria

Phase 4 is complete when:
- [ ] Clicking element in preview auto-expands it in editor
- [ ] Plan section is expanded/focused for position editing
- [ ] Editor scrolls to make element visible
- [ ] If element is in collapsed room, room expands first
- [ ] No regression in Phase 2-3 functionality
- [ ] Build succeeds with no TypeScript errors

---

## Debugging Tips

If element doesn't expand:
1. Check that roomIndex is in event detail
2. Verify `@query` finds the rooms editor component
3. Add console.log in expansion chain to trace flow
4. Check if component refs are available (may need `await this.updateComplete`)

If scroll doesn't work:
1. Verify element has `data-entity-id` attribute
2. Check shadowRoot query finds the element
3. Try `requestAnimationFrame` before scrollIntoView

---

## Git Workflow

```bash
# After Phase 4 implementation
git add <modified files>
git commit -m "feat(interactive-editor): implement Phase 4 - preview click expands editor element"
```

---

## Phase 5 Preview

After Phase 4, Phase 5 will add:
- "Edit Mode" badge in preview
- Clear selection on empty space click
- Clear selection on room switch
- Clear selection on element delete
- Cursor style changes
- Comprehensive testing

---

**Ready to start?** Begin with Step 1 - adding expansion methods starting from the leaf components (editor-element-shp) up to the root (editor-rooms-shp).

_Last Updated: 2026-02-03 | Commit: ea467ca_
