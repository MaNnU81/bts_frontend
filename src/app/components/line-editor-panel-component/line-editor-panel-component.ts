import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';


export type EditorMode = 'idle' | 'stop-edit' | 'line-create' | 'line-edit';
export type StopRef = { id: number; name: string; lat: number; lng: number };
@Component({
  selector: 'app-line-editor-panel-component',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatDividerModule],
  templateUrl: './line-editor-panel-component.html',
  styleUrl: './line-editor-panel-component.scss',
})
export class LineEditorPanelComponent {
  @Input() mode: EditorMode = 'line-create';
  @Input() search = '';
  @Input() results: StopRef[] = [];
  @Input() selectedStops: StopRef[] = [];

  @Output() searchChange = new EventEmitter<string>();

  @Output() addStop = new EventEmitter<number>();
  @Output() removeAt = new EventEmitter<number>();
  @Output() moveUp = new EventEmitter<number>();
  @Output() moveDown = new EventEmitter<number>();


  // input per la linea
@Input() lineNumber: number | null = null;
@Input() lineDirection = '';
@Input() lineRoute = '';

@Output() lineNumberChange = new EventEmitter<number | null>();
@Output() lineDirectionChange = new EventEmitter<string>();
@Output() lineRouteChange = new EventEmitter<string>();
}
