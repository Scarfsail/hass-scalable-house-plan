import type { ActionConfig } from "../elements/base/element-base";
import type { HomeAssistant } from "../../hass-frontend/src/types";

/**
 * Domains that are considered "actionable" by default - entities that can be toggled or controlled
 * Tap action will be "toggle" for these domains
 */
const ACTIONABLE_DOMAINS = new Set([
    'light',
    'switch',
    'fan',
    'lock',
    'input_boolean',
    'automation',
    'script',
    'scene',
]);

/**
 * Icons that should NOT be considered actionable, even if their domain is actionable
 * These icons indicate entities that should only show more-info on tap
 */
const NON_ACTIONABLE_ICONS = new Set([
    'mdi:fuse',
]);

/**
 * Check if an entity should be actionable (can be toggled/controlled via tap)
 * This checks multiple factors:
 * - Domain (light, switch, etc.)
 * - Icon (certain icons like mdi:fuse are excluded)
 * 
 * @param entityId - Entity ID
 * @param hass - Home Assistant instance
 * @returns true if entity should be actionable
 */
export function isEntityActionable(entityId: string, hass?: HomeAssistant): boolean {
    const domain = entityId.split('.')[0];
    
    // Check if domain is actionable
    if (!ACTIONABLE_DOMAINS.has(domain)) {
        return false;
    }
    
    // Check if icon should override actionability
    if (hass?.states[entityId]) {
        const icon = hass.states[entityId].attributes?.icon;
        if (icon && NON_ACTIONABLE_ICONS.has(icon)) {
            return false;
        }
    }
    
    return true;
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
