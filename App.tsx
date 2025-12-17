import React, { useState, useEffect } from 'react';
import { LanguageCard } from './components/LanguageCard';
import { LiveTutor } from './components/LiveTutor';
import { LANGUAGES } from './constants';
import { Language } from './types';
import { Icons } from './constants';

function App() {
  const [selectedLanguage, setSelectedLanguage] = useState<Language | null>(null);

  // Initialize from URL parameters for API-like usage
  // Usage: https://your-domain.com/?lang=it
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const langId = params.get('lang');
    
    if (langId) {
      const foundLang = LANGUAGES.find(l => l.id === langId);
      if (foundLang) {
        setSelectedLanguage(foundLang);
      }
    }
  }, []);

  const handleStartSession = (language: Language) => {
    setSelectedLanguage(language);
    // Update URL to reflect state, allowing the user to copy/paste the link
    const newUrl = `${window.location.pathname}?lang=${language.id}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
  };

  const handleExit = () => {
    setSelectedLanguage(null);
    // Clear URL param
    window.history.pushState({}, '', window.location.pathname);
  };

  // 1. ACTIVE AI SESSION VIEW
  if (selectedLanguage) {
    return (
      <div className="w-screen h-screen bg-black overflow-hidden">
        <LiveTutor language={selectedLanguage} onExit={handleExit} />
      </div>
    );
  }

  // 2. LANDING / SELECTION VIEW (When no specific API param is provided)
  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-8 font-sans selection:bg-purple-500 selection:text-white">
      
      <div className="max-w-5xl w-full space-y-12 animate-in fade-in zoom-in duration-500">
        
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-3 bg-white/5 border border-white/10 px-6 py-3 rounded-full mb-4 backdrop-blur-sm">
             <div className="w-6 h-6 bg-purple-600 rounded-lg flex items-center justify-center shadow-[0_0_10px_rgba(168,85,247,0.5)]">
                <Icons.Sparkles />
             </div>
             <span className="font-bold tracking-wide">Orbit AI Server</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-purple-200 to-purple-400">
            Inteligência Artificial
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Selecione uma instância de idioma abaixo para iniciar a API de conversação. 
            Você pode incorporar esta visualização em sua plataforma usando <code>iframe</code>.
          </p>
        </div>

        {/* Selection Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {LANGUAGES.map(lang => (
            <LanguageCard key={lang.id} language={lang} onSelect={handleStartSession} />
          ))}
        </div>

        {/* Integration Hint */}
        <div className="text-center pt-12 border-t border-white/5">
            <p className="text-xs text-gray-500 font-mono">
                API Endpoint Ready: ?lang={"{id}"}
            </p>
        </div>

      </div>
    </div>
  );
}

export default App;