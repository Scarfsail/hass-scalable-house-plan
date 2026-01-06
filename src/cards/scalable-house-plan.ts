import { LitElement, html, css } from "lit-element"
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { LovelaceCard, LovelaceCardEditor } from "../../hass-frontend/src/panels/lovelace/types";
import type { LovelaceCardConfig } from "../../hass-frontend/src/data/lovelace/config/card";
import "./scalable-house-plan-overview";
import "./scalable-house-plan-detail";
import "./scalable-house-plan-entities";

export type PositionScalingMode = "plan" | "element" | "fixed";

export interface Room {
    name: string;
    area?: string;  // Optional Home Assistant area ID
    boundary: [number, number][];
    entities: EntityConfig[];
    color?: string;  // Optional color for room background (supports rgba)
}

interface PlanConfig {
    left?: string | number;
    right?: string | number;
    top?: string | number;
    bottom?: string | number;
    width?: string | number;
    height?: string | number;
    overview?: boolean;  // Default true - show on overview
    style?: any;
    element?: ElementConfig;  // Element config with optional type override
    position_scaling_horizontal?: PositionScalingMode;  // How horizontal position scales in detail view (default: "plan")
    position_scaling_vertical?: PositionScalingMode;    // How vertical position scales in detail view (default: "plan")
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
}


@customElement("scalable-house-plan")
export class ScalableHousePlan extends LitElement implements LovelaceCard {
    private resizeObserver: ResizeObserver;

    private config?: ScalableHousePlanConfig;

    @state() private _selectedRoomIndex: number | null = null;
    @state() private _currentView: 'overview' | 'detail' | 'entities' = 'overview';

    @property({ attribute: false }) hass?: HomeAssistant;

    static get styles() {
        return css`
            :host {
                display: block;
                height: 100%;
            }
            scalable-house-plan-overview,
            scalable-house-plan-detail,
            scalable-house-plan-entities {
                display: block;
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

        // Show room detail SVG view
        if (this._currentView === 'detail' && this._selectedRoomIndex !== null && this.config.rooms[this._selectedRoomIndex]) {
            const room = this.config.rooms[this._selectedRoomIndex];
            return html`
                <scalable-house-plan-detail
                    .hass=${this.hass}
                    .room=${room}
                    .config=${this.config}
                    .onBack=${() => this._closeRoomDetail()}
                    .onShowEntities=${() => this._openEntitiesView()}
                ></scalable-house-plan-detail>
            `;
        }

        // Show overview
        return html`
            <scalable-house-plan-overview
                .hass=${this.hass}
                .config=${this.config}
                .onRoomClick=${(room: Room, index: number) => this._openRoomDetail(index)}
            ></scalable-house-plan-overview>
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
