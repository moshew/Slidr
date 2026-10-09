import { describe, expect, it } from 'vitest';
import { defaultPanelWidth, fitSlide, panelLimits, panelWidth } from './layout';

describe('FHD layout (SPEC 4.1)', () => {
  it('fits the slide in the 1280 × 748 Stage at 1232 × 693', () => {
    const fit = fitSlide(1280, 748);
    expect(fit.width).toBeCloseTo(1232, 6);
    expect(fit.height).toBeCloseTo(693, 6);
  });

  it('gives the Tool Panel 360 at 1920 and 320 at 1366', () => {
    expect(panelWidth(1920, null)).toBe(360);
    expect(panelWidth(1366, null)).toBe(320);
    expect(defaultPanelWidth(1600)).toBeGreaterThan(320);
    expect(defaultPanelWidth(1600)).toBeLessThan(360);
  });

  it('keeps the panel between 280 px and 45% of the window', () => {
    expect(panelLimits(1920)).toEqual({ min: 280, max: 864 });
    expect(panelWidth(1920, 0.1)).toBe(280);
    expect(panelWidth(1920, 0.9)).toBe(864);
    expect(panelWidth(1920, 0.35)).toBe(672);
    expect(panelWidth(3000, null)).toBe(360);
  });

  it('fits by height when the Stage is wide and short', () => {
    const fit = fitSlide(2000, 500);
    expect(fit.height).toBeCloseTo(452, 6);
    expect(fit.width).toBeCloseTo((452 * 16) / 9, 6);
    expect(fitSlide(0, 0).scale).toBe(0);
  });
});
