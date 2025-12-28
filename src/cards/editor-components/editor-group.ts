import { LitElement, html, css } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { sharedStyles } from "./shared-styles";
import type { PictureElementGroup } from "../scalable-house-plan";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import "./editor-elements";

@customElement("editor-group")
export class EditorGroup extends LitElement {
    @property({ attribute: false }) hass!: HomeAssistant;
    @property({ type: Object }) group!: PictureElementGroup;
    @property({ type: Number }) index!: number;
    @property({ type: Number }) layerIndex?: number;
    @property({ type: Boolean }) isExpanded: boolean = false;
    @state() private _expandedElements: Set<number> = new Set();

    static styles = [
        sharedStyles,
        css`
            :host {
                display: block;
            }
        `
    ];

    protected render() {
        const elementCount = this.group.elements?.length || 0;
        
        return html`
            <div class="item">
                <div class="item-header" @click=${this._toggleExpansion}>
                    <ha-icon 
                        icon="mdi:chevron-right" 
                        class="expand-icon ${this.isExpanded ? 'expanded' : ''}"
                    ></ha-icon>
                    <div class="item-info">
                        <ha-icon icon="mdi:folder" class="item-icon"></ha-icon>
                        <div>
                            <div class="item-name">${this.group.group_name}</div>
                            <div class="item-details">
                                ${elementCount} elements
                            </div>
                        </div>
                    </div>
                    <div class="item-actions" @click=${(e: Event) => e.stopPropagation()}>
                        <button class="icon-button danger" @click=${this._removeGroup}>
                            <ha-icon icon="mdi:delete"></ha-icon>
                        </button>
                        <ha-icon icon="mdi:drag" class="handle" .disabled=${false} @click=${(e: Event) => e.stopPropagation()}></ha-icon>
                    </div>
                </div>
                
                <div class="item-content ${this.isExpanded ? 'expanded' : ''}">
                    <ha-textfield
                        label="Group Name"
                        .value=${this.group.group_name}
                        @input=${(e: any) => this._updateProperty('group_name', e.target.value)}
                        placeholder="e.g., Living Room Lights"
                        style="width: 100%; margin-bottom: 16px;"
                    ></ha-textfield>
                    
                    <!-- Elements Section -->
                    <editor-elements
                        .hass=${this.hass}
                        .elements=${this.group.elements || []}
                        .expandedElements=${this._expandedElements}
                        .layerIndex=${this.layerIndex}
                        .groupIndex=${this.index}
                        @elements-add=${this._addElement}
                        @elements-toggle=${this._toggleElement}
                        @elements-update=${this._updateElement}
                        @elements-remove=${this._removeElement}
                        @elements-reorder=${this._reorderElements}
                        @element-added=${this._handleElementAdded}
                        @element-removed=${this._handleElementRemoved}
                    ></editor-elements>
                </div>
            </div>
        `;
    }

    private _toggleExpansion() {
        const event = new CustomEvent('group-toggle', {
            detail: { index: this.index },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _removeGroup() {
        const event = new CustomEvent('group-remove', {
            detail: { index: this.index },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _updateProperty(property: keyof PictureElementGroup, value: any) {
        const event = new CustomEvent('group-update', {
            detail: { 
                index: this.index,
                property,
                value 
            },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _addElement() {
        const newElement = {
            type: "state-icon",
            style: {},
            left: "50%",
            top: "50%"
        };

        const updatedGroup = {
            ...this.group,
            elements: [...(this.group.elements || []), newElement]
        };

        const event = new CustomEvent('group-update', {
            detail: { 
                index: this.index,
                property: 'elements',
                value: updatedGroup.elements
            },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);

        // Expand the new element automatically
        this._expandedElements.add(updatedGroup.elements.length - 1);
        this.requestUpdate();
    }

    private _toggleElement(ev: CustomEvent) {
        const { index } = ev.detail;
        if (this._expandedElements.has(index)) {
            this._expandedElements.delete(index);
        } else {
            this._expandedElements.add(index);
        }
        this.requestUpdate();
    }

    private _updateElement(ev: CustomEvent) {
        const { index, element, property, value } = ev.detail;
        const elements = [...(this.group.elements || [])];
        
        if (element) {
            // Full element update from YAML editor
            elements[index] = element;
        } else {
            // Individual property update (fallback)
            elements[index] = {
                ...elements[index],
                [property]: value
            };
        }

        const event = new CustomEvent('group-update', {
            detail: { 
                index: this.index,
                property: 'elements',
                value: elements
            },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _removeElement(ev: CustomEvent) {
        const { index } = ev.detail;
        const elements = [...(this.group.elements || [])];
        elements.splice(index, 1);

        const event = new CustomEvent('group-update', {
            detail: { 
                index: this.index,
                property: 'elements',
                value: elements
            },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);

        // Update expanded elements indices
        const newExpanded = new Set<number>();
        for (const expandedIndex of this._expandedElements) {
            if (expandedIndex < index) {
                newExpanded.add(expandedIndex);
            } else if (expandedIndex > index) {
                newExpanded.add(expandedIndex - 1);
            }
        }
        this._expandedElements = newExpanded;
        this.requestUpdate();
    }

    private _reorderElements(ev: CustomEvent) {
        const { elements } = ev.detail;
        
        const event = new CustomEvent('group-update', {
            detail: { 
                index: this.index,
                property: 'elements',
                value: elements
            },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    // Cross-container drag & drop handlers for elements
    private _handleElementAdded(ev: CustomEvent): void {
        // Bubble up the element-added event for cross-group coordination
        this.dispatchEvent(new CustomEvent('element-added', {
            detail: ev.detail,
            bubbles: true,
            composed: true
        }));
    }

    private _handleElementRemoved(ev: CustomEvent): void {
        // Bubble up the element-removed event for cross-group coordination
        this.dispatchEvent(new CustomEvent('element-removed', {
            detail: ev.detail,
            bubbles: true,
            composed: true
        }));
    }
}
