import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BusBoardComponent } from './bus-board-component';

describe('BusBoardComponent', () => {
  let component: BusBoardComponent;
  let fixture: ComponentFixture<BusBoardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BusBoardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BusBoardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
