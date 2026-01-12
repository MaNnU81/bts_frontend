import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';

export type MapIdDialogKind = 'stop' | 'line';

export interface MapIdDialogData {
  kind: MapIdDialogKind;
}

export interface MapIdDialogResult {
  id: number;
  color?: string;
}

@Component({
  selector: 'app-leaflet-dialog-id-component',
  standalone: true,
  imports: [    MatDialogModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule, MatSelectModule],
  templateUrl: './leaflet-dialog-id-component.html',
  styleUrl: './leaflet-dialog-id-component.scss',
})
export class LeafletDialogIdComponent {
idCtrl = new FormControl<number | null>(null, {
    nonNullable: false,
    validators: [Validators.required, Validators.min(1)],
  });

    lineColors = [
    { label: 'Blu', value: '#1E88E5' },
    { label: 'Rosso', value: '#E53935' },
    { label: 'Verde', value: '#43A047' },
    { label: 'Viola', value: '#8E24AA' },
    { label: 'Arancione', value: '#FB8C00' },
  ] as const;

    colorCtrl = new FormControl<string | null>(this.lineColors[0].value, {
    nonNullable: false,
    validators: [], // lo setto nel ctor se kind === line
  });

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: MapIdDialogData,
    private dialogRef: MatDialogRef<LeafletDialogIdComponent>
  ) {
    if (data.kind === 'line') {
      this.colorCtrl.addValidators([Validators.required]);
      this.colorCtrl.updateValueAndValidity();
    } else {
      
      this.colorCtrl.clearValidators();
      this.colorCtrl.updateValueAndValidity();
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }

  save(): void {
    const id = this.idCtrl.value;
    if (id == null) return;

    const result: MapIdDialogResult =
      this.data.kind === 'line'
        ? { id, color: this.colorCtrl.value ?? undefined }
        : { id };

    this.dialogRef.close(result);
  }
}
