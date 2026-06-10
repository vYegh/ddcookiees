/* ============================================================
   Cookies by DD & Alexa — interactions
   ============================================================ */
const WEB3FORMS_KEY = "19960b68-508c-4ef8-9d18-e7bd91202643";
const DELIVERY_MIN = 5;      // delivery requires at least this many cookies
const LEAD_DAYS    = 3;      // orders must be placed this many days in advance

// Google Apps Script web-app URL — saves each order to the Sheet that powers /orders.
// Leave as "" until you've deployed apps-script.gs (see SETUP.md); orders still email via Web3Forms.
const ORDERS_ENDPOINT = "https://script.google.com/macros/s/AKfycbz9SdN4JkJEzmtgA1u00I6vry-_hgt5VdJYqDNPohTWZ7ZxaqPMT1Sjmx9F6x7bIaGbsA/exec";

/* ---------- flavor data (price = per cookie, matches the pre-order form) ---------- */
const FLAVORS = [
  { id:"chocchip",  name:"Chocolate Chip",            cat:"classic", fav:true,  price:3, desc:"The classic. Gooey center, golden edges, loaded with melty chocolate." },
  { id:"monster",   name:"Cookie Monster",            cat:"classic",            price:4, desc:"Oats, peanut butter & candy-coated chocolate in every chunky bite." },
  { id:"cinnamon",  name:"Cinnamon Toast Crunch",     cat:"classic",            price:4, desc:"Cinnamon-sugar swirl that tastes like Saturday mornings." },
  { id:"lemon",     name:"Lemon Cookie",              cat:"classic",            price:3, desc:"Bright, zesty & sunshine-soft with a sweet glaze." },
  { id:"fruity",    name:"Fruity Pebbles",            cat:"fun",     fav:true,  price:4, desc:"Crunchy, colorful & ridiculously fun — a cereal-bowl dream." },
  { id:"birthday",  name:"Birthday Cake",             cat:"fun",                price:4, desc:"Funfetti sprinkles and a little celebration in every bite." },
  { id:"strawberry",name:"Strawberry Crunch",         cat:"fun",                price:4, desc:"Strawberry shortcake crumble over a soft, buttery base." },
  { id:"redvelvet", name:"Red Velvet",                cat:"fun",                price:4, desc:"Cocoa-kissed & tender with a cream cheese heart." },
  { id:"cookiescream",name:"Oreo / Cookies & Cream",  cat:"rich",    fav:true,  price:4, desc:"Crushed sandwich cookies folded into sweet vanilla dough." },
  { id:"smores",    name:"S'mores",                   cat:"rich",               price:4, desc:"Toasted marshmallow, graham crumble & melty chocolate." },
  { id:"caramel",   name:"Salted Caramel Cheesecake", cat:"rich",               price:5, desc:"Buttery caramel swirl over a creamy cheesecake center." },
  { id:"dubai",     name:"Dubai Chocolate (Brownie)", cat:"rich",    isNew:true,price:5, desc:"Pistachio & crispy kataifi over a fudgy chocolate brownie base." },
  { id:"dubaicookie",name:"Dubai Chocolate (Cookie)", cat:"rich",    isNew:true,price:5, img:"dubai", desc:"Pistachio & crispy kataifi over a chewy cookie base." },
  { id:"custom",    name:"Custom Cookie",             cat:"fun",                price:6, noShowcase:true, desc:"You tell us what to make! Add the details in your order notes." },
];

/* ---------- favorites (persisted) ---------- */
let favs = JSON.parse(localStorage.getItem("ddfavs") || "[]");
const saveFavs = () => localStorage.setItem("ddfavs", JSON.stringify(favs));

/* ---------- render flavors ---------- */
const grid = document.getElementById("flavorGrid");
function flavorCard(f){
  const isFav = favs.includes(f.id);
  const tag = f.isNew
    ? `<span class="tag">✦ New</span>`
    : (f.fav ? `<span class="tag">♥ Fan Favorite</span>` : "");
  return `
  <article class="flavor" data-cat="${f.cat}">
    ${tag}
    <button class="fav-btn ${isFav ? "on" : ""}" data-fav="${f.id}" aria-label="Save favorite">${isFav ? "♥" : "♡"}</button>
    <div class="ph"><img src="assets/flavors/${f.img || f.id}.png" alt="${f.name} cookie" loading="lazy" /></div>
    <div class="flavor-body">
      <h3>${f.name}</h3>
      <p>${f.desc}</p>
      <div class="flavor-foot">
        <a class="order-link" data-order>Add to order →</a>
      </div>
    </div>
  </article>`;
}
grid.innerHTML = FLAVORS.filter(f => !f.noShowcase).map(flavorCard).join("");

/* ---------- filters ---------- */
const filterBtns = document.querySelectorAll("#filters button");
filterBtns.forEach(btn => btn.addEventListener("click", () => {
  filterBtns.forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const f = btn.dataset.filter;
  document.querySelectorAll(".flavor").forEach(card => {
    const show = f === "all" || card.dataset.cat === f;
    card.style.display = show ? "" : "none";
  });
}));

/* ---------- favorite toggle (delegated) ---------- */
grid.addEventListener("click", e => {
  const fb = e.target.closest("[data-fav]");
  if(!fb) return;
  const id = fb.dataset.fav;
  if(favs.includes(id)){ favs = favs.filter(x => x !== id); fb.classList.remove("on"); fb.textContent = "♡"; }
  else { favs.push(id); fb.classList.add("on"); fb.textContent = "♥";
         fb.animate([{transform:"scale(1)"},{transform:"scale(1.35)"},{transform:"scale(1)"}],{duration:280}); }
  saveFavs();
});

/* ---------- instagram tiles ---------- */
const igImgs = ["chocchip","fruity","birthday","cookiescream","strawberry","dubai","smores","caramel"];
document.getElementById("igGrid").innerHTML = igImgs
  .map(id => `<div class="ph" data-order><img src="assets/flavors/${id}.png" alt="cookie" loading="lazy" /></div>`).join("");

/* ============================================================
   FULL-SCREEN ORDER FLOW
   ============================================================ */
const flow      = document.getElementById("orderFlow");
const orderForm = document.getElementById("orderForm");
const modeField = document.getElementById("modeField");
const galleryEl = document.getElementById("flavorGallery");
const reviewEl  = document.getElementById("reviewCard");
const dateInput = orderForm.querySelector('input[name="Date Needed"]');
const addrField  = orderForm.querySelector("[data-addr-field]");
const addrStreet = document.getElementById("addrStreet");
const addrApt    = document.getElementById("addrApt");
const addrCity   = document.getElementById("addrCity");
const addrState  = document.getElementById("addrState");
const addrZip    = document.getElementById("addrZip");
const addrSugs   = document.getElementById("addrSugs");
const addrHidden = orderForm.querySelector('input[name="Address"]');

/* compose the structured fields into the single "Address" value the
   email / sheet / admin tracker already expect */
function composeAddress(){
  const street = addrStreet.value.trim();
  const apt    = addrApt.value.trim();
  const city   = addrCity.value.trim();
  const state  = addrState.value.trim();
  const zip    = addrZip.value.trim();
  addrHidden.value = [
    street + (apt ? ", " + apt : ""),
    city,
    (state + " " + zip).trim(),
  ].filter(Boolean).join(", ");
  return addrHidden.value;
}

const cartCount = document.getElementById("cartCount");
const cartTotal = document.getElementById("cartTotal");
const cartMin   = document.getElementById("cartMin");
const flowFoot  = document.getElementById("flowFoot");
const backBtn   = document.getElementById("flowBack");
const nextBtn   = document.getElementById("flowNext");
const submitBtn = document.getElementById("flowSubmit");

const STEPS = [1, 2, 3, 4, 5];       // numbered steps (success handled separately)
let step = 1;
let orderMode = "";
const qty = {};                      // flavorId -> count
FLAVORS.forEach(f => qty[f.id] = 0);

/* ---------- build the photo gallery (step 2) ---------- */
galleryEl.innerHTML = FLAVORS.map(f => {
  const src = f.img ? `assets/flavors/${f.img}.png`
            : f.noShowcase ? "assets/logo.png"           // custom cookie — no photo, use logo
            : `assets/flavors/${f.id}.png`;
  return `
  <article class="gcard" data-id="${f.id}">
    <div class="gcard-photo"><img src="${src}" alt="${f.name} cookie" loading="lazy" />
      <span class="gcard-badge" data-badge hidden>0</span>
    </div>
    <div class="gcard-body">
      <h4>${f.name}</h4>
      <span class="gcard-price">$${f.price}</span>
    </div>
    <div class="gcard-step">
      <button type="button" class="step-btn" data-step-dir="-1" aria-label="Remove one ${f.name}">−</button>
      <span class="step-count" data-count>0</span>
      <button type="button" class="step-btn" data-step-dir="1" aria-label="Add one ${f.name}">+</button>
    </div>
  </article>`;
}).join("");

/* ---------- totals & helpers ---------- */
const priceOf = id => (FLAVORS.find(f => f.id === id) || {}).price || 0;
const nameOf  = id => (FLAVORS.find(f => f.id === id) || {}).name || id;
function totals(){
  let count = 0, total = 0;
  for(const id in qty){ count += qty[id]; total += qty[id] * priceOf(id); }
  return { count, total };
}
const deliveryShort = () => orderMode === "Delivery" && totals().count < DELIVERY_MIN;

/* ---------- cart bar (sticky footer) ---------- */
function refreshCart(){
  const { count, total } = totals();
  cartCount.textContent = `${count} cookie${count === 1 ? "" : "s"}`;
  cartTotal.textContent = `$${total}`;
  if(orderMode === "Delivery" && count > 0 && count < DELIVERY_MIN){
    cartMin.hidden = false;
    cartMin.textContent = `Add ${DELIVERY_MIN - count} more for delivery (min ${DELIVERY_MIN})`;
  } else { cartMin.hidden = true; }
  updateNextState();
}

/* ---------- gallery stepper clicks ---------- */
galleryEl.addEventListener("click", e => {
  const btn = e.target.closest("[data-step-dir]");
  if(!btn) return;
  const card = btn.closest(".gcard");
  const id   = card.dataset.id;
  qty[id] = Math.max(0, Math.min(99, qty[id] + (+btn.dataset.stepDir)));
  const badge = card.querySelector("[data-badge]");
  card.querySelector("[data-count]").textContent = qty[id];
  badge.textContent = qty[id];
  badge.hidden = qty[id] === 0;
  card.classList.toggle("active", qty[id] > 0);
  refreshCart();
});

/* ---------- step navigation ---------- */
function gotoStep(n){
  step = n;
  flow.querySelectorAll(".flow-step").forEach(s => s.hidden = s.dataset.step !== String(n));
  // progress dots
  document.querySelectorAll("#flowProgress .dot").forEach(d => {
    const dn = +d.dataset.dot;
    d.classList.toggle("done", dn < n);
    d.classList.toggle("now", dn === n);
  });
  flow.querySelector(".flow-body").scrollTop = 0;
  // footer visibility: hidden on success
  const isDone = n === "done";
  flowFoot.style.display = isDone ? "none" : "";
  backBtn.style.visibility = (n === 1) ? "hidden" : "visible";
  // cart bar only meaningful from step 2 on
  flowFoot.classList.toggle("show-cart", !isDone && n >= 2);
  // last step → swap Next for Submit
  const last = n === 5;
  nextBtn.hidden = last;
  submitBtn.hidden = !last;
  if(last) buildReview();
  updateNextState();
}

/* enable/disable Next per step */
function updateNextState(){
  let ok = true;
  if(step === 1) ok = !!orderMode;
  if(step === 2){ const c = totals().count; ok = c > 0 && !deliveryShort(); }
  if(step === 3) ok = !!dateInput.value;
  if(step === 4) ok = detailsValid();
  nextBtn.classList.toggle("blocked", !ok);
  nextBtn.disabled = !ok;
  if(step === 5) submitBtn.disabled = !acceptOK();
}

/* the 24h-cancellation box is always required; the 5-cookie-minimum box only for delivery */
function acceptOK(){
  if(!document.getElementById("cancelBox").checked) return false;
  if(orderMode === "Delivery" && !document.getElementById("acceptBox").checked) return false;
  return true;
}

function detailsValid(){
  const need = ['Name','Contact 1','Contact 2','Payment'];
  for(const n of need){ const el = orderForm.querySelector(`[name="${n}"]`); if(!el.value.trim()) return false; }
  if(orderMode === "Delivery" &&
     !(addrStreet.value.trim() && addrCity.value.trim() && addrZip.value.trim())) return false;
  return true;
}
orderForm.addEventListener("input", () => { if(step === 4) updateNextState(); });

/* ---------- choosing a method (step 1) ---------- */
galleryEl.closest(".flow-form").addEventListener("click", e => {
  const mc = e.target.closest(".method-card");
  if(!mc) return;
  orderMode = mc.dataset.method;
  modeField.value = orderMode;
  flow.querySelectorAll(".method-card").forEach(c => c.classList.remove("chosen"));
  mc.classList.add("chosen");
  flow.querySelectorAll("[data-mode-eyebrow]").forEach(s => s.textContent = orderMode);
  // address only for delivery
  const isDelivery = orderMode === "Delivery";
  addrField.hidden = !isDelivery;
  document.getElementById("cookieSub").textContent = isDelivery
    ? `Delivery has a ${DELIVERY_MIN}-cookie minimum — tap to add, set quantities below.`
    : "Tap a cookie to add it, then set how many of each.";
  refreshCart();
  gotoStep(2);   // auto-advance once they pick — feels snappy
});

nextBtn.addEventListener("click", () => {
  if(nextBtn.disabled) return;
  const i = STEPS.indexOf(step);
  if(i < STEPS.length - 1) gotoStep(STEPS[i + 1]);
});
backBtn.addEventListener("click", () => {
  const i = STEPS.indexOf(step);
  if(i > 0) gotoStep(STEPS[i - 1]);
});
document.getElementById("acceptBox").addEventListener("change", updateNextState);
document.getElementById("cancelBox").addEventListener("change", updateNextState);

/* ---------- review (step 5) — itemized receipt ---------- */
const fmtDate = raw => /^\d{4}-\d{2}-\d{2}$/.test(raw)
  ? new Date(raw + "T12:00").toLocaleDateString([], { weekday:"long", month:"long", day:"numeric" })
  : raw;

function buildReview(){
  const { count, total } = totals();
  const lines = FLAVORS.filter(f => qty[f.id] > 0)
    .map(f => `<li><span>${qty[f.id]} × ${f.name} <small>@ $${f.price} ea</small></span><b>$${qty[f.id]*f.price}</b></li>`).join("");
  const g = n => (orderForm.querySelector(`[name="${n}"]`)?.value || "—");
  const niceDate = fmtDate(g("Date Needed"));
  const addrRow = orderMode === "Delivery" ? `<div class="rv-row"><span>Address</span><b>${g("Address")}</b></div>` : "";
  // the 5-cookie-minimum acknowledgment only applies to delivery orders
  document.querySelector("[data-accept-delivery]").hidden = orderMode !== "Delivery";
  // make sure the fee estimate is fresh if they pasted an address without leaving the field
  if(orderMode === "Delivery" && delFee.status === "idle" && addrStreet.value.trim()) updateDeliveryFee();
  let totRows = `<div class="rv-tot rv-sub"><span>Subtotal · ${count} cookies</span><b>$${total}</b></div>`;
  if(orderMode === "Delivery" && delFee.status === "ok"){
    totRows += `<div class="rv-tot rv-sub"><span>Delivery (estimated · ${delFee.miles.toFixed(1)} mi)</span><b>$${delFee.fee}</b></div>
      <div class="rv-tot"><span>Total</span><b>$${total + delFee.fee}<small> estimated</small></b></div>`;
  } else if(orderMode === "Delivery"){
    totRows += `<div class="rv-tot"><span>Total</span><b>$${total}<small> + delivery fee (we'll confirm)</small></b></div>`;
  } else {
    totRows += `<div class="rv-tot"><span>Total</span><b>$${total}<small> no fee</small></b></div>`;
  }
  reviewEl.innerHTML = `
    <div class="rv-mode">${orderMode} order</div>
    <ul class="rv-cookies">${lines}</ul>
    ${totRows}
    <div class="rv-details">
      <div class="rv-row"><span>Name</span><b>${g("Name")}</b></div>
      ${addrRow}
      <div class="rv-row"><span>Contact</span><b>${g("Contact 1")} · ${g("Contact 2")}</b></div>
      <div class="rv-row"><span>Payment</span><b>${g("Payment")}</b></div>
      <div class="rv-row"><span>Needed by</span><b>${niceDate}</b></div>
      ${g("Notes") !== "—" ? `<div class="rv-row"><span>Notes</span><b>${g("Notes")}</b></div>` : ""}
    </div>`;
}

/* ---------- printable receipt (built on successful submit) ---------- */
function buildReceipt(){
  const { count, total } = totals();
  const g = n => (orderForm.querySelector(`[name="${n}"]`)?.value || "—");
  const fee = (orderMode === "Delivery" && delFee.status === "ok") ? delFee.fee : null;
  const rows = FLAVORS.filter(f => qty[f.id] > 0)
    .map(f => `<tr><td>${qty[f.id]} × ${f.name}</td><td>$${f.price}</td><td>$${qty[f.id]*f.price}</td></tr>`).join("");
  const now = new Date();
  let totals_ = `<div class="pr-row"><span>Subtotal · ${count} cookies</span><b>$${total}</b></div>`;
  if(fee != null){
    totals_ += `<div class="pr-row"><span>Delivery (estimated)</span><b>$${fee}</b></div>
      <div class="pr-row pr-grand"><span>Total (estimated)</span><b>$${total + fee}</b></div>`;
  } else {
    totals_ += `<div class="pr-row pr-grand"><span>Total${orderMode === "Delivery" ? " (before delivery fee)" : ""}</span><b>$${total}</b></div>`;
  }
  document.getElementById("printReceipt").innerHTML = `
    <h2>Cookies by DD &amp; Alexa</h2>
    <p class="pr-sub">Order receipt · placed ${now.toLocaleDateString([], { month:"long", day:"numeric", year:"numeric" })} at ${now.toLocaleTimeString([], { hour:"numeric", minute:"2-digit" })}</p>
    <table class="pr-table">
      <thead><tr><th>Item</th><th>Each</th><th>Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${totals_}
    <div class="pr-meta">
      <p><b>${orderMode}</b> · needed by ${fmtDate(g("Date Needed"))}</p>
      <p>${g("Name")}</p>
      ${orderMode === "Delivery" ? `<p>${g("Address")}</p>` : ""}
      <p>${g("Contact 1")}${g("Contact 2") !== "—" ? " · " + g("Contact 2") : ""}</p>
      <p>Payment: ${g("Payment")}</p>
      ${g("Notes") !== "—" ? `<p>Notes: ${g("Notes")}</p>` : ""}
    </div>
    <p class="pr-fine">Final total confirmed when we reach out · cancellations within 24 hours of ordering · thank you! ♥</p>`;
}
document.getElementById("printBtn").addEventListener("click", () => window.print());

/* ---------- open / close ---------- */
function openFlow(){
  flow.classList.add("open");
  document.body.style.overflow = "hidden";
  gotoStep(orderMode ? 2 : 1);
}
function closeFlow(){ flow.classList.remove("open"); document.body.style.overflow = ""; }
function resetFlow(){
  orderForm.reset();
  resetDetailsUI();
  delFee = { status: "idle" };
  feeReqId++;                 // cancel any in-flight lookup
  renderFeeLine();
  orderMode = ""; modeField.value = "";
  FLAVORS.forEach(f => qty[f.id] = 0);
  galleryEl.querySelectorAll(".gcard").forEach(c => {
    c.classList.remove("active");
    c.querySelector("[data-count]").textContent = "0";
    const b = c.querySelector("[data-badge]"); b.textContent = "0"; b.hidden = true;
  });
  flow.querySelectorAll(".method-card").forEach(c => c.classList.remove("chosen"));
  refreshCart();
}

document.addEventListener("click", e => {
  if(e.target.closest("[data-order]")){ e.preventDefault(); resetFlow(); openFlow(); }
});
document.getElementById("flowX").addEventListener("click", closeFlow);
document.getElementById("doneClose").addEventListener("click", closeFlow);
document.addEventListener("keydown", e => { if(e.key === "Escape" && flow.classList.contains("open")) closeFlow(); });

/* ============================================================
   STEP 3 — full-screen calendar (3-day lead time baked in)
   ============================================================ */
const calGrid   = document.getElementById("calGrid");
const calTitle  = document.getElementById("calTitle");
const calPicked = document.getElementById("calPicked");
const calPrev   = document.getElementById("calPrev");
const calNext   = document.getElementById("calNext");
const CAL_MONTHS_AHEAD = 6;

const dayKey = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function calMinDate(){
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + LEAD_DAYS);
  return d;
}
let calMonth = (() => { const m = calMinDate(); return new Date(m.getFullYear(), m.getMonth(), 1); })();

document.getElementById("calHint").textContent =
  "earliest available: " + calMinDate().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

function renderCal(){
  const min = calMinDate();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const minMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const maxMonth = new Date(today.getFullYear(), today.getMonth() + CAL_MONTHS_AHEAD, 1);
  calTitle.textContent = calMonth.toLocaleDateString([], { month: "long", year: "numeric" });
  calPrev.disabled = calMonth <= minMonth;
  calNext.disabled = calMonth >= maxMonth;

  const startPad = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1).getDay();
  const daysIn = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  let html = "";
  for(let i = 0; i < startPad; i++) html += "<span></span>";
  for(let d = 1; d <= daysIn; d++){
    const date = new Date(calMonth.getFullYear(), calMonth.getMonth(), d);
    const k = dayKey(date);
    const cls = ["cal-d",
      k === dateInput.value ? "sel" : "",
      date.getTime() === today.getTime() ? "today" : ""].join(" ").trim();
    html += `<button type="button" class="${cls}" data-day="${k}" ${date < min ? "disabled" : ""}>${d}</button>`;
  }
  calGrid.innerHTML = html;
}
function showPicked(){
  if(!dateInput.value){ calPicked.hidden = true; return; }
  calPicked.hidden = false;
  calPicked.textContent = "♥ " + new Date(dateInput.value + "T12:00")
    .toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}
calPrev.addEventListener("click", () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCal(); });
calNext.addEventListener("click", () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCal(); });
calGrid.addEventListener("click", e => {
  const b = e.target.closest(".cal-d");
  if(!b || b.disabled) return;
  dateInput.value = b.dataset.day;
  showPicked();
  renderCal();
  updateNextState();
});
renderCal();

/* ============================================================
   STEP 4 — contact-method pickers (Call / Text / Instagram)
   ============================================================ */
const CONTACT_META = {
  Call:      { placeholder: "(415) 555-0123", mode: "tel",  label: "What number should we call?" },
  Text:      { placeholder: "(415) 555-0123", mode: "tel",  label: "What number should we text?" },
  Instagram: { placeholder: "@yourhandle",    mode: "text", label: "What's your handle? We'll DM you." },
};
document.querySelectorAll("[data-contact]").forEach(group => {
  const wrap    = group.closest(".field");
  const visible = wrap.querySelector(".cp-input");
  const hiddenF = wrap.querySelector('input[type="hidden"]');
  let method = "";

  group.addEventListener("click", e => {
    const btn = e.target.closest(".cp-btn");
    if(!btn) return;
    const prev = method;
    method = btn.dataset.cm;
    group.querySelectorAll(".cp-btn").forEach(b => b.classList.toggle("on", b === btn));
    if(prev && prev !== method) visible.value = "";
    const meta = CONTACT_META[method];
    visible.hidden = false;
    visible.inputMode = meta.mode;
    visible.placeholder = meta.placeholder;
    if(method === "Instagram" && !visible.value) visible.value = "@";
    sync();
    visible.focus();
  });
  visible.addEventListener("input", sync);

  function sync(){
    const v = visible.value.trim();
    hiddenF.value = v && !(method === "Instagram" && v === "@") ? `${method}: ${v}` : "";
  }
});

/* ---------- payment chips ---------- */
const payChips = document.getElementById("payChips");
const payField = orderForm.querySelector('input[name="Payment"]');
payChips.addEventListener("click", e => {
  const c = e.target.closest(".pay-chip");
  if(!c) return;
  payChips.querySelectorAll(".pay-chip").forEach(x => x.classList.toggle("on", x === c));
  payField.value = c.dataset.pay;
  updateNextState();
});

/* clear the picker UI alongside form.reset() */
function resetDetailsUI(){
  document.querySelectorAll("[data-contact]").forEach(group => {
    const wrap = group.closest(".field");
    group.querySelectorAll(".cp-btn").forEach(b => b.classList.remove("on"));
    wrap.querySelector(".cp-input").hidden = true;
    wrap.querySelector(".cp-input").value = "";
    wrap.querySelector('input[type="hidden"]').value = "";
  });
  payChips.querySelectorAll(".pay-chip").forEach(c => c.classList.remove("on"));
  addrState.value = "FL";
  hideSugs();
  calPicked.hidden = true;
  const m = calMinDate();
  calMonth = new Date(m.getFullYear(), m.getMonth(), 1);
  renderCal();
}

/* ============================================================
   DELIVERY FEE ESTIMATE
   Straight-line miles from the kitchen via free OpenStreetMap
   geocoding; $4 covers the first 2 miles, +$1 per started mile
   after that, past 10 miles we sort it out personally.
   Always an estimate — never blocks the order.
   ============================================================ */
const KITCHEN = { lat: 25.714677, lng: -80.382422 };
const FEE_BASE = 4, FEE_BASE_MILES = 2, FEE_PER_MILE = 1, FEE_MAX_MILES = 10;

function feeForMiles(mi){
  if(mi > FEE_MAX_MILES) return null;                 // outside the zone
  if(mi <= FEE_BASE_MILES) return FEE_BASE;
  return FEE_BASE + Math.ceil((mi - FEE_BASE_MILES) * FEE_PER_MILE);
}
function milesBetween(a, b){
  const R = 3958.8, rad = x => x * Math.PI / 180;     // earth radius in miles
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

let delFee = { status: "idle" };   // idle | loading | ok | far | fail
let feeReqId = 0;
const feeLine = document.getElementById("feeLine");

function renderFeeLine(){
  feeLine.classList.remove("warn");
  if(delFee.status === "loading"){
    feeLine.hidden = false;
    feeLine.textContent = "📍 checking distance…";
  } else if(delFee.status === "ok"){
    feeLine.hidden = false;
    feeLine.textContent = `📍 about ${delFee.miles.toFixed(1)} mi away · estimated delivery fee $${delFee.fee} — we'll confirm`;
  } else if(delFee.status === "far"){
    feeLine.hidden = false;
    feeLine.classList.add("warn");
    feeLine.textContent = `📍 about ${delFee.miles.toFixed(1)} mi away — outside our usual zone, we'll contact you to sort out delivery ♥`;
  } else {
    feeLine.hidden = true;        // idle or lookup failed → quiet fallback
    feeLine.textContent = "";
  }
}

function setFeeFromCoords(lat, lng){
  feeReqId++;                                         // cancel any in-flight text lookup
  const miles = milesBetween(KITCHEN, { lat, lng });
  const fee = feeForMiles(miles);
  delFee = fee == null ? { status: "far", miles } : { status: "ok", miles, fee };
  renderFeeLine();
  if(step === 5) buildReview();
}

async function updateDeliveryFee(){
  if(orderMode !== "Delivery"){ delFee = { status: "idle" }; renderFeeLine(); return; }
  const street = addrStreet.value.trim();
  const q = [street, addrCity.value.trim(), (addrState.value.trim() + " " + addrZip.value.trim()).trim()]
    .filter(Boolean).join(", ");
  if(street.length < 5 || !(addrCity.value.trim() || addrZip.value.trim())){
    delFee = { status: "idle" }; renderFeeLine(); return;
  }
  const id = ++feeReqId;
  delFee = { status: "loading" };
  renderFeeLine();
  try {
    const res = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=" + encodeURIComponent(q));
    const data = await res.json();
    if(id !== feeReqId) return;                       // a newer lookup superseded this one
    if(!Array.isArray(data) || !data.length){
      delFee = { status: "fail" };
    } else {
      const miles = milesBetween(KITCHEN, { lat: +data[0].lat, lng: +data[0].lon });
      const fee = feeForMiles(miles);
      delFee = fee == null ? { status: "far", miles } : { status: "ok", miles, fee };
    }
  } catch(_){
    if(id === feeReqId) delFee = { status: "fail" };
  }
  renderFeeLine();
  if(step === 5) buildReview();                       // refresh the total if they're on review
}

/* ---------- address autocomplete (same free geocoder) ---------- */
let sugTimer, sugReqId = 0;

function hideSugs(){ addrSugs.hidden = true; addrSugs.innerHTML = ""; }

function sugLabel(d){
  const a = d.address || {};
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const city = a.city || a.town || a.village || a.suburb || "";
  return [street || d.display_name.split(",")[0], city, a.postcode].filter(Boolean).join(", ");
}

async function fetchSugs(){
  const id = ++sugReqId;
  const q = [addrStreet.value.trim(), addrCity.value.trim() || "Miami", addrState.value.trim() || "FL"]
    .filter(Boolean).join(", ");
  try {
    const res = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=us&addressdetails=1&q=" + encodeURIComponent(q));
    const data = await res.json();
    if(id !== sugReqId || document.activeElement !== addrStreet) return;
    if(!Array.isArray(data) || !data.length){ hideSugs(); return; }
    addrSugs.innerHTML = data.map((d, i) => `<li data-i="${i}">📍 ${sugLabel(d)}</li>`).join("");
    addrSugs.hidden = false;
    addrSugs._data = data;
  } catch(_){ hideSugs(); }
}

function applySug(d){
  const a = d.address || {};
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  if(street) addrStreet.value = street;
  addrCity.value = a.city || a.town || a.village || a.suburb || addrCity.value;
  if(a.state) addrState.value = a.state === "Florida" ? "FL" : a.state;
  if(a.postcode) addrZip.value = a.postcode;
  composeAddress();
  hideSugs();
  setFeeFromCoords(+d.lat, +d.lon);                   // fee instantly, no second lookup
  updateNextState();
}

addrStreet.addEventListener("input", () => {
  composeAddress();
  clearTimeout(sugTimer);
  if(addrStreet.value.trim().length < 5){ hideSugs(); return; }
  sugTimer = setTimeout(fetchSugs, 450);
});
addrSugs.addEventListener("mousedown", e => {        // mousedown beats the input's blur
  const li = e.target.closest("li");
  if(li && addrSugs._data) applySug(addrSugs._data[+li.dataset.i]);
});
[addrApt, addrCity, addrState, addrZip].forEach(el =>
  el.addEventListener("input", composeAddress));
[addrStreet, addrCity, addrZip].forEach(el =>
  el.addEventListener("change", updateDeliveryFee));
document.addEventListener("click", e => {
  if(!e.target.closest(".addr-street")) hideSugs();
});

/* ---------- submit (Web3Forms) ---------- */
orderForm.addEventListener("submit", async e => {
  e.preventDefault();
  const { count, total } = totals();
  if(count === 0){ alert("Please add at least one cookie. 🍪"); gotoStep(2); return; }
  if(orderMode === "Delivery" && count < DELIVERY_MIN){
    alert(`Delivery needs at least ${DELIVERY_MIN} cookies. Add more or go back and choose pickup.`); gotoStep(2); return;
  }
  if(!dateInput.value){ alert("Please pick the date you need your cookies."); gotoStep(3); return; }
  if(!detailsValid()){ alert("Please fill in all required details."); gotoStep(4); return; }

  const lines = FLAVORS.filter(f => qty[f.id] > 0).map(f => `${qty[f.id]} × ${f.name} ($${f.price})`);
  const fd = new FormData(orderForm);
  fd.append("access_key", WEB3FORMS_KEY);
  fd.append("Cookies", lines.join("\n"));
  fd.append("Total Cookies", String(count));
  fd.append("Estimated Total", `$${total}${orderMode === "Delivery" ? " (before delivery fee)" : ""}`);
  if(orderMode === "Delivery" && (delFee.status === "ok" || delFee.status === "far")){
    fd.append("Distance", delFee.miles.toFixed(1) + " mi");
    fd.append("Delivery Fee", delFee.status === "ok" ? `$${delFee.fee} (est.)` : "TBD — outside zone");
  }

  const original = submitBtn.textContent;
  submitBtn.textContent = "Sending…"; submitBtn.disabled = true;
  try {
    const res = await fetch("https://api.web3forms.com/submit", { method:"POST", body:fd });
    const data = await res.json();
    if(res.ok && data.success){
      saveToSheet(fd);          // best-effort: also record in the Sheet that powers /orders
      buildReceipt();           // ready for the "Print receipt" button
      gotoStep("done");
    }
    else { alert("Hmm, something went wrong: " + (data.message || "please try again.")); }
  } catch(err){
    alert("Couldn't send your order — check your connection and try again, or DM us on Instagram @cookiesbyddalexa.");
  } finally {
    submitBtn.textContent = original; submitBtn.disabled = false;
  }
});

/* Save a copy of the order to the Google Sheet (the /orders dashboard's data source).
   Best-effort & non-blocking: the email via Web3Forms is the source of truth, so a
   Sheet failure never blocks the customer. Uses no-cors (we don't need the response). */
function saveToSheet(fd){
  if(!ORDERS_ENDPOINT) return;        // not configured yet — skip silently
  try {
    fd.append("action", "create");
    fetch(ORDERS_ENDPOINT, { method:"POST", body:fd, mode:"no-cors" }).catch(() => {});
  } catch(_){ /* ignore — order already succeeded via email */ }
}

/* ---------- nav scroll + burger ---------- */
const nav = document.getElementById("nav");
const navlinks = document.getElementById("navlinks");
const totop = document.getElementById("totop");
window.addEventListener("scroll", () => {
  const y = window.scrollY;
  nav.classList.toggle("scrolled", y > 24);
  totop.classList.toggle("show", y > 700);
}, { passive:true });
const burger = document.getElementById("burger");
burger.addEventListener("click", () => { navlinks.classList.toggle("open"); burger.classList.toggle("open"); });
navlinks.addEventListener("click", e => { if(e.target.tagName === "A") navlinks.classList.remove("open"); });
totop.addEventListener("click", () => window.scrollTo({ top:0, behavior:"smooth" }));

/* ---------- reveal on scroll ---------- */
const io = new IntersectionObserver((entries) => {
  entries.forEach(en => { if(en.isIntersecting){ en.target.classList.add("in"); io.unobserve(en.target); } });
}, { threshold:0.12 });
document.querySelectorAll(".reveal").forEach(el => io.observe(el));

/* ---------- floating sparkles in hero ---------- */
const sk = document.getElementById("sparkles");
const cols = ["var(--rose)","var(--blue)","var(--gold)"];
for(let i=0;i<16;i++){
  const s = document.createElement("i");
  s.style.left = Math.random()*100 + "%";
  s.style.top = Math.random()*100 + "%";
  s.style.background = cols[i % cols.length];
  s.style.width = s.style.height = (6 + Math.random()*8) + "px";
  s.style.animationDelay = (Math.random()*5) + "s";
  s.style.animationDuration = (4 + Math.random()*3) + "s";
  sk.appendChild(s);
}
