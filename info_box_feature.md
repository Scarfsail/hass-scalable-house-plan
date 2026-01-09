# Info Box Feature

## Overview
Add a minimalistic info box to rooms that displays key environmental and activity information. This complements the dynamic room coloring by providing specific values and timestamps.

## Purpose
- Show last movement/presence timestamp (since room color already indicates active motion)
- Display current temperature and other environmental data
- Provide quick overview without cluttering the plan with full entity elements
- Allow drill-down to entity details in detail view

---

## Visual Design

### Overview Mode
**Minimalistic display using emoji/icons:**
```
👤 2m    🌡️ 22°C
```
- Compact, single-line or two-line layout
- Emoji/icons as visual indicators
- Short values (2m = 2 minutes ago, 22°C = temperature)
- Non-interactive (just display)

### Detail Mode
**Expanded display with more information:**
```
👤 Last seen: 2 minutes ago
🌡️ Temperature: 22.3°C
💧 Humidity: 45%
```
- Multi-line layout with labels
- More precision (22.3 vs 22)
- **Clickable** - each line triggers more-info dialog for that entity
- Can show additional metrics not visible in overview

---

## Configuration

### Three-Level Configuration Hierarchy

#### 1. **Code Default** (built-in)
```typescript
const DEFAULT_INFO_BOX_CONFIG = {
  show: true,
  position: { top: 5, left: 5 },
  types: ['motion', 'occupancy', 'temperature']
}
```

#### 2. **House Plan Level** (global config)
```yaml
type: custom:scalable-house-plan
info_box_defaults:
  show: true
  position:
    top: 5
    left: 5
  types:
    - motion
    - occupancy
    - temperature
    - humidity
  exclude: []  # Can exclude specific types globally
```

#### 3. **Room Level** (per-room override)
```yaml
rooms:
  - name: Living Room
    info_box:
      show: true  # Override visibility
      position:
        top: 10
        left: 10
      exclude:
        - humidity  # Don't show humidity in this room
```

**Note:** No `types` array needed - all known types are included by default. Use `exclude` to remove specific types.

**Merge logic:** Room config > House config > Code default

---

## Supported Entity Types

### Phase 1 (Initial Implementation)

| Type | Entity Detection | Icon | Overview Format | Detail Format |
|------|------------------|------|-----------------|---------------|
| **motion** | `binary_sensor.*` with `device_class: motion` | 👤 | `2m` (time since last on) | `Last seen: 2 minutes ago` |
| **occupancy** | `binary_sensor.*` with `device_class: occupancy` | 👤 | `2m` (time since last off) | `Present: 2 minutes` |
| **temperature** | `sensor.*` with `device_class: temperature` | 🌡️ | `22°C` | `Temperature: 22.3°C` |

### Phase 2 (Future Extensions)

| Type | Entity Detection | Icon | Overview Format | Detail Format |
|------|------------------|------|-----------------|---------------|
| **humidity** | `sensor.*` with `device_class: humidity` | 💧 | `45%` | `Humidity: 45%` |
| **co2** | `sensor.*` with `device_class: co2` | 🌫️ | `450ppm` | `CO₂: 450 ppm` |
| **light_level** | `sensor.*` with `device_class: illuminance` | 💡 | `120lx` | `Light: 120 lux` |

---

## Technical Implementation

### Position Configuration
```typescript
interface InfoBoxPosition {
  top?: number;    // Pixels from top edge of room
  bottom?: number; // Pixels from bottom edge (mutually exclusive with top)
  left?: number;   // Pixels from left edge of room
  right?: number;  // Pixels from right edge (mutually exclusive with left)
}

interface InfoBoxConfig {
  show?: boolean;             // Default: true
  position?: InfoBoxPosition; // Default: { top: 5, left: 5 }
  exclude?: string[];         // Types to exclude from display
}
```

**Note:** Position uses same coordinate system as element positioning - reuse existing implementation (DRY).

### Entity Detection Logic
1. Get all entities in room
2. Filter by supported types (motion, temperature, etc.)
3. Match by `device_class` attribute
4. Exclude entities with `plan.exclude_from_info_box: true` (opt-out at entity level)
5. Show ALL matching entities of each type (user controls via entity exclusion)

### Component Structure
```
scalable-house-plan-info-box.ts
  - Render info box for a room
  - Handle overview vs detail mode
  - Format values appropriately
  - Handle click events (detail mode only)
```

---

## Final Decisions

| # | Topic | Decision |
|---|-------|----------|
| 1 | Multiple entities same type | Show ALL matching entities - user controls via `exclude_from_info_box` |
| 2 | Position system | Same as element positioning (left/right/top/bottom in pixels) - reuse implementation |
| 3 | Coordinate system | Relative to room bounding box (0,0 = room's top-left) - same as elements |
| 4 | Background | Semi-transparent dark background for readability |
| 5 | Font size / Scaling | Scale with room - behave exactly like any other element |
| 6 | Time calculation | Use same logic as motion-sensor-shp (`last_changed`) |
| 7 | Time format | Use same format as motion-sensor-shp |
| 8 | Layout | Horizontal in overview (`👤 2m 🌡️ 22°C`), vertical in detail |
| 9 | Entity opt-out | `plan.exclude_from_info_box: true` flag |
| 10 | Click - overview | Non-interactive (element-like behavior) |
| 11 | Temperature precision | 1 decimal in both overview and detail (22.3°C) |
| 12 | No data | Show only available types, hide box if nothing |
| 13 | Dynamic updates | Yes - re-render on hass changes like any element |
| 14 | Visibility | Always visible when `show: true` (independent of other settings) |
| 15 | Z-index | Render as last element in room (naturally on top) - no z-index manipulation |
| 16 | Animation | No animations |
| 17 | Icons | Use `<ha-icon>` with mdi icons (consistent with HA) |
| 18 | Default order | motion/occupancy → temperature → humidity → co2 → light_level |

### Key Architectural Decision
**Info box is essentially an auto-generated element.** It should:
- Use the same positioning system as regular elements
- Scale the same way as regular elements  
- Render as another element in the room (just auto-populated)
- Follow element patterns for click behavior, reactivity, etc.

### Configuration Simplification
- **No `types` array** - all known types included by default
- **Only `exclude` array** - to remove specific types per room
- **Entity-level opt-out** via `plan.exclude_from_info_box: true` 
---

## Implementation Plan

### Phase 1: Core Implementation
1. Create `info-box-shp.ts` element component (follows element pattern)
2. Add `InfoBoxConfig` interface to main config
3. Implement entity detection by device_class (motion, occupancy, temperature)
4. Implement rendering with `<ha-icon>` and time formatting (reuse from motion-sensor-shp)
5. Use existing element positioning/scaling logic (DRY)
6. Render info box as last element in room element list
7. Add `exclude_from_info_box` to PlanConfig interface
8. Add configuration in visual editor (room section)
9. Add translations

### Phase 2: Additional Types
1. Add humidity support
2. Add co2 support  
3. Add light_level support

### Phase 3: Detail Mode
1. Implement clickable info items (more-info dialog)
2. Vertical layout for detail mode
3. Optional label display

---

## Configuration Examples

### Example 1: Minimal (use all defaults)
```yaml
rooms:
  - name: Living Room
    # Info box enabled by default with motion, occupancy, temperature
```

### Example 2: Position Override
```yaml
rooms:
  - name: Bedroom
    info_box:
      position:
        top: 10
        right: 10  # Position in top-right corner
```

### Example 3: Exclude Types
```yaml
rooms:
  - name: Bathroom
    info_box:
      exclude:
        - temperature  # Don't show temperature in bathroom
```

### Example 4: Disable Info Box
```yaml
rooms:
  - name: Hallway
    info_box:
      show: false  # No info box in hallway
```

### Example 5: House-Level Defaults
```yaml
type: custom:scalable-house-plan
info_box_defaults:
  position:
    top: 5
    left: 5
  exclude: []  # Global exclusions (empty = show all types)
rooms:
  - name: Living Room
    # Inherits house defaults
  - name: Bedroom
    info_box:
      exclude:
        - humidity  # Override: no humidity in bedroom
```

### Example 6: Entity-Level Exclusion
```yaml
rooms:
  - name: Living Room
    entities:
      - entity: sensor.outdoor_temperature
        plan:
          exclude_from_info_box: true  # Don't show in info box (wrong sensor)
      - entity: sensor.living_room_temperature
        # This one will appear in info box
```

---

## Open Questions

**None!** All decisions have been finalized.
