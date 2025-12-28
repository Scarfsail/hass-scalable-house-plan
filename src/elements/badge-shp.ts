import { html } from "lit"
import { customElement } from "lit/decorators.js";
import { ElementEntityBase, ElementEntityBaseConfig } from "./base";
import { HassEntity } from "home-assistant-js-websocket";
import { ShortenNumberPrefixType } from "../utils";

interface BadgeElementConfig extends ElementEntityBaseConfig {


}

@customElement("badge-shp")
export class BadgeElement extends ElementEntityBase<BadgeElementConfig> {

    private element: any;
    protected override renderEntityContent(entity: HassEntity) {
        if (!this.element) {
            this.element = document.createElement('hui-entity-badge') as any;
            this.element.setConfig(this._config)
        }

        this.element.hass = this.hass;

        return html`
            ${this.element}
        `
    }
}