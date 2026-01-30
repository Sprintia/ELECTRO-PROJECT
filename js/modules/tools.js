import { ui } from "../ui.js";

/**
 * ELECTRIQUE — V2 (terrain-first)
 * - Convertisseurs
 * - Loi d'Ohm & Puissance
 * - Mono / Tri (P, I)
 * - Chute de tension (Cu/Al) + section conseillée (mode rapide)
 *
 * Note: dimensionnement "rapide terrain" — pour une validation normative, utiliser tableaux/logiciels selon NF C 15-100 et conditions de pose.
 */

function num(x){
  const v = Number(String(x).replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
}
function fmt(x, digits=2){
  if (!Number.isFinite(x)) return "—";
  // Trim trailing zeros
  const s = x.toFixed(digits);
  return s.replace(/\.?0+$/,"");
}

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function sectionFromCurrentSimple(I){
  // Heuristic for Cu in common industrial conditions (not normative).
  // Returns mm²
  if (!Number.isFinite(I) || I <= 0) return null;
  const table = [
    {I:10, s:1.5},
    {I:16, s:2.5},
    {I:20, s:4},
    {I:25, s:6},
    {I:32, s:10},
    {I:45, s:16},
    {I:63, s:25},
    {I:80, s:35},
    {I:100, s:50},
    {I:125, s:70},
    {I:160, s:95},
    {I:200, s:120},
    {I:250, s:150},
    {I:315, s:185},
  ];
  for (const r of table){
    if (I <= r.I) return r.s;
  }
  return 240;
}

function resistivity(material){
  // Ohm*mm²/m (20°C approx)
  if (material === "al") return 0.0282;
  return 0.0175; // copper
}

function vdrop({system, I, L, S, U, cosphi, material}){
  // Simplified voltage drop:
  // single-phase: ΔU = 2 * ρ * L * I / S
  // three-phase:  ΔU = √3 * ρ * L * I / S
  // reactive component ignored (X) for simplicity (terrain quick)
  const rho = resistivity(material);
  if (![I,L,S,U].every(Number.isFinite)) return null;
  if (I<=0 || L<=0 || S<=0 || U<=0) return null;
  const k = (system === "tri") ? Math.sqrt(3) : 2;
  const du = k * rho * L * I / S; // volts
  const pct = (du / U) * 100;
  return { du, pct };
}

export async function renderTools(){
  ui.setTitle("Outils", "Électrique V2 • Terrain");

  const el = document.getElementById("view");
  el.innerHTML = `
    <div class="grid">
      <button class="bigbtn" id="goElec">
        <span class="left"><span style="font-size:20px">⚡</span><span><b>Électrique</b><div class="small">Convertisseurs • Ohm • Mono/Tri • Chute de tension</div></span></span>
        <span class="pill">V2</span>
      </button>

      <div class="card flat">
        <h3>À venir</h3>
        <p>Mécanique (pas ISO, roulements) • Automatisme (défauts Siemens) • Favoris.</p>
      </div>
    </div>

    <div class="sep"></div>

    <div id="elecPanel" class="card flat" style="display:none">
      <div class="row" style="justify-content:space-between; align-items:center">
        <h3 style="margin:0">⚡ Électrique</h3>
        <span class="pill">mode terrain</span>
      </div>
      <div class="sep"></div>

      <div class="grid">
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
            <div class="small">RPM synchrone ≈ 120×f / pôles (glissement non pris en compte).</div>
          </div>

          <div class="sep"></div>
          <button class="btn primary" id="c_calc">Convertir</button>
          <div class="sep"></div>
          <div class="item">
            <div class="name" id="c_out1">—</div>
            <div class="meta" id="c_out2"></div>
          </div>
        </div>

        <div class="card flat">
          <h3>Loi d’Ohm & Puissance</h3>
          <div class="form2">
            <div>
              <label>U (V)</label>
              <input id="o_u" placeholder="Ex: 24" inputmode="decimal">
            </div>
            <div>
              <label>I (A)</label>
              <input id="o_i" placeholder="Ex: 2.5" inputmode="decimal">
            </div>
          </div>
          <div class="form2">
            <div>
              <label>R (Ω)</label>
              <input id="o_r" placeholder="Ex: 9.6" inputmode="decimal">
            </div>
            <div>
              <label>P (W)</label>
              <input id="o_p" placeholder="Ex: 60" inputmode="decimal">
            </div>
          </div>
          <div class="small">Tu peux remplir 2 champs, je calcule les autres (si possible).</div>
          <div class="sep"></div>
          <button class="btn primary" id="o_calc">Calculer</button>
          <div class="sep"></div>
          <div class="item">
            <div class="meta" id="o_out">—</div>
          </div>
        </div>

        <div class="card flat">
          <h3>Mono / Tri (courant ou puissance)</h3>
          <label>Système</label>
          <select id="p_sys">
            <option value="mono">Monophasé (P = U×I×cosφ)</option>
            <option value="tri" selected>Triphasé (P = √3×U×I×cosφ)</option>
          </select>
          <div class="form2">
            <div>
              <label>U (V)</label>
              <input id="p_u" placeholder="Ex: 400" inputmode="decimal">
            </div>
            <div>
              <label>cosφ</label>
              <input id="p_cos" placeholder="Ex: 0.85" inputmode="decimal" value="0.85">
            </div>
          </div>
          <div class="form2">
            <div>
              <label>P (kW)</label>
              <input id="p_kw" placeholder="Ex: 7.5" inputmode="decimal">
            </div>
            <div>
              <label>I (A)</label>
              <input id="p_i" placeholder="Ex: 15" inputmode="decimal">
            </div>
          </div>
          <div class="small">Remplis soit P, soit I, et je calcule l’autre.</div>
          <div class="sep"></div>
          <button class="btn primary" id="p_calc">Calculer</button>
          <div class="sep"></div>
          <div class="item">
            <div class="meta" id="p_out">—</div>
          </div>
        </div>

        <div class="card flat">
          <h3>Chute de tension + section (rapide)</h3>
          <label>Système</label>
          <select id="d_sys">
            <option value="tri" selected>Triphasé</option>
            <option value="mono">Monophasé</option>
          </select>

          <div class="form2">
            <div>
              <label>U (V)</label>
              <input id="d_u" placeholder="Ex: 400" inputmode="decimal" value="400">
            </div>
            <div>
              <label>Longueur (m)</label>
              <input id="d_l" placeholder="Ex: 35" inputmode="decimal">
            </div>
          </div>

          <div class="form2">
            <div>
              <label>Courant I (A)</label>
              <input id="d_i" placeholder="Ex: 20" inputmode="decimal">
            </div>
            <div>
              <label>Matériau</label>
              <select id="d_mat">
                <option value="cu" selected>Cuivre (Cu)</option>
                <option value="al">Aluminium (Al)</option>
              </select>
            </div>
          </div>

          <div class="form2">
            <div>
              <label>Chute max (%)</label>
              <select id="d_max">
                <option value="3" selected>3 % (recommandé)</option>
                <option value="5">5 %</option>
                <option value="8">8 %</option>
              </select>
            </div>
            <div>
              <label>Section test (mm²) (option)</label>
              <input id="d_s" placeholder="Ex: 6" inputmode="decimal">
            </div>
          </div>

          <div class="sep"></div>
          <button class="btn primary" id="d_calc">Calculer</button>
          <div class="sep"></div>
          <div class="item">
            <div class="meta" id="d_out">—</div>
          </div>
          <div class="small" style="margin-top:8px">
            ⚠️ Mode rapide : réactance (X), température, mode de pose, regroupement non pris en compte.
          </div>
        </div>
      </div>
    </div>
  `;

  const panel = el.querySelector("#elecPanel");
  el.querySelector("#goElec").onclick = () => {
    panel.style.display = (panel.style.display === "none") ? "block" : "none";
    panel.scrollIntoView({behavior:"smooth", block:"start"});
  };

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
    if (!Number.isFinite(v)){
      ui.toast("Entre une valeur.");
      return;
    }
    if (type === "w_kw"){
      out1 = `${fmt(v/1000,3)} kW`;
      out2 = `${fmt(v,0)} W`;
    } else if (type === "kw_cv"){
      // 1 kW ≈ 1.35962 CV (metric horsepower)
      out1 = `${fmt(v*1.35962,2)} CV`;
      out2 = `${fmt(v,3)} kW`;
    } else if (type === "a_ma"){
      out1 = `${fmt(v*1000,0)} mA`;
      out2 = `${fmt(v,3)} A`;
    } else if (type === "v_kv"){
      out1 = `${fmt(v/1000,4)} kV`;
      out2 = `${fmt(v,2)} V`;
    } else if (type === "ohm_kohm"){
      out1 = `${fmt(v/1000,4)} kΩ`;
      out2 = `${fmt(v,3)} Ω`;
    } else if (type === "hz_rpm"){
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

    // Count known
    const known = [
      Number.isFinite(U),
      Number.isFinite(I),
      Number.isFinite(R),
      Number.isFinite(P)
    ].filter(Boolean).length;

    if (known < 2){
      ui.toast("Remplis au moins 2 champs.");
      return;
    }

    let u=U, i=I, r=R, p=P;

    // Simple solve loop
    for (let iter=0; iter<8; iter++){
      if (!Number.isFinite(u) && Number.isFinite(i) && Number.isFinite(r)) u = i*r;
      if (!Number.isFinite(i) && Number.isFinite(u) && Number.isFinite(r)) i = u/r;
      if (!Number.isFinite(r) && Number.isFinite(u) && Number.isFinite(i)) r = u/i;

      if (!Number.isFinite(p) && Number.isFinite(u) && Number.isFinite(i)) p = u*i;
      if (!Number.isFinite(p) && Number.isFinite(i) && Number.isFinite(r)) p = r*i*i;
      if (!Number.isFinite(p) && Number.isFinite(u) && Number.isFinite(r)) p = (u*u)/r;

      if (!Number.isFinite(u) && Number.isFinite(p) && Number.isFinite(i) && i!==0) u = p/i;
      if (!Number.isFinite(i) && Number.isFinite(p) && Number.isFinite(u) && u!==0) i = p/u;
      if (!Number.isFinite(r) && Number.isFinite(u) && Number.isFinite(p) && p!==0) r = (u*u)/p;
      if (!Number.isFinite(r) && Number.isFinite(p) && Number.isFinite(i) && i!==0) r = p/(i*i);

      // Stop if all known
      if ([u,i,r,p].every(Number.isFinite)) break;
    }

    if (![u,i,r,p].some(Number.isFinite)){
      ui.toast("Impossible avec ces valeurs.");
      return;
    }

    el.querySelector("#o_out").innerHTML =
      `<b>U</b> = ${fmt(u,3)} V • <b>I</b> = ${fmt(i,3)} A • <b>R</b> = ${fmt(r,3)} Ω • <b>P</b> = ${fmt(p,2)} W`;
  };

  // Mono/Tri power
  el.querySelector("#p_calc").onclick = ()=>{
    const sys = el.querySelector("#p_sys").value;
    const U = num(el.querySelector("#p_u").value);
    const cos = clamp(num(el.querySelector("#p_cos").value), 0, 1);
    const PkW = num(el.querySelector("#p_kw").value);
    const I = num(el.querySelector("#p_i").value);

    if (!Number.isFinite(U) || U<=0){
      ui.toast("Entre une tension U valide.");
      return;
    }
    if (!Number.isFinite(cos) || cos<=0){
      ui.toast("Entre un cosφ valide (ex: 0,85).");
      return;
    }

    const k = (sys === "tri") ? Math.sqrt(3) : 1;
    let pkw = PkW, i = I;

    if (Number.isFinite(pkw) && pkw>0 && !Number.isFinite(i)){
      i = (pkw*1000) / (k*U*cos);
    } else if (Number.isFinite(i) && i>0 && !Number.isFinite(pkw)){
      pkw = (k*U*i*cos)/1000;
    } else if (Number.isFinite(i) && Number.isFinite(pkw)){
      // both entered: just compute check
    } else {
      ui.toast("Remplis soit P(kW), soit I(A).");
      return;
    }

    el.querySelector("#p_out").innerHTML =
      `<b>${sys==="tri"?"Tri":"Mono"}</b> • U=${fmt(U,1)}V • cosφ=${fmt(cos,2)} → <b>P</b>=${fmt(pkw,3)} kW • <b>I</b>=${fmt(i,2)} A`;
  };

  // Voltage drop + section
  el.querySelector("#d_calc").onclick = ()=>{
    const sys = el.querySelector("#d_sys").value; // mono/tri
    const U = num(el.querySelector("#d_u").value);
    const L = num(el.querySelector("#d_l").value);
    const I = num(el.querySelector("#d_i").value);
    const mat = el.querySelector("#d_mat").value; // cu/al
    const maxPct = num(el.querySelector("#d_max").value);
    const Suser = num(el.querySelector("#d_s").value);

    if (![U,L,I,maxPct].every(Number.isFinite) || U<=0 || L<=0 || I<=0){
      ui.toast("Vérifie U, longueur et courant.");
      return;
    }

    // Start with user section if any, else pick by current
    let S = Number.isFinite(Suser) && Suser>0 ? Suser : sectionFromCurrentSimple(I);

    // iterate to satisfy maxPct using simplified formula
    let result = vdrop({system: sys, I, L, S, U, cosphi: 1, material: mat});
    if (!result){
      ui.toast("Calcul impossible.");
      return;
    }
    const standard = [1.5,2.5,4,6,10,16,25,35,50,70,95,120,150,185,240];
    let chosen = S;
    if (result.pct > maxPct){
      for (const s of standard){
        const r = vdrop({system: sys, I, L, S: s, U, cosphi: 1, material: mat});
        if (r && r.pct <= maxPct){
          chosen = s;
          result = r;
          break;
        }
      }
    } else {
      // if user didn't specify, round up to standard >= current S
      if (!(Number.isFinite(Suser) && Suser>0)){
        for (const s of standard){
          if (s >= S){
            chosen = s;
            result = vdrop({system: sys, I, L, S: chosen, U, cosphi:1, material: mat});
            break;
          }
        }
      } else {
        chosen = S;
      }
    }

    const ok = result.pct <= maxPct;
    const badge = ok ? `<span class="badge ok">OK</span>` : `<span class="badge warn">Trop élevé</span>`;

    el.querySelector("#d_out").innerHTML = `
      ${badge}<br>
      <b>Section conseillée</b> : ${fmt(chosen,1)} mm² (${mat.toUpperCase()})<br>
      <b>Chute</b> : ${fmt(result.du,2)} V soit <b>${fmt(result.pct,2)} %</b> (max ${fmt(maxPct,0)}%)<br>
      <span class="small">Hypothèse: formule simplifiée (ρ constant, sans X). Longueur = aller (mono utilise 2×L).</span>
    `;
  };
}
