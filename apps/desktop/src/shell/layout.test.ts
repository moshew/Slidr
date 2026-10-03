import { describe, expect, it } from 'vitest';
import { defaultPanelWidth, fitSlide, panelLimits, panelWidth } from './layout';

describe('FHD layout (SPEC 4.1)', () => {
  it('fits the slide in the 1280 × 748 Stage at 1232 × 693', () => {
    const fit = fitSlide(1280, 748);
    expect(fit.width).toBeCloseTo(1232, 6);
    expect(fit.height).toBeCloseTo(693, 6);
  });

  it('gives the Tool Panel 584 at 1920 and 420 at 1366', () => {
    expect(panelWidth(1920, null)).toBe(584);
    expect(panelWidth(1366, null)).toBe(420);
    expect(defaultPanelWidth(1600)).toBeGreaterThan(420);
    expect(defaultPanelWidth(1600)).toBeLessThan(584);
  });

  it('keeps the panel between 25% and 45% of the window (UI-01)', () => {
    expect(panelLimits(1920)).toEqual({ min: 480, max: 864 });
    expect(panelWidth(1920, 0.1)).toBe(480);
    expect(panelWidth(1920, 0.9)).toBe(864);
    expect(panelWidth(1920, 0.35)).toBe(672);
    // Wider than FHD the default share would fall under 25%.
    expect(panelWidth(3000, null)).toBe(750);
  });

  it('fits by height when the Stage is wide and short', () => {
    const fit = fitSlide(2000, 500);
    expect(fit.height).toBeCloseTo(452, 6);
    expect(fit.width).toBeCloseTo((452 * 16) / 9, 6);
    expect(fitSlide(0, 0).scale).toBe(0);
  });
});
