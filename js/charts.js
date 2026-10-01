/* Fresh Up – Diagramme (SVG, Farben über CSS-Klassen aus den Theme-Tokens) */
(function () {
  'use strict';
  const FU = (window.FU = window.FU || {});
  const NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, text) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  const niceMax = (v, step) => Math.max(step, Math.ceil(v / step) * step);
  const L = (ml, d = 1) => (ml / 1000).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

  // Trinkmenge je Stunde (6–22 Uhr) für den aktuellen Tag
  function hours(svg, entries, now) {
    svg.textContent = '';
    const x0 = 36, x1 = 312, y0 = 14, y1 = 132;
    const first = 6, last = 22, n = last - first + 1;
    const sums = new Array(n).fill(0);
    entries.forEach((e) => {
      const h = new Date(e.t).getHours();
      if (h >= first && h <= last) sums[h - first] += e.ml;
    });
    const max = niceMax(Math.max(...sums), 250);
    const y = (v) => y1 - (v / max) * (y1 - y0);
    [0, max / 2, max].forEach((v) => {
      svg.appendChild(el('line', { x1: x0, x2: x1, y1: y(v), y2: y(v), class: 'grid' }));
      svg.appendChild(el('text', { x: x0 - 6, y: y(v) + 3.5, 'text-anchor': 'end', class: 'axis-label' }, String(v)));
    });
    const slot = (x1 - x0) / n;
    const bw = Math.min(11, slot * 0.66);
    const nowH = new Date(now).getHours();
    sums.forEach((v, i) => {
      const cx = x0 + slot * i + slot / 2;
      if (v > 0) {
        const h = Math.max(2, y1 - y(v));
        svg.appendChild(el('rect', { x: cx - bw / 2, y: y1 - h, width: bw, height: h, rx: 3, class: 'bar-mark' + (first + i === nowH ? ' now' : ' hit') }));
      }
      if ((first + i) % 4 === 2) {
        svg.appendChild(el('text', { x: cx, y: y1 + 16, 'text-anchor': 'middle', class: 'axis-label' }, String(first + i).padStart(2, '0') + ' Uhr'));
      }
    });
  }

  // Tagesmengen der letzten 7 Tage mit Ziellinie
  function week(svg, days, goal) {
    svg.textContent = '';
    const x0 = 36, x1 = 312, y0 = 18, y1 = 136;
    const max = niceMax(Math.max(goal * 1.15, ...days.map((d) => d.ml * 1.08)), 1000);
    const y = (v) => y1 - (v / max) * (y1 - y0);
    [0, max / 2, max].forEach((v) => {
      svg.appendChild(el('line', { x1: x0, x2: x1, y1: y(v), y2: y(v), class: 'grid' }));
      svg.appendChild(el('text', { x: x0 - 6, y: y(v) + 3.5, 'text-anchor': 'end', class: 'axis-label' }, L(v)));
    });
    const slot = (x1 - x0) / days.length;
    const bw = Math.min(24, slot * 0.58);
    days.forEach((d, i) => {
      const cx = x0 + slot * i + slot / 2;
      const h = d.ml > 0 ? Math.max(2, y1 - y(d.ml)) : 0;
      if (h) svg.appendChild(el('rect', { x: cx - bw / 2, y: y1 - h, width: bw, height: h, rx: 4, class: 'bar-mark' + (d.today ? ' now' : d.ml >= goal ? ' hit' : '') }));
      svg.appendChild(el('text', { x: cx, y: y1 - h - 5, 'text-anchor': 'middle', class: 'val-label' }, L(d.ml)));
      svg.appendChild(el('text', { x: cx, y: y1 + 16, 'text-anchor': 'middle', class: 'axis-label' }, d.label));
    });
    const gy = y(goal);
    svg.insertBefore(el('line', { x1: x0, x2: x1, y1: gy, y2: gy, class: 'goal-line' }), svg.firstChild.nextSibling);
  }

  FU.charts = { hours, week };
})();
