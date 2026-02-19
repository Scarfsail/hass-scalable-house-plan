import { html, TemplateResult } from "lit-element";
import { keyed } from "lit/directives/keyed.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import { DragController } from "../utils/drag-controller";
import type { Room, EntityConfig, PositionScalingMode, ElementDefaultConfig } from "../cards/types";
import type { HouseCache } from "../cards/scalable-house-plan";
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
    originalRoom?: Room;  // Optional: original room with all entities (for info box in overview mode)
    elementDefaults?: ElementDefaultConfig[];  // House-level element defaults (for three-tier merge)
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
 * - Others: elementType-room{roomIndex}-left-top-right-bottom
 *
 * roomIndex is included so elements of the same type at the same position
 * in different rooms don't share a key (e.g., two info-boxes at left:0,top:0).
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
    const room = roomIndex !== undefined ? `-room${roomIndex}` : '';

    return `${elementType}${room}-${left}-${top}-${right}-${bottom}`;
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
    roomIndex?: number,
    elementDefaults?: ElementDefaultConfig[]
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
            const metadata = buildElementMetadata(entity, plan, hass, elementDefaults);

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
    hass: HomeAssistant,
    elementDefaults?: ElementDefaultConfig[]
): ElementMetadata {
    const deviceClass = entity && hass?.states[entity]?.attributes?.device_class;
    const defaultElement = entity
        ? getElementTypeForEntity(entity, deviceClass, 'plan')
        : { type: plan.element!.type as string };

    // Resolve the element type (user-specified or auto-detected)
    const resolvedType = plan.element?.type || defaultElement.type;

    // Three-tier merge: tier1 (element_defaults) < tier2 (auto-mapped) < tier3 (user plan)
    let elementConfig: any;
    if (elementDefaults?.length) {
        const matching = elementDefaults.find(d => d.element?.type === resolvedType);
        if (matching) {
            // Extract element properties from defaults, excluding 'type' (used only for matching)
            const { type: _t, ...defaultsElementProps } = matching.element;

            if (plan.element?.type) {
                // User specified explicit type → skip tier 2 (auto-mapping)
                // Merge: tier1 (defaults) + tier3 (user)  — tier3 wins per-key
                elementConfig = { ...defaultsElementProps, ...plan.element };
            } else {
                // Auto-detected type → all three tiers
                // Merge: tier1 < tier2 < tier3
                elementConfig = { ...defaultsElementProps, ...defaultElement, ...(plan.element || {}) };
            }
        } else {
            elementConfig = mergeElementProperties(defaultElement, plan.element || {});
        }
    } else {
        elementConfig = mergeElementProperties(defaultElement, plan.element || {});
    }

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
    
    // Build style string
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
 * Get or create cached position data for an element
 * Shared helper to avoid duplication between render paths
 */
function preparePositionData(
    uniqueKey: string,
    plan: any,
    scale: number,
    scaleRatio: number,
    boundsKey: string,
    roomBounds: { width: number; height: number },
    elementScale: number,
    posCache: Map<string, any>
): PositionCache {
    const positionCacheKey = getPositionCacheKey(uniqueKey, scale, scaleRatio, boundsKey, plan);
    let positionData = posCache.get(positionCacheKey);
    
    if (!positionData) {
        // Cache miss - calculate and store
        positionData = calculatePositionStyles(plan, scale, scaleRatio, roomBounds, elementScale);
        posCache.set(positionCacheKey, positionData);
    }
    
    return positionData;
}

/**
 * Get or create element card and set up basic properties
 * Shared helper to avoid duplication between render paths
 */
function prepareElementCard(
    uniqueKey: string,
    entity: string,
    elementConfig: any,
    hass: HomeAssistant,
    createCardElement: CreateCardElement | null,
    elementCards: Map<string, any>,
    mode: 'overview' | 'detail'
): any {
    const card = getOrCreateElementCard(uniqueKey, entity, elementConfig, createCardElement, elementCards);
    
    if (card && hass) {
        card.hass = hass;

        // For group-shp elements, pass through mode, createCardElement and elementCards
        if (isGroupElementType(elementConfig)) {
            card.mode = mode;
            card.createCardElement = createCardElement;
            card.elementCards = elementCards;
        }
    }
    
    return card;
}

/**
 * Renders elements optimized for normal (non-editor) view
 * Zero editor overhead: no drag controllers, no selection, no click handlers
 * 
 * @param options - Configuration for rendering elements
 * @param elements - Pre-built element structure
 * @param posCache - Position cache from HouseCache
 * @param boundsKey - Room bounds cache key
 * @param elementScale - Calculated element scale factor
 * @param mode - Current view mode ('overview' | 'detail')
 * @returns Array of rendered Lit templates
 */
function renderReadOnlyElements(
    options: ElementRendererOptions,
    elements: Array<{ entity: string; plan: any; elementConfig: any; uniqueKey: string }>,
    posCache: Map<string, any>,
    boundsKey: string,
    elementScale: number,
    mode: 'overview' | 'detail'
): unknown[] {
    const { hass, roomBounds, createCardElement, elementCards, scale = 1, scaleRatio = 0, elementsClickable } = options;

    return elements.map(({ entity, plan, elementConfig, uniqueKey }) => {
        // Get or create cached position styles (shared helper)
        const positionData = preparePositionData(uniqueKey, plan, scale, scaleRatio, boundsKey, roomBounds, elementScale, posCache);

        // Get or create the element card (shared helper)
        const card = prepareElementCard(uniqueKey, entity, elementConfig, hass, createCardElement, elementCards, mode);

        // Simple read-only template - minimal overhead
        return keyed(uniqueKey, html`
            <div
                class="element-wrapper"
                style="${positionData.styleString}; transform: ${positionData.transform}; transform-origin: ${positionData.transformOrigin}; pointer-events: ${elementsClickable ? 'auto' : 'none'};"
                data-unique-key="${uniqueKey}"
            >
                ${card}
            </div>
        `);
    });
}

/**
 * Configure editor-specific properties for card elements
 * Sets properties needed for nested editing (editorMode, selection, etc.)
 * 
 * @param card - The card element to configure
 * @param elementConfig - Element configuration
 * @param options - Editor-specific options
 */
function setupEditorCardProperties(
    card: any,
    elementConfig: any,
    options: {
        selectedElementKey?: string;
        onElementClick?: (key: string, index: number, entity: string, parentKey?: string) => void;
        uniqueKey: string;
        scale: number;
        scaleRatio: number;
        roomIndex: number;
        roomBounds: { width: number; height: number };
    }
): void {
    if (!card) return;
    
    // Pass editor properties to nested group elements
    if (isGroupElementType(elementConfig)) {
        card.editorMode = true;
        card.selectedElementKey = options.selectedElementKey;
        card.onElementClick = options.onElementClick;
        card.groupUniqueKey = options.uniqueKey;
        card.scale = options.scale;
        card.scaleRatio = options.scaleRatio;
        card.roomIndex = options.roomIndex;
        card.roomBounds = options.roomBounds;
    }
    
    // Disable pointer events on non-group cards so wrapper catches clicks
    if (!isGroupElementType(elementConfig)) {
        card.style.pointerEvents = 'none';
    }
}

/**
 * Create click handler for element selection with nested group support
 * Prevents click handling when click originates from nested wrapper
 * 
 * @param uniqueKey - Element's unique key
 * @param elements - Array of all elements
 * @param onElementClick - Callback for element click
 * @returns Click handler function
 */
function createElementClickHandler(
    uniqueKey: string,
    elements: Array<{ entity: string; plan: any; uniqueKey: string }>,
    onElementClick?: (key: string, index: number, entity: string, parentKey?: string) => void
): ((e: MouseEvent) => void) | undefined {
    if (!onElementClick) return undefined;
    
    // Capture in local variable for TypeScript type narrowing
    const callback = onElementClick;
    
    return (e: MouseEvent) => {
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
        callback(uniqueKey, elementIndex, elementData?.entity || '');
    };
}

/**
 * Setup or update drag controller for an element
 * Handles controller lifecycle, updates, and performance tracking
 * 
 * @param uniqueKey - Element's unique key
 * @param isDraggable - Whether element can be dragged
 * @param options - Configuration for drag controller
 * @param currentKeys - Set to track active keys
 * @param viewId - View identifier for controller separation
 * @returns Drag controller instance if draggable, undefined otherwise
 */
function setupDragController(
    uniqueKey: string,
    isDraggable: boolean,
    options: {
        roomIndex: number;
        entity: string;
        scale: number;
        scaleRatio: number;
        roomBounds: { width: number; height: number };
        elementConfig: any;
        positionTransform: string;
    },
    currentKeys: Set<string>,
    viewId: string = 'default'
): DragController | undefined {
    if (!isDraggable) return undefined;
    
    // Track this key as active in current render
    currentKeys.add(uniqueKey);
    
    // Create view-specific controller key to separate controller instances per render context
    // Use viewId to ensure main card and detail dialog have completely separate controllers
    const controllerKey = `${uniqueKey}-${viewId}`;
    
    // Get or create drag controller (view-specific)
    if (!dragControllers.has(controllerKey)) {
        const controller = new DragController(
            null as any, // wrapper not needed with direct binding
            uniqueKey,
            {
                roomIndex: options.roomIndex,
                entityId: options.entity,
                scale: options.scale,
                scaleRatio: options.scaleRatio,
                roomBoundsWidth: options.roomBounds.width,
                roomBoundsHeight: options.roomBounds.height,
                isGroupElement: isGroupElementType(options.elementConfig),
                originalTransform: options.positionTransform
            }
        );
        controller.attach(); // Only attaches document keydown listener
        dragControllers.set(controllerKey, controller);
        dragControllerRoomIndex.set(controllerKey, options.roomIndex);
    }
    
    const controller = dragControllers.get(controllerKey);
    
    // Update controller options only if values have changed (performance optimization)
    if (controller) {
        const currentOptions = controller.getOptions();
        const needsUpdate = (
            currentOptions.roomIndex !== options.roomIndex ||
            currentOptions.entityId !== options.entity ||
            currentOptions.scale !== options.scale ||
            currentOptions.scaleRatio !== options.scaleRatio ||
            currentOptions.roomBoundsWidth !== options.roomBounds.width ||
            currentOptions.roomBoundsHeight !== options.roomBounds.height ||
            currentOptions.isGroupElement !== isGroupElementType(options.elementConfig) ||
            currentOptions.originalTransform !== options.positionTransform ||
            currentOptions.parentGroupKey !== options.elementConfig.group
        );
        
        if (needsUpdate) {
            const updateStart = performance.now();
            controller.updateOptions({
                roomIndex: options.roomIndex,
                entityId: options.entity,
                scale: options.scale,
                scaleRatio: options.scaleRatio,
                roomBoundsWidth: options.roomBounds.width,
                roomBoundsHeight: options.roomBounds.height,
                isGroupElement: isGroupElementType(options.elementConfig),
                originalTransform: options.positionTransform
            });
            const updateTime = performance.now() - updateStart;
            if (updateTime > 1) {
                console.log(`[PERF] updateOptions took ${updateTime.toFixed(2)}ms for ${uniqueKey}`);
            }
        }
    }
    
    return controller;
}

/**
 * Renders elements with full editor capabilities
 * Includes drag controllers, selection highlighting, click handlers
 * 
 * @param options - Configuration for rendering elements
 * @param elements - Pre-built element structure
 * @param posCache - Position cache from HouseCache
 * @param boundsKey - Room bounds cache key
 * @param elementScale - Calculated element scale factor
 * @param mode - Current view mode ('overview' | 'detail')
 * @param currentKeys - Set to track active element keys for cleanup
 * @returns Array of rendered Lit templates
 */
function renderEditableElements(
    options: ElementRendererOptions,
    elements: Array<{ entity: string; plan: any; elementConfig: any; uniqueKey: string }>,
    posCache: Map<string, any>,
    boundsKey: string,
    elementScale: number,
    mode: 'overview' | 'detail',
    currentKeys: Set<string>
): unknown[] {
    const { hass, roomBounds, createCardElement, elementCards, scale = 1, scaleRatio = 0, viewId = 'default', selectedElementKey, onElementClick, roomIndex = 0 } = options;

    return elements.map(({ entity, plan, elementConfig, uniqueKey }) => {
        // Get or create cached position styles (shared helper)
        const positionData = preparePositionData(uniqueKey, plan, scale, scaleRatio, boundsKey, roomBounds, elementScale, posCache);

        // Get or create the element card (shared helper)
        const card = prepareElementCard(uniqueKey, entity, elementConfig, hass, createCardElement, elementCards, mode);

        // Setup editor-specific card properties (group elements only)
        setupEditorCardProperties(card, elementConfig, {
            selectedElementKey: selectedElementKey ?? undefined,
            onElementClick,
            uniqueKey,
            scale,
            scaleRatio,
            roomIndex,
            roomBounds
        });

        // Create click handler with nested group support
        const handleClick = createElementClickHandler(uniqueKey, elements, onElementClick);

        // Setup drag controller for draggable elements
        const isDraggable = !!plan;
        const controller = setupDragController(
            uniqueKey,
            isDraggable,
            {
                roomIndex,
                entity,
                scale,
                scaleRatio,
                roomBounds,
                elementConfig,
                positionTransform: positionData.transform
            },
            currentKeys,
            viewId
        );

        // Determine if this element is selected
        const isSelected = uniqueKey === selectedElementKey;

        return keyed(uniqueKey, html`
            <div
                class="element-wrapper ${isSelected ? 'selected-element' : ''}"
                style="${positionData.styleString}; transform: ${positionData.transform}; transform-origin: ${positionData.transformOrigin}; pointer-events: auto; cursor: pointer;"
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
}

/**
 * Renders elements for a room
 * Routes to optimized read-only or full-featured editor path based on editorMode
 * 
 * Element scaling is based on scaleRatio: elementScale = 1 + (planScale - 1) * scaleRatio
 * - scaleRatio = 0: elements keep original size (no scaling)
 * - scaleRatio = 1: elements scale fully with plan
 * - scaleRatio = 0.25 (default): elements scale 25% of plan scaling
 */
export function renderElements(options: ElementRendererOptions): unknown[] {
    const { hass, room, roomBounds, scale, scaleRatio = 0, originalRoom, elementDefaults, houseCache, editorMode = false, roomIndex = 0 } = options;

    // Extract position cache from HouseCache (only cache kept - self-invalidating via key)
    const posCache = houseCache.position;

    // Calculate element scale: 1 + (planScale - 1) * scaleRatio
    // When scale=5, ratio=0.5: elementScale = 1 + 4*0.5 = 3
    // When scale=5, ratio=0: elementScale = 1 (no scaling)
    // When scale=5, ratio=1: elementScale = 5 (full scaling)
    const elementScale = 1 + (scale - 1) * scaleRatio;

    // Generate bounds key for position cache
    const boundsKey = getBoundsKey(roomBounds);

    const isOverview = !!originalRoom;
    const mode: 'overview' | 'detail' = isOverview ? 'overview' : 'detail';
    const roomForInfoBox = originalRoom || room;

    // Build element structure fresh each render
    // NOT cached: plan references go stale after drag-drop position changes
    const elements = buildElementStructure(room.entities || [], hass, roomIndex, elementDefaults);

    // Auto-inject runtime properties for info-box elements.
    // These cannot be user-configured because they are computed at render time.
    for (const el of elements) {
        if (el.elementConfig?.type === 'custom:info-box-shp') {
            el.elementConfig.room_entities = getAllRoomEntityIds(hass, roomForInfoBox, null);
            el.elementConfig.mode = mode;
            // Compute mode-specific show_background from user config properties
            const showBgOverview = el.elementConfig.show_background_overview ?? true;
            const showBgDetail = el.elementConfig.show_background_detail ?? true;
            el.elementConfig.show_background = mode === 'overview' ? showBgOverview : showBgDetail;
        }
    }

    // Route to appropriate render path based on editor mode
    // Normal view: Zero editor overhead (no drag, no selection, no click handlers)
    // Editor view: Full features (drag controllers, selection, click handling, cleanup)
    if (!editorMode) {
        return renderReadOnlyElements(options, elements, posCache, boundsKey, elementScale, mode);
    }

    // Editor mode: Build tracking set for controller cleanup
    const currentKeys = new Set<string>();
    const renderedElements = renderEditableElements(options, elements, posCache, boundsKey, elementScale, mode, currentKeys);
    
    // Cleanup: Remove controllers for keys that weren't in this render
    // This handles uniqueKey changes when elements are moved (position in key changes)
    // IMPORTANT: Only cleanup idle controllers to prevent interrupting active drags.
    // During synchronous re-render (e.g., from handlePointerUp event), the old controller
    // may still be processing the drag with state='dragging'. Skip it and clean up next render.
    // OPTIMIZATION: Only run cleanup when element keys actually change (not on every render)
    const viewId = options.viewId || 'default';
    
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
 * Cleanup all drag controllers. Call when editor mode is disabled or component unmounts.
 */
export function cleanupDragControllers(): void {
    dragControllers.forEach(controller => controller.detach());
    dragControllers.clear();
}

