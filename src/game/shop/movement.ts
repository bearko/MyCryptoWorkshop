import type { Actor } from './types';

/** Steps an actor toward (tx, ty). Returns true once it has arrived. */
export function moveToward(a: Actor, dt: number, speed = a.speed): boolean {
  const dx = a.tx - a.x;
  const dy = a.ty - a.y;
  const d = Math.hypot(dx, dy);
  if (d < 2) {
    a.x = a.tx;
    a.y = a.ty;
    return true;
  }
  const step = Math.min(d, speed * dt);
  a.x += (dx / d) * step;
  a.y += (dy / d) * step;
  if (Math.abs(dx) > 1) a.facing = dx < 0 ? -1 : 1;
  a.bob += dt * 10;
  return false;
}

/** Walks along the actor's waypoints. Returns true once the last one is reached. */
export function followPath(a: Actor, dt: number, speed: number): boolean {
  const next = a.path[0];
  if (!next) return true;
  a.tx = next.x;
  a.ty = next.y;
  if (moveToward(a, dt, speed)) a.path.shift();
  return a.path.length === 0;
}
