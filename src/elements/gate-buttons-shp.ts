import { html } from "lit"
import { customElement } from "lit/decorators.js";
import { ElementEntityBase, ElementEntityBaseConfig } from "./base";
import { HassEntity } from "home-assistant-js-websocket";
import { getLocalizeFunction, type LocalizeFunction } from "../localize";


interface GateButtonsElementConfig extends ElementEntityBaseConfig {
    orientation: "vertical" | "horizontal";
}


type GateActions = "open" | "close" | "stop";

@customElement("gate-buttons-shp")
export class GateButtonsElement extends ElementEntityBase<GateButtonsElementConfig> {
    protected showMoreInfoOnClick = false;
    protected handleActionsInBase = false;
    private _localize?: LocalizeFunction;

    private get localize(): LocalizeFunction {
        if (!this._localize) {
            this._localize = getLocalizeFunction(this.hass!);
        }
        return this._localize;
    }

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
        const color = this.getGateButtonColor(type);
        const text = this.localize(`gate.${type}`);
        return html`<ha-button raised style="--mdc-theme-primary: ${color}; " @click=${() => this.performGateAction(type, entity_id)}>${text}</ha-button>`
    }

    private getGateButtonColor(type: GateActions) {
        switch (type) {
            case "open": return "var(--success-color)"
            case "stop": return "var(--warning-color)"
            case "close": return "var(--primary-color)"

            default: throw new Error("Unsupported button type: " + type);

        }
    }

    private performGateAction(action: GateActions, entity_id: string) {
        this.hass?.callService('cover', `${action}_cover`, { entity_id: entity_id });
    }
}
