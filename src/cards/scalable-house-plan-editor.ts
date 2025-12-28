import { LitElement, html, css } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { LovelaceCardEditor } from "../../hass-frontend/src/panels/lovelace/types";
import type { ScalableHousePlanConfig, Layer, Room } from "./scalable-house-plan";
import { sharedStyles } from "./editor-components/shared-styles";
import "./editor-components/editor-layers-shp";
import "./editor-components/editor-rooms-shp";

@customElement("scalable-house-plan-editor")
export class ScalableHousePlanEditor extends LitElement implements LovelaceCardEditor {
    @property({ attribute: false }) public hass!: HomeAssistant;
    @state() private _config!: ScalableHousePlanConfig;

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
            return html`<div>Loading...</div>`;
        }

        return html`
            <div class="card-config">
                <!-- Basic Configuration Section -->
                <div class="config-section">
                    <div class="section-header">
                        <div class="section-title">
                            <ha-icon icon="mdi:cog"></ha-icon>
                            Basic Configuration
                        </div>
                    </div>
                    <div class="basic-config">
                        <ha-textfield
                            label="Image URL"
                            .value=${this._config.image || ""}
                            @input=${this._imageChanged}
                            placeholder="https://example.com/image.png"
                        ></ha-textfield>
                        <ha-textfield
                            label="Image Width"
                            type="number"
                            .value=${this._config.image_width || 1360}
                            @input=${this._imageWidthChanged}
                        ></ha-textfield>
                        <ha-textfield
                            label="Image Height"
                            type="number"
                            .value=${this._config.image_height || 849}
                            @input=${this._imageHeightChanged}
                        ></ha-textfield>
                        <ha-textfield
                            label="Max Scale"
                            type="number"
                            step="0.1"
                            .value=${this._config.max_scale || 3}
                            @input=${this._maxScaleChanged}
                        ></ha-textfield>
                        <ha-textfield
                            label="Layer State Persistence ID"
                            .value=${this._config.layers_visibility_persistence_id || ""}
                            @input=${this._persistenceIdChanged}
                            placeholder="default (leave empty to share state)"
                            helper-text="Unique ID for layer visibility state. Same ID = shared state across cards."
                        ></ha-textfield>
                    </div>
                </div>

                <!-- Layers Section (Optional) -->
                <editor-layers-shp
                    .hass=${this.hass}
                    .layers=${this._config.layers || []}
                    @layer-add=${this._addLayer}
                    @layer-update=${this._updateLayer}
                    @layer-remove=${this._removeLayer}
                ></editor-layers-shp>

                <!-- Rooms Section -->
                <editor-rooms-shp
                    .hass=${this.hass}
                    .rooms=${this._config.rooms || []}
                    @room-add=${this._addRoom}
                    @room-update=${this._updateRoom}
                    @room-remove=${this._removeRoom}
                ></editor-rooms-shp>
            </div>
        `;
    }

    // Layer handlers
    private _addLayer(): void {
        const newLayer: Layer = {
            id: `layer_${Date.now()}`,
            name: "New Layer",
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
            name: "New Room",
            boundary: [
                [100, 100],
                [300, 100],
                [300, 200],
                [100, 200]
            ],
            elements: []
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

    private _maxScaleChanged(ev: any): void {
        this._config = { ...this._config, max_scale: parseFloat(ev.target.value) || 3 };
        this._configChanged();
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

    private _configChanged(): void {
        const event = new CustomEvent("config-changed", {
            detail: { config: this._config },
            bubbles: true,
            composed: true,
        });
        this.dispatchEvent(event);
    }
}
