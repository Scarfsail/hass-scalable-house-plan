# Elements

An element is what the card draws on the plan for an entity: an icon, a value, a door bar, a thermostat control. Each entity you place with `plan` gets an element; a few elements need no entity at all.

| Element | `type` | For |
| --- | --- | --- |
| [State icon](state-icon.md) | `custom:state-icon-shp` | Lights, switches, covers, anything with an icon |
| [Analog](analog.md) | `custom:analog-shp` | A sensor value, optionally with a gauge |
| [Analog bar](analog.md#analog-bar) | `custom:analog-bar-shp` | A sensor value as a vertical bar |
| [Badge](badges.md#badge) | `custom:badge-shp` | One Home Assistant badge |
| [Badges](badges.md#badges) | `custom:badges-shp` | A row of badges (no entity) |
| [Climate](climate.md) | `custom:climate-shp` | A thermostat with mode and temperature controls |
| [Camera](camera.md) | `custom:camera-shp` | A live camera picture |
| [Door and window](door-window.md) | `custom:door-window-shp` | A bar on the wall that turns blue when open |
| [Motion sensor](motion-sensor.md) | `custom:motion-sensor-shp` | Motion with the time since the last change |
| [Gate buttons](gate-buttons.md) | `custom:gate-buttons-shp` | Open, close and stop buttons for a cover |
| [Script buttons group](scripts-buttons-group.md) | `custom:scripts-buttons-group-shp` | Buttons that run scripts (no entity) |
| [Info box](info-box.md) | `custom:info-box-shp` | The room's motion, temperature, humidity and climate (no entity) |
| [Group](group.md) | `custom:group-shp` | Several elements moved as one (no entity) |
| [Image last change](image-last-change.md) | `custom:image-last-change-shp` | An image entity with its age |
| [Iframe](iframe.md) | `custom:iframe-shp` | A web page (no entity) |

## Which element an entity gets

You rarely have to choose: the card picks the element from the entity's domain and device class.

| Entity | Element | Automatic options |
| --- | --- | --- |
| `binary_sensor` door | Door and window | `width: 27`, `orientation: vertical` |
| `binary_sensor` window | Door and window | `width: 20`, `orientation: horizontal` |
| `binary_sensor` garage door | Door and window | `width: 40`, `orientation: horizontal` |
| `binary_sensor` motion or occupancy | Motion sensor | |
| `sensor` temperature | Analog | 20 px text, `gauge: {height: 8}` |
| `sensor` humidity or battery | Analog | 20 px text, `gauge: true` |
| `sensor` power or energy | Analog | 20 px text |
| any other `sensor` | Analog | |
| `climate` | Climate | |
| `camera` | Camera | `width: 60`, `height: 45` |
| `image` | Image last change | |
| `light`, `switch`, `fan`, `lock`, `cover`, any other `binary_sensor` and everything else | State icon | |

To choose another element or set options, add `element` to the plan. Options you give are merged over the automatic ones; giving a `type` replaces the automatic element and its options entirely:

```yaml
- entity: binary_sensor.main_bedroom_window
  plan:
    left: 362
    top: 85
    element:            # keeps the door-and-window element, overrides two options
      width: 70
      orientation: vertical
- entity: alarm_control_panel.home
  plan:
    left: 600
    top: 25
    element:
      type: custom:badge-shp
```

House-wide options per element type go in [`element_defaults`](../concepts/element-defaults.md).

## Elements without an entity

Info boxes, groups, badges, script buttons and iframes are placed with an empty `entity` and an explicit `type`:

```yaml
- entity: ""
  plan:
    left: 10
    top: 10
    element:
      type: custom:info-box-shp
```

## Options every element understands

Every element takes `style`, a map of CSS properties applied to the element itself (e.g. `style: {"font-size": "14px"}`), on top of the [plan options](../reference/plan-options.md) (position, overview visibility, actions) that apply around it.
