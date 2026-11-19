// Sincronização da "Minha Pasta" com a nuvem (servidor do WDQ Sampler).
import { projectToFile, projectFromFile } from './project.js';

export class Cloud {
  constructor(auth) { this.auth = auth; }
  get on() { return this.auth.mode === 'cloud' && !!this.auth.user; }
  get api() { return this.auth.api; }

  async list() {
    if (!this.on) return [];
    const { projects } = await this.api.call('projects');
    return projects.map((r) => ({ id: r.id, name: r.name, bpm: r.bpm, updated: new Date(r.updated_at).getTime() }));
  }

  async upload(project) {
    if (!this.on) return;
    const blob = await projectToFile(project);
    const qs = `&id=${encodeURIComponent(project.id)}&name=${encodeURIComponent(project.name)}&bpm=${project.bpm || ''}&updated=${project.updated || Date.now()}`;
    await this.api.call('project_put', undefined, { qs, raw: blob });
  }

  async download(id) {
    return projectFromFile(await this.api.call('project_get', undefined, { qs: '&id=' + encodeURIComponent(id), blob: true }));
  }

  async remove(id) {
    if (!this.on) return;
    await this.api.call('project_del', { id });
  }
}
