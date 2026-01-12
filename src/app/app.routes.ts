import { Routes } from '@angular/router';
import { TripSimulator } from './features/trip-simulator/trip-simulator';
import { TimetablePageComponent } from './components/timetable-page-component/timetable-page-component';
import { LeafletAdd } from './components/leaflet-add/leaflet-add';



export const routes: Routes = [
  { path: '', component: TimetablePageComponent },
  { path: 'trip-simulator', component: TripSimulator },
  {path: 'map-add', component: LeafletAdd },

  
  { path: '**', redirectTo: '' }
];