/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Camera, BookOpen, Printer, Plus, ChevronLeft, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { Mistake, GeneratedQuestion, ChatMessage } from './types';
import { getMistakes, saveMistake, deleteMistake, updateMistake } from './lib/store';
import { analyzeMistakeImage, generateSimilarQuestions, chatWithSocraticTutor } from './lib/gemini';
import { MarkdownRenderer } from './components/MarkdownRenderer';

type ViewState = 'home' | 'capture' | 'detail' | 'print';

export default function App() {
  const [view, setView] = useState<ViewState>('home');
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [selectedMistake, setSelectedMistake] = useState<Mistake | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  // Chat UI states
  const [activeTabs, setActiveTabs] = useState<Record<string, 'none' | 'explanation' | 'chat'>>({});
  const [chatInputs, setChatInputs] = useState<Record<string, string>>({});
  const [chatLoading, setChatLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setMistakes(getMistakes());
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setLoadingMessage('正在识别错题...');
    
    try {
      // Convert to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
      });
      reader.readAsDataURL(file);
      const base64DataUrl = await base64Promise;
      const base64Data = base64DataUrl.split(',')[1];
      const mimeType = file.type;

      // Analyze image
      const analysis = await analyzeMistakeImage(base64Data, mimeType);
      
      const newMistake: Mistake = {
        id: Date.now().toString(),
        createdAt: Date.now(),
        originalImage: base64DataUrl,
        originalText: analysis.originalText,
        subject: analysis.subject,
        knowledgePoints: analysis.knowledgePoints,
        generatedQuestions: [],
      };

      saveMistake(newMistake);
      setMistakes(getMistakes());
      setSelectedMistake(newMistake);
      setView('detail');
    } catch (error) {
      console.error('Error processing image:', error);
      alert('识别失败，请重试。');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateQuestions = async (mistake: Mistake) => {
    setIsProcessing(true);
    setLoadingMessage('正在生成举一反三题目...');
    try {
      const generated = await generateSimilarQuestions(
        mistake.subject,
        mistake.knowledgePoints,
        mistake.originalText
      );
      
      const updatedMistake = {
        ...mistake,
        generatedQuestions: [
          ...mistake.generatedQuestions,
          ...generated.map(g => ({ ...g, id: Date.now().toString() + Math.random() }))
        ]
      };
      
      updateMistake(updatedMistake);
      setMistakes(getMistakes());
      setSelectedMistake(updatedMistake);
    } catch (error) {
      console.error('Error generating questions:', error);
      alert('生成失败，请重试。');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('确定要删除这道错题吗？')) {
      deleteMistake(id);
      setMistakes(getMistakes());
      if (selectedMistake?.id === id) {
        setView('home');
      }
    }
  };

  const handleStartChat = async (mistake: Mistake, questionId: string) => {
    const qIndex = mistake.generatedQuestions.findIndex(q => q.id === questionId);
    if (qIndex === -1) return;
    const q = mistake.generatedQuestions[qIndex];
    
    if (q.chatHistory && q.chatHistory.length > 0) return;

    const initialMessage: ChatMessage = {
      role: 'model',
      content: '没关系，遇到困难是很正常的！我们一起来看看这道题。你能告诉我，你刚才算到了哪一步，或者觉得哪里最奇怪吗？'
    };

    const updatedMistake = { ...mistake };
    updatedMistake.generatedQuestions[qIndex] = {
      ...q,
      chatHistory: [initialMessage]
    };
    
    updateMistake(updatedMistake);
    setMistakes(getMistakes());
    setSelectedMistake(updatedMistake);
  };

  const handleSendMessage = async (mistake: Mistake, questionId: string) => {
    const userText = chatInputs[questionId]?.trim();
    if (!userText) return;

    const qIndex = mistake.generatedQuestions.findIndex(q => q.id === questionId);
    if (qIndex === -1) return;
    const q = mistake.generatedQuestions[qIndex];

    const newUserMsg: ChatMessage = { role: 'user', content: userText };
    const history = q.chatHistory || [];
    
    // Optimistic update
    let updatedMistake = { ...mistake };
    updatedMistake.generatedQuestions[qIndex] = {
      ...q,
      chatHistory: [...history, newUserMsg]
    };
    updateMistake(updatedMistake);
    setMistakes(getMistakes());
    setSelectedMistake(updatedMistake);
    
    setChatInputs(prev => ({ ...prev, [questionId]: '' }));
    setChatLoading(prev => ({ ...prev, [questionId]: true }));

    setTimeout(() => {
      const container = document.getElementById(`chat-container-${questionId}`);
      if (container) container.scrollTop = container.scrollHeight;
    }, 100);

    try {
      const aiResponseText = await chatWithSocraticTutor(
        q.text,
        q.explanation,
        history,
        userText
      );

      const newModelMsg: ChatMessage = { role: 'model', content: aiResponseText };
      
      updatedMistake = { ...updatedMistake };
      updatedMistake.generatedQuestions[qIndex] = {
        ...updatedMistake.generatedQuestions[qIndex],
        chatHistory: [...(updatedMistake.generatedQuestions[qIndex].chatHistory || []), newModelMsg]
      };
      
      updateMistake(updatedMistake);
      setMistakes(getMistakes());
      setSelectedMistake(updatedMistake);

      setTimeout(() => {
        const container = document.getElementById(`chat-container-${questionId}`);
        if (container) container.scrollTop = container.scrollHeight;
      }, 100);
    } catch (error) {
      console.error('Chat error:', error);
      alert('发送失败，请重试。');
    } finally {
      setChatLoading(prev => ({ ...prev, [questionId]: false }));
    }
  };

  const renderHome = () => (
    <div className="max-w-5xl mx-auto p-6">
      <header className="glass-header flex items-center justify-between mb-8 px-8 py-4">
        <div>
          <h1 className="text-xl font-bold tracking-wider uppercase">SMART LEARN // AI 错题本</h1>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => setView('print')}
            className="flex items-center gap-2 px-4 py-2 glass-btn-outline text-sm"
          >
            <Printer size={18} />
            打印错题
          </button>
          <label className="flex items-center gap-2 px-5 py-2 glass-btn-primary text-sm cursor-pointer">
            <Camera size={18} />
            录入错题
            <input 
              type="file" 
              accept="image/*" 
              capture="environment" 
              className="hidden" 
              onChange={handleImageUpload}
            />
          </label>
        </div>
      </header>

      {mistakes.length === 0 ? (
        <div className="text-center py-24 glass-panel">
          <BookOpen size={48} className="mx-auto text-white/50 mb-4" />
          <h3 className="text-lg font-medium text-white">错题本是空的</h3>
          <p className="text-white/70 mt-2 max-w-sm mx-auto">点击右上角的"录入错题"按钮，拍下你的错题，开始智能学习之旅。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mistakes.map(mistake => (
            <div 
              key={mistake.id} 
              onClick={() => { setSelectedMistake(mistake); setView('detail'); }}
              className="glass-panel p-5 cursor-pointer group flex flex-col h-64 hover:bg-white/10 transition-colors"
            >
              <div className="flex justify-between items-start mb-4">
                <span className="px-2 py-1 glass-tag text-xs">
                  {mistake.subject}
                </span>
                <span className="text-xs text-white/50">
                  {new Date(mistake.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex-1 overflow-hidden relative glass-card p-4">
                <div className="text-sm text-white/90 line-clamp-4">
                  <MarkdownRenderer content={mistake.originalText} />
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[rgba(0,0,0,0.5)] to-transparent"></div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs">
                <div className="flex gap-1 overflow-hidden">
                  {mistake.knowledgePoints.slice(0, 2).map((kp, i) => (
                    <span key={i} className="glass-tag px-2 py-1 truncate max-w-[80px]">
                      {kp}
                    </span>
                  ))}
                  {mistake.knowledgePoints.length > 2 && <span className="text-white/50">...</span>}
                </div>
                <span className="flex items-center gap-1 text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  查看详情 <ChevronRight size={14} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderDetail = () => {
    if (!selectedMistake) return null;
    return (
      <div className="max-w-5xl mx-auto p-6 pb-24 h-screen flex flex-col">
        <header className="glass-header flex items-center justify-between mb-6 px-8 py-4 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setView('home')}
              className="flex items-center gap-2 text-white/70 hover:text-white transition-colors text-sm font-medium"
            >
              <ChevronLeft size={18} />
              返回
            </button>
            <div className="h-4 w-px bg-white/20"></div>
            <h1 className="text-lg font-bold tracking-wider uppercase">错题详情</h1>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => handleDelete(selectedMistake.id)}
              className="p-2 text-white/70 hover:text-[#ff7e5f] transition-colors"
              title="删除错题"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
          {/* Left Panel: Original Question */}
          <section className="glass-panel flex flex-col min-h-0">
            <div className="text-sm uppercase tracking-wider text-white/70 mb-4 flex justify-between items-center shrink-0">
              <span>当前录入题目</span>
              <span className="glass-tag px-2 py-1 text-xs">
                {selectedMistake.subject}
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              {selectedMistake.originalImage && (
                <div className="w-full h-48 bg-[#2a2a2a] rounded-xl flex items-center justify-center border-2 border-dashed border-white/20 mb-4 overflow-hidden shrink-0">
                  <img src={selectedMistake.originalImage} alt="Original Question" className="max-h-full object-contain" />
                </div>
              )}
              
              <div className="glass-card p-5 mb-4">
                <div className="text-white/90">
                  <MarkdownRenderer content={selectedMistake.originalText} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {selectedMistake.knowledgePoints.map((kp, i) => (
                  <span key={i} className="glass-tag px-2 py-1 text-xs">
                    {kp}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* Right Panel: AI Generation */}
          <section className="glass-panel flex flex-col min-h-0">
            <div className="text-sm uppercase tracking-wider text-white/70 mb-4 flex justify-between items-center shrink-0">
              <span>AI 举一反三</span>
              <span className="glass-badge px-2 py-1 text-[10px]">智能推荐</span>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {selectedMistake.generatedQuestions.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-white/50 py-12">
                  <p className="mb-4 text-sm">还没有生成相似题目</p>
                  <button 
                    onClick={() => handleGenerateQuestions(selectedMistake)}
                    disabled={isProcessing}
                    className="flex items-center gap-2 px-6 py-3 glass-btn-primary text-sm disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    生成相似题目
                  </button>
                </div>
              ) : (
                <>
                  {selectedMistake.generatedQuestions.map((q, index) => (
                    <div key={q.id} className="glass-card-light p-5 mb-4">
                      <p className="text-xs text-[#43e97b] mb-3">已生成相似题 {index + 1}/{selectedMistake.generatedQuestions.length}</p>
                      
                      <div className="text-white/90 mb-4">
                        <MarkdownRenderer content={q.text} />
                      </div>

                      <div className="flex gap-3 mt-4">
                        <button 
                          onClick={() => setActiveTabs(prev => ({ ...prev, [q.id]: prev[q.id] === 'explanation' ? 'none' : 'explanation' }))}
                          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTabs[q.id] === 'explanation' ? 'glass-btn-primary' : 'glass-btn-outline'}`}
                        >
                          查看解析
                        </button>
                        <button 
                          onClick={() => {
                            setActiveTabs(prev => ({ ...prev, [q.id]: prev[q.id] === 'chat' ? 'none' : 'chat' }));
                            if (!q.chatHistory || q.chatHistory.length === 0) {
                              handleStartChat(selectedMistake, q.id);
                            }
                          }}
                          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTabs[q.id] === 'chat' ? 'bg-[#ff7e5f] text-white border-transparent' : 'glass-btn-outline border-[#ff7e5f] text-[#ff7e5f]'}`}
                        >
                          我做错了，求助老师
                        </button>
                      </div>
                      
                      {activeTabs[q.id] === 'explanation' && (
                        <div className="space-y-3 mt-4 animate-in fade-in slide-in-from-top-2">
                          <div className="analysis-box p-4">
                            <h4 className="text-sm text-[#ff7e5f] mb-2 font-medium">老师提醒 (易错点)</h4>
                            <div className="text-[13px] text-[#eee] leading-relaxed">
                              <MarkdownRenderer content={q.commonMistakes} />
                            </div>
                          </div>
                          
                          <div className="explanation-box p-4">
                            <h4 className="text-sm text-[#43e97b] mb-2 font-medium">详细解析</h4>
                            <div className="text-[13px] text-[#eee] leading-relaxed">
                              <MarkdownRenderer content={q.explanation} />
                            </div>
                          </div>
                        </div>
                      )}

                      {activeTabs[q.id] === 'chat' && (
                        <div className="mt-4 glass-card p-4 animate-in fade-in slide-in-from-top-2 flex flex-col h-[400px] border border-white/10">
                          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 mb-4 pr-2" id={`chat-container-${q.id}`}>
                            {q.chatHistory?.map((msg, i) => (
                              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-3 rounded-2xl text-[13px] leading-relaxed ${msg.role === 'user' ? 'bg-[#ff7e5f] text-white rounded-tr-sm' : 'glass-panel text-white/90 rounded-tl-sm'}`}>
                                  <MarkdownRenderer content={msg.content} />
                                </div>
                              </div>
                            ))}
                            {chatLoading[q.id] && (
                              <div className="flex justify-start">
                                <div className="glass-panel p-3 rounded-2xl rounded-tl-sm text-white/70 text-[13px] flex items-center gap-2">
                                  <Loader2 size={14} className="animate-spin" /> 老师正在思考...
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <input 
                              type="text" 
                              value={chatInputs[q.id] || ''}
                              onChange={e => setChatInputs(prev => ({ ...prev, [q.id]: e.target.value }))}
                              onKeyDown={e => e.key === 'Enter' && handleSendMessage(selectedMistake, q.id)}
                              placeholder="告诉老师你哪里不会..."
                              className="flex-1 bg-black/20 border border-white/20 rounded-xl px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#ff7e5f] transition-colors"
                            />
                            <button 
                              onClick={() => handleSendMessage(selectedMistake, q.id)}
                              disabled={chatLoading[q.id] || !chatInputs[q.id]?.trim()}
                              className="px-4 py-2 bg-[#ff7e5f] text-white rounded-xl text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
                            >
                              发送
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  <button 
                    onClick={() => handleGenerateQuestions(selectedMistake)}
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 glass-btn-outline text-sm mt-4 disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    继续生成
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  };

  const renderPrint = () => {
    return (
      <div className="max-w-4xl mx-auto p-6 print:p-0 print:max-w-none">
        <div className="no-print mb-8 flex justify-between items-center glass-header px-8 py-4">
          <button 
            onClick={() => setView('home')}
            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors text-sm font-medium"
          >
            <ChevronLeft size={18} />
            返回
          </button>
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 px-6 py-2 glass-btn-primary text-sm"
          >
            <Printer size={18} />
            开始打印
          </button>
        </div>

        <div className="print-content glass-panel print:bg-transparent p-8 print:p-0 print:border-none print:shadow-none">
          <h1 className="text-2xl font-bold text-center mb-8 pb-4 border-b border-white/20 print:border-black/20 text-white print:text-black">错题本复习资料</h1>
          
          <div className="space-y-12">
            {mistakes.map((mistake, i) => (
              <div key={mistake.id} className="break-inside-avoid">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-lg font-bold text-white print:text-black">错题 {i + 1}</h2>
                  <span className="text-sm text-white/50 print:text-gray-500">({mistake.subject})</span>
                </div>
                <div className="mb-6 pl-4 border-l-2 border-white/20 print:border-gray-200 text-white/90 print:text-black">
                  <MarkdownRenderer content={mistake.originalText} />
                </div>
                
                {mistake.generatedQuestions.length > 0 && (
                  <div className="ml-4 mt-6">
                    <h3 className="font-bold mb-3 text-white/80 print:text-gray-700">举一反三练习：</h3>
                    <div className="space-y-6">
                      {mistake.generatedQuestions.map((q, j) => (
                        <div key={q.id} className="break-inside-avoid glass-card-light print:bg-transparent p-4 print:p-0">
                          <div className="font-medium mb-2 text-white print:text-black">{i + 1}.{j + 1}</div>
                          <div className="text-white/90 print:text-black">
                            <MarkdownRenderer content={q.text} />
                          </div>
                          
                          {/* Add some blank space for writing in print view */}
                          <div className="h-32 print-only border border-dashed border-gray-300 mt-4 rounded"></div>
                          
                          <div className="no-print mt-4 pt-4 border-t border-white/10">
                            <div className="text-sm font-bold text-[#43e97b] mb-1">解析：</div>
                            <div className="text-sm text-white/80">
                              <MarkdownRenderer content={q.explanation} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen font-sans">
      {isProcessing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center flex-col">
          <Loader2 size={48} className="text-white animate-spin mb-4" />
          <p className="text-lg font-medium text-white">{loadingMessage}</p>
        </div>
      )}
      
      {view === 'home' && renderHome()}
      {view === 'detail' && renderDetail()}
      {view === 'print' && renderPrint()}
    </div>
  );
}

// Simple icon component since we missed importing ChevronRight
const ChevronRight = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m9 18 6-6-6-6"/>
  </svg>
);
