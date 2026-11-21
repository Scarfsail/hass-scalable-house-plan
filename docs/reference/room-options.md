# Room options

```yaml
rooms:
  - name: Living room
    area: living_room
    boundary: [[767, 522], [1220, 522], [1220, 742], [767, 742]]
    entities: [...]
```

| Option | Default | Meaning |
| --- | --- | --- |
| `name` | (required) | The room's name; with an `area`, the area's name is shown instead. |
| `area` | | A Home Assistant area ID. The room takes the area's name, icon and entities, see [rooms and areas](../concepts/rooms-and-areas.md). |
| `boundary` | (required) | The outline: `[x, y]` points in picture pixels, at least three. |
| `entities` | (required) | What belongs to the room: entity IDs, or objects with `entity` and an optional [`plan`](plan-options.md). |
| `color` | | A fixed fill colour (e.g. `rgba(255, 0, 0, 0.2)`), shown only with the card's `show_room_backgrounds`. |
| `disable_dynamic_color` | `false` | Keep the room transparent instead of [dynamically coloured](../concepts/dynamic-colors.md). |
| `elements_clickable_on_overview` | `false` | Elements of this room react to taps on the overview; the room then no longer opens from the overview, see [actions](../concepts/actions.md#on-the-overview). |
| `show_as_dashboard` | `false` | Render the room as a dark screen, see [rooms as dashboards](../dashboards.md). |
| `dashboard_glare` | `top-center` | The dashboard's glare: `top-center`, `left-center`, `full` or `lcd`. |
| `dashboard_overview_opacity` | `100` | The dashboard's opacity on the overview, in percent. |
| `detail_view` | | A Home Assistant view (`dashboard/view`) to open instead of the room detail, see [rooms as dashboards](../dashboards.md#opening-a-home-assistant-view-instead). |
