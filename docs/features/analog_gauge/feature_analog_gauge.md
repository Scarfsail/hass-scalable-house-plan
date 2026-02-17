# Analog Gauge Feature Specification

## Overview

Add a gauge visualization to `analog-shp` and `analog-text-shp` components. The gauge displays a horizontal bar behind the text that indicates the current value position within a range, with color thresholds.

## Components

- `analog-shp` - Element wrapper that provides entity binding and preset auto-detection
- `analog-text-shp` - Component that renders the value text and gauge bar

---

# Design Decisions

| Topic | Decision |
|-------|----------|
| **Gauge Style** | Horizontal bar with solid color fill (no gradient) |
| **Thresholds** | Absolute values, color applies when `value >= threshold.value` |
| **Temperature Units** | Celsius only |
| **Preset Detection** | Auto-detect from device_class + allow explicit override |
| **Backward Compatibility** | Opt-in via `gauge` config property |
| **Bar Position** | Configurable (`bottom` or `background`), default: `bottom` |
| **Value Outside Range** | Clamp bar to 0% or 100%, use first/last threshold color |
| **Temperature Auto-detect** | Default to `temperature_indoor`, user must explicitly set `preset: "temperature_outdoor"` |

---

# Configuration

## Interface Definition

```typescript
interface GaugeConfig {
  preset?: "battery" | "humidity" | "temperature_indoor" | "temperature_outdoor";
  min?: number;           // Override preset min
  max?: number;           // Override preset max
  thresholds?: Array<{    // Override preset thresholds
    value: number;
    color: string;
  }>;
  height?: number;        // Bar height in px (default: 4)
  position?: "bottom" | "background";  // Bar position (default: "bottom")
}

interface AnalogElementConfig extends ElementEntityBaseConfig {
  decimals?: number;
  shorten_and_use_prefix?: ShortenNumberPrefixType;
  gauge?: boolean | GaugeConfig;  // true = auto-detect preset from device_class
}
```

## Usage Examples

```yaml
# Example 1: Auto-detect preset from device_class
type: custom:analog-shp
entity: sensor.battery_level
gauge: true

# Example 2: Explicit preset
type: custom:analog-shp
entity: sensor.living_room_temperature
gauge:
  preset: "temperature_indoor"

# Example 3: Preset with overrides
type: custom:analog-shp
entity: sensor.pool_temperature
gauge:
  preset: "temperature_indoor"
  min: 20
  max: 32

# Example 4: Fully manual configuration
type: custom:analog-shp
entity: sensor.custom_sensor
gauge:
  min: 0
  max: 100
  height: 6
  position: "background"
  thresholds:
    - value: 0
      color: "#F44336"
    - value: 30
      color: "#FF9800"
    - value: 60
      color: "#4CAF50"
```

---

# Presets

## Battery (`sensor.battery` device_class)
| Property | Value |
|----------|-------|
| Min | 0 |
| Max | 100 |
| Thresholds | `[{value: 0, color: "#F44336"}, {value: 15, color: "#FF9800"}, {value: 30, color: "#4CAF50"}]` |

Colors: 0-14% red, 15-29% yellow/orange, 30%+ green

## Humidity (`sensor.humidity` device_class)
| Property | Value |
|----------|-------|
| Min | 0 |
| Max | 100 |
| Thresholds | `[{value: 0, color: "#FF9800"}, {value: 30, color: "#4CAF50"}, {value: 65, color: "#2196F3"}]` |

Colors: 0-29% orange (dry), 30-64% green (comfortable), 65%+ blue (humid)

## Temperature Indoor (`sensor.temperature` device_class - default)
| Property | Value |
|----------|-------|
| Min | 18 |
| Max | 27 |
| Thresholds | `[{value: 18, color: "#2196F3"}, {value: 19, color: "#4CAF50"}, {value: 23, color: "#FF9800"}, {value: 25, color: "#F44336"}]` |

Colors: 18°C blue (cold), 19-22°C green (comfortable), 23-24°C orange (warm), 25°C+ red (hot)

## Temperature Outdoor (`preset: "temperature_outdoor"`)
| Property | Value |
|----------|-------|
| Min | -20 |
| Max | 40 |
| Thresholds | `[{value: -20, color: "#2196F3"}, {value: 0, color: "#00BCD4"}, {value: 10, color: "#4CAF50"}, {value: 25, color: "#FF9800"}, {value: 35, color: "#F44336"}]` |

Colors: -20 to -1°C blue (freezing), 0-9°C cyan (cold), 10-24°C green (comfortable), 25-34°C orange (warm), 35°C+ red (hot)

---

# Implementation Notes

## Preset Auto-detection Logic

```typescript
function getPresetFromEntity(entity: HassEntity): string | undefined {
  const deviceClass = entity.attributes?.device_class;
  
  switch (deviceClass) {
    case "battery":
      return "battery";
    case "humidity":
      return "humidity";
    case "temperature":
      return "temperature_indoor";  // Default, user can override to "temperature_outdoor"
    default:
      return undefined;  // No gauge if unknown device_class and gauge: true
  }
}
```

## Threshold Color Resolution

```typescript
function getColorForValue(value: number, thresholds: Threshold[]): string {
  // Thresholds must be sorted by value ascending
  const sorted = [...thresholds].sort((a, b) => a.value - b.value);
  
  // Find the highest threshold that value >= threshold.value
  let color = sorted[0]?.color ?? "#666666";  // Default fallback
  for (const threshold of sorted) {
    if (value >= threshold.value) {
      color = threshold.color;
    } else {
      break;
    }
  }
  return color;
}
```

## Bar Width Calculation

```typescript
function calculateBarWidth(value: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, value));
  return ((clamped - min) / (max - min)) * 100;  // Returns percentage
}
```

---

# Visual Mockup

```
Position: "bottom"
┌─────────────────────┐
│      23.5°C         │  ← Text
│ ███████████░░░░░░░░ │  ← Gauge bar (green, ~60% filled)
└─────────────────────┘

Position: "background"
┌─────────────────────┐
│ ███████23.5°C░░░░░░ │  ← Text with gauge as background
└─────────────────────┘
```

---

# Files to Modify

1. `src/components/analog-text-shp.ts` - Add gauge bar rendering
2. `src/elements/analog-shp.ts` - Add gauge config handling and preset detection
3. `src/utils/gauge-presets.ts` (new) - Define presets and helper functions
4. `src/utils/element-mappings.ts` - Update default mappings to include gauge config

---

# Element Mappings Changes

Update `src/utils/element-mappings.ts` to include gauge configuration in default mappings for sensor types that support it.

## Current Mappings (before)

```typescript
'sensor.battery': {
    plan_element: { type: 'custom:analog-shp', style: { "font-size": "20px" } },
    detail_element: { type: 'custom:analog-bar-shp', orientation: 'horizontal' }
},
'sensor.temperature': {
    plan_element: { type: 'custom:analog-shp', style: { "font-size": "20px" } },
    detail_element: { type: 'tile' }
},
'sensor.humidity': {
    plan_element: { type: 'custom:analog-shp', style: { "font-size": "20px" } },
    detail_element: { type: 'tile' }
},
```

## Updated Mappings (after)

```typescript
'sensor.battery': {
    plan_element: { 
        type: 'custom:analog-shp', 
        style: { "font-size": "20px" },
        gauge: true  // Auto-detect "battery" preset
    },
    detail_element: { type: 'custom:analog-bar-shp', orientation: 'horizontal' }
},
'sensor.temperature': {
    plan_element: { 
        type: 'custom:analog-shp', 
        style: { "font-size": "20px" },
        gauge: true  // Auto-detect "temperature_indoor" preset
    },
    detail_element: { type: 'tile' }
},
'sensor.humidity': {
    plan_element: { 
        type: 'custom:analog-shp', 
        style: { "font-size": "20px" },
        gauge: true  // Auto-detect "humidity" preset
    },
    detail_element: { type: 'tile' }
},
```

## Notes

- Adding `gauge: true` to default mappings means sensors with these device classes will automatically show the gauge when using auto-element detection
- Users can still override by providing their own element config without `gauge`
- The `mergeElementProperties()` function already handles merging defaults with user overrides