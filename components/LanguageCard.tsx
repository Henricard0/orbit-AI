import React from 'react';
import { Language } from '../types';

interface LanguageCardProps {
  language: Language;
  onSelect: (lang: Language) => void;
}

export const LanguageCard: React.FC<LanguageCardProps> = ({ language, onSelect }) => {
  return (
    <div className="relative h-80 rounded-2xl overflow-hidden group cursor-pointer border border-gray-800 transition-transform hover:scale-[1.02]" onClick={() => onSelect(language)}>
      {/* Background Image */}
      <img 
        src={language.image} 
        alt={language.name} 
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
      />
      
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/90"></div>

      {/* ID Badge */}
      <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-md px-2 py-1 rounded text-xs font-bold text-white uppercase">
        {language.id.toUpperCase()}
      </div>

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col gap-1">
        <h3 className="text-2xl font-bold text-white">{language.name}</h3>
        <p className="text-gray-300 text-sm mb-4">{language.description}</p>
        
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
            {language.courseCount} cursos
          </span>
          
          <button 
            className={`px-4 py-2 rounded-full text-white text-xs font-bold shadow-lg transition-transform active:scale-95 ${language.buttonColor}`}
          >
            Ver Aulas
          </button>
        </div>
      </div>
    </div>
  );
};
