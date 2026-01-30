import { Router } from "./router.js";
import { db } from "./db.js";
import { ui } from "./ui.js";

import { renderHome } from "./modules/home.js";
import { renderUsines } from "./modules/usines.js";
import { renderNodeView } from "./modules/nodeView.js";
import { renderHistory } from "./modules/history.js";
import { renderTools } from "./modules/tools.js";
import { renderSettings } from "./modules/settings.js";

const view = document.getElementById("view");
const backBtn = document.getElementById("backBtn");
const syncBtn = document.getElementById("syncBtn");

// --- Global error catcher (debug) ---
function showErr(err){
  const banner = document.getElementById("errBanner");
  const txt = document.getElementById("errText");
  if (!banner || !txt) return;
  const msg = (err && err.stack) ? err.stack : String(err);
  txt.textContent = msg;
  banner.style.display = "block";
}
window.addEventListener("error", (e)=>{ showErr(e.error || e.message || e); });
window.addEventListener("unhandledrejection", (e)=>{ showErr(e.reason || e); });

const errClose = document.getElementById("errClose");
if (errClose) errClose.onclick = ()=>{ document.getElementById("errBanner").style.display="none"; };
const errCopy = document.getElementById("errCopy");
if (errCopy) errCopy.onclick = async ()=>{
  const t = document.getElementById("errText")?.textContent || "";
  try { await navigator.clipboard.writeText(t); } catch {}
};


function setActiveNav(hash){
  document.querySelectorAll(".navbtn").forEach(b=>{
    const route = b.getAttribute("data-route");
    b.classList.toggle("active", hash.startsWith(route));
  });
}
document.querySelectorAll(".navbtn").forEach(b=>{
  b.addEventListener("click", ()=> location.hash = b.getAttribute("data-route"));
});

backBtn.addEventListener("click", () => history.back());

syncBtn.addEventListener("click", async () => {
  await ui.showBackupModal();
});

// Register SW
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  });
}

const router = new Router();

router.add("/", async () => renderHome());
router.add("/tools", async () => renderTools());
router.add("/usines", async () => renderUsines());
router.add("/node", async (params) => renderNodeView(params));
router.add("/history", async () => renderHistory());
router.add("/settings", async () => renderSettings());

router.onBeforeRender(async () => {
  // show/hide back
  const hash = location.hash || "#/";
  const topLevel = ["#/", "#/tools", "#/usines", "#/history", "#/settings"];
  backBtn.disabled = topLevel.includes(hash.split("?")[0]);
  setActiveNav(hash);
});

router.start(view);

// Init DB and seed demo data on first run
(async () => {
  await db.init();
  await db.ensureSeed();
  router.refresh();
})();
