# Willow Lane image prompt

The prompt used with Google Gemini, together with [the layout sketch](layout-reference.png), to generate [the Willow Lane floor plan](willow-lane.jpg). The result was scaled to 1600 × 995 px, and a stray "front doo" label Gemini printed by the driveway was patched over with neighbouring paving.

```text
Create a top-down 3D cutaway render of a single-storey family bungalow with the roof removed, seen straight from above (orthographic, no perspective tilt), like an architectural dollhouse render.

Follow the attached layout sketch exactly: the same rooms in the same positions and proportions, in the same 16:10 landscape frame (1600 x 1000 px). Do NOT draw any text, labels, numbers, dimensions or compass in the image.

Rooms (north is up): Garage (top left, one small hatchback parked inside), Utility room (washing machine, dryer, heat-pump unit, hot-water tank), Bathroom (bathtub, shower, double sink), Kids' room (bunk bed, toy rug, desk), Main bedroom (double bed, wardrobe, armchair), a long Hallway across the middle with the front door on its west end opening to the driveway, Kitchen & dining (kitchen island, dining table for six), Living room (sofa, coffee table, TV wall, large glass sliding door to the terrace), Office (desk with two monitors, bookshelf). Outside: a paved Driveway along the west side with a sliding wooden gate at the bottom edge, a wooden deck Terrace south of the living room with outdoor table and string lights, and a Garden in the bottom-right corner with a vegetable bed and a small tree. Lawn everywhere else.

Style: white interior walls with visible thickness, warm oak floors in living spaces, light grey tiles in bathroom and utility room, concrete in the garage, soft daylight from the south with gentle shadows, calm natural colours. Keep furniture low and uncluttered so every room outline stays clearly readable, and leave some empty floor in each room for UI icons to sit on.
```
