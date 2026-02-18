# Light Room Background — Implementation Tracking

## Overview

Three implementation groups, each with its own solution design document. Work proceeds group by group: implement → review → user tests → commit → next group.

Reference documents:
- Problem analysis: `problem_analysis_overview.md`
- Group A solution: `room_svg/solution_design.md`
- Group B solution: `element_visibility/solution_design.md`
- Group C solution: `configurability/solution_design.md`

---

## Plan

### Group A — Room SVG Layer
`room_svg/solution_design.md`

Fixes: idle rooms transparent by default (cat1), borders hidden by default (cat3), user rgba alpha honored in gradients (cat4).

- [x] Implement
- [x] Code review
- [x] User verification
- [x] Committed

---

### Group B — Element Visibility
`element_visibility/solution_design.md`

Implemented as halo drop-shadows instead of the planned element backdrop (backdrop was rejected after user testing). Changes:
- `src/utils/plan-styles.ts` — new shared `planTextShadow` and `planDropShadow` constants
- `analog-text-shp` — `planTextShadow` on span + .text-overlay; `planDropShadow` on gauge bar
- `state-icon-shp` — `planDropShadow` on icon container; title label uses `planTextShadow` (black rectangle removed)
- `motion-sensor-shp` — `planDropShadow` on ha-icon

- [x] Implement
- [x] Code review
- [x] User verification
- [x] Committed

---

### Group C — Configurability & Editor UX
`configurability/solution_design.md`

Config schema (`background_mode` preset, `resolveEffectiveConfig`), color swatches in editor, new editor sections, `room.color` field in per-room editor.

- [ ] Implement
- [ ] Code review
- [ ] User verification
- [ ] Committed

---

## Current State

**Next step:** Start Group C — see `configurability/solution_design.md`.
