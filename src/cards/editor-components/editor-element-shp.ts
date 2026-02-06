import { LitElement, html, css, PropertyValues } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { sharedStyles } from "./shared-styles";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { EntityConfig, PlanConfig, ElementConfig } from "../types";
import { getAreaEntities } from "../../utils";
import { getLocalizeFunction, type LocalizeFunction } from "../../localize";
import "./editor-plan-section-shp";
import "./editor-element-section-shp";

@customElement("editor-element-shp")
export class EditorElementShp extends LitElement {
    @property({ attribute: false }) hass!: HomeAssistant;
    @property({ type: Object }) entity!: EntityConfig;
    @property({ type: Number }) index!: number;
    @property({ type: Boolean }) isExpanded: boolean = false;
    @property({ type: String }) areaId?: string; // Optional area ID for filtering entities
    @property({ type: Boolean }) filterByArea?: boolean; // Toggle for area filtering (undefined = not initialized)
    
    @state() private _planSectionConfig?: Omit<PlanConfig, 'element'>;
    @state() private _elementSectionConfig?: ElementConfig;
    @state() private _planSectionExpanded: boolean = true;
    @state() private _elementSectionExpanded: boolean = true;
    
    private _localize?: LocalizeFunction;

    // Track if this is a no-entity element
    // A no-entity element has: empty entity AND plan with element.type defined
    private get _isNoEntity(): boolean {
        const entityId = typeof this.entity === 'string' ? this.entity : this.entity.entity;
        if (entityId && entityId !== '') return false;  // Has entity = not no-entity
        
        // Empty entity - check if it's intentional (has plan with element.type)
        const planConfig = typeof this.entity !== 'string' ? this.entity.plan : undefined;
        return !!(planConfig && planConfig.element && planConfig.element.type);
    }

    private get localize(): LocalizeFunction {
        if (!this._localize) {
            this._localize = getLocalizeFunction(this.hass);
        }
        return this._localize;
    }

    static styles = [
        sharedStyles,
        css`
            :host {
                display: block;
            }

            .entity-picker {
                margin-bottom: 16px;
            }

            .entity-picker-row {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .entity-picker-row ha-entity-picker {
                flex: 1;
            }

            .area-filter {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 4px;
                white-space: nowrap;
            }

            .area-filter-label {
                font-size: 12px;
                color: var(--primary-text-color);
            }

            .plan-section {
                margin-top: 16px;
            }
            .item-header {
                padding:4px;
            }
            .plan-label {
                font-weight: 500;
                margin-bottom: 4px;
                color: var(--primary-text-color);
            }
            .plan-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 4px;
            }
            .plan-header .plan-label {
                margin-bottom: 0;
                flex: 1;
            }
            .no-entity-switch {
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 12px;
                color: var(--secondary-text-color);
                white-space: nowrap;
            }
            .plan-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 4px;
            }
            .plan-header .plan-label {
                margin-bottom: 0;
            }
            .no-entity-switch {
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 12px;
                color: var(--secondary-text-color);
            }

            /* Collapsible section styles */
            .config-sections {
                display: flex;
                flex-direction: column;
                gap: 12px;
                margin-top: 16px;
            }

            .config-section {
                border: 1px solid var(--divider-color);
                border-radius: 8px;
                overflow: hidden;
            }

            .config-section-header {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px;
                background: var(--secondary-background-color);
                cursor: pointer;
                user-select: none;
                transition: background 0.2s;
            }

            .config-section-header:hover {
                background: var(--divider-color);
            }

            .config-section-header ha-icon {
                --mdc-icon-size: 20px;
                color: var(--primary-color);
            }

            .config-section-title {
                flex: 1;
                font-weight: 500;
                font-size: 14px;
                color: var(--primary-text-color);
            }

            .config-section-chevron {
                --mdc-icon-size: 20px;
                color: var(--secondary-text-color);
                transition: transform 0.2s;
            }

            .config-section-chevron.expanded {
                transform: rotate(180deg);
            }

            .config-section-content {
                padding: 12px;
                border-top: 1px solid var(--divider-color);
            }
        `
    ];

    /**
     * Split a full PlanConfig into separate plan and element sections
     * This enables editing them independently in different UI sections
     */
    private _splitPlanConfig(fullPlan: PlanConfig): { 
        planSection: Omit<PlanConfig, 'element'>, 
        elementSection: ElementConfig 
    } {
        const { element, ...planSection } = fullPlan;
        return { 
            planSection, 
            elementSection: element || {} 
        };
    }

    /**
     * Merge plan and element sections back into a complete PlanConfig
     * Only includes element section if it has properties
     */
    private _mergePlanConfig(
        planSection: Omit<PlanConfig, 'element'>, 
        elementSection: ElementConfig
    ): PlanConfig {
        const result: PlanConfig = { ...planSection };
        if (elementSection && Object.keys(elementSection).length > 0) {
            result.element = elementSection;
        }
        return result;
    }

    protected willUpdate(changedProperties: PropertyValues) {
        super.willUpdate(changedProperties);
        
        // Initialize split state variables when entity changes
        if (changedProperties.has('entity')) {
            const planConfig = typeof this.entity !== 'string' ? this.entity.plan : undefined;
            if (planConfig) {
                const { planSection, elementSection } = this._splitPlanConfig(planConfig);
                this._planSectionConfig = planSection;
                this._elementSectionConfig = elementSection;
            } else {
                this._planSectionConfig = undefined;
                this._elementSectionConfig = undefined;
            }
        }
        
        // Initialize filterByArea based on whether the entity is in the area
        // This only runs once when the component is first loaded
        if (this.filterByArea === undefined && this.areaId && this.hass) {
            const entityId = typeof this.entity === 'string' ? this.entity : this.entity.entity;
            if (entityId) {
                const areaEntities = getAreaEntities(this.hass, this.areaId);
                // If entity is NOT in area, default to showing all entities
                this.filterByArea = areaEntities.includes(entityId);
            } else {
                // No entity yet, default to filtering by area
                this.filterByArea = true;
            }
        }
    }

    protected render() {
        // Extract entity ID and plan config
        const entityId = typeof this.entity === 'string' ? this.entity : this.entity.entity;
        const planConfig = typeof this.entity !== 'string' ? this.entity.plan : undefined;
        const placementIndicator = this._getPlacementIndicator(planConfig);
        const displayName = this._getEntityDisplayName(entityId);
        const stateObj = entityId ? this.hass?.states?.[entityId] : undefined;
        
        return html`
            <div class="item">
                <div class="item-header" @click=${this._toggleExpansion}>
                    <ha-icon 
                        icon="mdi:chevron-right" 
                        class="expand-icon ${this.isExpanded ? 'expanded' : ''}"
                    ></ha-icon>
                    <div class="item-info">
                        ${stateObj ? html`
                            <ha-state-icon 
                                .hass=${this.hass}
                                .stateObj=${stateObj}
                                class="item-icon"
                            ></ha-state-icon>
                        ` : this._isNoEntity ? html`
                            <ha-icon icon="mdi:shape" class="item-icon" style="color: var(--label-badge-yellow, #f4b400);"></ha-icon>
                        ` : html`
                            <ha-icon icon="mdi:home-assistant" class="item-icon"></ha-icon>
                        `}
                        <span class="item-name">${displayName}</span>
                        ${placementIndicator.show ? html`
                            <ha-icon 
                                icon="mdi:floor-plan" 
                                style="--mdc-icon-size: 16px; color: ${placementIndicator.color}; flex-shrink: 0;"
                            ></ha-icon>
                        ` : ''}
                    </div>
                    <div class="item-actions" @click=${(e: Event) => e.stopPropagation()}>
                        <button class="icon-button" @click=${this._duplicateElement} title="${this.localize('editor.duplicate_entity')}">
                            <ha-icon icon="mdi:content-duplicate"></ha-icon>
                        </button>
                        <button class="icon-button danger" @click=${this._removeElement}>
                            <ha-icon icon="mdi:delete"></ha-icon>
                        </button>
                        <ha-icon icon="mdi:drag" class="handle" .disabled=${false} @click=${(e: Event) => e.stopPropagation()}></ha-icon>
                    </div>
                </div>
                
                <div class="item-content ${this.isExpanded ? 'expanded' : ''}" @focusin=${this._handleContentFocus}>
                    <!-- Entity Picker (hidden if no-entity mode) -->
                    ${!this._isNoEntity ? html`
                        <div class="entity-picker">
                            <div class="entity-picker-row">
                                <ha-entity-picker
                                    .hass=${this.hass}
                                    .value=${entityId}
                                    .includeEntities=${this._getIncludeEntities(entityId)}
                                    @value-changed=${this._entityIdChanged}
                                    allow-custom-entity
                                ></ha-entity-picker>
                                ${this.areaId ? html`
                                    <div class="area-filter">
                                        <span class="area-filter-label">${this.localize('editor.area')}</span>
                                        <ha-switch
                                            .checked=${this.filterByArea ?? true}
                                            @change=${this._toggleAreaFilter}
                                        ></ha-switch>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    ` : ''}
                    
                    <!-- Configuration sections header with no-entity switch -->
                    <div class="plan-header">
                        <div class="plan-label">
                            ${this._isNoEntity 
                                ? this.localize('editor.plan_configuration_required') 
                                : this.localize('editor.plan_configuration_optional')}
                        </div>
                        <div class="no-entity-switch">
                            <span>${this.localize('editor.no_entity')}</span>
                            <ha-switch
                                .checked=${this._isNoEntity}
                                @change=${this._toggleNoEntity}
                            ></ha-switch>
                        </div>
                    </div>

                    <!-- Split configuration sections -->
                    <div class="config-sections">
                        <!-- Plan Section (Position & Layout) -->
                        <div class="config-section">
                            <div class="config-section-header" @click=${this._togglePlanSection}>
                                <ha-icon icon="mdi:floor-plan"></ha-icon>
                                <span class="config-section-title">${this.localize('editor.plan_section_title') || 'Plan (Position & Layout)'}</span>
                                <ha-icon 
                                    icon="mdi:chevron-down"
                                    class="config-section-chevron ${this._planSectionExpanded ? 'expanded' : ''}"
                                ></ha-icon>
                            </div>
                            ${this._planSectionExpanded ? html`
                                <div class="config-section-content">
                                    <editor-plan-section-shp
                                        .hass=${this.hass}
                                        .planSection=${this._planSectionConfig || {}}
                                        @plan-changed=${this._onPlanSectionChanged}
                                    ></editor-plan-section-shp>
                                </div>
                            ` : ''}
                        </div>

                        <!-- Element Section (Type & Properties) -->
                        <div class="config-section">
                            <div class="config-section-header" @click=${this._toggleElementSection}>
                                <ha-icon icon="mdi:puzzle"></ha-icon>
                                <span class="config-section-title">${this.localize('editor.element_section_title') || 'Element (Type & Properties)'}</span>
                                <ha-icon 
                                    icon="mdi:chevron-down"
                                    class="config-section-chevron ${this._elementSectionExpanded ? 'expanded' : ''}"
                                ></ha-icon>
                            </div>
                            ${this._elementSectionExpanded ? html`
                                <div class="config-section-content">
                                    <editor-element-section-shp
                                        .hass=${this.hass}
                                        .elementSection=${this._elementSectionConfig || {}}
                                        .areaId=${this.areaId}
                                        @element-changed=${this._onElementSectionChanged}
                                    ></editor-element-section-shp>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private _getEntityDisplayName(entityId: string): string {
        if (!entityId) {
            // For no-entity elements, show element type if available
            const planConfig = typeof this.entity !== 'string' ? this.entity.plan : undefined;
            const elementType = planConfig?.element?.type;
            
            // Show element type if it's properly set (not just placeholder)
            if (elementType && elementType !== 'custom:' && elementType.trim() !== '') {
                return elementType;
            }
            
            // Show appropriate placeholder
            return this._isNoEntity 
                ? this.localize('editor.new_element') || 'New element'
                : this.localize('editor.new_entity');
        }
        
        // Try to get friendly name from hass states
        const state = this.hass?.states?.[entityId];
        if (state?.attributes?.friendly_name) {
            return state.attributes.friendly_name;
        }
        
        // Fall back to entity ID
        return entityId;
    }

    private _getPlacementIndicator(planConfig: any): { show: boolean; color: string } {
        // No plan config = entities only, no indicator
        if (!planConfig) {
            return { show: false, color: '' };
        }
        
        // Check if overview is explicitly set to false (detail-only)
        const overview = planConfig.overview !== false; // Default is true
        
        if (overview) {
            // Green for overview
            return { show: true, color: 'var(--success-color, #4caf50)' };
        } else {
            // Orange for detail-only
            return { show: true, color: 'var(--warning-color, #ff9800)' };
        }
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
     * If area is set and filterByArea is true, include area entities + current selection (if different)
     * Otherwise, return undefined (show all entities)
     */
    private _getIncludeEntities(currentEntityId: string): string[] | undefined {
        if (!this.areaId || this.filterByArea === false) {
            return undefined; // No filtering when no area is set or filter is explicitly disabled
        }

        const areaEntities = getAreaEntities(this.hass, this.areaId);
        
        // If current entity is not in area entities, add it to the list
        // This preserves manually configured entities
        if (currentEntityId && !areaEntities.includes(currentEntityId)) {
            return [...areaEntities, currentEntityId];
        }
        
        return areaEntities;
    }

    private _onPlanSectionChanged(ev: CustomEvent) {
        this._planSectionConfig = ev.detail.value;
        this._updateFullConfig();
    }

    private _onElementSectionChanged(ev: CustomEvent) {
        this._elementSectionConfig = ev.detail.value;
        this._updateFullConfig();
    }

    private _updateFullConfig() {
        const fullPlan = this._mergePlanConfig(
            this._planSectionConfig || {},
            this._elementSectionConfig || {}
        );
        const entityId = typeof this.entity === 'string' 
            ? this.entity 
            : this.entity.entity;
        
        // If plan is empty object, create entity-only config
        const isEmpty = Object.keys(fullPlan).length === 0;
        const updatedEntity = isEmpty 
            ? { entity: entityId }
            : { entity: entityId, plan: fullPlan };
        
        this._dispatchUpdate(updatedEntity);
    }

    private _togglePlanSection() {
        this._planSectionExpanded = !this._planSectionExpanded;
    }

    private _toggleElementSection() {
        this._elementSectionExpanded = !this._elementSectionExpanded;
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

    /**
     * Generate uniqueKey following the same pattern as element-renderer-shp.ts
     * Used for bi-directional sync between editor and preview
     */
    private _getUniqueKey(): string {
        const entityId = typeof this.entity === 'string' ? this.entity : this.entity.entity;
        const planConfig = typeof this.entity !== 'string' ? this.entity.plan : undefined;

        if (entityId) {
            return entityId;
        }

        // No-entity element: generate key using format elementType-left-top-right-bottom-room_id-mode
        const elementType = planConfig?.element?.type || 'unknown';
        const left = planConfig?.left !== undefined ? String(planConfig.left) : 'undefined';
        const top = planConfig?.top !== undefined ? String(planConfig.top) : 'undefined';
        const right = planConfig?.right !== undefined ? String(planConfig.right) : 'undefined';
        const bottom = planConfig?.bottom !== undefined ? String(planConfig.bottom) : 'undefined';

        // Include room_id if present (for info boxes to be unique per room)
        const roomId = planConfig?.element?.room_id ? `-${planConfig.element.room_id}` : '';

        // Include mode only for info boxes (they have mode-specific visibility settings)
        const isInfoBox = elementType === 'custom:info-box-shp';
        const mode = isInfoBox && planConfig?.element?.mode ? `-${planConfig.element.mode}` : '';

        return `${elementType}-${left}-${top}-${right}-${bottom}${roomId}${mode}`;
    }

    /**
     * Emit focus event to sync preview highlighting
     */
    private _emitFocusEvent(): void {
        const focusEvent = new CustomEvent('scalable-house-plan-element-focused', {
            detail: { uniqueKey: this._getUniqueKey() },
            bubbles: true,
            composed: true
        });
        window.dispatchEvent(focusEvent);
    }

    /**
     * Toggle expansion state
     * Emits focus event when expanding to sync with preview
     */
    private _toggleExpansion() {
        const event = new CustomEvent('element-toggle', {
            detail: { index: this.index },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);

        // Phase 3: Emit focus event when expanding (for bi-directional sync)
        // Only emit when expanding (isExpanded will become true after this toggle)
        if (!this.isExpanded) {
            this._emitFocusEvent();
        }
    }

    /**
     * Handle focus on any editing field (YAML editor, plan inputs, etc.)
     * Emits focus event to highlight element in preview while editing
     * Ignores focus from nested children (e.g., child elements inside groups)
     */
    private _handleContentFocus(e: FocusEvent): void {
        if (this.isExpanded) {
            // Check if focus came from a nested editor-element-shp (child element in a group)
            // Use composedPath() to traverse shadow DOM boundaries
            const path = e.composedPath();
            const currentContent = e.currentTarget as HTMLElement;
            const currentContentIndex = path.indexOf(currentContent);
            
            // Look for editor-element-shp elements in the path between target and currentTarget
            for (let i = 0; i < currentContentIndex; i++) {
                const element = path[i] as HTMLElement;
                if (element.tagName === 'EDITOR-ELEMENT-SHP') {
                    return; // Don't emit focus, let child handle it
                }
            }
            
            // User is interacting with THIS element's editor field - highlight in preview
            this._emitFocusEvent();
        }
    }

    private _toggleNoEntity(ev: Event) {
        const isNoEntity = (ev.target as HTMLInputElement).checked;
        const currentEntityId = typeof this.entity === 'string' ? this.entity : this.entity.entity;
        const planConfig = typeof this.entity !== 'string' ? this.entity.plan : undefined;
        
        if (isNoEntity) {
            // Switching to no-entity mode: clear entity, add element.type placeholder
            const updatedPlan = {
                ...(planConfig || {}),
                element: {
                    ...(planConfig?.element || {}),
                    type: planConfig?.element?.type || 'custom:' // Add placeholder type
                }
            };
            const updatedEntity = {
                entity: '',
                plan: updatedPlan
            };
            this._dispatchUpdate(updatedEntity);
        } else {
            // Switching back to entity mode: keep entity empty, remove element.type if it was just placeholder
            const updatedPlan = planConfig ? {
                ...planConfig,
                element: planConfig.element ? {
                    ...planConfig.element,
                    type: undefined  // Remove type to exit no-entity mode
                } : undefined
            } : undefined;
            
            // Clean up empty element object
            if (updatedPlan?.element && Object.keys(updatedPlan.element).filter((k: string) => updatedPlan.element![k as keyof typeof updatedPlan.element] !== undefined).length === 0) {
                delete updatedPlan.element;
            }
            
            const updatedEntity = updatedPlan && Object.keys(updatedPlan).length > 0
                ? { entity: currentEntityId || '', plan: updatedPlan }
                : { entity: currentEntityId || '' };
                
            this._dispatchUpdate(updatedEntity);
        }
        
        // Force re-render to update UI immediately
        this.requestUpdate();
    }

    private _toggleAreaFilter(ev: Event) {
        this.filterByArea = (ev.target as HTMLInputElement).checked;
    }

    private _duplicateElement() {
        const event = new CustomEvent('element-duplicate', {
            detail: { index: this.index, element: this.entity },
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

    /**
     * Phase 4: Public method to expand element with plan section focused
     * Called from parent when element is clicked in preview
     */
    public expandWithPlanFocus(): void {
        this.isExpanded = true;
        this._planSectionExpanded = true;  // Ensure plan section is open
        this.requestUpdate();
    }
}
