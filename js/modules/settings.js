import { ui } from "../ui.js";
import { db } from "../db.js";

export async function renderSettings(){
  ui.setTitle("Réglages", "Niveaux d’arborescence • Données");

  const el = document.getElementById("view");
  const levels = await db.getSetting("levels", ["Site","Unité","Ligne","Machine","Équipement"]);

  el.innerHTML = `
    <div class="card flat">
      <h3>Niveaux (Usines)</h3>
      <p class="small">Tu peux renommer les niveaux pour coller à ton terrain. Exemple : Site → Atelier → Ligne → Machine → Sous-ensemble.</p>
      <div id="levels"></div>
      <div class="sep"></div>
      <button class="btn primary" id="save">Enregistrer</button>
    </div>

    <div class="sep"></div>

    <div class="card flat">
      <h3>Données</h3>
      <div class="btnrow">
        <button class="btn primary" id="backup">Exporter / Importer</button>
        <button class="btn danger" id="reset">Réinitialiser</button>
      </div>
      <div class="sep"></div>
      <div class="small">⚠️ Réinitialiser efface tout (arborescence, interventions, checklists).</div>
    </div>

    <div class="sep"></div>

    <div class="notice">
      <b>Conseil</b> : fais un export de temps en temps (sauvegarde JSON).
    </div>
  `;

  const box = el.querySelector("#levels");
  box.innerHTML = levels.map((v,i)=>`
    <label>Niveau ${i+1}</label>
    <input data-lvl="${i}" value="${ui.esc(v)}" placeholder="Nom du niveau">
  `).join("");

  el.querySelector("#save").onclick = async ()=>{
    const newLevels = Array.from(el.querySelectorAll("[data-lvl]"))
      .map(inp => inp.value.trim())
      .filter(Boolean);
    if (newLevels.length < 2){
      ui.toast("Garde au moins 2 niveaux.");
      return;
    }
    await db.setSetting("levels", newLevels);
    ui.toast("Réglages enregistrés.");
    location.hash = "#/usines";
  };

  el.querySelector("#backup").onclick = async ()=>{
    await ui.showBackupModal();
  };

  el.querySelector("#reset").onclick = async ()=>{
    const ok = await ui.confirmDanger({
      title: "Réinitialiser l'app",
      message: "Tout sera effacé et on remettra les données d'exemple (Usine A + SFA).",
      phrase: "RESET"
    });
    if (!ok) return;

    // wipe stores
    for (const store of ["settings","nodes","interventions","checklists"]){
      const all = await db.all(store);
      for (const item of all){
        await db.del(store, item.key || item.id);
      }
    }
    await db.setSetting("seeded", false);
    await db.ensureSeed();
    ui.toast("Réinitialisé.");
    location.hash = "#/usines";
  };
}
