import { LitElement, html, svg, css, TemplateResult } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { Room, ScalableHousePlanConfig, EntityConfig } from "../cards/scalable-house-plan";
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
        lights: string[];           // Light entity IDs
        occupancySensors: string[]; // Occupancy sensor entity IDs
    };

    // Dynamic color state
    @state() private _currentColor?: DynamicColorResult;
    @state() private _currentGradient?: GradientDefinition;
    @state() private _currentGradientInverted?: GradientDefinition;
    @state() private _hasMotion: boolean = false;

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
            
            // Compute entity IDs once when room changes (includes initial connection)
            // These IDs are then used to look up fresh state from hass.states on each render
            this._computeEntityIdCache();
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
            }

            .element-wrapper {
                position: absolute;
                pointer-events: auto;
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
                lightIds.push(entityId);
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
                
                // Inverted: Center is dark (0.05), outer is bright (0.2)
                const innerColor = adjustOpacity(this._currentColor.color, 0.05);
                const outerColor = adjustOpacity(this._currentColor.color, 0.2);
                
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
            infoBoxCache: this._infoBoxCache
        });

        const { fillColor, strokeColor, useGradient } = this._getRoomColors();

        // Check if elements should be clickable on overview
        const elementsClickable = this.room.elements_clickable_on_overview ?? false;
        
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
                        @click=${elementsClickable ? null : (e: Event) => this._handleRoomClick(e)}
                    />
                    <!-- Inverted gradient polygon - fades in when normal fades out -->
                    <polygon 
                        points="${this._cachedRelativePoints}" 
                        fill="url(#${this._currentGradientInverted.id})" 
                        stroke="${strokeColor}"
                        stroke-width="2"
                        class="room-polygon overview motion-inverted ${elementsClickable ? 'no-pointer-events' : ''}"
                        style="cursor: ${elementsClickable ? 'default' : 'pointer'}; opacity: 0;"
                        @click=${elementsClickable ? null : (e: Event) => this._handleRoomClick(e)}
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
                        @click=${elementsClickable ? null : (e: Event) => this._handleRoomClick(e)}
                    />
                `}
            </svg>
        `;

        // Render with conditional order: elements clickable = SVG below elements
        return html`
            <div class="room-container" style="position: absolute; left: ${roomBounds.minX}px; top: ${roomBounds.minY}px; width: ${roomBounds.width}px; height: ${roomBounds.height}px;">
                ${elementsClickable ? polygonSvg : html``}
                <div class="elements-container" style="width: ${roomBounds.width}px; height: ${roomBounds.height}px;">
                    ${elements}
                </div>
                ${elementsClickable ? html`` : polygonSvg}
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
            infoBoxCache: this._infoBoxCache
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
                                @click=${(e: Event) => e.stopPropagation()}
                            />
                            <!-- Inverted gradient polygon - fades in when normal fades out -->
                            <polygon 
                                points="${points}" 
                                fill="url(#${this._currentGradientInverted.id})" 
                                stroke="${strokeColor}"
                                stroke-width="2"
                                class="room-polygon motion-inverted"
                                style="opacity: 0;"
                                @click=${(e: Event) => e.stopPropagation()}
                            />
                        ` : svg`
                            <!-- Single polygon for non-motion states -->
                            <polygon 
                                points="${points}" 
                                fill="${fillColor}" 
                                stroke="${strokeColor}"
                                stroke-width="2"
                                class="room-polygon"
                                @click=${(e: Event) => e.stopPropagation()}
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

    private _handleRoomClick(event: Event) {
        event.stopPropagation();
        if (this.onClick) {
            this.onClick(this.room);
        }
    }


}
