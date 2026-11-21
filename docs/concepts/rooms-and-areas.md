# Rooms and areas

## The room outline

A room is a polygon on the plan picture. `boundary` lists its corners as `[x, y]` pairs in picture pixels, in order around the room (clockwise or anticlockwise, it does not matter). Any number of corners works, at least three, so L-shaped rooms and rooms with a jog are just more points:

```yaml
- name: Driveway
  boundary: [[150, 482], [418, 482], [418, 770], [438, 770], [438, 935], [150, 935]]
```

Trace the outline on the inside faces of the walls. The outline is what you tap on the overview, what glows with the [dynamic colour](dynamic-colors.md), and what the room detail cuts out of the picture and enlarges. Outlines may leave gaps (walls) between rooms, but should not overlap.

The [visual editor](../getting-started/visual-editor.md#room-outline-handles) lets you drag the corners on the picture instead of typing numbers.

Every element position in the room is measured from the top-left corner of the outline's bounding box (the smallest `x` and smallest `y` of its corners), see [positioning](positioning.md).

## Linking a room to an area

`area` takes a Home Assistant area ID (pick it in the editor). A room with an area:

- shows the **area's name** instead of `name`, and the area's **icon** in the room detail header (without an area the icon is `mdi:home`),
- gets **all the area's entities**: those assigned to the area directly and those whose device is in the area. They appear in the [entities view](views.md#entities-view) and feed the [info box](../elements/info-box.md) even when you never list them. The [dynamic colour](dynamic-colors.md) is the exception: it only follows the lights and motion sensors listed in the room.

```yaml
- name: Living room        # used only if the area has no name
  area: living_room
  boundary: [[767, 522], [1220, 522], [1220, 742], [767, 742]]
  entities:                # only what you want to place, or to tune
    - entity: light.living_room_floor_lamp
      plan: { left: 400, top: 160, light: ambient }
```

`name` is still required: it identifies the room in the configuration and is the name shown when the area is missing.

## Listing entities

Each entry in `entities` is either an entity ID or an object:

| Entry | Meaning |
| --- | --- |
| `- light.kitchen_ceiling` | Belongs to the room; not drawn on the plan. Shown in the entities view and counted for colours and the info box. |
| `- entity: light.kitchen_ceiling`<br>`  plan: {left: 150, top: 110}` | Drawn on the plan at that position, with the element chosen for it ([elements](../elements/index.md)). |
| `- entity: ""`<br>`  plan: {left: 10, top: 10, element: {type: custom:info-box-shp}}` | An element without an entity: an info box, group, badges, script buttons or iframe. `element.type` is required. |

Entities from the area that you list yourself are not duplicated: your entry wins.
