import { noChange } from 'lit';
import type { AttributePart, DirectiveParameters } from 'lit/directive.js';
import { directive, Directive } from 'lit/directive.js';

export interface ActionHandlerOptions {
  hasHold?: boolean;
  hasDoubleClick?: boolean;
  disabled?: boolean;
}

export interface ActionHandlerDetail {
  action: "hold" | "tap" | "double_tap";
}

export interface ActionHandlerEvent extends CustomEvent<ActionHandlerDetail> {
  detail: ActionHandlerDetail;
}

interface ActionHandlerElement extends HTMLElement {
  actionHandler?: {
    options: ActionHandlerOptions;
    start?: (ev: Event) => void;
    end?: (ev: Event) => void;
    handleKeyDown?: (ev: KeyboardEvent) => void;
  };
}

const HOLD_TIME = 500; // ms

class ActionHandlerController {
  private timer?: number;
  private held = false;
  private cancelled = false;

  constructor() {
    // Cancel on scroll/touch events
    ['touchcancel', 'mouseout', 'mouseup', 'touchmove', 'mousewheel', 'wheel', 'scroll'].forEach((ev) => {
      document.addEventListener(
        ev,
        () => {
          this.cancelled = true;
          if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
          }
        },
        { passive: true }
      );
    });
  }

  public bind(element: ActionHandlerElement, options: ActionHandlerOptions = {}) {
    if (element.actionHandler) {
      element.removeEventListener('touchstart', element.actionHandler.start!);
      element.removeEventListener('touchend', element.actionHandler.end!);
      element.removeEventListener('touchcancel', element.actionHandler.end!);
      element.removeEventListener('mousedown', element.actionHandler.start!);
      element.removeEventListener('click', element.actionHandler.end!);
      element.removeEventListener('keydown', element.actionHandler.handleKeyDown!);
    } else {
      element.addEventListener('contextmenu', (ev: Event) => {
        const e = ev || window.event;
        if (e.preventDefault) {
          e.preventDefault();
        }
        if (e.stopPropagation) {
          e.stopPropagation();
        }
        e.cancelBubble = true;
        e.returnValue = false;
        return false;
      });
    }

    element.actionHandler = { options };

    if (options.disabled) {
      return;
    }

    element.actionHandler.start = (ev: Event) => {
      this.cancelled = false;
      
      if (options.hasHold) {
        this.held = false;
        this.timer = window.setTimeout(() => {
          this.held = true;
        }, HOLD_TIME);
      }
    };

    element.actionHandler.end = (ev: Event) => {
      // Don't respond when moved or scrolled while touch
      if (ev.type === 'touchcancel' || (ev.type === 'touchend' && this.cancelled)) {
        return;
      }
      
      const target = ev.target as HTMLElement;
      
      // Prevent mouse event if touch event
      if (ev.cancelable) {
        ev.preventDefault();
      }
      
      if (options.hasHold) {
        clearTimeout(this.timer);
        this.timer = undefined;
      }
      
      if (options.hasHold && this.held) {
        // Dispatch hold event
        target.dispatchEvent(
          new CustomEvent<ActionHandlerDetail>('action', {
            bubbles: true,
            composed: true,
            detail: { action: 'hold' }
          })
        );
      } else {
        // Dispatch tap event
        target.dispatchEvent(
          new CustomEvent<ActionHandlerDetail>('action', {
            bubbles: true,
            composed: true,
            detail: { action: 'tap' }
          })
        );
      }
    };

    element.actionHandler.handleKeyDown = (ev: KeyboardEvent) => {
      if (!['Enter', ' '].includes(ev.key)) {
        return;
      }
      (ev.currentTarget as ActionHandlerElement).actionHandler!.end!(ev);
    };

    element.addEventListener('touchstart', element.actionHandler.start, { passive: true });
    element.addEventListener('touchend', element.actionHandler.end);
    element.addEventListener('touchcancel', element.actionHandler.end);
    element.addEventListener('mousedown', element.actionHandler.start, { passive: true });
    element.addEventListener('click', element.actionHandler.end);
    element.addEventListener('keydown', element.actionHandler.handleKeyDown);
  }
}

const controller = new ActionHandlerController();

export const actionHandler = directive(
  class extends Directive {
    update(part: AttributePart, [options]: DirectiveParameters<this>) {
      controller.bind(part.element as ActionHandlerElement, options);
      return noChange;
    }

    render(_options?: ActionHandlerOptions) {}
  }
);
