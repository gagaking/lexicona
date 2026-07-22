import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Asset, AIConfig, DEFAULT_AI_CONFIG, ImagePromptPair, MoodboardItem, Gadget, ChatSession } from './types';
import { dbStore } from './lib/db';
import { parseCSVFromUrl } from './services/csvParser';
import { DEFAULT_GADGETS } from './lib/defaultGadgets';

const DEFAULT_CLOUD_CSV_URLS = [
  "https://cdn.jsdelivr.net/gh/gagaking/lexicona@main/12.csv"
];

interface AppState {
  assets: Asset[];
  aiConfig: AIConfig;
  setAssets: (assets: Asset[]) => void;
  updateAsset: (asset: Asset) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  addAssets: (assets: Asset[], onProgress?: (p: number) => void) => Promise<void>;
  updateAiConfig: (config: AIConfig) => Promise<void>;
  isLoading: boolean;
  generatedPrompts: Asset[];
  setGeneratedPrompts: React.Dispatch<React.SetStateAction<Asset[]>>;
  savedPromptIds: Set<string>;
  setSavedPromptIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  clearAllCache: () => Promise<void>;
  lockedFields: Record<string, { value: string, assetId: string }>;
  setLockedFields: React.Dispatch<React.SetStateAction<Record<string, { value: string, assetId: string }>>>;
  reversePromptPairs: ImagePromptPair[];
  setReversePromptPairs: React.Dispatch<React.SetStateAction<ImagePromptPair[]>>;
  moodboardItems: MoodboardItem[];
  setMoodboardItems: React.Dispatch<React.SetStateAction<MoodboardItem[]>>;
  gadgets: Gadget[];
  setGadgets: React.Dispatch<React.SetStateAction<Gadget[]>>;
  chatSessions: ChatSession[];
  setChatSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  activeGadget: Gadget | null;
  setActiveGadget: React.Dispatch<React.SetStateAction<Gadget | null>>;
}

const AppContext = createContext<AppState | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [aiConfig, setAiConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [generatedPrompts, setGeneratedPrompts] = useState<Asset[]>([]);
  const [savedPromptIds, setSavedPromptIds] = useState<Set<string>>(new Set());
  const [lockedFields, setLockedFields] = useState<Record<string, { value: string, assetId: string }>>({});
  const [reversePromptPairs, setReversePromptPairs] = useState<ImagePromptPair[]>([]);
  const [moodboardItems, setMoodboardItems] = useState<MoodboardItem[]>([]);
  const [gadgets, setGadgets] = useState<Gadget[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeGadget, setActiveGadget] = useState<Gadget | null>(null);

  useEffect(() => {
    const loadState = async () => {
      let storedAssets = await dbStore.getAllAssets();
      const storedConfig = await dbStore.getAiConfig();
      const storedGenerated = await dbStore.getGeneratedPrompts();
      const storedReverse = await dbStore.getReversePromptPairs();
      const storedMoodboard = await dbStore.getMoodboardItems();
      const storedGadgets = await dbStore.getGadgets();
      const storedChatSessions = await dbStore.getChatSessions();
      
      const isCloudSheetUnloaded = window.localStorage.getItem('cloudSheetUnloaded') === 'true';
      if (storedAssets.length === 0 && !isCloudSheetUnloaded) {
        try {
          const cloudAssets = await parseCSVFromUrl(DEFAULT_CLOUD_CSV_URLS);
          await dbStore.putAssets(cloudAssets);
          storedAssets = cloudAssets;
        } catch (e) {
          console.error('Failed to load cloud sheet:', e);
        }
      }
      
      setAssets(storedAssets.sort((a, b) => b.createdAt - a.createdAt));
      setAiConfig(storedConfig);
      if (storedGenerated) setGeneratedPrompts(storedGenerated);
      if (storedReverse) setReversePromptPairs(storedReverse);
      if (storedMoodboard) setMoodboardItems(storedMoodboard);
      if (storedChatSessions) setChatSessions(storedChatSessions);
      if (storedGadgets && storedGadgets.length > 0) {
        let finalGadgets = storedGadgets;
        const hasChatGadget = storedGadgets.some((g: any) => g.id === 'default-gadget-0');
        if (!hasChatGadget) {
           const chatGadget = DEFAULT_GADGETS.find(g => g.id === 'default-gadget-0');
           if (chatGadget) finalGadgets = [chatGadget, ...finalGadgets];
        }
        setGadgets(finalGadgets);
        if (!hasChatGadget) dbStore.setGadgets(finalGadgets);
      } else {
        setGadgets(DEFAULT_GADGETS);
        dbStore.setGadgets(DEFAULT_GADGETS);
      }
      setIsLoading(false);
    };
    loadState();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      dbStore.setGeneratedPrompts(generatedPrompts);
    }
  }, [generatedPrompts, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      dbStore.setReversePromptPairs(reversePromptPairs);
    }
  }, [reversePromptPairs, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      dbStore.setMoodboardItems(moodboardItems);
    }
  }, [moodboardItems, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      dbStore.setGadgets(gadgets);
    }
  }, [gadgets, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      dbStore.setChatSessions(chatSessions);
    }
  }, [chatSessions, isLoading]);

  const updateAsset = async (asset: Asset) => {
    await dbStore.putAsset(asset);
    setAssets(prev => prev.map(a => a.id === asset.id ? asset : a));
  };

  const deleteAsset = async (id: string) => {
    await dbStore.deleteAsset(id);
    setAssets(prev => prev.filter(a => a.id !== id));
  };

  const addAssets = async (newAssets: Asset[], onProgress?: (p: number) => void) => {
    await dbStore.putAssets(newAssets, onProgress);
    setAssets(prev => {
      const merged = new Map<string, Asset>([...prev.map(a => [a.id, a] as [string, Asset]), ...newAssets.map(a => [a.id, a] as [string, Asset])]);
      return Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt);
    });
  };

  const updateAiConfig = async (config: AIConfig) => {
    await dbStore.setAiConfig(config);
    setAiConfig(config);
  };
  
  const clearAllCache = async () => {
    // Clear all DB stores instead of deleting the DB which might be blocked by an open connection
    try {
      await dbStore.clearAllData();
    } catch(e) {
      console.error('Failed to clear IDB stores:', e);
    }

    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
      
      // Mark cloud sheet as unloaded so it doesn't auto-fetch next time
      window.localStorage.setItem('cloudSheetUnloaded', 'true');
    } catch(e) {
      console.error('Failed to clear storage:', e);
    }
    
    setAssets([]);
    setGeneratedPrompts([]);
    setSavedPromptIds(new Set());
    setReversePromptPairs([]);
    setGadgets(DEFAULT_GADGETS);
    setChatSessions([]);
  };

  return (
    <AppContext.Provider value={{
      assets, aiConfig, setAssets, updateAsset, deleteAsset, addAssets, updateAiConfig, isLoading,
      generatedPrompts, setGeneratedPrompts, savedPromptIds, setSavedPromptIds, clearAllCache,
      lockedFields, setLockedFields, reversePromptPairs, setReversePromptPairs, moodboardItems, setMoodboardItems,
      gadgets, setGadgets, chatSessions, setChatSessions,
      activeGadget, setActiveGadget
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
};
