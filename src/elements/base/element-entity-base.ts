import { LitElement, TemplateResult, css, html, nothing } from "lit"
import { property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { HassEntity } from "home-assistant-js-websocket";
import { ElementBase, ElementBaseConfig } from "./element-base";
import { handleAction } from "../../utils/handle-action";

export interface ElementEntityBaseConfig extends ElementBaseConfig {
    entity: string;
}


export abstract class ElementEntityBase<TConfig extends ElementEntityBaseConfig = ElementEntityBaseConfig> extends ElementBase<TConfig> {
    static styles = css`
        :host {
            cursor: pointer;
        }
    `

    // Child classes can set this to false if they handle actions internally (e.g., by passing to wrapped HA elements)
    protected handleActionsInBase = true;

    async setConfig(config: TConfig) {
        await super.setConfig(config);

        if (!config.entity) {
            throw Error("Entity required");
        }
    }

    private _handleClick(ev: MouseEvent) {
        if (!this.handleActionsInBase) {
            return; // Let child element or wrapped HA element handle it
        }

        // Prevent event from bubbling to wrapped elements
        ev.stopPropagation();
        ev.preventDefault();

        // Trigger tap action
        if (this._config && this.hass) {
            handleAction(this, this.hass, this._config, "tap");
        }
    }

    protected override renderContent() {
        if (!this._config || !this.hass) {
            return nothing;
        }

        if (!this._config.entity) {
            return html`Entity is not defined`
        }

        const entity = this.hass.states[this._config.entity]

        if (!entity) {
            return html`Entity not found: ${this._config.entity}`
        }

        return html`
        <div @click=${this._handleClick}>
            ${this.renderEntityContent(entity)}
        </div>`
    }

    protected abstract renderEntityContent(entity: HassEntity): TemplateResult | typeof nothing
}