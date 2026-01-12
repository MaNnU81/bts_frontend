import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TripPosition } from '../../models/trip-position';




@Component({
  selector: 'app-bus-board-component',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, ],
  templateUrl: './bus-board-component.html',
  styleUrl: './bus-board-component.scss',
})
export class BusBoardComponent implements OnChanges {
@Input() tripPosition: TripPosition | null = null;
  @Input() stopLinesByStopId: Record<number, number[]> = {};
  @Input() currentLineNumber: number | null = null;

  lastDelayMinutes: number | null = null;
  lastDelayStopName: string | null = null;
  private lastTripId: number | null = null;

private delaysBySequence = new Map<number, number>();
 get visibleStops() {
    if (!this.tripPosition) return [];
    const seq = this.tripPosition.currentSequence ?? 0;
    return this.tripPosition.stops.filter(
      s => s.sequence >= seq - 1 && s.sequence <= seq + 3
    );
  }

    resetSimulationState(): void {
    this.lastDelayMinutes = null;
    this.lastDelayStopName = null;
    this.lastTripId = null;
    this.delaysBySequence.clear();
  }

    ngOnChanges(changes: SimpleChanges): void {
    const trip = this.tripPosition;
    if (!trip) return;
    

   
    if (this.lastTripId !== trip.tripId) {
      this.lastTripId = trip.tripId;
      this.lastDelayMinutes = null;
      this.lastDelayStopName = null;
      this.delaysBySequence.clear();
      
    }

    
    if (
      trip.isAtStop &&
      trip.currentStopName &&
      trip.liveDelayMinutes != null &&
      trip.currentSequence != null
    ) {
      this.delaysBySequence.set(trip.currentSequence, trip.liveDelayMinutes);
      this.lastDelayMinutes = trip.liveDelayMinutes;
      this.lastDelayStopName = trip.currentStopName ?? null;
    }


  }

  getDelayForSequence(sequence: number): number | null {
    const value = this.delaysBySequence.get(sequence);
    return value ?? null;
  }

isPast(sequence: number): boolean {
    if (!this.tripPosition || this.tripPosition.currentSequence == null) {
      return false;
    }
    return sequence < this.tripPosition.currentSequence;
  }

  isCurrent(sequence: number): boolean {
    if (!this.tripPosition || this.tripPosition.currentSequence == null) {
      return false;
    }
    return sequence === this.tripPosition.currentSequence;
  }

  isNext(sequence: number): boolean {
    if (!this.tripPosition || this.tripPosition.nextSequence == null) {
      return false;
    }
    return sequence === this.tripPosition.nextSequence;
  }

   getCoincidenceLinesForNextStop(): number[] {
    const trip = this.tripPosition;
    if (!trip || !trip.stops || trip.nextSequence == null) {
      return [];
    }

    const nextStop = trip.stops.find(s => s.sequence === trip.nextSequence);
    if (!nextStop) return [];

    const all = this.stopLinesByStopId?.[nextStop.stopId] ?? [];

    if (this.currentLineNumber == null) {
      return all;
    }

    // escludo la linea corrente → solo altre linee
    return all.filter(n => n !== this.currentLineNumber);
  }

}
