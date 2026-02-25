import React, { useState, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { UploadCloud, FileText, Loader2, Copy, Check, RefreshCw, Download, AlertCircle, Key, X, Settings } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>();
  const [isConverting, setIsConverting] = useState(false);
  const [markdown, setMarkdown] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'markdown'>('preview');
  const [error, setError] = useState<string | null>(null);
  const [customApiKey, setCustomApiKey] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-pro');
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [tempKey, setTempKey] = useState('');
  const [tempModel, setTempModel] = useState('gemini-2.5-pro');
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [keyTestStatus, setKeyTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getApiKey = () => {
    if (customApiKey) return customApiKey;
    try {
      // @ts-ignore
      if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) {
        // @ts-ignore
        return import.meta.env.VITE_GEMINI_API_KEY;
      }
    } catch (e) {}
    try {
      if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) {
        return process.env.GEMINI_API_KEY;
      }
    } catch (e) {}
    return '';
  };

  const saveSettings = async () => {
    setSelectedModel(tempModel);

    if (!tempKey.trim()) {
      setCustomApiKey('');
      setIsKeyModalOpen(false);
      return;
    }

    if (tempKey.trim() === customApiKey) {
      setIsKeyModalOpen(false);
      return;
    }
    
    setIsTestingKey(true);
    setKeyTestStatus('idle');
    
    try {
      const ai = new GoogleGenAI({ apiKey: tempKey.trim() });
      await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'Hello',
      });
      
      setKeyTestStatus('success');
      setCustomApiKey(tempKey.trim());
      setTimeout(() => {
        setIsKeyModalOpen(false);
        setKeyTestStatus('idle');
      }, 1500);
    } catch (e) {
      console.error("API Key test failed:", e);
      setKeyTestStatus('error');
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 5000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type === 'application/pdf') {
        setFile(selectedFile);
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        setPdfUrl(URL.createObjectURL(selectedFile));
        setMarkdown(''); // Reset previous result
        setActiveTab('preview');
        setError(null);
      } else {
        handleError('Please select a valid PDF file.');
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf') {
        setFile(droppedFile);
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        setPdfUrl(URL.createObjectURL(droppedFile));
        setMarkdown('');
        setActiveTab('preview');
        setError(null);
      } else {
        handleError('Please drop a valid PDF file.');
      }
    }
  };

  const convertPdfToMarkdown = async () => {
    if (!file) return;

    setIsConverting(true);
    setMarkdown('');
    setError(null);

    try {
      const apiKey = getApiKey();
      if (!apiKey) {
        handleError('API Key is missing. Please set your Gemini API Key first.');
        setIsConverting(false);
        return;
      }
      
      const ai = new GoogleGenAI({ apiKey });
      
      // Read file as base64
      const reader = new FileReader();
      reader.readAsDataURL(file);
      
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        
        try {
          const response = await ai.models.generateContentStream({
            model: selectedModel,
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      data: base64Data,
                      mimeType: 'application/pdf',
                    },
                  },
                  {
                    text: 'Convert this PDF document to clean Markdown. Preserve the structure, headings, lists, tables, and text formatting as accurately as possible. \n\nCRITICAL RULES:\n1. Output ONLY pure Markdown content.\n2. Do NOT use any HTML tags (like <div>, <br>, <span>, etc.).\n3. Do NOT use HTML entities (like &nbsp;). Use standard spaces or markdown formatting instead.\n4. Do NOT unnecessarily escape characters (e.g., use --- instead of \\-\\-\\-, use standard text instead of escaping hyphens).\n5. For document headers (like "Số: 54 /BC-CNTD" and "Hà Nội, ngày..."), format them cleanly on separate lines or using standard markdown tables/columns if they are side-by-side, without using HTML for alignment.\n6. Do not include any conversational filler or markdown code block wrappers (like ```markdown).',
                  },
                ],
              },
            ],
            config: {
              systemInstruction: 'You are an expert document converter. Your task is to accurately convert PDF documents into clean, well-structured, pure Markdown. Maintain all headings, lists, tables, and emphasis. Never use HTML tags or HTML entities in the output. Keep the formatting clean and readable.',
            }
          });

          let fullMarkdown = '';
          for await (const chunk of response) {
            if (chunk.text) {
              fullMarkdown += chunk.text;
              setMarkdown(fullMarkdown);
            }
          }
        } catch (error) {
          console.error('Error generating content:', error);
          handleError('An error occurred during conversion. Please check the console for details.');
        } finally {
          setIsConverting(false);
        }
      };
      
      reader.onerror = () => {
        console.error('Error reading file');
        handleError('Failed to read the PDF file.');
        setIsConverting(false);
      };

    } catch (error) {
      console.error('Error initializing Gemini:', error);
      handleError('Failed to initialize Gemini API.');
      setIsConverting(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadMarkdown = () => {
    if (!file || !markdown) return;
    
    // Create a blob with the markdown content
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    
    // Get original filename without extension and add .md
    const originalName = file.name;
    const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
    const fileName = `${baseName}.md`;
    
    // Create a temporary link and trigger download
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setFile(null);
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
    setNumPages(undefined);
    setMarkdown('');
    setActiveTab('preview');
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-zinc-900 font-sans selection:bg-indigo-100 selection:text-indigo-900 flex flex-col">
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl flex items-center justify-center text-white shadow-md">
              <FileText size={20} strokeWidth={2.5} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">PDF to Markdown</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setTempKey(customApiKey);
                setTempModel(selectedModel);
                setKeyTestStatus('idle');
                setIsKeyModalOpen(true);
              }}
              className={`text-sm font-medium flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
                customApiKey 
                  ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' 
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
              }`}
              title="Settings & API Key"
            >
              <Settings size={16} />
              Settings
            </button>
            {file && (
              <button
                onClick={reset}
                className="text-sm font-medium text-zinc-500 hover:text-zinc-900 flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-zinc-100 transition-colors"
              >
                <RefreshCw size={16} />
                Start Over
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col">
        {isKeyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
                  <Settings size={18} className="text-indigo-600" />
                  Settings
                </h3>
                <button 
                  onClick={() => setIsKeyModalOpen(false)}
                  className="text-zinc-400 hover:text-zinc-600 transition-colors p-1 rounded-md hover:bg-zinc-100"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6">
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-zinc-900 mb-2">AI Model</label>
                    <select
                      value={tempModel}
                      onChange={(e) => setTempModel(e.target.value)}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm text-zinc-900"
                    >
                      <option value="gemini-2.5-pro">Gemini 2.5 Pro (Stable)</option>
                      <option value="gemini-3-pro-preview">Gemini 3.0 Pro Preview</option>
                      <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
                    </select>
                    <p className="mt-2 text-xs text-zinc-500">
                      Select the model to use for PDF conversion. Preview models may require specific API Key access.
                    </p>
                  </div>

                  <div className="pt-4 border-t border-zinc-100">
                    <label className="block text-sm font-medium text-zinc-900 mb-2">Custom API Key (Optional)</label>
                    <p className="text-xs text-zinc-500 mb-3">
                      Nhập Gemini API key để sử dụng quota của riêng bạn. <span className="font-medium text-emerald-600">Key của bạn chỉ được lưu tạm thời trong bộ nhớ của trình duyệt (không lưu trữ trên máy chủ) để đảm bảo an toàn.</span>
                    </p>
                    <input
                      type="password"
                      value={tempKey}
                      onChange={(e) => setTempKey(e.target.value)}
                      placeholder="AIzaSy..."
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono text-sm"
                    />
                  </div>
                  
                  {keyTestStatus === 'success' && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
                      <Check size={16} />
                      API Key verified successfully!
                    </div>
                  )}
                  
                  {keyTestStatus === 'error' && (
                    <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                      <AlertCircle size={16} />
                      Invalid API Key. Please check and try again.
                    </div>
                  )}
                  
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setIsKeyModalOpen(false)}
                      className="flex-1 px-4 py-2.5 bg-white border border-zinc-200 text-zinc-700 rounded-xl font-medium hover:bg-zinc-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveSettings}
                      disabled={isTestingKey || keyTestStatus === 'success'}
                      className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isTestingKey ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Testing...
                        </>
                      ) : keyTestStatus === 'success' ? (
                        <>
                          <Check size={16} />
                          Saved
                        </>
                      ) : (
                        'Save Settings'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
            <AlertCircle size={20} />
            <p className="font-medium">{error}</p>
          </div>
        )}

        {!file ? (
          <div className="max-w-5xl mx-auto mt-12 flex flex-col items-center w-full">
            <div className="text-center mb-12">
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-900 mb-4">
                Convert PDF to <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">Markdown</span>
              </h2>
              <p className="text-lg text-zinc-500 max-w-2xl mx-auto">
                Transform your PDF documents into clean, structured Markdown instantly. Powered by Google Gemini models for unparalleled accuracy in extracting text, tables, and formatting.
              </p>
            </div>

            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="w-full max-w-3xl border-2 border-dashed border-zinc-300 rounded-3xl p-16 text-center hover:bg-white hover:border-indigo-500 transition-all cursor-pointer group bg-white/50 shadow-sm relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-indigo-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="application/pdf"
                className="hidden"
              />
              <div className="relative z-10">
                <div className="w-24 h-24 bg-white shadow-md text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 group-hover:shadow-lg transition-all duration-300">
                  <UploadCloud size={48} strokeWidth={1.5} />
                </div>
                <h3 className="text-2xl font-semibold text-zinc-900 mb-3">Upload your PDF</h3>
                <p className="text-zinc-500 text-lg">
                  Drag and drop your file here, or <span className="text-indigo-600 font-medium">click to browse</span>
                </p>
              </div>
            </div>
            
            <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
              <div className="p-8 bg-white rounded-2xl shadow-sm border border-zinc-100 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-6">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                </div>
                <h4 className="text-lg font-semibold text-zinc-900 mb-2">Preserves Structure</h4>
                <p className="text-zinc-500 leading-relaxed">Maintains headings, paragraphs, and document flow exactly as they appear in the original file.</p>
              </div>
              <div className="p-8 bg-white rounded-2xl shadow-sm border border-zinc-100 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-6">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                </div>
                <h4 className="text-lg font-semibold text-zinc-900 mb-2">Extracts Tables</h4>
                <p className="text-zinc-500 leading-relaxed">Intelligently identifies and converts complex PDF tables into clean, readable Markdown tables.</p>
              </div>
              <div className="p-8 bg-white rounded-2xl shadow-sm border border-zinc-100 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-6">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <h4 className="text-lg font-semibold text-zinc-900 mb-2">Google Gemini</h4>
                <p className="text-zinc-500 leading-relaxed">Choose from Google's most capable multimodal models for unparalleled conversion accuracy.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 h-full min-h-0">
            <div className="flex items-center justify-between mb-6 bg-white p-5 rounded-2xl shadow-sm border border-zinc-200">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-50 text-red-500 rounded-xl flex items-center justify-center">
                  <FileText size={24} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900 truncate max-w-xs sm:max-w-md lg:max-w-xl">{file.name}</h2>
                  <p className="text-sm text-zinc-500 font-medium">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              
              {!markdown && !isConverting && (
                <button
                  onClick={convertPdfToMarkdown}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-3 rounded-xl font-semibold transition-colors shadow-md flex items-center gap-2"
                >
                  Convert to Markdown
                </button>
              )}
              
              {isConverting && (
                <div className="flex items-center gap-3 text-indigo-600 font-semibold px-6 py-3 bg-indigo-50 rounded-xl">
                  <Loader2 size={20} className="animate-spin" />
                  Converting...
                </div>
              )}
              
              {markdown && !isConverting && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={copyToClipboard}
                    className="bg-white border-2 border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 text-zinc-700 px-5 py-2.5 rounded-xl font-semibold transition-all flex items-center gap-2"
                  >
                    {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={downloadMarkdown}
                    className="bg-zinc-900 hover:bg-zinc-800 text-white px-5 py-2.5 rounded-xl font-semibold transition-colors shadow-md flex items-center gap-2"
                  >
                    <Download size={18} />
                    Download .md
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
              <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 flex flex-col overflow-hidden">
                <div className="bg-zinc-50/80 border-b border-zinc-200 px-5 py-3.5 flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Original PDF</span>
                </div>
                <div className="flex-1 overflow-auto bg-zinc-100/50 p-6">
                  {file ? (
                    <Document
                      file={file}
                      onLoadSuccess={onDocumentLoadSuccess}
                      onLoadError={(error) => handleError('Failed to load PDF: ' + error.message)}
                      loading={
                        <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
                          <Loader2 size={24} className="animate-spin text-indigo-500" />
                          <span className="font-medium animate-pulse">Loading PDF document...</span>
                        </div>
                      }
                      className="flex flex-col items-center"
                    >
                      {Array.from(new Array(numPages), (el, index) => (
                        <Page
                          key={`page_${index + 1}`}
                          pageNumber={index + 1}
                          className="mb-6 shadow-lg bg-white rounded-sm overflow-hidden"
                          renderTextLayer={true}
                          renderAnnotationLayer={true}
                          width={Math.min(window.innerWidth / 2 - 80, 800)}
                        />
                      ))}
                    </Document>
                  ) : (
                    <div className="h-full flex items-center justify-center text-zinc-400 font-medium">
                      <p>No PDF loaded</p>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 flex flex-col overflow-hidden">
                <div className="bg-zinc-50/80 border-b border-zinc-200 px-3 py-2.5 flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('preview')}
                    className={`text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-lg transition-all ${
                      activeTab === 'preview' ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/60' : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50 border border-transparent'
                    }`}
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => setActiveTab('markdown')}
                    className={`text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-lg transition-all ${
                      activeTab === 'markdown' ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/60' : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50 border border-transparent'
                    }`}
                  >
                    Markdown Output
                  </button>
                </div>
                
                <div className="flex-1 overflow-auto relative bg-white">
                  {isConverting && !markdown && (
                    <div className="absolute inset-0 z-10 bg-white/90 backdrop-blur-md flex flex-col items-center justify-center text-zinc-500 space-y-6">
                      <div className="relative">
                        <div className="absolute inset-0 bg-indigo-400 rounded-full blur-2xl animate-pulse opacity-30"></div>
                        <Loader2 size={48} className="animate-spin text-indigo-600 relative z-10" />
                      </div>
                      <p className="text-lg font-semibold text-zinc-800 animate-pulse">Analyzing document structure...</p>
                    </div>
                  )}
                  
                  {activeTab === 'preview' ? (
                    <div className="p-8 lg:p-10 h-full">
                      {markdown ? (
                        <div className="prose prose-zinc prose-sm sm:prose-base max-w-none prose-headings:font-semibold prose-a:text-indigo-600 hover:prose-a:text-indigo-500 prose-table:w-full prose-table:border-collapse prose-th:border prose-th:border-zinc-300 prose-th:bg-zinc-100 prose-th:p-3 prose-td:border prose-td:border-zinc-300 prose-td:p-3 prose-pre:bg-zinc-900 prose-pre:text-zinc-100 prose-pre:rounded-xl">
                          <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-zinc-400 font-medium">
                          <p>Click "Convert to Markdown" to see the preview</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-6 bg-[#0E1116] text-[#E6EDF3] font-mono text-sm leading-relaxed h-full">
                      {markdown ? (
                        <pre className="whitespace-pre-wrap break-words">{markdown}</pre>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-zinc-500 font-medium">
                          <p>Markdown output will appear here</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
