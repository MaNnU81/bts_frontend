// import { Component, EventEmitter, Input, Output } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { FormsModule } from '@angular/forms';
// import * as L from 'leaflet';

// export type StopEditorMode = 'create' | 'edit';

// export interface StopEditorState {
//   mode: StopEditorMode;
//   stopId: number | null;
//   name: string;
//   lat: number | null;
//   lng: number | null;
//   layer: L.Marker | null;
// }

// @Component({
//   selector: 'app-stop-editor-panel-component',
//   standalone: true,
//   imports: [CommonModule, FormsModule],
//   templateUrl: './stop-editor-panel-component.html',
//   styleUrl: './stop-editor-panel-component.scss',
// })
// export class StopEditorPanelComponent {
//  @Input() state: StopEditorState | null = null;

//   @Output() cancel = new EventEmitter<void>();
//   @Output() saveRequested = new EventEmitter<StopEditorState>();

//   onCancel(): void {
//     this.cancel.emit();
//   }

//   onSave(): void {
//     if (!this.state) return;
//     this.saveRequested.emit(this.state);
//   }
// }
