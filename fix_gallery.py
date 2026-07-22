import re
with open(r'C:\Users\sa\Documents\lexicona\src\views\Gallery.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Add Send and Loader2 imports
c = c.replace('  Tag,', '  Tag,\n  Send,\n  Loader2,')

# 2. Add setReversePromptPairs to destructuring
c = c.replace('setMoodboardItems,', 'setMoodboardItems,\n    setReversePromptPairs,')

# 3. Add depth map state variables
c = c.replace(
    '  const [toastMessage, setToastMessage]',
    '  const [depthMapUrls, setDepthMapUrls] = useState({});\n'
    '  const [depthMapLoading, setDepthMapLoading] = useState({});\n'
    '  const [depthMapAssetId, setDepthMapAssetId] = useState(null);\n\n'
    '  const [toastMessage, setToastMessage]'
)

# 4. Replace mirror button with depth map + send button
marker = 'handleCopyGeneratedMirror(asset)'
idx = c.find(marker)
if idx >= 0:
    btn_start = c.rfind('<button', 0, idx)
    btn_end = c.find('</button>', idx) + len('</button>')
    btn_code = c[btn_start:btn_end]
    print('Found mirror button, length:', len(btn_code))
    
    new_btn = (
        'onClick={() => handleDepthMap(asset)}\n'
        '                                disabled={depthMapLoading[asset.id]}\n'
        '                                title="获取深度图"\n'
        '                                className={`flex items-center px-3 py-1.5 text-xs font-medium font-sans transition-colors rounded-none border '
        '${depthMapUrls[asset.id] && depthMapAssetId === asset.id ? "bg-[#1E1E1E] text-white border-[#1E1E1E]" : "bg-white border-[#E0E0E0] text-[#7A7A7A] hover:bg-gray-50 hover:text-[#1E1E1E]"}`}\n'
        '                              >\n'
        '                                {depthMapLoading[asset.id] ? (\n'
        '                                  <>\n'
        '                                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> 深度计算中\n'
        '                                  </>\n'
        '                                ) : depthMapUrls[asset.id] && depthMapAssetId === asset.id ? (\n'
        '                                  <>\n'
        '                                    <Check className="w-3.5 h-3.5 mr-1" /> 深度图\n'
        '                                  </>\n'
        '                                ) : (\n'
        '                                  <>\n'
        '                                    <Copy className="w-3.5 h-3.5 mr-1" /> 获取深度图\n'
        '                                  </>\n'
        '                                )}\n'
        '                              </button>\n'
        '                              <button\n'
        '                                onClick={() => handleSendToReverse(asset)}\n'
        '                                title="发送到反推解析"\n'
        '                                className="flex items-center px-3 py-1.5 text-xs font-medium font-sans transition-colors rounded-none border bg-white border-[#E0E0E0] text-[#7A7A7A] hover:bg-gray-50 hover:text-[#1E1E1E]"\n'
        '                              >\n'
        '                                <Send className="w-3.5 h-3.5 mr-1" /> 反推\n'
        '                              </button>'
    )
    c = c[:btn_start] + new_btn + c[btn_end:]
    print('Mirror button replaced')

# 5. Add handler functions after handleCopyGeneratedMirror
hook = 'setTimeout(() => setCopiedId(null), 2000);\n  };\n\n  return ('
handlers = '''    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDepthMap = async (asset) => {
    setDepthMapLoading((prev) => ({ ...prev, [asset.id]: true }));
    try {
      const resp = await fetch(asset.imageUrl);
      const blob = await resp.blob();
      const b64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
      const depthResp = await fetch("/api/depth-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64, modelPath: aiConfig.depthModelPath }),
      });
      const data = await depthResp.json();
      if (data.success && data.depthMapUrl) {
        setDepthMapUrls((prev) => ({ ...prev, [asset.id]: data.depthMapUrl }));
        setDepthMapAssetId(asset.id);
      } else {
        alert("深度图生成失败: " + (data.error || "未知错误"));
      }
    } catch (err) {
      alert("深度图生成失败: " + (err.message || err));
    } finally {
      setDepthMapLoading((prev) => ({ ...prev, [asset.id]: false }));
    }
  };

  const handleSendToReverse = (asset) => {
    const promptFields = CATEGORIES.map((c) => {
      const val = asset[c.key];
      return val ? "[" + c.label + ": " + val + "]" : "";
    }).filter(Boolean).join("，");
    const newPair = {
      id: uuidv4(),
      imageUrl: asset.imageUrl,
      imageName: asset.title || "来自图库",
      prompt: promptFields,
      structuredPrompt: Object.fromEntries(
        CATEGORIES.map((c) => [c.key, asset[c.key]])
      ),
      styleName: asset.styleEffect || "",
    };
    setReversePromptPairs((prev) => [...prev, newPair]);
    onOpenReverse?.();
  };

  return ('''
c = c.replace(hook, handlers)

with open(r'C:\Users\sa\Documents\lexicona\src\views\Gallery.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('ALL GALLERY FIXES APPLIED')
import re
with open(r'C:\Users\sa\Documents\lexicona\src\views\Gallery.tsx', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace(
    'styleName: asset.styleEffect || "",',
    'styleName: asset.styleEffect || "",\n      isUrlImport: true,'
)
with open(r'C:\Users\sa\Documents\lexicona\src\views\Gallery.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print("Done")
