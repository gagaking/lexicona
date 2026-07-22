with open(r'C:\Users\sa\Documents\lexicona\src\views\Gallery.tsx', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace(
    'setReversePromptPairs((prev) => [...prev, newPair]);\n        onOpenReverse?.();\n      } else {\n        alert("\u6df1\u5ea6\u56fe\u751f\u6210\u5931\u8d25: " + (data.error || "\u672a\u77e5\u9519\u8bef"));',
    'setReversePromptPairs((prev) => [...prev, newPair]);\n        showToast("\u6df1\u5ea6\u56fe\u5df2\u751f\u6210\uff0c\u53ef\u524d\u5f80\u53cd\u63a8\u89e3\u6790\u67e5\u770b");\n      } else {\n        alert("\u6df1\u5ea6\u56fe\u751f\u6210\u5931\u8d25: " + (data.error || "\u672a\u77e5\u9519\u8bef"));'
)
with open(r'C:\Users\sa\Documents\lexicona\src\views\Gallery.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('FIXED')
