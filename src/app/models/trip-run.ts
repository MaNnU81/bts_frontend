export interface TripRun {  

id: number;
tripId: number;
vehicleId: number;
runStart: string; // "HH:mm"
isActive: boolean;
maxDelayMinutes: number;

}