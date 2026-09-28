/**
 * A damped spring described the way iOS describes them: `response` is roughly the
 * period in seconds, `damping` the ratio (1 = no overshoot, lower = livelier).
 */
export class Spring {
  value: number;
  target: number;
  velocity = 0;

  constructor(
    value: number,
    public response = 0.5,
    public damping = 0.82,
  ) {
    this.value = value;
    this.target = value;
  }

  jump(value: number) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }

  step(dt: number) {
    const w = (2 * Math.PI) / this.response;
    const k = w * w;
    const c = 2 * this.damping * w;
    let left = Math.min(dt, 1 / 20);
    while (left > 0) {
      const h = Math.min(left, 1 / 240);
      const a = -k * (this.value - this.target) - c * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
      left -= h;
    }
    if (this.resting) {
      this.value = this.target;
      this.velocity = 0;
    }
  }

  get resting() {
    return Math.abs(this.value - this.target) < 0.005 && Math.abs(this.velocity) < 0.005;
  }
}
