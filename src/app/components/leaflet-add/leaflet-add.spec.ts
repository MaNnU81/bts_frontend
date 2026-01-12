import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LeafletAdd } from './leaflet-add';

describe('LeafletAdd', () => {
  let component: LeafletAdd;
  let fixture: ComponentFixture<LeafletAdd>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeafletAdd]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LeafletAdd);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
