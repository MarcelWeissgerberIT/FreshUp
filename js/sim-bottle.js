/* Fresh Up – Demo-Flasche
 * Simuliert die Firmware der Flasche: Füllstandsensor, Deckel, Lichtsensor (Tisch/Tasche),
 * 30-Minuten-Timer mit rotem Licht-Signal, Akku und den GATT-Server aus protocol.js.
 * Ohne Verbindung werden Schlucke im Flaschenspeicher gepuffert und beim Verbinden nachgeliefert.
 */
(function () {
  'use strict';
  const FU = (window.FU = window.FU || {});
  const P = FU.Protocol;
  const { MIN, HOUR, CAPACITY } = FU.const;

  const RSSI = { tisch: -52, rucksack: -67, sport: -71 };

  class SimBottle extends EventTarget {
    constructor(s) {
      super();
      this.s = s;                // persistenter Teil (FU.store.state.sim)
      if (!s.config) s.config = { interval: 30, enabled: true, light: true, quiet: true, quietStart: 22, quietEnd: 7, brightness: 80 };
      this.connected = false;
      this.alert = false;
      this.findUntil = 0;        // Echtzeit (performance.now)
      this._lastTick = 0;
    }

    get config() { return this.s.config; }
    due() { return Math.max(this.s.lastSip + this.config.interval * MIN, this.s.snoozeUntil || 0); }
    get dark() { return this.s.location !== 'tisch'; }
    rssi() { return RSSI[this.s.location] || -60; }

    ledMode() {
      if (performance.now() < this.findUntil) return 'find';
      if (this.alert && this.config.light && !this.dark) return 'alert';
      if (this.dark) return 'off';
      return 'progress';
    }

    /* ---------- Ereignisse ---------- */
    log(dir, msg, bytes) {
      this.dispatchEvent(new CustomEvent('log', { detail: { t: FU.clock.now(), dir, msg, hex: bytes ? P.hex(bytes) : '' } }));
    }
    changed() { this.dispatchEvent(new Event('change')); }
    notify(char, bytes, text) {
      if (!this.connected) return false;
      this.log('up', text, bytes);
      this.dispatchEvent(new CustomEvent('notify', { detail: { char, bytes } }));
      return true;
    }
    notifyLevel() { this.notify(P.CHAR.level, P.encode.level(this.s.fill), 'Füllstand ' + Math.round(this.s.fill) + ' ml'); }
    notifyStatus() {
      const st = { alert: this.alert, lid: this.s.lid, dark: this.dark };
      const parts = [st.alert ? 'Erinnerung aktiv' : 'keine Erinnerung', st.lid ? 'Deckel offen' : 'Deckel zu', st.dark ? 'dunkel' : 'hell'];
      this.notify(P.CHAR.status, P.encode.status(st), 'Status · ' + parts.join(', '));
    }
    notifyBattery() { this.notify(P.BATTERY_LEVEL, P.encode.battery(this.s.battery), 'Akku ' + this.s.battery + ' %'); }

    /* ---------- Physische Bedienung ---------- */
    toggleLid() {
      this.s.lid = !this.s.lid;
      this.log('sys', this.s.lid ? 'Deckel geöffnet (ca. 110°)' : 'Deckel geschlossen');
      this.notifyStatus();
      this.changed();
    }
    sip(ml) {
      if (!this.s.lid) return { error: 'lid' };
      if (this.s.fill < 5) return { error: 'empty' };
      const amount = Math.round(Math.min(ml, this.s.fill));
      const t = FU.clock.now();
      const seq = this.s.seq = ((this.s.seq || 0) + 1) & 0xffff;
      this.s.fill -= amount;
      this.s.lastSip = t;
      this.s.snoozeUntil = 0;
      const wasAlert = this.alert;
      this.alert = false;
      if (this.connected) {
        this.notify(P.CHAR.sip, P.encode.sip(amount, t, seq), 'Schluck erkannt · ' + amount + ' ml');
        this.notifyLevel();
        if (wasAlert) this.notifyStatus();
      } else {
        this.s.buffer.push({ ml: amount, t, seq });
        this.log('sys', 'Schluck ' + amount + ' ml im Flaschenspeicher abgelegt (offline)');
      }
      this.changed();
      return { ml: amount };
    }
    refill() {
      if (!this.s.lid) { this.s.lid = true; this.log('sys', 'Deckel geöffnet (ca. 110°)'); }
      const added = Math.round(CAPACITY - this.s.fill);
      this.s.fill = CAPACITY;
      this.log('sys', 'Aufgefüllt · +' + added + ' ml');
      this.notifyLevel();
      this.notifyStatus();
      this.changed();
    }
    setLocation(loc) {
      if (this.s.location === loc) return;
      this.s.location = loc;
      this.log('sys', loc === 'tisch' ? 'Lichtsensor hell · Flasche steht frei' : 'Lichtsensor dunkel · Flasche in der Tasche, LED aus');
      this.notifyStatus();
      this.changed();
    }
    charge() {
      this.s.battery = 100;
      this.s.batteryF = 100;
      this.log('sys', 'Ladekabel angeschlossen · Akku 100 %');
      this.notifyBattery();
      this.changed();
    }
    setRadio(on) {
      this.s.radio = !!on;
      if (!on && this.connected) {
        this.connected = false;
        this.log('warn', 'Bluetooth der Flasche aus · Verbindung abgebrochen');
        this.dispatchEvent(new CustomEvent('linkdown', { detail: { reason: 'Die Flasche ist außer Reichweite oder Bluetooth ist aus.' } }));
      } else {
        this.log('sys', on ? 'Bluetooth an · sendet Advertising „Fresh Up“' : 'Bluetooth aus');
      }
      this.changed();
    }

    /* ---------- Funk ---------- */
    connect() {
      this.connected = true;
      this.log('sys', 'Verbunden mit der Fresh Up App');
      this.notifyLevel();
      this.notifyStatus();
      this.notifyBattery();
      if (this.s.buffer.length) {
        const n = this.s.buffer.length;
        this.s.buffer.splice(0).forEach((b) => this.notify(P.CHAR.sip, P.encode.sip(b.ml, b.t, b.seq), 'Nachgeliefert · Schluck ' + b.ml + ' ml um ' + FU.fmt.time(b.t)));
        this.log('sys', n + (n === 1 ? ' gespeicherter Schluck' : ' gespeicherte Schlucke') + ' synchronisiert');
      }
      this.changed();
    }
    disconnect() {
      if (!this.connected) return;
      this.connected = false;
      this.log('sys', 'Verbindung von der App getrennt');
      this.changed();
    }

    /* ---------- GATT-Schreibzugriffe der App ---------- */
    write(char, bytes) {
      const name = P.CHAR_NAME[char];
      if (!name || !P.decode[name]) return;
      const d = P.decode[name](bytes);
      let text = name;
      if (name === 'config') {
        this.s.config = d;
        text = 'Einstellungen · alle ' + d.interval + ' min, ' + (d.enabled ? 'Erinnerung an' : 'Erinnerung aus') + ', Licht ' + (d.light ? 'an' : 'aus') + ', Helligkeit ' + d.brightness + ' %';
      } else if (name === 'led') {
        this.s.bars = d.bars;
        text = 'LED-Fortschritt · ' + d.bars + ' von 4 Balken';
      } else if (name === 'control') {
        if (d.cmd === P.CMD.FIND) {
          this.findUntil = performance.now() + 4000;
          text = 'Befehl · Flasche finden (LED blinkt blau)';
        } else if (d.cmd === P.CMD.RESET_TIMER) {
          this.s.lastSip = FU.clock.now();
          this.s.snoozeUntil = 0;
          if (this.alert) { this.alert = false; setTimeout(() => this.notifyStatus(), 0); }
          text = 'Befehl · Timer zurücksetzen (manuell getrunken)';
        } else if (d.cmd === P.CMD.SNOOZE) {
          const min = d.arg || 10;
          this.s.snoozeUntil = FU.clock.now() + min * MIN;
          if (this.alert) { this.alert = false; setTimeout(() => this.notifyStatus(), 0); }
          text = 'Befehl · später erinnern (' + min + ' min)';
        }
      } else if (name === 'time') {
        text = 'Uhrzeit synchronisiert · ' + FU.fmt.time(d.t);
      }
      this.log('down', text, bytes);
      this.changed();
    }

    /* ---------- Firmware-Takt ---------- */
    tick(now) {
      const s = this.s;
      // Akku: ca. 1 % alle 8 Stunden
      if (this._lastTick && now > this._lastTick && now - this._lastTick < 6 * HOUR) {
        if (s.batteryF == null) s.batteryF = s.battery;
        s.batteryF -= (now - this._lastTick) / (8 * HOUR);
        const b = Math.max(5, Math.ceil(s.batteryF));
        if (b !== s.battery) { s.battery = b; this.notifyBattery(); this.changed(); }
      }
      this._lastTick = now;

      // 30-Minuten-Timer
      const c = this.config;
      const quiet = c.quiet && FU.util.isQuiet(now, c.quietStart, c.quietEnd);
      const should = c.enabled && !quiet && now >= this.due();
      if (should !== this.alert) {
        this.alert = should;
        if (should) {
          const how = this.dark ? 'LED bleibt aus (Tasche)' : (c.light ? 'LED blinkt rot' : 'Licht-Signal deaktiviert');
          this.log('sys', c.interval + ' Minuten ohne Schluck · ' + how);
        }
        this.notifyStatus();
        this.changed();
      }
    }
  }

  FU.SimBottle = SimBottle;
})();
