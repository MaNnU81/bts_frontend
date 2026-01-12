import { TripStopInfo } from './trip-stop-info';

export interface TripPosition {
  tripId: number;

  transportLineId: number;
  lineName: string;
  currentTime: string; // "HH:mm"

  isStarted: boolean;
  isFinished: boolean;
  isAtStop: boolean;

  currentStopId: number | null;
  currentStopName: string | null;
  currentSequence: number | null;

  nextStopId: number | null;
  nextStopName: string | null;
  nextSequence: number | null;

  progressBetweenStops: number; // 0..1
  progressTotal: number;

  stops: TripStopInfo[];
  liveDelayMinutes?: number | null;
}
