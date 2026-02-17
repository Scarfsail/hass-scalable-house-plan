import { LitElement, html, svg, css } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { Room, RoomEntityCache } from "./types";
import type { ScalableHousePlanConfig, HouseCache } from "./scalable-house-plan";
import { CreateCardElement, getCreateCardElement, applyScaleLimits, hasViewportChanged, PinchZoomController } from "../utils";
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
    @property({ attribute: false }) public houseCache!: HouseCache;
    @property({ type: Boolean }) public editorMode = false;
    @property({ attribute: false }) public selectedElementKey?: string | null;

    @state() private _createCardElement: CreateCardElement = null;
    // Cache for element cards across all rooms (key: entity_id, value: card element)
    private _elementCards: Map<string, any> = new Map();
    private previousViewport = { width: 0, height: 0 };
    private _zoomController: PinchZoomController | null = null;
    // Scale/viewport values computed in willUpdate() and consumed by render() and updated()
    private _lastScaleX = 1.0;
    private _lastScaleY = 1.0;
    private _lastVisibleW = 0;
    private _lastVisibleH = 0;

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

    disconnectedCallback() {
        super.disconnectedCallback();
        this._zoomController?.detach();
        this._zoomController = null;
    }

    willUpdate() {
        if (!this.config?.image || !this.config.image_width || !this.config.image_height) return;

        const clientRect = this.getBoundingClientRect();
        const fitIntoHeight = clientRect.height;
        const fitIntoWidth = clientRect.width;

        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        let visibleHeight = 0;
        let visibleWidth = 0;

        if (hasViewportChanged(this.previousViewport)) {
            this.requestUpdate();
        } else {
            visibleHeight = Math.max(0, Math.min(viewportHeight, clientRect.bottom) - Math.max(0, clientRect.top));
            visibleWidth = Math.max(0, Math.min(viewportWidth, clientRect.right) - Math.max(0, clientRect.left));
        }

        if (visibleHeight === 0 || visibleWidth === 0) {
            visibleHeight = fitIntoHeight || 400;
            visibleWidth = fitIntoWidth || 600;
        }

        const scale = applyScaleLimits(
            this.getScale(fitIntoHeight, fitIntoWidth, this.config.image_width, this.config.image_height),
            this.config.min_scale,
            this.config.max_scale
        ) as { scaleX: number; scaleY: number };

        this._lastScaleX = scale.scaleX;
        this._lastScaleY = scale.scaleY;
        this._lastVisibleW = visibleWidth;
        this._lastVisibleH = visibleHeight;
    }

    updated() {
        // Lazily create the controller once the shadow DOM elements exist
        if (!this._zoomController) {
            const outerDiv = this.shadowRoot?.getElementById('overview-viewport') as HTMLElement | null;
            const innerDiv = this.shadowRoot?.getElementById('overview-content') as HTMLElement | null;
            if (outerDiv && innerDiv) {
                this._zoomController = new PinchZoomController(outerDiv, innerDiv, () => this.requestUpdate());
                this._zoomController.attach();
            }
        }

        if (this._zoomController && this._lastVisibleW > 0) {
            this._zoomController.updateBaseScale(
                this._lastScaleX,
                this._lastScaleY,
                this._lastVisibleW,
                this._lastVisibleH,
                this.config?.image_width ?? 0,
                this.config?.image_height ?? 0
            );
        }
    }

    render() {
        if (!this.config) {
            return html`<div>Config is not defined</div>`;
        }

        if (!this.config.image || !this.config.image_width || !this.config.image_height) {
            return html`<div style="padding: 16px; text-align: center;">Please configure the image URL, width, and height in the card settings.</div>`;
        }

        const userZoom = this._zoomController?.userZoom ?? 1.0;
        const panX = this._zoomController?.panX ?? 0;
        const panY = this._zoomController?.panY ?? 0;
        const transformStyle = `translate(${panX}px, ${panY}px) scale(${this._lastScaleX * userZoom}, ${this._lastScaleY * userZoom})`;

        const rooms = this._renderRooms({ scaleX: this._lastScaleX, scaleY: this._lastScaleY });

        return html`
            <div id="overview-viewport" style="overflow:hidden; width:${this._lastVisibleW}px; height:${this._lastVisibleH}px">
                <div id="overview-content" style="transform: ${transformStyle}; transform-origin: 0px 0px; width:${this.config.image_width}px; height:${this.config.image_height}px; position: relative;">
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
                .houseCache=${this.houseCache}
                .showRoomBackgrounds=${this.config!.show_room_backgrounds}
                .onClick=${() => this._handleRoomClick(room, index)}
                .cachedEntityIds=${this.roomEntityCache?.get(room.name)}
                .editorMode=${this.editorMode}
                .selectedElementKey=${this.selectedElementKey}
                .roomIndex=${index}
                .viewId=${'main-card'}
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
