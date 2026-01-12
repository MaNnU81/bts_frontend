import { StopSummary } from './stop-summary';

export interface LineWithStops {
  lineId: number;
  lineLabel: string;   // es. "Brignole → Principe"
  stops: StopSummary[]; // fermate in ordine di sequence
}