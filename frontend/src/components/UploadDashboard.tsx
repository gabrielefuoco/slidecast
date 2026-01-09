import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileAudio, FileText, Package, Upload, ArrowRight, Loader2, Link as LinkIcon, Trash2, AlertCircle, CheckCircle, Ban, HISTORY } from 'lucide-react';
import { cn } from '../lib/utils';

// Types
interface UploadDashboardProps {
    onUploadComplete: (data: any, audioFile: File) => void;
}

type ProcessingStatus = 'idle' | 'waiting' | 'uploading' | 'done' | 'error';

interface FilePair {
    id: string;
    audio: File;
    md: File;
    status: ProcessingStatus;
    error?: string;
}

interface OrphanFile {
    id: string;
    file: File;
    type: 'audio' | 'text';
}

interface SlidepackItem {
    id: string;
    file: File;
    status: ProcessingStatus;
    error?: string;
}

const generateId = () => crypto.randomUUID();

export const UploadDashboard: React.FC<UploadDashboardProps> = ({ onUploadComplete }) => {
    // State
    const [pairs, setPairs] = useState<FilePair[]>([]);
    const [orphans, setOrphans] = useState<OrphanFile[]>([]);
    const [slidepacks, setSlidepacks] = useState<SlidepackItem[]>([]);

    // Processed Queue (Items that have been sent)
    const [processedItems, setProcessedItems] = useState<{
        id: string,
        name: string,
        type: 'pair' | 'pack',
        status: 'uploading' | 'done' | 'error',
        error?: string
    }[]>([]);

    // Global processing state (is dispatching?)
    const [isDispatching, setIsDispatching] = useState(false);

    // Drag State for Validation
    const [draggedItem, setDraggedItem] = useState<{ id: string, type: 'audio' | 'text' } | null>(null);

    // Helpers
    const getBaseName = (filename: string) => filename.replace(/\.[^/.]+$/, "");

    // 1. Files Handler & Auto-Pairing
    const processFiles = (newFiles: File[]) => {
        const newAudio: File[] = [];
        const newMd: File[] = [];
        const newPackFiles: File[] = [];

        newFiles.forEach(f => {
            const ext = f.name.toLowerCase().split('.').pop();
            if (['mp3', 'wav', 'm4a'].includes(ext || '')) {
                newAudio.push(f);
            } else if (['md', 'txt'].includes(ext || '')) {
                newMd.push(f);
            } else if (['slidepack', 'zip'].includes(ext || '')) {
                newPackFiles.push(f);
            }
        });

        // Add Slidepacks directly
        if (newPackFiles.length > 0) {
            setSlidepacks(prev => [
                ...prev,
                ...newPackFiles.map(f => ({ id: generateId(), file: f, status: 'idle' as const }))
            ]);
        }

        // Auto-Pairing Logic
        let currentOrphans = [...orphans];
        let currentPairs = [...pairs];

        const availableAudio = [...currentOrphans.filter(o => o.type === 'audio').map(o => o.file), ...newAudio];
        const availableMd = [...currentOrphans.filter(o => o.type === 'text').map(o => o.file), ...newMd];

        const nextPairs: FilePair[] = [...currentPairs];
        const nextOrphans: OrphanFile[] = [];
        const usedMdIndices = new Set<number>();

        availableAudio.forEach(audio => {
            const audioBase = getBaseName(audio.name);
            const matchIndex = availableMd.findIndex((md, idx) =>
                !usedMdIndices.has(idx) && getBaseName(md.name) === audioBase
            );

            if (matchIndex !== -1) {
                nextPairs.push({
                    id: generateId(),
                    audio: audio,
                    md: availableMd[matchIndex],
                    status: 'idle'
                });
                usedMdIndices.add(matchIndex);
            } else {
                nextOrphans.push({ id: generateId(), file: audio, type: 'audio' });
            }
        });

        availableMd.forEach((md, idx) => {
            if (!usedMdIndices.has(idx)) {
                nextOrphans.push({ id: generateId(), file: md, type: 'text' });
            }
        });

        setPairs(nextPairs);
        setOrphans(nextOrphans);
    };

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (isDispatching) return; // Prevent drops during upload
        processFiles(acceptedFiles);
    }, [orphans, pairs, slidepacks, isDispatching]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        disabled: isDispatching,
        accept: {
            'audio/*': ['.mp3', '.wav', '.m4a'],
            'text/markdown': ['.md'],
            'text/plain': ['.txt'],
            'application/zip': ['.slidepack', '.zip']
        }
    });

    // 2. Drag & Drop Validation Logic
    const handleDragStart = (e: React.DragEvent, id: string, type: 'audio' | 'text') => {
        if (isDispatching) {
            e.preventDefault();
            return;
        }
        setDraggedItem({ id, type });
        e.dataTransfer.setData('text/plain', JSON.stringify({ id, type }));
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
    };

    const isDropAllowed = (targetType: 'audio' | 'text') => {
        if (!draggedItem) return false;
        return draggedItem.type !== targetType; // Must be different types
    };

    const handleDragOver = (e: React.DragEvent, targetType: 'audio' | 'text') => {
        e.preventDefault();
        if (!isDropAllowed(targetType)) {
            e.dataTransfer.dropEffect = 'none';
        } else {
            e.dataTransfer.dropEffect = 'move';
        }
    };

    const handleDropPair = (e: React.DragEvent, targetId: string, targetType: 'audio' | 'text') => {
        e.preventDefault();
        setDraggedItem(null);

        if (!isDropAllowed(targetType)) return;

        try {
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            const sourceId = data.id;

            const sourceOrphan = orphans.find(o => o.id === sourceId);
            const targetOrphan = orphans.find(o => o.id === targetId);

            if (!sourceOrphan || !targetOrphan) return;

            const audio = sourceOrphan.type === 'audio' ? sourceOrphan.file : targetOrphan.file;
            const md = sourceOrphan.type === 'text' ? sourceOrphan.file : targetOrphan.file;

            const newPair: FilePair = {
                id: generateId(),
                audio,
                md,
                status: 'idle'
            };

            setPairs([...pairs, newPair]);
            setOrphans(orphans.filter(o => o.id !== sourceId && o.id !== targetId));

        } catch (err) {
            console.error("Drop pair error", err);
        }
    };

    // 3. Dispatcher logic
    const handleUnifiedSubmit = async () => {
        setIsDispatching(true);

        // Filter items to process
        const pairsToProcess = pairs.filter(p => p.status === 'idle' || p.status === 'error');
        const packsToProcess = slidepacks.filter(p => p.status === 'idle' || p.status === 'error');

        // Initial setup in Processed Queue
        const newProcessedPairs = pairsToProcess.map(p => ({
            id: p.id,
            name: p.audio.name,
            type: 'pair' as const,
            status: 'uploading' as const,
            error: undefined as string | undefined
        }));

        const newProcessedPacks = packsToProcess.map(p => ({
            id: p.id,
            name: p.file.name,
            type: 'pack' as const,
            status: 'uploading' as const,
            error: undefined as string | undefined
        }));

        setProcessedItems(prev => [...newProcessedPairs, ...newProcessedPacks, ...prev]);

        // Helpers to update status
        const updateStatus = (id: string, status: 'done' | 'error', error?: string) => {
            setProcessedItems(prev => prev.map(item =>
                item.id === id ? { ...item, status, error } : item
            ));
        };

        // EXECUTION - 1. Handle Pairs (Batch)
        // Note: Batch API returns immediately with a background task, so we mark as "done" (accepted)
        if (pairsToProcess.length > 0) {
            const formData = new FormData();
            pairsToProcess.forEach(pair => {
                const cleanName = pair.audio.name.replace(/\.[^/.]+$/, "");
                const extAudio = pair.audio.name.split('.').pop();
                const extMd = pair.md.name.split('.').pop();
                formData.append('audio_files', new File([pair.audio], `${cleanName}.${extAudio}`, { type: pair.audio.type }));
                formData.append('md_files', new File([pair.md], `${cleanName}.${extMd}`, { type: pair.md.type }));
            });

            try {
                const res = await fetch('/upload-batch/', { method: 'POST', body: formData });
                if (res.ok) {
                    newProcessedPairs.forEach(p => updateStatus(p.id, 'done'));
                } else {
                    const err = await res.text();
                    newProcessedPairs.forEach(p => updateStatus(p.id, 'error', err));
                }
            } catch (err) {
                console.error("Batch upload failed", err);
                newProcessedPairs.forEach(p => updateStatus(p.id, 'error', 'Network error'));
            }
        }

        // EXECUTION - 2. Handle Slidepacks (Parallel)
        await Promise.all(packsToProcess.map(async (pack) => {
            const formData = new FormData();
            formData.append('slidepack', pack.file);

            try {
                const res = await fetch('/import-slidepack', { method: 'POST', body: formData });
                if (res.ok) {
                    updateStatus(pack.id, 'done');
                } else {
                    const errJson = await res.json().catch(() => ({ detail: 'Unknown error' }));
                    updateStatus(pack.id, 'error', typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson));
                }
            } catch (err) {
                console.error("Slidepack import failed", err);
                updateStatus(pack.id, 'error', 'Network error');
            }
        }));

        // Clear active staging state logic
        const processingIds = new Set([...pairsToProcess.map(p => p.id), ...packsToProcess.map(p => p.id)]);
        setPairs(prev => prev.filter(p => !processingIds.has(p.id)));
        setSlidepacks(prev => prev.filter(s => !processingIds.has(s.id)));

        setIsDispatching(false);
    };


    const removePair = (id: string) => {
        if (isDispatching) return;
        const pair = pairs.find(p => p.id === id);
        if (!pair) return;
        setPairs(pairs.filter(p => p.id !== id));
        // Return files to orphans
        setOrphans(prev => [
            ...prev,
            { id: generateId(), file: pair.audio, type: 'audio' },
            { id: generateId(), file: pair.md, type: 'text' }
        ]);
    };

    const removeOrphan = (id: string) => {
        if (isDispatching) return;
        setOrphans(orphans.filter(o => o.id !== id));
    };

    const removeSlidepack = (id: string) => {
        if (isDispatching) return;
        setSlidepacks(slidepacks.filter(s => s.id !== id));
    };

    const dismissProcessed = (id: string) => {
        setProcessedItems(prev => prev.filter(item => item.id !== id));
    };

    const totalItems = pairs.length + slidepacks.length;
    const canProcess = totalItems > 0 && !isDispatching;

    // UI Helpers
    const getStatusIcon = (status: ProcessingStatus) => {
        if (status === 'uploading') return <Loader2 className="w-5 h-5 animate-spin text-blue-400" />;
        if (status === 'done') return <CheckCircle className="w-5 h-5 text-green-400" />;
        if (status === 'error') return <AlertCircle className="w-5 h-5 text-red-400" />;
        return null;
    };

    const getStatusClass = (status: ProcessingStatus) => {
        if (status === 'uploading') return "border-blue-500/50 bg-blue-500/5";
        if (status === 'done') return "border-green-500/50 bg-green-500/5 opacity-50";
        if (status === 'error') return "border-red-500/50 bg-red-500/5";
        return "border-green-500/30 bg-neutral-900/50";
    };

    return (
        <div className="flex flex-col items-center justify-start min-h-full p-8 text-white font-sans w-full max-w-7xl mx-auto pb-40">
            {/* Header */}
            <div className="text-center space-y-4 mb-8">
                <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                    Unified Smart Interface
                </h1>
                <p className="text-neutral-400 text-lg">
                    Drop everything here. We'll sort it out.
                </p>
            </div>

            {/* Smart Dropzone */}
            <div
                {...getRootProps()}
                className={cn(
                    "w-full h-48 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all cursor-pointer mb-12 relative overflow-hidden",
                    isDragActive
                        ? "border-blue-500 bg-blue-500/10 scale-105"
                        : "border-neutral-800 bg-neutral-900/30 hover:border-neutral-700 hover:bg-neutral-900/50",
                    isDispatching && "opacity-50 pointer-events-none"
                )}
            >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center gap-4 text-neutral-500">
                    <div className="p-4 bg-neutral-800 rounded-full">
                        <Upload className="w-8 h-8 opacity-50" />
                    </div>
                    <p className="text-lg font-medium">
                        Trascina qui le tue lezioni (Audio, Testi o Slidepack)
                    </p>
                    <p className="text-sm opacity-60">
                        Supporta .mp3, .wav, .m4a, .md, .txt, .zip, .slidepack
                    </p>
                </div>
            </div>

            {/* PROCESSED QUEUE section */}
            {processedItems.length > 0 && (
                <div className="w-full mb-12">
                    <div className="flex items-center gap-2 mb-4 text-neutral-400">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        <h3 className="text-sm font-bold uppercase tracking-wider">In Elaborazione ({processedItems.length})</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-70">
                        {processedItems.map(item => (
                            <div key={item.id} className={cn(
                                "p-4 rounded-xl border flex items-center justify-between transition-all",
                                item.status === 'uploading' ? "border-blue-500/30 bg-blue-900/10" :
                                    item.status === 'done' ? "border-green-500/30 bg-green-900/10" :
                                        "border-red-500/30 bg-red-900/10"
                            )}>
                                <span className="text-sm font-medium truncate flex-1 pr-4 text-white/80">{item.name}</span>
                                <div className={cn("text-xs flex items-center gap-2",
                                    item.status === 'uploading' ? "text-blue-400" :
                                        item.status === 'done' ? "text-green-400" : "text-red-400"
                                )}>
                                    {item.status === 'uploading' && <Loader2 className="w-3 h-3 animate-spin" />}
                                    {item.status === 'done' && <CheckCircle className="w-3 h-3" />}
                                    {item.status === 'error' && <AlertCircle className="w-3 h-3" />}

                                    {item.status === 'uploading' ? 'Caricamento...' :
                                        item.status === 'done' ? 'Completato' : 'Errore'}

                                    <button
                                        onClick={() => dismissProcessed(item.id)}
                                        className="p-1 hover:bg-white/10 rounded ml-2"
                                    >
                                        <Trash2 className="w-3 h-3 text-neutral-500" />
                                    </button>
                                </div>
                                {item.error && <div className="hidden">{item.error}</div> /* Potential tooltip in future */}
                            </div>
                        ))}
                    </div>
                    <div className="h-px bg-neutral-800 w-full mt-8" />
                </div>
            )}

            {/* Staging Area - Cards */}
            <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-24">

                {/* 1. PAIRS */}
                {pairs.map(pair => (
                    <div
                        key={pair.id}
                        className={cn(
                            "relative group p-4 rounded-2xl flex items-center justify-between border transition-all",
                            getStatusClass(pair.status)
                        )}
                    >
                        {/* Overlay status */}
                        {pair.status === 'done' && <div className="absolute inset-0 bg-green-500/10 z-0" />}

                        <div className="flex items-center gap-4 min-w-0 flex-1 z-10">
                            {/* Audio Icon */}
                            <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400 shrink-0">
                                <FileAudio className="w-5 h-5" />
                            </div>

                            <div className="h-px bg-white/10 flex-1 min-w-[20px]" />
                            <div className={cn("p-1 rounded-full", pair.status === 'error' ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400")}>
                                {getStatusIcon(pair.status) || <LinkIcon className="w-3 h-3" />}
                            </div>
                            <div className="h-px bg-white/10 flex-1 min-w-[20px]" />

                            <div className="p-2 bg-purple-500/20 rounded-lg text-purple-400 shrink-0">
                                <FileText className="w-5 h-5" />
                            </div>
                        </div>

                        {/* Info Tooltip */}
                        <div className="absolute inset-x-0 bottom-full mb-2 hidden group-hover:block bg-black/80 text-xs p-2 rounded-lg text-white text-center whitespace-pre-wrap z-20">
                            {pair.audio.name} + {pair.md.name}
                            {pair.error && <span className="text-red-400 block mt-1">{pair.error}</span>}
                        </div>

                        {/* Unlink Button (Only if idle/error) */}
                        {['idle', 'error'].includes(pair.status) && (
                            <button
                                onClick={(e) => { e.stopPropagation(); removePair(pair.id); }}
                                className="absolute -top-2 -right-2 p-1.5 bg-neutral-800 text-neutral-400 hover:text-red-400 rounded-full border border-white/10 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-20"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                ))}

                {/* 2. SLIDEPACKS */}
                {slidepacks.map(item => (
                    <div
                        key={item.id}
                        className={cn(
                            "relative bg-neutral-900/50 border p-4 rounded-2xl flex items-center gap-4",
                            item.status === 'error' ? "border-red-500/30 bg-red-500/5" :
                                item.status === 'done' ? "border-green-500/30 opacity-50" :
                                    item.status === 'uploading' ? "border-orange-500/50 bg-orange-500/5" : "border-orange-500/30"
                        )}
                    >
                        <div className="p-2 bg-orange-500/20 rounded-lg text-orange-400">
                            {getStatusIcon(item.status) || <Package className="w-6 h-6" />}
                        </div>
                        <div className="min-w-0">
                            <p className="font-medium text-white truncate text-sm">{item.file.name}</p>
                            <p className="text-xs text-orange-400/80">
                                {item.status === 'error' ? item.error :
                                    item.status === 'uploading' ? 'Importing...' :
                                        item.status === 'done' ? 'Imported' : 'Slidepack pronto'}
                            </p>
                        </div>
                        {['idle', 'error'].includes(item.status) && (
                            <button
                                onClick={() => removeSlidepack(item.id)}
                                className="absolute top-2 right-2 p-1 text-neutral-600 hover:text-red-400"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                ))}

                {/* 3. ORPHANS */}
                {orphans.map(orphan => {
                    const isTarget = draggedItem && draggedItem.type !== orphan.type && draggedItem.id !== orphan.id;
                    const isSource = draggedItem && draggedItem.id === orphan.id;
                    const canAcceptDrop = isTarget && draggedItem; // Valid drop target
                    const isInvalidDrop = draggedItem && draggedItem.type === orphan.type && draggedItem.id !== orphan.id; // Audio on Audio

                    return (
                        <div
                            key={orphan.id}
                            draggable={!isDispatching}
                            onDragStart={(e) => handleDragStart(e, orphan.id, orphan.type)}
                            onDragEnd={handleDragEnd}
                            onDragOver={(e) => handleDragOver(e, orphan.type)}
                            onDrop={(e) => handleDropPair(e, orphan.id, orphan.type)}
                            className={cn(
                                "relative p-4 rounded-2xl border-2 border-dashed flex items-center gap-4 transition-all",
                                isDispatching ? "opacity-50 cursor-not-allowed" : "cursor-move",
                                orphan.type === 'audio'
                                    ? "bg-blue-500/5 border-blue-500/30 hover:bg-blue-500/10"
                                    : "bg-purple-500/5 border-purple-500/30 hover:bg-purple-500/10",
                                isSource && "opacity-20",
                                canAcceptDrop && "ring-2 ring-green-500 scale-105 border-green-500 bg-green-500/10",
                                isInvalidDrop && isDragActive && "opacity-50" // Dim invalid targets slightly
                            )}
                        >
                            {orphan.type === 'audio' ? (
                                <>
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
                                            <FileAudio className="w-5 h-5" />
                                        </div>
                                        <span className="text-sm truncate text-blue-100/80">{orphan.file.name}</span>
                                    </div>
                                    <div className="w-12 h-12 rounded-lg border border-white/10 flex items-center justify-center text-xs text-neutral-600">
                                        {canAcceptDrop ? <CheckCircle className="w-6 h-6 text-green-500 animate-pulse" /> : <FileText className="w-4 h-4 opacity-50" />}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="w-12 h-12 rounded-lg border border-white/10 flex items-center justify-center text-xs text-neutral-600">
                                        {canAcceptDrop ? <CheckCircle className="w-6 h-6 text-green-500 animate-pulse" /> : <FileAudio className="w-4 h-4 opacity-50" />}
                                    </div>
                                    <div className="flex items-center gap-3 min-w-0 flex-1 justify-end">
                                        <span className="text-sm truncate text-purple-100/80">{orphan.file.name}</span>
                                        <div className="p-2 bg-purple-500/20 rounded-lg text-purple-400">
                                            <FileText className="w-5 h-5" />
                                        </div>
                                    </div>
                                </>
                            )}

                            {!isDispatching && (
                                <button
                                    onClick={() => removeOrphan(orphan.id)}
                                    className="absolute -top-2 -right-2 p-1 bg-neutral-800 rounded-full border border-white/10 hidden hover:block text-neutral-400 hover:text-red-400"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    );
                })}

            </div>

            {/* Generate Action Bar */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-50">
                <div className="bg-neutral-900/90 backdrop-blur-xl border border-neutral-700 p-4 rounded-3xl shadow-2xl flex items-center justify-between gap-6">

                    <div className="flex flex-col">
                        <span className="text-sm font-medium text-white flex items-center gap-2">
                            {orphans.length > 0 ? (
                                <>
                                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                                    {orphans.length} file incompleti saranno ignorati
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                    Tutto pronto
                                </>
                            )}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                            {isDispatching && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                            <span className="text-xs text-neutral-400">
                                {isDispatching
                                    ? `Avvio elaborazione...`
                                    : `${pairs.length} Coppie • ${slidepacks.length} Slidepack`
                                }
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={handleUnifiedSubmit}
                        disabled={!canProcess}
                        className={cn(
                            "px-8 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-lg",
                            canProcess
                                ? "bg-white text-black hover:scale-105 active:scale-95"
                                : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                        )}
                    >
                        {isDispatching ? 'Elaborazione...' : 'Elabora Tutto'}
                        {!isDispatching && <ArrowRight className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        </div>
    );
};
