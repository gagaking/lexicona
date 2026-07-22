import re
with open(r'C:\Users\sa\Documents\lexicona\src\views\Gallery.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Add stopPropagation to depth map button
c = c.replace('onClick={() => handleDepthMap(asset)}\n                                    disabled={depthMapLoading[asset.id]}', 'onClick={(e) => { e.stopPropagation(); handleDepthMap(asset); }}\n                                    disabled={depthMapLoading[asset.id]}')

# 2. Change Copy to Send in depth map button AND remove send-to-reverse button
# Marker: the Copy icon inside depth map button followed by the send button
old_block = '<Copy className="w-4 h-4" />\n                                    )}\n                                  </button>\n                                  <button\n                                    onClick={() => handleSendToReverse(asset)}\n                                    className="flex items-center justify-center transition-colors w-7 h-7 rounded text-white/90 bg-black/40 hover:bg-black/80"\n                                    title="发送到反推解析"\n                                  >\n                                    <Send className="w-4 h-4" />\n                                  </button>'
new_block = '<Send className="w-4 h-4" />\n                                    )}\n                                  </button>'
c = c.replace(old_block, new_block)

# 3. Add navigation to handleDepthMap after successful depth map generation
old_handler = '        setDepthMapUrls((prev) => ({ ...prev, [asset.id]: data.depthMapUrl }));\n        setDepthMapAssetId(asset.id);\n      } else {\n        alert("深度图生成失败: " + (data.error || "未知错误"));\n      }'
new_handler = '        setDepthMapUrls((prev) => ({ ...prev, [asset.id]: data.depthMapUrl }));\n        setDepthMapAssetId(asset.id);\n        const promptFields = CATEGORIES.map((c) => {\n          const val = asset[c.key];\n          return val ? "[" + c.label + ": " + val + "]" : "";\n        }).filter(Boolean).join("\uff0c");\n        const newPair = {\n          id: uuidv4(),\n          imageUrl: asset.imageUrl,\n          imageName: asset.title || "深度图",\n          prompt: promptFields,\n          depthMapUrl: data.depthMapUrl,\n          activeView: "depth",\n          structuredPrompt: Object.fromEntries(\n            CATEGORIES.map((c) => [c.key, asset[c.key]])\n          ),\n          styleName: asset.styleEffect || "",\n          isUrlImport: true,\n        };\n        setReversePromptPairs((prev) => [...prev, newPair]);\n        onOpenReverse?.();\n      } else {\n        alert("深度图生成失败: " + (data.error || "未知错误"));\n      }'
c = c.replace(old_handler, new_handler)

with open(r'C:\Users\sa\Documents\lexicona\src\views\Gallery.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('ALL FIXES APPLIED')
