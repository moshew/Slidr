import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Download, type Page } from '@playwright/test';
import { openApp, pageProblems } from './objects-helpers';
import {
  addClip,
  mediaState,
  openWithMedia,
  testMedia,
  watchMedia,
  type TestMedia,
} from './video-helpers';

/*
 * Exporting a deck that has video and audio (MED-05, EXP-08): the size is said before the export
 * with a warning when it is large, the media goes inside the file or into a folder beside it, and
 * the report lists it.
 *
 * In this plain browser there is no folder to write to: the file is a download, and with the
 * media beside the file each media file is a download of its own. In the app Rust copies them
 * (`export_copy_media`), which its own tests and the real window check.
 */

const shot = (name: string) =>
  fileURLToPath(new URL(`../test-results/objects/${name}.png`, import.meta.url));

async function openDialog(page: Page, label = 'ייצוא') {
  await page.getByTestId('top-tools-a').getByRole('button', { name: label, exact: true }).click();
  const dialog = page.getByTestId('export-dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

/** A video and a sound on the first slide. */
async function withClips(page: Page, media: TestMedia) {
  const video = await addClip(page, 'video', media.video, {
    trim: { startMs: 500, endMs: 1000 },
    loop: true,
    autoplay: true,
    muted: true,
  });
  const sound = await addClip(page, 'audio', media.sound);
  return { video, sound };
}

/** Runs the export of the open dialog and collects what the browser downloaded, by file name. */
async function exported(page: Page, count: number): Promise<Map<string, string>> {
  const downloads: Download[] = [];
  const collect = (download: Download) => downloads.push(download);
  page.on('download', collect);
  await page.getByTestId('export-run').click();
  await expect.poll(() => downloads.length, { timeout: 20_000 }).toBe(count);
  await expect(page.getByTestId('export-dialog')).toHaveAttribute('data-phase', 'done');
  page.off('download', collect);
  const files = new Map<string, string>();
  for (const download of downloads) {
    // Under its own name: a browser opens a page only from a file whose name ends in .html.
    const path = test.info().outputPath('downloads', download.suggestedFilename());
    await download.saveAs(path);
    files.set(download.suggestedFilename(), path);
  }
  return files;
}

/** A size as the dialog writes it, read back as a number of bytes, roughly. */
const kB = (bytes: number) => `${Math.round(bytes / 1000)} kB`;

test('a deck without video or audio is not asked where its media goes', async ({ page }) => {
  await openApp(page);
  const dialog = await openDialog(page);
  await expect(dialog.getByRole('radiogroup', { name: 'אנימציות ומעברים' })).toBeVisible();
  await expect(dialog.getByRole('radiogroup', { name: 'וידאו ואודיו' })).toHaveCount(0);
  await expect(page.getByTestId('export-media')).toHaveCount(0);
});

test('media goes into the file by default: the size is said first, and the report lists it', async ({
  page,
  context,
}) => {
  const media = await openWithMedia(page);
  const { video, sound } = await withClips(page, media);
  const dialog = await openDialog(page);

  const where = dialog.getByRole('radiogroup', { name: 'וידאו ואודיו' });
  await expect(where.getByRole('radio', { name: 'בתוך הקובץ' })).toBeChecked();
  // What the two files add to the file, said before the export: four characters for three bytes.
  const inFile = Math.ceil((media.video.length + media.sound.length) / 3) * 4;
  const hint = page.getByTestId('export-media');
  await expect(hint).toContainText('2 קובצי מדיה');
  await expect(hint).toContainText(kB(inFile));
  await expect(hint).toHaveAttribute('data-warning', 'false');

  const files = await exported(page, 1);
  const [name] = Array.from(files.keys());
  const html = readFileSync(files.get(name!)!, 'utf8');
  expect(html).toContain('data:video/webm;base64,');
  expect(html).toContain('data:audio/wav;base64,');
  expect(html).not.toContain('_media/');
  // The file weighs what was said, and what its slides and its player weigh.
  expect(html.length).toBeGreaterThan(inFile);

  // The report lists the media among what is in the file, each as large as it is.
  const assets = page.getByTestId('export-assets');
  await expect(assets).toContainText('clip.webm');
  await expect(assets).toContainText('tone.wav');
  await expect(assets).toContainText(kB(video.bytes));
  await expect(assets).toContainText(kB(sound.bytes));
  await expect(page.getByTestId('export-media-folder')).toHaveCount(0);
  await expect(page.getByTestId('export-warnings')).toHaveCount(0);

  // The file plays from the disk, alone.
  const opened = await context.newPage();
  const outside: string[] = [];
  opened.on('request', (request) => {
    if (!/^(file|data|blob|about):/.test(request.url())) outside.push(request.url());
  });
  await opened.goto(pathToFileURL(files.get(name!)!).href);
  await opened.waitForFunction(() => (window as { slidr?: unknown }).slidr !== undefined);
  const round = await watchMedia(opened, 'video', 1300);
  expect(round.paused).toBe(false);
  expect(round.min).toBeGreaterThanOrEqual(0.5 - 0.001);
  expect(round.max).toBeLessThanOrEqual(1.08);
  expect(outside).toEqual([]);
  expect(pageProblems(page)).toEqual([]);
});

test('media goes into a folder beside the file: the file refers to it, and plays with it', async ({
  page,
  context,
}) => {
  const media = await openWithMedia(page);
  const { video, sound } = await withClips(page, media);
  const dialog = await openDialog(page);
  await dialog.getByRole('radio', { name: 'בתיקייה ליד הקובץ' }).click();
  const hint = page.getByTestId('export-media');
  await expect(hint).toContainText('2 קובצי מדיה');
  // Beside the file the media weighs what its files weigh.
  await expect(hint).toContainText(kB(media.video.length + media.sound.length));
  await expect(hint).toContainText('התיקייה צריכה לעבור יחד עם הקובץ');

  // The file, and each media file as a download of its own.
  const files = await exported(page, 3);
  const htmlName = Array.from(files.keys()).find((name) => name.endsWith('.html'))!;
  const folder = `${htmlName.replace(/\.html$/, '')}_media`;
  const html = readFileSync(files.get(htmlName)!, 'utf8');
  expect(Array.from(files.keys()).sort()).toEqual([htmlName, video.file, sound.file].sort());
  expect(readFileSync(files.get(video.file)!).equals(media.video)).toBe(true);
  expect(readFileSync(files.get(sound.file)!).equals(media.sound)).toBe(true);

  // No media in the file: it points into the folder, by an address relative to itself.
  expect(html).not.toContain('data:video/');
  expect(html).not.toContain('data:audio/');
  expect(html).not.toContain('blob:');
  expect(html).toContain(`src="${encodeURIComponent(folder)}/${video.file}"`);
  expect(html).toContain(`src="${encodeURIComponent(folder)}/${sound.file}"`);

  // The report names the folder and lists what belongs in it.
  await expect(page.getByTestId('export-media-folder')).toContainText(folder);
  const listed = page.getByTestId('export-media-files');
  await expect(listed.getByRole('listitem')).toHaveCount(2);
  await expect(listed).toContainText('clip.webm');
  await expect(listed).toContainText(kB(video.bytes));
  await expect(listed).toContainText('tone.wav');
  // What is in the file itself no longer includes them.
  await expect(page.getByTestId('export-report')).toContainText('אין בקובץ תמונות או מדיה.');
  await page.screenshot({ path: shot('media-export-report-beside-light-he') });

  // Laid out as the report says, the file plays from the disk.
  const dir = test.info().outputPath('site');
  mkdirSync(join(dir, folder), { recursive: true });
  writeFileSync(join(dir, htmlName), html);
  writeFileSync(join(dir, folder, video.file), media.video);
  writeFileSync(join(dir, folder, sound.file), media.sound);
  const opened = await context.newPage();
  const outside: string[] = [];
  opened.on('request', (request) => {
    if (!/^(file|data|blob|about):/.test(request.url())) outside.push(request.url());
  });
  await opened.goto(pathToFileURL(join(dir, htmlName)).href);
  await opened.waitForFunction(() => (window as { slidr?: unknown }).slidr !== undefined);
  await expect
    .poll(async () => (await mediaState(opened, 'video')).ready)
    .toBeGreaterThanOrEqual(2);
  const round = await watchMedia(opened, 'video', 1300);
  expect(round.paused).toBe(false);
  expect(round.min).toBeGreaterThanOrEqual(0.5 - 0.001);
  expect(round.max).toBeLessThanOrEqual(1.08);
  expect((await mediaState(opened, 'audio')).duration).toBeGreaterThan(1);
  expect(outside).toEqual([]);

  // The same file without its folder still opens: its slides are there, its media is not.
  const alone = test.info().outputPath('alone.html');
  writeFileSync(alone, html);
  await opened.goto(pathToFileURL(alone).href);
  await opened.waitForFunction(() => (window as { slidr?: unknown }).slidr !== undefined);
  expect((await mediaState(opened, 'video')).ready).toBe(0);

  // How much the choice saves, for the record.
  test.info().annotations.push({
    type: 'sizes',
    description: `beside: ${html.length} B of HTML + ${media.video.length + media.sound.length} B of media`,
  });
  expect(pageProblems(page)).toEqual([]);
});

test('only the media of the slides that are exported counts', async ({ page }) => {
  const media = await openWithMedia(page);
  await addClip(page, 'audio', media.sound);
  // A second slide with the video; the range leaves it out.
  await page.evaluate(() => {
    const editor = window.slidr!;
    const first = editor.bus.deck.slides[0]!;
    editor.bus.dispatch({
      type: 'slide.add',
      slide: { ...first, id: 's_second', elements: [] },
    } as never);
    editor.selection.getState().setCurrentSlide('s_second');
  });
  await addClip(page, 'video', media.video);
  const dialog = await openDialog(page);
  await expect(page.getByTestId('export-media')).toContainText('2 קובצי מדיה');
  await dialog.getByRole('radio', { name: 'טווח' }).click();
  await dialog.getByRole('textbox', { name: 'עד שקף' }).fill('1');
  await dialog.getByRole('textbox', { name: 'עד שקף' }).press('Enter');
  await expect(page.getByTestId('export-count')).toHaveText('ייוצא שקף אחד.');
  await expect(page.getByTestId('export-media')).toContainText('קובץ מדיה אחד');
});

/** Makes the deck's video claim a size, as a real recording of that size would. */
const claim = (page: Page, bytes: number) =>
  page.evaluate((size) => {
    const editor = window.slidr!;
    const deck = editor.bus.deck;
    const assets = Object.fromEntries(
      Object.values(deck.assets).map((a) => [a.id, a.kind === 'video' ? { ...a, bytes: size } : a]),
    );
    editor.bus.reset({ ...deck, assets });
  }, bytes);

test('large media is warned about, and media too large for one file can only go beside it', async ({
  page,
}) => {
  const media = await openWithMedia(page);
  await addClip(page, 'video', media.video);

  // 60 MB of video is 80 MB in the file: more than is easy to send.
  await claim(page, 60_000_000);
  let dialog = await openDialog(page);
  const hint = page.getByTestId('export-media');
  await expect(hint).toHaveAttribute('data-warning', 'true');
  await expect(hint).toHaveAttribute('role', 'status');
  await expect(hint).toContainText('80 MB');
  await expect(hint).toContainText('אפשר לשמור את המדיה בתיקייה ליד הקובץ');
  await expect(dialog.getByRole('radio', { name: 'בתוך הקובץ' })).toBeChecked();
  await page.screenshot({ path: shot('media-export-warning-light-he') });
  // Beside the file there is nothing to warn about.
  await dialog.getByRole('radio', { name: 'בתיקייה ליד הקובץ' }).click();
  await expect(hint).toHaveAttribute('data-warning', 'false');
  await expect(hint).toContainText('60 MB');
  await dialog.getByRole('button', { name: 'ביטול' }).click();

  // 400 MB cannot go into one file at all.
  await claim(page, 400_000_000);
  dialog = await openDialog(page);
  await expect(dialog.getByRole('radio', { name: 'בתוך הקובץ' })).toBeDisabled();
  await expect(dialog.getByRole('radio', { name: 'בתיקייה ליד הקובץ' })).toBeChecked();
  await expect(hint).toHaveAttribute('data-warning', 'true');
  await expect(hint).toContainText('יותר ממה שקובץ אחד יכול להכיל');
  await expect(hint).toContainText('400 MB');
  await page.screenshot({ path: shot('media-export-too-large-light-he') });
  expect(pageProblems(page)).toEqual([]);
});

test('media whose file is not at hand is said to be missing, beside the file too', async ({
  page,
}) => {
  await openApp(page);
  await testMedia(page);
  // A sound the deck has a record of, and no file for.
  await page.evaluate(() => {
    const editor = window.slidr!;
    const id = 'f'.repeat(64);
    editor.bus.batch([
      {
        type: 'asset.add',
        asset: {
          id,
          file: `${id}.mp3`,
          mime: 'audio/mpeg',
          kind: 'audio',
          bytes: 5000,
          origin: 'upload',
          name: 'lost.mp3',
        },
      },
      {
        type: 'element.add',
        slideId: editor.selection.getState().currentSlideId ?? '',
        element: {
          id: 'e_lost',
          type: 'audio',
          assetId: id,
          frame: { x: 100, y: 100, w: 320, h: 80 },
          rotation: 0,
          opacity: 1,
          autoplay: false,
          loop: false,
          volume: 1,
          showControls: true,
        },
      },
    ]);
  });
  const dialog = await openDialog(page);
  await dialog.getByRole('radio', { name: 'בתיקייה ליד הקובץ' }).click();
  await exported(page, 1);
  await expect(page.getByTestId('export-warnings')).toHaveText(
    /^הנכס .lost\.mp3. לא נקרא, והוא חסר בקובץ\.$/,
  );
  await expect(page.getByTestId('export-media-files')).toHaveCount(0);
});

for (const theme of ['light', 'dark'] as const) {
  for (const lang of ['he', 'en'] as const) {
    test(`the media choice of the export dialog, ${theme} ${lang}`, async ({ page }) => {
      await openApp(page, { lang, theme });
      const media = await testMedia(page);
      await withClips(page, media);
      const label = lang === 'he' ? 'ייצוא' : 'Export';
      await openDialog(page, label);
      await page.screenshot({ path: shot(`media-export-choice-${theme}-${lang}`) });
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.screenshot({ path: shot(`media-export-choice-${theme}-${lang}-1366`) });
      expect(pageProblems(page)).toEqual([]);
    });
  }
}
