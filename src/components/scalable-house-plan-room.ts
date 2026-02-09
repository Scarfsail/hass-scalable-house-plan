import { LitElement, html, svg, css, TemplateResult } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import { actionHandler, type ActionHandlerEvent } from "../utils/action-handler";
import type { Room, EntityConfig, RoomEntityCache } from "../cards/types";
import type { ScalableHousePlanConfig, HouseCache } from "../cards/scalable-house-plan";
import { CreateCardElement, getRoomEntities } from "../utils";
import { renderElements, getRoomBounds } from "./element-renderer-shp";
import { 
    createGradientDefinition, 
    calculatePolygonCenter,
    adjustOpacity,
    type DynamicColorResult,
    type GradientDefinition,
    type CachedEntityIds,
    calculateDynamicRoomColor
} from "../utils/room-color-helpers";

/**
 * Type definitions for scale values
 */
type ScaleUniform = number;
type ScaleNonUniform = { scaleX: number; scaleY: number };
type Scale = ScaleUniform | ScaleNonUniform;

/**
 * Type guard to check if scale is non-uniform (has scaleX/scaleY)
 */
function isNonUniformScale(scale: Scale): scale is ScaleNonUniform {
    return typeof scale === 'object' && 'scaleX' in scale && 'scaleY' in scale;
}

/**
 * Type guard to check if scale is uniform (single number)
 */
function isUniformScale(scale: Scale): scale is ScaleUniform {
    return typeof scale === 'number';
}

/**
 * Room component - renders a single room in either overview or detail mode
 * 
 * Handles:
 * - Room boundary polygon rendering
 * - Element positioning and rendering
 * - Mode-specific scaling and interactions
 */
@customElement("scalable-house-plan-room")
export class ScalableHousePlanRoom extends LitElement {
    @property({ attribute: false }) public mode!: 'overview' | 'detail';
    @property({ attribute: false }) public room!: Room;
    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public config!: ScalableHousePlanConfig;
    @property({ attribute: false }) public scale!: { scaleX: number; scaleY: number } | number;
    @property({ attribute: false }) public createCardElement!: CreateCardElement | null;
    @property({ attribute: false }) public elementCards!: Map<string, any>;
    @property({ attribute: false }) public showRoomBackgrounds?: boolean;
    @property({ attribute: false }) public onClick?: (room: Room) => void;
    @property({ attribute: false }) public cachedEntityIds?: RoomEntityCache;  // Pre-computed entity IDs from parent
    @property({ attribute: false }) public houseCache!: HouseCache;
    @property({ type: Boolean }) public editorMode = false;
    @property({ attribute: false }) public selectedElementKey?: string | null;
    @property({ type: Number }) public roomIndex?: number;
    @property({ type: String }) public viewId?: string;  // Unique identifier for this render context (e.g., "main-card", "detail-dialog")

    // Constants
    private static readonly DEFAULT_ROOM_COLOR = 'rgba(128, 128, 128, 0.2)';

    // Cached computed values for performance
    private _cachedRoomBounds?: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
    private _cachedRelativePoints?: string;
    private _cachedOverviewRoom?: Room;
    private _cachedClipId?: string;  // Clip path ID for detail mode
    private _infoBoxCache: Map<string, any> = new Map();  // Cache for info box entity config
    
    // Cached entity IDs (computed once when room changes, used with fresh hass.states lookups)
    private _cachedEntityIds?: {
        all: string[];              // All entity IDs (explicit + area entities)
        motionSensors: string[];    // Motion sensor entity IDs
        ambientLights: string[];    // Ambient light entity IDs
        lights: string[];           // Light entity IDs
        occupancySensors: string[]; // Occupancy sensor entity IDs
    };

    // Dynamic color state
    @state() private _currentColor?: DynamicColorResult;
    @state() private _currentGradient?: GradientDefinition;
    @state() private _currentGradientInverted?: GradientDefinition;
    @state() private _hasMotion: boolean = false;
    @state() private _activeLightColor?: string;  // Color from actual light entity when both light and motion are active

    willUpdate(changedProperties: Map<string | number | symbol, unknown>) {
        super.willUpdate(changedProperties);
        
        // Recalculate cached values when room changes
        if (changedProperties.has('room')) {
            this._cachedRoomBounds = getRoomBounds(this.room);
            
            // Calculate relative polygon points (for overview mode)
            this._cachedRelativePoints = this.room.boundary
                .map(p => `${p[0] - this._cachedRoomBounds!.minX},${p[1] - this._cachedRoomBounds!.minY}`)
                .join(' ');
            
            // Pre-compute clip path ID for detail mode
            this._cachedClipId = `room-clip-${this.room.name.replace(/\s+/g, '-')}-detail`;
            
            // Filter entities for overview mode
            this._cachedOverviewRoom = {
                ...this.room,
                entities: (this.room.entities || []).filter((entityConfig: EntityConfig) => {
                    // String shorthand = detail-only, no overview
                    if (typeof entityConfig === 'string') return false;
                    // Only include entities with plan section and overview !== false
                    return entityConfig.plan && (entityConfig.plan.overview !== false);
                })
            };
            
            // Only compute entity IDs if not provided by parent (backward compatibility)
            // Parent cache is preferred as it's computed once for all rooms
            if (!this.cachedEntityIds) {
                this._computeEntityIdCache();
            }
        }
        
        // Update cached entity IDs when parent provides new cache
        if (changedProperties.has('cachedEntityIds') && this.cachedEntityIds) {
            this._cachedEntityIds = {
                all: this.cachedEntityIds.allEntityIds,
                motionSensors: this.cachedEntityIds.motionSensorIds,
                ambientLights: this.cachedEntityIds.ambientLightIds || [],
                lights: this.cachedEntityIds.lightIds,
                occupancySensors: this.cachedEntityIds.occupancySensorIds
            };
        }
        
        // Update dynamic colors when hass changes
        if (changedProperties.has('hass')) {
            this._updateDynamicColor();
        }
    }

    static get styles() {
        return css`
            :host {
                display: block;
            }

            .room-container {
                position: relative;
                pointer-events: none;  /* Container is transparent, only children with pointer-events will respond */
            }

            .elements-container {
                position: absolute;
                top: 0;
                left: 0;
                pointer-events: none;
                isolation: isolate;
                transform: translateZ(0);
                -webkit-transform: translateZ(0);
                backface-visibility: hidden;
                -webkit-backface-visibility: hidden;
            }

            .element-wrapper {
                position: absolute;
            }

            /* Interactive Editor Mode - Selected Element Styles */
            .selected-element {
                outline: 3px solid var(--primary-color) !important;
                outline-offset: 2px;
                border-radius: 4px;
                transition: outline 0.2s ease;
                z-index: 1000;
                position: relative;
            }

            .selected-element::after {
                content: '';
                position: absolute;
                inset: -2px;
                border-radius: 4px;
                background: var(--primary-color);
                opacity: 0.1;
                pointer-events: none;
            }

            .room-polygon {
                pointer-events: fill;  /* Only the filled polygon responds to pointer events */
            }

            .room-polygon.no-pointer-events {
                pointer-events: none;  /* Disable pointer events when elements are clickable */
            }

            .room-polygon.overview:hover:not(.motion-normal):not(.motion-inverted) {
                opacity: 1.3;
                filter: brightness(1.2);
            }

            .room-polygon.motion-normal {
                animation: pulse-normal 3s ease-in-out infinite;
            }

            .room-polygon.motion-inverted {
                animation: pulse-inverted 3s ease-in-out infinite;
            }

            @keyframes pulse-normal {
                0%, 100% {
                    opacity: 1;
                }
                50% {
                    opacity: 0;
                }
            }

            @keyframes pulse-inverted {
                0%, 100% {
                    opacity: 0;
                }
                50% {
                    opacity: 1;
                }
            }

            .room-svg {
                pointer-events: none;  /* SVG container is transparent to pointer events */
                backface-visibility: hidden;  /* Stabilize GPU rendering */
                -webkit-backface-visibility: hidden;
                transform: translateZ(0);  /* Force GPU compositing layer to prevent artifacts */
                -webkit-transform: translateZ(0);
            }
        `;
    }
 
    /**
     * Compute and cache entity IDs when room configuration changes
     * This expensive operation (getAreaEntities, filtering) runs once per room config
     * Then we use the cached IDs to look up fresh states from hass.states on each render
     */
    private _computeEntityIdCache(): void {
        if (!this.hass) return;
        
        // Get all entity configs (this is expensive - called once per room)
        const allEntityConfigs = getRoomEntities(this.hass, this.room, null, true);
        
        // Extract entity IDs and categorize them
        const allIds: string[] = [];
        const motionSensorIds: string[] = [];
        const ambientLightIds: string[] = [];
        const lightIds: string[] = [];
        const occupancySensorIds: string[] = [];
        
        for (const entityConfig of allEntityConfigs) {
            // Skip excluded entities
            if (typeof entityConfig !== 'string' && entityConfig.plan?.disable_dynamic_color) {
                continue;
            }
            
            const entityId = typeof entityConfig === 'string' ? entityConfig : entityConfig.entity;
            if (!entityId) continue;
            
            allIds.push(entityId);
            
            const domain = entityId.split('.')[0];
            
            // Categorize by domain and device class
            if (domain === 'light') {
                // Check if entity is configured as ambient light via plan.light
                const lightType = typeof entityConfig !== 'string' ? entityConfig.plan?.light : undefined;
                
                if (lightType === 'ambient') {
                    ambientLightIds.push(entityId);
                } else {
                    // Default to normal light if not specified or explicitly 'normal'
                    lightIds.push(entityId);
                }
            } else if (domain === 'binary_sensor') {
                const deviceClass = this.hass.states[entityId]?.attributes?.device_class;
                if (deviceClass === 'motion') {
                    motionSensorIds.push(entityId);
                } else if (deviceClass === 'occupancy') {
                    occupancySensorIds.push(entityId);
                }
            }
        }
        
        this._cachedEntityIds = {
            all: allIds,
            motionSensors: motionSensorIds,
            ambientLights: ambientLightIds,
            lights: lightIds,
            occupancySensors: occupancySensorIds
        };
    }


    /**
     * Update dynamic room color based on current entity states
     */
    private _updateDynamicColor(): void {
        if (!this.hass || !this.room || !this._cachedRoomBounds || !this._cachedEntityIds) return;
        
        // Calculate color using cached entity IDs and timestamp-based delay checking
        this._currentColor = calculateDynamicRoomColor(
            this.hass,
            this.room,
            this.config,
            this._cachedEntityIds
        );
        
        // Track motion detection state for animation
        this._hasMotion = this._currentColor.type === 'motion';
        
        // Check if both motion and lights are active to use configured light color for motion layer
        this._activeLightColor = undefined;
        if (this._hasMotion && this._currentColor.activeTypes.includes('lights')) {
            // Use the configured light color (the same color shown when only light is active)
            this._activeLightColor = this.config?.dynamic_colors?.lights || 'rgba(255, 245, 170, 0.17)';
        }
        
        // Create gradient if not transparent
        if (this._currentColor.type !== 'transparent') {
            const center = calculatePolygonCenter(this.room.boundary);
            const gradientId = `gradient-${this.room.name.replace(/\s+/g, '-')}-${this.mode}`;
            const gradientIdInverted = `gradient-inv-${this.room.name.replace(/\s+/g, '-')}-${this.mode}`;
            
            this._currentGradient = createGradientDefinition(
                this._currentColor.color,
                gradientId,
                center.x,
                center.y,
                this._cachedRoomBounds
            );
            
            // Create inverted gradient (dark center, bright edges) for motion animation
            if (this._hasMotion) {
                const cx = ((center.x - this._cachedRoomBounds.minX) / this._cachedRoomBounds.width * 100).toFixed(1);
                const cy = ((center.y - this._cachedRoomBounds.minY) / this._cachedRoomBounds.height * 100).toFixed(1);
                
                // Use light color if both motion and light are active, otherwise use motion color
                const colorForInverted = this._activeLightColor || this._currentColor.color;
                
                // Inverted: Center is dark (0.05), outer is bright (0.2)
                const innerColor = adjustOpacity(colorForInverted, 0.05);
                const outerColor = adjustOpacity(colorForInverted, 0.2);
                
                this._currentGradientInverted = {
                    id: gradientIdInverted,
                    cx: `${cx}%`,
                    cy: `${cy}%`,
                    innerColor,
                    outerColor
                };
            } else {
                this._currentGradientInverted = undefined;
            }
        } else {
            this._currentGradient = undefined;
            this._currentGradientInverted = undefined;
        }
    }

    /**
     * Calculate room fill and stroke colors based on mode and settings
     * 
     * Priority logic:
     * 1. Dynamic colors (motion/lights): gradient from _currentColor (if not transparent type)
     * 2. Fallback: room.color or default based on mode
     * 
     * Note: Hover effect is handled by CSS opacity/brightness
     * 
     * @returns Object with fillColor, strokeColor, and useGradient flag
     */
    private _getRoomColors(): { fillColor: string; strokeColor: string; useGradient: boolean; gradientId?: string } {
        const roomColor = this.room.color || ScalableHousePlanRoom.DEFAULT_ROOM_COLOR;
        
        // Dynamic colors: use gradient if motion/lights/default (not transparent type)
        // This handles cases where motion sensors are active or lights are on
        if (this._currentColor && this._currentColor.type !== 'transparent' && this._currentGradient) {
            return {
                fillColor: `url(#${this._currentGradient.id})`,
                strokeColor: 'rgba(0, 0, 0, 0.1)',
                useGradient: true,
                gradientId: this._currentGradient.id
            };
        }
        
        // Fallback: static room color or transparent based on mode and settings
        if (this.mode === 'detail') {
            // Detail mode: always show static room background with more opacity
            const detailColor = this.room.color || 'rgba(128, 128, 128, 0.8)';  // More opaque default for detail
            return {
                fillColor: detailColor,
                strokeColor: detailColor.replace(/[\d.]+\)$/, '0.4)'),
                useGradient: false
            };
        } else {
            // Overview mode: respect showRoomBackgrounds setting
            const showBackgrounds = this.showRoomBackgrounds ?? false;
            return {
                fillColor: showBackgrounds ? roomColor : 'transparent',
                strokeColor: showBackgrounds ? 'rgba(0, 0, 0, 0.3)' : 'transparent',
                useGradient: false
            };
        }
    }

    render() {
        if (this.mode === 'overview') {
            return this._renderOverview();
        } else {
            return this._renderDetail();
        }
    }

    /**
     * Render room in overview mode
     * - Positioned absolutely at room offset
     * - Non-uniform scale
     * - Filtered entities (overview !== false only)
     * - Transparent background by default
     */
    private _renderOverview(): TemplateResult {
        // Safety check: ensure cached values are available
        if (!this._cachedRoomBounds || !this._cachedOverviewRoom || !this._cachedRelativePoints) {
            return html``;
        }
        
        // Type check: overview mode requires non-uniform scale
        if (!isNonUniformScale(this.scale)) {
            console.error('Overview mode requires non-uniform scale (scaleX/scaleY)');
            return html``;
        }
        
        const roomBounds = this._cachedRoomBounds;
        const scale = this.scale;

        // Check if elements should be clickable on overview
        const elementsClickable = this.room.elements_clickable_on_overview ?? false;

        const elements = renderElements({
            hass: this.hass,
            room: this._cachedOverviewRoom,
            roomBounds,
            createCardElement: this.createCardElement,
            elementCards: this.elementCards,
            scale: scale.scaleX,
            scaleRatio: 0,  // Overview: no element scaling
            config: this.config,
            originalRoom: this.room,  // Pass original room for info box entity detection
            infoBoxCache: this._infoBoxCache,
            cachedInfoBoxEntityIds: this.cachedEntityIds?.infoBoxEntityIds,  // Use cached IDs from parent
            elementsClickable,  // Control element clickability
            houseCache: this.houseCache,
            editorMode: this.editorMode,
            viewId: this.viewId || 'default',  // Pass viewId to separate controllers
            selectedElementKey: this.selectedElementKey,
            onElementClick: (uniqueKey: string, elementIndex: number, entityId: string, parentGroupKey?: string) => {
                this._handleElementClick(uniqueKey, elementIndex, entityId, parentGroupKey);
            },
            roomIndex: this.roomIndex
        });

        const { fillColor, strokeColor, useGradient } = this._getRoomColors();

        
        // Build SVG polygon with conditional interactivity and gradient
        const polygonSvg = svg`
            <svg class="room-svg" style="position: absolute; top: 0; left: 0; width: ${roomBounds.width}px; height: ${roomBounds.height}px;" 
                 viewBox="0 0 ${roomBounds.width} ${roomBounds.height}" 
                 preserveAspectRatio="none">
                ${useGradient && this._currentGradient ? svg`
                    <defs>
                        <radialGradient id="${this._currentGradient.id}" cx="${this._currentGradient.cx}" cy="${this._currentGradient.cy}" r="70%">
                            <stop offset="0%" stop-color="${this._currentGradient.innerColor}" />
                            <stop offset="100%" stop-color="${this._currentGradient.outerColor}" />
                        </radialGradient>
                        ${this._hasMotion && this._currentGradientInverted ? svg`
                            <radialGradient id="${this._currentGradientInverted.id}" cx="${this._currentGradientInverted.cx}" cy="${this._currentGradientInverted.cy}" r="70%">
                                <stop offset="0%" stop-color="${this._currentGradientInverted.innerColor}" />
                                <stop offset="100%" stop-color="${this._currentGradientInverted.outerColor}" />
                            </radialGradient>
                        ` : ''}
                    </defs>
                ` : ''}
                ${this._hasMotion && this._currentGradientInverted ? svg`
                    <!-- Normal gradient polygon - fades out when inverted fades in -->
                    <polygon 
                        points="${this._cachedRelativePoints}" 
                        fill="url(#${this._currentGradient!.id})" 
                        stroke="${strokeColor}"
                        stroke-width="2"
                        class="room-polygon overview motion-normal ${elementsClickable ? 'no-pointer-events' : ''}"
                        style="cursor: ${elementsClickable ? 'default' : 'pointer'};"
                        @action=${elementsClickable ? null : this._handleAction}
                        @click=${this.editorMode ? this._handleRoomBackgroundClick : null}
                        .actionHandler=${elementsClickable ? null : actionHandler({ hasHold: true })}
                    />
                    <!-- Inverted gradient polygon - fades in when normal fades out -->
                    <polygon 
                        points="${this._cachedRelativePoints}" 
                        fill="url(#${this._currentGradientInverted.id})" 
                        stroke="${strokeColor}"
                        stroke-width="2"
                        class="room-polygon overview motion-inverted ${elementsClickable ? 'no-pointer-events' : ''}"
                        style="cursor: ${elementsClickable ? 'default' : 'pointer'}; opacity: 0;"
                        @action=${elementsClickable ? null : this._handleAction}
                        @click=${this.editorMode ? this._handleRoomBackgroundClick : null}
                        .actionHandler=${elementsClickable ? null : actionHandler({ hasHold: true })}
                    />
                ` : svg`
                    <!-- Single polygon for non-motion states -->
                    <polygon 
                        points="${this._cachedRelativePoints}" 
                        fill="${fillColor}" 
                        stroke="${strokeColor}"
                        stroke-width="2"
                        class="room-polygon overview ${elementsClickable ? 'no-pointer-events' : ''}"
                        style="cursor: ${elementsClickable ? 'default' : 'pointer'};"
                        @action=${elementsClickable ? null : this._handleAction}
                        @click=${this.editorMode ? this._handleRoomBackgroundClick : null}
                        .actionHandler=${elementsClickable ? null : actionHandler({ hasHold: true })}
                    />
                `}
            </svg>
        `;

        // Render with conditional order: SVG always below elements for proper visual stacking
        // Pointer events controlled via elementsClickable at the element-wrapper level
        return html`
            <div class="room-container" style="position: absolute; left: ${roomBounds.minX}px; top: ${roomBounds.minY}px; width: ${roomBounds.width}px; height: ${roomBounds.height}px;">
                ${polygonSvg}
                <div class="elements-container" style="width: ${roomBounds.width}px; height: ${roomBounds.height}px;">
                    ${elements}
                </div>
            </div>
        `;
    }

    /**
     * Render room in detail mode
     * - Uniform scale to fit container
     * - All entities shown
     * - Background always visible
     * - No room click interaction
     */
    private _renderDetail(): TemplateResult {
        // Safety check: ensure cached values are available
        if (!this._cachedRoomBounds) {
            return html``;
        }
        
        // Type check: detail mode requires uniform scale (single number)
        if (!isUniformScale(this.scale)) {
            console.error('Detail mode requires uniform scale (single number)');
            return html``;
        }
        
        const roomBounds = this._cachedRoomBounds;
        const scale = this.scale;
        
        // Calculate scaled dimensions
        const scaledWidth = roomBounds.width * scale;
        const scaledHeight = roomBounds.height * scale;
        
        // Use configured element_detail_scale_ratio (default 0.25 for detail view)
        const scaleRatio = this.config.element_detail_scale_ratio ?? 0.25;
        
        const elements = renderElements({
            hass: this.hass,
            room: this.room,
            roomBounds,
            createCardElement: this.createCardElement,
            elementCards: this.elementCards,
            scale,
            scaleRatio,
            config: this.config,
            infoBoxCache: this._infoBoxCache,
            cachedInfoBoxEntityIds: this.cachedEntityIds?.infoBoxEntityIds,  // Use cached IDs from parent
            elementsClickable: true,  // Elements always clickable in detail view
            houseCache: this.houseCache,
            editorMode: this.editorMode,
            viewId: this.viewId || 'default',  // Pass viewId to separate controllers
            selectedElementKey: this.selectedElementKey,
            onElementClick: (uniqueKey: string, elementIndex: number, entityId: string, parentGroupKey?: string) => {
                this._handleElementClick(uniqueKey, elementIndex, entityId, parentGroupKey);
            },
            roomIndex: this.roomIndex
        });

        const { fillColor, strokeColor, useGradient } = this._getRoomColors();
        
        // Transform and scale points relative to room bounds
        const points = this.room.boundary
            .map(p => `${(p[0] - roomBounds.minX) * scale},${(p[1] - roomBounds.minY) * scale}`)
            .join(' ');

        // Calculate background image positioning
        const imageOffsetX = -roomBounds.minX * scale;
        const imageOffsetY = -roomBounds.minY * scale;
        const imageWidth = this.config.image_width * scale;
        const imageHeight = this.config.image_height * scale;

        return html`
            <div class="room-container" style="width: ${scaledWidth}px; height: ${scaledHeight}px;">
                ${svg`
                    <svg class="room-svg" style="position: absolute; top: 0; left: 0; width: ${scaledWidth}px; height: ${scaledHeight}px;" 
                         viewBox="0 0 ${scaledWidth} ${scaledHeight}" 
                         preserveAspectRatio="none">
                        <defs>
                            <!-- Clip path for room boundary -->
                            <clipPath id="${this._cachedClipId}">
                                <polygon points="${points}" />
                            </clipPath>
                            ${useGradient && this._currentGradient ? svg`
                                <radialGradient id="${this._currentGradient.id}" cx="${this._currentGradient.cx}" cy="${this._currentGradient.cy}" r="70%">
                                    <stop offset="0%" stop-color="${this._currentGradient.innerColor}" />
                                    <stop offset="100%" stop-color="${this._currentGradient.outerColor}" />
                                </radialGradient>
                                ${this._hasMotion && this._currentGradientInverted ? svg`
                                    <radialGradient id="${this._currentGradientInverted.id}" cx="${this._currentGradientInverted.cx}" cy="${this._currentGradientInverted.cy}" r="70%">
                                        <stop offset="0%" stop-color="${this._currentGradientInverted.innerColor}" />
                                        <stop offset="100%" stop-color="${this._currentGradientInverted.outerColor}" />
                                    </radialGradient>
                                ` : ''}
                            ` : ''}
                        </defs>
                        <!-- Background image clipped to room shape -->
                        <image 
                            href="${this.config.image}" 
                            x="${imageOffsetX}"
                            y="${imageOffsetY}"
                            width="${imageWidth}"
                            height="${imageHeight}"
                            clip-path="url(#${this._cachedClipId})"
                            preserveAspectRatio="none"
                        />
                        <!-- Room colored polygon on top -->
                        ${this._hasMotion && this._currentGradientInverted ? svg`
                            <!-- Normal gradient polygon - fades out when inverted fades in -->
                            <polygon 
                                points="${points}" 
                                fill="url(#${this._currentGradient!.id})" 
                                stroke="${strokeColor}"
                                stroke-width="2"
                                class="room-polygon motion-normal"
                                @click=${this.editorMode ? this._handleRoomBackgroundClick : (e: Event) => e.stopPropagation()}
                            />
                            <!-- Inverted gradient polygon - fades in when normal fades out -->
                            <polygon 
                                points="${points}" 
                                fill="url(#${this._currentGradientInverted.id})" 
                                stroke="${strokeColor}"
                                stroke-width="2"
                                class="room-polygon motion-inverted"
                                style="opacity: 0;"
                                @click=${this.editorMode ? this._handleRoomBackgroundClick : (e: Event) => e.stopPropagation()}
                            />
                        ` : svg`
                            <!-- Single polygon for non-motion states -->
                            <polygon 
                                points="${points}" 
                                fill="${fillColor}" 
                                stroke="${strokeColor}"
                                stroke-width="2"
                                class="room-polygon"
                                @click=${this.editorMode ? this._handleRoomBackgroundClick : (e: Event) => e.stopPropagation()}
                            />
                        `}
                    </svg>
                `}
                <div class="elements-container" style="width: ${scaledWidth}px; height: ${scaledHeight}px;">
                    ${elements}
                </div>
            </div>
        `;
    }

    /**
     * Handle action events (tap, hold) from actionHandler directive
     */
    private _handleAction(event: ActionHandlerEvent) {
        event.stopPropagation();

        if (event.detail.action === 'tap') {
            // Regular click - navigate to detail view
            if (this.onClick) {
                this.onClick(this.room);
            }
        } else if (event.detail.action === 'hold') {
            // Long press - toggle lights
            this._toggleRoomLights();
        }
    }

    /**
     * Handle element click in editor mode
     * Emits element-selected event that bubbles up to editor
     * Uses window-level event to cross HA editor/preview boundary
     */
    private _handleElementClick(uniqueKey: string, elementIndex: number, entityId: string, parentGroupKey?: string): void {
        // Dispatch to window for HA editor to catch (editor and preview are in separate DOM contexts)
        const windowEvent = new CustomEvent('scalable-house-plan-element-selected', {
            detail: {
                uniqueKey: uniqueKey,
                elementIndex: elementIndex,
                roomIndex: this.roomIndex,
                entityId: entityId,
                parentGroupKey: parentGroupKey  // Include parent group key for nested selections
            },
            bubbles: true,
            composed: true
        });
        window.dispatchEvent(windowEvent);

        // Also dispatch locally for potential future use
        const localEvent = new CustomEvent('element-selected', {
            detail: {
                uniqueKey: uniqueKey,
                elementIndex: elementIndex,
                roomIndex: this.roomIndex,
                entityId: entityId
            },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(localEvent);
    }

    /**
     * Handle room background click in editor mode
     * In overview: toggles room detail preview (emulates eye icon click)
     * In detail: clears element selection
     */
    private _handleRoomBackgroundClick(e: Event): void {
        // Only handle in editor mode
        if (!this.editorMode) return;

        // Stop event from propagating
        e.stopPropagation();

        if (this.mode === 'overview' && this.roomIndex !== undefined) {
            // In overview mode: open room detail (emulate eye icon toggle)
            window.dispatchEvent(new CustomEvent('scalable-house-plan-room-preview', {
                detail: { roomIndex: this.roomIndex, showPreview: true }
            }));
        } else {
            // In detail mode: clear element selection
            window.dispatchEvent(new CustomEvent('scalable-house-plan-element-selected', {
                detail: {
                    uniqueKey: null,
                    elementIndex: -1,
                    roomIndex: this.roomIndex,
                    entityId: ''
                }
            }));
        }
    }

    /**
     * Toggle non-ambient lights in the room
     */
    private _toggleRoomLights() {
        if (!this.hass || !this._cachedEntityIds) return;
        
        const lightEntityIds = this._cachedEntityIds.lights;
        if (lightEntityIds.length === 0) return;
        
        // Check if any lights are on
        const anyLightOn = lightEntityIds.some(entityId => {
            const state = this.hass.states[entityId];
            return state && state.state === 'on';
        });
        
        // Determine action: if any light is on, turn all off; otherwise turn all on
        const action = anyLightOn ? 'turn_off' : 'turn_on';
        
        // Call service for each light
        lightEntityIds.forEach(entityId => {
            const domain = entityId.split('.')[0];
            this.hass.callService(domain, action, {
                entity_id: entityId
            });
        });
        
        // Provide haptic feedback if available
        if ('vibrate' in navigator) {
            navigator.vibrate(50);
        }
    }


}
