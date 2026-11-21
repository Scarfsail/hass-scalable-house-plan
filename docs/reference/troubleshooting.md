# Troubleshooting

**The card says "Please configure the image URL, width, and height".**
`image`, `image_width` and `image_height` are all required. The width and height are the picture's real size in pixels.

**The picture doesn't show.**
Open the `image` URL in the browser. A file in `config/www/` is served under `/local/`; files added to `config/www/` while Home Assistant runs may need a restart the first time the folder is created.

**The plan looks stretched.**
The overview fits the picture to the card's width and height independently. Put the card in a **Panel** view on a screen with roughly the picture's proportions, or limit the stretch with `min_scale` / `max_scale`.

**An element shows "Entity not found: …".**
The entity ID in the room doesn't exist (a typo, or a renamed entity). Elements without an entity (info box, group, badges, script buttons, iframe) need `entity: ""` and an `element.type`.

**An element is not where I expect.**
Positions are measured from the room's bounding box, not from the picture's corner, and in picture pixels. See [positioning](../concepts/positioning.md). The visual editor lets you drag elements into place.

**An element shows in the room detail but not on the overview.**
Check `overview: false` and `overview_active_only` in its plan. Climate entities are hidden on the overview while off, by default. Entities listed without a `plan` are never drawn.

**Tapping a room does nothing on the overview.**
The room has `elements_clickable_on_overview: true`, so its elements take the taps. Or it has a `detail_view` pointing to a view that doesn't exist.

**A room doesn't change colour with its lights or motion.**
The [dynamic colour](../concepts/dynamic-colors.md) follows only entities listed in the room (not those that only come from its area), the room must not set `disable_dynamic_color`, and the card must not set `show_room_backgrounds`. Motion sensors need the device class `motion` or `occupancy`. With strong pictures, raise the colours' alpha.

**A door or window bar is missing inside a group.**
Groups drop `width` and `height` from their children, see [group](../elements/group.md).

**The card is in Czech, or in English when I want Czech.**
The card follows the language of your Home Assistant profile: Czech for Czech, English for everything else.

**Changes on the plan lag behind by up to a second.**
That is the update throttle that keeps wall tablets smooth. Set `realtime_updates: true` if you need every change immediately.
