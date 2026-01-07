/**
 * Default element type mappings for automatic element selection
 * Based on entity domain and device_class
 */

// Element definition with type and default properties
export interface ElementDefinition {
    type: string;
    [key: string]: any;
}

export interface ElementMapping {
    plan_element?: ElementDefinition;
    detail_element?: ElementDefinition;
}

/**
 * Default element type mappings based on entity domain and device_class
 * 
 * Lookup priority:
 * 1. domain.device_class (e.g., 'binary_sensor.door')
 * 2. domain (e.g., 'light')
 * 3. wildcard '*'
 * 
 * Property merging:
 * - If user specifies 'type' explicitly, no merging occurs (use as-is)
 * - Otherwise, user properties override default properties
 */
export const DEFAULT_ELEMENT_MAPPINGS: Record<string, ElementMapping> = {
    // Binary Sensors - Specific device classes
    'binary_sensor.door': {
        plan_element: { type: 'custom:door-window-shp', width: 27, orientation: 'vertical' },
        detail_element: { type: 'tile' }
    },
    'binary_sensor.window': {
        plan_element: { type: 'custom:door-window-shp', width: 20, orientation: 'horizontal' },
        detail_element: { type: 'tile' }
    },
    'binary_sensor.garage_door': {
        plan_element: { type: 'custom:door-window-shp', width: 40, orientation: 'horizontal' },
        detail_element: { type: 'tile' }
    },
    'binary_sensor.motion': {
        plan_element: { type: 'custom:motion-sensor-shp' },
        detail_element: { type: 'tile' }
    },
    'binary_sensor.occupancy': {
        plan_element: { type: 'custom:motion-sensor-shp' },
        detail_element: { type: 'tile' }
    },

    // Sensors - Specific device classes
    'sensor.battery': {
        plan_element: { type: 'custom:analog-shp', style: { "font-size": "20px" } },
        detail_element: { type: 'custom:analog-bar-shp', orientation: 'horizontal' }
    },
    'sensor.temperature': {
        plan_element: { type: 'custom:analog-shp', style: { "font-size": "20px" } },
        detail_element: { type: 'tile' }
    },
    'sensor.humidity': {
        plan_element: { type: 'custom:analog-shp', style: { "font-size": "20px" } },
        detail_element: { type: 'tile' }
    },
    'sensor.power': {
        plan_element: { type: 'custom:analog-shp', style: { "font-size": "20px" } },
        detail_element: { type: 'tile' }
    },
    'sensor.energy': {
        plan_element: { type: 'custom:analog-shp', style: { "font-size": "20px" } },
        detail_element: { type: 'tile' }
    },

    // Domain-level defaults
    'light': {
        plan_element: { type: 'custom:state-icon-trigger-shp' },
        detail_element: { type: 'tile' }
    },
    'camera': {
        plan_element: { type: 'custom:camera-shp', width: 60, height: 45 },
        detail_element: { type: 'custom:camera-shp', width: 300, height: 225 }
    },
    'cover': {
        plan_element: { type: 'custom:hui-state-icon-element' },
        detail_element: { type: 'tile' }
    },
    'climate': {
        plan_element: { type: 'custom:hui-state-icon-element' },
        detail_element: { type: 'tile' }
    },
    'switch': {
        plan_element: { type: 'custom:hui-state-icon-element' },
        detail_element: { type: 'tile' }
    },
    'fan': {
        plan_element: { type: 'custom:hui-state-icon-element' },
        detail_element: { type: 'tile' }
    },
    'lock': {
        plan_element: { type: 'custom:hui-state-icon-element' },
        detail_element: { type: 'tile' }
    },
    'binary_sensor': {
        plan_element: { type: 'custom:hui-state-icon-element' },
        detail_element: { type: 'tile' }
    },
    'sensor': {
        plan_element: { type: 'custom:analog-shp' },
        detail_element: { type: 'tile' }
    },
    'image': {
        plan_element: { type: 'custom:image-last-change-shp' },
        detail_element: { type: 'tile' }
    },

    // Wildcard fallback for any unrecognized entity
    '*': {
        plan_element: { type: 'custom:hui-state-icon-element' },
        detail_element: { type: 'tile' }
    }
};

/**
 * Get element definition for an entity
 * @param entityId - Entity ID (e.g., 'binary_sensor.door_main')
 * @param deviceClass - Device class from entity attributes (e.g., 'door')
 * @param context - Whether to get plan or detail element definition
 * @returns Element definition with type and default properties
 */
export function getElementTypeForEntity(
    entityId: string,
    deviceClass: string | undefined,
    context: 'plan' | 'detail' = 'plan'
): ElementDefinition {
    const domain = entityId.split('.')[0];
    let mapping: ElementMapping | undefined;

    // Try domain.device_class first (most specific)
    if (deviceClass) {
        const key = `${domain}.${deviceClass}`;
        mapping = DEFAULT_ELEMENT_MAPPINGS[key];
    }

    // Fall back to domain
    if (!mapping) {
        mapping = DEFAULT_ELEMENT_MAPPINGS[domain];
    }

    // Fall back to wildcard
    if (!mapping) {
        mapping = DEFAULT_ELEMENT_MAPPINGS['*'];
    }

    const elementDef = context === 'plan' ? mapping?.plan_element : mapping?.detail_element;
    return elementDef || { type: 'custom:state-icon-trigger-shp', size: 20 };
}

/**
 * Merge default element properties with user overrides
 * @param defaults - Default element definition from mappings
 * @param overrides - User-provided element config
 * @returns Merged element configuration
 * 
 * Rules:
 * - If overrides contain explicit 'type', use overrides as-is (no merging)
 * - Otherwise, merge defaults with overrides (overrides win)
 */
export function mergeElementProperties(
    defaults: ElementDefinition,
    overrides?: any
): any {
    // If explicit type is specified, don't merge - use overrides as-is
    if (overrides?.type) {
        return overrides;
    }

    // Merge: defaults + overrides (overrides win)
    return {
        ...defaults,
        ...(overrides || {})
    };
}
