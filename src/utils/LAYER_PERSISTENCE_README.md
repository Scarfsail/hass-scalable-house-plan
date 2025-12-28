# Layer State Persistence - Testing & Debugging

## Configuration

### Basic Usage (Shared State)
```yaml
type: custom:scalable-house-plan
image: /local/floorplan.png
layers:
  - name: "Lights"
    # ... layer config
# No layers_visibility_persistence_id = uses 'default' (shared across cards)
```

### Separate State Per Card
```yaml
type: custom:scalable-house-plan
image: /local/floorplan.png
layers_visibility_persistence_id: "living-room-card"  # Unique state for this card
layers:
  - name: "Lights"
    # ... layer config
```

### Shared State Across Multiple Cards
```yaml
# Card 1 - Living Room
type: custom:scalable-house-plan
layers_visibility_persistence_id: "main-house"  # Shared state
# ...

# Card 2 - Kitchen  
type: custom:scalable-house-plan
layers_visibility_persistence_id: "main-house"  # Same ID = shared state
# ...
```

## Testing the Implementation

### Basic Usage
The layer state persistence works automatically:
1. Toggle layer visibility using the layer buttons
2. Refresh the page/browser tab - layer states are preserved
3. Cards with same `layers_visibility_persistence_id` share states
4. Cards without the parameter use 'default' (shared by default)

### Debugging Commands

#### View Current Stored State
```javascript
// In browser console
const cardElement = document.querySelector('scalable-house-plan');
const storageKey = `hass-layers-state-${cardElement.layerStateManager.persistenceId}`;
console.log('Stored state:', JSON.parse(localStorage.getItem(storageKey) || '{}'));
```

#### Reset Layer State
```javascript
// In browser console - reset single card
document.querySelector('scalable-house-plan').resetLayerState();

// Reset all layer states for all cards
Object.keys(localStorage)
  .filter(key => key.startsWith('hass-layers-state-'))
  .forEach(key => localStorage.removeItem(key));
```

#### View All Layer Storage Keys
```javascript
// In browser console
Object.keys(localStorage)
  .filter(key => key.startsWith('hass-layers-state-'))
  .forEach(key => console.log(key, JSON.parse(localStorage.getItem(key))));
```

### Storage Format
The storage format is JSON with layer indices as keys:
```json
{
  "0": true,   // Layer 0 is visible
  "1": false,  // Layer 1 is hidden
  "2": true    // Layer 2 is visible
}
```

### Persistence ID Logic
- **With `layers_visibility_persistence_id`**: Uses the provided ID for storage
- **Without parameter**: Uses 'default' (enables sharing across multiple cards)
- **Same ID**: Multiple cards share the same layer visibility state
- **Different IDs**: Each gets independent layer state storage

### Storage Keys
- Default: `hass-layers-state-default`
- Custom: `hass-layers-state-{your-custom-id}`
