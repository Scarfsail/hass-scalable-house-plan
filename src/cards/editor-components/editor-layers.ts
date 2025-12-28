import { LitElement, html, css } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "./shared-styles";
import { DragDropMixin } from "./drag-drop-mixin";
import type { Layer } from "../scalable-house-plan";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import "./editor-layer";

@customElement("editor-layers")
export class EditorLayers extends LitElement {
    @property({ attribute: false }) hass!: HomeAssistant;
    @property({ type: Array }) layers: Layer[] = [];
    @property({ attribute: false }) expandedLayers: Set<number> = new Set();

    static styles = [
        sharedStyles,
        css`
            :host {
                display: block;
            }
        `
    ];

    protected render() {
        return html`
            <div class="config-section">
                <div class="section-header">
                    <div class="section-title">
                        <ha-icon icon="mdi:layers"></ha-icon>
                        Layers (${this.layers.length})
                    </div>
                    <button class="add-button" @click=${this._addLayer}>
                        <ha-icon icon="mdi:plus"></ha-icon>
                        Add Layer
                    </button>
                </div>

                ${this.layers.length === 0 
                    ? this._renderEmptyState()
                    : html`
                        <ha-sortable 
                            handle-selector=".handle"
                            draggable-selector=".layer-item"
                            @item-moved=${(ev: any) => this._handleLayersReorder(ev)}
                            @item-added=${(ev: any) => this._handleLayerAdded(ev)}
                            @item-removed=${(ev: any) => this._handleLayerRemoved(ev)}
                            group="layers"
                            .disabled=${false}
                        >
                            <div class="layers-list">
                                ${this.layers.map((layer, index) => html`
                                    <editor-layer
                                        class="layer-item"
                                        .hass=${this.hass}
                                        .layer=${layer}
                                        .index=${index}
                                        .isExpanded=${this.expandedLayers.has(index)}
                                        @layer-toggle=${this._handleLayerToggle}
                                        @layer-update=${this._handleLayerUpdate}
                                        @layer-remove=${this._handleLayerRemove}
                                    ></editor-layer>
                                `)}
                            </div>
                        </ha-sortable>
                    `
                }
            </div>
        `;
    }

    private _renderEmptyState() {
        return html`
            <div class="empty-state">
                <ha-icon icon="mdi:layers"></ha-icon>
                <div class="empty-state-title">No layers created</div>
                <div class="empty-state-subtitle">
                    Layers help organize your picture elements into logical groups
                </div>
            </div>
        `;
    }

    private _addLayer() {
        const event = new CustomEvent('layers-add', {
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleLayerToggle(e: CustomEvent) {
        const event = new CustomEvent('layers-toggle', {
            detail: e.detail,
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleLayerUpdate(e: CustomEvent) {
        const event = new CustomEvent('layers-update', {
            detail: e.detail,
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleLayerRemove(e: CustomEvent) {
        const event = new CustomEvent('layers-remove', {
            detail: e.detail,
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleLayersReorder(e: CustomEvent) {
        e.stopPropagation();
        const { oldIndex, newIndex } = e.detail;
        const reorderedLayers = DragDropMixin.reorderArray(this.layers, oldIndex, newIndex);
        
        const event = new CustomEvent('layers-reorder', {
            detail: { layers: reorderedLayers },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleLayerAdded(e: CustomEvent) {
        // Store the added layer info for cross-container moves
        const event = new CustomEvent('layer-added', {
            detail: { 
                index: e.detail.index,
                timestamp: Date.now()
            },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleLayerRemoved(e: CustomEvent) {
        // Handle layer removal for cross-container moves  
        const event = new CustomEvent('layer-removed', {
            detail: { 
                index: e.detail.index,
                timestamp: Date.now()
            },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }
}
