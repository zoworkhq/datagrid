/**
 * Trims the output for display WITHOUT cutting off the part being demonstrated.
 *
 * A blind prefix is the obvious way to do this and it is wrong here: the row
 * carrying the injection payload is thousands of lines down, so a prefix shows
 * the reader everything except the thing they were told to look for. The head
 * is kept for shape; every interesting line is kept because it is the evidence.
 */
export function excerpt(body: string, interesting: readonly RegExp[] = [], head = 20): string {
  // Every line is clipped first. A print sheet puts its whole <tbody> on one
  // line, so a line budget alone bounds nothing — 20 lines can still be 200 kB.
  const clip = (l: string): string =>
    l.length <= 400 ? l : `${l.slice(0, 400)} …+${(l.length - 400).toLocaleString()} chars`;

  const lines = body.split("\n");
  if (lines.length <= head) return lines.map(clip).join("\n");

  const rest = lines.slice(head);
  // Per-pattern quota. A shared budget lets whichever pattern appears first
  // consume it and silently hide the other — the same failure as a blind
  // prefix, one level up.
  const hits = [...new Set(interesting.flatMap((re) => rest.filter((l) => re.test(l)).slice(0, 3)))];

  const out = [
    ...lines.slice(0, head).map(clip),
    `\n⋮  ${(rest.length - hits.length).toLocaleString()} lines not shown`,
  ];
  if (hits.length > 0) out.push("", ...hits.map(clip));
  return out.join("\n");
}
