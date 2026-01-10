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
 * Cached entity IDs for performance optimization
 */
export interface CachedEntityIds {
    motionSensors: string[];
    occupancySensors: string[];
    lights: string[];
    all: string[];
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
 * Check if any motion/occupancy sensors are active using cached entity IDs
 * This is the optimized version that avoids calling getRoomEntities
 */
export function hasActiveMotionOrOccupancy(
    hass: HomeAssistant,
    cachedIds: CachedEntityIds,
    motionDelayActive: Map<string, boolean>
): boolean {
    // Check motion sensors (active if on OR in delay period after turning off)
    for (const entityId of cachedIds.motionSensors) {
        const state = hass.states[entityId]?.state;
        
        // Motion detected: sensor is currently on
        if (state === 'on') {
            return true;
        }
        
        // Motion delay: sensor is off but still in delay period
        if (motionDelayActive.get(entityId)) {
            return true;
        }
    }
    
    // Check occupancy sensors (no delay, just current state)
    for (const entityId of cachedIds.occupancySensors) {
        const state = hass.states[entityId]?.state;
        if (state === 'on') {
            return true;
        }
    }
    
    return false;
}

/**
 * Check if any lights are on using cached entity IDs
 * This is the optimized version that avoids calling getRoomEntities
 */
export function hasActiveLights(
    hass: HomeAssistant,
    cachedIds: CachedEntityIds
): boolean {
    for (const entityId of cachedIds.lights) {
        const state = hass.states[entityId]?.state;
        if (state === 'on') {
            return true;
        }
    }
    return false;
}

/**
 * Calculate dynamic room color based on entity states (optimized with cached entity IDs)
 * Uses cached entity IDs to avoid expensive getRoomEntities calls on every render
 * 
 * Precedence: Motion/Occupancy > Lights > Default
 */
export function calculateDynamicRoomColor(
    hass: HomeAssistant,
    room: Room,
    config: ScalableHousePlanConfig | undefined,
    motionDelayActive: Map<string, boolean>,
    cachedIds: CachedEntityIds
): DynamicColorResult {
    // Check if room has dynamic colors disabled
    if (room.disable_dynamic_color === true) {
        return { color: 'transparent', type: 'transparent' };
    }
    
    // Check if global show_room_backgrounds is enabled (debugging mode)
    if (config?.show_room_backgrounds === true) {
        return { color: room.color || 'transparent', type: 'transparent' };
    }
    
    // Get configured colors with defaults
    const motionColor = config?.dynamic_colors?.motion_occupancy || 'rgba(135, 206, 250, 0.15)';
    const lightsColor = config?.dynamic_colors?.lights || 'rgba(255, 245, 170, 0.17)';
    const defaultColor = config?.dynamic_colors?.default || 'rgba(100, 100, 100, 0.05)';
    
    // Check motion/occupancy (highest priority) - using cached IDs
    if (hasActiveMotionOrOccupancy(hass, cachedIds, motionDelayActive)) {
        return { color: motionColor, type: 'motion' };
    }
    
    // Check lights (second priority) - using cached IDs
    if (hasActiveLights(hass, cachedIds)) {
        return { color: lightsColor, type: 'lights' };
    }
    
    // Default color
    return { color: defaultColor, type: 'default' };
}
