// Coffee Matrix dashboard: calculations, drawings and controls.
// Carried over from the Claude dashboard. This copy is view-only: the Upload data page is left out.
window.CM = window.CM || {};
const REGIONS = CM.REGIONS;
const MINUS = '−';
const fmt = (v) => (v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? MINUS : '') + (Number.isInteger(v) ? Math.abs(v) : Math.abs(v).toFixed(1)));
const fmtDate = (s) => (s ? d3.utcFormat('%-d %b %Y')(new Date(s + 'T00:00:00Z')) : '—');
// Trader-style heat: red below New York, slate at par, green above. Each side runs to its own extreme in view,
// so the brightest green is the highest differential and the brightest red the lowest (when it is below par).
const HEAT_PAR = '#2A313B';
const RAMP_UP = d3.interpolateRgbBasis([HEAT_PAR, '#1C4A37', '#0F7A50', '#0BA868', '#0ECB81']);
const RAMP_DOWN = d3.interpolateRgbBasis([HEAT_PAR, '#5A1F2A', '#A32638', '#F6465D']);
const heatOf = () => {
  const s = dash.data('summary');
  const row = s.status === 'ok' ? s.data[0] : null;
  const lo = row ? row.min : 0, hi = row ? row.max : 1;
  const clamp = (t) => Math.max(0, Math.min(1, t));
  // When everything in view sits on one side of par, start that side a little off slate so the lowest still reads as up (or down).
  const up = (d) => (lo > 0 ? 0.15 + 0.85 * (hi > lo ? clamp((d - lo) / (hi - lo)) : 1) : hi > 0 ? clamp(d / hi) : 0);
  const down = (d) => (hi < 0 ? 0.15 + 0.85 * (hi > lo ? clamp((hi - d) / (hi - lo)) : 1) : lo < 0 ? clamp(d / lo) : 0);
  return (d) => {
    const bg = d > 0 ? RAMP_UP(up(d)) : d < 0 ? RAMP_DOWN(down(d)) : HEAT_PAR;
    return { bg, fg: d3.lab(bg).l > 55 ? '#05070A' : '#E9EDF2' };
  };
};
// Region series colours are fixed on the page (blue, amber, magenta).
const SERIES = ['var(--cm-s1)', 'var(--cm-s2)', 'var(--cm-s3)'];
const regionColor = (r) => SERIES[Math.max(0, REGIONS.indexOf(r))] || dash.colors[0];
const shortRegion = (r) => ({ 'Latin America & the Caribbean': 'Latin America', 'Africa & the Middle East': 'Africa & M. East', 'Asia & Pacific Islands': 'Asia & Pacific' }[r] || r);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const enc = (s) => String(s).replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D');
CM.ui = CM.ui || { views: { a: 'map', b: 'matrix' }, layout: 2, metric: 'top', sort: { key: 'diff', dir: -1 } };
try { const saved = JSON.parse(localStorage.getItem('cm-ui3') || 'null'); if (saved && saved.views) Object.assign(CM.ui, saved); } catch (e) { /* storage unavailable */ }
const keepUi = () => { try { localStorage.setItem('cm-ui3', JSON.stringify(CM.ui)); } catch (e) { /* storage unavailable */ } };

// ---------- Calculations ----------

dash.calc('matrices', {
  title: 'Matrices on file',
  inputs: ['original', 'snapshots'],
  fn: (original, snapshots) => {
    const list = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? JSON.parse(v || '[]') : []);
    const byDate = new Map();
    for (const m of original) byDate.set(m.asOf, { ...m, id: m.asOf, original: true, entries: list(m.entries) });
    for (const m of snapshots) {
      // Matrices emailed in are compact text with a checksum; one that fails the check is kept off the charts.
      const emailed = typeof m.tsv === 'string' && !list(m.entries).length;
      const invalid = emailed && (CM.fnv(m.tsv) !== m.checksum || m.tsv.split('\n').filter(Boolean).length !== +m.entryCount);
      const entries = emailed ? (invalid ? [] : CM.fromTsv(m.tsv)) : list(m.entries);
      byDate.set(m.asOf || m.id, { ...m, asOf: m.asOf || m.id, original: false, invalid, entries });
    }
    return [...byDate.values()].sort((a, b) => (a.asOf < b.asOf ? -1 : 1));
  }
});

dash.calc('entries', {
  title: 'Matrix in view',
  inputs: ['matrices'],
  fn: (snapshots) => {
    const list = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? JSON.parse(v || '[]') : []);
    const snaps = snapshots.map((s) => ({ asOf: s.asOf || s.id, entries: list(s.entries) })).filter((s) => s.entries.length).sort((a, b) => (a.asOf < b.asOf ? -1 : 1));
    if (!snaps.length) return [];
    let i = snaps.findIndex((s) => s.asOf === dash.params().asOf);
    if (i < 0) i = snaps.length - 1;
    const cur = snaps[i], prev = snaps[i - 1];
    const before = new Map((prev ? prev.entries : []).map((e) => [`${e.country}|${e.process}|${e.grade}`, +e.diff]));
    const seen = new Map();
    return cur.entries.map((e) => {
      const base = `${e.country}|${e.process}|${e.grade}`;
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      const was = before.has(base) ? before.get(base) : null;
      return { key: n > 1 ? `${base}|${n}` : base, asOf: cur.asOf, prevAsOf: prev ? prev.asOf : null, region: e.region, subregion: e.subregion, sheetRegion: e.sheetRegion, country: e.country, process: e.process, grade: e.grade, rank: e.rank, diff: +e.diff, prev: was, change: was == null ? null : Math.round((+e.diff - was) * 100) / 100, cell: e.cell };
    });
  }
});

dash.calc('selection', {
  title: 'Selected coffees',
  inputs: ['entries'],
  fn: (entries) => {
    const p = dash.params();
    const q = String(p.q || '').trim().toLowerCase();
    return entries.filter((e) => (!p.region || e.region === p.region) && (!p.process || e.process === p.process) && (!q || `${e.grade} ${e.country} ${e.process}`.toLowerCase().includes(q)));
  }
});

dash.calc('extremes', {
  title: 'Best and lowest performing',
  inputs: ['selection'],
  fn: (selection) => {
    if (!selection.length) return [];
    const sorted = [...selection].sort((a, b) => b.diff - a.diff);
    const pick = (rank, e) => ({ rank, key: e.key, grade: e.grade, country: e.country, process: e.process, diff: e.diff, ties: selection.filter((x) => x.diff === e.diff).length - 1 });
    return [pick('best', sorted[0]), pick('lowest', sorted[sorted.length - 1])];
  }
});

dash.calc('summary', {
  title: 'Selection summary',
  inputs: ['selection'],
  fn: (selection) => {
    if (!selection.length) return [];
    const d = selection.map((e) => e.diff);
    const moved = selection.filter((e) => e.change != null);
    const r1 = (v) => Math.round(v * 10) / 10;
    return [{
      asOf: selection[0].asOf, prevAsOf: selection[0].prevAsOf, grades: selection.length,
      origins: new Set(selection.map((e) => e.country)).size,
      avg: r1(d3.mean(d)), min: d3.min(d), max: d3.max(d),
      matched: moved.length, avgChange: moved.length ? r1(d3.mean(moved, (e) => e.change)) : null,
      risers: moved.filter((e) => e.change > 0).length, fallers: moved.filter((e) => e.change < 0).length
    }];
  }
});

dash.calc('trend', {
  title: 'Average differential per matrix',
  inputs: ['matrices'],
  fn: (snapshots) => {
    const p = dash.params();
    const q = String(p.q || '').trim().toLowerCase();
    const snaps = snapshots.map((s) => ({ asOf: s.asOf || s.id, entries: Array.isArray(s.entries) ? s.entries : typeof s.entries === 'string' ? JSON.parse(s.entries || '[]') : [] })).sort((a, b) => (a.asOf < b.asOf ? -1 : 1));
    return snaps.map((s) => {
      const e = s.entries.filter((x) => (!p.region || x.region === p.region) && (!p.process || x.process === p.process) && (!q || `${x.grade} ${x.country} ${x.process}`.toLowerCase().includes(q)));
      return { asOf: s.asOf, grades: e.length, avg: e.length ? Math.round(d3.mean(e, (x) => +x.diff) * 10) / 10 : null };
    }).filter((r) => r.grades);
  }
});

dash.calc('regionTrend', {
  title: 'Average differential by region per matrix',
  inputs: ['matrices'],
  fn: (snapshots) => {
    const p = dash.params();
    const q = String(p.q || '').trim().toLowerCase();
    const regions = ['Latin America & the Caribbean', 'Africa & the Middle East', 'Asia & Pacific Islands'];
    const out = [];
    for (const s of snapshots) {
      const entries = Array.isArray(s.entries) ? s.entries : typeof s.entries === 'string' ? JSON.parse(s.entries || '[]') : [];
      for (const region of regions) {
        const e = entries.filter((x) => x.region === region && (!p.process || x.process === p.process) && (!q || `${x.grade} ${x.country} ${x.process}`.toLowerCase().includes(q)));
        if (e.length) out.push({ key: `${s.asOf || s.id}|${region}`, asOf: s.asOf || s.id, region, grades: e.length, avg: Math.round(d3.mean(e, (x) => +x.diff) * 10) / 10 });
      }
    }
    return out.sort((a, b) => (a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : 0));
  }
});

dash.calc('countries', {
  title: 'Origins',
  inputs: ['selection'],
  fn: (selection) => {
    const out = [];
    for (const [country, e] of d3.group(selection, (x) => x.country)) {
      const top = e.reduce((a, b) => (b.diff > a.diff ? b : a));
      out.push({ country, region: e[0].region, grades: e.length, top: top.diff, topGrade: top.grade, topProcess: top.process, avg: Math.round(d3.mean(e, (x) => x.diff) * 10) / 10, low: d3.min(e, (x) => x.diff) });
    }
    return out.sort((a, b) => b.top - a.top || a.country.localeCompare(b.country));
  }
});

dash.calc('regions', {
  title: 'Regions compared',
  inputs: ['entries'],
  fn: (entries) => {
    const p = dash.params();
    const q = String(p.q || '').trim().toLowerCase();
    const regions = ['Latin America & the Caribbean', 'Africa & the Middle East', 'Asia & Pacific Islands'];
    return regions.map((region) => {
      const d = entries.filter((x) => x.region === region && (!p.process || x.process === p.process) && (!q || `${x.grade} ${x.country} ${x.process}`.toLowerCase().includes(q))).map((x) => x.diff).sort(d3.ascending);
      return { region, grades: d.length, origins: new Set(entries.filter((x) => x.region === region).map((x) => x.country)).size, min: d.length ? d[0] : null, q1: d.length ? d3.quantile(d, 0.25) : null, median: d.length ? d3.median(d) : null, q3: d.length ? d3.quantile(d, 0.75) : null, max: d.length ? d[d.length - 1] : null };
    });
  }
});

// ---------- Helpers for drawings ----------

// Returns each source's rows, or null after putting the element in its loading, failed or empty state.
function take(el, ids, blank = '—') {
  const got = ids.map((id) => dash.data(id));
  const bad = got.find((g) => g.status !== 'ok');
  el.classList.toggle('dash-skeleton', !!bad && bad.status === 'loading');
  if (!bad) return got.map((g) => g.data || []);
  const failed = bad.status === 'error';
  if (el.tagName === 'TBODY' || el.tagName === 'TABLE') {
    el.replaceChildren();
    if (failed) { const body = el.tagName === 'TABLE' ? el.createTBody() : el; const td = body.insertRow().insertCell(); td.colSpan = 6; td.className = 'cm-empty'; td.textContent = 'Couldn’t load the matrix.'; }
  } else if (el.tagName === 'SELECT' || el.tagName === 'OL' || el.tagName === 'UL') el.replaceChildren();
  else if (failed) el.replaceChildren(h('span', 'cm-empty', 'Couldn’t load the matrix.'));
  else el.replaceChildren(...(blank ? [blank] : []));
  return null;
}

function tooltip(host) {
  const t = h('div', 'cm-tip');
  t.hidden = true;
  host.append(t);
  return {
    show(lines, event) {
      t.replaceChildren(...lines.map((l, i) => h(i ? 'span' : 'strong', null, l)));
      t.hidden = false;
      const box = host.getBoundingClientRect();
      let x = event.clientX - box.left + 14, y = event.clientY - box.top + 14;
      if (x + t.offsetWidth > host.clientWidth) x = Math.max(0, event.clientX - box.left - t.offsetWidth - 14);
      if (y + t.offsetHeight > host.clientHeight + 40) y = Math.max(0, event.clientY - box.top - t.offsetHeight - 14);
      t.style.left = x + 'px';
      t.style.top = y + 'px';
    },
    hide() { t.hidden = true; }
  };
}

function filterTo(text) {
  document.querySelectorAll('#f-q').forEach((i) => { i.value = text; });
  dash.setParams({ q: text });
}

// ---------- Header sentence ----------

const extreme = (rank) => { const x = dash.data('extremes'); return x.status === 'ok' ? x.data.find((r) => r.rank === rank) : null; };
const sum = () => { const s = dash.data('summary'); return s.status === 'ok' ? s.data[0] : null; };

dash.draw('ledeDate', (el) => { take(el, ['summary']) && (el.textContent = sum() ? fmtDate(sum().asOf) : '—'); });
// The headline card's tag: whether the matrix in view is the newest on file, and its date.
dash.draw('newsTag', (el) => {
  const got = take(el, ['matrices', 'summary']);
  if (!got) return;
  const s = sum();
  if (!s) { el.textContent = 'No matrix in view'; return; }
  const dates = got[0].filter((m) => !m.invalid).map((m) => m.asOf || m.id).sort();
  el.textContent = `${s.asOf === dates[dates.length - 1] ? 'Latest matrix' : 'Earlier matrix'} · ${fmtDate(s.asOf)}`;
});
dash.draw('ledeBest', (el) => {
  if (!take(el, ['extremes'])) return;
  const b = extreme('best');
  el.textContent = b ? `${b.country}’s ${b.grade} (${b.process.toLowerCase()})` : '—';
});
dash.draw('ledeBestDiff', (el) => { take(el, ['extremes']) && (el.textContent = fmt(extreme('best')?.diff)); });
dash.draw('ledeMin', (el) => { take(el, ['summary']) && (el.textContent = fmt(sum()?.min)); });
dash.draw('ledeMax', (el) => { take(el, ['summary']) && (el.textContent = fmt(sum()?.max)); });
dash.draw('ledeOrigins', (el) => { take(el, ['summary']) && (el.textContent = sum() ? String(sum().origins) : '—'); });

// ---------- Filter controls drawn from data ----------

dash.draw('processSel', (sel) => {
  const got = take(sel, ['entries'], '');
  const order = ['Washed', 'Natural', 'Honey', 'Wet hulled'];
  const found = got ? [...new Set(got[0].map((e) => e.process))].sort((a, b) => ((order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)) || a.localeCompare(b)) : [];
  const want = dash.params().process || '';
  if (want && !found.includes(want)) found.push(want);
  sel.replaceChildren(new Option('All processes', ''), ...found.map((p) => new Option(p === 'Natural' ? 'Natural (sun-dried)' : p, p)));
  sel.value = want;
  sel.onchange = () => dash.setParams({ process: sel.value });
});

dash.draw('asOfSel', (sel) => {
  const got = take(sel, ['matrices'], '');
  const dates = got ? got[0].filter((s) => !s.invalid).map((s) => s.asOf || s.id).sort().reverse() : [];
  sel.replaceChildren(new Option(dates.length ? `${fmtDate(dates[0])} (latest)` : 'Latest', ''), ...dates.slice(1).map((d) => new Option(fmtDate(d), d)));
  sel.value = dates.slice(1).includes(dash.params().asOf) ? dash.params().asOf : '';
  sel.onchange = () => dash.setParams({ asOf: sel.value });
});

// ---------- Hero tiles ----------

// Green for above par or up, red for below par or down: the trading-desk convention. The sign is always printed too.
const signClass = (el, v) => { el.classList.toggle('cm-pos', v > 0); el.classList.toggle('cm-neg', v < 0); };
function tileDraw(rank, part) {
  return (el) => {
    if (!take(el, ['extremes'])) return;
    const r = extreme(rank);
    el.classList.remove('cm-pos', 'cm-neg');
    if (!r) { el.textContent = '—'; return; }
    if (part === 'diff') { el.textContent = fmt(r.diff); signClass(el, r.diff); }
    else if (part === 'name') el.textContent = r.grade;
    else el.textContent = `${r.country} · ${r.process}` + (r.ties ? ` · ${r.ties} more grade${r.ties > 1 ? 's' : ''} at ${fmt(r.diff)}` : '');
  };
}
dash.draw('bestDiff', tileDraw('best', 'diff'));
dash.draw('bestName', tileDraw('best', 'name'));
dash.draw('bestSub', tileDraw('best', 'sub'));
dash.draw('lowDiff', tileDraw('lowest', 'diff'));
dash.draw('lowName', tileDraw('lowest', 'name'));
dash.draw('lowSub', tileDraw('lowest', 'sub'));
dash.draw('avgDiff', (el) => { take(el, ['summary']) && (el.textContent = fmt(sum()?.avg), signClass(el, sum()?.avg)); });
dash.draw('avgChange', (el) => { take(el, ['summary']) && (el.textContent = sum()?.avgChange == null ? '—' : fmt(sum().avgChange), signClass(el, sum()?.avgChange)); });
dash.draw('prevDate', (el) => { take(el, ['summary']) && (el.textContent = fmtDate(sum()?.prevAsOf)); });

dash.draw('spark', (el) => {
  const got = take(el, ['trend'], '');
  if (!got) return;
  const rows = got[0];
  el.replaceChildren();
  if (rows.length < 2) return;
  const w = el.clientWidth || 200, ht = 34;
  const x = rows.length > 1 ? d3.scalePoint(rows.map((r) => r.asOf), [3, w - 3]) : () => w - 3;
  const y = d3.scaleLinear(d3.extent(rows, (r) => r.avg), [ht - 4, 4]);
  if (rows.length === 1) y.domain([rows[0].avg - 1, rows[0].avg + 1]);
  const svg = d3.select(el).append('svg').attr('width', w).attr('height', ht).attr('role', 'img').attr('aria-label', 'Average differential for each uploaded matrix');
  if (rows.length > 1) svg.append('path').attr('d', d3.line((r) => x(r.asOf), (r) => y(r.avg))(rows)).attr('fill', 'none').style('stroke', 'currentColor').attr('stroke-width', 2).attr('stroke-linejoin', 'round');
  else svg.append('line').attr('x1', 0).attr('x2', w).attr('y1', ht / 2).attr('y2', ht / 2).style('stroke', 'var(--color-border-line)').attr('stroke-dasharray', '2 3');
  const last = rows[rows.length - 1];
  svg.append('circle').attr('cx', x(last.asOf)).attr('cy', y(last.avg)).attr('r', 4).style('fill', 'currentColor').style('stroke', 'none');
});

// ---------- Map ----------

// Map frame of the shapes in the "world" source: 1000 wide, 36°N–36°S, 120°W–160°E.
const MAP = { w: 1000, h: 257.1, cancer: 44.8, capricorn: 212.3 };

dash.draw('map', (el) => {
  const got = take(el, ['countries', 'world', 'summary'], '');
  if (!got) return;
  el.replaceChildren();
  const shapes = got[1].map((s) => ({ n: s.country, d: s.path, c: [+s.cx, +s.cy], b: [+s.x0, +s.y0, +s.x1, +s.y1] }));
  const geo = { w: MAP.w, h: MAP.h, lines: { cancer: MAP.cancer, capricorn: MAP.capricorn }, countries: shapes, names: new Set(shapes.map((s) => s.n)) };
  CM.geoNames = geo.names;
  const byGeo = new Map(got[0].map((c) => [CM.geoName(c.country), c]));
  const heat = heatOf();
  const metric = CM.ui.metric === 'avg' ? 'avg' : 'top';
  const region = dash.params().region;
  // Frame: the whole coffee belt, or the selected region's origins.
  let [x0, y0, x1, y1] = [0, 0, geo.w, geo.h];
  const focus = geo.countries.filter((c) => byGeo.has(c.n));
  if (region && focus.length) {
    x0 = d3.min(focus, (c) => c.b[0]); y0 = d3.min(focus, (c) => c.b[1]); x1 = d3.max(focus, (c) => c.b[2]); y1 = d3.max(focus, (c) => c.b[3]);
    const pad = Math.max(x1 - x0, y1 - y0) * 0.12;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const want = 0.62;
    if ((y1 - y0) / (x1 - x0) < want) { const grow = ((x1 - x0) * want - (y1 - y0)) / 2; y0 -= grow; y1 += grow; }
    else { const grow = ((y1 - y0) / want - (x1 - x0)) / 2; x0 -= grow; x1 += grow; }
  }
  const vw = x1 - x0, vh = y1 - y0;
  const k = vw / Math.max(1, el.clientWidth || 600); // user units per screen pixel
  const svg = d3.select(el).append('svg').attr('viewBox', `${x0} ${y0} ${vw} ${vh}`).attr('role', 'img')
    .attr('aria-label', `Map of coffee origins${region ? ' in ' + region : ''}, shaded by ${metric === 'top' ? 'top-grade' : 'average'} differential`);
  const tip = tooltip(el);
  const show = (event, c) => tip.show([c.country, c.region, `Top: ${c.topGrade} (${c.topProcess}) ${fmt(c.top)} ¢/lb`, `Average ${fmt(c.avg)} ¢/lb across ${c.grades} grade${c.grades > 1 ? 's' : ''}`, 'Click to filter to this origin'], event);
  if (!region && el.clientWidth >= 520) {
    for (const [name, y] of [['Tropic of Cancer', geo.lines.cancer], ['Tropic of Capricorn', geo.lines.capricorn]]) {
      svg.append('line').attr('class', 'cm-belt').attr('x1', 0).attr('x2', geo.w).attr('y1', y).attr('y2', y);
      svg.append('text').attr('class', 'cm-belt-label').attr('x', geo.w - 4 * k).attr('y', y - 4 * k).attr('text-anchor', 'end').style('font-size', `${10 * k}px`).text(name);
    }
  }
  svg.append('g').selectAll('path').data(geo.countries.filter((c) => !byGeo.has(c.n))).join('path').attr('class', 'cm-land').attr('d', (c) => c.d);
  const origins = geo.countries.filter((c) => byGeo.has(c.n)).map((c) => ({ g: c, c: byGeo.get(c.n) }));
  svg.append('g').selectAll('path').data(origins).join('path').attr('class', 'cm-origin').attr('d', (o) => o.g.d)
    .style('fill', (o) => heat(o.c[metric]).bg)
    .on('pointermove', (event, o) => show(event, o.c)).on('pointerleave', () => tip.hide())
    .on('click', (event, o) => filterTo(o.c.country));
  // A dot on every origin keeps small ones (Rwanda, Burundi, El Salvador, Timor) visible.
  svg.append('g').selectAll('circle').data(origins).join('circle').attr('class', 'cm-dot')
    .attr('cx', (o) => o.g.c[0]).attr('cy', (o) => o.g.c[1]).attr('r', 4.5 * k)
    .style('fill', (o) => heat(o.c[metric]).bg)
    .on('pointermove', (event, o) => show(event, o.c)).on('pointerleave', () => tip.hide())
    .on('click', (event, o) => filterTo(o.c.country));
  const missing = got[0].filter((c) => !geo.names.has(CM.geoName(c.country)));
  if (missing.length) el.append(h('p', 'cm-note', `Not on the map: ${missing.map((c) => c.country).join(', ')}.`));
  if (!got[0].length) el.append(h('p', 'cm-empty', 'No origins match these filters.'));
});

dash.draw('origins', (ol) => {
  const got = take(ol, ['countries', 'summary'], '');
  if (!got) return;
  const heat = heatOf();
  const metric = CM.ui.metric === 'avg' ? 'avg' : 'top';
  ol.replaceChildren(...got[0].map((c) => {
    const li = h('li');
    const sw = h('i');
    sw.style.background = heat(c[metric]).bg;
    const v = h('b', null, fmt(c[metric]));
    li.append(sw, h('span', null, c.country), h('span', 'cm-o-grade', metric === 'top' ? c.topGrade : `average of ${c.grades} grades`), v);
    return li;
  }));
});

// ---------- Matrix heatmap ----------

// Header icons from the "icons" source: flags, continent outlines and the washed / sun-dried glyphs.
// Shapes arrive as [tag, attrs, children] nodes and are rebuilt through a whitelist, never parsed as markup.
const ICON_TAGS = new Set(['g', 'path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line']);
const ICON_ATTRS = /^(d|fill|stroke|stroke-width|x|y|width|height|cx|cy|r|rx|ry|points|transform|fill-rule|clip-rule|opacity|fill-opacity|stroke-linecap|stroke-linejoin|stroke-miterlimit|x1|y1|x2|y2)$/;
const SVGNS = 'http://www.w3.org/2000/svg';
const keyName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
let iconCache = null;
const iconsOf = () => {
  const got = dash.data('icons');
  if (got.status !== 'ok') return null;
  if (iconCache && iconCache.src === got.data) return iconCache.by;
  const by = { flag: new Map(), region: new Map(), process: new Map() };
  for (const r of got.data || []) {
    const m = by[r.kind];
    if (!m) continue;
    let shape;
    try { shape = JSON.parse(r.shape); } catch (err) { continue; }
    const vb = String(r.vb || '').split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || !(vb[2] > 0 && vb[3] > 0)) continue;
    const row = { vb, shape };
    m.set(keyName(r.key), row);
    for (const n of String(r.names || '').split('|')) if (n) m.set(n, row);
  }
  iconCache = { src: got.data, by };
  return by;
};
const iconEl = (row, cls, px) => {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', row.vb.join(' '));
  svg.setAttribute('width', (px * row.vb[2] / row.vb[3]).toFixed(1));
  svg.setAttribute('height', px);
  svg.setAttribute('class', 'cm-ico ' + cls);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'currentColor');
  const add = (parent, nodes) => {
    for (const n of Array.isArray(nodes) ? nodes : []) {
      if (!Array.isArray(n) || !ICON_TAGS.has(n[0])) continue;
      const el = document.createElementNS(SVGNS, n[0]);
      for (const [k, v] of Object.entries(n[1] || {})) if (ICON_ATTRS.test(k)) el.setAttribute(k, String(v));
      if (n[2]) add(el, n[2]);
      parent.append(el);
    }
  };
  add(svg, row.shape);
  return svg;
};
const regionKey = (g) => { const s = String(g || '').toLowerCase(); return /^cam$|central|mexic/.test(s) ? 'cam' : /latam|latin|south|carib/.test(s) ? 'latam' : /afric|middle/.test(s) ? 'africa' : /apac|asia|pacific|ocean/.test(s) ? 'apac' : ''; };
// A header cell's label: optional icon, then the text.
const headLabel = (th, icon, text) => { const s = h('span', 'cm-hl'); if (icon) s.append(icon); s.append(h('span', null, text)); th.append(s); return th; };

dash.draw('matrix', (table) => {
  const got = take(table, ['selection', 'summary'], '');
  if (!got) return;
  const rows = got[0];
  table.replaceChildren();
  if (!rows.length) { const tb = table.createTBody(); const td = tb.insertRow().insertCell(); td.className = 'cm-empty'; td.textContent = 'No coffees match these filters.'; return; }
  const heat = heatOf();
  // Columns in the spreadsheet's own order: region, then country, then process.
  const cols = [];
  for (const e of rows) {
    const id = `${e.country}|${e.process}`;
    if (!cols.some((c) => c.id === id)) cols.push({ id, group: e.sheetRegion || e.region, country: e.country, process: e.process });
  }
  const short = (p) => ({ Washed: 'W', Natural: 'SD', Honey: 'H', 'Wet hulled': 'WH' }[p] || p.split(/\s+/).map((w) => w[0]).join('').toUpperCase());
  // Rows: 10 ¢/lb bands from the highest differential down to the lowest.
  const lo = d3.min(rows, (e) => e.diff), hi = d3.max(rows, (e) => e.diff);
  const step = hi - lo > 400 ? 20 : 10;
  const bands = d3.range(Math.floor(hi / step) * step, Math.floor(lo / step) * step - step / 2, -step);
  const head = table.createTHead();
  const spans = (key) => { const out = []; for (const c of cols) { const last = out[out.length - 1]; if (last && last.key === key(c)) last.n++; else out.push({ key: key(c), n: 1, c }); } return out; };
  const r1 = head.insertRow(); r1.className = 'cm-hr1';
  const corner = h('th', 'cm-corner', 'Diff to New York');
  corner.rowSpan = 3;
  corner.setAttribute('scope', 'col');
  const ico = iconsOf();
  const pickIcon = (kind, ...names) => { if (!ico) return null; for (const n of names) { const r = n && ico[kind].get(keyName(n)); if (r) return r; } return null; };
  r1.append(corner, ...spans((c) => c.group).map((s) => {
    const r = pickIcon('region', regionKey(s.key));
    const th = headLabel(h('th', 'cm-grp'), r && iconEl(r, 'cm-ico-land', 16), s.key);
    th.colSpan = s.n; th.setAttribute('scope', 'colgroup'); return th;
  }));
  const r2 = head.insertRow(); r2.className = 'cm-hr2';
  r2.append(...spans((c) => `${c.group}|${c.country}`).map((s) => {
    const r = pickIcon('flag', s.c.country, CM.geoName ? CM.geoName(s.c.country) : '');
    const th = headLabel(h('th', 'cm-ctry'), r && iconEl(r, 'cm-ico-flag', 12), s.c.country);
    th.colSpan = s.n; th.setAttribute('scope', 'colgroup'); return th;
  }));
  const r3 = head.insertRow(); r3.className = 'cm-hr3';
  r3.append(...cols.map((c) => {
    const r = pickIcon('process', c.process);
    const th = headLabel(h('th', 'cm-proc'), r && iconEl(r, 'cm-ico-' + keyName(c.process), 13), short(c.process));
    th.title = c.process; th.setAttribute('scope', 'col'); return th;
  }));
  const body = table.createTBody();
  for (const b of bands) {
    const tr = body.insertRow();
    if (b === 0) tr.className = 'cm-par';
    const yl = h('th', 'cm-y', fmt(b));
    yl.setAttribute('scope', 'row');
    tr.append(yl);
    for (const c of cols) {
      const td = tr.insertCell();
      const here = rows.filter((e) => `${e.country}|${e.process}` === c.id && e.diff >= b && e.diff < b + step).sort((x, y) => y.diff - x.diff);
      if (!here.length) continue;
      const colour = heat(d3.mean(here, (e) => e.diff));
      td.className = 'cm-hit';
      td.style.background = colour.bg;
      td.style.color = colour.fg;
      for (const e of here) {
        const line = h('div', 'cm-lg');
        const v = h('b', null, fmt(e.diff));
        line.append(h('span', null, e.grade), v);
        if (e.change) line.append(h('em', null, (e.change > 0 ? '▲' : '▼') + Math.abs(e.change)));
        td.append(line);
      }
    }
  }
});

// Colour key for the gradient, from the lowest to the highest differential in view.
dash.draw('legend', (el) => {
  if (!take(el, ['summary'], '')) return;
  const s = sum();
  el.replaceChildren();
  if (!s) return;
  const lo = h('b', null, fmt(s.min));
  const hi = h('b', null, fmt(s.max));
  const bar = h('i', 'cm-ramp');
  const heat = heatOf();
  bar.style.background = `linear-gradient(90deg, ${d3.range(0, 1.0001, 0.05).map((t) => heat(s.min + (s.max - s.min) * t).bg).join(', ')})`;
  el.append(h('span', null, '¢/lb'), lo, bar, hi, h('span', 'cm-muted', 'Green above New York, red below, slate at par; the brighter, the further from par. W washed, SD sun-dried (natural).'));
});

// ---------- Ranked table ----------

dash.draw('rank', (tbody) => {
  const got = take(tbody, ['selection', 'summary'], '');
  if (!got) return;
  const heat = heatOf();
  const { key, dir } = CM.ui.sort;
  const rows = [...got[0]].sort((a, b) => {
    const va = a[key], vb = b[key];
    if (va == null && vb == null) return b.diff - a.diff;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb))) * dir || b.diff - a.diff;
  });
  tbody.replaceChildren(...rows.map((e, i) => {
    const tr = h('tr');
    const cell = h('td', 'num cm-heat', fmt(e.diff));
    const c = heat(e.diff);
    cell.style.background = c.bg;
    cell.style.color = c.fg;
    tr.append(h('td', 'num cm-muted', String(i + 1)), h('td', null, e.grade), h('td', null, e.country), h('td', null, e.process), cell,
      h('td', 'num' + (e.change > 0 ? ' cm-pos' : e.change < 0 ? ' cm-neg' : ''), e.change == null ? '—' : e.change === 0 ? '0' : `${e.change > 0 ? '▲' : '▼'} ${Math.abs(e.change)}`));
    return tr;
  }));
  if (!rows.length) { const tr = h('tr'); const td = h('td', 'cm-empty', 'No coffees match these filters.'); td.colSpan = 6; tr.append(td); tbody.append(tr); }
});

// ---------- Region comparison ----------

dash.draw('regions', (el) => {
  const got = take(el, ['regions', 'entries'], '');
  if (!got) return;
  const [stats, entries] = got;
  el.replaceChildren();
  const p = dash.params();
  const q = String(p.q || '').trim().toLowerCase();
  const pts = entries.filter((x) => (!p.process || x.process === p.process) && (!q || `${x.grade} ${x.country} ${x.process}`.toLowerCase().includes(q)));
  if (!pts.length) { el.append(h('p', 'cm-empty', 'No coffees match these filters.')); return; }
  const w = Math.max(200, el.clientWidth);
  const narrow = w < 560;
  const plotW = narrow ? w : w - 192;
  const x = d3.scaleLinear([Math.min(-60, d3.min(pts, (e) => e.diff)), Math.max(60, d3.max(pts, (e) => e.diff))], [8, plotW - 8]).nice();
  const tip = tooltip(el);
  for (const r of stats) {
    const row = h('div', 'cm-rrow' + (narrow ? ' cm-narrow' : '') + (p.region && p.region !== r.region ? ' cm-dim' : ''));
    const name = h('div', 'cm-rname');
    const dot = h('i');
    dot.style.background = regionColor(r.region);
    name.append(dot, h('span', null, r.region));
    const svg = d3.create('svg').attr('width', plotW).attr('height', 40).attr('role', 'img').attr('aria-label', `${r.region}: differentials from ${fmt(r.min)} to ${fmt(r.max)}, median ${fmt(r.median)}`);
    const mine = pts.filter((e) => e.region === r.region);
    if (r.grades) {
      svg.append('line').attr('class', 'cm-zero').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 2).attr('y2', 38);
      svg.append('rect').attr('x', x(r.q1)).attr('width', Math.max(2, x(r.q3) - x(r.q1))).attr('y', 9).attr('height', 22).attr('rx', 4)
        .style('fill', regionColor(r.region)).style('opacity', 0.14);
      svg.append('g').selectAll('circle').data(mine).join('circle')
        .attr('cx', (e) => x(e.diff)).attr('cy', (e, i) => 20 + ((i % 5) - 2) * 3).attr('r', 4)
        .style('fill', regionColor(r.region)).style('fill-opacity', 0.75).style('stroke', 'var(--color-panel)').attr('stroke-width', 1.5)
        .on('pointermove', (event, e) => tip.show([`${e.grade}`, `${e.country} · ${e.process}`, `${fmt(e.diff)} ¢/lb`], event)).on('pointerleave', () => tip.hide());
      svg.append('line').attr('x1', x(r.median)).attr('x2', x(r.median)).attr('y1', 6).attr('y2', 34).style('stroke', 'var(--color-fg)').attr('stroke-width', 2).attr('stroke-linecap', 'round');
    }
    const st = h('div', 'cm-rstats');
    if (r.grades) {
      const mark = (v, text) => h('b', null, text ?? fmt(v));
      st.append('Median ', mark(r.median), ' · range ', mark(r.min), ' to ', mark(r.max), ' · ', mark(r.grades, String(r.grades)), ' grades');
    } else st.append('No grades match these filters.');
    row.append(name, st, svg.node());
    el.append(row);
  }
  const axis = d3.create('svg').attr('width', plotW).attr('height', 22).attr('class', 'cm-axis').attr('aria-hidden', 'true');
  axis.append('g').attr('transform', 'translate(0,2)').call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(plotW / 80))).tickFormat((v) => fmt(v)).tickSizeOuter(0));
  const axisRow = h('div', 'cm-rrow cm-axisrow' + (narrow ? ' cm-narrow' : ''));
  axisRow.append(h('span', 'cm-note', 'Differential, ¢/lb'), axis.node());
  el.append(axisRow);
  if (pts.length && !narrow) el.append(h('p', 'cm-note', 'Each dot is a grade. The shaded band holds the middle half of a region’s grades and the dark tick marks its median.'));
});

// ---------- Trend ----------

dash.draw('trend', (el) => {
  const got = take(el, ['regionTrend'], '');
  if (!got) return;
  const rows = got[0];
  el.replaceChildren();
  if (!rows.length) { el.append(h('p', 'cm-empty', 'No coffees match these filters.')); return; }
  const key = h('div', 'cm-key');
  for (const r of REGIONS.filter((r) => rows.some((x) => x.region === r))) { const s = h('span'); const i = h('i'); i.style.background = regionColor(r); s.append(i, r); key.append(s); }
  el.append(key);
  const dates = [...new Set(rows.map((r) => r.asOf))].sort();
  const labelled = dates.length <= 2;
  const endLabel = (r) => `${shortRegion(r.region)} ${fmt(r.avg)}`;
  const longest = labelled ? d3.max(rows, (r) => endLabel(r).length) : 0;
  const w = Math.max(240, el.clientWidth), ht = 220, m = { t: 10, r: labelled ? 16 + longest * 6.6 : 16, b: 26, l: 44 };
  const x = d3.scalePoint(dates, [m.l, w - m.r]).padding(dates.length === 1 ? 0.5 : 0.05);
  const ext = d3.extent(rows, (r) => r.avg);
  const y = d3.scaleLinear([Math.min(0, ext[0]), Math.max(10, ext[1])], [ht - m.b, m.t]).nice();
  const svg = d3.select(el).append('svg').attr('width', w).attr('height', ht).attr('role', 'img').attr('aria-label', 'Average differential by region for each uploaded matrix');
  svg.append('g').attr('class', 'cm-grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat('')).call((g) => g.select('.domain').remove());
  svg.append('g').attr('class', 'cm-axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => fmt(v)).tickSizeOuter(0)).call((g) => g.select('.domain').remove());
  const ax = svg.append('g').attr('class', 'cm-axis').attr('transform', `translate(0,${ht - m.b})`).call(d3.axisBottom(x).tickFormat(fmtDate).tickSizeOuter(0));
  const every = Math.ceil(dates.length / Math.max(1, Math.floor((w - m.l - m.r) / 90)));
  ax.selectAll('.tick').attr('opacity', (d, i) => (i % every === 0 ? 1 : 0));
  if (y.domain()[0] < 0) svg.append('line').attr('class', 'cm-zero').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(0)).attr('y2', y(0));
  for (const [region, list] of d3.group(rows, (r) => r.region)) {
    if (list.length > 1) svg.append('path').attr('d', d3.line((r) => x(r.asOf), (r) => y(r.avg))(list)).attr('fill', 'none').style('stroke', regionColor(region)).attr('stroke-width', 2).attr('stroke-linejoin', 'round');
    svg.append('g').selectAll('circle').data(list).join('circle').attr('cx', (r) => x(r.asOf)).attr('cy', (r) => y(r.avg)).attr('r', 4.5)
      .style('fill', regionColor(region)).style('stroke', 'var(--color-panel)').attr('stroke-width', 2);
    if (labelled) {
      const last = list[list.length - 1];
      svg.append('text').attr('x', x(last.asOf) + 9).attr('y', y(last.avg) + 4).style('fill', 'var(--color-fg)').style('font-size', '12px').text(endLabel(last));
    }
  }
  const tip = tooltip(el);
  const guide = svg.append('line').attr('y1', m.t).attr('y2', ht - m.b).style('stroke', 'var(--cds-chart-reference, var(--color-border-line))').attr('opacity', 0);
  svg.append('rect').attr('x', m.l).attr('y', 0).attr('width', w - m.l - m.r).attr('height', ht).attr('fill', 'transparent')
    .on('pointermove', (event) => {
      const [px] = d3.pointer(event);
      const d = dates.reduce((a, b) => (Math.abs(x(b) - px) < Math.abs(x(a) - px) ? b : a));
      guide.attr('x1', x(d)).attr('x2', x(d)).attr('opacity', 1);
      tip.show([fmtDate(d), ...rows.filter((r) => r.asOf === d).map((r) => `${shortRegion(r.region)}: ${fmt(r.avg)} ¢/lb (${r.grades} grades)`)], event);
    })
    .on('pointerleave', () => { guide.attr('opacity', 0); tip.hide(); });
});

dash.draw('movers', (ol) => {
  const got = take(ol, ['selection'], '');
  if (!got) return;
  const moved = got[0].filter((e) => e.change);
  const ups = [...moved].sort((a, b) => b.change - a.change).filter((e) => e.change > 0).slice(0, 5);
  const downs = [...moved].sort((a, b) => a.change - b.change).filter((e) => e.change < 0).slice(0, 5);
  ol.replaceChildren(...[...ups, ...downs].map((e) => {
    const li = h('li');
    li.append(h('span', null, `${e.country} ${e.grade} (${e.process})`), h('span', 'cm-m-was', `${fmt(e.prev)} → ${fmt(e.diff)}`));
    li.append(h('b', 'cm-num ' + (e.change > 0 ? 'cm-pos' : 'cm-neg'), `${e.change > 0 ? '▲' : '▼'} ${Math.abs(e.change)}`));
    return li;
  }));
  if (!ups.length && !downs.length) ol.append(h('li', 'cm-empty', 'No grade’s differential changed.'));
});

// ---------- Controls (listen, and set attributes only) ----------

const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const press = (group, value) => $$('button', group).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === value)));

function applyPanels() {
  const panels = $$('#panels')[0];
  if (panels) panels.classList.toggle('cm-one', CM.ui.layout === 1);
  $$('.cm-panel').forEach((panel) => {
    const id = panel.dataset.panel;
    if (id === 'b') panel.hidden = CM.ui.layout === 1;
    const view = CM.ui.views[id] || 'map';
    $$('.cm-viewsel', panel).forEach((s) => { s.value = view; });
    $$('.cm-view', panel).forEach((v) => { v.hidden = v.dataset.view !== view; });
    $$('.cm-metric', panel).forEach((m) => { m.hidden = view !== 'map'; });
    $$('.cm-zoom', panel).forEach((z) => { z.hidden = view !== 'matrix'; });
    $$('.cm-legend', panel).forEach((l) => { l.hidden = !['map', 'matrix', 'rank'].includes(view); });
  });
  $$('#f-layout').forEach((g) => press(g, String(CM.ui.layout)));
  $$('.cm-panel').forEach(applyZoom);
  $$('.cm-metric').forEach((g) => press(g, CM.ui.metric));
  $$('.cm-rank th[data-sort]').forEach((th) => {
    if (th.dataset.sort === CM.ui.sort.key) th.setAttribute('aria-sort', CM.ui.sort.dir < 0 ? 'descending' : 'ascending');
    else th.removeAttribute('aria-sort');
  });
}

$$('#f-region button').forEach((b) => b.addEventListener('click', () => dash.setParams({ region: b.dataset.v })));
$$('#f-layout button').forEach((b) => b.addEventListener('click', () => { CM.ui.layout = +b.dataset.v; keepUi(); applyPanels(); dash.draw('map'); dash.draw('regions'); dash.draw('trend'); }));
$$('.cm-viewsel').forEach((s) => s.addEventListener('change', () => { CM.ui.views[s.closest('.cm-panel').dataset.panel] = s.value; keepUi(); applyPanels(); dash.draw('map'); dash.draw('regions'); dash.draw('trend'); }));
$$('.cm-metric button').forEach((b) => b.addEventListener('click', () => { CM.ui.metric = b.dataset.v; keepUi(); applyPanels(); dash.draw('map'); dash.draw('origins'); }));
// Matrix zoom: CSS zoom on the table, so the sticky headers scale with it. "Fit" fits the whole matrix to the panel's width.
CM.ui.zoom = CM.ui.zoom || {};
const ZMIN = 10, ZMAX = 160;
const zoomOf = (panel) => CM.ui.zoom[panel.dataset.panel] ?? 100;
const fitZoom = (panel) => {
  const wrap = $$('.cm-ladder-wrap', panel)[0], table = $$('.cm-ladder', panel)[0];
  if (!wrap || !table || !wrap.clientWidth) return 100;
  table.style.zoom = '1';
  const natural = table.offsetWidth;
  return natural ? Math.max(ZMIN, Math.min(100, Math.floor((wrap.clientWidth - 2) / natural * 100))) : 100;
};
function applyZoom(panel) {
  const table = $$('.cm-ladder', panel)[0];
  if (!table) return;
  const want = zoomOf(panel);
  const pct = want === 'fit' ? fitZoom(panel) : want;
  table.style.zoom = String(pct / 100);
  $$('.cm-zrange', panel).forEach((r) => { r.value = String(pct); r.setAttribute('aria-valuetext', pct + '%'); });
  $$('.cm-zoom button[data-z="fit"]', panel).forEach((b) => b.setAttribute('aria-pressed', String(want === 'fit')));
  $$('.cm-zoom button[data-z="reset"]', panel).forEach((b) => b.setAttribute('aria-pressed', String(want === 100)));
}
const setZoom = (panel, v) => { CM.ui.zoom[panel.dataset.panel] = v === 'fit' ? 'fit' : Math.max(ZMIN, Math.min(ZMAX, Math.round(v))); keepUi(); applyZoom(panel); };
const zoomNow = (panel) => parseFloat($$('.cm-zrange', panel)[0]?.value) || 100;
$$('.cm-zoom').forEach((g) => {
  const panel = g.closest('.cm-panel');
  g.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-z]');
    if (!b) return;
    const z = b.dataset.z;
    setZoom(panel, z === 'fit' ? 'fit' : z === 'reset' ? 100 : (Math.round(zoomNow(panel) / 10) + (z === 'in' ? 1 : -1)) * 10);
  });
  $$('.cm-zrange', g).forEach((r) => r.addEventListener('input', () => setZoom(panel, +r.value)));
});
// Ctrl/⌘ + scroll, or a trackpad pinch, over the matrix zooms it too.
$$('.cm-ladder-wrap').forEach((w) => w.addEventListener('wheel', (ev) => {
  if (!ev.ctrlKey && !ev.metaKey) return;
  ev.preventDefault();
  const panel = w.closest('.cm-panel');
  setZoom(panel, zoomNow(panel) * Math.exp(-ev.deltaY / 250));
}, { passive: false }));
// A fitted matrix refits when filters change its columns or the page changes width.
dash.onData(() => requestAnimationFrame(() => $$('.cm-panel').forEach((p) => { if (zoomOf(p) === 'fit') applyZoom(p); })));
$$('.cm-rank th[data-sort]').forEach((th) => th.addEventListener('click', () => {
  const k = th.dataset.sort;
  CM.ui.sort = { key: k, dir: CM.ui.sort.key === k ? -CM.ui.sort.dir : (k === 'diff' || k === 'change' ? -1 : 1) };
  keepUi(); applyPanels(); dash.draw('rank');
}));
let typing = null;
$$('#f-q').forEach((i) => i.addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(() => dash.setParams({ q: i.value.trim() }), 250); }));
$$('#f-reset').forEach((b) => b.addEventListener('click', () => { $$('#f-q').forEach((i) => { i.value = ''; }); dash.resetParams(); }));

// Keep controls and whole-sentence choices in step with the data and filters.
dash.onData(() => {
  const p = dash.params();
  $$('#f-region').forEach((g) => press(g, p.region || ''));
  $$('#f-reset').forEach((b) => { b.hidden = !(p.region || p.process || p.q || p.asOf); });
  const snaps = dash.data('matrices'), sel = dash.data('selection'), s = dash.data('summary');
  const none = snaps.status === 'ok' && !snaps.data.length;
  const empty = !none && sel.status === 'ok' && !sel.data.length;
  $$('#lede').forEach((e) => { e.hidden = none || empty; });
  $$('#lede-none').forEach((e) => { e.hidden = !none; });
  $$('#lede-empty').forEach((e) => { e.hidden = !empty; });
  const hasPrev = s.status === 'ok' && !!(s.data[0] && s.data[0].prevAsOf);
  $$('#trend-move').forEach((e) => { e.hidden = !hasPrev; });
  $$('#trend-first').forEach((e) => { e.hidden = hasPrev || (s.status === 'ok' && !s.data.length); });
  const rt = dash.data('regionTrend');
  const many = rt.status === 'ok' && new Set(rt.data.map((r) => r.asOf)).size > 1;
  $$('.cm-trend-first').forEach((e) => { e.hidden = many || (rt.status === 'ok' && !rt.data.length); });
  $$('.cm-movers-wrap').forEach((e) => { e.hidden = !hasPrev; });
});

applyPanels();
