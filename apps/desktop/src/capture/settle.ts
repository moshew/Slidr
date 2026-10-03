/**
 * Resolves once a rendered slide shows what it will show (RND-05): fonts loaded, images decoded,
 * frames loaded, and text re-measured after the last font. The capture page waits for it before
 * Rust takes the picture; the renderer's dev page waits for it before the visual regression
 * screenshot.
 */
export async function settle(doc: Document = document): Promise<void> {
  // Listen to frames first. A sandboxed frame's document cannot be read, so its `load` event is
  // the only signal, and one that fires while fonts and images are awaited would be missed and
  // cost the whole fallback.
  const frames = Array.from(doc.querySelectorAll('iframe')).map(
    (frame) =>
      new Promise<void>((resolve) => {
        if (frame.contentDocument?.readyState === 'complete') resolve();
        else frame.addEventListener('load', () => resolve(), { once: true });
        setTimeout(resolve, 2000);
      }),
  );
  await doc.fonts.ready;
  await Promise.all(
    images(doc).map((img) => (img.src ? img.decode().catch(() => undefined) : Promise.resolve())),
  );
  await Promise.all(frames);
  // Two frames: text measured after the last font load re-renders once more.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await doc.fonts.ready;
}

/** Every `<img>`, including those inside the open shadow roots of `html` elements (ADR-009). */
function images(root: Document | ShadowRoot): HTMLImageElement[] {
  const found = Array.from(root.querySelectorAll('img'));
  for (const element of Array.from(root.querySelectorAll('*'))) {
    if (element.shadowRoot) found.push(...images(element.shadowRoot));
  }
  return found;
}
