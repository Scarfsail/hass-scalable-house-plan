import { html } from "lit"
import { customElement } from "lit/decorators.js";
import { ElementEntityBase, ElementEntityBaseConfig } from "./base";
import { HassEntity } from "home-assistant-js-websocket";


interface GateButtonsElementConfig extends ElementEntityBaseConfig {
    orientation: "vertical" | "horizontal";
}


type GateActions = "open" | "close" | "stop";

@customElement("gate-buttons-shp")
export class GateButtonsElement extends ElementEntityBase<GateButtonsElementConfig> {
    protected showMoreInfoOnClick = false;
    protected override renderEntityContent(entity: HassEntity) {

        const renderButtons = (buttons: GateActions[]) => {
            return html`
                <div style="display:flex; gap:5px;flex-direction:${this._config?.orientation == 'horizontal' ? 'row' : 'column'}">
                    ${buttons.map(button => html`${this.getGateButton(button, entity.entity_id)}`)}
                </div>
            `
        }

        let state = entity.state;

        if (state == "open" && entity.attributes.current_position != 100) {
            state = "opened_partially";
        }


        switch (state) {
            case "open": return renderButtons(["close"]);
            case "closed": return renderButtons(["open"]);
            case "opening": return renderButtons(["stop", "close"]);
            case "closing": return renderButtons(["stop", "open"]);
            case "opened_partially": return renderButtons(["open", "close"]);
            default:
                return html`<span>${state}</span>`
        }
    }

    private getGateButton(type: GateActions, entity_id: string) {
        const buttonTextAndColor = this.getGateButtonTextAncColor(type);
        return html`<ha-button raised style="--mdc-theme-primary: ${buttonTextAndColor.color}; " @click=${() => this.performGateAction(type, entity_id)}>${buttonTextAndColor.text}</ha-button>`
    }

    private getGateButtonTextAncColor(type: GateActions) {
        switch (type) {
            case "open": return { text: "Otevřít", color: "var(--success-color)" }
            case "stop": return { text: "Zastavit", color: "var(--warning-color)" }
            case "close": return { text: "Zavřít", color: "var(--primary-color)" }

            default: throw new Error("Unsupported button type: " + type);

        }
    }

    private performGateAction(action: GateActions, entity_id: string) {
        console.log(`Performing action: ${action}`);
        this.hass?.callService('cover', `${action}_cover`, { entity_id: entity_id });
    }
}