/**
 * @oxygenui-design/grid-signals — the reactivity substrate.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THIS PACKAGE LOOKS LIKE A POINTLESS RE-EXPORT. IT IS NOT. DO NOT INLINE IT.
 *
 * It is the only package in this repository permitted to import a signals
 * implementation, so that TC39 Signals landing — or alien-signals developing a
 * CVE — changes exactly one file instead of every file in the engine.
 * `dependency-cruiser` enforces that; see the rule
 * `signals-vendor-is-private-to-the-facade`.
 *
 * The exported surface is deliberately the *intersection* of what
 * alien-signals, the TC39 proposal and every framework implementation agree
 * on. Nothing vendor-specific is re-exported, including types. Widening this
 * surface requires superseding ADR 0003.
 *
 * @see ../../../docs/decisions/0003-the-signals-dependency.md
 * ────────────────────────────────────────────────────────────────────────────
 */
import {
  computed as vendorComputed,
  effect as vendorEffect,
  endBatch,
  setActiveSub,
  signal as vendorSignal,
  startBatch,
} from "alien-signals";

/** A value that can be read, and that tracks the reader. */
export interface ReadSignal<T> {
  (): T;
}

/** A value that can also be written. */
export interface WriteSignal<T> extends ReadSignal<T> {
  set(next: T): void;
  update(fn: (previous: T) => T): void;
}

/** A disposer. Calling it twice is safe. */
export type Dispose = () => void;

export function signal<T>(initial: T): WriteSignal<T> {
  const s = vendorSignal(initial);
  const read = (() => s()) as WriteSignal<T>;
  read.set = (next: T) => {
    s(next);
  };
  read.update = (fn: (previous: T) => T) => {
    s(fn(s()));
  };
  return read;
}

/**
 * A derived value. Recomputed lazily, at most once per change, and only when
 * something actually reads it — which is why a hover does not re-run filtering.
 */
export function computed<T>(getter: () => T): ReadSignal<T> {
  return vendorComputed(getter);
}

/** Runs now and again whenever a signal it read changes. Returns a disposer. */
export function effect(fn: () => void | Dispose): Dispose {
  return vendorEffect(fn);
}

/** Applies every write in `fn` as one change. Nested batches are counted. */
export function batch<T>(fn: () => T): T {
  startBatch();
  try {
    return fn();
  } finally {
    endBatch();
  }
}

/** Reads without subscribing. Use sparingly; each use is a place a stale read can hide. */
export function untrack<T>(fn: () => T): T {
  const previous = setActiveSub(undefined);
  try {
    return fn();
  } finally {
    setActiveSub(previous);
  }
}
