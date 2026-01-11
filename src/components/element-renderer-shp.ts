import { html, TemplateResult } from "lit-element";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { Room, EntityConfig, PositionScalingMode, InfoBoxConfig, ScalableHousePlanConfig } from "../cards/scalable-house-plan";
import { CreateCardElement, getElementTypeForEntity, mergeElementProperties, getRoomEntities, getDefaultTapAction, getDefaultHoldAction, isEntityActionable, getAllRoomEntityIds } from "../utils";

/**
 * Shared element rendering functionality for overview and detail views
 * 
 * Handles:
 * - Element card creation and caching
 * - Position calculation (percentage-based relative to room)
 * - Size calculation (with optional scaling)
 */

export interface ElementRendererOptions {
    hass: HomeAssistant;
    room: Room;
    roomBounds: { minX: number; minY: number; width: number; height: number };
    createCardElement: CreateCardElement | null;
    elementCards: Map<string, any>;
    scale: number;
    scaleRatio?: number;  // Element scaling ratio (0=no scale, 1=full scale with plan)
    config?: ScalableHousePlanConfig;  // Optional: needed for info box defaults
    originalRoom?: Room;  // Optional: original room with all entities (for info box in overview mode)
    infoBoxCache?: Map<string, EntityConfig | null>;  // Cache for info box entity configs
}
/**
 * Generate unique key for no-entity elements based on type and position
 * Key format: elementType-left-top-right-bottom-room_id (if present)
 */
function generateElementKey(elementType: string, plan: any): string {
    const left = plan.left !== undefined ? String(plan.left) : 'undefined';
    const top = plan.top !== undefined ? String(plan.top) : 'undefined';
    const right = plan.right !== undefined ? String(plan.right) : 'undefined';
    const bottom = plan.bottom !== undefined ? String(plan.bottom) : 'undefined';
    
    // Include room_id if present (for info boxes to be unique per room)
    const roomId = plan.element?.room_id ? `-${plan.element.room_id}` : '';
    
    return `${elementType}-${left}-${top}-${right}-${bottom}${roomId}`;
}
/**
 * Renders elements for a room
 * Element scaling is based on scaleRatio: elementScale = 1 + (planScale - 1) * scaleRatio
 * - scaleRatio = 0: elements keep original size (no scaling)
 * - scaleRatio = 1: elements scale fully with plan
 * - scaleRatio = 0.25 (default): elements scale 25% of plan scaling
 */
export function renderElements(options: ElementRendererOptions): TemplateResult[] {
    const { hass, room, roomBounds, createCardElement, elementCards, scale, scaleRatio = 0, config, originalRoom, infoBoxCache } = options;
    
    // Calculate element scale: 1 + (planScale - 1) * scaleRatio
    // When scale=5, ratio=0.5: elementScale = 1 + 4*0.5 = 3
    // When scale=5, ratio=0: elementScale = 1 (no scaling)
    // When scale=5, ratio=1: elementScale = 5 (full scaling)
    const elementScale = 1 + (scale - 1) * scaleRatio;

    // Add info box element if enabled
    // Use originalRoom if provided (for overview mode), otherwise use room
    // Determine mode: if originalRoom is provided, we're in overview
    const isOverview = !!originalRoom;
    const mode: 'overview' | 'detail' = isOverview ? 'overview' : 'detail';
    const roomForInfoBox = originalRoom || room;
    const infoBoxEntity = getOrCreateInfoBoxEntity(roomForInfoBox, config, hass, mode, infoBoxCache);
    const allEntities = infoBoxEntity ? [...(room.entities || []), infoBoxEntity] : (room.entities || []);

    // Get all entities with plan config
    const elements = allEntities
        .filter((entityConfig: EntityConfig) => {
            if (typeof entityConfig === 'string') return false;
            return !!entityConfig.plan;
        })
        .map((entityConfig: EntityConfig) => {
            const entity = typeof entityConfig === 'string' ? entityConfig : entityConfig.entity;
            const plan = typeof entityConfig === 'string' ? undefined : entityConfig.plan;
            
            if (!plan) return null;

            // Validate no-entity elements: must have element.type
            if (!entity && (!plan.element || !plan.element.type)) {
                console.warn('No-entity element missing element.type:', plan);
                return null;
            }

            // Get default element definition for this entity (or use plan.element.type for no-entity)
            const deviceClass = entity && hass?.states[entity]?.attributes?.device_class;
            const defaultElement = entity 
                ? getElementTypeForEntity(entity, deviceClass, 'plan')
                : { type: plan.element!.type as string }; // For no-entity, use specified type (! is safe due to validation above)
            
            // Merge default properties with user overrides
            const elementConfig = mergeElementProperties(defaultElement, plan.element || {});

            // Add default tap_action and hold_action for entities (if not already set by user)
            if (entity && isEntityActionable(entity, hass)) {
                if (!elementConfig.tap_action) {
                    elementConfig.tap_action = getDefaultTapAction(entity, hass);
                }
                if (!elementConfig.hold_action) {
                    elementConfig.hold_action = getDefaultHoldAction();
                }
            }

            // Generate unique key: use entity if present, otherwise generate from type+position
            const uniqueKey = entity || generateElementKey(elementConfig.type, plan);

            return { entity, plan, elementConfig, uniqueKey };
        })
        .filter((el): el is { entity: string; plan: any; elementConfig: any; uniqueKey: string } => el !== null);

    return elements.map(({ entity, plan, elementConfig, uniqueKey }) => {
        // Get position scaling modes (default to "plan" if not specified)
        const horizontalScaling: PositionScalingMode = plan.position_scaling_horizontal || "plan";
        const verticalScaling: PositionScalingMode = plan.position_scaling_vertical || "plan";
        
        // Calculate position scale factors
        // When scaleRatio is 0 (overview), always use plan scale (ignore position scaling modes)
        // When scaleRatio is non-zero (detail), apply custom scaling modes:
        // "plan": positions scale with the room (current behavior)
        // "element": positions scale with element size (using scaleRatio)
        // "fixed": positions don't scale (use absolute values)
        const getPositionScale = (mode: PositionScalingMode): number => {
            if (scaleRatio === 0) return scale; // Overview always uses plan scale
            
            switch (mode) {
                case "element":
                    // Position scales same as element size: 1 + (scale - 1) * scaleRatio
                    return 1 + (scale - 1) * scaleRatio;
                case "fixed":
                    return 1; // No scaling
                case "plan":
                default:
                    return scale; // Full plan scaling
            }
        };
        
        const horizontalPositionScale = getPositionScale(horizontalScaling);
        const verticalPositionScale = getPositionScale(verticalScaling);
        
        // Calculate percentage-based position (maintain relative position in room)
        const style: Record<string, string> = {
            position: 'absolute'
        };

        // Handle positions - support both pixels (convert to %) and percentages (use as-is)
        if (plan.left !== undefined) {
            if (typeof plan.left === 'string' && plan.left.includes('%')) {
                // Already a percentage - use directly
                style.left = plan.left;
            } else if (typeof plan.left === 'number') {
                // Pixels - apply position scaling then convert to percentage
                const scaledLeft = plan.left * horizontalPositionScale;
                const percentage = (scaledLeft / (roomBounds.width * scale)) * 100;
                style.left = `${percentage}%`;
            }
        }
        
        if (plan.top !== undefined) {
            if (typeof plan.top === 'string' && plan.top.includes('%')) {
                style.top = plan.top;
            } else if (typeof plan.top === 'number') {
                const scaledTop = plan.top * verticalPositionScale;
                const percentage = (scaledTop / (roomBounds.height * scale)) * 100;
                style.top = `${percentage}%`;
            }
        }
        
        if (plan.right !== undefined) {
            if (typeof plan.right === 'string' && plan.right.includes('%')) {
                style.right = plan.right;
            } else if (typeof plan.right === 'number') {
                const scaledRight = plan.right * horizontalPositionScale;
                const percentage = (scaledRight / (roomBounds.width * scale)) * 100;
                style.right = `${percentage}%`;
            }
        }
        
        if (plan.bottom !== undefined) {
            if (typeof plan.bottom === 'string' && plan.bottom.includes('%')) {
                style.bottom = plan.bottom;
            } else if (typeof plan.bottom === 'number') {
                const scaledBottom = plan.bottom * verticalPositionScale;
                const percentage = (scaledBottom / (roomBounds.height * scale)) * 100;
                style.bottom = `${percentage}%`;
            }
        }

        // Note: Width/height are NOT set on the wrapper div.
        // Elements are responsible for sizing themselves via their internal styles.
        // This allows elements like door-window to correctly handle orientation swapping
        // without causing positioning issues with right/bottom alignment.

        // Get or create the element card using unique key
        const card = getOrCreateElementCard(uniqueKey, entity, elementConfig, createCardElement, elementCards);
        if (card && hass) {
            card.hass = hass;
        }

        // Calculate transform-origin based on positioning
        // Horizontal: use 'left' if left is set, 'right' if right is set, otherwise 'center'
        const horizontalOrigin = plan.left !== undefined ? 'left' : 
                                plan.right !== undefined ? 'right' : 'center';
        
        // Vertical: use 'top' if top is set, 'bottom' if bottom is set, otherwise 'center'
        const verticalOrigin = plan.top !== undefined ? 'top' : 
                              plan.bottom !== undefined ? 'bottom' : 'center';
        
        const transformOrigin = `${horizontalOrigin} ${verticalOrigin}`;

        // Apply element scaling via transform
        const transform = elementScale !== 1 ? `scale(${elementScale})` : '';
        
        // Build base style string from position styles
        let styleString = Object.entries(style)
            .map(([k, v]) => `${k}: ${v}`)
            .join('; ');
        
        // Apply user-defined custom styles from plan.style if present
        // Supports both object notation: { 'z-index': '999', opacity: '0.8' }
        // and string notation: "z-index: 999; opacity: 0.8"
        // Custom styles are appended to position styles (position, left, top, right, bottom)
        if (plan.style) {
            const customStyles = typeof plan.style === 'string' 
                ? plan.style 
                : Object.entries(plan.style)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join('; ');
            
            if (customStyles) {
                styleString += `; ${customStyles}`;
            }
        }

        return html`
            <div class="element-wrapper" style="${styleString}; transform: ${transform}; transform-origin: ${transformOrigin};">
                ${card}
            </div>
        `;
    });
}

/**
 * Get or create a card element for an entity or no-entity element
 * @param uniqueKey - Unique identifier (entity ID for entities, generated key for no-entity elements)
 * @param entityId - Entity ID (can be empty string for no-entity elements)
 * @param elementConfig - Element configuration
 * @param createCardElement - Function to create card elements
 * @param elementCards - Cache map for card elements
 */
function getOrCreateElementCard(
    uniqueKey: string,
    entityId: string, 
    elementConfig: any, 
    createCardElement: CreateCardElement | null,
    elementCards: Map<string, any>
) {
    let card = elementCards.get(uniqueKey);
    
    if (!card && createCardElement) {
        const cardConfig = {
            ...elementConfig,
            entity: entityId || undefined,  // Don't pass empty string to card config
        };
        
        try {
            card = createCardElement(cardConfig);
            if (card) {
                elementCards.set(uniqueKey, card);
            }
        } catch (e) {
            console.error('Error creating element card:', e);
        }
    }
    
    return card;
}

/**
 * Calculate room bounding box
 */
export function getRoomBounds(room: Room): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
    if (!room.boundary || room.boundary.length === 0) {
        return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 };
    }
    
    const xs = room.boundary.map(p => p[0]);
    const ys = room.boundary.map(p => p[1]);
    
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    
    return {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX,
        height: maxY - minY
    };
}

/**
 * Get or create cached info box entity config
 * @param room - The room to create info box for
 * @param config - House plan config (for defaults)
 * @param hass - Home Assistant instance
 * @param mode - Current view mode
 * @param cache - Optional cache map for info box configs
 * @returns EntityConfig for info box or null if disabled
 */
function getOrCreateInfoBoxEntity(
    room: Room, 
    config: ScalableHousePlanConfig | undefined, 
    hass: HomeAssistant, 
    mode: 'overview' | 'detail',
    cache?: Map<string, EntityConfig | null>
): EntityConfig | null {
    // Generate cache key: room name + mode
    const cacheKey = `${room.name}-${mode}`;
    
    // Check cache first
    if (cache?.has(cacheKey)) {
        return cache.get(cacheKey) || null;
    }
    
    // Create info box entity (expensive operation)
    const infoBoxEntity = createInfoBoxEntity(room, config, hass, mode);
    
    // Store in cache if available
    if (cache) {
        cache.set(cacheKey, infoBoxEntity);
    }
    
    return infoBoxEntity;
}

/**
 * Create info box entity config if info box is enabled for the room
 * @param room - The room to create info box for
 * @param config - House plan config (for defaults)
 * @param hass - Home Assistant instance
 * @returns EntityConfig for info box or null if disabled
 */
function createInfoBoxEntity(room: Room, config: ScalableHousePlanConfig | undefined, hass: HomeAssistant, mode: 'overview' | 'detail'): EntityConfig | null {
    // Merge defaults: code default -> house config -> room config
    const codeDefault: InfoBoxConfig = {
        show: true,
        position: { top: 5, left: 5 },
        show_background_detail: true,
        show_background_overview: true,
        types: {}
    };
    
    const houseDefaults = config?.info_box_defaults || {};
    const roomConfig = room.info_box || {};
    
    // Merge configs (room overrides house, house overrides code defaults)
    const merged: InfoBoxConfig = {
        show: roomConfig.show !== undefined ? roomConfig.show : (houseDefaults.show !== undefined ? houseDefaults.show : codeDefault.show),
        position: roomConfig.position || houseDefaults.position || codeDefault.position,
        show_background_detail: roomConfig.show_background_detail ?? houseDefaults.show_background_detail ?? codeDefault.show_background_detail,
        show_background_overview: roomConfig.show_background_overview ?? houseDefaults.show_background_overview ?? codeDefault.show_background_overview,
        types: {
            ...codeDefault.types,
            ...houseDefaults.types,
            ...roomConfig.types
        }
    };
    
    // Don't create if disabled
    if (merged.show === false) {
        return null;
    }
    
    // Determine if background should be shown for current mode
    const showBackground = mode === 'overview' ? merged.show_background_overview : merged.show_background_detail;
    
    // Get ALL entity IDs for info box to scan through (info box filters to specific types internally)
    const roomEntityIds = getAllRoomEntityIds(hass, room, null);
    
    // Create element config for info box
    // Add room name to make unique key for each room's info box
    const pos = merged.position!;
    return {
        entity: '', // No entity (info box looks up entities itself)
        plan: {
            overview: true,  // Show on overview
            ...pos,  // Spread position properties (top, left, right, bottom)
            element: {
                type: 'custom:info-box-shp',
                room_entities: roomEntityIds,
                mode: mode,  // Pass current mode
                show_background: showBackground,  // Pass mode-specific background visibility
                types: merged.types,
                room_id: room.name  // Unique identifier per room
            }
        }
    };
}

