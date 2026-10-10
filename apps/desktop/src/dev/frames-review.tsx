import '../app.css';
import { createRoot } from 'react-dom/client';
import { createDeck } from '@slidr/model';
import { DrawnFrame } from '../elements/FramesCollection';
import { loadFrames } from '../elements/frames';
import { registerBuiltinFonts } from '../fonts';
import { settle } from '../capture/settle';
const q = new URLSearchParams(location.search);
const lang = q.get('lang') ?? 'he';
const width = Number(q.get('w') ?? 320);
const from = Number(q.get('from') ?? 0);
registerBuiltinFonts();
const frames = await loadFrames();
const theme = createDeck().theme;
(window as any).__count = frames.length;
createRoot(document.getElementById('root')!).render(<div style={{display:'grid',gridTemplateColumns:`repeat(${q.get('cols') ?? 4}, ${width}px)`,gap:12,padding:12}}>{frames.slice(from,from+Number(q.get('count') ?? 24)).map(frame=><div data-frame={frame.id} key={frame.id}><DrawnFrame frame={frame} lang={lang} theme={theme} width={width}/><div style={{font:'12px Arial',height:20}}>{frame.id}</div></div>)}</div>);
await settle();
document.documentElement.dataset.ready = 'true';

