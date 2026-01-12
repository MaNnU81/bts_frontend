import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StopBoardComponent } from './stop-board-component';

describe('StopBoardComponent', () => {
  let component: StopBoardComponent;
  let fixture: ComponentFixture<StopBoardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StopBoardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StopBoardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
