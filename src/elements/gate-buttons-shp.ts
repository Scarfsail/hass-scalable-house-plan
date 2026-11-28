import { html } from "lit"
import { customElement } from "lit/decorators.js";
import { ElementEntityBase, ElementEntityBaseConfig } from "./base";
import { HassEntity } from "home-assistant-js-websocket";
import { getLocalizeFunction, type LocalizeFunction } from "../localize";
import { CoverAction, getCoverActionColor, getCoverActions, performCoverAction } from "../utils/cover-actions";


interface GateButtonsElementConfig extends ElementEntityBaseConfig {
    orientation: "vertical" | "horizontal";
}


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

        const buttons = getCoverActions(entity);
        if (!buttons) {
            return html`<span>${entity.state}</span>`
        }

        return html`
            <div style="display:flex; gap:5px;flex-direction:${this._config?.orientation == 'horizontal' ? 'row' : 'column'}">
                ${buttons.map(button => html`${this.getGateButton(button, entity.entity_id)}`)}
            </div>
        `
    }

    private getGateButton(type: CoverAction, entity_id: string) {
        const color = getCoverActionColor(type);
        const text = this.localize(`gate.${type}`);
        return html`<ha-button raised style="--mdc-theme-primary: ${color}; " @click=${() => performCoverAction(this.hass!, type, entity_id)}>${text}</ha-button>`
    }
}
