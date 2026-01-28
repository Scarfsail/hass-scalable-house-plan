import { LitElement, html, css } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { sharedStyles } from "../shared-styles";
import type { HomeAssistant } from "../../../../hass-frontend/src/types";
import type { ElementConfig } from "../../types";

/**
 * Visual editor for badges-shp element
 * 
 * Configuration properties:
 * - type: 'custom:badges-shp' (required)
 * - entities: string[] - List of entity IDs to display as badges
 * - show_name: boolean - Show entity names
 * - show_entity_picture: boolean - Show entity pictures
 */
@customElement("editor-badges-shp")
export class EditorBadgesShp extends LitElement {
    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ type: Object }) public elementSection!: ElementConfig;
    
    @state() private _entities: string[] = [];

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

            .entity-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-bottom: 8px;
            }

            .entity-item {
                display: flex;
                gap: 8px;
                align-items: center;
            }

            .entity-item ha-entity-picker {
                flex: 1;
            }

            .entity-item button {
                background: var(--error-color, #db4437);
                color: white;
                border: none;
                border-radius: 4px;
                padding: 8px 12px;
                cursor: pointer;
                transition: opacity 0.2s;
            }

            .entity-item button:hover {
                opacity: 0.9;
            }

            .add-entity-button {
                background: var(--primary-color);
                color: white;
                border: none;
                border-radius: 4px;
                padding: 8px 16px;
                cursor: pointer;
                font-size: 14px;
                transition: opacity 0.2s;
            }

            .add-entity-button:hover {
                opacity: 0.9;
            }

            .checkbox-field {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 12px;
            }

            .checkbox-field label {
                color: var(--primary-text-color);
            }
        `
    ];

    protected willUpdate(changedProps: Map<string, any>) {
        if (changedProps.has('elementSection')) {
            this._entities = this.elementSection?.entities || [];
        }
    }

    protected render() {
        return html`
            <div class="field">
                <label class="field-label">Badge Entities</label>
                <div class="entity-list">
                    ${this._entities.map((entity, index) => html`
                        <div class="entity-item">
                            <ha-entity-picker
                                .hass=${this.hass}
                                .value=${entity}
                                @value-changed=${(ev: CustomEvent) => this._entityChanged(index, ev)}
                                allow-custom-entity
                            ></ha-entity-picker>
                            <button @click=${() => this._removeEntity(index)}>
                                Remove
                            </button>
                        </div>
                    `)}
                </div>
                <button class="add-entity-button" @click=${this._addEntity}>
                    + Add Entity
                </button>
            </div>

            <div class="checkbox-field">
                <ha-switch
                    .checked=${this.elementSection?.show_name !== false}
                    @change=${this._showNameChanged}
                ></ha-switch>
                <label>Show Name</label>
            </div>

            <div class="checkbox-field">
                <ha-switch
                    .checked=${this.elementSection?.show_entity_picture !== false}
                    @change=${this._showEntityPictureChanged}
                ></ha-switch>
                <label>Show Entity Picture</label>
            </div>
        `;
    }

    private _entityChanged(index: number, ev: CustomEvent) {
        const newEntities = [...this._entities];
        newEntities[index] = ev.detail.value;
        this._updateConfig({ entities: newEntities });
    }

    private _addEntity() {
        const newEntities = [...this._entities, ''];
        this._updateConfig({ entities: newEntities });
    }

    private _removeEntity(index: number) {
        const newEntities = this._entities.filter((_, i) => i !== index);
        this._updateConfig({ entities: newEntities });
    }

    private _showNameChanged(ev: Event) {
        const checked = (ev.target as HTMLInputElement).checked;
        this._updateConfig({ show_name: checked });
    }

    private _showEntityPictureChanged(ev: Event) {
        const checked = (ev.target as HTMLInputElement).checked;
        this._updateConfig({ show_entity_picture: checked });
    }

    private _updateConfig(changes: Partial<ElementConfig>) {
        const updated = { 
            ...this.elementSection, 
            type: 'custom:badges-shp', // Always ensure type is set
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
        "editor-badges-shp": EditorBadgesShp;
    }
}
