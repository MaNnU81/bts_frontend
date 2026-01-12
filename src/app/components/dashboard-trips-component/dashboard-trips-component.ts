import { Component, EventEmitter, Input, input, Output } from '@angular/core';
import { TripSummary } from '../../models/trip-summary';
import { LineWithTrips } from '../../models/line-with-trips';
import { TripSimulationOptions } from '../../models/TripSimulationOptions';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormsModule } from '@angular/forms'
import { MatSlider, MatSliderModule } from '@angular/material/slider';


@Component({
  selector: 'app-dashboard-trips-component',
  standalone: true,
  imports: [CommonModule, MatFormFieldModule, MatSelectModule, MatButtonModule, MatCheckboxModule, FormsModule, MatSliderModule, MatSlider],
  templateUrl: './dashboard-trips-component.html',
  styleUrl: './dashboard-trips-component.scss',
})
export class DashboardTripsComponent {
  @Input({ required: true }) linesWithTrips: LineWithTrips[] = [];
  @Output() tripSelected = new EventEmitter<number>();
  @Output() startTrip = new EventEmitter<TripSimulationOptions>();
  @Output() stopRequested = new EventEmitter<void>();
  @Output() addToScenario = new EventEmitter<TripSimulationOptions>();

  selectedLineId: number | null = null;
  selectedTripId: number | null = null;

  scheduleEnabled = false;
  liveEnabled = false;
  maxDelayMinutes = 0;

  get tripsForSelectedLine(): TripSummary[] {
    if (this.selectedLineId == null) return [];
    const line = this.linesWithTrips.find((l) => l.lineId === this.selectedLineId);
    return line?.trips ?? [];
  }

  onLineChange(lineId: number | null) {
    this.selectedLineId = lineId;
    this.selectedTripId = null; // resetto solo il trip quando cambio linea
  }

  onTripChange(tripId: number | null) {
    this.selectedTripId = tripId;
  }

onScheduleCheckboxChange(checked: boolean) {
  this.scheduleEnabled = checked;
}

onLiveCheckboxChange(checked: boolean) {
  this.liveEnabled = checked;
  if (!checked) {
    this.maxDelayMinutes = 0; // reset se deselezioni live
  }
}



  onStartClick() {
    if (this.selectedTripId != null) {
      const payload: TripSimulationOptions = {
        tripId: this.selectedTripId,    
        scheduleEnabled: this.scheduleEnabled,
        liveEnabled: this.liveEnabled,
        maxDelayMinutes: this.liveEnabled ? this.maxDelayMinutes : 0,   
      };
      // this.startTrip.emit(payload);
      this.addToScenario.emit(payload);
    }
  }

  onStopClick() {
    this.stopRequested.emit();
      console.log('STOP CLICK');
  }



}

