# House Plan Implementation Requirements

## Project Overview
Transform `hass-picture-elements-scalable` into `hass-scalable-house-plan` - a Home Assistant card specifically designed for displaying and managing house floor plans with room-based organization.

## Key Concept Changes

### 1. Groups → Rooms
- **Original**: Generic grouping of elements
- **New**: Groups represent physical rooms in a house
- Each room has defined boundaries (supports any shape/polygon)
- Rooms are the primary organizational unit

### 2. Room-Relative Element Positioning
- **Original**: Elements positioned relative to the entire canvas
- **New**: Elements positioned relative to their parent room
- Simplifies layout management when moving/resizing rooms
- More intuitive for house plan design

### 3. Room Default Elements
Each room supports a standard set of elements:
- Temperature sensor/display
- Presence/motion detection
- Air conditioning control
- Lighting control
- Humidity sensor
- Other room-specific elements

### 4. Overview Display Mode
- Each element has a new setting: `show_in_overview`
- When enabled, element appears on the main house plan view
- When disabled, element only appears in room detail view
- Allows decluttering the main plan while keeping full control available

### 5. Room Detail Navigation
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

### Phase 2: Room Foundation
- Rename "group" terminology to "room" throughout codebase
- Add room boundary definition support (polygon/shape)
- Update UI labels and editor components
- Add room metadata (name, type, floor level, etc.)

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

### Data Structure Changes
```typescript
// Old structure
interface Group {
  name: string;
  elements: Element[];
  // ... other properties
}

// New structure
interface Room {
  name: string;
  type?: string; // bedroom, kitchen, bathroom, etc.
  floor?: number;
  boundary: Polygon; // Define room shape
  elements: RoomElement[];
  // ... other properties
}

interface RoomElement extends Element {
  position: RelativePosition; // Relative to room
  show_in_overview: boolean;
  // ... other properties
}
```

### Component Architecture
- Main card component: `scalable-house-plan`
- Editor component: `scalable-house-plan-editor`
- Room detail component: `room-detail-view` (new)
- Room boundary editor: `room-boundary-editor` (new)

### Configuration Schema
```yaml
type: custom:scalable-house-plan
image: /local/floorplan.png
rooms:
  - name: Living Room
    type: living_room
    floor: 1
    boundary:
      - [x1, y1]
      - [x2, y2]
      # ... polygon points
    elements:
      - type: temperature
        entity: sensor.living_room_temperature
        show_in_overview: true
        position:
          x: 50%  # Relative to room
          y: 50%
      - type: presence
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
