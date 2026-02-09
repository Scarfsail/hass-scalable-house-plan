import { html, TemplateResult } from "lit-element";
import { keyed } from "lit/directives/keyed.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import { DragController } from "../utils/drag-controller";
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

/**
 * Module-level drag controller cache to manage controller lifecycle
 * Key format: "${uniqueKey}-${viewContext}" where viewContext is "editor" or "overview"
 * This ensures each view has its own controller instances
 */
const dragControllers = new Map<string, DragController>();

/**
 * Track which room owns each drag controller.
 * Prevents cross-room cleanup: Room A's render won't destroy Room B's controllers.
 * Key format matches dragControllers
 */
const dragControllerRoomIndex = new Map<string, number>();

/**
 * Track current render's keys per room.
 * Prevents cleanup during rapid successive renders of the same room.
 */
const currentKeysPerRoom = new Map<number, Set<string>>();

/**
 * Track previous render's keys per room+viewId.
 * Used for change detection - only run cleanup when keys actually change.
 * Key format: "${roomIndex}-${viewId}"
 */
const previousKeysPerRoomView = new Map<string, Set<string>>();

/**
 * Event detail for element moved event
 */
export interface ElementMovedEventDetail {
    uniqueKey: string;        // Element's unique key
    roomIndex: number;        // Room containing the element
    entityId: string;         // Entity ID (or empty for no-entity elements)
    deltaXPx: number;         // Pixel delta in X within the elements-container
    deltaYPx: number;         // Pixel delta in Y within the elements-container
    parentGroupKey?: string;  // If child of a group, the group's uniqueKey
    scale: number;            // Current scale factor (for reverse calculation)
    scaleRatio: number;       // Current scaleRatio
    roomBoundsWidth: number;  // Room bounds width (for reverse calculation)
    roomBoundsHeight: number; // Room bounds height (for reverse calculation)
}

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
    viewId?: string;  // Unique identifier for the rendering view (e.g., "main-card", "detail-dialog"). Used to separate controller instances.
    selectedElementKey?: string | null;  // Currently selected element uniqueKey
    onElementClick?: (uniqueKey: string, elementIndex: number, entity: string, parentGroupKey?: string) => void;  // Click callback for element selection
    roomIndex?: number;  // Room index for drag event
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
 * Key format: 
 * - Groups: custom:group-shp-room{roomIndex}-element{elementIndex}
 * - Others: elementType-left-top-right-bottom-room_id-mode (mode only for info boxes)
 */
export function generateElementKey(elementType: string, plan: any, roomIndex?: number, elementIndex?: number): string {
    // Use index-based keys for groups to prevent oscillation after drag
    // Groups have no stable entity ID, and position-based keys cause uniqueKey to change
    // when position updates, triggering controller recreation and position oscillation
    const isGroup = elementType === 'custom:group-shp';
    if (isGroup && roomIndex !== undefined && elementIndex !== undefined) {
        return `${elementType}-room${roomIndex}-element${elementIndex}`;
    }
    
    // Use position-based keys for non-group elements
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
 * Build element structure for a room.
 * 
 * IMPORTANT: This is NOT cached. Caching plan references caused stale positions
 * after drag-drop because the editor creates new plan objects (via spread) on each
 * config update, but stale cached references still pointed to old positions.
 * This operation is cheap (filter/map on small arrays) so caching is unnecessary.
 */
function buildElementStructure(
    allEntities: EntityConfig[],
    hass: HomeAssistant,
    roomIndex?: number
): Array<{ entity: string; plan: any; elementConfig: any; uniqueKey: string }> {
    return allEntities
        .filter((entityConfig: EntityConfig) => {
            if (typeof entityConfig === 'string') return false;
            return !!entityConfig.plan;
        })
        .map((entityConfig: EntityConfig, elementIndex: number) => {
            const entity = typeof entityConfig === 'string' ? entityConfig : entityConfig.entity;
            const plan = typeof entityConfig === 'string' ? undefined : entityConfig.plan;
            
            if (!plan) return null;

            // Validate no-entity elements
            if (!entity && (!plan.element || !plan.element.type)) {
                console.warn('No-entity element missing element.type:', plan);
                return null;
            }

            // Generate unique key (pass roomIndex and elementIndex for groups)
            const uniqueKey = entity || generateElementKey(plan.element?.type || 'unknown', plan, roomIndex, elementIndex);

            // Build element metadata (always fresh to avoid stale elementConfig)
            const metadata = buildElementMetadata(entity, plan, hass);

            return { entity, plan, elementConfig: metadata.elementConfig, uniqueKey };
        })
        .filter((el): el is { entity: string; plan: any; elementConfig: any; uniqueKey: string } => el !== null);
}

/**
 * Build element metadata (always fresh, not cached).
 * 
 * IMPORTANT: Not cached because plan.element can contain mutable data
 * (e.g., group children positions) that changes after drag-drop.
 * These operations are fast (string matching + object spread).
 */
function buildElementMetadata(
    entity: string,
    plan: any,
    hass: HomeAssistant
): ElementMetadata {
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
    
    return {
        defaultElement,
        elementConfig,
        deviceClass
    };
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
    const { hass, room, roomBounds, createCardElement, elementCards, scale, scaleRatio = 0, config, originalRoom, infoBoxCache, cachedInfoBoxEntityIds, elementsClickable = false, houseCache, editorMode = false, viewId = 'default', selectedElementKey, onElementClick, roomIndex = 0 } = options;
    
    // Build a local set for this render's keys (don't touch the global one yet)
    const currentKeys = new Set<string>();
    
    // Extract position cache from HouseCache (only cache kept - self-invalidating via key)
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

    // Build element structure fresh each render
    // NOT cached: plan references go stale after drag-drop position changes
    const elements = buildElementStructure(allEntities, hass, roomIndex);

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
                // Pass through drag-related properties for child drag support
                card.scale = scale;
                card.scaleRatio = scaleRatio;
                card.roomIndex = roomIndex;
                card.roomBounds = roomBounds;
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

        // Drag controller setup (only in editor mode)
        const isDraggable = editorMode && plan;

        // Track this key as active in current render (ALWAYS, not just when creating)
        if (isDraggable) {
            currentKeys.add(uniqueKey);
        }

        // Create view-specific controller key to separate controller instances per render context
        // Use viewId to ensure main card and detail dialog have completely separate controllers
        const controllerKey = `${uniqueKey}-${viewId}`;

        // Get or create drag controller (view-specific)
        if (isDraggable && !dragControllers.has(controllerKey)) {
            const controller = new DragController(
                null as any, // wrapper not needed with direct binding
                uniqueKey,
                {
                    roomIndex,
                    entityId: entity,
                    scale,
                    scaleRatio,
                    roomBoundsWidth: roomBounds.width,
                    roomBoundsHeight: roomBounds.height,
                    isGroupElement: isGroupElementType(elementConfig),
                    originalTransform: positionData.transform
                }
            );
            controller.attach(); // Only attaches document keydown listener
            dragControllers.set(controllerKey, controller);
            dragControllerRoomIndex.set(controllerKey, roomIndex);
        }
        const controller = isDraggable ? dragControllers.get(controllerKey) : undefined;
        
        // Update controller options only if values have changed (performance optimization)
        if (controller) {
            const currentOptions = controller.getOptions();
            const needsUpdate = (
                currentOptions.roomIndex !== roomIndex ||
                currentOptions.entityId !== entity ||
                currentOptions.scale !== scale ||
                currentOptions.scaleRatio !== scaleRatio ||
                currentOptions.roomBoundsWidth !== roomBounds.width ||
                currentOptions.roomBoundsHeight !== roomBounds.height ||
                currentOptions.isGroupElement !== isGroupElementType(elementConfig) ||
                currentOptions.originalTransform !== positionData.transform ||
                currentOptions.parentGroupKey !== elementConfig.group
            );
            
            if (needsUpdate) {
                const updateStart = performance.now();
                controller.updateOptions({
                    roomIndex,
                    entityId: entity,
                    scale,
                    scaleRatio,
                    roomBoundsWidth: roomBounds.width,
                    roomBoundsHeight: roomBounds.height,
                    isGroupElement: isGroupElementType(elementConfig),
                    originalTransform: positionData.transform
                });
                const updateTime = performance.now() - updateStart;
                if (updateTime > 1) {
                    console.log(`[PERF] updateOptions took ${updateTime.toFixed(2)}ms for ${uniqueKey}`);
                }
            }
        }

        // Determine if this element is selected
        const isSelected = uniqueKey === selectedElementKey;

        return keyed(uniqueKey, html`
            <div
                class="element-wrapper ${isSelected ? 'selected-element' : ''}"
                style="${positionData.styleString}; transform: ${positionData.transform}; transform-origin: ${positionData.transformOrigin}; pointer-events: ${elementsClickable || editorMode ? 'auto' : 'none'}; ${editorMode ? 'cursor: pointer;' : ''}"
                data-unique-key="${uniqueKey}"
                @pointerdown=${controller ? (e: PointerEvent) => controller.handlePointerDown(e) : null}
                @pointermove=${controller ? (e: PointerEvent) => controller.handlePointerMove(e) : null}
                @pointerup=${controller ? (e: PointerEvent) => controller.handlePointerUp(e) : null}
                @click=${handleClick}
            >
                ${card}
            </div>
        `);
    });
    
    // Cleanup: Remove controllers for keys that weren't in this render
    // This handles uniqueKey changes when elements are moved (position in key changes)
    // IMPORTANT: Only cleanup idle controllers to prevent interrupting active drags.
    // During synchronous re-render (e.g., from handlePointerUp event), the old controller
    // may still be processing the drag with state='dragging'. Skip it and clean up next render.
    // OPTIMIZATION: Only run cleanup when element keys actually change (not on every render)
    if (editorMode) {
        // Update the global set for this room BEFORE cleanup so concurrent renders see it
        currentKeysPerRoom.set(roomIndex, currentKeys);
        
        // Build view-specific keys for current render
        const currentControllerKeys = new Set<string>();
        currentKeys.forEach(key => currentControllerKeys.add(`${key}-${viewId}`));
        
        // Check if keys changed compared to previous render
        const roomViewKey = `${roomIndex}-${viewId}`;
        const previousKeys = previousKeysPerRoomView.get(roomViewKey);
        
        // Detect if keys changed (elements added/removed/moved)
        const keysChanged = !previousKeys || 
                           previousKeys.size !== currentControllerKeys.size ||
                           ![...currentControllerKeys].every(k => previousKeys.has(k));
        
        if (keysChanged) {
            const controllersToRemove: string[] = [];
            dragControllers.forEach((controller, controllerKey) => {
                const controllerRoom = dragControllerRoomIndex.get(controllerKey);
                const inCurrentKeys = currentControllerKeys.has(controllerKey);
                const state = controller.getState();
                
                // Only clean up controllers belonging to THIS room AND viewId
                // Prevents cross-room and cross-view cleanup
                if (controllerRoom === roomIndex && 
                    !inCurrentKeys && 
                    state === 'idle') {
                    controller.detach();
                    controllersToRemove.push(controllerKey);
                }
            });
            
            controllersToRemove.forEach(controllerKey => {
                dragControllers.delete(controllerKey);
                dragControllerRoomIndex.delete(controllerKey);
            });
            
            // Update previous keys for next render
            previousKeysPerRoomView.set(roomViewKey, new Set(currentControllerKeys));
        } else {
            // No cleanup needed - keys unchanged
            // Still update previousKeys reference (Set may be new instance)
            previousKeysPerRoomView.set(roomViewKey, currentControllerKeys);
        }
    }
    
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
/**
 * Cleanup all drag controllers. Call when editor mode is disabled or component unmounts.
 */
export function cleanupDragControllers(): void {
    dragControllers.forEach(controller => controller.detach());
    dragControllers.clear();
}

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

