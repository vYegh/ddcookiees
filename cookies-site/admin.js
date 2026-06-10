/* ============================================================
   Cookies by DD & Alexa — "The Bake Book" order tracker
   Reads & updates orders stored in the Google Sheet via the
   Apps Script web app (see apps-script.gs / SETUP.md).
   One responsive page: desktop rail + agenda, app-style mobile.
   ============================================================ */

// ====== CONFIG — must match apps-script.gs (same as orders.js) ======
const ENDPOINT = "https://script.google.com/macros/s/AKfycbz9SdN4JkJEzmtgA1u00I6vry-_hgt5VdJYqDNPohTWZ7ZxaqPMT1Sjmx9F6x7bIaGbsA/exec";
const TOKEN    = "iW53FSjgO4c8ptJmZFkIXLQ55cYNjRQe";
const VIEW_PASSWORD = "cookies";
// ====================================================================

/* ---------- workflow ----------
   Sheet "Status" values: New, Confirmed, Baking, Ready, Done.
   An order only files into Past orders once it is BOTH Done and Paid. */
const FLOW = ["new", "confirmed", "baking", "ready", "done"];
const META = {
  new:       { label: "New",       sheet: "New",       cls: "st-new" },
  confirmed: { label: "Confirmed", sheet: "Confirmed", cls: "st-confirmed" },
  baking:    { label: "Baking",    sheet: "Baking",    cls: "st-baking" },
  ready:     { label: "Ready",     sheet: "Ready",     cls: "st-ready" },
  done:      { label: "Done",      sheet: "Done",      cls: "st-done" },
};
function statusId(v){
  const s = String(v || "New").trim().toLowerCase();
  if (s === "completed") return "done";
  return FLOW.includes(s) ? s : "new";
}
const isPast = o => o.status === "done" && o.paid;

/* ---------- flavor catalog (mirrors the storefront, script.js) ---------- */
const FLAVORS = [
  { id:"chocchip",   name:"Chocolate Chip",            price:3 },
  { id:"monster",    name:"Cookie Monster",            price:4 },
  { id:"cinnamon",   name:"Cinnamon Toast Crunch",     price:4 },
  { id:"lemon",      name:"Lemon Cookie",              price:3 },
  { id:"fruity",     name:"Fruity Pebbles",            price:4 },
  { id:"birthday",   name:"Birthday Cake",             price:4 },
  { id:"strawberry", name:"Strawberry Crunch",         price:4 },
  { id:"redvelvet",  name:"Red Velvet",                price:4 },
  { id:"cookiescream",name:"Oreo / Cookies & Cream",   price:4 },
  { id:"smores",     name:"S'mores",                   price:4 },
  { id:"caramel",    name:"Salted Caramel Cheesecake", price:5 },
  { id:"dubai",      name:"Dubai Chocolate (Brownie)", price:5 },
  { id:"dubaicookie",name:"Dubai Chocolate (Cookie)",  price:5, img:"dubai" },
  { id:"custom",     name:"Custom Cookie",             price:6, img:null },
];
const FLAVOR_BY_NAME = Object.fromEntries(FLAVORS.map(f => [f.name.toLowerCase(), f]));
function flavorImg(f){
  if (!f) return "assets/logo.png";
  if (f.img === null) return "assets/logo.png";
  return `assets/flavors/${f.img || f.id}.png`;
}

const METHODS = {
  delivery: { label:"Delivery", icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M1 16V6a1 1 0 0 1 1-1h11v11M13 8h4l3 4v4M5.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm12 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM7 16h7"/></svg>' },
  pickup:   { label:"Pickup",   icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l1 12H5L6 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>' },
  catering: { label:"Catering", icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7H4v4h16V7Z"/><path d="M5 11v9h14v-9M12 7v13M12 7s-1.5-4-4-4-1.5 4 4 4Zm0 0s1.5-4 4-4 1.5 4-4 4Z"/></svg>' },
};

/* ---------- tiny helpers ---------- */
function esc(s){
  return String(s == null ? "" : s)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
const startOfDay = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const money = n => "$" + (Number.isInteger(n) ? n : n.toFixed(2));
function num(v){ const m = String(v).match(/[\d.]+/); return m ? parseFloat(m[0]) : 0; }

/* ---------- password gate ---------- */
const gate = document.getElementById("gate");
const app  = document.getElementById("app");
const SESSION_KEY = "dd_orders_ok";

function unlock(){
  gate.hidden = true;
  app.hidden = false;
  sessionStorage.setItem(SESSION_KEY, "1");
  loadOrders();
}
document.getElementById("gateForm").addEventListener("submit", e => {
  e.preventDefault();
  const val = document.getElementById("gatePass").value;
  if (val === VIEW_PASSWORD){ document.getElementById("gateErr").hidden = true; unlock(); }
  else { document.getElementById("gateErr").hidden = false; }
});
document.getElementById("lockBtn").addEventListener("click", () => {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
});

/* ---------- state ---------- */
let orders = [];
const openSet = new Set();
let query = "";
let view = "upcoming";
let lastLoad = 0;

/* ---------- map a sheet row → ticket ---------- */
function parseNeedBy(v){
  const s = String(v || "").trim();
  if (!s) return { d: null, hasTime: false };
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)){
    d = new Date(s + "T12:00:00");
    return { d, hasTime: false };
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)){
    d = new Date(s.replace(" ", "T"));
    return isNaN(d) ? { d: null, hasTime: false } : { d, hasTime: true };
  }
  d = new Date(s);
  if (isNaN(d)) return { d: null, hasTime: false };
  // Sheets serializes date cells as midnight — treat that as "no time given"
  return { d, hasTime: d.getHours() + d.getMinutes() !== 0 };
}

function parseCookies(text){
  return String(text || "").split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^(\d+)\s*[×x]\s*(.+?)\s*(?:\(\$([\d.]+)\))?$/);
    if (!m) return { qty: 1, name: l, flavor: FLAVOR_BY_NAME[l.toLowerCase()] || null, price: 0 };
    const name = m[2].trim();
    const f = FLAVOR_BY_NAME[name.toLowerCase()] || null;
    return { qty: parseInt(m[1], 10), name, flavor: f, price: m[3] ? parseFloat(m[3]) : (f ? f.price : 0) };
  });
}

function mapOrder(r){
  const items = parseCookies(r.Cookies);
  const nb = parseNeedBy(r["Date Needed"]);
  const cookies = num(r["Total Cookies"]) || items.reduce((s, it) => s + it.qty, 0);
  const total = num(r["Estimated Total"]) || items.reduce((s, it) => s + it.qty * it.price, 0);
  return {
    id: "r" + r._row,
    row: r._row,
    ref: "DD-" + r._row,
    name: r.Name || "—",
    contact1: String(r["Contact 1"] || "").trim(),
    contact2: String(r["Contact 2"] || "").trim(),
    method: String(r["Order Type"] || "pickup").trim().toLowerCase(),
    address: String(r.Address || "").trim(),
    needBy: nb.d, hasTime: nb.hasTime,
    items, cookies, total,
    payMethod: String(r.Payment || "").trim(),
    distance: String(r.Distance || "").trim(),
    deliveryFee: String(r["Delivery Fee"] || "").trim(),
    paid: /^(yes|true|paid|1)$/i.test(String(r.Paid || "").trim()),
    status: statusId(r.Status),
    notes: String(r.Notes || "").trim(),
    placed: r.Timestamp || "",
  };
}

/* ---------- backend ---------- */
const msgEl = document.getElementById("bookMsg");
function setMsg(t){ msgEl.textContent = t || ""; }

async function loadOrders(){
  setMsg("Loading the book…");
  try {
    const res = await fetch(`${ENDPOINT}?token=${encodeURIComponent(TOKEN)}`);
    const data = await res.json();
    if (!data.ok){ setMsg("Error: " + (data.error || "could not load")); return; }
    orders = (data.orders || []).map(mapOrder);
    lastLoad = Date.now();
    setMsg("");
    renderAll();
  } catch (err){
    setMsg("Couldn't reach the orders backend. Check your connection and try Refresh.");
  }
}
document.getElementById("refreshBtn").addEventListener("click", loadOrders);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !app.hidden && Date.now() - lastLoad > 60000) loadOrders();
});

/* fire-and-forget write to the sheet (no-cors: response unreadable, assume ok) */
function postSheet(fields){
  const fd = new FormData();
  fd.append("token", TOKEN);
  for (const k in fields) fd.append(k, fields[k]);
  return fetch(ENDPOINT, { method: "POST", body: fd, mode: "no-cors" }).catch(() => {
    setMsg("Couldn't save that change — check your connection and Refresh.");
  });
}

/* ---------- header bits ---------- */
(function(){
  const now = new Date();
  const h = now.getHours();
  document.getElementById("greet").textContent =
    h < 12 ? "good morning" : h < 17 ? "good afternoon" : "good evening";
  document.getElementById("railDate").textContent =
    now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
})();

/* ---------- dates ---------- */
function timeParts(o){
  if (!o.needBy) return { t: "—", ap: "no date" };
  if (!o.hasTime) return { t: "any", ap: "time" };
  const t = o.needBy.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const m = t.match(/^([\d:]+)\s*(.*)$/);
  return m ? { t: m[1], ap: m[2] } : { t, ap: "" };
}
function dayLabel(date){
  const today = startOfDay(new Date());
  const diff = Math.round((startOfDay(date) - today) / 864e5);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return date.toLocaleDateString([], { weekday: "long" }).toLowerCase();
}
function daySub(date){
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}
function byNeed(a, b){
  if (!a.needBy) return 1;
  if (!b.needBy) return -1;
  return a.needBy - b.needBy;
}

/* ---------- grouping: agenda by due day ----------
   Past orders = Done AND Paid. Done-but-unpaid tickets stay in the
   book under "waiting on payment" until they're marked paid. */
function bookGroups(list){
  const today = startOfDay(new Date());
  const overdue = [], waitPay = [], noDate = [];
  const byDay = new Map();

  list.forEach(o => {
    if (isPast(o)) return;
    if (o.status === "done"){ waitPay.push(o); return; }
    if (!o.needBy){ noDate.push(o); return; }
    const d = startOfDay(o.needBy);
    if (d < today){ overdue.push(o); return; }
    const k = d.toISOString();
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(o);
  });

  const groups = [];
  if (overdue.length)
    groups.push({ id: "overdue", label: "running late", sub: "past due — needs attention", late: true, orders: overdue.sort(byNeed) });
  if (waitPay.length)
    groups.push({ id: "waitpay", label: "waiting on payment", sub: "done — mark paid to file away", gold: true, orders: waitPay.sort(byNeed) });
  [...byDay.keys()].sort().forEach(k => {
    const d = new Date(k);
    groups.push({ id: k, label: dayLabel(d), sub: daySub(d), orders: byDay.get(k).sort(byNeed) });
  });
  if (noDate.length)
    groups.push({ id: "nodate", label: "no date yet", sub: "ask the customer", orders: noDate });
  return groups;
}

/* ---------- bake plan: cookies per flavor still to bake today ---------- */
function bakePlan(list){
  const today = startOfDay(new Date());
  const counts = new Map();
  list.forEach(o => {
    if (o.status === "done" || o.status === "ready") return;
    if (!o.needBy || startOfDay(o.needBy) > today) return;
    o.items.forEach(it => {
      const key = it.flavor ? it.flavor.name : it.name;
      const cur = counts.get(key) || { qty: 0, flavor: it.flavor };
      cur.qty += it.qty;
      counts.set(key, cur);
    });
  });
  return [...counts.entries()]
    .map(([name, v]) => ({ name, qty: v.qty, flavor: v.flavor }))
    .sort((a, b) => b.qty - a.qty);
}

/* ---------- stats ---------- */
function stats(list){
  const today = startOfDay(new Date());
  const weekStart = startOfDay(new Date()); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
  let dueToday = 0, open = 0, week = 0;
  list.forEach(o => {
    if (!isPast(o)){
      open++;
      if (o.needBy && startOfDay(o.needBy) <= today && o.status !== "done") dueToday++;
    }
    if (o.needBy && o.needBy >= weekStart && o.needBy < weekEnd) week += o.total;
  });
  return { dueToday, open, week };
}

function matches(o, q){
  if (!q) return true;
  q = q.toLowerCase();
  return o.name.toLowerCase().includes(q)
    || o.ref.toLowerCase().includes(q)
    || o.contact1.toLowerCase().includes(q)
    || o.items.some(it => (it.flavor ? it.flavor.name : it.name).toLowerCase().includes(q));
}

/* ---------- past orders (done + paid), grouped by day, newest first ---------- */
function pastDayLabel(date){
  const diff = Math.round((startOfDay(date) - startOfDay(new Date())) / 864e5);
  if (diff === 0) return "earlier today";
  if (diff === -1) return "yesterday";
  if (diff > -7 && diff < 0) return "last " + date.toLocaleDateString([], { weekday: "long" }).toLowerCase();
  return date.toLocaleDateString([], { month: "long", day: "numeric" }).toLowerCase();
}
function pastGroups(list){
  const byDay = new Map();
  const noDate = [];
  list.forEach(o => {
    if (!isPast(o)) return;
    if (!o.needBy){ noDate.push(o); return; }
    const k = startOfDay(o.needBy).toISOString();
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(o);
  });
  const groups = [...byDay.keys()].sort().reverse().map(k => {
    const d = new Date(k);
    return { id: "p" + k, label: pastDayLabel(d), sub: daySub(d), past: true,
      orders: byDay.get(k).sort((a, b) => b.needBy - a.needBy) };
  });
  if (noDate.length) groups.push({ id: "pnodate", label: "no date", sub: "", past: true, orders: noDate });
  return groups;
}
function pastSummary(list){
  const done = list.filter(isPast);
  return {
    n: done.length,
    cookies: done.reduce((s, o) => s + o.cookies, 0),
    money: done.reduce((s, o) => s + o.total, 0),
  };
}

/* ---------- book rendering ---------- */
function cssId(s){ return String(s).replace(/[^a-z0-9]/gi, ""); }

function groupSection(g, vis){
  const cookies = vis.reduce((s, o) => s + o.cookies, 0);
  const cls = ["day", g.late ? "late" : "", g.gold ? "gold" : "", g.past ? "past" : ""].filter(Boolean).join(" ");
  return `<section class="${cls}" id="g-${cssId(g.id)}">
    <header class="day-h">
      <span class="day-script">${esc(g.label)}</span>
      <span class="day-sub">${esc(g.sub)}</span>
      <span class="day-line"></span>
      <span class="day-meta">${vis.length} order${vis.length === 1 ? "" : "s"} · ${cookies} cookies</span>
    </header>
    ${vis.map(ticketHTML).join("")}
  </section>`;
}

function bookHTML(){
  let html = "";
  let any = false;

  if (view === "past"){
    const sum = pastSummary(orders);
    pastGroups(orders).forEach(g => {
      const vis = g.orders.filter(o => matches(o, query));
      if (!vis.length) return;
      any = true;
      html += groupSection(g, vis);
    });
    if (!any){
      return sum.n
        ? '<p class="book-empty">No past orders match — try another search.</p>'
        : '<p class="book-empty">No past orders yet — tickets land here once they\'re done <i>and</i> paid.</p>';
    }
    return `<p class="past-sum"><b>${sum.n}</b> orders wrapped up &nbsp;·&nbsp; <b>${sum.cookies}</b> cookies baked &nbsp;·&nbsp; <b>${money(sum.money)}</b> earned</p>` + html;
  }

  bookGroups(orders).forEach(g => {
    const vis = g.orders.filter(o => matches(o, query));
    if (!vis.length) return;
    any = true;
    html += groupSection(g, vis);
  });
  if (any) return html;
  return orders.length
    ? '<p class="book-empty">Nothing in the book matches — try another search.</p>'
    : '<p class="book-empty">The book is empty — new orders from the site will appear here.</p>';
}

/* ---------- ticket markup ---------- */
function ticketHTML(o){
  const idx = FLOW.indexOf(o.status);
  const tp = timeParts(o);
  const open = openSet.has(o.id);
  const m = METHODS[o.method] || METHODS.pickup;
  /* late / done / past tickets sit outside a single-day group — show their date */
  const offDay = o.needBy ? startOfDay(o.needBy) - startOfDay(new Date()) : 0;
  const showDate = o.needBy && ((offDay < 0 && o.status !== "done") || o.status === "done");
  const apLine = tp.ap + (showDate ? " · " + o.needBy.toLocaleDateString([], { month: "short", day: "numeric" }) : "");

  const items = o.items.map(it =>
    `<span class="t-it"><img src="${flavorImg(it.flavor)}" alt="" /><b>${it.qty}</b><span>${esc(it.flavor ? it.flavor.name : it.name)}</span></span>`
  ).join("");

  const steps = FLOW.map((s, i) => {
    const cls = [META[s].cls, i < idx ? "done" : "", i === idx ? "cur" : ""].join(" ");
    return `<button class="st ${cls}" data-act="status" data-s="${s}" type="button"><i></i><span>${META[s].label}</span></button>`;
  }).join('<span class="st-line"></span>');

  let next;
  if (idx < FLOW.length - 1){
    next = `<button class="t-next" data-act="next" type="button">Move to ${META[FLOW[idx + 1]].label}
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>
     </button>`;
  } else if (o.paid){
    next = `<span class="t-doneflag">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
       all wrapped up</span>`;
  } else {
    next = `<span class="t-doneflag owe">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>
       done — mark paid to file it away</span>`;
  }

  const contact = [o.contact1, o.contact2].filter(Boolean).join(" · ") || "—";
  const contactHTML = /^[\d\s()+.-]{7,}$/.test(o.contact1)
    ? `<a href="tel:${esc(o.contact1.replace(/[^\d+]/g, ""))}">${esc(contact)}</a>`
    : `<span>${esc(contact)}</span>`;
  const payLine = (o.paid ? "paid · " + money(o.total) : "owes " + money(o.total))
    + (o.payMethod ? " · " + esc(o.payMethod) : "")
    + (o.deliveryFee ? " · +" + esc(o.deliveryFee) + " delivery" : "");

  return `
  <article class="ticket ${META[o.status].cls}${open ? " open" : ""}" data-id="${o.id}">
    <div class="t-row" data-act="toggle">
      <div class="t-when">
        <b>${tp.t}</b><small>${apLine}</small>
        <span class="t-method">${m.icon}<span>${m.label}</span></span>
      </div>
      <div class="t-main">
        <div class="t-head">
          <span class="ref">#${esc(o.ref)}</span>
          <span class="pill"><i></i>${META[o.status].label}</span>
          ${o.paid ? '<span class="stamp paid">paid</span>' : '<span class="stamp owe">unpaid</span>'}
        </div>
        <h3>${esc(o.name)}</h3>
        <div class="t-items">${items}</div>
        ${o.notes ? `<p class="t-note">${esc(o.notes)}</p>` : ""}
      </div>
      <div class="t-stub">
        <span class="t-count"><b>${o.cookies}</b><small>cookies</small></span>
        <span class="t-total">${money(o.total)}</span>
        <svg class="t-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>
      </div>
    </div>
    <div class="t-more">
      <div class="t-step">${steps}</div>
      <div class="td-grid">
        <div><label>contact</label>${contactHTML}</div>
        <div><label>${m.label.toLowerCase()}</label><span>${esc(o.address) || "at the kitchen"}${o.distance ? " · " + esc(o.distance) : ""}</span></div>
        <div><label>payment</label><span>${payLine}</span></div>
      </div>
      <div class="td-actions">
        ${next}
        <span class="sp"></span>
        <button class="td-paid" data-act="paid" type="button">${o.paid ? "Mark unpaid" : "Mark as paid"}</button>
        <button class="td-del" data-act="del" type="button">Delete</button>
      </div>
    </div>
  </article>`;
}

/* ---------- renderers ---------- */
function renderBook(){
  document.getElementById("book").innerHTML = bookHTML();
}

function renderTabs(){
  document.getElementById("cntUp").textContent =
    bookGroups(orders).reduce((s, g) => s + g.orders.length, 0);
  document.getElementById("cntPast").textContent = pastSummary(orders).n;
  document.querySelectorAll("#bookTabs .bt").forEach(b =>
    b.classList.toggle("active", b.dataset.view === view));
}

function renderIndex(){
  const nav = document.getElementById("dayIndex");
  const groups = view === "past" ? pastGroups(orders) : bookGroups(orders);
  nav.innerHTML = groups.map(g =>
    `<button class="di-row${g.late ? " late" : ""}${g.gold || g.past ? " gold" : ""}" data-target="g-${cssId(g.id)}" type="button">
      <span class="dl">${esc(g.label)}</span><span class="dline"></span>
      <span class="dn">${g.orders.length}</span>
    </button>`
  ).join("");
}

function renderOven(){
  const plan = bakePlan(orders);
  const el = document.getElementById("ovenList");
  if (!plan.length){
    el.innerHTML = '<p class="oven-empty">Nothing left to bake today — the oven gets a rest. ♥</p>';
    return;
  }
  const total = plan.reduce((s, r) => s + r.qty, 0);
  el.innerHTML = plan.map(r =>
    `<div class="oven-row"><img src="${flavorImg(r.flavor)}" alt="" /><span>${esc(r.name)}</span><b>${r.qty}</b></div>`
  ).join("") + `<div class="oven-total"><span>cookies to bake</span><b>${total}</b></div>`;
}

function renderLedger(){
  const s = stats(orders);
  document.getElementById("ledger").innerHTML = `
    <div><dt>due today</dt><span class="dline"></span><dd>${s.dueToday}</dd></div>
    <div><dt>open tickets</dt><span class="dline"></span><dd>${s.open}</dd></div>
    <div><dt>this week</dt><span class="dline"></span><dd>${money(s.week)}</dd></div>`;
  document.getElementById("statline").innerHTML =
    `<b>${s.dueToday}</b> due today &nbsp;·&nbsp; <b>${s.open}</b> open tickets &nbsp;·&nbsp; <b>${money(s.week)}</b> this week`;
}

function renderAll(){
  renderBook();
  renderTabs();
  renderIndex();
  renderOven();
  renderLedger();
}

/* ---------- ticket actions ---------- */
document.getElementById("book").addEventListener("click", e => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const card = btn.closest(".ticket");
  if (!card) return;
  const o = orders.find(x => x.id === card.dataset.id);
  if (!o) return;
  const act = btn.dataset.act;

  if (act === "toggle"){
    if (e.target.closest("a")) return;
    openSet.has(o.id) ? openSet.delete(o.id) : openSet.add(o.id);
    renderAll();
    return;
  }
  if (!o.row){ setMsg("This order is still syncing — Refresh in a moment to edit it."); return; }

  if (act === "status"){
    o.status = btn.dataset.s;
    postSheet({ action: "status", row: o.row, status: META[o.status].sheet });
  } else if (act === "next"){
    const i = FLOW.indexOf(o.status);
    if (i < FLOW.length - 1){
      o.status = FLOW[i + 1];
      postSheet({ action: "status", row: o.row, status: META[o.status].sheet });
    }
  } else if (act === "paid"){
    o.paid = !o.paid;
    postSheet({ action: "paid", row: o.row, paid: o.paid ? "1" : "0" });
  } else if (act === "del"){
    if (!confirm(`Delete order #${o.ref} for ${o.name}? This removes it from the sheet too.`)) return;
    orders = orders.filter(x => x !== o);
    openSet.delete(o.id);
    postSheet({ action: "del", row: o.row });
    setMsg("Deleting order…");
    // row numbers below the deleted one shift up — re-pull the sheet to resync
    setTimeout(loadOrders, 1800);
  }
  renderAll();
});

/* ---------- tabs / index / search ---------- */
document.getElementById("bookTabs").addEventListener("click", e => {
  const b = e.target.closest(".bt");
  if (!b || b.dataset.view === view) return;
  view = b.dataset.view;
  renderBook();
  renderTabs();
  renderIndex();
});

document.getElementById("dayIndex").addEventListener("click", e => {
  const row = e.target.closest(".di-row");
  if (!row) return;
  const el = document.getElementById(row.dataset.target);
  if (!el) return;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 84, behavior: "smooth" });
});

document.getElementById("search").addEventListener("input", e => {
  query = e.target.value.trim();
  renderBook();
});

/* ---------- add-order form ---------- */
(function setupAddForm(){
  const back   = document.getElementById("addBack");
  const form   = document.getElementById("addForm");
  const rows   = document.getElementById("itemRows");
  const addRow = document.getElementById("addItemBtn");
  const addr   = document.getElementById("addrField");

  function itemRowHTML(){
    const opts = FLAVORS.map(f => `<option value="${f.id}">${esc(f.name)} · ${money(f.price)}</option>`).join("");
    return `<div class="irow">
      <select class="ir-fl">${opts}</select>
      <div class="ir-qty">
        <button type="button" data-q="-1">−</button>
        <input type="number" min="1" value="12" />
        <button type="button" data-q="1">+</button>
      </div>
      <button type="button" class="ir-x" aria-label="Remove">×</button>
    </div>`;
  }

  function openIt(){
    form.reset();
    rows.innerHTML = itemRowHTML();
    document.getElementById("f-date").value = new Date().toISOString().slice(0, 10);
    document.getElementById("f-time").value = "12:00";
    addr.style.display = "";
    back.classList.add("show");
    document.body.classList.add("no-scroll");
  }
  function closeIt(){
    back.classList.remove("show");
    document.body.classList.remove("no-scroll");
  }

  document.getElementById("addBtn").addEventListener("click", openIt);
  document.getElementById("addClose").addEventListener("click", closeIt);
  document.getElementById("addCancel").addEventListener("click", closeIt);
  back.addEventListener("click", e => { if (e.target === back) closeIt(); });

  form.addEventListener("change", e => {
    if (e.target.name === "method"){
      addr.style.display = e.target.value === "Pickup" ? "none" : "";
    }
  });

  addRow.addEventListener("click", () => rows.insertAdjacentHTML("beforeend", itemRowHTML()));
  rows.addEventListener("click", e => {
    const row = e.target.closest(".irow");
    if (!row) return;
    if (e.target.matches("[data-q]")){
      const inp = row.querySelector("input");
      inp.value = Math.max(1, (parseInt(inp.value, 10) || 1) + parseInt(e.target.dataset.q, 10));
    } else if (e.target.matches(".ir-x") && rows.children.length > 1){
      row.remove();
    }
  });

  form.addEventListener("submit", e => {
    e.preventDefault();
    const name = document.getElementById("f-name").value.trim();
    if (!name){ document.getElementById("f-name").focus(); return; }
    const method = form.querySelector('input[name="method"]:checked').value;
    const items = [...rows.querySelectorAll(".irow")].map(r => {
      const f = FLAVORS.find(x => x.id === r.querySelector(".ir-fl").value);
      const qty = Math.max(1, parseInt(r.querySelector(".ir-qty input").value, 10) || 1);
      return { f, qty };
    });
    const date = document.getElementById("f-date").value || new Date().toISOString().slice(0, 10);
    const time = document.getElementById("f-time").value || "12:00";
    const cookies = items.reduce((s, it) => s + it.qty, 0);
    const total = items.reduce((s, it) => s + it.qty * it.f.price, 0);
    const paid = document.getElementById("f-paid").checked;

    postSheet({
      action: "create",
      "Order Type": method,
      "Name": name,
      "Cookies": items.map(it => `${it.qty} × ${it.f.name} ($${it.f.price})`).join("\n"),
      "Total Cookies": String(cookies),
      "Estimated Total": "$" + total,
      "Address": method === "Pickup" ? "" : document.getElementById("f-addr").value.trim(),
      "Contact 1": document.getElementById("f-phone").value.trim(),
      "Contact 2": "",
      "Payment": document.getElementById("f-pay").value,
      "Date Needed": `${date} ${time}`,
      "Notes": document.getElementById("f-notes").value.trim(),
      "Paid": paid ? "Yes" : "",
    });

    closeIt();
    setMsg("Saving order…");
    setTimeout(loadOrders, 1800);   // appendRow is quick; pull the fresh row
  });
})();

/* stay unlocked for the browser session */
if (sessionStorage.getItem(SESSION_KEY) === "1"){
  gate.hidden = true;
  app.hidden = false;
  loadOrders();
}
