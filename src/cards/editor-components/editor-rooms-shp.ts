import { LitElement, html, css } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { sharedStyles } from "./shared-styles";
import { DragDropMixin } from "./drag-drop-mixin";
import type { Room } from "../scalable-house-plan";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import { getLocalizeFunction } from "../../localize";
import "./editor-room-shp";

/**
 * Generate a stable key for a room
 * This ensures proper component updates after drag & drop
 */
function getRoomKey(room: Room, index: number): string {
    // Use area as primary key, fallback to name, fallback to index
    return room.area || room.name || `room-${index}`;
}

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
            <ha-sortable 
                handle-selector=".handle"
                draggable-selector=".room-item"
                @item-moved=${(ev: any) => this._handleRoomsReorder(ev)}
                group="all-rooms"
                .disabled=${false}
            >
                <div class="rooms-container">
                    ${this.rooms.length === 0 
                        ? html`<div class="empty-drop-zone">${this._renderEmptyState()}</div>`
                        : repeat(
                            this.rooms,
                            (room, index) => getRoomKey(room, index),
                            (room, index) => html`
                                <editor-room-shp
                                    class="room-item"
                                    .hass=${this.hass}
                                    .room=${room}
                                    .roomIndex=${index}
                                    @room-update=${this._handleRoomUpdate}
                                    @room-duplicate=${this._handleRoomDuplicate}
                                    @room-remove=${this._handleRoomRemove}
                                ></editor-room-shp>
                            `
                        )
                    }
                </div>
            </ha-sortable>
        `;
    }

    private _renderEmptyState() {
        return html`
            <div class="empty-state">
                <ha-icon icon="mdi:floor-plan"></ha-icon>
                <div>${getLocalizeFunction(this.hass)('editor.no_rooms_configured')}</div>
            </div>
        `;
    }

    private _handleRoomUpdate(e: CustomEvent) {
        const event = new CustomEvent('room-update', {
            detail: e.detail,
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleRoomDuplicate(e: CustomEvent) {
        const { roomIndex, room } = e.detail;
        
        // Create a deep copy of the room to avoid reference issues
        const duplicatedRoom: Room = {
            ...room,
            // Clear area for duplicate to force user to select new area or name
            area: undefined,
            name: room.name ? `${room.name} (copy)` : undefined,
            // Deep clone boundary
            boundary: room.boundary ? room.boundary.map((point: [number, number]) => [...point] as [number, number]) : undefined,
            // Deep clone entities
            entities: room.entities ? JSON.parse(JSON.stringify(room.entities)) : undefined
        };
        
        // Insert the duplicated room right after the source (at roomIndex + 1)
        const newRooms = [...this.rooms];
        newRooms.splice(roomIndex + 1, 0, duplicatedRoom);
        
        // Dispatch event to update parent component
        const event = new CustomEvent('rooms-reorder', {
            detail: { rooms: newRooms },
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

    private _handleRoomsReorder(e: CustomEvent) {
        e.stopPropagation();
        const { oldIndex, newIndex } = e.detail;
        
        const reorderedRooms = DragDropMixin.reorderArray(this.rooms, oldIndex, newIndex);
        
        const event = new CustomEvent('rooms-reorder', {
            detail: { rooms: reorderedRooms },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }
}
