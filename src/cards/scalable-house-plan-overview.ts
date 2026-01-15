import { LitElement, html, svg, css } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { Room, ScalableHousePlanConfig, RoomEntityCache } from "./scalable-house-plan";
import { CreateCardElement, getCreateCardElement, applyScaleLimits, hasViewportChanged } from "../utils";
import "../components/scalable-house-plan-room";

/**
 * Overview view component
 * Displays the house plan with rooms overlay and positioned elements
 */
@customElement("scalable-house-plan-overview")
export class ScalableHousePlanOverview extends LitElement {
    @property({ attribute: false }) public hass?: HomeAssistant;
    @property({ attribute: false }) public config?: ScalableHousePlanConfig;
    @property({ attribute: false }) public onRoomClick?: (room: Room, index: number) => void;
    @property({ attribute: false }) public roomEntityCache?: Map<string, RoomEntityCache>;

    @state() private _createCardElement: CreateCardElement = null;
    // Cache for element cards across all rooms (key: entity_id, value: card element)
    private _elementCards: Map<string, any> = new Map();
    private previousViewport = { width: 0, height: 0 };

    static get styles() {
        return css`
            :host {
                display: block;
                position: relative;
                height: 100%;
            }
        `;
    }

    async connectedCallback() {
        super.connectedCallback();
        this._createCardElement = await getCreateCardElement();
    }

    render() {
        if (!this.config) {
            return html`<div>Config is not defined</div>`;
        }

        if (!this.config.image || !this.config.image_width || !this.config.image_height) {
            return html`<div style="padding: 16px; text-align: center;">Please configure the image URL, width, and height in the card settings.</div>`;
        }

        const clientRect = this.getBoundingClientRect();
        const contentHeight = this.config.image_height;
        const contentWidth = this.config.image_width;

        const fitIntoHeight = clientRect.height;
        const fitIntoWidth = clientRect.width;

        // Get the dimensions of the viewport (the visible area)
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        let visibleHeight = 0;
        let visibleWidth = 0;

        if (hasViewportChanged(this.previousViewport)) {
            this.requestUpdate();
        } else {
            // Calculate the visible height and width
            visibleHeight = Math.max(0, Math.min(viewportHeight, clientRect.bottom) - Math.max(0, clientRect.top));
            visibleWidth = Math.max(0, Math.min(viewportWidth, clientRect.right) - Math.max(0, clientRect.left));
        }

        // Use fallback dimensions if not visible (e.g., in editor preview)
        if (visibleHeight === 0 || visibleWidth === 0) {
            visibleHeight = fitIntoHeight || 400;
            visibleWidth = fitIntoWidth || 600;
        }

        const scale = applyScaleLimits(
            this.getScale(fitIntoHeight, fitIntoWidth, contentWidth, contentHeight),
            this.config.min_scale,
            this.config.max_scale
        ) as { scaleX: number; scaleY: number };

        this.style.setProperty("position", "relative");

        const rooms = this._renderRooms(scale);

        return html`
            <div style="overflow:none; width:${visibleWidth}px; height:${visibleHeight}px">
                <div style="transform: scale(${scale.scaleX}, ${scale.scaleY}); transform-origin: 0px 0px; width:${contentWidth}px; height:${contentHeight}px; position: relative;">
                    <img src="${this.config.image}" style="width: ${this.config.image_width}px; height: ${this.config.image_height}px; display: block;" />
                    ${rooms}
                </div>
            </div>
        `;
    }

    /**
     * Render all rooms using room components
     */
    private _renderRooms(scale: { scaleX: number; scaleY: number }) {
        if (!this.config || !this.hass) return html``;

        return (this.config.rooms || []).map((room: Room, index: number) => html`
            <scalable-house-plan-room
                .mode=${'overview'}
                .room=${room}
                .hass=${this.hass!}
                .config=${this.config!}
                .scale=${scale}
                .createCardElement=${this._createCardElement}
                .elementCards=${this._elementCards}
                .showRoomBackgrounds=${this.config!.show_room_backgrounds}
                .onClick=${() => this._handleRoomClick(room, index)}
                .cachedEntityIds=${this.roomEntityCache?.get(room.name)}
            ></scalable-house-plan-room>
        `);
    }

    private _handleRoomClick(room: Room, index: number) {
        if (this.onRoomClick) {
            this.onRoomClick(room, index);
        }
    }

    private getScale(fitIntoHeight: number, fitIntoWidth: number, contentWidth: number, contentHeight: number) {
        let scaleW = fitIntoWidth / contentWidth;
        let scaleH = fitIntoHeight / contentHeight;
        return { scaleX: scaleW, scaleY: scaleH };
    }
}
