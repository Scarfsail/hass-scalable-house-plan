# Intro
Currently, we could put individual entities / elements to a room. Position of each element is defined independently, it's not possible to create a position relation, so when I move one, the others will be also moved.

# Proposal - High Level
I want implement a new feature: Group. It should be a new hass custom component like info-box-shp. It will not be able to receive any entity. But It could contain other entities like in a room with the same definition as one entity in the room (which could contain just the plan section with empty entity field). We should also provide a graphical editor for the "element" part specifically for this component, so I could add/remove/duplicate more entities in the same as into a room.

## Prerequisite Feature: Split Plan Element Editor ✅
The visual editor for splitting the entity's plan section has been **IMPLEMENTED**. This allows us to:
- Edit position properties (left, top, width, height, etc.) separately from element configuration
- Provide visual editors for element-specific propertiesp
- Have dedicated YAML editors for elements that don't support visual editing

---

# Detailed Group Feature Specification

## 1. Overview

The **Group element** (`group-shp`) is a container element that allows multiple child entities/elements to be positioned relative to each other and moved as a single unit.

### Key Characteristics:
- **No entity binding**: The group itself doesn't bind to a Home Assistant entity
- **Container for child entities**: Can contain any entity configuration (with or without entities)
- **Relative positioning**: Child elements are positioned relative to the group's position
- **Unified movement**: Moving the group moves all children with it
- **Reusable**: Can be used like any other element in room configurations

---

## 2. Configuration Structure

### 2.1 Basic Configuration Schema

```yaml
rooms:
  - name: Living Room
    boundary: [[0,0], [100,0], [100,100], [0,100]]
    entities:
      # ... other entities ...
      
      # Group example
      - entity: ""  # Empty entity for group
        plan:
          left: 50
          top: 30
          element:
            type: group-shp
            width: 100    # Explicit width (required)
            height: 60    # Explicit height (required)
            show_border: false  # Optional: show dashed border
            children:
              # Child 1: Light with icon
              - entity: light.living_room_main
                plan:
                  left: 0    # Relative to group position
                  top: 0
                  element:
                    type: icon-shp
                    
              # Child 2: Temperature sensor
              - entity: sensor.living_room_temp
                plan:
                  left: 30   # Relative to group position
                  top: 0
                  element:
                    type: analog-text-shp
                    
              # Child 3: Decorative element
              - entity: ""
                plan:
                  left: 0
                  top: 30
                  element:
                    type: badge-shp
                    label: "Living"
```

### 2.2 TypeScript Type Definitions

```typescript
// In src/cards/types.ts or src/elements/group-shp.ts

export interface GroupElementConfig extends ElementBaseConfig {
    children: EntityConfig[];  // Array of child entity configurations
    width: number;   // Explicit width in pixels (required)
    height: number;  // Explicit height in pixels (required)
    show_border?: boolean;  // Optional: Show dashed border for debugging/editing (default: false)
    // Children use absolute positioning within the group container
    // No layout property needed - all positioning is explicit
}
```

---

## 3. Implementation Details

### 3.1 Element Component (`group-shp.ts`)

**File**: `src/elements/group-shp.ts`

#### Core Responsibilities:
1. **Render container**: Create a wrapper div/element for the group
2. **Position children**: Render each child element with relative positioning
3. **Pass context**: Ensure each child has access to `hass`, `createCardElement`, etc.
4. **Handle nested groups**: Support groups within groups (recursive rendering)

#### Key Implementation Points:

```typescript
import { html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import { ElementBase, ElementBaseConfig } from "./base";
import type { EntityConfig } from "../cards/types";

export interface GroupElementConfig extends ElementBaseConfig {
    children: EntityConfig[];
    width: number;    // Required: explicit width in pixels
    height: number;   // Required: explicit height in pixels
    show_border?: boolean;  // Optional: show dashed border for debugging (default: false)
}

@customElement("group-shp")
export class GroupElement extends ElementBase<GroupElementConfig> {
    
    static override styles = css`
        :host {
            display: block;
            position: relative;
        }
        
        .group-container {
            position: relative;
            box-sizing: border-box;
        }
        
        .group-container.show-border {
            border: 2px dashed rgba(255, 165, 0, 0.5);  /* Orange dashed border */
        }
    `;
    
    protected override render() {
        const { width, height, show_border = false, children = [] } = this.config;
        
        const containerStyle = {
            width: `${width}px`,
            height: `${height}px`,
        };
        
        const containerClass = show_border ? 'group-container show-border' : 'group-container';
        
        return html`
            <div class=${containerClass} style=${styleMap(containerStyle)}>
                ${children.map(child => this._renderChild(child))}
            </div>
        `;
    }
    
    private _renderChild(childConfig: EntityConfig) {
        const parsedConfig = typeof childConfig === 'string' 
            ? { entity: childConfig, plan: {} } 
            : childConfig;
        
        const plan = parsedConfig.plan || {};
        
        // Children use absolute positioning within group container
        const childStyle = {
            position: 'absolute',
            left: plan.left !== undefined ? `${plan.left}px` : undefined,
            top: plan.top !== undefined ? `${plan.top}px` : undefined,
            right: plan.right !== undefined ? `${plan.right}px` : undefined,
            bottom: plan.bottom !== undefined ? `${plan.bottom}px` : undefined,
            width: plan.width !== undefined ? `${plan.width}px` : undefined,
            height: plan.height !== undefined ? `${plan.height}px` : undefined,
        };
        
        return html`
            <div style=${styleMap(childStyle)}>
                ${this._renderElement(parsedConfig)}
            </div>
        `;
    }
    
    private _renderElement(entityConfig: EntityConfig) {
        // Use element-renderer-shp logic to render child
        // This is similar to how room renders its entities
        return renderChildElement(
            entityConfig,
            this.hass,
            this.mode,
            this.createCardElement,
            // ... other needed context
        );
    }
}
```

### 3.2 Rendering Logic Integration

The group rendering needs to leverage existing element rendering infrastructure:

**Option A**: Extract and reuse room's element rendering logic
- Create a shared utility function in `element-renderer-shp.ts`
- Use this function in both `scalable-house-plan-room.ts` and `group-shp.ts`

**Option B**: Create dedicated group rendering helper
- Specific function for rendering group children
- Handles positioning, scaling, and mode-specific logic

**Recommended**: **Option A** - DRY principle, reuse proven logic

### 3.3 Position Calculations

Children positions are **relative to the group's container**:

```typescript
// In group-shp.ts
private _renderChild(childConfig: EntityConfig) {
    const parsedConfig = typeof childConfig === 'string' 
        ? { entity: childConfig, plan: {} } 
        : childConfig;
    
    const plan = parsedConfig.plan || {};
    
    // Children use absolute positioning within group container
    // Positions are directly applied as CSS (left, top, width, height)
    // The group container itself handles scaling - children just scale with it
    const style = {
        position: 'absolute',
        left: plan.left !== undefined ? `${plan.left}px` : undefined,
        top: plan.top !== undefined ? `${plan.top}px` : undefined,
        right: plan.right !== undefined ? `${plan.right}px` : undefined,
        bottom: plan.bottom !== undefined ? `${plan.bottom}px` : undefined,
        width: plan.width !== undefined ? `${plan.width}px` : undefined,
        height: plan.height !== undefined ? `${plan.height}px` : undefined,
    };
    
    return html`
        <div style=${styleMap(style)}>
            ${renderElement(parsedConfig, this.hass, this.mode, ...)}
        </div>
    `;
}
```

---

## 4. Visual Editor Integration

### 4.1 Component Reuse Strategy ✅

**Great news**: The group editor can **reuse existing room entity editor components**!

#### Reusable Components:

1. **`editor-elements-shp`** - Already handles:
   - Entity list management (add/remove/duplicate)
   - Drag & drop reordering via `ha-sortable`
   - Entity count display
   - Empty state handling

2. **`editor-element-shp`** - Already handles:
   - Individual entity configuration
   - Entity picker
   - Plan section editing (position properties)
   - Element section editing (with split plan element editor)
   - Expand/collapse UI
   - Duplicate and remove actions

**Implementation**: Simply pass `config.children` to `editor-elements-shp` component!

### 4.2 Group Element Editor

**File**: `src/cards/editor-components/element-editors/editor-group-shp.ts`

This is a **lightweight wrapper** that provides group-specific fields and delegates children editing:

```typescript
import { LitElement, html, css } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "../shared-styles";
import type { HomeAssistant } from "../../../../hass-frontend/src/types";
import type { GroupElementConfig } from "../../types";
import "../editor-elements-shp";

@customElement("editor-group-shp")
export class EditorGroupShp extends LitElement {
    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ type: Object }) public elementSection!: GroupElementConfig;
    
    static styles = [sharedStyles, css`
        :host {
            display: block;
        }
        .field {
            margin-bottom: 16px;
        }
    `];

    protected render() {
        return html`
            <!-- Width field -->
            <div class="field">
                <label>Width (px)</label>
                <ha-textfield
                    type="number"
                    .value=${this.elementSection?.width || 100}
                    @input=${this._widthChanged}
                ></ha-textfield>
            </div>
            
            <!-- Height field -->
            <div class="field">
                <label>Height (px)</label>
                <ha-textfield
                    type="number"
                    .value=${this.elementSection?.height || 100}
                    @input=${this._heightChanged}
                ></ha-textfield>
            </div>
            
            <!-- Show border toggle -->
            <div class="field">
                <ha-switch
                    .checked=${this.elementSection?.show_border || false}
                    @change=${this._showBorderChanged}
                ></ha-switch>
                <label>Show Border (Debug)</label>
            </div>
            
            <!-- Children editor (reuse existing component!) -->
            <editor-elements-shp
                .hass=${this.hass}
                .elements=${this.elementSection?.children || []}
                .hideHeader=${false}
                @elements-changed=${this._childrenChanged}
            ></editor-elements-shp>
        `;
    }
    
    private _widthChanged(ev: Event) {
        const value = parseInt((ev.target as HTMLInputElement).value);
        this._fireChange({ width: value });
    }
    
    private _heightChanged(ev: Event) {
        const value = parseInt((ev.target as HTMLInputElement).value);
        this._fireChange({ height: value });
    }
    
    private _showBorderChanged(ev: Event) {
        const checked = (ev.target as any).checked;
        this._fireChange({ show_border: checked });
    }
    
    private _childrenChanged(ev: CustomEvent) {
        this._fireChange({ children: ev.detail.elements });
    }
    
    private _fireChange(changes: Partial<GroupElementConfig>) {
        this.dispatchEvent(new CustomEvent('element-changed', {
            detail: { ...this.elementSection, ...changes },
            bubbles: true,
            composed: true
        }));
    }
}
```

### 4.3 Benefits of Component Reuse

✅ **No duplicate code** - DRY principle  
✅ **Consistent UX** - Same look and feel as room entity editing  
✅ **Proven functionality** - Reuse battle-tested components  
✅ **Drag & drop support** - Automatic reordering via `ha-sortable`  
✅ **Split plan editor** - Automatic support for position + element editing  
✅ **Faster implementation** - Minimal new code needed  

### 4.4 UI Preview

The group editor will look like:

```
┌─ Group Element Editor ────────────────┐
│                                        │
│  Width (px):  [100     ]               │
│  Height (px): [60      ]               │
│  [✓] Show Border (Debug)               │
│                                        │
│  ─────────────────────────────────────  │
│                                        │
│  Children (3):           [+ Add Entity]│
│                                        │
│  ┌─ Child 1 ────────────────────────┐ │
│  │ ≡ Entity: light.living_room_main │ │
│  │   Type: icon-shp                 │ │
│  │   [▼ Expand to edit]              │ │
│  └──────────────────────────────────┘ │
│                                        │
│  ┌─ Child 2 ────────────────────────┐ │
│  │ ≡ Entity: sensor.temp            │ │
│  │   Type: analog-text-shp          │ │
│  │   [▼ Expand to edit]              │ │
│  └──────────────────────────────────┘ │
│                                        │
└────────────────────────────────────────┘
```

When a child is expanded, it shows the full `editor-element-shp` UI with split plan editor.

---

## 5. Integration Points

### 5.1 Element Registry

Add `group-shp` to the element registry:

**File**: `src/elements/index.ts`

```typescript
export * from "./group-shp";
```

### 5.2 Element Type Detection

The group should be detected by explicit `type: group-shp` in the configuration.

**No auto-detection** is needed since groups must be explicitly defined.

### 5.3 Editor Registration

Register the group element editor in the element editor system:

**File**: `src/cards/editor-components/element-editors/index.ts` (or wherever element editors are registered)

```typescript
import { EditorGroupShp } from "./editor-group-shp";

// Register in element editor map
// This should be done alongside other element editors like editor-badges-shp, editor-analog-shp, etc.
elementEditors.set("group-shp", EditorGroupShp);
```

**Note**: The group editor itself is lightweight (~50 lines) - it just provides width/height/show_border fields and delegates children editing to the existing `editor-elements-shp` component!

---

## 6. Use Cases & Examples

### 6.1 Use Case 1: Thermostat Control Group

Group a temperature sensor and multiple climate controls:

```yaml
- entity: ""
  plan:
    left: 20
    top: 50
    element:
      type: group-shp
      width: 80
      height: 60
      children:
        - entity: sensor.living_room_temperature
          plan:
            left: 0
            top: 0
            element:
              type: analog-text-shp
              unit: "°C"
        - entity: climate.living_room
          plan:
            left: 0
            top: 25
            element:
              type: icon-shp
        - entity: input_number.target_temp
          plan:
            left: 30
            top: 25
            element:
              type: analog-bar-shp
```

### 6.2 Use Case 2: Multi-Button Control Panel

Group script buttons together:

```yaml
- entity: ""
  plan:
    left: 80
    top: 80
    element:
      type: group-shp
      width: 150
      height: 30
      children:
        - entity: script.movie_mode
          plan:
            left: 0
            top: 0
            element:
              type: badge-shp
              label: "Movie"
        - entity: script.reading_mode
          plan:
            left: 50
            top: 0
            element:
              type: badge-shp
              label: "Read"
        - entity: script.party_mode
          plan:
            left: 100
            top: 0
            element:
              type: badge-shp
              label: "Party"
```

### 6.3 Use Case 3: Labeled Sensor Display

Group a label with sensor readings:

```yaml
- entity: ""
  plan:
    left: 10
    top: 10
    element:
      type: group-shp
      width: 100
      height: 70
      children:
        - entity: ""
          plan:
            left: 0
            top: 0
            element:
              type: badge-shp
              label: "Climate"
              style:
                background: "rgba(50, 150, 200, 0.5)"
        - entity: sensor.temperature
          plan:
            left: 0
            top: 30
            element:
              type: analog-text-shp
        - entity: sensor.humidity
          plan:
            left: 50
            top: 30
            element:
              type: analog-text-shp
```

---

## 7. Technical Considerations

### 7.1 Coordinate System & Scaling

- **Group position**: Defined in room coordinates (like any entity)
- **Child positions**: **Absolute positioning** within the group container, relative to group's top-left corner (0,0)
- **Scaling**: The group element scales as a **single unit** - all children scale together with the group
  - No separate scaling logic needed for children
  - Children are rendered as-is within the scaled group container
  - Same behavior as any other element when room scales in detail view

### 7.2 Mode Handling (Overview vs Detail)

- **Overview mode**: Render group and children with overview-specific logic
- **Detail mode**: Render with detail-specific logic
- **Mode propagation**: Pass `mode` to all children

### 7.3 Event Handling

- **Click events**: Each child should handle its own click/tap actions
- **Group click**: Group itself should NOT have click behavior (transparent container)
- **Hover states**: Children maintain individual hover states

### 7.4 Performance

- **Caching**: Cache rendered children when possible
- **Lazy rendering**: Only render children visible in current mode
- **Minimal re-renders**: Use proper change detection to avoid unnecessary updates

### 7.5 Nesting Support

- **Groups within groups**: Should be supported (recursive rendering)
- **Depth limit**: Consider a reasonable limit (e.g., 5 levels) to prevent issues
- **Position accumulation**: Child positions accumulate through nesting

### 7.6 Entity Collection for Room Features

- **Info-box integration**: Group children entities are automatically collected and included in room's entity list
- **Dynamic color calculation**: Group entities participate in room color logic (lights, motion sensors, etc.)
- **Entity enumeration**: When collecting room entities, traverse group children recursively
- **No special handling needed**: Groups are transparent to entity collection - just enumerate children

---

## 8. Implementation Plan

### Phase 1: Core Group Element ✅ (Ready to Start)
1. Create `group-shp.ts` with basic rendering (container with width/height)
2. Implement child rendering with absolute positioning
3. Add entity collection helper (traverse children for room entity list)
4. Handle mode switching (overview/detail) - pass mode to children
5. Implement optional `show_border` rendering
6. Register element in element registry
7. Test with simple configurations (verify info-box sees group entities)

### Phase 2: Visual Editor (Simplified via Component Reuse!)
1. Create `editor-group-shp.ts` (~50 lines - just width/height/border fields)
2. Wire up `editor-elements-shp` component for children editing
3. Register editor in element editor map
4. Test editor workflow (add/remove/reorder children)
5. Verify split plan element editor works for group children

### Phase 3: Advanced Features
1. Improve children reordering (drag-and-drop in editor)
2. Support for nested groups
3. Visual positioning helper in editor (grid overlay, alignment guides)
4. Performance optimizations (caching, lazy rendering)
5. Documentation and examples

### Phase 4: Polish & Documentation
1. Add comprehensive examples to README
3. Add unit tests
4. Gather user feedback
5. Iterate on UX improvements

---

## 9. Design Decisions ✅

### D1: Visual Boundaries
**Decision**: Configurable via `show_border` property
- Optional `show_border: boolean` parameter in group configuration
- When `true`, shows a dashed orange border (useful for debugging/editing)
- Default: `false` (invisible container)
- Implementation: CSS class `.show-border` applies `border: 2px dashed rgba(255, 165, 0, 0.5);`

### D2: Background Colors
**Decision**: No background colors for now
- Groups are transparent containers only
- Keeps implementation simple and focused
- Can be added later if needed via `style` property or explicit `background` config

### D3: Group Sizing
**Decision**: Explicit width/height required
- `width` and `height` are **required** properties in configuration (both in pixels)
- Auto-sizing is not feasible (element dimensions unknown at configuration time)
- Provides clear container bounds for child positioning
- User must specify dimensions explicitly

### D4: Info-Box and Entity Collection
**Decision**: Automatic entity inclusion
- Group children entities are automatically collected as room entities
- No special handling needed in info-box logic - entities are discovered recursively
- Group entities participate in dynamic color calculation (lights, motion sensors, etc.)
- **Implementation requirement**: Add helper function to traverse group children when enumerating room entities

### D5: Group Templates/Presets
**Decision**: No templates for now
- Users can create their own patterns directly in YAML configuration
- Templates/presets can be added later based on user feedback and common usage patterns
- Keeps initial implementation scope manageable and focused on core functionality

---

## 10. Next Steps ✅

With all design decisions finalized, we can now proceed with implementation:

### Immediate Actions:
1. **✅ Configuration schema finalized**: 
   - Group element config with `children[]`, `width`, `height`, `show_border`
   - Entity collection logic for info-box integration
   
2. **🚀 Start Phase 1 implementation**:
   - Create `src/elements/group-shp.ts`
   - Implement container rendering with absolute positioning
   - Add entity collection helper for room integration
   - Register element and test with simple configs

3. **📝 Create test examples**:
   - Thermostat control group
   - Button panel group
   - Nested group example

4. **🔄 Iterate and refine**:
   - Test in both overview and detail modes
   - Verify info-box integration
   - Polish visual editor (Phase 2)

**Ready to begin implementation!**