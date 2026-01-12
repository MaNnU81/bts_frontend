import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';

import { LineWithStops } from '../../models/line-with-stops';
import { StopSummary } from '../../models/stop-summary';

@Component({
  selector: 'app-dashboard-stops-component',
  standalone: true,
  imports: [CommonModule, MatFormFieldModule, MatSelectModule, MatButtonModule],
  templateUrl: './dashboard-stops-component.html',
  styleUrl: './dashboard-stops-component.scss',
})
export class DashboardStopsComponent {
  @Input({ required: true }) linesWithStops: LineWithStops[] = [];

  @Output() stopSelected = new EventEmitter<number>();
  @Output() selectionCleared = new EventEmitter<void>();

  selectedLineId: number | null = null;
  selectedStopId: number | null = null;

  get stopsForSelectedLine(): StopSummary[] {
    if (this.selectedLineId == null) return [];
    const line = this.linesWithStops.find(l => l.lineId === this.selectedLineId);
    return line?.stops ?? [];
  }

  onLineChange(lineId: number | null) {
    this.selectedLineId = lineId;
    this.selectedStopId = null; // reset fermata quando cambio linea
  }

  onStopChange(stopId: number | null) {
    this.selectedStopId = stopId;
  }

  onConfirmClick() {
    if (this.selectedStopId != null) {
      this.stopSelected.emit(this.selectedStopId);
    }
  }

  onClearClick() {
    this.selectedLineId = null;
    this.selectedStopId = null;
    this.selectionCleared.emit();
  }
}
