# Phase 5 Known Issues

**Date:** 2026-02-04
**Status:** ✅ All issues resolved - Phase 5 complete!

---

## ✅ Issue 1: Nested Group Click Selection (FIXED)

**Problem:**
When clicking on an element inside a group, the parent group got selected instead of the child element.

**Expected Behavior:**
- Click on a child element inside a group → Child element is selected and expanded in both the editor panel and highlighted in preview
- Click on empty space in group → Group itself is selected
- Works with multi-level nested groups (groups within groups)

**Root Cause:**
The selection system was not passing parent group context when child elements were clicked. The editor couldn't navigate the nested hierarchy to find and expand child elements within groups.

**Solution Implemented:**
1. Added `groupUniqueKey` property to `group-shp` to track the group's own uniqueKey
2. Added `parentGroupKey` parameter to `onElementClick` callback to pass parent context
3. Updated event emission to include `parentGroupKey` in 'scalable-house-plan-element-selected' event
4. Enhanced `expandElementByKey` in editor-elements-shp to handle nested selections:
   - First expands parent group if `parentGroupKey` provided
   - Then finds nested editor-elements-shp inside group
   - Finally expands child element within that nested list
   - Supports multi-level nesting through recursion

**Files Modified:**
- `src/elements/group-shp.ts`
- `src/components/element-renderer-shp.ts`
- `src/components/scalable-house-plan-room.ts`
- `src/cards/scalable-house-plan-editor.ts`
- `src/cards/editor-components/editor-rooms-shp.ts`
- `src/cards/editor-components/editor-room-shp.ts`
- `src/cards/editor-components/editor-elements-shp.ts`

**Result:**
✅ Clicking a child element in preview selects and expands that child in the editor
✅ Clicking group empty space selects the group
✅ Works with multi-level nested groups
✅ Child element is highlighted in preview when selected

---

## ✅ Issue 2: Group Child Selection and Highlighting (FIXED)

**Problem:**
When selecting an element inside a group from the editor panel (left side), the element was not being highlighted correctly in the preview (right side).

**Expected Behavior:**
- Expand a group in editor → Group outline highlighted in preview (blue border around entire group)
- Expand a child element inside a group in editor → Child element highlighted in preview (blue border around child)
- Both group and child highlighting should work independently

**Root Cause Same as Issue 1:**
The selection system didn't support navigating nested group hierarchies. When expanding a child in the editor, the system couldn't properly communicate which specific child should be highlighted in the preview.

**Solution:**
Same implementation as Issue 1 - the nested selection system handles both directions:
- **Preview → Editor:** Click child in preview → expands child in editor
- **Editor → Preview:** Expand child in editor → highlights child in preview

The `selectedElementKey` property is now properly passed through the group hierarchy and applied to child wrappers, enabling correct highlighting at any nesting level.

**Files Modified:**
Same as Issue 1 (integrated solution)

**Result:**
✅ Expanding a child element in editor highlights that child in preview
✅ Expanding a group in editor highlights the group in preview  
✅ Highlighting works at any nesting level
✅ Visual feedback identical to top-level element selection

---

## Testing Scenarios - Expected Results ✅

### Scenario 1: Click Child Element in Preview ✅
1. Have a group with child elements in preview
2. Click on a child element (not empty space)
3. ✅ **Child element** is selected and expanded in editor panel
4. ✅ **Child element** is highlighted with blue outline in preview
5. ✅ Parent group is also expanded (to show the child)

### Scenario 2: Click Group Empty Space in Preview ✅  
1. Have a group with child elements in preview
2. Click on empty space within group (not on child)
3. ✅ **Group** itself is selected and expanded in editor panel
4. ✅ **Group** is highlighted with blue outline in preview

### Scenario 3: Expand Child Element in Editor ✅
1. Have a group with child elements in editor panel
2. Expand a child element in the editor panel (left side)
3. ✅ **Child element** is highlighted in preview with blue outline
4. ✅ Only the child is highlighted, not the parent group

### Scenario 4: Expand Group in Editor ✅
1. Have a group with child elements in editor panel
2. Expand the group element in the editor panel (left side)
3. ✅ **Group** is highlighted in preview with blue outline around entire group
4. ✅ Children are not highlighted individually

### Scenario 5: Multi-Level Nesting ✅
1. Have a group within a group (nested groups)
2. Click on innermost element in preview
3. ✅ Innermost element is selected and expanded in editor
4. ✅ All parent groups are expanded to show the path
5. ✅ Only the innermost element is highlighted in preview

---

## Phase 5 Implementation Status

**Completed Tasks:**
- ✅ Task 1: Edit Mode Badge - Working
- ✅ Task 2: Clear Selection on Empty Space Click - Working
- ✅ Task 3: Clear Selection on Room Switch - Working
- ✅ Task 4: Clear Selection on Element Delete - Working
- ✅ Task 5: Cursor Styles - Working (verified from Phase 2)
- ✅ Issue 1: Nested Group Click Selection - Fixed
- ✅ Issue 2: Group Child Highlight in Preview - Fixed

**Overall Status:**
✅ **Phase 5 100% Complete** - All functionality working including nested group scenarios!

---

_Last Updated: 2026-02-04_
