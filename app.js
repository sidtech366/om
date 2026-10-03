/* ON Mart - app.js (single file, modular sections) */
(function () {
  'use strict';

  // ============== 1. CONFIG (only place to edit) ==============
  const API_URL = 'https://script.google.com/macros/s/AKfycbzYjiB3ddmrPstQhUfQDTqM5907OYfpyKnh6c75jI4aeiPu2ozRRwMOlbFVcsJxyCAqMg/exec';
  const LS_KEY = 'onmart_session';

  const ERR = {
    NETWORK: 'No internet connection. Check your network and try again.',
    INVALID_LOGIN: 'Mobile number or password is incorrect.',
    TOO_MANY_ATTEMPTS: 'Too many wrong attempts. Try again in 15 minutes.',
    ACCOUNT_INACTIVE: 'This account is not active. Contact ON Mart support.',
    UNAUTHORIZED: 'Your session has ended. Sign in again.',
    FORBIDDEN: 'You do not have permission for this action.',
    WEAK_PASSWORD: 'New password must be at least 8 characters.',
    BAD_MOBILE: 'Enter a valid 10-digit mobile number.',
    MOBILE_EXISTS: 'This mobile number is already registered.',
    SERVER_ERROR: 'Something went wrong on our side. Try again.'
  };

  // ============== 2. STATE ==============
  const S = { token: null, expires: null, user: null, perms: {}, config: { company_name: 'ON Mart', speech_feedback: true, image_target_kb: 50, image_max_px: 1280 } };

  function saveSession() { localStorage.setItem(LS_KEY, JSON.stringify({ token: S.token, expires: S.expires })); }
  function loadSession() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (s && s.token && new Date(s.expires).getTime() > Date.now()) { S.token = s.token; S.expires = s.expires; return true; }
    } catch (e) { /* ignore */ }
    localStorage.removeItem(LS_KEY);
    return false;
  }

  // ============== 3. API CLIENT (one POST, text/plain avoids CORS preflight) ==============
  async function api(action, data) {
    let json;
    const ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 30000);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, token: S.token, data: data || {} }),
        signal: ctl.signal
      });
      json = await res.json();
    } catch (e) { throw new Error(ERR.NETWORK); }
    finally { clearTimeout(timer); }
    if (!json.ok) {
      if (json.error === 'UNAUTHORIZED' && S.token) { logout(); }
      throw new Error(ERR[json.error] || json.message || ERR.SERVER_ERROR);
    }
    return json.data;
  }

  // ============== 4. UI HELPERS ==============
  function h(tag, props) {
    const el = document.createElement(tag);
    const kids = Array.prototype.slice.call(arguments, 2);
    Object.keys(props || {}).forEach(function (k) {
      const v = props[k];
      if (k === 'class') el.className = v;
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    });
    kids.reduce(function (a, b) { return a.concat(b); }, []).forEach(function (c) {
      if (c == null || c === false) return;
      el.append(c.nodeType ? c : document.createTextNode(c));
    });
    return el;
  }

  const ICONS = {
    home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.6 3-6 7-6s7 2.4 7 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2.4.6 4 2.4 4 5.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'
  };
  function icon(name) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name] || '';   // static trusted strings only
    return s;
  }

  let toastTimer;
  function toast(msg, isErr) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, 3200);
  }

  /** Optional voice feedback; runs only if Settings allow it and the device supports it. */
  function speak(text) {
    if (!S.config.speech_feedback || !('speechSynthesis' in window)) return;
    try { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(text)); } catch (e) { /* ignore */ }
  }

  /** Disables a button while an async action runs. */
  async function busy(btn, label, fn) {
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = label;
    try { return await fn(); } finally { btn.disabled = false; btn.textContent = old; }
  }

  function field(label, input, hint) {
    const id = 'f_' + Math.random().toString(36).slice(2, 8);
    input.id = id;
    return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('span', { class: 'hint' }, hint) : null);
  }

  function passwordField(label, name, autocomplete) {
    const input = h('input', { type: 'password', name: name, autocomplete: autocomplete, required: true });
    const toggle = h('button', { type: 'button', onclick: function () {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Hide' : 'Show';
    } }, 'Show');
    const wrap = field(label, input);
    wrap.append(h('div', { class: 'pw' }, input, toggle));   // moves the input inside the .pw wrapper
    return { el: wrap, input: input };
  }

  // ============== 5. IMAGE COMPRESSION (reusable from every module) ==============
  // Img.compress(file, {maxPx, targetKB}) -> {blob, mime, sizeKB, base64}. Images only; documents are never touched.
  const Img = {
    async compress(file, opts) {
      const o = Object.assign({ maxPx: S.config.image_max_px || 1280, targetKB: S.config.image_target_kb || 50 }, opts || {});
      if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Choose a JPG, PNG or WebP image.');
      const bmp = await createImageBitmap(file);
      let scale = Math.min(1, o.maxPx / Math.max(bmp.width, bmp.height)), q = 0.82, blob;
      for (let i = 0; i < 10; i++) {
        const w = Math.max(1, Math.round(bmp.width * scale)), hgt = Math.max(1, Math.round(bmp.height * scale));
        const c = document.createElement('canvas'); c.width = w; c.height = hgt;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hgt); ctx.drawImage(bmp, 0, 0, w, hgt);
        blob = await new Promise(function (r) { c.toBlob(r, 'image/jpeg', q); });
        if (blob.size <= o.targetKB * 1024) break;
        if (q > 0.5) q -= 0.12; else scale *= 0.8;
      }
      if (bmp.close) bmp.close();
      const base64 = await new Promise(function (res) {
        const fr = new FileReader(); fr.onload = function () { res(String(fr.result).split(',')[1]); }; fr.readAsDataURL(blob);
      });
      return { blob: blob, mime: 'image/jpeg', sizeKB: Math.round(blob.size / 1024), base64: base64 };
    }
  };

  // ============== 6. AUTH SCREENS ==============
  function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); }

  function authLayout(title, subtitle, form) {
    return h('div', { class: 'auth' },
      h('div', { class: 'auth-hero' },
        h('span', { class: 'tag' }, 'ON'),
        h('div', { class: 'brand-name' }, S.config.company_name),
        h('p', {}, 'New and used products, checked before they are listed.')),
      h('div', { class: 'auth-card' }, h('form', { onsubmit: form.submit, novalidate: true },
        h('div', {}, h('h1', {}, title), subtitle ? h('p', { class: 'muted' }, subtitle) : null),
        form.fields, form.error, form.button)));
  }

  function renderLogin() {
    const mobile = h('input', { type: 'tel', name: 'mobile', inputmode: 'numeric', maxlength: 10, autocomplete: 'username', required: true });
    const pw = passwordField('Password', 'password', 'current-password');
    const error = h('div', { class: 'error', role: 'alert' });
    const button = h('button', { class: 'btn', type: 'submit' }, 'Sign in');
    const submit = function (e) {
      e.preventDefault(); error.textContent = '';
      busy(button, 'Signing in', async function () {
        try {
          const r = await api('auth.login', { mobile: mobile.value.trim(), password: pw.input.value });
          S.token = r.token; S.expires = r.expires_at; S.user = r.user; S.perms = r.permissions;
          saveSession(); start();
        } catch (err) { error.textContent = err.message; }
      });
    };
    mount(authLayout('Sign in', 'Use your registered mobile number.', {
      submit: submit, error: error, button: button, fields: [field('Mobile number', mobile), pw.el]
    }));
  }

  function renderForcePassword() {
    const cur = passwordField('Temporary password', 'current', 'current-password');
    const nw = passwordField('New password', 'new', 'new-password');
    const cf = passwordField('Confirm new password', 'confirm', 'new-password');
    const error = h('div', { class: 'error', role: 'alert' });
    const button = h('button', { class: 'btn', type: 'submit' }, 'Save password');
    mount(authLayout('Set a new password', 'Replace the temporary password before you continue.', {
      submit: function (e) {
        e.preventDefault(); error.textContent = '';
        if (nw.input.value !== cf.input.value) { error.textContent = 'The two new passwords do not match.'; return; }
        busy(button, 'Saving', async function () {
          try {
            await api('auth.changePassword', { oldPassword: cur.input.value, newPassword: nw.input.value });
            S.user.must_change_pw = false; toast('Password saved'); start();
          } catch (err) { error.textContent = err.message; }
        });
      }, error: error, button: button, fields: [cur.el, nw.el, cf.el]
    }));
  }

  function logout() {
    const t = S.token;
    S.token = null; S.user = null; S.perms = {};
    localStorage.removeItem(LS_KEY);
    if (t) { fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'auth.logout', token: t }) }).catch(function () {}); }
    renderLogin();
  }

  // ============== 7. MODULE REGISTRY (add new modules here) ==============
  // perm: [module, action] checked in UI for display only; the server enforces it for real.
  const MODULES = [
    { id: 'dashboard', label: 'Home', icon: 'home', render: renderDashboard },
    { id: 'attendance', label: 'Attendance', icon: 'clock', perm: ['attendance', 'view'], render: renderAttendance },
    { id: 'employees', label: 'People', icon: 'people', perm: ['employees', 'view'], render: renderEmployees },
    { id: 'profile', label: 'Profile', icon: 'user', render: renderProfile },
    { id: 'settings', label: 'Settings', icon: 'gear', perm: ['settings', 'view'], render: renderSettings }
  ];
  function allowed(m) { return !m.perm || !!(S.perms[m.perm[0]] && S.perms[m.perm[0]][m.perm[1]]); }
  function canDo(mod, act) { return !!(S.perms[mod] && S.perms[mod][act]); }

  // ============== 8. SHELL + ROUTER ==============
  function mount(node) { const a = document.getElementById('app'); a.replaceChildren(node); window.scrollTo(0, 0); }

  function renderShell() {
    const main = h('main', { id: 'view' });
    const nav = h('nav', { class: 'nav', 'aria-label': 'Main' }, MODULES.filter(allowed).map(function (m) {
      return h('a', { href: '#/' + m.id, 'data-id': m.id }, icon(m.icon), m.label);
    }));
    const avatar = h('button', { class: 'avatar', 'aria-label': 'Open profile', onclick: function () { location.hash = '#/profile'; } }, initials(S.user.name));
    mount(h('div', { class: 'shell' },
      h('header', { class: 'topbar' }, h('div', { class: 'left' }, h('span', { class: 'tag small' }, 'ON'), h('span', { class: 'brand-name' }, S.config.company_name)), avatar),
      main, nav));
    route();
  }

  async function route() {
    const id = (location.hash.replace('#/', '') || 'dashboard');
    const m = MODULES.find(function (x) { return x.id === id && allowed(x); }) || MODULES[0];
    document.querySelectorAll('.nav a').forEach(function (a) { a.classList.toggle('on', a.dataset.id === m.id); });
    const view = document.getElementById('view');
    if (!view) return;
    view.replaceChildren(h('p', { class: 'muted' }, 'Loading'));
    try { view.replaceChildren(await m.render()); }
    catch (err) { view.replaceChildren(h('div', { class: 'card' }, h('h2', {}, 'Could not load this page'), h('p', { class: 'muted' }, err.message))); }
  }

  // ============== 9. PAGES ==============
  function renderDashboard() {
    return h('div', { class: 'stack' },
      h('div', {}, h('h1', {}, 'Hello, ' + S.user.name), h('p', { class: 'muted' }, 'Signed in as ' + S.user.role_id)),
      h('div', { class: 'card' }, h('h2', {}, 'Dashboard'), h('p', { class: 'muted' }, 'Your numbers and shortcuts will appear here as modules are switched on.')));
  }

  function renderProfile() {
    const u = S.user;
    const name = h('input', { value: u.name, autocomplete: 'name' });
    const mobile = h('input', { value: u.mobile, type: 'tel', inputmode: 'numeric', maxlength: 10 });
    const email = h('input', { value: u.email || '', type: 'email', autocomplete: 'email' });
    const address = h('textarea', { rows: 3, value: u.address || '' });
    address.textContent = u.address || '';
    const saveBtn = h('button', { class: 'btn', type: 'submit' }, 'Save changes');
    const profileForm = h('form', { class: 'card', onsubmit: function (e) {
      e.preventDefault();
      busy(saveBtn, 'Saving', async function () {
        try {
          const r = await api('profile.update', { name: name.value, mobile: mobile.value, email: email.value, address: address.value });
          S.user = Object.assign(S.user, r.user); toast('Changes saved'); renderShell();
        } catch (err) { toast(err.message, true); }
      });
    } },
      h('div', { class: 'row' }, h('div', { class: 'avatar big' }, initials(u.name)), h('div', {}, h('h2', {}, u.name), h('span', { class: 'chip' }, u.role_id), h('p', { class: 'muted' }, u.person_id))),
      h('div', { class: 'grid2' }, field('Full name', name), field('Mobile number', mobile, 'You sign in with this number.')),
      field('Email', email), field('Address', address), saveBtn);

    const cur = passwordField('Current password', 'cur', 'current-password');
    const nw = passwordField('New password', 'new', 'new-password');
    const pwBtn = h('button', { class: 'btn', type: 'submit' }, 'Change password');
    const pwForm = h('form', { class: 'card', onsubmit: function (e) {
      e.preventDefault();
      busy(pwBtn, 'Saving', async function () {
        try { await api('auth.changePassword', { oldPassword: cur.input.value, newPassword: nw.input.value }); cur.input.value = ''; nw.input.value = ''; toast('Password changed'); }
        catch (err) { toast(err.message, true); }
      });
    } }, h('h2', {}, 'Password'), cur.el, nw.el, pwBtn);

    return h('div', { class: 'stack' }, profileForm, pwForm,
      h('div', { class: 'actions' }, h('button', { class: 'btn danger', type: 'button', onclick: logout }, 'Sign out')));
  }

  const SETTING_LABELS = {
    company_name: 'Company name', id_prefix: 'User ID prefix', emp_prefix: 'Employee ID prefix', seller_prefix: 'Seller ID prefix',
    payroll_cycle_days: 'Payroll cycle (days)', inactivity_days: 'Mark inactive after (days)', grace_days: 'Grace period before deletion (days)',
    session_hours: 'Login stays valid for (hours)', speech_feedback: 'Voice confirmation', image_target_kb: 'Image size target (KB)',
    image_max_px: 'Image longest side (pixels)', chat_load_balance: 'Chat assignment', timezone: 'Time zone'
  };
  const SETTING_HINTS = { id_prefix: 'Leave empty to use the first letters of the company name.', timezone: 'For example Asia/Kolkata. Used for attendance dates and times.' };
  const NUMERIC = ['payroll_cycle_days', 'inactivity_days', 'grace_days', 'session_hours', 'image_target_kb', 'image_max_px'];

  async function renderSettings() {
    const vals = await api('settings.get');
    const editable = canDo('settings', 'edit');
    const inputs = {};
    const form = h('form', { class: 'card' }, h('h2', {}, 'Company settings'));
    Object.keys(SETTING_LABELS).forEach(function (k) {
      if (!(k in vals)) return;
      let input;
      if (k === 'speech_feedback') {
        input = h('select', {}, h('option', { value: 'true' }, 'On'), h('option', { value: 'false' }, 'Off'));
        input.value = (vals[k] === true || vals[k] === 'true') ? 'true' : 'false';
      } else if (k === 'chat_load_balance') {
        input = h('select', {}, h('option', { value: 'least_active' }, 'Officer with the fewest open chats'), h('option', { value: 'round_robin' }, 'Take turns'));
        input.value = vals[k] || 'least_active';
      } else {
        input = h('input', { value: vals[k], type: NUMERIC.indexOf(k) > -1 ? 'number' : 'text' });
      }
      if (!editable) input.disabled = true;
      inputs[k] = { el: input, original: String(vals[k]) };
      form.append(field(SETTING_LABELS[k], input, SETTING_HINTS[k]));
    });
    if (editable) {
      const btn = h('button', { class: 'btn', type: 'submit' }, 'Save settings');
      form.append(btn);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const changed = {};
        Object.keys(inputs).forEach(function (k) {
          const raw = inputs[k].el.value;
          if (raw === inputs[k].original) return;
          changed[k] = k === 'speech_feedback' ? raw === 'true' : (NUMERIC.indexOf(k) > -1 ? Number(raw) : raw);
        });
        if (!Object.keys(changed).length) { toast('Nothing to save'); return; }
        busy(btn, 'Saving', async function () {
          try {
            await api('settings.update', { values: changed });
            Object.keys(changed).forEach(function (k) { inputs[k].original = String(changed[k]); });
            const cfg = await api('app.config'); S.config = cfg; toast('Settings saved'); renderShell();
          } catch (err) { toast(err.message, true); }
        });
      });
    } else { form.append(h('p', { class: 'muted' }, 'You can view these settings but not change them.')); }
    return h('div', { class: 'stack' }, form);
  }

  // ============== 9b. SHARED LIST HELPERS ==============
  function todayLocal() { return new Date().toLocaleDateString('en-CA'); }
  function timeShort(t) { return t ? String(t).slice(0, 5) : '-'; }

  function getPosition() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) { reject(new Error('This device cannot share its location.')); return; }
      navigator.geolocation.getCurrentPosition(
        function (p) { resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
        function () { reject(new Error('Allow location access to continue.')); },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });
  }

  /** Paged list used by every module. fetchPage(page) -> {items,total,size}; rowFn(item) -> Node. */
  async function pagedList(fetchPage, rowFn, emptyText) {
    const list = h('div', { class: 'list' });
    const more = h('button', { class: 'btn ghost hidden', type: 'button' }, 'Load more');
    let page = 0;
    async function next() {
      page++;
      const r = await fetchPage(page);
      r.items.forEach(function (i) { list.append(rowFn(i)); });
      if (page === 1 && !r.items.length) list.append(h('p', { class: 'muted' }, emptyText));
      more.classList.toggle('hidden', page * r.size >= r.total);
    }
    more.addEventListener('click', function () { busy(more, 'Loading', next).catch(function (e) { toast(e.message, true); }); });
    await next();
    return h('div', { class: 'stack' }, list, more);
  }

  function deptSelect(depts, value) {
    const sel = h('select', {}, depts.map(function (d) { return h('option', { value: d.dept_id }, d.name); }));
    if (value) sel.value = value;
    return sel;
  }

  // ============== 9c. ATTENDANCE ==============
  async function renderAttendance() {
    const st = await api('att.status');
    const view = h('div', { class: 'stack' }, h('h1', {}, 'Attendance'));
    if (st.employee) {
      view.append(markCard(st), h('h2', {}, 'My history'),
        await pagedList(function (p) { return api('att.history', { page: p }); }, historyRow, 'No attendance recorded yet.'));
    } else {
      view.append(h('div', { class: 'card' }, h('p', { class: 'muted' }, 'Your account is not linked to an employee record, so there is no attendance for you to mark.')));
    }
    if (canDo('attendance', 'edit')) view.append(await teamCard());
    return view;
  }

  function markCard(st) {
    const t = st.today, done = t && t.check_out && t.check_out !== '', type = t ? 'out' : 'in';
    const info = !t ? 'You have not checked in today.'
      : done ? 'In ' + timeShort(t.check_in) + ', out ' + timeShort(t.check_out) + '. You are done for today.'
      : 'Checked in at ' + timeShort(t.check_in) + '.';
    const btn = h('button', { class: 'btn big', type: 'button' }, type === 'in' ? 'Check in' : 'Check out');
    btn.addEventListener('click', function () {
      busy(btn, 'Please wait', async function () {
        try {
          const pos = st.dept.geo_enabled ? await getPosition() : {};
          const r = await api('att.mark', { type: type, lat: pos.lat, lng: pos.lng });
          toast(r.message); speak(r.message); route();
        } catch (err) { toast(err.message, true); }
      });
    });
    return h('div', { class: 'card' }, h('h2', {}, st.dept.name || 'Today'), h('p', {}, info),
      st.dept.geo_enabled ? h('p', { class: 'muted' }, 'Location check is on. Be within ' + st.dept.geo_radius_m + ' m of the office.') : null,
      done ? null : btn);
  }

  function historyRow(r) {
    return h('div', { class: 'item' }, h('div', { class: 'item-head static' },
      h('span', { class: 'grow' }, h('strong', {}, r.date), h('span', { class: 'muted block' }, 'In ' + timeShort(r.check_in) + '   Out ' + timeShort(r.check_out))),
      h('span', { class: 'chip' }, r.status)));
  }

  async function teamCard() {
    const r = await api('att.team', {});
    const card = h('div', { class: 'card' }, h('h2', {}, 'Team today'),
      h('p', { class: 'muted' }, r.present.length + ' present, ' + r.not_marked.length + ' not marked yet'));
    r.present.forEach(function (p) {
      card.append(h('div', { class: 'row between' }, h('span', {}, p.name), h('span', { class: 'muted' }, timeShort(p.check_in) + ' to ' + timeShort(p.check_out))));
    });
    if (r.not_marked.length) card.append(h('h3', {}, 'Not marked yet'), h('p', { class: 'muted' }, r.not_marked.map(function (x) { return x.name; }).join(', ')));
    return card;
  }

  // ============== 9d. EMPLOYEES + DEPARTMENTS ==============
  async function renderEmployees() {
    const depts = await api('dept.list');
    const tabs = [['People', peopleTab]];
    if (canDo('employees', 'edit')) tabs.push(['Departments', deptTab]);
    const body = h('div', {});
    const bar = h('div', { class: 'tabs' });
    async function show(i) {
      bar.querySelectorAll('button').forEach(function (b, j) { b.classList.toggle('on', i === j); });
      body.replaceChildren(h('p', { class: 'muted' }, 'Loading'));
      try { body.replaceChildren(await tabs[i][1](depts)); } catch (err) { body.replaceChildren(h('p', { class: 'error' }, err.message)); }
    }
    tabs.forEach(function (t, i) { bar.append(h('button', { type: 'button', onclick: function () { show(i); } }, t[0])); });
    await show(0);
    return h('div', { class: 'stack' }, h('h1', {}, 'People'), tabs.length > 1 ? bar : null, body);
  }

  async function peopleTab(depts) {
    const box = h('div', { class: 'stack' });
    const search = h('input', { type: 'search', placeholder: 'Search name, ID or mobile' });
    const host = h('div', {});
    let timer;
    async function load() {
      const q = search.value.trim();
      host.replaceChildren(await pagedList(function (p) { return api('emp.list', { page: p, q: q }); },
        function (e) { return empItem(e, depts, load); }, 'No employees found.'));
    }
    search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { load().catch(function (e) { toast(e.message, true); }); }, 350);
    });
    box.append(search);
    if (canDo('employees', 'create')) box.append(addEmployeeCard(depts, load));
    box.append(host);
    await load();
    return box;
  }

  function addEmployeeCard(depts, reload) {
    const name = h('input', { autocomplete: 'off' }), mobile = h('input', { type: 'tel', inputmode: 'numeric', maxlength: 10 });
    const email = h('input', { type: 'email' }), desig = h('input', {}), joined = h('input', { type: 'date', value: todayLocal() });
    const roles = [['employee', 'Employee'], ['officer', 'Officer'], ['manager', 'Manager']];
    if (S.user.role_id === 'captain') roles.push(['ceo', 'CEO']);
    const role = h('select', {}, roles.map(function (r) { return h('option', { value: r[0] }, r[1]); }));
    const dept = deptSelect(depts);
    const salary = canDo('salary', 'edit') ? h('input', { type: 'number', min: 0, inputmode: 'numeric' }) : null;
    const result = h('div', {});
    const save = h('button', { class: 'btn', type: 'submit' }, 'Create employee');
    const form = h('form', { class: 'stack', onsubmit: function (e) {
      e.preventDefault();
      busy(save, 'Saving', async function () {
        try {
          const r = await api('emp.create', { name: name.value, mobile: mobile.value, email: email.value, role_id: role.value, dept_id: dept.value,
            designation: desig.value, joining_date: joined.value, salary: salary ? salary.value : undefined });
          result.replaceChildren(h('div', { class: 'notice' }, h('strong', {}, r.name + ' was added'),
            h('p', {}, 'Employee ID: ' + r.emp_id), h('p', {}, 'Temporary password: ' + r.temp_password),
            h('p', { class: 'muted' }, 'Share this password privately. It is shown only once.')));
          name.value = ''; mobile.value = ''; email.value = ''; desig.value = ''; if (salary) salary.value = '';
          await reload();
        } catch (err) { toast(err.message, true); }
      });
    } },
      h('div', { class: 'grid2' }, field('Full name', name), field('Mobile number', mobile)),
      h('div', { class: 'grid2' }, field('Role', role), field('Department', dept)),
      h('div', { class: 'grid2' }, field('Designation', desig), field('Joining date', joined)),
      field('Email (optional)', email), salary ? field('Monthly salary', salary) : null, save);
    const card = h('div', { class: 'card hidden' }, form, result);
    const toggle = h('button', { class: 'btn', type: 'button', onclick: function () { card.classList.toggle('hidden'); } }, 'Add employee');
    return h('div', { class: 'stack' }, toggle, card);
  }

  function empItem(e, depts, reload) {
    const item = h('div', { class: 'item' });
    const head = h('button', { class: 'item-head', type: 'button', 'aria-expanded': 'false' },
      h('span', { class: 'avatar' }, initials(e.name)),
      h('span', { class: 'grow' }, h('strong', {}, e.name),
        h('span', { class: 'muted block' }, [e.emp_id, e.designation, e.dept_name].filter(Boolean).join(' - '))),
      h('span', { class: 'chip' + (e.status === 'active' ? '' : ' off') }, e.status));
    let detail = null;
    head.addEventListener('click', function () {
      if (detail) { detail.remove(); detail = null; head.setAttribute('aria-expanded', 'false'); return; }
      detail = empDetail(e, depts, reload); item.append(detail); head.setAttribute('aria-expanded', 'true');
    });
    item.append(head);
    return item;
  }

  function empDetail(e, depts, reload) {
    const facts = h('p', { class: 'muted' }, 'Mobile ' + e.mobile + (e.joining_date ? '   Joined ' + e.joining_date : '') + (e.email ? '   ' + e.email : ''));
    if (!canDo('employees', 'edit')) return h('div', { class: 'detail' }, facts);
    const name = h('input', { value: e.name }), desig = h('input', { value: e.designation || '' }), dept = deptSelect(depts, e.dept_id);
    const status = h('select', {}, h('option', { value: 'active' }, 'Active'), h('option', { value: 'inactive' }, 'Inactive'));
    status.value = e.status;
    const canSal = canDo('salary', 'edit') && e.salary !== undefined;
    const salary = canSal ? h('input', { type: 'number', min: 0, value: e.salary }) : null;
    const upi = canSal ? h('input', { value: e.upi_id || '' }) : null;
    const save = h('button', { class: 'btn', type: 'submit' }, 'Save changes');
    return h('form', { class: 'detail', onsubmit: function (ev) {
      ev.preventDefault();
      const payload = { emp_id: e.emp_id, name: name.value, designation: desig.value, dept_id: dept.value, status: status.value };
      if (canSal) { payload.salary = salary.value; payload.upi_id = upi.value; }
      busy(save, 'Saving', async function () {
        try { await api('emp.update', payload); toast('Saved'); await reload(); } catch (err) { toast(err.message, true); }
      });
    } },
      facts,
      h('div', { class: 'grid2' }, field('Full name', name), field('Designation', desig)),
      h('div', { class: 'grid2' }, field('Department', dept), field('Status', status)),
      canSal ? h('div', { class: 'grid2' }, field('Monthly salary', salary), field('UPI ID', upi)) : null,
      !canSal && e.salary !== undefined ? h('p', { class: 'muted' }, 'Monthly salary: Rs ' + e.salary) : null,
      save);
  }

  async function deptTab(depts) {
    const box = h('div', { class: 'stack' });
    async function refresh() {
      const fresh = await api('dept.list');
      depts.splice(0, depts.length);
      fresh.forEach(function (d) { depts.push(d); });
      draw();
    }
    function draw() {
      box.replaceChildren(h('h2', {}, 'Add department'), deptForm(null, refresh), h('h2', {}, 'Departments'),
        depts.length ? depts.map(function (d) { return deptForm(d, refresh); }) : h('p', { class: 'muted' }, 'No departments yet.'));
    }
    draw();
    return box;
  }

  function deptForm(d, done) {
    const isNew = !d; d = d || {};
    const canGeo = canDo('attendance', 'edit');
    const name = h('input', { value: d.name || '' });
    const geo = h('select', {}, h('option', { value: 'false' }, 'Off'), h('option', { value: 'true' }, 'On'));
    geo.value = d.geo_enabled === true ? 'true' : 'false';
    const lat = h('input', { type: 'number', step: 'any', value: d.geo_lat === undefined ? '' : d.geo_lat });
    const lng = h('input', { type: 'number', step: 'any', value: d.geo_lng === undefined ? '' : d.geo_lng });
    const rad = h('input', { type: 'number', min: 20, max: 5000, value: d.geo_radius_m || 100 });
    const useHere = h('button', { class: 'btn ghost', type: 'button', onclick: async function () {
      try { const p = await getPosition(); lat.value = p.lat.toFixed(6); lng.value = p.lng.toFixed(6); toast('Current location filled in'); }
      catch (err) { toast(err.message, true); }
    } }, 'Use my current location');
    const geoBox = h('div', { class: 'stack' }, field('Latitude', lat), field('Longitude', lng), field('Allowed radius (metres)', rad), useHere);
    const sync = function () { geoBox.classList.toggle('hidden', geo.value !== 'true'); };
    geo.addEventListener('change', sync); sync();
    const save = h('button', { class: 'btn', type: 'submit' }, isNew ? 'Add department' : 'Save department');
    return h('form', { class: 'card', onsubmit: function (e) {
      e.preventDefault();
      const payload = { dept_id: d.dept_id, name: name.value };
      if (canGeo) { payload.geo_enabled = geo.value === 'true'; payload.geo_lat = lat.value; payload.geo_lng = lng.value; payload.geo_radius_m = rad.value; }
      busy(save, 'Saving', async function () {
        try { await api('dept.save', payload); toast('Saved'); await done(); } catch (err) { toast(err.message, true); }
      });
    } },
      field('Department name', name),
      canGeo ? field('Location check for attendance', geo, 'When on, staff can mark attendance only near the office.') : null,
      canGeo ? geoBox : null, save);
  }

  // ============== 10. START ==============
  function start() {
    if (S.user && S.user.must_change_pw) { renderForcePassword(); return; }
    renderShell();
  }

  async function boot() {
    window.addEventListener('hashchange', route);
    try {
      if (loadSession()) {
        const me = await api('auth.me');
        S.user = me.user; S.perms = me.permissions; S.config = me.config;
        start(); return;
      }
    } catch (err) { /* fall through to login */ }
    renderLogin();   // show the form at once; company name updates when the server answers
    api('app.config').then(function (c) {
      S.config = c;
      const b = document.querySelector('.auth .brand-name'); if (b) b.textContent = c.company_name;
    }).catch(function () { /* keep defaults */ });
  }

  window.OnMart = { api: api, Img: Img, speak: speak, toast: toast, h: h, canDo: canDo, S: S };  // shared with future modules
  window.addEventListener('error', function (e) {
    const boot = document.querySelector('.boot');
    if (boot) boot.textContent = 'App error: ' + e.message;
  });
  boot();
})();
