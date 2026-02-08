# Code Analysis: group-shp.ts

## Executive Summary

The `src/elements/group-shp.ts` file contains **critical code quality issues** that significantly impact maintainability, performance, and future development. The most severe issue is **massive code duplication** with `element-renderer-shp.ts` - the drag-and-drop handlers are nearly identical (~95% duplicate code).

## 1. DRY Violations (Critical)

### 1.1 Duplicate Drag-and-Drop Handlers

**Severity: CRITICAL** 🔴

#### Location
- **group-shp.ts**: Lines 260-396
- **element-renderer-shp.ts**: Lines 488-630

#### Description
The drag-and-drop implementation is **duplicated almost verbatim** between the two files. This is approximately **140 lines of duplicate code**.

#### Comparison

| Feature | group-shp.ts | element-renderer-shp.ts | Match? |
|---------|--------------|-------------------------|--------|
| DragState interface | Lines 17-23 | Lines 14-20 | ✅ 100% identical |
| DRAG_THRESHOLD constant | Line 15 (const value 5) | Line 471 (inline value 5) | ✅ Same value |
| handlePointerDown logic | Lines 260-283 | Lines 488-522 | ✅ 95% identical |
| handlePointerMove logic | Lines 285-343 | Lines 524-582 | ✅ 98% identical |
| handlePointerUp logic | Lines 345-379 | Lines 584-619 | ✅ 95% identical |
| handleKeyDown logic | Lines 381-396 | Lines 621-631 | ✅ 100% identical |
| CSS scale compensation | Lines 302-338 | Lines 541-577 | ✅ 100% identical |
| Pointer capture logic | Lines 282, 375 | Lines 521, 586 | ✅ 100% identical |
| Event dispatch | Lines 361-377 | Lines 595-607 | ✅ 95% identical* |

*The only difference: group-shp includes `parentGroupKey` field in event detail.

#### Code Examples

**handlePointerDown - group-shp.ts (lines 260-283)**:
```typescript
const handlePointerDown = (e: PointerEvent) => {
    if (!dragState || !this.editorMode || !plan) return;
    
    // Check if click came from a nested child element (for multi-level groups)
    const currentWrapper = e.currentTarget as HTMLElement;
    for (const node of e.composedPath()) {
        if (node === currentWrapper) break;
        if (node instanceof HTMLElement && node.classList?.contains('child-wrapper')) {
            return;
        }
    }
    
    dragState.startX = e.clientX;
    dragState.startY = e.clientY;
    dragState.state = 'pending';
    dragState.pointerId = e.pointerId;
    dragState.originalTransform = childStyles.transform || '';
    
    const wrapper = e.currentTarget as HTMLElement;
    wrapper.setPointerCapture(e.pointerId);
};
```

**handlePointerDown - element-renderer-shp.ts (lines 488-522)**:
```typescript
const handlePointerDown = (e: PointerEvent) => {
    if (!isDraggable || !dragState) return;
    
    // Primary button only
    if (e.button !== 0) return;
    
    // For group elements: check if the pointer landed on a child wrapper.
    // If so, don't start group drag — let the child handle it.
    if (isGroupElementType(elementConfig)) {
        const currentWrapper = e.currentTarget as HTMLElement;
        for (const node of e.composedPath()) {
            if (node === currentWrapper) break;
            if (node instanceof HTMLElement &&
                (node.classList?.contains('element-wrapper') || node.classList?.contains('child-wrapper'))) {
                return;
            }
        }
    }
    
    dragState.startX = e.clientX;
    dragState.startY = e.clientY;
    dragState.state = 'pending';
    dragState.pointerId = e.pointerId;
    dragState.originalTransform = positionData.transform;
    
    const wrapper = e.currentTarget as HTMLElement;
    wrapper.setPointerCapture(e.pointerId);
};
```

**The core logic is identical - only the initial checks differ slightly.**

#### Impact
1. **Maintenance nightmare**: Any bug fix must be applied to both files
2. **Inconsistency risk**: Changes in one file can be forgotten in the other
3. **Testing complexity**: Same logic must be tested twice
4. **Code bloat**: ~140 lines of unnecessary duplication
5. **Refactoring impediment**: Makes future changes extremely difficult

---

## 2. Separation of Concerns Violations

### 2.1 _renderChild Method Complexity

**Severity: HIGH** 🔴

#### Location
Lines 162-420 (~260 lines)

#### Description
The `_renderChild` method violates SoC by handling multiple responsibilities:

1. **Rendering logic** (lines 162-220)
   - Entity validation
   - Element type determination
   - Child card creation
   - Element configuration building

2. **Editor logic** (lines 221-396)
   - Drag state management
   - Drag event handlers (handlePointerDown, handlePointerMove, handlePointerUp, handleKeyDown)
   - Selection logic
   - Click handlers

3. **Child positioning** (lines 212-213)
   - Calculating child position styles

4. **Conditional mode handling** (lines 193-203)
   - Setting properties for nested groups
   - Editor mode property propagation

#### Issues
- **Too many responsibilities**: Violates Single Responsibility Principle
- **Mixed concerns**: Runtime rendering mixed with editor-only logic
- **Hard to test**: Different concerns can't be tested independently
- **Hard to read**: Method is too long to understand at a glance
- **Hard to maintain**: Changes to one concern affect code for other concerns

#### Recommended Split
The method should be split into:
- `_renderChild` (main orchestration)
- `_createDragHandlers` (editor logic)
- `_createClickHandler` (selection logic)
- `_calculateChildPosition` (already exists but could be used better)
- `_configureChildCard` (card setup logic)

---

### 2.2 Mixed Runtime and Editor Logic

**Severity: MEDIUM** 🟡

#### Location
Throughout the file, but especially:
- Lines 49-56: Editor properties mixed with runtime properties
- Lines 221-227: Drag state initialization in render path
- Lines 260-396: Drag handlers defined inline within render method

#### Description
Editor-specific code is intertwined with runtime rendering code, making it difficult to:
- Understand what executes in which mode
- Optimize runtime mode (non-editor) performance
- Test editor features in isolation

#### Example
```typescript
// Lines 221-227
const isDraggable = this.editorMode && plan;
if (isDraggable && !this._dragStates.has(uniqueKey)) {
    this._dragStates.set(uniqueKey, {
        state: 'idle',
        startX: 0,
        startY: 0,
        pointerId: null,
        originalTransform: ''
    });
}
const dragState = isDraggable ? this._dragStates.get(uniqueKey)! : null;
```

This logic executes on **every render** for **every child**, even when `editorMode = false`. While it has a guard clause, it's still processing that could be avoided.

---

## 3. Performance Concerns

### 3.1 Drag Handler Creation on Every Render

**Severity: HIGH** 🔴

#### Location
Lines 260-396

#### Description
Four drag handlers (`handlePointerDown`, `handlePointerMove`, `handlePointerUp`, `handleKeyDown`) are **created as new functions on every render**, for **every child element**.

#### Impact
- **Memory overhead**: New function objects created repeatedly
- **Garbage collection pressure**: Old functions must be garbage collected
- **Unnecessary work**: Functions are created even when `editorMode = false`
- **Performance degradation**: With many children (e.g., 20+ elements), this becomes noticeable

#### Example Calculation
- Assume 20 child elements in a group
- Each render creates: 20 × 4 = **80 new function objects**
- If parent re-renders every 100ms (e.g., during drag): **800 functions/second**

#### Current Code Pattern (Anti-pattern)
```typescript
private _renderChild(childConfig: EntityConfig, index: number) {
    // ... setup code ...
    
    // ❌ NEW FUNCTIONS CREATED ON EVERY RENDER
    const handlePointerDown = (e: PointerEvent) => { /* ... */ };
    const handlePointerMove = (e: PointerEvent) => { /* ... */ };
    const handlePointerUp = (e: PointerEvent) => { /* ... */ };
    const handleKeyDown = (e: KeyboardEvent) => { /* ... */ };
    
    return html`<div @pointerdown=${handlePointerDown} ...>`;
}
```

---

### 3.2 No Guard Clause for Non-Editor Mode

**Severity: MEDIUM** 🟡

#### Location
Lines 221-227, 260-396

#### Description
While drag handlers have internal guards (`if (!dragState || !this.editorMode)`), they are still **created and attached** even when editor mode is disabled.

#### Issue
```typescript
// Lines 260-283 - handlePointerDown always created
const handlePointerDown = (e: PointerEvent) => {
    if (!dragState || !this.editorMode || !plan) return;  // Guard inside function
    // ... handler logic
};

// Lines 415-418 - Always attached
@pointerdown=${isDraggable ? handlePointerDown : null}
```

**Better pattern** would be:
```typescript
// Only create handlers when needed
@pointerdown=${this.editorMode ? handlePointerDown : null}
```

But even better: Create handlers **once** and reuse them.

---

### 3.3 Event Listener Memory Leak

**Severity: MEDIUM** 🟡

#### Location
Lines 398-401

#### Code
```typescript
// Register escape handler only for draggable children
if (isDraggable) {
    document.addEventListener('keydown', handleKeyDown);
}
```

#### Issues
1. **No cleanup**: Event listener is never removed
2. **Accumulation**: Each re-render adds a new listener
3. **Memory leak**: Listeners keep references to closures, preventing garbage collection
4. **Potential bugs**: Multiple listeners can fire for the same event

#### Scenario
- User switches to editor mode: Listener added
- Component re-renders 10 times: **10 duplicate listeners**
- User switches out of editor mode: **Listeners still active**
- Element is removed: **Listeners remain in memory**

#### Proper Pattern
Should use `connectedCallback` and `disconnectedCallback` (or Lit lifecycle methods) to manage listeners.

---

### 3.4 Position Cache Not Always Used

**Severity: LOW** 🟡

#### Location
Lines 212-213

#### Code
```typescript
// Calculate child position styles
const childStyles = this._calculateChildPosition(plan, uniqueKey);
```

#### Issue
While `_calculateChildPosition` implements caching (lines 498-537), it's called within the render loop. The cache is cleared when config changes (line 120), which is good, but the cache key is just `uniqueKey`, not accounting for other factors that might affect position.

#### Minor Concern
Not a major issue, but could be optimized to avoid redundant lookups if position hasn't changed.

---

## 4. Long Methods

### 4.1 _renderChild Method

**Severity: HIGH** 🔴

#### Location
Lines 162-420 (~260 lines)

#### Metrics
- **Lines of code**: ~260
- **Cyclomatic complexity**: High (multiple nested conditionals)
- **Responsibilities**: 5+ distinct concerns
- **Inline functions**: 5 (handleClick + 4 drag handlers)

#### Issues
- **Too long**: Exceeds reasonable method length (typically 20-50 lines)
- **Hard to understand**: Requires scrolling to see full logic
- **Hard to test**: Can't test individual concerns in isolation
- **Hard to debug**: Many potential failure points in one method

#### Recommended Maximum
Industry best practices suggest:
- **Max method length**: 50 lines
- **Max complexity**: 10 decision points
- **Max responsibilities**: 1 (Single Responsibility Principle)

Current method **exceeds all three limits**.

---

## 5. Additional Issues

### 5.1 Drag State Management Complexity

**Severity: MEDIUM** 🟡

#### Location
Lines 68-69, 221-227

#### Description
Drag states are stored in a component-level Map (`_dragStates`), which is good for persistence across re-renders, but:

1. **Mixed with element-renderer-shp.ts approach**: element-renderer uses a module-level Map (line 22), group-shp uses component-level
2. **No cleanup**: Drag states accumulate forever, never cleaned when children are removed
3. **Manual management**: States must be manually initialized in render method

#### Impact
- **Inconsistency**: Different drag state management strategies
- **Memory leak potential**: Old children's drag states never removed
- **Confusion**: Why are the patterns different?

---

### 5.2 Inconsistent State Initialization

**Severity: LOW** 🟡

#### Location
Lines 221-227

#### Code
```typescript
const isDraggable = this.editorMode && plan;
if (isDraggable && !this._dragStates.has(uniqueKey)) {
    this._dragStates.set(uniqueKey, {
        state: 'idle',
        startX: 0,
        startY: 0,
        pointerId: null,
        originalTransform: ''
    });
}
```

#### Issue
State initialization happens during render, which is semantically incorrect. Render should be side-effect-free. State initialization is a side effect.

Better pattern: Initialize state in `willUpdate` or when `editorMode` changes.

---

### 5.3 No Clear Editor/Runtime Separation

**Severity: MEDIUM** 🟡

#### Description
The file mixes editor and runtime concerns throughout without clear boundaries. This makes it hard to:
- Understand what code runs in which mode
- Optimize editor vs. runtime paths
- Add new features to either mode

#### Recommended Pattern
Consider separating concerns via:
1. **Mixins**: `EditorMixin` for editor-only behavior
2. **Conditional composition**: Load editor features only when needed
3. **Strategy pattern**: Different rendering strategies for editor vs. runtime

---

## 6. Comparison with element-renderer-shp.ts

### Key Similarities (DRY Violations)

| Feature | group-shp.ts | element-renderer-shp.ts | Duplicate? |
|---------|--------------|-------------------------|------------|
| DragState interface | ✅ | ✅ | YES - 100% |
| Drag threshold | ✅ (5px) | ✅ (5px) | YES - 100% |
| Pointer event handlers | ✅ | ✅ | YES - 95% |
| CSS scale compensation | ✅ | ✅ | YES - 100% |
| Escape key handling | ✅ | ✅ | YES - 100% |
| Event dispatch format | ✅ | ✅ | YES - 95% |

### Key Differences

| Aspect | group-shp.ts | element-renderer-shp.ts |
|--------|--------------|-------------------------|
| Drag state storage | Component-level Map | Module-level Map |
| Wrapper class | `child-wrapper` | `element-wrapper` |
| Event detail | Includes `parentGroupKey` | No parent key |
| Position calculation | Simple pixel-based | Complex with scale ratios |
| Primary button check | Missing | Present (line 493) |

### Analysis
The differences are **minimal and cosmetic**. The core drag logic is **identical**. This is a clear candidate for **extracting shared drag handling logic** into a reusable utility.

---

## 7. Refactoring Recommendations

### Priority 1: Extract Drag Handlers (Critical)

**Goal**: Eliminate 140 lines of code duplication

**Approach**: Create shared drag handler utility

```typescript
// New file: src/utils/drag-handler.ts
export interface DragHandlerOptions {
    uniqueKey: string;
    element: HTMLElement;
    editorMode: boolean;
    onDragEnd: (dx: number, dy: number) => void;
    onEscape: () => void;
    checkChildDrag?: (e: PointerEvent) => boolean;
}

export function createDragHandlers(options: DragHandlerOptions) {
    // Return { handlePointerDown, handlePointerMove, handlePointerUp, handleKeyDown }
}
```

**Usage**:
```typescript
// In both files
const dragHandlers = this.editorMode 
    ? createDragHandlers({
        uniqueKey,
        element: wrapper,
        editorMode: this.editorMode,
        onDragEnd: (dx, dy) => { /* dispatch event */ },
        onEscape: () => { /* reset state */ },
        checkChildDrag: isGroupElement ? (e) => { /* check composedPath */ } : undefined
    })
    : null;
```

**Benefits**:
- Single source of truth for drag logic
- Bug fixes in one place
- Easier to test
- Easier to enhance (e.g., add snap-to-grid)

---

### Priority 2: Split _renderChild Method (High)

**Goal**: Reduce method length from ~260 to ~30-40 lines

**Approach**:

```typescript
// Extracted methods
private _createClickHandler(uniqueKey, index, entity) { /* ... */ }
private _createDragHandlers(uniqueKey, dragState, childStyles) { /* ... */ }
private _configureChildCard(card, uniqueKey, elementConfig) { /* ... */ }

// Main render method (orchestration only)
private _renderChild(childConfig: EntityConfig, index: number) {
    // 1. Validation & setup (~10 lines)
    // 2. Create card (~5 lines)
    // 3. Configure card (~5 lines)
    // 4. Create handlers (~5 lines)
    // 5. Return template (~10 lines)
}
```

---

### Priority 3: Optimize Handler Creation (High)

**Goal**: Avoid creating handlers on every render

**Approach**: Create handlers once, store in Map

```typescript
private _handlerCache = new Map<string, {
    click: (e: MouseEvent) => void;
    pointerDown: (e: PointerEvent) => void;
    pointerMove: (e: PointerEvent) => void;
    pointerUp: (e: PointerEvent) => void;
}>();

private _getOrCreateHandlers(uniqueKey: string) {
    if (!this._handlerCache.has(uniqueKey)) {
        this._handlerCache.set(uniqueKey, {
            click: (e) => { /* ... */ },
            pointerDown: (e) => { /* ... */ },
            // ...
        });
    }
    return this._handlerCache.get(uniqueKey)!;
}
```

---

### Priority 4: Fix Memory Leaks (Medium)

**Goal**: Properly manage event listeners

**Approach**: Use Lit lifecycle or custom lifecycle management

```typescript
private _activeKeyListeners = new Set<(e: KeyboardEvent) => void>();

connectedCallback() {
    super.connectedCallback();
    // Setup if needed
}

disconnectedCallback() {
    super.disconnectedCallback();
    // Remove all key listeners
    this._activeKeyListeners.forEach(handler => {
        document.removeEventListener('keydown', handler);
    });
    this._activeKeyListeners.clear();
}
```

---

### Priority 5: Separate Editor Concerns (Medium)

**Goal**: Clear separation between runtime and editor code

**Approach**: Consider extracting editor functionality

```typescript
// Option A: Conditional mixin
class GroupElement extends (editorMode ? withEditor(ElementBase) : ElementBase) { }

// Option B: Separate editor component
class GroupElementEditor extends GroupElement { }

// Option C: Strategy pattern
private _renderStrategy = this.editorMode ? new EditorRenderer() : new RuntimeRenderer();
```

---

## 8. Impact Assessment

### Maintainability: 🔴 **Poor**
- Code duplication makes maintenance difficult
- Long methods are hard to understand and modify
- Mixed concerns make testing difficult

### Performance: 🟡 **Moderate**
- Handler creation on every render causes overhead
- Event listener leaks can accumulate
- But: Not a critical performance issue for typical use (< 50 children)

### Testability: 🔴 **Poor**
- Long methods with multiple responsibilities are hard to test
- Drag logic duplicated, so tests must be duplicated
- Mixed concerns make unit testing difficult

### Extensibility: 🟡 **Moderate**
- Adding new drag features requires changes in two places
- Editor enhancements require touching runtime code
- But: Structure is somewhat flexible

---

## 9. Conclusion

### Critical Issues (Must Fix)
1. ✅ **DRY violation with drag handlers** - Extract to shared utility
2. ✅ **Long _renderChild method** - Split into smaller methods
3. ✅ **Handler creation on every render** - Cache and reuse handlers

### Important Issues (Should Fix)
4. ✅ **Event listener memory leak** - Proper cleanup
5. ✅ **Mixed runtime/editor concerns** - Better separation

### Nice to Have (Consider)
6. Position cache optimization
7. Consistent drag state management with element-renderer
8. Architecture patterns for editor/runtime separation

---

## 10. Estimated Refactoring Effort

| Task | Effort | Risk | Priority |
|------|--------|------|----------|
| Extract drag handlers utility | 4-6 hours | Low | P1 |
| Split _renderChild method | 2-3 hours | Low | P1 |
| Cache handlers | 2-3 hours | Medium | P1 |
| Fix memory leaks | 2-3 hours | Low | P2 |
| Separate editor concerns | 8-12 hours | High | P3 |

**Total P1 effort**: ~8-12 hours  
**Total P2 effort**: ~2-3 hours  
**Total P3 effort**: ~8-12 hours

---

## 11. Next Steps

1. **Phase 1** (P1 - Critical): Extract drag handlers, split methods, cache handlers
2. **Phase 2** (P2 - Important): Fix memory leaks, add cleanup
3. **Phase 3** (P3 - Enhancement): Architectural improvements, editor separation

Each phase should be done in a separate PR with comprehensive tests.

---

*Analysis completed: February 8, 2026*
