import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfirmExitLineEditDialogComponent } from './confirm-exit-line-edit-dialog-component';

describe('ConfirmExitLineEditDialogComponent', () => {
  let component: ConfirmExitLineEditDialogComponent;
  let fixture: ComponentFixture<ConfirmExitLineEditDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmExitLineEditDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConfirmExitLineEditDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
