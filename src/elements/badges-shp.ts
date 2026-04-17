import { html, css } from "lit"
import { customElement } from "lit/decorators.js";
import { ElementBase, ElementBaseConfig } from "./base";
import { HassEntity } from "home-assistant-js-websocket";
import { keyed } from 'lit/directives/keyed.js';
import { planDropShadow } from "../utils/plan-styles";

interface BadgeElementsConfig extends ElementBaseConfig {
    entities: string[];
    show_name: boolean;
    show_entity_picture: boolean;
    show_state?: boolean;
}
interface Badge {
    entity: string;
    element: any;
}
@customElement("badges-shp")
export class BadgeElements extends ElementBase<BadgeElementsConfig> {
    static styles = css`
        .badges {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
        }

        .badge {
            display: inline-block;
            ${planDropShadow};
        }
    `;

    private badges?: Badge[];

    protected override renderContent() {
        if (!this.badges) {
            this.badges = this._config!.entities.map(entity => {
                const element = document.createElement('hui-entity-badge') as any
                element.setConfig({
                    entity: entity,
                    show_name: this._config!.show_name,
                    show_entity_picture: this._config!.show_entity_picture,
                    show_state: this._config!.show_state ?? true});
                return {
                    "entity": entity,
                    "element": element
                }
            })


        }
        for (const badge of this.badges) {
            badge.element.hass = this.hass;
        }

        return html`
            <div class="badges">
                ${this.badges.map(badge => keyed(badge.entity, html`<div class="badge">${badge.element}</div>`))}
            </div>
        `;
    }
}
