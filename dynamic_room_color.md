# Intro
I want to create a new fature - dynamic room background color based on various sensors state. Specifically:
- Detect sensors like occupancy or motion sensor, lights
- When there is occupancy/motion detected make the color very light blue
- When some light is turned on, make the color very light yellow (like a light)
- When none of these sensors is on, the color is same as now

When room background color option is enabled in the config (mostly used for debugging purposes), disable the dynamic room background and use the static one.

# Detailed description

## Motion/occupancy:
Get all motion/ occupancy sensors in the room

### Motion
When the motion is detected (on), set the color to blue one. As this is not occupancy and is just shortly in on state, keep it blue for another 1 minute.

## Occupancy
Keep it also blue the same time as te sensor is on (maybe we will add also some delay later, but now the delay will be 0)


## Lights
Get all lights in the room and when any of them is on, set the color to the light yellow one.


## Conflicts
What if both lights and occupancy are on? Prefer occupancy.


# Settings
- The colors will be configurable in the house plan general section (including the visual config).
  - The defaults will be as described above
- Each sensor could be opted-out from the evaluation (e.g. some unwanted light which is always on)
  - Optional bool parameter in the entity's "plan" section: "no-dynamic-color"
  - when is set to true, don't consider this entity for the evaluation

# Visualisation
- Both detail and overview will use the same color
- The color should have very low opacity, so the elements below that are greatly visible.
- The colors should have light tone as we use dark theme
- It would be great, if there could be some gradient starting from "walls" in darker tone going to center with brighter tone - so when it represents lights, it looks like turned on light
- The same should apply for the motion/occupancy

---

# Implementation Analysis & Questions

## Architecture Proposal

### 1. **Dynamic Color Calculation Logic**
Location: New utility function in `src/utils/room-color-helpers.ts`

**Function: `calculateDynamicRoomColor()`**
- Input: `hass`, `room`, `config`, `motionDelayState`
- Output: Calculated color string (rgba)
- Logic:
  1. Check if `show_room_backgrounds` is enabled → return static color (disable dynamic)
  2. Filter room entities by domain (binary_sensor, light)
  3. Check opt-out flag: `entity.plan?.disable_dynamic_color === true`
  4. Evaluate motion/occupancy states (with delay tracking)
  5. Evaluate light states
  6. Apply precedence: Occupancy/Motion > Lights > Default
  7. Return appropriate color from config

### 2. **Motion Delay Tracking**
Location: `scalable-house-plan-room.ts` component state

**Approach:**
- Add private state: `_motionDelayTimers: Map<string, number>` (entity_id → setTimeout ID)
- When motion sensor goes from "on" → "off", start 60-second timer
- Keep blue color during timer period
- Clear timer if motion triggers again before expiry
- Clean up timers in `disconnectedCallback()`

### 3. **Color Configuration**
Location: `ScalableHousePlanConfig` interface

**New properties:**
```typescript
interface ScalableHousePlanConfig {
  // ... existing properties
  dynamic_colors?: {
    motion_occupancy?: string;      // Default: 'rgba(135, 206, 250, 0.15)' (light blue)
    lights?: string;                // Default: 'rgba(255, 255, 224, 0.15)' (light yellow)
    default?: string;               // Default: 'rgba(128, 128, 128, 0.05)' (very light gray)
    motion_delay_seconds?: number;  // Default: 60
  }
}

interface Room {
  // ... existing properties
  disable_dynamic_color?: boolean;  // Default: false - when true, room is transparent (no dynamic colors)
}

interface PlanConfig {
  // ... existing properties
  disable_dynamic_color?: boolean;  // Opt-out entity from dynamic color evaluation
}
```

### 4. **Gradient Implementation**
Location: SVG polygon in `_renderOverview()` and `_renderDetail()`

**Approach:**
- Replace solid fill with `<radialGradient>` or `<linearGradient>` in SVG
- Calculate gradient center from room boundary polygon center point
- Outer stop: Darker tone (opacity ~0.2)
- Inner stop: Lighter tone (opacity ~0.05-0.1)
- Different gradients for motion vs lights

### 5. **Reactivity**
**Current behavior:** Components re-render when `hass` property changes (automatic in Lit)

**Required updates:**
- Room component already has `hass` as property
- When state changes, `hass` object reference changes → triggers render
- Need to call `calculateDynamicRoomColor()` in `willUpdate()` lifecycle
- Cache result to avoid recalculation unless dependencies change

---

## Final Decisions (Confirmed)

| # | Topic | Decision |
|---|-------|----------|
| 1 | Static Room Color | When `show_room_backgrounds` enabled → disable dynamic colors, use static |
| 2 | Entity Detection | Only `light.*`, `binary_sensor.motion`, `binary_sensor.occupancy`. No `person.*` for now |
| 3 | Gradient Center | Geometric center of polygon (no override needed initially) |
| 4 | Multiple Lights | Single yellow color regardless of count |
| 5 | Motion Delay Reset | Reset timer when motion triggers again |
| 6 | Opt-out Scope | `disable_dynamic_color` applies to both overview & detail; entity still renders visually |
| 7 | Transitions | Smooth 0.5s CSS transition for color changes |
| 8 | Default State | Very light gray `rgba(128, 128, 128, 0.05)` when no activity |
| 9 | Gradient Intensity | Outer: 0.2 opacity, Center: 0.05 opacity |
| 10 | Editor Location | New collapsible section "Dynamic Room Colors" |

### Additional Requirement (from Q8)
**Room-level opt-out:** Add `disable_dynamic_color` boolean to Room interface.
- When `true` → room background is transparent (current behavior)
- When `false` or undefined → dynamic colors active
- Configurable in room editor settings
---

## Implementation Steps (Proposed)

1. **Create utility function** (`room-color-helpers.ts`)
   - Entity filtering by domain and device_class
   - State evaluation logic
   - Color calculation with precedence: Motion/Occupancy > Lights > Default
   - Return gradient color definition (inner/outer stops)

2. **Update interfaces** (`scalable-house-plan.ts`)
   - Add `dynamic_colors` config to `ScalableHousePlanConfig`
   - Add `disable_dynamic_color` to `Room` interface
   - Add `disable_dynamic_color` to `PlanConfig` interface

3. **Update room component** (`scalable-house-plan-room.ts`)
   - Add motion delay state: `_motionDelayActive: Map<string, boolean>`
   - Add timer tracking: `_motionDelayTimers: Map<string, number>`
   - Track previous entity states for state change detection
   - Integrate color calculation in `willUpdate()` lifecycle
   - Implement SVG radial gradients
   - Add 0.5s CSS transition for smooth color changes
   - Clean up timers in `disconnectedCallback()`

4. **Update main editor** (`scalable-house-plan-editor.ts`)
   - Add new collapsible section "Dynamic Room Colors"
   - Color pickers for motion/lights/default colors
   - Delay duration input (seconds)

5. **Update room editor** (`editor-room-shp.ts`)
   - Add toggle for `disable_dynamic_color`

6. **Add translations** (`cs.json` and `en.json`)
   - "dynamic_room_colors": "Dynamic Room Colors"
   - "motion_occupancy_color": "Motion/Occupancy Color"
   - "lights_color": "Lights Color"
   - "default_color": "Default Color"
   - "motion_delay_seconds": "Motion Delay (seconds)"
   - "disable_dynamic_color": "Disable Dynamic Color" (for room)
   - "disable_dynamic_color_entity": "Exclude from Dynamic Color" (for entity)

7. **Add entity-level opt-out** (`editor-element-shp.ts`)
   - Add checkbox for `disable_dynamic_color` in element plan section

8. **Testing**
   - Test with various entity combinations
   - Test motion delay behavior (timer reset)
   - Test gradient rendering in both overview and detail
   - Test room-level opt-out
   - Test entity-level opt-out
   - Test performance with many rooms
   - Test CSS transitions

---

## Technical Considerations

### Performance
- Color calculation happens on every render when `hass` changes
- Should be fast (simple entity filtering + state checks)
- Cache computed color in component state if performance issues arise

### Memory
- Timer cleanup critical to avoid memory leaks
- Clear all timers in `disconnectedCallback()`
- Use WeakMap if tracking many rooms (probably not needed)

### Browser Compatibility
- SVG gradients: Widely supported
- CSS transitions: Widely supported
- No compatibility concerns expected

### Home Assistant Best Practices
- Use `hass.states` for entity state access ✓
- Follow Lit component patterns ✓
- Proper cleanup in lifecycle methods ✓
- Localization support ✓