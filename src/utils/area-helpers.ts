import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { Room } from "../cards/types";

/**
 * Get display name for an area by its area_id
 * @param hass - HomeAssistant instance
 * @param areaId - Area registry ID
 * @returns Area name or undefined if not found
 */
export function getAreaName(hass: HomeAssistant, areaId: string): string | undefined {
    return hass.areas?.[areaId]?.name;
}

/**
 * Get icon for an area by its area_id
 * @param hass - HomeAssistant instance
 * @param areaId - Area registry ID
 * @returns Area icon or undefined/null if not found
 */
export function getAreaIcon(hass: HomeAssistant, areaId: string): string | null | undefined {
    return hass.areas?.[areaId]?.icon;
}

/**
 * Get all entity IDs for a given area
 * Includes both direct area entities and entities from devices in the area
 * @param hass - HomeAssistant instance
 * @param areaId - Area registry ID
 * @returns Array of entity IDs
 */
export function getAreaEntities(hass: HomeAssistant, areaId: string): string[] {
    if (!hass.entities || !hass.devices) {
        return [];
    }

    const entityIds: string[] = [];

    // Get all entities
    for (const [entityId, entityEntry] of Object.entries(hass.entities)) {
        // Direct area assignment
        if (entityEntry.area_id === areaId) {
            entityIds.push(entityId);
            continue;
        }

        // Device-based area assignment
        if (entityEntry.device_id) {
            const device = hass.devices[entityEntry.device_id];
            if (device?.area_id === areaId) {
                entityIds.push(entityId);
            }
        }
    }

    return entityIds;
}

/**
 * Get display name for a room
 * Returns area name if area is set, otherwise returns room.name
 * @param hass - HomeAssistant instance
 * @param room - Room configuration
 * @returns Display name for the room
 */
export function getRoomName(hass: HomeAssistant, room: Room): string {
    if (room.area) {
        const areaName = getAreaName(hass, room.area);
        if (areaName) {
            return areaName;
        }
    }
    return room.name;
}

/**
 * Get icon for a room
 * Returns area icon if area is set and has icon, otherwise returns default room icon
 * @param hass - HomeAssistant instance
 * @param room - Room configuration
 * @param defaultIcon - Default icon to use if no area icon (default: 'mdi:home')
 * @returns Icon string
 */
export function getRoomIcon(hass: HomeAssistant, room: Room, defaultIcon: string = 'mdi:home'): string {
    if (room.area) {
        const areaIcon = getAreaIcon(hass, room.area);
        if (areaIcon) {
            return areaIcon;
        }
    }
    return defaultIcon;
}
