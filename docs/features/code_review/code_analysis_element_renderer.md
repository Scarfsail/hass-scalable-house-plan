# Code Quality Analysis: element-renderer-shp.ts

**Date**: February 8, 2026  
**File**: `src/components/element-renderer-shp.ts`  
**Total Lines**: 796

## Executive Summary

The `element-renderer-shp.ts` file has significant code quality issues that impact maintainability, performance, and separation of concerns. The primary issue is the **renderElements function** (lines 364-673), which violates multiple SOLID principles and mixes runtime rendering logic with editor-specific behavior.

**Key Issues**:
- **Performance**: Event handlers recreated on every render (even when editorMode=false)
- **SoC**: Editor logic deeply embedded in rendering logic
- **Maintainability**: Single 310-line function handling 8+ distinct responsibilities
- **Memory leaks**: Event listeners added but never properly cleaned up

---

## 1. DRY (Don't Repeat Yourself) Violations

### 1.1 Position Calculation Repetition (Lines 293-326)

**Location**: `calculatePositionStyles()` function

**Issue**: Nearly identical code blocks for `left`, `top`, `right`, `bottom` position calculations.

```typescript
// Lines 293-301 (left)
if (plan.left !== undefined) {
    if (typeof plan.left === 'string' && plan.left.includes('%')) {
        style.left = plan.left;
    } else if (typeof plan.left === 'number') {
        const scaledLeft = plan.left * horizontalPositionScale;
        const percentage = (scaledLeft / (roomBounds.width * scale)) * 100;
        style.left = `${percentage}%`;
    }
}

// Lines 303-311 (top) - Same pattern
// Lines 313-321 (right) - Same pattern  
// Lines 323-331 (bottom) - Same pattern
```

**Impact**:
- 4× code duplication (80 lines total)
- Bug fixes must be applied in 4 places
- Changes to position logic require 4 updates

**Suggested Refactor**:
```typescript
function calculatePositionValue(
    value: number | string | undefined,
    scale: number,
    positionScale: number,
    boundSize: number,
    property: 'left' | 'top' | 'right' | 'bottom'
): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value === 'string' && value.includes('%')) return value;
    if (typeof value === 'number') {
        const scaled = value * positionScale;
        const percentage = (scaled / (boundSize * scale)) * 100;
        return `${percentage}%`;
    }
}

// Usage:
style.left = calculatePositionValue(plan.left, scale, horizontalPositionScale, roomBounds.width, 'left');
style.top = calculatePositionValue(plan.top, scale, verticalPositionScale, roomBounds.height, 'top');
// etc.
```

---

### 1.2 Drag Handler Boilerplate Repetition (Lines 487-623)

**Location**: `renderElements()` - drag event handlers

**Issue**: Each element gets identical drag handler functions created inline.

**Impact**:
- Handlers recreated on every render for every element (N × M problem)
- Memory allocations even when editorMode=false
- Difficult to test drag logic in isolation

**Suggested Refactor**: Extract handlers to a separate class/factory:
```typescript
class ElementDragController {
    constructor(
        private uniqueKey: string,
        private dragState: DragState,
        private positionData: PositionCache,
        private roomBounds: { width: number; height: number },
        // ... other context
    ) {}
    
    handlePointerDown(e: PointerEvent) { /* ... */ }
    handlePointerMove(e: PointerEvent) { /* ... */ }
    handlePointerUp(e: PointerEvent) { /* ... */ }
    handleKeyDown(e: KeyboardEvent) { /* ... */ }
    
    cleanup() { /* remove event listeners */ }
}
```

---

### 1.3 Scale Detection Logic (Lines 533-554)

**Location**: `handlePointerMove()` - parent scale compensation

**Issue**: Complex DOM traversal with shadow DOM handling duplicated for scale detection.

```typescript
// Lines 533-554: Complex tree walk to find parent transform
let element: HTMLElement | null = wrapper;
for (let i = 0; i < 20 && element; i++) {
    const nextElement: HTMLElement | null = element.parentElement;
    if (nextElement) {
        element = nextElement;
    } else {
        // Cross shadow DOM boundary...
        const root = element.getRootNode();
        // ... 20+ lines of complex logic
    }
}
```

**Impact**:
- Runs on every pointer move during drag
- Hard to test
- Hard to understand
- Could be cached after first detection

**Suggested Refactor**:
```typescript
function findParentScale(element: HTMLElement): { scaleX: number; scaleY: number } {
    // Extract to separate, testable function
    // Consider caching the result
}
```

---

## 2. Separation of Concerns (SoC) Violations

### 2.1 The "God Function" - renderElements() (Lines 364-673)

**Location**: Main `renderElements()` function

**Issue**: Single function with **8+ distinct responsibilities**:

1. Element structure caching and validation
2. Position calculation and caching  
3. Card creation and lifecycle management
4. Group element special handling
5. Editor mode state management
6. Drag-and-drop logic
7. Selection state management
8. Event handler creation
9. HTML template generation

**Impact**:
- **Maintainability**: 310-line function impossible to understand quickly
- **Testing**: Cannot test drag logic without involving rendering
- **Debugging**: Stack traces point to massive function
- **Performance**: Editor logic executes even when editorMode=false

**Suggested Refactor**:
```typescript
// Separate concerns into focused functions:
function renderElements(options: ElementRendererOptions) {
    const elements = prepareElementStructure(options);
    return elements.map(elementData => renderElement(elementData, options));
}

function renderElement(elementData: ElementData, options: ElementRendererOptions) {
    const card = prepareElementCard(elementData, options);
    const styles = calculateElementStyles(elementData, options);
    
    if (options.editorMode) {
        return renderEditableElement(card, styles, elementData, options);
    } else {
        return renderStaticElement(card, styles, elementData, options);
    }
}
```

---

### 2.2 Editor Logic Deeply Embedded in Rendering (Lines 425-648)

**Location**: Throughout `renderElements()` map function

**Issue**: Runtime rendering mixed with editor-specific concerns:

```typescript
// Lines 425-427: Drag state initialization
let dragState: DragState | undefined;
if (isDraggable) {
    if (!dragStateMap.has(uniqueKey)) {
        dragStateMap.set(uniqueKey, { /* ... */ });
    }
}

// Lines 430-442: Card property setup mixing runtime + editor
if (isGroupElementType(elementConfig)) {
    card.mode = mode;                    // Runtime
    card.editorMode = editorMode;        // Editor
    card.selectedElementKey = selectedElementKey;  // Editor
    card.onElementClick = onElementClick;          // Editor
}

// Lines 444-451: Pointer events manipulation
if (editorMode && !isGroupElementType(elementConfig)) {
    card.style.pointerEvents = 'none';
}

// Lines 487-623: All drag handlers inline
const handlePointerDown = (e: PointerEvent) => { /* 50+ lines */ };
const handlePointerMove = (e: PointerEvent) => { /* 70+ lines */ };
const handlePointerUp = (e: PointerEvent) => { /* 40+ lines */ };
```

**Impact**:
- Editor code runs even when editorMode=false (performance)
- Cannot reuse rendering logic for non-editor contexts
- Drag logic cannot be tested independently
- Difficult to add new editor features without modifying renderer

**Suggested Refactor**:
```typescript
// Separate editor concerns into a decorator/wrapper pattern:
function renderElements(options: ElementRendererOptions) {
    const elements = prepareElements(options);
    
    if (options.editorMode) {
        return wrapWithEditorBehavior(elements, options);
    } else {
        return renderStaticElements(elements, options);
    }
}
```

---

### 2.3 Card Lifecycle Management Mixed with Rendering (Lines 421-442)

**Location**: Card property assignment in render loop

**Issue**: Card creation, configuration, and rendering happen in same location.

```typescript
// Lines 421-442
const card = getOrCreateElementCard(uniqueKey, entity, elementConfig, createCardElement, elementCards);
if (card && hass) {
    card.hass = hass;
    
    // 15+ lines of property assignments
    if (isGroupElementType(elementConfig)) {
        card.mode = mode;
        card.createCardElement = createCardElement;
        // ... 8 more property assignments
    }
    
    // Pointer events manipulation
    if (editorMode && !isGroupElementType(elementConfig)) {
        card.style.pointerEvents = 'none';
    }
}
```

**Impact**:
- Card property updates run on every render
- Difficult to track what properties are essential vs optional
- No clear contract for what properties cards need

**Suggested Refactor**:
```typescript
interface ElementCardConfig {
    hass: HomeAssistant;
    mode?: 'overview' | 'detail';
    editorProps?: EditorProperties;
    groupProps?: GroupProperties;
}

function configureElementCard(
    card: any,
    config: ElementCardConfig
): void {
    // Single responsibility: configure card properties
}
```

---

## 3. Performance Concerns

### 3.1 Event Handlers Created on Every Render (Lines 468-623)

**Location**: Drag handler creation in `renderElements()` map

**Critical Issue**: Three heavy functions created for **every element** on **every render**.

```typescript
// Lines 487-508: handlePointerDown (22 lines)
const handlePointerDown = (e: PointerEvent) => {
    // Complex logic with closure over dragState, elementConfig, etc.
};

// Lines 510-577: handlePointerMove (68 lines!)
const handlePointerMove = (e: PointerEvent) => {
    // VERY complex logic including DOM tree traversal
};

// Lines 579-623: handlePointerUp (45 lines)
const handlePointerUp = (e: PointerEvent) => {
    // Event dispatching and cleanup
};

// Lines 625-642: handleKeyDown (18 lines)
const handleKeyDown = (e: KeyboardEvent) => {
    // Escape key handling
};
```

**Performance Impact**:
- **N × M problem**: If you have 50 elements, 200 functions are created on every render
- Each function closes over: `isDraggable`, `dragState`, `DRAG_THRESHOLD`, `uniqueKey`, `elementConfig`, `positionData`, `roomBounds`, `scale`, `scaleRatio`, `entity`, `roomIndex`
- Memory allocations even when `editorMode=false`
- Garbage collector pressure on every state update

**Measurement**: For a house with 5 rooms × 10 elements = 50 elements:
- 50 × 4 handlers = 200 function allocations per render
- At 60 FPS during drag: 12,000 function allocations per second

**Suggested Refactor**:
```typescript
// Option 1: Shared handler with lookup
const dragControllers = new Map<string, ElementDragController>();

const handlePointerDown = (e: PointerEvent) => {
    const uniqueKey = (e.currentTarget as HTMLElement).dataset.uniqueKey;
    const controller = dragControllers.get(uniqueKey);
    controller?.handlePointerDown(e);
};

// Option 2: Web Component with internal handlers
class EditableElement extends HTMLElement {
    private dragController: ElementDragController;
    
    connectedCallback() {
        this.addEventListener('pointerdown', this.handlePointerDown);
        // Only create handlers once per element
    }
}
```

---

### 3.2 Drag State Initialization When Not Needed (Lines 425-434)

**Location**: Drag state creation in render loop

**Issue**: Drag state map is populated even when `editorMode=false`.

```typescript
// Lines 425-434
const isDraggable = editorMode && plan;

let dragState: DragState | undefined;
if (isDraggable) {
    if (!dragStateMap.has(uniqueKey)) {
        dragStateMap.set(uniqueKey, {
            state: 'idle',
            startX: 0,
            startY: 0,
            pointerId: null,
            originalTransform: ''
        });
    }
    dragState = dragStateMap.get(uniqueKey)!;
}
```

**Impact**:
- Map lookups on every render for every element
- Memory used for drag state that never gets used in non-editor mode
- Conditional check evaluated for every element

**Suggested Refactor**:
```typescript
// Move drag state management outside renderElements
// Only initialize when entering editor mode
function enterEditorMode(elements: ElementData[]) {
    elements.forEach(el => {
        dragStateMap.set(el.uniqueKey, createDragState());
    });
}

function exitEditorMode() {
    dragStateMap.clear();
}
```

---

### 3.3 Document Event Listener Leak (Lines 652-660)

**Location**: Keyboard event listener registration

**Critical Issue**: Event listeners added but never removed!

```typescript
// Lines 652-660
if (isDraggable) {
    // Note: We add a global keydown listener, which is not ideal but needed for escape handling
    // This will be cleaned up when the element is removed
    document.addEventListener('keydown', handleKeyDown);
}
```

**Problems**:
1. New listener added on **every render** (not just when element is added)
2. No cleanup when element is removed
3. No cleanup when component unmounts
4. `handleKeyDown` is a new function every render, so `removeEventListener` won't work

**Impact**:
- Memory leak: listeners accumulate over time
- Performance degradation: multiple handlers for same event
- Incorrect behavior: old handlers still fire after element removed

**Suggested Refactor**:
```typescript
// Option 1: Single global handler
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const activeKey = getActiveDragKey();
        if (activeKey) {
            cancelDrag(activeKey);
        }
    }
});

// Option 2: Use Lit's lifecycle with directive
class DragDirective extends Directive {
    private keyHandler = (e: KeyboardEvent) => { /* ... */ };
    
    render() {
        document.addEventListener('keydown', this.keyHandler);
        return html`...`;
    }
    
    disconnected() {
        document.removeEventListener('keydown', this.keyHandler);
    }
}
```

---

### 3.4 Group Property Assignment on Every Render (Lines 430-442)

**Location**: Group element property setup

**Issue**: Properties set on every render, even if unchanged.

```typescript
// Lines 430-442
if (isGroupElementType(elementConfig)) {
    card.mode = mode;
    card.createCardElement = createCardElement;
    card.elementCards = elementCards;
    card.editorMode = editorMode;
    card.selectedElementKey = selectedElementKey;
    card.onElementClick = onElementClick;
    card.groupUniqueKey = uniqueKey;
    card.scale = scale;
    card.scaleRatio = scaleRatio;
    card.roomIndex = roomIndex;
    card.roomBounds = roomBounds;
}
```

**Impact**:
- Property assignments trigger change detection in group card
- Causes unnecessary re-renders of group children
- Reference comparisons fail (e.g., `roomBounds` is a new object each time)

**Suggested Refactor**:
```typescript
// Only update if actually changed
if (isGroupElementType(elementConfig)) {
    updateCardPropsIfChanged(card, {
        mode,
        createCardElement,
        elementCards,
        editorMode,
        selectedElementKey,
        onElementClick,
        groupUniqueKey: uniqueKey,
        scale,
        scaleRatio,
        roomIndex,
        roomBounds
    });
}
```

---

## 4. Long Methods / Complexity

### 4.1 renderElements() - 310 Lines (Lines 364-673)

**Cyclomatic Complexity**: ~25 (very high)

**Responsibilities** (8+):
1. Cache key generation
2. Element structure preparation
3. Info box entity creation
4. Element iteration and mapping
5. Position style lookup/calculation
6. Card creation and configuration
7. Drag state management
8. Event handler creation
9. Selection state management
10. HTML template generation

**Suggested Breakdown**:
```typescript
// ~30 lines each, focused responsibility
function renderElements(options: ElementRendererOptions) {
    const context = prepareRenderContext(options);
    const elements = prepareElementStructure(context);
    return elements.map(el => renderElement(el, context));
}

function prepareRenderContext(options: ElementRendererOptions): RenderContext {
    // Extract caches, calculate scales, prepare info box
}

function prepareElementStructure(context: RenderContext): ElementData[] {
    // Get cached or compute element structure
}

function renderElement(elementData: ElementData, context: RenderContext): TemplateResult {
    const card = prepareCard(elementData, context);
    const styles = prepareStyles(elementData, context);
    const handlers = context.editorMode 
        ? prepareEditorHandlers(elementData, context)
        : {};
    
    return renderElementTemplate(card, styles, handlers, elementData);
}
```

---

### 4.2 handlePointerMove() - 70 Lines (Lines 510-577)

**Issue**: Complex parent scale detection embedded in drag handler

```typescript
// Lines 533-554: Parent scale detection (22 lines)
let element: HTMLElement | null = wrapper;
for (let i = 0; i < 20 && element; i++) {
    const nextElement: HTMLElement | null = element.parentElement;
    if (nextElement) {
        element = nextElement;
    } else {
        // Cross shadow DOM boundary
        const root = element.getRootNode();
        if (root instanceof ShadowRoot && root.host) {
            element = root.host as HTMLElement;
        } else {
            break;
        }
    }
    if (!element) break;
    
    const transform = window.getComputedStyle(element).transform;
    if (transform && transform !== 'none') {
        try {
            const matrix = new DOMMatrix(transform);
            const scaleX = matrix.a;
            const scaleY = matrix.d;
            if (Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01) {
                dx = dx / scaleX;
                dy = dy / scaleY;
                break;
            }
        } catch (e) {
            // Continue searching
        }
    }
}
```

**Suggested Refactor**:
```typescript
interface ParentScale {
    scaleX: number;
    scaleY: number;
}

function findParentScale(element: HTMLElement): ParentScale {
    // Extract to focused, testable function
    // Could cache result per element
}

function compensateForParentScale(
    dx: number,
    dy: number,
    scale: ParentScale
): { dx: number; dy: number } {
    return {
        dx: dx / scale.scaleX,
        dy: dy / scale.scaleY
    };
}
```

---

### 4.3 calculatePositionStyles() - 95 Lines (Lines 267-362)

**Responsibilities**:
1. Position scaling mode calculation
2. Left/top/right/bottom position calculation (4× repetition)
3. Transform origin calculation
4. Transform scale calculation
5. Custom style application
6. Style string building

**Suggested Breakdown**:
```typescript
function calculatePositionStyles(...): PositionCache {
    const positionScales = calculatePositionScales(plan, scale, scaleRatio);
    const baseStyles = calculateBasePositionStyles(plan, positionScales, roomBounds, scale);
    const transformData = calculateTransformData(plan, elementScale);
    const styleString = buildStyleString(baseStyles, transformData, plan.style);
    
    return { ...baseStyles, ...transformData, styleString };
}
```

---

## 5. Additional Code Smells

### 5.1 Magic Numbers

- Line 469: `DRAG_THRESHOLD = 5` (what unit? why 5?)
- Line 536: `for (let i = 0; i < 20 && element; i++)` (why 20 levels?)
- Line 551: `if (Math.abs(scaleX - 1) > 0.01)` (why 0.01 threshold?)

### 5.2 Type Safety Issues

- Line 421-442: `card` is type `any`, no property type checking
- Line 661: `as HTMLElement` assertions throughout
- Line 635: `(e.currentTarget as HTMLElement)` - no validation

### 5.3 Comment Debt

- Lines 655-656: "Note: We add a global keydown listener, which is not ideal..."
  - Comment acknowledges problem but doesn't fix it
- Line 502-504: Comment about shadow DOM click propagation
  - Complex logic that should be extracted to named function

---

## 6. Refactoring Priority Recommendations

### High Priority (Do First)

1. **Extract drag handlers to separate controller** (Lines 487-642)
   - Impact: Major performance improvement
   - Risk: Low (well-defined interface)
   - Effort: 2-4 hours

2. **Fix event listener leak** (Lines 652-660)
   - Impact: Prevents memory leak
   - Risk: Low
   - Effort: 30 minutes

3. **Split renderElements into separate editor/runtime paths** (Lines 364-673)
   - Impact: Major performance + maintainability improvement
   - Risk: Medium (requires careful testing)
   - Effort: 4-6 hours

### Medium Priority

4. **Extract position calculation helper** (Lines 293-326)
   - Impact: Reduces duplication, improves maintainability
   - Risk: Low
   - Effort: 1-2 hours

5. **Extract parent scale detection** (Lines 533-554)
   - Impact: Improves testability and readability
   - Risk: Low
   - Effort: 1 hour

6. **Optimize card property updates** (Lines 430-442)
   - Impact: Reduces unnecessary re-renders
   - Risk: Low
   - Effort: 1-2 hours

### Low Priority (Technical Debt)

7. Extract position style calculation into smaller functions
8. Add proper TypeScript types for `card` and element config
9. Document magic numbers with named constants

---

## 7. Suggested Target Architecture

```typescript
// Separate concerns into focused modules:

// 1. Element preparation (pure functions)
function prepareElements(options: ElementRendererOptions): ElementData[] {
    // Structure, metadata, caching
}

// 2. Style calculation (pure functions)
function calculateElementStyles(data: ElementData, context: RenderContext): ElementStyles {
    // Position, transform, custom styles
}

// 3. Card management (stateful)
class ElementCardManager {
    getOrCreateCard(key: string, config: ElementConfig): HTMLElement;
    configureCard(card: HTMLElement, config: CardConfiguration): void;
}

// 4. Editor behavior (separate concern)
class ElementEditorController {
    private dragControllers = new Map<string, DragController>();
    
    attachEditorBehavior(element: HTMLElement, data: ElementData): void;
    detachEditorBehavior(element: HTMLElement): void;
}

// 5. Rendering (composition)
function renderElements(options: ElementRendererOptions): TemplateResult[] {
    const elements = prepareElements(options);
    
    if (options.editorMode) {
        return renderEditableElements(elements, options);
    } else {
        return renderStaticElements(elements, options);
    }
}

function renderStaticElements(elements: ElementData[], options: ElementRendererOptions): TemplateResult[] {
    return elements.map(el => {
        const card = cardManager.getOrCreateCard(el.uniqueKey, el.config);
        const styles = calculateElementStyles(el, options);
        return html`<div style="${styles}">${card}</div>`;
    });
}

function renderEditableElements(elements: ElementData[], options: ElementRendererOptions): TemplateResult[] {
    return elements.map(el => {
        const card = prepareEditableCard(el, options);
        const styles = calculateElementStyles(el, options);
        const isSelected = el.uniqueKey === options.selectedElementKey;
        
        return html`
            <editable-element
                .elementData=${el}
                .styles=${styles}
                .isSelected=${isSelected}
                @element-click=${options.onElementClick}
            >
                ${card}
            </editable-element>
        `;
    });
}
```

---

## 8. Testing Implications

Current code is **extremely difficult to test** because:

1. **renderElements** has 8+ responsibilities - requires mocking everything
2. Drag logic is embedded in render function - cannot test drag without rendering
3. Event handlers are closures over local state - cannot test in isolation
4. No clear interfaces or contracts

**After refactoring**, tests become straightforward:

```typescript
// Pure function tests
describe('calculatePositionStyles', () => {
    it('should calculate left position correctly', () => {
        const result = calculatePositionStyles(plan, scale, ratio, bounds, elementScale);
        expect(result.style.left).toBe('50%');
    });
});

// Controller tests
describe('ElementDragController', () => {
    it('should start drag after threshold', () => {
        const controller = new ElementDragController(config);
        controller.handlePointerDown(mockEvent);
        controller.handlePointerMove(mockEvent5pxAway);
        expect(controller.isDragging).toBe(true);
    });
});

// Integration tests
describe('renderElements', () => {
    it('should render static elements when editorMode is false', () => {
        const options = { ...baseOptions, editorMode: false };
        const result = renderElements(options);
        expect(result[0].querySelector('.element-wrapper')).not.toHaveEventAttribute('pointerdown');
    });
});
```

---

## 9. Summary of Recommendations

| Issue | Priority | Effort | Impact | Lines Affected |
|-------|----------|--------|--------|----------------|
| Extract drag handlers | **High** | 2-4h | Performance++, Maintainability++ | 487-642 |
| Fix event listener leak | **High** | 30m | Correctness++ | 652-660 |
| Split editor/runtime paths | **High** | 4-6h | Performance++, SoC++ | 364-673 |
| DRY position calculation | Medium | 1-2h | Maintainability+ | 293-326 |
| Extract scale detection | Medium | 1h | Testability+ | 533-554 |
| Optimize card updates | Medium | 1-2h | Performance+ | 430-442 |

**Total High Priority Effort**: 7-11 hours  
**Expected Impact**: Major performance improvement, much better maintainability

---

## 10. Next Steps

1. **Review this analysis** with team
2. **Prioritize refactoring work** (suggest starting with high-priority items)
3. **Create feature branch** for refactoring
4. **Implement changes incrementally** with tests
5. **Benchmark performance** before/after
6. **Document new architecture** in code comments

---

**Analysis conducted**: February 8, 2026  
**Analyst**: GitHub Copilot (Claude Sonnet 4.5)
