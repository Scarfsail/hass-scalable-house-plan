# 🚀 START PHASE 3 HERE

**Date:** 2026-02-03
**Current Status:** Phase 1 & 2 Complete, Ready for Phase 3
**Latest Commit:** 5391f88

---

## Quick Context

This is a Home Assistant custom card project implementing an **Interactive Editor Mode** feature in 5 phases.

### ✅ What's Complete (Phases 1-2)

**Phase 1: Core State Management**
- Editor mode toggle button (Preview/Editor modes)
- State management infrastructure (_editorMode, _selectedElementKey)
- Config passing pattern via _configChanged()

**Phase 2: Preview Click-to-Select**
- Click elements in preview to select them
- Blue outline (3px) appears on selected elements
- Selection syncs from preview → editor
- Uses window-level events to cross HA's editor/preview boundary

### 🔄 What's Next (Phase 3)

**Phase 3: Bi-Directional Sync (Editor → Preview)**

Make expanding an element in the editor highlight it in the preview.

**Goal:** When user expands element configuration in editor panel, that element gets highlighted in preview with blue outline.

---

## Implementation Quick Start

### 1. Read Documentation
Start with these files in order:
1. `docs/features/phase3_quick_start.md` - Implementation guide
2. `docs/features/IMPLEMENTATION_STATUS.md` - Current status
3. `docs/features/feature_interactive_editor.md` (lines 1038-1064) - Full spec

### 2. Find Editor Element Component
```bash
# Search for the editor element component
Glob: "**/editor-element-shp.ts"
```

This component renders individual element editors in the editor panel.

### 3. Implementation Steps

**Step 1:** Find where elements are expanded in editor-element-shp.ts
**Step 2:** Emit 'element-focused' event on expansion
**Step 3:** Handle event in scalable-house-plan-editor.ts
**Step 4:** Update _selectedElementKey and call _configChanged()

**Estimated Time:** 30-40 minutes
**Files to Modify:** 2 files, ~25 lines

---

## Key Technical Patterns (From Phase 2)

### Event Communication Pattern
```typescript
// In component that emits event
const event = new CustomEvent('scalable-house-plan-element-focused', {
    detail: { uniqueKey: '...' },
    bubbles: true,
    composed: true
});
window.dispatchEvent(event);

// In editor that receives event
window.addEventListener('scalable-house-plan-element-focused', handler);
```

### Config Update Pattern
```typescript
// In editor after state change
this._selectedElementKey = uniqueKey;
this._configChanged();  // This syncs to preview
```

---

## File Structure Reference

### Core Files (Modified in Phase 1-2)
- `src/cards/scalable-house-plan.ts` - Main card component
- `src/cards/scalable-house-plan-editor.ts` - Editor component
- `src/components/scalable-house-plan-room.ts` - Room renderer (has CSS for selection)
- `src/components/element-renderer-shp.ts` - Element rendering logic

### Editor Components (Need for Phase 3)
- `src/cards/editor-components/editor-element-shp.ts` - ⭐ MODIFY THIS
- `src/cards/editor-components/editor-room-shp.ts` - Contains element editors
- `src/cards/editor-components/editor-rooms-shp.ts` - Contains room editors

---

## Build & Test

### Build Command
```bash
npm run build-prod
```

### Testing
1. Edit card in Home Assistant
2. Toggle to "Editor" mode
3. Open room detail in preview
4. Expand element in editor panel
5. **Expected:** Blue outline appears on that element in preview

---

## Debugging Tips

### If element doesn't highlight:
1. Check console for event emission
2. Verify uniqueKey matches between editor and preview
3. Check if _selectedElementKey updates in editor
4. Verify _configChanged() is called

### UniqueKey Format
- Simple elements: `entity_id` (e.g., `binary_sensor.window_contact`)
- Groups: `custom:group-shp-x-y-...`
- See `generateUniqueKey()` in element-renderer-shp.ts

---

## Success Criteria

Phase 3 is complete when:
- [ ] Expanding element in editor highlights it in preview
- [ ] Blue outline appears (same as Phase 2)
- [ ] No infinite loop between editor and preview
- [ ] Works alongside Phase 2 (clicking preview still works)
- [ ] Build succeeds with no TypeScript errors

---

## Git Workflow

```bash
# After Phase 3 implementation
git add <modified files>
git commit -m "feat(interactive-editor): implement Phase 3 - bi-directional sync"
```

---

## Need Help?

1. **Stuck finding editor component?** Use Glob tool: `**/editor-element-shp.ts`
2. **Stuck finding expansion logic?** Use Grep: pattern `expand|collapse|@click`
3. **Event not firing?** Add console.log to verify emission
4. **Selection not updating?** Check if _configChanged() is called

---

## Phase 4 Preview

After Phase 3, Phase 4 will add:
- Clicking element in preview → auto-expands it in editor
- Auto-scroll to expanded element
- Full round-trip selection cycle

---

**Ready to start?** Open `docs/features/phase3_quick_start.md` and begin! 🚀

_Last Updated: 2026-02-03 | Commit: 5391f88_
