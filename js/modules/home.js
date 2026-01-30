import { ui } from "../ui.js";
import { db } from "../db.js";

export async function renderHome(){
  ui.setTitle("Electro Terrain", "V1 • Terrain • Offline");

  const el = document.getElementById("view");
  const recent = await db.recentInterventions(5);

  el.innerHTML = `
    <div class="grid">
      <button class="bigbtn" data-go="#/tools">
        <span class="left"><span style="font-size:20px">⚙︎</span><span><b>Outils</b><div class="small">Élec • Méca • Auto (V1: base)</div></span></span>
        <span class="pill">V1</span>
      </button>

      <button class="bigbtn" data-go="#/usines">
        <span class="left"><span style="font-size:20px">🏭</span><span><b>Usines</b><div class="small">Arborescence • Interventions • Checklists</div></span></span>
        <span class="pill">Offline</span>
      </button>

      <button class="bigbtn" data-go="#/history">
        <span class="left"><span style="font-size:20px">🕘</span><span><b>Historique global</b><div class="small">Dernières interventions</div></span></span>
        <span class="pill">5</span>
      </button>

      <button class="bigbtn" data-go="#/settings">
        <span class="left"><span style="font-size:20px">☰</span><span><b>Réglages</b><div class="small">Niveaux • Données • UI</div></span></span>
        <span class="pill">⚙️</span>
      </button>
    </div>

    <div class="sep"></div>

    <div class="card flat">
      <h3>Dernières interventions</h3>
      ${recent.length ? `<div class="list">${recent.map(r => `
        <div class="item">
          <div class="top">
            <div>
              <div class="name">${ui.esc(r.category.toUpperCase())}</div>
              <div class="meta">${ui.esc(ui.formatDate(r.createdAt))} • ${ui.esc(r.durationMin)} min</div>
            </div>
            ${ui.statusBadge(r.status)}
          </div>
          <div class="meta">${ui.esc(r.symptom || "—")}<br>${ui.esc(r.action || "")}</div>
        </div>
      `).join("")}</div>` : `<div class="small">Aucune intervention enregistrée pour l’instant.</div>`}
      <div class="sep"></div>
      <button class="btn primary" id="goHistory">Ouvrir l’historique</button>
    </div>

    <div class="sep"></div>

    <div class="notice">
      <b>Astuce</b> : sur iPhone, ouvre dans Safari puis <span class="kbd">Partager</span> → <span class="kbd">Sur l’écran d’accueil</span> pour l’installer comme une vraie app.
    </div>
  `;

  el.querySelectorAll("[data-go]").forEach(b => b.onclick = () => location.hash = b.dataset.go);
  el.querySelector("#goHistory").onclick = ()=> location.hash = "#/history";
}
