# Pinch-to-Zoom Architecture Proposal

## Summary

Add pinch-to-zoom and pan gesture support **exclusively to the overview**, without affecting the navigation/header, detail room view, or entities view.

---

## How the Current System Works

The overview renders the floor plan image in a two-div structure inside `scalable-house-plan-overview.ts`:

```
<div> (outer - viewport/clip boundary, visibleWidth x visibleHeight)
  <div style="transform: scale(baseScaleX, baseScaleY); transform-origin: 0 0; width: imageW; height: imageH">
    <img src="..." />
    <scalable-house-plan-room ... /> × N
  </div>
</div>
```

The `baseScaleX / baseScaleY` auto-fit values are computed from `containerSize / imageSize` to fill the container. This is the only transform applied today.

---

## Proposed Architecture

### New file: `src/utils/pinch-zoom-controller.ts`

A self-contained controller class (following the `DragController` pattern) that:

1. Attaches to the **outer viewport div** of the overview with `passive: false` listeners to allow `preventDefault()` (which suppresses browser-native page zoom)
2. Manages `userZoom`, `panX`, `panY` state
3. Directly mutates `innerDiv.style.transform` during gesture (no LitElement re-renders mid-gesture)
4. Calls a `onGestureEnd` callback so the overview can call `requestUpdate()` to sync Lit's virtual DOM

### Modified file: `src/cards/scalable-house-plan-overview.ts`

- Adds three plain private fields: `_userZoom = 1.0`, `_panX = 0`, `_panY = 0`
- Instantiates `PinchZoomController` in `connectedCallback()`
- Updates the transform in `render()` to compose base scale with user zoom and pan:
  ```
  transform: translate(panX, panY) scale(baseScaleX * userZoom, baseScaleY * userZoom)
  ```
- References to the inner div via `@query` so the controller can manipulate it directly

---

## Gesture State Machine

```
IDLE
  │ touchstart (2 fingers)  → PINCHING (record initial distance + midpoint)
  │ touchstart (1 finger, userZoom > 1)  → PANNING (record initial touch position)
  ↓
PINCHING
  │ touchmove (2 fingers)   → update zoom + pan around focal point → update DOM
  │ touchmove (<2 fingers)  → transition to PANNING (save current state)
  │ touchend / touchcancel  → IDLE (call onGestureEnd)
  ↓
PANNING
  │ touchmove (1 finger)    → update pan → update DOM
  │ touchend / touchcancel  → IDLE (call onGestureEnd)
```

The existing `actionHandler` directive on room polygons already bails out on multi-touch (`ev.touches.length > 1`), so no conflict for pinch gestures. Single-touch events at zoom=1 pass through normally to room tap/hold handlers.

---

## Transform Composition

The inner div gets the **composed transform**:

```
transform: translate(${panX}px, ${panY}px) scale(${baseScaleX * userZoom}, ${baseScaleY * userZoom})
transform-origin: 0px 0px
```

**Zoom-around-focal-point math** (called each `touchmove` during pinch):

Let `(fx, fy)` be the pinch midpoint in the outer div's coordinate space.
Let `z1` = old `userZoom`, `z2` = new `userZoom`.
Let `Sx = baseScaleX`, `Sy = baseScaleY`.

```
newPanX = oldPanX + (fx - oldPanX) * (1 - z2/z1) + (newMidpointX - oldMidpointX)
newPanY = oldPanY + (fy - oldPanY) * (1 - z2/z1) + (newMidpointY - oldMidpointY)
```

The second term keeps the focal content point under the pinch midpoint as zoom changes.
The third term adds panning from midpoint movement (fingers moving in unison).

**Pan constraints** (applied after every update to prevent panning off-screen):

```
effectiveW = imageWidth  * baseScaleX * userZoom
effectiveH = imageHeight * baseScaleY * userZoom

panX = clamp(panX, min(0, viewportW - effectiveW), 0)
panY = clamp(panY, min(0, viewportH - effectiveH), 0)
```

When `userZoom = 1`, `effectiveW ≈ viewportW` so pan constraints force `panX = panY = 0` (no pan at base zoom).

**Zoom limits:**

```
MIN_USER_ZOOM = 1.0    // Cannot zoom out past the auto-fit level
MAX_USER_ZOOM = 5.0    // Reasonable upper bound (optionally config-driven)
```

---

## Detail View Isolation

`scalable-house-plan-detail.ts` computes its own uniform scale independently using `getBoundingClientRect()`. The user zoom state lives only in `ScalableHousePlanOverview` as plain private fields — it is **not passed** to the detail component. No changes to the detail view are needed.

---

## Reset on Window Resize

When the viewport resizes, `hasViewportChanged()` triggers a `requestUpdate()`. The `baseScaleX / baseScaleY` values change, so the pan constraints must be recalculated and applied. The controller will expose a `notifyBaseScaleChanged(baseScaleX, baseScaleY, viewportW, viewportH)` method to clamp pan to the new bounds.

Optionally: reset `userZoom = 1`, `panX = 0`, `panY = 0` on resize to avoid confusing state when the user resizes the browser window.

---

## Files to Create / Modify

| Action | File | Description |
|--------|------|-------------|
| **Create** | `src/utils/pinch-zoom-controller.ts` | Gesture controller: touch handling, zoom/pan math, DOM mutation |
| **Modify** | `src/cards/scalable-house-plan-overview.ts` | Integrate controller, add `@query` refs, compose transform, handle resize |

No changes needed to:
- `scalable-house-plan.ts` (root card)
- `scalable-house-plan-detail.ts` (detail view)
- `scalable-house-plan-room.ts` (room renderer)
- `action-handler.ts` (already handles multi-touch correctly)

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Separate `PinchZoomController` class | Matches project pattern (`DragController`), keeps overview component clean |
| `passive: false` on outer div (not room polygons) | Required to call `preventDefault()` and suppress browser zoom; room polygons remain `passive: true` |
| Direct DOM mutation during gesture | Matches `DragController` + `BoundaryHandles` pattern; avoids expensive LitElement re-renders at 60fps |
| `requestUpdate()` only on gesture end | Standard project pattern; syncs Lit virtual DOM without mid-gesture flicker |
| State lives in overview only | Detail view isolation guaranteed; no state hoisting to root card |
| Pan disabled at `userZoom = 1` | Prevents inadvertent panning at base scale where constraints enforce zero-pan anyway |
