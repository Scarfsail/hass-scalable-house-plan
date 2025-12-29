import { LitElement, html, css } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "./shared-styles";
import { DragDropMixin } from "./drag-drop-mixin";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { EntityConfig } from "../scalable-house-plan";
import "./editor-element-shp";
import { CrossContainerCoordinator } from "./cross-container-coordinator";

@customElement("editor-elements-shp")
export class EditorElementsShp extends LitElement {
    @property({ attribute: false }) hass!: HomeAssistant;
    @property({ type: Array }) elements: EntityConfig[] = [];
    @property({ attribute: false }) expandedElements: Set<number> = new Set();
    @property({ type: Number }) layerIndex?: number;
    @property({ type: Number }) groupIndex?: number;

    private coordinator = CrossContainerCoordinator.getInstance();

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
            <div class="elements-section">
                <div class="section-header">
                    <div class="section-title">
                        <ha-icon icon="mdi:puzzle"></ha-icon>
                        Entities (${this.elements.length})
                    </div>
                    <button class="add-button" @click=${this._addElement}>
                        <ha-icon icon="mdi:plus"></ha-icon>
                        Add Entity
                    </button>
                </div>

                <ha-sortable 
                    handle-selector=".handle"
                    draggable-selector=".element-item"
                    @item-moved=${(ev: any) => this._handleElementsReorder(ev)}
                    @item-added=${(ev: any) => this._handleElementAdded(ev)}
                    @item-removed=${(ev: any) => this._handleElementRemoved(ev)}
                    group="all-elements"
                    .disabled=${false}
                >
                    <div class="elements-list">
                        ${this.elements.length === 0 
                            ? html`<div class="empty-drop-zone">${this._renderEmptyState()}</div>`
                            : this.elements.map((element, index) => html`
                                <editor-element-shp
                                    class="element-item"
                                    .hass=${this.hass}
                                    .element=${element}
                                    .index=${index}
                                    .isExpanded=${this.expandedElements.has(index)}
                                    @element-toggle=${this._handleElementToggle}
                                    @element-update=${this._handleElementUpdate}
                                    @element-remove=${this._handleElementRemove}
                                ></editor-element-shp>
                            `)
                        }
                    </div>
                </ha-sortable>
            </div>
        `;
    }

    private _renderEmptyState() {
        return html`
            <div class="empty-state">
                <ha-icon icon="mdi:puzzle"></ha-icon>
                <div class="empty-state-title">No entities created</div>
                <div class="empty-state-subtitle">
                    Entities are the devices and sensors displayed in this room
                </div>
            </div>
        `;
    }

    private _addElement() {
        const event = new CustomEvent('elements-add', {
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleElementToggle(e: CustomEvent) {
        const index = e.detail.index;
        
        // Toggle the expansion state
        if (this.expandedElements.has(index)) {
            this.expandedElements.delete(index);
        } else {
            this.expandedElements.add(index);
        }
        
        // Force re-render by creating a new Set
        this.expandedElements = new Set(this.expandedElements);
        this.requestUpdate();
    }

    private _handleElementUpdate(e: CustomEvent) {
        // Update a single element at the given index
        const { index, element } = e.detail;
        const updatedElements = [...this.elements];
        updatedElements[index] = element;
        
        const event = new CustomEvent('elements-update', {
            detail: { index, element },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleElementRemove(e: CustomEvent) {
        const event = new CustomEvent('elements-remove', {
            detail: e.detail,
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleElementsReorder(e: CustomEvent) {
        e.stopPropagation();
        const { oldIndex, newIndex } = e.detail;
        const reorderedElements = DragDropMixin.reorderArray(this.elements, oldIndex, newIndex);
        
        const event = new CustomEvent('elements-reorder', {
            detail: { elements: reorderedElements },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleElementAdded(e: CustomEvent) {
        // Record the add for cross-container coordination
        this.coordinator.recordAdd('element', {
            layerIndex: this.layerIndex,
            groupIndex: this.groupIndex,
            elementIndex: e.detail.index
        });

        // Also bubble up the event for parent components
        const event = new CustomEvent('element-added', {
            detail: { 
                index: e.detail.index,
                layerIndex: this.layerIndex,
                groupIndex: this.groupIndex,
                timestamp: Date.now()
            },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleElementRemoved(e: CustomEvent) {
        const removedIndex = e.detail.index;
        const removedElement = this.elements[removedIndex];
        
        // Check if this is a cross-container move
        const isCrossContainerMove = this.coordinator.recordRemove('element', {
            layerIndex: this.layerIndex,
            groupIndex: this.groupIndex,
            elementIndex: removedIndex
        }, removedElement);

        if (!isCrossContainerMove) {
            // Normal removal - bubble up the event
            const event = new CustomEvent('element-removed', {
                detail: { 
                    index: removedIndex,
                    layerIndex: this.layerIndex,
                    groupIndex: this.groupIndex,
                    timestamp: Date.now()
                },
                bubbles: true,
                composed: true
            });
            this.dispatchEvent(event);
        }
        // If it was a cross-container move, the coordinator handles it
    }
}
