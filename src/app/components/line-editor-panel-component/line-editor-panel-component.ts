import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';

export type EditorMode = 'idle' | 'stop-edit' | 'line-create' | 'line-edit';

@Component({
  selector: 'app-line-editor-panel-component',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatDividerModule],
  templateUrl: './line-editor-panel-component.html',
  styleUrl: './line-editor-panel-component.scss',
})
export class LineEditorPanelComponent {
  @Input() mode: EditorMode = 'line-create';

  @Output() close = new EventEmitter<void>();

  
  @Output() confirmSequence = new EventEmitter<void>();
  @Output() backToCreate = new EventEmitter<void>();
}
