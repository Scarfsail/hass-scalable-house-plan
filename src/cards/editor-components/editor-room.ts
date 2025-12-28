import { LitElement, html, css } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { sharedStyles } from "./shared-styles";
import type { Room } from "../scalable-house-plan";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import "./editor-elements";

@customElement("editor-room")
export class EditorRoom extends LitElement {
    @property({ attribute: false }) hass!: HomeAssistant;
    @property({ attribute: false }) room!: Room;
    @property({ type: Number }) roomIndex!: number;
    @state() private _expanded = false;

    static styles = [
        sharedStyles,
        css`
            .room-header {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px;
                background: var(--secondary-background-color);
                border-radius: 8px;
                cursor: pointer;
            }

            .room-header:hover {
                background: var(--divider-color);
            }

            .room-name {
                flex: 1;
                font-weight: 500;
            }

            .room-content {
                margin-top: 8px;
                padding: 12px;
                border: 1px solid var(--divider-color);
                border-radius: 8px;
            }

            .room-field {
                margin-bottom: 12px;
            }

            .boundary-points {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                gap: 8px;
                margin-top: 8px;
            }

            .boundary-point {
                display: flex;
                gap: 4px;
            }

            .boundary-point ha-textfield {
                flex: 1;
            }
        `
    ];

    protected render() {
        return html`
            <div class="room-container">
                <div class="room-header" @click=${this._toggleExpanded}>
                    <ha-icon icon=${this._expanded ? "mdi:chevron-down" : "mdi:chevron-right"}></ha-icon>
                    <ha-icon icon="mdi:home"></ha-icon>
                    <div class="room-name">${this.room.name || "Unnamed Room"}</div>
                    <ha-icon-button
                        @click=${this._removeRoom}
                        .label=${"Remove room"}
                    >
                        <ha-icon icon="mdi:delete"></ha-icon>
                    </ha-icon-button>
                </div>

                ${this._expanded ? html`
                    <div class="room-content">
                        <div class="room-field">
                            <ha-textfield
                                label="Room Name"
                                .value=${this.room.name || ""}
                                @input=${this._nameChanged}
                            ></ha-textfield>
                        </div>

                        <div class="room-field">
                            <div style="margin-bottom: 8px;">
                                <strong>Boundary Points</strong>
                                <ha-icon-button
                                    @click=${this._addBoundaryPoint}
                                    .label=${"Add point"}
                                >
                                    <ha-icon icon="mdi:plus"></ha-icon>
                                </ha-icon-button>
                            </div>
                            <div class="boundary-points">
                                ${(this.room.boundary || []).map((point, index) => html`
                                    <div class="boundary-point">
                                        <ha-textfield
                                            label="X"
                                            type="number"
                                            .value=${point[0]}
                                            @input=${(e: Event) => this._boundaryPointChanged(index, 0, e)}
                                        ></ha-textfield>
                                        <ha-textfield
                                            label="Y"
                                            type="number"
                                            .value=${point[1]}
                                            @input=${(e: Event) => this._boundaryPointChanged(index, 1, e)}
                                        ></ha-textfield>
                                        <ha-icon-button
                                            @click=${() => this._removeBoundaryPoint(index)}
                                        >
                                            <ha-icon icon="mdi:close"></ha-icon>
                                        </ha-icon-button>
                                    </div>
                                `)}
                            </div>
                        </div>

                        <editor-elements
                            .hass=${this.hass}
                            .elements=${this.room.elements || []}
                            @elements-update=${this._handleElementsUpdate}
                        ></editor-elements>
                    </div>
                ` : ''}
            </div>
        `;
    }

    private _toggleExpanded() {
        this._expanded = !this._expanded;
    }

    private _nameChanged(e: Event) {
        const target = e.target as HTMLInputElement;
        this._dispatchUpdate({ ...this.room, name: target.value });
    }

    private _addBoundaryPoint() {
        const boundary = [...(this.room.boundary || []), [0, 0] as [number, number]];
        this._dispatchUpdate({ ...this.room, boundary });
    }

    private _removeBoundaryPoint(index: number) {
        const boundary = [...(this.room.boundary || [])];
        boundary.splice(index, 1);
        this._dispatchUpdate({ ...this.room, boundary });
    }

    private _boundaryPointChanged(pointIndex: number, coordIndex: number, e: Event) {
        const target = e.target as HTMLInputElement;
        const boundary = [...(this.room.boundary || [])];
        const point = [...boundary[pointIndex]] as [number, number];
        point[coordIndex] = Number(target.value);
        boundary[pointIndex] = point;
        this._dispatchUpdate({ ...this.room, boundary });
    }

    private _handleElementsUpdate(e: CustomEvent) {
        this._dispatchUpdate({ ...this.room, elements: e.detail.elements });
    }

    private _removeRoom(e: Event) {
        e.stopPropagation();
        const event = new CustomEvent('room-remove', {
            detail: { roomIndex: this.roomIndex },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _dispatchUpdate(updatedRoom: Room) {
        const event = new CustomEvent('room-update', {
            detail: { roomIndex: this.roomIndex, room: updatedRoom },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }
}
