import { html, css, nothing } from "lit"
import { customElement } from "lit/decorators.js";
import "../components/last-change-text-shp";
import { ElementEntityArmableBase, ElementEntityBaseConfig } from "./base";
import { HassEntity } from "home-assistant-js-websocket";
import { planDropShadow } from '../utils/plan-styles';

interface MotionSensorElementConfig extends ElementEntityBaseConfig {
    hide_icon?: boolean;  // Default: false - whether to hide the icon
}

@customElement("motion-sensor-shp")
export class MotionSensorElement extends ElementEntityArmableBase<MotionSensorElementConfig> {
    static styles = css`
        :host {
            --shp-last-change-bg-muted: var(--shp-motion-last-change-bg-muted, rgba(255, 255, 255, 0.2));
            --shp-last-change-bg-mid: var(--shp-motion-last-change-bg-mid, rgba(255, 255, 255, 0.26));
            --shp-last-change-bg-recent: var(--shp-motion-last-change-bg-recent, rgba(255, 255, 255, 0.34));
            --shp-last-change-bg-alert: var(--shp-motion-last-change-bg-alert, rgba(180, 48, 48, 0.5));
            --shp-last-change-shadow-muted: var(--shp-motion-last-change-shadow-muted, rgba(255, 255, 255, 0.04));
            --shp-last-change-shadow-mid: var(--shp-motion-last-change-shadow-mid, rgba(255, 255, 255, 0.06));
            --shp-last-change-shadow-recent: var(--shp-motion-last-change-shadow-recent, rgba(255, 255, 255, 0.09));
            --shp-last-change-shadow-alert: var(--shp-motion-last-change-shadow-alert, rgba(200, 60, 60, 0.18));
        }

        ha-icon {
            ${planDropShadow};
        }
    `;

    protected override renderEntityContent(entity: HassEntity) {

        //const opened = entity.state == "on";


        const alarmState = this.getAlarmoSensorState();
        const color = (entity?.attributes["device_class"] == "occupancy" && entity?.state == "on")
            ? "#ffc107"
            : (alarmState ? (alarmState.armed ? 'red' : 'green') : 'var(--shp-plan-text-color, white)')


        return html`
            ${this._config?.hide_icon ? nothing : html`<ha-icon style="color:${color}" icon="mdi:motion-sensor"></ha-icon>`}
            <last-change-text-shp .entity=${entity}></last-change-text-shp>
        `
    }
}
