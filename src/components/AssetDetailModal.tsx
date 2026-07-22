import { useState } from 'react';
import { useAppContext } from '../store';
import { Asset } from '../types';
import { rewritePromptFields } from '../services/aiService';
import { cn, getDirectImageUrl, mirrorPrompt } from '../lib/utils';
import { X, Bot, Save, Copy, Trash2, Lock, Unlock } from 'lucide-react';

export function AssetDetailModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const { updateAsset, deleteAsset, aiConfig, lockedFields, setLockedFields } = useAppContext();
  const [editingAsset, setEditingAsset] = useState<Asset>(asset);
  const [aiInstruction, setAiInstruction] = useState('');
  const [isRewriting, setIsRewriting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedMirror, setCopiedMirror] = useState(false);

  const promptFields = [
    { key: 'styleEffect', label: '风格与效果' },
    { key: 'lightingAngle', label: '光影与机位' },
    { key: 'subjectPose', label: '主体与姿态' },
    { key: 'colorVibe', label: '主色与氛围' },
    { key: 'backgroundSpace', label: '背景与空间' },
    { key: 'propsInteraction', label: '道具与互动' },
    { key: 'actionDetails', label: '动作与细节' },
    { key: 'outfitStyle', label: '穿搭与风格' },
    { key: 'specialEffects', label: '特殊效果' }
  ] as const;

  const handleSave = async () => {
    await updateAsset(editingAsset);
    onClose();
  };

  const handleDelete = async () => {
    if (confirm("确定要删除这条数据吗？")) {
      await deleteAsset(asset.id);
      onClose();
    }
  };

  const handleAiRewrite = async () => {
    if (!aiInstruction.trim()) return alert("请输入需要 AI 执行的具体指令。");
    setIsRewriting(true);
    const extractFields = promptFields.reduce((acc, field) => {
      acc[field.key] = editingAsset[field.key as keyof Asset] as string;
      return acc;
    }, {} as Record<string, string>);

    try {
      const rewritten = await rewritePromptFields(extractFields, aiInstruction, aiConfig);
      setEditingAsset(prev => ({ ...prev, ...rewritten }));
    } catch (err: any) {
      alert("重写失败: " + err.message);
    } finally {
      setIsRewriting(false);
    }
  };

  const handleCopyPrompts = () => {
    const promptStr = promptFields.map(f => {
      const val = editingAsset[f.key as keyof Asset];
      if (!val) return '';
      return `${f.label}: ${val}`;
    }).filter(Boolean).join('; ');
    
    navigator.clipboard.writeText(`[${promptStr}] --neg 低分辨率, 模糊, 背景杂乱, 畸形,collage, grid, split screen, multiple views, multiple angles, triptych, photobooth grid, repeating patterns, a pair of shoes, collection sheet;`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyMirrorPrompts = () => {
    const promptStr = promptFields.map(f => {
      const val = editingAsset[f.key as keyof Asset];
      if (!val) return '';
      return `${f.label}: ${val}`;
    }).filter(Boolean).join('; ');
    
    const textToCopy = `[${promptStr}] --neg 低分辨率, 模糊, 背景杂乱, 畸形,collage, grid, split screen, multiple views, multiple angles, triptych, photobooth grid, repeating patterns, a pair of shoes, collection sheet;`;
    navigator.clipboard.writeText(mirrorPrompt(textToCopy));
    setCopiedMirror(true);
    setTimeout(() => setCopiedMirror(false), 2000);
  };

  const toggleLock = (key: string, value: string) => {
    setLockedFields(prev => {
      const next = { ...prev };
      const isLocked = next[key]?.assetId === asset.id;
      
      if (isLocked) {
        delete next[key];
        
        // Unlock cascades if they were linked to this same asset
        if (key === 'subjectPose') {
           if (next['actionDetails']?.assetId === asset.id) delete next['actionDetails'];
           if (next['propsInteraction']?.assetId === asset.id) delete next['propsInteraction'];
           if (next['outfitStyle']?.assetId === asset.id) delete next['outfitStyle'];
        }
        if (key === 'styleEffect') {
           if (next['colorVibe']?.assetId === asset.id) delete next['colorVibe'];
           if (next['specialEffects']?.assetId === asset.id) delete next['specialEffects'];
           if (next['lightingAngle']?.assetId === asset.id) delete next['lightingAngle'];
        }
      } else {
        next[key] = { value, assetId: asset.id };
        
        // Lock cascades, BUT ONLY IF NOT ALREADY LOCKED
        if (key === 'subjectPose') {
           if (!prev['actionDetails'] && editingAsset.actionDetails) next['actionDetails'] = { value: editingAsset.actionDetails, assetId: asset.id };
           if (!prev['propsInteraction'] && editingAsset.propsInteraction) next['propsInteraction'] = { value: editingAsset.propsInteraction, assetId: asset.id };
           if (!prev['outfitStyle'] && editingAsset.outfitStyle) next['outfitStyle'] = { value: editingAsset.outfitStyle, assetId: asset.id };
        }
        if (key === 'styleEffect') {
           if (!prev['colorVibe'] && editingAsset.colorVibe) next['colorVibe'] = { value: editingAsset.colorVibe, assetId: asset.id };
           if (!prev['specialEffects'] && editingAsset.specialEffects) next['specialEffects'] = { value: editingAsset.specialEffects, assetId: asset.id };
           if (!prev['lightingAngle'] && editingAsset.lightingAngle) next['lightingAngle'] = { value: editingAsset.lightingAngle, assetId: asset.id };
        }
      }
      return next;
    });
  };

  const tagsList = editingAsset.tags?.split(',').map(t => t.trim()).filter(Boolean) || [];
  const createdAtFormatted = editingAsset.createdAt 
    ? new Date(editingAsset.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) 
    : '2026/05/07';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1E1E1E]/60 backdrop-blur-sm p-4 md:p-12 font-serif overflow-y-auto custom-scrollbar">
      <div className="bg-white max-w-[1200px] w-full min-h-[70vh] flex flex-col md:flex-row relative shadow-[0_20px_50px_rgba(0,0,0,0.3)] my-auto">
        <button onClick={onClose} className="absolute right-6 top-6 p-2 text-[#A3A3A3] hover:text-[#1E1E1E] z-20 transition-colors bg-white/80 rounded-full">
          <X className="w-5 h-5" />
        </button>

        {/* Left: Image Canvas */}
        <div className="w-full md:w-[45%] bg-[#F5F5F5] flex items-center justify-center min-h-[500px] relative p-12">
          {editingAsset.imageUrl ? (
            <img 
              src={getDirectImageUrl(editingAsset.imageUrl, 600)} 
              className="max-w-full max-h-[80vh] object-contain shadow-sm" 
              alt={editingAsset.title} 
              onLoad={(e) => {
                e.currentTarget.style.display = 'block';
                e.currentTarget.nextElementSibling?.classList.add('hidden');
              }}
              onError={(e) => { 
                e.currentTarget.style.display = 'none'; 
                e.currentTarget.nextElementSibling?.classList.remove('hidden'); 
              }} 
            />
          ) : null}
          <div className={`${editingAsset.imageUrl ? 'hidden' : ''} text-[#A3A3A3] text-sm tracking-widest uppercase font-sans`}>IMAGE UNAVAILABLE</div>
          
          <button 
             onClick={handleDelete} 
             className="absolute bottom-6 pr-6 left-6 text-[#A3A3A3] hover:text-red-500 transition-colors font-sans text-xs flex items-center tracking-wider"
             title="删除此项"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" /> DELETE
          </button>
        </div>

        {/* Right: Editorial Data */}
        <div className="w-full md:w-[55%] flex flex-col h-full bg-white p-12 pt-16 md:px-16 overflow-y-auto custom-scrollbar max-h-[90vh]">
          
          <h2 className="text-3xl md:text-4xl font-medium text-[#1E1E1E] leading-tight mb-6">
            {editingAsset.title || 'Untitled Creation'}
          </h2>
          
          {tagsList.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-10">
              {tagsList.map((tag, i) => (
                <span key={i} className="bg-[#F5F5F5] text-[#7A7A7A] px-3 py-1 text-xs font-sans tracking-wide">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between border-b border-[#E0E0E0] pb-3 mb-6">
            <h3 className="text-xs text-[#A3A3A3] font-sans uppercase tracking-[0.2em]">Prompt (点击锁定用于生成)</h3>
            <div className="flex items-center gap-4">
              
              <button onClick={handleCopyPrompts} className="flex items-center text-[10px] text-[#A3A3A3] hover:text-[#1E1E1E] uppercase tracking-[0.2em] font-sans transition-colors" title="复制所有提示词">
                <Copy className="w-3 h-3 mr-1.5" /> {copied ? 'Copied ✓' : 'Copy'}
              </button>

              <button onClick={handleCopyMirrorPrompts} className="flex items-center text-[10px] text-[#A3A3A3] hover:text-[#1E1E1E] uppercase tracking-[0.2em] font-sans transition-colors" title="左右镜像复制提示词 (将左/left与右/right互相替换)">
                <Copy className="w-3 h-3 mr-1.5" /> {copiedMirror ? 'Mirrored ✓' : 'Mirror Copy'}
              </button>
            </div>
          </div>
          
          <div className="space-y-4 mb-12">
             {promptFields.map(field => {
                 const val = editingAsset[field.key as keyof Asset];
                 if (!val) return null;
                 const isLocked = lockedFields[field.key]?.assetId === asset.id;
                 return (
                    <div key={field.key} className="flex items-start group/item relative hover:bg-[#F9F9F9] -mx-2 px-2 py-1 transition-colors">
                       <span className="text-[#1E1E1E] font-medium min-w-[85px] shrink-0 font-sans text-sm mt-0.5">{field.label}:</span>
                       <span className="flex-1 text-[#4A4A4A] ml-2 text-sm leading-relaxed pr-10">{val as string}</span>
                       <button 
                         onClick={() => toggleLock(field.key, val as string)} 
                         className={`absolute right-2 top-1.5 p-1.5 border transition-all ${isLocked ? 'bg-[#1E1E1E] text-white border-[#1E1E1E] opacity-100' : 'bg-white text-[#A3A3A3] border-[#E0E0E0] opacity-0 group-hover/item:opacity-100 hover:border-[#1E1E1E] hover:text-[#1E1E1E]'} rounded-none`}
                         title={isLocked ? "解锁" : "锁定此要素进行生成"}
                       >
                          {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                       </button>
                    </div>
                 );
             })}
          </div>
        </div>
      </div>
    </div>
  );
}
