import { LitElement, html, css } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { sharedStyles } from "./shared-styles";
import { DragDropMixin } from "./drag-drop-mixin";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { EntityConfig } from "../types";
import { getLocalizeFunction, type LocalizeFunction } from "../../localize";
import "./editor-element-shp";
import { CrossContainerCoordinator } from "./cross-container-coordinator";
import { generateElementKey } from "../../components/element-renderer-shp";
import { getElementTypeForEntity } from "../../utils";

/**
 * Generate a stable key for an entity config
 * This ensures proper component updates after drag & drop
 */
function getEntityKey(element: EntityConfig, index: number): string {
    const entityId = typeof element === 'string' ? element : element.entity;
    // Use entity ID as primary key, fallback to index for empty entities
    return entityId || `empty-${index}`;
}

@customElement("editor-elements-shp")
export class EditorElementsShp extends LitElement {
    @property({ attribute: false }) hass!: HomeAssistant;
    @property({ type: Array }) elements: EntityConfig[] = [];
    @property({ attribute: false }) expandedElements: Set<number> = new Set();
    @property({ type: Number }) layerIndex?: number;
    @property({ type: Number }) groupIndex?: number;
    @property({ type: Boolean }) hideHeader: boolean = false; // Hide header when embedded
    @property({ type: String }) areaId?: string; // Optional area ID for filtering
    @property({ type: String }) selectedElementKey?: string | null; // Currently selected element key (for Task 4)
    @property({ type: Number }) roomIndex?: number; // Room index for generating group keys
    private _localize?: LocalizeFunction;

    private get localize(): LocalizeFunction {
        if (!this._localize) {
            this._localize = getLocalizeFunction(this.hass);
        }
        return this._localize;
    }

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
                ${!this.hideHeader ? html`
                    <div class="section-header">
                        <div class="section-title">
                            <ha-icon icon="mdi:puzzle"></ha-icon>
                            ${this.localize('editor.entities')} (${this.elements.length})
                        </div>
                        <button class="add-button" @click=${this._addElement}>
                            <ha-icon icon="mdi:plus"></ha-icon>
                            ${this.localize('editor.add_entity')}
                        </button>
                    </div>
                ` : ''}

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
                            : repeat(
                                this.elements,
                                (element, index) => getEntityKey(element, index),
                                (element, index) => html`
                                    <editor-element-shp
                                        class="element-item"
                                        .hass=${this.hass}
                                        .entity=${element}
                                        .index=${index}
                                        .areaId=${this.areaId}
                                        .isExpanded=${this.expandedElements.has(index)}
                                        @element-toggle=${this._handleElementToggle}
                                        @element-update=${this._handleElementUpdate}
                                        @element-duplicate=${this._handleElementDuplicate}
                                        @element-remove=${this._handleElementRemove}
                                    ></editor-element-shp>
                                `
                            )
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
                <div class="empty-state-title">${this.localize('editor.no_entities_created')}</div>
                <div class="empty-state-subtitle">
                    ${this.localize('editor.entities_description')}
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
        e.stopPropagation(); // Prevent bubbling to parent editor-elements-shp
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
        e.stopPropagation(); // Prevent bubbling to parent editor-elements-shp
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

    private _handleElementDuplicate(e: CustomEvent) {
        e.stopPropagation(); // Prevent bubbling to parent editor-elements-shp
        const { index, element } = e.detail;
        
        // Create a deep copy of the element to avoid reference issues
        let duplicatedElement: EntityConfig;
        if (typeof element === 'string') {
            duplicatedElement = element;
        } else {
            // Deep clone the element configuration
            duplicatedElement = {
                entity: element.entity,
                ...(element.plan && { plan: JSON.parse(JSON.stringify(element.plan)) })
            };
        }
        
        // Insert the duplicated element right after the source (at index + 1)
        const newElements = [...this.elements];
        newElements.splice(index + 1, 0, duplicatedElement);
        
        // Update expanded elements: shift indices after the insertion point
        const newExpandedElements = new Set<number>();
        this.expandedElements.forEach(expandedIndex => {
            if (expandedIndex > index) {
                // Indices after the duplicated item shift down by 1
                newExpandedElements.add(expandedIndex + 1);
            } else {
                newExpandedElements.add(expandedIndex);
            }
        });
        // Optionally expand the newly duplicated item
        newExpandedElements.add(index + 1);
        this.expandedElements = newExpandedElements;
        
        // Dispatch event to update parent component
        const event = new CustomEvent('elements-reorder', {
            detail: { elements: newElements },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleElementRemove(e: CustomEvent) {
        e.stopPropagation(); // Prevent bubbling to parent editor-elements-shp
        
        const removedIndex = e.detail.index;
        const removedElement = this.elements[removedIndex];
        
        // Task 4: Check if removed element was selected, and clear selection if so
        if (this.selectedElementKey && removedElement) {
            const entity = typeof removedElement === 'string' ? removedElement : removedElement.entity;
            const plan = typeof removedElement === 'string' ? undefined : removedElement.plan;
            
            // Generate unique key for removed element
            let removedKey: string | null = null;
            if (entity) {
                removedKey = entity;
            } else if (!entity && plan?.element?.type) {
                removedKey = generateElementKey(plan.element.type, plan);
            }
            
            // If removed element was selected, clear selection
            if (removedKey === this.selectedElementKey) {
                const clearEvent = new CustomEvent('scalable-house-plan-element-focused', {
                    detail: { uniqueKey: null },
                    bubbles: true,
                    composed: true
                });
                window.dispatchEvent(clearEvent);
            }
        }
        
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
        
        // Update expanded elements set to reflect new indices
        // This ensures expanded states follow the entities when reordered
        const newExpandedElements = new Set<number>();
        this.expandedElements.forEach(expandedIndex => {
            let updatedIndex = expandedIndex;
            if (expandedIndex === oldIndex) {
                // This element moved from oldIndex to newIndex
                updatedIndex = newIndex;
            } else if (oldIndex < newIndex) {
                // Item moved down: indices between oldIndex+1 and newIndex shift up by 1
                if (expandedIndex > oldIndex && expandedIndex <= newIndex) {
                    updatedIndex = expandedIndex - 1;
                }
            } else {
                // Item moved up: indices between newIndex and oldIndex-1 shift down by 1
                if (expandedIndex >= newIndex && expandedIndex < oldIndex) {
                    updatedIndex = expandedIndex + 1;
                }
            }
            newExpandedElements.add(updatedIndex);
        });
        this.expandedElements = newExpandedElements;
        
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

    /**
     * Phase 4: Public method to expand element by entity ID
     * Called from parent room editor when element is clicked in preview
     */
    /**
     * Phase 4 & 5: Public method to expand element by its uniqueKey
     * Supports nested group child selection via parentGroupKey
     * @param uniqueKey - The element's unique key to expand
     * @param parentGroupKey - Optional parent group key for nested selections
     */
    public expandElementByKey(uniqueKey: string, parentGroupKey?: string): boolean {
        if (!uniqueKey) return false;

        // If parentGroupKey is provided, this is a nested group child selection
        if (parentGroupKey) {
            // Step 1: Find and expand the parent group
            const groupIndex = this._findElementIndex(parentGroupKey);
            if (groupIndex === -1) return false;

            // Expand the parent group
            this.expandedElements.add(groupIndex);
            this.requestUpdate();

            // Step 2: Wait for render, then find the nested editor-elements-shp inside the group
            this.updateComplete.then(() => {
                const groupElement = this.shadowRoot?.querySelectorAll('editor-element-shp')[groupIndex];
                if (!groupElement) return;

                // Find the group's editor (editor-group-shp inside editor-element-section-shp)
                const elementSection = groupElement.shadowRoot?.querySelector('editor-element-section-shp');
                const groupEditor = elementSection?.shadowRoot?.querySelector('editor-group-shp');
                
                if (!groupEditor) return;

                // Find the nested editor-elements-shp inside the group editor
                const nestedElementsEditor = groupEditor.shadowRoot?.querySelector('editor-elements-shp');
                if (nestedElementsEditor) {
                    // Recursively expand the child element (supports multi-level nesting)
                    (nestedElementsEditor as any).expandElementByKey?.(uniqueKey);
                }
            });

            return true;
        }

        // No parentGroupKey - regular top-level element selection
        const elementIndex = this._findElementIndex(uniqueKey);
        if (elementIndex === -1) return false;

        // Expand the element
        this.expandedElements.add(elementIndex);
        this.requestUpdate();

        // Scroll into view after render
        this.updateComplete.then(() => {
            const elementComponent = this.shadowRoot?.querySelectorAll('editor-element-shp')[elementIndex];
            if (elementComponent) {
                (elementComponent as any).expandWithPlanFocus?.();
                elementComponent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });

        return true;
    }

    /**
     * Helper method to find element index by uniqueKey
     */
    private _findElementIndex(uniqueKey: string): number {
        // First, filter elements the same way buildElementStructure does
        // This ensures elementIndex matches between renderer and editor
        const filteredElements = this.elements.filter((entityConfig: EntityConfig) => {
            if (typeof entityConfig === 'string') return false;
            return !!(typeof entityConfig !== 'string' && entityConfig.plan);
        });
        
        // Find in filtered array using filtered indices
        const filteredIndex = filteredElements.findIndex((el, elementIndex) => {
            const entity = typeof el === 'string' ? el : el.entity;
            const plan = typeof el === 'string' ? undefined : el.plan;

            // For entity-based elements, uniqueKey is the entity ID
            if (entity && entity === uniqueKey) {
                return true;
            }

            // For no-entity elements, generate the key and compare
            if (!entity && plan?.element?.type) {
                const generatedKey = generateElementKey(plan.element.type, plan, this.roomIndex, elementIndex);
                return generatedKey === uniqueKey;
            }

            return false;
        });
        
        if (filteredIndex === -1) return -1;
        
        // Convert filtered index back to original array index
        const filteredElement = filteredElements[filteredIndex];
        return this.elements.indexOf(filteredElement);
    }
}
