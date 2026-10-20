/*
 * Units of a presentation. A Slidr slide is 1920x1080 pixels; a PowerPoint 16:9 slide is 13.333
 * by 7.5 inches, 12192000 by 6858000 EMU. So a pixel is 6350 EMU and half a point, and a 30px
 * text is 15pt (`sz="1500"`).
 */

/** English Metric Units in a slide pixel, on the slide PowerPoint makes for 16:9. */
export const EMU_PER_PX = 6350;
/** EMU in a point. */
export const EMU_PER_PT = 12700;
export const SLIDE_EMU = { cx: 1920 * EMU_PER_PX, cy: 1080 * EMU_PER_PX } as const;

/** Whole EMU for slide pixels: positions and sizes in DrawingML are integers. */
export const emu = (px: number): number => Math.round(px * EMU_PER_PX);

/** Hundredths of a point, for a size in slide pixels: font sizes, letter spacing. */
export const centipoints = (px: number): number => Math.round((px * EMU_PER_PX * 100) / EMU_PER_PT);

/** DrawingML angles are in 60000ths of a degree. */
export const angle = (degrees: number): number => Math.round(degrees * 60000);

/** DrawingML percentages are in 1000ths of a percent: 100000 is the whole. */
export const percent = (fraction: number): number => Math.round(fraction * 100000);

/** Rounds for the model: to a hundredth of a pixel. */
export const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Normalises an angle in degrees to [0, 360). */
export function normalizeDegrees(degrees: number): number {
  const d = degrees % 360;
  return d < 0 ? d + 360 : d;
}

/**
 * How a slide of another size is laid on Slidr's: scaled to fit and centred. A 4:3 slide comes in
 * at full height with a margin on each side. `scale` is slide pixels per EMU.
 */
export interface Placement {
  scale: number;
  dx: number;
  dy: number;
}

export function placementFor(cx: number, cy: number): Placement {
  const width = cx > 0 ? cx : SLIDE_EMU.cx;
  const height = cy > 0 ? cy : SLIDE_EMU.cy;
  const scale = Math.min(1920 / width, 1080 / height);
  return { scale, dx: (1920 - width * scale) / 2, dy: (1080 - height * scale) / 2 };
}
