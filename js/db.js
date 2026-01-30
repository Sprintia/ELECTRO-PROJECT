// IndexedDB wrapper — Electro Terrain V1
const DB_NAME = "electroTerrain";
const DB_VERSION = 1;

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
      req.onupgradeneeded = () => {
        const db = req.result;

        const nodes = db.createObjectStore("nodes", { keyPath: "id" });
        nodes.createIndex("by_parent", "parentId", { unique: false });
        nodes.createIndex("by_type", "type", { unique: false });

        const interventions = db.createObjectStore("interventions", { keyPath: "id" });
        interventions.createIndex("by_node", "nodeId", { unique: false });
        interventions.createIndex("by_date", "createdAt", { unique: false });

        const checklists = db.createObjectStore("checklists", { keyPath: "id" });
        checklists.createIndex("by_scope", "scope", { unique: false });
        checklists.createIndex("by_node", "nodeId", { unique: false });

        const settings = db.createObjectStore("settings", { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
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

    await this.setSetting("seeded", true);
  }
}

export const db = new DB();
