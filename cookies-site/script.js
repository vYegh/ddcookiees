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
const addrField = orderForm.querySelector("[data-addr-field]");
const addrInput = addrField.querySelector("input");

const cartCount = document.getElementById("cartCount");
const cartTotal = document.getElementById("cartTotal");
const cartMin   = document.getElementById("cartMin");
const flowFoot  = document.getElementById("flowFoot");
const backBtn   = document.getElementById("flowBack");
const nextBtn   = document.getElementById("flowNext");
const submitBtn = document.getElementById("flowSubmit");

const STEPS = [1, 2, 3, 4];          // numbered steps (success handled separately)
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
  const last = n === 4;
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
  if(step === 3) ok = detailsValid();
  nextBtn.classList.toggle("blocked", !ok);
  nextBtn.disabled = !ok;
  if(step === 4) submitBtn.disabled = !document.getElementById("acceptBox").checked;
}

function detailsValid(){
  const need = ['Name','Contact 1','Contact 2','Payment','Date Needed'];
  for(const n of need){ const el = orderForm.querySelector(`[name="${n}"]`); if(!el.value.trim()) return false; }
  if(orderMode === "Delivery" && !addrInput.value.trim()) return false;
  return true;
}
orderForm.addEventListener("input", () => { if(step === 3) updateNextState(); });

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
  addrInput.required = isDelivery;
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

/* ---------- review (step 4) ---------- */
function buildReview(){
  const { count, total } = totals();
  const lines = FLAVORS.filter(f => qty[f.id] > 0)
    .map(f => `<li><span>${qty[f.id]} × ${f.name}</span><b>$${qty[f.id]*f.price}</b></li>`).join("");
  const g = n => (orderForm.querySelector(`[name="${n}"]`)?.value || "—");
  const addrRow = orderMode === "Delivery" ? `<div class="rv-row"><span>Address</span><b>${g("Address")}</b></div>` : "";
  reviewEl.innerHTML = `
    <div class="rv-mode">${orderMode} order</div>
    <ul class="rv-cookies">${lines}</ul>
    <div class="rv-tot"><span>${count} cookies</span><b>$${total}<small> + ${orderMode === "Delivery" ? "delivery fee" : "no fee"}</small></b></div>
    <div class="rv-details">
      <div class="rv-row"><span>Name</span><b>${g("Name")}</b></div>
      ${addrRow}
      <div class="rv-row"><span>Contact</span><b>${g("Contact 1")} · ${g("Contact 2")}</b></div>
      <div class="rv-row"><span>Payment</span><b>${g("Payment")}</b></div>
      <div class="rv-row"><span>Needed by</span><b>${g("Date Needed")}</b></div>
      ${g("Notes") !== "—" ? `<div class="rv-row"><span>Notes</span><b>${g("Notes")}</b></div>` : ""}
    </div>`;
}

/* ---------- open / close ---------- */
function openFlow(){
  flow.classList.add("open");
  document.body.style.overflow = "hidden";
  gotoStep(orderMode ? 2 : 1);
}
function closeFlow(){ flow.classList.remove("open"); document.body.style.overflow = ""; }
function resetFlow(){
  orderForm.reset();
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

/* date floor: at least LEAD_DAYS out */
(function setDateFloor(){
  const d = new Date(); d.setDate(d.getDate() + LEAD_DAYS);
  dateInput.min = d.toISOString().split("T")[0];
})();

/* ---------- submit (Web3Forms) ---------- */
orderForm.addEventListener("submit", async e => {
  e.preventDefault();
  const { count, total } = totals();
  if(count === 0){ alert("Please add at least one cookie. 🍪"); gotoStep(2); return; }
  if(orderMode === "Delivery" && count < DELIVERY_MIN){
    alert(`Delivery needs at least ${DELIVERY_MIN} cookies. Add more or go back and choose pickup.`); gotoStep(2); return;
  }
  if(!detailsValid()){ alert("Please fill in all required details."); gotoStep(3); return; }

  const lines = FLAVORS.filter(f => qty[f.id] > 0).map(f => `${qty[f.id]} × ${f.name} ($${f.price})`);
  const fd = new FormData(orderForm);
  fd.append("access_key", WEB3FORMS_KEY);
  fd.append("Cookies", lines.join("\n"));
  fd.append("Total Cookies", String(count));
  fd.append("Estimated Total", `$${total}${orderMode === "Delivery" ? " (before delivery fee)" : ""}`);

  const original = submitBtn.textContent;
  submitBtn.textContent = "Sending…"; submitBtn.disabled = true;
  try {
    const res = await fetch("https://api.web3forms.com/submit", { method:"POST", body:fd });
    const data = await res.json();
    if(res.ok && data.success){
      saveToSheet(fd);          // best-effort: also record in the Sheet that powers /orders
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
