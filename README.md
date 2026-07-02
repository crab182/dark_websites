# dark_websites

A **reference database of the useful, lesser-known web** — and a quick-reference
portal for browsing it.

Most of us reach for the same five sites every day. This is a curated index of
everything *else*: independent search engines, deep scholarly archives, single-
purpose lookup tools, and the strange, hand-made corners that make the web worth
keeping. Every entry is a real, public, legitimate website — think *librarian's
deep web*, not anything illicit.

It is refreshed **once a week** by an automated routine and the portal
**showcases the newest finds** up front.

<!-- STATS:START -->
**38 sites** indexed · **2 new** in the last 14 days · updated 2026-06-29

By facet: `obscure` 8 · `niche` 18 · `kitsch` 9 · `broad` 15 · `deep` 19 · `narrow` 10
<!-- STATS:END -->

## The six facets

Every site is tagged with one or more facets — the dimensions you asked for:

| Facet | Means |
|-------|-------|
| `obscure` | Hidden corners most people never reach — independent search, the small web, the strange-but-real. |
| `niche` | Built for one community or craft; narrow audience, high signal. |
| `kitsch` | Playful, retro, hand-made, or gloriously useless. The web having fun. |
| `broad` | Wide coverage — general reference and gateways that fan out everywhere. |
| `deep` | Goes far down — long-form, scholarly, or exhaustive on its subject. |
| `narrow` | Does one job and does it well — a single sharp tool or lookup. |

Free-form `tags` (e.g. `#search`, `#archive`, `#tools`) add topical filtering on
top of the facets.

## The portal

`index.html` is a dependency-free static page that loads `data/sites.json` and
gives you:

- full-text search across names, descriptions and tags;
- AND-combining facet and tag filters;
- newest / A→Z sorting;
- a **New finds** showcase strip (anything added in the last 14 days, badged
  `NEW`);
- shareable views — the active filters live in the URL hash.

### Run it locally

The page fetches JSON, so serve the folder over HTTP rather than opening the
file directly:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

In production it is published to GitHub Pages by `.github/workflows/deploy.yml`.

## How the weekly routine works

`.github/workflows/weekly-update.yml` runs every **Monday 09:00 UTC** (and on
demand via *Run workflow*). Each run:

1. **Validates** the database (`scripts/validate.py`) — schema, required fields,
   allowed facets, unique ids and URLs.
2. **Rebuilds** derived data (`scripts/build.py`): sorts the database, refreshes
   the `updated` timestamp, regenerates `data/stats.json` and `data/digest.json`,
   prepends new finds to [`FINDS.md`](FINDS.md), and updates the stats block in
   this README.
3. **Link-checks** every URL (`scripts/linkcheck.py`) — best effort, never blocks
   the build; results land in `data/linkcheck.json`.
4. **Commits** anything that changed, which in turn triggers a redeploy.

Run the same steps by hand:

```bash
python scripts/validate.py
python scripts/build.py
python scripts/linkcheck.py   # optional, needs network
```

## Adding a find

Edit `data/sites.json` and add an object to `sites` (see
[CONTRIBUTING.md](CONTRIBUTING.md) for the field reference), then run
`python scripts/validate.py`. Set `added` to today's date so it shows up in the
**New finds** showcase.

## Layout

| Path | What |
|------|------|
| `data/sites.json` | The database — the single source of truth. |
| `data/sites.schema.json` | JSON Schema describing an entry. |
| `data/stats.json`, `data/digest.json`, `data/linkcheck.json` | Generated; do not hand-edit. |
| `index.html`, `assets/` | The portal (HTML/CSS/vanilla JS). |
| `scripts/` | `validate.py`, `build.py`, `linkcheck.py` — stdlib only. |
| `.github/workflows/` | `validate`, `weekly-update`, `deploy`. |
| `FINDS.md` | Auto-generated diary of new additions. |

## License

Code is MIT (see [LICENSE](LICENSE)). The curated list of links in
`data/sites.json` is dedicated to the public domain (CC0); the linked sites
themselves belong to their respective owners.
