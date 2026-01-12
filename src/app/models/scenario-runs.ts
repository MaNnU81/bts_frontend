export interface ScenarioRunDto {
  scenarioId: number;
  tripId: number;
  lineLabel: string;
  scheduleEnabled: boolean;
  liveEnabled: boolean;
  maxDelayMinutes: number;
  startTime: string;
  vehicleId: number;
  runId?: number;
  status: 'pending' | 'live' | 'finished' | 'stopped' | 'error';
}