import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardContent } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ScenarioRunDto } from '../../models/scenario-runs'


@Component({
  selector: 'app-run-tabs-component',
  imports: [MatTabsModule, MatCardContent, MatIconModule, MatButtonModule, MatTooltipModule],
  templateUrl: './run-tabs-component.html',
  styleUrl: './run-tabs-component.scss',
})
export class RunTabsComponent {
  @Input() runs : ScenarioRunDto[] = [];
  @Input() selectedScenarioId: number | null = null;
  @Input() isScenarioLive = false;

  @Output() selectScenario = new EventEmitter<number>();
  @Output() removeScenario = new EventEmitter<number>();

  get selectedIndex(): number {
    if (this.runs.length || this.selectedScenarioId == null) return 0;
    const index = this.runs.findIndex(r => r.scenarioId === this.selectedScenarioId);
    return index >= 0 ? index : 0;
  }

  onIndexChange(index: number): void {
    const run = this.runs[index];
    if (run) this.selectScenario.emit(run.scenarioId);
  }

    canRemove(run: ScenarioRunDto): boolean {
    // togli solo prima del live e solo se pending
    return !this.isScenarioLive && run.status === 'pending';
  }

  
/** Tooltip esplicativo quando NON puoi rimuovere */
  removeTooltip(run: ScenarioRunDto): string {
    if (this.isScenarioLive) return 'Scenario in esecuzione: non puoi rimuovere run';
    if (run.status !== 'pending') return `Run già ${run.status}: non rimovibile`;
    return 'Rimuovi run dallo scenario';
  }

  onRemoveClick(run: ScenarioRunDto, ev: MouseEvent): void {
    ev.stopPropagation(); 
    if (!this.canRemove(run)) return;
    this.removeScenario.emit(run.scenarioId);
  }

  // Badge / icona per stato
  getStatusIcon(status: ScenarioRunDto['status']): string {
    switch (status) {
      case 'pending': return 'schedule';
      case 'live': return 'play_circle';
      case 'finished': return 'check_circle';
      case 'stopped': return 'stop_circle';
      case 'error': return 'error';
      default: return 'help';
    }
  }

  getStatusLabel(status: ScenarioRunDto['status']): string {
    switch (status) {
      case 'pending': return 'Pronto';
      case 'live': return 'Live';
      case 'finished': return 'Finito';
      case 'stopped': return 'Fermato';
      case 'error': return 'Errore';
      default: return status;
    }
  }
}
