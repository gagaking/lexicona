import { AIConfig } from '../types';
import { GoogleGenAI } from '@google/genai';

export const generateChatResponse = async (
  message: string,
  history: { role: 'user' | 'model'; parts: { text: string }[]; image?: { mimeType: string, base64: string } }[],
  systemInstruction: string,
  config: AIConfig,
  currentImage?: { mimeType: string, base64: string }
): Promise<string> => {
  try {
    if (config.provider === 'google') {
      const apiKey = config.googleApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('Google API Key is missing');

      let actualModel = config.googleModel || 'gemini-2.5-flash';

      const userParts: any[] = [{ text: message }];
      if (currentImage) {
        userParts.push({ inline_data: { mime_type: currentImage.mimeType, data: currentImage.base64 } });
      }

      const payload = {
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [
            ...history.map(h => ({
                role: h.role, 
                parts: h.image ? [{text: h.parts[0].text}, {inline_data: {mime_type: h.image.mimeType, data: h.image.base64}}] : h.parts
            })), 
            { role: 'user', parts: userParts }
        ],
        generationConfig: {
          temperature: config.temperature ?? 0.7,
        }
      };

      const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${actualModel}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || `HTTP ${res.status}`);
      }

      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        throw new Error("Unexpected response from API");
      }

      return data.candidates[0].content.parts[0].text;
    } else if (config.provider === 'deepseek') {
      const apiKey = config.deepseekApiKey?.trim();
      const model = config.deepseekModel || 'deepseek-chat';
      
      let rawEndpoint = 'https://api.deepseek.com/chat/completions';
      if (rawEndpoint.includes('/v1') && !rawEndpoint.endsWith('/chat/completions')) {
        rawEndpoint = rawEndpoint.replace(/\/$/, '') + '/chat/completions';
      }
      
      if (!apiKey) throw new Error(`DEEPSEEK API Key is missing`);
      
      const messages = [
        { role: 'system', content: systemInstruction },
        ...history.map(m => ({
          role: m.role === 'model' ? 'assistant' : 'user',
          content: m.parts[0].text
        })),
        { role: 'user', content: message }
      ];

      const res = await fetchWithTimeout(rawEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: config.temperature ?? 0.7
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || data?.detail || `HTTP ${res.status}`);
      }

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error("Unexpected response structure from DEEPSEEK API");
      }

      return data.choices[0].message.content;
    } else if (config.provider === 'xiaomi') {
      const apiKey = config.xiaomiApiKey?.trim();
      const model = config.xiaomiModel || 'mimo-v2.5';
      
      const rawEndpoint = 'https://api.xiaomimimo.com/v1/chat/completions';
      
      if (!apiKey) throw new Error(`Xiaomi MiMo API Key is missing`);
      
      const messages: any[] = [
        { role: 'system', content: systemInstruction }
      ];

      history.forEach(m => {
          if (m.image) {
              messages.push({
                  role: m.role === 'model' ? 'assistant' : 'user',
                  content: [
                      { type: 'text', text: m.parts[0].text },
                      { type: 'image_url', image_url: { url: `data:${m.image.mimeType};base64,${m.image.base64}` } }
                  ]
              });
          } else {
              messages.push({
                  role: m.role === 'model' ? 'assistant' : 'user',
                  content: m.parts[0].text
              });
          }
      });

      const userContent: any[] = [{ type: 'text', text: message }];
      if (currentImage) {
          userContent.push({ type: 'image_url', image_url: { url: `data:${currentImage.mimeType};base64,${currentImage.base64}` } });
      }
      messages.push({ role: 'user', content: currentImage ? userContent : message });

      const res = await fetchWithTimeout(rawEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: config.temperature ?? 0.7
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || data?.detail || `HTTP ${res.status}`);
      }

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error("Unexpected response structure from Xiaomi MiMo API");
      }

      return data.choices[0].message.content;
    } else if (config.provider === 'ollama') {
      if (!config.ollamaEndpoint) throw new Error('Ollama Endpoint is missing');
      
      const messages: any[] = [
        { role: 'system', content: systemInstruction }
      ];

      history.forEach(m => {
          messages.push({
            role: m.role === 'model' ? 'assistant' : 'user',
            content: m.parts[0].text,
            images: m.image ? [m.image.base64] : undefined
          });
      });

      messages.push({
        role: 'user',
        content: message,
        images: currentImage ? [currentImage.base64] : undefined
      });

      const res = await fetchWithTimeout(`${config.ollamaEndpoint.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.ollamaModel || 'llama3',
          messages: messages,
          stream: false,
          options: {
            temperature: config.temperature ?? 0.7
          }
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      if (!data.message || !data.message.content) {
        throw new Error("Unexpected response structure from Ollama API");
      }

      return data.message.content;
    }
  } catch (err: any) {
    console.error("Chat Generation Error:", err);
    throw new Error(`${err.message}`);
  }
  
  throw new Error(`Unsupported provider: ${config.provider}`);
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

  // 2. Clean markdown code blocks
  if (cleanText.startsWith('```json')) cleanText = cleanText.substring(7);
  else if (cleanText.startsWith('```')) cleanText = cleanText.substring(3);
  if (cleanText.endsWith('```')) cleanText = cleanText.substring(0, cleanText.length - 3);
  cleanText = cleanText.trim();

  // 3. Extract the outermost {} or []
  let firstBrace = cleanText.indexOf('{');
  let firstBracket = cleanText.indexOf('[');
  let lastBrace = cleanText.lastIndexOf('}');
  let lastBracket = cleanText.lastIndexOf(']');
  
  // Find which comes first, object or array
  const isObject = firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket);
  const isArray = firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace);
  
  if (isObject && lastBrace !== -1) {
    cleanText = cleanText.substring(firstBrace, lastBrace + 1);
  } else if (isArray && lastBracket !== -1) {
    cleanText = cleanText.substring(firstBracket, lastBracket + 1);
  }
  
  const finalJsonText = cleanText.trim();
  if (!finalJsonText) throw new Error("AI returned empty content");

  try {
    return JSON.parse(finalJsonText);
  } catch (err) {
    // 4. Try manual unescaping as fallback
    try {
      let unescaped = finalJsonText
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\');
      
      const fBrace = unescaped.indexOf('{');
      const fBracket = unescaped.indexOf('[');
      const lBrace = unescaped.lastIndexOf('}');
      const lBracket = unescaped.lastIndexOf(']');
      const isObj = fBrace !== -1 && (fBracket === -1 || fBrace < fBracket);
      const isArr = fBracket !== -1 && (fBrace === -1 || fBracket < fBrace);
      
      if (isObj && lBrace !== -1) {
        unescaped = unescaped.substring(fBrace, lBrace + 1);
      } else if (isArr && lBracket !== -1) {
        unescaped = unescaped.substring(fBracket, lBracket + 1);
      }
      return JSON.parse(unescaped);
    } catch (innerErr) {
      try {
        let fixedText = finalJsonText
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

async function fetchWithTimeout(resource: URL | RequestInfo, options: RequestInit & { timeout?: number } = {}) {
  const { timeout = 600000 } = options;
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal  
    });
    clearTimeout(id);
    return response;
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error(`请求超时 (Request Timeout): 接口在 ${timeout / 1000} 秒内没有响应，请核实网络或代理状态或模型处理速度。`);
    }
    if (error.message && error.message.includes("Failed to fetch")) {
      throw new Error(`网络连接失败 (Failed to fetch)。\n提示: 你的浏览器无法连通对应 API (CORS跨域拦截 或 网络被墙封锁)。\n请开启全局代理，或使用支持跨域的第三方 API。原错误: ${error.message}`);
    }
    throw error;
  }
}

async function callAIVision(systemPrompt: string, base64Image: string, config: AIConfig) {
  if (config.provider !== 'google' && config.provider !== 'xiaomi' && config.provider !== 'ollama') {
    throw new Error('Vision is currently only supported with Google, Xiaomi or Ollama providers');
  }
  
  // Clean base64 header if it exists
  const base64Data = base64Image.includes('base64,') ? base64Image.split('base64,')[1] : base64Image;
  const mimeType = base64Image.match(/data:([^;]+);/)?.[1] || "image/jpeg";
  const dataUrl = base64Image.includes('base64,') ? base64Image : `data:${mimeType};base64,${base64Data}`;
  
  if (config.provider === 'google') {
    const apiKey = config.googleApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Google API Key is missing');
    
    let res;
    try {
      const actualModel = config.googleModel || 'gemini-2.5-flash';
      res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${actualModel}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ 
            parts: [
              { text: systemPrompt },
              { inline_data: { mime_type: mimeType, data: base64Data } }
            ] 
          }],
          generationConfig: { 
            response_mime_type: "application/json",
            temperature: config.temperature ?? 0.7
          }
        })
      });
    } catch (e: any) {
      throw new Error(`Google API (Vision) failed: ${e.message}`);
    }
    
    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error(`Invalid JSON response: ${res.statusText}`);
    }

    if (!res.ok) {
      throw new Error(`Google API Error: ${data.error?.message || res.statusText}`);
    }

    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error(`Unexpected format from Google API: ${JSON.stringify(data)}`);
    }
    
    return parseCleanJSON(data.candidates[0].content.parts[0].text);
  } else if (config.provider === 'xiaomi') {
      const apiKey = config.xiaomiApiKey?.trim();
      const model = config.xiaomiModel || 'mimo-v2.5';
      const endpoint = 'https://api.xiaomimimo.com/v1/chat/completions';
      if (!apiKey) throw new Error('Xiaomi API Key is missing');

      let res;
      try {
        res = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'user',
                content: [
                   { type: 'text', text: systemPrompt },
                   { type: 'image_url', image_url: { url: dataUrl } }
                ]
              }
            ],
            response_format: { type: 'json_object' },
            temperature: config.temperature ?? 0.7
          })
        });
      } catch (e: any) {
        throw new Error(`Xiaomi API (Vision) failed: ${e.message}`);
      }

      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`Invalid JSON response from Xiaomi`);
      }

      if (!res.ok) {
        throw new Error(data?.error?.message || `HTTP ${res.status}`);
      }

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error("Unexpected format from Xiaomi API");
      }

      return parseCleanJSON(data.choices[0].message.content);
  } else if (config.provider === 'ollama') {
      if (!config.ollamaEndpoint) throw new Error('Ollama endpoint is missing');
      const ollamaUrl = `${config.ollamaEndpoint?.replace(/\/$/, '')}/api/chat`;
      let res;
      try {
        res = await fetchWithTimeout(ollamaUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: config.ollamaModel || 'llava',
            format: "json",
            messages: [{ role: "user", content: systemPrompt, images: [base64Data] }],
            stream: false,
            options: { temperature: config.temperature ?? 0.7 }
          })
        });
      } catch (e: any) {
        throw new Error(`Ollama API (Vision) failed: ${e.message}`);
      }

      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`Invalid JSON response from Ollama`);
      }
      
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      return parseCleanJSON(data.message?.content);
  }
}

export const undressAsset = async (
  asset: any,
  outfitChangeType: string,
  config: AIConfig
): Promise<any> => {
  let targetDesc = '';
  if (outfitChangeType === 'shoes') targetDesc = '鞋子 (shoes)';
  else if (outfitChangeType === 'top') targetDesc = '衣服/上衣 (top)';
  else if (outfitChangeType === 'bottom') targetDesc = '裤子/下装 (bottom)';
  else if (outfitChangeType === 'set') targetDesc = '套装/衣服+裤子+鞋子 (outfit set)';
  else return asset;

  const systemPrompt = `You are a prompt editing assistant. The user wants to apply an "Undress" (\u4e00\u952e\u5378\u88c5) operation on an existing prompt dataset.
Target to strip: ${targetDesc}.

Your task is to delete ALL clothing-related descriptions of the target (${targetDesc}) from the prompt structure, including color, style, material, pattern, texture, decoration, and fabric.

You MUST check ALL category fields in the structuredData below - especially:
- "\u642d\u914d\u4e0e\u98ce\u683c" (outfitAndStyle)
- "\u4e3b\u4f53\u4e0e\u59ff\u6001" (subjectAndPose)
- "\u52a8\u4f5c\u4e0e\u7ec6\u8282" (actionAndDetails)
- "\u4e3b\u8272\u4e0e\u6c1b\u56f4" (primaryColorsAndAtmosphere)
- "\u80cc\u666f\u4e0e\u7a7a\u95f4" (backgroundAndSpace)
- "\u9053\u5177\u4e0e\u4e92\u52a8" (propsAndInteraction)
- as well as any other fields - if they contain descriptions of the target clothing, remove them too.

After deletion, ensure the sentence remains grammatically correct and natural to read. Strictly retain descriptions of the target's position, pose, action state, etc. Do NOT modify non-clothing-related content.

If the target is "set", this means the ENTIRE outfit: top, bottom, pants, shoes, accessories, jewelry, bags, hats/headwear, belts, gloves, and any other wearable items. You must strip ALL clothing, footwear, and accessory descriptions from ALL fields.

Original Data:
${JSON.stringify({
  structuredData: asset.structuredData || {},
  outfitStyle: asset.outfitStyle,
  subjectPose: asset.subjectPose,
  actionDetails: asset.actionDetails
}, null, 2)}

Output exactly a JSON object with the updated structuredData. Only include fields that changed.
E.g.:
{
  "structuredData": {
    "outfitAndStyle": "updated chinese...",
    "subjectAndPose": "updated chinese...",
    "primaryColorsAndAtmosphere": "updated chinese if contains clothing refs..."
  }
}
Do not use markdown wrappers..`;

  const responseJson = await callAI(systemPrompt, config);
  
  const finalResp = responseJson?.data ? (Array.isArray(responseJson.data) ? responseJson.data[0] : responseJson.data) : (Array.isArray(responseJson) ? responseJson[0] : responseJson);
  
  if (!finalResp || (finalResp.outfitStyle === undefined && finalResp.outfitAndStyle === undefined && finalResp.structuredData === undefined && finalResp.subjectPose === undefined && finalResp.subjectAndPose === undefined && finalResp.actionDetails === undefined && finalResp.actionAndDetails === undefined)) {
     throw new Error("模型未返回预期的格式: " + JSON.stringify(responseJson).substring(0, 150));
  }

  const newAsset = { ...asset };
  try {

  if (finalResp.outfitStyle !== undefined) newAsset.outfitStyle = finalResp.outfitStyle;
  if (finalResp.outfitAndStyle !== undefined) newAsset.outfitAndStyle = finalResp.outfitAndStyle;
  if (finalResp.subjectPose !== undefined) newAsset.subjectPose = finalResp.subjectPose;
  if (finalResp.subjectAndPose !== undefined) newAsset.subjectAndPose = finalResp.subjectAndPose;
  if (finalResp.actionDetails !== undefined) newAsset.actionDetails = finalResp.actionDetails;
  if (finalResp.actionAndDetails !== undefined) newAsset.actionAndDetails = finalResp.actionAndDetails;
  
  
  } catch (ef) {
    console.error("[undressAsset] assign error:", ef, {
      newAssetType: typeof newAsset,
      newAssetKeys: Object.keys(newAsset || {}),
      finalRespKeys: Object.keys(finalResp || {}),
      assetType: typeof asset
    });
    throw ef;
  }

  if (finalResp.structuredData) {
      if (!newAsset.structuredData) newAsset.structuredData = {};
      Object.keys(finalResp.structuredData || {}).forEach(function(k) {
        if (finalResp.structuredData[k] !== undefined) {
          newAsset.structuredData[k] = finalResp.structuredData[k];
        }
      });
      if (finalResp.structuredData?.outfitStyle !== undefined) newAsset.outfitStyle = finalResp.structuredData.outfitStyle;
      if (finalResp.structuredData?.outfitAndStyle !== undefined) newAsset.outfitAndStyle = finalResp.structuredData.outfitAndStyle;
      if (finalResp.structuredData?.subjectPose !== undefined) newAsset.subjectPose = finalResp.structuredData.subjectPose;
      if (finalResp.structuredData?.subjectAndPose !== undefined) newAsset.subjectAndPose = finalResp.structuredData.subjectAndPose;
      if (finalResp.structuredData?.actionDetails !== undefined) newAsset.actionDetails = finalResp.structuredData.actionDetails;
      if (finalResp.structuredData?.actionAndDetails !== undefined) newAsset.actionAndDetails = finalResp.structuredData.actionAndDetails;
  }
  
  
  // Sync field name variants (short names <-> long names)
  if (newAsset.outfitAndStyle !== undefined) newAsset.outfitStyle = newAsset.outfitAndStyle;
  else if (newAsset.outfitStyle !== undefined) newAsset.outfitAndStyle = newAsset.outfitStyle;
  if (newAsset.subjectAndPose !== undefined) newAsset.subjectPose = newAsset.subjectAndPose;
  else if (newAsset.subjectPose !== undefined) newAsset.subjectAndPose = newAsset.subjectPose;
  if (newAsset.actionAndDetails !== undefined) newAsset.actionDetails = newAsset.actionAndDetails;
  else if (newAsset.actionDetails !== undefined) newAsset.actionAndDetails = newAsset.actionDetails;

  return newAsset;
};

export const undressMixedPrompt = async (
  mixedPrompt: any,
  outfitChangeType: string,
  config: AIConfig
): Promise<any> => {
  let targetDesc = '';
  if (outfitChangeType === 'shoes') targetDesc = '鞋子 (shoes)';
  else if (outfitChangeType === 'top') targetDesc = '衣服/上衣 (top)';
  else if (outfitChangeType === 'bottom') targetDesc = '裤子/下装 (bottom)';
  else if (outfitChangeType === 'set') targetDesc = '套装/衣服+裤子+鞋子 (outfit set)';
  else return mixedPrompt;

  const systemPrompt = `You are a prompt editing assistant. The user wants to apply an "Undress" (\u4e00\u952e\u5378\u88c5) operation on an existing prompt dataset.
Target to strip: ${targetDesc}.

Your task is to delete ALL clothing-related descriptions of the target (${targetDesc}) from the prompt structure, including color, style, material, pattern, texture, decoration, and fabric.

You MUST check ALL field categories in the structuredData below:
- outfitStyle (\u642d\u914d\u4e0e\u98ce\u683c)
- subjectAndPose (\u4e3b\u4f53\u4e0e\u59ff\u6001)
- actionAndDetails (\u52a8\u4f5c\u4e0e\u7ec6\u8282)
- primaryColorsAndAtmosphere (\u4e3b\u8272\u4e0e\u6c1b\u56f4)
- backgroundAndSpace (\u80cc\u666f\u4e0e\u7a7a\u95f4)
- propsAndInteraction (\u9053\u5177\u4e0e\u4e92\u52a8)
- as well as any other fields.

After deletion, ensure the sentence remains grammatically correct and natural to read. Strictly retain descriptions of the target's position, pose, action state, etc. Do NOT modify non-clothing-related content.

If the target is "set", this means the ENTIRE outfit: top, bottom, pants, shoes, accessories, jewelry, bags, hats/headwear, belts, gloves, and any other wearable items. You must strip ALL clothing, footwear, and accessory descriptions from ALL fields.

Original Data:
${JSON.stringify({
  structuredData: mixedPrompt.structuredData || {},
  structuredDataZh: mixedPrompt.structuredDataZh || {}
}, null, 2)}

Output exactly a JSON object with the updated fields. Only include fields that changed. E.g.:
{
  "structuredDataZh": {
    "outfitStyle": "updated chinese...",
    "subjectAndPose": "updated chinese..."
  },
  "structuredData": {
    "outfitStyle": "updated english...",
    "subjectAndPose": "updated english..."
  }
}
Do not use markdown wrappers.`;

  const responseJson = await callAI(systemPrompt, config);
  
  const finalResp = responseJson?.data ? (Array.isArray(responseJson.data) ? responseJson.data[0] : responseJson.data) : (Array.isArray(responseJson) ? responseJson[0] : responseJson);
  
  if (!finalResp || (finalResp.structuredDataZh === undefined && finalResp.structuredData === undefined)) {
      throw new Error("模型未返回预期的格式: " + JSON.stringify(responseJson).substring(0, 150));
  }
  
  const newPrompt = { ...mixedPrompt };
  if (finalResp.structuredDataZh) {
      newPrompt.structuredDataZh = { ...newPrompt.structuredDataZh, ...finalResp.structuredDataZh };
  }
  if (finalResp.structuredData) {
      newPrompt.structuredData = { ...newPrompt.structuredData, ...finalResp.structuredData };
  }
  
  // Re-build prompt and promptZh
  if (newPrompt.structuredDataZh) {
      const CATEGORY_KEYS = ["styleEffect", "lightingAngle", "subjectPose", "colorVibe", "backgroundSpace", "propsInteraction", "actionDetails", "outfitStyle", "specialEffects"];
      const orderedChinesePieces = CATEGORY_KEYS.map(k => newPrompt.structuredDataZh[k]).filter(Boolean);
      newPrompt.promptZh = orderedChinesePieces.join(', ');
  }
  if (newPrompt.structuredData) {
      const CATEGORY_KEYS = ["styleEffect", "lightingAngle", "subjectPose", "colorVibe", "backgroundSpace", "propsInteraction", "actionDetails", "outfitStyle", "specialEffects"];
      const orderedEnglishPieces = CATEGORY_KEYS.map(k => newPrompt.structuredData[k]).filter(Boolean);
      newPrompt.prompt = orderedEnglishPieces.join(', ');
  }
  
  return newPrompt;
};

export const uploadToImgbb = async (base64Image: string, apiKey: string = 'acebd61ac426801c7e903c53d21bb5aa'): Promise<string> => {
  const formData = new FormData();
  formData.append('key', apiKey);
  const cleanBase64 = base64Image.split(',')[1] || base64Image;
  formData.append('image', cleanBase64);

  const res = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    throw new Error(`Imgbb API Error: ${res.statusText}`);
  }

  const data = await res.json();
  return data.data.url;
};

export const mixMoodboardImages = async (
  instruction: string,
  base64Image: string | null,
  config: AIConfig,
  outfitChangeType: string = 'none'
): Promise<{ prompt: string, promptZh: string, relationships: any[], structuredData?: any, structuredDataZh?: any, poseCoordinates?: string }> => {
  let systemPrompt = `You are an expert prompt engineer and professional image analyst. ${base64Image ? "You are provided with a stitched composite image containing multiple reference images. Each sub-image is labeled with an ID (e.g., ID: 1, ID: 2)." : ""}

CRITICAL INSTRUCTION FOR MIXING:
You are about to receive multiple sources of information: some as TEXT (Text Sources) and some as IMAGES (Image Sources).
You MUST NOT simply describe the images block by block.
You MUST extract the SPECIFIC requested features from the Image Sources AND MERGE them precisely with the features provided in the Text Sources. All requested features from Text Sources MUST be preserved and combined with features extracted from Image Sources.

Instruction:
${instruction}

Your task is to objectively, accurately, and thoroughly combine and extract features as requested into a unified output.
CRITICAL: You must generate an extremely detailed and rich description for each of the 9 architectural categories, just like a professional reverse-prompt analysis.

`;

  if (outfitChangeType && outfitChangeType !== 'none') {
      let targetDesc = '';
      if (outfitChangeType === 'shoes') targetDesc = '鞋子';
      else if (outfitChangeType === 'top') targetDesc = '衣服/上衣';
      else if (outfitChangeType === 'bottom') targetDesc = '裤子/下装';
      else if (outfitChangeType === 'set') targetDesc = '套装(衣服+裤子+鞋子)';

      systemPrompt += `\n【！！！特别指令：一键卸装！！！】：用户开启了“一键卸装”模式（卸除目标：${targetDesc}）。
你需要在此次生成的提示词中，删除关于【${targetDesc}】的相关外观、颜色、款式、材质的描述，但【必须严格保留】物品的位置、角度、姿态等维度的描述。
如果是卸套装，则鞋、衣、裤统统删除外观描述但保留位置角度和状态。\n\n`;
  }

  systemPrompt += `Requirement: Output exactly a JSON object with this shape:
{
  "prompt": "Comma-separated Chinese values. MUST also be strictly arranged in the exact 9-category architecture order. Make it as detailed as a professional reverse-prompt analysis.",
  "structuredData": {
    "styleEffect": "详细的中文描述：风格与效果",
    "lightingAngle": "详细的中文描述：光影与机位",
    "subjectPose": "详细的中文描述：主体与姿态",
    "colorVibe": "详细的中文描述：主色与氛围",
    "backgroundSpace": "详细的中文描述：背景与空间",
    "propsInteraction": "详细的中文描述：道具与互动",
    "actionDetails": "详细的中文描述：动作与细节",
    "outfitStyle": "详细的中文描述：穿搭与风格",
    "specialEffects": "详细的中文描述：特殊效果"
  },
  "relationships": [
    {
      "sourceImageIndex": 1,
      "aspect": "style",
      "extractedDetails": "brief description of what you extracted"
    }
  ]
}
You MUST extract the features into exactly these 9 keys in structuredData without any bullet numbers or index prefixes. Do not use markdown wrappers around the JSON.
`;

  let result;
  try {
    if (base64Image) {
      result = await callAIVision(systemPrompt, base64Image, config);
    } else {
      result = await callAI(systemPrompt, config);
    }
  } catch (err: any) {
    throw new Error(`Moodboard Error: ${err.message}`);
  }

  // Ensure prompt mix is NOT directly using AI generated string, but strictly field mix
  if (result.structuredDataZh) {
      const CATEGORY_KEYS = ["styleEffect", "lightingAngle", "subjectPose", "colorVibe", "backgroundSpace", "propsInteraction", "actionDetails", "outfitStyle", "specialEffects"];
      const orderedChinesePieces = CATEGORY_KEYS.map(k => result.structuredDataZh[k]).filter(Boolean);
      result.promptZh = orderedChinesePieces.join(', ');
  } else if (result.structuredData) {
      const CATEGORY_KEYS = ["styleEffect", "lightingAngle", "subjectPose", "colorVibe", "backgroundSpace", "propsInteraction", "actionDetails", "outfitStyle", "specialEffects"];
      const orderedPieces = CATEGORY_KEYS.map(k => result.structuredData[k]).filter(Boolean);
      result.promptZh = orderedPieces.join(', ');
  }
  
  if (result.structuredData) {
      const CATEGORY_KEYS = ["styleEffect", "lightingAngle", "subjectPose", "colorVibe", "backgroundSpace", "propsInteraction", "actionDetails", "outfitStyle", "specialEffects"];
      const orderedEnglishPieces = CATEGORY_KEYS.map(k => result.structuredData[k]).filter(Boolean);
      result.prompt = orderedEnglishPieces.join(', ');
  }
  
  return result;
};

async function callAI(systemPrompt: string, config: AIConfig) {
  try {
    if (config.provider === 'google') {
      const apiKey = config.googleApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('Google API Key is missing');
      
      let res;
      try {
        let actualModel = config.googleModel || 'gemini-2.5-flash';
        
        res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${actualModel}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: { 
              response_mime_type: "application/json",
              temperature: config.temperature ?? 0.7
            }
          })
        });
      } catch (e: any) {
        throw new Error(`Google API 网络连接失败 (Failed to fetch). 请检查网络。附加信息: ${e.message}`);
      }
      
      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`Invalid JSON response: ${res.statusText}`);
      }
      
      if (!res.ok) {
        throw new Error(data?.error?.message || data?.error?.details?.[0]?.message || `HTTP ${res.status} ${res.statusText}`);
      }
      
      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        if (data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason) {
            throw new Error(`Google API 安全策略拦截 (可能涉及敏感字词如儿童). 原因: ${data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason}. 请联系使用其他模型，或修改选中的素材/配置。`);
        }
        throw new Error("Unexpected response structure from Google API: " + JSON.stringify(data));
      }
      
      let text = data.candidates[0].content.parts[0].text;
      return parseCleanJSON(text);
      
    } else if (config.provider === 'deepseek') {
      const apiKey = config.deepseekApiKey?.trim();
      const model = config.deepseekModel || 'deepseek-chat';
      
      let rawEndpoint = 'https://api.deepseek.com/chat/completions';
        
      rawEndpoint = rawEndpoint.split(']')[0].split(' ')[0].trim();
      if (!rawEndpoint.endsWith('/chat/completions') && rawEndpoint.includes('/v1')) {
        rawEndpoint = rawEndpoint.replace(/\/$/, '') + '/chat/completions';
      }
      const endpoint = rawEndpoint;
      
      if (!apiKey) throw new Error(`DEEPSEEK API Key is missing`);
      let res;
      try {
        res = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: "Please generate the output according to the system prompt's precise JSON structure." }
            ],
            response_format: { type: 'json_object' },
            temperature: config.temperature ?? 0.7
          })
        });
      } catch (e: any) {
        throw new Error(`网络连接失败 (Failed to fetch). Endpoint: ${endpoint} \nModel: ${model}\n原错误: ${e.message}`);
      }
      
      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`Invalid JSON response: ${res.statusText}`);
      }

      if (!res.ok) {
        throw new Error(data?.error?.message || data?.detail || `HTTP ${res.status} ${res.statusText}`);
      }
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error(`Unexpected response structure from ${config.provider.toUpperCase()} API`);
      }
      
      return parseCleanJSON(data.choices[0].message.content);

    } else if (config.provider === 'xiaomi') {
      const apiKey = config.xiaomiApiKey?.trim();
      const model = config.xiaomiModel || 'mimo-v2.5';
      
      const endpoint = 'https://api.xiaomimimo.com/v1/chat/completions';
      
      if (!apiKey) throw new Error(`Xiaomi MiMo API Key is missing`);
      
      let res;
      try {
        res = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: "Please generate the output according to the system prompt's precise JSON structure." }
            ],
            response_format: { type: 'json_object' },
            temperature: config.temperature ?? 0.7
          })
        });
      } catch (e: any) {
        throw new Error(`网络连接失败 (Failed to fetch). Endpoint: ${endpoint} \nModel: ${model}\n原错误: ${e.message}`);
      }
      
      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`Invalid JSON response: ${res.statusText}`);
      }

      if (!res.ok) {
        throw new Error(data?.error?.message || data?.detail || `HTTP ${res.status} ${res.statusText}`);
      }
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error(`Unexpected response structure from ${config.provider.toUpperCase()} API`);
      }
      
      return parseCleanJSON(data.choices[0].message.content);

    } else if (config.provider === 'ollama') {
      if (!config.ollamaEndpoint) throw new Error('Ollama Endpoint is missing');
      const res = await fetchWithTimeout(`${config.ollamaEndpoint.replace(/\/$/, '')}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.ollamaModel || 'llama3',
          prompt: systemPrompt,
          stream: false,
          format: 'json',
          options: {
            temperature: config.temperature ?? 0.7
          }
        })
      });
      
      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`Invalid JSON response: ${res.statusText}`);
      }

      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status} ${res.statusText}`);
      }
      
      if (!data.response) {
        throw new Error("Unexpected response structure from Ollama API");
      }
      
      return parseCleanJSON(data.response);
    }
  } catch (err: any) {
    console.error("AI Generation Error:", err);
    throw new Error(`AI Request failed: ${err.message}`);
  }
}

export const rewritePromptFields = async (
  promptData: Record<string, string>,
  instructions: string,
  config: AIConfig
): Promise<Record<string, string>> => {
  const systemPrompt = `You are an AI prompt optimization assistant. 
You will be given a JSON object containing different components of an image generation prompt.
Your task is to follow the user's instructions to modify or rewrite the prompt fields.
Try to keep the original fields and structure intact, make the sentences fluent, and ONLY return a valid JSON object matching the input structure, with no markdown formatting.

Input fields:
${JSON.stringify(promptData, null, 2)}

User Instruction: ${instructions}

Return exactly the same JSON keys with updated values.`;

  return callAI(systemPrompt, config);
};

export const generatePromptsFromCombinations = async (
  combinations: any[],
  modificationRequest: string,
  config: AIConfig,
  lockedFields: Record<string, string> = {},
  outfitChangeType: string = 'none'
): Promise<any[]> => {
  const CHUNK_SIZE = 5;
  let allResults: any[] = [];
  
  for (let i = 0; i < combinations.length; i += CHUNK_SIZE) {
    const chunk = combinations.slice(i, i + CHUNK_SIZE);
    
    let systemPrompt = `你是Midjourney顶级提示词构建专家。
用户希望生成 ${chunk.length} 个结构化的提示词。
基于以下具体组合要求（如果某一项为随机，请根据整体风格自由发挥补充，保持画面协调）：

${chunk.map((c, idx) => `【组合 ${idx + 1}】
${Object.entries(c).filter(([_, v]) => v).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
`).join('\n')}

你必须返回一个严格的JSON对象，包含一个 "data" 数组，数组长度必须刚好为 ${chunk.length}，对应每个组合。
数组内的每个对象必须包含以下字符串类型的键，使用中文描述：
title (为这个画面起个标题), styleEffect, lightingAngle, subjectPose, colorVibe, backgroundSpace, propsInteraction, actionDetails, outfitStyle, specialEffects, tags (必须有8个用逗号分隔的概括标签，分别为：核心分类、整体风格、核心场景、主体姿势或状态、机位角度、主色调、光影特点、材质或特效。不包含横竖幅描述)。

`;

    const lockedKeys = Object.keys(lockedFields);
    if (lockedKeys.length > 0) {
        systemPrompt += `\n【！！！极其重要！！！核心架构锁定】：\n`;
        lockedKeys.forEach(k => {
            systemPrompt += `* ${k} 必须 100% 保持完全不变为： "${lockedFields[k]}"\n`;
        });
        systemPrompt += `你不可以对以上锁定的架构做任何程度的修改、浓缩或替换！必须原样照抄！\n\n`;
    }

    if (outfitChangeType && outfitChangeType !== 'none') {
        let targetDesc = '';
        if (outfitChangeType === 'shoes') targetDesc = '鞋子';
        else if (outfitChangeType === 'top') targetDesc = '衣服/上衣';
        else if (outfitChangeType === 'bottom') targetDesc = '裤子/下装';
        else if (outfitChangeType === 'set') targetDesc = '套装(衣服+裤子+鞋子)';

        systemPrompt += `\n【！！！特别指令：一键卸装！！！】：用户开启了“一键卸装”模式（卸除目标：${targetDesc}）。
你需要在此次生成的提示词中，删除关于【${targetDesc}】的相关外观、颜色、款式、材质的描述，但【必须严格保留】物品的位置、角度、姿态等维度的描述。
如果是卸套装，则鞋、衣、裤统统删除外观描述但保留位置角度和状态。\n\n`;
    }

    if (modificationRequest.trim()) {
        systemPrompt += `【重要指令】：用户提出了具体的修改要求：“${modificationRequest}”。\n你必须将上述生成的每个组合的内容，自然地替换融合进用户的修改要求！\n但注意：不可直接大幅改变整体的提示词骨架架构，只是结合修改要求进行替换。要求语句通顺自然。\n如果是锁定字段（见上方核心架构锁定），修改要求不可干扰锁定字段的内容！\n`;
    }

    systemPrompt += `
请确保输出格式为有效的纯JSON，不要包含任何markdown标记（如 \`\`\`json ）。`;

    try {
      const result = await callAI(systemPrompt, config);
      let arr = result.data || result;
      if (!Array.isArray(arr)) arr = [arr];
      
      const processedChunk = arr.map((item: any, index: number) => {
        const finalItem = { ...item, id: Math.random().toString(36).substring(2, 10) };
        const globalIndex = i + index;
        
        if (combinations[globalIndex] && combinations[globalIndex].referenceImages) {
            finalItem.referenceImages = combinations[globalIndex].referenceImages;
        }
        
        if (outfitChangeType && outfitChangeType !== 'none' && !lockedFields['outfitStyle']) {
            let label = '服饰';   
            if (outfitChangeType === 'shoes') label = '鞋子';
            else if (outfitChangeType === 'top') label = '衣服';
            else if (outfitChangeType === 'bottom') label = '裤子';
            else if (outfitChangeType === 'set') label = '套装饰品';
            
        }

        lockedKeys.forEach(k => {
          finalItem[k] = lockedFields[k];
        });
        return finalItem;
      });
      allResults = allResults.concat(processedChunk);
    } catch (e) {
      console.error("Chunk failed", e);
      // Optional: fast-fail or ignore this chunk. We will throw.
      throw e;
    }
  }
  return allResults;
};
export const generateNewPrompts = async (
  instruction: string,
  basePrompt: string,
  count: number,
  wikiBlueprint: Record<string, string[]>,
  config: AIConfig,
  lockedFields: Record<string, string> = {},
  outfitChangeType: string = 'none'
): Promise<any[]> => {
  const CHUNK_SIZE = 5;
  let allResults: any[] = [];
  
  for (let i = 0; i < count; i += CHUNK_SIZE) {
    const chunkCount = Math.min(CHUNK_SIZE, count - i);
    
    let systemPrompt = `You are an AI prompt creator. The user wants to generate ${chunkCount} image prompts based on their instruction.
You MUST output EXACTLY a JSON object containing a "data" array of length ${chunkCount}. e.g. { "data": [ { ... } ] }. Do not wrap in markdown or backticks.
Each object in the array MUST have these string keys: title, styleEffect, lightingAngle, subjectPose, colorVibe, backgroundSpace, propsInteraction, actionDetails, outfitStyle, specialEffects, tags.

Wiki Blueprint reference terms (pick optionally to inspire coherent styling):
${JSON.stringify(wikiBlueprint, null, 2)}
`;

    const lockedKeys = Object.keys(lockedFields);
    if (lockedKeys.length > 0) {
        systemPrompt += `\n[MANDATORY LOCK]: The following fields MUST be output exactly as provided, with no changes or formatting modifications whatsoever:\n`;
        lockedKeys.forEach(k => {
            systemPrompt += `* ${k}: "${lockedFields[k]}"\n`;
        });
        systemPrompt += `You are forbidden from modifying the values of these fields.\n\n`;
    }

    if (outfitChangeType && outfitChangeType !== 'none') {
        let targetDesc = '';
        if (outfitChangeType === 'shoes') targetDesc = '鞋子';
        else if (outfitChangeType === 'top') targetDesc = '衣服/上衣';
        else if (outfitChangeType === 'bottom') targetDesc = '裤子/下装';
        else if (outfitChangeType === 'set') targetDesc = '套装(衣服+裤子+鞋子)';

        systemPrompt += `\n【！！！特别指令：一键卸装！！！】：用户开启了“一键卸装”模式（卸除目标：${targetDesc}）。
你需要在此次生成的提示词中，删除关于【${targetDesc}】的相关外观、颜色、款式、材质的描述，但【必须严格保留】物品的位置、角度、姿态等维度的描述。
如果是卸套装，则鞋、衣、裤统统删除外观描述但保留位置角度和状态。\n\n`;
    }

    if (basePrompt.trim()) {
        systemPrompt += `\nExisting Base Prompt / Context: "${basePrompt}"\n`;
        systemPrompt += `User Instruction: Rewrite, enhance, or modify the provided base prompt using the given instruction ("${instruction}"). Output ${chunkCount} variations of the modification.\n`;
    } else {
        systemPrompt += `\nUser Instruction: "${instruction}"\n`;
    }

    systemPrompt += `Output a clean JSON object containing the "data" array strictly matching the properties. Use Chinese for the prompt definitions. Do NOT wrap in markdown or backticks.`;

    try {
      const result = await callAI(systemPrompt, config);
      let arr = result.data || result; // Fallback in case AI returns the array directly
      if (!Array.isArray(arr)) arr = [arr];

      const processedChunk = arr.map((item: any) => {
        const finalItem = { ...item };
        
        if (outfitChangeType && outfitChangeType !== 'none' && !lockedFields['outfitStyle']) {
            let label = '服饰';   
            if (outfitChangeType === 'shoes') label = '鞋子';
            else if (outfitChangeType === 'top') label = '衣服';
            else if (outfitChangeType === 'bottom') label = '裤子';
            else if (outfitChangeType === 'set') label = '套装饰品';

            
        }

        lockedKeys.forEach(k => {
          finalItem[k] = lockedFields[k];
        });
        return finalItem;
      });
      allResults = allResults.concat(processedChunk);
    } catch (e) {
      console.error("Chunk failed", e);
      throw e;
    }
  }
  
  return allResults;
};
