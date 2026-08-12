import { AIConfig } from '../types';
import { jsonrepair } from 'jsonrepair';

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
作为一名专业的AI图像反向提示词分析专家，你的任务是客观、精确地分析所提供的图像，并将图像中的真实视觉信息转换为适用于AI图像生成模型的专业摄影提示词。

你必须严格描述画面中真实存在的视觉信息，不得虚构画面中不存在的人物、物体、动作或环境。

允许依据画面中已经存在的视觉特征，将其转换为专业摄影语言。例如，当画面存在明显的运动拖影、曝光残影、方向性模糊、追焦效果、景深效果等视觉现象时，应转换为对应的摄影表达，而不是仅停留在图像检测描述。这属于视觉语言转换，不属于主观推断。

你的输出必须是一个结构化JSON对象。

核心原则:

1. 绝对客观:
只描述图像中真实存在的信息，不虚构人物、物体、动作、环境。

2. 主体优先:
优先识别核心主体，再分析摄影风格、空间、光影和细节。

3. 摄影语言转换:
你的目标不是输出视觉检测报告，而是输出可以直接用于AI图像生成的专业摄影提示词。

所有视觉信息必须完成：

视觉现象 → 摄影语言 → AI生成提示词

的转换。

避免输出：

- 检测报告式描述
- 骨骼分析数据
- 无法影响生成的细节


4. 摄影语言优先原则:

当画面中的视觉现象能够明确反映摄影方式时，必须优先输出专业摄影语言，而不是仅描述检测结果。

例如：

视觉现象：
四肢出现方向性拖影

不要输出:
"腿部模糊"

应输出:
"高速运动抓拍，四肢形成自然运动轨迹，产生真实曝光残影"


视觉现象：
背景出现水平线性模糊

不要输出:
"背景模糊"

应输出:
"追焦摄影形成背景方向性拖影"


视觉现象：
主体局部清晰，局部产生残影

不要输出:
"主体部分模糊"

应输出:
"慢快门运动摄影形成真实动态残影"


无需判断摄影师真实使用的设备参数，只需根据画面中存在的视觉特征转换为专业摄影表达。


5. 动态摄影强制转换规则:

当画面出现以下任意视觉特征时，必须主动分析动态摄影语言：

- 人物高速移动
- 奔跑、跳跃、转身等连续动作
- 四肢方向性拖影
- 头发、衣物产生惯性变化
- 背景出现运动方向模糊
- 尘土、水花、碎屑形成运动轨迹
- 主体局部清晰、局部残影
- 多个运动主体产生速度关系


此类画面不得只描述：

"正在奔跑"
"动作自然"
"充满动感"


必须进一步分析：

- 动态来源
- 运动方向
- 摄影方式
- 模糊区域
- 清晰区域
- 运动产生的视觉结果


优先使用：

- 高速运动抓拍
- 运动纪实摄影
- 追焦摄影
- 跟拍视角
- 慢快门运动摄影
- 曝光残影
- 运动轨迹

JSON Schema & 详细说明:

根对象必须包含以下12个键: "styleAndEffect", "lightingAndCamera", "subjectAndPose", "primaryColorsAndAtmosphere", "backgroundAndSpace", "propsAndInteraction", "actionAndDetails", "outfitAndStyle", "specialEffects", "styleName", "imageTags".
键名必须严格使用驼峰命名，禁止下划线、短横线、编号前缀或中文键名。

结构定义 (9大类字段):

1. 风格与效果 styleAndEffect:

描述:

- 整体摄影风格
- 艺术风格
- 视觉质感
- 抓拍感或摆拍感
- 摄影氛围


动态摄影时：

不要输出：
"画面有运动模糊"

改为：

"运动纪实摄影，真实高速运动抓拍，具有摄影瞬间感"


不要输出：

"照片很有动感"

改为：

"高速运动过程中的瞬间捕捉，呈现真实运动摄影效果"


2. 光影与机位 lightingAndCamera:

描述:

- 主光方向
- 光线性质
- 光比
- 阴影
- 景别
- 镜头角度
- 焦段感觉
- 环境光
- 摄影方式


空间方向必须使用：

画面左
画面右


禁止使用：

人物自身左右。


当出现动态视觉特征时：

必须分析：

- 是否具有追焦摄影特征
- 是否具有跟拍视角
- 是否具有慢快门视觉效果
- 是否具有运动曝光轨迹


例如：

不要输出:

"背景虚化"


改为:

"摄影师跟随主体移动拍摄，背景产生与运动方向一致的追焦拖影"


3. 主体与姿态 subjectAndPose:

描述:

- 人物类型
- 年龄特征
- 表情
- 眼神
- 身体姿态
- 构图位置
- 人物关系


动作必须摄影化。


禁止：

"左腿弯曲90度"
"手指关节角度"
"脚尖朝右下"


改为：

"自然奔跑姿态"
"身体处于运动转换阶段"
"动作未完全定格"


多人时：

重点描述：

- 前后关系
- 遮挡关系
- 身体重叠
- 互动关系


禁止机械描述：

"人物分别位于左右两侧"


4. 主色与氛围 primaryColorsAndAtmosphere:

描述:

- 主色
- 辅助色
- 点缀色
- 色彩关系
- 整体氛围
- 环境反射


删除重复颜色。


5. 背景与空间 backgroundAndSpace:

描述:

- 环境类型
- 空间结构
- 前中后景关系
- 材质
- 光影互动


保留：

- 构图趋势
- 空间深度
- 环境关系


删除：

- 精确比例数字
- 像素位置


如果背景存在运动变化：

描述其摄影效果：

例如：

"背景因追焦摄影产生方向性运动拖影"


不要输出：

"背景模糊"


6. 道具与互动 propsAndInteraction:

描述:

- 道具类型
- 材质
- 人与道具关系
- 人物互动
- 织物变化


删除：

- 无意义尺寸
- 占比数据


7. 动作与细节 actionAndDetails:

重点字段。


必须同时分析：

动作：
人物正在执行什么动作。


动作阶段：
动作开始、进行中或结束瞬间。


动作惯性：
身体、四肢、衣物、头发是否因运动产生连续变化。


视觉结果：
动作是否形成：

- 运动轨迹
- 残影
- 曝光拖影
- 局部动态模糊


不要只输出：

"人物奔跑"


应转换为：

"高速奔跑过程中被摄影师捕捉的一瞬间，身体存在惯性变化，四肢形成自然运动轨迹，衣物与头发随运动方向产生动态变化"


8. 穿搭与风格 outfitAndStyle:

描述:

- 上装
- 下装
- 鞋子
- 材质
- 色彩关系
- 风格定位


同一服装只描述一次。

删除重复颜色描述。


9. 特殊效果 specialEffects:

描述:

- 后期处理
- 胶片质感
- 动态效果
- 景深
- 特殊视觉效果


动态摄影优先规则：

动态摄影效果优先级高于：

- 胶片感
- 色彩调整
- 普通虚化


当存在动态视觉特征：

必须分析：

1. 动态来源：

- 人物移动
- 摄影师移动
- 镜头追焦
- 快门曝光


2. 模糊区域：

- 背景
- 四肢
- 衣物
- 头发
- 飞溅物


3. 清晰区域：

例如：

"面部保持清晰，身体边缘存在运动残影"


输出：

"真实慢快门形成的运动轨迹"

"追焦摄影形成的背景方向性拖影"

"高速运动抓拍形成的局部曝光残影"

"人物核心区域保持清晰，四肢边缘形成自然动态拖影"


禁止输出：

"运动模糊"

"背景模糊"

"人物模糊"


styleName:

输出2-5个词的风格总结。


例如：

"户外运动纪实摄影"

"高级街拍人像"


imageTags:

必须严格遵循：

第一部分只能选择：

"模特类"
"静物类"
"局部类"
"棚拍类"


第二部分选择3-5个：

"纯色背景"
"真实场景"
"影棚布景"
"CG/合成感"
"明亮高调"
"暗调氛围"
"强对比光"
"柔和漫射光"
"饱和"
"低饱和"
"暖色氛围"
"冷色氛围"


信息合并规则:

1. 同一视觉信息只能出现一次。

2. 相同含义必须合并。

3. 输出内容必须适用于AI生成。

4. 删除检测型语言。


空间规则:

保留：

- 非对称构图
- 主体位置
- 空间层次


删除：

- 过度精确比例。


光影规则:

保留：

- 光源方向
- 光线性质
- 阴影关系


删除：

- 重复光线描述。


人物规则:

保留：

- 整体动作
- 姿态方向
- 动态关系


删除：

- 骨骼化描述。


服装规则:

保留：

- 款式
- 材质
- 色彩搭配


删除：

- 重复描述。


负向提示词分析规则:

不要默认输出：

- 低分辨率
- 模糊
- 画质差


现代AI模型通常已经具备基础质量控制。

只有当画面真实存在以下问题时才输出：

- 主体失焦
- 画质损坏
- 人体错误结构


禁止使用：

"模糊"

作为通用负向词。

因为其可能抑制：

- 动态模糊
- 景深效果
- 胶片柔焦
- 运动拖影


零Placeholder要求:

如果字段不存在内容：

输出空字符串。


禁止输出：

"不可见"
"不存在"
"无"
"N/A"
"不适用"
"无法判断"
"画面外"


最终输出要求:

1. 只能输出一个有效JSON对象。

2. 不包含任何解释文字。

3. 所有内容中文。

4. 字段内容必须自然流畅。

5. 输出结果必须接近专业摄影提示词，而不是图片分析报告。

6. 当一种视觉现象既可以描述为检测结果，又可以描述为摄影语言时，必须优先采用摄影语言，因为最终目标是用于AI图像生成，而不是图像识别。
`;
export const DEFAULT_NEGATIVE_PROMPT = "--neg 低缺陷、画质损坏、严重压缩痕迹、主体失焦、五官错误、人体结构、肢体异常、肢体异常、错误结构、背景无意义杂乱元素、分屏、多视图、多角度、照相亭网格、重复图案、收藏表、重复物体、重复产品；";

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

const valueToPromptText = (val: any): string => {
  if (val === undefined || val === null) return "";
  if (Array.isArray(val)) {
    return val.map(valueToPromptText).filter(Boolean).join("，");
  }
  if (typeof val === "object") {
    return Object.values(val).map(valueToPromptText).filter(Boolean).join("，");
  }
  const text = String(val).trim();
  return text && !isIgnorableValue(text) ? text : "";
};

const buildStringPrompt = (structuredPrompt: any) => {
  if (!structuredPrompt) return "";
  return Object.entries(CATEGORIES).map(([catKey, cat]) => {
    const data = structuredPrompt[catKey];
    if (!data) return "";

    const categoryLabel = cat.label.replace(/^\d+[^\u4e00-\u9fa5]*/, "").trim();

    if (typeof data === 'string') {
      const cleanData = data.trim();
      return cleanData && !isIgnorableValue(cleanData) ? `[${categoryLabel}: ${cleanData}]` : "";
    }

    const items = Object.entries(cat.fields).map(([fieldKey, fieldLabel]) => {
      const text = valueToPromptText(data[fieldKey]);
      if (!text) return "";
      const cleanText = text.replace(/([,，]\s*)+/g, '，').replace(/^[，\s。；;、]+|[，\s。；;、]+$/g, '');
      return `${fieldLabel}: ${cleanText}`;
    }).filter(x => x !== "");

    if (items.length === 0) return "";
    return `[${categoryLabel}: ${items.join('；')}]`;
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
  cleanText = cleanText.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();
  cleanText = cleanText.trim();

  // 3. Find the first '{' and last '}'
  let firstBrace = cleanText.indexOf('{');
  let lastBrace = cleanText.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1) {
    cleanText = cleanText.substring(firstBrace, lastBrace + 1);
  }

  // Fix: imageTags field with multiple comma-separated string values from model
  // e.g. "imageTags": "模特类", "真实场景", "暖色氛围"
  // should be "imageTags": "模特类, 真实场景, 暖色氛围"
  cleanText = cleanText.replace(
    /("imageTags":\s*"[^"]*")((?:\s*,\s*"[^"]*")+)/g,
    (_, prefix, rest) => {
      const first = prefix.match(/"([^"]*)"/)?.[1] || "";
      const others: string[] = [];
      const re = /"([^"]*)"/g;
      let m;
      while ((m = re.exec(rest)) !== null) {
        if (m[1]) others.push(m[1]);
      }
      return '"imageTags": "' + [first, ...others].join(", ") + '"';
    }
  );

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
        try {
          return JSON.parse(jsonrepair(cleanText));
        } catch (repairErr) {
          throw err;
        }
      }
    }
  }
}

function buildFallbackPrompt(rawParsed: any): string {
  if (!rawParsed || typeof rawParsed !== 'object') return "";

  const directKeys = [
    "prompt",
    "description",
    "result",
    "output",
    "text",
    "content",
    "structuredPrompt",
    "structured_data",
    "data",
    "analysis",
    "analysisResult",
  ];
  for (const key of directKeys) {
    const text = valueToPromptText((rawParsed as any)[key]);
    if (text) return text.slice(0, 8000);
  }

  const skipKeys = new Set([
    "styleName",
    "imageTags",
    "negativePrompt",
    "error",
    "status",
    "usage",
    "id",
    "created",
    "model",
    "object",
    "choices",
  ]);
  const collected: string[] = [];
  const seen = new Set<string>();

  const walk = (value: any, path: string, depth: number) => {
    if (!value || depth > 6) return;
    if (Array.isArray(value)) {
      const text = valueToPromptText(value);
      if (text && path && !seen.has(path)) {
        collected.push(`${path}: ${text}`);
        seen.add(path);
      }
      value.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1));
      return;
    }
    if (typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (skipKeys.has(key)) continue;
        walk(child, path ? `${path}.${key}` : key, depth + 1);
      }
      return;
    }
    const text = valueToPromptText(value);
    if (text && path && !seen.has(path)) {
      collected.push(`${path}: ${text}`);
      seen.add(path);
    }
  };

  walk(rawParsed, "", 0);
  return collected.slice(0, 40).join("；");
}

function messageContentToString(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => typeof part === 'string' ? part : (part?.text || part?.content || ''))
      .join('');
  }
  return content || '';
}

function toTagString(value: any): string {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean).join(", ");
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value ?? "").trim();
}

export function normalizeParsedResponse(parsed: any): any {
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

  const compactKey = (key: string): string =>
    String(key || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");

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

  const categoryKeyAliases: Record<string, string[]> = {
    styleAndEffect: ["styleandeffect", "styleeffect", "style_effect", "styleeffects", "style_effects"],
    lightingAndCamera: ["lightingandcamera", "lightingcamera", "light_camera", "lightsandcamera", "lighting_camera"],
    subjectAndPose: ["subjectandpose", "subjectpose", "subject_pose", "subject_and_pose"],
    primaryColorsAndAtmosphere: ["primarycolorsandatmosphere", "primarycolorsatmosphere", "primary_colors_atmosphere", "primary_colors_and_atmosphere"],
    backgroundAndSpace: ["backgroundandspace", "backgroundspace", "background_space", "background_and_space"],
    propsAndInteraction: ["propsandinteraction", "propsinteraction", "props_interaction", "props_and_interaction"],
    actionAndDetails: ["actionanddetails", "actiondetails", "action_details", "action_and_details"],
    outfitAndStyle: ["outfitandstyle", "outfitstyle", "outfit_style", "outfit_and_style"],
    specialEffects: ["specialeffects", "special_effects", "specialeffect"]
  };

  const findCategoryKey = (rawKey: string): string | null => {
    if (categoryKeys.includes(rawKey)) return rawKey;

    const compactRaw = compactKey(rawKey);
    for (const catKey of categoryKeys) {
      const compactCat = compactKey(catKey);
      if (compactRaw === compactCat) return catKey;
      if (compactCat.length >= 8 && compactRaw.includes(compactCat)) {
        return catKey;
      }
    }

    for (const [catKey, aliases] of Object.entries(categoryKeyAliases)) {
      for (const alias of aliases) {
        const compactAlias = compactKey(alias);
        if (compactRaw === compactAlias) return catKey;
        if (compactAlias.length >= 8 && compactRaw.includes(compactAlias)) {
          return catKey;
        }
      }
    }

    for (const [cnCatName, catKey] of Object.entries(catNamesMapping)) {
      const compactCn = compactKey(cnCatName);
      if (compactCn && compactRaw.includes(compactCn)) {
        return catKey;
      }
    }

    return null;
  };

  const findFieldValue = (rawCategoryData: any, engFieldKey: string, cnFieldName: string): any => {
    if (rawCategoryData[engFieldKey] !== undefined) return rawCategoryData[engFieldKey];

    const compactEng = compactKey(engFieldKey);
    const compactCn = compactKey(cnFieldName);
    const rawEntries = Object.entries(rawCategoryData);

    for (const [rawFieldKey] of rawEntries) {
      const compactRaw = compactKey(rawFieldKey);
      if (compactRaw === compactEng || compactRaw === compactCn) {
        return rawCategoryData[rawFieldKey];
      }
    }

    for (const [rawFieldKey] of rawEntries) {
      const compactRaw = compactKey(rawFieldKey);
      if (compactCn && compactRaw.includes(compactCn)) {
        return rawCategoryData[rawFieldKey];
      }
    }

    for (const [rawFieldKey] of rawEntries) {
      const compactRaw = compactKey(rawFieldKey);
      if (compactEng.length >= 5 && compactRaw.includes(compactEng)) {
        return rawCategoryData[rawFieldKey];
      }
    }

    return undefined;
  };

  const findTopKey = (rawKey: string): string => {
    const compactRaw = compactKey(rawKey);
    if (compactRaw === compactKey("styleName") || compactRaw === compactKey("style_name")) return "styleName";
    if (compactRaw === compactKey("imageTags") || compactRaw === compactKey("image_tags")) return "imageTags";
    for (const [cnKey, engKey] of Object.entries(topChineseKeys)) {
      const compactCn = compactKey(cnKey);
      if (compactCn && (compactRaw.includes(compactCn) || compactCn.includes(compactRaw))) {
        return engKey;
      }
    }
    return rawKey;
  };

  // Find matches in the original object
  for (const rawKey of Object.keys(parsed)) {
    const targetCategoryKey = findCategoryKey(rawKey);

    if (targetCategoryKey) {
      const rawCategoryData = parsed[rawKey];
      if (rawCategoryData && typeof rawCategoryData === 'object' && !Array.isArray(rawCategoryData)) {
        const catConfig = (CATEGORIES as any)[targetCategoryKey];
        const normalizedSubObj: any = {};
        const fieldConfig = catConfig.fields;

        for (const [engFieldKey, cnFieldName] of Object.entries(fieldConfig) as [string, string][]) {
          const foundVal = findFieldValue(rawCategoryData, engFieldKey, cnFieldName);
          normalizedSubObj[engFieldKey] = foundVal !== undefined ? foundVal : "";
        }

        const rawNonEmptyEntries = Object.entries(rawCategoryData).filter(([, val]) => valueToPromptText(val));
        if (
          rawNonEmptyEntries.length > 0 &&
          Object.values(normalizedSubObj).every((val) => !valueToPromptText(val))
        ) {
          normalized[targetCategoryKey] = rawNonEmptyEntries
            .map(([fieldKey, val]) => `${fieldKey}: ${valueToPromptText(val)}`)
            .join("；");
        } else {
          normalized[targetCategoryKey] = normalizedSubObj;
        }
      } else if (rawCategoryData !== undefined && rawCategoryData !== null) {
        normalized[targetCategoryKey] = Array.isArray(rawCategoryData)
          ? rawCategoryData.filter(Boolean).map((item: any) => String(item).trim()).filter(Boolean).join("，")
          : String(rawCategoryData);
      }
    } else {
      normalized[findTopKey(rawKey)] = parsed[rawKey];
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
  normalized.styleName = toTagString(normalized.styleName !== undefined ? normalized.styleName : parsed.styleName) || "未命名风格";
  normalized.imageTags = toTagString(normalized.imageTags !== undefined ? normalized.imageTags : parsed.imageTags);

  return normalized;
}

export async function generatePromptFromImage(base64Data: string, mimeType: string, imageUrl: string | undefined, config: AIConfig, abortSignal?: AbortSignal, editInstruction?: string) {
  const provider = config.reversePromptProvider || config.provider;
  const userText = editInstruction
    ? SYSTEM_PROMPT + `\n\n额外要求：在进行上述分析的同时，请将以下修改应用到输出的内容当中：${editInstruction}\n请确保输出完全符合上述 JSON Schema 结构。`
    : SYSTEM_PROMPT;
  const maxAttempts = 5;

  const requestResultText = async (attempt: number): Promise<string> => {
    let resultText = "";

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
              { text: userText },
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
    } else if (provider === 'xiaomi') {
      const apiKey = config.xiaomiApiKey?.trim();
      if (!apiKey) throw new Error('Xiaomi API Key is missing');

      const endpoint = 'https://api.xiaomimimo.com/v1/chat/completions';
      const model = config.xiaomiModel || 'mimo-v2.5';
      const maxRetries = 3;
      let res;
      let httpAttempt = 0;

      const payloadImageUrl = (imageUrl && imageUrl.startsWith('http')) ? imageUrl : `data:${mimeType};base64,${base64Data}`;
      const retryPrompt = attempt > 0
        ? `${userText}\n\n重要：这是第${attempt + 1}次请求。前一次输出为空或不符合结构。请务必重新完整分析图片，输出包含全部9个分类、styleName、imageTags的JSON；所有字段必须填写画面真实内容，禁止返回空对象、空字符串或省略字段。`
        : userText;
      const temperature = [0.1, 0.3, 0.25, 0.4, 0.35][attempt] ?? 0.3;
      const useJsonResponseFormat = attempt < 3;

      while (httpAttempt < maxRetries) {
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
                    { type: 'text', text: retryPrompt },
                    { type: 'image_url', image_url: { url: payloadImageUrl } }
                  ]
                }
              ],
              response_format: useJsonResponseFormat ? { type: 'json_object' } : undefined,
              temperature
            })
          });

          if (res.ok) break;
          httpAttempt++;
          if (httpAttempt >= maxRetries) break;
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
          httpAttempt++;
          if (httpAttempt >= maxRetries) throw e;
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      if (!res?.ok) {
        let errorData: any = {};
        try { errorData = await res?.json(); } catch(e){}
        throw new Error(errorData?.error?.message || `HTTP ${res?.status}`);
      }

      const response = await res.json();
      resultText = messageContentToString(response.choices?.[0]?.message?.content);
    } else {
      throw new Error(`当前图片反推暂不支持 ${provider} 提供商`);
    }

    return resultText;
  };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const resultText = await requestResultText(attempt);
      if (!resultText) throw new Error("API returned no content");

      let parsed: any;
      try {
        parsed = parseCleanJSON(resultText);
      } catch (parseErr: any) {
        const fallbackText = resultText.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
        if (fallbackText) {
          parsed = { prompt: fallbackText };
        } else {
          console.error("Failed to parse JSON response:", resultText);
          throw new Error(`The model response is not valid JSON. Raw output: ${resultText.substring(0, 300)}...`);
        }
      }

      const cleanedRawText = resultText.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        Object.keys(parsed).length === 0 &&
        cleanedRawText &&
        cleanedRawText !== '{}'
      ) {
        parsed = { prompt: cleanedRawText };
      }

      if (typeof parsed === 'string' && parsed.trim()) {
        parsed = { prompt: parsed.trim() };
      }
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsed = { prompt: parsed.map((item: any) => String(item)).join("，") };
      }

      const rawParsed = parsed;
      const normalized = normalizeParsedResponse(rawParsed);
      const { styleName, imageTags, ...structuredPrompt } = normalized;

      let stringPrompt = buildStringPrompt(structuredPrompt);
      if (!stringPrompt) {
        stringPrompt = buildFallbackPrompt(rawParsed);
      }

      if (!stringPrompt) {
        console.error("JSON did not match the expected schema. Parsed object:", normalized, "Raw parsed object:", rawParsed);
        throw new Error(`The model returned valid JSON but it missed the required categories (e.g. styleAndEffect). Raw output: ${resultText.substring(0, 500)}...`);
      }

      return {
        prompt: stringPrompt,
        structuredPrompt,
        negativePrompt: DEFAULT_NEGATIVE_PROMPT,
        styleName: styleName || "未命名风格",
        imageTags: imageTags || ""
      };
    } catch (err: any) {
      const message = err.message || "";
      const retryable = message.includes("not valid JSON") ||
        message.includes("missed the required categories") ||
        message.includes("API returned no content");

      if (!retryable || attempt >= maxAttempts - 1) {
        console.error("Reverse Prompt Error:", err);
        throw new Error(message || "Failed to generate prompt from image.");
      }

      console.warn(`Reverse prompt retry ${attempt + 2}/${maxAttempts}: ${message}`);
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
    }
  }

  throw new Error("Failed to generate prompt from image.");
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
          generationConfig: { temperature: 0.7 }
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${res.status}`);
      }

      const response = await res.json();
      return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "错误：AI未返回编辑后的提示词";
    } else {
      // Basic fallback to local replacement for non-Google providers
      return masterPrompt.replace(/主体/g, targetProduct);
    }
  } catch (err: any) {
    return `错误：无法修改提示词 (${err.message})`;
  }
}
