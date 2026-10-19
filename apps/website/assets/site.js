// Slidr homepage: languages, scroll animations and the clip player. No dependencies.
(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Languages ---------- */
  // The languages of the app (packages/model/src/languages.ts), each with the faces its letters
  // need: a sans for the text and the closest serif for the accent words, as the app's designs do.
  const LANGS = [
    { code: 'en', name: 'English' },
    { code: 'he', name: 'עברית', rtl: true, sans: 'Heebo', serif: 'Frank Ruhl Libre' },
    { code: 'ar', name: 'العربية', rtl: true, sans: 'Noto Sans Arabic', serif: 'Amiri' },
    { code: 'de', name: 'Deutsch' },
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Français' },
    { code: 'it', name: 'Italiano' },
    { code: 'pt-BR', name: 'Português (Brasil)' },
    { code: 'ru', name: 'Русский', sans: 'Inter', serif: 'PT Serif' },
    { code: 'tr', name: 'Türkçe' },
    { code: 'vi', name: 'Tiếng Việt', sans: 'Inter', serif: 'Noto Serif' },
    { code: 'id', name: 'Bahasa Indonesia' },
    { code: 'hi', name: 'हिन्दी', sans: 'Noto Sans Devanagari', serif: 'Noto Serif Devanagari' },
    { code: 'ja', name: '日本語', sans: 'Noto Sans JP', serif: 'Noto Serif JP' },
    { code: 'ko', name: '한국어', sans: 'Noto Sans KR', serif: 'Noto Serif KR' },
    { code: 'zh-CN', name: '中文（简体）', sans: 'Noto Sans SC', serif: 'Noto Serif SC' },
  ];
  const byCode = Object.fromEntries(LANGS.map((l) => [l.code, l]));
  const dict = (window.SLIDR_I18N = window.SLIDR_I18N || {});
  const english = dict.en;

  function loadScript(code) {
    if (dict[code]) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `assets/i18n/${code}.js`;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function setFonts(lang) {
    const link = document.getElementById('font-script');
    if (!lang.sans) {
      link.removeAttribute('href');
      root.style.removeProperty('--script-sans');
      root.style.removeProperty('--script-serif');
      return;
    }
    const fam = (f, axis) => `family=${f.replace(/ /g, '+')}${axis}`;
    const sansAxis = lang.sans === 'Inter' ? '' : ':wght@400..800';
    const serifAxis = ':wght@400;700';
    const families = [lang.sans !== 'Inter' && fam(lang.sans, sansAxis), fam(lang.serif, serifAxis)].filter(Boolean);
    link.href = `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
    root.style.setProperty('--script-sans', `'${lang.sans}'`);
    root.style.setProperty('--script-serif', `'${lang.serif}'`);
  }

  function apply(code) {
    const lang = byCode[code] || byCode.en;
    const t = dict[lang.code] || english;
    const get = (k) => t[k] ?? english[k];
    root.lang = lang.code;
    root.dir = lang.rtl ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = get(el.dataset.i18n);
    });
    prompts = DEMOS.map((d) => get(d.key));
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = get(el.dataset.i18nHtml);
    });
    document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      const [attr, key] = el.dataset.i18nAttr.split(':');
      el.setAttribute(attr, get(key));
    });
    document.title = get('meta.title');
    document.querySelector('.lang-current').textContent = lang.name;
    menu.querySelectorAll('li').forEach((li) => li.setAttribute('aria-selected', String(li.dataset.code === lang.code)));
    setFonts(lang);
    typeOut();
    renderDesigns(lang.code);
    renderShowcase(lang.code);
    // A clip recorded in Hebrew and in English plays in the one nearer the page's language.
    document.querySelectorAll('video[data-lang-clip]').forEach((v) => {
      const src = `media/clips/${v.dataset.langClip}-${lang.code === 'he' ? 'he' : 'en'}`;
      if (v.getAttribute('src') === `${src}.mp4`) return;
      const playing = !v.paused;
      v.poster = `${src}.webp`;
      v.src = `${src}.mp4`;
      if (playing) v.play().catch(() => {});
    });
    document.querySelectorAll('[data-count]').forEach((el) => (el.textContent = new Intl.NumberFormat(lang.code).format(Number(el.dataset.count)) + (el.hasAttribute('data-plus') ? '+' : '')));
    try {
      localStorage.setItem('slidr.site.lang', lang.code);
    } catch {}
    const url = new URL(location.href);
    if (lang.code === 'en') url.searchParams.delete('lang');
    else url.searchParams.set('lang', lang.code);
    history.replaceState(null, '', url);
  }

  async function choose(code) {
    try {
      await loadScript(code);
    } catch {
      code = 'en';
    }
    apply(code);
  }

  // The language menu
  const btn = document.querySelector('.lang-btn');
  const menu = document.querySelector('.lang-menu');
  LANGS.forEach((l) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.tabIndex = 0;
    li.lang = l.code;
    li.dataset.code = l.code;
    li.textContent = l.name;
    menu.appendChild(li);
  });
  const toggle = (open) => {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) (menu.querySelector('[aria-selected="true"]') || menu.firstChild).focus();
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle(menu.hidden);
  });
  menu.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    toggle(false);
    choose(li.dataset.code);
  });
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.children];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      document.activeElement.click();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
    } else if (e.key === 'Escape') {
      toggle(false);
      btn.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !e.target.closest('.lang')) toggle(false);
  });

  // The language chips in the languages section light up one after another.
  const chips = document.querySelector('.lang-chips');
  LANGS.forEach((l) => {
    const li = document.createElement('li');
    li.lang = l.code;
    li.textContent = l.name;
    chips.appendChild(li);
  });
  if (!reduced) {
    let lit = 0;
    setInterval(() => {
      chips.children[lit]?.classList.remove('lit');
      lit = (lit + 1) % chips.children.length;
      chips.children[lit]?.classList.add('lit');
    }, 900);
  }

  /* ---------- Hero ---------- */
  // The hero's demo: three real runs, one after another. Each request types itself, is sent, and
  // the slides that run made arrive one by one in a stack. The dots under it jump to a run; it
  // starts again from the first whenever the language changes.
  const demo = document.querySelector('.hero-demo');
  const deck = demo.querySelector('.demo-deck');
  const typed = demo.querySelector('.typed');
  const count = demo.querySelector('.demo-count b');
  const total = demo.querySelector('.demo-total');
  const bar = demo.querySelector('.demo-bar');
  const picks = [...demo.querySelectorAll('.demo-pick button')];
  const DEMOS = [
    { key: 'hero.prompt', dir: 'edu', slides: 9 },
    { key: 'hero.prompt2', dir: 'galilee', slides: 8 },
    { key: 'hero.prompt3', dir: 'festival', slides: 7 },
  ];
  let prompts = DEMOS.map(() => '');
  const decks = DEMOS.map((d) =>
    Array.from({ length: d.slides }, (_, i) => {
      const img = document.createElement('img');
      img.src = `media/${d.dir}/slide-0${i + 1}.webp`;
      img.alt = '';
      img.decoding = 'async';
      deck.appendChild(img);
      return img;
    }),
  );
  let demoRun = 0;
  const pause = (ms) => new Promise((done) => setTimeout(done, ms));
  function stackTo(cards, n) {
    // n slides have arrived: the newest in front, three behind it, older ones gone.
    cards.forEach((c, i) => {
      const d = n - 1 - i;
      c.classList.toggle('gone', i < n && d > 3);
      if (i < n && d <= 3) {
        c.dataset.d = d;
        c.style.setProperty('--d', d);
        c.style.zIndex = 10 - d;
      } else c.removeAttribute('data-d');
    });
    count.textContent = n;
    bar.style.setProperty('--p', n / cards.length);
  }
  async function typeOut(first = 0) {
    const run = ++demoRun;
    const alive = () => run === demoRun;
    if (reduced) {
      typed.textContent = prompts[first];
      total.textContent = decks[first].length;
      decks.forEach((cards, k) => (k === first ? stackTo(cards, cards.length) : cards.forEach((c) => c.classList.add('gone'))));
      picks.forEach((p, k) => p.classList.toggle('on', k === first));
      demo.classList.add('done');
      return;
    }
    for (let k = first; ; k = (k + 1) % DEMOS.length) {
      const cards = decks[k];
      const text = [...prompts[k]];
      demo.classList.remove('sent', 'building', 'done');
      picks.forEach((p, i) => {
        p.classList.toggle('on', i === k);
        p.style.setProperty('--p', 0);
      });
      decks.flat().forEach((c) => c.classList.add('gone'));
      await pause(700);
      if (!alive()) return;
      decks.flat().forEach((c) => {
        c.classList.toggle('gone', !cards.includes(c));
        c.removeAttribute('data-d');
      });
      total.textContent = cards.length;
      stackTo(cards, 0);
      typed.textContent = '';
      for (let i = 1; i <= text.length; i++) {
        typed.textContent = text.slice(0, i).join('');
        await pause(38);
        if (!alive()) return;
      }
      await pause(450);
      demo.classList.add('sent');
      await pause(260);
      demo.classList.remove('sent');
      demo.classList.add('building');
      for (let n = 1; n <= cards.length; n++) {
        await pause(n === 1 ? 500 : 950);
        if (!alive()) return;
        stackTo(cards, n);
        picks[k].style.setProperty('--p', n / cards.length);
      }
      demo.classList.remove('building');
      demo.classList.add('done');
      await pause(4200);
      if (!alive()) return;
    }
  }
  picks.forEach((p, k) => p.addEventListener('click', () => typeOut(k)));

  // The light in the hero follows the pointer.
  const spot = document.querySelector('.hero-spot');
  document.querySelector('.hero').addEventListener('pointermove', (e) => {
    const r = spot.getBoundingClientRect();
    spot.style.setProperty('--sx', `${e.clientX - r.left}px`);
    spot.style.setProperty('--sy', `${e.clientY - r.top}px`);
  });

  // The app window leans back and straightens as the page scrolls.
  const tilt = document.querySelector('.stage-tilt');
  const nav = document.querySelector('.nav');
  const onScroll = () => {
    const y = scrollY;
    nav.classList.toggle('scrolled', y > 10);
    if (!reduced) tilt.style.setProperty('--tilt', String(Math.max(0, 1 - y / 420)));
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Reveal on scroll ---------- */
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }),
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
  );
  document.querySelectorAll('.reveal, .final-card').forEach((el, i) => {
    const sib = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
    el.style.setProperty('--d', `${Math.min(sib.indexOf(el), 5) * 0.08}s`);
    io.observe(el);
  });

  // Cards light up under the pointer.
  document.querySelectorAll('.card').forEach((card) =>
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    }),
  );

  // Looping clips play only while they are on screen.
  const loops = document.querySelectorAll('.hero-window video, .lang-window video, .media-window video, .art-objects video');
  const vio = new IntersectionObserver((entries) =>
    entries.forEach((e) => {
      const v = e.target;
      if (e.isIntersecting) {
        if (v.preload === 'none') v.preload = 'auto';
        v.play().catch(() => {});
      } else v.pause();
    }),
  );
  loops.forEach((v) => vio.observe(v));

  /* ---------- Showcase player ---------- */
  const tabs = [...document.querySelectorAll('.chapters [role=tab]')];
  const clips = Object.fromEntries([...document.querySelectorAll('.player-screen video')].map((v) => [v.dataset.name, v]));
  let current = 0;
  let visible = false;
  function show(i, play = true) {
    current = i;
    tabs.forEach((t, j) => {
      t.setAttribute('aria-selected', String(j === i));
      t.tabIndex = j === i ? 0 : -1;
      t.querySelector('.bar').style.setProperty('--p', 0);
    });
    Object.values(clips).forEach((v) => {
      v.classList.toggle('on', v === clips[tabs[i].dataset.clip]);
      if (v !== clips[tabs[i].dataset.clip]) v.pause();
    });
    const v = clips[tabs[i].dataset.clip];
    // Load the next chapter's clip ahead of time.
    const next = clips[tabs[(i + 1) % tabs.length].dataset.clip];
    if (next.preload === 'none') next.preload = 'auto';
    v.currentTime = 0;
    if (play && visible) v.play().catch(() => {});
  }
  Object.values(clips).forEach((v) => {
    v.addEventListener('timeupdate', () => {
      const tab = tabs[current];
      if (v !== clips[tab.dataset.clip] || !v.duration) return;
      tab.querySelector('.bar').style.setProperty('--p', v.currentTime / v.duration);
    });
    v.addEventListener('ended', () => {
      if (v === clips[tabs[current].dataset.clip]) show((current + 1) % tabs.length);
    });
  });
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(i));
    t.addEventListener('keydown', (e) => {
      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const j = (i + step + tabs.length) % tabs.length;
      show(j);
      tabs[j].focus();
    });
  });
  new IntersectionObserver((entries) =>
    entries.forEach((e) => {
      visible = e.isIntersecting;
      const v = clips[tabs[current].dataset.clip];
      if (visible) v.play().catch(() => {});
      else v.pause();
    }),
  ).observe(document.querySelector('.player-screen'));
  show(0, false);

  /* ---------- Library: designs and frames ---------- */
  // The designs of Elements, drawn in the page's language where they are
  // written in it (Hebrew), and otherwise in English.
  function renderDesigns(code) {
    const dir = code === 'he' ? 'he' : 'en';
    // Columns of designs drifting up and down, each one twice so its loop has no seam.
    const columns = (cols, lazy) =>
      cols
        .map((ids) => {
          const imgs = ids.map((id) => `<img src="media/designs/${dir}/${id}.webp" alt=""${lazy ? ' loading="lazy"' : ''} decoding="async" />`).join('');
          return `<div class="wall-col">${imgs}${imgs}</div>`;
        })
        .join('');
    document.querySelector('.wall-tilt').innerHTML = columns(window.SLIDR_DESIGNS.wall, true);
    document.querySelector('.hero-wall-tilt').innerHTML = columns(window.SLIDR_DESIGNS.hero, false);
  }

  // The library's counts run up when they come into view.
  const counted = new IntersectionObserver((entries) =>
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      counted.unobserve(e.target);
      const el = e.target;
      const end = Number(el.dataset.count);
      const nf = new Intl.NumberFormat(root.lang);
      const fmt = { format: (n) => nf.format(n) + (el.hasAttribute('data-plus') ? '+' : '') };
      if (reduced) return void (el.textContent = fmt.format(end));
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 1400);
        el.textContent = fmt.format(Math.round(end * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }),
  );
  document.querySelectorAll('[data-count]').forEach((el) => counted.observe(el));

  /* ---------- Templates marquee ---------- */
  const pics = [];
  for (let t = 0; t < 12; t++) for (const s of ['00', '02', '03']) pics.push(`media/templates/t${String(t).padStart(2, '0')}-${s}.webp`);
  const row = (list) => {
    const html = list.map((src) => `<img src="${src}" alt="" loading="lazy" decoding="async" />`).join('');
    return html + html;
  };
  document.querySelector('.track.t1').innerHTML = row(pics.filter((_, i) => i % 3 === 0));
  document.querySelector('.track.t2').innerHTML = row(pics.filter((_, i) => i % 3 !== 0).filter((_, i) => i % 2 === 0));

  /* ---------- Templates shown whole ---------- */
  // Three templates with every sample slide, as the app's template picker shows them. The slides
  // are drawn in Hebrew on the Hebrew page and in English on every other; their names follow them.
  const SHOW = window.SLIDR_SHOWCASE.templates;
  const scTabs = document.querySelector('.sc-tabs');
  const scGrid = document.querySelector('.sc-grid');
  const scWindow = document.querySelector('.sc-window');
  const SC_TIME = 2500;
  let scCode = 'en';
  let scAt = 0;
  let scTimer = 0;
  let scSeen = false;
  let scHover = false;

  function renderShowcase(code) {
    scCode = code;
    scTabs.innerHTML = SHOW.map((tpl, i) => {
      const name = tpl.name[code] ?? tpl.name.en;
      const tag = tpl.tagline[code] ?? tpl.tagline.en;
      const drawn = code === 'he' ? 'he' : 'en';
      return `<button role="tab" aria-selected="false" data-i="${i}">
        <img src="media/showcase/${tpl.id}-${drawn}-00.webp" alt="" decoding="async" />
        <span class="sc-tab-text"><strong>${name}</strong><span>${tag}</span></span>
        <span class="bar"><span></span></span>
      </button>`;
    }).join('');
    showTemplate(scAt, false);
  }

  function showTemplate(i, animate = true) {
    scAt = i;
    const tpl = SHOW[i];
    const drawn = scCode === 'he' ? 'he' : 'en';
    scTabs.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-selected', String(k === i)));
    document.querySelector('.sc-name').textContent = tpl.name[scCode] ?? tpl.name.en;
    document.querySelector('.sc-tag').textContent = tpl.tagline[scCode] ?? tpl.tagline.en;
    const fmt = new Intl.NumberFormat(scCode);
    scGrid.innerHTML = tpl.slides[drawn]
      .map(
        (name, n) =>
          `<li style="--i:${n}"><img src="media/showcase/${tpl.id}-${drawn}-${String(n).padStart(2, '0')}.webp" alt="${name}" decoding="async" /><span><b>${fmt.format(n + 1)}</b>${name}</span></li>`,
      )
      .join('');
    scGrid.classList.toggle('swap', animate && !reduced);
    schedule();
  }

  function schedule() {
    clearTimeout(scTimer);
    const running = scSeen && !scHover && !reduced;
    scWindow.classList.remove('sc-running');
    void scWindow.offsetWidth;
    scWindow.classList.toggle('sc-running', running);
    if (running) scTimer = setTimeout(() => showTemplate((scAt + 1) % SHOW.length), SC_TIME);
  }

  scTabs.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) showTemplate(Number(b.dataset.i));
  });
  scTabs.addEventListener('keydown', (e) => {
    const step = { ArrowDown: 1, ArrowUp: -1, ArrowRight: root.dir === 'rtl' ? -1 : 1, ArrowLeft: root.dir === 'rtl' ? 1 : -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    showTemplate((scAt + step + SHOW.length) % SHOW.length);
    scTabs.children[scAt].focus();
  });
  scWindow.addEventListener('pointerenter', () => ((scHover = true), schedule()));
  scWindow.addEventListener('pointerleave', () => ((scHover = false), schedule()));
  new IntersectionObserver((entries) =>
    entries.forEach((e) => {
      scSeen = e.isIntersecting;
      schedule();
    }),
  ).observe(scWindow);

  /* ---------- Start ---------- */
  const fromUrl = new URL(location.href).searchParams.get('lang');
  let saved = null;
  try {
    saved = localStorage.getItem('slidr.site.lang');
  } catch {}
  // English is the page's own language: another one is shown only when it was chosen.
  choose([fromUrl, saved].find((c) => c && byCode[c]) || 'en');
})();
