import { AppProvider, useAppContext } from './store';
import { Gallery } from './views/Gallery';
import { ReversePrompt } from './views/ReversePrompt';
import { GadgetChat } from './views/GadgetChat';
import { GadgetEditor } from './views/GadgetEditor';
import { Gadget } from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useState } from 'react';

function AppContent() {
  const [currentView, setCurrentView] = useState<'gallery' | 'reverse'>('gallery');
  const { activeGadget, setActiveGadget, gadgets, setGadgets } = useAppContext();
  const [editingGadget, setEditingGadget] = useState<Gadget | null | undefined>(undefined);

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
      <main className={`flex-1 h-full relative transition-all duration-300 ${isSidebarOpen ? 'mr-[400px]' : ''}`}>
        {currentView === 'gallery' ? (
          <Gallery onOpenReverse={() => setCurrentView('reverse')} />
        ) : (
          <ReversePrompt onClose={() => setCurrentView('gallery')} />
        )}
      </main>

      <div className={`fixed top-0 right-0 bottom-0 w-[400px] bg-white border-l border-[#E0E0E0] shadow-xl z-50 transition-transform duration-300 transform ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'} flex flex-col`}>
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
