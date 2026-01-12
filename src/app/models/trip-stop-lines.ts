export interface StopLinesItem {
  stopId: number;
  stopName: string;
  lineNumbers: number[];
}

export interface TripStopLinesResponse {
  tripId: number;
  lineNumber: number;
  stopLines: StopLinesItem[];
}