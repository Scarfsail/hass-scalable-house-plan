import { html, css } from "lit"
import { customElement, property } from "lit/decorators.js";
import { ElementBase, ElementBaseConfig } from "./base";
import type { Layer } from "../cards/scalable-house-plan";

interface ScalableHousePlanLayersConfig extends ElementBaseConfig {
    layers?: Layer[];
    _layerVisibility?: Map<string, boolean>;
}

@customElement("scalable-house-plan-layers")
export class ScalableHousePlanLayersElement extends ElementBase<ScalableHousePlanLayersConfig> {
    @property({ attribute: false }) layers: Layer[] = [];
    @property({ attribute: false }) _layerVisibility: Map<string, boolean> = new Map();

    async setConfig(config: ScalableHousePlanLayersConfig): Promise<void> {
        await super.setConfig(config);
        
        // Get layers and visibility from config if passed directly
        if (config.layers) {
            this.layers = config.layers;
        }
        if (config._layerVisibility) {
            this._layerVisibility = config._layerVisibility;
        }
    }

    static styles = css`
        :host {
            display: block;
            opacity:0.9;
        }

        .layers-control {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
        }

        .layer-button {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px 3px;
            border-radius: 15px;
            transition: all 0.2s ease;
            border: 2px solid var(--divider-color);
            background: black;
            color: var(--primary-text-color);
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            font-weight: 500;
        }

        .layer-button:hover {
            background: var(--secondary-background-color);
        }

        .layer-button.active {
            background: black;
            color: var(--primary-color);
            border-color: color-mix(in srgb, var(--primary-color) 30%, var(--divider-color));
        }
        

        .layer-button.inactive {
            background: black;
            color: var(--disabled-text-color);
            border-color: var(--disabled-color);
            opacity: 0.6;
        }

        .layer-icon {
            padding-left:7px
        }

        .layer-name {
            white-space: nowrap;
        }

        .empty-state {
            text-align: center;
            padding: 20px;
            color: var(--secondary-text-color);
            font-size: 14px;
        }

        .empty-state ha-icon {
            --mdc-icon-size: 24px;
            margin-bottom: 8px;
            opacity: 0.5;
        }
    `;

    connectedCallback() {
        super.connectedCallback();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
    }

    private _toggleLayer(layerId: string) {
        // Toggle visibility in our local map
        const currentVisibility = this._layerVisibility.get(layerId) ?? true;
        this._layerVisibility.set(layerId, !currentVisibility);
        
        // Dispatch event to parent card to update its state
        const event = new CustomEvent('layer-visibility-changed', {
            detail: { layerId, visible: !currentVisibility },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
        
        // Update display
        this.requestUpdate();
    }

    private _getLayerVisibility(layerId: string): boolean {
        return this._layerVisibility.get(layerId) ?? true;
    }

    protected override renderContent() {
        // Filter layers to only show those with showInToggles: true
        const toggleableLayers = this.layers?.filter(layer => layer.showInToggles) || [];

        if (toggleableLayers.length === 0) {
            return html`
                <div class="empty-state">
                    <ha-icon icon="mdi:layers"></ha-icon>
                    <div>No toggleable layers configured</div>
                </div>
            `;
        }

        return html`
            <div class="layers-control">
                ${toggleableLayers.map((layer) => {
                    const isVisible = this._getLayerVisibility(layer.id);
                    return html`
                        <button
                            class="layer-button ${isVisible ? 'active' : 'inactive'}"
                            @click=${() => this._toggleLayer(layer.id)}
                            type="button"
                        >
                            <ha-icon icon="${layer.icon}" class="layer-icon"></ha-icon>
                            <span class="layer-name">${layer.name}</span>
                        </button>
                    `;
                })}
            </div>
        `;
    }
}
