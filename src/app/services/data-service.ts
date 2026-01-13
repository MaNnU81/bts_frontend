import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { interval, Observable, switchMap } from 'rxjs';
import { TripPosition } from '../models/trip-position';
import { environment } from '../environments/environment';
import { LineWithTrips } from '../models/line-with-trips';
import { LineWithStops } from '../models/line-with-stops';
import { TripRun } from '../models/trip-run';
import { TripStopLinesResponse } from '../models/trip-stop-lines';
import { StopBoardDto } from '../models/stop-board';
import { StopBatchRequestDto, StopBatchResponseDto } from '../models/stop-batch-dto';

@Injectable({
  providedIn: 'root',
})
export class DataService {
  private readonly baseUrl = `${environment.apiUrl}/api`;

  private http = inject(HttpClient);

  createTripRun(tripId: number, vehicleId: number, maxDelayMinutes: number): Observable<TripRun> {
    const url = `${this.baseUrl}/trips/${tripId}/runs`;
    const body = { vehicleId, maxDelayMinutes };
    return this.http.post<TripRun>(url, body);
  }

  getRunPosition(runId: number, currentTime: string): Observable<TripPosition> {
    const url = `${this.baseUrl}/trips/runs/${runId}/position`;
    const params = { currentTime };
    return this.http.get<TripPosition>(url, { params });
  }

  getTripPosition(tripId: number, currentTime: string): Observable<TripPosition> {
    const url = `${this.baseUrl}/trips/${tripId}/position`;
    const params = { currentTime };
    return this.http.get<TripPosition>(url, { params });
  }

  getTripStopLines(tripId: number): Observable<TripStopLinesResponse> {
    const url = `${this.baseUrl}/trips/${tripId}/stops/lines`;
    return this.http.get<TripStopLinesResponse>(url);
  }

  pollTripPosition(
    tripId: number,
    currentTime: string,
    refreshrate: number = 2000
  ): Observable<TripPosition> {
    return interval(refreshrate).pipe(switchMap(() => this.getTripPosition(tripId, currentTime)));
  }

  getLinesWithTrips(): Observable<LineWithTrips[]> {
    const url = `${this.baseUrl}/lookup/lines-with-trips`;
    return this.http.get<LineWithTrips[]>(url);
  }

  getLinesWithStops(): Observable<LineWithStops[]> {
    const url = `${this.baseUrl}/lookup/lines-with-stops`;
    return this.http.get<LineWithStops[]>(url);
  }

  getStopBoard(stopId: number, currentTime: string): Observable<StopBoardDto> {
    const url = `${this.baseUrl}/StopBoard/${stopId}`;
    const params = { currentTime };
    return this.http.get<StopBoardDto>(url, { params });
  }

  stopTripRun(runId: number): Observable<void> {
    const url = `${this.baseUrl}/trips/runs/${runId}/stop`;
    return this.http.post<void>(url, {});
  }

  getStopsGeoJson(): Observable<any> {
    // return this.http.get<any>('/geo/stops.geojson');
    const url = `${this.baseUrl}/geo/stops`;
    return this.http.get<any>(url);
  }

  getLinesGeoJson(): Observable<any> {
    // return this.http.get<any>('/geo/lines.geojson');
    const url = `${this.baseUrl}/geo/lines`;
    return this.http.get<any>(url);
  }

  applyStopBatch(request: StopBatchRequestDto) {
    const url = `${this.baseUrl}/batch/stops`;
    return this.http.post<StopBatchResponseDto>(url, request);
  }
  
}
