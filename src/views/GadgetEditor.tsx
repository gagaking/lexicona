import React, { useState, useRef } from 'react';
import { Gadget } from '../types';
import { X, Save, Upload, Trash2, FileText } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export function GadgetEditor({ 
  existingGadget, 
  onSave, 
  onClose,
  onDelete
}: { 
  existingGadget?: Gadget | null, 
  onSave: (gadget: Gadget) => void, 
  onClose: () => void,
  onDelete?: (id: string) => void
}) {
  const [name, setName] = useState(existingGadget?.name || '');
  const [description, setDescription] = useState(existingGadget?.description || '');
  const [instruction, setInstruction] = useState(existingGadget?.instruction || '');
  const [knowledge, setKnowledge] = useState(existingGadget?.knowledge || '');
  const [fileName, setFileName] = useState(existingGadget?.knowledge ? '知识文档.txt' : '');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (evt.target?.result) {
        setKnowledge(evt.target.result as string);
      }
    };
    reader.readAsText(file);
  };

  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const handleSave = () => {
    if (!name.trim()) return alert("名称不可为空");
    if (!instruction.trim()) return alert("指令不可为空");
    
    onSave({
      id: existingGadget?.id || uuidv4(),
      name,
      description,
      instruction,
      knowledge
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-white animate-in slide-in-from-right-8 duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#E0E0E0] bg-[#FCFBF9]">
          <h2 className="text-base font-semibold text-[#1E1E1E]">
            {existingGadget ? '小工具设置' : '添加小工具'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-[#EAEAEA] text-[#7A7A7A] transition-colors rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 bg-white">
          
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[#1E1E1E]">名称</label>
            <input 
              value={name} onChange={e => setName(e.target.value)}
              placeholder="例如: 棚内look生成"
              className="px-3 py-2 border border-[#E0E0E0] rounded bg-white focus:outline-none focus:border-[#7A7A7A] focus:ring-1 focus:ring-[#7A7A7A] text-sm"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[#1E1E1E]">说明</label>
            <textarea 
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="简短描述这个小工具的用途..."
              className="px-3 py-2 border border-[#E0E0E0] rounded bg-white focus:outline-none focus:border-[#7A7A7A] focus:ring-1 focus:ring-[#7A7A7A] text-sm resize-none custom-scrollbar h-20"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[#1E1E1E] flex items-center">
              指令 <span className="ml-2 text-xs text-[#A3A3A3] font-normal">(System Prompt)</span>
            </label>
            <textarea 
              value={instruction} onChange={e => setInstruction(e.target.value)}
              placeholder="给AI的系统指令和详细要求..."
              className="px-3 py-2 border border-[#E0E0E0] rounded bg-white focus:outline-none focus:border-[#7A7A7A] focus:ring-1 focus:ring-[#7A7A7A] text-sm custom-scrollbar h-48"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[#1E1E1E] flex items-center">
              知识库 <span className="ml-2 text-xs text-[#A3A3A3] font-normal">(供AI在对话中参考的内容)</span>
            </label>
            <div className="border border-[#E0E0E0] rounded bg-[#F5F5F5] p-4 flex flex-col items-center justify-center gap-3 border-dashed">
              {fileName || knowledge ? (
                <div className="flex items-center justify-between w-full p-3 bg-white border border-[#E0E0E0] rounded shadow-sm">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <FileText className="w-5 h-5 text-blue-500 shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium text-[#1E1E1E] truncate">{fileName || '已添加文本内容'}</span>
                      <span className="text-xs text-[#7A7A7A]">{knowledge.length} 个字符</span>
                    </div>
                  </div>
                  <button onClick={() => { setKnowledge(''); setFileName(''); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-[#7A7A7A]">添加 txt 文件，供你的 Gem 在对话中参考。</p>
                  <button onClick={() => fileInputRef.current?.click()} className="flex items-center px-4 py-2 bg-white border border-[#E0E0E0] text-sm font-medium text-[#1E1E1E] hover:bg-gray-50 rounded shadow-sm transition-colors">
                    <Upload className="w-4 h-4 mr-2" /> 上传文档 (.txt)
                  </button>
                </>
              )}
              <input type="file" accept=".txt" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-[#E0E0E0] bg-[#FCFBF9]">
          {existingGadget && onDelete ? (
            showConfirmDelete ? (
              <div className="flex gap-2 items-center">
                <span className="text-sm text-red-500 font-medium">确认删除此工具？</span>
                <button onClick={() => onDelete(existingGadget.id)} className="px-3 py-1.5 text-xs bg-red-500 text-white hover:bg-red-600 rounded font-medium transition-colors">
                  确认
                </button>
                <button onClick={() => setShowConfirmDelete(false)} className="px-3 py-1.5 text-xs text-[#7A7A7A] hover:bg-[#EAEAEA] rounded font-medium transition-colors">
                  取消
                </button>
              </div>
            ) : (
              <button onClick={() => setShowConfirmDelete(true)} className="px-4 py-2 text-sm text-red-500 hover:bg-red-100 rounded font-medium transition-colors">
                删除
              </button>
            )
          ) : <div/>}
          <div className="flex gap-3">
             <button onClick={onClose} className="px-4 py-2 text-sm text-[#4A4A4A] hover:bg-[#EAEAEA] rounded font-medium transition-colors">取消</button>
             <button onClick={handleSave} className="flex items-center px-4 py-2 bg-[#1E1E1E] text-white hover:bg-black text-sm rounded font-medium shadow-sm transition-colors">
               <Save className="w-4 h-4 mr-2" /> 保存
             </button>
          </div>
        </div>
    </div>
  );
}
