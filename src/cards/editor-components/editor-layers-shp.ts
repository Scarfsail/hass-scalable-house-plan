import { LitElement, html, css } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "./shared-styles";
import type { Layer } from "../scalable-house-plan";
import type { HomeAssistant } from "../../../hass-frontend/src/types";

@customElement("editor-layers-shp")
export class EditorLayersShp extends LitElement {
    @property({ attribute: false }) hass!: HomeAssistant;
    @property({ type: Array }) layers: Layer[] = [];

    static styles = [
        sharedStyles,
        css`
            .layer-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                background: var(--secondary-background-color);
                border-radius: 8px;
                margin-bottom: 8px;
            }

            .layer-item:hover {
                background: var(--divider-color);
            }

            .layer-id {
                font-family: monospace;
                color: var(--secondary-text-color);
                font-size: 12px;
            }

            .layer-name {
                flex: 1;
            }
        `
    ];

    protected render() {
        return html`
            <div class="config-section">
                <div class="section-header">
                    <div class="section-title">
                        <ha-icon icon="mdi:layers-outline"></ha-icon>
                        Layers (Optional) - ${this.layers.length}
                    </div>
                    <ha-icon-button
                        class="add-button"
                        @click=${this._addLayer}
                    >
                        <ha-icon icon="mdi:plus"></ha-icon>
                    </ha-icon-button>
                </div>

                ${this.layers.length === 0 
                    ? html`
                        <div class="empty-state">
                            <ha-icon icon="mdi:layers-off-outline"></ha-icon>
                            <div>No layers defined. Layers are optional.</div>
                            <div style="font-size: 12px; color: var(--secondary-text-color); margin-top: 4px;">
                                Elements can reference layers by ID for visibility control.
                            </div>
                        </div>
                    `
                    : html`
                        <div class="layers-list">
                            ${this.layers.map((layer, index) => html`
                                <div class="layer-item">
                                    <ha-icon icon=${layer.icon || "mdi:layers"}></ha-icon>
                                    <div style="flex: 1;">
                                        <div class="layer-name">${layer.name}</div>
                                        <div class="layer-id">ID: ${layer.id}</div>
                                    </div>
                                    <ha-icon-button
                                        @click=${() => this._editLayer(index)}
                                    >
                                        <ha-icon icon="mdi:pencil"></ha-icon>
                                    </ha-icon-button>
                                    <ha-icon-button
                                        @click=${() => this._removeLayer(index)}
                                    >
                                        <ha-icon icon="mdi:delete"></ha-icon>
                                    </ha-icon-button>
                                </div>
                            `)}
                        </div>
                    `
                }
            </div>
        `;
    }

    private _addLayer() {
        const event = new CustomEvent('layer-add', {
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _editLayer(index: number) {
        // For now, just log - will implement full editor in later phase
        console.log('Edit layer', index, this.layers[index]);
    }

    private _removeLayer(index: number) {
        const event = new CustomEvent('layer-remove', {
            detail: { layerIndex: index },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }
}
