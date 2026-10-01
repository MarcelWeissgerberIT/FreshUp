/* Fresh Up – Zustand, Uhr und Hilfsfunktionen */
(function () {
  'use strict';
  const FU = (window.FU = window.FU || {});

  const KEY = 'freshup-app-v1';
  const MIN = 60000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const CAPACITY = 750;

  /* ---------- Formatierung ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = {
    time(t) { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); },
    liters(ml) { return (ml / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' L'; },
    ml(ml) { return Math.round(ml).toLocaleString('de-DE') + ' ml'; },
    pct(p) { return Math.round(p * 100) + ' %'; },
    duration(ms) {
      const m = Math.max(0, Math.ceil(ms / MIN));
      if (m < 60) return m + ' min';
      const h = Math.floor(m / 60);
      return h + ' h ' + pad(m % 60) + ' min';
    },
    date(t) { return new Date(t).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }); },
    weekday(t) { return new Date(t).toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', ''); }
  };

  const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const isQuiet = (t, from = 22, to = 7) => { const h = new Date(t).getHours(); return from > to ? (h >= from || h < to) : (h >= from && h < to); };

  /* ---------- Startzustand ---------- */
  function demoStartTime() {
    const now = new Date();
    const h = now.getHours() + now.getMinutes() / 60;
    if (h >= 8 && h <= 20.5) return now.getTime();
    now.setHours(12, 38, 0, 0);
    return now.getTime();
  }

  // Beispiel-Verlauf: sechs Vortage plus der bisherige Tag. Alle Einträge tragen ex:true.
  function seedEntries(now, goal) {
    const entries = [];
    const sizes = [180, 220, 150, 250, 200, 170, 230];
    const totals = [1700, 2150, 1500, 2300, 1950, 2050];
    const today = startOfDay(now);
    totals.forEach((total, i) => {
      const day = today - (6 - i) * DAY;
      let left = total;
      let t = day + 7 * HOUR + 5 * MIN;
      let k = i;
      while (left > 0) {
        const ml = Math.min(left, sizes[k++ % sizes.length]);
        entries.push({ t, ml, src: 'bottle', ex: true });
        left -= ml;
        t += 62 * MIN + (k % 3) * 9 * MIN;
      }
    });
    const lastSip = now - 23 * MIN;
    const share = Math.max(0, Math.min(1, (now - (today + 7 * HOUR)) / (15 * HOUR)));
    const target = Math.round((goal * share * 0.95) / 10) * 10;
    const todays = [];
    let sum = 0;
    let t = lastSip;
    let k = 0;
    while (sum < target && t > today + 7 * HOUR) {
      const ml = sizes[k++ % sizes.length];
      todays.push({ t, ml, src: 'bottle', ex: true });
      sum += ml;
      t -= 52 * MIN + (k % 4) * 7 * MIN;
    }
    return entries.concat(todays.reverse());
  }

  function defaults() {
    const now = demoStartTime();
    const goal = 2000;
    const entries = seedEntries(now, goal);
    const last = entries.filter((e) => e.t >= startOfDay(now)).pop();
    return {
      v: 1,
      onboarded: false,
      use: 'unterwegs',
      goal,
      settings: { reminders: true, interval: 30, light: true, push: true, quiet: true, sound: true, brightness: 80, theme: 'system' },
      device: { kind: null, id: 'FU-750-2B7C', name: 'Fresh Up FU-750-2B7C', firmware: '1.4.2' },
      entries,
      lastSip: last ? last.t : now - 23 * MIN,
      clock: { t: now, speed: 60, paused: false },
      sim: { fill: 500, lid: false, location: 'tisch', battery: 86, radio: true, buffer: [], bars: 0, lastSip: last ? last.t : now - 23 * MIN }
    };
  }

  /* ---------- Laden / Speichern ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const s = JSON.parse(raw);
      if (!s || s.v !== 1) return defaults();
      const d = defaults();
      return Object.assign(d, s, {
        settings: Object.assign(d.settings, s.settings),
        device: Object.assign(d.device, s.device),
        clock: Object.assign(d.clock, s.clock),
        sim: Object.assign(d.sim, s.sim)
      });
    } catch (e) {
      return defaults();
    }
  }

  const state = load();
  let saveTimer = null;
  let disabled = false;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 600);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    if (disabled) return;
    try {
      // Einträge älter als 14 Tage verwerfen
      const cutoff = startOfDay(state.clock.t) - 14 * DAY;
      state.entries = state.entries.filter((e) => e.t >= cutoff);
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { /* Speicher nicht verfügbar – App läuft trotzdem */ }
  }
  function reset() {
    disabled = true;
    clearTimeout(saveTimer);
    try { localStorage.removeItem(KEY); } catch (e) { /* ignorieren */ }
  }

  /* ---------- Uhr ----------
   * Demo-Flasche: eigene Uhr mit Zeitraffer. Echte Flasche: Systemzeit. */
  const clock = {
    now() { return state.clock.t; },
    get speed() { return state.clock.speed; },
    get paused() { return state.clock.paused; },
    realtime() { return state.device.kind === 'ble'; },
    advance(realMs) {
      if (this.realtime()) { state.clock.t = Date.now(); return; }
      if (state.clock.paused) return;
      state.clock.t += realMs * state.clock.speed;
    },
    jump(ms) { state.clock.t += ms; }
  };

  /* ---------- Abgeleitete Werte ---------- */
  function entriesOfDay(t) {
    const a = startOfDay(t);
    const b = a + DAY;
    return state.entries.filter((e) => e.t >= a && e.t < b);
  }
  function totalOfDay(t) { return entriesOfDay(t).reduce((s, e) => s + e.ml, 0); }
  function progressBars(total, goal) { return total >= goal ? 4 : Math.max(0, Math.min(4, Math.floor((total / goal) * 4))); }

  /* ---------- Mini-Eventbus ---------- */
  const listeners = {};
  const bus = {
    on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    emit(name, data) { (listeners[name] || []).forEach((fn) => fn(data)); }
  };

  FU.const = { MIN, HOUR, DAY, CAPACITY };
  FU.fmt = fmt;
  FU.util = { startOfDay, isQuiet, entriesOfDay, totalOfDay, progressBars, pad };
  FU.store = { state, save, saveNow, reset, defaults };
  FU.clock = clock;
  FU.bus = bus;
})();
