import { html, css, nothing } from "lit"
import { customElement } from "lit/decorators.js";
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ElementBase, ElementBaseConfig } from "./base";
import type { HassEntity } from "home-assistant-js-websocket";
import type { InfoBoxTypeConfig } from "../cards/scalable-house-plan";
import "../components/last-change-text-shp";

export interface InfoBoxElementConfig extends ElementBaseConfig {
    room_entities: string[];  // All entity IDs in the room
    mode?: 'overview' | 'detail';  // Current view mode (default: 'detail')
    show_background?: boolean;  // Whether to show background (mode-specific)
    types?: {
        motion?: InfoBoxTypeConfig;
        occupancy?: InfoBoxTypeConfig;
        temperature?: InfoBoxTypeConfig;
        humidity?: InfoBoxTypeConfig;
    }
}

interface InfoBoxItem {
    icon: string;
    value?: string;  // Optional: for temp/humidity, not used for motion/occupancy
    entity: HassEntity;
    type: string;
    size: string;  // Percentage scale (e.g., "100%", "200%")
    icon_position: 'inline' | 'separate';  // Icon layout
}

// Pre-computed type config for caching
interface TypeConfigCache {
    show: boolean;
    size: string;
    scale: number;  // Pre-parsed scale value
    icon_position: 'inline' | 'separate';
}

// Type order for sorting - defined once as static constant
const TYPE_ORDER = ['motion', 'occupancy', 'temperature', 'humidity'] as const;

@customElement("info-box-shp")
export class InfoBoxElement extends ElementBase<InfoBoxElementConfig> {
    // Cached type configurations (computed once in setConfig)
    private _typeConfigs!: Record<string, TypeConfigCache>;
    private _containerClass!: string;

    static override styles = css`
        :host {
            display: block;
            font-family: var(--primary-font-family, sans-serif);
        }

        .info-box-container {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 6px 10px;
            background: rgba(0, 0, 0, 0.6);
            border-radius: 8px;
            align-items: flex-start;
            font-size: 12px;
            color: white;
            white-space: nowrap;
        }

        .info-box-container.overview {
            padding-left: 0;
            padding-right: 0;
        }

        .info-box-container.no-background {
            background: transparent;
        }

        .info-item {
            display: flex;
            align-items: center;
            gap: 3px;
            cursor: pointer;
            transition: opacity 0.2s;
        }

        .info-item.separate {
            flex-direction: column;
            align-items: center;
            gap: 2px;
        }

        .info-item.separate last-change-text-shp {
            display: block;
        }

        .info-item:hover {
            opacity: 0.7;
        }

        ha-icon {
            --mdc-icon-size: 13px;
        }

        .value {
            font-weight: 500;
        }
    `;

    async setConfig(config: InfoBoxElementConfig) {
        await super.setConfig(config);
        
        // Pre-compute container class
        const mode = config.mode || 'detail';
        const showBackground = config.show_background ?? true;
        const classes = ['info-box-container'];
        if (mode === 'overview') classes.push('overview');
        if (!showBackground) classes.push('no-background');
        this._containerClass = classes.join(' ');
        
        // Pre-compute type configurations
        const typesConfig = config.types || {};
        this._typeConfigs = {};
        
        for (const type of TYPE_ORDER) {
            const typeConfig = typesConfig[type as keyof typeof typesConfig];
            
            // Check mode-specific visibility (new) or fallback to legacy show (deprecated)
            let show: boolean;
            if (mode === 'overview') {
                show = typeConfig?.visible_overview ?? typeConfig?.show ?? true;
            } else {
                show = typeConfig?.visible_detail ?? typeConfig?.show ?? true;
            }
            
            const size = typeConfig?.size ?? "100%";
            this._typeConfigs[type] = {
                show,
                size,
                scale: parseFloat(size) / 100,
                icon_position: typeConfig?.icon_position ?? 'inline'
            };
        }
    }

    protected renderContent() {
        if (!this._config || !this.hass) {
            return nothing;
        }

        const items = this._collectInfoBoxItems();
        
        if (items.length === 0) {
            return nothing;  // Don't render if no data
        }

        return html`
            <div class="${this._containerClass}">
                ${items.map(item => {
                    const typeConfig = this._typeConfigs[item.type];
                    const isMotionOrOccupancy = item.type === 'motion' || item.type === 'occupancy';
                    const isSeparate = typeConfig.icon_position === 'separate';
                    const itemClass = isSeparate ? 'info-item separate' : 'info-item';
                    const transformStyle = typeConfig.scale !== 1 
                        ? `transform: scale(${typeConfig.scale}); transform-origin: ${isSeparate ? 'center center' : 'left center'};`
                        : '';
                    return html`
                        <div 
                            class="${itemClass}" 
                            style="${transformStyle}"
                            @click=${() => this._showMoreInfo(item.entity.entity_id)}
                        >
                            <ha-icon icon="${item.icon}"></ha-icon>
                            ${isMotionOrOccupancy
                                ? html`<last-change-text-shp .entity=${item.entity}></last-change-text-shp>`
                                : html`<span class="value">${unsafeHTML(item.value || '')}</span>`
                            }
                        </div>
                    `;
                })}
            </div>
        `;
    }

    private _showMoreInfo(entityId: string): void {
        const event = new CustomEvent("hass-more-info", {
            detail: { entityId },
            bubbles: true,
            composed: true,
        });
        this.dispatchEvent(event);
    }

    private _collectInfoBoxItems(): InfoBoxItem[] {
        if (!this._config || !this.hass || !this._typeConfigs) {
            return [];
        }

        const items: InfoBoxItem[] = [];

        // Process each entity in the room
        for (const entityId of this._config.room_entities) {
            const entity = this.hass.states[entityId];
            if (!entity) continue;
            
            const deviceClass = entity.attributes.device_class;

            // Motion sensors
            if (deviceClass === 'motion') {
                const config = this._typeConfigs.motion;
                if (config.show) {
                    items.push({
                        icon: 'mdi:motion-sensor',
                        entity: entity,
                        type: 'motion',
                        size: config.size,
                        icon_position: config.icon_position
                    });
                }
            }

            // Occupancy sensors
            else if (deviceClass === 'occupancy') {
                const config = this._typeConfigs.occupancy;
                if (config.show) {
                    items.push({
                        icon: 'mdi:motion-sensor',
                        entity: entity,
                        type: 'occupancy',
                        size: config.size,
                        icon_position: config.icon_position
                    });
                }
            }

            // Temperature sensors
            else if (deviceClass === 'temperature') {
                const config = this._typeConfigs.temperature;
                if (config.show) {
                    const temp = parseFloat(entity.state);
                    if (!isNaN(temp)) {
                        const unit = entity.attributes.unit_of_measurement || '°C';
                        items.push({
                            icon: 'mdi:thermometer',
                            value: `${temp.toFixed(1)}<span style="font-size:50%">${unit}</span>`,
                            entity: entity,
                            type: 'temperature',
                            size: config.size,
                            icon_position: config.icon_position
                        });
                    }
                }
            }

            // Humidity sensors
            else if (deviceClass === 'humidity') {
                const config = this._typeConfigs.humidity;
                if (config.show) {
                    const humidity = parseFloat(entity.state);
                    if (!isNaN(humidity)) {
                        const unit = entity.attributes.unit_of_measurement || '%';
                        items.push({
                            icon: 'mdi:water-percent',
                            value: `${humidity.toFixed(0)}<span style="font-size:50%">${unit}</span>`,
                            entity: entity,
                            type: 'humidity',
                            size: config.size,
                            icon_position: config.icon_position
                        });
                    }
                }
            }
        }

        // Sort by type order using static constant
        items.sort((a, b) => TYPE_ORDER.indexOf(a.type as typeof TYPE_ORDER[number]) - TYPE_ORDER.indexOf(b.type as typeof TYPE_ORDER[number]));

        return items;
    }
}
