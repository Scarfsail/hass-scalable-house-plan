# Your first plan

## 1. The picture

Any image of your floor plan works: an architect's drawing, a photo of a sketch, or a rendered top-down view like Willow Lane's. Light images suit the default overlay style; for a dark image see [readability mode](../concepts/positioning.md#readability-mode).

Copy the picture to `config/www/` on your Home Assistant. A file at `config/www/house.png` is served as `/local/house.png`.

Note its size in pixels (width and height). Every coordinate in the card is measured in pixels of this picture, so these two numbers are what makes the plan scale.

!!! tip
    Keep the picture reasonably small (around 1600 px wide is plenty). It is downloaded by every device that opens the dashboard.

## 2. The card

Add the card to a dashboard. It works best as the only card in a view of the **Panel** type, where it gets the whole screen:

```yaml
type: custom:scalable-house-plan
image: /local/house.png
image_width: 1600
image_height: 995
rooms: []
```

The plan fills the card and scales with it. Both `image_width` and `image_height` are required; without them the card asks you to set them.

## 3. The first room

A room is a polygon on the picture: a list of `[x, y]` points in picture pixels, in order around the room. Find the corners with any image viewer that shows pixel coordinates, or draw the outline in the [visual editor](visual-editor.md).

```yaml
rooms:
  - name: Living room
    area: living_room          # optional: a Home Assistant area
    boundary: [[767, 522], [1220, 522], [1220, 742], [767, 742]]
    entities:
      - entity: light.living_room_ceiling
        plan:
          left: 250
          top: 75
```

Tap the room on the overview and it opens in detail. The light is drawn as a state icon 250 px from the room's left edge and 75 px from its top edge, again in picture pixels: element positions are relative to the room, so moving a room's outline moves its elements with it.

An entity listed without `plan` (just `- light.living_room_floor_lamp`) is not drawn on the plan; it belongs to the room and is shown in its [entities view](../concepts/views.md#entities-view).

## Next

- Outline the remaining rooms and place elements with [the visual editor](visual-editor.md).
- Learn which [element](../elements/index.md) each entity gets and how to choose another.
- Connect rooms to [areas](../concepts/rooms-and-areas.md) so their entities come along.
