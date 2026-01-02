import { html, TemplateResult } from "lit-element";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { Room, EntityConfig } from "../cards/scalable-house-plan";
import { CreateCardElement, getElementTypeForEntity, mergeElementProperties } from "../utils";

/**
 * Shared element rendering functionality for overview and detail views
 * 
 * Handles:
 * - Element card creation and caching
 * - Position calculation (percentage-based relative to room)
 * - Size calculation (with optional scaling)
 */

export interface ElementRendererOptions {
    hass: HomeAssistant;
    room: Room;
    roomBounds: { minX: number; minY: number; width: number; height: number };
    createCardElement: CreateCardElement | null;
    elementCards: Map<string, any>;
    scale: number;
}

/**
 * Renders elements for a room
 * Scaling is handled by parent container - elements keep original pixel sizes
 */
export function renderElements(options: ElementRendererOptions): TemplateResult[] {
    const { hass, room, roomBounds, createCardElement, elementCards, scale } = options;

    // Get all entities with plan config
    const elements = (room.entities || [])
        .filter((entityConfig: EntityConfig) => {
            if (typeof entityConfig === 'string') return false;
            return !!entityConfig.plan;
        })
        .map((entityConfig: EntityConfig) => {
            const entity = typeof entityConfig === 'string' ? entityConfig : entityConfig.entity;
            const plan = typeof entityConfig === 'string' ? undefined : entityConfig.plan;
            
            if (!plan) return null;

            // Get default element definition for this entity
            const deviceClass = hass?.states[entity]?.attributes?.device_class;
            const defaultElement = getElementTypeForEntity(entity, deviceClass, 'plan');
            
            // Merge default properties with user overrides
            const elementConfig = mergeElementProperties(defaultElement, plan.element);

            return { entity, plan, elementConfig };
        })
        .filter((el): el is { entity: string; plan: any; elementConfig: any } => el !== null);

    return elements.map(({ entity, plan, elementConfig }) => {
        // Calculate percentage-based position (maintain relative position in room)
        const style: Record<string, string> = {
            position: 'absolute'
        };

        // Handle positions - support both pixels (convert to %) and percentages (use as-is)
        if (plan.left !== undefined) {
            if (typeof plan.left === 'string' && plan.left.includes('%')) {
                // Already a percentage - use directly
                style.left = plan.left;
            } else if (typeof plan.left === 'number') {
                // Pixels - convert to percentage relative to room
                const percentage = (plan.left / roomBounds.width) * 100;
                style.left = `${percentage}%`;
            }
        }
        
        if (plan.top !== undefined) {
            if (typeof plan.top === 'string' && plan.top.includes('%')) {
                style.top = plan.top;
            } else if (typeof plan.top === 'number') {
                const percentage = (plan.top / roomBounds.height) * 100;
                style.top = `${percentage}%`;
            }
        }
        
        if (plan.right !== undefined) {
            if (typeof plan.right === 'string' && plan.right.includes('%')) {
                style.right = plan.right;
            } else if (typeof plan.right === 'number') {
                const percentage = (plan.right / roomBounds.width) * 100;
                style.right = `${percentage}%`;
            }
        }
        
        if (plan.bottom !== undefined) {
            if (typeof plan.bottom === 'string' && plan.bottom.includes('%')) {
                style.bottom = plan.bottom;
            } else if (typeof plan.bottom === 'number') {
                const percentage = (plan.bottom / roomBounds.height) * 100;
                style.bottom = `${percentage}%`;
            }
        }

        // Handle size - always use original pixel sizes
        // Scaling is handled by parent container transform (overview) or container sizing (detail)
        const originalWidth = plan.width ?? elementConfig.width;
        const originalHeight = plan.height ?? elementConfig.height;
        
        if (originalWidth !== undefined) {
            style.width = `${originalWidth}px`;
        }
        if (originalHeight !== undefined) {
            style.height = `${originalHeight}px`;
        }

        // Get or create the element card
        const card = getOrCreateElementCard(entity, elementConfig, createCardElement, elementCards);
        if (card && hass) {
            card.hass = hass;
        }

        const styleString = Object.entries(style)
            .map(([k, v]) => `${k}: ${v}`)
            .join('; ');

        return html`
            <div class="element-wrapper" style="${styleString}">
                ${card}
            </div>
        `;
    });
}

/**
 * Get or create a card element for an entity
 */
function getOrCreateElementCard(
    entityId: string, 
    elementConfig: any, 
    createCardElement: CreateCardElement | null,
    elementCards: Map<string, any>
) {
    let card = elementCards.get(entityId);
    
    if (!card && createCardElement) {
        const cardConfig = {
            ...elementConfig,
            entity: entityId,
        };
        
        try {
            card = createCardElement(cardConfig);
            if (card) {
                elementCards.set(entityId, card);
            }
        } catch (e) {
            console.error('Error creating element card:', e);
        }
    }
    
    return card;
}

/**
 * Calculate room bounding box
 */
export function getRoomBounds(room: Room): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
    if (!room.boundary || room.boundary.length === 0) {
        return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 };
    }
    
    const xs = room.boundary.map(p => p[0]);
    const ys = room.boundary.map(p => p[1]);
    
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    
    return {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX,
        height: maxY - minY
    };
}
