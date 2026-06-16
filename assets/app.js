/* dark_websites portal — dependency-free.
 * Loads data/sites.json, renders a faceted, searchable reference grid plus a
 * "New finds" showcase. Filter state lives in the URL hash so views are
 * shareable. */
"use strict";

const NEW_WINDOW_DAYS = 14;
const FACET_ORDER = ["obscure", "niche", "kitsch", "broad", "deep", "narrow"];

const state = {
  data: null,
  search: "",
  facets: new Set(), // AND across selected facets
  tags: new Set(), // AND across selected tags
  sort: "newest",
};

const el = (id) => document.getElementById(id);

function daysSince(iso) {
  const then = new Date(iso + "T00:00:00Z");
  return (Date.now() - then.getTime()) / 86400000;
}
const isNew = (site) => daysSince(site.added) <= NEW_WINDOW_DAYS;

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/* ---- URL hash <-> state ---- */
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.search = p.get("q") || "";
  state.sort = p.get("sort") === "alpha" ? "alpha" : "newest";
  state.facets = new Set((p.get("facets") || "").split(",").filter(Boolean));
  state.tags = new Set((p.get("tags") || "").split(",").filter(Boolean));
}
function writeHash() {
  const p = new URLSearchParams();
  if (state.search) p.set("q", state.search);
  if (state.sort !== "newest") p.set("sort", state.sort);
  if (state.facets.size) p.set("facets", [...state.facets].join(","));
  if (state.tags.size) p.set("tags", [...state.tags].join(","));
  const h = p.toString();
  history.replaceState(null, "", h ? "#" + h : location.pathname);
}

/* ---- filtering ---- */
function filtered() {
  const q = state.search.trim().toLowerCase();
  let out = state.data.sites.filter((s) => {
    for (const f of state.facets) if (!s.facets.includes(f)) return false;
    for (const t of state.tags) if (!s.tags.includes(t)) return false;
    if (q) {
      const hay = (s.name + " " + s.description + " " + s.tags.join(" ")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  if (state.sort === "alpha") {
    out.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    out.sort((a, b) => (b.added < a.added ? -1 : b.added > a.added ? 1 : a.name.localeCompare(b.name)));
  }
  return out;
}

/* ---- rendering ---- */
function renderMeta() {
  const total = state.data.sites.length;
  const newCount = state.data.sites.filter(isNew).length;
  el("meta").innerHTML =
    `<strong>${total}</strong> sites indexed · <strong>${newCount}</strong> new in the ` +
    `last ${NEW_WINDOW_DAYS} days · updated ${escapeHtml(state.data.updated || "—")}`;
}

function renderFacets() {
  const counts = {};
  for (const f of FACET_ORDER) counts[f] = 0;
  for (const s of state.data.sites) for (const f of s.facets) counts[f]++;
  el("facets").innerHTML = FACET_ORDER.map((f) => {
    const desc = (state.data.facets && state.data.facets[f]) || "";
    const on = state.facets.has(f);
    return `<button class="chip" data-facet="${f}" aria-pressed="${on}" title="${escapeHtml(desc)}">${f}<span class="count">${counts[f]}</span></button>`;
  }).join("");
}

function renderTags() {
  const counts = {};
  for (const s of state.data.sites) for (const t of s.tags) counts[t] = (counts[t] || 0) + 1;
  const tags = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
  el("tags").innerHTML = tags
    .map((t) => {
      const on = state.tags.has(t);
      return `<button class="chip" data-tag="${t}" aria-pressed="${on}">#${escapeHtml(t)}<span class="count">${counts[t]}</span></button>`;
    })
    .join("");
}

function renderShowcase() {
  const recent = state.data.sites
    .filter(isNew)
    .sort((a, b) => (b.added < a.added ? -1 : 1))
    .slice(0, 8);
  const box = el("showcase");
  if (!recent.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  el("showcase-sub").textContent = `${recent.length} site(s) added in the last ${NEW_WINDOW_DAYS} days.`;
  el("showcase-row").innerHTML = recent
    .map(
      (s) =>
        `<div class="mini"><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.name)}</a><p>${escapeHtml(s.description)}</p></div>`
    )
    .join("");
}

function renderGrid() {
  const items = filtered();
  el("resultcount").textContent =
    `${items.length} of ${state.data.sites.length} sites` +
    (state.facets.size || state.tags.size || state.search ? " (filtered)" : "");
  const hasFilters = state.facets.size || state.tags.size || state.search;
  el("clear").hidden = !hasFilters;
  el("empty").hidden = items.length > 0;

  el("grid").innerHTML = items
    .map((s) => {
      const facets = s.facets
        .map((f) => `<span class="badge facet">${escapeHtml(f)}</span>`)
        .join("");
      const tags = s.tags
        .map((t) => `<span class="badge">#${escapeHtml(t)}</span>`)
        .join("");
      const flag = isNew(s) ? `<span class="new-flag">NEW</span>` : "";
      const host = (() => {
        try {
          return new URL(s.url).host;
        } catch {
          return s.url;
        }
      })();
      return `<article class="card">${flag}
        <h3><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.name)}</a></h3>
        <div class="url">${escapeHtml(host)}</div>
        <p class="desc">${escapeHtml(s.description)}</p>
        <div class="foot">${facets}${tags}</div>
      </article>`;
    })
    .join("");
}

function renderControls() {
  el("search").value = state.search;
  el("sort").value = state.sort;
}

function rerender() {
  renderFacets();
  renderTags();
  renderGrid();
}

/* ---- events ---- */
function wireEvents() {
  el("search").addEventListener("input", (e) => {
    state.search = e.target.value;
    writeHash();
    renderGrid();
  });
  el("sort").addEventListener("change", (e) => {
    state.sort = e.target.value;
    writeHash();
    renderGrid();
  });
  el("facets").addEventListener("click", (e) => {
    const b = e.target.closest("[data-facet]");
    if (!b) return;
    const f = b.dataset.facet;
    state.facets.has(f) ? state.facets.delete(f) : state.facets.add(f);
    writeHash();
    rerender();
  });
  el("tags").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tag]");
    if (!b) return;
    const t = b.dataset.tag;
    state.tags.has(t) ? state.tags.delete(t) : state.tags.add(t);
    writeHash();
    rerender();
  });
  el("clear").addEventListener("click", () => {
    state.search = "";
    state.facets.clear();
    state.tags.clear();
    writeHash();
    renderControls();
    rerender();
  });
}

async function main() {
  try {
    const res = await fetch("data/sites.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    state.data = await res.json();
  } catch (err) {
    el("meta").textContent =
      "Could not load the database. Serve this folder over HTTP (e.g. `python -m http.server`) rather than opening the file directly.";
    console.error(err);
    return;
  }
  readHash();
  renderControls();
  renderMeta();
  renderShowcase();
  rerender();
  wireEvents();
}

main();
