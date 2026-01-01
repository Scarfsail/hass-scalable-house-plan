import { LitElement, html, css } from "lit-element"
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { LovelaceCard, LovelaceCardEditor } from "../../hass-frontend/src/panels/lovelace/types";
import type { LovelaceCardConfig } from "../../hass-frontend/src/data/lovelace/config/card";
import "./scalable-house-plan-plan";
import "./scalable-house-plan-detail";

export interface Layer {
    id: string;
    name: string;
    icon: string;
    visible: boolean;
    showInToggles: boolean;
}

export interface Room {
    name: string;
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
    show?: boolean;  // Default true
    layer_id?: string;
    style?: any;
    element?: ElementConfig;  // Element config with optional type override
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
export type EntityConfig = string | {
    entity: string;
    plan?: PlanConfig;
}

// Legacy interface for internal processing (after transformation)
interface PictureElement {
    type: string;
    style: any;
    entity?: string;
    tap_action?: any;
    layer_id?: string;
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
    layers?: Layer[];
    image: string;
    style?: any
    image_width: number;
    image_height: number;
    max_scale?: number;
    min_scale?: number;
    card_size?: number;
    layers_visibility_persistence_id?: string;
}


@customElement("scalable-house-plan")
export class ScalableHousePlan extends LitElement implements LovelaceCard {
    private resizeObserver: ResizeObserver;

    private config?: ScalableHousePlanConfig;

    @state() private _selectedRoomIndex: number | null = null;

    @property({ attribute: false }) hass?: HomeAssistant;

    static get styles() {
        return css`
            :host {
                display: block;
                height: 100%;
            }
            scalable-house-plan-plan,
            scalable-house-plan-detail {
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
            layers: config.layers || [],
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

        // If room detail is selected, show detail view
        if (this._selectedRoomIndex !== null && this.config.rooms[this._selectedRoomIndex]) {
            const room = this.config.rooms[this._selectedRoomIndex];
            return html`
                <scalable-house-plan-detail
                    .hass=${this.hass}
                    .room=${room}
                    .onBack=${() => this._closeRoomDetail()}
                ></scalable-house-plan-detail>
            `;
        }

        // Otherwise show plan view
        return html`
            <scalable-house-plan-plan
                .hass=${this.hass}
                .config=${this.config}
                .onRoomClick=${(room: Room, index: number) => this._openRoomDetail(index)}
            ></scalable-house-plan-plan>
        `;
    }

    private _openRoomDetail(roomIndex: number) {
        this._selectedRoomIndex = roomIndex;
        // Only use history API when not in edit mode to avoid conflicts
        if (!this._isEditMode()) {
            history.pushState({ view: 'room-detail', roomIndex }, '', '');
        }
        this.requestUpdate();
    }

    private _closeRoomDetail() {
        this._selectedRoomIndex = null;
        // Only pop history when not in edit mode
        if (!this._isEditMode() && window.history.state?.view === 'room-detail') {
            history.back();
        }
        this.requestUpdate();
    }

    private _handlePopState = (event: PopStateEvent) => {
        // Don't interfere with edit mode history handling
        if (this._isEditMode()) {
            return;
        }
        
        // Only close detail view if we're going back from room-detail state
        // This prevents closing when other dialogs (like more-info) close
        const currentState = window.history.state;
        
        if (this._selectedRoomIndex !== null) {
            // If the new state is not room-detail, close the detail view
            if (!currentState || currentState.view !== 'room-detail') {
                this._selectedRoomIndex = null;
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
            layers: [
                {
                    id: "default",
                    name: "Default Layer",
                    icon: "mdi:layers",
                    visible: true,
                    showInToggles: true
                }
            ],
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
