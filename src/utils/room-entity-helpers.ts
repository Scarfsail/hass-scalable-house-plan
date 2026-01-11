import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { Room, EntityConfig } from "../cards/scalable-house-plan";
import { getAreaEntities } from "./area-helpers";

/**
 * Get entity IDs that should be shown in the info box for a room
 * Info box only shows specific sensor types: motion, occupancy, temperature, humidity
 * 
 * @param hass - HomeAssistant instance
 * @param room - Room configuration
 * @param areaEntityIds - Cached area entity IDs (optional, will fetch if not provided)
 * @returns Set of entity IDs that should be shown in info box (empty if info box is disabled)
 */
export function getInfoBoxEntityIds(
    hass: HomeAssistant,
    room: Room,
    areaEntityIds: string[] | null = null
): Set<string> {
    const infoBoxEntityIds = new Set<string>();
    
    // Check if info box is enabled (show by default if not explicitly disabled)
    const infoBoxEnabled = room.info_box?.show !== false;
    if (!infoBoxEnabled) {
        return infoBoxEntityIds;
    }
    
    // Get area entities if not provided
    const areaIds = areaEntityIds !== null 
        ? areaEntityIds 
        : (room.area ? getAreaEntities(hass, room.area) : []);
    
    // Get explicitly configured entity IDs for deduplication
    const explicitEntityIds = new Set(
        room.entities.map(cfg => 
            typeof cfg === 'string' ? cfg : cfg.entity
        )
    );
    
    // Helper function to check if entity should be shown in info box
    const isInfoBoxEntity = (entityId: string): boolean => {
        const entity = hass.states[entityId];
        if (!entity) return false;
        
        const deviceClass = entity.attributes?.device_class;
        const supportedTypes = ['motion', 'occupancy', 'temperature', 'humidity'];
        return deviceClass ? supportedTypes.includes(deviceClass) : false;
    };
    
    // Add explicit room entities that match info box types (unless they have exclude_from_info_box flag)
    room.entities.forEach(cfg => {
        const entityId = typeof cfg === 'string' ? cfg : cfg.entity;
        const excludeFromInfoBox = typeof cfg !== 'string' && cfg.plan?.exclude_from_info_box;
        if (!excludeFromInfoBox && isInfoBoxEntity(entityId)) {
            infoBoxEntityIds.add(entityId);
        }
    });
    
    // Add area entities that match info box types (deduplicated)
    areaIds.forEach(entityId => {
        if (!explicitEntityIds.has(entityId) && isInfoBoxEntity(entityId)) {
            infoBoxEntityIds.add(entityId);
        }
    });
    
    return infoBoxEntityIds;
}

/**
 * Get all entity IDs for a room (for info box element to scan through)
 * This includes ALL entities regardless of type
 * 
 * @param hass - HomeAssistant instance
 * @param room - Room configuration
 * @param areaEntityIds - Cached area entity IDs (optional, will fetch if not provided)
 * @returns Array of all entity IDs in the room
 */
export function getAllRoomEntityIds(
    hass: HomeAssistant,
    room: Room,
    areaEntityIds: string[] | null = null
): string[] {
    // Get area entities if not provided
    const areaIds = areaEntityIds !== null 
        ? areaEntityIds 
        : (room.area ? getAreaEntities(hass, room.area) : []);
    
    // Get explicitly configured entity IDs for deduplication
    const explicitEntityIds = new Set(
        room.entities.map(cfg => 
            typeof cfg === 'string' ? cfg : cfg.entity
        )
    );
    
    const allEntityIds = new Set<string>();
    
    // Add explicit room entities (unless they have exclude_from_info_box flag)
    room.entities.forEach(cfg => {
        const entityId = typeof cfg === 'string' ? cfg : cfg.entity;
        const excludeFromInfoBox = typeof cfg !== 'string' && cfg.plan?.exclude_from_info_box;
        if (!excludeFromInfoBox) {
            allEntityIds.add(entityId);
        }
    });
    
    // Add area entities (deduplicated)
    areaIds.forEach(entityId => {
        if (!explicitEntityIds.has(entityId)) {
            allEntityIds.add(entityId);
        }
    });
    
    return Array.from(allEntityIds);
}

/**
 * Get all entities for a room, optionally filtered to exclude those shown on detail page or info box
 * 
 * @param hass - HomeAssistant instance
 * @param room - Room configuration
 * @param areaEntityIds - Cached area entity IDs (optional, will fetch if not provided, empty if no area)
 * @param showAll - If true, returns all entities; if false, excludes entities on detail page or in info box
 * @returns Array of EntityConfig objects
 */
export function getRoomEntities(
    hass: HomeAssistant,
    room: Room,
    areaEntityIds: string[] | null = null,
    showAll: boolean = true
): EntityConfig[] {
    // Get area entities if not provided (empty array if no area)
    const areaIds = areaEntityIds !== null 
        ? areaEntityIds 
        : (room.area ? getAreaEntities(hass, room.area) : []);
    
    // Get explicitly configured entity IDs for deduplication
    const explicitEntityIds = new Set(
        room.entities.map(cfg => 
            typeof cfg === 'string' ? cfg : cfg.entity
        )
    );

    // Get entities with plan config (shown on detail page)
    const detailEntityIds = new Set(
        room.entities
            .filter(cfg => typeof cfg !== 'string' && (cfg as any).plan)
            .map(cfg => (cfg as any).entity)
    );

    // Combine explicit entities and area entities (deduplicated)
    const areaEntityConfigs: EntityConfig[] = areaIds
        .filter(entityId => !explicitEntityIds.has(entityId));

    let allEntityConfigs: EntityConfig[] = [...room.entities, ...areaEntityConfigs];
    
    // Apply filter if not showing all entities
    if (!showAll) {
        // Get entities shown in info box (if enabled)
        const infoBoxEntityIds = getInfoBoxEntityIds(hass, room, areaIds);
        
        allEntityConfigs = allEntityConfigs.filter(cfg => {
            const entityId = typeof cfg === 'string' ? cfg : cfg.entity;
            // Exclude entities on detail page OR in info box
            return !detailEntityIds.has(entityId) && !infoBoxEntityIds.has(entityId);
        });
    }

    return allEntityConfigs;
}

/**
 * Get count of entities not shown on detail page or in info box
 * 
 * @param hass - HomeAssistant instance
 * @param room - Room configuration
 * @param areaEntityIds - Cached area entity IDs (optional, will fetch if not provided)
 * @returns Count of entities not shown on detail page or in info box
 */
export function getEntitiesNotOnDetailCount(
    hass: HomeAssistant,
    room: Room,
    areaEntityIds: string[] | null = null
): number {
    return getRoomEntities(hass, room, areaEntityIds, false).length;
}
