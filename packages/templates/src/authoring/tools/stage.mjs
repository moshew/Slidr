// Stages an author's copy of the media library as `pnpm media:publish` does, into a folder a
// local server can serve for the dev server (`SLIDR_MEDIA_URL`):
//   node tools/stage.mjs <library> <site>
import { stageLibrary } from '../../../../../desktop/build/media.ts';

const [source, target] = process.argv.slice(2);
const manifest = stageLibrary(source, target);
console.log(`staged ${Object.keys(manifest.files).length} files into ${target}`);
