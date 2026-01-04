import { css, html, nothing } from "lit"
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
}


@customElement("door-window-shp")
export class DoorWindowElement extends ElementEntityArmableBase<DoorWindowElementConfig> {
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
            gap: 0px;
        }
    `;
    
    async setConfig(config: DoorWindowElementConfig) {
        await super.setConfig({
            ...config,
            height: config.height ?? 7,
            orientation: config.orientation ?? "horizontal",
            text_position: config.text_position ?? "end"
        });
    }

    protected renderEntityContent(entity: HassEntity) {
        if (!this._config || !this.hass)
            return nothing;

        const opened = entity.state == "on";
        const height = this._config.orientation == 'horizontal' ? this._config.height : this._config.width;
        const width = this._config.orientation == 'horizontal' ? this._config.width : this._config.height;

        const svgPathArea = "M" + 0 + " " + 0 + " L" + 0 + " " + height + " L" + width + " " + height + " L" + width + " " + 0 + " Z";


        const alarmState = this.getAlarmoSensorState();
        const color = opened ? 
            (this._config?.unobtrusive ?
                'white'
                :
                '#6464FF'
            ) 
            : 
            alarmState ? 
                (alarmState.armed ? 'red' : 'green') 
                : 
                'gray';

        const svgElement = html`
            <div>
                <svg width="${width}px" height="${height}px">
                    <path d=${svgPathArea} fill=${color} stroke=${color} strokeDasharray=0 strokeWidth=1 />
                </svg>
            </div>
        `;
        
        const textElement = html`
            <last-change-text-shp .entity=${entity} .secondsForSuperHighlight=${5}></last-change-text-shp>
        `;

        return html`
            <div class="container ${this._config.orientation}">
                ${this._config.text_position === "start" ? html`${textElement}${svgElement}` : html`${svgElement}${textElement}`}
            </div>            
            `
    }
}