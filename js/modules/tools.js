import { ui } from "../ui.js";

/**
 * ELECTRIQUE — V3.1
 * ✅ UX améliorée: on choisit l'outil avant d'afficher sa fenêtre.
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

// --- Helpers Elec ---
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

function showSection(el, id){
  el.querySelectorAll("[data-elec-section]").forEach(sec=>{
    sec.style.display = (sec.dataset.elecSection === id) ? "block" : "none";
  });
  el.querySelectorAll("[data-elec-pick]").forEach(btn=>{
    btn.classList.toggle("active", btn.dataset.elecPick === id);
  });
}

export async function renderTools(){
  ui.setTitle("Outils", "Électrique • Choix par outil");

  const el = document.getElementById("view");
  el.innerHTML = `
    <div class="grid">
      <button class="bigbtn" id="goElec">
        <span class="left"><span style="font-size:20px">⚡</span><span><b>Électrique</b><div class="small">Choisir un outil → ouvrir</div></span></span>
        <span class="pill">V3.1</span>
      </button>

      <div class="card flat">
        <h3>OK pour l’élec</h3>
        <p>On pourra ensuite passer à Mécanique puis Automatisme, quand tu veux.</p>
      </div>
    </div>

    <div class="sep"></div>

    <div id="elecPanel" class="card flat" style="display:none">
      <div class="row" style="justify-content:space-between; align-items:center">
        <h3 style="margin:0">⚡ Électrique</h3>
        <span class="pill">terrain</span>
      </div>
      <div class="sep"></div>

      <div class="row" style="gap:10px; flex-wrap:wrap">
        <button class="navbtn" style="flex:1; min-width:160px" data-elec-pick="conv">
          <span class="navicon">🔁</span><span class="navtxt">Convertisseurs</span>
        </button>
        <button class="navbtn" style="flex:1; min-width:160px" data-elec-pick="ohm">
          <span class="navicon">Ω</span><span class="navtxt">Ohm & P</span>
        </button>
        <button class="navbtn" style="flex:1; min-width:160px" data-elec-pick="power">
          <span class="navicon">√3</span><span class="navtxt">Mono/Tri</span>
        </button>
        <button class="navbtn" style="flex:1; min-width:160px" data-elec-pick="drop">
          <span class="navicon">📉</span><span class="navtxt">Chute & Section</span>
        </button>
        <button class="navbtn" style="flex:1; min-width:160px" data-elec-pick="motor">
          <span class="navicon">🧲</span><span class="navtxt">Courant moteur</span>
        </button>
        <button class="navbtn" style="flex:1; min-width:160px" data-elec-pick="prot">
          <span class="navicon">🛡️</span><span class="navtxt">Protections</span>
        </button>
      </div>

      <div class="sep"></div>

      <!-- SECTION: Convertisseurs -->
      <div data-elec-section="conv" style="display:none">
        <div class="card flat">
          <h3>Convertisseurs rapides</h3>
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
          <div class="item">
            <div class="name" id="c_out1">—</div>
            <div class="meta" id="c_out2"></div>
          </div>
        </div>
      </div>

      <!-- SECTION: Ohm -->
      <div data-elec-section="ohm" style="display:none">
        <div class="card flat">
          <h3>Loi d’Ohm & Puissance</h3>
          <div class="form2">
            <div><label>U (V)</label><input id="o_u" placeholder="Ex: 24" inputmode="decimal"></div>
            <div><label>I (A)</label><input id="o_i" placeholder="Ex: 2.5" inputmode="decimal"></div>
          </div>
          <div class="form2">
            <div><label>R (Ω)</label><input id="o_r" placeholder="Ex: 9.6" inputmode="decimal"></div>
            <div><label>P (W)</label><input id="o_p" placeholder="Ex: 60" inputmode="decimal"></div>
          </div>
          <div class="small">Remplis 2 champs, je calcule les autres.</div>
          <div class="sep"></div>
          <button class="btn primary" id="o_calc">Calculer</button>
          <div class="sep"></div>
          <div class="item"><div class="meta" id="o_out">—</div></div>
        </div>
      </div>

      <!-- SECTION: Mono/Tri -->
      <div data-elec-section="power" style="display:none">
        <div class="card flat">
          <h3>Mono / Tri (courant ou puissance)</h3>
          <label>Système</label>
          <select id="p_sys">
            <option value="mono">Monophasé (P = U×I×cosφ)</option>
            <option value="tri" selected>Triphasé (P = √3×U×I×cosφ)</option>
          </select>
          <div class="form2">
            <div><label>U (V)</label><input id="p_u" placeholder="Ex: 400" inputmode="decimal"></div>
            <div><label>cosφ</label><input id="p_cos" placeholder="Ex: 0.85" inputmode="decimal" value="0.85"></div>
          </div>
          <div class="form2">
            <div><label>P (kW)</label><input id="p_kw" placeholder="Ex: 7.5" inputmode="decimal"></div>
            <div><label>I (A)</label><input id="p_i" placeholder="Ex: 15" inputmode="decimal"></div>
          </div>
          <div class="small">Remplis soit P, soit I.</div>
          <div class="sep"></div>
          <button class="btn primary" id="p_calc">Calculer</button>
          <div class="sep"></div>
          <div class="item"><div class="meta" id="p_out">—</div></div>
        </div>
      </div>

      <!-- SECTION: Chute -->
      <div data-elec-section="drop" style="display:none">
        <div class="card flat">
          <h3>Chute de tension + section (rapide)</h3>
          <label>Système</label>
          <select id="d_sys">
            <option value="tri" selected>Triphasé</option>
            <option value="mono">Monophasé</option>
          </select>
          <div class="form2">
            <div><label>U (V)</label><input id="d_u" inputmode="decimal" value="400"></div>
            <div><label>Longueur (m)</label><input id="d_l" placeholder="Ex: 35" inputmode="decimal"></div>
          </div>
          <div class="form2">
            <div><label>Courant I (A)</label><input id="d_i" placeholder="Ex: 20" inputmode="decimal"></div>
            <div>
              <label>Matériau</label>
              <select id="d_mat">
                <option value="cu" selected>Cuivre</option>
                <option value="al">Aluminium</option>
              </select>
            </div>
          </div>
          <div class="form2">
            <div>
              <label>Chute max (%)</label>
              <select id="d_max">
                <option value="3" selected>3 %</option>
                <option value="5">5 %</option>
                <option value="8">8 %</option>
              </select>
            </div>
            <div><label>Section test (mm²) (option)</label><input id="d_s" placeholder="Ex: 6" inputmode="decimal"></div>
          </div>
          <div class="sep"></div>
          <button class="btn primary" id="d_calc">Calculer</button>
          <div class="sep"></div>
          <div class="item"><div class="meta" id="d_out">—</div></div>
          <div class="small" style="margin-top:8px">⚠️ Formule simplifiée (sans X, sans corrections).</div>
        </div>
      </div>

      <!-- SECTION: Moteur -->
      <div data-elec-section="motor" style="display:none">
        <div class="card flat">
          <h3>Courant moteur (kW → A)</h3>
          <label>Système</label>
          <select id="m_sys">
            <option value="tri" selected>Triphasé</option>
            <option value="mono">Monophasé</option>
          </select>
          <div class="form2">
            <div><label>Puissance (kW)</label><input id="m_kw" placeholder="Ex: 7.5" inputmode="decimal"></div>
            <div><label>U (V)</label><input id="m_u" inputmode="decimal" value="400"></div>
          </div>
          <div class="form2">
            <div><label>cosφ</label><input id="m_cos" inputmode="decimal" value="0.85"></div>
            <div><label>Rendement η</label><input id="m_eta" inputmode="decimal" value="0.9"></div>
          </div>
          <div class="sep"></div>
          <button class="btn primary" id="m_calc">Calculer</button>
          <div class="sep"></div>
          <div class="item"><div class="meta" id="m_out">—</div></div>
          <div class="small" style="margin-top:8px">Astuce: par défaut η=0,9 et cosφ=0,85 si tu n’as pas la plaque complète.</div>
        </div>
      </div>

      <!-- SECTION: Protections -->
      <div data-elec-section="prot" style="display:none">
        <div class="card flat">
          <h3>Aide protections (disjoncteur / fusibles)</h3>
          <label>Courant nominal In (A)</label>
          <input id="prot_i" placeholder="Ex: 14.2" inputmode="decimal">

          <div class="form2">
            <div>
              <label>Charge</label>
              <select id="prot_load">
                <option value="general" selected>Général</option>
                <option value="motor">Moteur</option>
              </select>
            </div>
            <div>
              <label>Marge</label>
              <select id="prot_margin">
                <option value="1.15" selected>+15%</option>
                <option value="1.25">+25%</option>
                <option value="1.40">+40%</option>
              </select>
            </div>
          </div>

          <div class="sep"></div>
          <button class="btn primary" id="prot_calc">Proposer</button>
          <div class="sep"></div>
          <div class="item"><div class="meta" id="prot_out">—</div></div>

          <div class="small" style="margin-top:8px">⚠️ Aide terrain: vérifier Ik, sélectivité, courbe, section, conditions de pose.</div>
        </div>
      </div>
    </div>
  `;

  const panel = el.querySelector("#elecPanel");
  el.querySelector("#goElec").onclick = () => {
    panel.style.display = (panel.style.display === "none") ? "block" : "none";
    panel.scrollIntoView({behavior:"smooth", block:"start"});
    // Default selection the first time panel opens
    showSection(el, "conv");
  };

  // Picker buttons
  el.querySelectorAll("[data-elec-pick]").forEach(btn=>{
    btn.onclick = ()=>{
      showSection(el, btn.dataset.elecPick);
      // Scroll to section
      const sec = el.querySelector(`[data-elec-section="${btn.dataset.elecPick}"]`);
      sec?.scrollIntoView({behavior:"smooth", block:"start"});
    };
  });

  // --- Wire up calculators (events are bound once; sections exist in DOM) ---

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
}
