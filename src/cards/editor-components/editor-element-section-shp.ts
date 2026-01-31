import { LitElement, html, css } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { unsafeStatic, html as staticHtml } from 'lit/static-html.js';
import { sharedStyles } from "./shared-styles";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { ElementConfig } from "../types";
import "./element-editors"; // Import all element visual editors

/**
 * Editor component for Element Section configuration
 * 
 * Provides either a visual editor (if available for the element type) or YAML editor.
 * Users can toggle between visual and YAML modes when a visual editor exists.
 */
@customElement("editor-element-section-shp")
export class EditorElementSectionShp extends LitElement {
    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ type: Object }) public elementSection!: ElementConfig;
    @property({ type: String }) public areaId?: string; // Area ID for entity filtering in nested editors
    
    @state() private _useYamlMode: boolean = false;

    static styles = [
        sharedStyles,
        css`
            :host {
                display: block;
            }

            .element-editor {
                /* No margin-top for tight spacing */
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

            .toggle-button {
                margin-top: 12px;
                padding: 8px 16px;
                background: var(--primary-color);
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                transition: background 0.2s;
            }

            .toggle-button:hover {
                background: var(--primary-color);
                opacity: 0.9;
            }
        `
    ];

    /**
     * Check if a visual editor exists for the current element type
     */
    private get _hasVisualEditor(): boolean {
        const elementType = this.elementSection?.type;
        if (!elementType || !elementType.startsWith('custom:')) {
            return false;
        }
        
        const editorName = this._getEditorName(elementType);
        return customElements.get(editorName) !== undefined;
    }

    /**
     * Convert element type to editor component name
     * Example: custom:badges-shp → editor-badges-shp
     */
    private _getEditorName(elementType: string): string {
        return elementType.replace('custom:', 'editor-');
    }

    protected render() {
        const showVisualEditor = this._hasVisualEditor && !this._useYamlMode;
        
        return html`
            <div class="element-editor">               
                ${showVisualEditor 
                    ? this._renderVisualEditor() 
                    : this._renderYamlEditor()}
                
                ${this._hasVisualEditor ? html`
                    <button class="toggle-button" @click=${this._toggleMode}>
                        ${this._useYamlMode ? 'Switch to Visual' : 'Switch to YAML'}
                    </button>
                ` : ''}
            </div>
        `;
    }

    private _renderVisualEditor() {
        const elementType = this.elementSection?.type;
        if (!elementType) return html``;
        
        const editorName = this._getEditorName(elementType);
        const tag = unsafeStatic(editorName);
        
        // Use static-html to create the dynamic element
        // Pass areaId for entity filtering in nested editors (e.g., group-shp)
        return staticHtml`<${tag}
            .hass=${this.hass}
            .elementSection=${this.elementSection}
            .areaId=${this.areaId}
            @element-changed=${this._elementChanged}
        ></${tag}>`;
    }

    private _renderYamlEditor() {
        return html`
            <ha-yaml-editor
                .hass=${this.hass}
                .defaultValue=${this.elementSection || {}}
                @value-changed=${this._elementChanged}
            ></ha-yaml-editor>
        `;
    }

    private _toggleMode() {
        this._useYamlMode = !this._useYamlMode;
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
