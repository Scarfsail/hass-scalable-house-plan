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
        ha-icon {
            ${planDropShadow};
        }
    `;

    protected override renderEntityContent(entity: HassEntity) {

        //const opened = entity.state == "on";


        const alarmState = this.getAlarmoSensorState();
        const occupied = entity?.attributes["device_class"] == "occupancy" && entity?.state == "on";
        const color = occupied
            ? "#ffc107"
            : (alarmState ? (alarmState.armed ? 'red' : 'green') : 'var(--shp-plan-text-color, white)')


        return html`
            ${this._config?.hide_icon ? nothing : html`<ha-icon style="color:${color}" icon="mdi:motion-sensor"></ha-icon>`}
            <last-change-text-shp
                .entity=${entity}
                .secondsForSuperHighlight=${15}
                .trackColor=${occupied ? 'rgba(24, 58, 110, 0.55)' : undefined}
                .muteWhenIdle=${!occupied}
                .pulseTrack=${occupied}
            ></last-change-text-shp>
        `
    }
}
