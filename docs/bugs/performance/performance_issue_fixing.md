# Performance Issue Fixing Progress

**Analysis doc:** `docs/bugs/performance/performance_issue_when_running_longer.md`
**Date started:** 2026-02-20

---

## Session Instructions (Permanent)

This document tracks the incremental fix progress for the performance issues found in the analysis.

### Workflow (repeat each session):
1. Read this file to understand current state and next step.
2. Double-check the relevant code before implementing the fix.
3. Analyze potential regressions carefully and adjust plan if needed.
4. Implement the fix.
5. Tell the user what to test (concise, specific steps).
6. After user confirms it works: commit with `perf:` prefix.
7. Update this document (mark fix complete, set next step).
8. Provide a short prompt for the next session referencing this file.

### Commit convention:
- Type: `perf:` (produces a patch release)
- Example: `perf(room): memoize _updateDynamicColor to skip re-renders when color unchanged`

---

## Fix Plan (Priority Order)

### Fix 1 — Memoize `_updateDynamicColor` (Issues 2 + 10) ✅ DONE
- **File:** `src/components/scalable-house-plan-room.ts`
- **Problem:** Every HA state change triggers `_updateDynamicColor()` on all rooms. It always creates new gradient objects (new references), which always trigger LitElement re-renders even when nothing visually changed.
- **Fix:** Before assigning `@state()` properties, compute new color/type/activeLightColor and compare to previous values. Skip all state assignments if nothing changed.
- **Regression risk:** None. Gradient objects are only skipped when color+type+activeLightColor are all identical to previous — the visual output is unchanged.
- **Status:** COMMITTED (`perf(room): memoize _updateDynamicColor`)

---

### Fix 2 — Size-cap position cache (Issue 1) ✅ DONE
- **File:** `src/components/element-renderer-shp.ts`
- **Problem:** `houseCache.position` grows indefinitely with each distinct zoom level (key includes `scale.toFixed(2)`). N elements × M zoom levels = N×M cache entries, never evicted.
- **Fix:** In `preparePositionData()`, before inserting a new entry, check if `posCache.size >= MAX_SIZE`. If so, clear the entire map. Cap at 1000 entries.
- **Regression risk:** On cache clear, all positions are recomputed in the same render (cache miss). No visual regression, small CPU spike on clear event, which only happens at the 1000-entry threshold.
- **Status:** COMMITTED (`perf(cache): cap position cache at 1000 entries to prevent unbounded zoom growth`)

---

### Fix 3 — Debounce `onResize` (Issue 7) ✅ DONE
- **File:** `src/cards/scalable-house-plan.ts`
- **Problem:** `ResizeObserver` fires continuously during window resize (~60/s). Each callback calls `requestUpdate()` with no debounce, causing full re-renders of the card and all children.
- **Fix:** Add a 100ms debounce timer. Clear old timer on each call. Also clear timer in `disconnectedCallback()`.
- **Regression risk:** 100ms delay before card layout updates during resize. Acceptable. No functional regression.
- **Notes:** The root card's ResizeObserver is what observes the HA app div, not the card itself. The debounce must ensure the timer is cleared properly on disconnect.
- **Status:** COMMITTED (part of `perf: fix performance degradation over time (5 issues)`)

---

### Fix 4 — Fix `requestUpdate` in `render()` in detail view (Issue 6) ✅ DONE
- **File:** `src/cards/scalable-house-plan-detail.ts`
- **Problem:** `hasViewportChanged()` and `this.requestUpdate()` called inside `_renderRoomDetail()` (which is called from `render()`). Scheduling a new render from within render() creates unnecessary extra cycles on viewport change.
- **Fix:** Move the viewport change check from `render()` to a `willUpdate()` override.
- **Notes:** The overview has a similar issue in `willUpdate()` but calling `requestUpdate()` inside `willUpdate()` is less harmful than from `render()`. The overview fix can come later or be skipped since ResizeObserver on root card already handles resize. The detail's `render()` call is clearly wrong and should be fixed.
- **Regression risk:** Low. The root card's ResizeObserver already handles resize events. The extra `requestUpdate()` in render was a safety net.
- **Status:** COMMITTED (part of `perf: fix performance degradation over time (5 issues)`)

---

### Fix 5 — Store unsubscribe from `subscribeRenderTemplate` (Issue 5) ✅ DONE
- **File:** `src/elements/base/element-base.ts`
- **Problem:** `subscribeRenderTemplate` discards the returned unsubscribe function, causing WebSocket subscriptions to leak if any element uses this method.
- **Fix:** Store returned unsubscribe functions in a `_templateUnsubscribers` array. Call all in `disconnectedCallback()`.
- **Notes:** Currently no element uses this method, so this is a latent fix. Safe to implement now.
- **Regression risk:** None. Adds cleanup that was missing.
- **Status:** COMMITTED (part of `perf: fix performance degradation over time (5 issues)`)

---

### Fix 6 — Early exit in `ActionHandlerController.mousemove` (Issue 4)
- **File:** `src/utils/action-handler.ts`
- **Problem:** The `mousemove` listener already has `if (!this.timer) return;` guard, but analysis noted this partially. Confirmed: the guard is already present at line 71.
- **Status:** Already implemented — guard exists. No action needed.

---

### Fix 7 — `cleanupDragControllers()` never called (Issue 8, editor-only)
- **File:** `src/components/element-renderer-shp.ts`
- **Problem:** Module-level Maps accumulate state for rooms that no longer exist. The `cleanupDragControllers` function is exported but never called.
- **Notes:** Editor-only issue, low runtime impact. Deferred until after higher-priority fixes.

---

## Current Status

**All priority fixes complete.** Fixes 1–5 committed in `45afbf8`.

**Remaining (low-priority, editor-only):**
- Fix 6 (action-handler mousemove early exit) — already implemented in existing code, no action needed.
- Fix 7 (cleanupDragControllers never called) — editor-only memory issue, deferred.

---

## Session Prompt Template

> Read `docs/bugs/performance/performance_issue_fixing.md` for the current fix plan and progress. Continue with the next fix listed as "NEXT". Follow the workflow: check the code, analyze regressions, implement, tell me what to test, then after confirmation commit and update the doc.
