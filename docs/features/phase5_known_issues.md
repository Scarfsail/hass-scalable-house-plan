# Phase 5 Known Issues

**Date:** 2026-02-04
**Status:** Known issues to be fixed in follow-up

---

## Issue 1: Nested Group Click Selection

**Problem:**
When clicking on an element inside a group, the parent group gets selected instead of the child element.

**Expected Behavior:**
- Clicking on a child element inside a group should select the child element
- Only clicking on the group's empty space should select the group itself

**Current Behavior:**
- Clicking on a child element selects the parent group
- The group element expands in the editor panel instead of the child

**Attempted Fix:**
Added logic in `element-renderer-shp.ts` to check if click originated from a child element-wrapper, but it's not working as expected.

**Files Involved:**
- `src/components/element-renderer-shp.ts` - Click handler logic
- May need to investigate event propagation in group-shp component

---

## Issue 2: Group Child Selection Not Highlighting in Preview

**Problem:**
When selecting an element inside a group from the editor panel (left side), the element is not highlighted in the preview (right side).

**Expected Behavior:**
- Expanding an element in the editor that is nested inside a group should:
  1. Highlight that child element with blue outline in preview
  2. Work the same way as non-nested elements

**Current Behavior:**
- Selecting/expanding a child element in the editor does not show the blue outline in preview
- The highlight only works for top-level elements, not nested group children

**Suspected Cause:**
- The `selectedElementKey` may not be properly passed down to nested group children
- Group-shp component may not be passing through the selection state to its child elements
- May need to recursively pass `selectedElementKey` through group hierarchy

**Files Involved:**
- `src/elements/group-shp.ts` - Group element component
- `src/components/element-renderer-shp.ts` - Element rendering and selection logic
- May need to check how groups render their children

---

## Next Steps

1. **Fix nested group click selection:**
   - Debug event propagation in group elements
   - Ensure only innermost clicked element is selected
   - Test with multi-level nested groups

2. **Fix group child highlight in preview:**
   - Trace how `selectedElementKey` flows through group-shp
   - Ensure groups pass selection state to children
   - Verify element-renderer properly highlights nested elements

3. **Test thoroughly:**
   - Single nested element in group
   - Multiple nested elements in group
   - Multi-level nested groups (groups within groups)
   - Switching selection between group and child elements

---

## Testing Scenarios to Verify Fix

### Scenario 1: Click Child Element in Preview
1. Have a group with child elements in preview
2. Click on a child element (not empty space)
3. ✅ Child element should be selected and highlighted
4. ✅ Child element should expand in editor panel
5. ❌ Currently: Group gets selected instead

### Scenario 2: Click Group Empty Space in Preview
1. Have a group with child elements in preview
2. Click on empty space within group (not on child)
3. ✅ Group itself should be selected
4. ✅ Group should expand in editor panel

### Scenario 3: Expand Child Element in Editor
1. Have a group with child elements
2. Expand a child element in the editor panel (left side)
3. ✅ Child element should be highlighted in preview with blue outline
4. ❌ Currently: No highlight appears in preview

### Scenario 4: Multi-Level Nesting
1. Have a group within a group (nested groups)
2. Click on innermost element
3. ✅ Only innermost element should be selected
4. Test selection at each nesting level

---

## Phase 5 Implementation Status

**Completed Tasks:**
- ✅ Task 1: Edit Mode Badge - Working
- ✅ Task 2: Clear Selection on Empty Space Click - Working
- ✅ Task 3: Clear Selection on Room Switch - Working
- ✅ Task 4: Clear Selection on Element Delete - Working
- ✅ Task 5: Cursor Styles - Working (verified from Phase 2)

**Known Issues:**
- ❌ Issue 1: Nested group click selection incorrect
- ❌ Issue 2: Group child selection not highlighting in preview

**Overall Status:**
Phase 5 is 90% complete. Core functionality works for non-nested elements. Issues only affect nested group scenarios.

---

_Last Updated: 2026-02-04_
