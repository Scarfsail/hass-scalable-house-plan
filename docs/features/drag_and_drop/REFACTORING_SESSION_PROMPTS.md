# Refactoring Session Prompts

**Project**: Drag & Drop Code Quality Improvements  
**Date Created**: February 8, 2026  
**Status**: Ready to begin Phase 1

---

## Overview

This document contains prompts for 4 refactoring sessions to improve the drag-and-drop code quality. Each phase is designed to be completed in a separate session to manage context size efficiently.

**Process for each phase**:
1. Start new session with the prompt below
2. AI implements the phase using subagents
3. You test the functionality
4. You approve → AI documents progress and commits
5. AI provides next phase prompt
6. Start new session with next prompt

**Important**: Use subagents extensively for implementation tasks to save context.

---

## Phase 1: Extract Drag Controller (Critical)

### Status: 🔴 Ready to Start

### Session Prompt for Phase 1

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

### Expected Deliverables

- ✅ New file: `src/utils/drag-controller.ts` (~200 lines)
- ✅ Modified: `src/components/element-renderer-shp.ts` (~140 lines removed, ~30 added)
- ✅ Modified: `src/elements/group-shp.ts` (~140 lines removed, ~30 added)
- ✅ Documentation: `docs/features/phase1_completion.md`
- ✅ Git commit with semantic-release compatible message

### Success Criteria

- [ ] All drag-and-drop functionality works identically
- [ ] No code duplication between files
- [ ] Memory leak fixed (no accumulating event listeners)
- [ ] DragController has proper attach/detach lifecycle
- [ ] Event listeners properly cleaned up on component disconnect
- [ ] User can drag elements, groups, and nested groups
- [ ] Escape key cancels drag
- [ ] 5px threshold before drag activates
- [ ] CSS scale compensation works correctly

---

## Phase 2: Split Render Paths (High Priority)

### Status: ⏳ Pending Phase 1 Completion

### Session Prompt for Phase 2

```
I need to implement Phase 2 of the drag-and-drop refactoring plan. This phase will:
- Separate editor logic from runtime logic
- Achieve 98% reduction in handler allocations for normal view
- Improve performance in non-editor mode

PREREQUISITES:
Phase 1 must be completed (DragController extracted).

CONTEXT:
Review the following documents:
1. docs/features/phase1_completion.md - What was done in Phase 1
2. docs/features/code_review_soc_violations.md - Proposed architecture (Section 3.2 and 4.2)
3. docs/features/DRAG_DROP_CODE_REVIEW.md - Performance targets (Section "Success Metrics")

FILES TO MODIFY:
- Modify: src/components/element-renderer-shp.ts
- Modify: src/elements/group-shp.ts

REQUIREMENTS:

**For element-renderer-shp.ts**:
1. Split renderElements() into:
   - renderElements() - Top-level router function
   - renderReadOnlyElements() - Normal view (no editor overhead)
   - renderEditableElements() - Editor view (with DragController)

2. In renderReadOnlyElements():
   - Only runtime logic (cards, positioning, rendering)
   - NO editor checks
   - NO DragController instantiation
   - Simple template without editor event handlers
   - Zero allocations for editor features

3. In renderEditableElements():
   - Runtime logic + editor features
   - DragController management
   - Selection handling
   - Editor event handlers

**For group-shp.ts**:
1. Split _renderChild() into:
   - _renderChild() - Router based on editorMode
   - _renderReadOnlyChild() - Normal view
   - _renderEditableChild() - Editor view

2. Same pattern as element-renderer-shp.ts

PERFORMANCE TARGETS:
After implementation, benchmark with 50 elements:
- Normal view: 0 handler allocations (currently 200)
- Normal view: <5 editorMode checks total (currently ~750)
- Normal view: render time <4ms (currently ~8ms)
- Editor view: same performance as before (~8ms)

CRITICAL: The user-facing behavior MUST NOT change. All functionality must work exactly as before.

IMPLEMENTATION APPROACH:
- Use subagents for implementation to save context
- Delegate each file refactoring to separate subagent
- I'll coordinate and ensure consistency

TESTING REQUIREMENTS:
After implementation, I will test:
- Normal view: drag should not work (editorMode=false)
- Normal view: elements render correctly
- Normal view: no console errors
- Editor view: all drag functionality works
- Editor view: selection works
- Editor view: highlighting works

Once I approve, document completion in docs/features/phase2_completion.md and commit with message:
"perf(render): separate editor and runtime render paths

- Split renderElements into read-only and editable variants
- Split _renderChild into read-only and editable variants
- Normal view now has zero editor overhead
- 98% reduction in allocations for normal view
- Render performance improved 50% in normal mode"

Then provide the prompt for Phase 3.

START IMPLEMENTATION NOW using subagents for code changes.
```

### Expected Deliverables

- ✅ Modified: `src/components/element-renderer-shp.ts` (split into 3 functions)
- ✅ Modified: `src/elements/group-shp.ts` (split into 3 methods)
- ✅ Documentation: `docs/features/phase2_completion.md`
- ✅ Performance benchmarks showing improvements
- ✅ Git commit with semantic-release compatible message

### Success Criteria

- [ ] Normal view: 0 handler allocations
- [ ] Normal view: <5 editorMode checks per render
- [ ] Normal view: render time <4ms for 50 elements
- [ ] Editor view: all functionality works identically
- [ ] No user-facing behavior changes
- [ ] Clear code separation between paths

---

## Phase 3: Extract Helper Methods (Medium Priority)

### Status: ⏳ Pending Phase 2 Completion

### Session Prompt for Phase 3

```
I need to implement Phase 3 of the drag-and-drop refactoring plan. This phase will:
- Reduce method complexity
- Improve code maintainability
- Break down large functions into focused helpers

PREREQUISITES:
Phases 1 and 2 must be completed.

CONTEXT:
Review the following documents:
1. docs/features/phase2_completion.md - Current state after Phase 2
2. docs/features/code_review_soc_violations.md - Helper method extraction (Section 4.3)
3. docs/features/code_analysis_element_renderer.md - Current method structure
4. docs/features/code_analysis_group_shp.md - Current method structure

FILES TO MODIFY:
- Modify: src/components/element-renderer-shp.ts
- Modify: src/elements/group-shp.ts

REQUIREMENTS:

**For element-renderer-shp.ts**:
Current state: renderElements() and sub-functions may still have complex logic.

Extract helpers:
1. Element preparation logic
2. Card management logic
3. Position calculation helper (if not already separate)
4. Selection state logic

Goal: Each function <50 lines, ideally <30 lines.

**For group-shp.ts**:
Current state: _renderChild() and sub-methods may still be complex.

Extract helpers:
1. _parseChildConfig() - Extract entity and plan from EntityConfig
2. _generateChildKey() - Generate unique key
3. _prepareChildCard() - Element type, config building, card creation
4. Ensure _renderReadOnlyChild and _renderEditableChild are focused

Goal: Each method <50 lines, _renderChild should be <30 lines.

CODE QUALITY TARGETS:
- Max method length: <50 lines
- Each method has single responsibility
- Clear method names describing intent
- Proper JSDoc comments for public/important methods
- Follow LitElement structure from shared-agents.md

IMPLEMENTATION APPROACH:
- Use subagents for implementation to save context
- Delegate each file refactoring to separate subagent
- Focus on readability and testability
- Don't over-engineer - follow YAGNI principle

TESTING REQUIREMENTS:
After implementation, I will test:
- All functionality works identically
- Code is more readable
- Methods are focused and clear
- No regressions

Once I approve, document completion in docs/features/phase3_completion.md and commit with message:
"refactor(code-quality): extract helper methods for maintainability

- Reduced max method length from 310 to <50 lines
- Extracted focused helper methods
- Improved code readability and testability
- Each method now has single responsibility
- No behavior changes"

Then provide the prompt for Phase 4.

START IMPLEMENTATION NOW using subagents for code changes.
```

### Expected Deliverables

- ✅ Modified: `src/components/element-renderer-shp.ts` (extracted helpers)
- ✅ Modified: `src/elements/group-shp.ts` (extracted helpers)
- ✅ Documentation: `docs/features/phase3_completion.md`
- ✅ Git commit with semantic-release compatible message

### Success Criteria

- [ ] Max method length <50 lines
- [ ] renderElements() sub-functions are focused
- [ ] _renderChild() is <30 lines
- [ ] Each helper method has clear single purpose
- [ ] Code is more readable
- [ ] All functionality works identically

---

## Phase 4: Add Editor Mode Guards (Low Priority)

### Status: ⏳ Pending Phase 3 Completion

### Session Prompt for Phase 4

```
I need to implement Phase 4 (final phase) of the drag-and-drop refactoring plan. This phase will:
- Add early returns for !editorMode cases
- Minimize conditional checks in hot paths
- Final optimization pass

PREREQUISITES:
Phases 1, 2, and 3 must be completed.

CONTEXT:
Review the following documents:
1. docs/features/phase3_completion.md - Current state after Phase 3
2. docs/features/code_review_soc_violations.md - Guard pattern (Section 4.4)

FILES TO MODIFY:
- Modify: src/components/element-renderer-shp.ts
- Modify: src/elements/group-shp.ts
- Any other files with scattered editorMode checks

REQUIREMENTS:

**Pattern to apply**:
```typescript
// Before: Scattered checks
const isDraggable = editorMode && plan;
if (isDraggable) { /* ... */ }
const isSelected = editorMode && selectedElementKey === uniqueKey;

// After: Early return at top level
if (!editorMode) {
    return renderSimplePath();
}
// Editor-only code below, no need for checks
```

**For both files**:
1. Identify remaining scattered editorMode checks
2. Move to early returns where possible
3. Remove redundant checks in editor-only code paths
4. Add comments explaining the separation

PERFORMANCE TARGETS:
- Normal view: <5 total editorMode checks (one at top level per render call)
- Clear code flow (early returns make intent obvious)

CODE QUALITY:
- Prefer guard clauses over nested conditionals
- Make normal view path obvious
- Editor path clearly separated

IMPLEMENTATION APPROACH:
- Use subagents for implementation to save context
- This is an optimization pass, be conservative
- Don't break the clean separation from Phase 2

TESTING REQUIREMENTS:
After implementation, I will test:
- All functionality works identically
- Code flow is clearer
- Performance is same or better

Once I approve, document completion in docs/features/phase4_completion.md with:
- Summary of all 4 phases
- Before/after metrics
- Final state of the codebase
- Maintenance recommendations

Commit with message:
"refactor(optimization): add editor mode guards for clarity

- Added early returns for !editorMode cases
- Reduced conditional checks in hot paths
- Improved code clarity with guard clauses
- Final optimization of render paths
- No behavior changes"

This completes the refactoring plan!

START IMPLEMENTATION NOW using subagents for code changes.
```

### Expected Deliverables

- ✅ Modified: `src/components/element-renderer-shp.ts` (optimized checks)
- ✅ Modified: `src/elements/group-shp.ts` (optimized checks)
- ✅ Documentation: `docs/features/phase4_completion.md` (comprehensive summary)
- ✅ Git commit with semantic-release compatible message

### Success Criteria

- [ ] Normal view: <5 editorMode checks total
- [ ] Early returns make code flow clear
- [ ] No redundant checks in editor-only paths
- [ ] All functionality works identically
- [ ] Final documentation complete

---

## Quick Reference

### Starting a Phase

1. **Open new session** in VS Code with Copilot
2. **Copy the session prompt** for the current phase
3. **Paste into chat** and wait for AI to read context and implement
4. **Test the changes** thoroughly
5. **Approve** if all tests pass
6. AI will **document and commit**
7. AI will **provide next phase prompt**
8. **Start new session** with next prompt

### Testing Checklist (Use for All Phases)

**Normal View (editorMode=false)**:
- [ ] Elements render correctly
- [ ] No drag functionality (expected)
- [ ] No console errors
- [ ] Performance is good

**Editor View (editorMode=true)**:
- [ ] Drag single element in room
- [ ] Drag element in group
- [ ] Drag group itself
- [ ] Drag nested groups (2-3 levels)
- [ ] Escape key cancels drag
- [ ] Click selects element
- [ ] Blue outline on selected element
- [ ] 5px threshold before drag starts
- [ ] No console errors
- [ ] No memory leaks (check with DevTools)

### Commit Message Format

All commits must follow Angular convention for semantic-release:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types used in this plan**:
- `refactor`: Phase 1, 3, 4 (no behavior change)
- `perf`: Phase 2 (performance improvement)
- `fix`: If any bugs are found

**Scopes**:
- `drag`: For drag-and-drop related changes
- `render`: For rendering changes
- `code-quality`: For code organization
- `optimization`: For performance optimizations

### Document Each Phase

After each phase, create `docs/features/phaseN_completion.md` with:

1. **Summary**: What was done
2. **Changes**: Files modified, lines changed
3. **Testing**: What was tested
4. **Metrics**: Actual measurements (if applicable)
5. **Issues**: Any problems encountered
6. **Next Steps**: Brief pointer to next phase

This provides continuity between sessions.

---

## Progress Tracking

| Phase | Status | Estimated Effort | Priority | Date Completed |
|-------|--------|-----------------|----------|----------------|
| Phase 1: Extract DragController | 🔴 Not Started | 32 hours (1 week) | Critical | - |
| Phase 2: Split Render Paths | ⏳ Pending Phase 1 | 24 hours (4 days) | High | - |
| Phase 3: Extract Helper Methods | ⏳ Pending Phase 2 | 20 hours (3 days) | Medium | - |
| Phase 4: Add Editor Guards | ⏳ Pending Phase 3 | 12 hours (2 days) | Low | - |

**Total Estimated Effort**: 88 hours (~2.5 weeks)

---

## Notes

- **Use subagents extensively**: The prompts instruct AI to use subagents for implementation to save context
- **Test thoroughly**: User testing is critical between phases
- **Document everything**: Completion docs ensure continuity
- **Can stop after any phase**: Each phase delivers independent value
- **Keep behavior identical**: No user-facing changes, only internal improvements

---

## Current Status

**Ready to begin Phase 1**

Use the "Session Prompt for Phase 1" above to start a new session.

Good luck with the refactoring! 🚀
