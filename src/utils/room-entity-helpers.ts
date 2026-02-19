import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { Room, EntityConfig } from "../cards/types";
import { getAreaEntities } from "./area-helpers";

// Maximum nesting depth for group-shp elements to prevent infinite recursion
const MAX_GROUP_NESTING_DEPTH = 10;

/**
 * Check if an EntityConfig represents a group-shp element
 * 
 * @param entityConfig - Entity configuration to check
 * @returns true if the config is a group-shp element, false otherwise
 */
export function isGroupShp(entityConfig: EntityConfig): boolean {
    if (typeof entityConfig === 'string') return false;
    
    const elementType = entityConfig.plan?.element?.type;
    return elementType === 'custom:group-shp' || elementType === 'group-shp';
}

/**
 * Recursively collect all entity IDs from an EntityConfig array, including entities within groups
 * 
 * @param entities - Array of EntityConfig (can contain groups with children)
 * @param filterFn - Optional filter function to exclude certain entities (return false to exclude)
 * @param visited - Set of visited entity IDs to prevent infinite loops (default: new Set)
 * @param depth - Current recursion depth for safety (default: 0, max: 10)
 * @returns Array of all entity IDs found (including those in nested groups)
 */
export function collectAllEntityIds(
    entities: EntityConfig[],
    filterFn?: (config: EntityConfig) => boolean,
    visited: Set<string> = new Set(),
    depth: number = 0
): string[] {
    // Safety: prevent infinite loops with depth limit
    if (depth > MAX_GROUP_NESTING_DEPTH) {
        console.warn(`collectAllEntityIds: Maximum recursion depth (${MAX_GROUP_NESTING_DEPTH}) reached`);
        return [];
    }

    const entityIds: string[] = [];

    for (const entityConfig of entities) {
        const isString = typeof entityConfig === 'string';
        
        // Apply filter if provided
        if (filterFn && !filterFn(entityConfig)) {
            // Still need to check groups for children (filter applies to entity itself, not traversal)
            if (isGroupShp(entityConfig)) {
                const config = entityConfig as Exclude<EntityConfig, string>;
                const children = config.plan!.element!.children;
                if (Array.isArray(children) && children.length > 0) {
                    const childEntityIds = collectAllEntityIds(children, filterFn, visited, depth + 1);
                    entityIds.push(...childEntityIds);
                }
            }
            continue;
        }

        // Extract entity ID (cached type check)
        const entityId = isString ? entityConfig : entityConfig.entity;
        
        // Add non-empty entity IDs (skip empty strings for no-entity elements)
        if (entityId) {
            // Prevent duplicates and infinite loops
            if (!visited.has(entityId)) {
                visited.add(entityId);
                entityIds.push(entityId);
            }
        }

        // Check if this is a group-shp element with children
        if (isGroupShp(entityConfig)) {
            // TypeScript: isGroupShp returns true only for non-string configs with plan.element
            const config = entityConfig as Exclude<EntityConfig, string>;
            const children = config.plan!.element!.children;
            
            // Recursively process group children
            if (Array.isArray(children) && children.length > 0) {
                const childEntityIds = collectAllEntityIds(children, filterFn, visited, depth + 1);
                entityIds.push(...childEntityIds);
            }
        }
    }

    return entityIds;
}

/**
 * Recursively collect all entity configs from an EntityConfig array, expanding groups
 * This is similar to collectAllEntityIds but returns the full EntityConfig objects
 * 
 * @param entities - Array of EntityConfig (can contain groups with children)
 * @param visited - Set of visited entity IDs to prevent infinite loops (default: new Set)
 * @param depth - Current recursion depth for safety (default: 0, max: 10)
 * @returns Array of all EntityConfig objects found (including those in nested groups)
 */
export function collectAllEntityConfigs(
    entities: EntityConfig[],
    visited: Set<string> = new Set(),
    depth: number = 0
): EntityConfig[] {
    // Safety: prevent infinite loops with depth limit
    if (depth > MAX_GROUP_NESTING_DEPTH) {
        console.warn(`collectAllEntityConfigs: Maximum recursion depth (${MAX_GROUP_NESTING_DEPTH}) reached`);
        return [];
    }

    const entityConfigs: EntityConfig[] = [];

    for (const entityConfig of entities) {
        // Extract entity ID
        const entityId = typeof entityConfig === 'string' ? entityConfig : entityConfig.entity;
        
        // Add entity configs (including no-entity elements for groups)
        if (entityId) {
            // Prevent duplicates and infinite loops
            if (!visited.has(entityId)) {
                visited.add(entityId);
                entityConfigs.push(entityConfig);
            }
        } else {
            // No entity ID - could be a no-entity element or group, add it anyway
            entityConfigs.push(entityConfig);
        }

        // Check if this is a group-shp element with children
        if (isGroupShp(entityConfig)) {
            // TypeScript: isGroupShp returns true only for non-string configs with plan.element
            const config = entityConfig as Exclude<EntityConfig, string>;
            const children = config.plan!.element!.children;
            
            // Recursively process group children
            if (Array.isArray(children) && children.length > 0) {
                const childConfigs = collectAllEntityConfigs(children, visited, depth + 1);
                entityConfigs.push(...childConfigs);
            }
        }
    }

    return entityConfigs;
}

/**
 * Get entity IDs that should be shown in the info box for a room
 * Info box only shows specific sensor types: motion, occupancy, temperature, humidity
 * Includes entities within groups.
 * 
 * @param hass - HomeAssistant instance
 * @param room - Room configuration
 * @param areaEntityIds - Cached area entity IDs (optional, will fetch if not provided)
 * @returns Set of entity IDs that match info box sensor types (motion/occupancy/temperature/humidity)
 */
export function getInfoBoxEntityIds(
    hass: HomeAssistant,
    room: Room,
    areaEntityIds: string[] | null = null
): Set<string> {
    const infoBoxEntityIds = new Set<string>();

    // Get area entities if not provided
    const areaIds = areaEntityIds !== null 
        ? areaEntityIds 
        : (room.area ? getAreaEntities(hass, room.area) : []);
    
    // Collect all entity IDs from room entities (including group children)
    const roomEntityIds = collectAllEntityIds(room.entities);
    const explicitEntityIds = new Set(roomEntityIds);
    
    // Helper function to check if entity should be shown in info box
    const isInfoBoxEntity = (entityId: string): boolean => {
        const entity = hass.states[entityId];
        if (!entity) return false;
        
        const deviceClass = entity.attributes?.device_class;
        const supportedTypes = ['motion', 'occupancy', 'temperature', 'humidity'];
        return deviceClass ? supportedTypes.includes(deviceClass) : false;
    };
    
    // Helper to recursively check entities and group children
    const addInfoBoxEntities = (entities: EntityConfig[]): void => {
        for (const cfg of entities) {
            const entityId = typeof cfg === 'string' ? cfg : cfg.entity;
            const excludeFromInfoBox = typeof cfg !== 'string' && cfg.plan?.exclude_from_info_box;
            
            // Add entity if it matches info box types
            if (!excludeFromInfoBox && entityId && isInfoBoxEntity(entityId)) {
                infoBoxEntityIds.add(entityId);
            }
            
            // Recursively process group children
            if (isGroupShp(cfg)) {
                const config = cfg as Exclude<EntityConfig, string>;
                if (Array.isArray(config.plan!.element!.children)) {
                    addInfoBoxEntities(config.plan!.element!.children);
                }
            }
        }
    };
    
    // Add explicit room entities (including group children)
    addInfoBoxEntities(room.entities);
    
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
 * This includes ALL entities regardless of type, including entities within groups
 * 
 * @param hass - HomeAssistant instance
 * @param room - Room configuration
 * @param areaEntityIds - Cached area entity IDs (optional, will fetch if not provided)
 * @returns Array of all entity IDs in the room (including group children)
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
    
    // Single traversal: collect all entity configs and build sets for tracking
    const allEntityConfigs = collectAllEntityConfigs(room.entities);
    const excludedEntityIds = new Set<string>();
    const explicitEntityIds = new Set<string>();
    const allEntityIds = new Set<string>();
    
    // Process configs in one pass
    for (const cfg of allEntityConfigs) {
        const entityId = typeof cfg === 'string' ? cfg : cfg.entity;
        if (!entityId) continue;
        
        // Track all explicit entity IDs
        explicitEntityIds.add(entityId);
        
        // Check if entity is excluded from info box
        const isExcluded = typeof cfg !== 'string' && cfg.plan?.exclude_from_info_box;
        if (isExcluded) {
            excludedEntityIds.add(entityId);
        } else {
            // Add to results if not excluded
            allEntityIds.add(entityId);
        }
    }
    
    // Add area entities (deduplicated and respecting exclude_from_info_box)
    areaIds.forEach(entityId => {
        // Skip if already in room entities OR if it's marked as excluded
        if (!explicitEntityIds.has(entityId) && !excludedEntityIds.has(entityId)) {
            allEntityIds.add(entityId);
        }
    });
    
    return Array.from(allEntityIds);
}

/**
 * Analyze room entities and categorize them in a single traversal
 * This is optimized to avoid multiple tree traversals for entity collection and categorization
 * 
 * @param hass - HomeAssistant instance
 * @param room - Room configuration
 * @param areaEntityIds - Area entity IDs for this room
 * @returns Object containing categorized entity IDs
 */
export function analyzeRoomEntities(
    hass: HomeAssistant,
    room: Room,
    areaEntityIds: string[]
): {
    allEntityIds: string[];
    entityConfigs: EntityConfig[];
    explicitEntityIds: Set<string>;
    motionSensorIds: string[];
    ambientLightIds: string[];
    lightIds: string[];
    occupancySensorIds: string[];
} {
    const motionSensorIds: string[] = [];
    const ambientLightIds: string[] = [];
    const lightIds: string[] = [];
    const occupancySensorIds: string[] = [];
    
    // Collect all entity configs from room entities (single traversal)
    const entityConfigs = collectAllEntityConfigs(room.entities);
    
    // Track explicit entity IDs for deduplication
    const explicitEntityIds = new Set<string>();
    
    // Process room entity configs (categorize and collect IDs)
    for (const entityConfig of entityConfigs) {
        const entityId = typeof entityConfig === 'string' ? entityConfig : entityConfig.entity;
        if (!entityId) continue;
        
        explicitEntityIds.add(entityId);
        
        // Skip entities opted out of dynamic colors
        const optedOut = typeof entityConfig !== 'string' && entityConfig.plan?.disable_dynamic_color;
        if (optedOut) continue;
        
        const stateObj = hass.states[entityId];
        if (!stateObj) continue;
        
        const [domain] = entityId.split('.');
        const deviceClass = stateObj.attributes?.device_class;
        
        // Motion and occupancy sensors
        if (domain === 'binary_sensor' && (deviceClass === 'motion' || deviceClass === 'occupancy')) {
            if (deviceClass === 'motion') {
                motionSensorIds.push(entityId);
            } else {
                occupancySensorIds.push(entityId);
            }
        }
        
        // Lights (categorize ambient vs normal)
        if (domain === 'light') {
            const lightType = typeof entityConfig !== 'string' ? entityConfig.plan?.light : undefined;
            if (lightType === 'ambient') {
                ambientLightIds.push(entityId);
            } else {
                lightIds.push(entityId);
            }
        }
    }
    
    // Add area entity configs (deduplicated)
    const areaEntityConfigs = areaEntityIds
        .filter(entityId => !explicitEntityIds.has(entityId))
        .map(entityId => entityId as EntityConfig);
    
    entityConfigs.push(...areaEntityConfigs);
    
    // Build final entity ID list (explicit + deduplicated area)
    const allEntityIds = [
        ...Array.from(explicitEntityIds),
        ...areaEntityIds.filter(entityId => !explicitEntityIds.has(entityId))
    ];
    
    return {
        allEntityIds,
        entityConfigs,
        explicitEntityIds,
        motionSensorIds,
        ambientLightIds,
        lightIds,
        occupancySensorIds
    };
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
