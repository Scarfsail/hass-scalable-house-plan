import { css, html, svg, nothing } from "lit"
import { customElement } from "lit/decorators.js";
import "../components/last-change-text-shp";

import { ElementEntityBaseConfig, ElementEntityArmableBase } from "./base/";
import type { HassEntity } from "home-assistant-js-websocket";
import { planDropShadow } from "../utils/plan-styles";

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
    private _svgWidth!: number;
    private _svgHeight!: number;
    private _svgPath!: string;
    private _isVertical!: boolean;

    static styles = css`
        :host {
            display: block;
            position: relative;
        }
        
        .content {
            display: flex;
            flex-direction: column;
            align-items: center;
            position: absolute;
            line-height: 0;
            cursor: pointer;
            gap: 1px;
            --shp-last-change-bg-muted: var(--shp-door-window-last-change-bg-muted, rgba(255, 255, 255, 0.18));
            --shp-last-change-bg-mid: var(--shp-door-window-last-change-bg-mid, rgba(255, 255, 255, 0.24));
            --shp-last-change-bg-recent: var(--shp-door-window-last-change-bg-recent, rgba(255, 255, 255, 0.3));
            --shp-last-change-bg-alert: var(--shp-door-window-last-change-bg-alert, rgba(180, 48, 48, 0.48));
            --shp-last-change-shadow-blur: 4px;
            --shp-last-change-shadow-spread: 0px;
            --shp-last-change-shadow-muted: var(--shp-door-window-last-change-shadow-muted, rgba(255, 255, 255, 0.03));
            --shp-last-change-shadow-mid: var(--shp-door-window-last-change-shadow-mid, rgba(255, 255, 255, 0.05));
            --shp-last-change-shadow-recent: var(--shp-door-window-last-change-shadow-recent, rgba(255, 255, 255, 0.07));
            --shp-last-change-shadow-alert: var(--shp-door-window-last-change-shadow-alert, rgba(200, 60, 60, 0.16));
        }

        .label {
            position: relative;
            z-index: 1;
        }

        .shape {
            display: block;
            position: relative;
            z-index: 0;
            ${planDropShadow};
        }

        :host(.text-start) .label {
            order: -1;
        }
         
        /* Horizontal: text-start = text above, SVG bottom aligned */
        :host(.horizontal.text-start) .content {
            bottom: 0;
            left: 0;
        }
        
        /* Horizontal: text-end = text below, SVG top aligned */
        :host(.horizontal.text-end) .content {
            top: 0;
            left: 0;
        }
        
        /* Vertical: text-start = after rotation, SVG right aligned */
        :host(.vertical.text-start) .content {
            bottom: 100%;
            right: 0;
            transform: rotate(-90deg);
            transform-origin: bottom right;
        }
        
        /* Vertical: text-end = after rotation, SVG left aligned */
        :host(.vertical.text-end) .content {
            top: 100%;
            left: 0;
            transform: rotate(-90deg);
            transform-origin: top left;
        }
        
        /* Text alignment - horizontal: start=left, center=center, end=right */
        :host(.horizontal.align-start) .content {
            align-items: flex-start;
        }
        :host(.horizontal.align-center) .content {
            align-items: center;
        }
        :host(.horizontal.align-end) .content {
            align-items: flex-end;
        }
        
        /* Text alignment - vertical (flipped): start=top, end=bottom */
        :host(.vertical.align-start) .content {
            align-items: flex-start;
        }
        :host(.vertical.align-center) .content {
            align-items: center;
        }
        :host(.vertical.align-end) .content {
            align-items: flex-end;
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
        
        this._svgWidth = this._config!.width;
        this._svgHeight = this._config!.height;
        this._svgPath = `M0 0 L0 ${this._svgHeight} L${this._svgWidth} ${this._svgHeight} L${this._svgWidth} 0 Z`;
        this._isVertical = this._config!.orientation === 'vertical';

        // Set host dimensions (swap for vertical)
        if (this._isVertical) {
            this.style.width = `${this._svgHeight}px`;
            this.style.height = `${this._svgWidth}px`;
        } else {
            this.style.width = `${this._svgWidth}px`;
            this.style.height = `${this._svgHeight}px`;
        }
        
        // Set classes for CSS positioning
        this.classList.toggle('horizontal', !this._isVertical);
        this.classList.toggle('vertical', this._isVertical);
        this.classList.toggle('text-start', this._config.text_position === 'start');
        this.classList.toggle('text-end', this._config.text_position === 'end');
        this.classList.toggle('align-start', this._config.text_align === 'start');
        this.classList.toggle('align-center', this._config.text_align === 'center');
        this.classList.toggle('align-end', this._config.text_align === 'end');
    }

    protected renderEntityContent(entity: HassEntity) {
        if (!this._config || !this.hass)
            return nothing;
        
        if (this._svgWidth === undefined || this._svgHeight === undefined)
            return nothing;



        const opened = entity.state == "on";
        const alarmState = this.getAlarmoSensorState();
        const color = opened ? 
            (this._config?.unobtrusive ? 'var(--shp-plan-text-color, white)' : '#6464FF') 
            : 
            alarmState ? 
                (alarmState.armed ? 'red' : 'green') 
                : 
                'var(--shp-plan-neutral-color, gray)';

        const svgElement = svg`
            <svg width="${this._svgWidth}" height="${this._svgHeight}">
                <path d=${this._svgPath} fill=${color} stroke=${color} strokeDasharray=0 strokeWidth=1 />
            </svg>
        `;
         
        const textElement = html`
            <last-change-text-shp 
                class="label"
                .entity=${entity} 
                .secondsForSuperHighlight=${5}
            ></last-change-text-shp>
        `;

        return html`
            <div class="content">
                <div class="shape">${svgElement}</div>
                ${textElement}
            </div>
            `
    }
}
