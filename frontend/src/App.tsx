import React, { useState, useEffect } from 'react';
import { UploadDashboard } from './components/UploadDashboard';
import { SlideViewer } from './components/SlideViewer';
import { Player } from './components/Player';
import { Library } from './components/Library';
import { cn } from './lib/utils';
import { LayoutList, Package, Home, PlusCircle } from 'lucide-react';
import JSZip from 'jszip';

interface Slide {
    id: number;
    timestamp_start: number;
    timestamp_end: number;
    title: string;
    content: string[];
    math_formulas: string[];
    deep_dive?: string;
}

interface PresentationData {
    metadata: {
        title: string;
        duration: number;
    };
    slides: Slide[];
}

type View = 'upload' | 'library' | 'player';

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
            const res = await fetch(`http://localhost:8000/slidepack/${id}`);
            if (!res.ok) throw new Error("Failed to load slidepack");
            const result = await res.json();

            setData(result.presentation);

            // Fetch audio blob to enable export later
            const audioUrl = `http://localhost:8000${result.audio_url}`;
            setAudioUrl(audioUrl);

            const audioRes = await fetch(audioUrl);
            const audioBlob = await audioRes.blob();
            const audioName = result.audio_url.split('/').pop();
            const file = new File([audioBlob], audioName, { type: audioBlob.type });
            setAudioFile(file);

            setCurrentPackId(id);
            setIsPlaying(true); // Auto-play on navigation
            setCurrentTime(0);  // Reset time
            setView('player');

            // Force scroll to top after a short delay to allow rendering
            setTimeout(() => {
                const firstSlide = result.presentation.slides[0];
                if (firstSlide) {
                    document.getElementById(`slide-thumb-${firstSlide.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Also dispatch a custom event or use ref if needed for SlideViewer
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

                {view === 'player' && data && audioUrl && (
                    <div className="flex flex-col h-full">
                        <div className="flex-grow overflow-hidden relative">
                            {/* Main Content - Scrollable Slide List */}
                            <div className="absolute inset-0 p-4 overflow-y-auto">
                                {data.slides.length > 0 ? (
                                    <SlideViewer
                                        slides={data.slides}
                                        currentSlideId={activeSlideId}
                                        onSlideClick={(timestamp) => setCurrentTime(timestamp + 0.1)}
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
        </div>
    );
}

export default App;
