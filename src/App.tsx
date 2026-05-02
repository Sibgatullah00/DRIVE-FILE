import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'motion/react';
import { 
  FolderPlus, 
  Settings, 
  Search, 
  Upload, 
  FileText, 
  Image as ImageIcon, 
  Video, 
  MoreVertical, 
  Folder as FolderIcon,
  HardDrive,
  Menu,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCcw,
  ExternalLink,
  Star,
  Trash2,
  Download,
  Eye,
  Info,
  ChevronRight,
  Plus
} from 'lucide-react';
import { TelegramService } from './services/telegramService';
import { TelegramConfig, Folder, FileData } from './types';

// Utility for formatting bytes
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export default function App() {
  // --- State ---
  const [config, setConfig] = useState<TelegramConfig>(() => {
    const saved = localStorage.getItem('df_config');
    return saved ? JSON.parse(saved) : { botToken: '', chatId: '' };
  });
  const [folders, setFolders] = useState<Folder[]>(() => {
    const saved = localStorage.getItem('df_folders');
    return saved ? JSON.parse(saved) : [];
  });
  const [files, setFiles] = useState<FileData[]>(() => {
    const saved = localStorage.getItem('df_files');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [previewFile, setPreviewFile] = useState<FileData | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);

  const tgService = useMemo(() => new TelegramService(config), [config]);

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem('df_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('df_folders', JSON.stringify(folders));
  }, [folders]);

  useEffect(() => {
    localStorage.setItem('df_files', JSON.stringify(files));
  }, [files]);

  // --- Actions ---
  const [isSyncing, setIsSyncing] = useState(false);

  const startSync = async () => {
    if (!config.botToken || !config.chatId) return;
    setIsSyncing(true);
    try {
      const updates = await tgService.getUpdates();
      let addedCount = 0;
      
      const newFiles: FileData[] = [];
      updates.forEach((update: any) => {
        const msg = update.message || update.edited_message;
        if (!msg || !msg.message_thread_id) return;

        const folderId = msg.message_thread_id.toString();
        const existsLocally = files.find(f => f.messageId === msg.message_id);
        if (existsLocally) return;

        const document = msg.document || msg.video || (msg.photo ? msg.photo[msg.photo.length - 1] : null);
        if (document) {
          newFiles.push({
            messageId: msg.message_id,
            fileId: document.file_id,
            folderId: folderId,
            name: document.file_name || (msg.photo ? `Photo_${msg.message_id}.jpg` : 'Unnamed File'),
            size: document.file_size || 0,
            type: msg.photo ? 'image/jpeg' : (document.mime_type || 'application/octet-stream'),
            date: msg.date * 1000,
          });
          addedCount++;
        }
      });
      
      if (newFiles.length > 0) {
        setFiles(prev => [...prev, ...newFiles]);
      }
    } catch (err) {
      console.error('Sync failed', err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (config.botToken && config.chatId) {
      startSync();
    }
  }, []);

  const handleCreateFolder = async () => {
    const name = prompt('Enter folder name:');
    if (!name || !config.botToken) return;

    try {
      const newFolder = await tgService.createFolder(name);
      setFolders(prev => [...prev, newFolder]);
      setSelectedFolderId(newFolder.id);
    } catch (err: any) {
      alert('Error creating folder: ' + err.message);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || !selectedFolderId || !config.botToken) return;

    const filesArray = Array.from(fileList) as File[];
    for (const file of filesArray) {
      const uploadId = Math.random().toString(36).substr(2, 9);
      try {
        setUploadProgress(prev => ({ ...prev, [uploadId]: 0 }));
        const uploadedFile = await tgService.uploadFile(selectedFolderId, file, (p) => {
          setUploadProgress(prev => ({ ...prev, [uploadId]: p }));
        });
        setFiles(prev => [...prev, uploadedFile]);
        setUploadProgress(prev => {
          const newState = { ...prev };
          delete newState[uploadId];
          return newState;
        });
      } catch (err: any) {
        alert(`Error uploading ${file.name}: ` + err.message);
        setUploadProgress(prev => {
          const newState = { ...prev };
          delete newState[uploadId];
          return newState;
        });
      }
    }
  };

  const handleDeleteFile = async (file: FileData) => {
    if (!confirm(`Are you sure you want to delete "${file.name}"?`)) return;
    
    try {
      await tgService.deleteFile(file.messageId);
      setFiles(prev => prev.filter(f => f.messageId !== file.messageId));
      if (previewFile?.messageId === file.messageId) setPreviewFile(null);
    } catch (err: any) {
      if (err.message.includes('message can\'t be deleted')) {
        // Fallback: just remove from local view if it's too old
        setFiles(prev => prev.filter(f => f.messageId !== file.messageId));
      } else {
        alert('Error deleting file: ' + err.message);
      }
    }
  };

  const toggleFavorite = (file: FileData) => {
    setFiles(prev => prev.map(f => 
      f.messageId === file.messageId ? { ...f, isFavorite: !f.isFavorite } : f
    ));
  };

  const handlePreview = async (file: FileData) => {
    if (!file.fileId) return;
    setPreviewFile(file);
    setIsLoadingPreview(true);
    setPreviewUrl(null);
    try {
      const url = await tgService.getFilePath(file.fileId);
      setPreviewUrl(url);
    } catch (err) {
      console.error('Preview error', err);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleTestConnection = async () => {
    if (!config.botToken || !config.chatId) return;
    setIsTestingConnection(true);
    setConnectionStatus('idle');
    try {
      await tgService.testConnection();
      setConnectionStatus('success');
    } catch (err) {
      setConnectionStatus('error');
    } finally {
      setIsTestingConnection(false);
    }
  };

  // --- Computed ---
  const filteredFiles = useMemo(() => {
    return files.filter(f => {
      const matchesSearch = f.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFolder = showOnlyFavorites ? f.isFavorite : (selectedFolderId ? f.folderId === selectedFolderId : true);
      return matchesSearch && matchesFolder;
    }).sort((a, b) => b.date - a.date);
  }, [files, searchTerm, selectedFolderId, showOnlyFavorites]);

  const totalStorage = useMemo(() => files.reduce((acc, f) => acc + f.size, 0), [files]);

  const currentFolder = folders.find(f => f.id === selectedFolderId);

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <ImageIcon className="text-blue-400" />;
    if (type.startsWith('video/')) return <Video className="text-purple-400" />;
    return <FileText className="text-gray-400" />;
  };

  const isConfigured = config.botToken && config.chatId;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans selection:bg-brand-accent/30 selection:text-brand-deep">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-brand-deep/50 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ 
          width: isSidebarOpen ? 280 : 0, 
          opacity: isSidebarOpen ? 1 : 0,
          x: isSidebarOpen ? 0 : -280 
        }}
        className={`fixed lg:relative z-50 bg-brand-deep text-white h-full shrink-0 flex flex-col border-r border-white/10 overflow-hidden shadow-2xl lg:shadow-none`}
      >
        <div className="p-8 flex items-center gap-4">
          <motion.div 
            whileHover={{ rotate: 12, scale: 1.1 }}
            className="w-12 h-12 bg-gradient-to-br from-brand-accent to-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-brand-accent/20"
          >
            <HardDrive size={28} className="text-white" />
          </motion.div>
          <div>
            <h1 className="text-xl font-bold font-display tracking-tight leading-none mb-1">Drive File</h1>
            <p className="text-[10px] text-brand-accent/70 uppercase tracking-[0.2em] font-extrabold">Cloud Storage</p>
          </div>
        </div>

        <div className="px-4 mt-8 flex-1 overflow-y-auto space-y-8">
          <nav className="space-y-1">
            <button
              onClick={() => { setSelectedFolderId(null); setShowOnlyFavorites(false); if(window.innerWidth < 1024) setIsSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                !selectedFolderId && !showOnlyFavorites ? 'bg-white/10 text-white shadow-inner' : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <HardDrive size={18} />
              <span>All Files</span>
            </button>

            <button
              onClick={() => { setShowOnlyFavorites(true); setSelectedFolderId(null); if(window.innerWidth < 1024) setIsSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                showOnlyFavorites ? 'bg-white/10 text-brand-accent shadow-inner' : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Star size={18} className={showOnlyFavorites ? 'fill-brand-accent' : ''} />
              <span>Starred</span>
            </button>
          </nav>

          <div>
            <div className="flex items-center justify-between px-4 mb-4">
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Collections</span>
              <motion.button 
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleCreateFolder}
                className="w-6 h-6 flex items-center justify-center bg-brand-accent/20 rounded-lg text-brand-accent hover:bg-brand-accent hover:text-white transition-all shadow-lg shadow-brand-accent/10"
              >
                <Plus size={14} />
              </motion.button>
            </div>

            <div className="space-y-1">
              {folders.map(folder => (
                <button
                  key={folder.id}
                  onClick={() => { setSelectedFolderId(folder.id); setShowOnlyFavorites(false); if(window.innerWidth < 1024) setIsSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 group ${
                    selectedFolderId === folder.id && !showOnlyFavorites ? 'bg-brand-accent text-white shadow-lg shadow-brand-accent/20' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <FolderIcon size={18} className={selectedFolderId === folder.id ? 'text-white' : 'text-gray-500 group-hover:text-brand-accent'} />
                  <span className="truncate flex-1 text-left">{folder.name}</span>
                  <ChevronRight size={14} className={`opacity-0 group-hover:opacity-100 transition-opacity ${selectedFolderId === folder.id ? 'opacity-100' : ''}`} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-white/5 space-y-6">
          <div className="bg-white/5 rounded-2xl p-4">
            <div className="flex justify-between items-center text-[10px] uppercase font-black text-gray-500 tracking-widest mb-2">
              <span>Usage</span>
              <span>{formatBytes(totalStorage)}</span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
               {/* 2GB limit of Telegram is per file, not per chat, but we can show some relative usage */}
               <div className="w-1/3 h-full bg-brand-accent" />
            </div>
          </div>

          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-gray-400 hover:bg-white/10 hover:text-white"
          >
            <Settings size={18} />
            <span>Settings</span>
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Top Header */}
        <header className="h-20 flex items-center justify-between px-4 sm:px-8 bg-white/80 backdrop-blur-xl sticky top-0 z-10">
          <div className="flex items-center gap-4 flex-1">
            <motion.button 
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-3 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-2xl text-gray-500 transition-all flex items-center justify-center shadow-sm"
            >
              {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </motion.button>
            <div className="relative max-w-md w-full group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-accent transition-colors duration-300" size={18} />
              <input 
                type="text" 
                placeholder="Search storage..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-6 py-2.5 bg-gray-50 border border-transparent focus:bg-white focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/5 rounded-2xl text-sm outline-none transition-all duration-300 shadow-inner"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 ml-4">
            <motion.button 
              whileHover={{ rotate: 180 }}
              onClick={startSync}
              disabled={isSyncing || !isConfigured}
              className={`p-3 rounded-2xl transition-all ${
                isSyncing ? 'text-brand-accent bg-brand-accent/10' : 'text-gray-400 bg-gray-50 hover:bg-gray-100 border border-gray-100'
              } disabled:opacity-30`}
            >
              <RefreshCcw size={18} className={isSyncing ? 'animate-spin' : ''} />
            </motion.button>
            
            {selectedFolderId && (
              <motion.label 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-2 bg-brand-accent text-white px-4 sm:px-6 py-3 rounded-2xl text-sm font-bold cursor-pointer transition-all shadow-xl shadow-brand-accent/20 hover:shadow-brand-accent/30"
              >
                <Upload size={18} />
                <span className="hidden sm:inline">Upload</span>
                <input type="file" multiple className="hidden" onChange={handleFileUpload} />
              </motion.label>
            )}
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8">
          {!isConfigured ? (
             <div className="flex flex-col items-center justify-center h-full max-w-3xl mx-auto px-4 py-12">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="w-24 h-24 bg-brand-accent/20 rounded-[2.5rem] flex items-center justify-center mb-8 border-2 border-brand-accent/30 shadow-2xl shadow-brand-accent/20"
                >
                   <HardDrive size={48} className="text-brand-accent" />
                </motion.div>
                
                <h2 className="text-4xl font-black text-brand-deep font-display mb-2 text-center">Setup Drive File</h2>
                <p className="text-gray-500 leading-relaxed mb-12 text-lg text-center max-w-md">
                   ড্রাইভ ফাইল সেটআপ করুন এবং টেলিগ্রামকে ক্লাউড স্টোরেজ হিসেবে ব্যবহার শুরু করুন।
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                   {[
                     { 
                       title: "1. Bot Token সংগ্রহ করুন", 
                       desc: "টেলিগ্রামে @BotFather-এ যান, /newbot লিখে আপনার বটের নাম দিন। শেষে আপনি একটি 'API Token' পাবেন সেটি কপি করুন।",
                       icon: "🤖",
                       link: "https://t.me/BotFather",
                       btnText: "Open BotFather"
                     },
                     { 
                       title: "2. Group Chat ID খুঁজুন", 
                       desc: "একটি প্রাইভেট গ্রুপ খুলুন এবং বটকে অ্যাডমিন করুন। গ্রুপের ID পেতে @MissRose_bot অ্যাড করে /id লিখুন। (ID শুরু হয় -100 দিয়ে)",
                       icon: "🆔",
                       link: "https://t.me/MissRose_bot",
                       btnText: "Get Chat ID"
                     },
                     { 
                       title: "3. Topics এনাবল করুন", 
                       desc: "আপনার গ্রুপ সেটিংসে গিয়ে 'Topics' অপশনটি চালু করুন। ড্রাইভ ফাইল এই টপিকগুলোকেই ফোল্ডার হিসেবে ব্যবহার করবে।",
                       icon: "📂"
                     },
                     { 
                       title: "4. কানেক্ট করুন", 
                       desc: "নিচের বাটনে ক্লিক করে Token এবং Chat ID বসিয়ে 'Save' করুন। ব্যাস! আপনার ক্লাউড তৈরি।",
                       icon: "🔗"
                     }
                   ].map((step, i) => (
                     <motion.div 
                       initial={{ opacity: 0, y: 20 }}
                       animate={{ opacity: 1, y: 0 }}
                       transition={{ delay: i * 0.1 }}
                       key={i} 
                       className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col gap-4 group"
                     >
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 shrink-0 bg-gray-50 rounded-2xl flex items-center justify-center text-2xl group-hover:bg-brand-accent/10 transition-colors">
                              {step.icon}
                           </div>
                           <h4 className="font-black text-brand-deep text-sm leading-tight">{step.title}</h4>
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed flex-1">{step.desc}</p>
                        {step.link && (
                           <a 
                             href={step.link} 
                             target="_blank" 
                             rel="noreferrer" 
                             className="text-brand-accent text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:underline"
                           >
                             {step.btnText} <ExternalLink size={10} />
                           </a>
                        )}
                     </motion.div>
                   ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-4 mt-12 w-full sm:w-auto">
                   <motion.button
                     whileHover={{ scale: 1.05, y: -2 }}
                     whileTap={{ scale: 0.95 }}
                     onClick={() => setIsSettingsOpen(true)}
                     className="bg-brand-deep text-white px-10 py-5 rounded-2xl font-black shadow-2xl shadow-brand-deep/20 flex items-center justify-center gap-3 transition-all hover:bg-brand-deep/90"
                   >
                      <Settings size={20} />
                      কনফিগার করুন
                   </motion.button>
                </div>
             </div>
          ) : (
          <div className="max-w-7xl mx-auto">
            {/* Folder Header */}
            <header className="mb-12 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
              <div>
                <motion.div 
                  layoutId="titleBox"
                  className="flex items-center gap-3 mb-2"
                >
                   <div className="w-10 h-10 bg-brand-accent/10 rounded-xl flex items-center justify-center text-brand-accent font-bold">
                      {showOnlyFavorites ? <Star size={20} className="fill-current" /> : (selectedFolderId ? <FolderIcon size={20} /> : <HardDrive size={20} />)}
                   </div>
                   <span className="text-xs font-black text-brand-accent uppercase tracking-widest">
                     {showOnlyFavorites ? "Favorites" : (selectedFolderId ? "Collection" : "Storage")}
                   </span>
                </motion.div>
                <h2 className="text-4xl font-black text-brand-deep font-display tracking-tight leading-none">
                  {showOnlyFavorites ? 'Starred Items' : (selectedFolderId ? currentFolder?.name : 'Cloud Dashboard')}
                </h2>
                <p className="text-gray-400 text-sm mt-3 flex items-center gap-2">
                  <Info size={14} className="text-brand-accent" />
                  You have {filteredFiles.length} file{filteredFiles.length !== 1 ? 's' : ''} in this view
                </p>
              </div>
            </header>

            {/* Uploading Status Overlay */}
            <AnimatePresence>
              {Object.keys(uploadProgress).length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 50 }}
                  className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4"
                >
                  <div className="bg-brand-deep/90 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl shadow-brand-deep/40 relative overflow-hidden">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-3">
                        <Upload className="text-brand-accent animate-bounce" size={20} />
                        <span className="text-sm font-bold text-white">Transferring Data...</span>
                      </div>
                      <span className="text-xs font-black text-brand-accent bg-white/10 px-3 py-1 rounded-full">
                        {Math.round(((Object.values(uploadProgress) as number[]).reduce((a, b) => a + b, 0)) / (Object.keys(uploadProgress).length || 1))}%
                      </span>
                    </div>
                    {Object.entries(uploadProgress).map(([id, progress]) => (
                      <div key={id} className="space-y-1 mb-2 last:mb-0">
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            className="h-full bg-brand-accent"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Empty States */}
            {filteredFiles.length === 0 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                {!selectedFolderId && !showOnlyFavorites && folders.length === 0 ? (
                  <div className="max-w-md bg-white border border-gray-100 p-10 rounded-[3rem] shadow-xl">
                    <div className="w-20 h-20 bg-brand-accent/10 rounded-3xl flex items-center justify-center mx-auto mb-6 text-brand-accent">
                      <FolderPlus size={40} />
                    </div>
                    <h3 className="text-2xl font-black text-brand-deep font-display mb-3">কানেক্টেড!</h3>
                    <p className="text-gray-400 text-sm leading-relaxed mb-8">
                       আপনার টেলিগ্রাম গ্রুপ সফলভাবে কানেক্ট হয়েছে। এখন প্রথম ফোল্ডারটি তৈরি করুন।
                    </p>
                    <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleCreateFolder}
                      className="w-full py-4 bg-brand-accent text-white rounded-2xl font-black shadow-lg shadow-brand-accent/20 flex items-center justify-center gap-2"
                    >
                      <Plus size={20} />
                      ফোল্ডার তৈরি করুন
                    </motion.button>
                  </div>
                ) : (
                  <>
                    <div className="relative mb-10 w-32 h-32">
                      <div className="absolute inset-0 bg-gray-50 rounded-full animate-pulse" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <HardDrive size={64} className="text-gray-200" />
                      </div>
                    </div>
                    <h3 className="text-2xl font-black text-brand-deep font-display mb-3">Void Detected</h3>
                    <p className="text-gray-400 text-base max-w-xs mx-auto leading-relaxed">
                      {selectedFolderId 
                        ? "This topic hasn't received any data streams yet. Drop some files to begin." 
                        : showOnlyFavorites ? "No starred items yet. Mark important files for quick access." : "Your cloud is currently empty. Start by creating a folder."}
                    </p>
                    {selectedFolderId && (
                      <motion.label 
                        whileHover={{ scale: 1.05 }}
                        className="mt-10 flex items-center gap-3 text-brand-accent font-black cursor-pointer bg-brand-accent/5 px-8 py-4 rounded-2xl hover:bg-brand-accent hover:text-white transition-all shadow-lg shadow-brand-accent/5"
                      >
                        <Upload size={20} />
                        <span>Initiate First Upload</span>
                        <input type="file" multiple className="hidden" onChange={handleFileUpload} />
                      </motion.label>
                    )}
                  </>
                )}
              </motion.div>
            )}

            {/* Files Grid */}
            <motion.div 
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8"
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {filteredFiles.map((file) => (
                  <motion.div
                    layout
                    key={file.messageId}
                    variants={itemVariants}
                    whileHover={{ y: -8 }}
                    className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm hover:shadow-2xl hover:border-brand-accent transition-all group relative overflow-hidden"
                  >
                    <div 
                      onClick={() => handlePreview(file)}
                      className="aspect-[4/3] bg-gray-50 rounded-2xl mb-5 flex items-center justify-center overflow-hidden cursor-zoom-in relative group/thumb"
                    >
                      <div className="absolute inset-0 bg-brand-deep/0 group-hover/thumb:bg-brand-deep/40 transition-colors z-10 flex items-center justify-center">
                         <Eye className="text-white opacity-0 group-hover/thumb:opacity-100 transform translate-y-2 group-hover/thumb:translate-y-0 transition-all duration-300" size={32} />
                      </div>
                      
                      {file.type.startsWith('image/') ? (
                        <div className="w-full h-full flex items-center justify-center text-brand-accent/20">
                           <ImageIcon size={64} className="stroke-[1.5]" />
                        </div>
                      ) : (
                        <div className="transform scale-150 transform-gpu transition-transform group-hover/thumb:scale-[1.6]">
                          {getFileIcon(file.type)}
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between items-start gap-3">
                        <h4 className="text-sm font-bold text-brand-deep truncate flex-1 leading-tight" title={file.name}>
                          {file.name}
                        </h4>
                        <div className="flex gap-1 shrink-0">
                           <button 
                             onClick={(e) => { e.stopPropagation(); toggleFavorite(file); }}
                             className={`p-1 rounded-lg transition-colors ${file.isFavorite ? 'text-amber-400' : 'text-gray-300 hover:text-amber-400'}`}
                           >
                             <Star size={16} className={file.isFavorite ? 'fill-current' : ''} />
                           </button>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 text-[11px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 p-2 rounded-xl border border-gray-100/50">
                        <span className="text-brand-accent">{formatBytes(file.size)}</span>
                        <div className="w-1 h-1 bg-gray-300 rounded-full" />
                        <span className="truncate">{new Date(file.date).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 space-y-2 z-20">
                      <a 
                        href={`https://t.me/c/${config.chatId.replace('-100', '')}/${file.messageId}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="w-9 h-9 bg-white shadow-xl shadow-black/10 border border-gray-100 rounded-2xl text-brand-accent hover:bg-brand-accent hover:text-white transition-all flex items-center justify-center group/btn"
                      >
                        <ExternalLink size={16} />
                        <span className="absolute right-full mr-2 px-2 py-1 bg-brand-deep text-white text-[10px] rounded-lg opacity-0 group-hover/btn:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">Source</span>
                      </a>
                      <button 
                        onClick={() => handleDeleteFile(file)}
                        className="w-9 h-9 bg-white shadow-xl shadow-black/10 border border-gray-100 rounded-2xl text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center group/btn"
                      >
                        <Trash2 size={16} />
                        <span className="absolute right-full mr-2 px-2 py-1 bg-red-600 text-white text-[10px] rounded-lg opacity-0 group-hover/btn:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">Erase</span>
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
          )}
        </div>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-brand-deep/80 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 30 }}
              className="bg-white rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] w-full max-w-lg overflow-hidden relative z-10 border border-white/20"
            >
              <div className="p-10">
                <div className="flex justify-between items-center mb-10">
                  <div>
                    <h3 className="text-3xl font-black font-display text-brand-deep">Core Config</h3>
                    <p className="text-gray-400 text-sm mt-1">Connect your storage engine</p>
                  </div>
                  <motion.button 
                    whileHover={{ rotate: 90 }}
                    onClick={() => setIsSettingsOpen(false)} 
                    className="p-3 hover:bg-gray-100 rounded-2xl transition-colors border border-gray-100"
                  >
                    <X size={24} />
                  </motion.button>
                </div>

                <div className="space-y-8">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center px-2">
                       <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Telegram API Token</label>
                       <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-[10px] text-brand-accent font-bold hover:underline">Get from @BotFather</a>
                    </div>
                    <div className="relative">
                       <input 
                        type="password" 
                        value={config.botToken}
                        onChange={(e) => setConfig(prev => ({ ...prev, botToken: e.target.value }))}
                        className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:bg-white focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/5 rounded-[1.25rem] outline-none transition-all text-sm font-medium"
                        placeholder="7123456789:ABCDE..."
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 px-2 italic">@BotFather থেকে প্রাপ্ত API Token এখানে দিন।</p>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center px-2">
                       <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Storage Node ID (Chat ID)</label>
                       <a href="https://t.me/MissRose_bot" target="_blank" rel="noreferrer" className="text-[10px] text-brand-accent font-bold hover:underline">Find via @MissRose_bot</a>
                    </div>
                    <input 
                      type="text" 
                      value={config.chatId}
                      onChange={(e) => setConfig(prev => ({ ...prev, chatId: e.target.value }))}
                      className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:bg-white focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/5 rounded-[1.25rem] outline-none transition-all text-sm font-medium"
                      placeholder="-100xxxxxxxxx"
                    />
                    <p className="text-[10px] text-gray-400 px-2 italic">গ্রুপে বট অ্যাড করে /id লিখে প্রাপ্ত -100 যুক্ত আইডিটি দিন।</p>
                  </div>

                  <div className="pt-4 space-y-4">
                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleTestConnection}
                      disabled={isTestingConnection || !config.botToken || !config.chatId}
                      className={`w-full py-5 rounded-2xl flex items-center justify-center gap-3 transition-all font-black text-sm ${
                        connectionStatus === 'success' ? 'bg-green-500 text-white' :
                        connectionStatus === 'error' ? 'bg-red-500 text-white' :
                        'bg-brand-deep text-white shadow-2xl shadow-brand-deep/20'
                      } disabled:opacity-50`}
                    >
                      {isTestingConnection ? (
                        <RefreshCcw className="animate-spin" size={20} />
                      ) : connectionStatus === 'success' ? (
                        <CheckCircle2 size={20} />
                      ) : connectionStatus === 'error' ? (
                        <AlertCircle size={20} />
                      ) : (
                        <CheckCircle2 size={20} className="text-brand-accent" />
                      )}
                      {connectionStatus === 'success' ? 'Operational' : 
                       connectionStatus === 'error' ? 'Check Credentials' : 
                       'Link System'}
                    </motion.button>
                  </div>
                </div>
              </div>
              <div className="p-8 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">v2.4.0 High-Yield</span>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-8 py-3 bg-white border border-gray-200 text-brand-deep rounded-xl text-xs font-black shadow-sm hover:shadow-md transition-all active:scale-95"
                >
                  Save & Exit
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Preview Modal */}
      <AnimatePresence>
         {previewFile && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
               <motion.div 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 exit={{ opacity: 0 }}
                 onClick={() => setPreviewFile(null)}
                 className="absolute inset-0 bg-brand-deep/95 backdrop-blur-3xl"
               />
               
               <motion.div 
                 initial={{ scale: 0.9, opacity: 0 }}
                 animate={{ scale: 1, opacity: 1 }}
                 exit={{ scale: 0.9, opacity: 0 }}
                 className="w-full max-w-5xl h-full max-h-[85vh] relative z-10 flex flex-col bg-white rounded-[3rem] overflow-hidden shadow-[0_64px_128px_-32px_rgba(0,0,0,0.8)]"
               >
                  <div className="h-20 px-8 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
                     <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="p-3 bg-gray-50 rounded-2xl text-brand-accent">
                           {getFileIcon(previewFile.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                           <h3 className="font-black text-brand-deep truncate text-lg pr-4">{previewFile.name}</h3>
                           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{formatBytes(previewFile.size)} • {new Date(previewFile.date).toLocaleString()}</p>
                        </div>
                     </div>
                     <div className="flex items-center gap-3">
                         <a 
                           href={`https://t.me/c/${config.chatId.replace('-100', '')}/${previewFile.messageId}`} 
                           target="_blank" 
                           rel="noreferrer"
                           className="flex items-center gap-2 px-6 py-3 bg-brand-accent text-white rounded-2xl text-sm font-black shadow-lg shadow-brand-accent/20 hover:scale-105 transition-all active:scale-95"
                         >
                           <Download size={18} />
                           Download
                         </a>
                         <button 
                           onClick={() => setPreviewFile(null)}
                           className="p-3 hover:bg-gray-100 rounded-2xl text-gray-400 transition-colors border border-gray-100"
                         >
                           <X size={24} />
                         </button>
                     </div>
                  </div>

                  <div className="flex-1 bg-gray-50 flex items-center justify-center p-8 overflow-hidden">
                     {isLoadingPreview ? (
                        <div className="flex flex-col items-center gap-4">
                           <RefreshCcw className="animate-spin text-brand-accent" size={48} />
                           <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest animate-pulse">Establishing Secure Stream...</span>
                        </div>
                     ) : previewUrl ? (
                        <div className="w-full h-full flex items-center justify-center">
                           {previewFile.type.startsWith('image/') ? (
                              <motion.img 
                                initial={{ opacity: 0, scale: 1.1 }}
                                animate={{ opacity: 1, scale: 1 }}
                                src={previewUrl} 
                                alt={previewFile.name} 
                                referrerPolicy="no-referrer"
                                className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" 
                              />
                           ) : previewFile.type.startsWith('video/') ? (
                              <video src={previewUrl} controls className="max-w-full max-h-full rounded-xl shadow-2xl" />
                           ) : (
                              <div className="bg-white p-20 rounded-[3rem] shadow-2xl border border-gray-100 text-center max-w-sm">
                                 <FileText size={80} className="text-gray-100 mx-auto mb-8 stroke-[1]" />
                                 <h4 className="text-xl font-black text-brand-deep mb-4">Native Preview Unavailable</h4>
                                 <p className="text-gray-400 text-sm leading-relaxed mb-8">This file format is not supported for direct browser playback. Please download to view content.</p>
                                 <a 
                                    href={previewUrl} 
                                    target="_blank" 
                                    download={previewFile.name}
                                    className="inline-flex items-center gap-2 px-8 py-4 bg-brand-deep text-white rounded-2xl font-black"
                                 >
                                    <Download size={20} />
                                    Get File
                                 </a>
                              </div>
                           )}
                        </div>
                     ) : (
                        <div className="text-center text-red-500 font-bold">Failed to load preview. Please try again.</div>
                     )}
                  </div>
               </motion.div>
            </div>
         )}
      </AnimatePresence>
    </div>
  );
}
