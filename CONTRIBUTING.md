# Contributing a find

Two ways to suggest a site:

- **No PR:** open the [Suggest a site](https://github.com/crab182/dark_websites/issues/new?template=suggest-a-site.yml)
  issue form and fill in the fields — a maintainer adds it.
- **By PR:** the database is one file, [`data/sites.json`](data/sites.json); add
  an entry to the `sites` array as described below.

## Entry format

```json
{
  "id": "marginalia-search",
  "name": "Marginalia Search",
  "url": "https://search.marginalia.nu/",
  "description": "An independent search engine that favors text-heavy, non-commercial pages.",
  "facets": ["obscure", "broad"],
  "tags": ["search", "small-web"],
  "added": "2026-06-16"
}
```

| Field | Rules |
|-------|-------|
| `id` | Unique. Lowercase letters, digits and hyphens only. |
| `name` | Display name. |
| `url` | Must start with `http://` or `https://`. Must be unique. |
| `description` | One or two sentences. Describe what it *is* and why it's worth a visit. |
| `facets` | One or more of: `obscure`, `niche`, `kitsch`, `broad`, `deep`, `narrow`. |
| `tags` | Free-form topical tags. Lowercase, hyphenated (e.g. `small-web`, `public-domain`). |
| `added` | ISO date (`YYYY-MM-DD`). Use today's date so it appears in **New finds**. |

The fields above are the only ones allowed — the schema rejects extras.

## What belongs here

- Legitimate, **public** websites. Nothing illicit, paywalled-to-uselessness, or
  requiring an invite to even see.
- Things that earn the name: independent search, deep archives, sharp single-
  purpose tools, niche communities, well-made curios.
- Prefer the lesser-known. The mainstream destinations everyone already knows are
  out of scope on purpose.

## Before opening a PR

```bash
python scripts/validate.py
```

Install the local pre-commit hook (`make hook`) to run the same check
automatically on every commit — there is no CI. Keep entries sorted
however you like — `scripts/build.py` re-sorts the file (newest first) on the
next weekly run.
