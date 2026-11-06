// Keyboard, mouse and touch input mapped to game actions.
export class Input {
  constructor(target) {
    this.jump = false;
    this.duck = false;
    this.listeners = {};
    this._touchStart = null;
    this._touchDuck = false;
    this._buttons = { jump: false, duck: false };

    const JUMP = ['Space', 'ArrowUp', 'KeyW'];
    const DUCK = ['ArrowDown', 'KeyS'];
    // Game sets this: whether menus are up (keyboard users may then press focused buttons)
    this.allowUi = () => true;
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      // Space / Enter on a keyboard-focused button press that button (menus only; in a run they're game keys)
      if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') && this._uiFocus(e.target)) return;
      if (JUMP.includes(e.code)) {
        e.preventDefault();
        this.jump = true;
        if (!e.repeat) this.emit('jump');
      } else if (DUCK.includes(e.code)) {
        e.preventDefault();
        this.duck = true;
        if (!e.repeat) this.emit('duck');
      } else if (!e.repeat) {
        const map = {
          KeyF: 'breath', KeyX: 'breath', ShiftLeft: 'breath', ShiftRight: 'breath',
          ArrowRight: 'smash', KeyD: 'smash', KeyE: 'smash', ArrowLeft: 'prev', KeyA: 'prev',
          Digit1: 'level1', Digit2: 'level2', Digit3: 'level3', Numpad1: 'level1', Numpad2: 'level2', Numpad3: 'level3',
          KeyV: 'view', KeyC: 'view', KeyP: 'pause', Escape: 'pause', KeyM: 'mute', Enter: 'start', KeyQ: 'quality',
          KeyL: 'board', KeyK: 'skin', KeyB: 'monsters',
        };
        if (map[e.code]) {
          e.preventDefault();
          this.emit(map[e.code]);
        }
      }
    });
    window.addEventListener('keyup', (e) => {
      if (JUMP.includes(e.code)) { this.jump = false; this.emit('jumpRelease'); }
      if (DUCK.includes(e.code)) this.duck = false;
    });
    window.addEventListener('blur', () => { this.jump = this.duck = false; });

    // pointer on the canvas: tap = jump, swipe down / hold low = duck
    target.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this._touchStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
      this.jump = true;
      this.emit('tap');
      this.emit('jump');
    });
    target.addEventListener('pointermove', (e) => {
      const s = this._touchStart;
      if (!s || s.id !== e.pointerId) return;
      if (e.clientY - s.y > 40 && !this._touchDuck) {
        this._touchDuck = true;
        this.duck = true;
        this.jump = false;
        this.emit('jumpRelease');
        this.emit('duck');
      }
    });
    const end = (e) => {
      if (this._touchStart && this._touchStart.id === e.pointerId) {
        this._touchStart = null;
        this.jump = false;
        this.emit('jumpRelease');
        if (this._touchDuck) { this._touchDuck = false; this.duck = this._buttons.duck; }
      }
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }

  _uiFocus(t) {
    if (!(t instanceof HTMLElement) || !this.allowUi()) return false;
    if (!t.closest('button, [role="button"], [role="radio"], [role="tab"], a[href], select, textarea')) return false;
    return t.matches(':focus-visible') && t.offsetParent !== null;
  }

  bindButton(el, action) {
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      // keep the press even if the thumb slides off the button (a held jump glides, a held duck ducks)
      try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      el.classList.add('pressed');
      if (action === 'jump') { this._buttons.jump = true; this.jump = true; this.emit('jump'); }
      else if (action === 'duck') { this._buttons.duck = true; this.duck = true; this.emit('duck'); }
      else this.emit(action);
    };
    const up = (e) => {
      e.preventDefault();
      if (!el.classList.contains('pressed')) return;
      el.classList.remove('pressed');
      if (action === 'jump') { this._buttons.jump = false; this.jump = false; this.emit('jumpRelease'); }
      if (action === 'duck') { this._buttons.duck = false; this.duck = false; }
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }

  on(evt, fn) {
    (this.listeners[evt] ||= []).push(fn);
  }

  emit(evt) {
    for (const fn of this.listeners[evt] || []) fn();
  }
}
