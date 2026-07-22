export function getOfflineHtml(pairs: any[]) {
  const imagesHtml = pairs.filter(p => p.prompt && !p.prompt.startsWith('错误')).map(p => {
    let negPromptHtml = p.negativePrompt ? `<div class="negative-prompt-container"><h4>负面提示词</h4><p class="negative-prompt-text">${p.negativePrompt}</p></div>` : '';
    let structHtml = '';
    if (p.structuredPrompt) {
       structHtml = `<details class="structured-prompt-details"><summary>展开结构化视图</summary><div class="structured-content"><pre style="font-size:12px;color:#a3a3a3;">${JSON.stringify(p.structuredPrompt, null, 2)}</pre></div></details>`;
    }
    const imgName = p.imageName || 'Image';
    const imgSrc = p.isUrlImport ? p.imageUrl : `./images/${imgName}`;
    
    return `
      <div class="item-container">
        <div class="image-container">
          <img src="${imgSrc}" alt="${imgName}" class="thumbnail" onclick="window.open('${imgSrc}', '_blank')">
        </div>
        <div class="prompt-container">
          <div class="prompt-text-container">
            <p class="prompt-text">${p.prompt}</p>
            ${negPromptHtml}
            ${structHtml}
          </div>
          <div class="prompt-actions">
            <span class="filename" title="${imgName}">${imgName}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI 生成的提示词</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #111827; color: #d1d5db; margin: 0; padding: 24px; }
h1 { color: #fff; border-bottom: 1px solid #374151; padding-bottom: 16px; margin-top: 0; }
.grid-container { display: flex; flex-direction: column; gap: 24px; }
.item-container { display: flex; gap: 20px; background-color: #1f2937; border-radius: 12px; overflow: hidden; border: 1px solid #374151; min-height: 250px; }
.image-container { flex: 0 0 250px; }
.thumbnail { width: 100%; height: 100%; object-fit: cover; cursor: pointer; transition: transform 0.3s ease; }
.thumbnail:hover { transform: scale(1.05); }
.prompt-container { flex: 1; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; }
.prompt-text-container { max-height: 180px; overflow-y: auto; padding-right: 10px; margin-bottom: 15px; }
.prompt-text { font-size: 14px; line-height: 1.6; color: #d1d5db; margin: 0; white-space: pre-wrap; word-break: break-all; }
.prompt-actions { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #374151; padding-top: 15px; }
.filename { font-size: 12px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
.negative-prompt-container { margin-top: 12px; padding-top: 12px; border-top: 1px dashed #374151; }
.negative-prompt-container h4 { font-size: 13px; color: #fca5a5; margin: 0 0 6px 0; }
.negative-prompt-text { font-size: 13px; line-height: 1.5; color: #fca5a5; opacity: 0.8; margin: 0; white-space: pre-wrap; word-break: break-all; }
.structured-prompt-details { margin-top: 12px; }
.structured-prompt-details summary { cursor: pointer; font-size: 12px; color: #9ca3af; outline: none; }
</style>
</head>
<body>
  <h1>AI 生成的提示词</h1>
  <div class="grid-container">
    ${imagesHtml}
  </div>
</body>
</html>`;
}
