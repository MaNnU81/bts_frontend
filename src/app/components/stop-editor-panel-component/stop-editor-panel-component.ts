import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';

export type StopEditorMode = 'create' | 'edit';

export type StopEditorState = {
  mode: StopEditorMode;
  stopId: number | null;
  name: string;
  lat: number | null;
  lng: number | null;
  
  layer: any | null;
};
@Component({
  selector: 'app-stop-editor-panel-component',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatDividerModule,],
  templateUrl: './stop-editor-panel-component.html',
  styleUrl: './stop-editor-panel-component.scss',
})
export class StopEditorPanelComponent {
  @Input() state: StopEditorState | null = null;
  @Input() pendingCount = 0;

  @Output() saveAll = new EventEmitter<void>();
  @Output() applyDraft = new EventEmitter<void>();
  @Output() deleteCurrent = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  @Output() resetAll = new EventEmitter<void>();
  @Output() restoreCurrent = new EventEmitter<void>();

  onSaveAll(): void {
    this.saveAll.emit();
  }

  onApplyDraft(): void {
    this.applyDraft.emit();
  }

  onDeleteCurrent(): void {
    this.deleteCurrent.emit();
  }

  onCancel(): void {
    this.cancel.emit();
  }

  onResetAll(): void {
  this.resetAll.emit();
}

onRestoreCurrent(): void {
  this.restoreCurrent.emit();
}
}
