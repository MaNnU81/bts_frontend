export interface StopBoardDto {
  stopId: number;
  stopName: string;
  currentTime: string;
  rows: StopBoardRowDto[];
}

export interface StopBoardRowDto {
  transportLineId: number;
  lineNumber: number;
  direction: string;
  route: string;
  scheduledDeparture: string;
  predictedDeparture: string;
  liveDelayMinutes: number | null;
  isLive: boolean;
  tripId: number;
  tripRunId: number | null;
}