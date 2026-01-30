import { ui } from "../ui.js";
import { db } from "../db.js";

const DEFAULT_TAGS = ["Élec","Méca","Auto","Pneumatique","Sécurité","Urgent","Récurrent"];

export async function renderNodeView(params){
  const id = params.get("id");
  const node = await db.get("nodes", id);
  if (!node){
    ui.setTitle("Introuvable", "");
    document.getElementById("view").innerHTML = `<div class="card flat"><div class="small">Cet élément n'existe plus.</div></div>`;
    return;
  }

  const levels = await db.getSetting("levels", ["Site","Unité","Ligne","Machine","Équipement"]);
  const levelName = levels[node.level] || `Niveau ${node.level+1}`;

  // Build breadcrumb
  const crumbs = [];
  let cur = node;
  while(cur){
    crumbs.push(cur);
    if (!cur.parentId) break;
    cur = await db.get("nodes", cur.parentId);
  }
  crumbs.reverse();

  const children = await db.childrenOf(node.id);
  const interventions = await db.interventionsForNode(node.id);
  const checklists = await db.checklistsForNode(node.id);
  const templates = await db.globalTemplates();

  ui.setTitle(node.name, `${levelName} • ${children.length} enfant(s) • ${interventions.length} intervention(s)`);

  const el = document.getElementById("view");

  const crumbHtml = crumbs.map((c,i)=>`
    <span class="pill" style="cursor:pointer" data-crumb="${c.id}">${ui.esc(c.name)}</span>
  `).join(" <span class='small'>›</span> ");

  el.innerHTML = `
    <div class="card flat">
      <div class="row" style="align-items:center; justify-content:space-between">
        <div class="row" style="gap:8px; align-items:center">${crumbHtml}</div>
      </div>

      <div class="sep"></div>

      <div class="btnrow">
        <button class="btn primary" id="addChild">➕ Ajouter ${ui.esc(levels[node.level+1] || "Enfant")}</button>
        <button class="btn" id="rename">✏️ Renommer</button>
        <button class="btn danger" id="del">🗑️ Supprimer</button>
      </div>

      <div class="sep"></div>

      <label>Rechercher dans les enfants</label>
      <input id="search" placeholder="Tape pour filtrer…">
      <div class="sep"></div>

      <div id="children" class="list"></div>
    </div>

    <div class="sep"></div>

    <div class="card flat">
      <h3>Nouvelle intervention</h3>

      <div class="form2">
        <div>
          <label>Type</label>
          <select id="category">
            <option value="panne">Panne</option>
            <option value="preventif">Préventif</option>
            <option value="amelioration">Amélioration</option>
          </select>
        </div>
        <div>
          <label>Durée (min)</label>
          <input id="duration" inputmode="numeric" placeholder="Ex: 15">
          <div class="row" style="margin-top:8px">
            <span class="chip" data-addmin="5">+5</span>
            <span class="chip" data-addmin="10">+10</span>
            <span class="chip" data-addmin="15">+15</span>
            <span class="chip" data-addmin="30">+30</span>
          </div>
        </div>
      </div>

      <label>Tags</label>
      <div class="chips" id="tags"></div>

      <label>Symptôme</label>
      <textarea id="symptom" placeholder="Ex: Disjoncteur déclenche, alarme BF, moteur ne démarre pas…"></textarea>

      <label>Action réalisée</label>
      <textarea id="action" placeholder="Ex: Contrôle alim 24V, resserrage bornes, remplacement capteur…"></textarea>

      <label>Cause (option)</label>
      <input id="cause" placeholder="Ex: câble coupé, capteur HS, contacteur collé…">

      <label>Pièces utilisées (option)</label>
      <input id="parts" placeholder="Ex: capteur Keyence LR-ZH500, contacteur 9A…">

      <div class="form2">
        <div>
          <label>Statut</label>
          <select id="status">
            <option value="ok">OK</option>
            <option value="watch">À surveiller</option>
            <option value="wait">En attente pièce</option>
          </select>
        </div>
        <div style="display:flex; align-items:flex-end">
          <button class="btn primary" id="saveInt">Enregistrer</button>
        </div>
      </div>
    </div>

    <div class="sep"></div>

    <div class="card flat">
      <h3>Checklists</h3>
      <div class="btnrow">
        <button class="btn primary" id="attachTpl">➕ Ajouter depuis un modèle</button>
        <button class="btn" id="newChecklist">➕ Nouvelle checklist</button>
      </div>
      <div class="sep"></div>
      <div id="clList" class="list"></div>
    </div>

    <div class="sep"></div>

    <div class="card flat">
      <h3>Historique (ce nœud)</h3>
      <div id="intList" class="list"></div>
    </div>
  `;

  // Breadcrumb navigation
  el.querySelectorAll("[data-crumb]").forEach(x=>{
    x.onclick = ()=> location.hash = `#/node?id=${encodeURIComponent(x.dataset.crumb)}`;
  });

  // children render + search
  const childrenEl = el.querySelector("#children");
  const search = el.querySelector("#search");

  function renderChildren(filter=""){
    const f = filter.trim().toLowerCase();
    const list = children.filter(c => !f || c.name.toLowerCase().includes(f));
    if (!list.length){
      childrenEl.innerHTML = `<div class="small">Aucun enfant${f ? " pour ce filtre" : ""}.</div>`;
      return;
    }
    childrenEl.innerHTML = list.map(c => `
      <div class="item">
        <div class="top">
          <div>
            <div class="name">${ui.esc(c.name)}</div>
            <div class="meta">${ui.esc(levels[c.level] || "Niveau")} • ${ui.esc(new Date(c.createdAt).toLocaleDateString("fr-FR"))}</div>
          </div>
          <button class="btn" data-open="${c.id}" style="flex:0 0 auto; padding:10px 12px">Ouvrir</button>
        </div>
      </div>
    `).join("");
    childrenEl.querySelectorAll("[data-open]").forEach(b=>{
      b.onclick = ()=> location.hash = `#/node?id=${encodeURIComponent(b.dataset.open)}`;
    });
  }
  renderChildren();
  search.addEventListener("input", ()=> renderChildren(search.value));

  // Add child (if not last level)
  el.querySelector("#addChild").onclick = async () => {
    const nextName = levels[node.level+1] || "Enfant";
    const name = await ui.promptText({ title:`Ajouter ${nextName}`, placeholder:`Ex: ${nextName} 1` });
    if (!name) return;
    const newNode = await db.createNode({ parentId: node.id, level: Math.min(node.level+1, levels.length-1), name });
    ui.toast(`${nextName} ajouté.`);
    location.hash = `#/node?id=${encodeURIComponent(node.id)}`; // refresh
  };

  // Rename
  el.querySelector("#rename").onclick = async () => {
    const name = await ui.promptText({ title:`Renommer ${levelName}`, value: node.name });
    if (!name) return;
    await db.updateNode(node.id, { name });
    ui.toast("Renommé.");
    location.hash = `#/node?id=${encodeURIComponent(node.id)}`;
  };

  // Delete cascade
  el.querySelector("#del").onclick = async () => {
    const ok = await ui.confirmDanger({
      title: `Supprimer ${levelName}`,
      message: "Supprime cet élément, tous ses enfants, et l'historique associé.",
      phrase: "SUPPRIMER"
    });
    if (!ok) return;
    await db.deleteNodeCascade(node.id);
    ui.toast("Suppression faite.");
    if (node.parentId) location.hash = `#/node?id=${encodeURIComponent(node.parentId)}`;
    else location.hash = "#/usines";
  };

  // tags chips
  const tagsEl = el.querySelector("#tags");
  const selected = new Set();
  tagsEl.innerHTML = DEFAULT_TAGS.map(t=> `<span class="chip" data-tag="${ui.esc(t)}">${ui.esc(t)}</span>`).join("");
  tagsEl.querySelectorAll("[data-tag]").forEach(ch=>{
    ch.onclick = ()=>{
      const tag = ch.dataset.tag;
      if (selected.has(tag)) selected.delete(tag); else selected.add(tag);
      ch.classList.toggle("on", selected.has(tag));
    };
  });

  // +minutes chips
  el.querySelectorAll("[data-addmin]").forEach(ch=>{
    ch.onclick = ()=>{
      const add = Number(ch.dataset.addmin);
      const inp = el.querySelector("#duration");
      const curv = Number(inp.value || 0);
      inp.value = String(curv + add);
    };
  });

  // Save intervention
  el.querySelector("#saveInt").onclick = async () => {
    const data = {
      nodeId: node.id,
      category: el.querySelector("#category").value,
      durationMin: el.querySelector("#duration").value,
      symptom: el.querySelector("#symptom").value,
      action: el.querySelector("#action").value,
      cause: el.querySelector("#cause").value,
      parts: el.querySelector("#parts").value,
      status: el.querySelector("#status").value,
      tags: Array.from(selected)
    };
    if (!data.symptom && !data.action){
      ui.toast("Ajoute au moins un symptôme ou une action.");
      return;
    }
    await db.addIntervention(data);
    ui.toast("Intervention enregistrée.");
    location.hash = `#/node?id=${encodeURIComponent(node.id)}`;
  };

  // Render interventions list
  const intList = el.querySelector("#intList");
  if (!interventions.length){
    intList.innerHTML = `<div class="small">Aucune intervention sur cet élément pour l’instant.</div>`;
  } else {
    intList.innerHTML = interventions.map(r => `
      <div class="item">
        <div class="top">
          <div>
            <div class="name">${ui.esc((r.category||"").toUpperCase())} • ${ui.esc(r.durationMin)} min</div>
            <div class="meta">${ui.esc(ui.formatDate(r.createdAt))} ${r.tags?.length ? " • " + ui.esc(r.tags.join(", ")) : ""}</div>
          </div>
          ${ui.statusBadge(r.status)}
        </div>
        <div class="meta"><b>Symptôme:</b> ${ui.esc(r.symptom || "—")}<br><b>Action:</b> ${ui.esc(r.action || "—")}${r.cause ? `<br><b>Cause:</b> ${ui.esc(r.cause)}` : ""}${r.parts ? `<br><b>Pièces:</b> ${ui.esc(r.parts)}` : ""}</div>
      </div>
    `).join("");
  }

  // Checklists
  const clList = el.querySelector("#clList");
  function renderChecklists(){
    if (!checklists.length){
      clList.innerHTML = `<div class="small">Aucune checklist liée à cet élément.</div>`;
      return;
    }
    clList.innerHTML = checklists.map(c => `
      <div class="item">
        <div class="top">
          <div>
            <div class="name">✅ ${ui.esc(c.title)}</div>
            <div class="meta">${ui.esc(c.items.filter(i=>i.checked).length)} / ${ui.esc(c.items.length)} cochés</div>
          </div>
          <button class="btn" data-opencl="${c.id}" style="flex:0 0 auto; padding:10px 12px">Ouvrir</button>
        </div>
      </div>
    `).join("");
    clList.querySelectorAll("[data-opencl]").forEach(b=>{
      b.onclick = async ()=>{
        const c = await db.get("checklists", b.dataset.opencl);
        await openChecklistModal(c);
      };
    });
  }
  renderChecklists();

  async function openChecklistModal(c){
    ui.modal(`
      <h3 style="margin:0 0 8px">${ui.esc(c.title)}</h3>
      <div id="items" class="list"></div>
      <div class="sep"></div>
      <div class="btnrow">
        <button class="btn" id="reset">Réinitialiser</button>
        <button class="btn danger" id="delete">Supprimer</button>
      </div>
      <div class="sep"></div>
      <button class="btn primary" id="close">Fermer</button>
    `);

    const itemsEl = document.getElementById("items");
    function draw(){
      itemsEl.innerHTML = c.items.map((it, idx)=>`
        <div class="item" style="cursor:pointer" data-idx="${idx}">
          <div class="top">
            <div class="name">${it.checked ? "☑︎" : "☐"} ${ui.esc(it.text)}</div>
          </div>
        </div>
      `).join("");
      itemsEl.querySelectorAll("[data-idx]").forEach(x=>{
        x.onclick = async ()=>{
          const idx = Number(x.dataset.idx);
          c.items[idx].checked = !c.items[idx].checked;
          c.updatedAt = Date.now();
          await db.put("checklists", c);
          draw();
        };
      });
    }
    draw();

    document.getElementById("close").onclick = ()=> { ui.closeModal(); location.hash = `#/node?id=${encodeURIComponent(node.id)}`; };
    document.getElementById("reset").onclick = async ()=>{
      c.items.forEach(i=> i.checked = false);
      c.updatedAt = Date.now();
      await db.put("checklists", c);
      ui.toast("Checklist réinitialisée.");
      draw();
    };
    document.getElementById("delete").onclick = async ()=>{
      const ok = await ui.confirmDanger({ title:"Supprimer checklist", message:"Cette checklist sera supprimée.", phrase:"SUPPRIMER" });
      if (!ok) return;
      await db.del("checklists", c.id);
      ui.closeModal();
      ui.toast("Checklist supprimée.");
      location.hash = `#/node?id=${encodeURIComponent(node.id)}`;
    };
  }

  // attach from template
  el.querySelector("#attachTpl").onclick = async ()=>{
    ui.modal(`
      <h3 style="margin:0 0 8px">Ajouter un modèle</h3>
      <div class="list">
        ${templates.map(t=>`
          <div class="item" style="cursor:pointer" data-tpl="${t.id}">
            <div class="top">
              <div>
                <div class="name">📋 ${ui.esc(t.title)}</div>
                <div class="meta">${ui.esc(t.items.length)} items</div>
              </div>
              <span class="badge">Modèle</span>
            </div>
          </div>
        `).join("")}
      </div>
      <div class="sep"></div>
      <button class="btn" id="cancel">Annuler</button>
    `);
    document.getElementById("cancel").onclick = ui.closeModal;
    document.querySelectorAll("[data-tpl]").forEach(x=>{
      x.onclick = async ()=>{
        const tpl = templates.find(t=>t.id === x.dataset.tpl);
        const title = tpl.title;
        const items = tpl.items.map(i=> i.text);
        await db.setChecklistForNode(node.id, title, items);
        ui.closeModal();
        ui.toast("Checklist ajoutée.");
        location.hash = `#/node?id=${encodeURIComponent(node.id)}`;
      };
    });
  };

  // new checklist
  el.querySelector("#newChecklist").onclick = async ()=>{
    const title = await ui.promptText({ title:"Nouvelle checklist", placeholder:"Ex: Contrôle hebdo convoyeur" });
    if (!title) return;
    const raw = await ui.promptText({ title:"Items (séparés par ;)", label:"Liste", placeholder:"Ex: Graissage ; Tension chaîne ; Capteurs OK", value:"" });
    if (!raw) return;
    const items = raw.split(";").map(s=>s.trim()).filter(Boolean);
    if (!items.length){
      ui.toast("Ajoute au moins 1 item.");
      return;
    }
    await db.setChecklistForNode(node.id, title, items);
    ui.toast("Checklist créée.");
    location.hash = `#/node?id=${encodeURIComponent(node.id)}`;
  };
}
