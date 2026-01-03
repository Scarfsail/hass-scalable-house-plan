/**
 * Entity category definitions and categorization logic
 */

export enum EntityCategory {
    ELECTRO = 'electro',
    DOORS_WINDOWS = 'doors_windows',
    ENVIRONMENT = 'environment',
    SECURITY = 'security',
    CAMERAS = 'cameras',
    CLIMATE = 'climate',
    COVERS = 'covers',
    ENERGY = 'energy',
    AUTOMATIONS = 'automations',
    OTHER = 'other'
}

export interface CategoryDefinition {
    key: EntityCategory;
    icon: string;
    order: number;
    collapsed?: boolean;
}

/**
 * Category definitions with icons and display order
 */
export const CATEGORY_DEFINITIONS: Record<EntityCategory, CategoryDefinition> = {
    [EntityCategory.ELECTRO]: {
        key: EntityCategory.ELECTRO,
        icon: 'mdi:lightbulb-group',
        order: 1
    },
    [EntityCategory.DOORS_WINDOWS]: {
        key: EntityCategory.DOORS_WINDOWS,
        icon: 'mdi:door',
        order: 2
    },
    [EntityCategory.ENVIRONMENT]: {
        key: EntityCategory.ENVIRONMENT,
        icon: 'mdi:thermometer',
        order: 3
    },
    [EntityCategory.SECURITY]: {
        key: EntityCategory.SECURITY,
        icon: 'mdi:shield-home',
        order: 4
    },
    [EntityCategory.CAMERAS]: {
        key: EntityCategory.CAMERAS,
        icon: 'mdi:cctv',
        order: 5
    },
    [EntityCategory.CLIMATE]: {
        key: EntityCategory.CLIMATE,
        icon: 'mdi:thermostat',
        order: 6
    },
    [EntityCategory.COVERS]: {
        key: EntityCategory.COVERS,
        icon: 'mdi:window-shutter',
        order: 7
    },
    [EntityCategory.ENERGY]: {
        key: EntityCategory.ENERGY,
        icon: 'mdi:lightning-bolt',
        order: 8
    },
    [EntityCategory.AUTOMATIONS]: {
        key: EntityCategory.AUTOMATIONS,
        icon: 'mdi:robot',
        order: 9
    },
    [EntityCategory.OTHER]: {
        key: EntityCategory.OTHER,
        icon: 'mdi:dots-horizontal',
        order: 10
    }
};

/**
 * Get category for an entity based on domain and device class
 */
export function getEntityCategory(entityId: string, deviceClass?: string): EntityCategory {
    const domain = entityId.split('.')[0];

    // Check domain + device_class combinations first (most specific)
    if (deviceClass) {
        const key = `${domain}.${deviceClass}`;
        
        switch (key) {
            case 'binary_sensor.door':
            case 'binary_sensor.window':
            case 'binary_sensor.garage_door':
            case 'binary_sensor.opening':
                return EntityCategory.DOORS_WINDOWS;
                
            case 'binary_sensor.motion':
            case 'binary_sensor.occupancy':
                return EntityCategory.SECURITY;
                
            case 'sensor.temperature':
            case 'sensor.humidity':
            case 'sensor.pressure':
            case 'sensor.moisture':
            case 'sensor.illuminance':
            case 'sensor.aqi':
            case 'sensor.pm25':
            case 'sensor.pm10':
            case 'sensor.co2':
            case 'sensor.volatile_organic_compounds':
                return EntityCategory.ENVIRONMENT;
                
            case 'sensor.power':
            case 'sensor.energy':
            case 'sensor.current':
            case 'sensor.voltage':
                return EntityCategory.ENERGY;
                
            case 'sensor.battery':
            case 'binary_sensor.battery':
            case 'binary_sensor.battery_charging':
                return EntityCategory.OTHER;
        }
    }

    // Domain-level categorization
    switch (domain) {
        case 'light':
        case 'switch':
        case 'fan':
        case 'input_boolean':
            return EntityCategory.ELECTRO;
            
        case 'lock':
        case 'alarm_control_panel':
            return EntityCategory.SECURITY;
            
        case 'camera':
            return EntityCategory.CAMERAS;
            
        case 'climate':
            return EntityCategory.CLIMATE;
            
        case 'cover':
            return EntityCategory.COVERS;
            
        case 'automation':
        case 'script':
        case 'scene':
            return EntityCategory.AUTOMATIONS;
            
        default:
            return EntityCategory.OTHER;
    }
}

/**
 * Group entities by category
 */
export function groupEntitiesByCategory(
    entityIds: string[],
    getDeviceClass: (entityId: string) => string | undefined
): Map<EntityCategory, string[]> {
    const grouped = new Map<EntityCategory, string[]>();
    
    entityIds.forEach(entityId => {
        const deviceClass = getDeviceClass(entityId);
        const category = getEntityCategory(entityId, deviceClass);
        
        if (!grouped.has(category)) {
            grouped.set(category, []);
        }
        grouped.get(category)!.push(entityId);
    });
    
    return grouped;
}

/**
 * Get sorted categories (by order, excluding empty ones)
 */
export function getSortedCategories(groupedEntities: Map<EntityCategory, string[]>): CategoryDefinition[] {
    return Array.from(groupedEntities.keys())
        .map(key => CATEGORY_DEFINITIONS[key])
        .sort((a, b) => a.order - b.order);
}
