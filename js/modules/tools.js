import { ui } from "../ui.js";
import { db } from "../db.js";

/**
 * Outils — V4
 * - Électrique (menu par outil)
 * - Mécanique (menu par outil): Pas ISO + perçage taraudage, Roulements, Conversions
 */

function num(x){
  const v = Number(String(x).replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
}
function fmt(x, digits=2){
  if (!Number.isFinite(x)) return "—";
  const s = x.toFixed(digits);
  return s.replace(/\.?0+$/,"");
}
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

// ---------- ELEC HELPERS ----------
function sectionFromCurrentSimple(I){
  if (!Number.isFinite(I) || I <= 0) return null;
  const table = [
    {I:10, s:1.5},{I:16, s:2.5},{I:20, s:4},{I:25, s:6},{I:32, s:10},{I:45, s:16},
    {I:63, s:25},{I:80, s:35},{I:100, s:50},{I:125, s:70},{I:160, s:95},{I:200, s:120},
    {I:250, s:150},{I:315, s:185},
  ];
  for (const r of table){ if (I <= r.I) return r.s; }
  return 240;
}
function resistivity(material){ return (material === "al") ? 0.0282 : 0.0175; } // ohm*mm²/m
function vdrop({system, I, L, S, U, material}){
  const rho = resistivity(material);
  if (![I,L,S,U].every(Number.isFinite)) return null;
  if (I<=0 || L<=0 || S<=0 || U<=0) return null;
  const k = (system === "tri") ? Math.sqrt(3) : 2;
  const du = k * rho * L * I / S;
  const pct = (du / U) * 100;
  return { du, pct };
}
function motorCurrent({sys, U, kW, cosphi, eta}){
  if (![U,kW,cosphi,eta].every(Number.isFinite)) return null;
  if (U<=0 || kW<=0 || cosphi<=0 || eta<=0) return null;
  const Pe = (kW*1000) / eta;
  const k = (sys === "tri") ? Math.sqrt(3) : 1;
  const I = Pe / (k * U * cosphi);
  return { I, Pe };
}
function pickStandard(over){
  const std = [2,3,4,6,10,13,16,20,25,32,40,50,63,80,100,125,160,200,250,315,400];
  for (const s of std){ if (over <= s) return s; }
  return std[std.length-1];
}

// ---------- MECA DATA ----------
const ISO_METRIC = [
  // d, coarse pitch, tap drill (approx d - pitch), common fine pitches
  { d: 2,  coarse: 0.4,  fine:[0.25], tap: 1.6 },
  { d: 2.5,coarse: 0.45, fine:[0.35], tap: 2.05 },
  { d: 3,  coarse: 0.5,  fine:[0.35], tap: 2.5 },
  { d: 4,  coarse: 0.7,  fine:[0.5],  tap: 3.3 },
  { d: 5,  coarse: 0.8,  fine:[0.5],  tap: 4.2 },
  { d: 6,  coarse: 1.0,  fine:[0.75], tap: 5.0 },
  { d: 8,  coarse: 1.25, fine:[1.0],  tap: 6.8 },
  { d: 10, coarse: 1.5,  fine:[1.25,1.0], tap: 8.5 },
  { d: 12, coarse: 1.75, fine:[1.5,1.25], tap: 10.2 },
  { d: 14, coarse: 2.0,  fine:[1.5], tap: 12.0 },
  { d: 16, coarse: 2.0,  fine:[1.5], tap: 14.0 },
  { d: 18, coarse: 2.5,  fine:[2.0,1.5], tap: 15.5 },
  { d: 20, coarse: 2.5,  fine:[2.0,1.5], tap: 17.5 },
  { d: 22, coarse: 2.5,  fine:[2.0,1.5], tap: 19.5 },
  { d: 24, coarse: 3.0,  fine:[2.0], tap: 21.0 },
  { d: 27, coarse: 3.0,  fine:[2.0], tap: 24.0 },
  { d: 30, coarse: 3.5,  fine:[2.0], tap: 26.5 },
];

function showSection(rootEl, group, id){
  rootEl.querySelectorAll(`[data-${group}-section]`).forEach(sec=>{
    sec.style.display = (sec.dataset[`${group}Section`] === id) ? "block" : "none";
  });
  rootEl.querySelectorAll(`[data-${group}-pick]`).forEach(btn=>{
    btn.classList.toggle("active", btn.dataset[`${group}Pick`] === id);
  });
}

export async function renderTools(){
  // FIX V4.1: ensure DOM is fully ready before wiring

  ui.setTitle("Outils", "Électrique + Mécanique");

  const el = document.getElementById("view");
  el.innerHTML = `
    <div class="grid">
      <button class="bigbtn" id="goElec">
        <span class="left"><span style="font-size:20px">⚡</span><span><b>Électrique</b><div class="small">Menu → choisir l’outil</div></span></span>
        <span class="pill">OK</span>
      </button>

      <button class="bigbtn" id="goMeca">
        <span class="left"><span style="font-size:20px">🛠️</span><span><b>Mécanique</b><div class="small">Pas ISO • Roulements • Conversions</div></span></span>
        <span class="pill">V4</span>
      </button>

      <button class="bigbtn" id="goAuto">
        <span class="left"><span style="font-size:20px">🤖</span><span><b>Automatisme</b><div class="small">PLC Siemens • Variateurs SEW • Base défauts</div></span></span>
        <span class="pill">V5</span>
      </button>
    </div>

    <div class="sep"></div>

    <!-- ELEC PANEL -->
    <div id="elecPanel" class="card flat" style="display:none">
      <div class="row" style="justify-content:space-between; align-items:center">
        <h3 style="margin:0">⚡ Électrique</h3>
        <span class="pill">terrain</span>
      </div>
      <div class="sep"></div>

      <div class="row" style="gap:10px; flex-wrap:wrap">
        <button class="navbtn" style="flex:1; min-width:160px" data-elec-pick="conv"><span class="navicon">🔁</span><span class="navtxt">Convertisseurs</span></button>
        <button class="navbtn" style="flex:1; min-width:160px" data-elec-pick="ohm"><span class="navicon">Ω</span><span class="navtxt">Ohm & P</span></button>
        <button class="navbtn" style="flex:1; min-width:160px" data-elec-pick="power"><span class="navicon">√3</span><span class="navtxt">Mono/Tri</span></button>
        <button class="navbtn" style="flex:1; min-width:160px" data-elec-pick="drop"><span class="navicon">📉</span><span class="navtxt">Chute & Section</span></button>
        <button class="navbtn" style="flex:1; min-width:160px" data-elec-pick="motor"><span class="navicon">🧲</span><span class="navtxt">Courant moteur</span></button>
        <button class="navbtn" style="flex:1; min-width:160px" data-elec-pick="prot"><span class="navicon">🛡️</span><span class="navtxt">Protections</span></button>
      </div>

      <div class="sep"></div>

      <div data-elec-section="conv" style="display:none">
        <div class="card flat">
          <h3>Convertisseurs</h3>
          <label>Valeur</label>
          <input id="c_val" placeholder="Ex: 230" inputmode="decimal">
          <label>Type</label>
          <select id="c_type">
            <option value="w_kw">W ↔ kW</option>
            <option value="kw_cv">kW ↔ CV</option>
            <option value="a_ma">A ↔ mA</option>
            <option value="v_kv">V ↔ kV</option>
            <option value="ohm_kohm">Ω ↔ kΩ</option>
            <option value="hz_rpm">Hz ↔ RPM (moteur)</option>
          </select>
          <div id="hzExtra" style="display:none">
            <label>Nombre de pôles</label>
            <select id="poles">
              <option value="2">2 pôles</option>
              <option value="4" selected>4 pôles</option>
              <option value="6">6 pôles</option>
              <option value="8">8 pôles</option>
            </select>
            <div class="small">RPM synchrone ≈ 120×f / pôles.</div>
          </div>
          <div class="sep"></div>
          <button class="btn primary" id="c_calc">Convertir</button>
          <div class="sep"></div>
          <div class="item"><div class="name" id="c_out1">—</div><div class="meta" id="c_out2"></div></div>
        </div>
      </div>

      <div data-elec-section="ohm" style="display:none">
        <div class="card flat">
          <h3>Ohm & Puissance</h3>
          <div class="form2">
            <div><label>U (V)</label><input id="o_u" inputmode="decimal" placeholder="24"></div>
            <div><label>I (A)</label><input id="o_i" inputmode="decimal" placeholder="2.5"></div>
          </div>
          <div class="form2">
            <div><label>R (Ω)</label><input id="o_r" inputmode="decimal" placeholder="9.6"></div>
            <div><label>P (W)</label><input id="o_p" inputmode="decimal" placeholder="60"></div>
          </div>
          <div class="small">Remplis 2 champs.</div>
          <div class="sep"></div>
          <button class="btn primary" id="o_calc">Calculer</button>
          <div class="sep"></div>
          <div class="item"><div class="meta" id="o_out">—</div></div>
        </div>
      </div>

      <div data-elec-section="power" style="display:none">
        <div class="card flat">
          <h3>Mono / Tri</h3>
          <label>Système</label>
          <select id="p_sys">
            <option value="mono">Monophasé</option>
            <option value="tri" selected>Triphasé</option>
          </select>
          <div class="form2">
            <div><label>U (V)</label><input id="p_u" inputmode="decimal" placeholder="400"></div>
            <div><label>cosφ</label><input id="p_cos" inputmode="decimal" value="0.85"></div>
          </div>
          <div class="form2">
            <div><label>P (kW)</label><input id="p_kw" inputmode="decimal" placeholder="7.5"></div>
            <div><label>I (A)</label><input id="p_i" inputmode="decimal" placeholder="15"></div>
          </div>
          <div class="sep"></div>
          <button class="btn primary" id="p_calc">Calculer</button>
          <div class="sep"></div>
          <div class="item"><div class="meta" id="p_out">—</div></div>
        </div>
      </div>

      <div data-elec-section="drop" style="display:none">
        <div class="card flat">
          <h3>Chute + Section (rapide)</h3>
          <label>Système</label>
          <select id="d_sys"><option value="tri" selected>Triphasé</option><option value="mono">Monophasé</option></select>
          <div class="form2">
            <div><label>U (V)</label><input id="d_u" inputmode="decimal" value="400"></div>
            <div><label>Longueur (m)</label><input id="d_l" inputmode="decimal" placeholder="35"></div>
          </div>
          <div class="form2">
            <div><label>I (A)</label><input id="d_i" inputmode="decimal" placeholder="20"></div>
            <div><label>Matériau</label><select id="d_mat"><option value="cu" selected>Cuivre</option><option value="al">Aluminium</option></select></div>
          </div>
          <div class="form2">
            <div><label>Chute max (%)</label><select id="d_max"><option value="3" selected>3%</option><option value="5">5%</option><option value="8">8%</option></select></div>
            <div><label>Section test (mm²)</label><input id="d_s" inputmode="decimal" placeholder="6"></div>
          </div>
          <div class="sep"></div>
          <button class="btn primary" id="d_calc">Calculer</button>
          <div class="sep"></div>
          <div class="item"><div class="meta" id="d_out">—</div></div>
        </div>
      </div>

      <div data-elec-section="motor" style="display:none">
        <div class="card flat">
          <h3>Courant moteur (kW → A)</h3>
          <label>Système</label>
          <select id="m_sys"><option value="tri" selected>Triphasé</option><option value="mono">Monophasé</option></select>
          <div class="form2">
            <div><label>kW</label><input id="m_kw" inputmode="decimal" placeholder="7.5"></div>
            <div><label>U (V)</label><input id="m_u" inputmode="decimal" value="400"></div>
          </div>
          <div class="form2">
            <div><label>cosφ</label><input id="m_cos" inputmode="decimal" value="0.85"></div>
            <div><label>η</label><input id="m_eta" inputmode="decimal" value="0.9"></div>
          </div>
          <div class="sep"></div>
          <button class="btn primary" id="m_calc">Calculer</button>
          <div class="sep"></div>
          <div class="item"><div class="meta" id="m_out">—</div></div>
        </div>
      </div>

      <div data-elec-section="prot" style="display:none">
        <div class="card flat">
          <h3>Protections (aide)</h3>
          <label>In (A)</label><input id="prot_i" inputmode="decimal" placeholder="14.2">
          <div class="form2">
            <div><label>Charge</label><select id="prot_load"><option value="general" selected>Général</option><option value="motor">Moteur</option></select></div>
            <div><label>Marge</label><select id="prot_margin"><option value="1.15" selected>+15%</option><option value="1.25">+25%</option><option value="1.40">+40%</option></select></div>
          </div>
          <div class="sep"></div>
          <button class="btn primary" id="prot_calc">Proposer</button>
          <div class="sep"></div>
          <div class="item"><div class="meta" id="prot_out">—</div></div>
          <div class="small" style="margin-top:8px">⚠️ Vérifier Ik, sélectivité, courbe, section, pose.</div>
        </div>
      </div>
    </div>

    <!-- MECA PANEL -->
    <div id="mecaPanel" class="card flat" style="display:none">
      <div class="row" style="justify-content:space-between; align-items:center">
        <h3 style="margin:0">🛠️ Mécanique</h3>
        <span class="pill">terrain</span>
      </div>
      <div class="sep"></div>

      <div class="row" style="gap:10px; flex-wrap:wrap">
        <button class="navbtn" style="flex:1; min-width:160px" data-meca-pick="thread"><span class="navicon">🔩</span><span class="navtxt">Pas ISO</span></button>
        <button class="navbtn" style="flex:1; min-width:160px" data-meca-pick="bearing"><span class="navicon">⚪</span><span class="navtxt">Roulements</span></button>
        <button class="navbtn" style="flex:1; min-width:160px" data-meca-pick="conv"><span class="navicon">🔁</span><span class="navtxt">Conversions</span></button>
      </div>

      <div class="sep"></div>

      <div data-meca-section="thread" style="display:none">
        <div class="card flat">
          <h3>Pas ISO métrique</h3>
          <label>Taille (Mx)</label>
          <select id="t_size"></select>
          <label>Pas</label>
          <select id="t_pitch"></select>
          <div class="sep"></div>
          <button class="btn primary" id="t_calc">Afficher</button>
          <div class="sep"></div>
          <div class="item"><div class="meta" id="t_out">—</div></div>
          <div class="small" style="margin-top:8px">Perçage taraudage ≈ d - pas (approx terrain).</div>
        </div>
      </div>

      <div data-meca-section="bearing" style="display:none">
        <div class="card flat">
          <h3>Roulements (base éditable)</h3>
          <label>Recherche</label>
          <input id="b_q" placeholder="Ex: 6204, 6305, 2RS, 20x47x14…" />
          <div class="sep"></div>
          <div class="btnrow">
            <button class="btn primary" id="b_add">➕ Ajouter</button>
            <button class="btn" id="b_reload">↻ Rafraîchir</button>
          </div>
          <div class="sep"></div>
          <div id="b_list" class="list"></div>
        </div>
      </div>

      <div data-meca-section="conv" style="display:none">
        <div class="card flat">
          <h3>Conversions</h3>
          <label>Couple (Nm)</label>
          <input id="c_nm" inputmode="decimal" placeholder="Ex: 50">
          <div class="sep"></div>
          <button class="btn primary" id="c_conv">Convertir</button>
          <div class="sep"></div>
          <div class="item">
            <div class="meta" id="c_conv_out">—</div>
          </div>
          <div class="small" style="margin-top:8px">1 daN·m = 10 N·m</div>
        </div>
      </div>


    <!-- AUTO PANEL -->
    <div id="autoPanel" class="card flat" style="display:none">
      <div class="row" style="justify-content:space-between; align-items:center">
        <h3 style="margin:0">🤖 Automatisme</h3>
        <span class="pill">offline</span>
      </div>
      <div class="sep"></div>

      <div class="row" style="gap:10px; flex-wrap:wrap">
        <button class="navbtn" style="flex:1; min-width:170px" data-auto-pick="plc">
          <span class="navicon">🧠</span><span class="navtxt">PLC Siemens</span>
        </button>
        <button class="navbtn" style="flex:1; min-width:170px" data-auto-pick="sew">
          <span class="navicon">⚙️</span><span class="navtxt">Variateurs SEW</span>
        </button>
        <button class="navbtn" style="flex:1; min-width:170px" data-auto-pick="memo">
          <span class="navicon">📌</span><span class="navtxt">Mémo</span>
        </button>
      </div>

      <div class="sep"></div>

      <div data-auto-section="plc" style="display:none">
        <div class="card flat">
          <h3>Base défauts — PLC Siemens</h3>
          <div class="small">Recherche par code (BF/SF…), mot-clé, ou symptômes.</div>
          <label>Recherche</label>
          <input id="a_plc_q" placeholder="Ex: BF, SF, profinet, ET200…" />
          <div class="sep"></div>
          <div class="btnrow">
            <button class="btn primary" id="a_plc_add">➕ Ajouter</button>
            <button class="btn" id="a_plc_reload">↻ Rafraîchir</button>
          </div>
          <div class="sep"></div>
          <div id="a_plc_list" class="list"></div>
        </div>
      </div>

      <div data-auto-section="sew" style="display:none">
        <div class="card flat">
          <h3>Base défauts — Variateurs SEW</h3>
          <div class="small">Ajoute tes codes SEW (Fxx, Axx…) au fur et à mesure.</div>
          <label>Recherche</label>
          <input id="a_sew_q" placeholder="Ex: Fxx, overcurrent, encoder…" />
          <div class="sep"></div>
          <div class="btnrow">
            <button class="btn primary" id="a_sew_add">➕ Ajouter</button>
            <button class="btn" id="a_sew_reload">↻ Rafraîchir</button>
          </div>
          <div class="sep"></div>
          <div id="a_sew_list" class="list"></div>
        </div>
      </div>

      <div data-auto-section="memo" style="display:none">
        <div class="card flat">
          <h3>Mémo (terrain)</h3>
          <div class="item">
            <div class="name">BF vs SF (Siemens)</div>
            <div class="meta">
              <b>BF</b> = défaut de communication (bus).<br>
              <b>SF</b> = défaut système/module/config.<br>
              Astuce: toujours lire le <b>buffer de diagnostic</b> et les diag des modules (ET200/IM).
            </div>
          </div>
          <div class="item">
            <div class="name">PROFINET — checks rapides</div>
            <div class="meta">Nom d’équipement, adresse IP, switch, câble, alimentation 24V, ports, topo.</div>
          </div>
          <div class="item">
            <div class="name">SEW — checks rapides</div>
            <div class="meta">Alim réseau, 24V commande, moteur/thermique, frein, retour codeur, paramètres, I/O, bus (si option).</div>
          </div>
          <div class="small" style="margin-top:8px">Tu peux enrichir via les entrées défauts + notes perso.</div>
        </div>
      </div>
    </div>

    </div>
  `;

  // Toggle panels
  const elecPanel = el.querySelector("#elecPanel");
  const mecaPanel = el.querySelector("#mecaPanel");
  const autoPanel = el.querySelector("#autoPanel");

  el.querySelector("#goElec").onclick = () => {
    elecPanel.style.display = (elecPanel.style.display === "none") ? "block" : "none";
    if (elecPanel.style.display === "block") { mecaPanel.style.display = "none"; autoPanel.style.display = "none"; }
    elecPanel.scrollIntoView({behavior:"smooth", block:"start"});
    showSection(el, "elec", "conv");
  };

  el.querySelector("#goMeca").onclick = async () => {
    mecaPanel.style.display = (mecaPanel.style.display === "none") ? "block" : "none";
    if (mecaPanel.style.display === "block") { elecPanel.style.display = "none"; autoPanel.style.display = "none"; }
    mecaPanel.scrollIntoView({behavior:"smooth", block:"start"});
    showSection(el, "meca", "thread");
    await wireMeca();
  };

  el.querySelector("#goAuto").onclick = async () => {
    autoPanel.style.display = (autoPanel.style.display === "none") ? "block" : "none";
    if (autoPanel.style.display === "block") { elecPanel.style.display = "none"; mecaPanel.style.display = "none"; }
    autoPanel.scrollIntoView({behavior:"smooth", block:"start"});
    showSection(el, "auto", "plc");
    await wireAuto();
  };

  // Picker buttons
  el.querySelectorAll("[data-elec-pick]").forEach(btn=>{
    btn.onclick = ()=>{
      showSection(el, "elec", btn.dataset.elecPick);
      el.querySelector(`[data-elec-section="${btn.dataset.elecPick}"]`)?.scrollIntoView({behavior:"smooth", block:"start"});
    };
  });
  el.querySelectorAll("[data-meca-pick]").forEach(btn=>{
    btn.onclick = async ()=>{
      showSection(el, "meca", btn.dataset.mecaPick);
      el.querySelector(`[data-meca-section="${btn.dataset.mecaPick}"]`)?.scrollIntoView({behavior:"smooth", block:"start"});
      await wireMeca();
    };
  });

  el.querySelectorAll("[data-auto-pick]").forEach(btn=>{
    btn.onclick = async ()=>{
      showSection(el, "auto", btn.dataset.autoPick);
      el.querySelector(`[data-auto-section="${btn.dataset.autoPick}"]`)?.scrollIntoView({behavior:"smooth", block:"start"});
      await wireAuto();
    };
  });

  // ---------- ELEC WIRING ----------
  // Convertisseurs
  const cType = el.querySelector("#c_type");
  const hzExtra = el.querySelector("#hzExtra");
  cType.addEventListener("change", ()=>{
    hzExtra.style.display = (cType.value === "hz_rpm") ? "block" : "none";
  });
  el.querySelector("#c_calc").onclick = ()=>{
    const v = num(el.querySelector("#c_val").value);
    const type = cType.value;
    let out1="—", out2="";
    if (!Number.isFinite(v)){ ui.toast("Entre une valeur."); return; }
    if (type === "w_kw"){ out1 = `${fmt(v/1000,3)} kW`; out2 = `${fmt(v,0)} W`; }
    else if (type === "kw_cv"){ out1 = `${fmt(v*1.35962,2)} CV`; out2 = `${fmt(v,3)} kW`; }
    else if (type === "a_ma"){ out1 = `${fmt(v*1000,0)} mA`; out2 = `${fmt(v,3)} A`; }
    else if (type === "v_kv"){ out1 = `${fmt(v/1000,4)} kV`; out2 = `${fmt(v,2)} V`; }
    else if (type === "ohm_kohm"){ out1 = `${fmt(v/1000,4)} kΩ`; out2 = `${fmt(v,3)} Ω`; }
    else if (type === "hz_rpm"){
      const poles = num(el.querySelector("#poles").value);
      const rpm = 120 * v / poles;
      out1 = `${fmt(rpm,0)} RPM (synchrone)`;
      out2 = `${fmt(v,2)} Hz • ${fmt(poles,0)} pôles`;
    }
    el.querySelector("#c_out1").textContent = out1;
    el.querySelector("#c_out2").textContent = out2;
  };

  // Ohm
  el.querySelector("#o_calc").onclick = ()=>{
    const U = num(el.querySelector("#o_u").value);
    const I = num(el.querySelector("#o_i").value);
    const R = num(el.querySelector("#o_r").value);
    const P = num(el.querySelector("#o_p").value);
    const known = [U,I,R,P].filter(Number.isFinite).length;
    if (known < 2){ ui.toast("Remplis au moins 2 champs."); return; }
    let u=U, i=I, r=R, p=P;
    for (let iter=0; iter<10; iter++){
      if (!Number.isFinite(u) && Number.isFinite(i) && Number.isFinite(r)) u = i*r;
      if (!Number.isFinite(i) && Number.isFinite(u) && Number.isFinite(r) && r!==0) i = u/r;
      if (!Number.isFinite(r) && Number.isFinite(u) && Number.isFinite(i) && i!==0) r = u/i;

      if (!Number.isFinite(p) && Number.isFinite(u) && Number.isFinite(i)) p = u*i;
      if (!Number.isFinite(p) && Number.isFinite(i) && Number.isFinite(r)) p = r*i*i;
      if (!Number.isFinite(p) && Number.isFinite(u) && Number.isFinite(r) && r!==0) p = (u*u)/r;

      if (!Number.isFinite(u) && Number.isFinite(p) && Number.isFinite(i) && i!==0) u = p/i;
      if (!Number.isFinite(i) && Number.isFinite(p) && Number.isFinite(u) && u!==0) i = p/u;
      if (!Number.isFinite(r) && Number.isFinite(u) && Number.isFinite(p) && p!==0) r = (u*u)/p;
      if (!Number.isFinite(r) && Number.isFinite(p) && Number.isFinite(i) && i!==0) r = p/(i*i);

      if ([u,i,r,p].every(Number.isFinite)) break;
    }
    el.querySelector("#o_out").innerHTML = `<b>U</b>=${fmt(u,3)}V • <b>I</b>=${fmt(i,3)}A • <b>R</b>=${fmt(r,3)}Ω • <b>P</b>=${fmt(p,2)}W`;
  };

  // Mono/Tri
  el.querySelector("#p_calc").onclick = ()=>{
    const sys = el.querySelector("#p_sys").value;
    const U = num(el.querySelector("#p_u").value);
    const cos = clamp(num(el.querySelector("#p_cos").value), 0, 1);
    const PkW = num(el.querySelector("#p_kw").value);
    const I = num(el.querySelector("#p_i").value);
    if (!Number.isFinite(U) || U<=0){ ui.toast("Entre U valide."); return; }
    if (!Number.isFinite(cos) || cos<=0){ ui.toast("Entre cosφ valide."); return; }
    const k = (sys === "tri") ? Math.sqrt(3) : 1;
    let pkw = PkW, i = I;
    if (Number.isFinite(pkw) && pkw>0 && !Number.isFinite(i)) i = (pkw*1000) / (k*U*cos);
    else if (Number.isFinite(i) && i>0 && !Number.isFinite(pkw)) pkw = (k*U*i*cos)/1000;
    else if (!Number.isFinite(i) && !Number.isFinite(pkw)) { ui.toast("Remplis P ou I."); return; }
    el.querySelector("#p_out").innerHTML = `<b>${sys==="tri"?"Tri":"Mono"}</b> • U=${fmt(U,1)}V • cosφ=${fmt(cos,2)} → <b>P</b>=${fmt(pkw,3)}kW • <b>I</b>=${fmt(i,2)}A`;
  };

  // Chute + section
  el.querySelector("#d_calc").onclick = ()=>{
    const sys = el.querySelector("#d_sys").value;
    const U = num(el.querySelector("#d_u").value);
    const L = num(el.querySelector("#d_l").value);
    const I = num(el.querySelector("#d_i").value);
    const mat = el.querySelector("#d_mat").value;
    const maxPct = num(el.querySelector("#d_max").value);
    const Suser = num(el.querySelector("#d_s").value);
    if (![U,L,I,maxPct].every(Number.isFinite) || U<=0 || L<=0 || I<=0){ ui.toast("Vérifie U, L, I."); return; }
    let S = (Number.isFinite(Suser) && Suser>0) ? Suser : sectionFromCurrentSimple(I);
    let result = vdrop({system: sys, I, L, S, U, material: mat});
    if (!result){ ui.toast("Calcul impossible."); return; }
    const standard = [1.5,2.5,4,6,10,16,25,35,50,70,95,120,150,185,240];
    let chosen = S;
    if (result.pct > maxPct){
      for (const s of standard){
        const r = vdrop({system: sys, I, L, S: s, U, material: mat});
        if (r && r.pct <= maxPct){ chosen = s; result = r; break; }
      }
    } else if (!(Number.isFinite(Suser) && Suser>0)){
      for (const s of standard){ if (s >= S){ chosen = s; result = vdrop({system: sys, I, L, S: chosen, U, material: mat}); break; } }
    }
    const ok = result.pct <= maxPct;
    const badge = ok ? `<span class="badge ok">OK</span>` : `<span class="badge warn">Trop élevé</span>`;
    el.querySelector("#d_out").innerHTML = `${badge}<br><b>Section</b>: ${fmt(chosen,1)} mm² (${mat.toUpperCase()})<br><b>Chute</b>: ${fmt(result.du,2)} V = <b>${fmt(result.pct,2)}%</b> (max ${fmt(maxPct,0)}%)`;
  };

  // Courant moteur
  el.querySelector("#m_calc").onclick = ()=>{
    const sys = el.querySelector("#m_sys").value;
    const kW = num(el.querySelector("#m_kw").value);
    const U = num(el.querySelector("#m_u").value);
    const cos = clamp(num(el.querySelector("#m_cos").value), 0, 1);
    const eta = clamp(num(el.querySelector("#m_eta").value), 0, 1);
    if (![kW,U,cos,eta].every(Number.isFinite) || kW<=0 || U<=0 || cos<=0 || eta<=0){ ui.toast("Vérifie kW, U, cosφ, η."); return; }
    const r = motorCurrent({sys, U, kW, cosphi: cos, eta});
    el.querySelector("#m_out").innerHTML = `<b>${sys==="tri"?"Tri":"Mono"}</b> • Pm=${fmt(kW,3)}kW • U=${fmt(U,1)}V • cosφ=${fmt(cos,2)} • η=${fmt(eta,2)}<br>⇒ <b>I ≈ ${fmt(r.I,2)} A</b> (Pe≈${fmt(r.Pe,0)} W)`;
  };

  // Protections
  el.querySelector("#prot_calc").onclick = ()=>{
    const In = num(el.querySelector("#prot_i").value);
    const load = el.querySelector("#prot_load").value;
    const margin = num(el.querySelector("#prot_margin").value);
    if (!Number.isFinite(In) || In<=0){ ui.toast("Entre In valide."); return; }
    const Iref = In * (Number.isFinite(margin) ? margin : 1.25);
    const suggested = pickStandard(Iref);
    let advice = "";
    if (load === "general"){
      advice = `<b>Disjoncteur</b> : calibre ≥ ${fmt(suggested,0)} A (à affiner selon section / pose / sélectivité)`;
    } else {
      const mp = pickStandard(In * 1.10);
      const fuse = pickStandard(In * 1.60);
      advice = `<b>Moteur</b> : MPCB réglage ≈ ${fmt(In,2)} A (calibre proche ${fmt(mp,0)}A) • Fusibles aM ≈ ${fmt(fuse,0)}A (indicatif) + thermique si aM`;
    }
    el.querySelector("#prot_out").innerHTML = `<b>Entrée</b> : In=${fmt(In,2)}A • marge=${fmt(margin*100-100,0)}% → Iref≈${fmt(Iref,2)}A<br><b>Standard</b> : ${fmt(suggested,0)}A<div class="sep"></div>${advice}`;
  };

  // ---------- MECA WIRING (idempotent) ----------
  
  // ---------- AUTO WIRING (idempotent) ----------
  async function wireAuto(){
    // PLC Siemens list
    const plcQ = el.querySelector("#a_plc_q");
    const plcList = el.querySelector("#a_plc_list");
    if (plcQ && !plcQ.dataset.wired){
      plcQ.dataset.wired = "1";

      const renderPLC = async ()=>{
        const items = await db.faultsSearch(plcQ.value, { vendor: "Siemens", product: "PLC (Step7/TIA)" });
        plcList.innerHTML = items.length ? items.map(f=>faultCard(f)).join("") : `<div class="small">Aucun résultat. Ajoute un défaut avec ➕.</div>`;
        wireFaultActions(plcList, renderPLC);
      };

      el.querySelector("#a_plc_reload").onclick = ()=> renderPLC();
      plcQ.addEventListener("input", ()=> renderPLC());

      el.querySelector("#a_plc_add").onclick = async ()=>{
        await addFaultFlow({ vendor:"Siemens", product:"PLC (Step7/TIA)" });
        await renderPLC();
      };

      await renderPLC();
    }

    // SEW drives list
    const sewQ = el.querySelector("#a_sew_q");
    const sewList = el.querySelector("#a_sew_list");
    if (sewQ && !sewQ.dataset.wired){
      sewQ.dataset.wired = "1";

      const renderSEW = async ()=>{
        const items = await db.faultsSearch(sewQ.value, { vendor: "SEW", product: "Variateur (MOVITRAC/MOVIDRIVE)" });
        sewList.innerHTML = items.length ? items.map(f=>faultCard(f)).join("") : `<div class="small">Aucun résultat. Ajoute tes codes SEW avec ➕.</div>`;
        wireFaultActions(sewList, renderSEW);
      };

      el.querySelector("#a_sew_reload").onclick = ()=> renderSEW();
      sewQ.addEventListener("input", ()=> renderSEW());

      el.querySelector("#a_sew_add").onclick = async ()=>{
        await addFaultFlow({ vendor:"SEW", product:"Variateur (MOVITRAC/MOVIDRIVE)" });
        await renderSEW();
      };

      await renderSEW();
    }
  }

  function faultCard(f){
    return `
      <div class="item">
        <div class="top">
          <div>
            <div class="name"><b>${ui.esc(f.code)}</b> • ${ui.esc(f.title || "(sans titre)")}</div>
            <div class="meta">${ui.esc(f.vendor)} • ${ui.esc(f.product)}</div>
          </div>
          <div style="display:flex; gap:8px; align-items:center">
            <button class="btn" data-edit="${f.id}" style="padding:10px 12px">Éditer</button>
            <button class="btn danger" data-del="${f.id}" style="padding:10px 12px">Suppr</button>
          </div>
        </div>
        <div class="sep"></div>
        ${f.causes ? `<div class="meta"><b>Causes</b> : ${ui.esc(f.causes)}</div>` : ""}
        ${f.actions ? `<div class="meta" style="margin-top:6px"><b>Actions</b> : ${ui.esc(f.actions)}</div>` : ""}
        ${f.notes ? `<div class="meta" style="margin-top:6px"><b>Notes</b> : ${ui.esc(f.notes)}</div>` : ""}
      </div>
    `;
  }

  function wireFaultActions(container, rerender){
    container.querySelectorAll("[data-del]").forEach(btn=>{
      btn.onclick = async ()=>{
        const ok = await ui.confirmDanger({ title:"Supprimer défaut", message:"Supprimer cette fiche défaut ?", phrase:"SUPPRIMER" });
        if (!ok) return;
        await db.deleteFault(btn.dataset.del);
        ui.toast("Supprimé.");
        rerender();
      };
    });
    container.querySelectorAll("[data-edit]").forEach(btn=>{
      btn.onclick = async ()=>{
        const id = btn.dataset.edit;
        const cur = await db.get("faults", id);
        if (!cur) return;
        const title = await ui.promptText({ title:"Titre", label:"Court", placeholder:"Ex: défaut bus", value: cur.title || "" });
        if (title === null) return;
        const causes = await ui.promptText({ title:"Causes", label:"Résumé", placeholder:"Ex: câble, terminaison…", value: cur.causes || "" });
        if (causes === null) return;
        const actions = await ui.promptText({ title:"Actions", label:"Pistes dépannage", placeholder:"Ex: diag buffer, vérifier 24V…", value: cur.actions || "" });
        if (actions === null) return;
        const notes = await ui.promptText({ title:"Notes perso", label:"Libre", placeholder:"Ex: SFA36 zone convoyeur…", value: cur.notes || "" });
        if (notes === null) return;
        await db.updateFault(id, { title, causes, actions, notes });
        ui.toast("Mis à jour.");
        rerender();
      };
    });
  }

  async function addFaultFlow({vendor, product}){
    const code = await ui.promptText({ title:"Code défaut", label:"Obligatoire", placeholder:"Ex: BF, SF, F12…", value:"" });
    if (!code) return;
    const title = await ui.promptText({ title:"Titre", label:"Obligatoire", placeholder:"Ex: défaut communication", value:"" });
    if (title === null) return;
    const causes = await ui.promptText({ title:"Causes (option)", label:"Résumé", placeholder:"Ex: câble, terminaison, adresse…", value:"" }) || "";
    const actions = await ui.promptText({ title:"Actions (option)", label:"Pistes dépannage", placeholder:"Ex: lire buffer diag…", value:"" }) || "";
    const notes = await ui.promptText({ title:"Notes perso (option)", label:"Libre", placeholder:"Ex: déjà vu sur SFA37…", value:"" }) || "";
    try{
      await db.addFault({ vendor, product, code, title, causes, actions, notes });
      ui.toast("Ajouté.");
    }catch{
      ui.toast("Ajout impossible.");
    }
  }


async function wireMeca(){
    // Thread dropdowns
    const selSize = el.querySelector("#t_size");
    const selPitch = el.querySelector("#t_pitch");
    const out = el.querySelector("#t_out");
    if (selSize && !selSize.dataset.wired){
      selSize.dataset.wired = "1";
      selSize.innerHTML = ISO_METRIC.map(r=>`<option value="${r.d}">M${r.d}</option>`).join("");
      selSize.value = "10";
      const refreshPitch = ()=>{
        const d = num(selSize.value);
        const row = ISO_METRIC.find(x=>x.d===d) || ISO_METRIC[0];
        const pitches = [row.coarse, ...(row.fine||[])];
        selPitch.innerHTML = pitches.map(p=>`<option value="${p}">${p} mm</option>`).join("");
        selPitch.value = String(row.coarse);
      };
      selSize.addEventListener("change", refreshPitch);
      refreshPitch();

      el.querySelector("#t_calc").onclick = ()=>{
        const d = num(selSize.value);
        const pitch = num(selPitch.value);
        if (!Number.isFinite(d) || !Number.isFinite(pitch)){ ui.toast("Valeurs invalides."); return; }
        const tap = d - pitch; // simple
        out.innerHTML = `<b>M${fmt(d,2)}</b> • pas <b>${fmt(pitch,2)} mm</b><br>Perçage taraudage (approx) ≈ <b>${fmt(tap,2)} mm</b>`;
      };
      // initial
      el.querySelector("#t_calc").click();
    }

    // Bearings list
    const q = el.querySelector("#b_q");
    const list = el.querySelector("#b_list");
    if (q && !q.dataset.wired){
      q.dataset.wired = "1";
      const render = async ()=>{
        const items = await db.bearingsSearch(q.value);
        if (!items.length){
          list.innerHTML = `<div class="small">Aucun roulement. Ajoute-en avec ➕.</div>`;
          return;
        }
        list.innerHTML = items.map(b=>`
          <div class="item">
            <div class="top">
              <div>
                <div class="name">${ui.esc(b.ref)}${b.type?` • ${ui.esc(b.type)}`:""}</div>
                <div class="meta">${b.d?ui.esc(`${b.d}`):"?"}×${b.D?ui.esc(`${b.D}`):"?"}×${b.B?ui.esc(`${b.B}`):"?"} mm${b.note?` • ${ui.esc(b.note)}`:""}</div>
              </div>
              <button class="btn danger" data-del="${b.id}" style="flex:0 0 auto; padding:10px 12px">Suppr</button>
            </div>
          </div>
        `).join("");
        list.querySelectorAll("[data-del]").forEach(btn=>{
          btn.onclick = async ()=>{
            const ok = await ui.confirmDanger({ title:"Supprimer roulement", message:`Supprimer ${btn.closest(".item").querySelector(".name").textContent}?`, phrase:"SUPPRIMER" });
            if (!ok) return;
            await db.deleteBearing(btn.dataset.del);
            ui.toast("Supprimé.");
            render();
          };
        });
      };
      q.addEventListener("input", ()=> render());
      el.querySelector("#b_reload").onclick = ()=> render();

      el.querySelector("#b_add").onclick = async ()=>{
        const ref = await ui.promptText({ title:"Référence roulement", label:"Ex: 6204 2RS", placeholder:"6204 2RS" });
        if (!ref) return;
        const dims = await ui.promptText({ title:"Dimensions (d×D×B)", label:"Format", placeholder:"Ex: 20x47x14", value:"" });
        let d=null,D=null,B=null;
        if (dims){
          const m = dims.toLowerCase().replace(/\s/g,"").match(/(\d+(\.\d+)?)x(\d+(\.\d+)?)x(\d+(\.\d+)?)/);
          if (m){
            d = Number(m[1]); D = Number(m[3]); B = Number(m[5]);
          }
        }
        const type = await ui.promptText({ title:"Type / suffixe (option)", label:"Ex: 2RS, ZZ, C3", placeholder:"2RS", value:"" }) || "";
        const note = await ui.promptText({ title:"Note (option)", label:"Libre", placeholder:"Ex: côté moteur convoyeur", value:"" }) || "";
        try{
          await db.addBearing({ ref, d, D, B, type, note });
          ui.toast("Ajouté.");
          q.value = ref;
          render();
        }catch{
          ui.toast("Ajout impossible.");
        }
      };

      await render();
    }

    // Conversions
    const nm = el.querySelector("#c_nm");
    if (nm && !nm.dataset.wired){
      nm.dataset.wired = "1";
      el.querySelector("#c_conv").onclick = ()=>{
        const v = num(nm.value);
        if (!Number.isFinite(v)){ ui.toast("Entre un couple en Nm."); return; }
        const danm = v/10;
        el.querySelector("#c_conv_out").innerHTML = `<b>${fmt(v,2)} N·m</b> = <b>${fmt(danm,2)} daN·m</b>`;
      };
    }
  }
}
