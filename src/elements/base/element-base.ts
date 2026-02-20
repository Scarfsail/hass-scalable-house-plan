import { LitElement, TemplateResult, css, html, nothing } from "lit"
import { property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { HassEntity } from "home-assistant-js-websocket";
import { evalJsTemplate, subscribeRenderTemplate } from "../../utils";

export interface ActionConfig {
    action: "more-info" | "toggle" | "call-service" | "perform-action" | "navigate" | "url" | "none";
    navigation_path?: string;
    url_path?: string;
    service?: string;
    perform_action?: string;
    data?: Record<string, unknown>;
    target?: any;
    confirmation?: any;
}

export interface ElementBaseConfig {
    style: any;
    top: number;
    left: number;
    tap_action?: ActionConfig;
    hold_action?: ActionConfig;
    double_tap_action?: ActionConfig;
}


export abstract class ElementBase<TConfig extends ElementBaseConfig = ElementBaseConfig> extends LitElement {
    @property({ attribute: false }) public hass?: HomeAssistant;

    @state() protected _config?: TConfig;

    private _templateUnsubscribers: Array<() => unknown> = [];

    disconnectedCallback() {
        super.disconnectedCallback();
        for (const unsub of this._templateUnsubscribers) {
            unsub();
        }
        this._templateUnsubscribers = [];
    }

    async setConfig(config: TConfig) {
        this._config = config;

        if (config.style) {
            Object.keys(config.style).forEach((prop) => {
                this.style.setProperty(prop, config.style![prop]);
            });
        }

    }

    protected async subscribeRenderTemplate(template: string, onChange: (result: string) => void) {
        if (!this.hass) {
            console.error("Error: Home Assistant object not provided.");
            return;
        }
        if (!template.includes('{{')) {
            onChange(template);
            return;
        }

        const unsub = await subscribeRenderTemplate(this.hass.connection, template, onChange);
        if (unsub) {
            this._templateUnsubscribers.push(unsub);
        }
    }
    protected evalJsTemplate(jsTemplate: string, entity?: HassEntity): string {
        if (!jsTemplate)
            return jsTemplate;
        
        if (!this.hass) {
            console.error("Error: Home Assistant object not provided.");
            return "Error: Home Assistant object not provided.";
        }
        return evalJsTemplate(this, this.hass, entity, jsTemplate)
    }
    protected async evaluateTemplate(template: string): Promise<string> {
        if (!template.includes('{{'))
            return template;

        if (!this.hass || !template) {
            const err = "Home Assistant object or template not provided."
            console.error(err);
            return err;
        }

        try {
            // Call the template API to evaluate the template
            const response = await this.hass.callApi("POST", "template", {
                template: template,
            });

            return response as string;
        } catch (err) {
            console.error("Error evaluating template:", err);
            return "Error evaluating template.";
        }
    }

    protected render() {
        if (!this._config || !this.hass) {
            return nothing;
        }

        return html`            
            ${this.renderContent()}
        `
    }

    protected abstract renderContent(): TemplateResult | typeof nothing
}