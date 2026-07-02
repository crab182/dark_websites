/* dark_websites portal — dependency-free.
 * Loads data/sites.json, renders a faceted, searchable reference grid plus a
 * "New finds" showcase. Filter state lives in the URL hash so views are
 * shareable. Favorites and theme persist in localStorage. */
"use strict";

const NEW_WINDOW_DAYS = 14;
const FACET_ORDER = ["obscure", "niche", "kitsch", "broad", "deep", "narrow"];
const LS_FAVS = "dw:favorites";
const LS_THEME = "dw:theme";

const state = {
  data: null,
  search: "",
  facets: new Set(), // AND across selected facets
  tags: new Set(), // AND across selected tags
  sort: "newest",
  favOnly: false,
  favs: new Set(),
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

/* ---- persistence ---- */
function loadFavs() {
  try {
    state.favs = new Set(JSON.parse(localStorage.getItem(LS_FAVS) || "[]"));
  } catch {
    state.favs = new Set();
  }
}
function saveFavs() {
  try {
    localStorage.setItem(LS_FAVS, JSON.stringify([...state.favs]));
  } catch {}
}
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  el("theme").textContent = theme === "light" ? "☀" : "◐";
}
function initTheme() {
  let theme = null;
  try {
    theme = localStorage.getItem(LS_THEME);
  } catch {}
  if (!theme) {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  applyTheme(theme);
}
function toggleTheme() {
  const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  applyTheme(next);
  try {
    localStorage.setItem(LS_THEME, next);
  } catch {}
}

/* ---- URL hash <-> state ---- */
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.search = p.get("q") || "";
  state.sort = p.get("sort") === "alpha" ? "alpha" : "newest";
  state.facets = new Set((p.get("facets") || "").split(",").filter(Boolean));
  state.tags = new Set((p.get("tags") || "").split(",").filter(Boolean));
  state.favOnly = p.get("fav") === "1";
}
function writeHash() {
  const p = new URLSearchParams();
  if (state.search) p.set("q", state.search);
  if (state.sort !== "newest") p.set("sort", state.sort);
  if (state.facets.size) p.set("facets", [...state.facets].join(","));
  if (state.tags.size) p.set("tags", [...state.tags].join(","));
  if (state.favOnly) p.set("fav", "1");
  const h = p.toString();
  history.replaceState(null, "", h ? "#" + h : location.pathname);
}

/* ---- filtering ---- */
function filtered() {
  const q = state.search.trim().toLowerCase();
  let out = state.data.sites.filter((s) => {
    if (state.favOnly && !state.favs.has(s.id)) return false;
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

function renderFavMeta() {
  el("favcount").textContent = state.favs.size;
  el("favonly").setAttribute("aria-pressed", String(state.favOnly));
}

function renderGrid() {
  const items = filtered();
  el("resultcount").textContent =
    `${items.length} of ${state.data.sites.length} sites` +
    (state.facets.size || state.tags.size || state.search || state.favOnly ? " (filtered)" : "");
  const hasFilters = state.facets.size || state.tags.size || state.search || state.favOnly;
  el("clear").hidden = !hasFilters;
  el("empty").hidden = items.length > 0;
  renderFavMeta();

  el("grid").innerHTML = items
    .map((s) => {
      const facets = s.facets
        .map((f) => `<span class="badge facet">${escapeHtml(f)}</span>`)
        .join("");
      const tags = s.tags
        .map((t) => `<span class="badge">#${escapeHtml(t)}</span>`)
        .join("");
      const flag = isNew(s) ? `<span class="new-flag">NEW</span>` : "";
      const faved = state.favs.has(s.id);
      const host = (() => {
        try {
          return new URL(s.url).host;
        } catch {
          return s.url;
        }
      })();
      return `<article class="card">${flag}
        <button class="fav" data-fav="${escapeHtml(s.id)}" aria-pressed="${faved}" title="${faved ? "Remove from" : "Add to"} favorites" aria-label="Toggle favorite">${faved ? "★" : "☆"}</button>
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

/* ---- actions ---- */
function surprise() {
  // Respect current filters; fall back to the whole database.
  let pool = filtered();
  if (!pool.length) pool = state.data.sites;
  if (!pool.length) return;
  // Weight toward the more obscure so discovery favors the hidden corners.
  const weight = (s) =>
    1 + (s.facets.includes("obscure") ? 2 : 0) + (s.facets.includes("niche") ? 1 : 0);
  const total = pool.reduce((n, s) => n + weight(s), 0);
  let r = Math.random() * total;
  const pick = pool.find((s) => (r -= weight(s)) < 0) || pool[0];
  window.open(pick.url, "_blank", "noopener");
}

function toggleFav(id) {
  state.favs.has(id) ? state.favs.delete(id) : state.favs.add(id);
  saveFavs();
  renderGrid();
}

function clearFilters() {
  state.search = "";
  state.facets.clear();
  state.tags.clear();
  state.favOnly = false;
  writeHash();
  renderControls();
  rerender();
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
  el("surprise").addEventListener("click", surprise);
  el("theme").addEventListener("click", toggleTheme);
  el("favonly").addEventListener("click", () => {
    state.favOnly = !state.favOnly;
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
  el("grid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-fav]");
    if (!b) return;
    toggleFav(b.dataset.fav);
  });
  el("clear").addEventListener("click", clearFilters);

  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !typing) {
      e.preventDefault();
      el("search").focus();
    } else if (e.key === "Escape") {
      if (typing) document.activeElement.blur();
      clearFilters();
    } else if (e.key === "r" && !typing) {
      surprise();
    } else if (e.key === "f" && !typing) {
      state.favOnly = !state.favOnly;
      writeHash();
      renderGrid();
    }
  });
}

async function main() {
  initTheme();
  loadFavs();
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
