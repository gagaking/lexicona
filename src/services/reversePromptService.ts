import { AIConfig } from '../types';

const CATEGORIES = {
  styleAndEffect:{label:"1️⃣ 风格与效果",fields:{style:"风格",lighting:"光影",overallStyle:"整体风格",postProcessingColor:"后期色彩"}},
  lightingAndCamera:{label:"2️⃣ 光影与机位",fields:{mainLight:"主光",lightRatio:"光比",shadows:"阴影",shotType:"景别",cameraAngle:"机位角度",focalLength:"焦段",ambientLightReflections:"环境光/反射",localLightEffects:"局部光效",subjectAndBackgroundSimple:"主体与背景简述"}},
  subjectAndPose:{label:"3️⃣ 主体与姿态",fields:{person:"人物",facialExpression:"面部表情",gaze:"眼神",microActions:"微动作",subjectPosition:"主体位置",headPosition:"头部位置",torsoPose:"躯干姿态",leftArmPose:"左臂姿态",rightArmPose:"右臂姿态",leftLegPose:"左腿姿态",rightLegPose:"右腿姿态",toePosition:"脚尖位置"}},
  primaryColorsAndAtmosphere:{label:"4️⃣ 主色与氛围",fields:{primaryColor:"主色",secondaryColor:"副色",accentColor:"点缀色",overallAtmosphere:"整体氛围",localGradient:"局部渐变",environmentalReflection:"环境反射"}},
  backgroundAndSpace:{label:"5️⃣ 背景与空间",fields:{geometry:"几何构成",scale:"比例",material:"材质",lightInteraction:"光影互动",spatialSense:"空间感"}},
  propsAndInteraction:{label:"6️⃣ 道具与互动",fields:{propType:"道具类型",interaction:"互动方式",fingerJointAngles:"手指/关节角度",fabricFolds:"织物褶皱",propRatio:"道具占比"}},
  actionAndDetails:{label:"7️⃣ 动作与细节",fields:{mainAction:"主体动作",leftHand:"左手",rightHand:"右手",accessories:"配饰",gaze:"眼神",microAction:"微动作"}},
  outfitAndStyle:{label:"8️⃣ 穿搭与风格",fields:{top:"上装",bottom:"下装",footwear:"鞋子",reflectionAndFolds:"反光与褶皱",colorHarmony:"色彩和谐",outfitConsistency:"穿搭一致性"}},
  specialEffects:{label:"9️⃣ 特殊效果",fields:{effects:"视觉特效",postProcessing:"后期处理",materialAccuracy:"材质精度"}}
};

const SYSTEM_PROMPT = `
作为一名专业的图像分析师，你的任务是客观、精确、极其详细地分析所提供的图像。你必须严格描述画面中实际存在的内容，禁止推断、想象或添加任何画面以外的元素。你的输出必须是一个结构化的JSON对象。

核心原则:

1.绝对客观: 只描述你所看到的，不能虚构画面中没有的。

2.主体优先: 首先识别图像的核心主体。

3.精确量化: 对数量、位置、角度要尽可能精确。

JSON Schema & 详细说明:

根对象必须包含以下12个键: "styleAndEffect", "lightingAndCamera", "subjectAndPose", "primaryColorsAndAtmosphere", "backgroundAndSpace", "propsAndInteraction", "actionAndDetails", "outfitAndStyle", "specialEffects", "styleName", "imageTags".

结构定义 (9大类字段):

1.风格与效果:
风格, 光影, 整体风格, 后期色彩；

2.光影与机位:
主光, 光比, 阴影, 景别, 机位角度, 焦段, 环境光/反射, 局部光效, 主体与背景简述
必须明确区分画面左右与主体左右（以画面视角为准）。所有空间方位、光照来源、投影去向均必须且只能以“观众看这张图时的左（画面左）”和“观众看这张图时的右（画面右）”来定义，禁止使用人物自身的身体左右视点。构图必须保持非对称结构。
；
3.主体与姿态:
人物, 面部表情, 眼神, 微动作, 主体位置（若为单人需明确：画面左侧 / 画面右侧 / 偏左三分之一 / 偏右三分之一；若为双人或多人，绝对不要用死板的左右1/3分立列将多个角色生硬割裂，必须重点描述他们的【重叠与遮挡（overlap/occlusion）】关系（比如谁的肩膀、手臂或躯干部分重合挡住了谁、谁在前半遮挡谁在后）、【物理互动与身体接触】关系（如搭肩、搂腰、并排紧贴、执手、眼神近距离交汇对视），从而建立角色间的有机互动，拒绝毫无生气的各占一边的排队分布姿态）、头部位置, 躯干姿态, 左臂姿态, 右臂姿态, 左腿姿态, 右腿姿态, 脚尖位置
；

4.主色与氛围:
主色, 副色, 点缀色, 整体氛围, 局部渐变, 环境反射；

5.背景与空间:
几何构成, 比例, 材质, 光影互动, 空间感。
画面构图必须保持非对称空间分布。若是单人项目，主体位置需明确落在画面左侧或右侧的三分之一区域之一；若是双人或多人项目，绝不能割裂成左右1/3对称或孤立独立的死板构图，必须详细描述他们因【身体重合、微倾交错或前后纵深叠放】所构成的统一、自然的复合重心，使其在非对称构图中建立丰富的空间深层层次、纵深感与亲密的交互感。

6.道具与互动:
道具类型, 互动方式（包括人与道具的交互，以及【多角色之间密切的物理接触与情感互动】，如：两人的动作互动、眼神呼应、肢体交叉错落、接触接触角度，必须明确如何通过肢体纠缠、交互或重叠遮挡来表达人物关系张力，严禁让角色之间出现零互动的隔离状态）, 手指/关节角度, 织物褶皱, 道具占比；

7.动作与细节:
主体动作, 手、脚位置, 配饰, 眼神, 微动作。

8.穿搭与风格:
上装, 下装, 鞋子, 反光与褶皱, 色彩和谐, 穿搭一致性。


9.特殊效果:
视觉特效, 后期处理, 材质精度；

关键字段说明:

1."imageTags" (强制标准化):
用于生成统一的图像分类标签，必须严格遵循以下选项，各标签之间用逗号分隔：

第一部分 (必须选1个): 必须且仅能从以下4个类别中提取最合适的一个："模特类"、"静物类"、"局部类"、"棚拍类"。

第二部分 (必须选3-5个): 根据图像特征，从以下选项中选择3到5个对应的特征词："纯色背景"、"真实场景"、"影棚布景"、"CG/合成感"、"明亮高调"、"暗调氛围"、"强对比光"、"柔和漫射光"、"饱和"、"低饱和"、"暖色氛围"、"冷色氛围"。

示例输出："模特类, 真实场景, 明亮高调, 暖色氛围, 柔和漫射光"

2."styleName":
一个非常简短的，2-5个词的图像风格总结。

示例: "复古学院风时尚人像", "户外运动风人像摄影", "空灵棱镜光人像"

其他类别 (structuredPrompt):

请填充 "styleAndEffect", "lightingAndCamera" 等对象中的所有字段。

每个字段的描述必须：语言自然流畅、简洁精炼、不做解释内容，没有倒装成分或无谓的修饰；无多余、重复的标点符号；不含无效、占位性内容。

如果某字段不适用、无明显特征、不存在或在画面中不可见，请严格直接留空。

🚨 零无效 Placeholder 要求 (极关键):
对于画面中不存在、未出现或不适用的一切字段，严禁写任何表示不适用、不可见的虚假/占位描述词。
绝对不要生成以下占位文案，包括但不限于："画面中不可见"、"不可见"、"未出现"、"无"、"N/A"、"不适用"、"未涉及"、"无法判断"、"画面外"等。若无内容，对应字符串必须为 '""'。

输出要求:

你的全部输出必须是一个单一、有效的 JSON 对象。

所有描述细节应为通顺连贯的短句，不得在末尾加上不必要的标点符号（如句号）。

不要在 JSON 对象前后包含任何文本、解释或 markdown 格式。

字段内容、图片标签到所有的描述细节全部只输出中文。
`;

const NEGATIVE_PROMPT = "低分辨率, 模糊, 背景杂乱, 畸形,collage, grid, split screen, multiple views, multiple angles, triptych, photobooth grid, repeating patterns, a pair of shoes, collection sheet;";

async function fetchWithTimeout(resource: URL | RequestInfo, options: RequestInit & { timeout?: number } = {}) {
  const { timeout = 120000 } = options;
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  const onAbort = () => {
    clearTimeout(id);
    controller.abort();
  };
  if (options.signal) {
    options.signal.addEventListener('abort', onAbort);
  }

  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal  
    });
    if (options.signal) options.signal.removeEventListener('abort', onAbort);
    clearTimeout(id);
    return response;
  } catch (error: any) {
    if (options.signal) options.signal.removeEventListener('abort', onAbort);
    clearTimeout(id);
    if (error.name === 'AbortError' && (!options.signal || !options.signal.aborted)) {
      throw new Error(`请求超时 (Request Timeout): 接口在 ${timeout / 1000} 秒内没有响应，请核实网络或代理状态。`);
    }
    // 拦截Failed to fetch
    if (error.message && error.message.includes("Failed to fetch")) {
      throw new Error(`网络连接失败 (Failed to fetch)。\n提示: 你的浏览器无法连通对应 API (CORS跨域拦截 或 网络被墙封锁)。\n请开启全局代理，或使用支持跨域的第三方 API。原错误: ${error.message}`);
    }
    throw error;
  }
}

const EDIT_PROMPT = `
# 核心任务
你是一位高级提示词编辑AI。你的任务是根据用户的“修改指令或新主题”来重写“原始提示词”。

# 输入数据
- 原始提示词: "{masterPrompt}"
- 修改指令/新主题: "{targetProduct}"

# 严格执行规则 (Critical)
1.  **识别意图**: 用户提供的"{targetProduct}"可能是一个新的主体名称（如"香水瓶"），也可能是一句具体的修改指令（如"把鞋子换成图中的鞋"）。
2.  **彻底清除旧描述**: 如果用户的意图是替换主体（特别是替换为“图中的...”物体），你必须**彻底删除**原始提示词中描述旧主体的所有外观细节。
    - **必须删除**: 颜色 (如"红色", "蓝色"), 材质 (如"皮革", "丝绸"), 品牌Logo, 细节 (如"系带", "拉链"), 特定纹理, 形状描述。
    - **全局扫描**: 检查所有字段（包括[主色与氛围]中的"局部渐变"、[穿搭与风格]中的"鞋子"细节），如果它们描述的是旧主体，必须清空或重写。
3.  **处理“图中”引用 (High Priority)**: 
    - 当目标是“图中的鞋”、“图中的商品”等指代词时，这意味着视觉特征完全由图像提供。
    - **禁止**保留原文本中任何关于该物体的具体形容词（如颜色、渐变、发光等），防止与新图片冲突。
    - **禁止**生成如 "图中的鞋有从蓝色到黑色的渐变" 这样的描述。如果原提示词有 "蓝色渐变"，必须删除。
    - **正确做法**: 仅保留 "图中的鞋" 或 "Matches the reference image"，删除所有形容词。
    - 示例:
      - ❌ 错误: [鞋子: 图中的鞋，黑色皮革材质] (错误：保留了旧材质)
      - ❌ 错误: [局部渐变: 图中的鞋有蓝色光效] (错误：保留了旧光效)
      - ✅ 正确: [鞋子: 图中的鞋]
      - ✅ 正确: [局部渐变: ] (清空了不相关的旧渐变)
4.  **结构保持**: 如果原提示词包含 \`[类别: 描述]\` 的结构，请保持该结构，仅修改描述内容。如果不适用，可以留空该字段。

# 输出格式
仅输出修改后的最终提示词段落，不要包含任何前缀、Markdown标记或解释。
`;

// Creates the JSON schema for Gemini
function getJsonSchema() {
  const properties: any = {};
  const required: string[] = [];

  for (const catKey in CATEGORIES) {
    const cat = (CATEGORIES as any)[catKey];
    const catProps: any = {};
    const catRequired: string[] = [];
    
    for (const fieldKey in cat.fields) {
      catProps[fieldKey] = { type: "STRING", description: cat.fields[fieldKey] };
      catRequired.push(fieldKey);
    }
    
    properties[catKey] = {
      type: "OBJECT",
      properties: catProps,
      required: catRequired
    };
    required.push(catKey);
  }
  
  properties.styleName = {
    type: "STRING",
    description: "A short, 2-5 word summary of the image style."
  };
  required.push("styleName");
  
  properties.imageTags = {
    type: "STRING",
    description: "Standardized string of tags containing exactly 1 predetermined category and 3-5 predetermined features, separated by commas."
  };
  required.push("imageTags");

  return {
    type: "OBJECT",
    properties,
    required
  };
}

export const isIgnorableValue = (val: any): boolean => {
  if (val === undefined || val === null) return true;
  const str = String(val).trim();
  if (!str) return true;
  const lowerStr = str.toLowerCase();
  
  const exactOmit = [
    '不适用', 'n/a', 'na', 'none', '无', 'nan', 'null', 'undefined', 
    '不可见', '画面中不可见', '画面不可见', '画面中未出现', '画面未出现', 
    '未出现', '未显示', '未知', '无明显特征', '无明显细节', '不明显', 
    '未见', '无法识别', '画外', '画面外', '无描述', '不详', '无细节',
    '无特效', '无配饰', '无明显渐变', '无反光与褶皱', '无特定机位'
  ];
  if (exactOmit.includes(lowerStr)) return true;
  
  if (
    lowerStr.includes('不可见') || 
    lowerStr.includes('未出现') || 
    lowerStr.includes('无法识别') || 
    lowerStr.includes('画面中未') ||
    lowerStr.includes('画面外') ||
    lowerStr.includes('不适用') ||
    lowerStr.includes('未见显') ||
    lowerStr.includes('无法观察') ||
    lowerStr === '无' ||
    lowerStr === '不适用'
  ) {
    return true;
  }
  
  return false;
};

const buildStringPrompt = (structuredPrompt: any) => {
  if (!structuredPrompt) return "";
  return Object.entries(CATEGORIES).map(([catKey, cat]) => {
    const data = structuredPrompt[catKey];
    if (!data) return "";
    
    if (typeof data === 'string') {
      const cleanData = data.trim();
      return (cleanData && !isIgnorableValue(cleanData)) ? 
        `[${cat.label.replace(/^\d+️⃣\s*/, '')}: ${cleanData}]` : "";
    }

    const items = Object.entries(cat.fields).map(([fieldKey, fieldLabel]) => {
      let val = data[fieldKey];
      if (Array.isArray(val)) {
        val = val.filter(x => x && String(x).trim() && !isIgnorableValue(x)).join('，');
      }
      return (val && typeof val === 'string' && val.trim() && !isIgnorableValue(val.trim())) ? 
        `${fieldLabel}: ${val.trim().replace(/([,，]\s*)+/g, '，').replace(/^[，\s。；;、]+|[，\s。；;、]+$/g, '')}` : "";
    }).filter(x => x !== "");
    
    if (items.length === 0) return "";
    return `[${cat.label.replace(/^\d+️⃣\s*/, '')}: ${items.join('；')}]`;
  }).filter(x => x !== "").join("; ");
};

function parseCleanJSON(text: string) {
  let cleanText = text.trim();
  
  // 1. Check if the string is wrapped in extra quotes, which means it was double-stringified.
  if (cleanText.startsWith('"') && cleanText.endsWith('"')) {
    try {
      const parsedStr = JSON.parse(cleanText);
      if (typeof parsedStr === 'string') {
        cleanText = parsedStr.trim();
      }
    } catch (e) {
      // If parsing fails, fall back to removing outer quotes manually
      cleanText = cleanText.slice(1, -1).trim();
    }
  }

  // 2. Clear any markdown code blocks if present
  if (cleanText.startsWith('```json')) {
    cleanText = cleanText.substring(7);
  } else if (cleanText.startsWith('```')) {
    cleanText = cleanText.substring(3);
  }
  if (cleanText.endsWith('```')) {
    cleanText = cleanText.substring(0, cleanText.length - 3);
  }
  cleanText = cleanText.trim();

  // 3. Find the first '{' and last '}'
  let firstBrace = cleanText.indexOf('{');
  let lastBrace = cleanText.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1) {
    cleanText = cleanText.substring(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(cleanText);
  } catch (err) {
    // 4. Try manual unescaping as fallback
    try {
      let unescaped = cleanText
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\');
      
      const fBrace = unescaped.indexOf('{');
      const lBrace = unescaped.lastIndexOf('}');
      if (fBrace !== -1 && lBrace !== -1) {
        unescaped = unescaped.substring(fBrace, lBrace + 1);
      }
      return JSON.parse(unescaped);
    } catch (innerErr) {
      try {
        let fixedText = cleanText
          .replace(/,\s*([}\]])/g, '$1')
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
          .replace(/\\'/g, "'");
        return JSON.parse(fixedText);
      } catch (finalErr) {
        throw err;
      }
    }
  }
}

function normalizeParsedResponse(parsed: any): any {
  if (!parsed || typeof parsed !== 'object') return parsed;

  const normalized: any = {};
  
  // 1. Map top-level keys like styleName, imageTags
  const topKeys = ['styleName', 'imageTags'];
  const topChineseKeys: Record<string, string> = {
    '风格名称': 'styleName',
    '风格': 'styleName',
    '图像标签': 'imageTags',
    '图片标签': 'imageTags',
    '标签': 'imageTags',
  };

  // 2. Identify categories mapping
  const categoryKeys = Object.keys(CATEGORIES); // e.g. ["styleAndEffect", ...]
  
  // Create mapping of possible Chinese names of categories to the English category key
  const catNamesMapping: Record<string, string> = {
    "风格与效果": "styleAndEffect",
    "光影与机位": "lightingAndCamera",
    "主体与姿态": "subjectAndPose",
    "主色与氛围": "primaryColorsAndAtmosphere",
    "背景与空间": "backgroundAndSpace",
    "道具与互动": "propsAndInteraction",
    "动作与细节": "actionAndDetails",
    "穿搭与风格": "outfitAndStyle",
    "特殊效果": "specialEffects"
  };

  // Find matches in the original object
  for (const rawKey of Object.keys(parsed)) {
    let targetCategoryKey: string | null = null;
    
    if (categoryKeys.includes(rawKey)) {
      targetCategoryKey = rawKey;
    } else {
      // 1. Try to find match using English keys (substring or case-insensitive)
      for (const engCatKey of categoryKeys) {
        if (rawKey.toLowerCase().includes(engCatKey.toLowerCase()) || 
            engCatKey.toLowerCase().includes(rawKey.toLowerCase())) {
          targetCategoryKey = engCatKey;
          break;
        }
      }
      
      // 2. Try to find match using Chinese category names
      if (!targetCategoryKey) {
        for (const [cnCatName, engCatKey] of Object.entries(catNamesMapping)) {
          if (rawKey.includes(cnCatName) || cnCatName.includes(rawKey) ||
              rawKey.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').includes(cnCatName)) {
            targetCategoryKey = engCatKey;
            break;
          }
        }
      }
    }
    
    if (targetCategoryKey) {
      // We found a matching category! Let's normalize its fields.
      const rawCategoryData = parsed[rawKey];
      if (rawCategoryData && typeof rawCategoryData === 'object') {
        const catConfig = (CATEGORIES as any)[targetCategoryKey];
        const normalizedSubObj: any = {};
        
        // Let's create mapping for the fields in this category
        const fieldConfig = catConfig.fields; // e.g. { style: "风格", lighting: "光影" }
        
        // Loop through English field keys and look them up in rawCategoryData
        for (const [engFieldKey, cnFieldName] of Object.entries(fieldConfig) as [string, string][]) {
          // Check if English key exists exactly
          if (rawCategoryData[engFieldKey] !== undefined) {
            normalizedSubObj[engFieldKey] = rawCategoryData[engFieldKey];
          } else {
            // Find a Chinese key that matches cnFieldName or engFieldKey
            let foundVal: any = undefined;
            for (const rawFieldKey of Object.keys(rawCategoryData)) {
              if (rawFieldKey === cnFieldName || 
                  rawFieldKey.toLowerCase() === engFieldKey.toLowerCase() ||
                  rawFieldKey.includes(cnFieldName) || 
                  cnFieldName.includes(rawFieldKey)) {
                foundVal = rawCategoryData[rawFieldKey];
                break;
              }
            }
            normalizedSubObj[engFieldKey] = foundVal !== undefined ? foundVal : "";
          }
        }
        
        normalized[targetCategoryKey] = normalizedSubObj;
      } else if (rawCategoryData !== undefined && rawCategoryData !== null) {
        normalized[targetCategoryKey] = String(rawCategoryData);
      }
    } else {
      // It's a top-level property like styleName or imageTags
      let mappedKey = rawKey;
      if (topKeys.includes(rawKey)) {
        mappedKey = rawKey;
      } else {
        for (const [cnKey, engKey] of Object.entries(topChineseKeys)) {
          if (rawKey.includes(cnKey) || cnKey.includes(rawKey)) {
            mappedKey = engKey;
            break;
          }
        }
      }
      normalized[mappedKey] = parsed[rawKey];
    }
  }

  // Backfill any missing categories with empty objects containing empty strings for fields
  for (const catKey of categoryKeys) {
    if (!normalized[catKey]) {
      const catConfig = (CATEGORIES as any)[catKey];
      const emptySubObj: any = {};
      for (const fieldKey of Object.keys(catConfig.fields)) {
        emptySubObj[fieldKey] = "";
      }
      normalized[catKey] = emptySubObj;
    }
  }

  // Ensure styleName and imageTags exist
  if (normalized.styleName === undefined) {
    normalized.styleName = parsed.styleName || "未命名风格";
  }
  if (normalized.imageTags === undefined) {
    normalized.imageTags = parsed.imageTags || "";
  }

  return normalized;
}

export async function unloadOllamaModel(config: AIConfig) {
  if (config.reversePromptProvider === 'ollama' || config.provider === 'ollama') {
    const ollamaUrl = `${config.ollamaEndpoint?.replace(/\/$/, '')}/api/chat`;
    try {
      await fetch(ollamaUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.reversePromptOllamaModel || config.ollamaModel || 'llava',
          keep_alive: 0
        })
      });
    } catch (e) {
      console.error("Failed to unload ollama model", e);
    }
  }
}

export async function generatePromptFromImage(base64Data: string, mimeType: string, imageUrl: string | undefined, config: AIConfig, abortSignal?: AbortSignal) {
  try {
    let resultText = "";
    const provider = config.reversePromptProvider || config.provider;
    
    if (provider === 'google') {
      const apiKey = config.googleApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY is missing');
      
      const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${config.googleModel || 'gemini-2.5-flash'}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortSignal,
        body: JSON.stringify({
          contents: [{ 
            parts: [
              { text: SYSTEM_PROMPT },
              { inline_data: { mime_type: mimeType, data: base64Data } }
            ] 
          }],
          generationConfig: { 
            response_mime_type: "application/json",
            response_schema: getJsonSchema(),
            temperature: 0.1
          }
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${res.status}`);
      }

      const response = await res.json();
      resultText = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else if (provider === 'ollama') {
      const ollamaUrl = `${config.ollamaEndpoint?.replace(/\/$/, '')}/api/chat`;
      const res = await fetchWithTimeout(ollamaUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortSignal,
        body: JSON.stringify({
          model: config.reversePromptOllamaModel || config.ollamaModel || 'llava',
          format: "json",
          messages: [{ role: "user", content: SYSTEM_PROMPT, images: [base64Data] }],
          stream: false,
          options: { temperature: 0.1 } // Removed num_gpu: 999 which causes 400s on some cloud providers
        })
      });
      if (!res.ok) {
        let errMsg = "";
        try {
          const errObj = await res.json();
          errMsg = errObj.error?.message || errObj.error || JSON.stringify(errObj);
        } catch (e) {
          errMsg = await res.text().catch(() => "");
        }
        throw new Error(`Ollama Req Failed: ${res.status} ${res.statusText} \nDetails: ${errMsg}`);
      }
      const json = await res.json();
      resultText = json.message?.content || "";
    } else if (provider === 'xiaomi') {
      const apiKey = config.xiaomiApiKey?.trim();
      if (!apiKey) throw new Error('Xiaomi API Key is missing');
      
      const endpoint = 'https://api.xiaomimimo.com/v1/chat/completions';
      const model = config.xiaomiModel || 'mimo-v2.5';
      const maxRetries = 3;
      let res;
      let attempt = 0;
      
      const payloadImageUrl = (imageUrl && imageUrl.startsWith('http')) ? imageUrl : `data:${mimeType};base64,${base64Data}`;
      
      while (attempt < maxRetries) {
        try {
          res = await fetchWithTimeout(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            signal: abortSignal,
            body: JSON.stringify({
              model: model,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: SYSTEM_PROMPT },
                    { type: 'image_url', image_url: { url: payloadImageUrl } }
                  ]
                }
              ],
              response_format: { type: 'json_object' },
              temperature: 0.1
            })
          });
          
          if (res.ok) break;
          attempt++;
          if (attempt >= maxRetries) break;
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
          attempt++;
          if (attempt >= maxRetries) throw e;
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      if (!res?.ok) {
        let errorData: any = {};
        try { errorData = await res?.json(); } catch(e){}
        throw new Error(errorData?.error?.message || `HTTP ${res?.status}`);
      }

      const response = await res.json();
      resultText = response.choices?.[0]?.message?.content || "";
    } else {
       throw new Error(`当前图片反推暂不支持 ${provider} 提供商`);
    }

    if (!resultText) throw new Error("API returned no content");
    
    let parsed;
    try {
      parsed = parseCleanJSON(resultText);
    } catch (parseErr: any) {
      console.error("Failed to parse JSON response:", resultText);
      throw new Error(`The model response is not valid JSON. Raw output: ${resultText.substring(0, 200)}...`);
    }

    // Normalize parsed response to ensure consistent structure & keys
    parsed = normalizeParsedResponse(parsed);

    const { styleName, imageTags, ...structuredPrompt } = parsed;
    
    const stringPrompt = buildStringPrompt(structuredPrompt);
    
    if (!stringPrompt) {
      console.error("JSON did not match the expected schema. Parsed object:", parsed);
      throw new Error(`The model returned valid JSON but it missed the required categories (e.g. styleAndEffect). Raw output: ${resultText.substring(0, 300)}...`);
    }
    
    return {
      prompt: stringPrompt,
      structuredPrompt,
      negativePrompt: NEGATIVE_PROMPT,
      styleName: styleName || "未命名风格",
      imageTags: imageTags || ""
    };
  } catch (err: any) {
    console.error("Reverse Prompt Error:", err);
    throw new Error(err.message || "Failed to generate prompt from image.");
  }
}

export async function editPromptWithSubject(masterPrompt: string, targetProduct: string, config: AIConfig) {
  try {
    const userPrompt = EDIT_PROMPT.replace("{masterPrompt}", masterPrompt).replace("{targetProduct}", targetProduct);
    
    if (config.provider === 'google') {
      const apiKey = config.googleApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY is missing');
      
      const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${config.googleModel || 'gemini-2.5-flash'}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: config.temperature ?? 0.7 }
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${res.status}`);
      }

      const response = await res.json();
      return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "错误：AI未返回编辑后的提示词";
    } else {
      // Basic fallback to local replacement if ollama doesn't support easy edit
      return masterPrompt.replace(/主体/g, targetProduct);
    }
  } catch (err: any) {
    return `错误：无法修改提示词 (${err.message})`;
  }
}
