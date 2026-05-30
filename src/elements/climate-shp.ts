import { html, css } from "lit"
import { customElement } from "lit/decorators.js";
import { ElementEntityBase, ElementEntityBaseConfig } from "./base";
import { planDropShadow } from '../utils/plan-styles';
import { HassEntity } from "home-assistant-js-websocket";

interface ClimateElementConfig extends ElementEntityBaseConfig {
}

// HVAC mode ordering, matching the climate more-info dialog (compareClimateHvacModes).
const HVAC_MODE_ORDER = ["auto", "heat_cool", "heat", "cool", "dry", "fan_only", "off"];

// HVAC mode icons, matching CLIMATE_HVAC_MODE_ICONS from the HA frontend.
const HVAC_MODE_ICONS: Record<string, string> = {
    auto: "mdi:thermostat-auto",
    heat_cool: "mdi:sun-snowflake-variant",
    heat: "mdi:fire",
    cool: "mdi:snowflake",
    dry: "mdi:water-percent",
    fan_only: "mdi:fan",
    off: "mdi:power",
};

const MORE_INFO_VALUE = "__more_info__";

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

        .trigger {
            display: inline-flex;
            flex-direction: column;
            align-items: center;
            gap: 0;
            padding: 0;
            margin: 0;
            border: none;
            background: none;
            color: inherit;
            font: inherit;
            cursor: pointer;
        }

        /* Let touches/clicks fall through to the button trigger so the dropdown
           opens reliably. Otherwise the icon's internal action-handler calls
           preventDefault() on touchstart, which suppresses the synthesized
           click on mobile and the menu never opens. */
        .trigger > * {
            pointer-events: none;
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

        .menu-divider {
            height: 1px;
            margin: 4px 8px;
            background-color: var(--divider-color, rgba(0, 0, 0, 0.12));
        }
    `;

    private icon: any;

    protected override renderEntityContent(entity: HassEntity) {
        if (!this.icon) {
            this.icon = document.createElement("hui-state-icon-element");
            this.icon.setConfig({
                entity: entity.entity_id,
                tap_action: { action: "none" },
                hold_action: { action: "none" },
                double_tap_action: { action: "none" },
            });
        }
        this.icon.hass = this.hass;

        const setTemp = this.getSetTemperatureLabel(entity);
        const modes = this.getOrderedHvacModes(entity);

        return html`
            <ha-dropdown placement="bottom" @wa-select=${this._handleMenuSelect}>
                <button class="trigger" slot="trigger">
                    <div class="icon-container">${this.icon}</div>
                    ${setTemp ? html`<div class="set-temp">${setTemp}</div>` : null}
                </button>
                ${modes.map(mode => html`
                    <ha-dropdown-item .value=${mode} ?selected=${mode === entity.state}>
                        ${this.hass!.formatEntityState(entity, mode)}
                        <ha-icon slot="icon" .icon=${HVAC_MODE_ICONS[mode] ?? "mdi:thermostat"}></ha-icon>
                    </ha-dropdown-item>
                `)}
                <div class="menu-divider" role="separator"></div>
                <ha-dropdown-item .value=${MORE_INFO_VALUE}>
                    ${this.hass!.localize("ui.panel.lovelace.cards.show_more_info")}
                    <ha-icon slot="icon" icon="mdi:information-outline"></ha-icon>
                </ha-dropdown-item>
            </ha-dropdown>
        `
    }

    private _handleMenuSelect(ev: CustomEvent<{ item?: { value?: string } }>) {
        const value = ev.detail?.item?.value;
        if (!value || !this.hass || !this._config) {
            return;
        }

        if (value === MORE_INFO_VALUE) {
            this.dispatchEvent(new CustomEvent("hass-more-info", {
                detail: { entityId: this._config.entity },
                bubbles: true,
                composed: true,
            }));
            return;
        }

        this.hass.callService("climate", "set_hvac_mode", {
            entity_id: this._config.entity,
            hvac_mode: value,
        });
    }

    private getOrderedHvacModes(entity: HassEntity): string[] {
        const modes: string[] = entity.attributes.hvac_modes ?? [];
        return modes
            .concat()
            .sort((a, b) => HVAC_MODE_ORDER.indexOf(a) - HVAC_MODE_ORDER.indexOf(b));
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
