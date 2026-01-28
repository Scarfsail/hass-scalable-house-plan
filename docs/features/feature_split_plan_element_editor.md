# Feature: Split Plan and Element Configuration in Visual Editor

## Analysis

### Current State

Currently, when editing an entity in the visual editor (scalable-house-plan-editor), the "Plan Configuration" section displays a single **ha-yaml-editor** containing the entire `plan` object:

```typescript
// From editor-element-shp.ts
<ha-yaml-editor
    .hass=${this.hass}
    .defaultValue=${planConfig || {}}
    @value-changed=${this._planChanged}
></ha-yaml-editor>
```

The `plan` object structure:
```yaml
plan:
  # Position/layout properties
  left: 100
  top: 50
  width: 30
  
  # Element-specific config
  element:
    type: custom:analog-shp
    value_entity: sensor.temperature
    min: 0
    max: 100
```

### Problem

Users need to edit both positioning (`left`, `top`, `width`, etc.) and element-specific configuration (`element.*`) in the same YAML editor. This leads to:

1. **Clutter**: Position and element config mixed together
2. **Error-prone**: Users may accidentally break structure when editing
3. **No specialized editors**: Can't provide custom UI editors for specific element types
4. **Inflexibility**: Can't show different editors based on element type

### Proposed Solution

Split the single YAML editor into **two separate editing areas**:

#### 1. **Plan Section** (Position & Layout)
- **Editor Type**: YAML editor only (for now - visual form can be added later)
- **Properties**:
  - `left`, `right`, `top`, `bottom`
  - `width`, `height`
  - `overview` (boolean)
  - `position_scaling_horizontal`, `position_scaling_vertical`
  - `style`
  - `disable_dynamic_color`
  - `exclude_from_info_box`
  - `light` ('ambient' | 'normal')

#### 2. **Element Section** (Element-Specific Config)
- **Editor Type**: Dynamic - depends on element type
  - If element type has a visual editor → show custom UI
  - If no visual editor → show YAML editor
- **Properties**: Everything under `element.*`
  - `type` (always shown - determines which editor to use)
  - Element-specific properties (vary by type)

## Implementation Plan

### Phase 1: Refactor Data Structure

**Objective**: Separate plan and element data handling internally

**Tasks**:
1. **Extract interfaces to separate file**: Create `src/cards/types.ts` and move interfaces from `scalable-house-plan.ts`:
   ```typescript
   // src/cards/types.ts
   export type PositionScalingMode = "plan" | "element" | "fixed";

   export interface InfoBoxPosition {
       top?: number;
       bottom?: number;
       left?: number;
       right?: number;
   }

   export interface InfoBoxTypeConfig {
       show?: boolean;
       visible_detail?: boolean;
       visible_overview?: boolean;
       size?: string;
       icon_position?: 'inline' | 'separate';
       element?: Record<string, any>;
   }

   export interface InfoBoxConfig {
       show?: boolean;
       position?: InfoBoxPosition;
       show_background_detail?: boolean;
       show_background_overview?: boolean;
       types?: {
           motion?: InfoBoxTypeConfig;
           occupancy?: InfoBoxTypeConfig;
           temperature?: InfoBoxTypeConfig;
           humidity?: InfoBoxTypeConfig;
       }
   }

   export interface Room {
       name: string;
       area?: string;
       boundary: [number, number][];
       entities: EntityConfig[];
       color?: string;
       elements_clickable_on_overview?: boolean;
       disable_dynamic_color?: boolean;
       info_box?: InfoBoxConfig;
   }

   export interface PlanConfig {
       left?: string | number;
       right?: string | number;
       top?: string | number;
       bottom?: string | number;
       width?: string | number;
       height?: string | number;
       overview?: boolean;
       style?: string | Record<string, string | number>;
       element?: ElementConfig;
       position_scaling_horizontal?: PositionScalingMode;
       position_scaling_vertical?: PositionScalingMode;
       disable_dynamic_color?: boolean;
       exclude_from_info_box?: boolean;
       light?: 'ambient' | 'normal';
   }

   export interface ElementConfig {
       type?: string;
       entity?: string;
       tap_action?: any;
       hold_action?: any;
       double_tap_action?: any;
       [key: string]: any;
   }

   export type EntityConfig = string | {
       entity: string;
       plan?: PlanConfig;
   }

   export interface DynamicColorsConfig {
       motion_occupancy?: string;
       ambient_lights?: string;
       lights?: string;
       default?: string;
       motion_delay_seconds?: number;
   }

   export interface RoomEntityCache {
       allEntityIds: string[];
       ambientLightIds: string[];
       areaEntityIds: string[];
       infoBoxEntityIds: string[];
       motionSensorIds: string[];
       lightIds: string[];
       occupancySensorIds: string[];
   }
   
   // Config interface can stay in scalable-house-plan.ts as it's component-specific
   ```

2. **Update imports** in `scalable-house-plan.ts`:
   ```typescript
   import type { 
       PositionScalingMode,
       InfoBoxPosition,
       InfoBoxTypeConfig,
       InfoBoxConfig,
       Room,
       PlanConfig,
       ElementConfig,
       EntityConfig,
       DynamicColorsConfig,
       RoomEntityCache
   } from './types';
   ```

3. Import interfaces in `editor-element-shp.ts`:
   ```typescript
   import type { PlanConfig, ElementConfig } from './types';
   ```

4. Create state variables in `editor-element-shp.ts` for split configuration:
   ```typescript
   // Plan section contains everything except 'element' property
   @state() private _planSectionConfig?: Omit<PlanConfig, 'element'>;
   
   // Element section contains the 'element' property value
   @state() private _elementSectionConfig?: ElementConfig;
   ```
   
   **Note**: We reuse existing `PlanConfig` and `ElementConfig` interfaces from `types.ts`. 
   The plan section is just `PlanConfig` without the `element` property (using `Omit<PlanConfig, 'element'>`).

5. Add methods to split and merge:
   ```typescript
   private _splitPlanConfig(fullPlan: PlanConfig): { 
       planSection: Omit<PlanConfig, 'element'>, 
       elementSection: ElementConfig 
   } {
       const { element, ...planSection } = fullPlan;
       return { 
           planSection, 
           elementSection: element || {} 
       };
   }
   
   private _mergePlanConfig(
       planSection: Omit<PlanConfig, 'element'>, 
       elementSection: ElementConfig
   ): PlanConfig {
       const result: PlanConfig = { ...planSection };
       if (elementSection && Object.keys(elementSection).length > 0) {
           result.element = elementSection;
       }
       return result;
   }
   ```

### Phase 2: Create Plan Section Editor

**Objective**: Build YAML editor for plan properties (visual form deferred to future)

**Tasks**:
1. Create `editor-plan-section-shp.ts` component:
   ```typescript
   @customElement("editor-plan-section-shp")
   export class EditorPlanSectionShp extends LitElement {
       @property({ attribute: false }) hass!: HomeAssistant;
       @property({ type: Object }) planSection!: Omit<PlanConfig, 'element'>;
       
       protected render() {
           return html`
               <ha-yaml-editor
                   .hass=${this.hass}
                   .defaultValue=${this.planSection}
                   @value-changed=${this._planChanged}
               ></ha-yaml-editor>
           `;
       }
       
       private _planChanged(ev: CustomEvent) {
           this.dispatchEvent(new CustomEvent('plan-changed', {
               detail: { value: ev.detail.value },
               bubbles: true,
               composed: true
           }));
       }
   }
   ```

2. **Future Enhancement**: Add visual form with toggle
   - Smart position inputs (either left OR right, not both)
   - Validation and error handling
   - Default values from schema

### Phase 3: Create Element Section Editor

**Objective**: Build dynamic editor that adapts to element type

**Tasks**:
1. Create `editor-element-section-shp.ts` component:
   ```typescript
   @customElement("editor-element-section-shp")
   export class EditorElementSectionShp extends LitElement {
       @property({ attribute: false }) hass!: HomeAssistant;
       @property({ type: Object }) elementSection!: ElementConfig;
       @state() private _useYamlEditor: boolean = false;
       
       protected async firstUpdated() {
           // Check if element type has a visual editor
           this._useYamlEditor = !(await this._hasVisualEditor());
       }
       
       private async _hasVisualEditor(): Promise<boolean> {
           const elementType = this.elementSection?.type;
           if (!elementType) return false;
           
           // Check if custom editor exists for this type
           // e.g., check for 'editor-analog-shp' for 'custom:analog-shp'
           const editorTagName = this._getEditorTagName(elementType);
           return customElements.get(editorTagName) !== undefined;
       }
       
       protected render() {
           return html`
               <!-- Element type selector (always visible) -->
               <div class="element-type-selector">
                   <label>Element Type</label>
                   <ha-textfield
                       .value=${this.elementSection?.type || ''}
                       @input=${this._typeChanged}
                       placeholder="custom:element-name"
                   ></ha-textfield>
               </div>
               
               <!-- Dynamic editor content -->
               ${this._renderEditor()}
               
               <!-- Toggle to YAML if visual editor available -->
               ${!this._useYamlEditor ? html`
                   <button @click=${() => this._useYamlEditor = true}>
                       Switch to YAML
                   </button>
               ` : ''}
           `;
       }
       
       private _renderEditor() {
           if (this._useYamlEditor) {
               return html`
                   <ha-yaml-editor
                       .hass=${this.hass}
                       .defaultValue=${this.elementSection}
                       @value-changed=${this._yamlChanged}
                   ></ha-yaml-editor>
               `;
           }
           
           // Render custom visual editor for this element type
           const editorTag = this._getEditorTagName(this.elementSection?.type);
           // Dynamic element rendering would go here
           return html`<!-- Custom editor component -->`;
       }
   }
   ```

### Phase 4: Update `editor-element-shp.ts`

**Objective**: Integrate the two new sub-editors

**Tasks**:
1. Replace single YAML editor with two sections:
   ```typescript
   protected render() {
       // ... existing entity picker code ...
       
       return html`
           <!-- Existing entity picker section -->
           ${!this._isNoEntity ? html`
               <!-- Entity picker code -->
           ` : ''}
           
           <!-- NEW: Split configuration sections -->
           <div class="config-sections">
               <!-- Plan Section (collapsible) -->
               <div class="section plan-section">
                   <div class="section-header" @click=${this._togglePlanSection}>
                       <ha-icon icon="mdi:floor-plan"></ha-icon>
                       <span>Plan (Position & Layout)</span>
                       <ha-icon 
                           icon="mdi:chevron-${this._planSectionExpanded ? 'up' : 'down'}"
                       ></ha-icon>
                   </div>
                   ${this._planSectionExpanded ? html`
                       <editor-plan-section-shp
                           .hass=${this.hass}
                           .planSection=${this._planSectionConfig}
                           @plan-changed=${this._onPlanSectionChanged}
                       ></editor-plan-section-shp>
                   ` : ''}
               </div>
               
               <!-- Element Section (collapsible) -->
               <div class="section element-section">
                   <div class="section-header" @click=${this._toggleElementSection}>
                       <ha-icon icon="mdi:puzzle"></ha-icon>
                       <span>Element (Type & Properties)</span>
                       <ha-icon 
                           icon="mdi:chevron-${this._elementSectionExpanded ? 'up' : 'down'}"
                       ></ha-icon>
                   </div>
                   ${this._elementSectionExpanded ? html`
                       <editor-element-section-shp
                           .hass=${this.hass}
                           .elementSection=${this._elementSectionConfig}
                           @element-changed=${this._onElementSectionChanged}
                       ></editor-element-section-shp>
                   ` : ''}
               </div>
           </div>
       `;
   }
   ```

2. Update change handlers:
   ```typescript
   private _onPlanSectionChanged(ev: CustomEvent) {
       this._planSectionConfig = ev.detail.value;
       this._updateFullConfig();
   }
   
   private _onElementSectionChanged(ev: CustomEvent) {
       this._elementSectionConfig = ev.detail.value;
       this._updateFullConfig();
   }
   
   private _updateFullConfig() {
       const fullPlan = this._mergePlanConfig(
           this._planSectionConfig,
           this._elementSectionConfig
       );
       const entityId = typeof this.entity === 'string' 
           ? this.entity 
           : this.entity.entity;
       
       const updatedEntity = {
           entity: entityId,
           plan: fullPlan
       };
       
       this._dispatchUpdate(updatedEntity);
   }
   ```

### Phase 5: Add Element-Specific Visual Editors (Future Enhancement)

**Objective**: Create visual editors for common element types

**Example**: Visual editor for `analog-shp` element:
```typescript
@customElement("editor-analog-shp")
export class EditorAnalogShp extends LitElement {
    @property({ attribute: false }) hass!: HomeAssistant;
    @property({ type: Object }) config!: any;
    
    protected render() {
        return html`
            <ha-entity-picker
                label="Value Entity"
                .hass=${this.hass}
                .value=${this.config.value_entity}
                @value-changed=${this._valueEntityChanged}
            ></ha-entity-picker>
            
            <ha-textfield
                label="Min Value"
                type="number"
                .value=${this.config.min ?? 0}
                @input=${this._minChanged}
            ></ha-textfield>
            
            <ha-textfield
                label="Max Value"
                type="number"
                .value=${this.config.max ?? 100}
                @input=${this._maxChanged}
            ></ha-textfield>
            
            <!-- More element-specific fields... -->
        `;
    }
}
```

## Benefits

### User Experience
1. **Clearer separation**: Position vs element properties are distinct
2. **Focused editing**: Edit plan or element config independently
3. **Better organization**: Less clutter, easier to find what you need
4. **Future-ready**: Foundation for visual editors and group feature

### Developer Experience
1. **Extensible**: Easy to add visual editors for new element types
2. **Maintainable**: Clear separation of concerns
3. **Type-safe**: TypeScript interfaces for each section
4. **Testable**: Each component can be tested independently

## Migration Strategy

1. **Backward compatible**: Old configs still work - data structure unchanged
2. **Gradual rollout**: 
   - Phase 1-2: Split YAML editors (plan vs element)
   - Phase 3-4: Add element-specific visual editors
   - Future: Add visual form for plan section
3. **User preference**: Allow toggling to full YAML mode for advanced users

## Questions to Address

1. **Default state**: Should sections be expanded or collapsed by default?
   - **Answer**: Both sections expanded by default

2. **YAML fallback**: Should we allow toggling to YAML for the entire plan?
   - **Answer**: Yes, add a "Switch to Full YAML" option for advanced users

3. **Element type detection**: How to handle auto-detection when entity changes?
   - **Answer**: Keep existing logic, but show it in the Element section

4. **Validation**: Where should validation errors be shown?
   - **Answer**: Inline in each section, with summary at top if both have errors

5. **No-entity mode**: How does this affect the split?
   - **Answer**: Plan section stays same, Element section becomes required and prominent

## Implementation Status

✅ **Phases 1-4 Complete** (Committed: c639342):
1. **Phase 1**: Extracted interfaces to `types.ts` and added split/merge logic ✅
2. **Phase 2**: Created Plan Section YAML editor component ✅
3. **Phase 3**: Created Element Section editor component (currently YAML only) ✅
4. **Phase 4**: Integrated both sections into `editor-element-shp.ts` ✅

**Current State:**
- Plan section: YAML editor with position/layout properties
- Element section: YAML editor with element type and properties
- Both sections independently collapsible (default: expanded)
- Data structure unchanged (backward compatible)

---

## Phase 5: Element-Specific Visual Editors

### Goal
Detect if an element type has a visual editor available, and automatically use it instead of YAML when available.

### Design Decisions

#### 1. Visual Form for Plan Section
**Status**: ⏸️ **ON HOLD** - Will be considered in the future
- Current YAML editor is sufficient for MVP
- More complex positioning UI requires careful UX design
- Deferred to allow focus on element-specific editors first

#### 2. Element Visual Editor Detection Strategy

**Naming Convention:**
- Element type: `custom:analog-shp` → Editor component: `editor-analog-shp`
- Element type: `custom:badge-shp` → Editor component: `editor-badge-shp`
- Pattern: Replace `custom:` with `editor-`

**Detection Approach:**
```typescript
// Option A: Check if custom element is registered (RECOMMENDED)
private _hasVisualEditor(elementType: string): boolean {
    const editorName = this._getEditorName(elementType);
    return customElements.get(editorName) !== undefined;
}

private _getEditorName(elementType: string): string {
    // custom:analog-shp → editor-analog-shp
    return elementType.replace('custom:', 'editor-');
}
```

**Why Option A?**
- ✅ No registry to maintain
- ✅ Clean and automatic
- ✅ Works with lazy-loaded editors
- ✅ Same pattern Home Assistant uses

**Alternative Options (Not Recommended):**
- Option B: Maintain a static registry map - adds maintenance overhead
- Option C: Try dynamic import and catch errors - adds complexity and error handling

Go with option A

#### 3. Editor Component Location

**Structure:**
```
src/cards/editor-components/
├── element-editors/          # NEW: Element-specific visual editors
│   ├── editor-analog-shp.ts
│   ├── editor-badge-shp.ts
│   ├── editor-badges-shp.ts
│   └── index.ts
├── editor-element-section-shp.ts  # Modified to detect and load visual editors
├── editor-plan-section-shp.ts
└── ...
```
Create the visual editor just for the badges-shp, so I could test it.

**Rationale:**
- Keep element editors organized in subdirectory
- Clear separation from general editor components
- Easy to find and maintain
- Index file for convenient imports

I agree with the structure

#### 4. UI Behavior

**Default Behavior:**
- If visual editor exists → Show visual editor by default
- Always provide "Switch to YAML" toggle button
- User can switch between visual and YAML modes
- YAML mode is always available as fallback

I agree

**Toggle State:**
- Local state per editor instance (not persisted across sessions)
- Reset to visual mode when switching elements
- Clear "Switch to YAML" / "Switch to Visual" button

**Layout:**
```
┌─────────────────────────────────────────┐
│ Element (Type & Properties)         ⌄  │
├─────────────────────────────────────────┤
│ Configure element properties...         │
│                                          │
│ [Visual Editor UI]                       │
│   Entity: [sensor.temperature    ▼]     │
│   Min Value: [0                  ]      │
│   Max Value: [100                ]      │
│                                          │
│ [Switch to YAML]                         │
└─────────────────────────────────────────┘
```

#### 5. Editor Interface Contract

All element visual editors must follow this interface:

```typescript
interface ElementVisualEditor {
    // Input: Current element configuration
    @property({ type: Object }) elementSection: ElementConfig;
    
    // Output: Emit when configuration changes
    // Event: 'element-changed' with detail: { value: ElementConfig }
    
    // Required: HomeAssistant instance for entity pickers, etc.
    @property({ attribute: false }) hass: HomeAssistant;
}
```

**Event Contract:**
```typescript
// Editor emits this when user changes configuration
new CustomEvent('element-changed', {
    detail: { value: updatedElementConfig },
    bubbles: true,
    composed: true
});
```

### Implementation Plan

#### Task 1: Update Element Section Editor Component

**File**: `src/cards/editor-components/editor-element-section-shp.ts`

**Changes:**
1. Add state for tracking visual/YAML mode
2. Add detection logic for visual editor availability
3. Implement dynamic rendering based on mode
4. Add toggle button between modes
5. Handle dynamic import of visual editor if needed

**Pseudocode:**
```typescript
@customElement("editor-element-section-shp")
export class EditorElementSectionShp extends LitElement {
    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ type: Object }) public elementSection!: ElementConfig;
    
    @state() private _useYamlMode: boolean = false;
    
    private get _hasVisualEditor(): boolean {
        const elementType = this.elementSection?.type;
        if (!elementType || !elementType.startsWith('custom:')) {
            return false;
        }
        
        const editorName = elementType.replace('custom:', 'editor-');
        return customElements.get(editorName) !== undefined;
    }
    
    protected render() {
        const showVisualEditor = this._hasVisualEditor && !this._useYamlMode;
        
        return html`
            <div class="element-editor">
                ${showVisualEditor 
                    ? this._renderVisualEditor() 
                    : this._renderYamlEditor()}
                
                ${this._hasVisualEditor ? html`
                    <button @click=${this._toggleMode}>
                        ${this._useYamlMode ? 'Switch to Visual' : 'Switch to YAML'}
                    </button>
                ` : ''}
            </div>
        `;
    }
    
    private _renderVisualEditor() {
        const elementType = this.elementSection?.type;
        const editorName = elementType.replace('custom:', 'editor-');
        
        return html`
            <${editorName}
                .hass=${this.hass}
                .elementSection=${this.elementSection}
                @element-changed=${this._elementChanged}
            ></${editorName}>
        `;
    }
}
```

#### Task 2: Create Element Editor Infrastructure

**File**: `src/cards/editor-components/element-editors/index.ts`

```typescript
// Export all element visual editors
export * from './editor-analog-shp';
export * from './editor-badge-shp';
// ... more as they're created
```

**Import Strategy:**
- Option A: Import all at once in parent component (simpler, larger bundle) ✅ **AGREED**
- Option B: Lazy load editors when needed (complex, smaller initial bundle)
- **Decision**: Use Option A for MVP. Simpler implementation, easier debugging. Can optimize with lazy loading later if bundle size becomes an issue.

#### Task 3: Create First Visual Editor (Example: Analog)

**File**: `src/cards/editor-components/element-editors/editor-analog-shp.ts`

```typescript
@customElement("editor-analog-shp")
export class EditorAnalogShp extends LitElement {
    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ type: Object }) public elementSection!: ElementConfig;
    
    protected render() {
        return html`
            <ha-entity-picker
                label="Value Entity"
                .hass=${this.hass}
                .value=${this.elementSection.value_entity || ''}
                @value-changed=${this._valueEntityChanged}
            ></ha-entity-picker>
            
            <ha-textfield
                label="Min Value"
                type="number"
                .value=${this.elementSection.min ?? 0}
                @input=${this._minChanged}
            ></ha-textfield>
            
            <ha-textfield
                label="Max Value"
                type="number"
                .value=${this.elementSection.max ?? 100}
                @input=${this._maxChanged}
            ></ha-textfield>
            
            <!-- Add more fields as needed -->
        `;
    }
    
    private _valueEntityChanged(ev: CustomEvent) {
        this._updateConfig({ value_entity: ev.detail.value });
    }
    
    private _minChanged(ev: Event) {
        this._updateConfig({ min: Number((ev.target as HTMLInputElement).value) });
    }
    
    private _updateConfig(changes: Partial<ElementConfig>) {
        const updated = { ...this.elementSection, ...changes };
        this.dispatchEvent(new CustomEvent('element-changed', {
            detail: { value: updated },
            bubbles: true,
            composed: true
        }));
    }
}
```

### Questions to Address Before Implementation

1. **Q: Should we preserve user's YAML/Visual toggle preference?**
   - A: No, for MVP. Always default to visual if available. Can add persistence later.

2. **Q: What happens if element type changes while editor is open?**
   - A: Re-detect and switch editor mode automatically. If new type has no visual editor, fall back to YAML.

3. **Q: Should we create visual editors for all existing elements?**
   - A: **No**. Start with `badges-shp` only. Others can use YAML until their editors are created on demand.

4. **Q: How to handle element types we don't recognize?**
   - A: Fall back to YAML editor (current behavior).

5. **Q: Should editors validate configuration?**
   - A: Yes, but basic validation only. Show error states on invalid fields.

### Priority Element Editors to Create

Based on current elements in `src/elements/`:

**Phase 5 - Initial Implementation:**
1. ✅ `editor-badges-shp` - Multiple badges group (START HERE)
   - Most commonly used
   - Good test case for the visual editor infrastructure
   - Demonstrates the benefit of visual editing over YAML

**Future Enhancements** (Create on demand):
- `editor-analog-shp` - Analog gauge/indicator
- `editor-badge-shp` - Single badge
- `editor-icon-shp` - Icon display
- `editor-button-shp` - Button element
- `editor-state-shp` - State display
- Other specialized elements

**Rationale**: Start small with one editor to validate the infrastructure and approach. Add more editors incrementally based on user feedback and usage patterns.

### Testing Strategy

1. **Without visual editor**: Element section should show YAML (current behavior)
2. **With visual editor**: Element section should show visual editor + toggle
3. **Toggle functionality**: Switching between modes preserves data
4. **Element type change**: Switching element type updates editor appropriately
5. **Data integrity**: Ensure visual editor produces valid ElementConfig

---

## Relation to Group Feature

Once this split is implemented, the **Group feature** will benefit because:
- Groups can contain multiple entities, each with their own element config
- The element section editor can be reused for group children
- Visual editors for element types will work within groups
- Cleaner separation makes it easier to clone/duplicate entities in groups
