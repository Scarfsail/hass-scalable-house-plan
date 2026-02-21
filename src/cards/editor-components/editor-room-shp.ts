import { LitElement, html, css } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { sharedStyles } from "./shared-styles";
import type { Room } from "../types";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import { getRoomIcon, getRoomName } from "../../utils";
import { getLocalizeFunction, type LocalizeFunction } from "../../localize";
import "./editor-elements-shp";

@customElement("editor-room-shp")
export class EditorRoomShp extends LitElement {
    @property({ attribute: false }) hass!: HomeAssistant;
    @property({ attribute: false }) room!: Room;
    @property({ type: Number }) roomIndex!: number;
    @property({ type: String }) selectedElementKey?: string | null; // Currently selected element key (for Task 4)
    @state() private _expanded = false;
    @state() private _expandedSections: Set<string> = new Set(['entities']); // Only entities expanded by default
    @state() private _yamlMode = false;
    @state() private _previewDetailView = false;
    private _localize?: LocalizeFunction;

    private get localize(): LocalizeFunction {
        if (!this._localize) {
            this._localize = getLocalizeFunction(this.hass);
        }
        return this._localize;
    }

    static styles = [
        sharedStyles,
        css`
            .room-header {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 4px 8px;
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

            .room-actions {
                display: flex;
                align-items: center;
                gap: 4px;
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

            .icon-button.toggled {
                background: var(--primary-color);
                color: var(--text-primary-color);
            }

            .icon-button.toggled:hover {
                background: var(--primary-color);
                opacity: 0.9;
            }
        `
    ];

    protected render() {
        return html`
            <div class="room-container">
                <div class="room-header" @click=${this._toggleExpanded}>
                    <ha-icon icon=${this._expanded ? "mdi:chevron-down" : "mdi:chevron-right"}></ha-icon>
                    <ha-icon icon=${getRoomIcon(this.hass, this.room)}></ha-icon>
                    <div class="room-name">${getRoomName(this.hass, this.room) || this.localize('editor.unnamed_room')}</div>
                    <div class="room-actions" @click=${(e: Event) => e.stopPropagation()}>
                        <button 
                            class="icon-button ${this._yamlMode ? 'toggled' : ''}" 
                            @click=${this._toggleYamlMode} 
                            title="${this.localize(`editor.edit_${this._yamlMode ? 'ui' : 'yaml'}`)}"
                        >
                            <ha-icon icon="mdi:playlist-edit"></ha-icon>
                        </button>
                        <button 
                            class="icon-button ${this._previewDetailView ? 'toggled' : ''}" 
                            @click=${this._togglePreviewDetail} 
                            title="${this.localize(this._previewDetailView ? 'editor.hide_detail_preview' : 'editor.show_detail_preview')}"
                        >
                            <ha-icon icon="mdi:eye${this._previewDetailView ? '-off' : ''}"></ha-icon>
                        </button>
                        <button class="icon-button" @click=${this._duplicateRoom} title="${this.localize('editor.duplicate_room')}">
                            <ha-icon icon="mdi:content-duplicate"></ha-icon>
                        </button>

                        <button class="icon-button danger" @click=${this._removeRoom}>
                            <ha-icon icon="mdi:delete"></ha-icon>
                        </button>
                        <ha-icon icon="mdi:drag" class="handle" .disabled=${false} @click=${(e: Event) => e.stopPropagation()}></ha-icon>
                    </div>
                </div>

                ${this._expanded ? html`
                    <div class="room-content">
                        ${this._yamlMode ? html`
                            <ha-yaml-editor
                                .hass=${this.hass}
                                .value=${this.room}
                                auto-update
                                @value-changed=${this._roomYamlChanged}
                            ></ha-yaml-editor>
                        ` : html`
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
                                    ${this.localize('editor.basic_configuration')}
                                </div>
                            </div>
                            <div class="section-content ${this._expandedSections.has('basic') ? 'expanded' : ''}">
                                <div class="room-field">
                                    <ha-area-picker
                                        .hass=${this.hass}
                                        .value=${this.room.area || ""}
                                        .label=${this.localize('editor.home_assistant_area_optional')}
                                        @value-changed=${this._areaChanged}
                                        allow-custom-entity
                                    ></ha-area-picker>
                                </div>
                                ${!this.room.area ? html`
                                    <div class="room-field">
                                        <ha-textfield
                                            label="${this.localize('editor.room_name')}"
                                            .value=${this.room.name || ""}
                                            @input=${this._nameChanged}
                                        ></ha-textfield>
                                    </div>
                                ` : html`
                                    <div class="room-field">
                                        <div class="info-text">
                                            <ha-icon icon="mdi:information-outline"></ha-icon>
                                            ${this.localize('editor.room_name_uses_area')} <strong>${this.hass.areas?.[this.room.area]?.name || this.room.area}</strong>
                                        </div>
                                    </div>
                                `}
                                <div class="room-field">
                                    <ha-formfield
                                        .label=${this.localize('editor.elements_clickable_on_overview')}
                                    >
                                        <ha-switch
                                            .checked=${this.room.elements_clickable_on_overview ?? false}
                                            @change=${this._elementsClickableChanged}
                                        ></ha-switch>
                                    </ha-formfield>
                                </div>
                                <div class="room-field">
                                    <ha-formfield
                                        .label=${this.localize('editor.disable_dynamic_color')}
                                    >
                                        <ha-switch
                                            .checked=${this.room.disable_dynamic_color ?? false}
                                            @change=${this._disableDynamicColorChanged}
                                        ></ha-switch>
                                    </ha-formfield>
                                </div>
                                <div class="room-field">
                                    <ha-formfield
                                        .label=${this.localize('editor.show_as_dashboard')}
                                    >
                                        <ha-switch
                                            .checked=${this.room.show_as_dashboard ?? false}
                                            @change=${this._showAsDashboardChanged}
                                        ></ha-switch>
                                    </ha-formfield>
                                </div>
                                ${this.room.show_as_dashboard ? html`
                                    <div class="room-field">
                                        <ha-select
                                            .label=${this.localize('editor.dashboard_glare')}
                                            .value=${this.room.dashboard_glare ?? 'top-center'}
                                            @selected=${this._dashboardGlareChanged}
                                            @closed=${(e: Event) => e.stopPropagation()}
                                        >
                                            <mwc-list-item value="top-center">
                                                ${this.localize('editor.dashboard_glare_top_center')}
                                            </mwc-list-item>
                                            <mwc-list-item value="left-center">
                                                ${this.localize('editor.dashboard_glare_left_center')}
                                            </mwc-list-item>
                                            <mwc-list-item value="full">
                                                ${this.localize('editor.dashboard_glare_full')}
                                            </mwc-list-item>
                                            <mwc-list-item value="lcd">
                                                ${this.localize('editor.dashboard_glare_lcd')}
                                            </mwc-list-item>
                                        </ha-select>
                                    </div>
                                    <div class="room-field">
                                        <ha-textfield
                                            label="${this.localize('editor.dashboard_overview_opacity')}"
                                            type="number"
                                            min="0"
                                            max="100"
                                            .value=${String(this.room.dashboard_overview_opacity ?? 100)}
                                            @input=${this._dashboardOpacityChanged}
                                            helper-persistent
                                            helper-text="${this.localize('editor.dashboard_overview_opacity_helper')}"
                                        ></ha-textfield>
                                    </div>
                                ` : ''}
                                <div class="room-field">
                                    <div class="color-field-wrapper">
                                        <ha-textfield
                                            label="${this.localize('editor.room_color')}"
                                            .value=${this.room.color || ''}
                                            @input=${this._colorChanged}
                                            placeholder="rgba(100, 150, 200, 0.3)"
                                            helper-persistent
                                            helper-text="${this.localize('editor.room_color_helper')}"
                                        ></ha-textfield>
                                        <div class="color-swatch"
                                             style="background-color: ${this.room.color || 'transparent'}"
                                             title="${this.room.color || ''}">
                                        </div>
                                    </div>
                                </div>
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
                                    ${this.localize('editor.boundary_points_count').replace('{count}', ((this.room.boundary || []).length).toString())}
                                </div>
                                <button
                                    class="add-button"
                                    @click=${(e: Event) => { e.stopPropagation(); this._addBoundaryPoint(); }}
                                >
                                    <ha-icon icon="mdi:plus"></ha-icon>
                                    ${this.localize('editor.add_point')}
                                </button>
                            </div>
                            <div class="section-content ${this._expandedSections.has('boundary') ? 'expanded' : ''}">
                                <div class="boundary-points">
                                    ${(this.room.boundary || []).map((point, index) => html`
                                        <div class="boundary-point">
                                            <ha-textfield
                                                label="${this.localize('editor.x_coordinate')}"
                                                type="number"
                                                .value=${point[0]}
                                                @input=${(e: Event) => this._boundaryPointChanged(index, 0, e)}
                                            ></ha-textfield>
                                            <ha-textfield
                                                label="${this.localize('editor.y_coordinate')}"
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
                                    ${this.localize('editor.entities_elements_count').replace('{count}', ((this.room.entities || []).length).toString())}
                                </div>
                                <button
                                    class="add-button"
                                    @click=${(e: Event) => { e.stopPropagation(); this._handleElementAdd(); }}
                                >
                                    <ha-icon icon="mdi:plus"></ha-icon>
                                    ${this.localize('editor.add_entity_element')}
                                </button>
                            </div>
                            <div class="section-content ${this._expandedSections.has('entities') ? 'expanded' : ''}">
                                <editor-elements-shp
                                    .hass=${this.hass}
                                    .elements=${this.room.entities || []}
                                    .areaId=${this.room.area}
                                    .hideHeader=${true}
                                    .selectedElementKey=${this.selectedElementKey}
                                    .roomIndex=${this.roomIndex}
                                    @elements-add=${this._handleElementAdd}
                                    @elements-update=${this._handleElementsUpdate}
                                    @elements-remove=${this._handleElementRemove}
                                    @elements-reorder=${this._handleElementsReorder}
                                ></editor-elements-shp>
                            </div>
                        </div>
                        `}
                    </div>
                ` : ''}
            </div>
        `;
    }

    private _toggleExpanded() {
        this._expanded = !this._expanded;
    }

    private _toggleYamlMode(e: Event) {
        e.stopPropagation();
        this._yamlMode = !this._yamlMode;
    }

    private _togglePreviewDetail(e: Event) {
        e.stopPropagation();
        this._previewDetailView = !this._previewDetailView;
        
        // Dispatch event to notify parent about preview state
        this._dispatchPreviewEvent(this._previewDetailView);
    }

    private _roomYamlChanged(e: CustomEvent) {
        const updatedRoom = e.detail.value as Room;
        this._dispatchUpdate(updatedRoom);
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

    private _elementsClickableChanged(e: Event) {
        const target = e.target as HTMLInputElement;
        this._dispatchUpdate({ ...this.room, elements_clickable_on_overview: target.checked });
    }

    private _disableDynamicColorChanged(e: Event) {
        const target = e.target as HTMLInputElement;
        this._dispatchUpdate({ ...this.room, disable_dynamic_color: target.checked });
    }

    private _showAsDashboardChanged(e: Event) {
        const target = e.target as HTMLInputElement;
        this._dispatchUpdate({ ...this.room, show_as_dashboard: target.checked });
    }

    private _dashboardGlareChanged(e: CustomEvent) {
        // ha-select fires @selected with {index} in e.detail, not {value}.
        // The actual string value is on the element's .value property.
        const value = (e.target as HTMLSelectElement).value as 'top-center' | 'left-center' | 'full' | 'lcd';
        if (value) this._dispatchUpdate({ ...this.room, dashboard_glare: value });
    }

    private _dashboardOpacityChanged(e: Event) {
        const target = e.target as HTMLInputElement;
        this._dispatchUpdate({ ...this.room, dashboard_overview_opacity: Number(target.value) });
    }

    private _colorChanged(e: Event) {
        const value = (e.target as HTMLInputElement).value.trim();
        this._dispatchUpdate({ ...this.room, color: value || undefined });
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

    private _handleElementAdd(_e?: CustomEvent) {
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

    private _duplicateRoom(e: Event) {
        e.stopPropagation();
        const event = new CustomEvent('room-duplicate', {
            detail: { roomIndex: this.roomIndex, room: this.room },
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

    private _dispatchPreviewEvent(showPreview: boolean) {
        const event = new CustomEvent('room-preview-detail', {
            detail: { roomIndex: this.roomIndex, showPreview },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    /**
     * Phase 4: Public method to expand element in room
     * Called from parent rooms editor when element is clicked in preview
     * @param parentGroupKey - Optional parent group key for nested selections
     */
    public expandElementInRoom(uniqueKey: string, parentGroupKey?: string): void {
        // Ensure room is expanded first
        this._expanded = true;
        this.requestUpdate();

        // Call child editor-elements-shp to expand the element
        this.updateComplete.then(() => {
            const elementsEditor = this.shadowRoot?.querySelector('editor-elements-shp');
            (elementsEditor as any)?.expandElementByKey?.(uniqueKey, parentGroupKey);
        });
    }
}
