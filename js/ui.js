import { db } from "./db.js";

const modalRoot = document.getElementById("modalRoot");
const viewTitle = document.getElementById("viewTitle");
const viewSubtitle = document.getElementById("viewSubtitle");

function esc(s=""){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

function formatDate(ts){
  const d = new Date(ts);
  const pad = n => String(n).padStart(2,"0");
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusBadge(status){
  if (status === "ok") return `<span class="badge ok">OK</span>`;
  if (status === "watch") return `<span class="badge warn">À surveiller</span>`;
  if (status === "wait") return `<span class="badge wait">Attente pièce</span>`;
  return `<span class="badge">—</span>`;
}

function setTitle(title, subtitle=""){
  viewTitle.textContent = title || "";
  viewSubtitle.textContent = subtitle || "";
}

function modal(html){
  modalRoot.innerHTML = `
    <div class="modal-overlay" style="position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; align-items:flex-end; justify-content:center; z-index:50; padding: 14px;">
      <div class="modal card" style="width:min(720px, 100%); max-height: 86vh; overflow:auto;">
        ${html}
      </div>
    </div>`;
  const ov = modalRoot.querySelector(".modal-overlay");
  ov.addEventListener("click", (e)=>{
    if (e.target === ov) closeModal();
  });
}

function closeModal(){ modalRoot.innerHTML = ""; }

function toast(msg){
  const t = document.createElement("div");
  t.className = "card flat";
  t.style.position = "fixed";
  t.style.left = "14px";
  t.style.right = "14px";
  t.style.bottom = "96px";
  t.style.zIndex = "60";
  t.style.boxShadow = "0 16px 40px rgba(0,0,0,.45)";
  t.innerHTML = `<div style="font-weight:700">${esc(msg)}</div>`;
  document.body.appendChild(t);
  setTimeout(()=>{ t.style.opacity="0"; t.style.transition="opacity .2s"; }, 1800);
  setTimeout(()=> t.remove(), 2200);
}

async function confirmDanger({ title="Confirmer", message="Êtes-vous sûr ?", phrase="SUPPRIMER" }){
  return await new Promise((resolve) => {
    modal(`
      <h3 style="margin:0 0 8px">${esc(title)}</h3>
      <p class="small">${esc(message)}</p>
      <div class="sep"></div>
      <label>Tape <span class="kbd">${esc(phrase)}</span> pour confirmer</label>
      <input id="confirmInput" placeholder="${phrase}">
      <div class="btnrow" style="margin-top:12px">
        <button class="btn" id="cancelBtn">Annuler</button>
        <button class="btn danger" id="okBtn" disabled>Supprimer</button>
      </div>
    `);
    const input = modalRoot.querySelector("#confirmInput");
    const okBtn = modalRoot.querySelector("#okBtn");
    modalRoot.querySelector("#cancelBtn").onclick = ()=>{ closeModal(); resolve(false); };
    input.addEventListener("input", ()=>{
      okBtn.disabled = (input.value.trim().toUpperCase() !== phrase);
    });
    okBtn.onclick = ()=>{ closeModal(); resolve(true); };
    input.focus();
  });
}

async function promptText({ title="Ajouter", label="Nom", placeholder="", value="" }){
  return await new Promise((resolve) => {
    modal(`
      <h3 style="margin:0 0 8px">${esc(title)}</h3>
      <label>${esc(label)}</label>
      <input id="p" placeholder="${esc(placeholder)}" value="${esc(value)}">
      <div class="btnrow" style="margin-top:12px">
        <button class="btn" id="cancel">Annuler</button>
        <button class="btn primary" id="ok">Valider</button>
      </div>
    `);
    const p = modalRoot.querySelector("#p");
    modalRoot.querySelector("#cancel").onclick = ()=>{ closeModal(); resolve(null); };
    modalRoot.querySelector("#ok").onclick = ()=>{
      const v = p.value.trim();
      closeModal();
      resolve(v || null);
    };
    p.addEventListener("keydown", (e)=>{
      if (e.key === "Enter") modalRoot.querySelector("#ok").click();
    });
    p.focus();
    p.select();
  });
}

async function showBackupModal(){
  const payload = await db.exportAll();
  modal(`
    <h3 style="margin:0 0 8px">Sauvegarde</h3>
    <p class="small">Recommandé avant de gros changements ou si ton iPhone manque de stockage. Le fichier est un JSON exportable/importable.</p>
    <div class="sep"></div>
    <div class="btnrow">
      <button class="btn primary" id="exportBtn">Exporter mes données</button>
      <button class="btn" id="importBtn">Importer</button>
    </div>
    <div class="sep"></div>
    <button class="btn" id="closeBtn">Fermer</button>
  `);

  modalRoot.querySelector("#closeBtn").onclick = closeModal;

  modalRoot.querySelector("#exportBtn").onclick = async () => {
    const data = await db.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
    const a = document.createElement("a");
    const ts = new Date().toISOString().slice(0,19).replaceAll(":","-");
    a.download = `electro-terrain-backup-${ts}.json`;
    a.href = URL.createObjectURL(blob);
    a.click();
    setTimeout(()=> URL.revokeObjectURL(a.href), 2000);
    toast("Export lancé.");
  };

  modalRoot.querySelector("#importBtn").onclick = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const txt = await file.text();
      try{
        const json = JSON.parse(txt);
        const ok = await confirmDanger({
          title: "Importer une sauvegarde",
          message: "Cela écrase toutes les données actuelles de l'app.",
          phrase: "IMPORTER"
        });
        if (!ok) return;
        await db.importAll(json);
        closeModal();
        toast("Import terminé.");
        location.hash = "#/usines";
      }catch(e){
        toast("Import impossible: fichier invalide.");
      }
    };
    input.click();
  };
}

export const ui = {
  esc, setTitle, formatDate, statusBadge,
  toast, modal, closeModal,
  confirmDanger, promptText,
  showBackupModal
};
