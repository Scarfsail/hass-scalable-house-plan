import { LitElement, html, svg, css, TemplateResult } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { Room, ScalableHousePlanConfig, EntityConfig } from "../cards/scalable-house-plan";
import { CreateCardElement } from "../utils";
import { renderElements, getRoomBounds } from "./element-renderer-shp";

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
        `;
    }

    /**
     * Calculate room fill and stroke colors based on mode and settings
     * @param forHover If true, returns hover colors (more opaque)
     * @returns Object with fillColor and strokeColor
     */
    private _getRoomColors(forHover: boolean = false): { fillColor: string; strokeColor: string } {
        const roomColor = this.room.color || ScalableHousePlanRoom.DEFAULT_ROOM_COLOR;
        
        if (this.mode === 'detail') {
            // Detail mode: always show room background
            const fillColor = forHover 
                ? roomColor.replace(/[\d.]+\)$/, '0.4)')
                : roomColor;
            const strokeColor = roomColor.replace(/[\d.]+\)$/, '0.4)');
            return { fillColor, strokeColor };
        } else {
            // Overview mode: respect showRoomBackgrounds setting
            const showBackgrounds = this.showRoomBackgrounds ?? false;
            
            if (forHover) {
                // Hover: always show semi-transparent overlay
                return {
                    fillColor: roomColor.replace(/[\d.]+\)$/, '0.4)'),
                    strokeColor: 'rgba(0, 0, 0, 0.3)'
                };
            } else {
                // Normal: transparent or room color based on setting
                return {
                    fillColor: showBackgrounds ? roomColor : 'transparent',
                    strokeColor: showBackgrounds ? 'rgba(0, 0, 0, 0.3)' : 'transparent'
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

        const { fillColor, strokeColor } = this._getRoomColors();

        // Check if elements should be clickable on overview
        const elementsClickable = this.room.elements_clickable_on_overview ?? false;
        
        // Build SVG polygon with conditional interactivity
        const polygonSvg = svg`
            <svg style="position: absolute; top: 0; left: 0; width: ${roomBounds.width}px; height: ${roomBounds.height}px; pointer-events: none;" 
                 viewBox="0 0 ${roomBounds.width} ${roomBounds.height}" 
                 preserveAspectRatio="none">
                <polygon 
                    points="${this._cachedRelativePoints}" 
                    fill="${fillColor}" 
                    stroke="${strokeColor}"
                    stroke-width="2"
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

        const { fillColor, strokeColor } = this._getRoomColors();
        
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
                        <polygon 
                            points="${points}" 
                            fill="${fillColor}" 
                            stroke="${strokeColor}"
                            stroke-width="2"
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
        const { fillColor } = this._getRoomColors(isEntering);
        target.setAttribute('fill', fillColor);
    }
}
