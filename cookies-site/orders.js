/* ============================================================
   Cookies by DD & Alexa — /orders dashboard
   Reads & updates orders stored in a Google Sheet via the
   Apps Script web app (see apps-script.gs / SETUP.md).
   ============================================================ */

// ====== CONFIG — EDIT THESE TWO (must match apps-script.gs) ======
const ENDPOINT = "https://script.google.com/macros/s/AKfycbz9SdN4JkJEzmtgA1u00I6vry-_hgt5VdJYqDNPohTWZ7ZxaqPMT1Sjmx9F6x7bIaGbsA/exec";   // your Apps Script web-app URL (same as ORDERS_ENDPOINT in script.js)
const TOKEN    = "iW53FSjgO4c8ptJmZFkIXLQ55cYNjRQe"; // must equal SECRET in apps-script.gs
// A simple view password. NOTE: client-side gating is light security — fine for
// low-stakes order info, but anyone determined could read the page source.
const VIEW_PASSWORD = "cookies";   // change this!
// ================================================================

const STATUSES = ["New", "Confirmed", "Baking", "Done"];

let allOrders = [];
let filter = { status: "all", method: "all", q: "", sort: "newest" };

/* ---------- password gate ---------- */
const gate = document.getElementById("gate");
const dash = document.getElementById("dash");
const SESSION_KEY = "dd_orders_ok";

function unlock(){
  gate.hidden = true;
  dash.hidden = false;
  sessionStorage.setItem(SESSION_KEY, "1");
  loadOrders();
}
document.getElementById("gateForm").addEventListener("submit", e => {
  e.preventDefault();
  const val = document.getElementById("gatePass").value;
  if(val === VIEW_PASSWORD){ document.getElementById("gateErr").hidden = true; unlock(); }
  else { document.getElementById("gateErr").hidden = false; }
});
document.getElementById("logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
});
// stay unlocked for the browser session
if(sessionStorage.getItem(SESSION_KEY) === "1"){ gate.hidden = true; dash.hidden = false; }

/* ---------- fetch orders ---------- */
const msgEl = document.getElementById("dashMsg");
function setMsg(t){ msgEl.textContent = t || ""; }

async function loadOrders(){
  if(!ENDPOINT){
    setMsg("⚠ Not connected yet. Add your Apps Script URL to ENDPOINT in orders.js (see SETUP.md).");
    return;
  }
  setMsg("Loading orders…");
  try {
    const res = await fetch(`${ENDPOINT}?token=${encodeURIComponent(TOKEN)}`);
    const data = await res.json();
    if(!data.ok){ setMsg("Error: " + (data.error || "could not load")); return; }
    allOrders = data.orders || [];
    setMsg("");
    render();
  } catch(err){
    setMsg("Couldn't reach the orders backend. Check the ENDPOINT URL and that the web app is deployed for 'Anyone'.");
  }
}
document.getElementById("refreshBtn").addEventListener("click", loadOrders);
if(sessionStorage.getItem(SESSION_KEY) === "1") loadOrders();

/* ---------- filtering / sorting ---------- */
function startOfWeek(){
  const d = new Date(); const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0,0,0,0); d.setDate(d.getDate() - day); return d;
}
function num(v){ const m = String(v).match(/[\d.]+/); return m ? parseFloat(m[0]) : 0; }

function visibleOrders(){
  let list = allOrders.slice();
  if(filter.status !== "all") list = list.filter(o => (o.Status || "New") === filter.status);
  if(filter.method !== "all") list = list.filter(o => o["Order Type"] === filter.method);
  if(filter.q){
    const q = filter.q.toLowerCase();
    list = list.filter(o =>
      [o.Name, o.Cookies, o["Contact 1"], o["Contact 2"], o.Notes, o.Address]
        .some(v => String(v || "").toLowerCase().includes(q)));
  }
  if(filter.sort === "needed"){
    list.sort((a,b) => String(a["Date Needed"]).localeCompare(String(b["Date Needed"])));
  } // 'newest' already comes reversed from the backend
  return list;
}

/* ---------- summary ---------- */
function renderSummary(){
  const open = allOrders.filter(o => (o.Status || "New") !== "Done");
  const wkStart = startOfWeek();
  const thisWeek = allOrders.filter(o => {
    const t = new Date(String(o.Timestamp).replace(" ", "T"));
    return !isNaN(t) && t >= wkStart;
  });
  const cookiesToBake = open.reduce((s,o) => s + num(o["Total Cookies"]), 0);
  const revenue = open.reduce((s,o) => s + num(o["Estimated Total"]), 0);
  document.getElementById("sumNew").textContent      = allOrders.filter(o => (o.Status||"New") === "New").length;
  document.getElementById("sumWeek").textContent     = thisWeek.length;
  document.getElementById("sumCookies").textContent  = cookiesToBake;
  document.getElementById("sumRevenue").textContent  = "$" + revenue;
}

/* ---------- render ---------- */
const listEl = document.getElementById("orderList");
const emptyEl = document.getElementById("dashEmpty");

function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

function orderCard(o){
  const status = o.Status || "New";
  const cookies = String(o.Cookies || "").split("\n").filter(Boolean)
    .map(l => `<li>${esc(l)}</li>`).join("");
  const opts = STATUSES.map(s => `<option ${s === status ? "selected" : ""}>${s}</option>`).join("");
  const addr = o["Order Type"] === "Delivery" && o.Address
    ? `<div class="o-row"><span>Address</span><b>${esc(o.Address)}</b></div>` : "";
  const notes = o.Notes ? `<div class="o-row"><span>Notes</span><b>${esc(o.Notes)}</b></div>` : "";
  return `
  <article class="order-card status-${status.toLowerCase()}" data-row="${o._row}">
    <div class="o-top">
      <div>
        <h3>${esc(o.Name || "—")}</h3>
        <span class="o-meta">${esc(o["Order Type"] || "")} · ${esc(o.Timestamp || "")}</span>
      </div>
      <select class="o-status" data-row="${o._row}">${opts}</select>
    </div>
    <ul class="o-cookies">${cookies || "<li>—</li>"}</ul>
    <div class="o-tot"><span>${esc(o["Total Cookies"] || 0)} cookies</span><b>${esc(o["Estimated Total"] || "")}</b></div>
    <div class="o-details">
      ${addr}
      <div class="o-row"><span>Contact</span><b>${esc(o["Contact 1"] || "—")}${o["Contact 2"] ? " · " + esc(o["Contact 2"]) : ""}</b></div>
      <div class="o-row"><span>Payment</span><b>${esc(o.Payment || "—")}</b></div>
      <div class="o-row"><span>Needed by</span><b>${esc(o["Date Needed"] || "—")}</b></div>
      ${notes}
    </div>
  </article>`;
}

function render(){
  renderSummary();
  const list = visibleOrders();
  emptyEl.hidden = list.length > 0;
  listEl.innerHTML = list.map(orderCard).join("");
}

/* ---------- status write-back ---------- */
listEl.addEventListener("change", async e => {
  const sel = e.target.closest(".o-status");
  if(!sel) return;
  const row = sel.dataset.row;
  const status = sel.value;
  const card = sel.closest(".order-card");
  sel.disabled = true;
  try {
    const fd = new FormData();
    fd.append("action", "status");
    fd.append("token", TOKEN);
    fd.append("row", row);
    fd.append("status", status);
    await fetch(ENDPOINT, { method:"POST", body:fd, mode:"no-cors" });
    // update local copy + card styling (no-cors means we can't read the response, assume success)
    const o = allOrders.find(x => String(x._row) === String(row));
    if(o) o.Status = status;
    card.className = "order-card status-" + status.toLowerCase();
    renderSummary();
  } catch(err){
    setMsg("Couldn't save status — try again.");
  } finally {
    sel.disabled = false;
  }
});

/* ---------- controls ---------- */
document.getElementById("statusChips").addEventListener("click", e => {
  const chip = e.target.closest(".chip");
  if(!chip) return;
  document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
  chip.classList.add("active");
  filter.status = chip.dataset.status;
  render();
});
document.getElementById("methodFilter").addEventListener("change", e => { filter.method = e.target.value; render(); });
document.getElementById("sortBy").addEventListener("change", e => { filter.sort = e.target.value; render(); });
let searchTimer;
document.getElementById("search").addEventListener("input", e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { filter.q = e.target.value.trim(); render(); }, 150);
});
