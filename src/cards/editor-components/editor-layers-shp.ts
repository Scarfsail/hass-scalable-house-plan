import { LitElement, html, css } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { sharedStyles } from "./shared-styles";
import type { Layer } from "../scalable-house-plan";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import "./editor-layer-shp";

@customElement("editor-layers-shp")
export class EditorLayersShp extends LitElement {
    @property({ attribute: false }) hass!: HomeAssistant;
    @property({ attribute: false }) layers: Layer[] = [];
    @state() private _expandedLayers: Set<number> = new Set();

    static styles = [
        sharedStyles,
        css`
            .layers-container {
                display: flex;
                flex-direction: column;
                gap: 12px;
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

                <div class="layers-container">
                    ${this.layers.map((layer, index) => html`
                        <editor-layer-shp
                            .hass=${this.hass}
                            .layer=${layer}
                            .index=${index}
                            .isExpanded=${this._expandedLayers.has(index)}
                            @layer-toggle=${this._handleLayerToggle}
                            @layer-update=${this._handleLayerUpdate}
                            @layer-remove=${this._handleLayerRemove}
                        ></editor-layer-shp>
                    `)}
                    ${this.layers.length === 0 ? html`
                        <div class="empty-state">
                            <ha-icon icon="mdi:layers-off-outline"></ha-icon>
                            <div>No layers defined. Layers are optional.</div>
                            <div style="font-size: 12px; color: var(--secondary-text-color); margin-top: 4px;">
                                Elements can reference layers by ID for visibility control.
                            </div>
                        </div>
                    ` : ''}
                </div>
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

    private _handleLayerToggle(e: CustomEvent) {
        const { index } = e.detail;
        if (this._expandedLayers.has(index)) {
            this._expandedLayers.delete(index);
        } else {
            this._expandedLayers.add(index);
        }
        this.requestUpdate();
    }

    private _handleLayerUpdate(e: CustomEvent) {
        const { index, property, value } = e.detail;
        const updatedLayer = { ...this.layers[index], [property]: value };
        
        const event = new CustomEvent('layer-update', {
            detail: { layerIndex: index, layer: updatedLayer },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleLayerRemove(e: CustomEvent) {
        const { index } = e.detail;
        const event = new CustomEvent('layer-remove', {
            detail: { layerIndex: index },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }
}
