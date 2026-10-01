/* Fresh Up – Bedienfeld der Demo-Flasche (simuliertes Gerät) */
(function () {
  'use strict';
  const FU = (window.FU = window.FU || {});
  const { MIN } = FU.const;
  const $ = (s) => document.querySelector(s);

  const ARROW = { up: '↑', down: '↓', sys: '•', warn: '!' };
  const PLACE = { tisch: 'Auf dem Tisch', rucksack: 'Im Rucksack', sport: 'In der Sporttasche' };

  let sim, view, pourTimer = null, poured = 0, pourStart = 0, hintTimer = null;

  function hint(text, warn) {
    const h = $('#hint');
    h.textContent = text;
    h.classList.toggle('warn', !!warn);
    clearTimeout(hintTimer);
    if (warn) hintTimer = setTimeout(() => hint('Tippen für einen Schluck, gedrückt halten für mehr.'), 2600);
  }

  function canDrink() {
    if (!sim.s.lid) { hint('Der Deckel ist zu. Erst öffnen, dann trinken.', true); return false; }
    if (sim.s.fill < 5) { hint('Die Flasche ist leer. Bitte auffüllen.', true); return false; }
    return true;
  }

  /* Gedrückt halten = länger trinken (ca. 90 ml pro Sekunde) */
  function startPour(e) {
    if (e.button != null && e.button !== 0) return;
    if (!canDrink()) return;
    e.preventDefault();
    poured = 0;
    pourStart = performance.now();
    view.setDrinking(true);
    $('#drinkBtn').classList.add('pouring');
    pourTimer = setInterval(() => {
      poured = Math.min(sim.s.fill, poured + 9);
      view.setFill(sim.s.fill - poured);
      $('#simLevel').textContent = Math.round(sim.s.fill - poured);
      hint('Du trinkst … ' + Math.round(poured) + ' ml');
    }, 100);
  }
  function endPour() {
    if (!pourTimer) return;
    clearInterval(pourTimer);
    pourTimer = null;
    $('#drinkBtn').classList.remove('pouring');
    const tap = performance.now() - pourStart < 300;
    const amount = tap ? 45 : Math.max(20, poured);
    setTimeout(() => view.setDrinking(false), 250);
    const r = sim.sip(amount);
    if (r && r.ml) hint('Schluck: ' + r.ml + ' ml' + (sim.connected ? ' · an die App gesendet' : ' · offline gespeichert'));
  }

  function render() {
    const s = sim.s;
    view.setFill(s.fill);
    view.setLid(s.lid);
    view.setLocation(s.location);
    view.setLed(sim.ledMode(), s.bars, sim.config.brightness);
    $('#stage').dataset.location = s.location;
    $('#simLevel').textContent = Math.round(s.fill);
    const lid = $('#lidBtn');
    lid.textContent = s.lid ? 'Deckel schließen' : 'Deckel öffnen';
    lid.setAttribute('aria-pressed', String(s.lid));
    const loc = document.getElementById('loc-' + s.location);
    if (loc) loc.checked = true;
    $('#radioToggle').checked = s.radio;

    const note = $('#stageNote');
    let text = '';
    if (sim.dark) text = PLACE[s.location] + ' ist es dunkel: Die LED bleibt aus, die App übernimmt die Erinnerung.';
    else if (sim.alert && sim.config.light) text = 'Erinnerung fällig: Die Anzeige blinkt rot, bis du trinkst.';
    else if (sim.alert) text = 'Erinnerung fällig. Das Licht-Signal ist in der App ausgeschaltet.';
    note.textContent = text;
    note.hidden = !text;
    note.dataset.tone = sim.alert && !sim.dark ? 'alert' : '';

    const status = !s.radio ? 'Bluetooth aus' : sim.connected ? 'verbunden mit der App · ' + sim.rssi() + ' dBm' : 'Bluetooth an · nicht verbunden';
    $('#demoSub').textContent = status + ' · Akku ' + s.battery + ' %';
    $('#bufferInfo').textContent = s.buffer.length ? s.buffer.length + (s.buffer.length === 1 ? ' Schluck' : ' Schlucke') + ' im Speicher' : '';
  }

  function tick(now) {
    $('#simClock').textContent = FU.fmt.time(now);
    const c = sim.config;
    const due = sim.s.lastSip + c.interval * MIN;
    const track = $('#timerBar').parentElement;
    let text;
    if (!c.enabled) text = 'Flaschen-Timer: Erinnerung in der App ausgeschaltet';
    else if (c.quiet && FU.util.isQuiet(now, c.quietStart, c.quietEnd)) text = 'Flaschen-Timer: Ruhezeit bis 07:00 Uhr';
    else if (now >= due) text = 'Flaschen-Timer: <b>fällig</b> seit ' + FU.fmt.duration(now - due);
    else text = 'Flaschen-Timer: <b>' + FU.fmt.duration(due - now) + '</b> bis zur Erinnerung';
    $('#timerText').innerHTML = text;
    track.classList.toggle('due', c.enabled && now >= due);
    $('#timerBar').style.width = Math.min(100, Math.max(0, ((now - sim.s.lastSip) / (c.interval * MIN)) * 100)) + '%';
    const mode = sim.ledMode();
    if (mode !== view._mode) view.setLed(mode, sim.s.bars, c.brightness);
  }

  function addLog(d) {
    const ol = $('#log');
    const li = document.createElement('li');
    li.dataset.dir = d.dir;
    li.innerHTML = '<span class="t"></span><span class="dir"></span><span class="msg"></span>';
    li.children[0].textContent = FU.fmt.time(d.t);
    li.children[1].textContent = ARROW[d.dir] || '•';
    li.children[2].textContent = d.msg;
    if (d.hex) {
      const h = document.createElement('span');
      h.className = 'hex';
      h.textContent = '  [' + d.hex + ']';
      li.children[2].appendChild(h);
    }
    ol.prepend(li);
    while (ol.children.length > 80) ol.lastChild.remove();
  }

  // „Jetzt trinken“ aus der App: Deckel auf, einen Schluck nehmen
  function drinkFromApp() {
    if (!sim.s.lid) sim.toggleLid();
    if (sim.s.fill < 5) { sim.refill(); }
    view.setDrinking(true);
    setTimeout(() => {
      sim.sip(60);
      setTimeout(() => view.setDrinking(false), 300);
    }, 650);
  }

  function setOpen(open) {
    const demo = $('#demo');
    demo.classList.toggle('open', open);
    $('#demoOpen').setAttribute('aria-expanded', String(open));
  }

  function init(simBottle, app) {
    sim = simBottle;
    view = new FU.BottleView($('#simHost'), { bags: true });

    $('#lidBtn').addEventListener('click', () => sim.toggleLid());
    const drink = $('#drinkBtn');
    drink.addEventListener('pointerdown', startPour);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => drink.addEventListener(ev, endPour));
    drink.addEventListener('contextmenu', (e) => e.preventDefault());
    drink.addEventListener('click', (e) => {
      if (e.detail !== 0) return; // nur Tastatur
      if (!canDrink()) return;
      view.setDrinking(true);
      setTimeout(() => view.setDrinking(false), 500);
      sim.sip(45);
    });
    $('#refillBtn').addEventListener('click', () => { sim.refill(); hint('Aufgefüllt auf 750 ml.'); });
    document.querySelectorAll('input[name="location"]').forEach((r) => r.addEventListener('change', () => sim.setLocation(r.value)));
    $('#radioToggle').addEventListener('change', (e) => sim.setRadio(e.target.checked));

    const S = FU.store.state;
    const sp = document.getElementById('speed-' + S.clock.speed);
    if (sp) sp.checked = true;
    document.querySelectorAll('input[name="speed"]').forEach((r) => r.addEventListener('change', () => { S.clock.speed = Number(r.value); FU.store.save(); }));
    const pause = $('#pauseBtn');
    const setPause = () => { pause.setAttribute('aria-pressed', String(S.clock.paused)); pause.setAttribute('aria-label', S.clock.paused ? 'Zeit fortsetzen' : 'Zeit anhalten'); pause.title = pause.getAttribute('aria-label'); };
    setPause();
    pause.addEventListener('click', () => { S.clock.paused = !S.clock.paused; setPause(); FU.store.save(); });
    $('#triggerBtn').addEventListener('click', () => app.triggerReminder());

    $('#demoOpen').addEventListener('click', () => setOpen(!$('#demo').classList.contains('open')));
    $('#demoClose').addEventListener('click', () => setOpen(false));

    sim.addEventListener('change', () => { render(); FU.store.save(); });
    sim.addEventListener('log', (e) => addLog(e.detail));
    sim.log('sys', 'Demo-Flasche eingeschaltet · Firmware 1.4.2');
    render();
  }

  FU.demoPanel = { init, render, tick, drinkFromApp, setOpen };
})();
