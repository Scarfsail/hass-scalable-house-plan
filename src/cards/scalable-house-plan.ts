import { LitElement, html, css } from "lit-element"
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { LovelaceCard, LovelaceCardEditor } from "../../hass-frontend/src/panels/lovelace/types";
import type { LovelaceCardConfig } from "../../hass-frontend/src/data/lovelace/config/card";
import { getAreaEntities, getAllRoomEntityIds } from "../utils";
import "./scalable-house-plan-overview";
import "./scalable-house-plan-detail";
import "./scalable-house-plan-entities";

export type PositionScalingMode = "plan" | "element" | "fixed";

export interface InfoBoxPosition {
    top?: number;    // Pixels from top edge of room
    bottom?: number; // Pixels from bottom edge (mutually exclusive with top)
    left?: number;   // Pixels from left edge of room
    right?: number;  // Pixels from right edge (mutually exclusive with left)
}

export interface InfoBoxTypeConfig {
    show?: boolean;  // Default: true (deprecated - use visible_detail/visible_overview)
    visible_detail?: boolean;  // Default: true - show in detail view
    visible_overview?: boolean;  // Default: true - show in overview
    size?: string;   // Default: "100%" - percentage scale (e.g., "200%" for double size)
    icon_position?: 'inline' | 'separate';  // Default: "inline" - icon on same line or separate line
    element?: Record<string, any>;  // Parameters to spread to the child component (e.g., analog-text-shp)
}

export interface InfoBoxConfig {
    show?: boolean;             // Default: true
    position?: InfoBoxPosition; // Default: { top: 5, left: 5 }
    show_background_detail?: boolean;  // Default: true - show background in detail view
    show_background_overview?: boolean;  // Default: true - show background in overview
    types?: {
        motion?: InfoBoxTypeConfig;
        occupancy?: InfoBoxTypeConfig;
        temperature?: InfoBoxTypeConfig;
        humidity?: InfoBoxTypeConfig;
    }
}

export interface Room {
    name: string;
    area?: string;  // Optional Home Assistant area ID
    boundary: [number, number][];
    entities: EntityConfig[];
    color?: string;  // Optional color for room background (supports rgba)
    elements_clickable_on_overview?: boolean;  // Default false - when true, elements are clickable and room is not
    disable_dynamic_color?: boolean;  // Default false - when true, room is transparent (no dynamic colors)
    info_box?: InfoBoxConfig;  // Info box configuration for this room
}

interface PlanConfig {
    left?: string | number;
    right?: string | number;
    top?: string | number;
    bottom?: string | number;
    width?: string | number;
    height?: string | number;
    overview?: boolean;  // Default true - show on overview
    style?: string | Record<string, string | number>;  // Custom CSS styles for element wrapper (string or object)
    element?: ElementConfig;  // Element config with optional type override
    position_scaling_horizontal?: PositionScalingMode;  // How horizontal position scales in detail view (default: "plan")
    position_scaling_vertical?: PositionScalingMode;    // How vertical position scales in detail view (default: "plan")
    disable_dynamic_color?: boolean;  // Opt-out entity from dynamic color evaluation
    exclude_from_info_box?: boolean;  // Opt-out entity from info box display
    light?: 'ambient' | 'normal';     // Light type: ambient (subtle) or normal (default)
}

interface ElementConfig {
    type?: string;  // Optional - auto-detected if not specified
    entity?: string;
    tap_action?: any;
    hold_action?: any;
    double_tap_action?: any;
    [key: string]: any;  // Element-specific properties
}

// EntityConfig can be a string (entity_id) or an object
// For no-entity elements (decorative), entity can be empty string and plan.element.type is required
export type EntityConfig = string | {
    entity: string;  // Can be empty string for no-entity elements
    plan?: PlanConfig;
}

// Legacy interface for internal processing (after transformation)
interface PictureElement {
    type: string;
    style: any;
    entity?: string;
    tap_action?: any;
    left?: string | number;
    right?: string | number;
    top?: string | number;
    bottom?: string | number;
    width?: string | number;
    height?: string | number;
    [key: string]: any;
}

export interface DynamicColorsConfig {
    motion_occupancy?: string;      // Default: (light blue)
    ambient_lights?: string;        // Default: (subtle purple/pink)
    lights?: string;                // Default: (warm white light)
    default?: string;               // Default: (very light gray)
    motion_delay_seconds?: number;  // Default: 60
}

/**
 * Cached entity IDs for a room to avoid expensive lookups on every render
 */
export interface RoomEntityCache {
    allEntityIds: string[];           // All entities (explicit + area)
    ambientLightIds: string[];        // Ambient light entity IDs
    areaEntityIds: string[];          // Cached area entities
    infoBoxEntityIds: string[];       // For info box scanning (allEntityIds)
    // Used for dynamic color calculation
    motionSensorIds: string[];
    lightIds: string[];
    occupancySensorIds: string[];
}

/**
 * House cache - contains all performance caches for element rendering
 * Shared across all views and rooms within a card instance
 */
export class HouseCache {
    elementMetadata: Map<string, any> = new Map();
    elementStructure: Map<string, any> = new Map();
    position: Map<string, any> = new Map();
}

export interface ScalableHousePlanConfig extends LovelaceCardConfig {
    rooms: Room[];
    image: string;
    style?: any
    image_width: number;
    image_height: number;
    max_scale?: number;
    min_scale?: number;
    element_detail_scale_ratio?: number;  // Proportional element scaling ratio for detail view (0=no scale, 1=full scale, default=0.25)
    card_size?: number;
    show_room_backgrounds?: boolean;  // Show room background colors (helpful for editing boundaries)
    dynamic_colors?: DynamicColorsConfig;  // Dynamic room color configuration
    info_box_defaults?: InfoBoxConfig;  // Default info box configuration for all rooms
    _previewRoomIndex?: number;  // Internal: room index to preview in detail view (not persisted, used during editing)
}


@customElement("scalable-house-plan")
export class ScalableHousePlan extends LitElement implements LovelaceCard {
    private resizeObserver: ResizeObserver;

    private config?: ScalableHousePlanConfig;

    @state() private _selectedRoomIndex: number | null = null;
    @state() private _currentView: 'overview' | 'detail' | 'entities' = 'overview';

    // Performance optimization: Cache entity IDs per room to avoid expensive lookups
    private _roomEntityCache: Map<string, RoomEntityCache> = new Map();
    
    // Element renderer caches (shared across all views and rooms)
    private _houseCache: HouseCache = new HouseCache();

    @property({ attribute: false }) hass?: HomeAssistant;

    static get styles() {
        return css`
            :host {
                display: block;
                height: 100%;
                position: relative;
            }
            scalable-house-plan-overview,
            scalable-house-plan-detail,
            scalable-house-plan-entities {
                display: block;
                height: 100%;
            }
            
            .detail-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .detail-backdrop {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                backdrop-filter: blur(8px) brightness(0.7);
                -webkit-backdrop-filter: blur(8px) brightness(0.7);
                background: rgba(0, 0, 0, 0.3);
                cursor: pointer;
            }
            
            .detail-content {
                position: relative;
                width: 100%;
                height: 100%;
            }
        `;
    }

    getCardSize() {
        return this.config?.card_size ?? 1;
    }

    /**
     * Check if the dashboard is in edit mode.
     * Home Assistant adds ?edit=1 to the URL when in edit mode.
     */
    private _isEditMode(): boolean {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('edit') === '1';
    }


    constructor() {
        super();
        this.resizeObserver = new ResizeObserver(this.onResize.bind(this));
    }

    setConfig(config: ScalableHousePlanConfig) {
        this.config = {
            ...config,
            rooms: config.rooms || [],
        };

        // Automatically show detail view for preview room (used during editing)
        if (this._isEditMode() && config._previewRoomIndex !== undefined && config._previewRoomIndex !== null) {
            this._selectedRoomIndex = config._previewRoomIndex;
            this._currentView = 'detail';
        } else if (this._isEditMode() && config._previewRoomIndex === null) {
            // Reset to overview when preview is cleared
            this._selectedRoomIndex = null;
            this._currentView = 'overview';
        }
    }

    /**
     * Lifecycle hook - compute entity caches when config or hass changes
     */
    willUpdate(changedProperties: Map<string | number | symbol, unknown>) {
        super.willUpdate(changedProperties);

        // Recompute entity cache when config changes (rooms, areas, entities)
        // Don't need to invalidate on hass changes - cache contains IDs only, not state
        if (changedProperties.has('config') && this.config && this.hass) {
            this._computeRoomEntityCaches();
        }
    }

    /**
     * Compute and cache entity IDs for all rooms
     * This expensive operation runs once when config changes, not on every render
     */
    private _computeRoomEntityCaches(): void {
        if (!this.config || !this.hass) return;

        this._roomEntityCache.clear();

        for (const room of this.config.rooms) {
            // Get area entities once for this room (expensive call)
            const areaEntityIds = room.area ? getAreaEntities(this.hass, room.area) : [];

            // Get all entity IDs (uses getAllRoomEntityIds logic)
            const allEntityIds = getAllRoomEntityIds(this.hass, room, areaEntityIds);

            // Categorize entities for dynamic color calculation (extracted from room component logic)
            const motionSensorIds: string[] = [];
            const ambientLightIds: string[] = [];
            const lightIds: string[] = [];
            const occupancySensorIds: string[] = [];

            // Get all entity configs (explicit + area)
            const explicitEntityIds = new Set(
                room.entities.map(cfg => typeof cfg === 'string' ? cfg : cfg.entity)
            );

            const allEntityConfigs: EntityConfig[] = [
                ...room.entities,
                ...areaEntityIds
                    .filter(entityId => !explicitEntityIds.has(entityId))
                    .map(entityId => entityId as EntityConfig)
            ];

            // Categorize entities by type
            for (const entityConfig of allEntityConfigs) {
                const entityId = typeof entityConfig === 'string' ? entityConfig : entityConfig.entity;
                if (!entityId) continue;

                // Skip entities opted out of dynamic colors
                const optedOut = typeof entityConfig !== 'string' && entityConfig.plan?.disable_dynamic_color;
                if (optedOut) continue;

                const stateObj = this.hass.states[entityId];
                if (!stateObj) continue;

                const [domain] = entityId.split('.');
                const deviceClass = stateObj.attributes?.device_class;

                // Motion sensors
                if (domain === 'binary_sensor' && (deviceClass === 'motion' || deviceClass === 'occupancy')) {
                    if (deviceClass === 'motion') {
                        motionSensorIds.push(entityId);
                    } else {
                        occupancySensorIds.push(entityId);
                    }
                }

                // Lights (categorize ambient vs normal)
                if (domain === 'light') {
                    // Check if entity is configured as ambient light via plan.light
                    const lightType = typeof entityConfig !== 'string' ? entityConfig.plan?.light : undefined;
                    
                    if (lightType === 'ambient') {
                        ambientLightIds.push(entityId);
                    } else {
                        // Default to normal light if not specified or explicitly 'normal'
                        lightIds.push(entityId);
                    }
                }
            }

            // Store in cache
            this._roomEntityCache.set(room.name, {
                allEntityIds,
                areaEntityIds,
                infoBoxEntityIds: allEntityIds,  // Info box uses all entities
                motionSensorIds,
                ambientLightIds,
                lightIds,
                occupancySensorIds
            });
        }
    }

    public getLayoutOptions() {
        const rows = this.config?.image_height ? (Math.ceil((this.config?.image_height - 8) / 56)) : 1
        return {
            grid_rows: rows,
            grid_columns: 4,
            grid_min_rows: rows,
        };
    }

    render() {
        if (!this.config) {
            return html`<div>Config is not defined</div>`;
        }

        // Show entities list view
        if (this._currentView === 'entities' && this._selectedRoomIndex !== null && this.config.rooms[this._selectedRoomIndex]) {
            const room = this.config.rooms[this._selectedRoomIndex];
            return html`
                <scalable-house-plan-entities
                    .hass=${this.hass}
                    .room=${room}
                    .onBack=${() => this._closeEntitiesView()}
                ></scalable-house-plan-entities>
            `;
        }

        // Always show overview as base layer
        const overviewHtml = html`
            <scalable-house-plan-overview
                .hass=${this.hass}
                .config=${this.config}
                .onRoomClick=${(room: Room, index: number) => this._openRoomDetail(index)}
                .roomEntityCache=${this._roomEntityCache}
                .houseCache=${this._houseCache}
            ></scalable-house-plan-overview>
        `;
        
        let detailHtml =
        this._currentView === 'detail' && this._selectedRoomIndex !== null && this.config.rooms[this._selectedRoomIndex] ?
        html`
            <div class="detail-overlay">
                <div class="detail-backdrop" @click=${() => this._closeRoomDetail()}></div>
                <div class="detail-content">
                    <scalable-house-plan-detail
                        .hass=${this.hass}
                        .room=${this.config.rooms[this._selectedRoomIndex]}
                        .config=${this.config}
                        .onBack=${() => this._closeRoomDetail()}
                        .onShowEntities=${() => this._openEntitiesView()}
                        .roomEntityCache=${this._roomEntityCache}
                        .houseCache=${this._houseCache}
                    ></scalable-house-plan-detail>
                </div>
            </div>
        `: html``;;

        // Show room detail as overlay on top of overview
        return html`
            ${overviewHtml}
            ${detailHtml}
        `;
    }

    private _openRoomDetail(roomIndex: number) {
        this._selectedRoomIndex = roomIndex;
        this._currentView = 'detail';
        // Only use history API when not in edit mode to avoid conflicts
        if (!this._isEditMode()) {
            history.pushState({ view: 'room-detail', roomIndex }, '', '');
        }
        this.requestUpdate();
    }

    private _closeRoomDetail() {
        this._selectedRoomIndex = null;
        this._currentView = 'overview';
        // Only pop history when not in edit mode
        if (!this._isEditMode() && window.history.state?.view === 'room-detail') {
            history.back();
        }
        this.requestUpdate();
    }

    private _openEntitiesView() {
        this._currentView = 'entities';
        // Only use history API when not in edit mode
        if (!this._isEditMode()) {
            history.pushState({ view: 'room-entities', roomIndex: this._selectedRoomIndex }, '', '');
        }
        this.requestUpdate();
    }

    private _closeEntitiesView() {
        this._currentView = 'detail';
        // Only pop history when not in edit mode
        if (!this._isEditMode() && window.history.state?.view === 'room-entities') {
            history.back();
        }
        this.requestUpdate();
    }

    private _handlePopState = (event: PopStateEvent) => {
        // Don't interfere with edit mode history handling
        if (this._isEditMode()) {
            return;
        }

        const currentState = window.history.state;

        // Handle navigation based on current view
        if (this._currentView === 'entities') {
            // Going back from entities view -> detail view
            this._currentView = 'detail';
            this.requestUpdate();
        } else if (this._currentView === 'detail') {
            // Going back from detail view -> overview
            if (!currentState || currentState.view !== 'room-detail') {
                this._selectedRoomIndex = null;
                this._currentView = 'overview';
                this.requestUpdate();
            }
        }
    };

    connectedCallback() {
        super.connectedCallback();
        const element = document.querySelector("home-assistant")?.shadowRoot?.querySelector("home-assistant-main")?.shadowRoot?.querySelector("partial-panel-resolver")?.querySelector("ha-panel-lovelace")?.shadowRoot?.querySelector("hui-root")?.shadowRoot?.querySelector("div");
        if (element)
            this.resizeObserver.observe(element);

        // Listen for browser back button
        window.addEventListener('popstate', this._handlePopState);
    }

    disconnectedCallback() {
        this.resizeObserver.disconnect();
        super.disconnectedCallback();

        // Remove popstate listener
        window.removeEventListener('popstate', this._handlePopState);
    }

    onResize() {
        this.requestUpdate();
    }

    public static async getConfigElement(): Promise<LovelaceCardEditor> {
        await import("./scalable-house-plan-editor");
        return document.createElement("scalable-house-plan-editor") as LovelaceCardEditor;
    }

    public static getStubConfig(): ScalableHousePlanConfig {
        return {
            type: "custom:scalable-house-plan",
            image: "/local/path/to/image.png",
            image_width: 1360,
            image_height: 849,
            rooms: [
                {
                    name: "Living Room",
                    boundary: [
                        [100, 100],
                        [400, 100],
                        [400, 300],
                        [100, 300]
                    ],
                    entities: []
                }
            ]
        };
    }
}

// Register card in window.customCards for Home Assistant
declare global {
    interface Window {
        customCards: Array<{
            type: string;
            name: string;
            description: string;
        }>;
    }
}

window.customCards = window.customCards || [];
window.customCards.push({
    type: "scalable-house-plan",
    name: "Scalable House Plan",
    description: "A scalable house plan card with room-based organization"
});
