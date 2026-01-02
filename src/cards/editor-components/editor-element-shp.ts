import { LitElement, html, css } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "./shared-styles";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { EntityConfig } from "../scalable-house-plan";
import { getAreaEntities } from "../../utils";

@customElement("editor-element-shp")
export class EditorElementShp extends LitElement {
    @property({ attribute: false }) hass!: HomeAssistant;
    @property({ type: Object }) entity!: EntityConfig;
    @property({ type: Number }) index!: number;
    @property({ type: Boolean }) isExpanded: boolean = false;
    @property({ type: String }) areaId?: string; // Optional area ID for filtering entities

    static styles = [
        sharedStyles,
        css`
            :host {
                display: block;
            }

            .entity-picker {
                margin-bottom: 16px;
            }

            .plan-section {
                margin-top: 16px;
            }

            .plan-label {
                font-weight: 500;
                margin-bottom: 8px;
                color: var(--primary-text-color);
            }
        `
    ];

    protected render() {
        // Extract entity ID and plan config
        const entityId = typeof this.entity === 'string' ? this.entity : this.entity.entity;
        const planConfig = typeof this.entity !== 'string' ? this.entity.plan : undefined;
        const hasPlan = planConfig !== undefined;
        
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
                    <!-- Entity Picker -->
                    <div class="entity-picker">
                        <ha-entity-picker
                            .hass=${this.hass}
                            .value=${entityId}
                            .includeEntities=${this._getIncludeEntities(entityId)}
                            @value-changed=${this._entityIdChanged}
                            allow-custom-entity
                        ></ha-entity-picker>
                    </div>
                    <div class="plan-section">
                        <div class="plan-label">Plan Configuration (optional - for overview display)</div>
                        <ha-yaml-editor
                            .hass=${this.hass}
                            .defaultValue=${planConfig || {}}
                            @value-changed=${this._planChanged}
                        ></ha-yaml-editor>
                    </div>
                </div>
            </div>
        `;
    }

    private _entityIdChanged(ev: CustomEvent) {
        const newEntityId = ev.detail.value;
        if (newEntityId) {
            // Update entity ID while preserving plan config
            const updatedEntity = typeof this.entity === 'string' 
                ? { entity: newEntityId }
                : { ...this.entity, entity: newEntityId };
            
            this._dispatchUpdate(updatedEntity);
        }
    }

    /**
     * Get list of entities to include in picker
     * If area is set, include area entities + current selection (if different)
     * If no area, return undefined (show all entities)
     */
    private _getIncludeEntities(currentEntityId: string): string[] | undefined {
        if (!this.areaId) {
            return undefined; // No filtering when no area is set
        }

        const areaEntities = getAreaEntities(this.hass, this.areaId);
        
        // If current entity is not in area entities, add it to the list
        // This preserves manually configured entities
        if (currentEntityId && !areaEntities.includes(currentEntityId)) {
            return [...areaEntities, currentEntityId];
        }
        
        return areaEntities;
    }

    private _planChanged(ev: CustomEvent) {
        const newPlan = ev.detail.value;
        const entityId = typeof this.entity === 'string' ? this.entity : this.entity.entity;
        
        // If plan is empty object, create entity-only config
        const isEmpty = newPlan && Object.keys(newPlan).length === 0;
        const updatedEntity = isEmpty 
            ? { entity: entityId }
            : { entity: entityId, plan: newPlan };
        
        this._dispatchUpdate(updatedEntity);
    }

    private _dispatchUpdate(updatedElement: EntityConfig) {
        const event = new CustomEvent('element-update', {
            detail: { 
                index: this.index,
                element: updatedElement
            },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
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
