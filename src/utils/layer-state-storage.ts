/**
 * Utility for persisting layer visibility state in localStorage
 * Uses cardId scoping to allow different states for different card instances
 */

export interface LayerStateStorage {
    [layerId: string]: boolean;
}

export class LayerStateManager {
    private readonly storagePrefix = 'hass-layers-state';
    private persistenceId: string;

    constructor(persistenceId: string) {
        this.persistenceId = persistenceId;
    }

    /**
     * Generate persistence ID from config
     * Uses layers_visibility_persistence_id if provided, otherwise falls back to 'default'
     */
    static generatePersistenceId(config: any): string {
        // If user provided a custom persistence ID, use it
        if (config.layers_visibility_persistence_id) {
            return config.layers_visibility_persistence_id;
        }
        
        // Otherwise use 'default' - this allows sharing state across cards by default
        return 'default';
    }

    /**
     * Get the storage key for this persistence ID
     */
    private getStorageKey(): string {
        return `${this.storagePrefix}-${this.persistenceId}`;
    }

    /**
     * Load layer visibility state from localStorage
     */
    loadLayerState(): LayerStateStorage {
        try {
            const stored = localStorage.getItem(this.getStorageKey());
            if (stored) {
                const parsed = JSON.parse(stored);
                // Validate that all values are booleans
                const validated: LayerStateStorage = {};
                for (const [key, value] of Object.entries(parsed)) {
                    if (typeof value === 'boolean') {
                        validated[key] = value;
                    }
                }
                return validated;
            }
        } catch (error) {
            console.warn('Failed to load layer state from localStorage:', error);
        }
        return {};
    }

    /**
     * Save layer visibility state to localStorage
     */
    saveLayerState(layerState: LayerStateStorage): void {
        try {
            const stateToSave: LayerStateStorage = {};
            // Only save non-default states (false values) to keep storage minimal
            for (const [layerId, visible] of Object.entries(layerState)) {
                stateToSave[layerId] = visible;
            }
            
            localStorage.setItem(this.getStorageKey(), JSON.stringify(stateToSave));
        } catch (error) {
            console.warn('Failed to save layer state to localStorage:', error);
        }
    }

    /**
     * Update a single layer's visibility state and save
     */
    updateLayerVisibility(layerId: string, visible: boolean): void {
        const currentState = this.loadLayerState();
        currentState[layerId] = visible;
        this.saveLayerState(currentState);
    }

    /**
     * Clear stored layer state for this card
     */
    clearLayerState(): void {
        try {
            localStorage.removeItem(this.getStorageKey());
        } catch (error) {
            console.warn('Failed to clear layer state from localStorage:', error);
        }
    }

    /**
     * Get the default visibility for a layer (when not stored)
     */
    static getDefaultVisibility(layer: any): boolean {
        // Default to visible unless explicitly set to false in layer config
        return layer.visible !== false;
    }
}