import { LitElement, html, css } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "./shared-styles";
import { DragDropMixin } from "./drag-drop-mixin";
import type { PictureElementGroup } from "../scalable-house-plan";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import "./editor-group";
import { CrossContainerCoordinator } from "./cross-container-coordinator";

@customElement("editor-groups")
export class EditorGroups extends LitElement {
    @property({ attribute: false }) hass!: HomeAssistant;
    @property({ type: Array }) groups: PictureElementGroup[] = [];
    @property({ attribute: false }) expandedGroups: Set<number> = new Set();
    @property({ type: Number }) layerIndex?: number;

    private coordinator = CrossContainerCoordinator.getInstance();

    static styles = [
        sharedStyles,
        css`
            :host {
                display: block;
            }
        `
    ];

    protected render() {
        return html`
            <div class="groups-section">
                <div class="section-header">
                    <div class="section-title">
                        <ha-icon icon="mdi:folder-multiple"></ha-icon>
                        Groups (${this.groups.length})
                    </div>
                    <button class="add-button" @click=${this._addGroup}>
                        <ha-icon icon="mdi:plus"></ha-icon>
                        Add Group
                    </button>
                </div>

                <ha-sortable 
                    handle-selector=".handle"
                    draggable-selector=".group-item"
                    @item-moved=${(ev: any) => this._handleGroupsReorder(ev)}
                    @item-added=${(ev: any) => this._handleGroupAdded(ev)}
                    @item-removed=${(ev: any) => this._handleGroupRemoved(ev)}
                    group="groups"
                    .disabled=${false}
                >
                    <div class="groups-list">
                        ${this.groups.length === 0 
                            ? html`<div class="empty-drop-zone">${this._renderEmptyState()}</div>`
                            : this.groups.map((group, index) => html`
                                <editor-group
                                    class="group-item"
                                    .hass=${this.hass}
                                    .group=${group as PictureElementGroup}
                                    .index=${index}
                                    .layerIndex=${this.layerIndex}
                                    .isExpanded=${this.expandedGroups.has(index)}
                                    @group-toggle=${this._handleGroupToggle}
                                    @group-update=${this._handleGroupUpdate}
                                    @group-remove=${this._handleGroupRemove}
                                ></editor-group>
                            `)
                        }
                    </div>
                </ha-sortable>
            </div>
        `;
    }

    private _renderEmptyState() {
        return html`
            <div class="empty-state">
                <ha-icon icon="mdi:folder-multiple"></ha-icon>
                <div class="empty-state-title">No groups created</div>
                <div class="empty-state-subtitle">
                    Groups help organize your picture elements within this layer
                </div>
            </div>
        `;
    }

    private _addGroup() {
        const event = new CustomEvent('groups-add', {
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleGroupToggle(e: CustomEvent) {
        const event = new CustomEvent('groups-toggle', {
            detail: e.detail,
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleGroupUpdate(e: CustomEvent) {
        const event = new CustomEvent('groups-update', {
            detail: e.detail,
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleGroupRemove(e: CustomEvent) {
        const event = new CustomEvent('groups-remove', {
            detail: e.detail,
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleGroupsReorder(e: CustomEvent) {
        e.stopPropagation();
        const { oldIndex, newIndex } = e.detail;
        const reorderedGroups = DragDropMixin.reorderArray(this.groups, oldIndex, newIndex);
        
        const event = new CustomEvent('groups-reorder', {
            detail: { groups: reorderedGroups },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleGroupAdded(e: CustomEvent) {
        // Record the add for cross-container coordination
        this.coordinator.recordAdd('group', {
            layerIndex: this.layerIndex,
            groupIndex: e.detail.index
        });

        // Also bubble up the event for parent components
        const event = new CustomEvent('group-added', {
            detail: { 
                index: e.detail.index,
                layerIndex: this.layerIndex,
                timestamp: Date.now()
            },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    private _handleGroupRemoved(e: CustomEvent) {
        const removedIndex = e.detail.index;
        const removedGroup = this.groups[removedIndex];
        
        // Check if this is a cross-container move
        const isCrossContainerMove = this.coordinator.recordRemove('group', {
            layerIndex: this.layerIndex,
            groupIndex: removedIndex
        }, removedGroup);

        if (!isCrossContainerMove) {
            // Normal removal - bubble up the event
            const event = new CustomEvent('group-removed', {
                detail: { 
                    index: removedIndex,
                    layerIndex: this.layerIndex,
                    timestamp: Date.now()
                },
                bubbles: true,
                composed: true
            });
            this.dispatchEvent(event);
        }
        // If it was a cross-container move, the coordinator handles it
    }
}
