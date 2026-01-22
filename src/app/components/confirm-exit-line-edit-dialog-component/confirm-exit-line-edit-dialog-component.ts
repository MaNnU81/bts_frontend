import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export type ExitLineEditChoice = 'save_exit' | 'discard_exit' | 'cancel';

@Component({
  selector: 'app-confirm-exit-line-edit-dialog-component',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  templateUrl: './confirm-exit-line-edit-dialog-component.html',
  styleUrl: './confirm-exit-line-edit-dialog-component.scss',
})
export class ConfirmExitLineEditDialogComponent {
  constructor(
    private dialogRef: MatDialogRef<ConfirmExitLineEditDialogComponent, ExitLineEditChoice>,
    @Inject(MAT_DIALOG_DATA) public data: { title?: string; message?: string }
  ) {}

  saveAndExit(): void {
    this.dialogRef.close('save_exit');
  }

  discardAndExit(): void {
    this.dialogRef.close('discard_exit');
  }

  cancel(): void {
    this.dialogRef.close('cancel');
  }

}
