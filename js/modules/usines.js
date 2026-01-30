import { ui } from "../ui.js";
import { db } from "../db.js";

export async function renderUsines(){
  const levels = await db.getSetting("levels", ["Site","Unité","Ligne","Machine","Équipement"]);
  ui.setTitle("Usines", "Arborescence editable • Offline");

  const el = document.getElementById("view");
  const roots = (await db.childrenOf(null)).filter(n => n.level === 0);

  el.innerHTML = `
    <div class="card flat">
      <div class="btnrow">
        <button class="btn primary" id="addSite">➕ Ajouter ${ui.esc(levels[0] || "Site")}</button>
        <button class="btn" id="how">ℹ︎ Aide</button>
      </div>
      <div class="sep"></div>
      ${roots.length ? `<div class="list">
        ${roots.map(s => `
          <div class="item">
            <div class="top">
              <div>
                <div class="name">🏭 ${ui.esc(s.name)}</div>
                <div class="meta">${ui.esc(levels[0])} • Créé le ${ui.esc(new Date(s.createdAt).toLocaleDateString("fr-FR"))}</div>
              </div>
              <button class="btn" data-open="${s.id}" style="flex:0 0 auto; padding:10px 12px">Ouvrir</button>
            </div>
          </div>
        `).join("")}
      </div>` : `<div class="small">Aucun ${ui.esc(levels[0])} pour l’instant. Ajoute-en un.</div>`}
    </div>
  `;

  el.querySelector("#addSite").onclick = async ()=>{
    const name = await ui.promptText({ title:`Ajouter ${levels[0]}`, placeholder:"Ex: Usine B" });
    if (!name) return;
    await db.createNode({ parentId: null, level: 0, name });
    ui.toast(`${levels[0]} ajouté.`);
    renderUsines();
  };

  el.querySelector("#how").onclick = ()=>{
    ui.modal(`
      <h3 style="margin:0 0 8px">Comment ça marche</h3>
      <p class="small">Tu crées ton arborescence manuellement : <b>${levels.join(" → ")}</b>. À chaque niveau tu peux ajouter, renommer, supprimer. Sur une machine/équipement, tu ajoutes des interventions + checklists.</p>
      <div class="sep"></div>
      <button class="btn primary" id="ok">OK</button>
    `);
    document.getElementById("ok").onclick = ui.closeModal;
  };

  el.querySelectorAll("[data-open]").forEach(b=>{
    b.onclick = ()=> location.hash = `#/node?id=${encodeURIComponent(b.dataset.open)}`;
  });
}
