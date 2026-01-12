import { Component, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TripPosition } from '../../models/trip-position';

import { DataService } from '../../services/data-service';
import { FormsModule } from '@angular/forms';



@Component({
  selector: 'app-trip-simulator',
  standalone: true,
  imports: [CommonModule, FormsModule],
 
  templateUrl: './trip-simulator.html',
  styleUrl: './trip-simulator.scss',
})
export class TripSimulator {

  tripId = signal(1);
  currentTime = signal('18:12');

  loading = signal(false);
  error = signal<string | null>(null);
  data = signal<TripPosition | null>(null);

  constructor(private tripPositionService: DataService) {}

  loadPosition() {
    this.loading.set(true);
    this.error.set(null);

    this.tripPositionService
      .getTripPosition(this.tripId(), this.currentTime())
      .subscribe({
        next: (result) => {
          this.data.set(result);
          this.loading.set(false);
        },
        error: (err) => {
          console.error(err);
          this.error.set('Errore nel recupero della posizione del trip.');
          this.loading.set(false);
        }
      });
  }
}


