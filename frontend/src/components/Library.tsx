import React, { useEffect, useState, useRef } from 'react';
import {
    Package, Download, Clock, CheckCircle, XCircle, ArrowRight, Loader2,
    Edit2, Trash2, MoreVertical, Combine, CheckSquare, Square, Play,
    MoreHorizontal, FolderOpen, MousePointer2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { GlobalProgressBar } from './GlobalProgressBar';

interface SlidePack {
    id: number;
    title: string;
    status: 'processing' | 'completed' | 'failed';
    created_at: string;
    file_path?: string;
    course_id: number;
    order_index?: number;
}

interface Course {
    id: number;
    title: string;
    created_at: string;
    slidepacks: SlidePack[];
}

interface LibraryProps {
    onOpenSlidepack?: (id: number, playlist?: number[]) => void;
}


// Modal Component for Merge
const MergeModal = ({ isOpen, onClose, onConfirm }: { isOpen: boolean, onClose: () => void, onConfirm: (title: string) => void }) => {
    const [title, setTitle] = useState("");

    useEffect(() => {
        if (isOpen) setTitle(`Merged Lesson ${new Date().toLocaleTimeString('it-IT').slice(0, 5)}`);
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-neutral-900 border border-neutral-700 p-6 rounded-2xl w-full max-w-md shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-4">Unisci Lezioni</h3>
                <p className="text-neutral-400 text-sm mb-4">
                    Scegli un titolo per la nuova lezione che conterrà le slide di tutte le lezioni selezionate.
                </p>
                <input
                    className="w-full bg-black/40 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 mb-6"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Titolo lezione..."
                    autoFocus
                />
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-neutral-400 hover:text-white transition-colors">
                        Annulla
                    </button>
                    <button
                        onClick={() => onConfirm(title)}
                        disabled={!title.trim()}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                    >
                        Unisci
                    </button>
                </div>
            </div>
        </div>
    );
};

export const Library: React.FC<LibraryProps> = ({ onOpenSlidepack }) => {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPacks, setSelectedPacks] = useState<number[]>([]);

    // UI States
    const [activeCourseMenu, setActiveCourseMenu] = useState<number | null>(null);
    const [showMergeModal, setShowMergeModal] = useState(false);

    // Editing States
    const [editingPackId, setEditingPackId] = useState<number | null>(null);
    const [editingCourseId, setEditingCourseId] = useState<number | null>(null);
    const [editTitle, setEditTitle] = useState("");

    const fetchCourses = async () => {
        try {
            const res = await fetch('http://localhost:8000/courses');
            if (res.ok) {
                const data = await res.json();
                setCourses(data);
            }
        } catch (error) {
            console.error("Failed to fetch courses", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCourses();
        const interval = setInterval(fetchCourses, 5000);
        return () => clearInterval(interval);
    }, []);

    // --- Actions ---

    const handleCourseMenu = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        setActiveCourseMenu(activeCourseMenu === id ? null : id);
    };

    // Close menus on click outside
    useEffect(() => {
        const handleClickOutside = () => setActiveCourseMenu(null);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const handleDeleteCourse = async (id: number) => {
        if (!confirm("Are you sure? This will delete all lessons in this course.")) return;
        try {
            await fetch(`http://localhost:8000/courses/${id}`, { method: 'DELETE' });
            fetchCourses();
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeletePack = async (id: number) => {
        try {
            await fetch(`http://localhost:8000/slidepacks/${id}`, { method: 'DELETE' });
            // If deleting selected items, clear selection
            if (selectedPacks.includes(id)) {
                setSelectedPacks(prev => prev.filter(p => p !== id));
            }
            fetchCourses();
        } catch (e) {
            console.error(e);
        }
    };

    const handleRenameCourse = async (id: number) => {
        try {
            await fetch(`http://localhost:8000/courses/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: editTitle })
            });
            fetchCourses();
            setEditingCourseId(null);
        } catch (e) { console.error(e); }
    };

    const handleRenamePack = async (id: number) => {
        try {
            await fetch(`http://localhost:8000/slidepacks/${id}/rename`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: editTitle })
            });
            fetchCourses();
            setEditingPackId(null);
        } catch (e) { console.error(e); }
    };

    const handleExportCourse = async (courseId: number) => {
        try {
            const course = courses.find(c => c.id === courseId);
            const courseTitle = course ? course.title : "course_export";

            // Show loading or notification? Simple verify for now.
            // Ideally should use a toast, but alert is ok for immediate feedback if quick. 
            // Better: just trigger download.

            const res = await fetch(`http://localhost:8000/export-course/${courseId}`);
            if (!res.ok) {
                const err = await res.json();
                alert(`Export failed: ${err.detail}`);
                return;
            }

            // Handle file download
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${courseTitle}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

        } catch (e) {
            console.error("Export failed", e);
            alert("Export failed due to network error.");
        }
    };

    // --- Selection Logic ---
    const isSelectionMode = selectedPacks.length > 0;

    const toggleSelection = (id: number) => {
        if (selectedPacks.includes(id)) {
            setSelectedPacks(selectedPacks.filter(pid => pid !== id));
        } else {
            setSelectedPacks([...selectedPacks, id]);
        }
    };

    // --- Floating Action Bar Handlers ---
    const handleMultiDelete = async () => {
        if (!confirm(`Delete ${selectedPacks.length} lessons?`)) return;
        for (const id of selectedPacks) {
            await handleDeletePack(id);
        }
        setSelectedPacks([]);
    };

    const handleMergeConfirm = async (title: string) => {
        try {
            await fetch('http://localhost:8000/slidepacks/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title,
                    pack_ids: selectedPacks
                })
            });
            setSelectedPacks([]);
            setShowMergeModal(false);
            fetchCourses(); // Should show new "Processing..." item
        } catch (e) {
            console.error(e);
            alert("Merge failed");
        }
    };

    // --- Drag & Drop for Moving & Reordering ---
    const handleDragStart = (e: React.DragEvent, packId: number, courseId: number) => {
        e.dataTransfer.setData("packId", packId.toString());
        e.dataTransfer.setData("fromCourseId", courseId.toString());
        e.currentTarget.classList.add("opacity-50");
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragEnd = (e: React.DragEvent) => {
        e.currentTarget.classList.remove("opacity-50");
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.currentTarget.classList.add("bg-white/5", "border-blue-500/50");
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.currentTarget.classList.remove("bg-white/5", "border-blue-500/50");
    };

    const handleDrop = async (e: React.DragEvent, targetCourseId: number) => {
        e.preventDefault();
        e.currentTarget.classList.remove("bg-white/5", "border-blue-500/50");
        const packId = parseInt(e.dataTransfer.getData("packId"));
        const fromCourseId = parseInt(e.dataTransfer.getData("fromCourseId"));

        if (!packId) return;

        // Case 1: Reorder within same course (Append to end if dropped on container)
        if (fromCourseId === targetCourseId) {
            const course = courses.find(c => c.id === targetCourseId);
            if (!course) return;

            // Move to end (highest index)
            const newPacks = [...course.slidepacks];
            const draggedIndex = newPacks.findIndex(p => p.id === packId);
            if (draggedIndex === -1) return;

            // Remove and push to end
            const [draggedItem] = newPacks.splice(draggedIndex, 1);
            newPacks.push(draggedItem);

            const newCourses = courses.map(c => c.id === targetCourseId ? { ...c, slidepacks: newPacks } : c);
            setCourses(newCourses);

            try {
                await fetch(`http://localhost:8000/courses/${targetCourseId}/reorder`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pack_ids: newPacks.map(p => p.id) })
                });
            } catch (e) {
                console.error("Reorder failed", e);
                fetchCourses();
            }
        }
        // Case 2: Move from another course
        else {
            try {
                await fetch(`http://localhost:8000/slidepacks/${packId}/move`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ course_id: targetCourseId })
                });
                fetchCourses();
            } catch (e) { console.error(e); }
        }
    };

    // Setup for Reordering within same course
    const handleCardDrop = async (e: React.DragEvent, targetPack: SlidePack) => {
        e.preventDefault();
        e.stopPropagation(); // Stop bubbling to course handler
        e.currentTarget.classList.remove("scale-105", "ring-4", "ring-blue-500", "z-30");

        const draggedPackId = parseInt(e.dataTransfer.getData("packId"));
        const fromCourseId = parseInt(e.dataTransfer.getData("fromCourseId"));

        if (!draggedPackId) return;

        // Same course -> Reorder
        if (fromCourseId === targetPack.course_id) {
            if (draggedPackId === targetPack.id) return;

            // Find the course
            const course = courses.find(c => c.id === fromCourseId);
            if (!course) return;

            // Reorder locally
            const newPacks = [...course.slidepacks];
            const draggedIndex = newPacks.findIndex(p => p.id === draggedPackId);
            const targetIndex = newPacks.findIndex(p => p.id === targetPack.id);

            if (draggedIndex === -1 || targetIndex === -1) return;

            // Remove dragged item
            const [draggedItem] = newPacks.splice(draggedIndex, 1);
            // Insert at new position
            newPacks.splice(targetIndex, 0, draggedItem);

            // Optimistic update
            const newCourses = courses.map(c =>
                c.id === fromCourseId ? { ...c, slidepacks: newPacks } : c
            );
            setCourses(newCourses);

            // API Call
            try {
                await fetch(`http://localhost:8000/courses/${fromCourseId}/reorder`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pack_ids: newPacks.map(p => p.id) })
                });
            } catch (e) {
                console.error("Reorder failed", e);
                fetchCourses(); // Revert on fail
            }
        }
        // Different course -> Move handling (delegate or handle here)
        else {
            try {
                await fetch(`http://localhost:8000/slidepacks/${draggedPackId}/move`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ course_id: targetPack.course_id })
                });
                fetchCourses();
            } catch (e) { console.error(e); }
        }
    };

    // Visual Feedback
    const handleCardDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.add("scale-105", "ring-4", "ring-blue-500", "z-30");
    };

    const handleCardDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.remove("scale-105", "ring-4", "ring-blue-500", "z-30");
    };


    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-8 text-white relative pb-32 font-sans">
            <GlobalProgressBar />

            <MergeModal
                isOpen={showMergeModal}
                onClose={() => setShowMergeModal(false)}
                onConfirm={handleMergeConfirm}
            />

            <div className="flex items-center justify-between mb-12">
                <h1 className="text-4xl font-extrabold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                    Media Hub
                </h1>
            </div>

            {courses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 bg-neutral-900/30 rounded-3xl border border-dashed border-neutral-800">
                    <FolderOpen className="w-16 h-16 text-neutral-700 mb-6" />
                    <p className="text-xl text-neutral-400 font-medium">La tua libreria è vuota</p>
                    <p className="text-neutral-500 mt-2">Carica i tuoi file per creare le prime lezioni.</p>
                </div>
            ) : (
                <div className="space-y-16">
                    {courses.map(course => (
                        <div
                            key={course.id}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, course.id)}
                            className="bg-transparent rounded-3xl transition-all p-4 -mx-4 hover:bg-neutral-900/20"
                        >
                            {/* Course Header */}
                            <div className="flex items-center justify-between mb-6 px-2">
                                <div className="flex items-center gap-4 flex-1">
                                    {editingCourseId === course.id ? (
                                        <div className="flex items-center gap-2 flex-1 max-w-md">
                                            <input
                                                className="w-full bg-neutral-800 border-none rounded-lg px-3 py-1.5 text-xl font-bold text-white focus:ring-2 focus:ring-blue-500"
                                                value={editTitle}
                                                onChange={(e) => setEditTitle(e.target.value)}
                                                autoFocus
                                                onKeyDown={(e) => e.key === 'Enter' && handleRenameCourse(course.id)}
                                            />
                                            <button onClick={() => handleRenameCourse(course.id)} className="p-2 bg-green-500/20 text-green-400 rounded-lg"><CheckCircle className="w-4 h-4" /></button>
                                        </div>
                                    ) : (
                                        <h2
                                            className="text-2xl font-bold text-neutral-100 cursor-pointer hover:text-blue-400 transition-colors"
                                            onClick={() => { setEditingCourseId(course.id); setEditTitle(course.title); }}
                                            title="Click to rename"
                                        >
                                            {course.title}
                                        </h2>
                                    )}
                                    <span className="text-xs font-semibold px-2 py-1 bg-neutral-800 rounded-md text-neutral-500">
                                        {course.slidepacks.length}
                                    </span>
                                </div>

                                <div className="relative">
                                    <button
                                        onClick={(e) => handleCourseMenu(e, course.id)}
                                        className="p-2 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-full transition-colors"
                                    >
                                        <MoreHorizontal className="w-5 h-5" />
                                    </button>

                                    {/* Dropdown Menu */}
                                    {activeCourseMenu === course.id && (
                                        <div className="absolute right-0 top-full mt-2 w-48 bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl z-30 overflow-hidden text-sm">
                                            <button
                                                onClick={() => handleExportCourse(course.id)}
                                                className="w-full text-left px-4 py-3 hover:bg-neutral-800 flex items-center gap-3"
                                            >
                                                <Download className="w-4 h-4" /> Esporta Corso
                                            </button>
                                            <button
                                                onClick={() => handleDeleteCourse(course.id)}
                                                className="w-full text-left px-4 py-3 hover:bg-red-500/10 text-red-400 flex items-center gap-3"
                                            >
                                                <Trash2 className="w-4 h-4" /> Elimina
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Grid Layout (Media Hub) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {course.slidepacks.length === 0 ? (
                                    <div className="col-span-full py-12 border-2 border-dashed border-neutral-800 rounded-2xl flex flex-col items-center justify-center text-neutral-600">
                                        <p>Trascinare qui le lezioni per spostarle</p>
                                    </div>
                                ) : (
                                    course.slidepacks.map(pack => {
                                        const isSelected = selectedPacks.includes(pack.id);
                                        const isProcessing = pack.status === 'processing';

                                        return (
                                            <div
                                                key={pack.id}
                                                draggable={!editingPackId && !isProcessing}
                                                onDragStart={(e) => handleDragStart(e, pack.id, course.id)}
                                                onDragEnd={handleDragEnd}
                                                className={cn(
                                                    "group relative aspect-video bg-white rounded-2xl overflow-hidden border border-neutral-200 transition-all shadow-sm",
                                                    isSelected ? "ring-2 ring-blue-500 bg-blue-50" : "hover:scale-[1.02] hover:shadow-xl hover:border-neutral-300",
                                                    isProcessing ? "cursor-wait" : "cursor-pointer"
                                                )}
                                                onDragOver={handleCardDragOver}
                                                onDragLeave={handleCardDragLeave}
                                                onDrop={(e) => handleCardDrop(e, pack)}
                                                onClick={() => {
                                                    if (isSelectionMode) toggleSelection(pack.id);
                                                    else if (pack.status === 'completed' && onOpenSlidepack) {
                                                        const playlist = course.slidepacks
                                                            .filter(p => p.status === 'completed')
                                                            .map(p => p.id);
                                                        onOpenSlidepack(pack.id, playlist);
                                                    }
                                                }}
                                            >
                                                {/* Background / Preview Placeholder */}

                                                <div className="absolute inset-0 flex items-center justify-center z-10">
                                                    {isProcessing ? (
                                                        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                                                    ) : pack.status === 'failed' ? (
                                                        <XCircle className="w-10 h-10 text-red-500" />
                                                    ) : (
                                                        <Play className="w-12 h-12 text-neutral-900 opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-xl transform active:scale-95" />
                                                    )}
                                                </div>

                                                {/* Top Right: Checkbox (Implicit Selection) */}
                                                <div
                                                    className={cn(
                                                        "absolute top-3 right-3 z-10 transition-opacity",
                                                        isSelectionMode ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                                    )}
                                                    onClick={(e) => { e.stopPropagation(); toggleSelection(pack.id); }}
                                                >
                                                    {isSelected
                                                        ? <div className="bg-blue-500 text-white rounded-lg p-1 shadow-lg"><CheckSquare className="w-5 h-5" /></div>
                                                        : <div className="bg-black/50 text-white rounded-lg p-1 hover:bg-neutral-700 backdrop-blur-sm"><Square className="w-5 h-5" /></div>
                                                    }
                                                </div>

                                                {/* Centered Info */}
                                                <div className="absolute inset-0 flex flex-col justify-between p-4 z-20 pointer-events-none">
                                                    {editingPackId === pack.id ? (
                                                        <div className="flex gap-2 w-full mt-2 pointer-events-auto">
                                                            <input
                                                                className="w-full bg-white border border-neutral-200 rounded px-2 py-1 text-sm text-neutral-900 shadow-sm"
                                                                value={editTitle}
                                                                onChange={(e) => setEditTitle(e.target.value)}
                                                                autoFocus
                                                                onClick={(e) => e.stopPropagation()}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        e.stopPropagation();
                                                                        handleRenamePack(pack.id);
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {/* Title at Top */}
                                                            <div className="w-full text-center mt-1 pointer-events-auto">
                                                                <h3 className="font-bold text-neutral-900 text-lg leading-tight w-full break-words px-2 drop-shadow-sm select-text">
                                                                    {pack.title}
                                                                </h3>
                                                            </div>

                                                            {/* Bottom Right Actions */}
                                                            <div className="flex justify-end w-full">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setEditingPackId(pack.id);
                                                                        setEditTitle(pack.title);
                                                                    }}
                                                                    className="pointer-events-auto p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-full opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 translate-x-2"
                                                                >
                                                                    <Edit2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Floating Action Bar */}
            {isSelectionMode && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-5 fade-in duration-300">
                    <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-700 p-2 pr-6 rounded-full shadow-2xl backdrop-blur-xl">
                        <div className="px-4 py-2 bg-neutral-800 rounded-full text-sm font-semibold text-white ml-1">
                            {selectedPacks.length} selezionati
                        </div>

                        <div className="h-6 w-px bg-neutral-700 mx-2" />

                        <button
                            onClick={() => setShowMergeModal(true)}
                            disabled={selectedPacks.length < 2}
                            title="Unisci lezioni selezionate"
                            className="p-3 text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed group relative"
                        >
                            <Combine className="w-5 h-5" />
                            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-black text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap">Unisci</span>
                        </button>

                        <button
                            onClick={handleMultiDelete}
                            title="Elimina lezioni selezionate"
                            className="p-3 text-neutral-300 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors group relative"
                        >
                            <Trash2 className="w-5 h-5" />
                            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-black text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap">Elimina</span>
                        </button>

                        <button
                            onClick={() => setSelectedPacks([])}
                            className="ml-2 p-2 text-neutral-500 hover:text-white rounded-full transition-colors"
                        >
                            <XCircle className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
