import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { Room, EntityConfig } from "../cards/scalable-house-plan";
import { getAreaEntities } from "./area-helpers";

/**
 * Get entity IDs that should be shown in the info box for a room
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
    
    // Add explicit room entities (unless they have exclude_from_info_box flag)
    room.entities.forEach(cfg => {
        const entityId = typeof cfg === 'string' ? cfg : cfg.entity;
        const excludeFromInfoBox = typeof cfg !== 'string' && cfg.plan?.exclude_from_info_box;
        if (!excludeFromInfoBox) {
            infoBoxEntityIds.add(entityId);
        }
    });
    
    // Add area entities (deduplicated)
    areaIds.forEach(entityId => {
        if (!explicitEntityIds.has(entityId)) {
            infoBoxEntityIds.add(entityId);
        }
    });
    
    return infoBoxEntityIds;
}

/**
 * Get all entities for a room, optionally filtered to exclude those shown on detail page or in info box
 * 
 * @param hass - HomeAssistant instance
 * @param room - Room configuration
 * @param areaEntityIds - Cached area entity IDs (optional, will fetch if not provided, empty if no area)
 * @param showAll - If true, returns all entities; if false, only entities not on detail page or in info box
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

    // Get entities shown in info box (reuse helper function)
    const infoBoxEntityIds = getInfoBoxEntityIds(hass, room, areaIds);

    // Combine explicit entities and area entities (deduplicated)
    const areaEntityConfigs: EntityConfig[] = areaIds
        .filter(entityId => !explicitEntityIds.has(entityId));

    let allEntityConfigs: EntityConfig[] = [...room.entities, ...areaEntityConfigs];
    
    // Apply filter if not showing all entities
    if (!showAll) {
        allEntityConfigs = allEntityConfigs.filter(cfg => {
            const entityId = typeof cfg === 'string' ? cfg : cfg.entity;
            // Exclude entities shown on detail page OR in info box
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
 * @returns Count of entities not on detail page or in info box
 */
export function getEntitiesNotOnDetailCount(
    hass: HomeAssistant,
    room: Room,
    areaEntityIds: string[] | null = null
): number {
    return getRoomEntities(hass, room, areaEntityIds, false).length;
}
