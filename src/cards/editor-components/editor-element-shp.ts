import { LitElement, html, css } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "./shared-styles";
import type { HomeAssistant } from "../../../hass-frontend/src/types";

interface PictureElement {
    type: string;
    style: any;
    entity?: string;
    tap_action?: any;
    left?: string | number;
    right?: string | number;
    top?: string | number;
    bottom?: string | number;
    width?: string | number;
    height?: string | number;
}

@customElement("editor-element-shp")
export class EditorElementShp extends LitElement {
    @property({ attribute: false }) hass!: HomeAssistant;
    @property({ type: Object }) element!: PictureElement;
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
        const elementType = this.element.type || 'unknown';
        const hasPosition = this.element.left !== undefined || this.element.right !== undefined || 
                           this.element.top !== undefined || this.element.bottom !== undefined;
        
        return html`
            <div class="item">
                <div class="item-header" @click=${this._toggleExpansion}>
                    <ha-icon 
                        icon="mdi:chevron-right" 
                        class="expand-icon ${this.isExpanded ? 'expanded' : ''}"
                    ></ha-icon>
                    <div class="item-info">
                        <ha-icon icon="${this._getElementIcon(elementType)}" class="item-icon"></ha-icon>
                        <div>
                            <div class="item-name">${this._getElementDisplayName(elementType)}</div>
                            <div class="item-details">
                                ${this.element.entity ? html`<span class="item-badge">${this.element.entity}</span>` : ''}
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
                    <!-- YAML Editor for Element Configuration -->
                    <ha-yaml-editor
                        .hass=${this.hass}
                        .defaultValue=${this.element}
                        @value-changed=${this._elementChanged}
                    ></ha-yaml-editor>
                </div>
            </div>
        `;
    }

    private _getElementIcon(type: string): string {
        const iconMap: { [key: string]: string } = {
            'state-icon': 'mdi:lightbulb-outline',
            'state-label': 'mdi:text',
            'state-badge': 'mdi:circle',
            'service-button': 'mdi:gesture-tap-button',
            'icon': 'mdi:shape',
            'image': 'mdi:image',
            'conditional': 'mdi:help-rhombus',
            'custom': 'mdi:code-braces'
        };
        return iconMap[type] || 'mdi:puzzle';
    }

    private _getElementDisplayName(type: string): string {
        const nameMap: { [key: string]: string } = {
            'state-icon': 'State Icon',
            'state-label': 'State Label',
            'state-badge': 'State Badge',
            'service-button': 'Service Button',
            'icon': 'Icon',
            'image': 'Image',
            'conditional': 'Conditional',
            'custom': 'Custom Element'
        };
        return nameMap[type] || `${type}`;
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
