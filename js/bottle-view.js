/* Fresh Up – SVG-Darstellung der Flasche (Demo-Gerät und Spiegelbild in der App) */
(function () {
  'use strict';
  const FU = (window.FU = window.FU || {});
  let uid = 0;

  const WAVE = (function () {
    let d = 'M-60,0';
    for (let i = 0; i < 8; i++) d += ' q15,-5 30,0 t30,0';
    return d + ' V460 H-60 Z';
  })();

  function template(p, bags) {
    const body = 'M72,505 V252 Q72,202 112,190 Q122,187 124,178 H216 Q218,187 228,190 Q268,202 268,252 V505 Z';
    const bagBack = bags ? `
      <g class="bag bag-rucksack">
        <path d="M18,250 Q18,170 92,160 H248 Q322,170 322,250 V672 H18 Z" fill="#1d242e"/>
        <path d="M40,214 Q170,182 300,214" fill="none" stroke="#11161c" stroke-width="5" stroke-dasharray="2 5"/>
      </g>
      <g class="bag bag-sport">
        <path d="M6,300 Q6,262 46,262 H294 Q334,262 334,300 V672 H6 Z" fill="#183358"/>
        <path d="M24,284 H316" stroke="#c7d2e0" stroke-width="3" stroke-dasharray="3 3" opacity=".55"/>
      </g>` : '';
    const bagFront = bags ? `
      <g class="bag bag-rucksack">
        <path d="M30,372 Q170,342 310,372 V672 H30 Z" fill="url(#${p}mesh)"/>
        <path d="M30,372 Q170,342 310,372" fill="none" stroke="#3a4655" stroke-width="12" stroke-linecap="round"/>
        <path d="M44,394 Q170,368 296,394" fill="none" stroke="#11161c" stroke-width="2" stroke-dasharray="6 5"/>
      </g>
      <g class="bag bag-sport">
        <path d="M6,404 H334 V672 H6 Z" fill="#1f3f6c"/>
        <path d="M6,404 H334" stroke="#0e2340" stroke-width="10"/>
        <path d="M6,404 H334" stroke="#d6dde6" stroke-width="3" stroke-dasharray="2 4"/>
        <rect x="244" y="396" width="26" height="30" rx="5" fill="#d6dde6"/>
        <path d="M26,450 H314" stroke="#2b5288" stroke-width="2"/>
      </g>` : '';

    return `
<svg class="fu-bottle" viewBox="0 -26 340 686" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fresh Up Flasche" data-location="tisch">
  <defs>
    <clipPath id="${p}clip"><path d="${body}"/></clipPath>
    <linearGradient id="${p}gBody" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#3b4450" stop-opacity=".55"/>
      <stop offset=".18" stop-color="#9aa6b3" stop-opacity=".22"/>
      <stop offset=".55" stop-color="#c3ccd6" stop-opacity=".14"/>
      <stop offset=".85" stop-color="#7d8896" stop-opacity=".26"/>
      <stop offset="1" stop-color="#2f3741" stop-opacity=".6"/>
    </linearGradient>
    <linearGradient id="${p}gWater" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#a6dcf6" stop-opacity=".6"/>
      <stop offset="1" stop-color="#3a86c0" stop-opacity=".66"/>
    </linearGradient>
    <linearGradient id="${p}gBlack" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#0b0c0f"/>
      <stop offset=".3" stop-color="#262a31"/>
      <stop offset=".62" stop-color="#16191d"/>
      <stop offset="1" stop-color="#08090b"/>
    </linearGradient>
    <filter id="${p}glow" x="-80%" y="-200%" width="260%" height="500%">
      <feGaussianBlur stdDeviation="3.2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <pattern id="${p}mesh" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="8" height="8" fill="#252d38"/>
      <path d="M0 0H8M0 0V8" stroke="#36414f" stroke-width="1.4"/>
    </pattern>
  </defs>
  ${bagBack}
  <ellipse class="shadow" cx="170" cy="652" rx="114" ry="9"/>
  <g class="bottle">
    <g class="part p-body" data-part="body">
      <rect x="122" y="148" width="96" height="34" rx="5" fill="#9aa6b3" fill-opacity=".3" stroke="#5d6774" stroke-opacity=".5"/>
      <path d="M124,160 H216 M124,169 H216" stroke="#5d6774" stroke-opacity=".45" stroke-width="2"/>
      <path d="${body}" fill="url(#${p}gBody)" stroke="#55606d" stroke-opacity=".55" stroke-width="2"/>
      <g clip-path="url(#${p}clip)">
        <g class="water-level"><path class="wave" d="${WAVE}" fill="url(#${p}gWater)"/></g>
      </g>
      <g class="scale">
        <path d="M88,405 H104 M88,358 H98 M88,311 H104 M88,265 H98 M88,218 H104" stroke="#e8eef5" stroke-opacity=".7" stroke-width="2"/>
        <text x="108" y="409">250</text>
        <text x="108" y="315">500</text>
        <text x="108" y="222">750</text>
      </g>
      <path d="M88,262 Q88,226 108,212" stroke="#ffffff" stroke-opacity=".5" stroke-width="5" fill="none" stroke-linecap="round"/>
      <rect x="86" y="276" width="8" height="200" rx="4" fill="#ffffff" fill-opacity=".22"/>
      <rect x="246" y="270" width="5" height="200" rx="2.5" fill="#ffffff" fill-opacity=".14"/>
    </g>
    <g class="part p-ring" data-part="ring">
      <ellipse cx="170" cy="150" rx="50" ry="8" fill="none" stroke="#8e99a6" stroke-width="6"/>
    </g>
    <g class="part p-spout" data-part="spout">
      <rect x="131" y="78" width="38" height="28" rx="5" fill="url(#${p}gBlack)" stroke="#2b3038"/>
      <ellipse cx="150" cy="79" rx="17" ry="4.5" fill="#24282e"/>
      <ellipse cx="150" cy="79.5" rx="11" ry="3" fill="#020203"/>
    </g>
    <g class="part p-lid" data-part="lid">
      <path d="M214,86 C268,70 296,128 274,160 C262,178 236,176 222,156" fill="none" stroke="#121417" stroke-width="12" stroke-linecap="round"/>
      <rect x="110" y="100" width="120" height="56" rx="12" fill="url(#${p}gBlack)" stroke="#2b3038"/>
      <g class="flip-top">
        <path d="M112,104 V80 Q112,62 130,61 L196,58 Q214,58 222,68 L230,82 V104 Z" fill="url(#${p}gBlack)" stroke="#2b3038"/>
        <path d="M122,70 Q150,66 204,65" stroke="#ffffff" stroke-opacity=".12" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M112,98 H230" stroke="#000" stroke-opacity=".35" stroke-width="2"/>
        <circle cx="224" cy="96" r="5" fill="#2b3038"/>
      </g>
      <rect x="118" y="92" width="34" height="38" rx="8" fill="#16191d" stroke="#363c45" stroke-width="2"/>
    </g>
    <g class="part p-base" data-part="base">
      <path d="M64,500 H276 V610 Q276,642 244,642 H96 Q64,642 64,610 Z" fill="url(#${p}gBlack)" stroke="#2b3038"/>
      <path d="M66,506 H274" stroke="#ffffff" stroke-opacity=".08" stroke-width="2"/>
      <g class="display" data-mode="progress">
        <rect x="150" y="522" width="40" height="98" rx="20" fill="#040506" stroke="#2c323a" stroke-width="2"/>
        <rect class="seg" filter="url(#${p}glow)" x="158" y="536" width="24" height="7" rx="3.5"/>
        <rect class="seg" filter="url(#${p}glow)" x="158" y="548" width="24" height="7" rx="3.5"/>
        <rect class="seg" filter="url(#${p}glow)" x="158" y="560" width="24" height="7" rx="3.5"/>
        <rect class="seg" filter="url(#${p}glow)" x="158" y="572" width="24" height="7" rx="3.5"/>
        <path class="drop" filter="url(#${p}glow)" d="M170,586 C175,593 178,597 178,601 A8,8 0 0 1 162,601 C162,597 165,593 170,586 Z"/>
      </g>
    </g>
    <g class="part p-foot" data-part="foot">
      <path d="M72,634 H268 Q266,650 242,650 H98 Q74,650 72,634 Z" fill="#2c3139"/>
    </g>
  </g>
  ${bagFront}
</svg>`;
  }

  class BottleView {
    constructor(host, opts = {}) {
      const p = 'fu' + (++uid) + '-';
      host.innerHTML = template(p, !!opts.bags);
      this.svg = host.querySelector('svg');
      this.level = this.svg.querySelector('.water-level');
      this.display = this.svg.querySelector('.display');
      this.segs = Array.from(this.svg.querySelectorAll('.seg'));
      this.parts = {};
      this.svg.querySelectorAll('.part').forEach((g) => { this.parts[g.dataset.part] = g; });
      this._mode = null;
    }
    setFill(ml) {
      const y = ml <= 0 ? 514 : 498 - ml * (280 / 750);
      this.level.style.transform = 'translateY(' + y.toFixed(1) + 'px)';
    }
    setLid(open) { this.svg.classList.toggle('lid-open', !!open); }
    setLocation(loc) { this.svg.dataset.location = loc; }
    setDrinking(on) { this.svg.classList.toggle('drinking', !!on); }
    setExploded(on) { this.svg.classList.toggle('exploded', !!on); }
    highlight(part) {
      Object.keys(this.parts).forEach((k) => this.parts[k].classList.toggle('hl', k === part));
    }
    /* mode: progress | alert | off | find */
    setLed(mode, bars, brightness) {
      if (this._mode !== mode) { this.display.dataset.mode = mode; this._mode = mode; }
      this.segs.forEach((s, i) => s.classList.toggle('on', mode === 'progress' && i < bars));
      this.display.style.setProperty('--led-op', (0.35 + 0.65 * (brightness / 100)).toFixed(2));
    }
  }

  FU.BottleView = BottleView;
})();
