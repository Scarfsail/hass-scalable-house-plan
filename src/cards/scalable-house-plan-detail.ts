import { LitElement, html, css } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { Room, RoomEntityCache } from "./types";
import type { ScalableHousePlanConfig, HouseCache } from "./scalable-house-plan";
import { CreateCardElement, getCreateCardElement, getRoomName, getRoomIcon, getAreaEntities, getEntitiesNotOnDetailCount, applyScaleLimits, hasViewportChanged } from "../utils";
import { getRoomBounds } from "../components/element-renderer-shp";
import "../components/scalable-house-plan-room";

/**
 * Room detail SVG view component
 * Displays the selected room's shape with positioned elements on it
 * 
 * Scaling behavior:
 * - Room SVG scales to fit container (uniform scale, maintains aspect ratio)
 * - Element positions use percentages (maintain relative position regardless of room scale)
 * - Element sizes remain at original size (no scaling)
 */
@customElement("scalable-house-plan-detail")
export class ScalableHousePlanDetail extends LitElement {
    @property({ attribute: false }) public hass?: HomeAssistant;
    @property({ attribute: false }) public room?: Room;
    @property({ attribute: false }) public config?: ScalableHousePlanConfig;
    @property({ attribute: false }) public onBack?: () => void;
    @property({ attribute: false }) public onShowEntities?: () => void;
    @property({ attribute: false }) public roomEntityCache?: Map<string, RoomEntityCache>;
    @property({ attribute: false }) public houseCache!: HouseCache;
    @property({ type: Boolean }) public editorMode = false;
    @property({ attribute: false }) public selectedElementKey?: string | null;

    @state() private _createCardElement: CreateCardElement = null;
    @state() private _entitiesNotOnDetailCount: number = 0;
    // Cache for element cards (key: entity_id, value: card element)
    private _elementCards: Map<string, any> = new Map();
    private previousViewport = { width: 0, height: 0 };

    static get styles() {
        return css`
            :host {
                display: block;
                position: relative;
                height: 100%;
                background: transparent;
            }

            .header {
                display: flex;
                align-items: center;
                padding: 8px 12px;
                background: var(--card-background-color);
                border-bottom: 1px solid var(--divider-color);
                position: sticky;
                top: 0;
            }

            .back-button {
                margin-right: 8px;
                cursor: pointer;
                color: var(--primary-text-color);
                --mdc-icon-button-size: 36px;
            }

            .room-icon {
                margin-right: 8px;
                color: var(--primary-text-color);
            }

            .room-name {
                font-size: 18px;
                font-weight: 500;
                margin: 0;
                color: var(--primary-text-color);
            }

            .entity-badge {
                display: flex;
                align-items: center;
                justify-content: center;
                min-width: 32px;
                height: 32px;
                padding: 0 8px;
                border-radius: 16px;
                background: var(--primary-color);
                color: white;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                margin-left: 12px;
                transition: background-color 0.2s, transform 0.1s;
            }

            .entity-badge.empty {
                background: var(--disabled-text-color);
            }

            .entity-badge:hover {
                transform: scale(1.05);
            }

            .entity-badge:active {
                transform: scale(0.95);
            }

            .content {
                height: calc(100% - 60px);
                position: relative;
                overflow: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .clickable-background {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                cursor: pointer;
            }
        `;
    }

    async connectedCallback() {
        super.connectedCallback();
        this._createCardElement = await getCreateCardElement();
    }

    updated(changedProperties: Map<string, any>) {
        super.updated(changedProperties);
        
        // Clear element cache when room changes
        if (changedProperties.has('room')) {
            this._elementCards.clear();
            this._calculateEntitiesNotOnDetail();
        }
    }

    private _calculateEntitiesNotOnDetail() {
        if (!this.room || !this.hass) {
            this._entitiesNotOnDetailCount = 0;
            return;
        }

        // Get area entities (empty array if no area)
        const areaEntityIds = this.room.area ? getAreaEntities(this.hass, this.room.area) : [];
        
        // Use shared utility function to get count
        this._entitiesNotOnDetailCount = getEntitiesNotOnDetailCount(this.hass, this.room, areaEntityIds);
    }

    render() {
        if (!this.room || !this.hass || !this.config) {
            return html`<div>Loading...</div>`;
        }

        return html`
            <div class="header">
                <ha-icon-button
                    class="back-button"
                    .label=${"Back"}
                    @click=${this._handleBack}
                >
                    <ha-icon icon="mdi:arrow-left"></ha-icon>
                </ha-icon-button>
                <ha-icon class="room-icon" icon=${getRoomIcon(this.hass, this.room)}></ha-icon>
                <h1 class="room-name">${getRoomName(this.hass, this.room)}</h1>
                <div class="entity-badge ${this._entitiesNotOnDetailCount === 0 ? 'empty' : ''}" @click=${this._handleShowEntities}>
                    ${this._entitiesNotOnDetailCount}
                </div>
                <div style="flex: 1;"></div>
            </div>

            <div class="content">
                <div class="clickable-background" @click=${this._handleBack}></div>
                ${this._renderRoomDetail()}
            </div>
        `;
    }

    private _renderRoomDetail() {
        if (!this.room || !this.config) {
            return html``;
        }

        const clientRect = this.getBoundingClientRect();
        
        // Calculate room bounding box
        const roomBounds = getRoomBounds(this.room);
        const contentWidth = roomBounds.width;
        const contentHeight = roomBounds.height;

        const fitIntoHeight = clientRect.height - 60; // Subtract header height
        const fitIntoWidth = clientRect.width;

        if (hasViewportChanged(this.previousViewport)) {
            this.requestUpdate();
        }

        // Calculate uniform scale (maintain aspect ratio)
        const scaleX = fitIntoWidth / contentWidth;
        const scaleY = fitIntoHeight / contentHeight;
        const scale = applyScaleLimits(
            Math.min(scaleX, scaleY),
            this.config.min_scale,
            this.config.max_scale
        ) as number;

        return html`
            <scalable-house-plan-room
                .mode=${'detail'}
                .room=${this.room}
                .hass=${this.hass!}
                .config=${this.config}
                .scale=${scale}
                .createCardElement=${this._createCardElement}
                .elementCards=${this._elementCards}
                .cachedEntityIds=${this.roomEntityCache?.get(this.room.name)}
                .houseCache=${this.houseCache}
                .editorMode=${this.editorMode}
                .selectedElementKey=${this.selectedElementKey}
            ></scalable-house-plan-room>
        `;
    }

    private _handleBack() {
        if (this.onBack) {
            this.onBack();
        }
    }

    private _handleShowEntities() {
        if (this.onShowEntities) {
            this.onShowEntities();
        }
    }
}
