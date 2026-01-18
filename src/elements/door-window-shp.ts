import { css, html, svg, nothing } from "lit"
import { customElement } from "lit/decorators.js";
import "../components/last-change-text-shp";

import { ElementEntityBaseConfig, ElementEntityArmableBase } from "./base/";
import type { HassEntity } from "home-assistant-js-websocket";

interface DoorWindowElementConfig extends ElementEntityBaseConfig {
    width: number;
    height: number;
    orientation: "vertical" | "horizontal";
    unobtrusive?: boolean;
    text_position?: "start" | "end";
    text_align?: "start" | "center" | "end";
}


@customElement("door-window-shp")
export class DoorWindowElement extends ElementEntityArmableBase<DoorWindowElementConfig> {
    // Cached computed values (set in setConfig)
    private _computedWidth!: number;
    private _computedHeight!: number;
    private _svgPath!: string;
    private _isVertical!: boolean;

    static styles = css`
        :host {
            display: block;
            width: fit-content;
            height: fit-content;
        }
        
        .container {
            display: flex;
            align-items: center;
            line-height: 0;
            cursor: pointer;
        }
        
        .container.horizontal {
            flex-direction: column;
            gap: 7px;
        }
        
        .container.vertical {
            flex-direction: row;
            gap: 5px;
        }
    `;
     
    async setConfig(config: DoorWindowElementConfig) {
        await super.setConfig({
            ...config,
            height: config.height ?? 7,
            orientation: config.orientation ?? "horizontal",
            text_position: config.text_position ?? "end",
            text_align: config.text_align ?? "center"
        });
        
        // Pre-compute orientation-based values
        const isHorizontal = this._config!.orientation === 'horizontal';
        this._isVertical = !isHorizontal;
        this._computedHeight = isHorizontal ? this._config!.height : this._config!.width;
        this._computedWidth = isHorizontal ? this._config!.width : this._config!.height;
        this._svgPath = `M0 0 L0 ${this._computedHeight} L${this._computedWidth} ${this._computedHeight} L${this._computedWidth} 0 Z`;
    }

    protected renderEntityContent(entity: HassEntity) {
        if (!this._config || !this.hass)
            return nothing;
        
        if (this._computedWidth === undefined || this._computedHeight === undefined)
            return nothing;

        const opened = entity.state == "on";
        const alarmState = this.getAlarmoSensorState();
        const color = opened ? 
            (this._config?.unobtrusive ? 'white' : '#6464FF') 
            : 
            alarmState ? 
                (alarmState.armed ? 'red' : 'green') 
                : 
                'gray';

        const svgElement = svg`
            <svg width="${this._computedWidth}" height="${this._computedHeight}">
                <path d=${this._svgPath} fill=${color} stroke=${color} strokeDasharray=0 strokeWidth=1 />
            </svg>
        `;
        
        const textElement = html`
            <last-change-text-shp .entity=${entity} .secondsForSuperHighlight=${5} .vertical=${this._isVertical}></last-change-text-shp>
        `;

        const alignItems = this._config.text_align === "start" ? "flex-end" : 
                           this._config.text_align === "end" ? "flex-start" : "center";

        return html`
            <div class="container ${this._config.orientation}" style="align-items: ${alignItems};">
                ${this._config.text_position === "start" ? html`${textElement}${svgElement}` : html`${svgElement}${textElement}`}
            </div>            
            `
    }
}