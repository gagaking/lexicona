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

export type AIProvider = 'google' | 'deepseek' | 'xiaomi';

export interface AIModelOption {
  label: string;
  name: string;
}

export interface AIConfig {
  provider: AIProvider;
  googleApiKey: string;
  googleModel: string;
  deepseekApiKey: string;
  deepseekModel: string;
  xiaomiApiKey: string;
  xiaomiModel: string;
  modelOptions?: Partial<Record<AIProvider, AIModelOption[]>>;
  remoteCsvUrl?: string;
  reversePromptProvider?: AIProvider;
  reversePromptConcurrency?: number;
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
  modelOptions: {},
  remoteCsvUrl: 'https://cdn.jsdelivr.net/gh/gagaking/lexicona@main/12.csv',
  reversePromptProvider: 'xiaomi',
  reversePromptConcurrency: 3,
  depthModelPath: '',
};

export const MODEL_OPTIONS: Record<AIProvider, AIModelOption[]> = {
  google: [
    { label: 'G3.5 Flash', name: 'gemini-3.5-flash' },
    { label: 'G2.5 Flash', name: 'gemini-2.5-flash' },
  ],
  deepseek: [
    { label: 'DS V4 Flash', name: 'deepseek-v4-flash' },
    { label: 'DS V4 Pro', name: 'deepseek-v4-pro' },
    { label: 'DS VL Vision Exp', name: 'deepseek-v4-flash-vision-exp' },
  ],
  xiaomi: [
    { label: 'MiMo V3', name: 'mimo-v3' },
    { label: 'MiMo V2.5', name: 'mimo-v2.5' },
  ],
};

const MODEL_FIELDS: Record<AIProvider, keyof AIConfig> = {
  google: 'googleModel',
  deepseek: 'deepseekModel',
  xiaomi: 'xiaomiModel',
};

export function getSelectedModelName(config: AIConfig, provider: AIProvider): string {
  return (config[MODEL_FIELDS[provider]] as string | undefined) ?? MODEL_OPTIONS[provider][0].name;
}

export function getModelOptions(config: AIConfig, provider: AIProvider): AIModelOption[] {
  const saved = config.modelOptions?.[provider];
  const options = saved ? saved : MODEL_OPTIONS[provider];
  const selected = getSelectedModelName(config, provider);
  if (selected && !options.some((o) => o.name === selected)) {
    return [{ label: selected, name: selected }, ...options];
  }
  return options;
}

export function getModelLabel(
  config: AIConfig,
  provider: AIProvider,
  modelName?: string,
): string {
  const name = modelName || getSelectedModelName(config, provider);
  return getModelOptions(config, provider).find((o) => o.name === name)?.label || name;
}

export function getModelVendorString(config: AIConfig, isReversePrompt = false): string {
  const provider = isReversePrompt ? (config.reversePromptProvider || config.provider) : config.provider;
  const label = getModelLabel(config, provider);
  if (provider === 'google') return `Google / ${label}`;
  if (provider === 'deepseek') return `DeepSeek / ${label}`;
  if (provider === 'xiaomi') return `Xiaomi / ${label}`;
  return 'Unknown';
}
