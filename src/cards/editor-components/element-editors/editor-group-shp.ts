import { LitElement, html, css } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "../shared-styles";
import type { HomeAssistant } from "../../../../hass-frontend/src/types";
import type { GroupElementConfig } from "../../types";
import "../editor-elements-shp";

/**
 * Visual editor for group-shp element
 * 
 * Configuration properties:
 * - type: 'custom:group-shp' (required)
 * - width: number - Explicit width in pixels (required)
 * - height: number - Explicit height in pixels (required)
 * - show_border: boolean - Show dashed border for debugging/editing (default: false)
 * - children: EntityConfig[] - Array of child entity configurations
 */
@customElement("editor-group-shp")
export class EditorGroupShp extends LitElement {
    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ type: Object }) public elementSection!: GroupElementConfig;
    @property({ type: String }) public areaId?: string; // Area ID for entity filtering

    static styles = [
        sharedStyles,
        css`
            :host {
                display: block;
            }

            .field {
                margin-bottom: 16px;
            }

            .field-label {
                display: block;
                margin-bottom: 4px;
                font-weight: 500;
                color: var(--primary-text-color);
            }

            .field-row {
                display: flex;
                gap: 16px;
                margin-bottom: 16px;
            }

            .field-row .field {
                flex: 1;
                margin-bottom: 0;
            }

            .checkbox-field {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 16px;
            }

            .checkbox-field label {
                color: var(--primary-text-color);
            }

            .children-section {
                margin-top: 24px;
                padding-top: 16px;
                border-top: 1px solid var(--divider-color);
            }

            .children-section-title {
                font-size: 14px;
                font-weight: 600;
                color: var(--primary-text-color);
                margin-bottom: 12px;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .children-section-title ha-icon {
                --mdc-icon-size: 16px;
                color: var(--primary-color);
            }
        `
    ];

    protected render() {
        return html`
            <div class="field-row">
                <div class="field">
                    <label class="field-label">Width (px)</label>
                    <ha-textfield
                        type="number"
                        .value=${String(this.elementSection?.width || 100)}
                        @input=${this._widthChanged}
                        .min=${"1"}
                    ></ha-textfield>
                </div>

                <div class="field">
                    <label class="field-label">Height (px)</label>
                    <ha-textfield
                        type="number"
                        .value=${String(this.elementSection?.height || 100)}
                        @input=${this._heightChanged}
                        .min=${"1"}
                    ></ha-textfield>
                </div>
            </div>

            <div class="checkbox-field">
                <ha-switch
                    .checked=${this.elementSection?.show_border === true}
                    @change=${this._showBorderChanged}
                ></ha-switch>
                <label>Show Border (for debugging)</label>
            </div>

            <div class="children-section">
                <div class="children-section-title">
                    <ha-icon icon="mdi:folder-multiple"></ha-icon>
                    Child Elements
                </div>
                <editor-elements-shp
                    .hass=${this.hass}
                    .elements=${this.elementSection?.children || []}
                    .areaId=${this.areaId}
                    .hideHeader=${false}
                    @elements-add=${this._handleChildrenAdd}
                    @elements-update=${this._handleChildrenUpdate}
                    @elements-remove=${this._handleChildrenRemove}
                    @elements-reorder=${this._handleChildrenReorder}
                ></editor-elements-shp>
            </div>
        `;
    }

    private _widthChanged(ev: Event) {
        const value = Number((ev.target as HTMLInputElement).value);
        if (value > 0) {
            this._updateConfig({ width: value });
        }
    }

    private _heightChanged(ev: Event) {
        const value = Number((ev.target as HTMLInputElement).value);
        if (value > 0) {
            this._updateConfig({ height: value });
        }
    }

    private _showBorderChanged(ev: Event) {
        const checked = (ev.target as HTMLInputElement).checked;
        this._updateConfig({ show_border: checked });
    }

    private _handleChildrenAdd(e: CustomEvent) {
        e.stopPropagation(); // Prevent event from bubbling to room editor
        // Add a new empty child entity
        const children = [...(this.elementSection?.children || []), ""];
        this._updateConfig({ children });
    }

    private _handleChildrenUpdate(e: CustomEvent) {
        e.stopPropagation(); // Prevent event from bubbling to room editor
        // Handle single element update
        const { index, element } = e.detail;
        if (index !== undefined && element !== undefined) {
            const children = [...(this.elementSection?.children || [])];
            children[index] = element;
            this._updateConfig({ children });
        } else if (e.detail.elements !== undefined) {
            // Handle bulk update (for backwards compatibility)
            this._updateConfig({ children: e.detail.elements });
        }
    }

    private _handleChildrenRemove(e: CustomEvent) {
        e.stopPropagation(); // Prevent event from bubbling to room editor
        const children = [...(this.elementSection?.children || [])];
        children.splice(e.detail.index, 1);
        this._updateConfig({ children });
    }

    private _handleChildrenReorder(e: CustomEvent) {
        e.stopPropagation(); // Prevent event from bubbling to room editor
        this._updateConfig({ children: e.detail.elements });
    }

    private _updateConfig(changes: Partial<GroupElementConfig>) {
        const updated = { 
            ...this.elementSection, 
            type: 'custom:group-shp', // Always ensure type is set
            ...changes 
        };
        
        this.dispatchEvent(new CustomEvent('element-changed', {
            detail: { value: updated },
            bubbles: true,
            composed: true
        }));
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "editor-group-shp": EditorGroupShp;
    }
}
