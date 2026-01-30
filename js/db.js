// IndexedDB wrapper — Electro Terrain V1
const DB_NAME = "electroTerrain";
const DB_VERSION = 4;

function uid(prefix="id"){
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
}

class DB {
  constructor(){
    this.db = null;
  }

  async init(){
    if (this.db) return;
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      // If an old tab/app keeps the DB open, upgrades can be blocked on iOS.
      req.onblocked = () => reject(new Error("Base locale bloquée (mise à jour). Ferme les autres onglets/PWA ElectroTerrain puis relance."));
      req.onupgradeneeded = () => {
        const db = req.result;
        const tx = req.transaction;

        // Helpers: idempotent store/index creation
        const getOrCreateStore = (name, opts) => {
          if (db.objectStoreNames.contains(name)) return tx.objectStore(name);
          return db.createObjectStore(name, opts);
        };
        const ensureIndex = (store, indexName, keyPath, options) => {
          if (!store.indexNames.contains(indexName)) store.createIndex(indexName, keyPath, options);
        };

        // Core: nodes (arborescence)
        const nodes = getOrCreateStore("nodes", { keyPath: "id" });
        ensureIndex(nodes, "by_parent", "parentId", { unique: false });
        ensureIndex(nodes, "by_type", "type", { unique: false });

        // Interventions
        const interventions = getOrCreateStore("interventions", { keyPath: "id" });
        ensureIndex(interventions, "by_node", "nodeId", { unique: false });
        ensureIndex(interventions, "by_date", "createdAt", { unique: false });

        // Checklists
        const checklists = getOrCreateStore("checklists", { keyPath: "id" });
        ensureIndex(checklists, "by_scope", "scope", { unique: false });
        ensureIndex(checklists, "by_node", "nodeId", { unique: false });

        // Mechanical: bearings (editable)
        const bearings = getOrCreateStore("bearings", { keyPath: "id" });
        ensureIndex(bearings, "by_ref", "ref", { unique: false });

        // Automatisme: faults (editable)
        const faults = getOrCreateStore("faults", { keyPath: "id" });
        ensureIndex(faults, "by_vendor", "vendor", { unique: false });
        ensureIndex(faults, "by_product", "product", { unique: false });
        ensureIndex(faults, "by_code", "code", { unique: false });
      };
      req.onsuccess = () => {
        const db = req.result;
        // Auto-close on version change to avoid blocking future upgrades.
        db.onversionchange = () => { try{ db.close(); }catch{} };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  tx(store, mode="readonly"){
    return this.db.transaction(store, mode).objectStore(store);
  }

  async getSetting(key, fallback=null){
    const res = await this.get("settings", key);
    return res ? res.value : fallback;
  }

  async setSetting(key, value){
    await this.put("settings", { key, value });
  }

  async get(store, key){
    return await new Promise((resolve, reject) => {
      const req = this.tx(store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async put(store, value){
    return await new Promise((resolve, reject) => {
      const req = this.tx(store, "readwrite").put(value);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async del(store, key){
    return await new Promise((resolve, reject) => {
      const req = this.tx(store, "readwrite").delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async all(store){
    return await new Promise((resolve, reject) => {
      const req = this.tx(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async queryIndex(store, indexName, value){
    return await new Promise((resolve, reject) => {
      const idx = this.tx(store).index(indexName);
      const req = idx.getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async ensureSeed(){
    const seeded = await this.getSetting("seeded", false);
    if (seeded) return;

    // Settings: flexible levels
    const defaultLevels = ["Site", "Unité", "Ligne", "Machine", "Équipement"];
    await this.setSetting("levels", defaultLevels);

    // Seed: Site "Usine A" with units
    const siteId = uid("site");
    await this.put("nodes", {
      id: siteId,
      type: "site",
      level: 0,
      parentId: null,
      name: "Usine A",
      createdAt: Date.now(),
      meta: {}
    });

    const units = ["SFA 35", "SFA 36", "SFA 37", "SFA A5"];
    for (const u of units){
      await this.put("nodes", {
        id: uid("unit"),
        type: "unite",
        level: 1,
        parentId: siteId,
        name: u,
        createdAt: Date.now(),
        meta: {}
      });
    }

    // Seed global checklist templates
    const templates = [
      {
        title: "Consignation / LOTO (base)",
        items: [
          "Identifier les énergies (élec, pneu, hydro, gravité…)",
          "Arrêt + sécurisation de la zone",
          "Cadenassage + étiquetage",
          "Vérification d'absence d'énergie (VAT / purge / blocage)",
          "Test de remise sous tension interdite (contrôle)",
          "Fin d'intervention: remontage protections + remise en service contrôlée"
        ]
      },
      {
        title: "Remise en service (base)",
        items: [
          "Nettoyage zone / retrait outillage",
          "Vérifier capteurs / actionneurs visibles",
          "Retirer consignation selon procédure",
          "Essai à vide / mode manuel",
          "Essai en auto + surveillance",
          "Tracer l'intervention (résultat + à surveiller)"
        ]
      },
      {
        title: "Contrôle capteur (base)",
        items: [
          "Vérifier alimentation (24V) + polarité",
          "Vérifier câblage / connectique",
          "Vérifier état LED / diagnostic",
          "Tester action (cible) + mesure entrée PLC",
          "Remplacer si doute (ou échange standard)",
          "Valider en production"
        ]
      }
    ];

    for (const t of templates){
      await this.put("checklists", {
        id: uid("tpl"),
        scope: "global",
        nodeId: null,
        title: t.title,
        items: t.items.map((txt, i) => ({ id: `${i}`, text: txt, checked: false })),
        updatedAt: Date.now()
      });
    }


    // Seed: bearings (common refs)
    const brgs = [
      { ref:"6201", d:12, D:32, B:10, type:"deep groove", note:"base" },
      { ref:"6202", d:15, D:35, B:11, type:"deep groove", note:"base" },
      { ref:"6203", d:17, D:40, B:12, type:"deep groove", note:"base" },
      { ref:"6204", d:20, D:47, B:14, type:"deep groove", note:"base" },
      { ref:"6205", d:25, D:52, B:15, type:"deep groove", note:"base" },
      { ref:"6304", d:20, D:52, B:15, type:"deep groove", note:"base" },
      { ref:"6305", d:25, D:62, B:17, type:"deep groove", note:"base" },
      { ref:"6004", d:20, D:42, B:12, type:"deep groove", note:"base" },
      { ref:"6005", d:25, D:47, B:12, type:"deep groove", note:"base" }
    ];
    for (const b of brgs){
      await this.put("bearings", {
        id: uid("brg"),
        ref: b.ref,
        d: b.d, D: b.D, B: b.B,
        type: b.type,
        note: b.note,
        createdAt: Date.now()
      });
    }


    // Seed: automatisme faults (templates de base — à enrichir)
    const flt = [
      {
        vendor: "Siemens",
        product: "PLC (Step7/TIA)",
        code: "BF",
        title: "Bus Fault (défaut bus)",
        causes: "Perte de communication sur le bus (PROFIBUS/PROFINET/AS-i selon équipement).",
        actions: "Vérifier alimentation modules, câbles/connexions, terminaison, adresse/nom PROFINET, switch, diagnostics ET200/IM.",
        notes: "Ajouter ici tes cas réels (ex: ET200 zone convoyeur)."
      },
      {
        vendor: "Siemens",
        product: "PLC (Step7/TIA)",
        code: "SF",
        title: "System Fault (défaut système)",
        causes: "Erreur système/diagnostic module, configuration, périphérique en défaut.",
        actions: "Lire le buffer de diagnostic, vérifier configuration HW, remplacer module si besoin, contrôler tension 24V.",
        notes: ""
      },
      {
        vendor: "SEW",
        product: "Variateur (MOVITRAC/MOVIDRIVE)",
        code: "EXEMPLE",
        title: "Entrée d'exemple",
        causes: "À remplacer par un vrai code (ex: Fxx) et causes constructeur.",
        actions: "Ajoute tes codes SEW depuis manuel/étiquette variateur.",
        notes: "Tu peux supprimer cette ligne."
      }
    ];
    for (const f of flt){
      await this.put("faults", {
        id: uid("flt"),
        ...f,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    await this.setSetting("seeded", true);
  }

  async createNode({ parentId, level, name, meta={} }){
    const levels = await this.getSetting("levels", ["Site","Unité","Ligne","Machine","Équipement"]);
    const type = ["site","unite","ligne","machine","equipement"][Math.min(level, 4)] || "equipement";
    const node = { id: uid("node"), type, level, parentId: parentId ?? null, name, meta, createdAt: Date.now() };
    await this.put("nodes", node);
    return node;
  }

  async updateNode(id, patch){
    const node = await this.get("nodes", id);
    if (!node) return null;
    const updated = { ...node, ...patch };
    await this.put("nodes", updated);
    return updated;
  }

  async childrenOf(parentId){
    const kids = await this.queryIndex("nodes", "by_parent", parentId);
    return kids.sort((a,b) => a.name.localeCompare(b.name, "fr"));
  }

  async deleteNodeCascade(nodeId){
    // Delete node + all descendants + linked interventions + linked checklists
    const allNodes = await this.all("nodes");
    const toDelete = new Set([nodeId]);
    let changed = true;
    while(changed){
      changed = false;
      for (const n of allNodes){
        if (n.parentId && toDelete.has(n.parentId) && !toDelete.has(n.id)){
          toDelete.add(n.id);
          changed = true;
        }
      }
    }
    // delete interventions + checklists tied to nodes
    const ints = await this.all("interventions");
    const cls = await this.all("checklists");
    for (const i of ints){
      if (toDelete.has(i.nodeId)) await this.del("interventions", i.id);
    }
    for (const c of cls){
      if (c.nodeId && toDelete.has(c.nodeId)) await this.del("checklists", c.id);
    }
    for (const id of toDelete){
      await this.del("nodes", id);
    }
    return toDelete.size;
  }

  async addIntervention(data){
    const id = uid("int");
    const record = {
      id,
      createdAt: Date.now(),
      durationMin: Number(data.durationMin || 0),
      category: data.category || "panne",
      symptom: (data.symptom || "").trim(),
      action: (data.action || "").trim(),
      cause: (data.cause || "").trim(),
      parts: (data.parts || "").trim(),
      status: data.status || "ok",
      tags: data.tags || [],
      nodeId: data.nodeId
    };
    await this.put("interventions", record);
    return record;
  }

  async interventionsForNode(nodeId){
    const items = await this.queryIndex("interventions", "by_node", nodeId);
    return items.sort((a,b)=> b.createdAt - a.createdAt);
  }

  async recentInterventions(limit=30){
    const all = await this.all("interventions");
    all.sort((a,b)=> b.createdAt - a.createdAt);
    return all.slice(0, limit);
  }

  async setChecklistForNode(nodeId, title, items){
    const rec = {
      id: uid("cl"),
      scope: "node",
      nodeId,
      title,
      items: items.map((t,i)=>({ id: `${i}`, text: t, checked:false })),
      updatedAt: Date.now()
    };
    await this.put("checklists", rec);
    return rec;
  }

  async checklistsForNode(nodeId){
    const items = await this.queryIndex("checklists", "by_node", nodeId);
    return items.sort((a,b)=> (a.title||"").localeCompare(b.title||"", "fr"));
  }


  // ---- Mechanical: bearings ----

  // ---- Automatisme: faults ----
  async faultsAll(){
    const items = await this.all("faults");
    return items.sort((a,b)=> {
      const va = (a.vendor||"").localeCompare(b.vendor||"", "fr");
      if (va) return va;
      const pa = (a.product||"").localeCompare(b.product||"", "fr");
      if (pa) return pa;
      return (a.code||"").localeCompare(b.code||"", "fr");
    });
  }

  async faultsSearch(q, {vendor=null, product=null} = {}){
    const query = (q||"").trim().toLowerCase();
    const all = await this.faultsAll();
    return all.filter(f=>{
      if (vendor && f.vendor !== vendor) return false;
      if (product && f.product !== product) return false;
      if (!query) return true;
      const txt = `${f.vendor} ${f.product} ${f.code} ${f.title||""} ${f.causes||""} ${f.actions||""} ${f.notes||""}`.toLowerCase();
      return txt.includes(query);
    });
  }

  async addFault({vendor, product, code, title="", causes="", actions="", notes=""}){
    const id = `flt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
    const rec = {
      id,
      vendor: (vendor||"").trim(),
      product: (product||"").trim(),
      code: (code||"").trim().toUpperCase(),
      title: (title||"").trim(),
      causes: (causes||"").trim(),
      actions: (actions||"").trim(),
      notes: (notes||"").trim(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    if (!rec.vendor || !rec.product || !rec.code) throw new Error("Champs obligatoires manquants");
    await this.put("faults", rec);
    return rec;
  }

  async updateFault(id, patch){
    const cur = await this.get("faults", id);
    if (!cur) throw new Error("Introuvable");
    const nxt = {
      ...cur,
      ...patch,
      code: (patch.code ?? cur.code ?? "").trim().toUpperCase(),
      updatedAt: Date.now()
    };
    await this.put("faults", nxt);
    return nxt;
  }

  async deleteFault(id){
    await this.del("faults", id);
  }

  async bearingsAll(){
    const items = await this.all("bearings");
    // sort by ref then note
    return items.sort((a,b)=> (a.ref||"").localeCompare(b.ref||"", "fr"));
  }

  async bearingsSearch(q){
    const query = (q || "").trim().toLowerCase();
    const all = await this.bearingsAll();
    if (!query) return all;
    return all.filter(b => {
      const txt = `${b.ref} ${b.type||""} ${b.note||""} ${b.d||""} ${b.D||""} ${b.B||""}`.toLowerCase();
      return txt.includes(query);
    });
  }

  async addBearing({ref, d, D, B, type="", note=""}){
    const id = `brg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
    const rec = {
      id,
      ref: (ref||"").trim().toUpperCase(),
      d: Number(d)||null,
      D: Number(D)||null,
      B: Number(B)||null,
      type: (type||"").trim(),
      note: (note||"").trim(),
      createdAt: Date.now()
    };
    if (!rec.ref) throw new Error("Référence vide");
    await this.put("bearings", rec);
    return rec;
  }

  async deleteBearing(id){
    await this.del("bearings", id);
  }

  async globalTemplates(){
    const all = await this.queryIndex("checklists","by_scope","global");
    return all.sort((a,b)=> (a.title||"").localeCompare(b.title||"", "fr"));
  }

  async exportAll(){
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: await this.all("settings"),
      nodes: await this.all("nodes"),
      interventions: await this.all("interventions"),
      checklists: await this.all("checklists")
    };
    return payload;
  }

  async importAll(payload){
    if (!payload || typeof payload !== "object") throw new Error("Fichier invalide.");
    // Basic guard
    const { settings=[], nodes=[], interventions=[], checklists=[] } = payload;
    // Wipe existing
    for (const store of ["settings","nodes","interventions","checklists"]){
      const all = await this.all(store);
      for (const item of all){
        await this.del(store, item.key || item.id);
      }
    }
    // Insert
    for (const s of settings) await this.put("settings", s);
    for (const n of nodes) await this.put("nodes", n);
    for (const i of interventions) await this.put("interventions", i);
    for (const c of checklists) await this.put("checklists", c);


    // Seed: bearings (common refs)
    const brgs = [
      { ref:"6201", d:12, D:32, B:10, type:"deep groove", note:"base" },
      { ref:"6202", d:15, D:35, B:11, type:"deep groove", note:"base" },
      { ref:"6203", d:17, D:40, B:12, type:"deep groove", note:"base" },
      { ref:"6204", d:20, D:47, B:14, type:"deep groove", note:"base" },
      { ref:"6205", d:25, D:52, B:15, type:"deep groove", note:"base" },
      { ref:"6304", d:20, D:52, B:15, type:"deep groove", note:"base" },
      { ref:"6305", d:25, D:62, B:17, type:"deep groove", note:"base" },
      { ref:"6004", d:20, D:42, B:12, type:"deep groove", note:"base" },
      { ref:"6005", d:25, D:47, B:12, type:"deep groove", note:"base" }
    ];
    for (const b of brgs){
      await this.put("bearings", {
        id: uid("brg"),
        ref: b.ref,
        d: b.d, D: b.D, B: b.B,
        type: b.type,
        note: b.note,
        createdAt: Date.now()
      });
    }


    // Seed: automatisme faults (templates de base — à enrichir)
    const flt = [
      {
        vendor: "Siemens",
        product: "PLC (Step7/TIA)",
        code: "BF",
        title: "Bus Fault (défaut bus)",
        causes: "Perte de communication sur le bus (PROFIBUS/PROFINET/AS-i selon équipement).",
        actions: "Vérifier alimentation modules, câbles/connexions, terminaison, adresse/nom PROFINET, switch, diagnostics ET200/IM.",
        notes: "Ajouter ici tes cas réels (ex: ET200 zone convoyeur)."
      },
      {
        vendor: "Siemens",
        product: "PLC (Step7/TIA)",
        code: "SF",
        title: "System Fault (défaut système)",
        causes: "Erreur système/diagnostic module, configuration, périphérique en défaut.",
        actions: "Lire le buffer de diagnostic, vérifier configuration HW, remplacer module si besoin, contrôler tension 24V.",
        notes: ""
      },
      {
        vendor: "SEW",
        product: "Variateur (MOVITRAC/MOVIDRIVE)",
        code: "EXEMPLE",
        title: "Entrée d'exemple",
        causes: "À remplacer par un vrai code (ex: Fxx) et causes constructeur.",
        actions: "Ajoute tes codes SEW depuis manuel/étiquette variateur.",
        notes: "Tu peux supprimer cette ligne."
      }
    ];
    for (const f of flt){
      await this.put("faults", {
        id: uid("flt"),
        ...f,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    await this.setSetting("seeded", true);
  }
}

export const db = new DB();
