# Tap and hold actions

## Defaults

| Entity | Tap | Hold |
| --- | --- | --- |
| Lights, switches, fans, locks, input booleans, automations, scripts, scenes | More info | Toggle |
| Everything else | More info | nothing |

An entity whose icon is `mdi:fuse` gets no toggle on hold, even in a toggleable domain, so a circuit breaker can't be switched off by a long press.

Some elements have their own controls instead: [gate buttons](../elements/gate-buttons.md), [script buttons](../elements/scripts-buttons-group.md) and the [climate](../elements/climate.md) control act on their own buttons, and an [info box](../elements/info-box.md) opens the more-info of the row you tap.

## Your own actions

Set `tap_action` or `hold_action` in the element's `plan`:

```yaml
- entity: cover.garage_door
  plan:
    left: 125
    top: 280
    tap_action:
      action: toggle
    hold_action:
      action: navigate
      navigation_path: /dashboard-garage/0
```

| `action` | Options | Does |
| --- | --- | --- |
| `more-info` | | Opens the entity's more-info dialog. |
| `toggle` | | Toggles the entity. |
| `perform-action` (or `call-service`) | `perform_action` (or `service`), `data`, `target` | Runs a Home Assistant action, e.g. `perform_action: light.turn_on`. |
| `navigate` | `navigation_path` | Opens another view or dashboard. |
| `url` | `url_path` | Opens a web address. |
| `none` | | Nothing. |

[State icons](../elements/state-icon.md) and the single [badge](../elements/badges.md#badge) are drawn by Home Assistant's own elements, which also support `double_tap_action` (set it in `plan.element`) and the other options of [Home Assistant actions](https://www.home-assistant.io/dashboards/actions/).

## On the overview

On the overview, a tap opens the room, not the element. To make the elements of one room tappable on the overview, set `elements_clickable_on_overview: true` on the room. Willow Lane does this for the driveway, so the gate opens from the overview. The trade-off: that room no longer opens by tapping it on the overview.

## With Helman

When [Helman](https://github.com/Scarfsail/hass-helman) is installed, every more-info the card would open for an entity of a Helman-managed device (a tap on an element, the climate menu, an info box row) opens Helman's device detail instead, with its power, energy, schedule and controls. Entities Helman doesn't manage still open Home Assistant's more-info.
