// Confetti burst, ported from the My Crypto Heroes gold-chest effect in the asset repository
// (vendor/mycryptoheroes/Data/Effects/GoldChest/confetti.js, MIT License, © 2026 bearko).
// Same particle model and values (120 pieces, speed 2, the original colours); rewritten as a
// small module that stops by itself.

const COLORS = [
  'rgba(30,144,255,',
  'rgba(107,142,35,',
  'rgba(255,215,0,',
  'rgba(255,192,203,',
  'rgba(106,90,205,',
  'rgba(173,216,230,',
  'rgba(238,130,238,',
  'rgba(152,251,152,',
  'rgba(70,130,180,',
  'rgba(244,164,96,',
  'rgba(210,105,30,',
  'rgba(220,20,60,',
];
const MAX_COUNT = 120;
const SPEED = 2;
const FRAME_MS = 15;

interface Particle {
  color: string;
  x: number;
  y: number;
  diameter: number;
  tilt: number;
  tiltAngleIncrement: number;
  tiltAngle: number;
}

let canvas: HTMLCanvasElement | null = null;
let particles: Particle[] = [];
let streaming = false;
let running = false;
let waveAngle = 0;
let lastFrame = 0;

function reset(p: Partial<Particle>, width: number, height: number): Particle {
  return Object.assign(p, {
    color: COLORS[(Math.random() * COLORS.length) | 0] + '1)',
    x: Math.random() * width,
    y: Math.random() * height - height,
    diameter: Math.random() * 10 + 5,
    tilt: Math.random() * 10 - 10,
    tiltAngleIncrement: Math.random() * 0.07 + 0.05,
    tiltAngle: 0,
  });
}

function step(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  waveAngle += 0.01;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.tiltAngle += p.tiltAngleIncrement;
    p.x += Math.sin(waveAngle);
    p.y += (Math.cos(waveAngle) + p.diameter + SPEED) * 0.5;
    p.tilt = Math.sin(p.tiltAngle) * 15;
    if (p.x > width + 20 || p.x < -20 || p.y > height) {
      // Recycled from the top while streaming; dropped once the burst is over.
      if (streaming) {
        reset(p, width, height);
        p.y = -10;
      } else {
        particles.splice(i, 1);
      }
    }
  }
}

function draw(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, canvas!.width, canvas!.height);
  for (const p of particles) {
    ctx.beginPath();
    ctx.lineWidth = p.diameter;
    const x2 = p.x + p.tilt;
    const x = x2 + p.diameter / 2;
    const y2 = p.y + p.tilt + p.diameter / 2;
    ctx.strokeStyle = p.color;
    ctx.moveTo(x, p.y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

function loop(now: number): void {
  if (!canvas) return;
  if (particles.length === 0) {
    canvas.remove();
    canvas = null;
    running = false;
    return;
  }
  if (now - lastFrame > FRAME_MS) {
    step();
    draw(canvas.getContext('2d')!);
    lastFrame = now;
  }
  requestAnimationFrame(loop);
}

/** Starts a confetti burst for `ms` milliseconds (pieces already falling finish their fall). */
/** Turned off with "reduce motion". */
export const confettiSettings = { enabled: true };

export function confetti(ms = 2500): void {
  if (!confettiSettings.enabled) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    canvas.width = width;
    canvas.height = height;
    document.body.append(canvas);
  }
  while (particles.length < MAX_COUNT) particles.push(reset({}, width, height));
  streaming = true;
  window.setTimeout(() => (streaming = false), ms);
  if (!running) {
    running = true;
    requestAnimationFrame(loop);
  }
}
