import { LitElement, html, css } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "./shared-styles";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { EntityConfig } from "../scalable-house-plan";

@customElement("editor-element-shp")
export class EditorElementShp extends LitElement {
    @property({ attribute: false }) hass!: HomeAssistant;
    @property({ type: Object }) element!: EntityConfig;
    @property({ type: Number }) index!: number;
    @property({ type: Boolean }) isExpanded: boolean = false;

    static styles = [
        sharedStyles,
        css`
            :host {
                display: block;
            }
        `
    ];

    protected render() {
        // Extract entity ID and check if it has plan config
        const entityId = typeof this.element === 'string' ? this.element : this.element.entity;
        const hasPlan = typeof this.element !== 'string' && this.element.plan !== undefined;
        
        return html`
            <div class="item">
                <div class="item-header" @click=${this._toggleExpansion}>
                    <ha-icon 
                        icon="mdi:chevron-right" 
                        class="expand-icon ${this.isExpanded ? 'expanded' : ''}"
                    ></ha-icon>
                    <div class="item-info">
                        <ha-icon icon="mdi:home-assistant" class="item-icon"></ha-icon>
                        <div>
                            <div class="item-name">${entityId || 'New Entity'}</div>
                            <div class="item-details">
                                ${hasPlan ? html`<span class="item-badge">On Plan</span>` : html`<span class="item-badge">Detail Only</span>`}
                            </div>
                        </div>
                    </div>
                    <div class="item-actions" @click=${(e: Event) => e.stopPropagation()}>
                        <button class="icon-button danger" @click=${this._removeElement}>
                            <ha-icon icon="mdi:delete"></ha-icon>
                        </button>
                        <ha-icon icon="mdi:drag" class="handle" .disabled=${false} @click=${(e: Event) => e.stopPropagation()}></ha-icon>
                    </div>
                </div>
                
                <div class="item-content ${this.isExpanded ? 'expanded' : ''}">
                    <!-- YAML Editor for Entity Configuration -->
                    <ha-yaml-editor
                        .hass=${this.hass}
                        .defaultValue=${this.element}
                        @value-changed=${this._elementChanged}
                    ></ha-yaml-editor>
                </div>
            </div>
        `;
    }

    private _elementChanged(ev: CustomEvent) {
        const newElement = ev.detail.value;
        if (newElement) {
            // Dispatch the entire element as the update
            const event = new CustomEvent('element-update', {
                detail: { 
                    index: this.index,
                    element: newElement
                },
                bubbles: true,
                composed: true
            });
            this.dispatchEvent(event);
        }
    }

    private _toggleExpansion() {
        const event = new CustomEvent('element-toggle', {
            detail: { index: this.index },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _removeElement() {
        const event = new CustomEvent('element-remove', {
            detail: { index: this.index },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }
}
