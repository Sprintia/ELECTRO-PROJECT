import { ui } from "../ui.js";
import { db } from "../db.js";

export async function renderHistory(){
  ui.setTitle("Historique", "Toutes les interventions (récent → ancien)");

  const el = document.getElementById("view");
  const recents = await db.recentInterventions(200);
  const nodes = await db.all("nodes");
  const byId = new Map(nodes.map(n => [n.id, n]));

  el.innerHTML = `
    <div class="card flat">
      <label>Filtrer (texte)</label>
      <input id="q" placeholder="Ex: SFA 36, moteur, BF, capteur…">
      <div class="sep"></div>
      <div id="list" class="list"></div>
      <div class="sep"></div>
      <div class="small">Total: <b id="count"></b></div>
    </div>
  `;

  const q = el.querySelector("#q");
  const list = el.querySelector("#list");
  const count = el.querySelector("#count");

  function nodePath(nodeId){
    const parts = [];
    let cur = byId.get(nodeId);
    while(cur){
      parts.push(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : null;
    }
    return parts.reverse().join(" › ");
  }

  function render(filter=""){
    const f = filter.trim().toLowerCase();
    const filtered = recents.filter(r=>{
      const path = nodePath(r.nodeId).toLowerCase();
      const txt = `${r.category} ${r.symptom} ${r.action} ${r.cause} ${r.parts} ${(r.tags||[]).join(" ")} ${path}`.toLowerCase();
      return !f || txt.includes(f);
    });
    count.textContent = String(filtered.length);

    if (!filtered.length){
      list.innerHTML = `<div class="small">Aucun résultat.</div>`;
      return;
    }
    list.innerHTML = filtered.map(r=>{
      const path = nodePath(r.nodeId);
      return `
        <div class="item">
          <div class="top">
            <div>
              <div class="name">${ui.esc((r.category||"").toUpperCase())} • ${ui.esc(r.durationMin)} min</div>
              <div class="meta">${ui.esc(ui.formatDate(r.createdAt))} • <span style="cursor:pointer; text-decoration:underline" data-node="${r.nodeId}">${ui.esc(path)}</span></div>
            </div>
            ${ui.statusBadge(r.status)}
          </div>
          <div class="meta"><b>Symptôme:</b> ${ui.esc(r.symptom || "—")}<br><b>Action:</b> ${ui.esc(r.action || "—")}${r.cause ? `<br><b>Cause:</b> ${ui.esc(r.cause)}` : ""}${r.parts ? `<br><b>Pièces:</b> ${ui.esc(r.parts)}` : ""}</div>
        </div>
      `;
    }).join("");

    list.querySelectorAll("[data-node]").forEach(x=>{
      x.onclick = ()=> location.hash = `#/node?id=${encodeURIComponent(x.dataset.node)}`;
    });
  }

  render();
  q.addEventListener("input", ()=> render(q.value));
}
