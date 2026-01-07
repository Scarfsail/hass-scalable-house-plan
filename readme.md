# Home Assistant's Scalable House Plan

## About
Scalable version of Home Assistant's [House Plan](https://www.home-assistant.io/dashboards/picture-elements/).

It scales the whole content, including inner elements, to fit both width and height into the parent container.

This library also contains some custom elements like door/window element to better visualize house state.

## Table of Contents

- [Home Assistant's Scalable House Plan](#home-assistants-scalable-picture-elements)
  - [About](#about)
  - [Table of Contents](#table-of-contents)
  - [Installing](#installing)
  - [Quick Reference](#quick-reference)
  - [Main Component: `scalable-house-plan`](#main-component-scalable-house-plan)
    - [Key Features](#key-features)
    - [Configuration](#configuration)
    - [How It Works](#how-it-works)
  - [Custom Elements](#custom-elements)
    - [Common Features](#common-features)
  - [1. `analog-bar-element`](#1-analog-bar-element)
    - [Features](#features)
    - [Configuration](#configuration-1)
    - [Example](#example)
  - [2. `analog-element`](#2-analog-element)
    - [Features](#features-1)
    - [Configuration](#configuration-2)
    - [Example](#example-1)
  - [3. `badge-element`](#3-badge-element)
    - [Features](#features-2)
    - [Configuration](#configuration-3)
    - [Example](#example-2)
  - [4. `camera-element`](#4-camera-element)
    - [Features](#features-3)
    - [Configuration](#configuration-4)
    - [Example](#example-3)
  - [5. `door-window-element`](#5-door-window-element)
    - [Features](#features-4)
    - [Configuration](#configuration-5)
    - [Example](#example-4)
  - [6. `gate-buttons-element`](#6-gate-buttons-element)
    - [Features](#features-5)
    - [Configuration](#configuration-6)
    - [Example](#example-5)
    - [Notes](#notes)
  - [7. `iframe-element`](#7-iframe-element)
    - [Features](#features-6)
    - [Configuration](#configuration-7)
    - [Example](#example-6)
  - [8. `image-last-change-element`](#8-image-last-change-element)
    - [Features](#features-7)
    - [Configuration](#configuration-8)
    - [Example](#example-7)
  - [9. `motion-sensor-element`](#9-motion-sensor-element)
    - [Features](#features-8)
    - [Configuration](#configuration-9)
    - [Example](#example-8)
  - [10. `scalable-house-plan-layers`](#10-scalable-house-plan-layers)
    - [Features](#features-9)
    - [Configuration](#configuration-10)
    - [Example](#example-9)
    - [Notes](#notes-1)
  - [11. `scripts-buttons-group-element`](#11-scripts-buttons-group-element)
    - [Features](#features-10)
    - [Configuration](#configuration-11)
    - [Example](#example-10)
    - [Notes](#notes-2)
  - [12. `state-icon-trigger-element`](#12-state-icon-trigger-element)
    - [Features](#features-11)
    - [Configuration](#configuration-12)
    - [Example](#example-11)
    - [Notes](#notes-3)
  - [Complete Usage Example](#complete-usage-example)
    - [Tips for Using This Example](#tips-for-using-this-example)
  - [Local development and debugging](#local-development-and-debugging)
    - [This requires to run HASS local dev environment](#this-requires-to-run-hass-local-dev-environment)
    - [To properly develop and debug this repo inside HASS Dev Container, following steps are needed:](#to-properly-develop-and-debug-this-repo-inside-hass-dev-container-following-steps-are-needed)

## Installing

This card is available in [HACS](https://hacs.xyz/) (Home Assistant Community Store).

Just search for Scalable House Plan in the plugins tab.

---

## Quick Reference

| Element | Purpose | Key Features |
|---------|---------|--------------|
| `scalable-house-plan` | Main card component | Automatic scaling, layer management, persistence |
| `analog-bar-element` | Vertical bar graph | Min/max ranges, value display, color customization |
| `analog-element` | Numeric value display | Simple text with formatting |
| `badge-element` | Entity badge | Native HA badge in House Plan |
| `camera-element` | Camera stream | Live video feed display |
| `door-window-element` | Door/window sensor | Visual bar, alarm integration, last change time |
| `gate-buttons-element` | Gate/garage controls | State-aware buttons (open/close/stop) |
| `iframe-element` | Embed webpage | External content via iframe |
| `image-last-change-element` | Entity image + time | Circular image with last change |
| `motion-sensor-element` | Motion sensor | Icon with alarm state colors |
| `scalable-house-plan-layers` | Layer controls | Toggle buttons for layers |
| `scripts-buttons-group-element` | Script controls | Multiple script buttons with running status |
| `state-icon-trigger-element` | State icon + trigger | Shows how state was triggered (A/U/M) |

---

## Main Component: `scalable-house-plan`

The main component is an enhanced version of Home Assistant's picture-elements card that provides automatic scaling and layer management.

### Key Features

1. **Automatic Scaling**: Scales the entire card content (including all elements) to fit the parent container while maintaining aspect ratio
2. **Layer System**: Organize elements into logical layers that can be toggled on/off
3. **Layer Persistence**: Layer visibility states are saved to localStorage and restored on page reload
4. **Dynamic Scaling**: Responds to viewport changes and container resizing
5. **Min/Max Scale Limits**: Configure minimum and maximum scale factors
6. **Group Organization**: Elements within layers can be organized into named groups

### Configuration

```yaml
type: custom:scalable-house-plan
title: My House                    # Optional: Card title
background_image: /local/path/to/image.png
background_width: 1360            # Original image width in pixels
background_height: 849            # Original image height in pixels
max_scale: 2.0                    # Optional: Maximum scale factor
min_scale: 0.5                    # Optional: Minimum scale factor
card_size: 1                      # Optional: Card size for layout calculation
layers_visibility_persistence_id: "unique-id"  # Optional: Custom persistence ID

# Entity-Based Room Structure
rooms:
  - name: "Living Room"
    color: 'rgba(100, 150, 200, 0.2)'  # Optional: Room background color
    boundary:                           # Room polygon coordinates
      - [100, 100]
      - [500, 100]
      - [500, 400]
      - [100, 400]
    entities:
      # Simple string shorthand (detail-only, no plan display)
      - binary_sensor.smoke_detector
      
      # Entity with plan display (uses default element type from mapping)
      - entity: binary_sensor.living_room_window
        plan:
          left: 100                     # Position relative to room
          top: 50
          # Element type auto-selected: door-window-shp
          # Default properties applied: width: 20, orientation: horizontal
      
      # Entity with custom properties (merged with defaults)
      - entity: binary_sensor.front_door
        plan:
          left: 0
          top: 150
          element:
            width: 30                   # Override default width (27)
            orientation: vertical       # Override default orientation
      
      # Entity with explicit element type (no merging)
      - entity: light.living_ceiling
        plan:
          left: 250
          top: 200
          element:
            type: custom:state-icon-trigger-shp  # Explicit type
            size: 30                    # Custom properties
      
      # Camera with plan and detail
      - entity: camera.living_room
        plan:
          left: 300
          top: 100
          element:
            width: 80                   # Override default plan size
            # Detail view will use larger size from mapping
      
      # Element with custom styling
      - entity: binary_sensor.alarm_sensor
        plan:
          left: 400
          top: 50
          style:
            z-index: 999               # Render on top of other elements
            opacity: 0.8               # Semi-transparent
          # or as string: style: "z-index: 999; opacity: 0.8"

# Layer System (Optional)
layers:
  - id: ground_floor
    name: "Ground Floor"
    icon: "mdi:floor-plan"
    image: /local/ground_floor.png
    default: true
    visible: true
    showInToggles: true
```

### How It Works

**Entity-Based Structure:**
- Rooms contain entities (not elements directly)
- Each entity can have an optional `plan` section for positioned display
- Entities without `plan` appear only in entities list view
- String shorthand supported for entities-only entities

**Three-View Navigation:**
1. **Overview** - Shows the full house plan with all rooms and positioned elements
   - Displays entities with `plan` section and `overview: true` (default)
   - Click a room to open Detail view
2. **Detail** - Shows the selected room's SVG shape with positioned elements
   - Displays all entities with `plan` section (both overview: true and false)
   - Shows room shape with same background color as overview
   - Click three-dots menu (⋮) to open Entities list
3. **Entities** - Shows all room entities as standard HA cards
   - Organized by category (lights, sensors, climate, etc.)
   - Shows all entities in the room (with or without plan configuration)
   - Click back to return to Detail view

**Default Element Type Mapping:**
- Element types are automatically selected based on entity domain and device_class
- Example: `binary_sensor.door` → `door-window-shp` with default properties
- Property merging: user properties override defaults (unless explicit `type` is specified)
- Detail and entities views use separate element types (most default to `tile`)

**Room-Relative Positioning:**
- Element positions in `plan.left/top` are relative to room's top-left corner
- Automatic coordinate transformation to absolute positions
- Supports negative values and positions beyond room boundaries

**Custom Element Styling:**
- Use `plan.style` to apply custom CSS styles to the element wrapper
- Accepts both object notation `{ property: 'value' }` or string notation `"property: value"`
- Style is applied alongside position properties (left, top, right, bottom)
- Example uses: z-index, opacity, pointer-events, custom animations, etc.

**Coordinate System:**
- The card creates a scaled container that transforms all child elements proportionally
- Elements are positioned using absolute positioning with pixel coordinates
- Room boundaries define clickable polygon areas
- CSS variables control layer visibility (`--layer-{index}-display`)
- Layer states are stored in localStorage using a generated or custom persistence ID
- The card automatically recalculates scale on viewport or container size changes

---

## Custom Elements

All custom elements can be used either within `scalable-house-plan` or in standard Home Assistant picture-elements cards.

### Common Features

Most elements extend from base classes that provide:
- **Entity binding**: Automatic state updates from Home Assistant entities
- **Tap actions**: Support for tap_action configuration
- **More info dialog**: Click to open entity details (customizable)
- **Template support**: JavaScript template evaluation for dynamic values

---

## 1. `analog-bar-element`

A vertical bar graph element that visualizes numeric sensor values with a filled bar indicator.

### Features
- Displays numeric values as a vertical bar (like a thermometer)
- Configurable min/max ranges
- Customizable colors (border, active, background)
- Value display with optional positioning (bottom, scale top, or scale bottom)
- Number formatting with prefix support (K, M, B, etc.)
- Supports decimal precision

### Configuration

```yaml
type: custom:analog-bar-element
entity: sensor.temperature
value: 0            # Current value (auto-updated from entity)
min: 0              # Minimum value
max: 100            # Maximum value
height: 100         # Bar height in pixels
width: 20           # Bar width in pixels
border_color: gray  # Border color
active_color: "#404854"  # Fill color (supports JS templates)
bg_color: "rgba(0, 0, 0, 0.7)"  # Background color
font_size: 11       # Font size for value text (0 to hide)
value_position: bottom  # Value position: "bottom", "scaleTop", "scaleBottom"
shorten_and_use_prefix: K  # Optional: K, M, B for number formatting
decimals: 1         # Number of decimal places
```

### Example

```yaml
- type: custom:analog-bar-element
  entity: sensor.living_room_temperature
  min: 10
  max: 30
  height: 120
  width: 25
  border_color: "#555"
  active_color: "entity.state > 25 ? 'red' : 'green'"  # JS template
  bg_color: "rgba(0, 0, 0, 0.8)"
  font_size: 12
  value_position: scaleTop
  decimals: 1
```

---

## 2. `analog-element`

A simple text element that displays the numeric state of an entity with optional formatting.

### Features
- Displays entity state value
- Number formatting with prefix support
- Decimal precision control
- Shows unit of measurement from entity

### Configuration

```yaml
type: custom:analog-element
entity: sensor.power_consumption
decimals: 2         # Number of decimal places
shorten_and_use_prefix: K  # Optional: K, M, B for number formatting
```

### Example

```yaml
- type: custom:analog-element
  entity: sensor.energy_usage
  decimals: 1
  shorten_and_use_prefix: K  # Shows "1.5K" instead of "1500"
```

---

## 3. `badge-element`

A wrapper for Home Assistant's built-in entity badge element, allowing badges within House Plan.

### Features
- Displays entity as a badge (icon + state)
- Uses native Home Assistant badge styling
- Automatically updates with entity state changes

### Configuration

```yaml
type: custom:badge-element
entity: person.john_doe
```

### Example

```yaml
- type: custom:badge-element
  entity: person.jane
  left: 50
  top: 50
```

---

## 4. `camera-element`

Displays a live camera stream from a Home Assistant camera entity.

### Features
- Shows live camera stream
- Configurable dimensions
- Uses Home Assistant's camera proxy with authentication

### Configuration

```yaml
type: custom:camera-element
entity: camera.front_door
height: 200         # Stream height in pixels
width: 300          # Stream width in pixels
```

### Example

```yaml
- type: custom:camera-element
  entity: camera.driveway
  height: 240
  width: 320
  left: 100
  top: 100
```

---

## 5. `door-window-element`

Visualizes door/window sensors with a colored bar and last change time. Integrates with Alarmo for alarm state indication.

### Features
- Visual bar indicator (horizontal or vertical)
- Color-coded states:
  - Blue: Open
  - Green: Closed and alarm armed
  - Red: Closed but alarm disarmed
  - White: Closed (no alarm integration)
- Shows time since last state change
- Alarmo integration for alarm state

### Configuration

```yaml
type: custom:door-window-element
entity: binary_sensor.front_door
width: 50           # Width in pixels
height: 7           # Height in pixels (default: 7)
orientation: horizontal  # "horizontal" or "vertical" (default: horizontal)
```

### Example

```yaml
- type: custom:door-window-element
  entity: binary_sensor.bedroom_window
  width: 40
  height: 8
  orientation: vertical
  left: 200
  top: 150
```

---

## 6. `gate-buttons-element`

Smart control buttons for gate/garage door covers that adapt based on current state.

### Features
- Dynamic button display based on cover state
- State-specific buttons:
  - **Open**: Shows "Close" button
  - **Closed**: Shows "Open" button
  - **Opening**: Shows "Stop" and "Close" buttons
  - **Closing**: Shows "Stop" and "Open" buttons
  - **Partially Open**: Shows "Open" and "Close" buttons
- Color-coded buttons (success/warning/primary)
- Horizontal or vertical layout

### Configuration

```yaml
type: custom:gate-buttons-element
entity: cover.garage_door
orientation: horizontal  # "horizontal" or "vertical"
```

### Example

```yaml
- type: custom:gate-buttons-element
  entity: cover.main_gate
  orientation: vertical
  left: 300
  top: 200
```

### Notes
- Button text is currently in Czech ("Otevřít", "Zavřít", "Zastavit")
- Calls Home Assistant `cover.open_cover`, `cover.close_cover`, and `cover.stop_cover` services

---

## 7. `iframe-element`

Embeds an external webpage or resource via iframe.

### Features
- Embed any URL within House Plan
- Configurable dimensions
- No border styling

### Configuration

```yaml
type: custom:iframe-element
src: "https://example.com"  # URL to embed
height: 400         # Frame height in pixels
width: 600          # Frame width in pixels
```

### Example

```yaml
- type: custom:iframe-element
  src: "http://192.168.1.100:8123/camera-stream"
  height: 300
  width: 400
  left: 50
  top: 50
```

---

## 8. `image-last-change-element`

Displays an entity's image (from entity picture) along with time since last change.

### Features
- Shows entity image in a circular frame
- Displays time since last state change
- Configurable size
- Uses Home Assistant's image element internally

### Configuration

```yaml
type: custom:image-last-change-element
entity: person.john_doe
size: 50            # Image diameter in pixels (default: 50)
```

### Example

```yaml
- type: custom:image-last-change-element
  entity: device_tracker.phone
  size: 60
  left: 100
  top: 100
```

---

## 9. `motion-sensor-element`

Displays a motion sensor icon with alarm state integration and last change time.

### Features
- Shows motion sensor icon (mdi:motion-sensor)
- Color-coded based on Alarmo integration:
  - Red: Alarm armed
  - Green: Alarm disarmed
  - White: No alarm integration
- Displays time since last motion detected
- Alarmo integration support

### Configuration

```yaml
type: custom:motion-sensor-element
entity: binary_sensor.living_room_motion
```

### Example

```yaml
- type: custom:motion-sensor-element
  entity: binary_sensor.hallway_motion
  left: 250
  top: 300
```

---

## 10. `scalable-house-plan-layers`

A layer toggle control element that provides buttons to show/hide different layers.

### Features
- Displays toggle buttons for all layers with `showInToggles: true`
- Visual indication of active/inactive layers
- Custom icons and names per layer
- Communicates with parent card to toggle layer visibility
- Styled with semi-transparent background
- Empty state message when no toggleable layers exist

### Configuration

```yaml
type: custom:scalable-house-plan-layers
# No additional configuration needed - layers are passed from parent card
```

### Example

```yaml
layers:
  - name: "Ground Floor"
    icon: "mdi:floor-plan"
    visible: true
    showInToggles: true
    groups: [...]
  - name: "First Floor"
    icon: "mdi:stairs-up"
    visible: false
    showInToggles: true
    groups: [...]
elements:
  - type: custom:scalable-house-plan-layers
    left: 10
    top: 10
```

### Notes
- Automatically receives layer configuration from parent `scalable-house-plan` card
- Only layers with `showInToggles: true` appear in the control
- Layer visibility changes are persisted to localStorage

---

## 11. `scripts-buttons-group-element`

Displays a group of script execution buttons with visual feedback for running scripts.

### Features
- Multiple script buttons with custom labels and positions
- Shows which script is currently running
- Displays the current action of running script
- Cancel button for running scripts
- Absolute positioning for each button
- Custom position and size for running script indicator

### Configuration

```yaml
type: custom:scripts-buttons-group-element
scripts:
  - entity: script.morning_routine
    title: "Morning"
    left: 10
    top: 10
  - entity: script.evening_routine
    title: "Evening"
    left: 80
    top: 10
running_left: 10    # Position of running script indicator
running_top: 50
running_width: 200
running_height: 100
```

### Example

```yaml
- type: custom:scripts-buttons-group-element
  scripts:
    - entity: script.welcome_home
      title: "Welcome Home"
      left: 20
      top: 20
    - entity: script.leaving_home
      title: "Leaving"
      left: 120
      top: 20
    - entity: script.night_mode
      title: "Night Mode"
      left: 220
      top: 20
  running_left: 20
  running_top: 80
  running_width: 250
  running_height: 120
```

### Notes
- Only one script can run at a time (shows first running script found)
- Button text currently in Czech ("Probíhá", "Zrušit")
- Shows `last_action` attribute from running script entity

---

## 12. `state-icon-trigger-element`

Displays an entity's state icon with a small indicator showing how the last state change was triggered.

### Features
- Shows entity state icon (native HA state icon element)
- Small overlay indicator showing trigger source:
  - **A** (Automation) - Orange: Triggered by automation
  - **U** (User) - Blue: Manually triggered by user
  - **M** (Manual) - Gray: Other/manual trigger
- Uses entity context to determine trigger source
- Semi-transparent overlay badge

### Configuration

```yaml
type: custom:state-icon-trigger-element
entity: light.living_room
```

### Example

```yaml
- type: custom:state-icon-trigger-element
  entity: switch.hallway_light
  left: 150
  top: 200
```

### Notes
- Uses Home Assistant's entity context information
- Checks `context.parent_id` for automation triggers
- Checks `context.user_id` for user-initiated changes
- Helpful for understanding what triggered a state change

---

## Complete Usage Example

Here's a comprehensive example showing the entity-based room structure with automatic element type mapping:

```yaml
type: custom:scalable-house-plan
title: My Smart Home
background_image: /local/floorplan.png
background_width: 1000
background_height: 800
max_scale: 3.0
min_scale: 0.5
layers_visibility_persistence_id: "my-house-plan"

rooms:
  - name: Living Room
    color: 'rgba(100, 150, 200, 0.2)'
    boundary:
      - [100, 100]
      - [500, 100]
      - [500, 400]
      - [100, 400]
    entities:
      # Door with custom width
      - entity: binary_sensor.door_main
        plan:
          left: 50
          top: 150
          element:
            width: 30
      
      # Window with defaults
      - entity: binary_sensor.window_living_1
        plan:
          left: 200
          top: 0
      
      # Motion sensor
      - entity: binary_sensor.motion_living
        plan:
          left: 250
          top: 200
      
      # Camera
      - entity: camera.living_room
        plan:
          left: 300
          top: 100
          element:
            width: 80
      
      # Detail-only entities
      - light.living_ceiling
      - light.living_wall
      - sensor.living_temperature
      - sensor.living_humidity

  - name: Kitchen
    color: 'rgba(200, 150, 100, 0.2)'
    boundary:
      - [500, 100]
      - [800, 100]
      - [800, 400]
      - [500, 400]
    entities:
      # Door with custom element type
      - entity: binary_sensor.door_kitchen
        plan:
          left: 50
          top: 100
          element:
            type: custom:state-icon-trigger-shp
            size: 25
      
      # Battery sensor (analog on plan, bar in detail)
      - entity: sensor.kitchen_sensor_battery
        plan:
          left: 200
          top: 200
          element:
            size: 15
      
      # Scripts group
      - entity: script.kitchen_scenes
        plan:
          left: 300
          top: 250
          element:
            type: custom:scripts-buttons-group-shp
            scripts:
              - script: script.kitchen_bright
                icon: mdi:brightness-7
              - script: script.kitchen_dim
                icon: mdi:brightness-5
      
      # Multiple detail-only lights
      - light.kitchen_cabinet_1
      - light.kitchen_cabinet_2
      - light.kitchen_cabinet_3
      - switch.dishwasher

  - name: Bedroom
    color: 'rgba(150, 200, 150, 0.2)'
    boundary:
      - [100, 400]
      - [500, 400]
      - [500, 700]
      - [100, 700]
    entities:
      # Door with horizontal orientation
      - entity: binary_sensor.door_bedroom
        plan:
          left: 200
          top: 0
          element:
            orientation: horizontal
      
      # Windows
      - entity: binary_sensor.window_bedroom_1
        plan:
          left: 0
          top: 100
      
      - entity: binary_sensor.window_bedroom_2
        plan:
          left: 0
          top: 200
      
      # Climate
      - entity: climate.bedroom_ac
        plan:
          left: 250
          top: 150
      
      # Hidden on overview (positioned but only shown on detail)
      - entity: sensor.bedroom_temperature
        plan:
          overview: false
          left: 0
          top: 0
      
      # Entities list only
      - light.bedroom_ceiling
      - light.bedroom_nightstand_left
      - light.bedroom_nightstand_right

layers:
  - id: ground_floor
    name: Ground Floor
    icon: mdi:floor-plan
    image: /local/ground_floor.png
    default: true
    visible: true
    showInToggles: true
  
  - id: first_floor
    name: First Floor
    icon: mdi:home-floor-1
    image: /local/first_floor.png
    visible: false
    showInToggles: true
```

### Tips for Using This Example

1. **Entity-Based Structure**: List entities per room, not elements - type is inferred automatically
2. **String Shorthand**: Use simple strings for detail-only entities (no plan display)
3. **Property Merging**: Override specific default properties without specifying full element config
4. **Explicit Types**: Use `element.type` when you need a non-default element (disables merging)
5. **Room-Relative Positioning**: `plan.left/top` are relative to room's top-left corner
6. **Persistence ID**: Set unique `layers_visibility_persistence_id` to maintain layer states
7. **Scaling**: Adjust `max_scale` and `min_scale` based on screen sizes and image dimensions

---

## Local development and debugging
### This requires to run HASS local dev environment
1. Follow: https://developers.home-assistant.io/docs/development_environment/
2. The dev container runs inside the WSL, therefore this repo should be also cloned inside the same WSL

### To properly develop and debug this repo inside HASS Dev Container, following steps are needed:

1. Modify **devcontainer.json** and add following while the source points to folder if this repository. For example:
    ```json
    "mounts": [
    "source=/mnt/d/hass-scalable-house-plan,target=/workspaces/hass-core/config/www/hass-scalable-house-plan,type=bind,consistency=cached"
    ]

2. Clone https://github.com/home-assistant/frontend to hass-frontend. It's in .gitignore, but it's needed as types are used from the official repo
3. Once you run the dev HASS, you also need to register appropriate resources (JS files)
   1. Goto settings -> Dashobards -> Three dots in upper right corner -> Resources -> + ADD RESOURCE
   2. Add required resource (e.g. /local/hass-scalable-house-plan/dist/hass-scalable-house-plan-dev.js?dummy=1).
