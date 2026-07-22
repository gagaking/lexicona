import React, { useState, useRef, useEffect } from 'react';
import { Gadget, ChatMessage, ChatSession } from '../types';
import { MessageSquare, Settings2, Plus, X, Trash2, Send, Bot, User, FileText, ChevronRight, Copy, Check, Paperclip, Clock, FileDown, Edit2, PlusSquare, MessageSquarePlus } from 'lucide-react';
import { generateChatResponse } from '../services/aiService';
import { useAppContext } from '../store';
import Papa from 'papaparse';

export function GadgetChat({ gadget, onClose, onSwitchGadget, onEditGadget, onNewGadget }: { gadget: Gadget, onClose: () => void, onSwitchGadget?: (g: Gadget) => void, onEditGadget?: () => void, onNewGadget?: () => void }) {
  const { aiConfig, chatSessions, setChatSessions, gadgets } = useAppContext();
  
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [input, setInput] = useState('');
  const [attachedImage, setAttachedImage] = useState<{name: string, dataUrl: string, type: string} | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<{name: string, content: string, type: string}[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // When gadget changes dynamically, try to load its most recent session
    if (!currentSessionId) {
      const recent = chatSessions.filter(s => s.gadgetId === gadget.id).sort((a,b) => b.updatedAt - a.updatedAt)[0];
      if (recent) {
        setCurrentSessionId(recent.id);
        setMessages(recent.messages);
      } else {
        setCurrentSessionId(null);
        setMessages([]);
      }
    } else {
       // Check if current session belongs to this gadget
       const s = chatSessions.find(s => s.id === currentSessionId);
       if (s && s.gadgetId !== gadget.id) {
          // Changed gadget externally
          const recent = chatSessions.filter(s => s.gadgetId === gadget.id).sort((a,b) => b.updatedAt - a.updatedAt)[0];
          if (recent) {
             setCurrentSessionId(recent.id);
             setMessages(recent.messages);
          } else {
             setCurrentSessionId(null);
             setMessages([]);
          }
       }
    }
  }, [gadget.id]);

  useEffect(() => {
    if (!showHistory) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showHistory]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (!files.length) return;
    
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (event) => {
              const dataUrl = event.target?.result as string;
              setAttachedImage({ name: file.name, dataUrl, type: file.type });
          };
          reader.readAsDataURL(file);
      } else {
          const reader = new FileReader();
          reader.onload = (event) => {
              const text = event.target?.result;
              if (typeof text === 'string') {
                  setAttachedFiles(prev => [...prev, { name: file.name, content: text, type: file.type || 'text/plain' }]);
              }
          };
          reader.readAsText(file);
      }
    });
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCopy = (content: string, id: number | string) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSend = async () => {
    if ((!input.trim() && !attachedImage && attachedFiles.length === 0) || isLoading) return;
    const userMsg = input.trim();
    setInput('');
    const imgToSend = attachedImage;
    setAttachedImage(null);
    const filesToSend = attachedFiles;
    setAttachedFiles([]);

    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      setCurrentSessionId(sessionId);
    }

    const title = messages.length === 0 ? (userMsg.slice(0, 20) || 'New Chat').trim() : undefined;
    const newMessages = [...messages, { role: 'user' as const, content: userMsg, image: imgToSend || undefined, files: filesToSend.length > 0 ? filesToSend : undefined }];
    setMessages(newMessages);
    
    setChatSessions(prev => {
      const existing = prev.find(s => s.id === sessionId);
      if (existing) {
        return prev.map(s => s.id === sessionId ? { ...s, messages: newMessages, updatedAt: Date.now() } : s);
      }
      return [{ id: sessionId!, gadgetId: gadget.id, title: title || 'New Chat', updatedAt: Date.now(), messages: newMessages }, ...prev];
    });

    setIsLoading(true);

    try {
      const history = newMessages.map(m => {
          let textContent = m.content || '(附加了附件)';
          if (m.files && m.files.length > 0) {
              const filesText = m.files.map(f => `\n[Attached File: ${f.name}]\n${f.content}\n`).join('');
              textContent += filesText;
          }
          return { 
              role: m.role, 
              parts: [{ text: textContent }],
              image: m.image ? { mimeType: m.image.type, base64: m.image.dataUrl.split(',')[1] } : undefined
          };
      });
      
      const systemInstruction = `你现在作为一个工具助手运行，你的全称和定位是：【${gadget.name}】。
下面是你的功能说明：
${gadget.description}

### 你的核心指令：
${gadget.instruction}

### 知识库与参考资料：
${gadget.knowledge || '无'}

请严格按照以上设定的角色和功能说明提供回答，并且必须遵循核心指令进行操作。`;

      const currentImageObj = imgToSend ? { mimeType: imgToSend.type, base64: imgToSend.dataUrl.split(',')[1] } : undefined;
      const fullUserMsgText = history[history.length - 1].parts[0].text;
      const responseText = await generateChatResponse(fullUserMsgText, history.slice(0, -1), systemInstruction, aiConfig, currentImageObj);
      const { getModelVendorString } = await import('../types');
      
      const vendorInfo = getModelVendorString(aiConfig);
      const finalMsg = { role: 'model' as const, content: responseText, modelVendor: vendorInfo };
      
      setMessages(prev => [...prev, finalMsg]);
      setChatSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: [...s.messages, finalMsg], updatedAt: Date.now() } : s));

    } catch (e: any) {
      const finalMsg = { role: 'model' as const, content: `[Error]\n${e.message}` };
      setMessages(prev => [...prev, finalMsg]);
      setChatSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: [...s.messages, finalMsg], updatedAt: Date.now() } : s));
    } finally {
      setIsLoading(false);
    }
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChatSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) {
      setCurrentSessionId(null);
      setMessages([]);
    }
  };

  const clearAllHistory = () => {
    if (confirm('确定清空所有对话历史吗？该操作不可恢复。')) {
      setChatSessions([]);
      setCurrentSessionId(null);
      setMessages([]);
    }
  };

  const renderMessageContent = (content: string, messageIndex: number) => {
    if (!content) return null;

    const codeBlockRegex = /```([\w-]*)\n([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
      }
      parts.push({ type: 'code', language: match[1].toLowerCase(), content: match[2].trim() });
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < content.length) {
      parts.push({ type: 'text', content: content.slice(lastIndex) });
    }

    return parts.map((part, index) => {
      if (part.type === 'text') {
         return <div key={index} className="whitespace-pre-wrap">{part.content}</div>;
      }
      
      const isCsvOrTable = part.language === 'csv' || part.language === 'markdown' || part.content.includes('|---|') || (part.content.includes(',') && part.content.split('\n').length > 1);
      const blockId = `block-${messageIndex}-${index}`;
      
      const downloadCsv = () => {
          let csvContent = part.content;
          if (part.content.includes('|')) {
             const lines = part.content.split('\n').filter(l => l.trim().startsWith('|'));
             if (lines.length > 0) {
                 const csvLines = lines.map(line => {
                    return line.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim().replace(/"/g, '""')).map(cell => `"${cell}"`).join(',');
                 });
                 csvContent = csvLines.filter(l => !l.includes('---')).join('\n');
             }
          }
          const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `export-${Date.now()}.csv`;
          a.click();
          URL.revokeObjectURL(url);
      };

      return (
         <div key={index} className="my-2 bg-[#1E1E1E] text-[#D4D4D4] rounded overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#2D2D2D] border-b border-[#3E3E3E] text-[11px] text-[#A3A3A3] font-sans">
               <span>{part.language || 'text'}</span>
               <div className="flex items-center gap-1">
                  <button 
                    onClick={() => handleCopy(part.content, blockId)}
                    className="p-1 hover:text-white transition-colors flex items-center gap-1"
                    title="一键复制"
                  >
                    {copiedIndex === blockId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedIndex === blockId ? '已复制' : '复制'}</span>
                  </button>
                  {isCsvOrTable && (
                     <>
                       <div className="w-px h-3 bg-[#4A4A4A] mx-1"></div>
                       <button
                         onClick={downloadCsv}
                         className="p-1 hover:text-white transition-colors flex items-center gap-1"
                         title="下载为CSV"
                       >
                          <FileDown className="w-3 h-3" />
                          <span>下载CSV</span>
                       </button>
                     </>
                  )}
               </div>
            </div>
            <div className="p-3 max-h-[20rem] overflow-y-auto custom-scrollbar-dark text-xs font-mono whitespace-pre-wrap leading-relaxed">
               {part.content}
            </div>
         </div>
      );
    });
  };

  return (
    <div className="h-full w-full bg-white flex flex-col">
      <div className="flex items-center justify-between px-4 pt-5 pb-3 bg-[#FCFBF9] border-b border-[#F0F0F0]">
        <div className="flex items-center gap-2 overflow-hidden relative group cursor-pointer hover:bg-black/5 rounded pr-2 py-0.5 -ml-1 transition-colors">
          <div className="w-6 h-6 rounded bg-[#1E1E1E] text-white flex items-center justify-center text-xs font-semibold shrink-0">
            {gadget.name.charAt(0)}
          </div>
          <h3 className="font-medium text-[#1E1E1E] truncate min-w-[3rem]">{gadget.name}</h3>
          <svg className="w-3.5 h-3.5 text-[#A3A3A3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <select 
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            value={gadget.id}
            onChange={(e) => {
              const selected = gadgets.find(g => g.id === e.target.value);
              if (selected && onSwitchGadget) onSwitchGadget(selected);
            }}
          >
            {gadgets.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5 mr-auto pl-2">
          {onEditGadget && (
            <button onClick={onEditGadget} className="p-1 text-[#A3A3A3] bg-white border border-[#E0E0E0] shadow-sm rounded hover:text-[#1E1E1E] transition-colors" title="编辑当前工具">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onNewGadget && (
            <button 
              onClick={onNewGadget} 
              className="p-1 text-[#A3A3A3] bg-white border border-[#E0E0E0] shadow-sm rounded hover:text-[#1E1E1E] transition-colors" 
              title="新建工具"
            >
              <PlusSquare className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => {
              setCurrentSessionId(null);
              setMessages([]);
              setShowHistory(false);
            }} 
            className="p-1 hover:bg-[#EAEAEA] rounded text-[#7A7A7A] transition-colors flex items-center gap-1" 
            title="开启新对话"
          >
            <MessageSquarePlus className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setShowHistory(!showHistory)} 
            className={`p-1 rounded transition-colors ${showHistory ? 'bg-[#EAEAEA] text-[#1E1E1E]' : 'hover:bg-[#EAEAEA] text-[#7A7A7A]'}`} 
            title="查看历史记录"
          >
            <Clock className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-1 hover:bg-[#EAEAEA] rounded text-[#7A7A7A] transition-colors" title="关闭">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {showHistory ? (
        <div className="flex-1 overflow-y-auto p-4 bg-[#FCFBF9] flex flex-col gap-2 relative">
          <div className="flex justify-between items-center mb-2 px-1">
            <span className="font-medium text-sm text-[#1E1E1E]">所有历史记录</span>
            {chatSessions.length > 0 && (
              <button 
                onClick={clearAllHistory} 
                className="text-xs text-red-500 hover:text-red-700 transition-colors"
              >
                清空全部
              </button>
            )}
          </div>
          {chatSessions.length === 0 ? (
            <div className="text-center text-[#A3A3A3] mt-10 text-sm">
              暂无对话记录
            </div>
          ) : (
            chatSessions.sort((a,b) => b.updatedAt - a.updatedAt).map(session => {
              const sessionGadget = gadgets.find(g => g.id === session.gadgetId);
              const gadgetName = sessionGadget ? sessionGadget.name : '已删除工具';
              
              return (
                <div 
                  key={session.id} 
                  className={`relative group p-3 bg-white border rounded cursor-pointer transition-colors flex flex-col gap-1 ${currentSessionId === session.id ? 'border-[#1E1E1E] bg-[#FAFAFA]' : 'border-[#E0E0E0] hover:border-[#A3A3A3]'}`}
                  onClick={() => {
                    setCurrentSessionId(session.id);
                    setMessages(session.messages);
                    setShowHistory(false);
                    if (sessionGadget && onSwitchGadget && gadget.id !== sessionGadget.id) {
                      onSwitchGadget(sessionGadget);
                    }
                  }}
                >
                  <div className="flex justify-between items-start gap-2">
                     <span className="text-sm font-medium text-[#1E1E1E] line-clamp-1 flex-1">{session.title}</span>
                     <button 
                       className="p-1 text-[#A3A3A3] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded shadow-sm border border-[#E0E0E0]" 
                       onClick={(e) => deleteSession(session.id, e)}
                       title="删除记录"
                     >
                       <Trash2 className="w-3 h-3" />
                     </button>
                  </div>
                  <div className="flex justify-between items-center text-xs text-[#7A7A7A]">
                     <span className="truncate max-w-[60%]">{gadgetName}</span>
                     <span>{new Date(session.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-[#FCFBF9] text-sm">
            {messages.length === 0 && (
              <div className="text-center text-[#A3A3A3] mt-10">
                <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="px-4 leading-relaxed">{gadget.description}</p>
                <div className="mt-4 text-xs bg-[#EAEAEA]/50 inline-block px-3 py-1 rounded-full text-[#7A7A7A]">
                  发送消息开启新对话
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} group`}>
                <div className={`max-w-[85%] rounded p-3 whitespace-pre-wrap leading-relaxed ${m.role === 'user' ? 'bg-[#1E1E1E] text-white' : 'bg-white border border-[#E0E0E0] text-[#333130] shadow-sm relative'}`}>
                  {m.role === 'model' ? (
                    <div className="relative pt-1 pb-1">
                      <div className="space-y-2">
                        {renderMessageContent(m.content, i)}
                      </div>
                      {m.modelVendor && (
                        <div className="text-[10px] text-[#A3A3A3] mt-2 pt-2 border-t border-[#EAEAEA]">
                            Powered by {m.modelVendor}
                        </div>
                      )}
                      <button
                        onClick={() => handleCopy(m.content, i)}
                        className={`absolute -top-3 -right-3 p-1.5 bg-white border border-[#E0E0E0] shadow-sm rounded-full transition-opacity ${copiedIndex === i ? 'opacity-100 text-[#1E1E1E]' : 'opacity-0 group-hover:opacity-100 text-[#7A7A7A] hover:text-[#1E1E1E]'}`}
                        title={copiedIndex === i ? "已复制全部" : "复制全部"}
                      >
                        {copiedIndex === i ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {m.image && (
                        <img src={m.image.dataUrl} alt="attached" className="max-w-full h-auto max-h-48 rounded border border-white/20 object-contain" />
                      )}
                      {m.files && m.files.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          {m.files.map((f, idx) => (
                             <div key={idx} className="flex items-center gap-2 p-2 bg-white/10 rounded border border-white/20">
                               <FileText className="w-4 h-4 shrink-0" />
                               <span className="text-xs truncate" title={f.name}>{f.name}</span>
                             </div>
                          ))}
                        </div>
                      )}
                      {m.content && (
                        <div className="max-h-[15rem] overflow-y-auto custom-scrollbar pr-2 whitespace-pre-wrap">
                          {m.content}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex gap-1 bg-white border border-[#E0E0E0] p-3 rounded shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{animationDelay: "0.2s"}}></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{animationDelay: "0.4s"}}></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 bg-white border-t border-[#E0E0E0]">
            {attachedImage && (
              <div className="mb-2 relative inline-block">
                <img src={attachedImage.dataUrl} alt={attachedImage.name} className="h-16 rounded border border-[#E0E0E0] object-cover" />
                <button 
                  onClick={() => setAttachedImage(null)}
                  className="absolute -top-1 -right-1 bg-white border border-[#E0E0E0] rounded-full p-0.5 text-red-500 hover:bg-red-50"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {attachedFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachedFiles.map((f, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 px-2 py-1 bg-[#F5F5F5] border border-[#E0E0E0] rounded text-xs">
                    <FileText className="w-3 h-3" />
                    <span className="truncate max-w-[150px]">{f.name}</span>
                    <button 
                      onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== idx))}
                      className="text-red-500 hover:text-red-700 p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="relative flex items-end">
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileUpload}
                accept="*/*"
                multiple
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute left-2 bottom-2 p-1.5 rounded text-[#7A7A7A] hover:text-[#1E1E1E] hover:bg-[#EAEAEA] transition-colors z-10"
                title="附加文本文件"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <textarea 
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="附加文件或输入消息..."
                className="w-full bg-[#F5F5F5] border border-transparent focus:border-[#E0E0E0] focus:bg-white focus:outline-none rounded pl-10 pr-10 py-2.5 text-sm resize-none custom-scrollbar"
                rows={Math.min(10, Math.max(1, input.split('\n').length))}
                style={{ minHeight: '44px' }}
              />
              <button 
                onClick={handleSend}
                disabled={(!input.trim() && !attachedImage && attachedFiles.length === 0) || isLoading}
                className="absolute right-2 bottom-2 p-1.5 rounded bg-[#1E1E1E] text-white disabled:opacity-50 disabled:bg-[#A3A3A3] z-10"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
