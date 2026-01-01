import { LitElement, html, css } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { sharedStyles } from "./shared-styles";
import type { Room } from "../scalable-house-plan";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import "./editor-elements-shp";

@customElement("editor-room-shp")
export class EditorRoomShp extends LitElement {
    @property({ attribute: false }) hass!: HomeAssistant;
    @property({ attribute: false }) room!: Room;
    @property({ type: Number }) roomIndex!: number;
    @state() private _expanded = false;
    @state() private _expandedSections: Set<string> = new Set(['entities']); // Only entities expanded by default

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
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-top: 8px;
            }

            .boundary-point {
                display: flex;
                gap: 4px;
                align-items: center;
            }

            .boundary-point ha-textfield {
                flex: 1;
            }

            .info-text {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                background: var(--primary-background-color);
                border-radius: 4px;
                color: var(--secondary-text-color);
                font-size: 14px;
            }

            .info-text ha-icon {
                --mdc-icon-size: 18px;
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
                        <!-- Basic Configuration Section -->
                        <div class="config-section collapsible-section">
                            <div class="section-header ${this._expandedSections.has('basic') ? 'expanded' : ''}" 
                                 @click=${() => this._toggleSection('basic')}>
                                <div class="section-title">
                                    <ha-icon 
                                        icon="mdi:chevron-right" 
                                        class="expand-icon ${this._expandedSections.has('basic') ? 'expanded' : ''}"
                                    ></ha-icon>
                                    <ha-icon icon="mdi:cog"></ha-icon>
                                    Basic Configuration
                                </div>
                            </div>
                            <div class="section-content ${this._expandedSections.has('basic') ? 'expanded' : ''}">
                                <div class="room-field">
                                    <ha-area-picker
                                        .hass=${this.hass}
                                        .value=${this.room.area || ""}
                                        .label=${"Home Assistant Area (optional)"}
                                        @value-changed=${this._areaChanged}
                                        allow-custom-entity
                                    ></ha-area-picker>
                                </div>
                                ${!this.room.area ? html`
                                    <div class="room-field">
                                        <ha-textfield
                                            label="Room Name"
                                            .value=${this.room.name || ""}
                                            @input=${this._nameChanged}
                                        ></ha-textfield>
                                    </div>
                                ` : html`
                                    <div class="room-field">
                                        <div class="info-text">
                                            <ha-icon icon="mdi:information-outline"></ha-icon>
                                            Room name will use area name: <strong>${this.hass.areas?.[this.room.area]?.name || this.room.area}</strong>
                                        </div>
                                    </div>
                                `}
                            </div>
                        </div>

                        <!-- Boundary Points Section -->
                        <div class="config-section collapsible-section">
                            <div class="section-header ${this._expandedSections.has('boundary') ? 'expanded' : ''}" 
                                 @click=${() => this._toggleSection('boundary')}>
                                <div class="section-title">
                                    <ha-icon 
                                        icon="mdi:chevron-right" 
                                        class="expand-icon ${this._expandedSections.has('boundary') ? 'expanded' : ''}"
                                    ></ha-icon>
                                    <ha-icon icon="mdi:vector-polygon"></ha-icon>
                                    Boundary Points - ${(this.room.boundary || []).length}
                                </div>
                                <button
                                    class="add-button"
                                    @click=${(e: Event) => { e.stopPropagation(); this._addBoundaryPoint(); }}
                                >
                                    <ha-icon icon="mdi:plus"></ha-icon>
                                    Add Point
                                </button>
                            </div>
                            <div class="section-content ${this._expandedSections.has('boundary') ? 'expanded' : ''}">
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
                        </div>

                        <!-- Entities Section -->
                        <div class="config-section collapsible-section">
                            <div class="section-header ${this._expandedSections.has('entities') ? 'expanded' : ''}" 
                                 @click=${() => this._toggleSection('entities')}>
                                <div class="section-title">
                                    <ha-icon 
                                        icon="mdi:chevron-right" 
                                        class="expand-icon ${this._expandedSections.has('entities') ? 'expanded' : ''}"
                                    ></ha-icon>
                                    <ha-icon icon="mdi:puzzle"></ha-icon>
                                    Entities - ${(this.room.entities || []).length}
                                </div>
                                <button
                                    class="add-button"
                                    @click=${(e: Event) => { e.stopPropagation(); this._handleElementAdd(); }}
                                >
                                    <ha-icon icon="mdi:plus"></ha-icon>
                                    Add Entity
                                </button>
                            </div>
                            <div class="section-content ${this._expandedSections.has('entities') ? 'expanded' : ''}">
                                <editor-elements-shp
                                    .hass=${this.hass}
                                    .elements=${this.room.entities || []}
                                    .hideHeader=${true}
                                    @elements-add=${this._handleElementAdd}
                                    @elements-update=${this._handleElementsUpdate}
                                    @elements-remove=${this._handleElementRemove}
                                    @elements-reorder=${this._handleElementsReorder}
                                ></editor-elements-shp>
                            </div>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    private _toggleExpanded() {
        this._expanded = !this._expanded;
    }

    private _toggleSection(section: string): void {
        if (this._expandedSections.has(section)) {
            this._expandedSections.delete(section);
        } else {
            this._expandedSections.add(section);
        }
        this.requestUpdate();
    }

    private _nameChanged(e: Event) {
        const target = e.target as HTMLInputElement;
        this._dispatchUpdate({ ...this.room, name: target.value });
    }

    private _areaChanged(e: CustomEvent) {
        const area = e.detail.value || undefined;
        this._dispatchUpdate({ ...this.room, area });
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

    private _handleElementAdd(e?: CustomEvent) {
        // Add a new entity to the room
        const newEntity: string = "";  // Start with empty string (entity_id)
        const entities = [...(this.room.entities || []), newEntity];
        this._dispatchUpdate({ ...this.room, entities });
    }

    private _handleElementsUpdate(e: CustomEvent) {
        // Handle single element update
        const { index, element } = e.detail;
        if (index !== undefined && element !== undefined) {
            const entities = [...(this.room.entities || [])];
            entities[index] = element;
            this._dispatchUpdate({ ...this.room, entities });
        } else if (e.detail.elements !== undefined) {
            // Handle bulk update (for backwards compatibility)
            this._dispatchUpdate({ ...this.room, entities: e.detail.elements });
        }
    }

    private _handleElementRemove(e: CustomEvent) {
        const entities = [...(this.room.entities || [])];
        entities.splice(e.detail.index, 1);
        this._dispatchUpdate({ ...this.room, entities });
    }

    private _handleElementsReorder(e: CustomEvent) {
        this._dispatchUpdate({ ...this.room, entities: e.detail.elements });
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
