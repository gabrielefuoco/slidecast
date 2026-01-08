import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileAudio, FileText, FileJson, Package, Loader2, Play, RefreshCw, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';

interface UploadDashboardProps {
    onUploadComplete: (data: any, audioFile: File) => void;
}

type Mode = 'generate' | 'import' | 'slidepack';

export const UploadDashboard: React.FC<UploadDashboardProps> = ({ onUploadComplete }) => {
    const [mode, setMode] = useState<Mode>('generate');
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [mdFile, setMdFile] = useState<File | null>(null);
    const [jsonFile, setJsonFile] = useState<File | null>(null);
    const [slidepackFile, setSlidepackFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onDropAudio = useCallback((acceptedFiles: File[]) => {
        setAudioFile(acceptedFiles[0]);
    }, []);

    const onDropMd = useCallback((acceptedFiles: File[]) => {
        setMdFile(acceptedFiles[0]);
    }, []);

    const onDropJson = useCallback((acceptedFiles: File[]) => {
        setJsonFile(acceptedFiles[0]);
    }, []);

    const onDropSlidepack = useCallback((acceptedFiles: File[]) => {
        setSlidepackFile(acceptedFiles[0]);
    }, []);

    const { getRootProps: getAudioRootProps, getInputProps: getAudioInputProps, isDragActive: isAudioDragActive } = useDropzone({
        onDrop: onDropAudio,
        accept: { 'audio/*': ['.mp3', '.wav', '.m4a'] },
        maxFiles: 1
    });

    const { getRootProps: getMdRootProps, getInputProps: getMdInputProps, isDragActive: isMdDragActive } = useDropzone({
        onDrop: onDropMd,
        accept: { 'text/markdown': ['.md'], 'text/plain': ['.txt'] },
        maxFiles: 1
    });

    const { getRootProps: getJsonRootProps, getInputProps: getJsonInputProps, isDragActive: isJsonDragActive } = useDropzone({
        onDrop: onDropJson,
        accept: { 'application/json': ['.json'] },
        maxFiles: 1
    });

    const { getRootProps: getSlidepackRootProps, getInputProps: getSlidepackInputProps, isDragActive: isSlidepackDragActive } = useDropzone({
        onDrop: onDropSlidepack,
        accept: { 'application/zip': ['.slidepack', '.zip'] },
        maxFiles: 1
    });

    // Generate mode: requires audio + markdown
    const handleGenerate = async () => {
        if (!audioFile || !mdFile) return;

        setIsProcessing(true);
        setError(null);

        const formData = new FormData();
        formData.append('audio', audioFile);
        formData.append('markdown', mdFile);

        try {
            const response = await fetch('http://localhost:8000/generate', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Generation failed');
            }

            const data = await response.json();
            onUploadComplete(data, audioFile);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsProcessing(false);
        }
    };

    // Import mode: requires json + audio (for sync)
    const handleImport = async () => {
        if (!jsonFile || !audioFile) return;

        setIsProcessing(true);
        setError(null);

        const formData = new FormData();
        formData.append('slides_json', jsonFile);
        formData.append('audio', audioFile);

        try {
            const response = await fetch('http://localhost:8000/sync', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Import/Sync failed');
            }

            const data = await response.json();
            onUploadComplete(data, audioFile);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsProcessing(false);
        }
    };

    // Slidepack mode: import .slidepack bundle
    const handleSlidepackImport = async () => {
        if (!slidepackFile) return;

        setIsProcessing(true);
        setError(null);

        const formData = new FormData();
        formData.append('slidepack', slidepackFile);

        try {
            const response = await fetch('http://localhost:8000/import-slidepack', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Slidepack import failed');
            }

            const result = await response.json();

            // Fetch the audio from the server and create a File object
            const audioResponse = await fetch(`http://localhost:8000${result.audio_url}`);
            const audioBlob = await audioResponse.blob();
            const audioFileName = result.audio_url.split('/').pop() || 'audio.mp3';
            const audioFile = new File([audioBlob], audioFileName, { type: audioBlob.type });

            onUploadComplete(result.presentation, audioFile);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsProcessing(false);
        }
    };

    const canGenerate = mode === 'generate' && audioFile && mdFile;
    const canImport = mode === 'import' && audioFile && jsonFile;
    const canSlidepack = mode === 'slidepack' && slidepackFile;
    const canSubmit = canGenerate || canImport || canSlidepack;

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 p-8 text-white font-sans">
            <div className="w-full max-w-5xl text-center space-y-8">
                <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent pb-2">
                    AudioSlide AI
                </h1>
                <p className="text-neutral-400 text-lg">Turn your lectures into synchronized slides instantly.</p>

                {/* Mode Selector */}
                <div className="flex items-center justify-center gap-4 mt-8">
                    <button
                        onClick={() => setMode('generate')}
                        className={cn(
                            "px-6 py-3 rounded-2xl font-semibold transition-all flex items-center gap-2",
                            mode === 'generate'
                                ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg"
                                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                        )}
                    >
                        <Play className="w-4 h-4" />
                        Genera Nuove Slide
                    </button>
                    <button
                        onClick={() => setMode('import')}
                        className={cn(
                            "px-6 py-3 rounded-2xl font-semibold transition-all flex items-center gap-2",
                            mode === 'import'
                                ? "bg-gradient-to-r from-green-500 to-teal-500 text-white shadow-lg"
                                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                        )}
                    >
                        <RefreshCw className="w-4 h-4" />
                        Importa JSON + Sincronizza
                    </button>
                    <button
                        onClick={() => setMode('slidepack')}
                        className={cn(
                            "px-6 py-3 rounded-2xl font-semibold transition-all flex items-center gap-2",
                            mode === 'slidepack'
                                ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg"
                                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                        )}
                    >
                        <Package className="w-4 h-4" />
                        Apri Slidepack
                    </button>
                </div>

                <div className={cn(
                    "grid gap-6 mt-8",
                    mode === 'slidepack' ? "grid-cols-1 max-w-md mx-auto" : "grid-cols-1 md:grid-cols-2"
                )}>
                    {/* Audio Dropzone - Not shown for slidepack mode */}
                    {mode !== 'slidepack' && (
                        <div
                            {...getAudioRootProps()}
                            className={cn(
                                "border-2 border-dashed rounded-3xl h-56 flex flex-col items-center justify-center transition-all cursor-pointer bg-neutral-900/50 backdrop-blur-sm",
                                isAudioDragActive ? "border-blue-500 bg-blue-500/10" : "border-neutral-800 hover:border-neutral-700",
                                audioFile ? "border-blue-500/50" : ""
                            )}
                        >
                            <input {...getAudioInputProps()} />
                            {audioFile ? (
                                <div className="space-y-3 text-center">
                                    <div className="p-3 bg-blue-500/20 rounded-full inline-block">
                                        <FileAudio className="w-8 h-8 text-blue-400" />
                                    </div>
                                    <p className="font-medium text-blue-100 text-sm">{audioFile.name}</p>
                                </div>
                            ) : (
                                <div className="space-y-3 text-neutral-500 text-center">
                                    <Upload className="w-8 h-8 mx-auto opacity-50" />
                                    <p className="text-sm">Audio File (.mp3, .wav)</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Markdown Dropzone - Only for Generate mode */}
                    {mode === 'generate' && (
                        <div
                            {...getMdRootProps()}
                            className={cn(
                                "border-2 border-dashed rounded-3xl h-56 flex flex-col items-center justify-center transition-all cursor-pointer bg-neutral-900/50 backdrop-blur-sm",
                                isMdDragActive ? "border-purple-500 bg-purple-500/10" : "border-neutral-800 hover:border-neutral-700",
                                mdFile ? "border-purple-500/50" : ""
                            )}
                        >
                            <input {...getMdInputProps()} />
                            {mdFile ? (
                                <div className="space-y-3 text-center">
                                    <div className="p-3 bg-purple-500/20 rounded-full inline-block">
                                        <FileText className="w-8 h-8 text-purple-400" />
                                    </div>
                                    <p className="font-medium text-purple-100 text-sm">{mdFile.name}</p>
                                </div>
                            ) : (
                                <div className="space-y-3 text-neutral-500 text-center">
                                    <Upload className="w-8 h-8 mx-auto opacity-50" />
                                    <p className="text-sm">Markdown File (.md)</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* JSON Dropzone - Only for Import mode */}
                    {mode === 'import' && (
                        <div
                            {...getJsonRootProps()}
                            className={cn(
                                "border-2 border-dashed rounded-3xl h-56 flex flex-col items-center justify-center transition-all cursor-pointer bg-neutral-900/50 backdrop-blur-sm",
                                isJsonDragActive ? "border-green-500 bg-green-500/10" : "border-neutral-800 hover:border-neutral-700",
                                jsonFile ? "border-green-500/50" : ""
                            )}
                        >
                            <input {...getJsonInputProps()} />
                            {jsonFile ? (
                                <div className="space-y-3 text-center">
                                    <div className="p-3 bg-green-500/20 rounded-full inline-block">
                                        <FileJson className="w-8 h-8 text-green-400" />
                                    </div>
                                    <p className="font-medium text-green-100 text-sm">{jsonFile.name}</p>
                                </div>
                            ) : (
                                <div className="space-y-3 text-neutral-500 text-center">
                                    <Upload className="w-8 h-8 mx-auto opacity-50" />
                                    <p className="text-sm">Slide JSON File (.json)</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Slidepack Dropzone - Only for slidepack mode */}
                    {mode === 'slidepack' && (
                        <div
                            {...getSlidepackRootProps()}
                            className={cn(
                                "border-2 border-dashed rounded-3xl h-56 flex flex-col items-center justify-center transition-all cursor-pointer bg-neutral-900/50 backdrop-blur-sm",
                                isSlidepackDragActive ? "border-orange-500 bg-orange-500/10" : "border-neutral-800 hover:border-neutral-700",
                                slidepackFile ? "border-orange-500/50" : ""
                            )}
                        >
                            <input {...getSlidepackInputProps()} />
                            {slidepackFile ? (
                                <div className="space-y-3 text-center">
                                    <div className="p-3 bg-orange-500/20 rounded-full inline-block">
                                        <Package className="w-8 h-8 text-orange-400" />
                                    </div>
                                    <p className="font-medium text-orange-100 text-sm">{slidepackFile.name}</p>
                                </div>
                            ) : (
                                <div className="space-y-3 text-neutral-500 text-center">
                                    <Package className="w-8 h-8 mx-auto opacity-50" />
                                    <p className="text-sm">Slidepack File (.slidepack)</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {error && (
                    <div className="bg-red-500/10 text-red-500 p-4 rounded-xl border border-red-500/20">
                        {error}
                    </div>
                )}

                <button
                    onClick={mode === 'generate' ? handleGenerate : mode === 'import' ? handleImport : handleSlidepackImport}
                    disabled={!canSubmit || isProcessing}
                    className={cn(
                        "group relative px-8 py-4 font-bold rounded-full text-lg transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100",
                        mode === 'generate'
                            ? "bg-white text-black"
                            : "bg-gradient-to-r from-green-500 to-teal-500 text-white",
                        !canSubmit && "opacity-50 cursor-not-allowed"
                    )}
                >
                    {isProcessing ? (
                        <span className="flex items-center gap-2">
                            <Loader2 className="animate-spin w-5 h-5" />
                            {mode === 'generate' ? 'Generating...' : 'Syncing...'}
                        </span>
                    ) : (
                        <span className="flex items-center gap-2">
                            {mode === 'generate' ? 'Start Generation' : 'Import & Sync'}
                            <ArrowRight className="w-4 h-4" />
                        </span>
                    )}
                </button>

                {mode === 'import' && (
                    <p className="text-neutral-500 text-sm">
                        💡 Importa un JSON esportato precedentemente e sincronizzalo con un nuovo audio
                    </p>
                )}
            </div>
        </div>
    );
};

