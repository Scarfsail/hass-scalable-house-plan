/**
 * Shared type definitions for scalable-house-plan card
 *
 * These types are used across multiple components including the main card,
 * editor components, utility functions, and room/element renderers.
 */

import type { ElementBaseConfig } from "../elements/base";

export type PositionScalingMode = "plan" | "element" | "fixed";

export interface InfoBoxTypeConfig {
    show?: boolean;  // Default: true (deprecated - use visible_detail/visible_overview)
    visible_detail?: boolean;  // Default: true - show in detail view
    visible_overview?: boolean;  // Default: true - show in overview
    size?: string;   // Default: "100%" - percentage scale (e.g., "200%" for double size)
    icon_position?: 'inline' | 'separate';  // Default: "inline" - icon on same line or separate line
    element?: Record<string, any>;  // Parameters to spread to the child component (e.g., analog-text-shp)
}

/**
 * House-level default config for an element type.
 * Matched by element.type; all other fields are baseline plan/element properties.
 */
export interface ElementDefaultConfig {
    left?: string | number;
    right?: string | number;
    top?: string | number;
    bottom?: string | number;
    element: ElementConfig & { type: string };  // type is required for matching
}

export interface Room {
    name: string;
    area?: string;  // Optional Home Assistant area ID
    boundary: [number, number][];
    entities: EntityConfig[];
    color?: string;  // Optional color for room background (supports rgba)
    elements_clickable_on_overview?: boolean;  // Default false - when true, elements are clickable and room is not
    disable_dynamic_color?: boolean;  // Default false - when true, room is transparent (no dynamic colors)
    show_as_dashboard?: boolean;             // Default false — renders room as a black screen/display panel
    dashboard_glare?: 'top-center' | 'left-center' | 'full' | 'lcd'; // Default 'top-center' — glare/highlight effect style
    dashboard_overview_opacity?: number;     // Default 100 — background opacity in overview (0=transparent, 100=opaque)
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

/**
 * Configuration for the group-shp element.
 * 
 * A group is a container element that holds multiple child entities/elements
 * with absolute positioning. The group itself can be positioned via plan config,
 * and acts as a single unit in the room.
 * 
 * Children are positioned absolutely within the group using their own plan.left/top/right/bottom.
 * Width and height are required to establish the container boundaries.
 */
export interface GroupElementConfig extends ElementBaseConfig {
    children: EntityConfig[];  // Array of child entity configurations
    width: number;             // Explicit width in pixels (required)
    height: number;            // Explicit height in pixels (required)
    show_border?: boolean;     // Optional: Show dashed border for debugging/editing (default: false)
}

export interface DynamicColorsConfig {
    motion_occupancy?: string;      // Default: (light blue)
    ambient_lights?: string;        // Default: (subtle purple/pink)
    lights?: string;                // Default: (warm white light)
    default?: string;               // Default: (very light gray)
    motion_delay_seconds?: number;  // Default: 60
    // cat1: when true, idle rooms render a default overlay; false (default) = transparent
    show_idle_overlay?: boolean;
    // cat3: when true, polygon borders are visible in dynamic color mode; false (default) = hidden
    show_border?: boolean;
}

/**
 * Cached entity IDs for a room to avoid expensive lookups on every render
 */
export interface RoomEntityCache {
    allEntityIds: string[];           // All entities (explicit + area)
    ambientLightIds: string[];        // Ambient light entity IDs
    areaEntityIds: string[];          // Cached area entities
    // Used for dynamic color calculation
    motionSensorIds: string[];
    lightIds: string[];
    occupancySensorIds: string[];
}
