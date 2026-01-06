import { LitElement, html, svg, css } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { Room, ScalableHousePlanConfig, EntityConfig } from "./scalable-house-plan";
import { CreateCardElement, getCreateCardElement, getRoomName } from "../utils";
import { renderElements, getRoomBounds } from "../components/element-renderer-shp";

/**
 * Overview view component
 * Displays the house plan with rooms overlay and positioned elements
 */
@customElement("scalable-house-plan-overview")
export class ScalableHousePlanOverview extends LitElement {
    @property({ attribute: false }) public hass?: HomeAssistant;
    @property({ attribute: false }) public config?: ScalableHousePlanConfig;
    @property({ attribute: false }) public onRoomClick?: (room: Room, index: number) => void;

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

            .elements-container {
                position: absolute;
                top: 0;
                left: 0;
                pointer-events: none;
                width: 100%;
                height: 100%;
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

        if (this.previousViewport.width != viewportWidth || this.previousViewport.height != viewportHeight) {
            this.previousViewport.width = viewportWidth;
            this.previousViewport.height = viewportHeight;
            this.requestUpdate();
            console.log("Viewport changed");
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

        const scale = this.getScale(fitIntoHeight, fitIntoWidth, contentWidth, contentHeight);
        if (this.config.max_scale) {
            scale.scaleX = Math.min(scale.scaleX, this.config.max_scale);
            scale.scaleY = Math.min(scale.scaleY, this.config.max_scale);
        }
        if (this.config.min_scale) {
            scale.scaleX = Math.max(scale.scaleX, this.config.min_scale);
            scale.scaleY = Math.max(scale.scaleY, this.config.min_scale);
        }

        this.style.setProperty("position", "relative");

        const roomsOverlay = this._renderRooms();
        const allElements = this._renderAllElements(scale.scaleX);

        return html`
            <div style="overflow:none; width:${visibleWidth}px; height:${visibleHeight}px">
                <div style="transform: scale(${scale.scaleX}, ${scale.scaleY}); transform-origin: 0px 0px; width:${contentWidth}px; height:${contentHeight}px; position: relative;">
                    <img src="${this.config.image}" style="width: ${this.config.image_width}px; height: ${this.config.image_height}px; display: block;" />
                    <div class="elements-container" style="width: ${this.config.image_width}px; height: ${this.config.image_height}px;">
                        ${allElements}
                    </div>
                    ${roomsOverlay}
                </div>
            </div>
        `;
    }

    /**
     * Render all elements from all rooms onto the overview
     */
    private _renderAllElements(scale: number) {
        if (!this.config || !this.hass) return html``;

        // Render elements for each room
        return (this.config.rooms || []).map((room: Room) => {
            const roomBounds = getRoomBounds(room);
            const roomOffset = {
                x: roomBounds.minX,
                y: roomBounds.minY
            };

            // Filter for overview entities only
            const overviewRoom = {
                ...room,
                entities: (room.entities || []).filter((entityConfig: EntityConfig) => {
                    // String shorthand = detail-only, no overview
                    if (typeof entityConfig === 'string') return false;
                    // Only include entities with plan section and overview !== false
                    return entityConfig.plan && (entityConfig.plan.overview !== false);
                })
            };

            // Create a wrapper div for this room's elements positioned at room offset
            return html`
                <div style="position: absolute; left: ${roomOffset.x}px; top: ${roomOffset.y}px; width: ${roomBounds.width}px; height: ${roomBounds.height}px;">
                    ${renderElements({
                        hass: this.hass!,
                        room: overviewRoom,
                        roomBounds,
                        createCardElement: this._createCardElement,
                        elementCards: this._elementCards,
                        scale,
                        scaleRatio: 0  // Overview: no element scaling - container transform handles it
                    })}
                </div>
            `;
        });
    }

    private _renderRooms() {
        if (!this.config?.rooms) return html``;

        const defaultColor = 'rgba(128, 128, 128, 0.2)';
        const showBackgrounds = this.config.show_room_backgrounds ?? false;

        return svg`
            <svg style="position: absolute; top: 0; left: 0; width: ${this.config.image_width}px; height: ${this.config.image_height}px; pointer-events: none;" viewBox="0 0 ${this.config.image_width} ${this.config.image_height}" preserveAspectRatio="none">
                ${this.config.rooms.map((room, index) => {
                    if (!room.boundary || room.boundary.length < 3) return svg``;
                    
                    const points = room.boundary.map(p => `${p[0]},${p[1]}`).join(' ');
                    const fillColor = showBackgrounds ? (room.color || defaultColor) : 'transparent';
                    const strokeColor = showBackgrounds ? 'rgba(0, 0, 0, 0.3)' : 'transparent';
                    
                    return svg`
                        <polygon 
                            points="${points}" 
                            fill="${fillColor}" 
                            stroke="${strokeColor}"
                            stroke-width="2"
                            style="cursor: pointer; pointer-events: auto;"
                            @click=${(e: Event) => this._handleRoomClick(room, index, e)}
                            @mouseenter=${(e: Event) => this._handleRoomHover(room, index, e, true)}
                            @mouseleave=${(e: Event) => this._handleRoomHover(room, index, e, false)}
                        />
                    `;
                })}
            </svg>
        `;
    }

    private _handleRoomClick(room: Room, index: number, event: Event) {
        event.stopPropagation();
        console.log('Room clicked:', getRoomName(this.hass!, room), index);
        
        if (this.onRoomClick) {
            this.onRoomClick(room, index);
        }
    }

    private _handleRoomHover(room: Room, index: number, event: Event, isEntering: boolean) {
        const target = event.target as SVGPolygonElement;
        const showBackgrounds = this.config?.show_room_backgrounds ?? false;
        const defaultColor = 'rgba(128, 128, 128, 0.2)';
        
        if (isEntering) {
            // On hover, show a semi-transparent overlay
            const fillColor = room.color || defaultColor;
            const hoverFill = fillColor.replace(/[\d.]+\)$/, '0.4)');
            target.setAttribute('fill', hoverFill);
        } else {
            // On leave, restore based on show_room_backgrounds setting
            const fillColor = showBackgrounds ? (room.color || defaultColor) : 'transparent';
            target.setAttribute('fill', fillColor);
        }
    }

    private getScale(fitIntoHeight: number, fitIntoWidth: number, contentWidth: number, contentHeight: number) {
        let scaleW = fitIntoWidth / contentWidth;
        let scaleH = fitIntoHeight / contentHeight;
        return { scaleX: scaleW, scaleY: scaleH };
    }
}
