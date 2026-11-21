# Card options

```yaml
type: custom:scalable-house-plan
image: /local/willow-lane.jpg
image_width: 1600
image_height: 995
rooms: [...]
```

| Option | Default | Meaning |
| --- | --- | --- |
| `type` | (required) | `custom:scalable-house-plan` |
| `image` | (required) | URL of the floor plan picture, e.g. `/local/house.png` for `config/www/house.png`. |
| `image_width` | (required) | The picture's width in pixels. |
| `image_height` | (required) | The picture's height in pixels. |
| `rooms` | `[]` | The rooms, see [room options](room-options.md). |
| `readability_mode` | `bright-image` | `bright-image` or `dark-image`: the halo style of text and icons, see [readability mode](../concepts/positioning.md#readability-mode). |
| `min_scale` | | The plan is never scaled below this (per axis on the overview). |
| `max_scale` | | The plan is never scaled above this. |
| `element_detail_scale_ratio` | `0.25` | How much elements grow with the room in the room detail: `0` not at all, `1` fully, see [element scaling](../concepts/positioning.md#element-scaling-in-the-room-detail). |
| `dynamic_colors` | | Colours and timing of the [dynamic room colours](../concepts/dynamic-colors.md#options). |
| `element_defaults` | | House-level options per element type, see [element defaults](../concepts/element-defaults.md). |
| `show_room_backgrounds` | `false` | Fill every room with its fixed `color` instead of the dynamic colour. Helps while drawing outlines. |
| `realtime_updates` | `false` | Pass every state change to the plan immediately. By default the plan redraws at most once a second (and immediately for a few seconds after you control something from it), which keeps busy houses smooth on wall tablets. |
| `card_size` | `1` | The card size reported to masonry dashboards. |
