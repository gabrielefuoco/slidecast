import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileAudio, FileText, FileJson, Package, Loader2, Play, RefreshCw, ArrowRight, Link, Trash2, Plus } from 'lucide-react';
import { cn } from '../lib/utils';

interface UploadDashboardProps {
    onUploadComplete: (data: any, audioFile: File) => void;
}

type Mode = 'generate' | 'import' | 'slidepack' | 'batch';

interface FilePair {
    id: string;
    audio: File;
    md: File;
}

export const UploadDashboard: React.FC<UploadDashboardProps> = ({ onUploadComplete }) => {
    const [mode, setMode] = useState<Mode>('generate');
    // Single file states
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [mdFile, setMdFile] = useState<File | null>(null);
    const [jsonFile, setJsonFile] = useState<File | null>(null);
    const [slidepackFile, setSlidepackFile] = useState<File | null>(null);

    // Batch file states (Pool + Pairs)
    const [unpairedAudio, setUnpairedAudio] = useState<File[]>([]);
    const [unpairedMd, setUnpairedMd] = useState<File[]>([]);
    const [pairs, setPairs] = useState<FilePair[]>([]);

    // Selection state for manual pairing
    const [selectedAudioIdx, setSelectedAudioIdx] = useState<number | null>(null);
    const [selectedMdIdx, setSelectedMdIdx] = useState<number | null>(null);

    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [uploadMessage, setUploadMessage] = useState<string | null>(null);

    // Helper to generate IDs
    const generateId = () => crypto.randomUUID();

    const addBatchFiles = (newAudio: File[], newMd: File[]) => {
        let currentPairs = [...pairs];
        let currentAudio = [...unpairedAudio, ...newAudio];
        let currentMd = [...unpairedMd, ...newMd];

        const newPairs: FilePair[] = [];
        const remainingAudio: File[] = [];
        // Mutable tracking for MD usage in this operation
        const usedMdIndices = new Set<number>();

        const getBase = (name: string) => name.replace(/\.[^/.]+$/, "");

        currentAudio.forEach(audio => {
            const audioBase = getBase(audio.name);
            const matchIndex = currentMd.findIndex((md, idx) =>
                !usedMdIndices.has(idx) && getBase(md.name) === audioBase
            );

            if (matchIndex !== -1) {
                usedMdIndices.add(matchIndex);
                newPairs.push({
                    id: generateId(),
                    audio,
                    md: currentMd[matchIndex]
                });
            } else {
                remainingAudio.push(audio);
            }
        });

        const remainingMd = currentMd.filter((_, idx) => !usedMdIndices.has(idx));

        setPairs([...currentPairs, ...newPairs]);
        setUnpairedAudio(remainingAudio);
        setUnpairedMd(remainingMd);
    };

    const handleManualPair = () => {
        if (selectedAudioIdx === null || selectedMdIdx === null) return;

        const audio = unpairedAudio[selectedAudioIdx];
        const md = unpairedMd[selectedMdIdx];

        const newPair: FilePair = {
            id: generateId(),
            audio,
            md
        };

        setPairs([...pairs, newPair]);

        setUnpairedAudio(unpairedAudio.filter((_, i) => i !== selectedAudioIdx));
        setUnpairedMd(unpairedMd.filter((_, i) => i !== selectedMdIdx));

        setSelectedAudioIdx(null);
        setSelectedMdIdx(null);
    };

    const handleUnpair = (pairId: string) => {
        const pair = pairs.find(p => p.id === pairId);
        if (!pair) return;

        setPairs(pairs.filter(p => p.id !== pairId));
        setUnpairedAudio([...unpairedAudio, pair.audio]);
        setUnpairedMd([...unpairedMd, pair.md]);
    };

    const onDropAudio = useCallback((acceptedFiles: File[]) => {
        if (mode === 'batch') {
            addBatchFiles(acceptedFiles, []);
        } else {
            setAudioFile(acceptedFiles[0]);
        }
    }, [mode, pairs, unpairedAudio, unpairedMd]);

    const onDropMd = useCallback((acceptedFiles: File[]) => {
        if (mode === 'batch') {
            addBatchFiles([], acceptedFiles);
        } else {
            setMdFile(acceptedFiles[0]);
        }
    }, [mode, pairs, unpairedAudio, unpairedMd]);

    const onDropJson = useCallback((acceptedFiles: File[]) => {
        setJsonFile(acceptedFiles[0]);
    }, []);

    const onDropSlidepack = useCallback((acceptedFiles: File[]) => {
        setSlidepackFile(acceptedFiles[0]);
    }, []);

    const { getRootProps: getAudioRootProps, getInputProps: getAudioInputProps, isDragActive: isAudioDragActive } = useDropzone({
        onDrop: onDropAudio,
        accept: { 'audio/*': ['.mp3', '.wav', '.m4a'] },
        maxFiles: mode === 'batch' ? undefined : 1,
        multiple: mode === 'batch'
    });

    const { getRootProps: getMdRootProps, getInputProps: getMdInputProps, isDragActive: isMdDragActive } = useDropzone({
        onDrop: onDropMd,
        accept: { 'text/markdown': ['.md'], 'text/plain': ['.txt'] },
        maxFiles: mode === 'batch' ? undefined : 1,
        multiple: mode === 'batch'
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

    // ... existing handlers ...
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

    // Batch Upload Handler
    const handleBatchUpload = async () => {
        if (pairs.length === 0) return;

        setIsProcessing(true);
        setError(null);
        setUploadMessage("Uploading and queueing batch job...");

        const formData = new FormData();

        // Process pairs to ensure matching filenames if they differ
        pairs.forEach(pair => {
            const audioName = pair.audio.name;
            const mdName = pair.md.name;
            const audioBase = audioName.replace(/\.[^/.]+$/, "");
            const mdBase = mdName.replace(/\.[^/.]+$/, "");

            if (audioBase === mdBase) {
                // Names match, send as is
                formData.append('audio_files', pair.audio);
                formData.append('md_files', pair.md);
            } else {
                // Names differ, rename both to a common identifier
                const commonName = `batch_${pair.id}`;
                const audioExt = audioName.split('.').pop();
                const mdExt = mdName.split('.').pop();

                const newAudio = new File([pair.audio], `${commonName}.${audioExt}`, { type: pair.audio.type });
                const newMd = new File([pair.md], `${commonName}.${mdExt}`, { type: pair.md.type });

                formData.append('audio_files', newAudio);
                formData.append('md_files', newMd);
            }
        });

        try {
            const response = await fetch('http://localhost:8000/upload-batch/', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Batch upload failed');
            }

            const result = await response.json();
            setUploadMessage(`Success! Course ID: ${result.course_id}. Processing started for ${result.pairs_count} pairs. Check Library.`);

            // Clear files after success
            setPairs([]);
            setUnpairedAudio([]);
            setUnpairedMd([]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
            setUploadMessage(null);
        } finally {
            setIsProcessing(false);
        }
    };


    const canGenerate = mode === 'generate' && audioFile && mdFile;
    const canImport = mode === 'import' && audioFile && jsonFile;
    const canSlidepack = mode === 'slidepack' && slidepackFile;
    const canBatch = mode === 'batch' && pairs.length > 0;


    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 p-8 text-white font-sans w-full">
            <div className="w-full max-w-6xl text-center space-y-8">
                <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent pb-2">
                    AudioSlide AI
                </h1>
                <p className="text-neutral-400 text-lg">Turn your lectures into synchronized slides instantly.</p>

                {/* Mode Selector */}
                <div className="flex flex-wrap items-center justify-center gap-4 mt-8">
                    <button
                        onClick={() => { setMode('generate'); setError(null); setUploadMessage(null); }}
                        className={cn(
                            "px-6 py-3 rounded-2xl font-semibold transition-all flex items-center gap-2",
                            mode === 'generate'
                                ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg"
                                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                        )}
                    >
                        <Play className="w-4 h-4" />
                        Genera
                    </button>
                    <button
                        onClick={() => { setMode('batch'); setError(null); setUploadMessage(null); }}
                        className={cn(
                            "px-6 py-3 rounded-2xl font-semibold transition-all flex items-center gap-2",
                            mode === 'batch'
                                ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg"
                                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                        )}
                    >
                        <Package className="w-4 h-4" />
                        Batch Upload
                    </button>
                    <button
                        onClick={() => { setMode('import'); setError(null); setUploadMessage(null); }}
                        className={cn(
                            "px-6 py-3 rounded-2xl font-semibold transition-all flex items-center gap-2",
                            mode === 'import'
                                ? "bg-gradient-to-r from-green-500 to-teal-500 text-white shadow-lg"
                                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                        )}
                    >
                        <RefreshCw className="w-4 h-4" />
                        Sync JSON
                    </button>
                    <button
                        onClick={() => { setMode('slidepack'); setError(null); setUploadMessage(null); }}
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
                    mode === 'batch' ? "grid-cols-1 lg:grid-cols-2" :
                        mode === 'slidepack' ? "grid-cols-1 max-w-md mx-auto" : "grid-cols-1 md:grid-cols-2"
                )}>
                    {/* Audio Dropzone */}
                    {mode !== 'slidepack' && (
                        <div
                            {...getAudioRootProps()}
                            className={cn(
                                "border-2 border-dashed rounded-3xl h-56 flex flex-col items-center justify-center transition-all cursor-pointer bg-neutral-900/50 backdrop-blur-sm",
                                isAudioDragActive ? "border-blue-500 bg-blue-500/10" : "border-neutral-800 hover:border-neutral-700",
                                (mode === 'generate' && audioFile) || (mode === 'batch' && unpairedAudio.length > 0) || (mode === 'import' && audioFile) ? "border-blue-500/50" : ""
                            )}
                        >
                            <input {...getAudioInputProps()} />
                            {(mode === 'batch' ? unpairedAudio.length > 0 : audioFile) ? (
                                <div className="space-y-3 text-center">
                                    <div className="p-3 bg-blue-500/20 rounded-full inline-block">
                                        <FileAudio className="w-8 h-8 text-blue-400" />
                                    </div>
                                    {mode === 'batch' ? (
                                        <p className="font-medium text-blue-100 text-sm">{unpairedAudio.length} file audio non accoppiati</p>
                                    ) : (
                                        <p className="font-medium text-blue-100 text-sm">{audioFile?.name}</p>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-3 text-neutral-500 text-center">
                                    <Upload className="w-8 h-8 mx-auto opacity-50" />
                                    <p className="text-sm">
                                        {mode === 'batch' ? 'Trascina file audio (.mp3)' : 'Audio File (.mp3, .wav)'}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Markdown Dropzone - Generate & Batch */}
                    {(mode === 'generate' || mode === 'batch') && (
                        <div
                            {...getMdRootProps()}
                            className={cn(
                                "border-2 border-dashed rounded-3xl h-56 flex flex-col items-center justify-center transition-all cursor-pointer bg-neutral-900/50 backdrop-blur-sm",
                                isMdDragActive ? "border-purple-500 bg-purple-500/10" : "border-neutral-800 hover:border-neutral-700",
                                (mode === 'generate' && mdFile) || (mode === 'batch' && unpairedMd.length > 0) ? "border-purple-500/50" : ""
                            )}
                        >
                            <input {...getMdInputProps()} />
                            {(mode === 'batch' ? unpairedMd.length > 0 : mdFile) ? (
                                <div className="space-y-3 text-center">
                                    <div className="p-3 bg-purple-500/20 rounded-full inline-block">
                                        <FileText className="w-8 h-8 text-purple-400" />
                                    </div>
                                    {mode === 'batch' ? (
                                        <p className="font-medium text-purple-100 text-sm">{unpairedMd.length} file MD non accoppiati</p>
                                    ) : (
                                        <p className="font-medium text-purple-100 text-sm">{mdFile?.name}</p>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-3 text-neutral-500 text-center">
                                    <Upload className="w-8 h-8 mx-auto opacity-50" />
                                    <p className="text-sm">
                                        {mode === 'batch' ? 'Trascina file MD (.md)' : 'Markdown File (.md)'}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* JSON and Slidepack Dropzones (Unchanged) */}
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

                {/* Batch Manual Pairing UI */}
                {mode === 'batch' && (
                    <div className="space-y-6">
                        {/* Unpaired Files Lists */}
                        {(unpairedAudio.length > 0 || unpairedMd.length > 0) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-neutral-900/30 p-4 rounded-3xl border border-white/10">
                                <div className="space-y-2">
                                    <h3 className="text-sm font-semibold text-blue-400 mb-2">Audio Non Accoppiati</h3>
                                    <div className="space-y-1 max-h-40 overflow-y-auto pr-2">
                                        {unpairedAudio.map((file, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => setSelectedAudioIdx(selectedAudioIdx === idx ? null : idx)}
                                                className={cn(
                                                    "p-2 rounded-lg text-sm cursor-pointer transition-all truncate",
                                                    selectedAudioIdx === idx
                                                        ? "bg-blue-500/20 text-blue-200 border border-blue-500/30"
                                                        : "bg-neutral-800/50 hover:bg-neutral-800 text-neutral-400"
                                                )}
                                            >
                                                {file.name}
                                            </div>
                                        ))}
                                        {unpairedAudio.length === 0 && <span className="text-neutral-600 text-xs italic">Nessun file</span>}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="text-sm font-semibold text-purple-400 mb-2">Markdown Non Accoppiati</h3>
                                    <div className="space-y-1 max-h-40 overflow-y-auto pr-2">
                                        {unpairedMd.map((file, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => setSelectedMdIdx(selectedMdIdx === idx ? null : idx)}
                                                className={cn(
                                                    "p-2 rounded-lg text-sm cursor-pointer transition-all truncate",
                                                    selectedMdIdx === idx
                                                        ? "bg-purple-500/20 text-purple-200 border border-purple-500/30"
                                                        : "bg-neutral-800/50 hover:bg-neutral-800 text-neutral-400"
                                                )}
                                            >
                                                {file.name}
                                            </div>
                                        ))}
                                        {unpairedMd.length === 0 && <span className="text-neutral-600 text-xs italic">Nessun file</span>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Pair Button */}
                        <div className="flex justify-center">
                            <button
                                onClick={handleManualPair}
                                disabled={selectedAudioIdx === null || selectedMdIdx === null}
                                className={cn(
                                    "flex items-center gap-2 px-6 py-2 rounded-full font-medium transition-all",
                                    (selectedAudioIdx !== null && selectedMdIdx !== null)
                                        ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg hover:shadow-xl hover:scale-105"
                                        : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                                )}
                            >
                                <Link className="w-4 h-4" />
                                Accoppia Manualmente
                            </button>
                        </div>

                        {/* Pairs List */}
                        {pairs.length > 0 && (
                            <div className="bg-neutral-900/50 p-6 rounded-3xl border border-white/5 space-y-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Package className="w-5 h-5 text-pink-500" />
                                    Coppie Pronte ({pairs.length})
                                </h3>
                                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                                    {pairs.map((pair) => (
                                        <div key={pair.id} className="flex items-center justify-between bg-neutral-800/50 p-3 rounded-xl border border-white/5 group hover:border-white/10 transition-all">
                                            <div className="flex items-center gap-4 flex-1 min-w-0">
                                                <div className="flex items-center gap-2 text-blue-300 min-w-0 flex-1">
                                                    <FileAudio className="w-4 h-4 shrink-0" />
                                                    <span className="truncate text-sm" title={pair.audio.name}>{pair.audio.name}</span>
                                                </div>
                                                <div className="w-px h-8 bg-white/10 shrink-0" />
                                                <div className="flex items-center gap-2 text-purple-300 min-w-0 flex-1">
                                                    <FileText className="w-4 h-4 shrink-0" />
                                                    <span className="truncate text-sm" title={pair.md.name}>{pair.md.name}</span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleUnpair(pair.id)}
                                                className="ml-4 p-2 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors"
                                                title="Scollega"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {error && (
                    <div className="bg-red-500/10 text-red-500 p-4 rounded-xl border border-red-500/20">
                        {error}
                    </div>
                )}

                {uploadMessage && (
                    <div className="bg-green-500/10 text-green-400 p-4 rounded-xl border border-green-500/20">
                        {uploadMessage}
                    </div>
                )}

                <button
                    onClick={() => {
                        if (mode === 'generate') handleGenerate();
                        else if (mode === 'import') handleImport();
                        else if (mode === 'slidepack') handleSlidepackImport();
                        else if (mode === 'batch') handleBatchUpload();
                    }}
                    disabled={(!canGenerate && !canImport && !canSlidepack && !canBatch) || isProcessing}
                    className={cn(
                        "group relative px-8 py-4 font-bold rounded-full text-lg transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100",
                        mode === 'generate' ? "bg-white text-black" :
                            mode === 'batch' ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white" :
                                mode === 'import' ? "bg-gradient-to-r from-green-500 to-teal-500 text-white" :
                                    "bg-gradient-to-r from-orange-500 to-amber-500 text-white", // slidepack
                        (!canGenerate && !canImport && !canSlidepack && !canBatch) && "opacity-50 cursor-not-allowed"
                    )}
                >
                    {isProcessing ? (
                        <span className="flex items-center gap-2">
                            <Loader2 className="animate-spin w-5 h-5" />
                            {mode === 'batch' ? 'Uploading...' : 'Processing...'}
                        </span>
                    ) : (
                        <span className="flex items-center gap-2">
                            {mode === 'generate' ? 'Start Generation' :
                                mode === 'batch' ? `Avvia Batch Upload (${pairs.length})` :
                                    mode === 'import' ? 'Import & Sync' :
                                        'Apri Slidepack'}
                            <ArrowRight className="w-4 h-4" />
                        </span>
                    )}
                </button>

                {mode === 'import' && (
                    <p className="text-neutral-500 text-sm">
                        💡 Importa un JSON esportato precedentemente e sincronizzalo con un nuovo audio
                    </p>
                )}

                {mode === 'batch' && (
                    <p className="text-neutral-500 text-sm">
                        💡 Carica più file. Quelli con lo stesso nome vengono accoppiati automaticamente. Usa i controlli sopra per accoppiare file con nomi diversi.
                    </p>
                )}
            </div>
        </div>
    );
};
