import { LitElement, html, css } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { LovelaceCardEditor } from "../../hass-frontend/src/panels/lovelace/types";
import type { ScalableHousePlanConfig, Layer, Room } from "./scalable-house-plan";
import { sharedStyles } from "./editor-components/shared-styles";
import { loadHaEntityPicker } from "../utils/load-ha-elements";
import { getLocalizeFunction } from "../localize";
import "./editor-components/editor-layers-shp";
import "./editor-components/editor-rooms-shp";

@customElement("scalable-house-plan-editor")
export class ScalableHousePlanEditor extends LitElement implements LovelaceCardEditor {
    @property({ attribute: false }) public hass!: HomeAssistant;
    @state() private _config!: ScalableHousePlanConfig;
    @state() private _expandedSections: Set<string> = new Set(['rooms']);

    async connectedCallback() {
        super.connectedCallback();
        // Load ha-entity-picker once for all element editors
        await loadHaEntityPicker();
    }

    static styles = [
        sharedStyles,
        css`
            .basic-config {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px;
            }

            .basic-config ha-textfield {
                width: 100%;
            }

            /* Make persistence ID field span full width for better UX */
            .basic-config ha-textfield[label="Layer State Persistence ID"] {
                grid-column: 1 / -1;
            }
        `
    ];

    public setConfig(config: ScalableHousePlanConfig): void {
        this._config = { 
            ...config,
            layers: config.layers || [],
            rooms: config.rooms || []
        };
    }

    protected render() {
        if (!this._config) {
            return html`<div>${getLocalizeFunction(this.hass)('editor.loading')}</div>`;
        }

        return html`
            <div class="card-config">
                <!-- Basic Configuration Section -->
                <div class="config-section collapsible-section">
                    <div class="section-header ${this._expandedSections.has('basic') ? 'expanded' : ''}" @click=${() => this._toggleSection('basic')}>
                        <div class="section-title">
                            <ha-icon 
                                icon="mdi:chevron-right" 
                                class="expand-icon ${this._expandedSections.has('basic') ? 'expanded' : ''}"
                            ></ha-icon>
                            <ha-icon icon="mdi:cog"></ha-icon>
                            ${getLocalizeFunction(this.hass)('editor.basic_configuration')}
                        </div>
                    </div>
                    <div class="section-content ${this._expandedSections.has('basic') ? 'expanded' : ''}">
                        <div class="basic-config">
                        <ha-textfield
                            label="${getLocalizeFunction(this.hass)('editor.image_url')}"
                            .value=${this._config.image || ""}
                            @input=${this._imageChanged}
                            placeholder="${getLocalizeFunction(this.hass)('editor.image_url_placeholder')}"
                        ></ha-textfield>
                        <ha-textfield
                            label="${getLocalizeFunction(this.hass)('editor.image_width')}"
                            type="number"
                            .value=${this._config.image_width || 1360}
                            @input=${this._imageWidthChanged}
                        ></ha-textfield>
                        <ha-textfield
                            label="${getLocalizeFunction(this.hass)('editor.image_height')}"
                            type="number"
                            .value=${this._config.image_height || 849}
                            @input=${this._imageHeightChanged}
                        ></ha-textfield>
                        <ha-textfield
                            label="${getLocalizeFunction(this.hass)('editor.min_scale')}"
                            type="number"
                            step="0.1"
                            .value=${this._config.min_scale || 0.5}
                            @input=${this._minScaleChanged}
                        ></ha-textfield>
                        <ha-textfield
                            label="${getLocalizeFunction(this.hass)('editor.max_scale')}"
                            type="number"
                            step="0.1"
                            .value=${this._config.max_scale || 3}
                            @input=${this._maxScaleChanged}
                        ></ha-textfield>
                        <ha-textfield
                            label="${getLocalizeFunction(this.hass)('editor.element_detail_scale_ratio')}"
                            type="number"
                            step="0.05"
                            min="0"
                            max="1"
                            .value=${this._config.element_detail_scale_ratio ?? 0.1}
                            @input=${this._elementDetailScaleRatioChanged}
                            helper-text="${getLocalizeFunction(this.hass)('editor.element_detail_scale_ratio_helper')}"
                        ></ha-textfield>
                        <ha-textfield
                            label="${getLocalizeFunction(this.hass)('editor.layer_state_persistence_id')}"
                            .value=${this._config.layers_visibility_persistence_id || ""}
                            @input=${this._persistenceIdChanged}
                            placeholder="${getLocalizeFunction(this.hass)('editor.layer_state_persistence_placeholder')}"
                            helper-text="${getLocalizeFunction(this.hass)('editor.layer_state_persistence_helper')}"
                        ></ha-textfield>
                        <ha-formfield label="${getLocalizeFunction(this.hass)('editor.show_room_backgrounds')}">
                            <ha-switch
                                .checked=${this._config.show_room_backgrounds || false}
                                @change=${this._showRoomBackgroundsChanged}
                            ></ha-switch>
                        </ha-formfield>
                        </div>
                    </div>
                </div>

                <!-- Layers Section (Optional) -->
                <div class="config-section collapsible-section">
                    <div class="section-header ${this._expandedSections.has('layers') ? 'expanded' : ''}" @click=${() => this._toggleSection('layers')}>
                        <div class="section-title">
                            <ha-icon 
                                icon="mdi:chevron-right" 
                                class="expand-icon ${this._expandedSections.has('layers') ? 'expanded' : ''}"
                            ></ha-icon>
                            <ha-icon icon="mdi:layers-outline"></ha-icon>
                            ${getLocalizeFunction(this.hass)('editor.layers_count').replace('{count}', (this._config.layers?.length || 0).toString())}
                        </div>
                        <button
                            class="add-button"
                            @click=${(e: Event) => { e.stopPropagation(); this._addLayer(); }}
                        >
                            <ha-icon icon="mdi:plus"></ha-icon>
                            ${getLocalizeFunction(this.hass)('editor.add_layer')}
                        </button>
                    </div>
                    <div class="section-content ${this._expandedSections.has('layers') ? 'expanded' : ''}">
                                <editor-layers-shp
                            .hass=${this.hass}
                            .layers=${this._config.layers || []}
                            @layer-add=${this._addLayer}
                            @layer-update=${this._updateLayer}
                            @layer-remove=${this._removeLayer}
                        ></editor-layers-shp>
                    </div>
                </div>

                <!-- Rooms Section -->
                <div class="config-section collapsible-section">
                    <div class="section-header ${this._expandedSections.has('rooms') ? 'expanded' : ''}" @click=${() => this._toggleSection('rooms')}>
                        <div class="section-title">
                            <ha-icon 
                                icon="mdi:chevron-right" 
                                class="expand-icon ${this._expandedSections.has('rooms') ? 'expanded' : ''}"
                            ></ha-icon>
                            <ha-icon icon="mdi:floor-plan"></ha-icon>
                            ${getLocalizeFunction(this.hass)('editor.rooms_count').replace('{count}', (this._config.rooms?.length || 0).toString())}
                        </div>
                        <button
                            class="add-button"
                            @click=${(e: Event) => { e.stopPropagation(); this._addRoom(); }}
                        >
                            <ha-icon icon="mdi:plus"></ha-icon>
                            ${getLocalizeFunction(this.hass)('editor.add_room')}
                        </button>
                    </div>
                    <div class="section-content ${this._expandedSections.has('rooms') ? 'expanded' : ''}">
                                <editor-rooms-shp
                            .hass=${this.hass}
                            .rooms=${this._config.rooms || []}
                            @room-add=${this._addRoom}
                            @room-update=${this._updateRoom}
                            @room-remove=${this._removeRoom}
                        ></editor-rooms-shp>
                    </div>
                </div>
            </div>
        `;
    }

    // Section toggle handler
    private _toggleSection(section: string): void {
        if (this._expandedSections.has(section)) {
            this._expandedSections.delete(section);
        } else {
            this._expandedSections.add(section);
        }
        this.requestUpdate();
    }

    // Layer handlers
    private _addLayer(): void {
        const newLayer: Layer = {
            id: `layer_${Date.now()}`,
            name: getLocalizeFunction(this.hass)('editor.new_layer'),
            icon: "mdi:layers",
            visible: true,
            showInToggles: true
        };

        this._config = {
            ...this._config,
            layers: [...(this._config.layers || []), newLayer]
        };
        
        this._configChanged();
    }

    private _updateLayer(ev: CustomEvent): void {
        const { layerIndex, layer } = ev.detail;
        const layers = [...(this._config.layers || [])];
        layers[layerIndex] = layer;

        this._config = {
            ...this._config,
            layers
        };

        this._configChanged();
    }

    private _removeLayer(ev: CustomEvent): void {
        const { layerIndex } = ev.detail;
        const layers = [...(this._config.layers || [])];
        layers.splice(layerIndex, 1);

        this._config = {
            ...this._config,
            layers
        };

        this._configChanged();
    }

    // Room handlers
    private _addRoom(): void {
        const newRoom: Room = {
            name: getLocalizeFunction(this.hass)('editor.new_room'),
            boundary: [
                [100, 100],
                [300, 100],
                [300, 200],
                [100, 200]
            ],
            entities: []
        };

        this._config = {
            ...this._config,
            rooms: [...(this._config.rooms || []), newRoom]
        };
        
        this._configChanged();
    }

    private _updateRoom(ev: CustomEvent): void {
        const { roomIndex, room } = ev.detail;
        const rooms = [...(this._config.rooms || [])];
        rooms[roomIndex] = room;

        this._config = {
            ...this._config,
            rooms
        };

        this._configChanged();
    }

    private _removeRoom(ev: CustomEvent): void {
        const { roomIndex } = ev.detail;
        const rooms = [...(this._config.rooms || [])];
        rooms.splice(roomIndex, 1);

        this._config = {
            ...this._config,
            rooms
        };

        this._configChanged();
    }

    // Basic config change handlers
    private _imageChanged(ev: any): void {
        this._config = { ...this._config, image: ev.target.value };
        this._configChanged();
    }

    private _imageWidthChanged(ev: any): void {
        this._config = { ...this._config, image_width: parseInt(ev.target.value) || 1360 };
        this._configChanged();
    }

    private _imageHeightChanged(ev: any): void {
        this._config = { ...this._config, image_height: parseInt(ev.target.value) || 849 };
        this._configChanged();
    }

    private _minScaleChanged(ev: any): void {
        this._config = { ...this._config, min_scale: parseFloat(ev.target.value) || 0.5 };
        this._configChanged();
    }

    private _maxScaleChanged(ev: any): void {
        this._config = { ...this._config, max_scale: parseFloat(ev.target.value) || 3 };
        this._configChanged();
    }

    private _elementDetailScaleRatioChanged(ev: any): void {
        const value = parseFloat(ev.target.value);
        if (!isNaN(value)) {
            this._config = { ...this._config, element_detail_scale_ratio: Math.max(0, Math.min(1, value)) };
            this._configChanged();
        }
    }

    private _persistenceIdChanged(ev: any): void {
        const value = ev.target.value.trim();
        if (value === '') {
            const { layers_visibility_persistence_id, ...configWithoutId } = this._config;
            this._config = configWithoutId;
        } else {
            this._config = { ...this._config, layers_visibility_persistence_id: value };
        }
        this._configChanged();
    }

    private _showRoomBackgroundsChanged(ev: any): void {
        this._config = { ...this._config, show_room_backgrounds: ev.target.checked };
        this._configChanged();
    }

    private _configChanged(): void {
        const event = new CustomEvent("config-changed", {
            detail: { config: this._config },
            bubbles: true,
            composed: true,
        });
        this.dispatchEvent(event);
    }
}
