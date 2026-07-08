import { html, css, nothing, PropertyValues } from "lit"
import { customElement, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { ElementEntityBase, ElementEntityBaseConfig } from "./base";
import { planDropShadow } from '../utils/plan-styles';
import { HassEntity } from "home-assistant-js-websocket";
import { getLocalizeFunction, type LocalizeFunction } from "../localize";

interface ClimateElementConfig extends ElementEntityBaseConfig {
    // Whitelist of HVAC modes to show in the menu. Only modes that the entity
    // actually supports are shown. Defaults to heating and cooling.
    hvac_modes?: string[];
    // Whitelist of fan modes to show in the menu. Only modes that the entity
    // actually supports are shown. Defaults to Auto and Quiet.
    fan_modes?: string[];
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

// House-plan default whitelists. Overridable per element via config.
const DEFAULT_HVAC_MODES = ["heat", "cool", "off"];
const DEFAULT_FAN_MODES = ["Auto", "Quiet"];

const MORE_INFO_VALUE = "__more_info__";
const FAN_VALUE_PREFIX = "__fan__:";

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

        /* Self-cleaning runs after the unit is switched off from cooling/heating,
           so it must read as visually distinct from an active hvac mode -
           otherwise it looks like the "off" command failed. The theme sets
           per-mode colors (--state-climate-cool-color etc.) that take
           precedence over the generic active-color fallback, so each one
           needs to be overridden here too. */
        .icon-container.self-cleaning {
            --state-climate-auto-color: var(--disabled-text-color, #9e9e9e);
            --state-climate-cool-color: var(--disabled-text-color, #9e9e9e);
            --state-climate-dry-color: var(--disabled-text-color, #9e9e9e);
            --state-climate-fan_only-color: var(--disabled-text-color, #9e9e9e);
            --state-climate-heat-color: var(--disabled-text-color, #9e9e9e);
            --state-climate-heat-cool-color: var(--disabled-text-color, #9e9e9e);
            --state-climate-active-color: var(--disabled-text-color, #9e9e9e);
            --state-active-color: var(--disabled-text-color, #9e9e9e);
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

        .temp-control {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 4px 12px;
        }

        .temp-control button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            padding: 0;
            border: none;
            border-radius: 50%;
            background-color: var(--ha-color-fill-neutral-quiet-resting, rgba(0, 0, 0, 0.06));
            color: inherit;
            cursor: pointer;
        }

        .temp-control button:hover {
            background-color: var(--ha-color-fill-neutral-quiet-hover, rgba(0, 0, 0, 0.12));
        }

        .temp-control button:disabled {
            opacity: 0.4;
            cursor: default;
        }

        .temp-value {
            font-size: 15px;
            font-weight: var(--ha-font-weight-medium, 500);
            min-width: 56px;
            text-align: center;
            white-space: nowrap;
        }
    `;

    private icon: any;
    private _localize?: LocalizeFunction;
    private _serviceTimeout?: number;
    // Entity temperature at the moment optimistic editing began; used to detect
    // when the backend has caught up so we can drop the optimistic value.
    private _pendingBaseline?: number | null;

    // Optimistic target temperature while the +/- buttons are being tapped,
    // before the entity state catches up.
    @state() private _pendingTemp?: number;

    private get localize(): LocalizeFunction {
        if (!this._localize) {
            this._localize = getLocalizeFunction(this.hass!);
        }
        return this._localize;
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._serviceTimeout) {
            clearTimeout(this._serviceTimeout);
            this._serviceTimeout = undefined;
        }
    }

    willUpdate(changed: PropertyValues) {
        // Once the entity's temperature changes from the value present when we
        // started adjusting, the backend has applied the change — drop the
        // optimistic value and show the real one (no flicker back-and-forth).
        if (this._pendingTemp != null && this._config && this.hass) {
            const entity = this.hass.states[this._config.entity];
            const temp = entity?.attributes.temperature;
            if (temp !== this._pendingBaseline) {
                this._pendingTemp = undefined;
                this._pendingBaseline = undefined;
            }
        }
    }

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

        const selfCleaning = this.isSelfCleaning(entity);
        const setTemp = this.getSetTemperatureLabel(entity, selfCleaning);
        const modes = this.getOrderedHvacModes(entity);
        const fanModes = this.getFanModes(entity);

        return html`
            <ha-dropdown placement="bottom" @wa-select=${this._handleMenuSelect}>
                <button class="trigger" slot="trigger">
                    <div class="icon-container ${classMap({ "self-cleaning": selfCleaning })}">${this.icon}</div>
                    ${setTemp ? html`<div class="set-temp">${setTemp}</div>` : null}
                </button>
                ${modes.map(mode => html`
                    <ha-dropdown-item .value=${mode} ?selected=${mode === entity.state}>
                        ${this.hass!.formatEntityState(entity, mode)}${selfCleaning && mode === entity.state ? html` (${this.localize("climate.self_cleaning")})` : nothing}
                        <ha-icon slot="icon" .icon=${HVAC_MODE_ICONS[mode] ?? "mdi:thermostat"}></ha-icon>
                    </ha-dropdown-item>
                `)}
                ${this.renderTemperatureControl(entity)}
                ${fanModes.length ? html`
                    <div class="menu-divider" role="separator"></div>
                    ${fanModes.map(mode => html`
                        <ha-dropdown-item
                            .value=${FAN_VALUE_PREFIX + mode}
                            ?selected=${mode === entity.attributes.fan_mode}>
                            ${this.hass!.formatEntityAttributeValue(entity, "fan_mode", mode)}
                            <ha-icon slot="icon" icon="mdi:fan"></ha-icon>
                        </ha-dropdown-item>
                    `)}
                ` : nothing}
                <div class="menu-divider" role="separator"></div>
                <ha-dropdown-item .value=${MORE_INFO_VALUE}>
                    ${this.hass!.localize("ui.panel.lovelace.cards.show_more_info")}
                    <ha-icon slot="icon" icon="mdi:information-outline"></ha-icon>
                </ha-dropdown-item>
            </ha-dropdown>
        `
    }

    private renderTemperatureControl(entity: HassEntity) {
        const current = this.getTargetTemperature(entity);
        if (current == null) {
            return nothing;
        }

        const step = this.getTempStep(entity);
        const min = entity.attributes.min_temp;
        const max = entity.attributes.max_temp;
        const unit = this.hass?.config?.unit_system?.temperature ?? '°C';
        const digits = step.toString().split(".")?.[1]?.length ?? 0;

        // Click handlers live on plain buttons (not ha-dropdown-item) so they
        // don't fire wa-select and keep the dropdown open.
        return html`
            <div class="menu-divider" role="separator"></div>
            <div class="temp-control">
                <button
                    @click=${() => this._adjustTemperature(entity, -step)}
                    ?disabled=${min != null && current <= min}>
                    <ha-icon icon="mdi:minus"></ha-icon>
                </button>
                <span class="temp-value">${current.toFixed(digits)}${unit}</span>
                <button
                    @click=${() => this._adjustTemperature(entity, step)}
                    ?disabled=${max != null && current >= max}>
                    <ha-icon icon="mdi:plus"></ha-icon>
                </button>
            </div>
        `;
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

        if (value.startsWith(FAN_VALUE_PREFIX)) {
            this.hass.callService("climate", "set_fan_mode", {
                entity_id: this._config.entity,
                fan_mode: value.slice(FAN_VALUE_PREFIX.length),
            });
            return;
        }

        this.hass.callService("climate", "set_hvac_mode", {
            entity_id: this._config.entity,
            hvac_mode: value,
        });
    }

    private _adjustTemperature(entity: HassEntity, delta: number) {
        if (!this.hass || !this._config) {
            return;
        }

        const current = this.getTargetTemperature(entity) ?? 0;
        const min = entity.attributes.min_temp;
        const max = entity.attributes.max_temp;

        let next = current + delta;
        if (min != null) next = Math.max(next, min);
        if (max != null) next = Math.min(next, max);

        // Round to the step grid to avoid floating point drift.
        next = Math.round(next * 1e6) / 1e6;
        if (next === current) {
            return;
        }

        if (this._pendingTemp == null) {
            // Remember the entity value we're diverging from so willUpdate can
            // tell when the backend has applied our change.
            this._pendingBaseline = entity.attributes.temperature ?? null;
        }
        this._pendingTemp = next;

        // Debounce so rapid taps result in a single service call.
        if (this._serviceTimeout) {
            clearTimeout(this._serviceTimeout);
        }
        this._serviceTimeout = window.setTimeout(() => {
            this.hass!.callService("climate", "set_temperature", {
                entity_id: this._config!.entity,
                temperature: this._pendingTemp,
            });
        }, 600);
    }

    private getTargetTemperature(entity: HassEntity): number | null {
        if (this._pendingTemp != null) {
            return this._pendingTemp;
        }
        const temp = entity.attributes.temperature;
        return typeof temp === "number" ? temp : null;
    }

    private getTempStep(entity: HassEntity): number {
        return (
            entity.attributes.target_temp_step ||
            (this.hass?.config?.unit_system?.temperature === "°F" ? 1 : 0.5)
        );
    }

    private getOrderedHvacModes(entity: HassEntity): string[] {
        const modes: string[] = entity.attributes.hvac_modes ?? [];
        const whitelist = this._config?.hvac_modes ?? DEFAULT_HVAC_MODES;
        return modes
            .filter(mode => whitelist.includes(mode))
            .sort((a, b) => HVAC_MODE_ORDER.indexOf(a) - HVAC_MODE_ORDER.indexOf(b));
    }

    private getFanModes(entity: HassEntity): string[] {
        const modes: string[] = entity.attributes.fan_modes ?? [];
        const whitelist = this._config?.fan_modes ?? DEFAULT_FAN_MODES;
        return modes.filter(mode => whitelist.includes(mode));
    }

    private isSelfCleaning(entity: HassEntity): boolean {
        const selfCleaning = entity.attributes.self_cleaning;
        return typeof selfCleaning === "string" && selfCleaning.toUpperCase() === "ON";
    }

    private getSetTemperatureLabel(entity: HassEntity, selfCleaning: boolean): string | null {
        if (selfCleaning) {
            return this.localize("climate.self_cleaning");
        }

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
