// Stand-alone stand-in for the Claude dashboard runtime that the Coffee Matrix page was written for:
// named sources, calculations (dash.calc), drawings (dash.draw), filters (dash.params) and redraws.
(function () {
  const sources = new Map();
  const calcs = new Map();
  const draws = new Map();
  const listeners = [];
  let params = {};
  let cache = new Map();
  let booted = false;
  const colsOf = (v) => (Array.isArray(v) && v[0] && typeof v[0] === 'object' ? Object.keys(v[0]) : []);

  function data(id) {
    if (calcs.has(id)) {
      if (cache.has(id)) return cache.get(id);
      const c = calcs.get(id);
      cache.set(id, { status: 'loading', data: null, columns: [] });
      const ins = c.inputs.map(data);
      const bad = ins.find((x) => x.status !== 'ok');
      let res;
      if (bad) res = { status: bad.status, data: null, columns: [], message: bad.message };
      else {
        try {
          const v = c.fn(...ins.map((x) => x.data));
          res = { status: 'ok', data: v, columns: colsOf(v) };
        } catch (e) {
          console.error('calc ' + id, e);
          res = { status: 'error', data: null, columns: [], message: String((e && e.message) || e) };
        }
      }
      cache.set(id, res);
      return res;
    }
    return sources.get(id) || { status: 'loading', data: [], columns: [] };
  }

  function runDraw(name) {
    const fn = draws.get(name);
    if (!fn) return;
    document.querySelectorAll('[data-draw="' + name + '"]').forEach((el) => {
      try { fn(el); } catch (e) { console.error('draw ' + name, e); }
    });
  }

  function render() {
    if (!booted) return;
    cache = new Map();
    for (const name of draws.keys()) runDraw(name);
    for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } }
  }

  window.dash = {
    data,
    colors: ['#3B82F6', '#BC8700', '#C850C0', '#0ECB81', '#F6465D'],
    calc(id, spec) { calcs.set(id, spec); },
    loader() {},
    draw(name, fn) { if (fn) { draws.set(name, fn); if (booted) runDraw(name); } else if (booted) runDraw(name); },
    onData(fn) { listeners.push(fn); if (booted) fn(); },
    params: () => ({ ...params }),
    setParams(p) {
      params = { ...params, ...p };
      for (const k of Object.keys(params)) if (params[k] === '' || params[k] == null) delete params[k];
      render();
    },
    resetParams() { params = {}; render(); },
    setLink() {},
    refresh() {},
    _set(id, rows) { sources.set(id, { status: 'ok', data: rows, columns: colsOf(rows) }); },
    _boot() { booted = true; render(); }
  };

  // The page has no Claude account behind it: no uploads, no saved rows.
  window.claude = { use: async () => null };

  // Redraw when the page's width changes, as the dashboard does.
  let lastW = window.innerWidth, timer = null;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  });
})();
