import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { Room, ScalableHousePlanConfig, EntityConfig } from "../cards/scalable-house-plan";

/**
 * Result of dynamic color calculation
 */
export interface DynamicColorResult {
    color: string;
    type: 'motion' | 'lights' | 'default' | 'transparent';
}

/**
 * Gradient definition for radial gradient
 */
export interface GradientDefinition {
    id: string;
    cx: string;
    cy: string;
    innerColor: string;
    outerColor: string;
}

/**
 * Calculate polygon center point from boundary coordinates
 */
export function calculatePolygonCenter(boundary: [number, number][]): { x: number; y: number } {
    const sumX = boundary.reduce((sum, point) => sum + point[0], 0);
    const sumY = boundary.reduce((sum, point) => sum + point[1], 0);
    
    return {
        x: sumX / boundary.length,
        y: sumY / boundary.length
    };
}

/**
 * Adjust opacity of rgba color string
 */
export function adjustOpacity(rgbaColor: string, opacity: number): string {
    // Match rgba pattern: rgba(r, g, b, a)
    const match = rgbaColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
    if (!match) return rgbaColor;
    
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${opacity})`;
}

/**
 * Create gradient definition for SVG rendering
 */
export function createGradientDefinition(
    baseColor: string,
    gradientId: string,
    centerX: number,
    centerY: number,
    bounds: { minX: number; minY: number; width: number; height: number }
): GradientDefinition {
    // Calculate center as percentage of room bounds
    const cx = ((centerX - bounds.minX) / bounds.width * 100).toFixed(1);
    const cy = ((centerY - bounds.minY) / bounds.height * 100).toFixed(1);
    
    // Center: 0.2 opacity (more visible = brighter), Outer: 0.05 opacity (more transparent = darker)
    const innerColor = adjustOpacity(baseColor, 0.2);
    const outerColor = adjustOpacity(baseColor, 0.05);
    
    return {
        id: gradientId,
        cx: `${cx}%`,
        cy: `${cy}%`,
        innerColor,
        outerColor
    };
}

/**
 * Check if entity should be excluded from dynamic color evaluation
 */
function isEntityExcluded(entityConfig: EntityConfig): boolean {
    if (typeof entityConfig === 'string') return false;
    return entityConfig.plan?.disable_dynamic_color === true;
}

/**
 * Get entity state from Home Assistant
 */
function getEntityState(hass: HomeAssistant, entityId: string): string | undefined {
    return hass.states[entityId]?.state;
}

/**
 * Get device class from entity attributes
 */
function getDeviceClass(hass: HomeAssistant, entityId: string): string | undefined {
    return hass.states[entityId]?.attributes?.device_class;
}

/**
 * Check if any motion/occupancy sensors are active (considering delay state)
 */
export function hasActiveMotionOrOccupancy(
    hass: HomeAssistant,
    room: Room,
    motionDelayActive: Map<string, boolean>
): boolean {
    if (!room.entities) return false;
    
    for (const entityConfig of room.entities) {
        // Skip excluded entities
        if (isEntityExcluded(entityConfig)) continue;
        
        const entityId = typeof entityConfig === 'string' ? entityConfig : entityConfig.entity;
        if (!entityId) continue;
        
        const domain = entityId.split('.')[0];
        if (domain !== 'binary_sensor') continue;
        
        const deviceClass = getDeviceClass(hass, entityId);
        if (deviceClass !== 'motion' && deviceClass !== 'occupancy') continue;
        
        // Check actual state
        const state = getEntityState(hass, entityId);
        if (state === 'on') return true;
        
        // Check delay state for motion sensors
        if (deviceClass === 'motion' && motionDelayActive.get(entityId)) {
            return true;
        }
    }
    
    return false;
}

/**
 * Check if any lights are on
 */
export function hasActiveLights(hass: HomeAssistant, room: Room): boolean {
    if (!room.entities) return false;
    
    for (const entityConfig of room.entities) {
        // Skip excluded entities
        if (isEntityExcluded(entityConfig)) continue;
        
        const entityId = typeof entityConfig === 'string' ? entityConfig : entityConfig.entity;
        if (!entityId) continue;
        
        const domain = entityId.split('.')[0];
        if (domain !== 'light') continue;
        
        const state = getEntityState(hass, entityId);
        if (state === 'on') return true;
    }
    
    return false;
}

/**
 * Calculate dynamic room color based on entity states
 * 
 * Precedence: Motion/Occupancy > Lights > Default
 * 
 * @param hass - Home Assistant instance
 * @param room - Room configuration
 * @param config - Global configuration
 * @param motionDelayActive - Map of motion sensors with active delays
 * @returns Dynamic color result with type
 */
export function calculateDynamicRoomColor(
    hass: HomeAssistant,
    room: Room,
    config: ScalableHousePlanConfig,
    motionDelayActive: Map<string, boolean>
): DynamicColorResult {
    // Check if room has dynamic colors disabled
    if (room.disable_dynamic_color === true) {
        return { color: 'transparent', type: 'transparent' };
    }
    
    // Check if global show_room_backgrounds is enabled (debugging mode)
    if (config.show_room_backgrounds === true) {
        return { color: room.color || 'transparent', type: 'transparent' };
    }
    
    // Get configured colors with defaults
    const motionColor = config.dynamic_colors?.motion_occupancy || 'rgba(135, 206, 250, 0.15)';
    const lightsColor = config.dynamic_colors?.lights || 'rgba(255, 240, 100, 0.15)';
    const defaultColor = config.dynamic_colors?.default || 'rgba(128, 128, 128, 0.05)';
    
    // Check motion/occupancy (highest priority)
    if (hasActiveMotionOrOccupancy(hass, room, motionDelayActive)) {
        return { color: motionColor, type: 'motion' };
    }
    
    // Check lights (second priority)
    if (hasActiveLights(hass, room)) {
        return { color: lightsColor, type: 'lights' };
    }
    
    // Default color
    return { color: defaultColor, type: 'default' };
}

/**
 * Get motion sensors that need delay tracking
 */
export function getMotionSensors(hass: HomeAssistant, room: Room): string[] {
    if (!room.entities) return [];
    
    const motionSensors: string[] = [];
    
    for (const entityConfig of room.entities) {
        if (isEntityExcluded(entityConfig)) continue;
        
        const entityId = typeof entityConfig === 'string' ? entityConfig : entityConfig.entity;
        if (!entityId) continue;
        
        const domain = entityId.split('.')[0];
        if (domain !== 'binary_sensor') continue;
        
        const deviceClass = getDeviceClass(hass, entityId);
        if (deviceClass === 'motion') {
            motionSensors.push(entityId);
        }
    }
    
    return motionSensors;
}
