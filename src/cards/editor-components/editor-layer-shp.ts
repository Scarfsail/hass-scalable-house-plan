import { LitElement, html, css } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "./shared-styles";
import type { Layer } from "../scalable-house-plan";
import type { HomeAssistant } from "../../../hass-frontend/src/types";

@customElement("editor-layer-shp")
export class EditorLayerShp extends LitElement {
    @property({ attribute: false }) hass!: HomeAssistant;
    @property({ type: Object }) layer!: Layer;
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
        return html`
            <div class="item">
                <div class="item-header" @click=${this._toggleExpansion}>
                    <ha-icon 
                        icon="mdi:chevron-right" 
                        class="expand-icon ${this.isExpanded ? 'expanded' : ''}"
                    ></ha-icon>
                    <div class="item-info">
                        <ha-icon icon="${this.layer.icon || 'mdi:layers'}" class="item-icon"></ha-icon>
                        <div>
                            <div class="item-name">${this.layer.name}</div>
                            <div class="item-details">
                                ID: ${this.layer.id}
                                ${this.layer.visible ? html`<span class="item-badge">Visible</span>` : html`<span class="item-badge inactive">Hidden</span>`}
                                ${this.layer.showInToggles ? html`<span class="item-badge">Toggleable</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="item-actions" @click=${(e: Event) => e.stopPropagation()}>
                        <button class="icon-button danger" @click=${this._removeLayer}>
                            <ha-icon icon="mdi:delete"></ha-icon>
                        </button>
                        <ha-icon icon="mdi:drag" class="handle" .disabled=${false} @click=${(e: Event) => e.stopPropagation()}></ha-icon>
                    </div>
                </div>
                
                <div class="item-content ${this.isExpanded ? 'expanded' : ''}">
                    <div class="form-grid">
                        <ha-textfield
                            label="Layer ID"
                            .value=${this.layer.id}
                            @input=${(e: any) => this._updateProperty('id', e.target.value)}
                            placeholder="lights"
                        ></ha-textfield>
                        <ha-textfield
                            label="Layer Name"
                            .value=${this.layer.name}
                            @input=${(e: any) => this._updateProperty('name', e.target.value)}
                            placeholder="Lights"
                        ></ha-textfield>
                        <ha-textfield
                            label="Icon"
                            .value=${this.layer.icon}
                            @input=${(e: any) => this._updateProperty('icon', e.target.value)}
                            placeholder="mdi:lightbulb"
                        ></ha-textfield>

                        <div class="form-toggles">
                            <ha-formfield label="Visible by default">
                                <ha-switch
                                    .checked=${this.layer.visible}
                                    @change=${(e: any) => this._updateProperty('visible', e.target.checked)}
                                ></ha-switch>
                            </ha-formfield>
                            <ha-formfield label="Show in Toggles">
                                <ha-switch
                                    .checked=${this.layer.showInToggles}
                                    @change=${(e: any) => this._updateProperty('showInToggles', e.target.checked)}
                                ></ha-switch>
                            </ha-formfield>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private _toggleExpansion() {
        const event = new CustomEvent('layer-toggle', {
            detail: { index: this.index },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _removeLayer() {
        const event = new CustomEvent('layer-remove', {
            detail: { index: this.index },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _updateProperty(property: keyof Layer, value: any) {
        const event = new CustomEvent('layer-update', {
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
}
