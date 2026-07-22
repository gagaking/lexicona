import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Asset, AIConfig, DEFAULT_AI_CONFIG } from '../types';

interface EagleDB extends DBSchema {
  assets: {
    key: string;
    value: Asset;
    indexes: { 'by-title': string };
  };
  settings: {
    key: string;
    value: any;
  };
}

let dbPromise: Promise<IDBPDatabase<EagleDB>> | null = null;

async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<EagleDB>('prompt-eagle-db-v2', 1, {
      upgrade(db) {
        const assetStore = db.createObjectStore('assets', { keyPath: 'id' });
        assetStore.createIndex('by-title', 'title');
        db.createObjectStore('settings');
      },
    });
  }
  return dbPromise;
}

export const dbStore = {
  async getAllAssets(): Promise<Asset[]> {
    const db = await getDB();
    return db.getAll('assets');
  },
  async putAsset(asset: Asset): Promise<void> {
    const db = await getDB();
    await db.put('assets', asset);
  },
  async putAssets(assets: Asset[], onProgress?: (progress: number) => void): Promise<void> {
    const db = await getDB();
    const chunkSize = 500;
    let processed = 0;
    
    for (let i = 0; i < assets.length; i += chunkSize) {
      const chunk = assets.slice(i, i + chunkSize);
      const tx = db.transaction('assets', 'readwrite');
      for (const asset of chunk) {
        tx.store.put(asset);
      }
      await tx.done;
      processed += chunk.length;
      if (onProgress) {
        onProgress(Math.min(100, Math.round((processed / assets.length) * 100)));
      }
    }
  },
  async deleteAsset(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('assets', id);
  },
  async getAiConfig(): Promise<AIConfig> {
    const db = await getDB();
    const config = await db.get('settings', 'ai-config');
    if (!config) return DEFAULT_AI_CONFIG;
    
    // Merge to ensure new fields are populated
    const mergedConfig = { ...DEFAULT_AI_CONFIG, ...config };
    
    // Migrate old google models if they are no longer supported
    if (mergedConfig.googleModel === 'gemini-1.5-pro') {
      mergedConfig.googleModel = 'gemini-2.5-flash';
    }
    
    return mergedConfig;
  },
  async setAiConfig(config: AIConfig): Promise<void> {
    const db = await getDB();
    await db.put('settings', config, 'ai-config');
  },
  async getGeneratedPrompts(): Promise<Asset[] | undefined> {
    const db = await getDB();
    return db.get('settings', 'generated-prompts');
  },
  async setGeneratedPrompts(prompts: Asset[]): Promise<void> {
    const db = await getDB();
    await db.put('settings', prompts, 'generated-prompts');
  },
  async getReversePromptPairs(): Promise<any[] | undefined> {
    const db = await getDB();
    return db.get('settings', 'reverse-prompt-pairs');
  },
  async setReversePromptPairs(pairs: any[]): Promise<void> {
    const db = await getDB();
    await db.put('settings', pairs, 'reverse-prompt-pairs');
  },
  async getMoodboardItems(): Promise<any[] | undefined> {
    const db = await getDB();
    return db.get('settings', 'moodboard-items');
  },
  async setMoodboardItems(items: any[]): Promise<void> {
    const db = await getDB();
    await db.put('settings', items, 'moodboard-items');
  },
  async getGadgets(): Promise<any[] | undefined> {
    const db = await getDB();
    return db.get('settings', 'gadgets');
  },
  async setGadgets(items: any[]): Promise<void> {
    const db = await getDB();
    await db.put('settings', items, 'gadgets');
  },
  async getChatSessions(): Promise<any[] | undefined> {
    const db = await getDB();
    return db.get('settings', 'chat-sessions');
  },
  async setChatSessions(items: any[]): Promise<void> {
    const db = await getDB();
    await db.put('settings', items, 'chat-sessions');
  },
  async clearAllData(): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(['assets', 'settings'], 'readwrite');
    await tx.objectStore('assets').clear();
    await tx.objectStore('settings').clear();
    await tx.done;
  }
};
