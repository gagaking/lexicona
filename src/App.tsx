import { AppProvider, useAppContext } from './store';
import { Gallery } from './views/Gallery';
import { ReversePrompt } from './views/ReversePrompt';
import { GadgetChat } from './views/GadgetChat';
import { GadgetEditor } from './views/GadgetEditor';
import { Matting } from './views/Matting';
import { Gadget } from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useEffect, useState } from 'react';

function AppContent() {
  const [currentView, setCurrentView] = useState<'gallery' | 'reverse' | 'matting'>('gallery');
  const { activeGadget, setActiveGadget, gadgets, setGadgets } = useAppContext();
  const [editingGadget, setEditingGadget] = useState<Gadget | null | undefined>(undefined);
  const [healthIssue, setHealthIssue] = useState<string | null>(null);

  useEffect(() => {
    if (!(window as any).electronAPI) return;
    let cancelled = false;
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || data?.ok) return;
        setHealthIssue(data?.issues?.join('；') || '深度图环境或模型配置异常');
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleSaveGadget = (gadget: Gadget) => {
    setGadgets(prev => {
      const idx = prev.findIndex(g => g.id === gadget.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = gadget;
        return next;
      }
      return [...prev, gadget];
    });
    setEditingGadget(undefined);
    setActiveGadget(gadget);
  };

  const handleDeleteGadget = (id: string) => {
    setGadgets(prev => prev.filter(g => g.id !== id));
    setEditingGadget(undefined);
    if (activeGadget?.id === id) {
      setActiveGadget(null);
    }
  };

  const isSidebarOpen = activeGadget !== null || editingGadget !== undefined;

  return (
    <div className="flex h-screen w-full bg-[#FCFBF9] font-serif text-[#333130] overflow-hidden antialiased">
      {healthIssue && (
        <div className="fixed top-3 left-1/2 z-[200] -translate-x-1/2 max-w-[720px] bg-[#1E1E1E] text-white px-4 py-3 text-xs font-sans shadow-xl flex items-start gap-3">
          <span className="flex-1 leading-relaxed">深度图环境检查：{healthIssue}</span>
          <button
            onClick={() => setHealthIssue(null)}
            className="text-white/70 hover:text-white px-1"
            aria-label="关闭提示"
          >
            X
          </button>
        </div>
      )}
      <main className={`flex-1 h-full relative transition-all duration-300 ${isSidebarOpen ? 'mr-[350px]' : ''}`}>
        <div className={currentView === 'gallery' ? 'h-full' : 'hidden'}>
          <Gallery
            onOpenReverse={() => setCurrentView('reverse')}
            onOpenMatting={() => setCurrentView('matting')}
          />
        </div>
        <div className={currentView === 'reverse' ? 'h-full' : 'hidden'}>
          <ReversePrompt onClose={() => setCurrentView('gallery')} />
        </div>
        <div className={currentView === 'matting' ? 'h-full' : 'hidden'}>
          <Matting onClose={() => setCurrentView('gallery')} />
        </div>
      </main>

      <div className={`fixed top-0 right-0 bottom-0 w-[350px] bg-white border-l border-[#E0E0E0] shadow-xl z-50 transition-transform duration-300 transform ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'} flex flex-col`}>
        {(activeGadget !== null && editingGadget === undefined) && (
          <GadgetChat 
            gadget={activeGadget} 
            onClose={() => setActiveGadget(null)} 
            onSwitchGadget={setActiveGadget}
            onEditGadget={() => setEditingGadget(activeGadget)}
            onNewGadget={() => setEditingGadget(null)}
          />
        )}
        {editingGadget !== undefined && (
          <GadgetEditor 
            existingGadget={editingGadget} 
            onSave={handleSaveGadget} 
            onClose={() => setEditingGadget(undefined)} 
            onDelete={handleDeleteGadget}
          />
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ErrorBoundary>
  );
}
