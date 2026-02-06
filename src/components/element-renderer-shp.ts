import { html, TemplateResult } from "lit-element";
import { keyed } from "lit/directives/keyed.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { Room, EntityConfig, PositionScalingMode, InfoBoxConfig } from "../cards/types";
import type { ScalableHousePlanConfig, HouseCache } from "../cards/scalable-house-plan";
import { CreateCardElement, getElementTypeForEntity, mergeElementProperties, getRoomEntities, getDefaultTapAction, getDefaultHoldAction, isEntityActionable, getAllRoomEntityIds, isGroupElementType } from "../utils";
import { getOrCreateElementCard } from "../utils/card-element-cache";

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
    cachedInfoBoxEntityIds?: string[];  // Pre-computed entity IDs for info box (avoids expensive getAllRoomEntityIds call)
    elementsClickable?: boolean;  // Whether elements should be clickable (controls pointer-events)
    houseCache: HouseCache;  // Element renderer caches (required)
    editorMode?: boolean;  // Interactive editor mode: enable click-to-select behavior
    selectedElementKey?: string | null;  // Currently selected element uniqueKey
    onElementClick?: (uniqueKey: string, elementIndex: number, entity: string, parentGroupKey?: string) => void;  // Click callback for element selection
}

/**
 * Cached element metadata to avoid expensive lookups on every render
 */
interface ElementMetadata {
    defaultElement: any;        // Result from getElementTypeForEntity
    elementConfig: any;         // Merged config (defaults + user overrides)
    deviceClass?: string;       // Cached device class
}

/**
 * Cached position/style calculations to avoid recomputing on every render
 */
interface PositionCache {
    style: Record<string, string>;  // Position styles (left, top, right, bottom)
    transformOrigin: string;        // Transform origin based on positioning
    transform: string;              // Transform scale string
    styleString: string;            // Pre-built CSS string (including custom styles)
}

/**
 * Cached element structure to avoid filtering/mapping room.entities on every render
 */
interface CachedElementStructure {
    elements: Array<{
        entity: string;
        plan: any;
        elementConfig: any;
        uniqueKey: string;
    }>;
}

/**
 * Generate unique key for no-entity elements based on type and position
 * Key format: elementType-left-top-right-bottom-room_id-mode (mode only for info boxes)
 */
export function generateElementKey(elementType: string, plan: any): string {
    const left = plan.left !== undefined ? String(plan.left) : 'undefined';
    const top = plan.top !== undefined ? String(plan.top) : 'undefined';
    const right = plan.right !== undefined ? String(plan.right) : 'undefined';
    const bottom = plan.bottom !== undefined ? String(plan.bottom) : 'undefined';
    
    // Include room_id if present (for info boxes to be unique per room)
    const roomId = plan.element?.room_id ? `-${plan.element.room_id}` : '';
    
    // Include mode only for info boxes (they have mode-specific visibility settings)
    const isInfoBox = elementType === 'custom:info-box-shp';
    const mode = isInfoBox && plan.element?.mode ? `-${plan.element.mode}` : '';
    
    return `${elementType}-${left}-${top}-${right}-${bottom}${roomId}${mode}`;
}

/**
 * Get or create cached element structure for a room
 * This avoids filtering/mapping room.entities on every render
 */
function getOrCreateElementStructure(
    roomName: string,
    mode: 'overview' | 'detail',
    allEntities: EntityConfig[],
    hass: HomeAssistant,
    elementStructureCache: Map<string, CachedElementStructure>,
    elementMetadataCache: Map<string, ElementMetadata>
): Array<{ entity: string; plan: any; elementConfig: any; uniqueKey: string }> {
    // Include mode in cache key to separate overview and detail caches
    const cacheKey = `${roomName}-${mode}`;
    const cached = elementStructureCache.get(cacheKey);
    
    // Check if cache is valid
    if (cached) {
        return cached.elements;
    }
    
    

    // Compute element structure
    const elements = allEntities
        .filter((entityConfig: EntityConfig) => {
            if (typeof entityConfig === 'string') return false;
            return !!entityConfig.plan;
        })
        .map((entityConfig: EntityConfig) => {
            const entity = typeof entityConfig === 'string' ? entityConfig : entityConfig.entity;
            const plan = typeof entityConfig === 'string' ? undefined : entityConfig.plan;
            
            if (!plan) return null;

            // Validate no-entity elements
            if (!entity && (!plan.element || !plan.element.type)) {
                console.warn('No-entity element missing element.type:', plan);
                return null;
            }

            // Generate unique key
            const uniqueKey = entity || generateElementKey(plan.element?.type || 'unknown', plan);

            // Get cached element metadata (will be recomputed since we cleared the cache above)
            const metadata = getOrCreateElementMetadata(uniqueKey, entity, plan, hass, elementMetadataCache);

            return { entity, plan, elementConfig: metadata.elementConfig, uniqueKey };
        })
        .filter((el): el is { entity: string; plan: any; elementConfig: any; uniqueKey: string } => el !== null);
    
    // Store in cache
    elementStructureCache.set(cacheKey, {
        elements
    });
    
    return elements;
}

/**
 * Get or create cached element metadata
 * @param cacheKey - Unique key for this element (entity ID or generated key)
 * @param entity - Entity ID (can be empty for no-entity elements)
 * @param plan - Plan configuration
 * @param hass - Home Assistant instance
 * @param elementMetadataCache - Cache map for element metadata
 * @returns Cached or newly computed element metadata
 */
function getOrCreateElementMetadata(
    cacheKey: string,
    entity: string,
    plan: any,
    hass: HomeAssistant,
    elementMetadataCache: Map<string, ElementMetadata>
): ElementMetadata {
    // Check cache first
    let metadata = elementMetadataCache.get(cacheKey);
    
    if (!metadata) {
        // Compute metadata (expensive operations)
        const deviceClass = entity && hass?.states[entity]?.attributes?.device_class;
        const defaultElement = entity 
            ? getElementTypeForEntity(entity, deviceClass, 'plan')
            : { type: plan.element!.type as string };
        
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
        
        metadata = {
            defaultElement,
            elementConfig,
            deviceClass
        };
        
        // Store in cache
        elementMetadataCache.set(cacheKey, metadata);
    }
    
    return metadata;
}

/**
 * Generate compact bounds key for cache
 */
function getBoundsKey(bounds: { width: number; height: number }): string {
    return `${bounds.width}x${bounds.height}`;
}

/**
 * Generate position cache key
 * Includes position values to detect when positions change
 */
function getPositionCacheKey(uniqueKey: string, scale: number, scaleRatio: number, boundsKey: string, plan: any): string {
    // Include position values in cache key to invalidate when they change
    const positionKey = `${plan.left}-${plan.top}-${plan.right}-${plan.bottom}-${plan.width}-${plan.height}`;
    const scalingKey = `${plan.position_scaling_horizontal || 'plan'}-${plan.position_scaling_vertical || 'plan'}`;
    return `${uniqueKey}-${scale.toFixed(2)}-${scaleRatio}-${boundsKey}-${positionKey}-${scalingKey}`;
}

/**
 * Calculate position styles (expensive operation - cached)
 */
function calculatePositionStyles(
    plan: any,
    scale: number,
    scaleRatio: number,
    roomBounds: { width: number; height: number },
    elementScale: number
): PositionCache {
    // Get position scaling modes
    const horizontalScaling: PositionScalingMode = plan.position_scaling_horizontal || "plan";
    const verticalScaling: PositionScalingMode = plan.position_scaling_vertical || "plan";
    
    // Calculate position scale factors
    const getPositionScale = (mode: PositionScalingMode): number => {
        if (scaleRatio === 0) return scale;
        
        switch (mode) {
            case "element":
                return 1 + (scale - 1) * scaleRatio;
            case "fixed":
                return 1;
            case "plan":
            default:
                return scale;
        }
    };
    
    const horizontalPositionScale = getPositionScale(horizontalScaling);
    const verticalPositionScale = getPositionScale(verticalScaling);
    
    // Calculate percentage-based positions
    const style: Record<string, string> = {
        position: 'absolute'
    };

    if (plan.left !== undefined) {
        if (typeof plan.left === 'string' && plan.left.includes('%')) {
            style.left = plan.left;
        } else if (typeof plan.left === 'number') {
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

    // Calculate transform-origin
    const horizontalOrigin = plan.left !== undefined ? 'left' : 
                            plan.right !== undefined ? 'right' : 'center';
    const verticalOrigin = plan.top !== undefined ? 'top' : 
                          plan.bottom !== undefined ? 'bottom' : 'center';
    const transformOrigin = `${horizontalOrigin} ${verticalOrigin}`;

    // Calculate transform
    const transform = elementScale !== 1 ? `scale(${elementScale})` : '';
    
    // Build base style string
    let styleString = Object.entries(style)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');
    
    // Apply custom styles
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

    return {
        style,
        transformOrigin,
        transform,
        styleString
    };
}

/**
 * Renders elements for a room
 * Element scaling is based on scaleRatio: elementScale = 1 + (planScale - 1) * scaleRatio
 * - scaleRatio = 0: elements keep original size (no scaling)
 * - scaleRatio = 1: elements scale fully with plan
 * - scaleRatio = 0.25 (default): elements scale 25% of plan scaling
 */
export function renderElements(options: ElementRendererOptions): unknown[] {
    const { hass, room, roomBounds, createCardElement, elementCards, scale, scaleRatio = 0, config, originalRoom, infoBoxCache, cachedInfoBoxEntityIds, elementsClickable = false, houseCache, editorMode = false, selectedElementKey, onElementClick } = options;
    
    // Extract caches from HouseCache
    const metadataCache = houseCache.elementMetadata;
    const structureCache = houseCache.elementStructure;
    const posCache = houseCache.position;
    
    // Calculate element scale: 1 + (planScale - 1) * scaleRatio
    // When scale=5, ratio=0.5: elementScale = 1 + 4*0.5 = 3
    // When scale=5, ratio=0: elementScale = 1 (no scaling)
    // When scale=5, ratio=1: elementScale = 5 (full scaling)
    const elementScale = 1 + (scale - 1) * scaleRatio;

    // Generate bounds key for position cache
    const boundsKey = getBoundsKey(roomBounds);

    // Add info box element if enabled
    const isOverview = !!originalRoom;
    const mode: 'overview' | 'detail' = isOverview ? 'overview' : 'detail';
    const roomForInfoBox = originalRoom || room;
    const infoBoxEntity = getOrCreateInfoBoxEntity(roomForInfoBox, config, hass, mode, infoBoxCache, cachedInfoBoxEntityIds);
    
    const allEntities = infoBoxEntity ? [...(room.entities || []), infoBoxEntity] : (room.entities || []);

    // Get or create cached element structure
    // This avoids expensive filter/map operations on every render
    const elements = getOrCreateElementStructure(room.name, mode, allEntities, hass, structureCache, metadataCache);

    const renderedElements = elements.map(({ entity, plan, elementConfig, uniqueKey }) => {
        // Get or create cached position styles
        const positionCacheKey = getPositionCacheKey(uniqueKey, scale, scaleRatio, boundsKey, plan);
        let positionData = posCache.get(positionCacheKey);
        
        if (!positionData) {
            // Cache miss - calculate and store
            positionData = calculatePositionStyles(plan, scale, scaleRatio, roomBounds, elementScale);
            posCache.set(positionCacheKey, positionData);
        }

        // Get or create the element card using unique key
        const card = getOrCreateElementCard(uniqueKey, entity, elementConfig, createCardElement, elementCards);
        if (card && hass) {
            card.hass = hass;

            // For group-shp elements, pass through mode, createCardElement and elementCards
            // so they can render their children and filter based on overview setting
            if (isGroupElementType(elementConfig)) {
                card.mode = mode;
                card.createCardElement = createCardElement;
                card.elementCards = elementCards;
                // Pass through editor-related properties for nested group selection
                card.editorMode = editorMode;
                card.selectedElementKey = selectedElementKey;
                card.onElementClick = onElementClick;
                card.groupUniqueKey = uniqueKey; // Pass this group's uniqueKey for nested selection context
            }

            // Disable pointer events on card in editor mode so wrapper catches clicks
            // IMPORTANT: Don't disable pointer events on group-shp cards - they need to handle child clicks!
            if (editorMode && !isGroupElementType(elementConfig)) {
                card.style.pointerEvents = 'none';
            } else if (card.style.pointerEvents === 'none') {
                // Re-enable pointer events when not in editor mode
                card.style.pointerEvents = '';
            }
        }

        // Handle element click in editor mode
        const handleClick = (e: MouseEvent) => {
            if (editorMode && onElementClick) {
                // Check if click came from a child element-wrapper (for nested groups)
                // If so, don't handle this click - let the child handle it
                const target = e.target as HTMLElement;
                const currentWrapper = e.currentTarget as HTMLElement;
                
                // Find if there's an element-wrapper or child-wrapper between target and currentTarget
                let element = target;
                while (element && element !== currentWrapper) {
                    if ((element.classList?.contains('element-wrapper') || element.classList?.contains('child-wrapper')) && element !== currentWrapper) {
                        // Click came from a nested wrapper, ignore it
                        return;
                    }
                    element = element.parentElement as HTMLElement;
                }
                
                e.stopPropagation();
                e.preventDefault();
                const elementIndex = elements.findIndex(el => el.uniqueKey === uniqueKey);
                const elementData = elements.find(el => el.uniqueKey === uniqueKey);
                onElementClick(uniqueKey, elementIndex, elementData?.entity || '');
            }
        };

        // Determine if this element is selected
        const isSelected = uniqueKey === selectedElementKey;

        return keyed(uniqueKey, html`
            <div
                class="element-wrapper ${isSelected ? 'selected-element' : ''}"
                style="${positionData.styleString}; transform: ${positionData.transform}; transform-origin: ${positionData.transformOrigin}; pointer-events: ${elementsClickable || editorMode ? 'auto' : 'none'}; ${editorMode ? 'cursor: pointer;' : ''}"
                @click=${handleClick}
            >
                ${card}
            </div>
        `);
    });
    
    return renderedElements;
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
 * @param cachedEntityIds - Pre-computed entity IDs (avoids expensive getAllRoomEntityIds call)
 * @returns EntityConfig for info box or null if disabled
 */
function getOrCreateInfoBoxEntity(
    room: Room, 
    config: ScalableHousePlanConfig | undefined, 
    hass: HomeAssistant, 
    mode: 'overview' | 'detail',
    cache?: Map<string, EntityConfig | null>,
    cachedEntityIds?: string[]
): EntityConfig | null {
    // Generate cache key: room name + mode
    const cacheKey = `${room.name}-${mode}`;
    
    // Check cache first
    if (cache?.has(cacheKey)) {
        return cache.get(cacheKey) || null;
    }
    
    // Create info box entity (expensive operation)
    const infoBoxEntity = createInfoBoxEntity(room, config, hass, mode, cachedEntityIds);
    
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
 * @param mode - Current view mode
 * @param cachedEntityIds - Pre-computed entity IDs (avoids expensive getAllRoomEntityIds call)
 * @returns EntityConfig for info box or null if disabled
 */
function createInfoBoxEntity(room: Room, config: ScalableHousePlanConfig | undefined, hass: HomeAssistant, mode: 'overview' | 'detail', cachedEntityIds?: string[]): EntityConfig | null {
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
    
    // Use cached entity IDs if provided, otherwise fall back to expensive getAllRoomEntityIds call
    const roomEntityIds = cachedEntityIds || getAllRoomEntityIds(hass, room, null);
    
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

