import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HomePage } from './home.page';

describe('HomePage', () => {
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomePage],
    }).compileComponents();

    fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });
});
