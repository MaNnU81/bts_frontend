import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { StopBoardDto } from '../../models/stop-board';


@Component({
  selector: 'app-stop-board-component',
  standalone: true,
  imports: [    CommonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,],
  templateUrl: './stop-board-component.html',
  styleUrl: './stop-board-component.scss',
})
export class StopBoardComponent {
  @Input() selectedStopId: number | null = null;
  @Input() board: StopBoardDto | null = null;
  @Input() loading = false;
  @Input() error: string | null = null;
  @Input() lastRefreshTime: string | null = null;

  @Output() refresh = new EventEmitter<void>();

    onRefreshClick(): void {
    this.refresh.emit();
  }
}
