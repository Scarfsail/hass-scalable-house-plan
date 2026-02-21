import { LitElement, html, svg, css, TemplateResult } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import { actionHandler, type ActionHandlerEvent } from "../utils/action-handler";
import type { Room, EntityConfig, RoomEntityCache } from "../cards/types";
import type { ScalableHousePlanConfig, HouseCache } from "../cards/scalable-house-plan";
import { CreateCardElement, getRoomEntities } from "../utils";
import { renderElements, getRoomBounds } from "./element-renderer-shp";
import "./boundary-handles-shp";
import {
    createGradientDefinition,
    calculatePolygonCenter,
    adjustOpacity,
    extractAlpha,
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
    @property({ attribute: false }) public selectedBoundaryPointIndex?: number | null;
    @property({ type: Number }) public roomIndex?: number;
    @property({ type: String }) public viewId?: string;  // Unique identifier for this render context (e.g., "main-card", "detail-dialog")

    // Constants
    private static readonly DEFAULT_ROOM_COLOR = 'rgba(128, 128, 128, 0.2)';

    // Cached computed values for performance
    private _cachedRoomBounds?: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
    private _cachedRelativePoints?: string;
    private _cachedOverviewRoom?: Room;
    private _cachedClipId?: string;  // Clip path ID for detail mode
    private _prevColorKey?: string;  // Memoization key for _updateDynamicColor
    
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
            // Room changed: force full color recalculation (gradient ID and center depend on room)
            this._prevColorKey = undefined;
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
            // Entity IDs changed: force full color recalculation
            this._prevColorKey = undefined;
        }

        // Update dynamic colors when hass or room changes
        if (changedProperties.has('hass') || changedProperties.has('room')) {
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
     * Memoized: skips all @state assignments when color/type/activeLightColor are unchanged,
     * preventing LitElement re-renders on every unrelated HA entity update.
     */
    private _updateDynamicColor(): void {
        if (!this.hass || !this.room || !this._cachedRoomBounds || !this._cachedEntityIds) return;

        // Dashboard rooms never use dynamic color overlays — always transparent
        if (this.room.show_as_dashboard) {
            const newColorKey = 'dashboard';
            if (newColorKey !== this._prevColorKey) {
                this._prevColorKey = newColorKey;
                this._currentColor = { type: 'transparent', color: 'transparent', activeTypes: [] };
                this._currentGradient = undefined;
                this._currentGradientInverted = undefined;
                this._hasMotion = false;
                this._activeLightColor = undefined;
            }
            return;
        }

        // Calculate color using cached entity IDs and timestamp-based delay checking
        const newColor = calculateDynamicRoomColor(
            this.hass,
            this.room,
            this.config,
            this._cachedEntityIds
        );

        // Compute derived values before comparing
        const newHasMotion = newColor.type === 'motion';
        const newActiveLightColor = (newHasMotion && newColor.activeTypes.includes('lights'))
            ? (this.config?.dynamic_colors?.lights || 'rgba(255, 245, 170, 0.20)')
            : undefined;

        // Memoization: skip re-render if nothing visually changed
        const newColorKey = `${newColor.type}|${newColor.color}|${newActiveLightColor ?? ''}`;
        if (newColorKey === this._prevColorKey) return;
        this._prevColorKey = newColorKey;

        // Assign @state() properties (triggers LitElement re-render)
        this._currentColor = newColor;
        this._hasMotion = newHasMotion;
        this._activeLightColor = newActiveLightColor;

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
            
            // Create inverted gradient for the motion wave animation.
            // Motion + lights: crossfade between motion color (center-bright) and light color (center-bright).
            // Motion only: ripple wave — normal has bright center/transparent edges, inverted has
            //   transparent center/bright edges. Combined they shift the bright spot center↔edges.
            if (this._hasMotion) {
                if (this._activeLightColor) {
                    this._currentGradientInverted = createGradientDefinition(
                        this._activeLightColor,
                        gradientIdInverted,
                        center.x,
                        center.y,
                        this._cachedRoomBounds
                    );
                } else {
                    const motionColor = this._currentColor.color;
                    const userAlpha = extractAlpha(motionColor);
                    this._currentGradientInverted = {
                        id: gradientIdInverted,
                        cx: this._currentGradient.cx,
                        cy: this._currentGradient.cy,
                        innerColor: adjustOpacity(motionColor, 0),
                        outerColor: adjustOpacity(motionColor, userAlpha)
                    };
                }
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
            // cat3: show border only when explicitly opted in, or in debug mode (showRoomBackgrounds)
            const showBorder = this.showRoomBackgrounds || (this.config?.dynamic_colors?.show_border ?? false);
            return {
                fillColor: `url(#${this._currentGradient.id})`,
                strokeColor: showBorder ? 'rgba(0, 0, 0, 0.1)' : 'none',
                useGradient: true,
                gradientId: this._currentGradient.id
            };
        }
        
        // Fallback: static room color or transparent based on mode and settings
        if (this.mode === 'detail') {
            // Only show a color overlay when the room has an explicit static color configured.
            // Without room.color, keep transparent so the background image shows through.
            if (!this.room.color) {
                return { fillColor: 'transparent', strokeColor: 'none', useGradient: false };
            }
            return {
                fillColor: this.room.color,
                strokeColor: adjustOpacity(this.room.color, 0.4),
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
     * Render the dashboard background SVG fragment (black fill + bezel + edge glow).
     * Uses ONLY direct SVG attribute values (no <defs>, no url() references) because
     * SVG url(#id) references don't resolve reliably in LitElement Shadow DOM.
     * The glare effect is rendered separately via CSS (see _renderDashboardGlare).
     *
     * @param points - Room boundary polygon points string (already scaled/offset)
     * @param opacity - Overall opacity 0–1 (1.0 in detail, variable in overview)
     */
    private _renderDashboardBackground(points: string, opacity: number): TemplateResult {
        return svg`
            <g opacity="${opacity}">
                <!-- Deep black screen fill — no strokes; all edge depth comes from CSS shadows -->
                <polygon points="${points}" fill="#060610" stroke="none" pointer-events="none" />
            </g>
        `;
    }

    /**
     * Render the dashboard CSS overlay (glare + drop shadow) as an HTML div.
     * Uses CSS radial-gradient and clip-path (works reliably in Shadow DOM, unlike SVG defs).
     *
     * @param opacity - Overall opacity 0–1 (1.0 in detail, variable in overview)
     */
    private _renderDashboardGlare(opacity: number): TemplateResult {
        if (!this._cachedRoomBounds) return html``;

        const bounds = this._cachedRoomBounds;
        const glareType = this.room.dashboard_glare ?? 'top-center';

        // CSS polygon clip-path with percentage values (works for any room shape)
        const clipPath = `polygon(${this.room.boundary
            .map(p => `${((p[0] - bounds.minX) / bounds.width * 100).toFixed(2)}% ${((p[1] - bounds.minY) / bounds.height * 100).toFixed(2)}%`)
            .join(', ')})`;

        // Glare gradient position depends on type
        let gradient: string;
        if (glareType === 'full') {
            const center = calculatePolygonCenter(this.room.boundary);
            const cx = ((center.x - bounds.minX) / bounds.width * 100).toFixed(1);
            const cy = ((center.y - bounds.minY) / bounds.height * 100).toFixed(1);
            gradient = `radial-gradient(ellipse at ${cx}% ${cy}%, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.08) 45%, transparent 70%)`;
        } else if (glareType === 'left-center') {
            // left-center: side-lit monitor, hotspot at the left edge mid-height
            gradient = `radial-gradient(ellipse at 0% 50%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.10) 40%, transparent 65%)`;
        } else if (glareType === 'lcd') {
            // lcd: two-lobe directional glare strip across the upper-left, imitating a sun reflection on glass
            gradient = `linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.20) 18%, transparent 35%),
                         linear-gradient(135deg, transparent 25%, rgba(255,255,255,0.08) 40%, transparent 60%)`;
        } else {
            // top-center: overhead screen reflection (default)
            gradient = `radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.10) 40%, transparent 65%)`;
        }

        return html`
            <!-- Glare highlight -->
            <div style="position:absolute; inset:0; clip-path:${clipPath}; background:${gradient}; opacity:${opacity}; pointer-events:none;"></div>
            <!-- Inset edge vignette: soft dark fade from the boundary inward — screen recessed into its frame -->
            <div style="position:absolute; inset:0; clip-path:${clipPath}; box-shadow:inset 0 0 60px 20px rgba(0,0,0,0.92); opacity:${opacity}; pointer-events:none;"></div>
        `;
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
            originalRoom: this.room,  // Pass original room for info box entity detection
            roomEntityIds: this.cachedEntityIds?.allEntityIds,  // Pre-computed entity IDs (avoids live getAreaEntities scan)
            elementDefaults: this.config?.element_defaults,
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
        const isDashboard = this.room.show_as_dashboard;
        const polygonSvg = svg`
            <svg class="room-svg" style="position: absolute; top: 0; left: 0; width: ${roomBounds.width}px; height: ${roomBounds.height}px;${isDashboard ? ' overflow: visible; filter: drop-shadow(0 2px 4px rgba(0,0,0,1)) drop-shadow(0 10px 25px rgba(0,0,0,0.90)) drop-shadow(0 28px 55px rgba(0,0,0,0.65)) drop-shadow(0 50px 90px rgba(0,0,0,0.35));' : ''}" 
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
                    <!-- Motion: two polygons in opposite phase create a ripple wave effect -->
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
                    <!-- Static polygon for non-motion states -->
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
                ${this.room.show_as_dashboard
                    ? this._renderDashboardBackground(
                        this._cachedRelativePoints!,
                        (this.room.dashboard_overview_opacity ?? 100) / 100
                    )
                    : ''}
            </svg>
        `;

        const dashboardOpacity = (this.room.dashboard_overview_opacity ?? 100) / 100;

        // Render with conditional order: SVG always below elements for proper visual stacking
        // Pointer events controlled via elementsClickable at the element-wrapper level
        return html`
            <div class="room-container" style="position: absolute; left: ${roomBounds.minX}px; top: ${roomBounds.minY}px; width: ${roomBounds.width}px; height: ${roomBounds.height}px;">
                ${polygonSvg}
                ${this.room.show_as_dashboard ? this._renderDashboardGlare(dashboardOpacity) : ''}
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
            roomEntityIds: this.cachedEntityIds?.allEntityIds,  // Pre-computed entity IDs (avoids live getAreaEntities scan)
            elementDefaults: this.config?.element_defaults,
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

        const isDashboard = this.room.show_as_dashboard;

        return html`
            <div class="room-container" style="width: ${scaledWidth}px; height: ${scaledHeight}px;">
                ${svg`
                    <svg class="room-svg" style="position: absolute; top: 0; left: 0; width: ${scaledWidth}px; height: ${scaledHeight}px;${isDashboard ? ' overflow: visible; filter: drop-shadow(0 2px 4px rgba(0,0,0,1)) drop-shadow(0 10px 25px rgba(0,0,0,0.90)) drop-shadow(0 28px 55px rgba(0,0,0,0.65)) drop-shadow(0 50px 90px rgba(0,0,0,0.35));' : ''}" 
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
                        <!-- Background image clipped to room shape (hidden in dashboard mode) -->
                        ${!this.room.show_as_dashboard ? svg`
                            <image
                                href="${this.config.image}"
                                x="${imageOffsetX}"
                                y="${imageOffsetY}"
                                width="${imageWidth}"
                                height="${imageHeight}"
                                clip-path="url(#${this._cachedClipId})"
                                preserveAspectRatio="none"
                            />
                        ` : ''}
                        <!-- Dashboard background (black fill + bezel + edge glow) -->
                        ${this.room.show_as_dashboard
                            ? this._renderDashboardBackground(points, 1.0)
                            : ''}
                        <!-- Room colored polygon on top -->
                        ${this._hasMotion && this._currentGradientInverted ? svg`
                            <!-- Motion: two polygons in opposite phase create a ripple wave effect -->
                            <polygon
                                points="${points}"
                                fill="url(#${this._currentGradient!.id})"
                                stroke="${strokeColor}"
                                stroke-width="2"
                                class="room-polygon motion-normal"
                                @click=${this.editorMode ? this._handleRoomBackgroundClick : (e: Event) => e.stopPropagation()}
                            />
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
                            <!-- Static polygon for non-motion states -->
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
                ${this.editorMode ? html`
                    <boundary-handles-shp
                        .boundary=${this.room.boundary}
                        .roomIndex=${this.roomIndex ?? 0}
                        .scale=${scale}
                        .roomBounds=${roomBounds}
                        .selectedPointIndex=${this.selectedBoundaryPointIndex ?? null}
                    ></boundary-handles-shp>
                ` : ''}
                ${this.room.show_as_dashboard ? this._renderDashboardGlare(1.0) : ''}
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
