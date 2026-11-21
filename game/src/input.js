// Keyboard and mouse state, with per-frame "just pressed" edges so the game can
// react once to a key tap (enter a car, start a mission, pause) instead of every frame.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false };
    this.onFirstGesture = null;

    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      this.gesture();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * canvas.width;
      this.mouse.y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouse.down = true;
      this.mouse.clicked = true;
      this.gesture();
    });
    window.addEventListener('mouseup', () => {
      this.mouse.down = false;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
    });
  }

  gesture() {
    if (this.onFirstGesture) {
      const cb = this.onFirstGesture;
      this.onFirstGesture = null;
      cb();
    }
  }

  down(code) {
    return this.keys.has(code);
  }

  justPressed(code) {
    return this.pressed.has(code);
  }

  // True if any of the given codes is held down.
  any(codes) {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  // Call at the end of each frame so edges last exactly one frame.
  endFrame() {
    this.pressed.clear();
    this.mouse.clicked = false;
  }
}
