import { HassEntity } from 'home-assistant-js-websocket';

/**
 * Represents a single threshold value with its associated color.
 */
export interface GaugeThreshold {
  value: number;
  color: string;
}

/**
 * Defines a complete gauge preset configuration with range and color thresholds.
 */
export interface GaugePreset {
  min: number;
  max: number;
  thresholds: GaugeThreshold[];
}

/**
 * User-facing gauge configuration with optional preset and overrides.
 */
export interface GaugeConfig {
  preset?: 'battery' | 'humidity' | 'temperature_indoor' | 'temperature_outdoor';
  min?: number;
  max?: number;
  thresholds?: GaugeThreshold[];
  height?: number;
  position?: 'bottom' | 'background';
}

/**
 * Fully resolved gauge configuration with all required properties.
 */
export interface ResolvedGaugeConfig {
  min: number;
  max: number;
  thresholds: GaugeThreshold[];
  height: number;
  position: 'bottom' | 'background';
}

/**
 * Default gauge bar height in pixels.
 */
const DEFAULT_GAUGE_HEIGHT = 4;

/**
 * Default gauge bar position.
 */
const DEFAULT_GAUGE_POSITION = 'bottom';

/**
 * Default fallback color when no thresholds are defined.
 */
const DEFAULT_FALLBACK_COLOR = '#666666';

/**
 * Pre-defined gauge presets for common sensor types.
 */
export const GAUGE_PRESETS: Record<string, GaugePreset> = {
  battery: {
    min: 0,
    max: 100,
    thresholds: [
      { value: 0, color: '#F44336' },   // Red (critical)
      { value: 15, color: '#FF9800' },  // Orange (low)
      { value: 30, color: '#4CAF50' },  // Green (good)
    ],
  },
  humidity: {
    min: 0,
    max: 100,
    thresholds: [
      { value: 0, color: '#FF9800' },   // Orange (dry)
      { value: 30, color: '#4CAF50' },  // Green (comfortable)
      { value: 65, color: '#2196F3' },  // Blue (humid)
    ],
  },
  temperature_indoor: {
    min: 18,
    max: 27,
    thresholds: [
      { value: 18, color: '#2196F3' },  // Blue (cold)
      { value: 22, color: '#4CAF50' },  // Green (comfortable)
      { value: 24, color: '#FF9800' },  // Orange (warm)
      { value: 26, color: '#F44336' },  // Red (hot)
    ],
  },
  temperature_outdoor: {
    min: -20,
    max: 40,
    thresholds: [
      { value: -20, color: '#2196F3' }, // Blue (freezing)
      { value: 0, color: '#00BCD4' },   // Cyan (cold)
      { value: 15, color: '#4CAF50' },  // Green (comfortable)
      { value: 26, color: '#FF9800' },  // Orange (warm)
      { value: 35, color: '#F44336' },  // Red (hot)
    ],
  },
};

/**
 * Auto-detect the appropriate gauge preset based on entity device_class.
 * 
 * @param entity - Home Assistant entity
 * @returns Preset name or undefined if no matching preset
 */
export function getPresetFromEntity(entity: HassEntity): string | undefined {
  const deviceClass = entity.attributes?.device_class;

  switch (deviceClass) {
    case 'battery':
      return 'battery';
    case 'humidity':
      return 'humidity';
    case 'temperature':
      return 'temperature_indoor'; // Default indoor, user can override to outdoor
    default:
      return undefined;
  }
}

/**
 * Find the appropriate color for a value based on threshold rules.
 * Uses the highest threshold where value >= threshold.value.
 * 
 * @param value - Current sensor value
 * @param thresholds - Array of thresholds with colors
 * @returns Hex color string
 */
export function getColorForValue(value: number, thresholds: GaugeThreshold[]): string {
  if (!thresholds || thresholds.length === 0) {
    return DEFAULT_FALLBACK_COLOR;
  }

  // Handle NaN or invalid values
  if (typeof value !== 'number' || isNaN(value)) {
    return thresholds[0]?.color ?? DEFAULT_FALLBACK_COLOR;
  }

  // Sort thresholds by value ascending to ensure correct matching
  const sorted = [...thresholds].sort((a, b) => a.value - b.value);

  // Find the highest threshold where value >= threshold.value
  let color = sorted[0]?.color ?? DEFAULT_FALLBACK_COLOR;
  for (const threshold of sorted) {
    if (value >= threshold.value) {
      color = threshold.color;
    } else {
      break;
    }
  }

  return color;
}

/**
 * Calculate the bar width percentage based on current value and range.
 * Clamps the value to min/max range.
 * 
 * @param value - Current sensor value
 * @param min - Minimum value of the range
 * @param max - Maximum value of the range
 * @returns Width percentage (0-100)
 */
export function calculateBarWidth(value: number, min: number, max: number): number {
  // Handle invalid inputs
  if (typeof value !== 'number' || isNaN(value)) {
    return 0;
  }

  if (typeof min !== 'number' || isNaN(min) || typeof max !== 'number' || isNaN(max)) {
    return 0;
  }

  if (max <= min) {
    return 0;
  }

  // Clamp value to range
  const clamped = Math.max(min, Math.min(max, value));

  // Calculate percentage
  const percentage = ((clamped - min) / (max - min)) * 100;

  // Ensure result is between 0 and 100
  return Math.max(0, Math.min(100, percentage));
}

/**
 * Resolve gauge configuration by merging preset, auto-detection, and user overrides.
 * 
 * @param gauge - Gauge configuration (boolean for auto-detect or object for manual config)
 * @param entity - Home Assistant entity for auto-detection
 * @returns Fully resolved gauge config or null if gauge is disabled/invalid
 */
export function resolveGaugeConfig(
  gauge: boolean | GaugeConfig,
  entity: HassEntity
): ResolvedGaugeConfig | null {
  // Gauge disabled
  if (!gauge) {
    return null;
  }

  let baseConfig: GaugePreset | undefined;
  let userConfig: GaugeConfig = {};

  // Handle boolean (auto-detect preset)
  if (gauge === true) {
    const presetName = getPresetFromEntity(entity);
    if (!presetName) {
      return null; // No preset available for this entity
    }
    baseConfig = GAUGE_PRESETS[presetName];
  } else {
    // Handle object configuration
    userConfig = gauge;

    // Use preset if specified
    if (userConfig.preset && GAUGE_PRESETS[userConfig.preset]) {
      baseConfig = GAUGE_PRESETS[userConfig.preset];
    }
  }

  // No base config and no manual min/max/thresholds = invalid
  if (!baseConfig && (!userConfig.min || !userConfig.max || !userConfig.thresholds)) {
    return null;
  }

  // Merge base config with user overrides
  const resolved: ResolvedGaugeConfig = {
    min: userConfig.min ?? baseConfig?.min ?? 0,
    max: userConfig.max ?? baseConfig?.max ?? 100,
    thresholds: userConfig.thresholds ?? baseConfig?.thresholds ?? [],
    height: userConfig.height ?? DEFAULT_GAUGE_HEIGHT,
    position: userConfig.position ?? DEFAULT_GAUGE_POSITION,
  };

  // Validate that we have valid thresholds
  if (!resolved.thresholds || resolved.thresholds.length === 0) {
    return null;
  }

  return resolved;
}
