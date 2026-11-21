# House-level element defaults

`element_defaults` sets the options of an element type once for the whole house. Every element of that type starts from these options; whatever the element sets itself wins.

```yaml
element_defaults:
  - element:
      type: custom:info-box-shp
      types:
        motion:
          icon_visibility: all
        humidity:
          size: "120%"
  - element:
      type: custom:analog-shp
      decimals: 0
```

Willow Lane uses this to show the motion icon in every [info box](../elements/info-box.md), even on the overview, and to round all sensor readings to whole numbers.

## How the options combine

For each element placed on the plan, three layers are merged, later ones winning:

1. the house-level default for its type (`element_defaults`),
2. the automatic defaults for the entity, such as a `width` for a window bar or `gauge: true` for a humidity sensor ([which element an entity gets](../elements/index.md#which-element-an-entity-gets)),
3. the element's own `plan.element`.

Nested options merge key by key, so an info box that sets only `types.climate` keeps the house-level `types.motion`. When an element sets `type` itself, layer 2 is skipped.

The match is by `type` exactly as written (e.g. `custom:analog-shp`). Only the `element` part of an entry is used. Defaults apply to the elements placed directly in a room, not to the children of a [group](../elements/group.md).
