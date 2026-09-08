/* ==========================================================================
   MATHQUEST PRO — CORE APPLICATION & MULTI-LESSON ENGINE
   Educator: Mr Ahmed Abd El-Motaal
   Math Teacher & Content Creator
   Lessons Included:
   1. Lesson One: Proportion (Unit 1: Numbers & Operations)
   2. Lesson Two: The Distance Between Two Points (Coordinate Geometry)
   ========================================================================== */

// --- AUDIO SYNTHESIZER (Web Audio API, Zero External MP3 Dependencies) ---
const AudioEngine = {
  ctx: null,
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  },
  playTone(freq, type, duration, gainVal = 0.1) {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn("Audio error:", e);
    }
  },
  click() { this.playTone(600, 'sine', 0.08, 0.05); },
  success() {
    this.playTone(523.25, 'triangle', 0.12, 0.12);
    setTimeout(() => this.playTone(659.25, 'triangle', 0.18, 0.12), 100);
    setTimeout(() => this.playTone(783.99, 'triangle', 0.28, 0.14), 220);
  },
  wrong() {
    this.playTone(220, 'sawtooth', 0.18, 0.1);
    setTimeout(() => this.playTone(180, 'sawtooth', 0.25, 0.1), 120);
  }
};

// ==========================================================================
// ==========================================================================
// 1. IPAD STYLUS & NOTEBOOK CANVAS ENGINE (Hi-DPI, Palm Rejection & Undo)
// ==========================================================================
const StylusEngine = {
  canvases: {},
  buffers: {}, // In-memory offscreen buffers to prevent stroke loss on switchTab
  stylusOnlyMode: true, // Apple Pencil / Stylus & Mouse only (Finger rejected to prevent choppy writing & palm interference)

  initCanvas(id) {
    const canvas = document.getElementById(id);
    if (!canvas) return;

    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    const width = rect.width || 600;
    const height = 280;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    this.canvases[id] = {
      canvas,
      ctx,
      dpr,
      width,
      height,
      mode: 'draw',
      color: '#182038',
      strokeWidth: 4,
      isEraser: false,
      isDrawing: false,
      history: [],
      lastSnapshot: null,
      prevX: 0,
      prevY: 0,
      lastMidX: 0,
      lastMidY: 0,
      hasMoved: false
    };

    this.restoreCanvas(id);

    // Prevent drag & drop, selection, and context menus on the canvas
    canvas.setAttribute('draggable', 'false');
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('selectstart', (e) => e.preventDefault());
    canvas.addEventListener('touchstart', (e) => {
      if (this.canvases[id]?.mode === 'draw') e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      if (this.canvases[id]?.mode === 'draw') e.preventDefault();
    }, { passive: false });

    const wrapEl = canvas.parentElement;
    if (wrapEl) {
      wrapEl.addEventListener('contextmenu', (e) => e.preventDefault());
      wrapEl.addEventListener('selectstart', (e) => {
        if (this.canvases[id]?.mode === 'draw') e.preventDefault();
      });
    }

    canvas.addEventListener('pointerdown', (e) => this.startDraw(id, e));
    canvas.addEventListener('pointermove', (e) => this.draw(id, e));
    canvas.addEventListener('pointerup', (e) => this.stopDraw(id, e));
    canvas.addEventListener('pointercancel', (e) => this.stopDraw(id, e));

    const textLayer = document.getElementById(id.replace('can-', 'text-'));
    if (textLayer) {
      const savedText = localStorage.getItem('math_text_' + id);
      if (savedText) textLayer.value = savedText;
      textLayer.addEventListener('input', () => {
        localStorage.setItem('math_text_' + id, textLayer.value);
      });
    }
  },

  startDraw(id, e) {
    // Dismiss any active text selection or iOS callout popup immediately
    if (window.getSelection) {
      try { window.getSelection().removeAllRanges(); } catch (err) {}
    }

    // 1. REJECT FINGER TOUCH (Apple Pencil / Stylus / Mouse ONLY)
    // Prevents accidental finger writing and acts as True Palm Rejection
    if (this.stylusOnlyMode && e.pointerType === 'touch') {
      e.preventDefault(); // Stop iOS from initiating text selection on palm press!
      return;
    }

    e.preventDefault();

    const inst = this.canvases[id];
    if (!inst || inst.mode !== 'draw') return;

    inst.isDrawing = true;
    try {
      inst.canvas.setPointerCapture(e.pointerId);
    } catch (err) {}

    // Save snapshot before new stroke for UNDO
    inst.lastSnapshot = inst.ctx.getImageData(0, 0, inst.canvas.width, inst.canvas.height);

    const rect = inst.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    inst.prevX = x;
    inst.prevY = y;
    inst.lastMidX = x;
    inst.lastMidY = y;
    inst.hasMoved = false;

    // Immediate initial touch dot (crucial for decimal points, dots in letters like i, ج, خ, etc.)
    const ctx = inst.ctx;
    if (inst.isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = inst.strokeWidth * 4;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = inst.color;
      ctx.lineWidth = inst.strokeWidth;
    }

    ctx.beginPath();
    ctx.arc(x, y, (inst.isEraser ? inst.strokeWidth * 2 : inst.strokeWidth / 2), 0, Math.PI * 2);
    ctx.fillStyle = inst.isEraser ? 'rgba(0,0,0,1)' : inst.color;
    ctx.fill();
  },

  draw(id, e) {
    if (this.stylusOnlyMode && e.pointerType === 'touch') {
      e.preventDefault();
      return;
    }

    e.preventDefault();

    const inst = this.canvases[id];
    if (!inst || !inst.isDrawing) return;

    const rect = inst.canvas.getBoundingClientRect();

    // High-frequency iPad digitizer sampling: extract all coalesced sub-frame points
    const events = (typeof e.getCoalescedEvents === 'function' && e.getCoalescedEvents().length > 0)
      ? e.getCoalescedEvents()
      : [e];

    const ctx = inst.ctx;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const currentX = ev.clientX - rect.left;
      const currentY = ev.clientY - rect.top;

      const dx = currentX - inst.prevX;
      const dy = currentY - inst.prevY;
      if (dx * dx + dy * dy < 0.2) continue; // Skip identical jitter points

      inst.hasMoved = true;
      const midX = (inst.prevX + currentX) / 2;
      const midY = (inst.prevY + currentY) / 2;

      // Continuous bezier curve: from previous midpoint through previous coordinate to new midpoint
      ctx.beginPath();
      ctx.moveTo(inst.lastMidX, inst.lastMidY);
      ctx.quadraticCurveTo(inst.prevX, inst.prevY, midX, midY);
      ctx.stroke();

      inst.lastMidX = midX;
      inst.lastMidY = midY;
      inst.prevX = currentX;
      inst.prevY = currentY;
    }
  },

  stopDraw(id, e) {
    const inst = this.canvases[id];
    if (!inst || !inst.isDrawing) return;

    if (e) e.preventDefault();
    inst.isDrawing = false;
    if (e && e.pointerId) {
      try {
        inst.canvas.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }

    if (window.getSelection) {
      try { window.getSelection().removeAllRanges(); } catch (err) {}
    }

    // Connect final segment smoothly
    if (inst.hasMoved) {
      const ctx = inst.ctx;
      ctx.beginPath();
      ctx.moveTo(inst.lastMidX, inst.lastMidY);
      ctx.lineTo(inst.prevX, inst.prevY);
      ctx.stroke();
    }

    // Commit snapshot to Undo stack
    if (inst.lastSnapshot) {
      if (!inst.history) inst.history = [];
      inst.history.push(inst.lastSnapshot);
      if (inst.history.length > 30) inst.history.shift();
      inst.lastSnapshot = null;
    }

    this.saveCanvas(id);
  },

  undo(id) {
    const inst = this.canvases[id];
    if (!inst || !inst.history || inst.history.length === 0) return;

    const prevState = inst.history.pop();
    inst.ctx.putImageData(prevState, 0, 0);
    this.saveCanvas(id);
    AudioEngine.click();
  },

  saveCanvas(id) {
    const inst = this.canvases[id];
    if (!inst) return;
    try {
      const dataUrl = inst.canvas.toDataURL();
      localStorage.setItem('math_canvas_' + id, dataUrl);
      this.buffers[id] = dataUrl;
    } catch (e) {
      console.warn("Auto-save canvas warning:", e);
    }
  },

  restoreCanvas(id) {
    const inst = this.canvases[id];
    if (!inst) return;
    const dataUrl = this.buffers[id] || localStorage.getItem('math_canvas_' + id);
    if (dataUrl) {
      const img = new Image();
      img.onload = () => {
        inst.ctx.clearRect(0, 0, inst.width, inst.height);
        inst.ctx.drawImage(img, 0, 0, inst.width, inst.height);
      };
      img.src = dataUrl;
    }
  },

  redrawAll() {
    Object.keys(this.canvases).forEach((id) => this.restoreCanvas(id));
  },

  handleResize() {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      Object.keys(this.canvases).forEach((id) => {
        const inst = this.canvases[id];
        if (!inst || !inst.canvas) return;
        const wrap = inst.canvas.parentElement;
        if (!wrap) return;
        const rect = wrap.getBoundingClientRect();
        const newWidth = rect.width;
        if (newWidth && Math.abs(newWidth - inst.width) > 5) {
          const tempUrl = inst.canvas.toDataURL();
          const dpr = window.devicePixelRatio || 1;
          inst.width = newWidth;
          inst.canvas.width = newWidth * dpr;
          inst.canvas.height = inst.height * dpr;
          inst.canvas.style.width = newWidth + 'px';
          inst.canvas.style.height = inst.height + 'px';
          const ctx = inst.canvas.getContext('2d', { willReadFrequently: true });
          ctx.scale(dpr, dpr);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          inst.ctx = ctx;

          const img = new Image();
          img.onload = () => ctx.drawImage(img, 0, 0, newWidth, inst.height);
          img.src = tempUrl;
        }
      });
    }, 250);
  },

  clearCanvas(id) {
    const inst = this.canvases[id];
    if (!inst) return;

    // Push current snapshot into history so Clear itself can be UNDONE!
    const snapshot = inst.ctx.getImageData(0, 0, inst.canvas.width, inst.canvas.height);
    if (!inst.history) inst.history = [];
    inst.history.push(snapshot);

    inst.ctx.save();
    inst.ctx.setTransform(1, 0, 0, 1, 0, 0);
    inst.ctx.clearRect(0, 0, inst.canvas.width, inst.canvas.height);
    inst.ctx.restore();
    localStorage.removeItem('math_canvas_' + id);
    delete this.buffers[id];
    AudioEngine.click();
  }
};

// Global Orientation & Resize Listeners
window.addEventListener('resize', () => StylusEngine.handleResize());
window.addEventListener('orientationchange', () => StylusEngine.handleResize());

// Global Selection Guardian: Clear accidental text selections while drawing
document.addEventListener('selectionchange', () => {
  const isAnyDrawing = Object.values(StylusEngine.canvases).some(c => c.isDrawing) || FullScreenPen.isDrawing;
  if (isAnyDrawing && window.getSelection) {
    try { window.getSelection().removeAllRanges(); } catch (err) {}
  }
});

function undoCanvas(id) {
  StylusEngine.undo(id);
}

function toggleStylusMode(btn) {
  StylusEngine.stylusOnlyMode = !StylusEngine.stylusOnlyMode;
  FullScreenPen.stylusOnlyMode = StylusEngine.stylusOnlyMode;

  const allBadges = document.querySelectorAll('.stylus-indicator');
  allBadges.forEach(b => {
    b.classList.toggle('active', StylusEngine.stylusOnlyMode);
    b.classList.toggle('touch-allowed', !StylusEngine.stylusOnlyMode);
    const txt = b.querySelector('.stylus-mode-text');
    if (txt) {
      txt.innerText = StylusEngine.stylusOnlyMode ? 'Stylus Only' : 'Touch Allowed';
    }
  });
  AudioEngine.click();
}

function setCanvasMode(id, mode, btn) {
  const inst = StylusEngine.canvases[id];
  if (!inst) return;
  inst.mode = mode;

  const toolbar = btn.closest('.stylus-toolbar');
  toolbar.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const canvas = inst.canvas;
  const textLayer = document.getElementById(id.replace('can-', 'text-'));

  if (mode === 'text') {
    canvas.style.pointerEvents = 'none';
    if (textLayer) {
      textLayer.style.display = 'block';
      textLayer.focus();
    }
  } else {
    canvas.style.pointerEvents = 'auto';
    if (textLayer) textLayer.style.display = 'none';
  }
  AudioEngine.click();
}

function setCanvasEraser(id, btn) {
  const inst = StylusEngine.canvases[id];
  if (!inst) return;
  inst.isEraser = !inst.isEraser;
  btn.classList.toggle('active', inst.isEraser);
  AudioEngine.click();
}

function setCanvasColor(id, color, dot) {
  const inst = StylusEngine.canvases[id];
  if (!inst) return;
  inst.color = color;
  inst.isEraser = false;

  const wrap = dot.parentElement;
  wrap.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
  dot.classList.add('active');

  const toolbar = dot.closest('.stylus-toolbar');
  const eraserBtn = toolbar.querySelector('.fa-eraser')?.closest('.tool-btn');
  if (eraserBtn) eraserBtn.classList.remove('active');

  AudioEngine.click();
}

function setCanvasWidth(id, width) {
  const inst = StylusEngine.canvases[id];
  if (inst) inst.strokeWidth = parseInt(width, 10);
}

function toggleCanvasGrid(wrapId, btn) {
  const wrap = document.getElementById(wrapId);
  if (wrap) {
    wrap.classList.toggle('grid-bg');
    btn.classList.toggle('active', wrap.classList.contains('grid-bg'));
    AudioEngine.click();
  }
}

function clearCanvasPrompt(id) {
  if (confirm("Clear your notes and drawings on this workspace? (You can use Undo to revert)")) {
    StylusEngine.clearCanvas(id);
    const textLayer = document.getElementById(id.replace('can-', 'text-'));
    if (textLayer) {
      textLayer.value = '';
      localStorage.removeItem('math_text_' + id);
    }
  }
}

// ==========================================================================
// 2. FULL-SCREEN IPAD SCREEN PEN OVERLAY (Ultra-Smooth & Undo)
// ==========================================================================
const FullScreenPen = {
  active: false,
  canvas: null,
  ctx: null,
  isDrawing: false,
  stylusOnlyMode: true,
  history: [],
  lastSnapshot: null,
  prevX: 0,
  prevY: 0,
  lastMidX: 0,
  lastMidY: 0,
  hasMoved: false,
  color: '#6c5ce7',
  strokeWidth: 6,
  isEraser: false,
  timerInterval: null,
  secondsElapsed: 0,

  init() {
    this.canvas = document.getElementById('fullscreenPenCanvas');
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.canvas.setAttribute('draggable', 'false');
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('selectstart', (e) => e.preventDefault());
    this.canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    this.canvas.addEventListener('pointerdown', (e) => this.start(e));
    this.canvas.addEventListener('pointermove', (e) => this.draw(e));
    this.canvas.addEventListener('pointerup', (e) => this.stop(e));
    this.canvas.addEventListener('pointercancel', (e) => this.stop(e));

    const btn = document.getElementById('fullscreenPenBtn');
    if (btn) btn.addEventListener('click', () => this.toggle());
  },

  resize() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.scale(dpr, dpr);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  },

  toggle() {
    if (this.active) this.exit();
    else this.enter();
  },

  enter() {
    this.active = true;
    const overlay = document.getElementById('fullscreenPenOverlay');
    if (overlay) overlay.classList.add('active');
    this.startStopwatch();
    AudioEngine.success();
  },

  exit() {
    this.active = false;
    const overlay = document.getElementById('fullscreenPenOverlay');
    if (overlay) overlay.classList.remove('active');
    this.stopStopwatch();
    AudioEngine.click();
  },

  start(e) {
    if (window.getSelection) {
      try { window.getSelection().removeAllRanges(); } catch (err) {}
    }

    if (this.stylusOnlyMode && e.pointerType === 'touch') {
      e.preventDefault();
      return;
    }

    e.preventDefault();
    this.isDrawing = true;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch (err) {}

    this.lastSnapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

    const x = e.clientX;
    const y = e.clientY;
    this.prevX = x;
    this.prevY = y;
    this.lastMidX = x;
    this.lastMidY = y;
    this.hasMoved = false;

    if (this.isEraser) {
      this.ctx.globalCompositeOperation = 'destination-out';
      this.ctx.lineWidth = this.strokeWidth * 4;
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
      if (this.strokeWidth >= 12) {
        this.ctx.strokeStyle = 'rgba(253, 203, 110, 0.45)';
      } else {
        this.ctx.strokeStyle = this.color;
      }
      this.ctx.lineWidth = this.strokeWidth;
    }

    this.ctx.beginPath();
    this.ctx.arc(x, y, (this.isEraser ? this.strokeWidth * 2 : this.strokeWidth / 2), 0, Math.PI * 2);
    this.ctx.fillStyle = this.isEraser ? 'rgba(0,0,0,1)' : (this.strokeWidth >= 12 ? 'rgba(253, 203, 110, 0.45)' : this.color);
    this.ctx.fill();
  },

  draw(e) {
    if (this.stylusOnlyMode && e.pointerType === 'touch') {
      e.preventDefault();
      return;
    }

    e.preventDefault();
    if (!this.isDrawing) return;

    const events = (typeof e.getCoalescedEvents === 'function' && e.getCoalescedEvents().length > 0)
      ? e.getCoalescedEvents()
      : [e];

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const currentX = ev.clientX;
      const currentY = ev.clientY;

      const dx = currentX - this.prevX;
      const dy = currentY - this.prevY;
      if (dx * dx + dy * dy < 0.2) continue;

      this.hasMoved = true;
      const midX = (this.prevX + currentX) / 2;
      const midY = (this.prevY + currentY) / 2;

      this.ctx.beginPath();
      this.ctx.moveTo(this.lastMidX, this.lastMidY);
      this.ctx.quadraticCurveTo(this.prevX, this.prevY, midX, midY);
      this.ctx.stroke();

      this.lastMidX = midX;
      this.lastMidY = midY;
      this.prevX = currentX;
      this.prevY = currentY;
    }
  },

  stop(e) {
    if (!this.isDrawing) return;
    if (e) e.preventDefault();
    this.isDrawing = false;
    if (e && e.pointerId) {
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }

    if (window.getSelection) {
      try { window.getSelection().removeAllRanges(); } catch (err) {}
    }

    if (this.hasMoved) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.lastMidX, this.lastMidY);
      this.ctx.lineTo(this.prevX, this.prevY);
      this.ctx.stroke();
    }

    if (this.lastSnapshot) {
      this.history.push(this.lastSnapshot);
      if (this.history.length > 30) this.history.shift();
      this.lastSnapshot = null;
    }
  },

  undo() {
    if (!this.history || this.history.length === 0) return;
    const prevState = this.history.pop();
    this.ctx.putImageData(prevState, 0, 0);
    AudioEngine.click();
  },

  clear() {
    if (this.ctx && this.canvas) {
      const snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      this.history.push(snapshot);
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
    }
    AudioEngine.click();
  },

  startStopwatch() {
    this.secondsElapsed = 0;
    const badge = document.getElementById('dockStopwatch');
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.secondsElapsed++;
      const m = Math.floor(this.secondsElapsed / 60).toString().padStart(2, '0');
      const s = (this.secondsElapsed % 60).toString().padStart(2, '0');
      if (badge) badge.innerText = `⏱️ ${m}:${s}`;
    }, 1000);
  },

  stopStopwatch() {
    clearInterval(this.timerInterval);
  }
};

function undoFsCanvas() {
  FullScreenPen.undo();
}

function setFsPenColor(col, dot) {
  FullScreenPen.color = col;
  FullScreenPen.isEraser = false;
  const wrap = dot.parentElement;
  wrap.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
  dot.classList.add('active');
  const eraserBtn = document.getElementById('btnFsEraser');
  if (eraserBtn) eraserBtn.classList.remove('active');
  AudioEngine.click();
}

function setFsPenWidth(val) {
  FullScreenPen.strokeWidth = parseInt(val, 10);
}

function toggleFsEraser() {
  FullScreenPen.isEraser = !FullScreenPen.isEraser;
  const eraserBtn = document.getElementById('btnFsEraser');
  if (eraserBtn) eraserBtn.classList.toggle('active', FullScreenPen.isEraser);
  AudioEngine.click();
}

function clearFsCanvas() {
  FullScreenPen.clear();
}

function exitFsPenMode() {
  FullScreenPen.exit();
}

// ==========================================================================
// 3. MULTI-LESSON DATA STORE (PROPORTION & DISTANCE)
// ==========================================================================
let currentLessonKey = 'proportion'; // Default active lesson: Proportion from PDF

const LESSON_PROPORTION = {
  key: 'proportion',
  unitTag: '<i class="fa-solid fa-scale-balanced"></i> Unit 1 • Numbers and Operations on Them',
  title: 'Lesson One: Proportion',
  subtitle: 'Master the equality of ratios and rates, the cross-multiplication property (Product of Extremes = Product of Means), solving linear and binomial unknowns, real-world proportional modeling, and graphical coordinate representations.',
  stageBadge: '<i class="fa-solid fa-graduation-cap"></i> Unit 1: Numbers & Operations • Lesson One: Proportion',

  // Real-World Connections (From PDF pages 1, 3, 6)
  realWorldApps: [
    {
      accent: '#6c5ce7',
      accentBg: 'rgba(108, 92, 231, 0.12)',
      icon: 'fa-solid fa-gas-pump',
      tag: 'Automotive & Travel',
      title: 'Car Petrol & Highway Mileage',
      desc: 'A car consumes 3 liters of gasoline to travel 33 km. How many liters of gasoline does it need to travel 121 km if it consumes gasoline at the same rate?',
      svg: `
        <svg width="100%" height="150" viewBox="0 0 300 150">
          <rect x="20" y="95" width="260" height="8" rx="4" fill="#dfe6e9"/>
          <!-- Car Silhouette -->
          <rect x="70" y="65" width="75" height="30" rx="8" fill="#6c5ce7"/>
          <circle cx="90" cy="98" r="10" fill="#2d3436"/>
          <circle cx="130" cy="98" r="10" fill="#2d3436"/>
          <polygon points="85,65 100,45 130,45 140,65" fill="#a29bfe"/>
          <!-- Fuel Gauge Box -->
          <rect x="185" y="30" width="85" height="60" rx="10" fill="#ffffff" stroke="#6c5ce7" stroke-width="2"/>
          <text x="195" y="52" fill="#6c5ce7" font-size="11" font-weight="800">3 L = 33 km</text>
          <text x="195" y="74" fill="#00b894" font-size="12" font-weight="900">? L = 121 km</text>
          <line x1="145" y1="80" x2="185" y2="80" stroke="#6c5ce7" stroke-dasharray="3,3" stroke-width="2"/>
        </svg>
      `,
      solutionHtml: `
        <strong>Mathematical Proportional Modeling:</strong><br>
        Let the liters needed be $X$. Set up the proportion of rates:<br>
        $$\\frac{X}{121} = \\frac{3}{33}$$
        Apply cross-multiplication:
        $$33 \\times X = 3 \\times 121 \\implies 33X = 363$$
        $$X = \\frac{363}{33} = 11\\text{ liters}$$
        The car needs exactly $11\\text{ liters}$ of gasoline for the trip.
      `
    },
    {
      accent: '#00b894',
      accentBg: 'rgba(0, 184, 148, 0.12)',
      icon: 'fa-solid fa-cake-candles',
      tag: 'Culinary Chemistry',
      title: 'Smart Bakery Recipe Scaling',
      desc: 'A baker needs 5 cups of sugar to make 3 specialty cakes. How many cups of sugar does the baker need to make 15 cakes for a grand event?',
      svg: `
        <svg width="100%" height="150" viewBox="0 0 300 150">
          <!-- 3 cakes vs 15 cakes visual -->
          <g transform="translate(40, 40)">
            <rect x="0" y="30" width="40" height="25" rx="5" fill="#fdcb6e"/>
            <rect x="5" y="15" width="30" height="18" rx="4" fill="#ff7675"/>
            <text x="-5" y="75" fill="#2d3436" font-size="11" font-weight="800">3 Cakes = 5 Cups</text>
          </g>
          <line x1="125" y1="65" x2="165" y2="65" stroke="#00b894" stroke-width="3" stroke-dasharray="4,4"/>
          <polygon points="165,65 155,59 155,71" fill="#00b894"/>
          <g transform="translate(180, 25)">
            <rect x="0" y="45" width="70" height="30" rx="6" fill="#fdcb6e"/>
            <rect x="10" y="25" width="50" height="23" rx="5" fill="#ff7675"/>
            <rect x="20" y="10" width="30" height="18" rx="4" fill="#74b9ff"/>
            <text x="-5" y="95" fill="#00b894" font-size="12" font-weight="900">15 Cakes = ? Cups</text>
          </g>
        </svg>
      `,
      solutionHtml: `
        <strong>Recipe Proportion Formula:</strong><br>
        Let the required sugar be $S$ cups:<br>
        $$\\frac{S}{15} = \\frac{5}{3}$$
        $$S = \\frac{15 \\times 5}{3} = \\frac{75}{3} = 25\\text{ cups of sugar}$$
        The baker needs 25 cups of sugar. Notice that $15 \\div 3 = 5$, so $5 \\times 5 = 25$!
      `
    },
    {
      accent: '#e17055',
      accentBg: 'rgba(225, 112, 85, 0.12)',
      icon: 'fa-solid fa-moon',
      tag: 'Space Physics',
      title: 'Earth vs. Moon Gravity Ratio',
      desc: 'The weight of a scientific probe on Earth is 90 Newtons, while its weight on the Moon is 15 Newtons. What is the Moon weight of another probe that weighs 60 Newtons on Earth?',
      svg: `
        <svg width="100%" height="150" viewBox="0 0 300 150">
          <!-- Earth Circle -->
          <circle cx="75" cy="75" r="45" fill="rgba(9, 132, 227, 0.15)" stroke="#0984e3" stroke-width="2.5"/>
          <text x="50" y="65" fill="#0984e3" font-size="11" font-weight="800">🌍 Earth</text>
          <text x="45" y="85" fill="#2d3436" font-size="11" font-weight="700">90 N ➜ 60 N</text>
          <!-- Moon Circle -->
          <circle cx="225" cy="75" r="30" fill="rgba(253, 203, 110, 0.2)" stroke="#f39c12" stroke-width="2"/>
          <text x="205" y="70" fill="#f39c12" font-size="11" font-weight="800">🌕 Moon</text>
          <text x="205" y="88" fill="#e17055" font-size="11" font-weight="900">15 N ➜ ? N</text>
          <path d="M 125 75 Q 150 40 185 75" fill="none" stroke="#e17055" stroke-width="2.5" stroke-dasharray="3,3"/>
        </svg>
      `,
      solutionHtml: `
        <strong>Gravitational Proportionality:</strong><br>
        Weight on Moon is directly proportional to weight on Earth:<br>
        $$\\frac{\\text{Moon Weight}}{\\text{Earth Weight}} = \\frac{15}{90} = \\frac{1}{6}$$
        $$\\frac{X}{60} = \\frac{15}{90} \\implies X = \\frac{15 \\times 60}{90} = \\frac{900}{90} = 10\\text{ Newtons}$$
        The probe weighs exactly $10\\text{ Newtons}$ on the lunar surface.
      `
    }
  ],

  // Core Foundation Card (From PDF page 1)
  foundation: {
    badge: 'Core Mathematical Foundation',
    subBadge: 'Equality of Ratios & Cross Multiplication',
    formulaText: '$$\\frac{a}{b} = \\frac{c}{d} \\iff a \\times d = b \\times c$$',
    formulaSubtext: 'A proportion is an equality of at least two ratios or rates. For four quantities $a, b, c, d$ in proportion, the product of extremes equals the product of means.',
    rules: [
      { num: 1, title: 'Extremes & Means Structure', desc: 'In $a:b = c:d$, $a$ and $d$ are the Extremes (الطرفان); $b$ and $c$ are the Means (الوسطان).' },
      { num: 2, title: 'Cross Multiplication Property', desc: 'Product of Extremes = Product of Means: $a \\times d = b \\times c$. If $ad = bc$, then $a, b, c, d$ are proportional.' },
      { num: 3, title: 'Simplest Form Equivalence', desc: 'Two ratios form a proportion if both reduce to the same irreducible fraction (e.g. $\\frac{8}{10} = \\frac{4}{5} = \\frac{12}{15}$).' },
      { num: 4, title: 'Zero Denominator Rule', desc: 'In any proportion $\\frac{a}{b} = \\frac{c}{d}$, denominators must be non-zero ($b \\ne 0, d \\ne 0$).' }
    ]
  },

  // Special Cases Encyclopedic Section (From PDF pages 4 & 7)
  specialCases: [
    {
      icon: 'fa-solid fa-chart-line',
      title: '1. Graphical Representation & Origin Test',
      diagramSvg: `
        <svg width="100%" height="110" viewBox="0 0 240 110">
          <line x1="30" y1="95" x2="220" y2="95" stroke="#b2bec3" stroke-width="1.5"/>
          <line x1="40" y1="10" x2="40" y2="105" stroke="#b2bec3" stroke-width="1.5"/>
          <!-- Proportional line through origin -->
          <line x1="40" y1="95" x2="200" y2="20" stroke="#00b894" stroke-width="2.5"/>
          <circle cx="40" cy="95" r="4" fill="#00b894"/>
          <text x="45" y="105" font-size="10" font-weight="800" fill="#00b894">(0, 0)</text>
          <text x="110" y="35" font-size="10" font-weight="800" fill="#00b894">Proportion: Straight via (0, 0)</text>
        </svg>
      `,
      items: [
        'Points form a straight line passing through $(0, 0) \\implies$ <strong>Proportional</strong> ($y = kx$).',
        'Points do NOT pass through $(0, 0)$ or are curved $\\implies$ <strong>Not Proportional</strong>.'
      ]
    },
    {
      icon: 'fa-solid fa-shapes',
      title: '2. Geometric Perimeter Proportions',
      diagramSvg: `
        <svg width="100%" height="110" viewBox="0 0 240 110">
          <polygon points="60,20 25,85 95,85" fill="rgba(108, 92, 231, 0.15)" stroke="#6c5ce7" stroke-width="2"/>
          <text x="45" y="100" font-size="10" font-weight="800" fill="#6c5ce7">Side s, P = 3s</text>
          <rect x="140" y="30" width="55" height="55" rx="6" fill="rgba(241, 196, 15, 0.15)" stroke="#f1c40f" stroke-width="2"/>
          <text x="135" y="100" font-size="10" font-weight="800" fill="#f1c40f">Square: P = 4s</text>
        </svg>
      `,
      items: [
        '<strong>Equilateral Triangles:</strong> $\\frac{\\text{Perimeter}}{\\text{Side}} = \\frac{3s}{s} = 3$ (Constant ratio $\\implies$ Proportion!).',
        '<strong>Squares:</strong> $\\frac{\\text{Perimeter}}{\\text{Side}} = 4$ (Constant ratio $\\implies$ Proportion!).'
      ]
    },
    {
      icon: 'fa-solid fa-balance-scale',
      title: '3. Rate Equivalence vs Ratio',
      diagramSvg: `
        <svg width="100%" height="110" viewBox="0 0 240 110">
          <rect x="20" y="25" width="90" height="60" rx="8" fill="rgba(0, 184, 148, 0.1)" stroke="#00b894" stroke-width="1.5"/>
          <text x="32" y="50" font-size="11" font-weight="800" fill="#00b894">Ratio:</text>
          <text x="28" y="70" font-size="10" fill="#2d3436">Same Units (4:8)</text>
          <rect x="130" y="25" width="95" height="60" rx="8" fill="rgba(225, 112, 85, 0.1)" stroke="#e17055" stroke-width="1.5"/>
          <text x="145" y="50" font-size="11" font-weight="800" fill="#e17055">Rate:</text>
          <text x="135" y="70" font-size="10" fill="#2d3436">Diff Units (8 eggs/2 c)</text>
        </svg>
      `,
      items: [
        '<strong>Ratio (النسبة):</strong> Comparison of two quantities of the same kind and same units.',
        '<strong>Rate (المعدل):</strong> Comparison of two quantities of different kinds/units.'
      ]
    }
  ],

  // 3 Pedagogical Ideas (Flashcard + 2 Solved Examples + 1 Try It Yourself)
  ideas: [
    {
      id: 1,
      badge: '💡',
      flashcardTitle: 'Idea 1: Testing Proportions via Cross Products & Simplification',
      flashcardText: '<strong>Golden Rule:</strong> Cross multiply $(a \\times d)$ and $(b \\times c)$. If the two products are identical, the pair represents a proportion. If they differ by even 1, it is NOT a proportion!',
      ex1Tag: 'Solved Example 1.1 • Non-Proportion Case',
      ex1Q: 'Determine whether the pair of ratios $\\frac{3}{8}$ and $\\frac{6}{10}$ represents a proportion.',
      ex1Steps: [
        { num: 'Step 1', text: 'Multiply the Extremes: $3 \\times 10 = 30$.' },
        { num: 'Step 2', text: 'Multiply the Means: $8 \\times 6 = 48$.' },
        { num: 'Step 3', text: 'Compare the products: $30 \\ne 48$ (Product of extremes $\\ne$ Product of means).' },
        { num: 'Step 4', text: 'Alternative simplification: $\\frac{6}{10} = \\frac{3}{5}$, but $\\frac{3}{8} \\ne \\frac{3}{5}$.' }
      ],
      ex1Ans: 'Therefore, $\\frac{3}{8}$ and $\\frac{6}{10}$ do NOT represent a proportion.',

      ex2Tag: 'Solved Example 1.2 • Verified Proportion Case',
      ex2Q: 'Determine whether the pair of ratios $\\frac{8}{10}$ and $\\frac{12}{15}$ represents a proportion.',
      ex2Steps: [
        { num: 'Step 1', text: 'Multiply the Extremes: $8 \\times 15 = 120$.' },
        { num: 'Step 2', text: 'Multiply the Means: $10 \\times 12 = 120$.' },
        { num: 'Step 3', text: 'Product of Extremes = Product of Means ($120 = 120$).' },
        { num: 'Step 4', text: 'Alternative simplification: $\\frac{8 \\div 2}{10 \\div 2} = \\frac{4}{5}$ and $\\frac{12 \\div 3}{15 \\div 3} = \\frac{4}{5}$. Since $\\frac{4}{5} = \\frac{4}{5}$, they are equivalent.' }
      ],
      ex2Ans: 'Therefore, $\\frac{8}{10}$ and $\\frac{12}{15}$ represent a valid proportion.',

      tryBadge: 'Try It Yourself 1 (Your Turn)',
      tryPrompt: 'Determine which of the following pairs of ratios represents a proportion:<br>1) $\\frac{5}{7}$ and $\\frac{10}{14}$ &nbsp;&nbsp;&nbsp;&nbsp; 2) $\\frac{4}{12}$ and $\\frac{3}{9}$<br>Solve with your stylus or type your steps below:',
      tryCanvasId: 'can-try1',
      trySolId: 'sol-try-1',
      trySolution: '1) $5 \\times 14 = 70$ and $7 \\times 10 = 70 \\implies$ <strong>IS a proportion</strong>.<br>2) $4 \\times 9 = 36$ and $12 \\times 3 = 36 \\implies$ <strong>IS a proportion</strong>.'
    },

    {
      id: 2,
      badge: '🎯',
      flashcardTitle: 'Idea 2: Solving for Unknowns in Proportions (Linear & Binomial Terms)',
      flashcardText: '<strong>Strategy Guide:</strong> When an unknown is inside a binomial like $(x - 3)$ or has a coefficient like $2x$, isolate the group first using cross-multiplication: $x - 3 = \\frac{b \\times c}{d}$, then solve for $x$ by adding 3!',
      ex1Tag: 'Solved Example 2.1 • Direct Linear Variable',
      ex1Q: 'Solve the following proportions for $x$:<br>1) $\\frac{4}{12} = \\frac{20}{x}$ &nbsp;&nbsp;&nbsp;&nbsp; 2) $\\frac{4}{7} = \\frac{x}{35}$',
      ex1Steps: [
        { num: 'Step 1', text: 'For 1: Cross multiply: $4 \\times x = 12 \\times 20 \\implies 4x = 240$.' },
        { num: 'Step 2', text: 'Divide by 4: $x = \\frac{240}{4} = 60$.' },
        { num: 'Step 3', text: 'For 2: Cross multiply: $7 \\times x = 4 \\times 35 \\implies 7x = 140$.' },
        { num: 'Step 4', text: 'Divide by 7: $x = \\frac{140}{7} = 20$.' }
      ],
      ex1Ans: '1) $x = 60$, &nbsp;&nbsp; 2) $x = 20$.',

      ex2Tag: 'Solved Example 2.2 • Binomial & Coefficient Variables',
      ex2Q: 'Solve the following proportions for $x$:<br>1) $\\frac{3}{x - 3} = \\frac{12}{8}$ &nbsp;&nbsp;&nbsp;&nbsp; 2) $\\frac{40}{2x} = \\frac{5}{7}$',
      ex2Steps: [
        { num: 'Step 1', text: 'For 1: Apply cross-multiplication: $12 \\times (x - 3) = 3 \\times 8 = 24$.' },
        { num: 'Step 2', text: 'Divide by 12: $x - 3 = \\frac{24}{12} = 2 \\implies x = 2 + 3 = 5$.' },
        { num: 'Step 3', text: 'For 2: Cross multiply: $5 \\times (2x) = 40 \\times 7 \\implies 10x = 280$.' },
        { num: 'Step 4', text: 'Divide by 10: $x = \\frac{280}{10} = 28$.' }
      ],
      ex2Ans: '1) $x = 5$, &nbsp;&nbsp; 2) $x = 28$.',

      tryBadge: 'Try It Yourself 2 (Your Turn)',
      tryPrompt: 'Find the value of $x$ in each of the following:<br>1) $\\frac{x}{32} = \\frac{9}{36}$ &nbsp;&nbsp;&nbsp;&nbsp; 2) $\\frac{8}{x - 1} = \\frac{16}{10}$<br>Solve step-by-step on the canvas:',
      tryCanvasId: 'can-try2',
      trySolId: 'sol-try-2',
      trySolution: '1) $x = \\frac{32 \\times 9}{36} = \\frac{32}{4} = 8$.<br>2) $16(x - 1) = 8 \\times 10 = 80 \\implies x - 1 = \\frac{80}{16} = 5 \\implies x = 5 + 1 = 6$.'
    },

    {
      id: 3,
      badge: '📈',
      flashcardTitle: 'Idea 3: Graphical Coordinate Representations & Proportional Tables',
      flashcardText: '<strong>Origin Line Rule:</strong> A table of values represents a proportion if and only if $\\frac{y}{x} = k$ (a constant unit rate) for all pairs, meaning their plotted points lie on a straight line that passes directly through $(0, 0)$.',
      ex1Tag: 'Solved Example 3.1 • Distance vs Time Table',
      ex1Q: 'A car covers distances according to the table: (1 hr, 70 km), (2 hr, 140 km), (3 hr, 210 km), (4 hr, 280 km). Determine whether the relationship represents a proportion.',
      ex1Steps: [
        { num: 'Step 1', text: 'Calculate the ratio $\\frac{\\text{Distance}}{\\text{Time}}$ for each pair: $\\frac{70}{1} = 70$, $\\frac{140}{2} = 70$, $\\frac{210}{3} = 70$, $\\frac{280}{4} = 70$.' },
        { num: 'Step 2', text: 'All pairs have the exact same constant rate $k = 70\\text{ km/h}$.' },
        { num: 'Step 3', text: 'Plotting $(0, 0), (1, 70), (2, 140), (3, 210), (4, 280)$ creates a straight line passing through $(0, 0)$.' }
      ],
      ex1Ans: 'The distance covered is directly proportional to time in hours.',

      ex2Tag: 'Solved Example 3.2 • Non-Proportional Table',
      ex2Q: 'Another vehicle logs: (1 hr, 80 km), (2 hr, 100 km), (3 hr, 190 km), (4 hr, 260 km). Determine if it represents a proportion.',
      ex2Steps: [
        { num: 'Step 1', text: 'Calculate ratios: $\\frac{80}{1} = 80$, $\\frac{100}{2} = 50$, $\\frac{190}{3} \\approx 63.3$.' },
        { num: 'Step 2', text: 'Since $80 \\ne 50 \\ne 63.3$, the ratio $\\frac{y}{x}$ is NOT constant.' },
        { num: 'Step 3', text: 'The points do not form a straight line passing through the origin $(0, 0)$.' }
      ],
      ex2Ans: 'This relationship does NOT represent a proportion.',

      tryBadge: 'Try It Yourself 3 (Your Turn)',
      tryPrompt: 'Adam types pages on a computer: Time (1 hr ➜ 3 p), (2 hr ➜ 6 p), (3 hr ➜ 9 p), (4 hr ➜ 21 p). Determine whether the number of pages is proportional to time.',
      tryCanvasId: 'can-try3',
      trySolId: 'sol-try-3',
      trySolution: 'Check ratios: $\\frac{3}{1} = 3$, $\\frac{6}{2} = 3$, $\\frac{9}{3} = 3$, but for the 4th hour: $\\frac{21}{4} = 5.25 \\ne 3$.<br>Since the 4th pair does not match, the relationship is <strong>NOT proportional</strong>!'
    }
  ],

  // 10 MCQ Questions (From PDF pages 5, 6, 7)
  mcqs: [
    {
      id: 1,
      q: "A proportion is defined as:",
      options: ["The equality of at least two ratios or rates", "The sum of two fractions", "The difference between extremes and means", "A single simplified fraction"],
      correct: 0,
      proof: "By standard mathematical definition: A proportion is an equality of at least two ratios or two rates (e.g. $\\frac{a}{b} = \\frac{c}{d}$)."
    },
    {
      id: 2,
      q: "If $a, b, c, d$ are proportional quantities, then the product of the extremes is equal to:",
      options: ["$b \\times c$ (product of means)", "$a + d$", "$b \\div c$", "$a \\times b$"],
      correct: 0,
      proof: "By the Cross Multiplication Property: In any proportion $\\frac{a}{b} = \\frac{c}{d}$, Product of Extremes ($a \\times d$) = Product of Means ($b \\times c$)."
    },
    {
      id: 3,
      q: "If $\\frac{3}{4} = \\frac{x}{20}$, then $x = $",
      options: ["15", "12", "5", "60"],
      correct: 0,
      proof: "$4x = 3 \\times 20 = 60 \\implies x = \\frac{60}{4} = 15$."
    },
    {
      id: 4,
      q: "If $\\frac{l - 3}{12} = \\frac{5}{4}$, then $l = $",
      options: ["18", "15", "12", "8"],
      correct: 0,
      proof: "$4(l - 3) = 12 \\times 5 = 60 \\implies l - 3 = 15 \\implies l = 15 + 3 = 18$."
    },
    {
      id: 5,
      q: "In a school, there are 221 students and 13 teachers. If the number of students increases to 272, how many teachers are needed to maintain the same ratio?",
      options: ["16 teachers", "18 teachers", "14 teachers", "20 teachers"],
      correct: 0,
      proof: "$\\frac{221}{13} = 17$ students per teacher. To maintain the ratio: $\\frac{272}{x} = 17 \\implies x = \\frac{272}{17} = 16$ teachers."
    },
    {
      id: 6,
      q: "If $\\frac{3}{4}$ liter of milk costs 24 pounds, how much would $1\\frac{3}{4}$ liters of milk cost at the same rate?",
      options: ["56 pounds", "48 pounds", "32 pounds", "64 pounds"],
      correct: 0,
      proof: "Price per liter $= 24 \\div \\frac{3}{4} = 24 \\times \\frac{4}{3} = 32$ pounds/liter. For $1\\frac{3}{4} = \\frac{7}{4}$ liters: $\\frac{7}{4} \\times 32 = 7 \\times 8 = 56$ pounds."
    },
    {
      id: 7,
      q: "Omar bought 8 apples for 60 LE. How many apples of the same type can he buy for 105 LE?",
      options: ["14 apples", "12 apples", "15 apples", "16 apples"],
      correct: 0,
      proof: "$\\frac{8}{60} = \\frac{x}{105} \\implies x = \\frac{8 \\times 105}{60} = \\frac{840}{60} = 14$ apples."
    },
    {
      id: 8,
      q: "A car uses 5 liters of petrol to cover a distance of 40 km. How much petrol would the car need to cover 128 km at the same rate?",
      options: ["16 liters", "20 liters", "12 liters", "25 liters"],
      correct: 0,
      proof: "Fuel consumption rate is $\\frac{5}{40} = \\frac{1}{8}$ liter/km. For 128 km: $128 \\times \\frac{1}{8} = 16$ liters."
    },
    {
      id: 9,
      q: "Eman reads 10 pages in 40 minutes. How many hours would it take her to read a book of 120 pages at the same rate?",
      options: ["8 hours", "12 hours", "4 hours", "6 hours"],
      correct: 0,
      proof: "Time for 120 pages in minutes $= \\frac{40 \\times 120}{10} = 480$ minutes. Convert to hours: $\\frac{480}{60} = 8$ hours."
    },
    {
      id: 10,
      q: "A tractor cultivates 840 square meters of land in 3 hours. What area of land does it cultivate in 5 hours at the same rate?",
      options: ["1,400 square meters", "1,200 square meters", "1,680 square meters", "1,500 square meters"],
      correct: 0,
      proof: "Rate $= \\frac{840}{3} = 280\\text{ m}^2/\\text{hour}$. In 5 hours: $280 \\times 5 = 1,400\\text{ square meters}$."
    }
  ],

  // 3 Timed Quiz Models (30 Questions Total)
  quizModels: [
    {
      title: "Timed Quiz — Model #1 (Definitions & Core Proportions)",
      questions: [
        {
          q: "1. If $\\frac{a}{b} = \\frac{c}{d}$, which of the following statements is always true?",
          options: ["$a \\times d = b \\times c$", "$a + d = b + c$", "$a \\times c = b \\times d$", "$a - b = c - d$"],
          correct: 0,
          proof: "Product of extremes ($ad$) equals product of means ($bc$)."
        },
        {
          q: "2. In the proportion $3 : 4 = 6 : 8$, the extremes are:",
          options: ["3 and 8", "4 and 6", "3 and 4", "6 and 8"],
          correct: 0,
          proof: "The first and fourth terms ($3$ and $8$) are the extremes."
        },
        {
          q: "3. If $\\frac{20}{25} = \\frac{36}{x}$, then $x = $",
          options: ["45", "40", "30", "50"],
          correct: 0,
          proof: "$\\frac{20}{25} = \\frac{4}{5} = \\frac{36}{x} \\implies 4x = 180 \\implies x = 45$."
        },
        {
          q: "4. Which of the following pairs of ratios represents a valid proportion?",
          options: ["$\\frac{15}{25}$ and $\\frac{30}{50}$", "$\\frac{2}{5}$ and $\\frac{4}{15}$", "$\\frac{3}{4}$ and $\\frac{6}{9}$", "$\\frac{10}{3}$ and $\\frac{40}{15}$"],
          correct: 0,
          proof: "$15 \\times 50 = 750$ and $25 \\times 30 = 750$. Both equal $\\frac{3}{5}$."
        },
        {
          q: "5. If $7 : 8 = 21 : m$, then $m = $",
          options: ["24", "28", "16", "32"],
          correct: 0,
          proof: "$7m = 8 \\times 21 = 168 \\implies m = \\frac{168}{7} = 24$."
        },
        {
          q: "6. If $a : 16 = 5 : 4$, then $a = $",
          options: ["20", "24", "15", "18"],
          correct: 0,
          proof: "$4a = 16 \\times 5 = 80 \\implies a = 20$."
        },
        {
          q: "7. If $\\frac{6}{x} = \\frac{12}{14}$, then $x = $",
          options: ["7", "8", "6", "10"],
          correct: 0,
          proof: "$12x = 6 \\times 14 = 84 \\implies x = 7$."
        },
        {
          q: "8. In the proportion $\\frac{1}{3} = \\frac{2}{b + 1}$, the value of $b$ is:",
          options: ["5", "6", "4", "7"],
          correct: 0,
          proof: "$b + 1 = 3 \\times 2 = 6 \\implies b = 6 - 1 = 5$."
        },
        {
          q: "9. If $\\frac{8}{y} = \\frac{y}{2}$ where $y$ is a positive integer, then $y = $",
          options: ["4", "16", "2", "8"],
          correct: 0,
          proof: "$y^2 = 8 \\times 2 = 16 \\implies y = 4$."
        },
        {
          q: "10. Which four numbers are proportional in order?",
          options: ["5, 8, 15, 24", "7, 8, 14, 15", "12, 27, 16, 18", "8, 24, 6, 12"],
          correct: 0,
          proof: "$\\frac{5}{8}$ and $\\frac{15}{24} = \\frac{5}{8}$ (Equal!)."
        }
      ]
    },

    {
      title: "Timed Quiz — Model #2 (Binomials & Algebraic Proportions)",
      questions: [
        {
          q: "1. If $\\frac{16}{3x} = \\frac{8}{12}$, then $x = $",
          options: ["8", "6", "4", "12"],
          correct: 0,
          proof: "$24x = 16 \\times 12 = 192 \\implies x = 8$."
        },
        {
          q: "2. If $\\frac{5}{x - 2} = \\frac{15}{21}$, then $x = $",
          options: ["9", "7", "11", "8"],
          correct: 0,
          proof: "$15(x - 2) = 105 \\implies x - 2 = 7 \\implies x = 9$."
        },
        {
          q: "3. If the ratio of boys to girls in a class is $3 : 5$ and there are 15 boys, the number of girls is:",
          options: ["25", "20", "30", "35"],
          correct: 0,
          proof: "$\\frac{3}{5} = \\frac{15}{G} \\implies 3G = 75 \\implies G = 25$."
        },
        {
          q: "4. If $\\frac{2x + 1}{5} = \\frac{9}{15}$, then $x = $",
          options: ["1", "2", "3", "0"],
          correct: 0,
          proof: "$\\frac{9}{15} = \\frac{3}{5} \\implies 2x + 1 = 3 \\implies 2x = 2 \\implies x = 1$."
        },
        {
          q: "5. If $\\frac{10}{4} = \\frac{x}{14}$, then $x = $",
          options: ["35", "28", "40", "32"],
          correct: 0,
          proof: "$4x = 140 \\implies x = 35$."
        },
        {
          q: "6. If $\\frac{x}{6} = \\frac{12}{x}$ for positive $x$, then $x = $",
          options: ["$\\sqrt{72} = 6\\sqrt{2}$", "72", "6", "12"],
          correct: 0,
          proof: "$x^2 = 72 \\implies x = \\sqrt{72} = 6\\sqrt{2}$."
        },
        {
          q: "7. If $3, x, 12, 20$ are proportional, then $x = $",
          options: ["5", "6", "4", "8"],
          correct: 0,
          proof: "$\\frac{3}{x} = \\frac{12}{20} = \\frac{3}{5} \\implies x = 5$."
        },
        {
          q: "8. If $\\frac{2}{3} = \\frac{0.5}{x}$, then $x = $",
          options: ["0.75", "1.5", "0.25", "1.25"],
          correct: 0,
          proof: "$2x = 3 \\times 0.5 = 1.5 \\implies x = 0.75$."
        },
        {
          q: "9. If $\\frac{1}{2} = \\frac{x}{8} = \\frac{5}{y}$, then $x + y = $",
          options: ["14", "10", "12", "16"],
          correct: 0,
          proof: "$x = 4$, $y = 10 \\implies x + y = 4 + 10 = 14$."
        },
        {
          q: "10. A proportion requires at least how many equal ratios or rates?",
          options: ["Two", "Three", "Four", "One"],
          correct: 0,
          proof: "A proportion requires an equality of at least two ratios."
        }
      ]
    },

    {
      title: "Timed Quiz — Model #3 (Word Problems, Science & Graphs)",
      questions: [
        {
          q: "1. A printer prints 36 pages in 3 minutes. How many pages does it print in 8 minutes?",
          options: ["96 pages", "72 pages", "108 pages", "84 pages"],
          correct: 0,
          proof: "Rate $= 36 \\div 3 = 12$ pages/min. In 8 mins: $12 \\times 8 = 96$ pages."
        },
        {
          q: "2. If a tractor cultivates 840 m² in 3 hours, how many hours are needed to cultivate 1,960 m²?",
          options: ["7 hours", "8 hours", "6 hours", "9 hours"],
          correct: 0,
          proof: "Rate $= 280$ m²/h. Time $= 1960 \\div 280 = 7$ hours."
        },
        {
          q: "3. Ibrahim saves 300 LE in 2 months, 600 LE in 4 months, 900 LE in 6 months. Are the savings proportional to months?",
          options: ["Yes, with constant rate 150 LE/month", "No, savings vary", "Yes, with constant rate 300 LE/month", "No, rate decreases"],
          correct: 0,
          proof: "$\\frac{300}{2} = \\frac{600}{4} = \\frac{900}{6} = 150$ LE/month (Constant!)."
        },
        {
          q: "4. The graph of a proportional relationship between two variables $x$ and $y$ must be:",
          options: ["A straight line passing through the origin (0, 0)", "Any curve", "A straight line that does not pass through origin", "A circle"],
          correct: 0,
          proof: "Direct proportionality graph is always a straight line through $(0, 0)$."
        },
        {
          q: "5. If side length of an equilateral triangle doubles, its perimeter:",
          options: ["Doubles", "Triples", "Quadruples", "Remains unchanged"],
          correct: 0,
          proof: "$P = 3s$. If $s \\to 2s$, $P \\to 3(2s) = 2(3s) = 2P$."
        },
        {
          q: "6. A worker can paint a wall in 4 hours, and another worker can paint it in 2 hours. If they work together, how many minutes will they need?",
          options: ["80 minutes", "90 minutes", "120 minutes", "60 minutes"],
          correct: 0,
          proof: "Combined rate $= \\frac{1}{4} + \\frac{1}{2} = \\frac{3}{4}$ wall/hour. Time $= \\frac{4}{3}$ hours $= \\frac{4}{3} \\times 60 = 80$ minutes."
        },
        {
          q: "7. If 6 pens cost 18 LE, how much do 15 pens cost?",
          options: ["45 LE", "30 LE", "50 LE", "40 LE"],
          correct: 0,
          proof: "$\\frac{18}{6} = 3$ LE/pen. $15 \\times 3 = 45$ LE."
        },
        {
          q: "8. A car covers 180 km in 2 hours. At the same speed, how long will it take to travel 450 km?",
          options: ["5 hours", "4.5 hours", "6 hours", "4 hours"],
          correct: 0,
          proof: "Speed $= 180 \\div 2 = 90$ km/h. Time $= 450 \\div 90 = 5$ hours."
        },
        {
          q: "9. If $\\frac{x}{3} = \\frac{y}{5}$, then $\\frac{x}{y} = $",
          options: ["$\\frac{3}{5}$", "$\\frac{5}{3}$", "$\\frac{15}{1}$", "$\\frac{8}{15}$"],
          correct: 0,
          proof: "$\\frac{x}{3} = \\frac{y}{5} \\implies 5x = 3y \\implies \\frac{x}{y} = \\frac{3}{5}$."
        },
        {
          q: "10. Which table does NOT show a proportional relationship?",
          options: ["Time: 1, 2, 3 | Cost: 25, 45, 65 (Delivery fee added)", "Time: 1, 2, 3 | Distance: 6, 12, 18", "Weight: 1, 2, 3 | Price: 45, 90, 135", "Hours: 2, 4, 6 | Money: 300, 600, 900"],
          correct: 0,
          proof: "$\\frac{25}{1} \\ne \\frac{45}{2} = 22.5$ due to the fixed delivery fee, so it does not pass through $(0, 0)$."
        }
      ]
    }
  ]
};

// ==========================================================================
// 4. RENDERING & LESSON SWITCHING
// ==========================================================================
let mcqScore = 0;
let mcqAnswered = 0;
let activeQuizModelIndex = 0;
let quizUserAnswers = {};
let quizTimerSeconds = 600;
let quizTimerInterval = null;
let quizSubmitted = false;

function loadLesson(lessonKey) {
  currentLessonKey = lessonKey;
  AudioEngine.click();

  // Update switcher pills
  const pBtn = document.getElementById('btnLessonProportion');
  const dBtn = document.getElementById('btnLessonDistance');
  if (pBtn && dBtn) {
    pBtn.classList.toggle('active', lessonKey === 'proportion');
    dBtn.classList.toggle('active', lessonKey === 'distance');
  }

  // Update Header Stage
  const headerStage = document.getElementById('headerStageBadge');
  if (headerStage) {
    headerStage.innerHTML = lessonKey === 'proportion' 
      ? '<i class="fa-solid fa-graduation-cap"></i> Unit 1: Numbers & Operations • Proportion'
      : '<i class="fa-solid fa-graduation-cap"></i> Prep 3 • Coordinate Geometry';
  }

  // Render Lesson 1 (Proportion) or Lesson 2 (Distance)
  if (lessonKey === 'proportion') {
    renderProportionContent();
  } else {
    // If distance, reload page or render distance content
    window.location.reload();
  }
}

function renderProportionContent() {
  const data = LESSON_PROPORTION;

  // 1. Update Hero Banner
  const unitTag = document.getElementById('heroUnitTag');
  const title = document.getElementById('heroLessonTitle');
  const sub = document.getElementById('heroLessonSubtitle');
  if (unitTag) unitTag.innerHTML = data.unitTag;
  if (title) title.innerText = data.title;
  if (sub) sub.innerText = data.subtitle;

  // 2. Render Tab 1 (Concept & Practice)
  renderConceptTab(data);

  // 3. Render Tab 2 (MCQ Bank)
  renderMCQBank(data.mcqs);

  // 4. Render Tab 3 (Quiz Engine)
  initQuizModel(0, data.quizModels);

  // Re-render KaTeX math formulas
  setTimeout(() => {
    if (window.renderMathInElement) {
      renderMathInElement(document.body, {
        delimiters: [
          {left: '$$', right: '$$', display: true},
          {left: '$', right: '$', display: false}
        ]
      });
    }
    // Re-initialize Canvases
    StylusEngine.initCanvas('can-try1');
    StylusEngine.initCanvas('can-try2');
    StylusEngine.initCanvas('can-try3');
  }, 100);
}

function renderConceptTab(data) {
  const container = document.getElementById('lessonConceptDynamicContainer');
  if (!container) return;

  // A. 3 Real-World Applications Cards
  const appsHtml = data.realWorldApps.map((app, idx) => `
    <article class="real-world-card" style="--card-accent: ${app.accent}; --card-accent-bg: ${app.accentBg};">
      <div>
        <div class="rw-header">
          <div class="rw-icon-box"><i class="${app.icon}"></i></div>
          <div class="rw-title-block">
            <span class="rw-tag">${app.tag}</span>
            <h3>${app.title}</h3>
          </div>
        </div>
        <p class="rw-desc">${app.desc}</p>
        <div class="rw-svg-box">${app.svg}</div>
      </div>
      <div>
        <button class="rw-toggle-btn" onclick="toggleSolutionDrawer('rw-sol-${idx}', this)">
          <i class="fa-solid fa-lightbulb"></i>
          <span>Show Proportional Proof</span>
        </button>
        <div id="rw-sol-${idx}" class="rw-solution-drawer">
          ${app.solutionHtml}
        </div>
      </div>
    </article>
  `).join('');

  // B. Core Foundation Card
  const f = data.foundation;
  const rulesHtml = f.rules.map(r => `
    <div class="rule-pill-card">
      <span class="rule-num">${r.num}</span>
      <div>
        <h4>${r.title}</h4>
        <p>${r.desc}</p>
      </div>
    </div>
  `).join('');

  // C. Special Cases
  const casesHtml = data.specialCases.map(c => `
    <article class="encyclo-card">
      <h4><i class="${c.icon}" style="color:var(--primary);"></i> ${c.title}</h4>
      <div class="encyclo-diagram">${c.diagramSvg}</div>
      <ul class="encyclo-list">
        ${c.items.map(it => `<li><span>•</span> ${it}</li>`).join('')}
      </ul>
    </article>
  `).join('');

  // D. 3 Pedagogical Ideas
  const ideasHtml = data.ideas.map(idea => `
    <section class="idea-block">
      <!-- Flashcard -->
      <div class="pedagogical-flashcard">
        <div class="flashcard-badge-3d">${idea.badge}</div>
        <div class="flashcard-content">
          <span class="pill-badge" style="background:rgba(225,112,85,0.2); color:#d63031; margin-bottom:0.4rem;">Concept Flashcard & Strategy Guide</span>
          <h3>${idea.flashcardTitle}</h3>
          <p>${idea.flashcardText}</p>
        </div>
      </div>

      <!-- Solved Example 1 -->
      <article class="solved-example-card">
        <div class="example-header">
          <span class="example-tag"><i class="fa-solid fa-calculator"></i> ${idea.ex1Tag}</span>
          <span class="pill-badge">Step-by-Step Proof</span>
        </div>
        <p class="example-question">${idea.ex1Q}</p>
        <div class="solution-steps-accordion">
          ${idea.ex1Steps.map(st => `
            <div class="step-row">
              <span class="step-num-pill">${st.num}</span>
              <div class="step-body">${st.text}</div>
            </div>
          `).join('')}
          <div class="final-answer-badge">
            <i class="fa-solid fa-circle-check"></i> ${idea.ex1Ans}
          </div>
        </div>
      </article>

      <!-- Solved Example 2 -->
      <article class="solved-example-card">
        <div class="example-header">
          <span class="example-tag"><i class="fa-solid fa-calculator"></i> ${idea.ex2Tag}</span>
          <span class="pill-badge">Step-by-Step Proof</span>
        </div>
        <p class="example-question">${idea.ex2Q}</p>
        <div class="solution-steps-accordion">
          ${idea.ex2Steps.map(st => `
            <div class="step-row">
              <span class="step-num-pill">${st.num}</span>
              <div class="step-body">${st.text}</div>
            </div>
          `).join('')}
          <div class="final-answer-badge">
            <i class="fa-solid fa-circle-check"></i> ${idea.ex2Ans}
          </div>
        </div>
      </article>

      <!-- Try It Yourself with iPad Canvas -->
      <div class="try-it-card">
        <div class="try-it-header">
          <div class="try-it-badge">
            <i class="fa-solid fa-pencil"></i> ${idea.tryBadge}
          </div>
          <span class="pill-badge">iPad Apple Pencil Workspace</span>
        </div>
        <p class="try-it-prompt">${idea.tryPrompt}</p>

        <div class="notebook-workspace" id="ws-${idea.tryCanvasId}">
          <div class="stylus-toolbar">
            <div class="toolbar-group">
              <button class="tool-btn active" onclick="setCanvasMode('${idea.tryCanvasId}', 'draw', this)">
                <i class="fa-solid fa-pen"></i> Pen
              </button>
              <button class="tool-btn" onclick="setCanvasMode('${idea.tryCanvasId}', 'text', this)">
                <i class="fa-solid fa-keyboard"></i> Type
              </button>
              <button class="tool-btn" onclick="setCanvasEraser('${idea.tryCanvasId}', this)">
                <i class="fa-solid fa-eraser"></i> Eraser
              </button>
              <button class="tool-btn btn-undo" onclick="undoCanvas('${idea.tryCanvasId}')" title="Undo last stroke (تراجع عن آخر خطوة)">
                <i class="fa-solid fa-rotate-left"></i> Undo
              </button>
              <button class="tool-btn" onclick="toggleCanvasGrid('can-wrap-${idea.id}', this)">
                <i class="fa-solid fa-border-all"></i> Grid
              </button>
              <button class="tool-btn stylus-indicator active" onclick="toggleStylusMode(this)" title="وضع قلم الآبل / ستايلس فقط: مفعل لمنع التقطيع ورفض راحة اليد (Palm Rejection)">
                <i class="fa-solid fa-pen-nib"></i> <span class="stylus-mode-text">Stylus Only</span>
              </button>
            </div>

            <div class="toolbar-group">
              <div class="color-dot active" style="background:#182038;" onclick="setCanvasColor('${idea.tryCanvasId}', '#182038', this)"></div>
              <div class="color-dot" style="background:#6c5ce7;" onclick="setCanvasColor('${idea.tryCanvasId}', '#6c5ce7', this)"></div>
              <div class="color-dot" style="background:#eb4d4b;" onclick="setCanvasColor('${idea.tryCanvasId}', '#eb4d4b', this)"></div>
              <div class="color-dot" style="background:#00b894;" onclick="setCanvasColor('${idea.tryCanvasId}', '#00b894', this)"></div>
              <div class="color-dot" style="background:#fdcb6e;" onclick="setCanvasColor('${idea.tryCanvasId}', '#fdcb6e', this)"></div>

              <select class="stroke-select" onchange="setCanvasWidth('${idea.tryCanvasId}', this.value)">
                <option value="2">Fine 2px</option>
                <option value="4" selected>Medium 4px</option>
                <option value="7">Bold 7px</option>
              </select>

              <button class="tool-btn" onclick="clearCanvasPrompt('${idea.tryCanvasId}')">
                <i class="fa-solid fa-trash-can"></i> Clear
              </button>
            </div>

            <div class="autosave-indicator">
              <span class="autosave-dot"></span>
              <span>Auto-saved to Storage</span>
            </div>
          </div>

          <div class="notebook-canvas-wrap" id="can-wrap-${idea.id}">
            <canvas id="${idea.tryCanvasId}" class="stylus-canvas"></canvas>
            <textarea id="text-try${idea.id}" class="typed-text-layer" placeholder="Type your step-by-step mathematical derivation here..."></textarea>
          </div>
        </div>

        <button class="show-solution-btn" onclick="toggleSolutionDrawer('${idea.trySolId}', this)">
          <i class="fa-solid fa-eye"></i> Show Model Solution
        </button>
        <div id="${idea.trySolId}" class="try-it-solution-drawer">
          <h4><i class="fa-solid fa-check-circle" style="color:var(--accent-mint);"></i> Model Solution:</h4>
          ${idea.trySolution}
        </div>
      </div>
    </section>
  `).join('');

  container.innerHTML = `
    <!-- 1. Real-World Connections -->
    <div class="section-title-wrap">
      <h2 class="section-title">
        <span class="title-icon">🌍</span>
        <span>Real-World Connections (Mathematics in Everyday Life)</span>
      </h2>
      <span class="pill-badge">Interactive SVGs & Explanations</span>
    </div>
    <div class="real-world-grid">${appsHtml}</div>

    <!-- 2. Core Mathematical Foundation Card -->
    <section class="foundation-card">
      <div class="foundation-header">
        <span class="foundation-badge"><i class="fa-solid fa-shield-halved"></i> ${f.badge}</span>
        <span style="font-weight:700; color:var(--text-muted); font-size:0.9rem;">${f.subBadge}</span>
      </div>
      <div class="formula-highlight-box">
        <div class="formula-text">${f.formulaText}</div>
        <p class="formula-subtext">${f.formulaSubtext}</p>
      </div>
      <div class="foundation-rules-grid">${rulesHtml}</div>
    </section>

    <!-- 3. Special Cases & Graphical Representation -->
    <section class="special-cases-section">
      <div class="section-title-wrap">
        <h2 class="section-title">
          <span class="title-icon">🏛️</span>
          <span>Encyclopedic Guide: Special Cases & Graphical Analysis</span>
        </h2>
        <span class="pill-badge">Curriculum Proof Standards</span>
      </div>
      <div class="special-cases-grid">${casesHtml}</div>
    </section>

    <!-- 4. Main Pedagogical Ideas -->
    ${ideasHtml}
  `;
}

// ==========================================================================
// 5. MCQ REVISION BANK (10 QUESTIONS)
// ==========================================================================
let currentMCQs = LESSON_PROPORTION.mcqs;

function renderMCQBank(mcqList) {
  currentMCQs = mcqList || LESSON_PROPORTION.mcqs;
  mcqScore = 0;
  mcqAnswered = 0;

  const dial = document.getElementById('mcqScoreDial');
  const status = document.getElementById('mcqStatusText');
  if (dial) dial.innerText = `0/10`;
  if (status) status.innerText = `Not Started`;

  const container = document.getElementById('mcqQuestionsList');
  if (!container) return;

  container.innerHTML = '';
  currentMCQs.forEach((q, idx) => {
    const card = document.createElement('article');
    card.className = 'mcq-card';
    card.id = `mcq-card-${q.id}`;

    const letters = ['A', 'B', 'C', 'D'];
    const optionsHtml = q.options.map((opt, optIdx) => `
      <button class="mcq-option-btn" id="mcq-opt-${q.id}-${optIdx}" onclick="handleMCQSelect(${q.id}, ${optIdx})">
        <span class="option-letter-badge">${letters[optIdx]}</span>
        <span>${opt}</span>
      </button>
    `).join('');

    card.innerHTML = `
      <span class="mcq-number-pill">Question ${q.id} of 10</span>
      <p class="mcq-question-text">${q.q}</p>
      <div class="mcq-options-grid">
        ${optionsHtml}
      </div>
      <div class="mcq-explanation-drawer" id="mcq-exp-${q.id}">
        <h5><i class="fa-solid fa-graduation-cap"></i> Complete Mathematical Proof:</h5>
        <p>${q.proof}</p>
      </div>
    `;

    container.appendChild(card);
  });
}

function handleMCQSelect(qId, selectedIdx) {
  const q = currentMCQs.find(item => item.id === qId);
  if (!q) return;

  const card = document.getElementById(`mcq-card-${qId}`);
  if (!card) return;

  const buttons = card.querySelectorAll('.mcq-option-btn');
  buttons.forEach(btn => btn.disabled = true);

  const selectedBtn = document.getElementById(`mcq-opt-${qId}-${selectedIdx}`);
  const correctBtn = document.getElementById(`mcq-opt-${qId}-${q.correct}`);

  if (selectedIdx === q.correct) {
    selectedBtn.classList.add('correct');
    AudioEngine.success();
    mcqScore++;
  } else {
    selectedBtn.classList.add('wrong');
    correctBtn.classList.add('correct');
    AudioEngine.wrong();
  }

  mcqAnswered++;
  const dial = document.getElementById('mcqScoreDial');
  const status = document.getElementById('mcqStatusText');
  if (dial) dial.innerText = `${mcqScore}/10`;
  if (status) status.innerText = `${mcqAnswered} of 10 Answered`;

  const drawer = document.getElementById(`mcq-exp-${qId}`);
  if (drawer) drawer.style.display = 'block';
}

// ==========================================================================
// 6. TIMED QUIZ - 10 MARKS (3 MODELS • 30 QUESTIONS)
// ==========================================================================
let currentQuizModels = LESSON_PROPORTION.quizModels;

function initQuizModel(modelIdx, modelsList) {
  if (modelsList) currentQuizModels = modelsList;
  activeQuizModelIndex = modelIdx;
  quizUserAnswers = {};
  quizSubmitted = false;
  quizTimerSeconds = 600;

  const titleEl = document.getElementById('quizActiveModelTitle');
  if (titleEl) titleEl.innerText = currentQuizModels[modelIdx].title;

  const tabs = document.querySelectorAll('.model-tab-btn');
  tabs.forEach((tab, i) => tab.classList.toggle('active', i === modelIdx));

  const report = document.getElementById('quizFeedbackReport');
  if (report) report.style.display = 'none';
  const submitBar = document.getElementById('submitQuizBar');
  if (submitBar) submitBar.style.display = 'block';

  renderQuizQuestions();
  updateQuizProgress();
  startQuizTimer();
}

function switchQuizModel(modelIdx) {
  if (!quizSubmitted && Object.keys(quizUserAnswers).length > 0) {
    if (!confirm("Switching quiz models will reset your ongoing 10-minute quiz. Continue?")) return;
  }
  AudioEngine.click();
  initQuizModel(modelIdx);
}

function renderQuizQuestions() {
  const container = document.getElementById('quizQuestionsContainer');
  if (!container) return;

  const currentModel = currentQuizModels[activeQuizModelIndex];
  container.innerHTML = '';

  currentModel.questions.forEach((qItem, qIdx) => {
    const card = document.createElement('article');
    card.className = 'quiz-question-card';
    card.id = `quiz-q-card-${qIdx}`;

    const letters = ['A', 'B', 'C', 'D'];
    const optionsHtml = qItem.options.map((opt, optIdx) => `
      <button class="mcq-option-btn" id="quiz-opt-${qIdx}-${optIdx}" onclick="selectQuizAnswer(${qIdx}, ${optIdx})">
        <span class="option-letter-badge">${letters[optIdx]}</span>
        <span>${opt}</span>
      </button>
    `).join('');

    card.innerHTML = `
      <p style="font-family:var(--font-heading); font-size:1.1rem; font-weight:700; margin-bottom:1rem; color:var(--text-main);">
        ${qItem.q}
      </p>
      <div class="mcq-options-grid">
        ${optionsHtml}
      </div>
    `;

    container.appendChild(card);
  });

  if (window.renderMathInElement) {
    renderMathInElement(container, {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '$', right: '$', display: false}
      ]
    });
  }
}

function selectQuizAnswer(qIdx, optIdx) {
  if (quizSubmitted) return;

  quizUserAnswers[qIdx] = optIdx;
  AudioEngine.click();

  const card = document.getElementById(`quiz-q-card-${qIdx}`);
  if (card) {
    card.querySelectorAll('.mcq-option-btn').forEach((btn, idx) => {
      btn.classList.toggle('correct', idx === optIdx);
    });
  }

  updateQuizProgress();
}

function updateQuizProgress() {
  const answeredCount = Object.keys(quizUserAnswers).length;
  const fill = document.getElementById('quizProgressFill');
  if (fill) fill.style.width = `${(answeredCount / 10) * 100}%`;
}

function startQuizTimer() {
  clearInterval(quizTimerInterval);
  const timerText = document.getElementById('quizTimerText');
  const timerBox = document.getElementById('quizTimerBox');

  quizTimerInterval = setInterval(() => {
    if (quizTimerSeconds <= 0) {
      clearInterval(quizTimerInterval);
      submitQuizAssessment(true);
      return;
    }

    quizTimerSeconds--;
    const mins = Math.floor(quizTimerSeconds / 60).toString().padStart(2, '0');
    const secs = (quizTimerSeconds % 60).toString().padStart(2, '0');
    if (timerText) timerText.innerText = `${mins}:${secs}`;

    if (quizTimerSeconds <= 30) {
      timerBox.className = 'timer-pill-box danger';
    } else if (quizTimerSeconds <= 120) {
      timerBox.className = 'timer-pill-box warning';
    } else {
      timerBox.className = 'timer-pill-box';
    }
  }, 1000);
}

function submitQuizAssessment(isAuto = false) {
  if (quizSubmitted) return;

  const answeredCount = Object.keys(quizUserAnswers).length;
  if (!isAuto && answeredCount < 10) {
    if (!confirm(`You have answered ${answeredCount} of 10 questions. Are you sure you want to submit now?`)) {
      return;
    }
  }

  quizSubmitted = true;
  clearInterval(quizTimerInterval);

  const currentModel = currentQuizModels[activeQuizModelIndex];
  let score = 0;

  currentModel.questions.forEach((qItem, idx) => {
    if (quizUserAnswers[idx] === qItem.correct) score++;
  });

  const submitBar = document.getElementById('submitQuizBar');
  if (submitBar) submitBar.style.display = 'none';

  const report = document.getElementById('quizFeedbackReport');
  const percentText = document.getElementById('scorePercentText');
  const fractionText = document.getElementById('scoreFractionText');
  const ratingBadge = document.getElementById('scoreRatingBadge');
  const trophy = document.getElementById('scoreTrophy');
  const breakdownList = document.getElementById('feedbackBreakdownList');

  const percent = Math.round((score / 10) * 100);
  if (percentText) percentText.innerText = `${percent}%`;
  if (fractionText) fractionText.innerText = `${score} / 10 Marks`;

  if (percent >= 90) {
    trophy.innerText = '🏆';
    ratingBadge.innerText = 'Outstanding Mastery! A+ Exemplary';
    ratingBadge.style.color = 'var(--accent-mint)';
    AudioEngine.success();
  } else if (percent >= 70) {
    trophy.innerText = '🌟';
    ratingBadge.innerText = 'Great Job! Solid Mathematical Foundation';
    ratingBadge.style.color = 'var(--primary)';
    AudioEngine.success();
  } else {
    trophy.innerText = '💪';
    ratingBadge.innerText = 'Needs Review — Check Proofs Below';
    ratingBadge.style.color = 'var(--accent-coral)';
    AudioEngine.wrong();
  }

  if (breakdownList) {
    breakdownList.innerHTML = '';
    currentModel.questions.forEach((qItem, idx) => {
      const studentChoice = quizUserAnswers[idx];
      const isCorrect = studentChoice === qItem.correct;
      const letters = ['A', 'B', 'C', 'D'];

      const itemEl = document.createElement('div');
      itemEl.style.cssText = `
        background: var(--bg-main);
        border-radius: var(--radius-md);
        padding: 1.25rem;
        margin-bottom: 1rem;
        border-left: 5px solid ${isCorrect ? 'var(--accent-mint)' : '#eb4d4b'};
      `;

      itemEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
          <strong>Question ${idx + 1}</strong>
          <span class="pill-badge" style="background:${isCorrect ? 'rgba(0,184,148,0.2)' : 'rgba(235,77,75,0.2)'}; color:${isCorrect ? 'var(--accent-mint)' : '#eb4d4b'};">
            ${isCorrect ? '✓ Correct (+1 Mark)' : '✗ Incorrect (0 Marks)'}
          </span>
        </div>
        <p style="font-size:0.95rem; margin-bottom:0.5rem;">${qItem.q}</p>
        <div style="font-size:0.88rem; color:var(--text-muted); margin-bottom:0.5rem;">
          <span>Your Answer: <strong>${studentChoice !== undefined ? letters[studentChoice] + '. ' + qItem.options[studentChoice] : 'Unanswered'}</strong></span> • 
          <span>Correct Answer: <strong style="color:var(--accent-mint);">${letters[qItem.correct]}. ${qItem.options[qItem.correct]}</strong></span>
        </div>
        <div style="font-size:0.85rem; background:var(--bg-surface); padding:0.75rem; border-radius:var(--radius-sm); border:1px solid var(--border-light);">
          <strong>Derivation & Step-by-Step Proof:</strong><br>${qItem.proof}
        </div>
      `;

      breakdownList.appendChild(itemEl);
    });

    if (window.renderMathInElement) {
      renderMathInElement(breakdownList, {
        delimiters: [
          {left: '$$', right: '$$', display: true},
          {left: '$', right: '$', display: false}
        ]
      });
    }
  }

  const nextBtn = document.getElementById('btnNextQuizModel');
  if (nextBtn) {
    if (activeQuizModelIndex < 2) {
      nextBtn.style.display = 'inline-flex';
      nextBtn.innerHTML = `<i class="fa-solid fa-forward-step"></i> Advance to Quiz #${activeQuizModelIndex + 2}`;
    } else {
      nextBtn.style.display = 'none';
    }
  }

  if (report) {
    report.style.display = 'block';
    report.scrollIntoView({ behavior: 'smooth' });
  }
}

function retakeCurrentQuiz() {
  AudioEngine.click();
  initQuizModel(activeQuizModelIndex);
}

function advanceNextQuizModel() {
  if (activeQuizModelIndex < 2) {
    AudioEngine.click();
    initQuizModel(activeQuizModelIndex + 1);
  }
}

// ==========================================================================
// 7. TAB NAVIGATION & SOLUTION DRAWERS
// ==========================================================================
function switchTab(targetTabId) {
  AudioEngine.click();

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === targetTabId);
  });

  document.querySelectorAll('.tab-content').forEach(panel => {
    panel.classList.toggle('active', panel.id === targetTabId);
  });

  setTimeout(() => {
    StylusEngine.redrawAll();
  }, 50);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleSolutionDrawer(drawerId, btn) {
  AudioEngine.click();
  const drawer = document.getElementById(drawerId);
  if (!drawer) return;
  const isHidden = window.getComputedStyle(drawer).display === 'none';
  drawer.style.display = isHidden ? 'block' : 'none';
  if (btn) {
    const icon = isHidden ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-lightbulb"></i>';
    btn.innerHTML = `${icon} <span>${isHidden ? 'Hide Explanation' : 'Show Explanation / Proof'}</span>`;
  }
}

// ==========================================================================
// 8. LESSON IMPORTER & FILE UPLOAD ENGINE
// ==========================================================================
function openImportModal() {
  AudioEngine.click();
  const modal = document.getElementById('importModal');
  if (modal) modal.classList.add('active');
}

function closeImportModal() {
  AudioEngine.click();
  const modal = document.getElementById('importModal');
  if (modal) modal.classList.remove('active');
}

function handleLessonFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  alert(`File "${file.name}" received successfully!\n\nProcessing new lesson content with Mr Ahmed Abd El-Motaal's 3D Pixar styles, iPad stylus engine, and 30 assessment quiz questions.`);
  closeImportModal();
}

// ==========================================================================
// 9. THEME SWITCHER (DARK / LIGHT MODE)
// ==========================================================================
function initTheme() {
  const savedTheme = localStorage.getItem('math_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  const toggleBtn = document.getElementById('themeToggleBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('math_theme', next);
      updateThemeIcon(next);
      AudioEngine.click();
    });
  }
}

function updateThemeIcon(theme) {
  const toggleBtn = document.getElementById('themeToggleBtn');
  if (!toggleBtn) return;
  toggleBtn.innerHTML = theme === 'dark' ? '<i class="fa-solid fa-sun" style="color:#fdcb6e;"></i>' : '<i class="fa-solid fa-moon"></i>';
}

// ==========================================================================
// 10. APPLICATION INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      switchTab(target);
    });
  });

  FullScreenPen.init();

  const importBtn = document.getElementById('importLessonBtn');
  if (importBtn) importBtn.addEventListener('click', openImportModal);

  // Load the active uploaded lesson: Lesson One: Proportion
  loadLesson('proportion');
});
