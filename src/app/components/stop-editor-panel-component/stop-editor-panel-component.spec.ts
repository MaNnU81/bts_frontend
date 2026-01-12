import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StopEditorPanelComponent } from './stop-editor-panel-component';

describe('StopEditorPanelComponent', () => {
  let component: StopEditorPanelComponent;
  let fixture: ComponentFixture<StopEditorPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StopEditorPanelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StopEditorPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
