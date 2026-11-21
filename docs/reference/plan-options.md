# Plan options

The `plan` of a room entity places it on the plan:

```yaml
- entity: light.living_room_floor_lamp
  plan:
    left: 400
    top: 160
    light: ambient
    element:
      show_title: true
```

| Option | Default | Meaning |
| --- | --- | --- |
| `left`, `right`, `top`, `bottom` | | Position from the room's edges: a number in picture pixels, or a percentage string such as `"10%"`. See [positioning](../concepts/positioning.md). |
| `element` | chosen from the entity | The element and its options, see [elements](../elements/index.md). Required, with `type`, for elements without an entity. |
| `overview` | `true` | Show the element on the overview; `false` shows it only in the room detail. |
| `overview_active_only` | `true` for climate, else `false` | On the overview, show the element only while its entity is active (light on, cover not closed…). |
| `position_scaling_horizontal` | `plan` | How the horizontal position scales in the room detail: `plan`, `element` or `fixed`, see [position scaling](../concepts/positioning.md#position-scaling-modes). |
| `position_scaling_vertical` | `plan` | The same for the vertical position. |
| `style` | | Extra CSS for the element's wrapper, as a string or a map. |
| `tap_action`, `hold_action` | more-info; toggle for toggleable domains | What a tap and a hold do, see [actions](../concepts/actions.md). |
| `light` | `normal` | For lights: `ambient` gives the room the ambient [dynamic colour](../concepts/dynamic-colors.md) instead of the lights colour. |
| `disable_dynamic_color` | `false` | Leave this entity out of the room's dynamic colour. |
| `exclude_from_info_box` | `false` | Leave this entity out of the room's [info box](../elements/info-box.md). |
