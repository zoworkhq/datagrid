# Research

Two documents. **They disagree, and the second one wins.**

| | |
| --- | --- |
| [`2026-08-27-product-brief.html`](2026-08-27-product-brief.html) | 32 sections, 23 interactive prototypes. Healthcare use cases, UX architecture, clinical cell design, the fourteen recipes. **Partly superseded** — it opens with an errata banner listing the four claims that no longer hold. |
| [`2026-08-27-architecture-review.html`](2026-08-27-architecture-review.html) | 32 sections, a filterable 91-capability gap matrix against six competing grids. Library architecture, framework-agnostic strategy, package layout, security findings, roadmap. **Current.** |

Open either in a browser. Both are self-contained — no network, no build step —
and both carry light and dark themes plus a working table of contents.

## Which to read for what

- **What the product is, and why a clinical grid is not a table** → the brief.
  Its clinical thesis is intact and is the reason this repository exists.
- **How to build it** → the review. The brief's engineering is superseded.
- **Neither, if you only have twenty minutes** → [`../../HANDOVER.md`](../../HANDOVER.md).

## The four superseded claims

Reproduced here so nobody has to open a 716 kB file to find them:

| The brief says | Correct position |
| --- | --- |
| Budgets up to **1,000,000+ rows client-side** | Not achievable. The best-measured engine in the category retains 380 MB for 1M rows × 8 columns. Client ceiling is ~100k; above that, client mode refuses with a reason. |
| Coverage reads **“Showing 8 of 1,284”** | `Coverage.total` is `number \| "unknown"`. FHIR returns opaque `link.next` URLs and `Bundle.total` is optional — so no totals and no page numbers. |
| Pagination is **offset or cursor** | Cursor is the default. Offset is the special case for non-FHIR sources. |
| **AI is a differentiator** | The features are table stakes. Provenance and refusal are the differentiator. |

## Regenerating

Both reports are **generated, not hand-written**, which is why the sources are
committed alongside them. Every count, ranking and cross-reference in the prose
is derived from the data files, so a datum cannot desync from the sentence
quoting it — and each build hard-fails on an unsubstituted `@@TOKEN@@`.

```bash
cd generators/review && python3 build.py ../2026-08-27-architecture-review.html
cd generators/brief  && python3 build.py ../2026-08-27-product-brief.html
```

Python 3 only; no dependencies. `preview.py` renders a subset of figures for
faster visual checking during editing.

```
generators/<report>/
├─ build.py          assembles the document; fails on unsubstituted tokens
├─ model.py          Section / Fig types and the token substituter
├─ base.css.html     the shared stylesheet for the whole brief series
├─ extra.css         additions for this report
├─ app.js            the interactive runtime for the prototypes
├─ d_*.py / data_*.py   the data every number in the prose derives from
├─ figs*.py / mocks_*.py  the figures
└─ p*.py / prose*.py     the prose
```

## Provenance and limits

Competitor claims were checked in **August 2026** against documentation, release
notes, repositories or installed source, and are dated where they are
version-specific. **They will age.**

Every clinical rule in either document is derived from published literature and
general knowledge and has **not been reviewed by a clinician**. All data is
synthetic, on reserved example systems. No PHI appears anywhere.
