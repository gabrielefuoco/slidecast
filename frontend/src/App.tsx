import React, { useState, useEffect } from 'react';
import { UploadDashboard } from './components/UploadDashboard';
import { SlideViewer } from './components/SlideViewer';
import { Player } from './components/Player';
import { cn } from './lib/utils';
import { LayoutList, Download, Package } from 'lucide-react';
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

function App() {
    const [data, setData] = useState<PresentationData | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [audioFile, setAudioFile] = useState<File | null>(null);

    // Player State
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    // Current Slide ID for highlighting
    // Use the last started slide if in a gap, to prevent jumping to start
    // We filter slides that started before or at currentTime, and take the last one (highest timestamp)
    const currentSlide = data?.slides
        .filter(s => s.timestamp_start <= currentTime)
        .sort((a, b) => b.timestamp_start - a.timestamp_start)[0]
        || data?.slides[0];

    const activeSlideId = currentSlide?.id || 0;

    const handleUploadComplete = (presentationData: PresentationData, audio: File) => {
        setData(presentationData);
        setAudioFile(audio);
        setAudioUrl(URL.createObjectURL(audio));
    };

    // Scroll to active slide in sidebar
    useEffect(() => {
        if (activeSlideId) {
            document.getElementById(`slide-thumb-${activeSlideId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [activeSlideId]);

    // Export JSON only
    const handleExportJSON = () => {
        if (!data) return;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${data.metadata?.title || 'presentazione'}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

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

    if (!data || !audioUrl) {
        return <UploadDashboard onUploadComplete={handleUploadComplete} />;
    }

    return (
        <div className="h-screen bg-neutral-950 text-white overflow-hidden flex flex-col">
            {/* Navbar / Header */}
            <header className="h-16 border-b border-white/10 flex items-center px-8 justify-between bg-neutral-900/50 backdrop-blur-md z-40">
                <div className="font-bold text-xl tracking-tight">AudioSlide AI</div>
                <div className="text-sm font-medium text-neutral-400">{data.metadata?.title}</div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExportJSON}
                        className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-medium transition-all"
                        title="Esporta solo JSON"
                    >
                        <Download className="w-4 h-4" />
                        JSON
                    </button>
                    <button
                        onClick={handleExportSlidepack}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 rounded-xl text-sm font-medium transition-all"
                        title="Esporta slidepack completo (JSON + Audio)"
                    >
                        <Package className="w-4 h-4" />
                        Esporta Slidepack
                    </button>
                </div>
            </header>

            <div className="flex-grow flex overflow-hidden pb-24 relative">
                {/* Main Content - Scrollable Slide List */}
                <div className="flex-grow p-4 overflow-hidden">
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
            />
        </div>
    );
}

export default App;

