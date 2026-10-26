/*
  Chart Decoder — Phase 1 game engine
  ------------------------------------
  Reads terms from content/terms.csv (exported from the master term list).
  If the CSV can't be loaded (e.g. the page was opened straight from disk
  instead of through Live Server), it falls back to content/terms-fallback.js.

  Progress is saved in the player's own browser (localStorage). No accounts.
*/
(function () {
  "use strict";

  // ---------- Settings you can tweak ----------
  const CONFIG = {
    termsUrl: "content/terms.csv",
    roundSize: 10,            // questions per decoder round
    levelUpAt: 0.8,           // share correct (first try) needed to move up a level
    reviewShare: 0.2,         // share of each round drawn from earlier levels
    reverseShare: 0.3,        // share of questions shown definition-first
    gridSize: 8,              // terms per grid-sort board
    includeStatuses: null,    // e.g. ["Verified"] to hide drafts; null = show all
    storageKey: "chartDecoderP1.v1",
    minTermsPerCondition: 8   // a condition appears once it has this many of its own terms
  };
  const LEVELS = ["Basic", "Intermediate", "Advanced"];
  const CATEGORIES = ["Disease", "Medication", "Sign / symptom", "Lab / test", "Abbreviation"];

  const app = document.getElementById("app");
  const live = document.getElementById("live");

  let TERMS = [];
  let CONDITIONS = [];
  let session = null;

  // ---------- Storage (wrapped: private windows can block it) ----------
  function loadStore() {
    try {
      const raw = window.localStorage.getItem(CONFIG.storageKey);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return { ui: {}, cond: {}, term: {}, bootcamp: {} };
  }
  let store = loadStore();
  store.ui = store.ui || {}; store.cond = store.cond || {}; store.term = store.term || {}; store.bootcamp = store.bootcamp || {};
  function save() {
    try { window.localStorage.setItem(CONFIG.storageKey, JSON.stringify(store)); } catch (e) { /* ignore */ }
  }
  function condState(c) {
    if (!store.cond[c]) store.cond[c] = { level: 0, cleared: [false, false, false], best: { decoder: 0, grid: 0 } };
    return store.cond[c];
  }
  function termStats(id) {
    if (!store.term[id]) store.term[id] = { seen: 0, right: 0, miss: 0 };
    return store.term[id];
  }

  // ---------- Helpers ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function announce(msg) { live.textContent = ""; setTimeout(() => { live.textContent = msg; }, 30); }
  function weightOf(t) {
    const s = store.term[t.id] || { right: 0, miss: 0 };
    return Math.min(6, Math.max(0.4, 1 + 2 * s.miss - 0.3 * s.right));
  }
  function weightedSample(items, n) {
    const pool = items.slice(); const out = [];
    while (out.length < n && pool.length) {
      const total = pool.reduce((sum, t) => sum + weightOf(t), 0);
      let r = Math.random() * total; let idx = 0;
      for (; idx < pool.length; idx++) { r -= weightOf(pool[idx]); if (r <= 0) break; }
      out.push(pool.splice(Math.min(idx, pool.length - 1), 1)[0]);
    }
    return out;
  }
  function stableKey(term) { return term.term.toLowerCase().replace(/[^a-z0-9]+/g, "-"); }

  // ---------- CSV ----------
  function parseCSV(text) {
    const rows = []; let row = []; let field = ""; let q = false;
    text = text.replace(/^﻿/, "");
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.some((c) => c.trim() !== "")) rows.push(row);
        row = [];
      } else field += ch;
    }
    row.push(field);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    return rows;
  }
  const HEADERS = {
    term: "term", condition: "condition", category: "category", level: "level",
    definition: "plain-language definition", example: "example from a note", source: "source",
    related: "related term", relationship: "relationship", status: "status"
  };
  function rowsToTerms(rows) {
    if (!rows.length) return [];
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = {};
    Object.keys(HEADERS).forEach((k) => { col[k] = head.indexOf(HEADERS[k]); });
    const get = (r, k) => (col[k] >= 0 && r[col[k]] != null ? String(r[col[k]]).trim() : "");
    const out = [];
    rows.slice(1).forEach((r) => {
      const term = get(r, "term"); const definition = get(r, "definition");
      if (!term || !definition) return;
      const levelRaw = get(r, "level").toLowerCase();
      const levelIdx = Math.max(0, LEVELS.findIndex((l) => l.toLowerCase() === levelRaw));
      const status = get(r, "status");
      if (CONFIG.includeStatuses && !CONFIG.includeStatuses.includes(status)) return;
      const t = {
        term, definition,
        conditions: get(r, "condition").split(",").map((s) => s.trim()).filter(Boolean),
        category: get(r, "category") || "Other",
        levelIdx,
        example: get(r, "example"), source: get(r, "source"),
        related: get(r, "related"), relationship: get(r, "relationship"), status
      };
      if (!t.conditions.length) t.conditions = ["All"];
      t.id = stableKey(t);
      out.push(t);
    });
    return out;
  }
  async function loadTerms() {
    try {
      const res = await fetch(CONFIG.termsUrl, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const terms = rowsToTerms(parseCSV(await res.text()));
      if (terms.length) return terms;
      throw new Error("empty");
    } catch (e) {
      return window.FALLBACK_TERMS_CSV ? rowsToTerms(parseCSV(window.FALLBACK_TERMS_CSV)) : [];
    }
  }

  // ---------- Term queries ----------
  const inCond = (t, c) => t.conditions.includes(c) || t.conditions.includes("All");
  function pool(cond, levelIdx, category) {
    return TERMS.filter((t) => inCond(t, cond) && t.levelIdx === levelIdx && (category === "All" || t.category === category));
  }
  function distractors(target, field, n) {
    const seen = new Set([target[field].toLowerCase()]);
    const same = shuffle(TERMS.filter((t) => t !== target && t.category === target.category));
    const rest = shuffle(TERMS.filter((t) => t !== target && t.category !== target.category));
    const out = [];
    for (const t of same.concat(rest)) {
      const v = t[field]; if (!v || seen.has(v.toLowerCase())) continue;
      seen.add(v.toLowerCase()); out.push(v);
      if (out.length === n) break;
    }
    return out;
  }
  function highlight(example, term) {
    const base = term.term.replace(/\s*\(.*\)\s*$/, "").trim();
    const inside = (term.term.match(/\(([^)]+)\)/) || [])[1] || "";
    const needles = inside.split("/").map((s) => s.trim()).filter(Boolean).concat([base]);
    let html = esc(example);
    for (const n of needles) {
      const re = new RegExp(esc(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      if (re.test(html)) { return html.replace(re, (m) => "<mark>" + m + "</mark>"); }
    }
    return html;
  }

  // ---------- Rendering ----------
  function render(html, focusSel) {
    app.innerHTML = html;
    const el = focusSel ? app.querySelector(focusSel) : app.querySelector("h1, h2");
    if (el) {
      if (!el.hasAttribute("tabindex") && /^H\d$/.test(el.tagName)) el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: focusSel ? true : false });
    }
    if (!focusSel) window.scrollTo(0, 0);
  }

  // ---------- Home ----------
  function homeView() {
    session = null;
    const ui = store.ui;
    if (!ui.condition || !CONDITIONS.includes(ui.condition)) ui.condition = CONDITIONS.includes("HTN") ? "HTN" : CONDITIONS[0];
    ui.category = ui.category || "All";
    ui.practice = ui.practice || "auto";
    const c = ui.condition; const cs = condState(c);
    const units = window.BOOTCAMP ? window.BOOTCAMP.units : [];
    const doneUnits = units.filter((u) => store.bootcamp[u.id] && store.bootcamp[u.id].done).length;
    const playLevel = ui.practice === "auto" ? cs.level : Number(ui.practice);
    const available = pool(c, playLevel, ui.category).length;
    const gridCats = new Set(TERMS.filter((t) => inCond(t, c) && t.levelIdx <= playLevel).map((t) => t.category));

    const pips = LEVELS.map((l, i) => {
      const cls = cs.cleared[i] ? "done" : i === cs.level ? "current" : "";
      const label = cs.cleared[i] ? l + " ✓" : l;
      return `<div class="level-pip ${cls}">${esc(label)}</div>`;
    }).join("");

    const condChips = CONDITIONS.map((x) => `<button type="button" class="chip" data-action="cond" data-value="${esc(x)}" aria-pressed="${x === c}">${esc(x)}</button>`).join("");
    const catOpts = ["All"].concat(CATEGORIES.filter((k) => TERMS.some((t) => t.category === k))).map((k) => `<option value="${esc(k)}" ${k === ui.category ? "selected" : ""}>${k === "All" ? "All categories" : esc(k)}</option>`).join("");
    const lvlOpts = [`<option value="auto" ${ui.practice === "auto" ? "selected" : ""}>My level (${LEVELS[cs.level]})</option>`]
      .concat(LEVELS.map((l, i) => `<option value="${i}" ${String(i) === ui.practice ? "selected" : ""}>Practice ${l} only</option>`)).join("");

    render(`
      <p class="eyebrow">Learn the language of the chart</p>
      <h1>Chart Decoder</h1>
      <p class="lede">Decode the terms you'll meet in clinical notes and health data, one condition at a time. Built for health informatics students and IT professionals new to health.</p>

      <div class="card tint">
        <div class="section-head" style="margin-bottom:6px">
          <h2>${doneUnits === units.length && units.length ? "Bootcamp complete" : "New here? Start with the bootcamp"}</h2>
          <span class="badge ${doneUnits === units.length ? "good" : ""}">${doneUnits} of ${units.length} units</span>
        </div>
        <p class="muted" style="margin:0 0 14px">A quick warm-up on word parts, abbreviations and how a note is organized. Optional: skip it if you know the basics.</p>
        <button type="button" class="btn ${doneUnits ? "" : "primary"}" data-action="bootcamp">${doneUnits ? "Review the bootcamp" : "Start the bootcamp"}</button>
      </div>

      <section class="section" aria-labelledby="play-h">
        <div class="section-head"><h2 id="play-h">Play</h2></div>
        <div class="card stack">
          <div>
            <p class="small" style="margin:0 0 8px;font-weight:600">Choose a condition</p>
            <div class="row" role="group" aria-label="Condition">${condChips}</div>
          </div>
          <div>
            <p class="small" style="margin:0 0 4px;font-weight:600">Your level in ${esc(c)}</p>
            <div class="levels">${pips}</div>
          </div>
          <div class="filters">
            <div class="field"><label for="f-cat">Category</label><select id="f-cat" data-action="cat">${catOpts}</select></div>
            <div class="field"><label for="f-lvl">Level</label><select id="f-lvl" data-action="practice">${lvlOpts}</select></div>
          </div>
          <div class="bests"><span>Best decoder score: <strong>${cs.best.decoder || 0}</strong></span><span>Best grid sort: <strong>${cs.best.grid || 0}%</strong></span></div>
        </div>

        <div class="grid-2" style="margin-top:16px">
          <button type="button" class="mode-card" data-action="start-decoder" ${available ? "" : "disabled"}>
            <span class="tag">Mode 1</span>
            <h3>Decoder</h3>
            <span class="muted small">See a term in a real chart line and pick what it means. Score ${Math.round(CONFIG.levelUpAt * 100)}% or better to move up a level.</span>
            ${available ? `<span class="small">${available} ${LEVELS[playLevel].toLowerCase()} terms ready</span>` : `<span class="small">No ${LEVELS[playLevel].toLowerCase()} ${ui.category === "All" ? "" : esc(ui.category.toLowerCase()) + " "}terms yet. Try another filter.</span>`}
          </button>
          <button type="button" class="mode-card" data-action="start-grid" ${gridCats.size >= 2 ? "" : "disabled"}>
            <span class="tag">Mode 2</span>
            <h3>Grid sort</h3>
            <span class="muted small">Sort terms into categories: what's the disease, what's the medication, what's the lab? Uses every category up to your level.</span>
          </button>
        </div>
      </section>
    `);
    save();
  }

  // ---------- Bootcamp ----------
  function bootcampView() {
    session = null;
    const units = window.BOOTCAMP.units;
    const cards = units.map((u, i) => {
      const st = store.bootcamp[u.id];
      const badge = st && st.done ? `<span class="badge good">Complete · ${st.best}%</span>` : st ? `<span class="badge">Best ${st.best}%</span>` : `<span class="badge">Not started</span>`;
      return `<div class="card stack" style="gap:10px">
        <div class="section-head" style="margin:0"><h3>${i + 1}. ${esc(u.title)}</h3>${badge}</div>
        <p class="muted small" style="margin:0">${esc(u.blurb)}</p>
        <div class="row"><button type="button" class="btn" data-action="study" data-value="${esc(u.id)}">Study</button><button type="button" class="btn primary" data-action="quiz" data-value="${esc(u.id)}">Quick quiz</button></div>
      </div>`;
    }).join("");
    render(`
      <p class="eyebrow">Bootcamp</p>
      <h1>Foundations warm-up</h1>
      <p class="lede">Three short units that work for every condition. Study the cards, then take a quick quiz. Score ${Math.round(window.BOOTCAMP.passMark * 100)}% to complete a unit.</p>
      <div class="stack">${cards}</div>
      <div class="actions"><button type="button" class="btn ghost" data-action="home">Back to home</button></div>
    `);
  }
  function unitItems(u) {
    let items = u.items.slice();
    if (u.id === "abbreviations") {
      const extra = TERMS.filter((t) => t.category === "Abbreviation" && t.conditions.includes("All"))
        .map((t) => ({ part: t.term, meaning: t.definition, example: t.example }));
      const have = new Set(items.map((i) => i.part.toLowerCase()));
      extra.forEach((e) => { if (!have.has(e.part.toLowerCase())) { items.push(e); have.add(e.part.toLowerCase()); } });
    }
    return items;
  }
  function studyView(unitId) {
    const u = window.BOOTCAMP.units.find((x) => x.id === unitId);
    const cards = unitItems(u).map((it) => `<div class="study"><div class="part">${esc(it.part)}</div><p class="meaning">${esc(it.meaning)}</p>${it.example ? `<div class="ex">${u.quizStyle === "section" ? "e.g. " : "e.g. "}${esc(it.example)}</div>` : ""}</div>`).join("");
    render(`
      <p class="eyebrow">Bootcamp · Study</p>
      <h1>${esc(u.title)}</h1>
      <p class="lede">${esc(u.blurb)}</p>
      <div class="study-grid">${cards}</div>
      <div class="actions"><button type="button" class="btn primary" data-action="quiz" data-value="${esc(u.id)}">I'm ready: quick quiz</button><button type="button" class="btn ghost" data-action="bootcamp">Back to bootcamp</button></div>
    `);
  }
  function startBootcampQuiz(unitId) {
    const u = window.BOOTCAMP.units.find((x) => x.id === unitId);
    const items = unitItems(u);
    const picks = shuffle(items).slice(0, Math.min(8, items.length));
    const questions = picks.map((it) => {
      const others = shuffle(items.filter((o) => o !== it));
      if (u.quizStyle === "section") {
        return {
          prompt: "Which section of the note would this line most likely appear in?",
          contextHtml: `<span class="label">Chart line</span>${esc(it.example)}`,
          options: shuffle([{ label: it.part, correct: true }].concat(others.slice(0, 3).map((o) => ({ label: o.part, correct: false })))),
          explainTitle: it.part, explainText: it.meaning
        };
      }
      const reverse = Math.random() < 0.3;
      return reverse ? {
        prompt: "Which one means…", headline: it.meaning, headlineStyle: "def",
        options: shuffle([{ label: it.part, correct: true }].concat(others.slice(0, 3).map((o) => ({ label: o.part, correct: false })))),
        explainTitle: it.part, explainText: it.meaning + (it.example ? ` (e.g. ${it.example})` : "")
      } : {
        prompt: "What does this mean?", headline: it.part, headlineStyle: "term",
        options: shuffle([{ label: it.meaning, correct: true }].concat(others.slice(0, 3).map((o) => ({ label: o.meaning, correct: false })))),
        explainTitle: it.part, explainText: it.meaning + (it.example ? ` (e.g. ${it.example})` : "")
      };
    });
    session = { type: "bootcamp", unitId, title: u.title, questions, index: 0, firstTotal: 0, firstCorrect: 0, streak: 0, points: 0, answered: null, misses: [] };
    questionView();
  }

  // ---------- Decoder ----------
  function makeDecoderQuestion(t, isReview) {
    const reverse = !isReview && Math.random() < CONFIG.reverseShare;
    const field = reverse ? "term" : "definition";
    const opts = shuffle([{ label: t[field], correct: true }].concat(distractors(t, field, 3).map((v) => ({ label: v, correct: false }))));
    const relatedLine = t.related && t.relationship ? `${t.term} · ${t.relationship.toLowerCase()} · ${t.related}` : "";
    return {
      term: t, review: !!isReview,
      prompt: reverse ? "Which term matches this definition?" : "What does this term mean?",
      headline: reverse ? t.definition : t.term, headlineStyle: reverse ? "def" : "term",
      contextHtml: !reverse && t.example ? `<span class="label">In a chart</span>${highlight(t.example, t)}` : "",
      afterHtml: reverse && t.example ? `<span class="label">In a chart</span>${highlight(t.example, t)}` : "",
      options: opts,
      explainTitle: t.term, explainText: t.definition, relatedLine,
      source: t.source
    };
  }
  function startDecoder() {
    const ui = store.ui; const c = ui.condition; const cs = condState(c);
    const auto = ui.practice === "auto";
    const levelIdx = auto ? cs.level : Number(ui.practice);
    const main = pool(c, levelIdx, ui.category);
    const lower = TERMS.filter((t) => inCond(t, c) && t.levelIdx < levelIdx && (ui.category === "All" || t.category === ui.category));
    const reviewWanted = lower.length ? Math.ceil(CONFIG.roundSize * CONFIG.reviewShare) : 0;
    const mainPick = weightedSample(main, Math.min(main.length, CONFIG.roundSize - reviewWanted));
    const reviewPick = weightedSample(lower, Math.min(lower.length, CONFIG.roundSize - mainPick.length));
    const picks = shuffle(mainPick.concat(reviewPick));
    const questions = picks.map((t) => {
      const q = makeDecoderQuestion(t, false);
      if (t.levelIdx < levelIdx) q.tag = "Review";
      return q;
    });
    session = { type: "decoder", condition: c, levelIdx, auto, category: ui.category, questions, index: 0, firstTotal: 0, firstCorrect: 0, streak: 0, points: 0, answered: null, misses: [] };
    questionView();
  }

  // ---------- Shared question screen ----------
  function questionView() {
    const s = session; const q = s.questions[s.index];
    const firstCount = s.questions.filter((x) => !x.review).length;
    const firstDone = s.questions.slice(0, s.index).filter((x) => !x.review).length;
    const pct = Math.round((s.index / s.questions.length) * 100);
    const tags = [];
    if (s.type === "decoder") {
      tags.push(`<span class="badge">${esc(s.condition)} · ${LEVELS[s.levelIdx]}</span>`);
      if (q.term) tags.push(`<span class="badge">${esc(q.term.category)}</span>`);
      if (q.review) tags.push(`<span class="badge">Try again</span>`);
      else if (q.tag) tags.push(`<span class="badge">${esc(q.tag)}</span>`);
    } else tags.push(`<span class="badge">Bootcamp · ${esc(s.title)}</span>`);

    const answered = s.answered;
    const opts = q.options.map((o, i) => {
      let cls = "";
      if (answered) { if (o.correct) cls = "correct"; else if (answered.choice === i) cls = "wrong"; }
      return `<button type="button" class="option ${cls}" data-action="answer" data-value="${i}" ${answered ? "disabled" : ""}><span class="key" aria-hidden="true">${i + 1}</span><span>${esc(o.label)}</span></button>`;
    }).join("");

    let fb = "";
    if (answered) {
      const ok = answered.correct;
      fb = `<div class="feedback ${ok ? "good" : "bad"}" role="status">
        <h3>${ok ? "Correct" : "Not quite"}</h3>
        <p><strong>${esc(q.explainTitle)}</strong>: ${esc(q.explainText)}</p>
        ${q.afterHtml ? `<p class="chart-line" style="margin:10px 0 0">${q.afterHtml}</p>` : ""}
        ${q.relatedLine ? `<p class="related">Related: ${esc(q.relatedLine)}</p>` : ""}
        ${q.source ? `<p class="related">Source: ${esc(q.source)}</p>` : ""}
        ${!ok && s.type === "decoder" && !q.review ? `<p class="related">You'll see this one again later in the round.</p>` : ""}
      </div>
      <div class="actions"><button type="button" class="btn primary" data-action="next" id="next-btn">${s.index + 1 < s.questions.length ? "Next" : "See results"}</button></div>`;
    }

    render(`
      <div class="progress"><div class="bar" role="progressbar" aria-label="Round progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div><span class="count">${Math.min(firstDone + (q.review ? 0 : 1), firstCount)} / ${firstCount}</span></div>
      <div class="card q-card">
        <div class="q-meta">${tags.join("")}</div>
        <p class="q-prompt">${esc(q.prompt)}</p>
        ${q.headline ? `<h2 class="${q.headlineStyle === "def" ? "q-def" : "q-term"}">${esc(q.headline)}</h2>` : `<h2 class="visually-hidden">Question ${s.index + 1}</h2>`}
        ${q.contextHtml ? `<p class="chart-line">${q.contextHtml}</p>` : ""}
        <div class="options" role="group" aria-label="Answer choices">${opts}</div>
        ${fb}
      </div>
      <div class="actions"><button type="button" class="btn ghost" data-action="${s.type === "bootcamp" ? "bootcamp" : "home"}">Quit round</button></div>
    `, answered ? "#next-btn" : null);
  }
  function answer(choice) {
    const s = session; if (!s || s.answered) return;
    const q = s.questions[s.index]; const opt = q.options[choice]; if (!opt) return;
    const correct = !!opt.correct;
    s.answered = { choice, correct };
    if (!q.review) {
      s.firstTotal++;
      if (correct) { s.firstCorrect++; s.streak++; s.points += 10 + 5 * Math.min(s.streak - 1, 4); }
      else { s.streak = 0; s.misses.push(q); }
    }
    if (s.type === "decoder" && q.term) {
      const st = termStats(q.term.id); st.seen++;
      if (correct) st.right++; else st.miss++;
      if (!correct && !q.review) {
        const again = makeDecoderQuestion(q.term, true);
        const at = Math.min(s.questions.length, s.index + 3);
        s.questions.splice(at, 0, again);
      }
      save();
    }
    announce(correct ? "Correct." : "Not quite. The answer is " + q.options.find((o) => o.correct).label);
    questionView();
  }
  function next() {
    const s = session; if (!s) return;
    s.answered = null; s.index++;
    if (s.index >= s.questions.length) resultsView(); else questionView();
  }

  // ---------- Results ----------
  function resultsView() {
    const s = session;
    const acc = s.firstTotal ? s.firstCorrect / s.firstTotal : 0;
    const pctAcc = Math.round(acc * 100);
    let banner = "";
    if (s.type === "bootcamp") {
      const prev = store.bootcamp[s.unitId] || { best: 0, done: false };
      const done = prev.done || acc >= window.BOOTCAMP.passMark;
      store.bootcamp[s.unitId] = { best: Math.max(prev.best, pctAcc), done };
      if (acc >= window.BOOTCAMP.passMark) banner = `<div class="levelup">Unit complete. Nice work.</div>`;
    } else {
      const cs = condState(s.condition);
      cs.best.decoder = Math.max(cs.best.decoder || 0, s.points);
      if (acc >= CONFIG.levelUpAt && s.firstTotal >= 4) {
        cs.cleared[s.levelIdx] = true;
        if (s.auto && s.levelIdx === cs.level && cs.level < LEVELS.length - 1) {
          cs.level++;
          banner = `<div class="levelup">Level up! You've unlocked ${LEVELS[cs.level]} ${esc(s.condition)} terms.</div>`;
        } else if (s.levelIdx === LEVELS.length - 1) {
          banner = `<div class="levelup">You've cleared Advanced ${esc(s.condition)}. Keep practicing to stay sharp.</div>`;
        }
      } else if (s.auto) {
        banner = `<p class="muted">Score ${Math.round(CONFIG.levelUpAt * 100)}% or better on a round to move up a level.</p>`;
      }
    }
    save();
    const seen = new Set();
    const misses = s.misses.filter((q) => { const k = q.explainTitle; if (seen.has(k)) return false; seen.add(k); return true; });
    const missHtml = misses.length ? `<div class="section"><h2>Worth another look</h2><ul class="miss-list">${misses.map((q) => `<li><strong>${esc(q.explainTitle)}</strong>${esc(q.explainText)}</li>`).join("")}</ul></div>` : "";
    render(`
      <p class="eyebrow">${s.type === "bootcamp" ? "Bootcamp · " + esc(s.title) : esc(s.condition) + " · " + LEVELS[s.levelIdx]}</p>
      <h1>Round complete</h1>
      <div class="card">
        <p class="muted" style="margin:0">First-try accuracy</p>
        <p class="score-big">${s.firstCorrect} / ${s.firstTotal}</p>
        ${s.type === "decoder" ? `<p class="muted" style="margin:0">${s.points} points</p>` : ""}
        ${banner}
      </div>
      ${missHtml}
      <div class="actions">
        ${s.type === "bootcamp"
          ? `<button type="button" class="btn primary" data-action="bootcamp">Back to bootcamp</button><button type="button" class="btn" data-action="quiz" data-value="${esc(s.unitId)}">Try again</button>`
          : `<button type="button" class="btn primary" data-action="start-decoder">Play another round</button><button type="button" class="btn" data-action="home">Home</button>`}
      </div>
    `);
  }

  // ---------- Grid sort ----------
  function startGrid() {
    const ui = store.ui; const c = ui.condition; const cs = condState(c);
    const levelIdx = ui.practice === "auto" ? cs.level : Number(ui.practice);
    const candidates = TERMS.filter((t) => inCond(t, c) && t.levelIdx <= levelIdx);
    const byCat = {};
    candidates.forEach((t) => { (byCat[t.category] = byCat[t.category] || []).push(t); });
    const cats = Object.keys(byCat);
    const picked = [];
    const queues = {};
    cats.forEach((k) => { queues[k] = weightedSample(byCat[k], byCat[k].length); });
    let progress = true;
    while (picked.length < CONFIG.gridSize && progress) {
      progress = false;
      for (const k of shuffle(cats)) {
        if (picked.length >= CONFIG.gridSize) break;
        if (queues[k].length) { picked.push(queues[k].shift()); progress = true; }
      }
    }
    const bins = CATEGORIES.filter((k) => picked.some((t) => t.category === k)).concat(cats.filter((k) => !CATEGORIES.includes(k) && picked.some((t) => t.category === k)));
    session = { type: "grid", condition: c, levelIdx, terms: shuffle(picked), bins, place: {}, selected: null, checked: false, correct: 0 };
    gridView();
  }
  function gridView(focusSel) {
    const s = session;
    const chip = (t, inBin) => {
      let cls = ""; let suffix = "";
      if (s.checked) {
        const ok = s.place[t.id] === t.category;
        cls = ok ? "correct" : "wrong";
        if (!ok) suffix = ` → ${t.category}`;
      }
      const pressed = s.selected === t.id;
      const label = s.checked ? `${t.term}${suffix}` : t.term;
      return `<button type="button" class="term-chip ${cls}" data-action="${inBin ? "unplace" : "pick"}" data-value="${esc(t.id)}" aria-pressed="${pressed}" ${s.checked ? "disabled" : ""}>${esc(label)}</button>`;
    };
    const tray = s.terms.filter((t) => !s.place[t.id]);
    const bins = s.bins.map((b) => {
      const items = s.terms.filter((t) => s.place[t.id] === b);
      return `<div class="bin ${s.selected && !s.checked ? "armed" : ""}">
        <button type="button" class="bin-head" data-action="place" data-value="${esc(b)}" ${s.checked ? "disabled" : ""} aria-label="Place in ${esc(b)}">${esc(b)}</button>
        <div class="bin-items">${items.map((t) => chip(t, true)).join("")}</div>
      </div>`;
    }).join("");
    let footer;
    if (s.checked) {
      const pct = Math.round((s.correct / s.terms.length) * 100);
      footer = `<div class="feedback ${pct >= 80 ? "good" : "bad"}" role="status"><h3>${s.correct} of ${s.terms.length} sorted correctly (${pct}%)</h3><p>Terms in red show where they belong.</p></div>
        <div class="actions"><button type="button" class="btn primary" data-action="start-grid" id="grid-next">New board</button><button type="button" class="btn" data-action="home">Home</button></div>`;
    } else {
      footer = `<div class="actions"><button type="button" class="btn primary" data-action="check-grid" ${tray.length ? "disabled" : ""}>Check my sort</button><button type="button" class="btn ghost" data-action="home">Quit</button></div>`;
    }
    render(`
      <p class="eyebrow">Grid sort · ${esc(s.condition)} · up to ${LEVELS[s.levelIdx]}</p>
      <h1>Sort each term</h1>
      <p class="muted" style="margin:0 0 16px">Select a term, then select the category it belongs to. Select a placed term to send it back.</p>
      <div class="tray" role="group" aria-label="Terms to sort">${tray.length ? tray.map((t) => chip(t, false)).join("") : `<span class="muted small">All terms placed${s.checked ? "" : ". Check your sort when ready."}</span>`}</div>
      <div class="bins">${bins}</div>
      ${footer}
    `, focusSel || null);
  }
  function checkGrid() {
    const s = session;
    s.checked = true; s.selected = null;
    s.correct = s.terms.filter((t) => s.place[t.id] === t.category).length;
    s.terms.forEach((t) => { const st = termStats(t.id); st.seen++; if (s.place[t.id] === t.category) st.right++; else st.miss++; });
    const cs = condState(s.condition);
    cs.best.grid = Math.max(cs.best.grid || 0, Math.round((s.correct / s.terms.length) * 100));
    save();
    announce(`${s.correct} of ${s.terms.length} sorted correctly.`);
    gridView("#grid-next");
  }

  // ---------- Events ----------
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || el.tagName === "SELECT" || el.disabled) return;
    const a = el.dataset.action; const v = el.dataset.value;
    switch (a) {
      case "home": homeView(); break;
      case "bootcamp": bootcampView(); break;
      case "study": studyView(v); break;
      case "quiz": startBootcampQuiz(v); break;
      case "cond": store.ui.condition = v; homeView(); break;
      case "start-decoder": startDecoder(); break;
      case "answer": answer(Number(v)); break;
      case "next": next(); break;
      case "start-grid": startGrid(); break;
      case "pick":
        session.selected = session.selected === v ? null : v;
        if (session.selected) announce(`Selected ${session.terms.find((t) => t.id === v).term}. Now choose a category.`);
        gridView(session.selected ? ".bin-head" : null); break;
      case "place":
        if (!session.selected) { announce("Select a term first."); break; }
        session.place[session.selected] = v; session.selected = null;
        gridView(".tray .term-chip, [data-action='check-grid']"); break;
      case "unplace":
        delete session.place[v]; session.selected = null; gridView(".tray .term-chip"); break;
      case "check-grid": checkGrid(); break;
    }
  });
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.action === "cat") { store.ui.category = el.value; homeView(); app.querySelector("#f-cat").focus(); }
    if (el.dataset.action === "practice") { store.ui.practice = el.value; homeView(); app.querySelector("#f-lvl").focus(); }
  });
  document.addEventListener("keydown", (e) => {
    if (!session || session.type === "grid") return;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
    if (!session.answered && /^[1-4]$/.test(e.key)) { e.preventDefault(); answer(Number(e.key) - 1); }
  });

  // ---------- Start ----------
  loadTerms().then((terms) => {
    TERMS = terms;
    CONDITIONS = Array.from(new Set(TERMS.flatMap((t) => t.conditions).filter((c) => c !== "All")))
      .filter((c) => TERMS.filter((t) => t.conditions.includes(c)).length >= CONFIG.minTermsPerCondition).sort();
    if (!TERMS.length || !CONDITIONS.length) {
      render(`<h1>No terms found</h1><p class="lede">Add rows to content/terms.csv (exported from the master term list) and reload.</p>`);
      return;
    }
    homeView();
  });
})();
