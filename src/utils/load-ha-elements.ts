export const loadHaEntityPicker = async () => {
    if (customElements.get('ha-selector-entity')) return;
    
    // Load selector components
    if (!customElements.get("ha-form") ||
        !customElements.get("hui-card-features-editor")) {
        await (customElements.get("hui-tile-card") as any)?.getConfigElement();
    }
    if (!customElements.get("ha-selector-entity")) {
        await (customElements.get("hui-entities-card") as any)?.getConfigElement();
    }
};
