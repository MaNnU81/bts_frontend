import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RunTabsComponent } from './run-tabs-component';

describe('RunTabsComponent', () => {
  let component: RunTabsComponent;
  let fixture: ComponentFixture<RunTabsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RunTabsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RunTabsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
