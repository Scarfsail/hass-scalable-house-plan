import { css, html, nothing } from "lit"
import { customElement } from "lit/decorators.js";
import "../components/last-change-text-shp";

import { ElementEntityBaseConfig, ElementEntityArmableBase } from "./base/";
import type { HassEntity } from "home-assistant-js-websocket";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { AlarmoSensorState } from "../utils/alarmo";
import { planDropShadow } from "../utils/plan-styles";
import { handleAction } from "../utils/handle-action";
import { actionHandler, ActionHandlerEvent } from "../utils/action-handler";

interface DoorWindowElementConfig extends ElementEntityBaseConfig {
    width: number;
    height: number;
    orientation: "vertical" | "horizontal";
    unobtrusive?: boolean;
    text_position?: "start" | "end";
    text_align?: "start" | "center" | "end";
    control_entity?: string;  // lock.* or cover.* shown as a chip after the time and toggled by hold
}

/** The plan's colour for an open door/window, also used for an unsecured control */
export const OPEN_COLOR = '#6464FF';
export const DARK_CHIP = 'var(--shp-gauge-text-bg-track, rgba(0, 0, 0, 0.4))';

export interface ControlColors {
    background: string;
    icon: string;
    dimmed?: boolean;
}

/** Chip colours for a lock or cover state (agreed table in issue #19) */
export function getControlColors(state: string): ControlColors {
    switch (state) {
        case 'locked':
        case 'closed':
            return { background: DARK_CHIP, icon: 'var(--state-lock-locked-color)' };
        case 'unlocked':
        case 'open':
            return { background: OPEN_COLOR, icon: 'white' };
        case 'locking':
        case 'unlocking':
        case 'opening':
        case 'closing':
            return { background: DARK_CHIP, icon: 'var(--state-lock-locking-color)' };
        case 'jammed':
            return { background: 'var(--state-lock-jammed-color)', icon: 'white' };
        default:
            return { background: DARK_CHIP, icon: 'white', dimmed: true };
    }
}

/** Position of a cover that is open part way, or undefined */
export function getPartialPosition(control: HassEntity): number | undefined {
    const position = control.attributes.current_position;
    return position > 0 && position < 100 ? position : undefined;
}

/** Colour of the door/window state: blue when open, else Alarmo red (armed) / green (disarmed), else neutral */
export function getSensorColor(opened: boolean, alarmState?: AlarmoSensorState): string {
    if (opened) return OPEN_COLOR;
    if (alarmState) return alarmState.armed ? 'red' : 'green';
    return 'var(--shp-plan-neutral-color, gray)';
}

/** Lock: lock when unlocked, unlock when locked, nothing in any other state. Cover: toggle. */
function toggleControl(hass: HomeAssistant, entityId: string) {
    if (entityId.startsWith('lock.')) {
        const state = hass.states[entityId]?.state;
        if (state === 'locked' || state === 'unlocked') {
            hass.callService('lock', state === 'locked' ? 'unlock' : 'lock', { entity_id: entityId });
        }
    } else {
        hass.callService('cover', 'toggle', { entity_id: entityId });
    }
}


@customElement("door-window-shp")
export class DoorWindowElement extends ElementEntityArmableBase<DoorWindowElementConfig> {
    protected handleActionsInBase = false;

    // Cached computed values (set in setConfig)
    private _barLength!: string;  // Bar length along the wall, following the plan scale
    private _barThickness!: string;
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
        }

        .label {
            position: relative;
            z-index: 1;
            display: inline-flex;
            gap: 3px;
        }

        .control {
            display: inline-flex;
            align-items: center;
            gap: 2px;
            padding: 0 4px;
            border-radius: 999px;
            font-size: 11px;
            line-height: normal;
            white-space: nowrap;
            color: white;
            --mdc-icon-size: 12px;
        }

        .control ha-state-icon.dimmed {
            opacity: 0.4;
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
        config = {
            ...config,
            height: config.height ?? 7,
            orientation: config.orientation ?? "horizontal",
            text_position: config.text_position ?? "end",
            text_align: config.text_align ?? "center"
        };

        // Computed before the base stores the config, so its first render already has them
        this._isVertical = config.orientation === 'vertical';
        // The renderer sets --shp-length-scale on the element wrapper, so the length
        // follows the plan scale while thickness and the label keep the element scale
        this._barLength = `calc(${config.width}px * var(--shp-length-scale, 1))`;
        this._barThickness = `${config.height}px`;

        // Set host dimensions (swap for vertical)
        if (this._isVertical) {
            this.style.width = this._barThickness;
            this.style.height = this._barLength;
        } else {
            this.style.width = this._barLength;
            this.style.height = this._barThickness;
        }
        
        // Set classes for CSS positioning
        this.classList.toggle('horizontal', !this._isVertical);
        this.classList.toggle('vertical', this._isVertical);
        this.classList.toggle('text-start', config.text_position === 'start');
        this.classList.toggle('text-end', config.text_position === 'end');
        this.classList.toggle('align-start', config.text_align === 'start');
        this.classList.toggle('align-center', config.text_align === 'center');
        this.classList.toggle('align-end', config.text_align === 'end');

        await super.setConfig(config);
    }

    protected renderEntityContent(entity: HassEntity) {
        if (!this._config || !this.hass)
            return nothing;

        const opened = entity.state == "on";
        const color = opened && this._config.unobtrusive
            ? 'var(--shp-plan-text-color, white)'
            : getSensorColor(opened, this.getAlarmoSensorState());

        const control = this._config.control_entity ? this.hass.states[this._config.control_entity] : undefined;

        return html`
            <div
                class="content"
                @action=${this._handleDoorAction}
                .actionHandler=${actionHandler({ hasHold: !!(this._config.hold_action || control) })}
            >
                <div class="shape" style="width: ${this._barLength}; height: ${this._barThickness}; background-color: ${color};"></div>
                <div class="label">
                    <last-change-text-shp
                        .entity=${entity}
                        .secondsForSuperHighlight=${15}
                    ></last-change-text-shp>
                    ${control ? this.renderControlChip(control) : nothing}
                </div>
            </div>
            `
    }

    private renderControlChip(control: HassEntity) {
        const colors = getControlColors(control.state);
        const position = getPartialPosition(control);
        return html`
            <span class="control" style="background-color: ${colors.background};">
                <ha-state-icon
                    class=${colors.dimmed ? 'dimmed' : ''}
                    style="color: ${colors.icon};"
                    .hass=${this.hass}
                    .stateObj=${control}
                ></ha-state-icon>
                ${position !== undefined ? html`${position}%` : nothing}
            </span>
        `;
    }

    private _handleDoorAction(ev: ActionHandlerEvent) {
        ev.stopPropagation();
        if (!this._config || !this.hass) return;

        if (ev.detail.action === 'tap') {
            if (this._config.tap_action) {
                handleAction(this, this.hass, this._config, 'tap');
            } else {
                this.dispatchEvent(new CustomEvent('shp-door-window-detail', {
                    detail: { entityId: this._config.entity, controlEntityId: this._config.control_entity },
                    bubbles: true,
                    composed: true,
                }));
            }
        } else if (ev.detail.action === 'hold') {
            if (this._config.hold_action) {
                handleAction(this, this.hass, this._config, 'hold');
            } else if (this._config.control_entity) {
                toggleControl(this.hass, this._config.control_entity);
            }
        }
    }
}
