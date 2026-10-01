/* Fresh Up – App */
(function () {
  'use strict';
  const FU = window.FU;
  const S = FU.store.state;
  const P = FU.Protocol;
  const U = FU.util;
  const fmt = FU.fmt;
  const { MIN, HOUR, DAY } = FU.const;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const SNOOZE_MIN = 10;
  const LOW_FILL = 60;
  const LOW_BATTERY = 15;

  const sim = (FU.sim = new FU.SimBottle(S.sim));
  let conn = null;
  let mirror = null;
  let screen = 'home';
  let dirty = true;
  let lastBars = -1;
  let goalToastDay = null;
  let autoReconnect = S.device.kind === 'demo';
  let busy = false;
  let mirrorFindUntil = 0;
  let swReg = null;
  let audioCtx = null;
  let installPrompt = null;

  // zuletzt von der Flasche gemeldete Werte
  const dev = { connected: false, fill: null, lid: false, alert: false, dark: false, battery: null };
  const rem = { active: false, lastPush: 0 };

  const markDirty = () => { dirty = true; };
  const today = () => U.totalOfDay(FU.clock.now());
  const nextDue = () => Math.max(S.lastSip + S.settings.interval * MIN, S.snoozeUntil || 0);
  const tour = (step) => { if (FU.demoPanel && FU.demoPanel.mark) FU.demoPanel.mark(step); };

  /* =================== Navigation =================== */
  function go(name) {
    screen = name;
    $$('.screen').forEach((s) => { s.hidden = s.id !== 'screen-' + name; });
    $$('.tabbar button').forEach((b) => {
      if (b.dataset.goto === name) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    $('#appBody').scrollTop = 0;
    render();
  }

  /* =================== Hinweise =================== */
  let toastTimer = null;
  function toast(text, action) {
    const t = $('#toast');
    t.textContent = '';
    const span = document.createElement('span');
    span.textContent = text;
    t.appendChild(span);
    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast-action';
      b.textContent = action.label;
      b.addEventListener('click', () => { t.hidden = true; action.run(); });
      t.appendChild(b);
    }
    t.hidden = false;
    t.style.animation = 'none';
    void t.offsetWidth;
    t.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, action ? 5000 : 2600);
  }

  let pushTimer = null;
  function banner(title, text) {
    $('#pushTitle').textContent = title;
    $('#pushText').textContent = text;
    const p = $('#push');
    p.hidden = false;
    p.style.animation = 'none';
    void p.offsetWidth;
    p.style.animation = '';
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { p.hidden = true; }, 7000);
  }

  function permState() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  }
  async function requestPermission() {
    if (permState() === 'unsupported') { toast('Dieser Browser unterstützt keine Mitteilungen.'); return; }
    try {
      const r = await Notification.requestPermission();
      toast(r === 'granted' ? 'Mitteilungen erlaubt' : 'Mitteilungen bleiben aus');
    } catch (e) {
      toast('Mitteilungen sind hier nicht verfügbar.');
    }
    markDirty();
  }
  function systemNotify(title, body) {
    if (permState() !== 'granted') return;
    const opts = { body, icon: 'assets/icons/icon-192.png', badge: 'assets/icons/icon-192.png', tag: 'freshup-erinnerung', renotify: true, vibrate: [120, 60, 120] };
    try {
      if (swReg && swReg.showNotification) swReg.showNotification(title, opts).catch(() => {});
      else new Notification(title, opts);
    } catch (e) { /* ignorieren */ }
  }
  function setBadge(on) {
    try {
      if (on && navigator.setAppBadge) navigator.setAppBadge(1).catch(() => {});
      else if (!on && navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
    } catch (e) { /* nicht unterstützt */ }
  }
  function chime() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t0 = audioCtx.currentTime;
      [880, 1320].forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.16);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + i * 0.16 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.16 + 0.35);
        o.connect(g).connect(audioCtx.destination);
        o.start(t0 + i * 0.16);
        o.stop(t0 + i * 0.16 + 0.4);
      });
    } catch (e) { /* kein Audio */ }
  }

  /* =================== Verbindung =================== */
  function config() {
    const st = S.settings;
    return { interval: st.interval, enabled: st.reminders, light: st.light, quiet: st.quiet, quietStart: 22, quietEnd: 7, brightness: st.brightness };
  }

  function makeConn(kind) {
    const c = kind === 'ble' ? new FU.BleConnection() : new FU.DemoConnection(sim);
    c.addEventListener('level', (e) => { dev.fill = e.detail.ml; markDirty(); });
    c.addEventListener('status', (e) => { Object.assign(dev, e.detail); markDirty(); });
    c.addEventListener('battery', (e) => { dev.battery = e.detail.pct; markDirty(); });
    c.addEventListener('sip', (e) => onSip(e.detail));
    c.addEventListener('disconnected', (e) => onDisconnected(e.detail.reason));
    return c;
  }

  async function onConnected(c, info) {
    conn = c;
    dev.connected = true;
    S.device.kind = c.kind;
    if (info && info.name) S.device.name = info.name;
    if (info && info.id) S.device.id = info.id;
    if (c.kind === 'ble') S.clock.t = Date.now();
    autoReconnect = c.kind === 'demo';
    await c.syncTime(FU.clock.now());
    await c.writeConfig(config());
    if (S.snoozeUntil > FU.clock.now()) c.command(P.CMD.SNOOZE, Math.ceil((S.snoozeUntil - FU.clock.now()) / MIN));
    lastBars = -1;
    pushProgress();
    FU.store.save();
    markDirty();
    if (c.kind === 'demo') setTimeout(maybeCoach, 1600);
  }

  function onDisconnected(reason) {
    dev.connected = false;
    conn = null;
    toast('Verbindung zur Flasche verloren');
    if (reason) $('#connBanner').title = reason;
    markDirty();
  }

  function disconnect() {
    autoReconnect = false;
    if (conn) conn.disconnect();
    conn = null;
    dev.connected = false;
    toast('Flasche getrennt');
    markDirty();
  }

  // bekannte Demo-Flasche ohne Kopplungsdialog verbinden (wie beim App-Start)
  async function reconnectDemo(silent) {
    if (busy || dev.connected) return;
    busy = true;
    markDirty();
    try {
      const c = makeConn('demo');
      await c.connect(true);
      await onConnected(c, {});
      if (!silent) toast('Verbunden mit der Demo-Flasche');
    } catch (e) {
      if (!silent) toast(e.message);
    } finally {
      busy = false;
      markDirty();
    }
  }

  /* ---------- Kopplungsablauf ---------- */
  function setPair(state, title, text) {
    const p = $('#pair');
    p.dataset.state = state;
    $('#pairBack').textContent = state === 'choose' || state === 'error' ? 'Zurück' : 'Abbrechen';
    if (title) $('#pairTitle').textContent = title;
    if (text != null) $('#pairText').textContent = text;
    const sup = FU.BleConnection.supported();
    $('#pairBle').disabled = !sup;
    $('#pairBleSub').textContent = sup ? 'Echte Flasche über Bluetooth LE koppeln' : 'In diesem Browser nicht verfügbar – Chrome oder Edge nutzen';
  }

  let pairPick = null;
  let pairSession = 0;
  function waitForPick() {
    return new Promise((resolve, reject) => { pairPick = { resolve, reject }; });
  }
  function openPair() {
    go('pair');
    setPair('choose', 'Flasche verbinden', 'Schalte Bluetooth ein und halte deine Fresh Up in die Nähe des Handys.');
  }
  function connectKnown() {
    if (S.device.kind === 'demo') reconnectDemo(false);
    else if (S.device.kind === 'ble') startPairing('ble');
    else openPair();
  }

  async function startPairing(kind) {
    if (busy) return;
    const sid = ++pairSession;
    const alive = () => { if (sid !== pairSession) throw new Error('Abgebrochen'); };
    go('pair');
    if (kind === 'ble' && !FU.BleConnection.supported()) {
      setPair('error', 'Bluetooth nicht verfügbar', 'Dieser Browser unterstützt kein Web Bluetooth. Öffne Fresh Up in Chrome oder Edge (Android, Windows, macOS) – oder verbinde die Demo-Flasche.');
      return;
    }
    busy = true;
    if (conn) { conn.disconnect(); conn = null; dev.connected = false; }
    const c = makeConn(kind);
    try {
      setPair('scanning', 'Suche nach Fresh Up …', kind === 'ble' ? 'Wähle deine Flasche im Bluetooth-Dialog aus.' : 'Halte die Flasche in die Nähe deines Handys.');
      const info = await c.scan();
      alive();
      if (kind === 'demo') {
        $('#pairName').textContent = info.name;
        $('#pairMeta').textContent = 'Signal ' + (info.rssi > -60 ? 'stark' : 'mittel') + ' (' + info.rssi + ' dBm) · Akku ' + info.battery + ' %';
        setPair('found', '1 Flasche gefunden', 'Tippe auf deine Flasche, um sie zu koppeln.');
        await waitForPick();
        alive();
      }
      setPair('connecting', 'Verbinde …', 'Einstellungen und Uhrzeit werden auf die Flasche übertragen.');
      await c.connect();
      try { alive(); } catch (e) { c.disconnect(); throw e; }
      await onConnected(c, info);
      setPair('done', 'Verbunden!', info.name + ' ist jetzt mit der App gekoppelt.');
      setTimeout(() => { if (screen === 'pair') go('home'); }, 1100);
    } catch (e) {
      if (e && e.message === 'Abgebrochen') setPair('choose', 'Flasche verbinden', 'Schalte Bluetooth ein und halte deine Fresh Up in die Nähe des Handys.');
      else if (e && e.name === 'NotFoundError') setPair('choose', 'Flasche verbinden', 'Keine Flasche ausgewählt. Versuch es noch einmal.');
      else if (e && e.name === 'AbortError') setPair('choose', 'Flasche verbinden', 'Schalte Bluetooth ein und halte deine Fresh Up in die Nähe des Handys.');
      else setPair('error', 'Verbindung fehlgeschlagen', (e && e.message) || 'Unbekannter Fehler.');
    } finally {
      busy = false;
      pairPick = null;
      markDirty();
    }
  }

  /* =================== Trinkdaten =================== */
  function addEntry(t, ml, src, seq) {
    const e = { t, ml, src };
    if (seq != null) e.seq = seq;
    S.entries.push(e);
    if (S.entries.length > 1 && S.entries[S.entries.length - 2].t > t) S.entries.sort((a, b) => a.t - b.t);
    if (t > S.lastSip) S.lastSip = t;
    S.snoozeUntil = 0;
    clearReminder();
    pushProgress();
    checkGoal();
    FU.store.save();
    markDirty();
    return e;
  }

  function dropEntry(e) {
    const i = S.entries.indexOf(e);
    if (i < 0) return false;
    S.entries.splice(i, 1);
    pushProgress();
    FU.store.save();
    markDirty();
    return true;
  }
  function restoreEntry(e) {
    S.entries.push(e);
    S.entries.sort((a, b) => a.t - b.t);
    pushProgress();
    FU.store.save();
    markDirty();
  }
  function removeEntry(e) {
    if (!dropEntry(e)) return;
    toast('Eintrag gelöscht (' + e.ml + ' ml)', { label: 'Rückgängig', run: () => restoreEntry(e) });
  }

  function onSip({ ml, t, seq }) {
    // Doppelte Meldungen (z. B. nach Wiederverbindung) anhand Zeit + laufender Nummer erkennen
    if (S.entries.some((e) => e.src === 'bottle' && e.t === t && (seq == null || e.seq === seq))) return;
    addEntry(t, ml, 'bottle', seq);
    celebrateSip(ml);
    toast('+' + ml + ' ml erkannt');
    tour('sip');
  }

  function addManual(ml) {
    const e = addEntry(FU.clock.now(), ml, 'manual');
    if (conn && dev.connected) conn.command(P.CMD.RESET_TIMER);
    celebrateSip(ml);
    toast('+' + ml + ' ml eingetragen', { label: 'Rückgängig', run: () => dropEntry(e) });
  }

  function celebrateSip(ml) {
    const f = $('#ringFloat');
    f.textContent = '+' + ml + ' ml';
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
    const w = $('#ringWrap');
    w.classList.remove('pulse');
    void w.offsetWidth;
    w.classList.add('pulse');
  }

  function pushProgress() {
    const bars = U.progressBars(today(), S.goal);
    if (conn && dev.connected && bars !== lastBars) {
      conn.writeLed(bars);
      lastBars = bars;
    }
  }

  function streakDays(now) {
    const start = U.startOfDay(now);
    let n = U.totalOfDay(now) >= S.goal ? 1 : 0;
    for (let i = 1; i < 14; i++) {
      if (U.totalOfDay(start - i * DAY + 12 * HOUR) >= S.goal) n++;
      else break;
    }
    return n;
  }

  function checkGoal() {
    const key = U.startOfDay(FU.clock.now());
    if (today() >= S.goal && goalToastDay !== key) {
      goalToastDay = key;
      setTimeout(() => {
        toast('Tagesziel erreicht. Stark!');
        const g = $('#goalCard');
        g.classList.remove('celebrate');
        void g.offsetWidth;
        g.classList.add('celebrate');
      }, 700);
    }
  }

  /* =================== Erinnerung =================== */
  function clearReminder() {
    rem.active = false;
    $('#push').hidden = true;
    setBadge(false);
  }

  function checkReminder(now) {
    const st = S.settings;
    const due = nextDue();
    const quiet = st.quiet && U.isQuiet(now);
    if (!S.onboarded || !st.reminders || quiet || now < due) {
      if (rem.active) { clearReminder(); markDirty(); }
      return;
    }
    if (!rem.active) {
      rem.active = true;
      rem.lastPush = now;
      setBadge(true);
      tour('reminder');
      fire(now);
      markDirty();
    } else if (now - rem.lastPush >= st.interval * MIN) {
      rem.lastPush = now;
      fire(now);
    }
  }

  function fire(now) {
    const st = S.settings;
    if (!st.push) return;
    const mins = Math.round((now - S.lastSip) / MIN);
    const lowFill = dev.connected && dev.fill != null && dev.fill <= LOW_FILL;
    const title = 'Zeit für einen Schluck!';
    const body = lowFill
      ? 'Deine Flasche ist fast leer – füll sie auf und trink einen Schluck.'
      : 'Du hast schon ' + mins + ' Minuten nicht mehr getrunken.' + (dev.connected && dev.dark ? ' Deine Flasche steckt in der Tasche.' : '');
    banner(title, body);
    if (document.visibilityState === 'hidden') systemNotify(title, body);
    if (st.sound) chime();
    const active = !navigator.userActivation || navigator.userActivation.hasBeenActive;
    if (navigator.vibrate && active) { try { navigator.vibrate([120, 60, 120]); } catch (e) { /* ignorieren */ } }
  }

  function snooze() {
    const now = FU.clock.now();
    S.snoozeUntil = now + SNOOZE_MIN * MIN;
    clearReminder();
    if (conn && dev.connected) conn.command(P.CMD.SNOOZE, SNOOZE_MIN);
    FU.store.save();
    markDirty();
    toast('Erinnerung verschoben auf ' + fmt.time(S.snoozeUntil));
  }

  function triggerReminder() {
    const now = FU.clock.now();
    S.lastSip = now - S.settings.interval * MIN;
    S.snoozeUntil = 0;
    sim.s.lastSip = Math.min(sim.s.lastSip, S.lastSip);
    sim.s.snoozeUntil = 0;
    rem.active = false;
    if (S.settings.quiet && U.isQuiet(now)) toast('Ruhezeit aktiv: In den Einstellungen ausschalten.');
    markDirty();
  }

  /* =================== Hilfen =================== */
  function maybeCoach() {
    if (S.coachSeen || S.device.kind !== 'demo' || !S.onboarded) return;
    if (!window.matchMedia('(max-width: 879px)').matches) return;
    $('#coach').hidden = false;
  }
  function closeCoach() {
    S.coachSeen = true;
    $('#coach').hidden = true;
    FU.store.save();
  }

  const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /* =================== Darstellung =================== */
  function applyTheme() {
    const t = S.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else if (document.documentElement.dataset.fuTheme) document.documentElement.removeAttribute('data-theme');
    document.documentElement.dataset.fuTheme = t;
  }

  function ledMirrorMode() {
    if (performance.now() < mirrorFindUntil) return 'find';
    if (!dev.connected) return 'off';
    if (dev.alert && S.settings.light && !dev.dark) return 'alert';
    if (dev.dark) return 'off';
    return 'progress';
  }

  function legend(ul) {
    ul.textContent = '';
    for (let i = 1; i <= 4; i++) {
      const li = document.createElement('li');
      const chip = document.createElement('span');
      chip.className = 'led-chip';
      for (let k = 0; k < 4; k++) { const b = document.createElement('i'); if (k < i) b.className = 'on'; chip.appendChild(b); }
      li.appendChild(chip);
      li.appendChild(document.createTextNode(i * 25 + ' % · ab ' + fmt.liters((S.goal * i) / 4)));
      ul.appendChild(li);
    }
    const li = document.createElement('li');
    const chip = document.createElement('span');
    chip.className = 'led-chip red';
    for (let k = 0; k < 4; k++) chip.appendChild(document.createElement('i'));
    li.appendChild(chip);
    li.appendChild(document.createTextNode('blinkt rot: ' + S.settings.interval + ' Minuten ohne Schluck'));
    ul.appendChild(li);
  }

  // Flaschen-Karte auf Home
  function renderConn() {
    const b = $('#connBanner');
    let state, sub, status;
    const title = S.device.kind === 'demo' ? 'Demo-Flasche' : S.device.kind === 'ble' ? S.device.name : 'Keine Flasche verbunden';
    if (busy) { state = 'busy'; status = 'Verbinde …'; }
    else if (dev.connected) { state = 'on'; status = 'Verbunden' + (dev.battery != null ? ' · ' + dev.battery + ' %' : ''); }
    else { state = 'off'; status = S.device.kind ? 'Nicht verbunden' : 'Koppeln'; }
    if (dev.fill != null) sub = Math.round(dev.fill) + ' ml in der Flasche' + (dev.lid ? ' · Deckel offen' : '') + (dev.connected ? '' : ' · zuletzt gemeldet');
    else sub = S.device.kind ? 'Tippe hier, um die Flasche zu verbinden' : 'Tippe hier, um deine Fresh Up zu koppeln';
    b.dataset.state = state;
    $('#bcTitle').textContent = title;
    $('#bcSub').textContent = sub;
    $('#connText').textContent = status;
    $('#miniFill').style.height = (dev.fill == null ? 0 : Math.max(0, Math.min(1, dev.fill / 750)) * 100) + '%';
    $('#demoOpen').hidden = S.device.kind === 'ble';
  }

  function renderHint() {
    const card = $('#hintCard');
    let kind = null, title = '', text = '';
    if (dev.connected && dev.battery != null && dev.battery <= LOW_BATTERY) {
      kind = 'battery';
      title = 'Akku schwach · ' + dev.battery + ' %';
      text = 'Lade deine Fresh Up bald auf, damit Licht-Signal und Bluetooth weiterlaufen.';
    } else if (dev.connected && dev.fill != null && dev.fill <= LOW_FILL) {
      kind = 'empty';
      title = dev.fill < 5 ? 'Flasche leer' : 'Flasche fast leer · ' + Math.round(dev.fill) + ' ml';
      text = 'Füll sie auf, damit der nächste Schluck bereitsteht.';
    }
    card.hidden = !kind;
    if (kind) {
      card.dataset.kind = kind;
      $('#hintTitle').textContent = title;
      $('#hintText').textContent = text;
    }
  }

  function renderTimeline(now) {
    const el = $('#timeline');
    el.textContent = '';
    const start = U.startOfDay(now) + 6 * HOUR;
    const span = 16 * HOUR;
    const pos = (t) => Math.max(0, Math.min(100, ((t - start) / span) * 100));
    U.entriesOfDay(now).forEach((e) => {
      const d = document.createElement('i');
      d.className = 'tl-dot' + (e.src === 'manual' ? ' manual' : '');
      const size = 7 + Math.min(9, e.ml / 40);
      d.style.left = pos(e.t) + '%';
      d.style.width = d.style.height = size + 'px';
      el.appendChild(d);
    });
    const n = document.createElement('i');
    n.className = 'tl-now';
    n.style.left = pos(now) + '%';
    el.appendChild(n);
  }

  function renderHome(now) {
    const h = new Date(now).getHours();
    $('#greetTitle').textContent = h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend';
    $('#greetDate').textContent = fmt.date(now);

    // Alarm
    $('#alarmCard').hidden = !rem.active;
    if (rem.active) {
      const mins = Math.round((now - S.lastSip) / MIN);
      $('#alarmSince').textContent = mins < 60 ? 'Schon ' + mins + ' Minuten her.' : 'Schon ' + fmt.duration(now - S.lastSip) + ' her.';
    }
    renderHint();
    const reached = today() >= S.goal;
    $('#goalCard').hidden = !(reached && S.goalCardHidden !== U.startOfDay(now));
    if (reached) {
      const st = streakDays(now);
      $('#goalText').textContent = fmt.liters(today()) + ' getrunken' + (st > 1 ? ' · ' + st + ' Tage in Folge' : '');
    }
    $('#permCard').hidden = !(S.onboarded && permState() === 'default' && !S.permDismissed);

    // Tagesziel
    const total = today();
    const pct = total / S.goal;
    $('#ringFill').setAttribute('stroke-dasharray', Math.min(100, pct * 100).toFixed(1) + ' 100');
    $('#ringWrap').classList.toggle('done', pct >= 1);
    $('#ringValue').textContent = fmt.liters(total);
    $('#ringGoal').textContent = 'von ' + fmt.liters(S.goal);
    $('#intakePct').textContent = fmt.pct(pct) + ' erreicht';
    $('#intakeLeft').textContent = total >= S.goal ? 'Ziel geschafft' : 'Noch ' + fmt.liters(S.goal - total);

    // Nächster Schluck
    const st = S.settings;
    const due = nextDue();
    let state, text;
    if (!st.reminders) { state = 'off'; text = 'Erinnerung ausgeschaltet'; }
    else if (st.quiet && U.isQuiet(now)) { state = 'off'; text = 'Ruhezeit bis 07:00 Uhr'; }
    else if (rem.active) { state = 'due'; text = 'Jetzt ist ein Schluck fällig'; }
    else if (S.snoozeUntil && S.snoozeUntil >= due && S.snoozeUntil > now) { state = 'snooze'; text = 'Verschoben · Erinnerung um ' + fmt.time(due); }
    else { state = 'ok'; text = 'Nächster Schluck in ' + fmt.duration(due - now); }
    $('#nextPill').dataset.state = state;
    $('#nextText').textContent = text;

    // Erinnerung (Kanäle)
    $('#reminderTitle').textContent = 'Erinnerung alle ' + st.interval + ' Minuten';
    $('#reminderToggle').checked = st.reminders;
    $('#reminderSub').textContent = !st.reminders ? 'ausgeschaltet'
      : st.light && st.push ? 'Rotes Licht an der Flasche + Mitteilung aufs Handy'
        : st.light ? 'Nur rotes Licht an der Flasche'
          : st.push ? 'Nur Mitteilung aufs Handy' : 'Licht und Mitteilung sind aus';

    const list = U.entriesOfDay(now);
    $('#historySummary').textContent = list.length ? list.length + (list.length === 1 ? ' Schluck' : ' Schlucke') + ' · zuletzt ' + fmt.time(list[list.length - 1].t) : 'Heute noch kein Schluck';
    renderTimeline(now);
  }

  function renderStats(now) {
    const todayStart = U.startOfDay(now);
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const t = todayStart - i * DAY + 12 * HOUR;
      days.push({ ml: U.totalOfDay(t), label: i === 0 ? 'Heute' : fmt.weekday(t), today: i === 0 });
    }
    FU.charts.hours($('#hourChart'), U.entriesOfDay(now), now);
    FU.charts.week($('#weekChart'), days, S.goal);

    const prev = days.slice(0, 6).filter((d) => d.ml > 0);
    $('#kpiAvg').textContent = prev.length ? fmt.liters(prev.reduce((s, d) => s + d.ml, 0) / prev.length) : fmt.liters(days[6].ml);
    const streak = streakDays(now);
    $('#kpiStreak').textContent = streak + (streak === 1 ? ' Tag' : ' Tage');
    const all = S.entries.reduce((s, e) => s + e.ml, 0);
    $('#kpiBottles').textContent = Math.floor(all / 500);
    const hasExample = S.entries.some((e) => e.ex);
    $('#exampleNote').textContent = 'Gestrichelte Linie: Tagesziel ' + fmt.liters(S.goal) + '.' + (hasExample ? ' Vortage sind Beispieldaten.' : '');

    const ol = $('#historyList');
    ol.textContent = '';
    const list = U.entriesOfDay(now).slice().reverse();
    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'empty-row';
      li.innerHTML = '<span class="empty">Heute noch kein Schluck</span>';
      ol.appendChild(li);
    }
    list.forEach((e) => {
      const li = document.createElement('li');
      li.innerHTML = '<time></time><span class="src"></span><span class="amt"></span><button type="button" class="del"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
      li.children[0].textContent = fmt.time(e.t);
      li.children[1].textContent = e.src === 'manual' ? 'Manuell eingetragen' : 'Aus der Flasche' + (e.ex ? ' (Beispiel)' : '');
      li.children[2].textContent = '+' + e.ml + ' ml';
      const del = li.children[3];
      del.setAttribute('aria-label', 'Eintrag von ' + fmt.time(e.t) + ' löschen');
      del.addEventListener('click', () => removeEntry(e));
      ol.appendChild(li);
    });
  }

  function renderBottle() {
    const mode = ledMirrorMode();
    const bars = U.progressBars(today(), S.goal);
    if (dev.fill != null) mirror.setFill(dev.fill);
    mirror.setLid(dev.lid);
    mirror.setLed(mode, bars, S.settings.brightness);
    const ledText = { progress: bars + ' von 4 Balken blau', alert: 'blinkt rot', off: dev.connected ? 'aus (dunkel)' : '–', find: 'blinkt blau' }[mode];
    const conText = dev.connected ? 'Verbunden' + (S.device.kind === 'demo' ? ' · ' + sim.rssi() + ' dBm' : '') : busy ? 'Verbinde …' : 'Nicht verbunden';
    $('#dvConn').textContent = conText;
    $('#dvFill').textContent = dev.fill == null ? '–' : Math.round(dev.fill) + ' von 750 ml';
    const led = $('#dvLed');
    led.textContent = ledText;
    led.classList.toggle('alert', mode === 'alert');
    $('#dvLid').textContent = dev.connected ? (dev.lid ? 'offen' : 'geschlossen') : '–';
    $('#dvPlace').textContent = dev.connected ? (dev.dark ? 'In einer Tasche (dunkel)' : 'Steht frei (hell)') : '–';
    const bat = $('#dvBattery');
    bat.textContent = dev.battery == null ? '–' : dev.battery + ' %';
    bat.classList.toggle('alert', dev.battery != null && dev.battery <= LOW_BATTERY);
    $('#dvSerial').textContent = S.device.id || '–';
    $('#findBtn').disabled = !dev.connected;
    const ct = $('#connToggleBtn');
    ct.textContent = dev.connected ? 'Trennen' : 'Verbinden';
    ct.disabled = busy;
  }

  function renderSettings() {
    const st = S.settings;
    $('#goalOut').textContent = fmt.liters(S.goal);
    $('#goalRange').value = (S.goal / 1000).toFixed(1);
    $$('[data-goal]').forEach((b) => b.setAttribute('aria-pressed', String(Math.round(Number(b.dataset.goal) * 1000) === S.goal)));
    legend($('#ledLegend'));
    $$('#intervalSeg button').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.interval) === st.interval)));
    $$('#themeSeg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeOpt === st.theme)));
    $('#setLight').checked = st.light;
    $('#setPush').checked = st.push;
    $('#setQuiet').checked = st.quiet;
    $('#setSound').checked = st.sound;
    $('#setBright').value = st.brightness;
    $('#brightOut').textContent = st.brightness + ' %';
    const ps = permState();
    $('#permState').textContent = { granted: 'erlaubt', denied: 'blockiert (Browser-Einstellungen)', default: 'noch nicht erlaubt', unsupported: 'nicht unterstützt' }[ps];
    $('#permBtn2').hidden = ps !== 'default';
    // Installation
    const ib = $('#installBtn');
    if (isStandalone()) { $('#installText').textContent = 'Fresh Up ist installiert'; ib.hidden = true; }
    else if (installPrompt) { $('#installText').textContent = 'Als App auf dem Startbildschirm, auch offline'; ib.hidden = false; }
    else if (isIOS()) { $('#installText').textContent = 'In Safari: Teilen → „Zum Home-Bildschirm“'; ib.hidden = true; }
    else { $('#installText').textContent = 'Im Browser-Menü „App installieren“ wählen'; ib.hidden = true; }
  }

  function render() {
    const now = FU.clock.now();
    renderConn();
    if (screen === 'home') renderHome(now);
    else if (screen === 'stats') renderStats(now);
    else if (screen === 'bottle') renderBottle();
    else if (screen === 'settings') renderSettings();
  }

  /* =================== Onboarding =================== */
  let obStep = 0;
  function obShow(n) {
    obStep = n;
    $$('.ob-step').forEach((s) => { s.hidden = Number(s.dataset.step) !== n; });
    $('#onboarding').scrollTop = 0;
    if (n === 1) $$('.use').forEach((u) => u.setAttribute('aria-checked', String(u.dataset.use === S.use)));
    if (n === 2) {
      $('#obGoal').value = (S.goal / 1000).toFixed(1);
      $('#obGoalOut').textContent = fmt.liters(S.goal);
      legend($('#obLedLegend'));
    }
  }
  function obFinish(pairNow) {
    S.onboarded = true;
    // Die erste Erinnerung kommt drei Minuten nach dem Einrichten
    const now = FU.clock.now();
    if (now - S.lastSip > (S.settings.interval - 3) * MIN) {
      S.lastSip = now - (S.settings.interval - 3) * MIN;
      sim.s.lastSip = Math.max(sim.s.lastSip, S.lastSip);
    }
    $('#onboarding').hidden = true;
    FU.store.save();
    if (pairNow) openPair();
    else { go('home'); reconnectDemo(false); }
  }

  /* =================== Ereignisse =================== */
  function syncConfig() {
    if (conn && dev.connected) conn.writeConfig(config());
    FU.store.save();
    markDirty();
  }

  function bind() {
    $$('[data-goto]').forEach((b) => b.addEventListener('click', () => go(b.dataset.goto)));

    // Home
    $('#connBanner').addEventListener('click', () => {
      if (dev.connected) go('bottle');
      else connectKnown();
    });
    $('#drinkNowBtn').addEventListener('click', () => {
      if (conn && dev.connected && conn.kind === 'demo') FU.demoPanel.drinkFromApp();
      else if (dev.connected) toast('Trink einen Schluck – Fresh Up erkennt ihn automatisch.');
      else toast('Verbinde deine Flasche, damit Schlucke erkannt werden.');
    });
    $('#snoozeBtn').addEventListener('click', snooze);
    $('#reminderToggle').addEventListener('change', (e) => { S.settings.reminders = e.target.checked; syncConfig(); });
    $$('[data-add]').forEach((b) => b.addEventListener('click', () => addManual(Number(b.dataset.add))));
    $('#permBtn').addEventListener('click', requestPermission);
    $('#permLater').addEventListener('click', () => { S.permDismissed = true; FU.store.save(); markDirty(); });
    $('#goalClose').addEventListener('click', () => { S.goalCardHidden = U.startOfDay(FU.clock.now()); FU.store.save(); markDirty(); });
    $('#push').addEventListener('click', () => { $('#push').hidden = true; go('home'); });
    $('#coachOk').addEventListener('click', closeCoach);
    $('#demoOpen').addEventListener('click', () => { if (!$('#coach').hidden) closeCoach(); });

    // Flasche
    $('#findBtn').addEventListener('click', () => {
      if (!conn || !dev.connected) return;
      conn.command(P.CMD.FIND);
      mirrorFindUntil = performance.now() + 4000;
      toast('Deine Flasche blinkt jetzt blau');
      markDirty();
    });
    $('#connToggleBtn').addEventListener('click', () => {
      if (dev.connected) disconnect();
      else connectKnown();
    });
    const explode = $('#explodeBtn');
    const setExplode = (on) => { mirror.setExploded(on); explode.setAttribute('aria-pressed', String(on)); explode.textContent = on ? 'Zusammenbauen' : 'Explosionsansicht'; };
    explode.addEventListener('click', () => setExplode(explode.getAttribute('aria-pressed') !== 'true'));
    $$('#partList button').forEach((b) => b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      $$('#partList button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', String(on));
      mirror.highlight(on ? b.dataset.part : null);
      if (on) setExplode(true);
      $('#mirrorHost').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }));

    // Einstellungen
    $('#goalRange').addEventListener('input', (e) => { S.goal = Math.round(Number(e.target.value) * 1000); $('#goalOut').textContent = fmt.liters(S.goal); });
    $('#goalRange').addEventListener('change', () => { pushProgress(); FU.store.save(); markDirty(); });
    $$('[data-goal]').forEach((b) => b.addEventListener('click', () => { S.goal = Math.round(Number(b.dataset.goal) * 1000); pushProgress(); FU.store.save(); markDirty(); }));
    $$('#intervalSeg button').forEach((b) => b.addEventListener('click', () => { S.settings.interval = Number(b.dataset.interval); rem.active = false; syncConfig(); }));
    [['#setLight', 'light'], ['#setPush', 'push'], ['#setQuiet', 'quiet'], ['#setSound', 'sound']].forEach(([sel, key]) => {
      $(sel).addEventListener('change', (e) => { S.settings[key] = e.target.checked; syncConfig(); });
    });
    $('#setBright').addEventListener('input', (e) => { S.settings.brightness = Number(e.target.value); $('#brightOut').textContent = S.settings.brightness + ' %'; });
    $('#setBright').addEventListener('change', syncConfig);
    $$('#themeSeg button').forEach((b) => b.addEventListener('click', () => { S.settings.theme = b.dataset.themeOpt; applyTheme(); FU.store.save(); markDirty(); }));
    $('#permBtn2').addEventListener('click', requestPermission);
    $('#installBtn').addEventListener('click', async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      try { await installPrompt.userChoice; } catch (e) { /* abgebrochen */ }
      installPrompt = null;
      markDirty();
    });
    const reset = $('#resetBtn');
    let resetTimer = null;
    reset.addEventListener('click', () => {
      if (reset.dataset.confirm === '1') {
        if (conn) conn.disconnect();
        FU.store.reset();
        location.reload();
        return;
      }
      reset.dataset.confirm = '1';
      reset.textContent = 'Wirklich zurücksetzen? Nochmal tippen';
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => { reset.dataset.confirm = ''; reset.textContent = 'App zurücksetzen'; }, 4000);
    });

    // Koppeln
    $('#pairBle').addEventListener('click', () => startPairing('ble'));
    $('#pairDemo').addEventListener('click', () => startPairing('demo'));
    $('#pairDeviceBtn').addEventListener('click', () => { if (pairPick) pairPick.resolve(); });
    $('#pairBack').addEventListener('click', () => {
      pairSession++;
      if (pairPick) { pairPick.reject(new Error('Abgebrochen')); pairPick = null; }
      go('home');
    });

    // Onboarding
    $$('[data-ob-next]').forEach((b) => b.addEventListener('click', () => obShow(obStep + 1)));
    $$('[data-ob-skip]').forEach((b) => b.addEventListener('click', () => obFinish(false)));
    $$('[data-ob-finish]').forEach((b) => b.addEventListener('click', () => obFinish(true)));
    $$('.use').forEach((u) => u.addEventListener('click', () => {
      S.use = u.dataset.use;
      S.goal = Math.round(Number(u.dataset.goal) * 1000);
      $$('.use').forEach((x) => x.setAttribute('aria-checked', String(x === u)));
    }));
    $('#obGoal').addEventListener('input', (e) => {
      S.goal = Math.round(Number(e.target.value) * 1000);
      $('#obGoalOut').textContent = fmt.liters(S.goal);
      legend($('#obLedLegend'));
    });

    // Installation (Chrome/Edge/Android)
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; markDirty(); });
    window.addEventListener('appinstalled', () => { installPrompt = null; toast('Fresh Up ist installiert'); markDirty(); });

    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') FU.store.saveNow(); });
    window.addEventListener('pagehide', () => FU.store.saveNow());
  }

  /* =================== Takt =================== */
  let lastReal = performance.now();
  let lastRender = 0;
  let lastSave = 0;
  function loop() {
    const t = performance.now();
    const dt = t - lastReal;
    // Im Hintergrund läuft die Zeit normal weiter; sichtbar begrenzt, damit der Zeitraffer nicht springt
    FU.clock.advance(document.visibilityState === 'hidden' ? dt : Math.min(1000, dt));
    lastReal = t;
    const now = FU.clock.now();
    sim.tick(now);
    checkReminder(now);
    pushProgress();
    if (autoReconnect && !dev.connected && !busy && S.device.kind === 'demo' && sim.s.radio) reconnectDemo(false);
    FU.demoPanel.tick(now);
    // Listen und Formulare nur bei Änderungen neu zeichnen (sonst gehen Klicks verloren)
    const periodic = screen === 'home' || screen === 'bottle';
    if (dirty || (periodic && t - lastRender > 1000) || (screen === 'bottle' && t < mirrorFindUntil + 300)) {
      dirty = false;
      lastRender = t;
      render();
    }
    if (t - lastSave > 5000) { lastSave = t; FU.store.save(); }
  }

  /* =================== Start =================== */
  function start() {
    applyTheme();
    mirror = new FU.BottleView($('#mirrorHost'), { bags: false });
    const upgradeMirror = () => {
      if (!FU.Bottle3D || !FU.Bottle3D.supported() || mirror.is3d) return;
      try {
        const host = $('#mirrorHost');
        host.classList.add('is-3d');
        const m3 = new FU.Bottle3D(host, { bags: false, backdrop: 'card' });
        m3.is3d = true;
        const ex = $('#explodeBtn').getAttribute('aria-pressed') === 'true';
        mirror = m3;
        mirror.setExploded(ex);
        const sel = document.querySelector('#partList button[aria-pressed="true"]');
        mirror.highlight(sel ? sel.dataset.part : null);
        markDirty();
      } catch (e) {
        $('#mirrorHost').classList.remove('is-3d');
        mirror = new FU.BottleView($('#mirrorHost'), { bags: false });
      }
    };
    if (FU.Bottle3D) upgradeMirror();
    else window.addEventListener('fu:3d-ready', upgradeMirror, { once: true });
    FU.demoPanel.init(sim, { triggerReminder });
    bind();
    if (today() >= S.goal) goalToastDay = U.startOfDay(FU.clock.now());

    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('sw.js').then((r) => { swReg = r; }).catch(() => {});
    }

    go('home');
    if (!S.onboarded) {
      $('#onboarding').hidden = false;
      obShow(0);
    } else if (S.device.kind === 'demo') {
      reconnectDemo(true);
    }
    setInterval(loop, 200);
  }

  FU.app = { go, toast, triggerReminder, snooze };
  start();
})();
