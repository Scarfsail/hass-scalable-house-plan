# Phase 2 Quick Start Guide

## Files to Read First

When starting Phase 2 implementation, read these files in order:

### 1. Context Files (Read First)
- `docs/features/phase1_completion_summary.md` - What was done in Phase 1
- `docs/features/phase2_implementation_guide.md` - Detailed Phase 2 tasks
- `docs/features/feature_interactive_editor.md` - Full feature specification (lines 987-1036 for Phase 2)

### 2. Files to Modify (Phase 2)

Read these to understand current implementation:

#### a) Main Card (scalable-house-plan.ts)
```bash
Location: src/cards/scalable-house-plan.ts
What to check:
- Line 72-73: Editor mode state properties (added in Phase 1)
- Line 238-244: Overview rendering - need to add props
- Line 253-261: Detail rendering - need to add props
```

#### b) Room Component Files
Need to identify the correct room component files:
```bash
# Overview component
src/cards/scalable-house-plan-overview.ts  (if exists)
OR src/components/scalable-house-plan-overview.ts

# Detail component
src/cards/scalable-house-plan-detail.ts  (if exists)
OR src/components/scalable-house-plan-detail.ts

# Base room component (might be shared)
src/components/scalable-house-plan-room.ts
```

**Action:** Use `Glob` to find these files:
```typescript
pattern: "**/scalable-house-plan-{overview,detail,room}.ts"
```

#### c) Element Renderer
```bash
Location: src/components/element-renderer-shp.ts
What to check:
- Line 18-35: ElementRendererOptions interface (Phase 1 types added)
- Line 334-396: renderElements() function - add click handlers here
- Line 388-392: Element wrapper rendering - modify this
```

#### d) Shared Styles
```bash
Location: src/cards/editor-components/shared-styles.ts
What to check:
- End of file: Add .selected-element styles
```

#### e) Editor Component
```bash
Location: src/cards/scalable-house-plan-editor.ts
What to check:
- Line 246-256: _toggleEditorMode() - reference for new handler
- Where card preview is rendered - add event listener
```

---

## Quick Implementation Steps

### Step 1: Find Room Component Files
```bash
# In terminal or using Glob tool
Glob pattern: "**/scalable-house-plan-{overview,detail}.ts"
```

### Step 2: Update Main Card (5 min)
File: `src/cards/scalable-house-plan.ts`
- Add `.editorMode` and `.selectedElementKey` props to overview component
- Add same props to detail component

### Step 3: Update Room Components (15 min)
Files: Found in Step 1
- Add `@property()` decorators for editorMode and selectedElementKey
- Add `_handleElementClick()` method
- Update `renderElements()` calls to include new options

### Step 4: Update Element Renderer (20 min)
File: `src/components/element-renderer-shp.ts`
- Add click handler function
- Update element wrapper div with click listener and conditional class
- Add cursor style when editor mode active

### Step 5: Add Styles (5 min)
File: `src/cards/editor-components/shared-styles.ts`
- Add `.selected-element` CSS at end of file

### Step 6: Handle Events in Editor (10 min)
File: `src/cards/scalable-house-plan-editor.ts`
- Add `_handleElementSelection()` method
- Find where card is rendered and add `@element-selected` listener

**Total Estimated Time:** 55 minutes

---

## Testing Workflow

After implementation:

1. **Build the project**
   ```bash
   npm run build
   # or
   npm run dev
   ```

2. **Open card in edit mode**
   - Navigate to Lovelace dashboard
   - Add `?edit=1` to URL
   - Open the card editor

3. **Test sequence**
   - Click editor mode toggle (should show "Editor")
   - Open a room detail preview
   - Click on an element in the preview
   - Verify blue outline appears
   - Click another element
   - Verify selection moves

4. **Check browser console**
   - Look for any errors
   - Verify event emissions (if using debug logs)

---

## Troubleshooting Guide

### "Property 'editorMode' does not exist"
- Check that props were added to room component with `@property()` decorator
- Verify import of `@property` from `lit/decorators.js`

### Click handler not firing
- Add console.log in click handler to verify it's called
- Check that `editorMode` is actually `true` (use browser dev tools)
- Verify `pointer-events: auto` is set on element wrapper

### Selection outline not visible
- Inspect element in dev tools
- Check if `.selected-element` class is applied
- Verify CSS is loaded (check computed styles)
- Try increasing z-index or outline width

### Event not bubbling to editor
- Check that `bubbles: true` and `composed: true` are set on CustomEvent
- Verify event name matches: `'element-selected'`
- Check if event listener is attached to correct element

### TypeScript errors
- Check that all types are properly defined
- Verify imports are correct
- Add `| undefined` to optional properties if needed

---

## Key Code Snippets

### Adding Props to Component
```typescript
@property({ type: Boolean }) editorMode = false;
@property({ attribute: false }) selectedElementKey?: string | null;
```

### Emitting Event
```typescript
const event = new CustomEvent('element-selected', {
    detail: { uniqueKey: uniqueKey },
    bubbles: true,
    composed: true
});
this.dispatchEvent(event);
```

### Adding Click Handler
```typescript
const handleClick = (e: MouseEvent) => {
    if (options.editorMode && options.onElementClick) {
        e.stopPropagation();
        e.preventDefault();
        options.onElementClick(uniqueKey, index);
    }
};
```

### Adding Selection Class
```typescript
class="element-wrapper ${uniqueKey === options.selectedElementKey ? 'selected-element' : ''}"
```

---

## Command Reference

```bash
# Search for room components
npx eslint --print-config . | grep -i "room"

# Find all TypeScript files
find src -name "*.ts" | grep -E "(overview|detail|room)"

# Build project
npm run build

# Watch mode (if available)
npm run dev

# Check for TypeScript errors
npx tsc --noEmit
```

---

## Success Criteria

Phase 2 is complete when:
- ✅ Clicking element in editor mode selects it
- ✅ Selected element has visible outline
- ✅ Selection state updates in editor
- ✅ Only one element selected at a time
- ✅ Normal mode behavior unchanged
- ✅ No TypeScript errors
- ✅ No runtime errors in console

---

## Contact

For questions, refer back to:
- Full guide: `docs/features/phase2_implementation_guide.md`
- Feature spec: `docs/features/feature_interactive_editor.md`
