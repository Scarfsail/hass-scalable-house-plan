import { html, css } from "lit"
import { customElement } from "lit/decorators.js";
import { ElementEntityBase, ElementEntityBaseConfig } from "./base";
import { planDropShadow } from '../utils/plan-styles';
import { HassEntity } from "home-assistant-js-websocket";

interface ClimateElementConfig extends ElementEntityBaseConfig {
}

@customElement("climate-shp")
export class ClimateElement extends ElementEntityBase<ClimateElementConfig> {
    protected handleActionsInBase = false;

    static styles = css`
        :host {
            position: relative;
            display: inline-flex;
            flex-direction: column;
            align-items: center;
            gap: 0;
        }

        .icon-container {
            position: relative;
            display: inline-flex;
            align-items: center;
            line-height: 0;
            ${planDropShadow};
        }

        .set-temp {
            font-size: 11px;
            line-height: 1;
            margin-top: -4px;
            white-space: nowrap;
            text-align: center;
            padding: 0;
            border-radius: 9px;
            isolation: isolate;
            color: var(--shp-last-change-text-muted, rgba(192, 192, 192, 0.6));
            background-color: var(--shp-last-change-bg-muted, rgba(0, 0, 0, 0.3));
            box-shadow: 0px 0px
                var(--shp-last-change-shadow-blur, 12px)
                var(--shp-last-change-shadow-spread, 7px)
                var(--shp-last-change-shadow-muted, var(--shp-last-change-bg-muted, rgba(0, 0, 0, 0.3)));
        }
    `;

    private icon: any;

    protected override renderEntityContent(entity: HassEntity) {
        if (!this.icon) {
            this.icon = document.createElement("hui-state-icon-element");
            this.icon.setConfig({
                entity: entity.entity_id,
                tap_action: this._config?.tap_action,
                hold_action: this._config?.hold_action,
                double_tap_action: this._config?.double_tap_action,
            });
        }
        this.icon.hass = this.hass;

        const setTemp = this.getSetTemperatureLabel(entity);

        return html`
            <div class="icon-container">${this.icon}</div>
            ${setTemp ? html`<div class="set-temp">${setTemp}</div>` : null}
        `
    }

    private getSetTemperatureLabel(entity: HassEntity): string | null {
        if (entity.state === 'off' || entity.state === 'unavailable' || entity.state === 'unknown') {
            return null;
        }

        const attrs = entity.attributes;
        const unit = this.hass?.config?.unit_system?.temperature ?? '°C';

        if (attrs.temperature != null) {
            return `${attrs.temperature}${unit}`;
        }
        if (attrs.target_temp_low != null && attrs.target_temp_high != null) {
            return `${attrs.target_temp_low}–${attrs.target_temp_high}${unit}`;
        }
        return null;
    }
}
