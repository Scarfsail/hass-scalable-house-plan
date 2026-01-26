import type { CreateCardElement } from "./getCreateCardElement";

/**
 * Get or create a card element for an entity or no-entity element
 * This utility is shared between element-renderer-shp and info-box-shp
 * to maintain consistent card creation and caching behavior.
 * 
 * @param uniqueKey - Unique identifier (entity ID for entities, generated key for no-entity elements)
 * @param entityId - Entity ID (can be empty string for no-entity elements)
 * @param elementConfig - Element configuration
 * @param createCardElement - Function to create card elements
 * @param elementCards - Cache map for card elements
 * @returns Card element instance or undefined if creation failed
 */
export function getOrCreateElementCard(
    uniqueKey: string,
    entityId: string, 
    elementConfig: any, 
    createCardElement: CreateCardElement | null,
    elementCards: Map<string, any>
): any {
    let card = elementCards.get(uniqueKey);
    
    if (!card && createCardElement) {
        const cardConfig = {
            ...elementConfig,
            entity: entityId || undefined,  // Don't pass empty string to card config
        };
        
        try {
            card = createCardElement(cardConfig);
            if (card) {
                elementCards.set(uniqueKey, card);
            }
        } catch (e) {
            console.error('Error creating element card:', e);
        }
    }
    
    return card;
}
