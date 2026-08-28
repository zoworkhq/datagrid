import { describe, expect, it } from "vitest";
import {
  arrivalCount,
  createLiveState,
  freeze,
  hasDeparted,
  release,
  remove,
  thaw,
  upsert,
  type LiveState,
} from "./live.js";

interface P {
  readonly id: string;
  readonly name: string;
  readonly acuity: number;
}

const rowKey = (r: P) => r.id;
const opts = { rowKey };
const p = (id: string, acuity = 1): P => ({ id, name: `Patient ${id}`, acuity });

const start = (): LiveState<P> => createLiveState([p("a"), p("b"), p("c"), p("d")]);
const ids = (s: LiveState<P>) => s.rows.map(rowKey);

describe("while the reader is not touching the list", () => {
  it("appends a new row straight away", () => {
    const s = upsert(start(), [p("e")], opts);
    expect(ids(s)).toEqual(["a", "b", "c", "d", "e"]);
    expect(arrivalCount(s)).toBe(0);
  });

  it("removes a row straight away", () => {
    expect(ids(remove(start(), ["b"], opts))).toEqual(["a", "c", "d"]);
  });
});

describe("while a pointer or focus is inside the body", () => {
  it("NEVER changes the index of a row that is already showing", () => {
    // The property that matters. You aim at row four; an admission arrives.
    // Row four must still be row four.
    let s = freeze(start());
    const before = ids(s);
    for (let i = 0; i < 200; i++) s = upsert(s, [p(`new${i}`, i)], opts);
    expect(ids(s)).toEqual(before);
    expect(arrivalCount(s)).toBe(200);
  });

  it("queues arrivals behind the divider, and only the counter moves", () => {
    let s = freeze(start());
    s = upsert(s, [p("e")], opts);
    s = upsert(s, [p("f")], opts);
    expect(ids(s)).toEqual(["a", "b", "c", "d"]);
    expect(s.queued.map(rowKey)).toEqual(["e", "f"]);
    expect(arrivalCount(s)).toBe(2);
  });

  it("still updates the VALUES of a showing row, in place", () => {
    // Stale data is its own hazard. The value changes; the position does not.
    let s = freeze(start());
    s = upsert(s, [{ ...p("c"), acuity: 9 }], opts);
    expect(ids(s)).toEqual(["a", "b", "c", "d"]);
    expect(s.rows[2]?.acuity).toBe(9);
  });

  it("marks a departed row instead of deleting it", () => {
    // Deleting shifts every row below, including the one under the pointer.
    let s = freeze(start());
    s = remove(s, ["b"], opts);
    expect(ids(s)).toEqual(["a", "b", "c", "d"]);
    expect(hasDeparted(s, "b")).toBe(true);
    expect(hasDeparted(s, "c")).toBe(false);
  });

  it("un-marks a row that comes back", () => {
    let s = freeze(start());
    s = remove(s, ["b"], opts);
    s = upsert(s, [p("b", 4)], opts);
    expect(hasDeparted(s, "b")).toBe(false);
    expect(ids(s)).toEqual(["a", "b", "c", "d"]);
  });

  it("updates a queued arrival in place rather than queueing it twice", () => {
    let s = freeze(start());
    s = upsert(s, [p("e", 1)], opts);
    s = upsert(s, [p("e", 7)], opts);
    expect(arrivalCount(s)).toBe(1);
    expect(s.queued[0]?.acuity).toBe(7);
  });

  it("drops a queued row that leaves again before it was ever shown", () => {
    let s = freeze(start());
    s = upsert(s, [p("e")], opts);
    s = remove(s, ["e"], opts);
    expect(arrivalCount(s)).toBe(0);
    expect(hasDeparted(s, "e")).toBe(false); // it never had a slot to depart from
  });
});

describe("thawing and releasing are different things", () => {
  it("thawing alone does not move the list", () => {
    // The reader asked for nothing. Releasing here would reorder the list at
    // the moment they looked away, which is the same failure one step removed.
    let s = freeze(start());
    s = upsert(s, [p("e")], opts);
    s = thaw(s);
    expect(ids(s)).toEqual(["a", "b", "c", "d"]);
    expect(arrivalCount(s)).toBe(1);
  });

  it("releasing folds in arrivals and drops departed rows", () => {
    let s = freeze(start());
    s = upsert(s, [p("e")], opts);
    s = remove(s, ["b"], opts);
    s = release(s, opts);
    expect(ids(s)).toEqual(["a", "c", "d", "e"]);
    expect(arrivalCount(s)).toBe(0);
    expect(hasDeparted(s, "b")).toBe(false);
  });

  it("releasing does not re-sort — that is the caller's policy", () => {
    // Hiding a reorder inside a release is how a list moves without anyone
    // having asked it to.
    let s = freeze(createLiveState([p("c", 3), p("a", 1)]));
    s = upsert(s, [p("b", 2)], opts);
    expect(ids(release(s, opts))).toEqual(["c", "a", "b"]);
  });

  it("is a no-op when there is nothing waiting", () => {
    const s = start();
    expect(release(s, opts)).toBe(s);
  });
});

describe("throughput", () => {
  it("holds 1,000 updates without moving a single showing row", () => {
    let s = freeze(start());
    const before = ids(s);
    for (let i = 0; i < 1_000; i++) {
      s = i % 3 === 0 ? upsert(s, [{ ...p("a"), acuity: i }], opts) : upsert(s, [p(`n${i}`)], opts);
    }
    expect(ids(s)).toEqual(before);
    expect(s.rows[0]?.acuity).toBe(999); // the showing row is current
    expect(arrivalCount(s)).toBeGreaterThan(600);
  });

  it("does not copy state when nothing was given to it", () => {
    const s = freeze(start());
    expect(upsert(s, [], opts)).toBe(s);
    expect(remove(s, [], opts)).toBe(s);
  });
});
