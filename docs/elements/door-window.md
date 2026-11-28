# Door and window

`custom:door-window-shp`

A bar drawn on the wall: grey while closed, blue while open, with the time since it last opened or closed. It can carry the door's lock or the gate's motor as its control, so the door and its lock are one element. Place it over the door or window in the picture. It is the default for `binary_sensor` entities with the device class `door`, `window` or `garage_door`.

![The open bedroom window](../assets/images/el-door-window.png){ .shot }

```yaml
- entity: binary_sensor.main_bedroom_window
  plan:
    left: 362
    top: 85
    element:
      width: 70
      orientation: vertical
```

| Option | Default | Meaning |
| --- | --- | --- |
| `width` | `27` door, `20` window, `40` garage door | Length of the bar along the wall, in pixels. |
| `height` | `7` | Thickness of the bar. |
| `orientation` | `vertical` door, `horizontal` window and garage door | `horizontal` for a wall running left–right, `vertical` for one running up–down. |
| `text_position` | `end` | Which side of the bar the time goes: `end` (below a horizontal bar) or `start` (above it). On a vertical bar the label is turned to run along the bar. |
| `text_align` | `center` | Where along the bar the time sits: `start`, `center` or `end`. |
| `unobtrusive` | `false` | Draw an open door in the plan's text colour instead of blue. |
| `control_entity` | none | A `lock.*` or `cover.*` that opens or secures this door, window or gate. Shown as a chip after the time. |

The time since the last change is highlighted for the first seconds after a change, so a door that just opened stands out.

The bar's length follows the room: in the room detail it covers the same opening as on the picture, while its thickness, the time and the control chip grow only by the [element scale](../concepts/positioning.md#element-scaling-in-the-room-detail).

## Control

With `control_entity` set, a chip with Home Assistant's own icon for the lock or cover follows the time:

```yaml
- entity: binary_sensor.front_door
  plan:
    left: 120
    top: -4
    element:
      width: 40
      control_entity: lock.front_door
```

| Control state | Chip |
| --- | --- |
| Locked, or cover closed | Dark, green icon |
| Unlocked or open (a cover at any position) | Blue, like an open door |
| Locking, unlocking, opening or closing | Dark, orange icon |
| Jammed | Red |
| Unavailable or unknown | Dark, dimmed icon |

A cover that is open part way shows its position in the chip (`40%`).

## Tap and hold

A tap opens a popup with the door's state and how long it has been in it, the Alarmo state, the control's state with when and by whom it last changed, buttons for the control (Lock or Unlock, plus Open when the lock can unlatch; Open, Stop and Close for a cover), when the door was open in the last 24 hours, and links to Home Assistant's more-info of the sensor and of the control. For a [Helman](https://github.com/Scarfsail/hass-helman) device it also links to Helman's power and energy detail.

A hold locks an unlocked lock, unlocks a locked one, or toggles a cover. Without a `control_entity` a hold does nothing. A `tap_action` or `hold_action` in the `plan` replaces these.

If you use [Alarmo](https://github.com/nielsfaber/alarmo) and the sensor belongs to an Alarmo area, a closed door or window is drawn red while that area is armed and green while it is disarmed.
