import { LitElement, html, css } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { sharedStyles } from "./shared-styles";
import type { Layer, PictureElementGroup } from "../scalable-house-plan";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import "./editor-groups";

@customElement("editor-layer")
export class EditorLayer extends LitElement {
    @property({ attribute: false }) hass!: HomeAssistant;
    @property({ type: Object }) layer!: Layer;
    @property({ type: Number }) index!: number;
    @property({ type: Boolean }) isExpanded: boolean = false;
    @state() private _expandedGroups: Set<number> = new Set();

    static styles = [
        sharedStyles,
        css`
            :host {
                display: block;
            }
        `
    ];

    protected render() {
        const groupCount = this.layer.groups?.length || 0;
        
        return html`
            <div class="item">
                <div class="item-header" @click=${this._toggleExpansion}>
                    <ha-icon 
                        icon="mdi:chevron-right" 
                        class="expand-icon ${this.isExpanded ? 'expanded' : ''}"
                    ></ha-icon>
                    <div class="item-info">
                        <ha-icon icon="${this.layer.icon || 'mdi:layer-group'}" class="item-icon"></ha-icon>
                        <div>
                            <div class="item-name">${this.layer.name}</div>
                            <div class="item-details">
                                ${groupCount} groups
                                ${this.layer.visible ? html`<span class="item-badge">Visible</span>` : html`<span class="item-badge inactive">Hidden</span>`}
                                ${this.layer.showInToggles ? html`<span class="item-badge">Toggleable</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="item-actions" @click=${(e: Event) => e.stopPropagation()}>
                        <button class="icon-button danger" @click=${this._removeLayer}>
                            <ha-icon icon="mdi:delete"></ha-icon>
                        </button>
                        <ha-icon icon="mdi:drag" class="handle" .disabled=${false} @click=${(e: Event) => e.stopPropagation()}></ha-icon>
                    </div>
                </div>
                
                <div class="item-content ${this.isExpanded ? 'expanded' : ''}">
                    <div class="form-grid">
                        <ha-textfield
                            label="Icon"
                            .value=${this.layer.icon}
                            @input=${(e: any) => this._updateProperty('icon', e.target.value)}
                            placeholder="mdi:lightbulb"
                        ></ha-textfield>
                        <ha-textfield
                            label="Layer Name"
                            .value=${this.layer.name}
                            @input=${(e: any) => this._updateProperty('name', e.target.value)}
                            placeholder="e.g., Lights"
                        ></ha-textfield>

                        <div class="form-toggles">
                            <ha-formfield label="Visible by default">
                                <ha-switch
                                    .checked=${this.layer.visible}
                                    @change=${(e: any) => this._updateProperty('visible', e.target.checked)}
                                ></ha-switch>
                            </ha-formfield>
                            <ha-formfield label="Show in Toggles">
                                <ha-switch
                                    .checked=${this.layer.showInToggles}
                                    @change=${(e: any) => this._updateProperty('showInToggles', e.target.checked)}
                                ></ha-switch>
                            </ha-formfield>
                        </div>
                    </div>
                    
                    <!-- Groups Section -->
                    <editor-groups
                        .hass=${this.hass}
                        .groups=${this.layer.groups || []}
                        .expandedGroups=${this._expandedGroups}
                        .layerIndex=${this.index}
                        @groups-add=${this._addGroup}
                        @groups-toggle=${this._toggleGroup}
                        @groups-update=${this._updateGroup}
                        @groups-remove=${this._removeGroup}
                        @groups-reorder=${this._reorderGroups}
                        @group-added=${this._handleGroupAdded}
                        @group-removed=${this._handleGroupRemoved}
                        @element-added=${this._handleElementAdded}
                        @element-removed=${this._handleElementRemoved}
                    ></editor-groups>
                </div>
            </div>
        `;
    }

    private _toggleExpansion() {
        const event = new CustomEvent('layer-toggle', {
            detail: { index: this.index },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _removeLayer() {
        const event = new CustomEvent('layer-remove', {
            detail: { index: this.index },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _updateProperty(property: keyof Layer, value: any) {
        const event = new CustomEvent('layer-update', {
            detail: { 
                index: this.index,
                property,
                value 
            },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _addGroup() {
        const newGroup: PictureElementGroup = {
            group_name: "New Group",
            elements: []
        };

        const updatedLayer = {
            ...this.layer,
            groups: [...(this.layer.groups || []), newGroup]
        };

        const event = new CustomEvent('layer-update', {
            detail: { 
                index: this.index,
                property: 'groups',
                value: updatedLayer.groups
            },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);

        // Expand the new group automatically
        this._expandedGroups.add(updatedLayer.groups.length - 1);
        this.requestUpdate();
    }

    private _toggleGroup(ev: CustomEvent) {
        const { index } = ev.detail;
        if (this._expandedGroups.has(index)) {
            this._expandedGroups.delete(index);
        } else {
            this._expandedGroups.add(index);
        }
        this.requestUpdate();
    }

    private _updateGroup(ev: CustomEvent) {
        const { index, property, value } = ev.detail;
        const groups = [...(this.layer.groups || [])];
        groups[index] = {
            ...groups[index],
            [property]: value
        };

        const event = new CustomEvent('layer-update', {
            detail: { 
                index: this.index,
                property: 'groups',
                value: groups
            },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _removeGroup(ev: CustomEvent) {
        const { index } = ev.detail;
        const groups = [...(this.layer.groups || [])];
        groups.splice(index, 1);

        const event = new CustomEvent('layer-update', {
            detail: { 
                index: this.index,
                property: 'groups',
                value: groups
            },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);

        // Update expanded groups indices
        const newExpanded = new Set<number>();
        for (const expandedIndex of this._expandedGroups) {
            if (expandedIndex < index) {
                newExpanded.add(expandedIndex);
            } else if (expandedIndex > index) {
                newExpanded.add(expandedIndex - 1);
            }
        }
        this._expandedGroups = newExpanded;
        this.requestUpdate();
    }

    private _reorderGroups(ev: CustomEvent) {
        const { groups } = ev.detail;
        
        const event = new CustomEvent('layer-update', {
            detail: { 
                index: this.index,
                property: 'groups',
                value: groups
            },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    // Cross-container drag & drop handlers
    private _handleGroupAdded(ev: CustomEvent): void {
        // Bubble up the group-added event for cross-layer coordination
        this.dispatchEvent(new CustomEvent('group-added', {
            detail: ev.detail,
            bubbles: true,
            composed: true
        }));
    }

    private _handleGroupRemoved(ev: CustomEvent): void {
        // Bubble up the group-removed event for cross-layer coordination
        this.dispatchEvent(new CustomEvent('group-removed', {
            detail: ev.detail,
            bubbles: true,
            composed: true
        }));
    }

    private _handleElementAdded(ev: CustomEvent): void {
        // Bubble up the element-added event for cross-group coordination
        this.dispatchEvent(new CustomEvent('element-added', {
            detail: ev.detail,
            bubbles: true,
            composed: true
        }));
    }

    private _handleElementRemoved(ev: CustomEvent): void {
        // Bubble up the element-removed event for cross-group coordination
        this.dispatchEvent(new CustomEvent('element-removed', {
            detail: ev.detail,
            bubbles: true,
            composed: true
        }));
    }
}
