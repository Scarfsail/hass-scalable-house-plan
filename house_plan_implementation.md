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
- Used for click detection and room interaction

### 4. Room-Relative Element Positioning
- **Original**: Elements positioned relative to the entire canvas
- **New**: Elements positioned relative to their parent room
- Simplifies layout management when moving/resizing rooms
- More intuitive for house plan design

### 5. Room Default Elements
Each room supports a standard set of elements:
- Temperature sensor/display
- Presence/motion detection
- Air conditioning control
- Lighting control
- Humidity sensor
- Other room-specific elements

### 6. Overview Display Mode
- Each element has a new setting: `show_in_overview`
- When enabled, element appears on the main house plan view
- When disabled, element only appears in room detail view
- Allows decluttering the main plan while keeping full control available

### 7. Room Detail Navigation
- **Interaction**: Clicking anywhere on a room opens room detail view
- Clicking on individual elements within a room also opens room detail
- Room detail view shows ALL elements for that room (regardless of overview setting)
- Provides full access to all room controls and information

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

### Phase 3: Relative Positioning System
- Implement coordinate transformation system
- Convert element positions to room-relative coordinates
- Update editor drag-drop to work with room-relative positioning
- Maintain backward compatibility during transition

### Phase 4: Room Default Elements
- Define standard room element templates
- Create quick-add system for common room elements
- Implement element type presets (temperature, presence, AC, etc.)
- Add room template system for common room types

### Phase 5: Overview Display Control
- Add `show_in_overview` property to all elements
- Update rendering logic to respect overview flag
- Create toggle in element editor
- Update UI to indicate which elements are overview-visible

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
- **Click detection**: Implement point-in-polygon algorithm (ray casting method)
- **Layer visibility**: Continue using CSS variables but now based on layer IDs
- **Room metadata**: Start minimal (name only), add more in future phases
- **Editor updates**: Significant restructuring of editor components needed

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
3. ⏳ Phase 3: Room-Relative Positioning
4. ⏳ Phase 4: Room Default Elements  
5. ⏳ Phase 5: Overview Display Control
6. ⏳ Phase 6: Room Detail View
7. ⏳ Phase 7: Testing & Documentation

---
*Document created: December 27, 2025*
*Last updated: December 28, 2025*
*Current Phase: Phase 2 Complete - Ready for Phase 3*
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
