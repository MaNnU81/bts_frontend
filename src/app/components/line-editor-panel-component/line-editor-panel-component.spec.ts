import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LineEditorPanelComponent } from './line-editor-panel-component';

describe('LineEditorPanelComponent', () => {
  let component: LineEditorPanelComponent;
  let fixture: ComponentFixture<LineEditorPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LineEditorPanelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LineEditorPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
