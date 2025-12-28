import { LitElement, html, css } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { LovelaceCardEditor } from "../../hass-frontend/src/panels/lovelace/types";
import type { ScalableHousePlanConfig, Layer } from "./scalable-house-plan";
import { sharedStyles } from "./editor-components/shared-styles";
import "./editor-components/editor-layers";
import { CrossContainerCoordinator } from "./editor-components/cross-container-coordinator";

@customElement("scalable-house-plan-editor")
export class ScalableHousePlanEditor extends LitElement implements LovelaceCardEditor {
    @property({ attribute: false }) public hass!: HomeAssistant;
    @state() private _config!: ScalableHousePlanConfig;
    @state() private _expandedLayers: Set<number> = new Set();
    @state() private _pendingAdd: { 
        type: 'element' | 'group';
        layerIndex?: number; 
        groupIndex?: number; 
        index: number; 
        timestamp: number;
    } | null = null;

    private coordinator = CrossContainerCoordinator.getInstance();

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
        // Handle backward compatibility: migrate old groups structure to new layers structure
        if ((config as any).groups && !config.layers?.length) {
            // Create a default layer containing all existing groups
            const defaultLayer: Layer = {
                name: 'Default Layer',
                icon: 'mdi:layers',
                visible: true,
                showInToggles: false,
                groups: (config as any).groups.map((group: any) => ({
                    group_name: group.group_name,
                    elements: group.elements || []
                }))
            };
            
            this._config = {
                ...config,
                layers: [defaultLayer]
            };
        } else {
            this._config = { 
                ...config,
                layers: config.layers || []
            };
        }

        // Set up cross-container coordination callback
        this.coordinator.setConfigUpdateCallback((moveInfo: any) => {
            this._handleCrossContainerMove(moveInfo);
        });
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

                <!-- Layers Section -->
                <editor-layers
                    .hass=${this.hass}
                    .layers=${this._config.layers}
                    .expandedLayers=${this._expandedLayers}
                    @layers-add=${this._addLayer}
                    @layers-toggle=${this._toggleLayer}
                    @layers-update=${this._updateLayer}
                    @layers-remove=${this._removeLayer}
                    @layers-reorder=${this._reorderLayers}
                    @group-added=${this._handleGroupAdded}
                    @group-removed=${this._handleGroupRemoved}
                    @element-added=${this._handleElementAdded}
                    @element-removed=${this._handleElementRemoved}
                ></editor-layers>
            </div>
        `;
    }

    private _addLayer(): void {
        const newLayer: Layer = {
            name: "New Layer",
            icon: "mdi:layer-group",
            visible: true,
            showInToggles: true,
            groups: []
        };

        this._config = {
            ...this._config,
            layers: [...this._config.layers, newLayer]
        };

        // Expand the new layer automatically
        this._expandedLayers.add(this._config.layers.length - 1);
        
        this._configChanged();
    }

    private _toggleLayer(ev: CustomEvent): void {
        const { index } = ev.detail;
        if (this._expandedLayers.has(index)) {
            this._expandedLayers.delete(index);
        } else {
            this._expandedLayers.add(index);
        }
        this.requestUpdate();
    }

    private _updateLayer(ev: CustomEvent): void {
        const { index, property, value } = ev.detail;
        const layers = [...this._config.layers];
        layers[index] = {
            ...layers[index],
            [property]: value
        };

        this._config = {
            ...this._config,
            layers
        };

        this._configChanged();
    }

    private _removeLayer(ev: CustomEvent): void {
        const { index } = ev.detail;
        const layers = [...this._config.layers];
        layers.splice(index, 1);

        this._config = {
            ...this._config,
            layers
        };

        // Update expanded layers indices
        const newExpanded = new Set<number>();
        for (const expandedIndex of this._expandedLayers) {
            if (expandedIndex < index) {
                newExpanded.add(expandedIndex);
            } else if (expandedIndex > index) {
                newExpanded.add(expandedIndex - 1);
            }
        }
        this._expandedLayers = newExpanded;

        this._configChanged();
    }

    private _reorderLayers(ev: CustomEvent): void {
        const { layers } = ev.detail;
        
        this._config = {
            ...this._config,
            layers
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
            // Remove the property when empty (use default)
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

    // Cross-container drag & drop handlers
    private _handleGroupAdded(ev: CustomEvent): void {
        // Store the added group info for cross-container moves
        this._pendingAdd = {
            type: 'group',
            index: ev.detail.index,
            timestamp: ev.detail.timestamp
        };
    }

    private _handleGroupRemoved(ev: CustomEvent): void {
        const removedIndex = ev.detail.index;
        
        // Check if we have a pending add (cross-container move)
        if (this._pendingAdd && 
            this._pendingAdd.type === 'group' && 
            (Date.now() - this._pendingAdd.timestamp) < 100) {
            
            // This is a cross-layer group move
            // We need to find which layer the group was removed from and which layer it was added to
            // For now, just clear the pending add - the actual move logic will be handled in the nested components
            this._pendingAdd = null;
        }
    }

    private _handleElementAdded(ev: CustomEvent): void {
        // Store the added element info for cross-container moves
        this._pendingAdd = {
            type: 'element',
            index: ev.detail.index,
            timestamp: ev.detail.timestamp
        };
    }

    private _handleElementRemoved(ev: CustomEvent): void {
        // For now, just clear the pending add
        // The actual cross-container logic will be implemented at the component level
        if (this._pendingAdd && 
            this._pendingAdd.type === 'element' && 
            (Date.now() - this._pendingAdd.timestamp) < 100) {
            this._pendingAdd = null;
        }
    }

    private _handleCrossContainerMove(moveInfo: any): void {
        if (moveInfo.type === 'cross-container-element-move') {
            this._performCrossContainerElementMove(moveInfo);
        } else if (moveInfo.type === 'cross-container-group-move') {
            this._performCrossContainerGroupMove(moveInfo);
        }
    }

    private _performCrossContainerElementMove(moveInfo: any): void {
        const { sourceInfo, targetInfo, element } = moveInfo;

        // Create a completely new config structure to avoid any reference issues
        const layers = JSON.parse(JSON.stringify(this._config.layers));
        
        try {
            // Ensure source layer and group exist
            if (!layers[sourceInfo.layerIndex] || 
                !layers[sourceInfo.layerIndex].groups[sourceInfo.groupIndex]) {
                console.error('Source layer/group not found:', sourceInfo);
                return;
            }

            // Ensure target layer and group exist
            if (!layers[targetInfo.layerIndex] || 
                !layers[targetInfo.layerIndex].groups[targetInfo.groupIndex]) {
                console.error('Target layer/group not found:', targetInfo);
                return;
            }

            // Initialize elements arrays if they don't exist
            if (!layers[sourceInfo.layerIndex].groups[sourceInfo.groupIndex].elements) {
                layers[sourceInfo.layerIndex].groups[sourceInfo.groupIndex].elements = [];
            }
            if (!layers[targetInfo.layerIndex].groups[targetInfo.groupIndex].elements) {
                layers[targetInfo.layerIndex].groups[targetInfo.groupIndex].elements = [];
            }

            const sourceElements = layers[sourceInfo.layerIndex].groups[sourceInfo.groupIndex].elements;
            const targetElements = layers[targetInfo.layerIndex].groups[targetInfo.groupIndex].elements;

            // Remove element from source (find by content match, not index)
            const sourceIndex = sourceElements.findIndex((el: any) => 
                JSON.stringify(el) === JSON.stringify(element)
            );
            
            if (sourceIndex >= 0) {
                sourceElements.splice(sourceIndex, 1);
            }

            // Add element to target
            const insertIndex = Math.min(targetInfo.elementIndex, targetElements.length);
            targetElements.splice(insertIndex, 0, element);

            // Update the config
            this._config = { ...this._config, layers };
            this._configChanged();
            
        } catch (error) {
            console.error('Error during cross-container move:', error);
        }
    }

    private _performCrossContainerGroupMove(moveInfo: any): void {
        const { sourceInfo, targetInfo, group } = moveInfo;

        // Create a completely new config structure to avoid any reference issues
        const layers = JSON.parse(JSON.stringify(this._config.layers));
        
        try {
            // Ensure source and target layers exist
            if (!layers[sourceInfo.layerIndex]) {
                console.error('Source layer not found:', sourceInfo.layerIndex);
                return;
            }

            if (!layers[targetInfo.layerIndex]) {
                console.error('Target layer not found:', targetInfo.layerIndex);
                return;
            }

            // Initialize groups arrays if they don't exist
            if (!layers[sourceInfo.layerIndex].groups) {
                layers[sourceInfo.layerIndex].groups = [];
            }
            if (!layers[targetInfo.layerIndex].groups) {
                layers[targetInfo.layerIndex].groups = [];
            }

            const sourceGroups = layers[sourceInfo.layerIndex].groups;
            const targetGroups = layers[targetInfo.layerIndex].groups;

            // Remove group from source (find by content match, not index)
            const sourceIndex = sourceGroups.findIndex((g: any) => 
                JSON.stringify(g) === JSON.stringify(group)
            );
            
            if (sourceIndex >= 0) {
                sourceGroups.splice(sourceIndex, 1);
            }

            // Add group to target
            const insertIndex = Math.min(targetInfo.groupIndex, targetGroups.length);
            targetGroups.splice(insertIndex, 0, group);

            // Update the config
            this._config = { ...this._config, layers };
            this._configChanged();
            
        } catch (error) {
            console.error('Error during cross-container group move:', error);
        }
    }
}
