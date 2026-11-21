# Positioning and scaling

## Where an element sits

An element's position is set in its `plan` with up to two of `left`, `right`, `top` and `bottom`, measured from the edges of the room's bounding box (the rectangle around the room outline):

- **A number** is a distance in picture pixels. `left: 250` is 250 px of the plan picture right of the room's leftmost corner.
- **A percentage string** is a share of the room's box. `right: "10%"` keeps the element 10 % of the room's width from its right edge.

Other strings (such as `"20px"`) are ignored. Use `left` or `right`, and `top` or `bottom`; the side you choose is also where the element grows from when it is scaled (an element positioned with `right` and `bottom` grows up and to the left).

Because positions are relative to the room, moving or reshaping the outline moves its elements along. A negative number places an element just outside the outline, which is how Willow Lane puts door and window bars on the walls:

```yaml
- entity: binary_sensor.kids_room_window
  plan:
    left: 90
    top: -8          # on the wall above the room
    element:
      width: 60
```

`plan.style` adds CSS to the element's wrapper, as a string (`"opacity: 0.6"`) or a map (`{ opacity: 0.6 }`).

## Element scaling in the room detail

On the overview elements keep their natural size (an icon is an icon, whatever the plan's scale). In the room detail the room is enlarged, and elements grow with it, but only partly, so a small room does not get giant icons:

`element scale = 1 + (room scale − 1) × element_detail_scale_ratio`

| `element_detail_scale_ratio` | Effect |
| --- | --- |
| `0` | Elements keep their size. |
| `0.25` (default) | Elements grow by a quarter of the room's enlargement: a room shown 3× larger gets elements 1.5× larger. |
| `1` | Elements scale exactly with the room. |

## Position scaling modes

Positions normally scale with the room, so an element stays on the same spot of the picture. In the room detail you can change that per axis with `position_scaling_horizontal` and `position_scaling_vertical`:

| Mode | The distance from the room edge… |
| --- | --- |
| `plan` (default) | scales with the room: the element stays on the same spot of the picture. |
| `element` | scales like the element itself (by the element scale above), so a large element near an edge doesn't run out of the room. |
| `fixed` | does not scale: the element stays that many screen pixels from the edge. |

The modes only affect the room detail (and need a non-zero `element_detail_scale_ratio`); on the overview every position follows the plan.

## Showing on the overview

- `overview: false` keeps an element out of the overview; it appears only in the room detail. Detail-only elements are a good way to keep a busy overview readable.
- `overview_active_only: true` shows an element on the overview only while its entity is active: a light or switch that is on, a binary sensor that is on, a cover that is not closed, a lock that is unlocked, an alarm that is not disarmed and so on. Climate entities do this by default (a thermostat that is off disappears from the overview); set `overview_active_only: false` to always show them.

## Scale limits

The overview fits the picture to the card's width and height independently, so a card with other proportions than the picture stretches it. `min_scale` and `max_scale` (card options) clamp the scale on each axis, on the overview and in the room detail alike, e.g. `max_scale: 1` never enlarges the picture beyond its real size.

## Readability mode

Text and icons on the plan get a halo so they stay readable on any picture. `readability_mode` picks the halo for your picture:

- `bright-image` (default): dark text with a light halo, for light floor plans like Willow Lane.
- `dark-image`: light text with a dark halo, for dark pictures.

Rooms shown [as dashboards](../dashboards.md) always use the dark style.
