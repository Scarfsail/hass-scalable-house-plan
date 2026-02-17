# Bug: Group and Group Child Drag Behavior

## Status: ✅ FIXED (2026-02-07)

Commit: `02ca772` - "fix(drag): enable group container drag with child event filtering"

## Original Problem
This bug was discovered during **Phase 1** of the Drag & Drop Element Repositioning feature (`feature_drag_drop_element.md`).

Phase 1 added pointer-event-based drag to element-wrapper divs in `renderElements()` in `element-renderer-shp.ts`. During testing, group elements caused a regression: clicking on group children stopped working. The fix excluded groups from drag handlers entirely (using `isGroupElementType()` check), which restored click-to-select for children but now **neither the group itself nor its children can be dragged**.

## Desired Behavior

The drag behavior should mirror the existing **click-to-select** behavior:

1. **Click/drag on empty space inside a group** → the **group itself** is selected/dragged (the whole group moves)
2. **Click/drag on an element inside the group** → that **child element** is selected/dragged (moves within the group)

This is exactly how click-to-select already works:
- Click empty group space → group selected
- Click a child element → child selected

## The Problem

Currently in `element-renderer-shp.ts`, the drag handlers (`pointerdown`, `pointermove`, `pointerup`) are conditionally attached to element-wrapper divs:

```typescript
const isDraggable = editorMode && plan && !isGroupElementType(elementConfig);
```

This means:
- **Regular elements**: draggable ✅
- **Group elements**: NOT draggable ❌ (excluded by `!isGroupElementType()`)
- **Group children**: NOT draggable ❌ (children are rendered inside `group-shp.ts`, not by `renderElements()`)

## What Needs to Happen

### For Group Container Drag (group itself moves)
- The group's element-wrapper in `renderElements()` needs drag handlers, but they must NOT intercept pointer events that target child elements inside the group.
- The existing click handler already solves this problem for clicks — it checks whether the click came from a nested wrapper and ignores it if so. The drag handler needs a similar approach.

### For Group Child Drag (child moves within group)
- Group children are rendered inside `group-shp.ts` as `child-wrapper` divs.
- These child-wrappers need their own drag handlers (Phase 3 of the feature spec).
- On drop, the event should include `parentGroupKey` so the editor knows to update the child's position within the group config.

## Key Files to Analyze

| File | What to look at |
|---|---|
| `src/components/element-renderer-shp.ts` | `renderElements()` — where element-wrapper divs are created, drag handlers attached, and the `isDraggable` check that currently excludes groups |
| `src/elements/group-shp.ts` | `_renderChildren()` or similar — where child-wrapper divs are rendered inside the group. This is where child drag handlers would go (Phase 3) |
| `src/components/element-renderer-shp.ts` | `handleClick()` — the existing click handler that correctly distinguishes group clicks from child clicks (lines ~410-430). This pattern should be reused for drag |

## Solution Implemented

1. **Removed `!isGroupElementType()` exclusion** from `isDraggable` check in `renderElements()`
2. **Added `composedPath()` walk in `handlePointerDown`** to detect when pointer events target a `child-wrapper` inside the group's shadow DOM
3. When a child-wrapper is detected in the composed path, group drag is skipped (returns early)

### Key Technical Detail: Shadow DOM Event Retargeting
The initial attempt used `e.target` + `parentElement` walk (same as `handleClick`), but this failed because:
- `child-wrapper` divs live inside `group-shp`'s shadow DOM  
- `e.target` is retargeted to the shadow host element (the `group-shp` custom element)
- A `parentElement` walk can't cross shadow boundaries to find the `child-wrapper`

**Solution**: Use `e.composedPath()` which returns the full event path including shadow DOM internals.

## Acceptance Criteria

- [x] Dragging on empty space inside a group drags the whole group (group's element-wrapper moves)
- [ ] Dragging on a child element inside a group drags only that child (child-wrapper moves) — **Deferred to Phase 3**
- [x] Clicking on empty group space still selects the group (no regression)
- [x] Clicking on a child element still selects the child (no regression)
- [x] Regular (non-group) element drag still works (no regression)

## Implementation Phases Context

This bug is part of the **Drag & Drop Element Repositioning** feature. See `docs/features/feature_drag_drop_element.md` for the full spec.

### Phase Status:
| Phase | Description | Status |
|---|---|---|
| **Phase 1** | Core drag in `element-renderer-shp.ts` | ✅ Done for regular elements, **this bug** blocks group drag |
| **Phase 2** | Config update in `scalable-house-plan-editor.ts` | Not started |
| **Phase 3** | Group child drag in `group-shp.ts` | Not started |
| **Phase 4** | Overview mode scaling adjustment | Not started |

### Recommended Approach:
1. Fix this bug (enable group container drag with proper child event filtering)
2. Build & test Phase 1 with the fix
3. Commit Phase 1 once user approves
4. Continue with Phase 2 → Phase 3 → Phase 4 as specified in `feature_drag_drop_element.md`

**Note**: Group child drag (dragging individual children within the group) is Phase 3 work. This bug fix should focus on making the **group container itself** draggable. If child drag can be done cleanly as part of this fix, great — otherwise defer to Phase 3.

## Logging
Debug logging is already in place (console logs with `[Drag]` prefix). Keep it active until all phases are tested and approved.
