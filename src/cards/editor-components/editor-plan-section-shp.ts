import { LitElement, html, PropertyValues } from "lit-element";
import { customElement, property, query } from "lit/decorators.js";
import { sharedStyles } from "./shared-styles";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { PlanConfig } from "../types";

/** Returns true only for plain (non-null, non-array) objects */
const _isPlainObject = (value: unknown): boolean =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

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

    // @ts-ignore — ha-yaml-editor is defined at runtime by HA frontend
    @query('ha-yaml-editor') private _yamlEditor?: any;

    /** True while we are dispatching a plan-changed event, to suppress external-update logic */
    private _selfUpdate = false;

    static styles = [sharedStyles];

    protected render() {
        return html`
            <ha-yaml-editor
                .hass=${this.hass}
                @value-changed=${this._planChanged}
            ></ha-yaml-editor>
        `;
    }

    protected firstUpdated(): void {
        // Initialize editor content on first render
        this._yamlEditor?.setValue(this.planSection || {});
    }

    protected updated(changedProperties: PropertyValues): void {
        super.updated(changedProperties);
        // Sync editor when planSection changes externally (e.g. drag-drop repositioning)
        // Skip when we triggered the change ourselves to preserve user's in-progress typing
        if (changedProperties.has('planSection') && !this._selfUpdate) {
            this._yamlEditor?.setValue(this.planSection || {});
        }
    }

    private _planChanged(ev: CustomEvent) {
        ev.stopPropagation();
        // Don't propagate invalid YAML
        if (!ev.detail.isValid) return;
        // Don't propagate non-plain-object values (bare strings, numbers, arrays, null)
        if (ev.detail.value !== undefined && !_isPlainObject(ev.detail.value)) return;
        this._selfUpdate = true;
        this.dispatchEvent(new CustomEvent('plan-changed', {
            detail: { value: ev.detail.value },
            bubbles: true,
            composed: true
        }));
        // Reset after Lit's next update cycle completes
        Promise.resolve().then(() => { this._selfUpdate = false; });
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "editor-plan-section-shp": EditorPlanSectionShp;
    }
}
