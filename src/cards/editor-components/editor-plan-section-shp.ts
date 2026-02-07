import { LitElement, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "./shared-styles";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { PlanConfig } from "../types";

/**
 * Editor component for Plan Section configuration (without element property)
 * 
 * This component provides a YAML editor for configuring plan properties like:
 * - Position (left, right, top, bottom)
 * - Dimensions (width, height)
 * - Visibility (overview)
 * - Scaling modes (position_scaling_horizontal, position_scaling_vertical)
 * - Styling (style)
 * - Dynamic color and info box settings
 */
@customElement("editor-plan-section-shp")
export class EditorPlanSectionShp extends LitElement {
    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ type: Object }) public planSection!: Omit<PlanConfig, 'element'>;

    static styles = [sharedStyles];

    protected render() {
        return html`
            <ha-yaml-editor
                .hass=${this.hass}
                .value=${this.planSection || {}}
                auto-update
                @value-changed=${this._planChanged}
            ></ha-yaml-editor>
        `;
    }

    private _planChanged(ev: CustomEvent) {
        ev.stopPropagation();
        this.dispatchEvent(new CustomEvent('plan-changed', {
            detail: { value: ev.detail.value },
            bubbles: true,
            composed: true
        }));
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "editor-plan-section-shp": EditorPlanSectionShp;
    }
}
