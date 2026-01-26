import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatIcon } from "@angular/material/icon";


export type EditorMode = 'idle' | 'stop-edit' | 'line-create' | 'line-edit';
export type LinePanelMode = 'line-create' | 'line-edit';
export type StopRef = { id: number; name: string; lat: number; lng: number };
@Component({
  selector: 'app-line-editor-panel-component',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatDividerModule, MatIcon],
  templateUrl: './line-editor-panel-component.html',
  styleUrl: './line-editor-panel-component.scss',
})
export class LineEditorPanelComponent {
  @Input() mode: LinePanelMode = 'line-create';
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

@Output() enterEdit = new EventEmitter<void>();
@Output() exitEdit = new EventEmitter<void>();


@Input() hasSelectedLine = false;

@Input() lineColor = '#FF9800';
@Output() lineColorChange = new EventEmitter<string>();

@Output() saveDraft = new EventEmitter<void>();
@Output() saveEditDraft = new EventEmitter<void>();

@Output() restoreEdit = new EventEmitter<void>();
@Input() pendingCount = 0;
@Output() resetAllLines = new EventEmitter<void>();

@Input() createOpen = false;
@Output() beginCreate = new EventEmitter<void>();



@Input() canSaveDraft = false;



get isReadonly(): boolean {
  // se sto editando: mai readonly
  if (this.mode === 'line-edit') return false;

  // se ho selezionato una linea esistente: blocca finché non entro in edit
  if (this.hasSelectedLine) return true;

  // altrimenti (nuova linea non selezionata): editabile
  return false;
}
}
