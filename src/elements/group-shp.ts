import { html, css, nothing } from "lit"
import { customElement, property, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import { ElementBase, ElementBaseConfig } from "./base";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { EntityConfig } from "../cards/types";
import type { CreateCardElement } from "../utils";
import { getOrCreateElementCard } from "../utils/card-element-cache";
import { getElementTypeForEntity, mergeElementProperties, getDefaultTapAction, getDefaultHoldAction, isEntityActionable, isGroupElementType } from "../utils";
import type { ElementMovedEventDetail } from "../components/element-renderer-shp";
import { generateElementKey } from "../components/element-renderer-shp";

// Drag threshold in pixels before drag activates
const DRAG_THRESHOLD = 5;

// Drag state interface
interface DragState {
    state: 'idle' | 'pending' | 'dragging';
    startX: number;
    startY: number;
    pointerId: number | null;
    originalTransform: string;
}

export interface GroupElementConfig extends ElementBaseConfig {
    children: EntityConfig[];
    width: number;
    height: number;
    show_border?: boolean;
}

/**
 * group-shp element
 * 
 * A container element that holds multiple child entities/elements positioned absolutely within it.
 * The group acts as a single unit that can be positioned via plan configuration.
 * 
 * Key features:
 * - Container with explicit width/height
 * - Children positioned absolutely using their own plan.left/top/right/bottom
 * - Optional border for visual debugging
 * - Passes through hass and other context to children
 */
@customElement("group-shp")
export class GroupElement extends ElementBase<GroupElementConfig> {
    @property({ attribute: false }) public createCardElement?: CreateCardElement | null;
    @property({ attribute: false }) public elementCards?: Map<string, any>;
    @property({ attribute: false }) public mode?: 'overview' | 'detail';
    @property({ attribute: false }) public editorMode?: boolean;
    @property({ attribute: false }) public selectedElementKey?: string;
    @property({ attribute: false }) public onElementClick?: (uniqueKey: string, index: number, entity: string, parentGroupKey?: string) => void;
    @property({ attribute: false }) public groupUniqueKey?: string; // This group's own uniqueKey (for nested selection)
    @property({ attribute: false }) public scale?: number; // Current scale factor (for drag event)
    @property({ attribute: false }) public scaleRatio?: number; // Element scaling ratio (for drag event)
    @property({ attribute: false }) public roomIndex?: number; // Room index (for drag event)
    @property({ attribute: false }) public roomBounds?: { minX: number; minY: number; width: number; height: number }; // Room bounds (for drag event)
    
    // Cache for child element cards
    private _childElementCache = new Map<string, any>();
    
    // Cached filtered children (recomputed only when mode or config changes)
    @state() private _filteredChildren: EntityConfig[] = [];
    
    // Cache for child position styles (cleared when config changes)
    private _positionCache = new Map<string, Record<string, string>>();
    
    // Drag states for each child (persists across re-renders)
    private _dragStates = new Map<string, DragState>();
    
    static override styles = css`
        :host {
            display: block;
            position: relative; /* Ensure :host is a positioning context */
        }

        .group-container {
            position: relative;
            overflow: visible;
            width: 100%;
            height: 100%;
            /* Don't set pointer-events - let children handle their own clicks */
        }

        .group-container.show-border {
            border: 2px dashed orange;
            box-sizing: border-box;
        }

        .child-wrapper {
            position: absolute;
            /* Children handle their own pointer events naturally */
        }
        
        .child-wrapper.selected-element {
            outline: 2px solid #2196F3;
            outline-offset: 2px;
            z-index: 1000;
        }
    `;

    protected override willUpdate(changedProperties: Map<string | number | symbol, unknown>) {
        super.willUpdate(changedProperties);

        // Recompute filtered children only when mode or config changes
        if (changedProperties.has('mode') || changedProperties.has('_config')) {
            const children = this._config?.children || [];
            
            // Filter children based on mode and plan.overview setting
            // In overview mode, only show children with plan.overview !== false
            this._filteredChildren = this.mode === 'overview'
                ? children.filter((childConfig: EntityConfig) => {
                    // String shorthand = detail-only, no overview
                    if (typeof childConfig === 'string') return false;
                    // Only include entities with plan section and overview !== false
                    return childConfig.plan && (childConfig.plan.overview !== false);
                })
                : children;
            
            // Clear position cache when config changes
            if (changedProperties.has('_config')) {
                this._positionCache.clear();
            }
        }
    }

    protected override renderContent() {
        if (!this._config || !this.hass) {
            return nothing;
        }

        const { width = 100, height = 100, show_border = false } = this._config;

        // Validate and sanitize dimensions
        const validWidth = Math.max(1, width);
        const validHeight = Math.max(1, height);

        if (width !== validWidth || height !== validHeight) {
            console.warn('group-shp: Invalid dimensions, using minimum values', { width, height, validWidth, validHeight });
        }

        // Set host dimensions directly for proper positioning context
        this.style.width = `${validWidth}px`;
        this.style.height = `${validHeight}px`;

        return html`
            <div class="group-container ${show_border ? 'show-border' : ''}">
                ${this._filteredChildren.map((childConfig, index) => this._renderChild(childConfig, index))}
            </div>
        `;
    }

    /**
     * Render a single child element
     */
    private _renderChild(childConfig: EntityConfig, index: number) {
        if (!this.hass) return nothing;

        // Extract entity and plan from EntityConfig
        const entity = typeof childConfig === 'string' ? childConfig : childConfig.entity;
        const plan = typeof childConfig === 'string' ? undefined : childConfig.plan;

        // Validate that we have positioning information
        if (!plan) {
            console.warn(`group-shp: Child at index ${index} missing plan configuration`, childConfig);
            return nothing;
        }

        // Validate no-entity elements have a type
        if (!entity && (!plan.element || !plan.element.type)) {
            console.warn(`group-shp: No-entity child at index ${index} missing element.type`, childConfig);
            return nothing;
        }

        // Generate unique key for child (entity ID or generated key)
        // IMPORTANT: Use same key generation as element-renderer-shp for consistency
        // This ensures the editor can find and update the child during drag-drop
        const uniqueKey = entity || generateElementKey(plan.element?.type || 'unknown', plan);

        // Get element type and merged config
        const elementType = this._getElementType(entity, plan);
        const elementConfig = this._buildElementConfig(entity, plan, elementType);

        // Get or create the child element card
        const card = this._getOrCreateChildCard(uniqueKey, entity, elementConfig);
        if (card && this.hass) {
            card.hass = this.hass;
            
            // For nested group-shp elements, pass through mode, createCardElement and elementCards
            if (isGroupElementType(elementConfig)) {
                card.mode = this.mode;
                card.createCardElement = this.createCardElement;
                card.elementCards = this.elementCards;
                // Pass through editor-related properties for nested group selection
                card.editorMode = this.editorMode;
                card.selectedElementKey = this.selectedElementKey;
                card.onElementClick = this.onElementClick;
                card.groupUniqueKey = uniqueKey; // Set nested group's own uniqueKey
                // Pass through drag-related properties for nested child drag support
                card.scale = this.scale;
                card.scaleRatio = this.scaleRatio;
                card.roomIndex = this.roomIndex;
                card.roomBounds = this.roomBounds;
            }
            
            // Disable pointer events on card in editor mode so wrapper catches clicks
            // IMPORTANT: Don't disable pointer events on group-shp cards - they need to handle child clicks!
            if (this.editorMode && !isGroupElementType(elementConfig)) {
                card.style.pointerEvents = 'none';
            } else if (card.style.pointerEvents === 'none') {
                // Re-enable pointer events when not in editor mode
                card.style.pointerEvents = '';
            }
        }

        // Calculate child position styles
        const childStyles = this._calculateChildPosition(plan, uniqueKey);
        
        // Drag state for this child (only in editor mode with plan)
        // Use component-level Map to persist across re-renders
        const isDraggable = this.editorMode && plan;
        if (isDraggable && !this._dragStates.has(uniqueKey)) {
            this._dragStates.set(uniqueKey, {
                state: 'idle',
                startX: 0,
                startY: 0,
                pointerId: null,
                originalTransform: ''
            });
        }
        const dragState = isDraggable ? this._dragStates.get(uniqueKey)! : null;
        
        // Handle element click in editor mode
        // Pass both child's uniqueKey and parent group's uniqueKey for nested selection
        const handleClick = (e: MouseEvent) => {
            if (this.editorMode && this.onElementClick) {
                // Check if click came from a nested child element-wrapper (for multi-level groups)
                const target = e.target as HTMLElement;
                const currentWrapper = e.currentTarget as HTMLElement;
                
                // Find if there's a child-wrapper between target and currentTarget
                let element = target;
                while (element && element !== currentWrapper) {
                    if (element.classList?.contains('child-wrapper') && element !== currentWrapper) {
                        // Click came from a nested child wrapper, ignore it
                        return;
                    }
                    element = element.parentElement as HTMLElement;
                }
                
                e.stopPropagation();
                e.preventDefault();
                // Pass child's uniqueKey, index, entity, AND parent group's uniqueKey
                this.onElementClick(uniqueKey, index, entity || '', this.groupUniqueKey);
            }
        };
        
        // Drag handlers for editor mode
        const handlePointerDown = (e: PointerEvent) => {
            if (!dragState || !this.editorMode || !plan) return;
            
            // Check if click came from a nested child element (for multi-level groups)
            const currentWrapper = e.currentTarget as HTMLElement;
            for (const node of e.composedPath()) {
                if (node === currentWrapper) break;
                if (node instanceof HTMLElement && node.classList?.contains('child-wrapper')) {
                    return;
                }
            }
            
            dragState.startX = e.clientX;
            dragState.startY = e.clientY;
            dragState.state = 'pending';
            dragState.pointerId = e.pointerId;
            dragState.originalTransform = childStyles.transform || '';
            
            const wrapper = e.currentTarget as HTMLElement;
            wrapper.setPointerCapture(e.pointerId);
        };
        
        const handlePointerMove = (e: PointerEvent) => {
            if (!dragState) return;
            if (dragState.state === 'idle') return;
            if (dragState.pointerId !== e.pointerId) return;
            
            let dx = e.clientX - dragState.startX;
            let dy = e.clientY - dragState.startY;
            
            // Check threshold before activating drag
            if (dragState.state === 'pending') {
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < DRAG_THRESHOLD) return;
                
                dragState.state = 'dragging';
            }
            
            // Compensate for parent CSS scale (overview mode) to prevent drift
            // Walk up DOM tree through shadow boundaries to find scaled container
            const wrapper = e.currentTarget as HTMLElement;
            let element: HTMLElement | null = wrapper;
            for (let i = 0; i < 20 && element; i++) {
                const nextElement: HTMLElement | null = element.parentElement;
                if (nextElement) {
                    element = nextElement;
                } else {
                    // Cross shadow DOM boundary
                    const root = element.getRootNode();
                    if (root instanceof ShadowRoot && root.host) {
                        element = root.host as HTMLElement;
                    } else {
                        break;
                    }
                }
                if (!element) break;
                
                const transform = window.getComputedStyle(element).transform;
                if (transform && transform !== 'none') {
                    try {
                        const matrix = new DOMMatrix(transform);
                        const scaleX = matrix.a;
                        const scaleY = matrix.d;
                        if (Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01) {
                            dx = dx / scaleX;
                            dy = dy / scaleY;
                            break;
                        }
                    } catch (e) {
                        // Continue searching
                    }
                }
            }
            
            // Apply translate - prepend so it happens in screen space before element scaling
            const translateTransform = `translate(${dx}px, ${dy}px)`;
            const fullTransform = dragState.originalTransform
                ? `${translateTransform} ${dragState.originalTransform}`
                : translateTransform;
            
            wrapper.style.transform = fullTransform;
            wrapper.style.cursor = 'grabbing';
            
            e.preventDefault();
        };
        
        const handlePointerUp = (e: PointerEvent) => {
            if (!dragState) return;
            if (dragState.pointerId !== e.pointerId) return;
            
            const wrapper = e.currentTarget as HTMLElement;
            wrapper.releasePointerCapture(e.pointerId);
            
            if (dragState.state === 'dragging') {
                // Send RAW screen-space deltas (no CSS scale compensation)
                // The visual drag (handlePointerMove) compensates for CSS scale,
                // but the editor needs raw deltas to calculate config changes correctly
                const dx = e.clientX - dragState.startX;
                const dy = e.clientY - dragState.startY;
                
                // Reset visual transform
                wrapper.style.transform = dragState.originalTransform;
                wrapper.style.cursor = '';
                
                // Dispatch move event with raw screen-space deltas
                const moveEvent = new CustomEvent<ElementMovedEventDetail>('scalable-house-plan-element-moved', {
                    detail: {
                        uniqueKey,
                        roomIndex: this.roomIndex ?? -1,
                        entityId: entity || '',
                        deltaXPx: dx,
                        deltaYPx: dy,
                        scale: this.scale ?? 1,
                        scaleRatio: this.scaleRatio ?? 0,
                        roomBoundsWidth: this.roomBounds?.width ?? 0,
                        roomBoundsHeight: this.roomBounds?.height ?? 0,
                        parentGroupKey: this.groupUniqueKey
                    }
                });
                window.dispatchEvent(moveEvent);
                
                // Prevent click handler from firing
                e.stopPropagation();
                e.preventDefault();
            }
            
            dragState.state = 'idle';
            dragState.pointerId = null;
        };
        
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!dragState) return;
            if (e.key === 'Escape' && dragState.state === 'dragging') {
                const wrapper = document.querySelector(`[data-unique-key="${uniqueKey}"]`) as HTMLElement;
                if (wrapper) {
                    wrapper.style.transform = dragState.originalTransform;
                    wrapper.style.cursor = '';
                    if (dragState.pointerId !== null) {
                        wrapper.releasePointerCapture(dragState.pointerId);
                    }
                }
                dragState.state = 'idle';
                dragState.pointerId = null;
            }
        };
        
        // Register escape handler only for draggable children
        if (isDraggable) {
            document.addEventListener('keydown', handleKeyDown);
        }
        
        // Determine if this child element is selected
        const isSelected = uniqueKey === this.selectedElementKey;

        return html`
            <div 
                class="child-wrapper ${isSelected ? 'selected-element' : ''}"
                style=${styleMap(childStyles)}
                data-unique-key="${uniqueKey}"
                @click=${handleClick}
                @pointerdown=${isDraggable ? handlePointerDown : null}
                @pointermove=${isDraggable ? handlePointerMove : null}
                @pointerup=${isDraggable ? handlePointerUp : null}
            >
                ${card}
            </div>
        `;
    }

    /**
     * Get element type for entity or from plan
     */
    private _getElementType(entity: string, plan: any): any {
        if (entity) {
            // Entity-based element
            const deviceClass = this.hass?.states[entity]?.attributes?.device_class;
            return getElementTypeForEntity(entity, deviceClass, 'plan');
        } else {
            // No-entity element - type specified in plan
            return { type: plan.element.type };
        }
    }

    /**
     * Build merged element configuration
     */
    private _buildElementConfig(entity: string, plan: any, elementType: any): any {
        // Merge default properties with user overrides
        const elementConfig = mergeElementProperties(elementType, plan.element || {});

        // CRITICAL: Remove positioning properties from elementConfig before passing to child element.
        // 
        // WHY: Positioning is handled by the child-wrapper div, NOT by the child element itself.
        // If we don't remove these, the child element will try to position itself relative to the
        // room (inherited behavior), resulting in incorrect double-offset placement.
        // 
        // EXAMPLE: If child has left:10 and wrapper has left:20, without this deletion the child
        // would render at left:30 (20 from wrapper + 10 from element) instead of left:20.
        delete elementConfig.left;
        delete elementConfig.top;
        delete elementConfig.right;
        delete elementConfig.bottom;
        delete elementConfig.width;
        delete elementConfig.height;

        // Add default tap_action and hold_action for entities (if not already set by user)
        if (entity && this.hass && isEntityActionable(entity, this.hass)) {
            if (!elementConfig.tap_action) {
                elementConfig.tap_action = getDefaultTapAction(entity, this.hass);
            }
            if (!elementConfig.hold_action) {
                elementConfig.hold_action = getDefaultHoldAction();
            }
        }

        return elementConfig;
    }

    /**
     * Get or create child element card
     */
    private _getOrCreateChildCard(uniqueKey: string, entity: string, elementConfig: any): any {
        const elementCards = this.elementCards || this._childElementCache;
        return getOrCreateElementCard(
            uniqueKey,
            entity,
            elementConfig,
            this.createCardElement || null,
            elementCards
        );
    }

    /**
     * Calculate child position styles from plan configuration
     * Supports left/top, right/bottom positioning
     * Cached to avoid recreating style objects on every render
     */
    private _calculateChildPosition(plan: any, cacheKey: string): Record<string, string> {
        // Check cache first
        const cached = this._positionCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const styles: Record<string, string> = {
            position: 'absolute'
        };

        // Handle horizontal positioning (using pixels, not percentages)
        if (plan.left !== undefined) {
            styles.left = `${plan.left}px`;
        }
        if (plan.right !== undefined) {
            styles.right = `${plan.right}px`;
        }

        // Handle vertical positioning (using pixels, not percentages)
        if (plan.top !== undefined) {
            styles.top = `${plan.top}px`;
        }
        if (plan.bottom !== undefined) {
            styles.bottom = `${plan.bottom}px`;
        }

        // Add width/height if specified
        if (plan.width !== undefined) {
            styles.width = `${plan.width}px`;
        }
        if (plan.height !== undefined) {
            styles.height = `${plan.height}px`;
        }

        // Apply custom styles from plan (object format only)
        if (plan.style && typeof plan.style === 'object') {
            Object.assign(styles, plan.style);
        }

        // Cache the computed styles
        this._positionCache.set(cacheKey, styles);

        return styles;
    }
}
