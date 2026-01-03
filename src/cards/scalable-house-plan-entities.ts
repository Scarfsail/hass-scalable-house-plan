import { LitElement, html, css } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { Room, EntityConfig } from "./scalable-house-plan";
import { getElementTypeForEntity, mergeElementProperties, getRoomName, getAreaEntities, getRoomIcon, groupEntitiesByCategory, getSortedCategories, EntityCategory, CATEGORY_DEFINITIONS, getRoomEntities } from "../utils";
import { getLocalizeFunction } from "../localize";

/**
 * Room entities view component
 * Displays all entities from a room as standard HA cards in a responsive grid
 */
@customElement("scalable-house-plan-entities")
export class ScalableHousePlanEntities extends LitElement {
    @property({ attribute: false }) public hass?: HomeAssistant;
    @property({ attribute: false }) public room?: Room;
    @property({ attribute: false }) public onBack?: () => void;

    @state() private _showAllEntities: boolean = false; // Default to showing only entities not on detail

    // Cache for card elements (key: entity_id, value: card element)
    private _cardElements: Map<string, any> = new Map();
    
    // Cache for area entities (fetched once per room change)
    @state() private _areaEntityIds: string[] = [];
    
    // Track collapsed state of categories (all expanded by default)
    @state() private _collapsedCategories: Set<EntityCategory> = new Set();

    updated(changedProperties: Map<string, any>) {
        super.updated(changedProperties);
        
        // Clear cache and fetch area entities when room changes
        if (changedProperties.has('room')) {
            this._cardElements.clear();
            this._fetchAreaEntities();
            this._initializeCollapsedCategories();
        }
    }

    /**
     * Initialize collapsed categories based on collapsed property
     */
    private _initializeCollapsedCategories() {
        this._collapsedCategories = new Set();
        
        Object.values(CATEGORY_DEFINITIONS).forEach(categoryDef => {
            if (categoryDef.collapsed) {
                this._collapsedCategories.add(categoryDef.key);
            }
        });
    }

    /**
     * Fetch area entities once when room changes
     * Cached in _areaEntityIds state property
     */
    private _fetchAreaEntities() {
        if (!this.room || !this.hass || !this.room.area) {
            this._areaEntityIds = [];
            return;
        }
        
        this._areaEntityIds = getAreaEntities(this.hass, this.room.area);
    }

    static get styles() {
        return css`
            :host {
                display: block;
                height: 100%;
                overflow: auto;
                background: var(--lovelace-background, var(--primary-background-color));
            }

            .header {
                display: flex;
                align-items: center;
                padding: 8px 12px;
                background: var(--card-background-color);
                border-bottom: 1px solid var(--divider-color);
                position: sticky;
                top: 0;
                z-index: 1;
            }

            .back-button {
                margin-right: 8px;
                cursor: pointer;
                color: var(--primary-text-color);
                --mdc-icon-button-size: 36px;
            }

            .room-icon {
                margin-right: 8px;
                color: var(--primary-text-color);
            }

            .room-name {
                font-size: 18px;
                font-weight: 500;
                margin: 0;
                color: var(--primary-text-color);
            }

            .filter-toggle {
                display: flex;
                align-items: center;
                margin-left: 12px;
            }

            .toggle-label {
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                user-select: none;
            }

            .toggle-text {
                font-size: 13px;
                color: var(--secondary-text-color);
                white-space: nowrap;
            }

            .cards-container {
                padding: 16px;
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 16px;
                max-width: 1200px;
                margin: 0 auto;
            }

            @media (max-width: 768px) {
                .cards-container {
                    grid-template-columns: 1fr;
                    padding: 8px;
                    gap: 8px;
                }

                .header {
                    padding: 6px 8px;
                }

                .room-name {
                    font-size: 16px;
                }
            }

            .entity-card {
                min-height: 60px;
            }

            .category-section {
                margin-bottom: 16px;
            }

            .category-header {
                display: flex;
                align-items: center;
                padding: 8px 12px;
                background: var(--card-background-color);
                border-radius: 8px;
                margin-bottom: 8px;
                cursor: pointer;
                user-select: none;
                transition: background-color 0.2s;
            }

            .category-header:hover {
                background: var(--secondary-background-color);
            }

            .category-icon {
                margin-right: 8px;
                color: var(--primary-color);
                --mdc-icon-size: 20px;
            }

            .category-title {
                flex: 1;
                font-size: 14px;
                font-weight: 500;
                color: var(--primary-text-color);
                margin: 0;
            }

            .category-count {
                font-size: 12px;
                color: var(--secondary-text-color);
                margin-right: 8px;
            }

            .category-expand-icon {
                color: var(--secondary-text-color);
                --mdc-icon-size: 20px;
                transition: transform 0.2s;
            }

            .category-expand-icon.expanded {
                transform: rotate(180deg);
            }

            .category-cards {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 12px;
            }

            .category-cards.collapsed {
                display: none;
            }

            @media (max-width: 768px) {
                .category-cards {
                    grid-template-columns: 1fr;
                    gap: 8px;
                }

                .category-header {
                    padding: 6px 10px;
                }

                .category-title {
                    font-size: 13px;
                }
            }
        `;
    }

    render() {
        if (!this.room || !this.hass) {
            return html`<div>Loading...</div>`;
        }

        const localize = getLocalizeFunction(this.hass);

        return html`
            <div class="header">
                <ha-icon-button
                    class="back-button"
                    .label=${"Back"}
                    @click=${this._handleBack}
                >
                    <ha-icon icon="mdi:arrow-left"></ha-icon>
                </ha-icon-button>
                <ha-icon class="room-icon" icon=${getRoomIcon(this.hass, this.room)}></ha-icon>
                <h1 class="room-name">${getRoomName(this.hass, this.room)}</h1>
                <div class="filter-toggle">
                    <label class="toggle-label">
                        <span class="toggle-text">${this._showAllEntities ? localize('entities.show_all') : localize('entities.show_not_on_detail')}</span>
                        <ha-switch
                            .checked=${this._showAllEntities}
                            @change=${this._handleFilterToggle}
                        ></ha-switch>
                    </label>
                </div>
                <div style="flex: 1;"></div>
            </div>

            <div class="cards-container">
                ${this._renderCategorizedCards()}
            </div>
        `;
    }

    private _renderCategorizedCards() {
        if (!this.room || !this.hass) return html``;

        // Get localize function
        const localize = getLocalizeFunction(this.hass);

        // Use shared utility function to get entities (filtered or all)
        const allEntityConfigs = getRoomEntities(
            this.hass, 
            this.room, 
            this._areaEntityIds, 
            this._showAllEntities
        );

        // Create a map of entityId -> EntityConfig for easy lookup
        const entityConfigMap = new Map<string, EntityConfig>();
        allEntityConfigs.forEach(cfg => {
            const entityId = typeof cfg === 'string' ? cfg : cfg.entity;
            entityConfigMap.set(entityId, cfg);
        });

        // Extract entity IDs for categorization
        const entityIds = allEntityConfigs.map(cfg => 
            typeof cfg === 'string' ? cfg : cfg.entity
        );

        // Group entities by category
        const groupedEntities = groupEntitiesByCategory(
            entityIds,
            (entityId) => this.hass?.states[entityId]?.attributes?.device_class
        );

        // Get sorted categories (excluding empty ones)
        const sortedCategories = getSortedCategories(groupedEntities);

        // Render each category with its entities
        return sortedCategories.map(categoryDef => {
            const categoryEntities = groupedEntities.get(categoryDef.key) || [];
            const isCollapsed = this._collapsedCategories.has(categoryDef.key);

            return html`
                <div class="category-section">
                    <div 
                        class="category-header"
                        @click=${() => this._toggleCategory(categoryDef.key)}
                    >
                        <ha-icon class="category-icon" icon="${categoryDef.icon}"></ha-icon>
                        <h2 class="category-title">${localize(`category.${categoryDef.key}`)}</h2>
                        <span class="category-count">(${categoryEntities.length})</span>
                        <ha-icon 
                            class="category-expand-icon ${isCollapsed ? '' : 'expanded'}"
                            icon="mdi:chevron-down"
                        ></ha-icon>
                    </div>
                    <div class="category-cards ${isCollapsed ? 'collapsed' : ''}">
                        ${categoryEntities.map(entityId => this._renderEntityCard(entityId, entityConfigMap.get(entityId)!))}
                    </div>
                </div>
            `;
        });
    }

    private _renderEntityCard(entityId: string, entityConfig: EntityConfig) {
        const plan = typeof entityConfig === 'string' ? undefined : entityConfig.plan;
        
        // Get device_class for mapping lookup
        const deviceClass = this.hass?.states[entityId]?.attributes?.device_class;
        
        // Get default detail element definition
        const defaultElement = getElementTypeForEntity(entityId, deviceClass, 'detail');
        
        // Check if user provided custom detail element config in plan.element
        const elementConfig = plan?.element 
            ? mergeElementProperties(defaultElement, plan.element)
            : defaultElement;
        
        // Create card element
        const cardConfig = {
            entity: entityId,
            ...elementConfig
        };

        return this._getOrCreateCard(entityId, cardConfig);
    }

    private _toggleCategory(category: EntityCategory) {
        if (this._collapsedCategories.has(category)) {
            this._collapsedCategories.delete(category);
        } else {
            this._collapsedCategories.add(category);
        }
        this.requestUpdate();
    }

    private _getOrCreateCard(entityId: string, config: any) {
        // Check if card already exists in cache
        let cardElement = this._cardElements.get(entityId);
        
        if (!cardElement) {
            // Create new card element
            try {
                const elementTag = this._getCardElementTag(config.type);
                cardElement = document.createElement(elementTag) as any;
                
                if (cardElement.setConfig) {
                    cardElement.setConfig(config);
                }
                
                // Cache the element
                this._cardElements.set(entityId, cardElement);
            } catch (e) {
                console.error('Error creating card:', e);
                // Create error card as fallback
                cardElement = document.createElement('hui-error-card') as any;
                cardElement.setConfig({
                    type: 'error',
                    error: `Card type not supported: ${config.type}`,
                    origConfig: config
                });
                this._cardElements.set(entityId, cardElement);
            }
        }
        
        // Always update hass on the cached element
        if (cardElement && this.hass) {
            cardElement.hass = this.hass;
        }

        return html`
            <div class="entity-card">
                ${cardElement}
            </div>
        `;
    }

    private _getCardElementTag(cardType: string): string {
        // Map card types to element tags
        const typeMap: Record<string, string> = {
            'tile': 'hui-tile-card',
            'button': 'hui-button-card',
            'entities': 'hui-entities-card',
            'thermostat': 'hui-thermostat-card',
            'light': 'hui-light-card',
            'sensor': 'hui-sensor-card',
            'gauge': 'hui-gauge-card',
            'history-graph': 'hui-history-graph-card',
        };

        // If it's already a custom element tag, return as-is
        if (cardType.includes(':') || cardType.includes('-')) {
            return cardType;
        }

        return typeMap[cardType] || 'hui-error-card';
    }

    private _handleBack() {
        if (this.onBack) {
            this.onBack();
        }
    }

    private _handleFilterToggle(e: Event) {
        const switchElement = e.target as any;
        this._showAllEntities = switchElement.checked;
        this.requestUpdate();
    }
}
