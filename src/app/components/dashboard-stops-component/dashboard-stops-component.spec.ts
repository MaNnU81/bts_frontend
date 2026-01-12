import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DashboardStopsComponent } from './dashboard-stops-component';

describe('DashboardStopsComponent', () => {
  let component: DashboardStopsComponent;
  let fixture: ComponentFixture<DashboardStopsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardStopsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DashboardStopsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
