import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LeafletDialogIdComponent } from './leaflet-dialog-id-component';

describe('LeafletDialogIdComponent', () => {
  let component: LeafletDialogIdComponent;
  let fixture: ComponentFixture<LeafletDialogIdComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeafletDialogIdComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LeafletDialogIdComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
