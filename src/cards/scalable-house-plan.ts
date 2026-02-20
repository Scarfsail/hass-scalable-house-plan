import { LitElement, html, css } from "lit-element"
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { LovelaceCard, LovelaceCardEditor } from "../../hass-frontend/src/panels/lovelace/types";
import type { LovelaceCardConfig } from "../../hass-frontend/src/data/lovelace/config/card";
import { getAreaEntities, getAllRoomEntityIds, analyzeRoomEntities, isGroupShp } from "../utils";
import "./scalable-house-plan-overview";
import "./scalable-house-plan-detail";
import "./scalable-house-plan-entities";
import { cleanupDragControllers } from "../components/element-renderer-shp";
import type {
    PositionScalingMode,
    ElementDefaultConfig,
    Room,
    PlanConfig,
    EntityConfig,
    DynamicColorsConfig,
    RoomEntityCache
} from "./types";

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
    element_defaults?: ElementDefaultConfig[];  // House-level element defaults (keyed by element type)
    _previewRoomIndex?: number;  // Internal: room index to preview in detail view (not persisted, used during editing)
    _editorMode?: boolean;  // Internal: interactive editor mode enabled (not persisted, used during editing)
    _selectedElementKey?: string | null;  // Internal: currently selected element uniqueKey (not persisted, used during editing)
    _selectedBoundaryPointIndex?: number | null;  // Internal: currently selected boundary point index (not persisted, used during editing)
}


@customElement("scalable-house-plan")
export class ScalableHousePlan extends LitElement implements LovelaceCard {
    private resizeObserver: ResizeObserver;

    private config?: ScalableHousePlanConfig;

    @state() private _selectedRoomIndex: number | null = null;
    @state() private _currentView: 'overview' | 'detail' | 'entities' = 'overview';
    @state() private _editorMode = false;
    @state() private _selectedElementKey: string | null = null;
    @state() private _selectedBoundaryPointIndex: number | null = null;

    // Performance optimization: Cache entity IDs per room to avoid expensive lookups
    private _roomEntityCache: Map<string, RoomEntityCache> = new Map();

    // Element renderer caches (shared across all views and rooms)
    private _houseCache: HouseCache = new HouseCache();

    // Debounce timer for resize events
    private _resizeTimer?: number;

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
            
            .edit-mode-badge {
                position: absolute;
                top: 12px;
                right: 12px;
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 6px 12px;
                background: var(--primary-color, #03a9f4);
                color: white;
                border-radius: 16px;
                font-size: 12px;
                font-weight: 500;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                z-index: 10;
                pointer-events: none;
            }
            
            .edit-mode-badge ha-icon {
                --mdc-icon-size: 16px;
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

        // Update editor mode state (used during editing)
        if (this._isEditMode()) {
            this._editorMode = config._editorMode || false;
            this._selectedElementKey = config._selectedElementKey || null;
            this._selectedBoundaryPointIndex = config._selectedBoundaryPointIndex ?? null;
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

    updated(changedProperties: Map<string | number | symbol, unknown>) {
        super.updated(changedProperties);

        // Clean up drag controllers when editor mode is turned off
        if (changedProperties.has('_editorMode') && changedProperties.get('_editorMode') === true && !this._editorMode) {
            cleanupDragControllers();
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

            // Analyze and categorize entities in a single traversal (optimization)
            const {
                motionSensorIds,
                ambientLightIds,
                lightIds,
                occupancySensorIds
            } = analyzeRoomEntities(this.hass, room, areaEntityIds);

            // Store in cache
            this._roomEntityCache.set(room.name, {
                allEntityIds,
                areaEntityIds,
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

        // Edit mode badge
        const editModeBadge = this._editorMode ? html`
            <div class="edit-mode-badge">
                <ha-icon icon="mdi:pencil"></ha-icon>
            </div>
        ` : '';
        
        // Always show overview as base layer
        const overviewHtml = html`
            <scalable-house-plan-overview
                .hass=${this.hass}
                .config=${this.config}
                .onRoomClick=${(room: Room, index: number) => this._openRoomDetail(index)}
                .roomEntityCache=${this._roomEntityCache}
                .houseCache=${this._houseCache}
                .editorMode=${this._editorMode}
                .selectedElementKey=${this._selectedElementKey}
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
                        .editorMode=${this._editorMode}
                        .selectedElementKey=${this._selectedElementKey}
                        .selectedBoundaryPointIndex=${this._selectedBoundaryPointIndex}
                        .roomIndex=${this._selectedRoomIndex}
                    ></scalable-house-plan-detail>
                </div>
            </div>
        `: html``;;

        // Show room detail as overlay on top of overview
        return html`
            ${overviewHtml}
            ${detailHtml}
            ${editModeBadge}
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
        const closingRoomIndex = this._selectedRoomIndex;
        this._selectedRoomIndex = null;
        this._currentView = 'overview';
        // In edit mode: notify editor to clear _previewRoomIndex (emulate eye icon toggle off)
        if (this._isEditMode() && closingRoomIndex !== null) {
            window.dispatchEvent(new CustomEvent('scalable-house-plan-room-preview', {
                detail: { roomIndex: closingRoomIndex, showPreview: false }
            }));
        }
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
        // Clear any pending resize debounce timer
        if (this._resizeTimer !== undefined) {
            clearTimeout(this._resizeTimer);
            this._resizeTimer = undefined;
        }
        cleanupDragControllers();
        super.disconnectedCallback();

        // Remove popstate listener
        window.removeEventListener('popstate', this._handlePopState);
    }

    onResize() {
        // Debounce resize events: ResizeObserver fires ~60/s during window drag.
        // Only trigger a re-render 100ms after the last resize event.
        if (this._resizeTimer !== undefined) {
            clearTimeout(this._resizeTimer);
        }
        this._resizeTimer = window.setTimeout(() => {
            this._resizeTimer = undefined;
            this.requestUpdate();
        }, 100);
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
