import { LitElement, html, svg, css, TemplateResult } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { Room, ScalableHousePlanConfig, EntityConfig } from "../cards/scalable-house-plan";
import { CreateCardElement } from "../utils";
import { renderElements, getRoomBounds } from "./element-renderer-shp";
import { 
    calculateDynamicRoomColor, 
    createGradientDefinition, 
    calculatePolygonCenter,
    getMotionSensors,
    type DynamicColorResult,
    type GradientDefinition
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

    // Dynamic color state
    @state() private _motionDelayActive: Map<string, boolean> = new Map();
    private _motionDelayTimers: Map<string, number> = new Map();
    private _previousMotionStates: Map<string, string> = new Map();
    @state() private _currentColor?: DynamicColorResult;
    @state() private _currentGradient?: GradientDefinition;

    willUpdate(changedProperties: Map<string | number | symbol, unknown>) {
        super.willUpdate(changedProperties);
        
        // Recalculate cached values when room changes
        if (changedProperties.has('room')) {
            this._cachedRoomBounds = getRoomBounds(this.room);
            
            // Calculate relative polygon points (for overview mode)
            this._cachedRelativePoints = this.room.boundary
                .map(p => `${p[0] - this._cachedRoomBounds!.minX},${p[1] - this._cachedRoomBounds!.minY}`)
                .join(' ');
            
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
        }
        
        // Update motion delay tracking and dynamic colors when hass or room changes
        if (changedProperties.has('hass') || changedProperties.has('room')) {
            this._updateMotionDelayTracking();
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
                transition: fill 0.5s ease-in-out;
            }
        `;
    }

    /**
     * Update motion delay tracking when entity states change
     */
    private _updateMotionDelayTracking(): void {
        if (!this.hass || !this.room) return;
        
        const motionSensors = getMotionSensors(this.hass, this.room);
        const delaySeconds = this.config?.dynamic_colors?.motion_delay_seconds ?? 60;
        
        for (const entityId of motionSensors) {
            const currentState = this.hass.states[entityId]?.state;
            const previousState = this._previousMotionStates.get(entityId);
            
            // State changed
            if (currentState !== previousState) {
                this._previousMotionStates.set(entityId, currentState || '');
                
                if (currentState === 'on') {
                    // Motion detected - clear any existing delay timer and reset delay state
                    const existingTimer = this._motionDelayTimers.get(entityId);
                    if (existingTimer !== undefined) {
                        window.clearTimeout(existingTimer);
                        this._motionDelayTimers.delete(entityId);
                    }
                    this._motionDelayActive.set(entityId, false);
                } else if (currentState === 'off' && previousState === 'on') {
                    // Motion stopped - start delay timer
                    this._motionDelayActive.set(entityId, true);
                    
                    const timer = window.setTimeout(() => {
                        this._motionDelayActive.set(entityId, false);
                        this._motionDelayTimers.delete(entityId);
                        this._updateDynamicColor();
                        this.requestUpdate();
                    }, delaySeconds * 1000);
                    
                    this._motionDelayTimers.set(entityId, timer);
                }
            }
        }
    }

    /**
     * Update dynamic room color based on current entity states
     */
    private _updateDynamicColor(): void {
        if (!this.hass || !this.room || !this._cachedRoomBounds) return;
        
        // Calculate color
        this._currentColor = calculateDynamicRoomColor(
            this.hass,
            this.room,
            this.config,
            this._motionDelayActive
        );
        
        // Create gradient if not transparent
        if (this._currentColor.type !== 'transparent') {
            const center = calculatePolygonCenter(this.room.boundary);
            const gradientId = `gradient-${this.room.name.replace(/\s+/g, '-')}-${this.mode}`;
            
            this._currentGradient = createGradientDefinition(
                this._currentColor.color,
                gradientId,
                center.x,
                center.y,
                this._cachedRoomBounds
            );
        } else {
            this._currentGradient = undefined;
        }
    }

    /**
     * Calculate room fill and stroke colors based on mode and settings
     * @param forHover If true, returns hover colors (more opaque)
     * @returns Object with fillColor, strokeColor, and useGradient flag
     */
    private _getRoomColors(forHover: boolean = false): { fillColor: string; strokeColor: string; useGradient: boolean; gradientId?: string } {
        // Use dynamic colors if available and not hovering
        if (!forHover && this._currentColor && this._currentColor.type !== 'transparent' && this._currentGradient) {
            return {
                fillColor: `url(#${this._currentGradient.id})`,
                strokeColor: 'rgba(0, 0, 0, 0.1)',
                useGradient: true,
                gradientId: this._currentGradient.id
            };
        }
        
        // Fallback to original logic
        const roomColor = this.room.color || ScalableHousePlanRoom.DEFAULT_ROOM_COLOR;
        
        if (this.mode === 'detail') {
            // Detail mode: always show room background
            const fillColor = forHover 
                ? roomColor.replace(/[\d.]+\)$/, '0.4)')
                : roomColor;
            const strokeColor = roomColor.replace(/[\d.]+\)$/, '0.4)');
            return { fillColor, strokeColor, useGradient: false };
        } else {
            // Overview mode: respect showRoomBackgrounds setting
            const showBackgrounds = this.showRoomBackgrounds ?? false;
            
            if (forHover) {
                // Hover: always show semi-transparent overlay
                return {
                    fillColor: roomColor.replace(/[\d.]+\)$/, '0.4)'),
                    strokeColor: 'rgba(0, 0, 0, 0.3)',
                    useGradient: false
                };
            } else {
                // Normal: transparent or room color based on setting
                return {
                    fillColor: showBackgrounds ? roomColor : 'transparent',
                    strokeColor: showBackgrounds ? 'rgba(0, 0, 0, 0.3)' : 'transparent',
                    useGradient: false
                };
            }
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
            scaleRatio: 0  // Overview: no element scaling
        });

        const { fillColor, strokeColor, useGradient } = this._getRoomColors();

        // Check if elements should be clickable on overview
        const elementsClickable = this.room.elements_clickable_on_overview ?? false;
        
        // Build SVG polygon with conditional interactivity and gradient
        const polygonSvg = svg`
            <svg style="position: absolute; top: 0; left: 0; width: ${roomBounds.width}px; height: ${roomBounds.height}px; pointer-events: none;" 
                 viewBox="0 0 ${roomBounds.width} ${roomBounds.height}" 
                 preserveAspectRatio="none">
                ${useGradient && this._currentGradient ? svg`
                    <defs>
                        <radialGradient id="${this._currentGradient.id}" cx="${this._currentGradient.cx}" cy="${this._currentGradient.cy}" r="70%">
                            <stop offset="0%" stop-color="${this._currentGradient.innerColor}" />
                            <stop offset="100%" stop-color="${this._currentGradient.outerColor}" />
                        </radialGradient>
                    </defs>
                ` : ''}
                <polygon 
                    points="${this._cachedRelativePoints}" 
                    fill="${fillColor}" 
                    stroke="${strokeColor}"
                    stroke-width="2"
                    class="room-polygon"
                    style="cursor: ${elementsClickable ? 'default' : 'pointer'}; pointer-events: ${elementsClickable ? 'none' : 'auto'};"
                    @click=${elementsClickable ? null : (e: Event) => this._handleRoomClick(e)}
                    @mouseenter=${elementsClickable ? null : (e: Event) => this._handleRoomHover(e, true)}
                    @mouseleave=${elementsClickable ? null : (e: Event) => this._handleRoomHover(e, false)}
                />
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
            scaleRatio
        });

        const { fillColor, strokeColor, useGradient } = this._getRoomColors();
        
        // Transform and scale points relative to room bounds
        const points = this.room.boundary
            .map(p => `${(p[0] - roomBounds.minX) * scale},${(p[1] - roomBounds.minY) * scale}`)
            .join(' ');

        return html`
            <div class="room-container" style="width: ${scaledWidth}px; height: ${scaledHeight}px;">
                ${svg`
                    <svg style="position: absolute; top: 0; left: 0; width: ${scaledWidth}px; height: ${scaledHeight}px; z-index: 0;" 
                         viewBox="0 0 ${scaledWidth} ${scaledHeight}" 
                         preserveAspectRatio="none">
                        ${useGradient && this._currentGradient ? svg`
                            <defs>
                                <radialGradient id="${this._currentGradient.id}" cx="${this._currentGradient.cx}" cy="${this._currentGradient.cy}" r="70%">
                                    <stop offset="0%" stop-color="${this._currentGradient.innerColor}" />
                                    <stop offset="100%" stop-color="${this._currentGradient.outerColor}" />
                                </radialGradient>
                            </defs>
                        ` : ''}
                        <polygon 
                            points="${points}" 
                            fill="${fillColor}" 
                            stroke="${strokeColor}"
                            stroke-width="2"
                            class="room-polygon"
                        />
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

    private _handleRoomHover(event: Event, isEntering: boolean) {
        const target = event.target as SVGPolygonElement;
        
        // If using gradient, adjust opacity instead of replacing fill
        if (this._currentGradient && this._currentColor?.type !== 'transparent') {
            if (isEntering) {
                target.style.opacity = '1.5';  // Brighten by increasing opacity
                target.style.filter = 'brightness(1.3)';  // Additional brightness boost
            } else {
                target.style.opacity = '';  // Reset to default
                target.style.filter = '';
            }
        } else {
            // Fallback to solid color for non-gradient backgrounds
            const { fillColor } = this._getRoomColors(isEntering);
            target.setAttribute('fill', fillColor);
        }
    }

    /**
     * Clean up timers on disconnect
     */
    disconnectedCallback() {
        super.disconnectedCallback();
        
        // Clear all motion delay timers
        for (const timer of this._motionDelayTimers.values()) {
            window.clearTimeout(timer);
        }
        this._motionDelayTimers.clear();
        this._motionDelayActive.clear();
        this._previousMotionStates.clear();
    }
}
