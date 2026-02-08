# 🚀 START HERE: Drag-Drop Refactoring

**Status**: Ready to begin Phase 1  
**Date**: February 8, 2026

---

## Quick Start

### To Start Phase 1 (Memory Leak Fix + Remove Duplication)

1. **Open a NEW session** in VS Code with GitHub Copilot
2. **Copy this prompt** and paste it into the chat:

```
I need to implement Phase 1 of the drag-and-drop refactoring plan. This is a critical phase that will:
- Fix a memory leak (event listeners never removed)
- Eliminate 140 lines of duplicated code
- Create a single source of truth for drag-and-drop logic

CONTEXT:
Review the following documents first:
1. docs/features/DRAG_DROP_CODE_REVIEW.md - Executive summary
2. docs/features/code_review_dry_violations.md - Shows the duplicated code (Section 2-4)
3. docs/features/code_review_soc_violations.md - Proposed DragController design (Section 4.1)

FILES TO MODIFY:
- Create: src/utils/drag-controller.ts (new file)
- Modify: src/components/element-renderer-shp.ts
- Modify: src/elements/group-shp.ts

REQUIREMENTS:
1. Create DragController class with:
   - Proper lifecycle (attach/detach methods)
   - All drag logic from both files (handlePointerDown, handlePointerMove, handlePointerUp, handleKeyDown)
   - Parent scale detection algorithm
   - Event dispatching with ElementMovedEvent
   - Support for both element and group contexts

2. Update element-renderer-shp.ts:
   - Remove inline drag handlers (lines 487-630)
   - Use DragController instead
   - Attach controllers in proper lifecycle (not in render)
   - Ensure cleanup on disconnect

3. Update group-shp.ts:
   - Remove inline drag handlers (lines 260-396)
   - Use DragController instead
   - Fix memory leak (document.addEventListener without removal)
   - Ensure cleanup on disconnect

CRITICAL: The user-facing behavior MUST NOT change. All drag functionality must work exactly as before:
- 5 pixel drag threshold
- Escape key cancels drag
- Pointer capture during drag
- CSS scale compensation
- Proper event details (with parentGroupKey for groups)

IMPLEMENTATION APPROACH:
- Use subagents for implementation tasks to save context
- Delegate file creation to subagent
- Delegate refactoring of each file to separate subagents
- I'll coordinate and review

TESTING REQUIREMENTS:
After implementation, I will test:
- Single element drag in normal room
- Single element drag in group
- Nested group drag (2-3 levels)
- Escape key cancels drag
- Threshold before drag starts
- Scale compensation
- No memory leaks (verify event listeners are cleaned up)

Once I approve, document the completion in docs/features/phase1_completion.md and commit with message:
"refactor(drag): extract DragController to eliminate duplication

- Created reusable DragController class
- Fixed memory leak in group-shp.ts
- Eliminated 140 lines of duplicate code
- Proper lifecycle management with attach/detach
- All drag functionality preserved

BREAKING CHANGE: Internal drag handler implementation changed, behavior unchanged"

Then provide the prompt for Phase 2.

START IMPLEMENTATION NOW using subagents for code changes.
```

3. **Let the AI implement** using subagents
4. **Test thoroughly** using the checklist below
5. **Approve** if all tests pass
6. AI will **commit and provide Phase 2 prompt**

---

## Testing Checklist (After Phase 1 Implementation)

### Editor Mode Tests (editorMode=true)

- [ ] **Drag single element** in normal room
  - Should see element follow mouse
  - Should snap back if drag < 5px
  - Should update position on release
  
- [ ] **Drag element in group**
  - Group child should drag independently
  - Should not drag the parent group
  
- [ ] **Drag group itself**
  - Entire group should move
  - Children should stay in relative positions
  
- [ ] **Drag nested group** (group inside group)
  - Inner group should drag independently
  - Outer group should not interfere
  
- [ ] **Escape key**
  - Start dragging element
  - Press Escape
  - Element should return to original position
  
- [ ] **Click without drag**
  - Click element (don't move)
  - Should select element (blue outline)
  - Should not trigger drag
  
- [ ] **Scale compensation**
  - If you have overview mode with scaled containers
  - Drag should compensate for scale
  - No drift during drag

### Normal Mode Tests (editorMode=false)

- [ ] **Elements render correctly**
  - All elements visible
  - Positioned correctly
  
- [ ] **No drag functionality**
  - Cannot drag elements (expected)
  - No errors in console

### Memory Leak Check

- [ ] **Open Chrome DevTools**
  - Go to Memory tab
  - Take heap snapshot
  - Switch between rooms 20 times
  - Take another heap snapshot
  - Compare: should not see accumulating event listeners
  - Event listener count should be stable

### Performance Check

- [ ] **No console errors**
- [ ] **Smooth rendering**
- [ ] **No lag during drag**

---

## If You Find Issues

If something doesn't work:

1. **Describe the issue** to the AI
2. AI will **fix the problem**
3. **Test again**
4. Repeat until all tests pass

Don't approve until everything works!

---

## After Approval

The AI will:

1. ✅ Create `docs/features/phase1_completion.md` documenting what was done
2. ✅ Commit the changes with proper semantic-release message
3. ✅ Provide the prompt for Phase 2

Then you:

1. **Close the current session**
2. **Open a NEW session**
3. **Use the Phase 2 prompt** provided by the AI
4. Repeat the process

---

## All Phase Prompts Available

See [REFACTORING_SESSION_PROMPTS.md](./REFACTORING_SESSION_PROMPTS.md) for:

- ✅ Phase 1 prompt (above)
- ⏳ Phase 2 prompt (after Phase 1)
- ⏳ Phase 3 prompt (after Phase 2)
- ⏳ Phase 4 prompt (after Phase 3)

---

## Background Information

### What's Being Fixed?

The drag-and-drop feature works correctly, but has code quality issues:

1. **Memory Leak** 🔴: Event listeners accumulate, never removed
2. **Code Duplication** 🔴: ~140 lines duplicated between 2 files
3. **Performance** 🟡: Editor code runs even in normal view
4. **Complexity** 🟡: 250-310 line methods that do too much

### Why 4 Phases?

Each phase delivers independent value and can be tested separately:

- **Phase 1** (Critical): Fixes critical bugs (leak + duplication)
- **Phase 2** (High): Major performance improvement (98% better)
- **Phase 3** (Medium): Better maintainability (cleaner code)
- **Phase 4** (Low): Final polish (optimization)

You can stop after any phase if needed!

### Review Documents

For full context, read:

1. **[DRAG_DROP_CODE_REVIEW.md](./DRAG_DROP_CODE_REVIEW.md)** - Executive summary
2. **[code_analysis_element_renderer.md](./code_analysis_element_renderer.md)** - Deep dive on element-renderer-shp.ts
3. **[code_analysis_group_shp.md](./code_analysis_group_shp.md)** - Deep dive on group-shp.ts
4. **[code_review_dry_violations.md](./code_review_dry_violations.md)** - Duplication analysis
5. **[code_review_soc_violations.md](./code_review_soc_violations.md)** - Architecture proposals

---

## Ready to Start?

**Copy the Phase 1 prompt above and start a new session!** 🚀

Good luck! The AI will guide you through each step using subagents to save context.
