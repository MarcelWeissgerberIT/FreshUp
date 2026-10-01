/* Fresh Up – 3D-Flasche (Three.js)
 * Gleiche Schnittstelle wie FU.BottleView (SVG): setFill, setLid, setLocation, setDrinking,
 * setExploded, highlight, setLed – plus splash() für Wellen und Bläschen.
 * Maßstab: 1 Einheit = 100 mm (Höhe 230 mm, Ø 75 mm).
 * Build: npm run build  →  js/bottle3d.js
 */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, LatheGeometry, Vector2, Vector3, Color, Quaternion,
  MeshPhysicalMaterial, MeshStandardMaterial, MeshBasicMaterial, ShaderMaterial, CylinderGeometry, BufferGeometry,
  BufferAttribute, PlaneGeometry, BoxGeometry, CanvasTexture, SRGBColorSpace, ACESFilmicToneMapping, PMREMGenerator,
  DoubleSide, BackSide, FrontSide, AdditiveBlending, Shape, Path, ExtrudeGeometry, TubeGeometry, CatmullRomCurve3,
  TorusGeometry, SphereGeometry, InstancedMesh, Object3D, DirectionalLight, HemisphereLight, Fog, RepeatWrapping,
  CircleGeometry
} from 'three';

const FU = (window.FU = window.FU || {});

/* ---------- Abmessungen ---------- */
const R_BODY = 0.381, R_IN = 0.369, R_BASE = 0.412, R_NECK = 0.19, R_COLLAR = 0.236;
const Y_BASE_TOP = 0.583, Y_WALL_TOP = 1.6, Y_COLLAR_BOTTOM = 1.9, Y_COLLAR_TOP = 2.13;
const Y_WATER_BOTTOM = 0.565, Y_ML0 = 0.6, Y_ML750 = 1.58;
const levelOf = (ml) => Y_ML0 + (Math.max(0, Math.min(750, ml)) / 750) * (Y_ML750 - Y_ML0);

const LED = { blue: new Color(0x48d4ff), red: new Color(0xff3b30), off: new Color(0x000000) };
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Hilfen ---------- */
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  return t;
}
function radialTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return canvasTex(128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, inner);
    grd.addColorStop(1, outer);
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
}
function roundRect(w, h, r) {
  const s = new Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}
function dropPoints(r, dy = 0) {
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    pts.push(new Vector2(r * Math.sin(t) * Math.sin(t / 2), r * Math.cos(t) + dy));
  }
  return pts;
}
function lathe(points, seg = 96) { return new LatheGeometry(points.map(([x, y]) => new Vector2(x, y)), seg); }
const cssVar = (el, name, fallback) => (getComputedStyle(el).getPropertyValue(name).trim() || fallback);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

/* ---------- Studio-Umgebung für Spiegelungen ---------- */
function studioEnv(renderer) {
  if (renderer.__fuEnv) return renderer.__fuEnv;
  const pmrem = new PMREMGenerator(renderer);
  const s = new Scene();
  s.add(new Mesh(new BoxGeometry(24, 14, 24), new MeshBasicMaterial({ color: 0x3c4655, side: BackSide })));
  const panel = (w, h, pos, intensity, color = 0xffffff) => {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(intensity), side: DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 1.4, 0);
    s.add(m);
  };
  panel(1.4, 8, [-5.5, 3, 3], 5);          // Streifenlicht links
  panel(0.9, 8, [5.5, 3, 2], 3.2);         // Streifenlicht rechts
  panel(7, 4, [0, 7, 1], 2.2);             // Softbox oben
  panel(5, 6, [0, 3, -7], 0.7, 0xbfe6ff);  // kühles Gegenlicht
  panel(10, 1.2, [0, -0.5, 6], 0.8);       // Boden-Reflex
  renderer.__fuEnv = pmrem.fromScene(s, 0.06).texture;
  pmrem.dispose();
  return renderer.__fuEnv;
}

/* ---------- Materialien ---------- */
function materials() {
  const black = () => new MeshPhysicalMaterial({ color: 0x15171b, roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  return {
    lid: black(),
    latch: new MeshPhysicalMaterial({ color: 0x1d2025, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
    base: new MeshPhysicalMaterial({ color: 0x131518, roughness: 0.55, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new Color(0x3a4048) }),
    foot: new MeshStandardMaterial({ color: 0x2b3038, roughness: 0.95 }),
    spout: black(),
    ring: new MeshStandardMaterial({ color: 0x8e99a6, roughness: 0.6 }),
    pill: new MeshPhysicalMaterial({ color: 0x050608, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
    // Glas: leichte Grautönung + reine Spiegelungsschicht (additiv)
    tint: new MeshPhysicalMaterial({ color: 0xa9b3bf, roughness: 0.08, transparent: true, opacity: 0.2, side: DoubleSide, depthWrite: false, envMapIntensity: 0.15 }),
    reflect: new MeshPhysicalMaterial({ color: 0x000000, roughness: 0.035, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, blending: AdditiveBlending, depthWrite: false, envMapIntensity: 2.2 }),
    water: new MeshPhysicalMaterial({
      color: 0xeef8ff, roughness: 0.03, metalness: 0, transmission: 1, thickness: 0.65, ior: 1.333,
      attenuationColor: new Color(0x7cc4ee), attenuationDistance: 0.85, specularIntensity: 1, envMapIntensity: 1.25, side: FrontSide
    }),
    bubble: new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.55, envMapIntensity: 2, depthWrite: false })
  };
}

function fresnelMaterial() {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(0xdff3ff) }, uPower: { value: 2.6 }, uIntensity: { value: 0.42 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uPower; uniform float uIntensity; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower); gl_FragColor = vec4(uColor * f * uIntensity, 1.0); }',
    transparent: true, blending: AdditiveBlending, depthWrite: false
  });
}

/* ---------- Texturen ---------- */
function dropletTex() {
  const t = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 300; i++) {
      const x = rnd() * w, y = rnd() * h, r = 1.2 + Math.pow(rnd(), 3) * 7;
      const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      grd.addColorStop(0, '#fff');
      grd.addColorStop(0.7, '#888');
      grd.addColorStop(1, '#000');
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(x, y, r, r * 1.15, 0, 0, Math.PI * 2);
      g.fill();
    }
  }, false);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(4, 3);
  return t;
}
function scaleTex() {
  return canvasTex(128, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 5;
    g.font = '600 34px Sora, "Source Sans 3", sans-serif';
    for (let ml = 125; ml <= 750; ml += 125) {
      const v = (levelOf(ml) - 0.6) / 1.0;
      const y = h - v * h;
      const major = ml % 250 === 0;
      g.beginPath();
      g.moveTo(8, y);
      g.lineTo(major ? 40 : 24, y);
      g.stroke();
      if (major) g.fillText(String(ml), 46, y + 12);
    }
  });
}
function logoTex() {
  return canvasTex(512, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.88)';
    g.font = '700 72px Sora, "Source Sans 3", sans-serif';
    g.textBaseline = 'middle';
    g.fillText('Fresh Up', 24, h / 2 + 4);
    const tw = g.measureText('Fresh Up').width;
    g.fillStyle = 'rgba(90,205,255,0.95)';
    g.beginPath();
    const cx = 24 + tw + 24, cy = h / 2 - 14;
    g.moveTo(cx, cy - 22);
    g.bezierCurveTo(cx + 16, cy - 2, cx + 16, cy + 16, cx, cy + 16);
    g.bezierCurveTo(cx - 16, cy + 16, cx - 16, cy - 2, cx, cy - 22);
    g.fill();
  });
}
function fabricTex(base, line) {
  const t = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = line;
    g.lineWidth = 3;
    for (let i = -w; i < w * 2; i += 16) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
      g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke();
    }
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(6, 4);
  return t;
}

/* ---------- Wasser: Volumen mit beweglicher Oberfläche ---------- */
class Water {
  constructor(material) {
    this.seg = 72;
    this.rings = 14;
    this.group = new Group();
    // Seitenwand: Ring unten + Ring oben (folgt der Oberfläche)
    const sw = new BufferGeometry();
    const sv = new Float32Array(this.seg * 2 * 3);
    const sn = new Float32Array(this.seg * 2 * 3);
    const idx = [];
    for (let i = 0; i < this.seg; i++) {
      const a = (i / this.seg) * Math.PI * 2;
      for (let k = 0; k < 2; k++) {
        const o = (i * 2 + k) * 3;
        sv[o] = Math.sin(a) * R_IN; sv[o + 2] = Math.cos(a) * R_IN;
        sn[o] = Math.sin(a); sn[o + 2] = Math.cos(a);
      }
      const n = (i + 1) % this.seg;
      idx.push(i * 2, n * 2, i * 2 + 1, n * 2, n * 2 + 1, i * 2 + 1);
    }
    sw.setAttribute('position', new BufferAttribute(sv, 3));
    sw.setAttribute('normal', new BufferAttribute(sn, 3));
    sw.setIndex(idx);
    this.side = new Mesh(sw, material);
    // Boden
    const bottom = new Mesh(new CircleGeometry(R_IN, this.seg), material);
    bottom.rotation.x = Math.PI / 2;
    bottom.position.y = Y_WATER_BOTTOM;
    // Oberfläche: konzentrische Ringe
    const tg = new BufferGeometry();
    const count = 1 + this.rings * this.seg;
    const tv = new Float32Array(count * 3);
    this.polar = new Float32Array(count * 2);
    const tIdx = [];
    for (let r = 1; r <= this.rings; r++) {
      const rad = (r / this.rings) * R_IN;
      for (let i = 0; i < this.seg; i++) {
        const a = (i / this.seg) * Math.PI * 2;
        const v = 1 + (r - 1) * this.seg + i;
        this.polar[v * 2] = rad; this.polar[v * 2 + 1] = a;
        tv[v * 3] = Math.sin(a) * rad; tv[v * 3 + 2] = Math.cos(a) * rad;
        const n = (i + 1) % this.seg;
        if (r === 1) tIdx.push(0, v, 1 + n);
        else {
          const p = 1 + (r - 2) * this.seg;
          const c = 1 + (r - 1) * this.seg;
          tIdx.push(p + i, c + i, c + n, p + i, c + n, p + n);
        }
      }
    }
    tg.setAttribute('position', new BufferAttribute(tv, 3));
    tg.setIndex(tIdx);
    this.top = new Mesh(tg, material);
    this.group.add(this.side, bottom, this.top);
    this.side.renderOrder = this.top.renderOrder = 1;

    this.level = levelOf(500);
    this.target = this.level;
    this.slope = new Vector2(0, 0);   // Neigung der Oberfläche (lokal)
    this.vel = new Vector2(0, 0);
    this.ripple = 0;                  // Ringwelle nach Schluck/Auffüllen
    this.rippleT = 0;
    this.turb = 0;                    // Unruhe beim Einfüllen
  }

  kick(x, z) { this.vel.x += x; this.vel.y += z; }

  update(dt, t, targetSlope, visible) {
    this.level = damp(this.level, this.target, 5, dt);
    // Feder-Dämpfer: Oberfläche will waagerecht in Weltkoordinaten bleiben
    const k = 55, c = reduceMotion ? 14 : 2.6;
    this.vel.x += (k * (targetSlope.x - this.slope.x) - c * this.vel.x) * dt;
    this.vel.y += (k * (targetSlope.y - this.slope.y) - c * this.vel.y) * dt;
    this.slope.x += this.vel.x * dt;
    this.slope.y += this.vel.y * dt;
    this.rippleT += dt;
    this.ripple *= Math.exp(-dt * 1.6);
    this.turb *= Math.exp(-dt * 0.9);
    this.group.visible = visible && this.target > Y_ML0 + 0.002;
    if (!this.group.visible) return;

    const L = this.level;
    const sx = this.slope.x, sz = this.slope.y;
    const yMin = Y_WATER_BOTTOM + 0.004, yMax = Y_WALL_TOP - 0.012;
    const height = (x, z, r) => {
      let y = L + sx * x + sz * z;
      if (!reduceMotion) {
        y += 0.0018 * Math.sin(x * 9 + t * 1.7) + 0.0014 * Math.sin(z * 11 - t * 2.1);
        y += this.turb * (0.012 * Math.sin(x * 23 + t * 9) + 0.01 * Math.sin(z * 19 - t * 11));
        if (this.ripple > 0.0005) y += this.ripple * Math.sin(r * 34 - this.rippleT * 14) * Math.exp(-r * 2.5);
      }
      y += 0.004 * Math.pow(r / R_IN, 8); // Meniskus am Rand
      return Math.max(yMin, Math.min(yMax, y));
    };
    // Oberfläche
    const pos = this.top.geometry.attributes.position;
    const arr = pos.array;
    arr[1] = height(0, 0, 0);
    for (let v = 1; v < pos.count; v++) {
      const r = this.polar[v * 2];
      arr[v * 3 + 1] = height(arr[v * 3], arr[v * 3 + 2], r);
    }
    pos.needsUpdate = true;
    this.top.geometry.computeVertexNormals();
    // Seitenwand folgt dem Rand der Oberfläche
    const sp = this.side.geometry.attributes.position.array;
    const edge = 1 + (this.rings - 1) * this.seg;
    for (let i = 0; i < this.seg; i++) {
      sp[(i * 2) * 3 + 1] = Y_WATER_BOTTOM;
      sp[(i * 2 + 1) * 3 + 1] = arr[(edge + i) * 3 + 1];
    }
    this.side.geometry.attributes.position.needsUpdate = true;
  }
}

/* ---------- Die Flasche ---------- */
const instances = new Set();
let rafId = 0;
let lastFrame = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
  lastFrame = now;
  let any = false;
  instances.forEach((b) => { if (b.visible) { b.tick(dt, now / 1000); any = true; } });
  rafId = any ? requestAnimationFrame(frame) : 0;
  if (!any) lastFrame = 0;
}
function wake() { if (!rafId) rafId = requestAnimationFrame(frame); }

class Bottle3D {
  static supported() {
    if (Bottle3D._sup != null) return Bottle3D._sup;
    try {
      const c = document.createElement('canvas');
      const gl = window.WebGL2RenderingContext && c.getContext('webgl2');
      Bottle3D._sup = !!gl;
      if (gl && gl.getExtension('WEBGL_lose_context')) gl.getExtension('WEBGL_lose_context').loseContext();
    } catch (e) { Bottle3D._sup = false; }
    return Bottle3D._sup;
  }

  constructor(host, opts = {}) {
    this.host = host;
    this.opts = Object.assign({ bags: false, backdrop: 'stage', interactive: true }, opts);
    this._mode = null;
    this.state = { fill: 500, lid: 0, lidTarget: 0, drink: 0, drinkTarget: 0, explode: 0, explodeTarget: 0, bag: 0, location: 'tisch', mode: 'progress', bars: 0, brightness: 80 };
    this.spin = 0; this.spinVel = 0; this.dragging = false; this.lastInteract = -10;
    this.visible = false;

    const renderer = (this.renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.className = 'fu-3d';
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'Fresh Up Flasche in 3D – zum Drehen ziehen');
    host.textContent = '';
    host.appendChild(renderer.domElement);

    const scene = (this.scene = new Scene());
    scene.environment = studioEnv(renderer);
    this.camera = new PerspectiveCamera(26, 1, 0.1, 60);

    const key = new DirectionalLight(0xffffff, 1.4);
    key.position.set(-3, 5, 4);
    const rim = new DirectionalLight(0xbfe6ff, 1.1);
    rim.position.set(2.5, 3, -4);
    this.hemi = new HemisphereLight(0xffffff, 0x445566, 0.35);
    this.key = key;
    scene.add(key, rim, this.hemi);

    this.M = materials();
    this.M.reflect.bumpMap = dropletTex();
    this.M.reflect.bumpScale = 0.75;

    this.buildStage();
    this.buildBottle();
    if (this.opts.bags) this.buildBags();
    this.applyTheme();

    // Größe, Sichtbarkeit, Theme
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.inView = false;
    this.io = new IntersectionObserver((e) => { this.inView = e[e.length - 1].isIntersecting; this.visible = this.inView && !document.hidden; if (this.visible) wake(); });
    this.io.observe(host);
    this.onVis = () => { this.visible = this.inView && !document.hidden; if (this.visible) wake(); };
    document.addEventListener('visibilitychange', this.onVis);
    this.mo = new MutationObserver(() => this.applyTheme());
    this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    this.mq = window.matchMedia('(prefers-color-scheme: dark)');
    this.onScheme = () => this.applyTheme();
    this.mq.addEventListener && this.mq.addEventListener('change', this.onScheme);
    if (this.opts.interactive) this.bindDrag();
    instances.add(this);
    this.resize();
    // Schriften für Logo/Skala nachladen
    if (document.fonts && document.fonts.load) {
      document.fonts.load('700 72px Sora').then(() => {
        this.scaleMesh.material.map = scaleTex();
        this.logoMesh.material.map = logoTex();
        this.scaleMesh.material.needsUpdate = this.logoMesh.material.needsUpdate = true;
      }).catch(() => {});
    }
  }

  /* ----- Bühne ----- */
  buildStage() {
    const floor = (this.floor = new Mesh(new PlaneGeometry(40, 40), new MeshStandardMaterial({ color: 0xc8d3df, roughness: 0.9 })));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    this.shadow = new Mesh(new PlaneGeometry(1.7, 1.7), new MeshBasicMaterial({ map: radialTex('rgba(10,20,35,0.62)', 'rgba(10,20,35,0)'), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.002;
    this.glow = new Mesh(new PlaneGeometry(1.5, 1.1), new MeshBasicMaterial({ map: radialTex(), transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0, toneMapped: false }));
    this.glow.rotation.order = 'YXZ';
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.set(0, 0.004, R_BASE + 0.36);
    this.scene.add(this.shadow, this.glow);
  }

  applyTheme() {
    const el = this.host;
    const card = this.opts.backdrop === 'card';
    const top = cssVar(el, card ? '--surface' : '--stage-top', '#e9eff6');
    const bottom = cssVar(el, card ? '--surface-2' : '--stage-bottom', '#cfd9e5');
    const table = cssVar(el, card ? '--surface-2' : '--table', '#b9c6d4');
    const bg = canvasTex(4, 256, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, top);
      grd.addColorStop(1, bottom);
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    });
    if (this.scene.background && this.scene.background.dispose) this.scene.background.dispose();
    this.scene.background = bg;
    this.scene.fog = new Fog(new Color(bottom), 9, 24);
    this.floor.material.color.set(table);
    const dark = new Color(top).getHSL({}).l < 0.4;
    this.M.tint.opacity = dark ? 0.26 : 0.2;
    this.renderer.toneMappingExposure = dark ? 1.15 : 1.05;
    wake();
  }

  /* ----- Flasche ----- */
  buildBottle() {
    const M = this.M;
    this.root = new Group();      // Position + Kippen
    this.spinner = new Group();   // Drehen
    this.root.add(this.spinner);
    this.scene.add(this.root);
    const P = (this.parts = {});
    const part = (name) => { const g = new Group(); g.userData.home = 0; P[name] = g; this.spinner.add(g); return g; };

    // Fuß
    const foot = part('foot');
    foot.add(new Mesh(lathe([[0, 0], [0.37, 0], [0.39, 0.008], [0.397, 0.026], [0.37, 0.034], [0, 0.034]]), M.foot));

    // Sockel mit Display
    const base = part('base');
    base.add(new Mesh(lathe([[0, 0.02], [0.37, 0.02], [0.398, 0.032], [R_BASE, 0.07], [R_BASE, 0.555], [R_BASE - 0.006, 0.575], [R_BASE - 0.022, Y_BASE_TOP], [R_BODY + 0.003, Y_BASE_TOP], [R_BODY + 0.003, 0.5]]), M.base));
    const pill = new Mesh(new ExtrudeGeometry(roundRect(0.13, 0.34, 0.065), { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 16 }), M.pill);
    pill.position.set(0, 0.3, R_BASE - 0.008);
    base.add(pill);
    this.segs = [];
    const segGeo = new ExtrudeGeometry(roundRect(0.072, 0.02, 0.01), { depth: 0.004, bevelEnabled: false, curveSegments: 8 });
    [0.405, 0.37, 0.335, 0.3].forEach((y) => {
      const m = new Mesh(segGeo, new MeshStandardMaterial({ color: 0x0b0d10, emissive: 0x000000, roughness: 0.4 }));
      m.position.set(0, y, R_BASE + 0.0105);
      base.add(m);
      this.segs.push(m);
    });
    const dropShape = new Shape(dropPoints(0.034, 0));
    dropShape.holes.push(new Path(dropPoints(0.02, -0.008)));
    this.dropMesh = new Mesh(new ExtrudeGeometry(dropShape, { depth: 0.004, bevelEnabled: false }), new MeshStandardMaterial({ color: 0x0b0d10, emissive: 0x000000, roughness: 0.4 }));
    this.dropMesh.position.set(0, 0.215, R_BASE + 0.0105);
    base.add(this.dropMesh);
    this.halo = new Mesh(new PlaneGeometry(0.42, 0.6), new MeshBasicMaterial({ map: radialTex(), transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0, toneMapped: false }));
    this.halo.position.set(0, 0.31, R_BASE + 0.03);
    this.halo.renderOrder = 6;
    base.add(this.halo);

    // Glaskörper mit Wasser
    const body = part('body');
    const prof = [[R_BODY - 0.02, 0.52]];
    for (let y = 0.54; y < Y_WALL_TOP; y += 0.05) prof.push([R_BODY, y]);
    prof.push([R_BODY, Y_WALL_TOP]);
    for (let i = 1; i <= 12; i++) {
      const t = i / 12, it = 1 - t;
      prof.push([it * it * R_BODY + 2 * it * t * R_BODY + t * t * (R_NECK + 0.012), it * it * Y_WALL_TOP + 2 * it * t * 1.79 + t * t * 1.825]);
    }
    prof.push([R_NECK, 1.845], [R_NECK, 1.97]);
    const glassGeo = lathe(prof, 96);
    this.water = new Water(M.water);
    body.add(this.water.group);
    const tint = new Mesh(glassGeo, M.tint);
    const reflect = new Mesh(glassGeo, M.reflect);
    const fres = new Mesh(lathe(prof.map(([x, y]) => [x + 0.002, y]), 96), fresnelMaterial());
    tint.renderOrder = 3; reflect.renderOrder = 4; fres.renderOrder = 5;
    body.add(tint, reflect, fres);
    [1.875, 1.91].forEach((y) => {
      const th = new Mesh(new TorusGeometry(R_NECK + 0.004, 0.006, 8, 64), M.tint);
      th.rotation.x = Math.PI / 2; th.position.y = y; th.renderOrder = 3;
      body.add(th);
    });
    // Skala und Logo
    this.scaleMesh = new Mesh(new CylinderGeometry(R_BODY + 0.002, R_BODY + 0.002, 1.0, 24, 1, true, -1.0, 0.5), new MeshBasicMaterial({ map: scaleTex(), transparent: true, depthWrite: false, toneMapped: false, opacity: 1 }));
    this.scaleMesh.position.y = 1.1;
    this.scaleMesh.renderOrder = 7;
    this.logoMesh = new Mesh(new CylinderGeometry(R_BODY + 0.002, R_BODY + 0.002, 0.15, 32, 1, true, -0.12, 1.0), new MeshBasicMaterial({ map: logoTex(), transparent: true, depthWrite: false, toneMapped: false, opacity: 1 }));
    this.logoMesh.position.y = 0.69;
    this.logoMesh.renderOrder = 7;
    body.add(this.scaleMesh, this.logoMesh);
    // Bläschen
    this.bubbles = new InstancedMesh(new SphereGeometry(1, 10, 8), M.bubble, 60);
    this.bubbles.renderOrder = 2;
    this.bubbleData = Array.from({ length: 60 }, () => ({ x: 0, y: -1, z: 0, s: 0, v: 0, alive: false }));
    this.bubbleTimer = 0;
    body.add(this.bubbles);

    // Dichtungsring (nur in der Explosionsansicht sichtbar)
    const ring = part('ring');
    const seal = new Mesh(new TorusGeometry(R_NECK + 0.012, 0.014, 12, 64), M.ring);
    seal.rotation.x = Math.PI / 2;
    seal.position.y = 1.93;
    ring.add(seal);
    ring.visible = false;

    // Trinköffnung
    const spout = part('spout');
    const sp = new Mesh(new CylinderGeometry(0.072, 0.08, 0.09, 40), M.spout);
    sp.position.set(-0.03, Y_COLLAR_TOP + 0.045, 0.03);
    const hole = new Mesh(new CircleGeometry(0.048, 32), new MeshBasicMaterial({ color: 0x020203 }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(-0.03, Y_COLLAR_TOP + 0.0905, 0.03);
    spout.add(sp, hole);

    // Deckel: Kragen, Druckknopf, Tragegriff, Klappdeckel
    const lid = part('lid');
    lid.add(new Mesh(lathe([[R_NECK + 0.004, Y_COLLAR_BOTTOM], [R_COLLAR - 0.014, Y_COLLAR_BOTTOM], [R_COLLAR - 0.002, Y_COLLAR_BOTTOM + 0.012], [R_COLLAR, Y_COLLAR_BOTTOM + 0.03], [R_COLLAR, Y_COLLAR_TOP - 0.012], [R_COLLAR - 0.008, Y_COLLAR_TOP], [0.15, Y_COLLAR_TOP]], 72), M.lid));
    const latch = new Mesh(new ExtrudeGeometry(roundRect(0.1, 0.14, 0.026), { depth: 0.028, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 3 }), M.latch);
    const la = -0.55;
    latch.position.set(Math.sin(la) * (R_COLLAR - 0.012), 2.075, Math.cos(la) * (R_COLLAR - 0.012));
    latch.rotation.y = la;
    lid.add(latch);
    const loopCurve = new CatmullRomCurve3([
      new Vector3(0.17, 2.23, 0), new Vector3(0.34, 2.26, 0), new Vector3(0.5, 2.15, 0),
      new Vector3(0.52, 1.95, 0), new Vector3(0.41, 1.84, 0), new Vector3(0.27, 1.93, 0)
    ]);
    lid.add(new Mesh(new TubeGeometry(loopCurve, 64, 0.03, 14, false), M.lid));
    this.flipPivot = new Group();
    this.flipPivot.position.set(R_COLLAR - 0.01, Y_COLLAR_TOP, 0);
    const cap = new Mesh(lathe([[0, 0], [0.228, 0], [0.236, 0.012], [0.236, 0.09], [0.224, 0.122], [0.19, 0.142], [0.11, 0.15], [0, 0.152]], 72), M.lid);
    cap.position.set(-(R_COLLAR - 0.01), 0, 0);
    this.flipPivot.add(cap);
    lid.add(this.flipPivot);
  }

  buildBags() {
    const M = this.M;
    // Rucksack: Rückenteil + Netztasche
    const ruck = (this.ruck = new Group());
    const back = new Mesh(new ExtrudeGeometry(roundRect(1.9, 2.8, 0.35), { depth: 0.35, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 4 }), new MeshStandardMaterial({ color: 0x334050, roughness: 0.95 }));
    back.position.set(0, 1.35, -1.05);
    const mesh = new Mesh(new CylinderGeometry(0.5, 0.47, 1.12, 48, 1, true, -1.75, 3.5), new MeshStandardMaterial({ map: fabricTex('#33404f', '#4d5d70'), roughness: 0.9, side: DoubleSide }));
    mesh.position.y = 0.56;
    const rim = new Mesh(new TorusGeometry(0.5, 0.04, 10, 48, 3.5), new MeshStandardMaterial({ color: 0x55657a, roughness: 0.8 }));
    rim.rotation.order = 'YXZ';
    rim.rotation.set(Math.PI / 2, 0.18, 0);
    rim.position.y = 1.12;
    const strap = new Mesh(new BoxGeometry(0.16, 2.4, 0.06), new MeshStandardMaterial({ color: 0x151a21, roughness: 0.9 }));
    strap.position.set(0.75, 1.3, -0.62);
    ruck.add(back, mesh, rim, strap);
    // Sporttasche
    const sport = (this.sport = new Group());
    const navy = new MeshStandardMaterial({ color: 0x1f3f6c, roughness: 0.85 });
    const front = new Mesh(new ExtrudeGeometry(roundRect(2.6, 1.3, 0.25), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3 }), navy);
    front.position.set(0, 0.6, 0.55);
    const backP = front.clone();
    backP.position.z = -0.85;
    const zip = new Mesh(new BoxGeometry(2.5, 0.05, 0.05), new MeshStandardMaterial({ color: 0xd6dde6, roughness: 0.4 }));
    zip.position.set(0, 1.23, 0.72);
    const pull = new Mesh(new BoxGeometry(0.1, 0.16, 0.03), new MeshStandardMaterial({ color: 0xd6dde6, roughness: 0.3, metalness: 0.4 }));
    pull.position.set(0.7, 1.15, 0.75);
    const band = new Mesh(new BoxGeometry(2.62, 0.08, 0.02), new MeshStandardMaterial({ color: 0x2b5288, roughness: 0.8 }));
    band.position.set(0, 0.95, 0.73);
    sport.add(front, backP, zip, pull, band);
    ruck.position.y = sport.position.y = -3;
    ruck.visible = sport.visible = false;
    this.scene.add(ruck, sport);
  }

  /* ----- Ziehen zum Drehen ----- */
  bindDrag() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'pan-y';
    let lastX = 0, lastT = 0;
    el.addEventListener('pointerdown', (e) => {
      this.dragging = true; lastX = e.clientX; lastT = performance.now();
      this.spinVel = 0;
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      wake();
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - lastX, now = performance.now();
      const d = dx * 0.012;
      this.spin += d;
      this.spinVel = d / Math.max(0.016, (now - lastT) / 1000);
      lastX = e.clientX; lastT = now;
      this.lastInteract = now / 1000;
      this.water.kick(0, -d * 0.6);
    });
    const end = () => { this.dragging = false; this.lastInteract = performance.now() / 1000; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.frameCamera();
    wake();
  }

  frameCamera() {
    const ex = this.state.explode;
    const lid = this.state.lid;
    const H = 2.75 + ex * 0.95 + this.state.drink * 0.2 + lid * 0.32;
    const W = 1.5 + this.state.drink * 0.35 + lid * 0.12;
    const t = Math.tan((this.camera.fov * Math.PI) / 360);
    const dist = Math.max(H / 2 / t, W / 2 / (t * this.camera.aspect)) * 1.04;
    const cy = 1.12 + ex * 0.5 + this.state.drink * 0.12 + lid * 0.16;
    this.camera.position.set(0, cy + dist * 0.09, dist);
    this.camera.lookAt(0, cy, 0);
    this.camera.updateProjectionMatrix();
  }

  /* ----- Schnittstelle (wie BottleView) ----- */
  setFill(ml) {
    const prev = this.water.target;
    this.water.target = levelOf(ml);
    if (Math.abs(prev - this.water.target) > 0.002) wake();
  }
  setLid(open) {
    const t = open ? 1 : 0;
    if (t !== this.state.lidTarget) { this.state.lidTarget = t; this.water.kick(0.15, 0); wake(); }
  }
  setLocation(loc) {
    if (loc === this.state.location) return;
    this.state.location = loc;
    this.water.kick(0.5, 0.3);
    wake();
  }
  setDrinking(on) {
    const t = on ? 1 : 0;
    if (t !== this.state.drinkTarget) { this.state.drinkTarget = t; wake(); }
  }
  setExploded(on) { this.state.explodeTarget = on ? 1 : 0; this.parts.ring.visible = true; wake(); }
  highlight(part) {
    this.hl = part;
    Object.keys(this.parts).forEach((k) => {
      this.parts[k].traverse((o) => {
        if (!o.isMesh || !o.material || !o.material.emissive || this.segs.includes(o) || o === this.dropMesh) return;
        if (!o.userData.ownMat) { o.material = o.material.clone(); o.userData.ownMat = true; }
        o.material.emissive.set(k === part ? 0x2b8cff : 0x000000);
        o.material.emissiveIntensity = k === part ? 0.22 : 0;
      });
    });
    if (part === 'ring') this.parts.ring.visible = true;
    wake();
  }
  setLed(mode, bars, brightness) {
    this._mode = mode;
    Object.assign(this.state, { mode, bars, brightness });
    wake();
  }
  splash(kind) {
    if (kind === 'refill') {
      this.water.turb = 1;
      this.bubbleTimer = 2.4;
      this.water.ripple = 0.02;
    } else {
      this.water.ripple = 0.014;
      this.water.kick(0.35, 0.2);
    }
    this.water.rippleT = 0;
    wake();
  }

  /* ----- Animation ----- */
  tick(dt, t) {
    const s = this.state;
    s.lid = damp(s.lid, s.lidTarget, 7, dt);
    s.drink = damp(s.drink, s.drinkTarget, 4.5, dt);
    s.explode = damp(s.explode, s.explodeTarget, 4, dt);
    const inBag = this.opts.bags && s.location !== 'tisch';
    s.bag = damp(s.bag, inBag ? 1 : 0, 4, dt);

    // Deckel: Feder-Überschwinger beim Öffnen
    this.flipPivot.rotation.z = -s.lid * (110 * Math.PI / 180);

    // Drehen: Ziehen, Trägheit, leichtes Pendeln im Ruhezustand
    if (!this.dragging) {
      this.spinVel *= Math.exp(-dt * 3);
      this.spin += this.spinVel * dt;
      if (!reduceMotion && t - this.lastInteract > 4) {
        const idle = Math.sin(t * 0.45) * 0.32;
        this.spin = damp(this.spin, idle, 0.6, dt);
      }
    }
    this.spinner.rotation.y = this.spin;

    // Trinken: anheben und kippen
    this.root.position.y = s.drink * 0.24 + s.explode * 0.55;
    this.root.position.x = -s.drink * 0.06;
    this.root.rotation.z = s.drink * 0.6;
    this.frameCamera();

    // Explosionsansicht
    const off = { lid: 0.62, spout: 0.36, ring: 0.18, body: 0, base: -0.3, foot: -0.55 };
    Object.keys(off).forEach((k) => { this.parts[k].position.y = off[k] * s.explode; });
    if (s.explodeTarget === 0 && s.explode < 0.02 && this.hl !== 'ring') this.parts.ring.visible = false;

    // Schatten und Lichtschein folgen der Flasche
    const gd = R_BASE + 0.36;
    this.glow.position.set(Math.sin(this.spin) * gd + this.root.position.x, 0.004, Math.cos(this.spin) * gd);
    this.glow.rotation.y = this.spin;
    this.shadow.material.opacity = (1 - s.drink * 0.7) * (1 - s.bag);
    const sc = 1 + s.drink * 0.4;
    this.shadow.scale.set(sc, sc, sc);

    // Wasser: Zielneigung = Weltoberfläche im lokalen System der Flasche
    this.spinner.updateWorldMatrix(true, false);
    const q = new Quaternion();
    this.spinner.getWorldQuaternion(q);
    const up = new Vector3(0, 1, 0).applyQuaternion(q.invert());
    const target = new Vector2(-up.x / Math.max(0.2, up.y), -up.z / Math.max(0.2, up.y));
    this.water.update(dt, t, target, s.explode < 0.98);

    // Bläschen
    this.bubbleTimer = Math.max(0, this.bubbleTimer - dt);
    const dummy = this._dummy || (this._dummy = new Object3D());
    let anyBubble = false;
    this.bubbleData.forEach((b, i) => {
      if (!b.alive && this.bubbleTimer > 0 && Math.random() < dt * 20) {
        const r = Math.sqrt(Math.random()) * (R_IN - 0.05), a = Math.random() * Math.PI * 2;
        Object.assign(b, { alive: true, x: Math.sin(a) * r, z: Math.cos(a) * r, y: Y_WATER_BOTTOM + 0.03, s: 0.006 + Math.random() * 0.014, v: 0.25 + Math.random() * 0.45 });
      }
      if (b.alive) {
        b.y += b.v * dt;
        b.x += Math.sin(t * 6 + i) * 0.0008;
        if (b.y > this.water.level - 0.01) b.alive = false;
      }
      dummy.position.set(b.x, b.y, b.z);
      dummy.scale.setScalar(b.alive ? b.s : 0);
      dummy.updateMatrix();
      this.bubbles.setMatrixAt(i, dummy.matrix);
      anyBubble = anyBubble || b.alive;
    });
    this.bubbles.instanceMatrix.needsUpdate = true;
    this.bubbles.visible = anyBubble;

    // LED
    const ledOn = s.mode !== 'off';
    let col = LED.blue, lit = (i) => i < s.bars, amp = 0.35 + 0.65 * (s.brightness / 100);
    if (s.mode === 'alert') {
      col = LED.red;
      lit = () => true;
      if (!reduceMotion) amp *= (Math.floor(t * 2) % 2 === 0 ? 1 : 0.1);
    } else if (s.mode === 'find') {
      lit = () => true;
      amp *= (Math.floor(t * 5.5) % 2 === 0 ? 1 : 0.1);
    }
    this.segs.forEach((m, i) => {
      const on = ledOn && lit(i);
      m.material.emissive.copy(on ? col : LED.off);
      m.material.emissiveIntensity = on ? 2.6 * amp : 0;
      m.material.color.set(on ? col : 0x0b0d10);
    });
    this.dropMesh.material.emissive.copy(ledOn ? col : LED.off);
    this.dropMesh.material.emissiveIntensity = ledOn ? 2.4 * amp : 0;
    const litCount = ledOn ? (s.mode === 'progress' ? s.bars + 1 : 5) : 0;
    const glowAmt = ledOn ? Math.min(1, 0.25 + litCount * 0.15) * amp : 0;
    this.halo.material.color.copy(col);
    this.halo.material.opacity = glowAmt * 0.55;
    this.glow.material.color.copy(col);
    this.glow.material.opacity = glowAmt * 0.5 * (1 - s.drink) * (1 - s.bag);

    // Taschen und Dunkelheit
    if (this.opts.bags) {
      const showR = s.location === 'rucksack', showS = s.location === 'sport';
      const slide = (g, show) => {
        g.position.y = damp(g.position.y, show ? 0 : -3, 5, dt);
        g.visible = g.position.y > -2.95;
      };
      slide(this.ruck, showR);
      slide(this.sport, showS);
    }
    this.scene.environmentIntensity = 1 - s.bag * 0.6;
    this.key.intensity = 1.4 * (1 - s.bag * 0.65);
    this.hemi.intensity = 0.35 * (1 - s.bag * 0.5);

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    instances.delete(this);
    this.ro.disconnect();
    this.io.disconnect();
    this.mo.disconnect();
    document.removeEventListener('visibilitychange', this.onVis);
    this.mq.removeEventListener && this.mq.removeEventListener('change', this.onScheme);
    this.renderer.dispose();
  }
}

FU.Bottle3D = Bottle3D;
window.dispatchEvent(new Event('fu:3d-ready'));
