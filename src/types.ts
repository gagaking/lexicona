export interface ImagePromptPair {
  id: string; 
  imageUrl: string; 
  imageName: string;
  imageDataUrl?: string;
  image?: File;
  prompt: string; 
  structuredPrompt?: any;
  negativePrompt?: string; 
  styleName: string; 
  imageTags?: string;
  isUrlImport?: boolean;
  imgbbUrl?: string;
  isEdited?: boolean;
  editedSubject?: string;
  modelVendor?: string;
  depthMapUrl?: string;
  activeView?: 'original' | 'depth';
  isProcessingDepth?: boolean;
}

export interface MoodboardItem {
  id: string;
  assetId?: string; // Optional reference to an Asset
  imageUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  title?: string;
  lockedAspects?: string[];
  sourceItemIds?: string[];
}

export interface Asset {
  id: string; // ①
  title: string; // ②
  styleEffect: string; // ③ 风格与效果
  lightingAngle: string; // ④ 光影与机位
  subjectPose: string; // ⑤ 主体与姿态
  colorVibe: string; // ⑥ 主色与氛围
  backgroundSpace: string; // ⑦ 背景与空间
  propsInteraction: string; // ⑧ 道具与互动
  actionDetails: string; // ⑨ 动作与细节
  outfitStyle: string; // ⑩ 穿搭与风格
  specialEffects: string; // ⑪ 特殊效果
  imageUrl: string; // ⑫ 图片URL
  tags: string; // ⑬ 标签 (comma separated ideally)
  createdAt: number;
  referenceImages?: string[]; // 引用图片的URLs
  englishTranslations?: Record<string, string>;
  modelVendor?: string;
}

export interface Gadget {
  id: string;
  name: string;
  description: string;
  instruction: string;
  knowledge?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  modelVendor?: string;
  image?: { name: string; dataUrl: string; type: string; };
  files?: { name: string; content: string; type: string; }[];
}

export interface ChatSession {
  id: string;
  gadgetId: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}

export type AIProvider = 'google' | 'deepseek' | 'ollama' | 'xiaomi';

export interface AIConfig {
  provider: AIProvider;
  googleApiKey: string;
  googleModel: string;
  deepseekApiKey: string;
  deepseekModel: string;
  xiaomiApiKey: string;
  xiaomiModel: string;
  ollamaEndpoint: string;
  ollamaModel: string;
  remoteCsvUrl?: string;
  reversePromptProvider?: AIProvider;
  reversePromptOllamaModel?: string;
  reversePromptConcurrency?: number;
  temperature?: number;
  depthModelPath?: string;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'xiaomi',
  googleApiKey: '',
  googleModel: 'gemini-2.5-flash',
  deepseekApiKey: '',
  deepseekModel: 'deepseek-v4-flash',
  xiaomiApiKey: '',
  xiaomiModel: 'mimo-v2.5',
  ollamaEndpoint: 'http://127.0.0.1:11434',
  ollamaModel: 'llama3',
  remoteCsvUrl: 'https://cdn.jsdelivr.net/gh/gagaking/lexicona@main/12.csv',
  reversePromptProvider: 'xiaomi',
  reversePromptOllamaModel: 'llava',
  reversePromptConcurrency: 3,
  temperature: 0.7,
  depthModelPath: 'C:\\Users\\sa\\Documents\\lexicona\\models\\depth_anything_v2_vitl.pth',
};

export function getModelVendorString(config: AIConfig, isReversePrompt = false): string {
  const provider = isReversePrompt ? (config.reversePromptProvider || config.provider) : config.provider;
  if (provider === 'google') return `Google / ${config.googleModel}`;
  if (provider === 'deepseek') return `DeepSeek / ${config.deepseekModel}`;
  if (provider === 'xiaomi') return `Xiaomi / ${config.xiaomiModel || 'mimo-v2.5'}`;
  if (provider === 'ollama') {
     const model = isReversePrompt ? (config.reversePromptOllamaModel || config.ollamaModel) : config.ollamaModel;
     return `Ollama / ${model}`;
  }
  return 'Unknown';
}
