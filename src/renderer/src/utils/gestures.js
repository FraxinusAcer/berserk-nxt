// gestures.js

export default class Gestures {
  constructor(conf = {}) {
    const defaultConf = {
      normalizeSize: true,
      normalizeTime: true,
      detectCircular: false,
      patterns: [],
      callback: (_pattern) => {},
      fail: (_pattern) => {},
      msByChar: 50,
      mouseButton: 2,
      trailStyle: 'line',
      debug: 0
    };
    this.conf = { ...defaultConf, ...conf };
    this.SENSIBILITY_COEF = 0.3;
    this.installed = false;
    this.mx = null;
    this.my = null;
    this.gst = '';
    this.ix = null;
    this.iy = null;
    this.ts_start = 0;
    this.ts_stop = 0;
    this.points = [];
    this.matrix = [];

    // Привязка контекста
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
  }

  install() {
    if (this.installed) return;
    this.mouseDown = [0, 0, 0];
    document.body.addEventListener('mousedown', this.onMouseDown, true);
    document.body.addEventListener('mouseup', this.onMouseUp, true);
    window.addEventListener('mousemove', this.onMouseMove, true);
    window.addEventListener('mouseup', this.onMouseMove, true);
    this.prevContextMenu = document.oncontextmenu;
    document.oncontextmenu = () => false;

    this.canvas = document.createElement('canvas');
    this.canvas.id = '___mgestures-canvas';
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    Object.assign(this.canvas.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      zIndex: '1000000',
      display: 'none'
    });
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.installed = true;
  }

  uninstall() {
    if (!this.installed) return;
    document.body.removeEventListener('mousedown', this.onMouseDown, true);
    document.body.removeEventListener('mouseup', this.onMouseUp, true);
    window.removeEventListener('mousemove', this.onMouseMove, true);
    window.removeEventListener('mouseup', this.onMouseMove, true);
    this.canvas.remove();
    document.oncontextmenu = this.prevContextMenu;
    this.installed = false;
    this.points = [];
  }

  onMouseDown(evt) {
    this.mouseDown[evt.button] = 1;
    this.ts_start = Date.now();
    if (this.conf.mouseButton === 0) {
      document.body.style.userSelect = 'none';
    }
  }

  onMouseUp(evt) {
    this.mouseDown[evt.button] = 0;
  }

  onMouseMove(e) {
    // Завершение жеста
    if (this.mouseDown[this.conf.mouseButton] !== 1 || e.type === 'mouseup') {
      if (this.conf.mouseButton === 0) {
        document.body.style.userSelect = '';
      }
      if (this.gst) {
        this.ts_stop = Date.now();
        let gesture = this.conf.normalizeSize ? this.normalizeSize(this.gst) : this.gst;
        if (this.conf.debug >= 2) {
          console.log('Gesture size normalized:', gesture);
        }
        this.conf.callback(gesture);

        let found = false;
        for (const g of this.conf.patterns) {
          const detectCircular = g.detectCircular ?? this.conf.detectCircular;
          const normalizeSize = g.normalizeSize ?? this.conf.normalizeSize;
          const normalizeTime = g.normalizeTime ?? this.conf.normalizeTime;
          for (const pattern of g.patterns) {
            const p = normalizeSize ? this.normalizeSize(pattern) : pattern;
            if (normalizeTime) this.normalizeTime(p.length);
            const coef = this.distance(
              p,
              normalizeSize ? this.normalizeSize(gesture) : gesture,
              detectCircular,
              normalizeTime
            );
            if (coef <= this.SENSIBILITY_COEF) {
              found = true;
              g.action(e);
              if (this.conf.debug > 0) {
                console.log(`HIT! Pattern: [${g.name}]`, p, 'vs', gesture, '- COEF:', coef);
              }
              break;
            }
          }
          if (found) break;
        }
        if (!found) {
          this.conf.fail();
        }
      }
      this.resetGesture();
      return;
    }

    // Построение жеста
    if (this.mouseDown[this.conf.mouseButton] === 1) {
      if (this.mx === null || this.my === null) {
        this.mx = e.pageX;
        this.my = e.pageY;
        this.gst = '';
        this.ix = this.mx;
        this.iy = this.my;
        this.drawTrail();
        return;
      }

      setTimeout(() => {
        this.addPoint(this.mx - this.canvas.offsetLeft, this.my - this.canvas.offsetTop);
      }, 1);

      const dx = e.pageX - this.mx;
      const dy = this.my - e.pageY;
      const dist = Math.hypot(dx, dy);
      if (dist < 10) {
        this.mx = e.pageX;
        this.my = e.pageY;
        return;
      }

      let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (angle < 0) angle += 360;
      const idx = Math.floor((angle + 22.5) / 45) % 8;
      this.gst += idx.toString();
      this.mx = e.pageX;
      this.my = e.pageY;
    }
  }

  resetGesture() {
    this.mx = null;
    this.my = null;
    this.gst = '';
  }

  normalizeTime(length) {
    this.ts_start = 0;
    this.ts_stop = this.conf.msByChar * length;
  }

  normalizeSize(s) {
    let result = '';
    let prevChar = '';
    let count = 0;
    for (const char of s) {
      if (char !== prevChar) {
        count = 0;
      } else {
        count++;
      }
      if (count === 1) {
        result += char.repeat(4);
      }
      prevChar = char;
    }
    return result;
  }

  distance(a, b, detectCircular, normalizeTime) {
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    if (normalizeTime && a === b) return 0;

    const lengthCoef = Math.abs(a.length / b.length - 1);
    const timeCoef = Math.abs((a.length * this.conf.msByChar) / (this.ts_stop - this.ts_start) - 1);
    const sensAdjust = 0.002 * ((a.length + b.length) / 2) ** 2;

    const matrix = Array.from({ length: b.length }, () => []);
    for (let i = 0; i < b.length; i++) {
      for (let j = 0; j < a.length; j++) {
        let d = Math.abs(parseInt(b[i], 10) - parseInt(a[j], 10));
        d = d === 8 ? 0 : d > 4 ? 8 - d : d;
        d += lengthCoef + timeCoef;
        matrix[i][j] = d ** 3;
      }
    }
    this.matrix = matrix;

    const results = [];
    const start = detectCircular ? b.length - 1 : 0;
    for (let offset = start; offset >= 0; offset--) {
      let total = 0;
      let countCells = 0;
      for (let i = offset; i < b.length + offset; i++) {
        const row = i % b.length;
        const col = Math.round((i - offset) * (1 + lengthCoef));
        if (col >= a.length) break;
        total += matrix[row][col];
        countCells++;
      }
      results.push(total / countCells);
    }
    return Math.min(...results) - sensAdjust;
  }

  addPoint(x, y) {
    this.points.push({ x, y, lifetime: 0 });
  }

  drawTrail() {
    this.canvas.style.display = 'block';
    const ctx = this.ctx;
    const duration = 30;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.points.forEach((point, idx) => {
      const prev = this.points[idx - 1] || point;
      point.lifetime++;
      if (point.lifetime > duration) {
        this.points.shift();
        return;
      }
      const lifePercent = point.lifetime / duration;
      const red = 0;
      const green = Math.floor(190 - 190 * lifePercent);
      const blue = Math.floor(100 + 210 * lifePercent);
      ctx.strokeStyle = `rgb(${red},${green},${blue})`;
      ctx.fillStyle = `rgb(${red},${green},${blue})`;
      ctx.lineWidth = 20;
      ctx.lineJoin = 'round';

      if (this.conf.trailStyle === 'points') {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 10 * (1 - lifePercent), 0, 2 * Math.PI);
        ctx.fill();
      } else if (idx > 0) {
        const x1 = prev.x;
        const y1 = prev.y;
        const r1 = 5 * (1 - prev.lifetime / duration);
        const x2 = point.x;
        const y2 = point.y;
        const r2 = 5 * (1 - point.lifetime / duration);

        let ang = Math.PI / 2 - Math.asin((y2 - y1) / Math.hypot(x2 - x1, y2 - y1));
        if (isNaN(ang)) ang = 0;
        let ox1 = r1 * Math.cos(ang);
        let oy1 = r1 * Math.sin(ang);
        let ox2 = r2 * Math.cos(ang);
        let oy2 = r2 * Math.sin(ang);

        const points = (x2 > x1) === (y2 > y1)
          ? [[x1 - ox1, y1 + oy1], [x1 + ox1, y1 - oy1], [x2 + ox2, y2 - oy2], [x2 - ox2, y2 + oy2]]
          : [[x1 + ox1, y1 + oy1], [x1 - ox1, y1 - oy1], [x2 - ox2, y2 - oy2], [x2 + ox2, y2 + oy2]];

        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i][0], points[i][1]);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
      }
    });

    if (this.mouseDown[this.conf.mouseButton] === 1) {
      requestAnimationFrame(() => this.drawTrail());
    } else {
      this.canvas.style.display = 'none';
      this.points = [];
    }
  }
}

export function initGestures(conf) {
  return new Gestures(conf)
}
