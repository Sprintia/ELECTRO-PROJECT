import { ui } from "../ui.js";

export async function renderTools(){
  ui.setTitle("Outils", "V1: base (on enrichit en V2)");

  const el = document.getElementById("view");
  el.innerHTML = `
    <div class="card flat">
      <h3>V1</h3>
      <p class="small">Cette V1 se concentre sur <b>Usines</b>, interventions, checklists et offline. Les calculateurs Élec/Méca/Auto arrivent en V2/V3.</p>
      <div class="sep"></div>
      <div class="grid">
        <div class="card flat">
          <h3>Électrique</h3>
          <p>Convertisseurs, loi d’Ohm, tri, chute de tension, sections…</p>
        </div>
        <div class="card flat">
          <h3>Mécanique</h3>
          <p>Roulements, pas ISO, perçage taraudage, couples…</p>
        </div>
        <div class="card flat">
          <h3>Automatisme</h3>
          <p>Base défauts Step7, Sinamics/Micromaster, procédures…</p>
        </div>
        <div class="card flat">
          <h3>Raccourcis</h3>
          <p>À venir: outils favoris + historique des calculs.</p>
        </div>
      </div>
    </div>
  `;
}
