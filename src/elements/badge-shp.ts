import { html, css } from "lit"
import { customElement } from "lit/decorators.js";
import { ElementEntityBase, ElementEntityBaseConfig } from "./base";
import { HassEntity } from "home-assistant-js-websocket";
import { ShortenNumberPrefixType } from "../utils";
import { planDropShadow } from "../utils/plan-styles";

interface BadgeElementConfig extends ElementEntityBaseConfig {


}

@customElement("badge-shp")
export class BadgeElement extends ElementEntityBase<BadgeElementConfig> {
    protected handleActionsInBase = false; // Actions handled by inner hui-entity-badge

    static styles = css`
        .badge {
            display: inline-block;
            ${planDropShadow};
        }
    `;

    private element: any;
    protected override renderEntityContent(entity: HassEntity) {
        if (!this.element) {
            this.element = document.createElement('hui-entity-badge') as any;
            this.element.setConfig({
                ...this._config,
                tap_action: this._config?.tap_action,
                hold_action: this._config?.hold_action,
                double_tap_action: this._config?.double_tap_action,
            })
        }

        this.element.hass = this.hass;

        return html`
            <div class="badge">${this.element}</div>
        `
    }
}
