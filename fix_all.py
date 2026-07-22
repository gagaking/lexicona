with open(r'C:\Users\sa\Documents\lexicona\src\views\Gallery.tsx', 'r', encoding='utf-8') as f:
    c = f.read()
# Fix 1: Change showToast to setTimeout navigation
c = c.replace(
    'setReversePromptPairs((prev) => [...prev, newPair]);\n        showToast("\u6df1\u5ea6\u56fe\u5df2\u751f\u6210\uff0c\u53ef\u524d\u5f80\u53cd\u63a8\u89e3\u6790\u67e5\u770b");',
    'setReversePromptPairs((prev) => [...prev, newPair]);\n        setTimeout(() => onOpenReverse?.(), 200);'
)
with open(r'C:\Users\sa\Documents\lexicona\src\views\Gallery.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('Gallery fix applied')

# Fix 2: Replace copy/mirror buttons in ReversePrompt with depth map copy button
with open(r'C:\Users\sa\Documents\lexicona\src\views\ReversePrompt.tsx', 'r', encoding='utf-8') as f:
    c2 = f.read()

old_buttons = '                            <button\n                                onClick={() =>\n                                  copyText(\n                                    getCombinedPrompt(p) +\n                                      (p.negativePrompt\n                                        ? ` --neg ${p.negativePrompt}`\n                                        : ""),\n                                    p.id,\n                                  )\n                                }\n                                className="flex items-center gap-1 text-[10px] text-[#1E1E1E] bg-[#FAFAFA] hover:bg-[#1E1E1E] hover:text-white px-2 py-1 border border-[#E0E0E0] rounded-none font-medium whitespace-nowrap shrink-0 cursor-pointer transition-all duration-150"\n                              >\n                                {copiedId === p.id ? (\n                                  <>\n                                    <Check className="w-3 h-3 text-green-600" />{" "}\n                                    \u5df2\u590d\u5236\n                                  </>\n                                ) : (\n                                  <>\n                                    <Copy className="w-3 h-3" /> \u590d\u5236\u5168\u90e8\n                                  </>\n                                )}\n                              </button>\n\n                              <button\n                                onClick={() =>\n                                  copyText(\n                                    mirrorPrompt(\n                                      getCombinedPrompt(p) +\n                                        (p.negativePrompt\n                                          ? ` --neg ${p.negativePrompt}`\n                                          : "")\n                                    ),\n                                    p.id + "-mirror",\n                                  )\n                                }\n                                className="flex items-center gap-1 text-[10px] text-[#1E1E1E] bg-[#FAFAFA] hover:bg-[#1E1E1E] hover:text-white px-2 py-1 border border-[#E0E0E0] rounded-none font-medium whitespace-nowrap shrink-0 cursor-pointer transition-all duration-150"\n                                title="\u5de6\u53f3\u955c\u50cf\u590d\u5236 (\u5c06\u5de6/left\u4e0e\u53f3/right\u4e92\u76f8\u66ff\u6362)"\n                              >\n                                {copiedId === p.id + "-mirror" ? (\n                                  <>\n                                    <Check className="w-3 h-3 text-green-600" />{" "}\n                                    \u5df2\u955c\u50cf\u590d\u5236\n                                  </>\n                                ) : (\n                                  <>\n                                    <Copy className="w-3 h-3" /> \u5de6\u53f3\u955c\u50cf\u590d\u5236\n                                  </>\n                                )}\n                              </button>'

new_button = '                            {p.depthMapUrl && (\n                              <button\n                                onClick={() => copyText(p.depthMapUrl, p.id + "-depth")}\n                                className="flex items-center gap-1 text-[10px] text-[#1E1E1E] bg-[#FAFAFA] hover:bg-[#1E1E1E] hover:text-white px-2 py-1 border border-[#E0E0E0] rounded-none font-medium whitespace-nowrap shrink-0 cursor-pointer transition-all duration-150"\n                                title="\u590d\u5236\u6df1\u5ea6\u56fe"\n                              >\n                                {copiedId === p.id + "-depth" ? (\n                                  <>\n                                    <Check className="w-3 h-3 text-green-600" /> \u5df2\u590d\u5236\n                                  </>\n                                ) : (\n                                  <>\n                                    <Copy className="w-3 h-3" /> \u590d\u5236\u6df1\u5ea6\u56fe\n                                  </>\n                                )}\n                              </button>\n                            )}'

if old_buttons in c2:
    c2 = c2.replace(old_buttons, new_button)
    with open(r'C:\Users\sa\Documents\lexicona\src\views\ReversePrompt.tsx', 'w', encoding='utf-8') as f:
        f.write(c2)
    print('ReversePrompt fix applied')
else:
    print('ReversePrompt: old buttons not found - checking position')
    # Try to find the copy buttons using a simpler marker
    marker = 'mirrorPrompt('
    idx = c2.find(marker)
    if idx >= 0:
        print(f'Found mirrorPrompt at position {idx}')
        # Find the containing button div
        print('Context:', c2[idx-200:idx+100])
    else:
        print('mirrorPrompt not found either')

print('ALL DONE')
