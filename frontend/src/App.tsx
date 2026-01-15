import React, { useState, useEffect } from 'react';
import { UploadDashboard } from './components/UploadDashboard';
import { SlideViewer } from './components/SlideViewer';
import { Player } from './components/Player';
import { FlashcardPlayer } from './components/FlashcardPlayer';
import { Library } from './components/Library';
import { cn } from './lib/utils';
import { LayoutList, Package, Play, BookOpen, ArrowLeft } from 'lucide-react';
import JSZip from 'jszip';
import { Card, Slide, PresentationData } from './types';
import { API_BASE } from './config';

type View = 'upload' | 'library' | 'player' | 'modeSelect';

function App() {
    const [view, setView] = useState<View>('upload');
    const [data, setData] = useState<PresentationData | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [audioFile, setAudioFile] = useState<File | null>(null);

    // Navigation State
    const [playlist, setPlaylist] = useState<number[]>([]);
    const [currentPackId, setCurrentPackId] = useState<number | null>(null);

    // Player State
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    // Current Slide ID for highlighting
    const currentSlide = data?.slides
        .filter(s => s.timestamp_start <= currentTime)
        .sort((a, b) => b.timestamp_start - a.timestamp_start)[0]
        || data?.slides[0];

    const activeSlideId = currentSlide?.id || 0;

    const handleUploadComplete = (presentationData: PresentationData, audio: File) => {
        setData(presentationData);
        setAudioFile(audio);
        setAudioUrl(URL.createObjectURL(audio));
        setView('player'); // Switch to player

        // Reset playlist on new upload
        setPlaylist([]);
        setCurrentPackId(null);
    };

    // Scroll to active slide in sidebar
    useEffect(() => {
        if (activeSlideId && view === 'player') {
            document.getElementById(`slide-thumb-${activeSlideId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [activeSlideId, view]);



    // Helper to load a slidepack by ID
    const loadSlidepack = async (id: number) => {
        try {
            const res = await fetch(`${API_BASE}/slidepack/${id}`);
            if (!res.ok) throw new Error("Failed to load slidepack");
            const result = await res.json();

            setData(result.presentation);

            // Fetch audio blob to enable export later
            const audioUrl = `${API_BASE}${result.audio_url}`;
            setAudioUrl(audioUrl);

            const audioRes = await fetch(audioUrl);
            const audioBlob = await audioRes.blob();
            const audioName = result.audio_url.split('/').pop();
            const file = new File([audioBlob], audioName, { type: audioBlob.type });
            setAudioFile(file);

            setCurrentPackId(id);
            setCurrentTime(0);  // Reset time
            setIsPlaying(false); // Don't auto-play, show mode selection
            setView('modeSelect'); // Show mode selection screen

            // Force scroll to top after a short delay to allow rendering
            setTimeout(() => {
                if (result.presentation.slides && result.presentation.slides.length > 0) {
                    const firstSlide = result.presentation.slides[0];
                    document.getElementById(`slide-thumb-${firstSlide.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        } catch (err) {
            console.error(err);
            alert("Impossibile aprire la lezione. Verifica che il backend sia attivo.");
        }
    };

    // Forward/Backward Navigation
    const handleNext = () => {
        if (!currentPackId || playlist.length === 0) return;
        const currentIndex = playlist.indexOf(currentPackId);
        if (currentIndex !== -1 && currentIndex < playlist.length - 1) {
            loadSlidepack(playlist[currentIndex + 1]);
        }
    };

    const handlePrev = () => {
        if (!currentPackId || playlist.length === 0) return;
        const currentIndex = playlist.indexOf(currentPackId);
        if (currentIndex > 0) {
            loadSlidepack(playlist[currentIndex - 1]);
        }
    };

    const hasNext = currentPackId && playlist.indexOf(currentPackId) < playlist.length - 1;
    const hasPrev = currentPackId && playlist.indexOf(currentPackId) > 0;


    // Export complete slidepack (JSON + Audio)
    const handleExportSlidepack = async () => {
        if (!data || !audioFile) return;

        const zip = new JSZip();

        // Add slides JSON
        zip.file('slides.json', JSON.stringify(data, null, 2));

        // Add audio file with original extension
        const audioExt = audioFile.name.split('.').pop() || 'mp3';
        zip.file(`audio.${audioExt}`, audioFile);

        // Generate and download
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${data.metadata?.title || 'presentazione'}.slidepack`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Learning Objects State
    const [isPlayerOpen, setIsPlayerOpen] = useState(false);

    // Navbar component to reduce duplication logic
    const Navbar = () => (
        <header className="h-16 border-b border-white/10 flex items-center px-8 justify-between bg-neutral-900/50 backdrop-blur-md z-40 shrink-0">
            <div className="flex items-center gap-6">
                <div
                    className="font-bold text-xl tracking-tight cursor-pointer"
                    onClick={() => setView('upload')}
                >
                    AudioSlide AI
                </div>

                <nav className="flex items-center gap-1 bg-neutral-800/50 p-1 rounded-xl">
                    <button
                        onClick={() => setView('library')}
                        className={cn(
                            "px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                            view === 'library' ? "bg-neutral-700 text-white shadow-sm" : "text-neutral-400 hover:text-white hover:bg-neutral-700/50"
                        )}
                    >
                        <LayoutList className="w-4 h-4" />
                        Libreria
                    </button>
                </nav>
            </div>

            {view === 'player' && data && (
                <div className="flex items-center gap-4">
                    <div className="text-sm font-medium text-neutral-400 hidden md:block truncate max-w-xs">{data.metadata?.title}</div>
                    <div className="flex items-center gap-2">

                        {data.cards && data.cards.length > 0 && (
                            <button
                                onClick={() => setIsPlayerOpen(true)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-medium transition-all border border-white/10"
                                title="Review Flashcards"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
                                Review ({data.cards.length})
                            </button>
                        )}

                        <button
                            onClick={handleExportSlidepack}
                            className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 rounded-lg text-xs font-medium transition-all"
                            title="Esporta slidepack completo (JSON + Audio)"
                        >
                            <Package className="w-3.5 h-3.5" />
                            Esporta
                        </button>
                    </div>
                </div>
            )}
        </header>
    );

    return (
        <div className="h-screen bg-neutral-950 text-white overflow-hidden flex flex-col font-sans">
            <Navbar />

            <div className="flex-grow overflow-auto relative">
                {view === 'upload' && (
                    <UploadDashboard onUploadComplete={handleUploadComplete} />
                )}

                {view === 'library' && (
                    <Library onOpenSlidepack={(id, newPlaylist) => {
                        if (newPlaylist) setPlaylist(newPlaylist);
                        loadSlidepack(id);
                    }} />
                )}

                {/* Mode Selection Screen */}
                {view === 'modeSelect' && data && (
                    <div className="flex flex-col items-center justify-center h-full p-8">
                        {/* Back Button */}
                        <button
                            onClick={() => setView('library')}
                            className="absolute top-24 left-8 flex items-center gap-2 text-neutral-400 hover:text-white transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                            Torna alla libreria
                        </button>

                        {/* Title */}
                        <div className="text-center mb-12">
                            <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
                                {data.metadata?.title || 'Slidepack'}
                            </h1>
                            <p className="text-neutral-400">
                                {data.slides?.length || 0} slide • {data.cards?.length || 0} flashcard/quiz
                            </p>
                        </div>

                        {/* Mode Cards */}
                        <div className="flex flex-col md:flex-row gap-6 max-w-3xl w-full">
                            {/* Watch Lesson Card */}
                            <button
                                onClick={() => {
                                    setIsPlaying(true);
                                    setView('player');
                                }}
                                className="flex-1 group bg-gradient-to-br from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-3xl p-8 text-left transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/20"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                    <Play className="w-8 h-8 text-white" />
                                </div>
                                <h2 className="text-2xl font-bold text-white mb-2">
                                    Guarda Lezione
                                </h2>
                                <p className="text-white/70">
                                    Riproduci le slide con l'audio della lezione
                                </p>
                                <div className="mt-6 flex items-center gap-2 text-white/60 text-sm">
                                    <span>{data.slides?.length || 0} slide</span>
                                    <span>•</span>
                                    <span>{Math.floor((data.metadata?.duration || 0) / 60)} min</span>
                                </div>
                            </button>

                            {/* Study Quiz Card */}
                            <button
                                onClick={() => setIsPlayerOpen(true)}
                                disabled={!data.cards || data.cards.length === 0}
                                className={cn(
                                    "flex-1 group rounded-3xl p-8 text-left transition-all",
                                    data.cards && data.cards.length > 0
                                        ? "bg-gradient-to-br from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-emerald-500/20"
                                        : "bg-neutral-800 opacity-50 cursor-not-allowed"
                                )}
                            >
                                <div className={cn(
                                    "w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-transform",
                                    data.cards && data.cards.length > 0 ? "bg-white/20 group-hover:scale-110" : "bg-neutral-700"
                                )}>
                                    <BookOpen className="w-8 h-8 text-white" />
                                </div>
                                <h2 className="text-2xl font-bold text-white mb-2">
                                    Studia / Quiz
                                </h2>
                                <p className="text-white/70">
                                    {data.cards && data.cards.length > 0
                                        ? "Ripassa con flashcard e quiz interattivi"
                                        : "Nessuna flashcard disponibile"
                                    }
                                </p>
                                <div className="mt-6 flex items-center gap-2 text-white/60 text-sm">
                                    <span>{data.cards?.length || 0} flashcard/quiz</span>
                                </div>
                            </button>
                        </div>
                    </div>
                )}

                {view === 'player' && data && audioUrl && (
                    <div className="flex flex-col h-full">
                        <div className="flex-grow overflow-hidden relative">
                            {/* Main Content - Scrollable Slide List */}
                            <div className="absolute inset-0 p-4 overflow-y-auto">
                                {data.slides.length > 0 ? (
                                    <SlideViewer
                                        slides={data.slides}
                                        cards={data.cards}
                                        packId={currentPackId || undefined}
                                        currentSlideId={activeSlideId}
                                        onSlideClick={(timestamp) => setCurrentTime(timestamp + 0.1)}
                                        onCardsUpdate={(newCards) => {
                                            setData(prev => prev ? { ...prev, cards: newCards } : null);
                                        }}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-neutral-500">
                                        No slides available
                                    </div>
                                )}
                            </div>
                        </div>

                        <Player
                            audioUrl={audioUrl}
                            currentTime={currentTime}
                            duration={duration}
                            isPlaying={isPlaying}
                            onPlayPause={() => setIsPlaying(!isPlaying)}
                            onSeek={(t) => setCurrentTime(t)}
                            onTimeUpdate={(t) => setCurrentTime(t)}
                            onDurationChange={(d) => setDuration(d)}
                            onNext={hasNext ? handleNext : undefined}
                            onPrev={hasPrev ? handlePrev : undefined}
                        />
                    </div>
                )}

                {view === 'player' && (!data || !audioUrl) && (
                    <div className="flex flex-col items-center justify-center h-full text-neutral-500">
                        <p>No presentation loaded.</p>
                        <button
                            onClick={() => setView('upload')}
                            className="mt-4 px-4 py-2 bg-neutral-800 rounded-lg hover:bg-neutral-700 transition"
                        >
                            Create New
                        </button>
                    </div>
                )}
            </div>

            {/* Global Modals */}
            <FlashcardPlayer
                isOpen={isPlayerOpen}
                onClose={() => setIsPlayerOpen(false)}
                cards={data?.cards || []}
            />
        </div>
    );
}

export default App;
