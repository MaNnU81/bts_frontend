import { Component, inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { BusBoardComponent } from '../bus-board-component/bus-board-component';
import { DashboardTripsComponent } from '../dashboard-trips-component/dashboard-trips-component';
import { StopBoardComponent } from '../stop-board-component/stop-board-component';
import { TripPosition } from '../../models/trip-position';
import { forkJoin, interval, Observable, of, Subscription, throwError } from 'rxjs';
import { first, map, switchMap, catchError } from 'rxjs/operators';
import { DataService } from '../../services/data-service';
import { RouteTimelineComponent } from '../route-timeline-component/route-timeline-component';
import { LineWithTrips } from '../../models/line-with-trips';
import { LineWithStops } from '../../models/line-with-stops';
import { StopSummary } from '../../models/stop-summary';
import { TripSummary } from '../../models/trip-summary';
import { TripSimulationOptions } from '../../models/TripSimulationOptions';
import { MatIcon } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { DashboardStopsComponent } from '../dashboard-stops-component/dashboard-stops-component';
import { StopBoardDto } from '../../models/stop-board';
import { RunTabsComponent } from '../run-tabs-component/run-tabs-component';
import { ScenarioRunDto } from '../../models/scenario-runs';
import { MatAnchor, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { LeafletMap } from '../leaflet-map/leaflet-map';
import { ClockComponent } from "../clock-component/clock-component";
import { A11yModule } from "@angular/cdk/a11y";
import { RouterLink } from "@angular/router";

@Component({
  selector: 'app-timetable-page-component',
  standalone: true,
  imports: [
    MatMenuModule,
    MatToolbarModule,
    MatIconModule,
    StopBoardComponent,
    DashboardTripsComponent,
    BusBoardComponent,
    RouteTimelineComponent,
    MatIcon,
    DashboardStopsComponent,
    RunTabsComponent,
    MatAnchor,
    ClockComponent,
    A11yModule,
    MatIconButton,
    RouterLink
],
  templateUrl: './timetable-page-component.html',
  styleUrl: './timetable-page-component.scss',
})
export class TimetablePageComponent implements OnInit, OnDestroy {
  linesWithTrips: LineWithTrips[] = [];
  linesWithStops: LineWithStops[] = [];
  currentTripPosition: TripPosition | null = null;
  positionsByScenarioId: Record<number, TripPosition | null> = {};
  currentStopId: number | null = null;
  stopLinesByStopId: Record<number, number[]> = {};
  selectedStopId: number | null = null;
  stopBoard: StopBoardDto | null = null;
  loadingStopBoard = false;
  isScenarioLive = false;
  stopBoardError: string | null = null;
  lastStopBoardRefresh: string | null = null;
  scenarioRuns: ScenarioRunDto[] = [];
  selectedScenarioId: number | null = null;
  delaysByScenarioId: Record<number, Record<number, number>> = {};
  readonly dialog = inject(MatDialog);

  @ViewChild(RouteTimelineComponent) private routeTimeline?: RouteTimelineComponent;
  @ViewChild(BusBoardComponent) private busBoard?: BusBoardComponent;

  private currentTripId: number | null = null;
  private currentRunId: number | null = null;
  currentLineNumber: number | null = null;

  private scheduleModeEnabled = true;
  private liveModeEnabled = false;
  private nextScenarioId = 1;
  private simMinutes = 0;
  displayTime: string = '00:00';
  private pollingSub?: Subscription;
  private scenarioSub?: Subscription;

  constructor(private dataService: DataService) {}

  showTripsPanel = false;
  showStopsPanel = false;

  toggleTripsPanel() {
    const open = !this.showTripsPanel;
    this.showTripsPanel = open;
    if (open) this.showStopsPanel = false;
  }

  toggleStopsPanel() {
    const open = !this.showStopsPanel;
    this.showStopsPanel = open;
    if (open) this.showTripsPanel = false;
  }

  private loadStopLinesForTrip(tripId: number): void {
    this.stopLinesByStopId = {}; // reset

    this.dataService.getTripStopLines(tripId).subscribe({
      next: (response) => {
        const map: Record<number, number[]> = {};
        for (const item of response.stopLines) {
          map[item.stopId] = item.lineNumbers;
        }
        this.stopLinesByStopId = map;
        this.currentLineNumber = response.lineNumber;
        // console.log('Stop lines map:', this.stopLinesByStopId);
      },
      error: (err) => {
        console.error('Errore caricando le linee per fermata:', err);
        this.stopLinesByStopId = {};
      },
    });
  }

  ngOnInit(): void {
    //lookup lines with trips
    this.dataService.getLinesWithTrips().subscribe({
      next: (lines) => {
        this.linesWithTrips = lines;
        console.log('Lines with trips loaded', lines);
      },
      error: (err) => {
        console.error('Errore nel caricamento linesWithTrips', err);
      },
    });

    //lookup lines with stops
    this.dataService.getLinesWithStops().subscribe({
      next: (lines) => {
        this.linesWithStops = lines;
        console.log('Lines with stops loaded', lines);
      },
      error: (err) => {
        console.error('Errore nel caricamento linesWithStops', err);
      },
    });
  }

  //  openDialog(enterAnimationDuration: string, exitAnimationDuration: string): void {
  //   this.dialog.open(LeafletMap, {
  //     width: '400px',
  //     enterAnimationDuration,
  //     exitAnimationDuration,
  //   });
  // }

  openDialog(): void {
    // Carica i due GeoJSON in parallelo
    forkJoin({
      stopsGeoJson: this.dataService.getStopsGeoJson(),
      linesGeoJson: this.dataService.getLinesGeoJson(),
    }).subscribe({
      next: (results) => {
        // Apri la dialog solo quando entrambi i dati sono arrivati
        this.dialog.open(LeafletMap, {
          width: '90vw',
          maxWidth: '1200px',
          data: {
            stopsGeoJson: results.stopsGeoJson,
            linesGeoJson: results.linesGeoJson,
          },
        });
      },
      error: (err) => {
        console.error('Errore nel caricamento GeoJSON per la mappa:', err);

        alert('Impossibile caricare i dati della mappa. Controlla la console per i dettagli.');
      },
    });
  }

  ngOnDestroy(): void {
    this.stopSimulation();
  }

  onScenarioRemoved(scenarioId: number): void {
  // UX: se live, non rimuovere (comunque in tabs è disabilitato)
  if (this.isScenarioLive) return;

  const idx = this.scenarioRuns.findIndex(r => r.scenarioId === scenarioId);
  if (idx < 0) return;

  const wasSelected = this.selectedScenarioId === scenarioId;

  // rimuovo run
  this.scenarioRuns = this.scenarioRuns.filter(r => r.scenarioId !== scenarioId);

  // pulisco cache
  delete this.positionsByScenarioId[scenarioId];
  delete this.delaysByScenarioId[scenarioId];

  // selezione intelligente se ho tolto quella attiva
  if (wasSelected) {
    const fallback = this.scenarioRuns[idx] ?? this.scenarioRuns[idx - 1] ?? null;
    this.selectedScenarioId = fallback?.scenarioId ?? null;
    this.currentTripPosition = this.selectedScenarioId
      ? (this.positionsByScenarioId[this.selectedScenarioId] ?? null)
      : null;
  }
}

  onTripSelected(options: TripSimulationOptions): void {
    this.startSimulation(options);
  }

  onScenarioSelected(scenarioId: number): void {
    this.selectedScenarioId = scenarioId;
  }

  onAddToScenario(options: TripSimulationOptions): void {
    console.log('AddToScenario ricevuto:', options);
    let targetLine: LineWithTrips | undefined;
    let targetTrip: TripSummary | undefined;

    for (const line of this.linesWithTrips) {
      const trip = line.trips.find((t) => t.id === options.tripId);
      if (trip) {
        targetLine = line;
        targetTrip = trip;
        break;
      }
    }

    if (!targetLine || !targetTrip) {
      console.warn("Linea o viaggio non trovati per l'aggiunta allo scenario.");
      return;
    }

    const scenarioId = this.nextScenarioId++;
    const newRun: ScenarioRunDto = {
      scenarioId,

      tripId: options.tripId,
      lineLabel: targetLine.lineLabel,
      startTime: targetTrip.startTime,
      scheduleEnabled: options.scheduleEnabled,
      maxDelayMinutes: options.maxDelayMinutes,
      vehicleId: 1, // placeholder
      status: 'pending',
      liveEnabled: options.liveEnabled,
      // runId: undefined
    };
    this.scenarioRuns = [...this.scenarioRuns, newRun];
    this.selectedScenarioId = scenarioId;
    console.log('ScenarioRuns ora è:', this.scenarioRuns);
  }

  onGoLiveClick($event: Event): void {
    if (!this.scenarioRuns.length) {
      console.warn('Nessun run nello scenario da portare in live.');
      return;
    }

    const firstRun = this.scenarioRuns[0];
    const [hh, mm] = firstRun.startTime.split(':').map(Number);
    const firstRunMinutes = hh * 60 + mm;

    const simStartMinutes = Math.max(0, firstRunMinutes - 1); // parto 1 minuti prima del primo run

    this.simMinutes = simStartMinutes;
    this.isScenarioLive = true;

    for (const run of this.scenarioRuns) {
      if (run.liveEnabled) {
        run.status = 'pending';

        this.dataService.createTripRun(run.tripId, run.vehicleId, run.maxDelayMinutes).subscribe({
          next: (tripRun) => {
            run.runId = tripRun.id;
            run.status = 'live';
          },
          error: (err) => {
            console.error('Errore creando TripRun per scenario:', err);
            run.status = 'error';
          },
        });
      } else if (run.scheduleEnabled) {
        run.status = 'live';
      } else {
        run.status = 'pending';
      }
    }
    if (this.scenarioSub) {
      this.scenarioSub.unsubscribe();
      this.scenarioSub = undefined;
    }

    this.scenarioSub = interval(2000)
      .pipe(
        switchMap(() => {
          const currentTime = this.formatMinutes(this.simMinutes);
          this.displayTime = currentTime;  //variabile intercettata x orologio
          this.simMinutes += 1;

          if (this.selectedStopId != null) {
            this.loadStopBoard(currentTime);
          }

          const calls: Observable<{ scenarioId: number; position: TripPosition | null }>[] = [];

          for (const run of this.scenarioRuns) {
            // run ancora "live"
            if (run.scheduleEnabled && !run.liveEnabled && run.status === 'live') {
              const obs = this.dataService.getTripPosition(run.tripId, currentTime).pipe(
                map((position) => {
                  // backend dice che il viaggio è finito, marchiamo la run come finished
                  if (position && (position as any).isFinished && run.status === 'live') {
                    run.status = 'finished';
                    this.dataService.stopTripRun(run.runId!).subscribe({
                      next: () => console.log(`Run ${run.runId} chiusa (isFinished=true)`),
                      error: (err) =>
                        console.error(`Errore chiudendo run ${run.runId} (isFinished=true)`, err),
                    });
                  }

                  return { scenarioId: run.scenarioId, position };
                }),
                catchError((err) => {
                  //  404 anche qui, come fine corsa
                  if (err.status === 404) {
                    console.warn(
                      `[scenario/schedule] Trip ${run.tripId} 404 a ${currentTime} → finito`
                    );

                    if (run.status === 'live') {
                      run.status = 'finished';

                      //  chiude la run anche in caso di 404 (risultato null)
                      this.dataService.stopTripRun(run.runId!).subscribe({
                        next: () => console.log(`Run ${run.runId} chiusa (404)`),
                        error: (stopErr) =>
                          console.error(`Errore chiudendo run ${run.runId} dopo 404`, stopErr),
                      });
                    }
                    const last = this.positionsByScenarioId[run.scenarioId] ?? null;
                    // ultima posizione nota → il bus rimane fermo
                    return of({ scenarioId: run.scenarioId, position: last });
                  }
                  return throwError(() => err);
                })
              );
              calls.push(obs);
            }

            if (run.liveEnabled && run.runId != null && run.status === 'live') {
              const obs = this.dataService.getRunPosition(run.runId, currentTime).pipe(
                map((position) => {
                  // LIVE:
                  // - se il backend manda isFinished = true → run finita
                  if (position && (position as any).isFinished) {
                    run.status = 'finished';
                  }
                  return { scenarioId: run.scenarioId, position };
                }),
                catchError((err) => {
                  if (err.status === 404) {
                    console.warn(`[scenario/live] Run ${run.runId} 404 a ${currentTime} → finita`);
                    run.status = 'finished';
                    const last = this.positionsByScenarioId[run.scenarioId] ?? null;
                    // ultima posizione nota → il bus resta fermo al capolinea
                    return of({ scenarioId: run.scenarioId, position: last });
                  }
                  return throwError(() => err);
                })
              );
              calls.push(obs);
            }
          }

          if (!calls.length) {
            console.log('Tutte le run scenario sono finite → niente più polling, UI congelata.');

            return of([] as { scenarioId: number; position: TripPosition | null }[]);
          }

          return forkJoin(calls);
        })
      )
      .subscribe({
        next: (results) => {
          for (const item of results) {
            // 1) salvo posizione per scenario
            this.positionsByScenarioId[item.scenarioId] = item.position;

            // 2) se la posizione è valida e siamo in fermata con delay, registro delay storico per QUELLA run
            const pos = item.position;
            if (
              pos &&
              pos.isAtStop &&
              pos.currentSequence != null &&
              pos.liveDelayMinutes != null
            ) {
              if (!this.delaysByScenarioId[item.scenarioId]) {
                this.delaysByScenarioId[item.scenarioId] = {};
              }

              this.delaysByScenarioId[item.scenarioId][pos.currentSequence] = pos.liveDelayMinutes;
            }
          }

          if (this.selectedScenarioId != null) {
            this.currentTripPosition = this.positionsByScenarioId[this.selectedScenarioId] ?? null;
          }
        },
        error: (err) => {
          console.error('Errore durante simulazione scenario:', err);
        },
      });
  }

  onStopRequested(): void {
    console.log('Stop requested received in parent');
    this.stopSimulation();
  }

  private startSimulation(options: TripSimulationOptions): void {
    this.stopSimulation(); // stop eventuale precedente
    this.delaysByScenarioId = {};
    this.positionsByScenarioId = {};

    this.onStopSelectionCleared();

    this.currentTripId = options.tripId;
    this.scheduleModeEnabled = options.scheduleEnabled;
    this.liveModeEnabled = options.liveEnabled;
    const delay = options.maxDelayMinutes ?? 0;

    this.loadStopLinesForTrip(options.tripId);

    const startMinutes = this.getTripStartMinutes(options.tripId);
    this.simMinutes = startMinutes;
    this.currentTripPosition = null;
    this.currentRunId = null;

    if (!this.scheduleModeEnabled && !this.liveModeEnabled) {
      console.warn('Nessuna modalità attiva (schedule/live). Simulazione non avviata.');
      return;
    }

    // Se è attivo il live, PRIORITÀ al live
    if (this.liveModeEnabled) {
      const vehicleId = 1; // per ora fisso

      this.dataService.createTripRun(options.tripId, vehicleId, delay).subscribe({
        next: (run) => {
          this.currentRunId = run.id;

          this.pollingSub = interval(2000)
            .pipe(
              switchMap(() => {
                const currentTime = this.formatMinutes(this.simMinutes);
                this.simMinutes += 1;

                // 👉 aggiorno anche la palina se c'è una fermata selezionata
                if (this.selectedStopId != null) {
                  this.loadStopBoard(currentTime);
                }

                return this.dataService.getRunPosition(run.id, currentTime);
              })
            )
            .subscribe({
              next: (position) => {
                this.currentTripPosition = position;

                if (position.isFinished) {
                  this.stopSimulation();
                }
              },
              error: (err) => {
                console.error('Errore durante simulazione (live):', err);
                this.stopSimulation();
              },
            });
        },
        error: (err) => {
          console.error('Errore durante creazione TripRun:', err);
        },
      });

      return;
    }

    // Altrimenti modalità SCHEDULE sola
    if (this.scheduleModeEnabled) {
      this.pollingSub = interval(2000)
        .pipe(
          switchMap(() => {
            const currentTime = this.formatMinutes(this.simMinutes);
            this.simMinutes += 1;

            if (this.selectedStopId != null) {
              this.loadStopBoard(currentTime);
            }

            return this.dataService.getTripPosition(options.tripId, currentTime);
          })
        )
        .subscribe({
          next: (position) => {
            this.currentTripPosition = position;

            if (position.isFinished) {
              this.stopSimulation();
            }
          },
          error: (err) => {
            console.error('Errore durante simulazione (schedule):', err);
            this.stopSimulation();
          },
        });
    }
  }

  get activeDelayMap(): Record<number, number> {
    if (this.selectedScenarioId == null) return {};
    return this.delaysByScenarioId[this.selectedScenarioId] ?? {};
  }

  private getTripStartMinutes(tripId: number): number {
    let summary: TripSummary | undefined;

    for (const line of this.linesWithTrips) {
      summary = line.trips.find((t) => t.id === tripId);
      if (summary) break;
    }

    if (!summary) {
      return 9 * 60;
    }

    const [hh, mm] = summary.startTime.split(':').map(Number);
    return hh * 60 + mm;
  }

  private formatMinutes(total: number): string {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  onStopSelected(stopId: number): void {
    this.selectedStopId = stopId;
    this.loadStopBoard(undefined, true);
  }

  onStopSelectionCleared(): void {
    this.selectedStopId = null;
    this.stopBoard = null;
    this.stopBoardError = null;
  }

  onTimelineStopClicked(stopId: number): void {
    this.onStopSelected(stopId);
  }

  onRefreshStopBoard(): void {
    this.loadStopBoard();
  }

  get currentTimeString(): string {
    return this.formatMinutes(this.simMinutes);
  }

  private loadStopBoard(currentTimeOverride?: string, showSpinner: boolean = false): void {
    if (this.selectedStopId == null) {
      this.stopBoard = null;
      this.stopBoardError = null;
      this.loadingStopBoard = false;
      return;
    }

    const currentTime = currentTimeOverride ?? this.currentTimeString;

    if (showSpinner) {
      this.loadingStopBoard = true;
    }

    this.stopBoardError = null;

    this.dataService.getStopBoard(this.selectedStopId!, currentTime).subscribe({
      next: (dto) => {
        this.stopBoard = dto;
        this.lastStopBoardRefresh = currentTime;
        this.loadingStopBoard = false;
      },
      error: (err) => {
        console.error('Errore palina', err);
        this.stopBoardError = 'Impossibile aggiornare la palina.';
        this.loadingStopBoard = false;
      },
    });
  }

  resetScenario(): void {
  console.warn('RESET scenario');

  // 1️ stop polling scenario
  if (this.scenarioSub) {
    this.scenarioSub.unsubscribe();
    this.scenarioSub = undefined;
  }

  // 2️ chiudi eventuali run live sul backend
  for (const run of this.scenarioRuns) {
    if (run.runId != null) {
      this.dataService.stopTripRun(run.runId).subscribe({
        next: () => console.log(`Run ${run.runId} stoppata`),
        error: err => console.error(`Errore stop run ${run.runId}`, err),
      });
    }
  }

  // 3️ reset stato scenario
  this.scenarioRuns = [];
  this.selectedScenarioId = null;
  this.positionsByScenarioId = {};
  this.delaysByScenarioId = {};
  this.isScenarioLive = false;
  this.nextScenarioId = 1;
  this.displayTime = '00:00';

  // 4️ reset clock e posizione
  this.simMinutes = 0;
  this.currentTripPosition = null;

  // 5️ reset UI
  // this.routeTimeline?.resetSimulationState();
  this.busBoard?.resetSimulationState();

  // 6️ reset stop board
  this.selectedStopId = null;
  this.stopBoard = null;
  this.stopBoardError = null;

  console.log('Scenario riportato allo stato iniziale');
}

  private stopSimulation() {
    // --- stop mono-run polling
    if (this.pollingSub) {
      this.pollingSub.unsubscribe();
      this.pollingSub = undefined;
    }

    // --- stop multirun polling
    if (this.scenarioSub) {
      this.scenarioSub.unsubscribe();
      this.scenarioSub = undefined;
    }

    this.isScenarioLive = false;

    // --- stop eventuale run mono-run

    this.currentRunId = null;

    // --- stop tutte le run LIVE create dallo scenario
    for (const run of this.scenarioRuns) {
      if (run.runId != null && run.status === 'live') {
        this.dataService.stopTripRun(run.runId).subscribe({
          next: () => console.log(`Run ${run.runId} stoppata (scenario)`),
          error: (err) => console.error(`Errore stop run ${run.runId} (scenario)`, err),
        });
        run.status = 'stopped';
      }
    }
  }
  
}
