/* Fresh Up – Verbindungen zur Flasche
 * BleConnection: echte Flasche über Web Bluetooth (Chrome/Edge auf Android, Windows, macOS, ChromeOS).
 * DemoConnection: dieselbe Schnittstelle, spricht mit der simulierten Flasche.
 * Beide senden die Ereignisse: level, sip, status, battery, disconnected.
 */
(function () {
  'use strict';
  const FU = (window.FU = window.FU || {});
  const P = FU.Protocol;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  class BaseConnection extends EventTarget {
    emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { detail })); }
    syncTime(t) { return this.write('time', P.encode.time(t)); }
    writeConfig(c) { return this.write('config', P.encode.config(c)); }
    writeLed(bars) { return this.write('led', P.encode.led(bars)); }
    command(cmd) { return this.write('control', P.encode.control(cmd)); }
  }

  /* ---------------- Echte Flasche ---------------- */
  class BleConnection extends BaseConnection {
    constructor() {
      super();
      this.kind = 'ble';
      this.connected = false;
      this.device = null;
      this.chars = {};
    }
    static supported() { return !!(navigator.bluetooth && navigator.bluetooth.requestDevice); }

    // Öffnet die Geräteauswahl des Browsers (muss aus einem Klick heraus aufgerufen werden)
    async scan() {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [P.SERVICE] }, { namePrefix: 'Fresh Up' }],
        optionalServices: [P.SERVICE, P.BATTERY_SERVICE]
      });
      return { name: this.device.name || 'Fresh Up', id: this.device.id };
    }

    async connect() {
      const dev = this.device;
      if (!dev) throw new Error('Keine Flasche ausgewählt.');
      this._onGattDown = () => { this.connected = false; this.emit('disconnected', { reason: 'Die Verbindung zur Flasche wurde unterbrochen.' }); };
      dev.addEventListener('gattserverdisconnected', this._onGattDown);
      const server = await dev.gatt.connect();
      let svc;
      try {
        svc = await server.getPrimaryService(P.SERVICE);
      } catch (e) {
        dev.gatt.disconnect();
        throw new Error('Das Gerät bietet den Fresh-Up-Dienst nicht an. Ist die Firmware aktuell?');
      }
      for (const name of Object.keys(P.CHAR)) {
        try { this.chars[name] = await svc.getCharacteristic(P.CHAR[name]); } catch (e) { /* optional */ }
      }
      for (const name of ['level', 'sip', 'status']) {
        const c = this.chars[name];
        if (!c || !c.properties.notify) continue;
        c.addEventListener('characteristicvaluechanged', (ev) => this.emit(name, P.decode[name](ev.target.value)));
        await c.startNotifications();
      }
      for (const name of ['level', 'status']) {
        const c = this.chars[name];
        if (c && c.properties.read) this.emit(name, P.decode[name](await c.readValue()));
      }
      try {
        const bs = await server.getPrimaryService(P.BATTERY_SERVICE);
        const bc = await bs.getCharacteristic(P.BATTERY_LEVEL);
        this.emit('battery', P.decode.battery(await bc.readValue()));
        if (bc.properties.notify) {
          bc.addEventListener('characteristicvaluechanged', (ev) => this.emit('battery', P.decode.battery(ev.target.value)));
          await bc.startNotifications();
        }
      } catch (e) { /* Akku-Dienst ist optional */ }
      this.connected = true;
    }

    async write(name, bytes) {
      const c = this.chars[name];
      if (!c || !this.connected) return;
      try {
        if (c.properties.writeWithoutResponse && c.writeValueWithoutResponse) await c.writeValueWithoutResponse(bytes);
        else if (c.writeValueWithResponse) await c.writeValueWithResponse(bytes);
        else await c.writeValue(bytes);
      } catch (e) { /* Schreibfehler werden beim nächsten Abgleich wiederholt */ }
    }

    disconnect() {
      this.connected = false;
      if (this.device) {
        this.device.removeEventListener('gattserverdisconnected', this._onGattDown);
        if (this.device.gatt.connected) this.device.gatt.disconnect();
      }
    }
  }

  /* ---------------- Demo-Flasche ---------------- */
  class DemoConnection extends BaseConnection {
    constructor(sim) {
      super();
      this.kind = 'demo';
      this.sim = sim;
      this.connected = false;
    }
    static supported() { return true; }

    async scan() {
      await wait(1500);
      if (!this.sim.s.radio) throw new Error('Keine Fresh Up gefunden. Ist Bluetooth an der Flasche eingeschaltet?');
      return { name: 'Fresh Up FU-750-2B7C', id: 'FU-750-2B7C', rssi: this.sim.rssi(), battery: this.sim.s.battery };
    }

    async connect(fast) {
      await wait(fast ? 250 : 900);
      if (!this.sim.s.radio) throw new Error('Verbindung fehlgeschlagen: Die Flasche antwortet nicht.');
      this._onNotify = (e) => this._handle(e.detail);
      this._onDown = (e) => { this._teardown(); this.emit('disconnected', { reason: e.detail.reason }); };
      this.sim.addEventListener('notify', this._onNotify);
      this.sim.addEventListener('linkdown', this._onDown);
      this.connected = true;
      this.sim.connect();
    }

    _handle({ char, bytes }) {
      const name = char === P.BATTERY_LEVEL ? 'battery' : P.CHAR_NAME[char];
      if (name && P.decode[name]) this.emit(name, P.decode[name](bytes));
    }

    write(name, bytes) {
      if (this.connected) this.sim.write(P.CHAR[name], bytes);
      return Promise.resolve();
    }

    _teardown() {
      this.connected = false;
      this.sim.removeEventListener('notify', this._onNotify);
      this.sim.removeEventListener('linkdown', this._onDown);
    }

    disconnect() {
      if (!this.connected) return;
      this._teardown();
      this.sim.disconnect();
    }
  }

  FU.BleConnection = BleConnection;
  FU.DemoConnection = DemoConnection;
})();
