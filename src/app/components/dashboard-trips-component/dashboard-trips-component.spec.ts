import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DashboardTripsComponent } from './dashboard-trips-component';

describe('DashboardComponent', () => {
  let component: DashboardTripsComponent;
  let fixture: ComponentFixture<DashboardTripsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardTripsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DashboardTripsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
