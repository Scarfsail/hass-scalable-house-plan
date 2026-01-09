import { html, css, nothing } from "lit"
import { customElement, property } from "lit/decorators.js";
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ElementBase, ElementBaseConfig } from "./base";
import type { HassEntity } from "home-assistant-js-websocket";
import { Utils } from "../utils/utils";
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

@customElement("info-box-shp")
export class InfoBoxElement extends ElementBase<InfoBoxElementConfig> {

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

    protected renderContent() {
        if (!this._config || !this.hass) {
            return nothing;
        }

        const items = this._collectInfoBoxItems();
        
        if (items.length === 0) {
            return nothing;  // Don't render if no data
        }

        const mode = this._config.mode || 'detail';
        const showBackground = this._config.show_background ?? true;
        
        const classes = ['info-box-container'];
        if (mode === 'overview') classes.push('overview');
        if (!showBackground) classes.push('no-background');
        const containerClass = classes.join(' ');

        return html`
            <div class="${containerClass}">
                ${items.map(item => {
                    const scale = parseFloat(item.size) / 100;
                    const isMotionOrOccupancy = item.type === 'motion' || item.type === 'occupancy';
                    const isSeparate = item.icon_position === 'separate';
                    const itemClass = isSeparate ? 'info-item separate' : 'info-item';
                    const transformOrigin = isSeparate ? 'center center' : 'left center';
                    return html`
                        <div 
                            class="${itemClass}" 
                            style="transform: scale(${scale}); transform-origin: ${transformOrigin};"
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
        if (!this._config || !this.hass) {
            return [];
        }

        const items: InfoBoxItem[] = [];
        const typesConfig = this._config.types || {};
        const supportedTypes = ['motion', 'occupancy', 'temperature', 'humidity'];

        // Get config for each type
        const getTypeConfig = (type: string): { show: boolean; size: string; icon_position: 'inline' | 'separate' } => {
            const config = typesConfig[type as keyof typeof typesConfig];
            const mode = this._config?.mode || 'detail';
            
            // Check mode-specific visibility (new) or fallback to legacy show (deprecated)
            let show: boolean;
            if (mode === 'overview') {
                show = config?.visible_overview ?? config?.show ?? true;
            } else {
                show = config?.visible_detail ?? config?.show ?? true;
            }
            
            return {
                show,
                size: config?.size ?? "100%",
                icon_position: config?.icon_position ?? 'inline'
            };
        };

        // Process each entity in the room
        for (const entityId of this._config.room_entities) {
            const entity = this.hass.states[entityId];
            if (!entity) continue;
            
            const deviceClass = entity.attributes.device_class;

            // Motion sensors
            if (deviceClass === 'motion') {
                const config = getTypeConfig('motion');
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
            if (deviceClass === 'occupancy') {
                const config = getTypeConfig('occupancy');
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
            if (deviceClass === 'temperature') {
                const config = getTypeConfig('temperature');
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
            if (deviceClass === 'humidity') {
                const config = getTypeConfig('humidity');
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

        // Sort by type order: motion/occupancy, temperature, humidity
        const typeOrder = ['motion', 'occupancy', 'temperature', 'humidity'];
        items.sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));

        return items;
    }
}
