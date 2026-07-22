import React from 'react';
import { Briefcase } from 'lucide-react';
import { useAppContext } from '../store';

export function GadgetMenu() {
  const { gadgets, activeGadget, setActiveGadget } = useAppContext();

  return (
    <button 
      onClick={() => {
        if (activeGadget) {
          setActiveGadget(null);
        } else {
          setActiveGadget(gadgets[0] || null);
        }
      }}
      title="智能工具"
      className={`flex items-center justify-center px-2.5 py-1.5 text-xs font-sans font-medium transition-all ${activeGadget ? 'bg-[#EAEAEA] text-[#1E1E1E]' : 'bg-transparent text-[#7A7A7A] hover:text-[#1E1E1E]'}`}
    >
      <Briefcase className="w-4 h-4 mr-1.5" /> 智能工具
    </button>
  );
}
