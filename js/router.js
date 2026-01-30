export class Router {
  constructor(){
    this.routes = [];
    this.viewEl = null;
    this.before = null;
  }
  add(path, handler){
    this.routes.push({ path, handler });
  }
  onBeforeRender(fn){ this.before = fn; }
  start(viewEl){
    this.viewEl = viewEl;
    window.addEventListener("hashchange", () => this.refresh());
    if (!location.hash) location.hash = "#/";
    this.refresh();
  }
  parse(){
    const raw = (location.hash || "#/").slice(1); // remove #
    const [path, qs] = raw.split("?");
    const params = new URLSearchParams(qs || "");
    return { path, params };
  }
  match(path){
    return this.routes.find(r => r.path === path);
  }
  async refresh(){
    if (!this.viewEl) return;
    if (this.before) await this.before();
    const { path, params } = this.parse();
    const route = this.match(path);
    if (!route) {
      location.hash = "#/";
      return;
    }
    this.viewEl.innerHTML = `<div class="card flat"><div class="small">Chargement…</div></div>`;
    await route.handler(params);
  }
}
