import { html, css } from "lit"
import { customElement } from "lit/decorators.js";
import { ElementEntityBase, ElementEntityBaseConfig } from "./base";
import { HassEntity } from "home-assistant-js-websocket";
import { ShortenNumberPrefixType } from "../utils";

interface StateIconTriggerElementConfig extends ElementEntityBaseConfig {
    decimals?: number;
    shorten_and_use_prefix?: ShortenNumberPrefixType

}

@customElement("state-icon-trigger-shp")
export class StateIconTriggerElement extends ElementEntityBase<StateIconTriggerElementConfig> {
    protected handleActionsInBase = false; // Actions handled by inner hui-state-icon-element

    static styles = css`
        :host {
            position: relative;
            display: inline-block;
        }
        
        .trigger-indicator {
            position: absolute;
            bottom: 0;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            font-size: 8px;
            font-weight: bold;
            padding: 1px 3px;
            border-radius: 2px;
            line-height: 1;
            z-index: 1;
            min-width: 12px;
            text-align: center;
            opacity:0.7
        }
        
        .trigger-automation {
            background: rgba(255, 165, 0, 0.9); /* Orange for automation */
            color: black;
        }
        
        .trigger-user {
            background: rgba(0, 128, 255, 0.9); /* Blue for user */
            color: white;
        }
        
        .trigger-manual {
            background: rgba(128, 128, 128, 0.9); /* Gray for manual */
            color: white;
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
        
        // Determine trigger source
        const triggerIndicator = this.getTriggerIndicator(entity);
        
        return html`
            ${this.icon}
            ${triggerIndicator}
        `
    }
    
    private getTriggerIndicator(entity: HassEntity) {
        // Check if entity has context information
        const context = entity.context;
        if (!context) {
            return html`<div class="trigger-indicator trigger-manual">M</div>`;
        }
        
        // If context.parent_id exists, it was triggered by automation
        if (context.parent_id) {
            return html`<div class="trigger-indicator trigger-automation">A</div>`;
        }
        
        // If context.user_id exists and no parent_id, it was triggered by user
        if (context.user_id) {
            return html`<div class="trigger-indicator trigger-user">U</div>`;
        }
        
        // Manual trigger (no user_id and no parent_id)
        return html`<div class="trigger-indicator trigger-manual">M</div>`;
    }
}