import re
with open(r'C:\Users\sa\Documents\lexicona\src\views\Gallery.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

marker = 'handleQuickMirrorCopy(e, asset)'
idx = c.find(marker)
if idx >= 0:
    btn_start = c.rfind('<button', 0, idx)
    btn_end = c.find('</button>', idx) + len('</button>')
    
    before = c[:btn_start]
    after = c[btn_end:]
    
    new_buttons = '<button\n                                    onClick={() => handleDepthMap(asset)}\n                                    disabled={depthMapLoading[asset.id]}\n                                    className={`flex items-center justify-center transition-colors w-7 h-7 rounded ${depthMapUrls[asset.id] && depthMapAssetId === asset.id ? "bg-green-600 text-white" : "text-white/90 bg-black/40 hover:bg-black/80"}`}\n                                    title="获取深度图"\n                                  >\n                                    {depthMapLoading[asset.id] ? (\n                                      <Loader2 className="w-4 h-4 animate-spin" />\n                                    ) : depthMapUrls[asset.id] && depthMapAssetId === asset.id ? (\n                                      <Check className="w-4 h-4" />\n                                    ) : (\n                                      <Copy className="w-4 h-4" />\n                                    )}\n                                  </button>\n                                  <button\n                                    onClick={() => handleSendToReverse(asset)}\n                                    className="flex items-center justify-center transition-colors w-7 h-7 rounded text-white/90 bg-black/40 hover:bg-black/80"\n                                    title="发送到反推解析"\n                                  >\n                                    <Send className="w-4 h-4" />\n                                  </button>'
    
    c = before + new_buttons + after
    print('Replaced mirror button in main gallery card')
else:
    print('Marker not found')

with open(r'C:\Users\sa\Documents\lexicona\src\views\Gallery.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('DONE')
