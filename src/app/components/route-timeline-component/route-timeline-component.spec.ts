import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RouteTimelineComponent } from './route-timeline-component';

describe('RouteTimelineComponent', () => {
  let component: RouteTimelineComponent;
  let fixture: ComponentFixture<RouteTimelineComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouteTimelineComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RouteTimelineComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
