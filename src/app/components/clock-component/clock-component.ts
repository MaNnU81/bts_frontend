import { Component, Input, OnChanges } from '@angular/core';

@Component({
  selector: 'app-clock-component',
  imports: [],
  templateUrl: './clock-component.html',
  styleUrl: './clock-component.scss',
})
export class ClockComponent implements OnChanges {

 @Input() displayTime: string | null = null;

  hours = '--';
  minutes = '--';

  ngOnChanges(): void {
    if (!this.displayTime) {
      this.hours = '--';
      this.minutes = '--';
      return;
    }

    const [hh, mm] = this.displayTime.split(':');
    this.hours = hh;
    this.minutes = mm;
  }
}
