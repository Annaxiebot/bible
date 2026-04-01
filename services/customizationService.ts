import { STORAGE_KEYS } from '../constants/storageKeys';

export interface Customization {
  id: string; description: string; css: string; config?: Record<string, any>;
  createdAt: string; updatedAt: string; isActive: boolean;
}
export interface CustomizationMetadata {
  id: string; description: string; css: string; config?: Record<string, any>;
  createdBy?: string; createdAt: string; updatedAt: string;
}
export interface CustomizationState { customizations: Customization[]; activeCSS: string; }

const STORAGE_KEY = STORAGE_KEYS.VIBE_CUSTOMIZATIONS;
function generateId(): string { return `cust_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function loadFromStorage(): Customization[] { try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : []; } catch { return []; } }
function saveToStorage(c: Customization[]): void { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); }

class CustomizationService {
  private customizations: Customization[] = [];
  private styleElement: HTMLStyleElement | null = null;
  private listeners: Set<(state: CustomizationState) => void> = new Set();

  constructor() { this.customizations = loadFromStorage(); this.ensureStyleElement(); this.applyActiveStyles(); }

  private ensureStyleElement(): void {
    if (typeof document === 'undefined') return;
    if (!this.styleElement) {
      this.styleElement = document.createElement('style');
      this.styleElement.id = 'vibe-customizations';
      this.styleElement.setAttribute('data-vibe', 'true');
      document.head.appendChild(this.styleElement);
    }
  }
  private applyActiveStyles(): void { if (this.styleElement) this.styleElement.textContent = this.getActiveCSS(); }
  private notify(): void { const s = this.getState(); this.listeners.forEach(l => l(s)); }
  private persist(): void { saveToStorage(this.customizations); this.applyActiveStyles(); this.notify(); }

  subscribe(listener: (state: CustomizationState) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  getState(): CustomizationState { return { customizations: [...this.customizations], activeCSS: this.getActiveCSS() }; }
  getActiveCSS(): string { return this.customizations.filter(c => c.isActive).map(c => `/* ${c.description} */\n${c.css}`).join('\n\n'); }
  getAll(): Customization[] { return [...this.customizations]; }
  getActive(): Customization[] { return this.customizations.filter(c => c.isActive); }
  getById(id: string): Customization | undefined { return this.customizations.find(c => c.id === id); }

  add(description: string, css: string, config?: Record<string, any>): Customization {
    const now = new Date().toISOString();
    const c: Customization = { id: generateId(), description, css: sanitizeCSS(css), config, createdAt: now, updatedAt: now, isActive: true };
    this.customizations.push(c); this.persist(); return c;
  }
  update(id: string, updates: Partial<Pick<Customization, 'description' | 'css' | 'config' | 'isActive'>>): Customization | null {
    const i = this.customizations.findIndex(c => c.id === id);
    if (i === -1) return null;
    const u = { ...this.customizations[i], ...updates, css: updates.css ? sanitizeCSS(updates.css) : this.customizations[i].css, updatedAt: new Date().toISOString() };
    this.customizations[i] = u; this.persist(); return u;
  }
  toggle(id: string): boolean { const c = this.customizations.find(c => c.id === id); if (!c) return false; c.isActive = !c.isActive; c.updatedAt = new Date().toISOString(); this.persist(); return c.isActive; }
  remove(id: string): boolean { const i = this.customizations.findIndex(c => c.id === id); if (i === -1) return false; this.customizations.splice(i, 1); this.persist(); return true; }
  clearAll(): void { this.customizations = []; this.persist(); }

  async syncToCloud(): Promise<void> {
    try { const { supabase, canSync, authManager } = await import('./supabase'); if (!supabase || !canSync()) return; const uid = authManager.getUserId(); if (!uid) return; await supabase.from('user_settings').upsert({ user_id: uid, settings: { customizations: this.customizations }, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }); } catch {}
  }
  async loadFromCloud(): Promise<boolean> {
    try { const { supabase, canSync, authManager } = await import('./supabase'); if (!supabase || !canSync()) return false; const uid = authManager.getUserId(); if (!uid) return false; const { data, error } = await supabase.from('user_settings').select('settings').eq('user_id', uid).single(); if (error || !data?.settings?.customizations) return false; const cloud = data.settings.customizations as Customization[]; if (Array.isArray(cloud) && cloud.length > 0) { const ids = new Set(this.customizations.map(c => c.id)); for (const c of cloud) { if (!ids.has(c.id)) this.customizations.push(c); } this.persist(); return true; } return false; } catch { return false; }
  }
  exportMetadata(): CustomizationMetadata[] { return this.customizations.map(c => ({ id: c.id, description: c.description, css: c.css, config: c.config, createdAt: c.createdAt, updatedAt: c.updatedAt })); }
  importCustomization(m: CustomizationMetadata): Customization { return this.add(m.description, m.css, m.config); }
}

export function sanitizeCSS(css: string): string {
  return css.replace(/@import\b[^;]*/gi, '/* @import blocked */').replace(/javascript\s*:/gi, '/* blocked */').replace(/expression\s*\(/gi, '/* blocked */').replace(/-moz-binding\s*:/gi, '/* blocked */').replace(/behavior\s*:/gi, '/* blocked */').replace(/url\s*\(\s*["']?\s*javascript/gi, '/* blocked */').trim();
}

export const customizationService = new CustomizationService();
export default customizationService;
