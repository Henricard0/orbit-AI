import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Chat, GenerateContentResponse } from '@google/genai';
import { Language } from '../types';
import { Icons } from '../constants';
import { base64ToUint8Array, decodeAudioData, float32ToB64PCM } from '../services/audioUtils';

interface LiveTutorProps {
  language: Language;
  onExit: () => void;
}

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  isCorrection?: boolean;
}

type Mode = 'chat' | 'voice';

export const LiveTutor: React.FC<LiveTutorProps> = ({ language, onExit }) => {
  const [mode, setMode] = useState<Mode>('chat');

  // --- CHAT STATE ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // --- VOICE STATE ---
  const [isConnected, setIsConnected] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string>('Pronto para conectar');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  
  // Voice Transcript State
  const [voiceMessages, setVoiceMessages] = useState<Message[]>([]);
  const [currentLiveUserText, setCurrentLiveUserText] = useState('');
  const [currentLiveModelText, setCurrentLiveModelText] = useState('');
  const voiceScrollRef = useRef<HTMLDivElement>(null);

  // --- REFS ---
  const chatSessionRef = useRef<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Audio Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const liveSessionRef = useRef<Promise<any> | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isConnectingRef = useRef(false);

  // AI Client - Stable instance
  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.API_KEY }), []);

  // Derived State
  const isAiSpeaking = voiceStatus === 'Falando...';

  // Auto-scroll chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    voiceScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, mode, voiceMessages, currentLiveUserText, currentLiveModelText]);

  // =========================================================
  // MODE 1: CHAT (TEXT)
  // =========================================================

  const initChat = useCallback(() => {
    const systemPrompt = `
      Você é um professor de idiomas nativo de ${language.nativeName}.
      O aluno fala Português e está aprendendo ${language.nativeName}.
      
      SEUS OBJETIVOS:
      1. Converse naturalmente em ${language.nativeName}.
      2. Use Português para explicar conceitos difíceis ou correções se o aluno estiver confuso.
      3. Se o aluno escrever em Português, responda misturando os dois idiomas para ajudar na compreensão.
      4. Corrija erros gramaticais gentilmente.
    `;

    chatSessionRef.current = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: { systemInstruction: systemPrompt },
    });

    setMessages([{
      id: 'init',
      role: 'model',
      text: `Olá! Sou seu professor de ${language.nativeName}. Vamos praticar a escrita?`
    }]);
  }, [language, ai]);

  // Initialize chat when entering chat mode
  useEffect(() => {
    if (mode === 'chat' && messages.length === 0) {
      initChat();
    }
  }, [mode, initChat, messages.length]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || !chatSessionRef.current) return;

    const userText = inputText;
    setInputText(''); 
    setIsTyping(true);

    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: userText }]);

    try {
      const result: GenerateContentResponse = await chatSessionRef.current.sendMessage({ message: userText });
      const responseText = result.text;
      
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: 'model', 
        text: responseText || "Não entendi, pode repetir?" 
      }]);
    } catch (error) {
      console.error("Chat Error", error);
      setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        role: 'model', 
        text: "Tive um problema de conexão. Tente novamente." 
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // =========================================================
  // MODE 2: VOICE (LIVE API)
  // =========================================================

  const ensureAudioContexts = async () => {
    if (!inputAudioContextRef.current) {
        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    }
    if (!outputAudioContextRef.current) {
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (inputAudioContextRef.current.state === 'suspended') {
        await inputAudioContextRef.current.resume();
    }
    if (outputAudioContextRef.current.state === 'suspended') {
        await outputAudioContextRef.current.resume();
    }
  };

  const connectToLive = async () => {
    if (isConnectingRef.current || isConnected) return;
    
    try {
        await ensureAudioContexts();
    } catch (e) {
        setVoiceError("Permissão de áudio necessária.");
        return;
    }

    isConnectingRef.current = true;
    setVoiceError(null);
    setVoiceStatus('Conectando...');

    try {
        const sessionPromise = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: language.voiceName } },
                },
                // INSTRUCTION FOR BILINGUAL SUPPORT
                systemInstruction: `
                  You are a bilingual language tutor. 
                  Target Language: ${language.nativeName}.
                  User Language: Portuguese.
                  
                  Role: Engage the user in conversation to teach ${language.nativeName}.
                  Behavior:
                  1. Speak primarily in ${language.nativeName} if the user is advanced.
                  2. If the user speaks Portuguese, mix ${language.nativeName} and Portuguese to help them understand. 
                  3. If the user makes a mistake, provide the correction in Portuguese, then say the correct phrase in ${language.nativeName} for them to repeat.
                  4. Keep responses concise and conversational.
                `,
                // Enable transcription for both sides
                inputAudioTranscription: {}, 
                outputAudioTranscription: {}, 
            },
            callbacks: {
                onopen: () => {
                    setIsConnected(true);
                    setVoiceStatus('Conectado. Pode falar!');
                    isConnectingRef.current = false;
                    // Initial prompt in history
                    setVoiceMessages([{
                        id: 'start', 
                        role: 'model', 
                        text: `(Conectado) Olá! Eu sou sua tutora. Podemos falar em ${language.nativeName} ou Português.`
                    }]);
                },
                onmessage: async (message: LiveServerMessage) => {
                    // Audio Playback
                    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    if (base64Audio && outputAudioContextRef.current) {
                        const ctx = outputAudioContextRef.current;
                        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                        
                        const audioBuffer = await decodeAudioData(base64ToUint8Array(base64Audio), ctx, 24000);
                        const source = ctx.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(ctx.destination);
                        
                        source.addEventListener('ended', () => sourcesRef.current.delete(source));
                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += audioBuffer.duration;
                        sourcesRef.current.add(source);
                    }

                    // Handling Transcription
                    const inTrans = message.serverContent?.inputTranscription?.text;
                    if (inTrans) {
                        setCurrentLiveUserText(prev => prev + inTrans);
                    }

                    const outTrans = message.serverContent?.outputTranscription?.text;
                    if (outTrans) {
                        setCurrentLiveModelText(prev => prev + outTrans);
                        setVoiceStatus("Falando...");
                    }

                    // Turn Complete: Commit text to history
                    if (message.serverContent?.turnComplete) {
                        setVoiceMessages(prev => {
                            const newMsgs = [...prev];
                            // If we have accumulated user text, add it
                            if (currentLiveUserText.trim()) {
                                newMsgs.push({ id: Date.now() + '_u', role: 'user', text: currentLiveUserText });
                                setCurrentLiveUserText('');
                            }
                            // If we have accumulated model text, add it
                            if (currentLiveModelText.trim()) {
                                newMsgs.push({ id: Date.now() + '_m', role: 'model', text: currentLiveModelText });
                                setCurrentLiveModelText('');
                            }
                            return newMsgs;
                        });
                        setVoiceStatus('Sua vez...');
                    }

                    if (message.serverContent?.interrupted) {
                        sourcesRef.current.forEach(s => s.stop());
                        sourcesRef.current.clear();
                        nextStartTimeRef.current = 0;
                        setVoiceStatus('Interrompido');
                    }
                },
                onclose: () => {
                    setIsConnected(false);
                    setVoiceStatus('Desconectado');
                    setIsMicOn(false);
                    isConnectingRef.current = false;
                },
                onerror: (err) => {
                    console.error("Live API Error:", err);
                    setVoiceError("Erro na conexão");
                    setIsConnected(false);
                    isConnectingRef.current = false;
                }
            }
        });
        liveSessionRef.current = sessionPromise;
    } catch (e) {
        console.error("Connection Failed:", e);
        setVoiceError("Falha ao iniciar servidor");
        isConnectingRef.current = false;
    }
  };

  const toggleMic = async () => {
    if (!isConnected) {
        await connectToLive();
        return;
    }

    await ensureAudioContexts();

    if (isMicOn) {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        setIsMicOn(false);
        setVoiceStatus("Microfone pausado");
    } else {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            
            if (!inputAudioContextRef.current) return;

            const source = inputAudioContextRef.current.createMediaStreamSource(stream);
            const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const base64PCM = float32ToB64PCM(inputData);
                
                if (liveSessionRef.current) {
                    liveSessionRef.current.then((session: any) => {
                        session.sendRealtimeInput({
                            media: { mimeType: 'audio/pcm;rate=16000', data: base64PCM }
                        });
                    });
                }
            };

            source.connect(processor);
            processor.connect(inputAudioContextRef.current.destination);
            scriptProcessorRef.current = processor;
            setIsMicOn(true);
            setVoiceStatus("Ouvindo...");
        } catch (err) {
            console.error(err);
            setVoiceError("Sem acesso ao microfone");
        }
    }
  };

  const disconnectVoice = () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (inputAudioContextRef.current) inputAudioContextRef.current.close();
      if (outputAudioContextRef.current) outputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
      outputAudioContextRef.current = null;
      setIsConnected(false);
      setIsMicOn(false);
      setVoiceMessages([]);
      setCurrentLiveUserText('');
      setCurrentLiveModelText('');
  };

  useEffect(() => {
    return () => {
       if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
       if (inputAudioContextRef.current) inputAudioContextRef.current.close();
       if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    };
  }, []);

  const switchMode = (newMode: Mode) => {
      if (newMode === 'chat') {
          disconnectVoice();
      }
      setMode(newMode);
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] rounded-none border-0 overflow-hidden relative">
      
      {/* --- HEADER --- */}
      <div className={`h-20 flex items-center justify-between px-6 border-b border-white/5 transition-colors duration-500 z-30 relative bg-[#121212]`}>
          <div className="flex items-center gap-4">
              <button onClick={onExit} className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white">
                  <Icons.ArrowLeft />
              </button>
              <div className="relative">
                  <img src={language.image} className="w-10 h-10 rounded-full object-cover border-2 border-white/20" alt={language.name} />
                  <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#121212] ${isConnected || mode === 'chat' ? 'bg-green-500' : 'bg-gray-500'}`}></div>
              </div>
              <div>
                  <h3 className="text-white font-bold">{language.name} Tutor</h3>
                  <p className="text-xs text-white/60 capitalize">{mode === 'chat' ? 'Conversa por Texto' : 'Conversa por Voz'}</p>
              </div>
          </div>
          
          {/* Mode Toggle */}
          <div className="flex bg-black/40 rounded-full p-1 backdrop-blur-sm border border-white/10">
             <button 
                onClick={() => switchMode('chat')}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${mode === 'chat' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
             >
                Escrever
             </button>
             <button 
                onClick={() => switchMode('voice')}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${mode === 'voice' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
             >
                Falar
                {mode === 'chat' && <div className="scale-75"><Icons.Mic /></div>} 
             </button>
          </div>
      </div>

      {/* --- BODY --- */}
      <div className="flex-1 relative overflow-hidden flex flex-col z-10 bg-[#0a0a0a]">
          
          {/* VIEW: CHAT (TEXT MODE) */}
          <div className={`absolute inset-0 flex flex-col transition-all duration-500 z-20 ${mode === 'chat' ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'}`}>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {messages.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-2xl px-5 py-3 text-sm leading-relaxed shadow-lg ${
                              msg.role === 'user' 
                              ? 'bg-white text-black rounded-tr-none' 
                              : 'bg-[#1a1a1a] text-gray-200 border border-white/10 rounded-tl-none'
                          }`}>
                              {msg.text}
                          </div>
                      </div>
                  ))}
                  {isTyping && (
                      <div className="flex justify-start">
                          <div className="bg-[#1a1a1a] rounded-2xl rounded-tl-none px-4 py-3 flex gap-1 border border-white/10">
                              <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"></span>
                              <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce delay-100"></span>
                              <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce delay-200"></span>
                          </div>
                      </div>
                  )}
                  <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-4 border-t border-white/5 bg-[#0a0a0a] pb-6">
                  <div className="relative max-w-4xl mx-auto">
                      <input 
                          type="text" 
                          value={inputText}
                          onChange={(e) => setInputText(e.target.value)}
                          onKeyDown={handleKeyPress}
                          disabled={isTyping}
                          placeholder={`Escreva algo em ${language.name}...`}
                          className="w-full bg-[#151515] border border-white/10 rounded-xl pl-5 pr-12 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-50"
                      />
                      <button 
                        onClick={handleSendMessage}
                        disabled={!inputText.trim() || isTyping}
                        className="absolute right-2 top-2 bottom-2 aspect-square bg-white text-black rounded-lg flex items-center justify-center hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                         <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                      </button>
                  </div>
              </div>
          </div>

          {/* VIEW: VOICE (SPLIT SCREEN) */}
          <div className={`absolute inset-0 flex flex-row transition-all duration-500 bg-black/50 backdrop-blur-3xl z-20 ${mode === 'voice' ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'}`}>
              
              {/* LEFT COLUMN: TRANSCRIPT */}
              <div className="w-1/2 md:w-5/12 border-r border-white/5 flex flex-col bg-[#0f0f0f]">
                  <div className="p-4 border-b border-white/5 flex items-center justify-between">
                      <h4 className="text-white text-sm font-bold uppercase tracking-wider">Transcrição ao Vivo</h4>
                      <div className={`w-2 h-2 rounded-full ${isAiSpeaking ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {/* Historic Messages */}
                      {voiceMessages.map((msg) => (
                          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                              <span className="text-[10px] text-gray-500 mb-1 px-1">{msg.role === 'user' ? 'Você' : language.name}</span>
                              <div className={`max-w-[90%] rounded-xl px-4 py-2 text-sm leading-relaxed ${
                                  msg.role === 'user' 
                                  ? 'bg-purple-900/40 text-white border border-purple-500/20 rounded-tr-none' 
                                  : 'bg-[#1a1a1a] text-gray-300 border border-white/10 rounded-tl-none'
                              }`}>
                                  {msg.text}
                              </div>
                          </div>
                      ))}

                      {/* Current Live Pending Text - INTERLEAVED (No separate block) */}
                      {currentLiveUserText && (
                          <div className="flex flex-col items-end">
                              <span className="text-[10px] text-gray-500 mb-1 px-1">Você (falando...)</span>
                              <div className="max-w-[90%] rounded-xl px-4 py-2 text-sm text-white bg-purple-900/20 border border-purple-500/10 rounded-tr-none animate-pulse">
                                  {currentLiveUserText}
                              </div>
                          </div>
                      )}
                      {currentLiveModelText && (
                          <div className="flex flex-col items-start">
                              <span className="text-[10px] text-gray-500 mb-1 px-1">{language.name} (falando...)</span>
                              <div className="max-w-[90%] rounded-xl px-4 py-2 text-sm text-gray-300 bg-[#1a1a1a]/50 border border-white/5 rounded-tl-none animate-pulse">
                                  {currentLiveModelText}
                              </div>
                          </div>
                      )}
                      
                      <div ref={voiceScrollRef} />
                  </div>
              </div>

              {/* RIGHT COLUMN: AVATAR & CONTROLS */}
              <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
                 <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-md px-6">
                     
                     {/* Avatar Visualizer */}
                     <div className="relative cursor-pointer" onClick={toggleMic}>
                         <div className={`absolute inset-0 rounded-full border border-white/10 scale-150 ${isMicOn ? 'animate-ping opacity-20' : 'opacity-0'}`}></div>
                         <div className={`absolute inset-0 rounded-full border border-white/5 scale-[2] ${isMicOn ? 'animate-pulse opacity-10' : 'opacity-0'}`}></div>
                         
                         <div className={`w-32 h-32 md:w-48 md:h-48 rounded-full flex items-center justify-center relative overflow-hidden transition-all duration-500 border-4 ${
                             isAiSpeaking 
                                ? 'border-blue-500 shadow-[0_0_50px_rgba(59,130,246,0.6)]' 
                                : isMicOn 
                                    ? 'border-green-500 shadow-[0_0_50px_rgba(34,197,94,0.4)]' 
                                    : isConnected 
                                        ? 'border-purple-500' 
                                        : 'border-gray-700'
                         }`}>
                             <img src={language.image} className="absolute inset-0 w-full h-full object-cover opacity-60 hover:opacity-100 transition-opacity" />
                             <div className={`absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80`}></div>
                             
                             <div className="relative z-10 scale-125">
                                {isConnected ? (
                                    isAiSpeaking ? (
                                        <div className="flex flex-col items-center animate-pulse text-blue-100">
                                            <Icons.Volume />
                                        </div>
                                    ) : isMicOn ? (
                                        <div className="flex gap-1.5 items-end h-10">
                                            <div className="w-2 bg-white animate-[bounce_1s_infinite] h-6"></div>
                                            <div className="w-2 bg-white animate-[bounce_1.2s_infinite] h-10"></div>
                                            <div className="w-2 bg-white animate-[bounce_0.8s_infinite] h-7"></div>
                                        </div>
                                    ) : (
                                        <div className="bg-black/50 p-4 rounded-full backdrop-blur-md">
                                            <Icons.MicOff />
                                        </div>
                                    )
                                ) : (
                                    <div className="text-xs font-bold uppercase tracking-widest text-white">Iniciar</div>
                                )}
                             </div>
                         </div>
                     </div>

                     {/* Status Text */}
                     <div className="text-center h-20 flex flex-col justify-center max-w-sm">
                        {voiceError ? (
                            <span className="text-red-400 bg-red-900/20 px-4 py-2 rounded-lg text-sm">{voiceError}</span>
                        ) : (
                            <>
                                <p className="text-white text-xl font-medium leading-relaxed transition-all">
                                    {voiceStatus}
                                </p>
                            </>
                        )}
                     </div>

                     {/* Main Button */}
                     <button 
                        onClick={toggleMic}
                        className={`h-14 px-8 rounded-full flex items-center gap-3 text-sm font-bold uppercase tracking-wide transition-all duration-300 shadow-xl ${
                            !isConnected
                            ? 'bg-purple-600 text-white hover:bg-purple-500'
                            : isAiSpeaking
                                ? 'bg-blue-600 text-white animate-pulse'
                                : isMicOn 
                                    ? 'bg-red-500 text-white hover:bg-red-600' 
                                    : 'bg-white text-black hover:bg-gray-200'
                        }`}
                     >
                        {isAiSpeaking ? <Icons.Volume /> : isMicOn ? <Icons.MicOff /> : <Icons.Mic />}
                        {isAiSpeaking ? 'Ouvindo IA...' : isMicOn ? 'Silenciar' : isConnected ? 'Falar' : 'Conectar Voz'}
                     </button>
                  </div>
                  
                  {/* Background Decoration */}
                  <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-${language.color.replace('bg-', '')} opacity-10 blur-[100px] rounded-full pointer-events-none`}></div>
              </div>
          </div>

      </div>
    </div>
  );
};