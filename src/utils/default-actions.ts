import type { ActionConfig } from "../elements/base/element-base";
import type { HomeAssistant } from "../../hass-frontend/src/types";

/**
 * Domains that are considered "actionable" - entities that can be toggled or controlled
 * Tap action will be "toggle" for these domains
 */
const ACTIONABLE_DOMAINS = new Set([
    'light',
    'switch',
    'fan',
    'lock',
    'cover',
    'input_boolean',
    'automation',
    'script',
    'scene',
]);

/**
 * Check if an entity is actionable (can be toggled/controlled)
 * @param entityId - Entity ID
 * @param hass - Home Assistant instance (for future expansion)
 * @returns true if entity is actionable
 */
export function isEntityActionable(entityId: string, hass?: HomeAssistant): boolean {
    const domain = entityId.split('.')[0];
    return ACTIONABLE_DOMAINS.has(domain);
}

/**
 * Get default tap action for an entity
 * Actionable entities (light, switch, etc.) get "toggle"
 * Non-actionable entities (sensor, camera, etc.) get "more-info"
 * 
 * @param entityId - Entity ID
 * @param hass - Home Assistant instance
 * @returns Default tap action config
 */
export function getDefaultTapAction(entityId: string, hass?: HomeAssistant): ActionConfig {
    if (isEntityActionable(entityId, hass)) {
        return { action: "toggle" };
    }
    return { action: "more-info" };
}

/**
 * Get default hold action (always more-info)
 * 
 * @returns Default hold action config
 */
export function getDefaultHoldAction(): ActionConfig {
    return { action: "more-info" };
}
