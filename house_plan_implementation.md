# House Plan Implementation Requirements

## Project Overview
Transform `hass-picture-elements-scalable` into `hass-scalable-house-plan` - a Home Assistant card specifically designed for displaying and managing house floor plans with room-based organization.

**Note:** This is a complete rewrite with NO backward compatibility with the original card.

## Key Concept Changes

### 1. Layers → Independent & Optional
- **Original**: Layers contained nested groups, which contained elements
- **New**: Layers are optional, ID-based, and independent of structure
- Each layer has: ID, name, icon, default visibility, show in toggles
- Elements can optionally reference a layer by `layer_id`
- Layers provide cross-cutting concerns (e.g., "electrical", "temperature", "security")

### 2. Groups → Rooms (Top-Level)
- **Original**: Generic grouping nested under layers
- **New**: Rooms are the primary top-level organizational unit
- Each room has a defined boundary (polygon with [x, y] coordinate pairs)
- Room boundaries enable click detection for room interactions
- Rooms contain elements directly

### 3. Room Boundaries
- Each room defines a polygon boundary using coordinate pairs
- Format: `boundary: [[x1, y1], [x2, y2], ...]`
- Coordinates are in pixels relative to the image dimensions
- Supports any shape (rectangular, L-shaped, irregular)
- **Rendered as SVG polygons with customizable colors**
- **Built-in click detection for room interaction**
- **Hover effects provide visual feedback**

### 4. Room Colors
- Each room can have an optional `color` property (rgba/rgb/hex)
- Default: Subtle gray `rgba(128, 128, 128, 0.2)`
- Colors render as SVG polygon fills over the floor plan
- Future: Dynamic colors based on sensors (temperature, occupancy, alarm state)
- Provides visual feedback and room identification

### 4. Room-Relative Element Positioning
- **Original**: Elements positioned relative to the entire canvas
- **New**: Elements positioned relative to their parent room's top-left corner
- Simplifies layout management when moving/resizing rooms
- More intuitive for house plan design
- Coordinates transform: `absolute_position = room_top_left + element_position`

### 5. Element Structure Separation
Elements are structured with clear separation between plan display and element configuration:

```yaml
elements:
  - plan:              # Optional - controls plan display
      left: 100        # Room-relative coordinates
      top: 50
      width: 30        # Optional dimensions
      height: 30
      overview: true   # Optional, default true - show on overview
      layer_id: "lights"  # Optional layer assignment
      style: {}        # Optional plan-specific styling
    element:           # Required - element configuration
      type: custom:door-window-shp
      entity: binary_sensor.door
      tap_action: {}   # Actions work in detail view
      # ... element-specific config
  
  - element:           # No plan section = detail-only element
      type: custom:analog-shp
      entity: sensor.temperature
```

**Key principles:**
- `plan` section is optional - if missing, element only appears in entities list view
- `plan` contains: all positioning (left/top/width/height/right/bottom), overview flag, layer_id, style
- `element` contains: type, entity, actions, and all element-specific configuration
- Actions (tap_action, hold_action) work in all views
- Clicking elements on overview opens room detail view (SVG)
- All elements appear in appropriate views based on plan configuration

### 5. Room Default Elements
- Each element has a new structure: `plan` (optional) + `element` (required)
- Elements without `plan` section appear only in entities list view
- Elements with `plan` section appear on overview and detail (if overview: true)
- Simplifies creating entities-only controls (AC, advanced settings, etc.)

### 7. Overview Display Control (Integrated with Element Structure)
- Element visibility on overview controlled by presence of `plan` section
- `plan.overview` flag allows control of overview visibility while preserving coordinates
- Detail view shows all elements with plan configuration
- Entities list view shows all elements in the room

### 7. Room Detail Navigation
- **Interaction**: Clicking room polygon or any element on plan opens room detail view
- Room detail view shows ALL elements for that room (regardless of plan visibility)
- Element actions (tap_action, hold_action) only work in detail view
- Provides full access to all room controls and information
- Plan view is for navigation and overview only

## Implementation Phases

### Phase 1: Project Renaming ✓
- Rename all files from `picture-elements-scalable` to `scalable-house-plan`
- Update all imports and references
- Update package.json, hacs.json, and configuration files
- Update class names and component identifiers

### Phase 2: Room Foundation & Layer Restructure ✅
- Rename "group" terminology to "room" throughout codebase
- Make rooms the top-level structure (remove layer nesting)
- Add room boundary definition support (polygon with coordinate pairs)
- Restructure layers to be ID-based and optional
- Add `layer_id` support to elements
- Update editor components for new structure
- Implement point-in-polygon click detection for rooms
- Start with minimal room metadata: name and boundary only

### Phase 3: Relative Positioning System ✅
- Implement coordinate transformation system
- Convert element positions to room-relative coordinates
- Elements positioned relative to room's top-left corner (min x, min y of boundary)
- Transformation: `absolute_position = room_offset + element.plan.left/top`
- Supports negative values and coordinates beyond room boundaries

### Phase 4: Element Structure Restructure
- Restructure element configuration: `plan` (optional) + `element` (required)
- Implement `plan` section parsing with positioning, show flag, layer_id, style
- Update element flattening logic to respect `plan.show` flag
- Handle elements without `plan` section (detail-only elements)
- Update coordinate transformation to use `plan.left/top/width/height`
- Preserve element actions for detail view

### Phase 5: Overview Display Control (Covered by Phase 4)
- Already implemented through `plan` section structure
- `plan.show` flag provides granular control
- No additional work needed beyond Phase 4

### Phase 6: Room Detail View
- Implement room click handler
- Create room detail modal/view component
- Show all room elements in detail view
- Add navigation controls (back to overview)
- Support element interaction in detail view

### Phase 7: Testing & Documentation
- Update README with new house plan focus
- Create example configurations
- Test all room interactions
- Verify backward compatibility where appropriate

## Technical Considerations

### Naming Convention
All custom elements use the `-shp` suffix (Scalable House Plan) to avoid naming collisions with the original `hass-picture-elements-scalable` library:
- Element types: `door-window-shp`, `analog-shp`, `camera-shp`, etc.
- Components: `analog-text-shp`, `last-change-text-shp`
- Editor components: `editor-layer-shp`, `editor-room-shp`, etc.

This allows both libraries to coexist in the same Home Assistant instance without conflicts.

### Data Structure Changes
```typescript
// Old structure (picture-elements-scalable)
interface Layer {
  name: string;
  icon: string;
  visible: boolean;
  showInToggles: boolean;
  groups: PictureElementGroup[];
}

interface PictureElementGroup {
  group_name: string;
  elements: Element[];
}

// New structure (scalable-house-plan)
interface Layer {
  id: string;         // NEW: Unique identifier
  name: string;
  icon: string;
  visible: boolean;
  showInToggles: boolean;
  // No more nested structure!
}

interface Room {
  name: string;
  boundary: [number, number][]; // Array of [x, y] coordinate pairs
  elements: RoomElement[];
}

interface RoomElement extends Element {
  layer_id?: string;           // Optional reference to layer
  show_in_overview?: boolean;  // Show in main view vs detail only
  // Position can be absolute or room-relative (future phase)
image_width: 1360
image_height: 849

# Layers are optional and independent (can be omitted)
layers:
  - id: electricity
    name: "Electrical"
    icon: "mdi:lightning-bolt"
    visible: true
    showInToggles: true
  - id: temperature
    name: "Temperature"
    icon: "mdi:thermometer"
    visible: true
    showInToggles: true

# Rooms are the top-level structure
rooms:
  - name: "Living Room"
    boundary:
      - [100, 100]   # Top-left
      - [400, 100]   # Top-right
      - [400, 300]   # Bottom-right
      - [100, 300]   # Bottom-left
    elements:
      - type: custom:door-window-element
        entity: sensor.living_room_temp
        layer_id: temperature  # Optional layer assignment
        show_in_overview: true
        left: 200
        top: 150
        
  - name: "Kitchen"
    boundary:
      - [400, 100]
      - [700, 100]
      - [700, 300]
      - [400, 300]
    elements:
**No backward compatibility.** This is a completely new card with a different structure and purpose.

Users of the old `picture-elements-scalable` card will need to:
1. Keep using the old card if they need the old functionality
2. Manually migrate their configuration to the new structure if they want house plan features

## Implementation Notes

### Phase 2 Specifics
- **Boundary coordinates**: Pixels relative to image dimensions (image_width × image_height)
- **Room rendering**: SVG polygons with customizable colors and interactive hover effects
- **Click detection**: Native SVG polygon hit detection (no point-in-polygon algorithms needed)
- **Layer visibility**: Continue using CSS variables but now based on layer IDs
- **Room metadata**: Currently includes name, boundary, and color; more in future phases
- **Editor updates**: Significant restructuring of editor components needed
- **Important**: Use `svg` template tag for SVG elements, not `html` template

### Future Enhancements (Beyond Current Phases)
- Circle/ellipse boundary support
- Room templates by type (bedroom, kitchen, etc.)
- Floor level support for multi-story houses
- Automatic room labeling on the plan
- Visual boundary editor with drag handles

## Current Status
1. ✅ Phase 1: Project Renaming - COMPLETE (Dec 27, 2025)
2. ✅ Phase 2: Room Foundation & Layer Restructure - COMPLETE (Dec 28, 2025)
   - **Additional: Element Name Collision Resolution** (Dec 28, 2025)
     - Added `-shp` suffix to all custom elements to avoid conflicts with original library
     - Renamed: 12 element types, 2 components, 6 editor components
     - Deleted obsolete group-based editor components
     - Ensures both libraries can coexist in Home Assistant without element name collisions
   - **Additional: Room Color Rendering** (Dec 28-29, 2025)
     - Implemented SVG-based room boundary rendering with customizable colors
     - Added interactive room hover effects (visual feedback)
     - Added click handlers for future room detail navigation
     - Rooms are now core visual elements with click detection built-in
3. ✅ Phase 3: Room-Relative Positioning - COMPLETE (Dec 29, 2025)
   - Implemented coordinate transformation system
   - Elements now positioned relative to room's top-left corner
   - Automatic transformation: absolute = room_offset + element_position
4. ✅ Phase 4: Element Structure Restructure - COMPLETE (Dec 29, 2025)
   - Separated element configuration into `plan` (optional) and `element` (required) sections
   - `plan`: positioning, visibility, layer assignment, style
   - `element`: type, entity, actions, element-specific configuration
   - Elements without `plan` section are detail-only (not shown in overview)
   - Updated TypeScript interfaces: PlanConfig, ElementConfig, RoomElement
   - Implemented element filtering based on plan.show flag (default: true)
5. ✅ Phase 5: Overview Display Control (Covered by Phase 4)
6. ✅ Phase 6: Room Detail View - COMPLETE (Dec 29, 2025)
   - Created three-component architecture: orchestrator + plan + detail
   - Implemented detail view component (scalable-house-plan-detail.ts) with responsive grid
   - Created overview component (scalable-house-plan-overview.ts) with room rendering
   - Refactored main component as routing orchestrator
   - Browser history API integration with back button support
   - Edit mode detection via URL parameter (?edit=1) to avoid conflicts
   - Entity-based card system with default mappings for plan and detail views
   - Card caching for performance (Map-based, prevents re-creation on render)
   - Responsive layout: auto-fit grid, full width on mobile, 300px min columns
   - Compact header design with sticky positioning
   - All room entities visible in detail view (respects plan.show for overview only)
7. ⏳ Phase 7: Testing & Documentation

---
*Document created: December 27, 2025*
*Last updated: December 29, 2025*
*Current Phase: Phase 6 Complete - Ready for Phase 7 (Testing & Documentation)*
        entity: binary_sensor.living_room_motion
        show_in_overview: true
        position:
          x: 20%
          y: 80%
```

## Migration Path
- Existing configurations should continue to work
- Provide migration tool/script for converting old configs
- Support gradual adoption of new features

## Next Steps
1. ✓ Rename all project files and references
2. Update terminology from "groups" to "rooms"
3. Implement room boundary system
4. Add relative positioning
5. Create room detail view
6. Implement overview filtering

---
*Document created: December 27, 2025*
*Current Phase: Phase 1 - Project Renaming*
