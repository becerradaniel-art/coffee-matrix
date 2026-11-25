// Opens the dashboard. The matrix prices are stored encrypted (AES-GCM, key from PBKDF2-SHA256);
// the access code comes from the link (#k=…, never sent to the server) or is typed in, and is kept on this device.
(function () {
  const gate = document.getElementById('gate');
  const form = document.getElementById('gate-form');
  const input = document.getElementById('gate-code');
  const msg = document.getElementById('gate-msg');
  const root = document.getElementById('dash-root');
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const clean = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const fromHash = () => { const m = location.hash.match(/(?:^#|&)k=([^&]+)/); return m ? decodeURIComponent(m[1]) : ''; };
  const stored = () => { try { return localStorage.getItem('cm-access') || ''; } catch (e) { return ''; } };
  const store = (v) => { try { localStorage.setItem('cm-access', v); } catch (e) { /* storage unavailable */ } };
  let box = null;

  async function decrypt(code) {
    box = box || (await fetch('data/matrix.enc.json', { cache: 'no-cache' }).then((r) => r.json()));
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(clean(code)), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64(box.salt), iterations: box.iter }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(box.iv) }, key, b64(box.ct));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  async function open(code, fromLink) {
    msg.textContent = 'Opening…';
    msg.className = 'gate-msg';
    let rows;
    try { rows = await decrypt(code); } catch (e) {
      msg.textContent = fromLink ? 'The code in this link didn’t work. Type the access code instead.' : 'That code didn’t work. Check it and try again.';
      msg.className = 'gate-msg gate-bad';
      gate.hidden = false;
      input.focus();
      return;
    }
    store(clean(code));
    const [world, icons] = await Promise.all([
      fetch('data/world.json').then((r) => r.json()),
      fetch('data/icons.json').then((r) => r.json())
    ]);
    dash._set('original', rows);
    dash._set('snapshots', []);
    dash._set('world', world.rows);
    dash._set('icons', icons);
    gate.hidden = true;
    root.hidden = false;
    dash._boot();
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); if (clean(input.value)) open(input.value, false); });
  if (!window.crypto || !crypto.subtle) {
    msg.textContent = 'This browser can’t open the dashboard. Try a current Chrome, Edge, Safari or Firefox.';
    msg.className = 'gate-msg gate-bad';
    return;
  }
  const code = fromHash() || stored();
  if (code) open(code, !!fromHash());
  else { gate.hidden = false; input.focus(); }
})();
