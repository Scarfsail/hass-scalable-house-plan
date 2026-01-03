import { LitElement, html, svg, css } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { Room, ScalableHousePlanConfig } from "./scalable-house-plan";
import { CreateCardElement, getCreateCardElement, getRoomName, getRoomIcon, getAreaEntities, getEntitiesNotOnDetailCount } from "../utils";
import { renderElements, getRoomBounds } from "../components/element-renderer-shp";

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
                background: var(--lovelace-background, var(--primary-background-color));
            }

            .header {
                display: flex;
                align-items: center;
                padding: 8px 12px;
                background: var(--card-background-color);
                border-bottom: 1px solid var(--divider-color);
                position: sticky;
                top: 0;
                z-index: 2;
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

        // Get the dimensions of the viewport (the visible area)
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;

        if (this.previousViewport.width != viewportWidth || this.previousViewport.height != viewportHeight) {
            this.previousViewport.width = viewportWidth;
            this.previousViewport.height = viewportHeight;
            this.requestUpdate();
        }

        // Calculate uniform scale (maintain aspect ratio)
        const scaleX = fitIntoWidth / contentWidth;
        const scaleY = fitIntoHeight / contentHeight;
        let scale = Math.min(scaleX, scaleY);

        // Apply scale limits from config
        if (this.config.max_scale) {
            scale = Math.min(scale, this.config.max_scale);
        }
        if (this.config.min_scale) {
            scale = Math.max(scale, this.config.min_scale);
        }

        // Calculate scaled dimensions
        const scaledWidth = contentWidth * scale;
        const scaledHeight = contentHeight * scale;

        const roomShape = this._renderRoomShapeScaled(roomBounds, scale);
        const elements = renderElements({
            hass: this.hass!,
            room: this.room,
            roomBounds,
            createCardElement: this._createCardElement,
            elementCards: this._elementCards,
            scale
        });

        return html`
            <div class="room-container" style="width: ${scaledWidth}px; height: ${scaledHeight}px;">
                ${roomShape}
                <div class="elements-container" style="width: ${scaledWidth}px; height: ${scaledHeight}px;">
                    ${elements}
                </div>
            </div>
        `;
    }

    /**
     * Render room shape SVG at scaled dimensions
     */
    private _renderRoomShapeScaled(
        roomBounds: { minX: number; minY: number; width: number; height: number },
        scale: number
    ) {
        if (!this.room) return svg``;

        const scaledWidth = roomBounds.width * scale;
        const scaledHeight = roomBounds.height * scale;
        
        const fillColor = this.room.color || 'rgba(128, 128, 128, 0.2)';
        const strokeColor = fillColor.replace(/[\d.]+\)$/, '0.4)');
        
        // Transform and scale points
        const points = this.room.boundary
            .map(p => `${(p[0] - roomBounds.minX) * scale},${(p[1] - roomBounds.minY) * scale}`)
            .join(' ');
        
        return svg`
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
