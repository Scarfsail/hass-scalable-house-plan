import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { Room, EntityConfig } from "../cards/scalable-house-plan";
import { getAreaEntities } from "./area-helpers";

/**
 * Get all entities for a room, optionally filtered to exclude those shown on detail page
 * 
 * @param hass - HomeAssistant instance
 * @param room - Room configuration
 * @param areaEntityIds - Cached area entity IDs (optional, will fetch if not provided, empty if no area)
 * @param showAll - If true, returns all entities; if false, only entities not on detail page
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
        allEntityConfigs = allEntityConfigs.filter(cfg => {
            const entityId = typeof cfg === 'string' ? cfg : cfg.entity;
            return !detailEntityIds.has(entityId);
        });
    }

    return allEntityConfigs;
}

/**
 * Get count of entities not shown on detail page
 * 
 * @param hass - HomeAssistant instance
 * @param room - Room configuration
 * @param areaEntityIds - Cached area entity IDs (optional, will fetch if not provided)
 * @returns Count of entities not on detail page
 */
export function getEntitiesNotOnDetailCount(
    hass: HomeAssistant,
    room: Room,
    areaEntityIds: string[] | null = null
): number {
    return getRoomEntities(hass, room, areaEntityIds, false).length;
}
