import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TripSimulator } from './trip-simulator';

describe('TripSimulator', () => {
  let component: TripSimulator;
  let fixture: ComponentFixture<TripSimulator>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TripSimulator]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TripSimulator);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
