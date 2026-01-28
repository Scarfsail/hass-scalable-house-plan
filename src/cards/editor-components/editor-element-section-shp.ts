import { LitElement, html, css } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "./shared-styles";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { ElementConfig } from "../types";

/**
 * Editor component for Element Section configuration
 * 
 * This component provides a YAML editor for configuring element properties:
 * - type: Element type (e.g., custom:analog-shp)
 * - Element-specific properties that vary by type
 * 
 * Future enhancement: Dynamic visual editors based on element type
 */
@customElement("editor-element-section-shp")
export class EditorElementSectionShp extends LitElement {
    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ type: Object }) public elementSection!: ElementConfig;

    static styles = [
        sharedStyles,
        css`
            :host {
                display: block;
            }

            .element-editor {
                margin-top: 8px;
            }

            .help-text {
                font-size: 12px;
                color: var(--secondary-text-color);
                margin-bottom: 8px;
            }

            .help-text code {
                background: var(--code-background-color, rgba(0, 0, 0, 0.05));
                padding: 2px 4px;
                border-radius: 3px;
                font-family: monospace;
            }
        `
    ];

    protected render() {
        return html`
            <div class="element-editor">
                <div class="help-text">
                    Configure element properties. The <code>type</code> field determines which element 
                    component to render (e.g., <code>custom:analog-shp</code>).
                </div>
                <ha-yaml-editor
                    .hass=${this.hass}
                    .defaultValue=${this.elementSection || {}}
                    @value-changed=${this._elementChanged}
                ></ha-yaml-editor>
            </div>
        `;
    }

    private _elementChanged(ev: CustomEvent) {
        ev.stopPropagation();
        
        this.dispatchEvent(new CustomEvent('element-changed', {
            detail: { value: ev.detail.value },
            bubbles: true,
            composed: true
        }));
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "editor-element-section-shp": EditorElementSectionShp;
    }
}
