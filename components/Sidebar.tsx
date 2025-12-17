import React from 'react';
import { NavItem } from '../types';
import { MENU_ITEMS, Icons } from '../constants';

export const Sidebar: React.FC = () => {
  return (
    <div className="w-64 h-screen bg-orbit-sidebar flex flex-col border-r border-gray-900 sticky top-0">
      <div className="p-6">
        
        {/* Branding Area */}
        <div className="flex items-center gap-3 text-white mb-8">
            <div className="w-8 h-8 bg-orbit-primary rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.5)]">
                <Icons.Sparkles />
            </div>
            <div className="flex flex-col">
                <span className="font-bold text-lg leading-tight tracking-tight">Orbit AI</span>
                <span className="text-[10px] text-gray-400 uppercase tracking-widest">Language</span>
            </div>
        </div>

        <button className="w-full bg-orbit-accent/10 border border-orbit-accent/20 text-orbit-accent hover:bg-orbit-accent hover:text-white transition-all text-xs font-bold px-4 py-3 rounded-xl flex items-center justify-center gap-2 mb-2">
          <span className="w-1.5 h-1.5 bg-current rounded-full animate-pulse"></span>
          Admin Panel
        </button>
      </div>

      <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
        {MENU_ITEMS.map((item) => (
          <div
            key={item.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all group ${
              item.isActive
                ? 'bg-white/5 text-white border-l-2 border-orbit-primary'
                : 'text-gray-400 hover:bg-[#151515] hover:text-white'
            }`}
          >
            <div className={`transition-colors ${item.isActive ? 'text-orbit-primary' : 'group-hover:text-white'}`}>
                {item.icon}
            </div>
            <span className="text-sm font-medium">{item.label}</span>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-900">
        <div className="flex items-center gap-3 text-gray-400 hover:text-white cursor-pointer px-4 py-2 transition-colors rounded-lg hover:bg-white/5">
          <Icons.LogOut />
          <span className="text-sm">Sair</span>
        </div>
        <div className="mt-4 flex items-center gap-2 px-4">
           <div className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.5)]"></div>
           <span className="text-xs text-gray-500 font-medium">Tema Claro</span>
        </div>
      </div>
    </div>
  );
};