import { TripSummary } from "./trip-summary";

export interface LineWithTrips {
    lineId: number;
    lineLabel: string;
    trips: TripSummary[];
}