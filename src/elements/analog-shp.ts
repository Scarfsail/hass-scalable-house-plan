import { html } from "lit"
import { customElement } from "lit/decorators.js";
import { ElementEntityBase, ElementEntityBaseConfig } from "./base";
import { HassEntity } from "home-assistant-js-websocket";
import { ShortenNumberPrefixType } from "../utils";
import { GaugeConfig } from "../utils/gauge-presets";

interface AnalogElementConfig extends ElementEntityBaseConfig {
    decimals?: number;
    shorten_and_use_prefix?: ShortenNumberPrefixType;
    gauge?: boolean | GaugeConfig;
}

@customElement("analog-shp")
export class AnalogElement extends ElementEntityBase<AnalogElementConfig> {
    protected override renderEntityContent(entity: HassEntity) {
        const units = entity.attributes.unit_of_measurement;
        return html`
            <analog-text-shp .entity=${entity} .decimals=${this._config?.decimals} .shorten_and_use_prefix=${this._config?.shorten_and_use_prefix} .gauge=${this._config?.gauge}></analog-text-shp>
        `
    }
}