import { LitElement, html, css } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "./shared-styles";
import type { Room } from "../scalable-house-plan";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import "./editor-room-shp";

@customElement("editor-rooms-shp")
export class EditorRoomsShp extends LitElement {
    @property({ attribute: false }) hass!: HomeAssistant;
    @property({ attribute: false }) rooms: Room[] = [];

    static styles = [
        sharedStyles,
        css`
            .rooms-container {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .add-room-button {
                margin-top: 12px;
            }
        `
    ];

    protected render() {
        return html`
            <div class="config-section">
                <div class="section-header">
                    <div class="section-title">
                        <ha-icon icon="mdi:floor-plan"></ha-icon>
                        Rooms
                    </div>
                    <ha-icon-button
                        class="add-button"
                        @click=${this._addRoom}
                    >
                        <ha-icon icon="mdi:plus"></ha-icon>
                    </ha-icon-button>
                </div>
                <div class="rooms-container">
                    ${this.rooms.map((room, index) => html`
                        <editor-room-shp
                            .hass=${this.hass}
                            .room=${room}
                            .roomIndex=${index}
                            @room-update=${this._handleRoomUpdate}
                            @room-remove=${this._handleRoomRemove}
                        ></editor-room-shp>
                    `)}
                    ${this.rooms.length === 0 ? html`
                        <div class="empty-state">
                            <ha-icon icon="mdi:floor-plan"></ha-icon>
                            <div>No rooms configured. Click + to add a room.</div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    private _addRoom() {
        const event = new CustomEvent('room-add', {
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleRoomUpdate(e: CustomEvent) {
        const event = new CustomEvent('room-update', {
            detail: e.detail,
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleRoomRemove(e: CustomEvent) {
        const event = new CustomEvent('room-remove', {
            detail: e.detail,
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }
}
