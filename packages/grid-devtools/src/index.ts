/**
 * @oxygenui-design/grid-devtools — the panel.
 *
 * ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────
 *
 * Debuggability is a product feature at this complexity, and no competitor
 * ships one. But there is a sharper reason here: ADR 0002 strips every value
 * out of errors and events, which is correct and makes debugging a cell
 * renderer genuinely harder. **This panel is the compensating control.** It is
 * the one place a developer can see what a cell was actually given.
 *
 * That is only safe because of what this package is NOT:
 *
 *   - it performs no network I/O and has no transport (ADR 0001), so nothing
 *     it holds can leave the machine it is running on;
 *   - it is a separate package a developer imports deliberately, so it is not
 *     in a production bundle unless somebody put it there;
 *   - the retained log is bounded, so a long-lived session cannot turn it into
 *     a slow memory leak on a ward workstation.
 *
 * The values it holds never reach `onError`, `onDisclosure`, or anything else
 * the application forwards. They exist in one array, in one tab.
 */
import type { GridAction, GridError, GridQuery, GridState } from "@oxygenui-design/grid-core";

export interface LoggedAction {
  readonly seq: number;
  readonly at: number;
  readonly action: GridAction;
  /** Milliseconds spent reducing and repainting. */
  readonly ms?: number;
  /** A plugin's veto, if one blocked it. */
  readonly vetoedBy?: string;
}

export interface FrameSample {
  readonly at: number;
  readonly ms: number;
}

export interface DevtoolsSnapshot {
  readonly actions: readonly LoggedAction[];
  readonly state: GridState | null;
  readonly query: GridQuery | null;
  readonly errors: readonly GridError[];
  readonly frames: readonly FrameSample[];
  readonly stats: {
    readonly actions: number;
    readonly errors: number;
    /** p95 frame time, so a janky scroll shows up as a number. */
    readonly p95FrameMs: number;
    readonly droppedFrames: number;
  };
}

export interface DevtoolsOptions {
  /** Bounded, so a fortnight-long session cannot grow without limit. */
  readonly limit?: number;
  readonly now?: () => number;
}

export interface Devtools {
  action(action: GridAction, ms?: number, vetoedBy?: string): void;
  state(state: GridState): void;
  query(query: GridQuery): void;
  error(error: GridError): void;
  frame(ms: number): void;
  snapshot(): DevtoolsSnapshot;
  /** Everything the panel knows, as text, for pasting into a bug report. */
  report(): string;
  clear(): void;
}

const ONE_FRAME_MS = 16.7;

export function createDevtools(options: DevtoolsOptions = {}): Devtools {
  const limit = options.limit ?? 500;
  const now = options.now ?? (() => Date.now());

  let seq = 0;
  let actions: LoggedAction[] = [];
  let errors: GridError[] = [];
  let frames: FrameSample[] = [];
  let state: GridState | null = null;
  let query: GridQuery | null = null;

  // A ring rather than an unbounded array: this runs for as long as the tab
  // does, and a ward workstation keeps one session for a fortnight.
  const push = <T>(list: T[], item: T): T[] => {
    list.push(item);
    return list.length > limit ? list.slice(-limit) : list;
  };

  const p95 = (): number => {
    if (frames.length === 0) return 0;
    const sorted = frames.map((f) => f.ms).sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
  };

  return {
    action(action, ms, vetoedBy) {
      actions = push(actions, {
        seq: seq++,
        at: now(),
        action,
        ...(ms !== undefined ? { ms } : {}),
        ...(vetoedBy !== undefined ? { vetoedBy } : {}),
      });
    },
    state(next) {
      state = next;
    },
    query(next) {
      query = next;
    },
    error(e) {
      errors = push(errors, e);
    },
    frame(ms) {
      frames = push(frames, { at: now(), ms });
    },

    snapshot() {
      return {
        actions,
        state,
        query,
        errors,
        frames,
        stats: {
          actions: seq,
          errors: errors.length,
          p95FrameMs: Math.round(p95() * 10) / 10,
          droppedFrames: frames.filter((f) => f.ms > ONE_FRAME_MS).length,
        },
      };
    },

    report() {
      const s = this.snapshot();
      const lines = [
        `actions ${s.stats.actions} · errors ${s.stats.errors} · p95 frame ${s.stats.p95FrameMs} ms · dropped ${s.stats.droppedFrames}`,
        "",
        "── recent actions ──",
        ...s.actions.slice(-20).map((a) => {
          const veto = a.vetoedBy ? ` VETOED by ${a.vetoedBy}` : "";
          const ms = a.ms === undefined ? "" : ` ${a.ms.toFixed(1)}ms`;
          return `${String(a.seq).padStart(4)} ${a.action.type}${ms}${veto}`;
        }),
        "",
        "── errors ──",
        // Still coordinates only. The panel holds values; the REPORT does not,
        // because a report is pasted into an issue tracker.
        ...s.errors.slice(-10).map((e) => `${e.code} ${e.phase} col=${e.columnKey ?? "-"} row=${e.rowIndex ?? "-"}`),
        "",
        "── query ──",
        s.query ? `sort=${JSON.stringify(s.query.sort)} pageSize=${s.query.pageSize} cursor=${s.query.cursor ?? "-"}` : "(none)",
      ];
      return lines.join("\n");
    },

    clear() {
      actions = [];
      errors = [];
      frames = [];
    },
  };
}

/**
 * Explains why a grid is in the state it is in.
 *
 * The devtools' actual job: not "here is the state" but "here is the sequence
 * that produced it". A reducer over a serialisable action union is what makes
 * this possible at all.
 */
export function explain(snapshot: DevtoolsSnapshot): readonly string[] {
  const relevant = snapshot.actions.filter((a) =>
    ["sort/toggle", "sort/set", "filter/set", "view/apply", "page/next", "column/visibility"].includes(
      a.action.type,
    ),
  );
  if (relevant.length === 0) return ["Nothing has changed the query since this grid mounted."];

  return relevant.slice(-10).map((a) => {
    switch (a.action.type) {
      case "sort/toggle":
        return `#${a.seq} sorted by ${a.action.key}${a.action.additive ? " (added)" : " (replaced)"}`;
      case "filter/set":
        return `#${a.seq} ${a.action.node ? "set a filter" : "cleared the filter"}`;
      case "page/next":
        return `#${a.seq} followed a cursor`;
      case "column/visibility":
        return `#${a.seq} ${a.action.visible ? "showed" : "hid"} ${a.action.key}`;
      default:
        return `#${a.seq} ${a.action.type}`;
    }
  });
}
