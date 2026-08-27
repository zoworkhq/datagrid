# Changesets

Independent per-package versioning. `grid-core` and `grid-dom` are **linked**:
the virtualiser's correctness depends on the two being the same version, and a
consumer must never be able to resolve a tree where they are not.

Nothing publishes yet — every package is `"private": true` until the licence and
support posture is settled (`HANDOVER.md` §7, §10).
