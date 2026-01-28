/**
 * Shared type definitions for scalable-house-plan card
 * 
 * These types are used across multiple components including the main card,
 * editor components, utility functions, and room/element renderers.
 */

export type PositionScalingMode = "plan" | "element" | "fixed";

export interface InfoBoxPosition {
    top?: number;    // Pixels from top edge of room
    bottom?: number; // Pixels from bottom edge (mutually exclusive with top)
    left?: number;   // Pixels from left edge of room
    right?: number;  // Pixels from right edge (mutually exclusive with left)
}

export interface InfoBoxTypeConfig {
    show?: boolean;  // Default: true (deprecated - use visible_detail/visible_overview)
    visible_detail?: boolean;  // Default: true - show in detail view
    visible_overview?: boolean;  // Default: true - show in overview
    size?: string;   // Default: "100%" - percentage scale (e.g., "200%" for double size)
    icon_position?: 'inline' | 'separate';  // Default: "inline" - icon on same line or separate line
    element?: Record<string, any>;  // Parameters to spread to the child component (e.g., analog-text-shp)
}

export interface InfoBoxConfig {
    show?: boolean;             // Default: true
    position?: InfoBoxPosition; // Default: { top: 5, left: 5 }
    show_background_detail?: boolean;  // Default: true - show background in detail view
    show_background_overview?: boolean;  // Default: true - show background in overview
    types?: {
        motion?: InfoBoxTypeConfig;
        occupancy?: InfoBoxTypeConfig;
        temperature?: InfoBoxTypeConfig;
        humidity?: InfoBoxTypeConfig;
    }
}

export interface Room {
    name: string;
    area?: string;  // Optional Home Assistant area ID
    boundary: [number, number][];
    entities: EntityConfig[];
    color?: string;  // Optional color for room background (supports rgba)
    elements_clickable_on_overview?: boolean;  // Default false - when true, elements are clickable and room is not
    disable_dynamic_color?: boolean;  // Default false - when true, room is transparent (no dynamic colors)
    info_box?: InfoBoxConfig;  // Info box configuration for this room
}

export interface PlanConfig {
    left?: string | number;
    right?: string | number;
    top?: string | number;
    bottom?: string | number;
    width?: string | number;
    height?: string | number;
    overview?: boolean;  // Default true - show on overview
    style?: string | Record<string, string | number>;  // Custom CSS styles for element wrapper (string or object)
    element?: ElementConfig;  // Element config with optional type override
    position_scaling_horizontal?: PositionScalingMode;  // How horizontal position scales in detail view (default: "plan")
    position_scaling_vertical?: PositionScalingMode;    // How vertical position scales in detail view (default: "plan")
    disable_dynamic_color?: boolean;  // Opt-out entity from dynamic color evaluation
    exclude_from_info_box?: boolean;  // Opt-out entity from info box display
    light?: 'ambient' | 'normal';     // Light type: ambient (subtle) or normal (default)
}

export interface ElementConfig {
    type?: string;  // Optional - auto-detected if not specified
    entity?: string;
    tap_action?: any;
    hold_action?: any;
    double_tap_action?: any;
    [key: string]: any;  // Element-specific properties
}

// EntityConfig can be a string (entity_id) or an object
// For no-entity elements (decorative), entity can be empty string and plan.element.type is required
export type EntityConfig = string | {
    entity: string;  // Can be empty string for no-entity elements
    plan?: PlanConfig;
}

export interface DynamicColorsConfig {
    motion_occupancy?: string;      // Default: (light blue)
    ambient_lights?: string;        // Default: (subtle purple/pink)
    lights?: string;                // Default: (warm white light)
    default?: string;               // Default: (very light gray)
    motion_delay_seconds?: number;  // Default: 60
}

/**
 * Cached entity IDs for a room to avoid expensive lookups on every render
 */
export interface RoomEntityCache {
    allEntityIds: string[];           // All entities (explicit + area)
    ambientLightIds: string[];        // Ambient light entity IDs
    areaEntityIds: string[];          // Cached area entities
    infoBoxEntityIds: string[];       // For info box scanning (allEntityIds)
    // Used for dynamic color calculation
    motionSensorIds: string[];
    lightIds: string[];
    occupancySensorIds: string[];
}
