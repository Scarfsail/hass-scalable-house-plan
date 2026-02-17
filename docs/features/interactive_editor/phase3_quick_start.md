# Phase 3 Quick Start Guide - Bi-Directional Sync

## Status: 🔄 READY FOR IMPLEMENTATION

**Feature:** Interactive Editor Mode - Phase 3: Bi-Directional Sync (Editor → Preview)
**Prerequisites:** ✅ Phase 1 & 2 Complete (commit: 5636c06)

---

## Context

**Phase 1 & 2 Status:** ✅ COMPLETE
- Users can toggle between Preview/Editor modes
- Clicking element in preview selects it and shows blue outline
- Selection state syncs from preview → editor

**Phase 3 Goal:** Make expanding an element in the editor highlight it in the preview

---

## What Needs to Be Done

When a user expands an element in the editor panel (e.g., clicks to open element configuration), that element should be highlighted in the preview with the same blue outline.

### Event Flow
```
User expands element in editor
    ↓
editor-element-shp emits 'element-focused' event
    ↓
Event bubbles to scalable-house-plan-editor.ts
    ↓
_handleElementFocus() updates _selectedElementKey
    ↓
_configChanged() passes selection to preview
    ↓
Preview shows blue outline on focused element
```

---

## Implementation Steps

### Step 1: Find Editor Element Component

**File:** `src/cards/editor-components/editor-element-shp.ts`

This component renders individual element editors in the editor panel. Need to:
1. Find where elements are expanded/collapsed
2. Add event emission when element is expanded

**Search Pattern:**
```bash
# Find the editor element component
Glob: "**/editor-element-shp.ts"

# Look for expansion/collapse logic
Grep pattern: "expand|collapse|@click"
```

### Step 2: Emit Element Focus Event

Add event emission when element is expanded:

```typescript
// In editor-element-shp.ts, when element is expanded:
private _handleExpand(): void {
    // Existing expansion logic...

    // NEW: Emit element-focused event
    const event = new CustomEvent('element-focused', {
        detail: {
            uniqueKey: this.uniqueKey,  // Need to ensure this exists
            entityId: this.element.entity
        },
        bubbles: true,
        composed: true
    });
    this.dispatchEvent(event);
}
```

### Step 3: Handle Focus Event in Editor

**File:** `src/cards/scalable-house-plan-editor.ts`

Add event handler (similar to _handleElementSelection):

```typescript
// Add to connectedCallback
window.addEventListener('scalable-house-plan-element-focused', this._handleElementFocus as EventListener);

// Add to disconnectedCallback
window.removeEventListener('scalable-house-plan-element-focused', this._handleElementFocus as EventListener);

// Add handler method
private _handleElementFocus = (ev: CustomEvent): void => {
    const { uniqueKey } = ev.detail;
    this._selectedElementKey = uniqueKey;
    this._configChanged();
}
```

**Note:** If editor-element-shp is a child of the editor (not separate like the preview), we may be able to use local event bubbling instead of window events.

---

## Key Considerations

### 1. UniqueKey Generation

The element in the editor needs the same `uniqueKey` format as used in the renderer:
- Format: `entity_id` for simple elements
- Format: `custom:group-shp-x-y-...` for groups
- Check existing `generateUniqueKey()` function in element-renderer-shp.ts

### 2. Expansion Detection

Need to find where editor element components handle expansion. Look for:
- Click handlers on element headers
- Expansion state properties
- Accordion/collapsible UI patterns

### 3. Avoid Infinite Loops

Ensure focus event doesn't trigger re-expansion in editor:
- Only emit on user-initiated expansion
- Not on programmatic expansion from selection

---

## Testing Checklist

After implementation:
- [ ] Click element in preview → element highlighted
- [ ] Expand element in editor → same element highlighted in preview
- [ ] Expanding different element → highlight moves
- [ ] No infinite loop between editor and preview
- [ ] Works in both overview and detail views (if applicable)

---

## Files to Modify

**Estimated:** 2 files, ~25 lines

1. **editor-element-shp.ts** (~15 lines)
   - Add event emission on expansion
   - Ensure uniqueKey is available

2. **scalable-house-plan-editor.ts** (~10 lines)
   - Add event listener in connected/disconnectedCallback
   - Add _handleElementFocus method

---

## Reference

- **Full Spec:** `docs/features/feature_interactive_editor.md` (lines 1038-1064)
- **Implementation Status:** `docs/features/IMPLEMENTATION_STATUS.md`
- **Phase 2 Completion:** See commit 5636c06

---

## Debugging Tips

If element doesn't highlight:
1. Check console for `element-focused` event emission
2. Verify uniqueKey matches between editor and renderer
3. Check if _selectedElementKey is updating in editor
4. Verify _configChanged() is called after update

If infinite loop occurs:
1. Add flag to track programmatic vs user expansion
2. Only emit event on user-initiated expansion
3. Use debouncing if needed

---

**Estimated Time:** 30-40 minutes
**Difficulty:** Medium (need to understand editor component structure)

---

_Created: 2026-02-03 | Ready for Phase 3 implementation_
