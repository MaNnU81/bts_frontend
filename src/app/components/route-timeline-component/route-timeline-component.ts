import {
  Component,
  computed,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  signal,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TripPosition } from '../../models/trip-position';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-route-timeline-component',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatProgressBarModule, MatListModule, MatIconModule],
  templateUrl: './route-timeline-component.html',
  styleUrl: './route-timeline-component.scss',
})
export class RouteTimelineComponent  {
  @Input() tripPosition: TripPosition | null = null;
  @Input() selectedStopId: number | null = null;
  @Input() stopLinesByStopId: Record<number, number[]> = {};
  @Input() currentLineNumber: number | null = null;
  

  @Output() stopClicked = new EventEmitter<number>();

 @Input() delaysBySequence: Record<number, number> = {};
  // getter



  private get currentSeq(): number | null {
    return this.tripPosition?.currentSequence ?? null;
  }

  private get nextSeq(): number | null {
    return this.tripPosition?.nextSequence ?? null;
  }

  get progressTotalPercent(): number {
    const p = this.tripPosition?.progressTotal ?? 0;
    return Math.min(Math.max(p, 0), 1) * 100;
  }

  isPast(sequence: number): boolean {
    const trip = this.tripPosition;
    if (!trip) return false;

    if (trip.isFinished) return true;

    if (!trip.isStarted || trip.currentSequence == null) return false;

    return sequence < trip.currentSequence;
  }

  isCurrent(sequence: number): boolean {
    const trip = this.tripPosition;
    if (!trip) return false;

    if (trip.isAtStop && trip.currentSequence != null) {
      return sequence === trip.currentSequence;
    }

    return false;
  }

  isNext(sequence: number): boolean {
    const trip = this.tripPosition;
    if (!trip) return false;

    if (trip.nextSequence != null) {
      return sequence === trip.nextSequence;
    }

    if (trip.currentSequence != null) {
      return sequence === trip.currentSequence + 1;
    }

    return false;
  }
  getLineNumbersForStop(stopId: number): number[] {
    const all = this.stopLinesByStopId?.[stopId] ?? [];

  if (this.currentLineNumber == null) {
    return all;
  }

  
  return all.filter(n => n !== this.currentLineNumber);
}





  getDelayForSequence(sequence: number): number | null {
    const value = this.delaysBySequence[sequence];
    return value != null ? value : null;
  }

  getMarkerLeftPercent(index: number, count: number): number {
    if (count <= 1) return 0;
    return (index / (count - 1)) * 100;
  }

  onStopClick(stopId: number): void {
    this.stopClicked.emit(stopId);
  }
}
