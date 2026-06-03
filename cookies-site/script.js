/* ============================================================
   Cookies by DD & Alexa — interactions
   ============================================================ */
const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSdUm4Wdt3ejePMi-4g_iiV3i01OQDEIl9a594tY6dqjOJHayw/viewform";

/* ---------- flavor data ---------- */
const FLAVORS = [
  { id:"chocchip",  name:"Chocolate Chip",            cat:"classic", fav:true,  desc:"The classic. Gooey center, golden edges, loaded with melty chocolate." },
  { id:"monster",   name:"Monster Cookie",            cat:"classic",            desc:"Oats, peanut butter & candy-coated chocolate in every chunky bite." },
  { id:"cinnamon",  name:"Cinnamon Toast Crunch",     cat:"classic",            desc:"Cinnamon-sugar swirl that tastes like Saturday mornings." },
  { id:"lemon",     name:"Lemon Cookie",              cat:"classic",            desc:"Bright, zesty & sunshine-soft with a sweet glaze." },
  { id:"fruity",    name:"Fruity Pebbles",            cat:"fun",     fav:true,  desc:"Crunchy, colorful & ridiculously fun — a cereal-bowl dream." },
  { id:"birthday",  name:"Birthday Cake",             cat:"fun",                desc:"Funfetti sprinkles and a little celebration in every bite." },
  { id:"strawberry",name:"Strawberry Crunch",         cat:"fun",                desc:"Strawberry shortcake crumble over a soft, buttery base." },
  { id:"redvelvet", name:"Red Velvet",                cat:"fun",                desc:"Cocoa-kissed & tender with a cream cheese heart." },
  { id:"cookiescream",name:"Cookies & Cream",         cat:"rich",    fav:true,  desc:"Crushed sandwich cookies folded into sweet vanilla dough." },
  { id:"dubai",     name:"Dubai Chocolate Brownie",   cat:"rich",    isNew:true,desc:"Pistachio & crispy kataifi meets a fudgy chocolate brownie cookie." },
  { id:"smores",    name:"S'mores",                   cat:"rich",               desc:"Toasted marshmallow, graham crumble & melty chocolate." },
  { id:"caramel",   name:"Salted Caramel Cheesecake", cat:"rich",               desc:"Buttery caramel swirl over a creamy cheesecake center." },
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
    <div class="ph"><img src="assets/flavors/${f.id}.png" alt="${f.name} cookie" loading="lazy" /></div>
    <div class="flavor-body">
      <h3>${f.name}</h3>
      <p>${f.desc}</p>
      <div class="flavor-foot">
        <a class="order-link" data-order>Add to order →</a>
      </div>
    </div>
  </article>`;
}
grid.innerHTML = FLAVORS.map(flavorCard).join("");

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

/* ---------- order modal ---------- */
const modal = document.getElementById("modal");
const openModal = () => { modal.classList.add("open"); document.body.style.overflow = "hidden"; };
const closeModal = () => { modal.classList.remove("open"); document.body.style.overflow = ""; };

document.addEventListener("click", e => {
  if(e.target.closest("[data-order]")){ e.preventDefault(); openModal(); }
  if(e.target.closest("[data-form-go]")){ window.open(FORM_URL, "_blank", "noopener"); closeModal(); }
});
document.getElementById("modalX").addEventListener("click", closeModal);
modal.addEventListener("click", e => { if(e.target === modal) closeModal(); });
document.addEventListener("keydown", e => { if(e.key === "Escape") closeModal(); });

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
