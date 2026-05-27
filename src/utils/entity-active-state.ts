/**
 * Domain-defined "active" state evaluation for the
 * `plan.overview_active_only` layout flag.
 */

import type { HomeAssistant } from "../../hass-frontend/src/types";

const UNAVAILABLE_STATES = new Set(["unavailable", "unknown"]);

/**
 * Returns true if the entity is considered "active" for its domain.
 * Unknown domains default to true (always show).
 */
export function isEntityActive(hass: HomeAssistant | undefined, entityId: string): boolean {
    if (!hass || !entityId) return true;
    const stateObj = hass.states[entityId];
    if (!stateObj) return false;
    const state = stateObj.state;
    if (UNAVAILABLE_STATES.has(state)) return false;

    const domain = entityId.split(".")[0];
    switch (domain) {
        case "light":
        case "switch":
        case "fan":
        case "input_boolean":
        case "automation":
        case "script":
        case "humidifier":
        case "siren":
        case "remote":
            return state === "on";
        case "binary_sensor":
            return state === "on";
        case "climate":
        case "water_heater":
            return state !== "off";
        case "cover":
            return state !== "closed";
        case "lock":
            return state === "unlocked";
        case "media_player":
            return state !== "off" && state !== "idle" && state !== "standby";
        case "vacuum":
            return state !== "docked" && state !== "idle";
        case "timer":
            return state === "active";
        case "alarm_control_panel":
            return state !== "disarmed";
        case "person":
        case "device_tracker":
            return state === "home";
        default:
            return true;
    }
}

/**
 * Default value for `plan.overview_active_only` when not explicitly set.
 * Climate defaults to true so thermostats hide in overview when off.
 */
export function getOverviewActiveOnlyDefault(entityId: string): boolean {
    const domain = entityId.split(".")[0];
    return domain === "climate";
}
