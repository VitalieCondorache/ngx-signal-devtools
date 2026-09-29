import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { SignalGraph, SignalGraphNode } from '../core/types';

/**
 * Renders the layout produced by `layoutSignalGraph()` as plain SVG — no charting dependency, no
 * canvas, and therefore nothing extra to ship.
 */
@Component({
  selector: 'sdt-graph-view',
  template: `
    @if (graph().nodes.length === 0) {
      <p class="sdt-empty">Nothing to draw yet: track at least one signal.</p>
    } @else {
      <svg
        class="sdt-svg"
        [attr.viewBox]="'0 0 ' + graph().width + ' ' + graph().height"
        [attr.width]="graph().width"
        [attr.height]="graph().height"
        role="img"
        aria-label="Signal dependency graph"
      >
        @for (edge of graph().edges; track edge.from + '->' + edge.to) {
          <path class="sdt-edge" [attr.d]="edge.path" />
        }
        @for (node of graph().nodes; track node.id) {
          <g
            class="sdt-node sdt-node-{{ node.kind }}"
            [class.sdt-node-selected]="selectedId() === node.id"
            [class.sdt-node-destroyed]="node.destroyed"
            (click)="selected.emit(node.id)"
          >
            <rect
              [attr.x]="node.x"
              [attr.y]="node.y"
              [attr.width]="node.width"
              [attr.height]="node.height"
              rx="6"
            />
            <text [attr.x]="node.x + 10" [attr.y]="node.y + 19">{{ label(node) }}</text>
            <title>{{ node.kind }} · {{ node.name }}</title>
          </g>
        }
      </svg>
    }
  `,
  styles: `
    .sdt-svg {
      display: block;
      max-width: 100%;
      padding: 4px;
    }

    .sdt-edge {
      fill: none;
      stroke: #394154;
      stroke-width: 1.2;
    }

    .sdt-node rect {
      fill: #1b2130;
      stroke: #3b4459;
      stroke-width: 1;
    }

    .sdt-node text {
      fill: #c8cfdf;
      font:
        11px ui-monospace,
        SFMono-Regular,
        Menlo,
        Consolas,
        monospace;
      pointer-events: none;
    }

    .sdt-node {
      cursor: pointer;
    }

    .sdt-node-signal rect {
      stroke: #2f7f9e;
    }

    .sdt-node-computed rect {
      stroke: #6d5bd0;
    }

    .sdt-node-effect rect {
      stroke: #b06a2c;
    }

    .sdt-node-tracked rect {
      stroke: #3f8f5a;
    }

    .sdt-node-selected rect {
      fill: #26304a;
      stroke: #7dd3fc;
      stroke-width: 2;
    }

    .sdt-node-destroyed {
      opacity: 0.45;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SdtGraphViewComponent {
  readonly graph = input.required<SignalGraph>();
  readonly selectedId = input<number | null>(null);
  readonly selected = output<number>();

  protected label(node: SignalGraphNode): string {
    const max = 20;
    const name = node.name.length > max ? `${node.name.slice(0, max)}…` : node.name;
    return node.destroyed ? `${name} ✝` : name;
  }
}
