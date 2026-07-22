const fs = require('fs');

const replacement = `            {mixedPrompts.length > 0 && (
               <>
                  <div className="relative flex items-stretch group/undress">
                    <button 
                      disabled={isGenerating}
                      className="flex items-center px-2 py-1.5 text-xs font-sans border bg-transparent border-[#E0E0E0] hover:bg-gray-50 text-[#7A7A7A] group-hover/undress:text-[#1E1E1E] disabled:opacity-50"
                      title="一键卸装"
                    >
                      {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shirt className="w-3.5 h-3.5" />}
                    </button>
                    <div className="absolute top-full right-0 pt-[2px] w-[75px] z-50 opacity-0 invisible group-hover/undress:opacity-100 group-hover/undress:visible transition-all duration-150">
                       <div className="bg-white border border-[#E0E0E0] shadow-xl flex flex-col py-1">
                         {['衣服', '裤子', '鞋子', '全套'].map((label, i) => {
                            const types = ['top', 'bottom', 'shoes', 'set'];
                            return (
                                <button key={label} onClick={() => {
                                  if (isGenerating) return;
                                  setIsGenerating(true);
                                  undressMixedPrompt(mixedPrompts[0], types[i], aiConfig).then(updated => {
                                     setMixedPrompts(prev => [{...updated, label: \`卸装版本: \${label}\`}, ...prev]);
                                  }).catch(err => {
                                     setApiError("卸装失败: " + (err.message || String(err)));
                                  }).finally(() => {
                                     setIsGenerating(false);
                                  });
                                }} className="px-2 py-1.5 text-[11px] text-center font-sans tracking-wide hover:bg-gray-100 text-[#5A5A5A] hover:text-[#1E1E1E] transition-colors border-b border-white/50">{\`卸\${label}\`}</button>
                            );
                         })}
                       </div>
                    </div>
                  </div>
                 <button 
                   onClick={handleExportMixCSV}
                   title="导出结果表单 (CSV)"
                   className="flex items-center p-2 text-[#7A7A7A] hover:text-[#1E1E1E] transition-colors rounded hover:bg-gray-50"
                 >
                   <FileSpreadsheet className="w-4 h-4" />
                 </button>
               </>
             )}
            </div>
         </div>
         
         {mixedPrompts.length > 0 && (
           <div className="max-w-[1200px] mx-auto w-full bg-[#FAFAFA] border border-[#E0E0E0] p-4 font-sans text-[13px] text-[#1E1E1E] leading-relaxed max-h-[400px] overflow-y-auto custom-scrollbar shadow-inner flex flex-col gap-4">
              {mixedPrompts.map((mp, index) => (
                  <div key={index} className="flex-1 flex flex-col gap-2 p-3 bg-white border border-[#EAEAEA] relative">
                     {mp.label && <div className="absolute top-2 right-2 flex items-center justify-center bg-[#F5F5F5] text-[#7A7A7A] text-[10px] px-2 py-0.5 rounded-none font-medium whitespace-nowrap">{mp.label}</div>}
                     <div className="flex items-center justify-between mb-1">
                        <div className="font-medium text-[#1E1E1E] text-[12px]">混合生成结果 {mixedPrompts.length - index}</div>
                        <button 
                          onClick={() => handleCopyMix(mp)}
                          title="复制提示词"
                          className="flex items-center p-1.5 transition-all rounded hover:bg-gray-50 text-[#7A7A7A] hover:text-[#1E1E1E]"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                     </div>
                     {mp.structuredData ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                           {['styleEffect', 'lightingAngle', 'subjectPose', 'colorVibe', 'backgroundSpace', 'propsInteraction', 'actionDetails', 'outfitStyle', 'specialEffects'].map(k => {
                              const val = mp.structuredData[k];
                              if (!val || val.trim() === '') return null;
                              const labels = {
                                 styleEffect: "风格与效果", lightingAngle: "光影与机位", subjectPose: "主体与姿态",
                                 colorVibe: "主色与氛围", backgroundSpace: "背景与空间", propsInteraction: "道具与互动",
                                 actionDetails: "动作与细节", outfitStyle: "穿搭与风格", specialEffects: "特殊效果"
                              };
                              const label = labels[k] || k;
                              return (
                                <div key={k} className="bg-[#FAFAFA] border border-[#F0F0F0] p-2 shadow-sm break-words">
                                   <div className="text-[11px] font-medium text-[#7A7A7A] mb-1">{label}</div>
                                   <div className="text-[12px] text-[#1E1E1E]">{val}</div>
                                </div>
                              );
                           })}
                        </div>
                     ) : (
                        <div className="mb-2">{mp.prompt}</div>
                     )}
                     {mp.relationships && mp.relationships.length > 0 && (
                         <div className="text-[#7A7A7A] text-[11px] pt-2 border-t border-[#EAEAEA] flex gap-2 flex-wrap mt-2">
                            {mp.relationships.map((rel, idx) => (
                               <span key={idx} className="bg-white border border-[#E0E0E0] px-2.5 py-1 shadow-sm text-[#4A4A4A]">
                                  <span className="font-medium text-[#1E1E1E]">图像 {rel.sourceImageIndex}</span> ({rel.aspect}): {rel.extractedDetails}
                               </span>
                            ))}
                         </div>
                     )}
                  </div>
              ))}
           </div>
         )}
      </div>
`;

let part1 = fs.readFileSync('src/views/MoodboardView.part1.tsx', 'utf-8');
let part2 = fs.readFileSync('src/views/MoodboardView.part2.tsx', 'utf-8');

let endOfOld = part2.indexOf('      </div>');
let finalPart2 = part2.substring(endOfOld + 12);

fs.writeFileSync('src/views/MoodboardView.tsx', part1 + replacement + finalPart2, 'utf-8');
console.log('Update applied');
