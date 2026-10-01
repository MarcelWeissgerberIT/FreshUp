/* Fresh Up – Bluetooth-LE-Protokoll (GATT)
 * Gemeinsame Definition für die echte Flasche (Web Bluetooth) und die Demo-Flasche.
 * Alle Mehrbyte-Werte sind Little Endian. Details: docs/BLE-PROTOKOLL.md
 */
(function () {
  'use strict';
  const FU = (window.FU = window.FU || {});

  const uuid = (n) => '6f1e' + n + '-8c3b-4f2a-9d65-3a7b2c1e5f00';

  const SERVICE = uuid('0001');
  const CHAR = {
    level: uuid('0002'),   // notify/read · uint16 Füllstand in ml
    sip: uuid('0003'),     // notify      · uint16 ml, uint32 Unix-Sekunden, uint16 laufende Nummer
    status: uuid('0004'),  // notify/read · uint8 Flags: bit0 Erinnerung aktiv, bit1 Deckel offen, bit2 dunkel (Tasche)
    config: uuid('0005'),  // write       · uint8 Intervall, uint8 Flags, uint8 Ruhe-Start, uint8 Ruhe-Ende, uint8 Helligkeit
    led: uuid('0006'),     // write       · uint8 Fortschrittsbalken 0–4
    control: uuid('0007'), // write       · uint8 Befehl (0x01 finden, 0x02 Timer zurücksetzen, 0x03 später erinnern + uint8 Minuten)
    time: uuid('0008')     // write       · uint32 Unix-Sekunden
  };
  const CHAR_NAME = {};
  Object.keys(CHAR).forEach((k) => { CHAR_NAME[CHAR[k]] = k; });

  const BATTERY_SERVICE = 'battery_service';
  const BATTERY_LEVEL = 'battery_level';

  const STATUS = { ALERT: 1, LID: 2, DARK: 4 };
  const CFG = { ENABLED: 1, LIGHT: 2, QUIET: 4 };
  const CMD = { FIND: 0x01, RESET_TIMER: 0x02, SNOOZE: 0x03 };

  function view(bytes) {
    const b = bytes instanceof DataView ? bytes : new DataView(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength);
    return b;
  }

  const encode = {
    level(ml) { const d = new DataView(new ArrayBuffer(2)); d.setUint16(0, Math.max(0, Math.round(ml)), true); return new Uint8Array(d.buffer); },
    sip(ml, t, seq) {
      const d = new DataView(new ArrayBuffer(8));
      d.setUint16(0, Math.round(ml), true);
      d.setUint32(2, Math.floor(t / 1000), true);
      d.setUint16(6, (seq || 0) & 0xffff, true);
      return new Uint8Array(d.buffer);
    },
    status(s) { return new Uint8Array([(s.alert ? STATUS.ALERT : 0) | (s.lid ? STATUS.LID : 0) | (s.dark ? STATUS.DARK : 0)]); },
    config(c) {
      const flags = (c.enabled ? CFG.ENABLED : 0) | (c.light ? CFG.LIGHT : 0) | (c.quiet ? CFG.QUIET : 0);
      return new Uint8Array([c.interval, flags, c.quietStart ?? 22, c.quietEnd ?? 7, c.brightness]);
    },
    led(bars) { return new Uint8Array([Math.max(0, Math.min(4, bars))]); },
    control(cmd, arg) { return new Uint8Array(arg == null ? [cmd] : [cmd, arg]); },
    time(t) { const d = new DataView(new ArrayBuffer(4)); d.setUint32(0, Math.floor(t / 1000), true); return new Uint8Array(d.buffer); },
    battery(pct) { return new Uint8Array([Math.round(pct)]); }
  };

  const decode = {
    level(b) { return { ml: view(b).getUint16(0, true) }; },
    sip(b) { const d = view(b); return { ml: d.getUint16(0, true), t: d.getUint32(2, true) * 1000, seq: d.byteLength >= 8 ? d.getUint16(6, true) : null }; },
    status(b) { const f = view(b).getUint8(0); return { alert: !!(f & STATUS.ALERT), lid: !!(f & STATUS.LID), dark: !!(f & STATUS.DARK) }; },
    config(b) {
      const d = view(b); const f = d.getUint8(1);
      return { interval: d.getUint8(0), enabled: !!(f & CFG.ENABLED), light: !!(f & CFG.LIGHT), quiet: !!(f & CFG.QUIET), quietStart: d.getUint8(2), quietEnd: d.getUint8(3), brightness: d.getUint8(4) };
    },
    led(b) { return { bars: view(b).getUint8(0) }; },
    control(b) { const d = view(b); return { cmd: d.getUint8(0), arg: d.byteLength > 1 ? d.getUint8(1) : null }; },
    time(b) { return { t: view(b).getUint32(0, true) * 1000 }; },
    battery(b) { return { pct: view(b).getUint8(0) }; }
  };

  function hex(bytes) {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength);
    return Array.from(u, (x) => x.toString(16).padStart(2, '0')).join(' ');
  }

  FU.Protocol = { SERVICE, CHAR, CHAR_NAME, BATTERY_SERVICE, BATTERY_LEVEL, STATUS, CFG, CMD, encode, decode, hex };
})();
