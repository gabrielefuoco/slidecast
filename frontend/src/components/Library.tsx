import React, { useEffect, useState, useRef } from 'react';
import { Package, Download, Clock, CheckCircle, XCircle, ArrowRight, Loader2, Edit2, Trash2, GripVertical, Combine, CheckSquare, Square } from 'lucide-react';
import { cn } from '../lib/utils';
import { GlobalProgressBar } from './GlobalProgressBar';

interface SlidePack {
    id: number;
    title: string;
    status: 'processing' | 'completed' | 'failed';
    created_at: string;
    file_path?: string;
    course_id: number;
}

interface Course {
    id: number;
    title: string;
    created_at: string;
    slidepacks: SlidePack[];
}

interface LibraryProps {
    onOpenSlidepack?: (id: number) => void;
}

export const Library: React.FC<LibraryProps> = ({ onOpenSlidepack }) => {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [exportingId, setExportingId] = useState<number | null>(null);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedPacks, setSelectedPacks] = useState<number[]>([]);

    // Edit States
    const [editingCourseId, setEditingCourseId] = useState<number | null>(null);
    const [editingPackId, setEditingPackId] = useState<number | null>(null);
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

    const handleExportCourse = async (courseId: number, courseTitle: string) => {
        setExportingId(courseId);
        try {
            const res = await fetch(`http://localhost:8000/export-course/${courseId}`);
            if (!res.ok) throw new Error("Export failed");

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${courseTitle}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } catch (error) {
            console.error("Export error", error);
            alert("Failed to export course");
        } finally {
            setExportingId(null);
        }
    };

    // --- Actions ---

    // Rename Course
    const startEditCourse = (c: Course) => {
        setEditingCourseId(c.id);
        setEditTitle(c.title);
    };
    const saveEditCourse = async () => {
        if (!editingCourseId) return;
        try {
            await fetch(`http://localhost:8000/courses/${editingCourseId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: editTitle })
            });
            fetchCourses();
        } catch (e) {
            console.error(e);
        }
        setEditingCourseId(null);
    };

    // Delete Course
    const deleteCourse = async (id: number) => {
        if (!confirm("Are you sure you want to delete this course and all its contents?")) return;
        try {
            await fetch(`http://localhost:8000/courses/${id}`, { method: 'DELETE' });
            fetchCourses();
        } catch (e) {
            console.error(e);
        }
    };

    // Rename SlidePack
    const startEditPack = (p: SlidePack) => {
        setEditingPackId(p.id);
        setEditTitle(p.title);
    };
    const saveEditPack = async () => {
        if (!editingPackId) return;
        try {
            await fetch(`http://localhost:8000/slidepacks/${editingPackId}/rename`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: editTitle })
            });
            fetchCourses();
        } catch (e) {
            console.error(e);
        }
        setEditingPackId(null);
    };

    // Delete SlidePack
    const deletePack = async (id: number) => {
        if (!confirm("Delete this lesson?")) return;
        try {
            await fetch(`http://localhost:8000/slidepacks/${id}`, { method: 'DELETE' });
            fetchCourses();
        } catch (e) {
            console.error(e);
        }
    };

    // --- Drag & Drop ---
    const handleDragStart = (e: React.DragEvent, packId: number, courseId: number) => {
        e.dataTransfer.setData("packId", packId.toString());
        e.dataTransfer.setData("fromCourseId", courseId.toString());
        e.currentTarget.classList.add("opacity-50");
    };

    const handleDragEnd = (e: React.DragEvent) => {
        e.currentTarget.classList.remove("opacity-50");
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // Necessary to allow dropping
        e.currentTarget.classList.add("bg-neutral-800/80");
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.currentTarget.classList.remove("bg-neutral-800/80");
    };

    const handleDrop = async (e: React.DragEvent, targetCourseId: number) => {
        e.preventDefault();
        e.currentTarget.classList.remove("bg-neutral-800/80");
        const packId = parseInt(e.dataTransfer.getData("packId"));
        const fromCourseId = parseInt(e.dataTransfer.getData("fromCourseId"));

        if (!packId || fromCourseId === targetCourseId) return;

        // Call API
        try {
            await fetch(`http://localhost:8000/slidepacks/${packId}/move`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ course_id: targetCourseId })
            });
            fetchCourses();
        } catch (e) {
            console.error(e);
            alert("Failed to move lesson");
        }
    };

    // --- Merge ---
    const toggleSelection = (id: number) => {
        if (selectedPacks.includes(id)) {
            setSelectedPacks(selectedPacks.filter(pid => pid !== id));
        } else {
            setSelectedPacks([...selectedPacks, id]);
        }
    };

    const handleMerge = async () => {
        const title = prompt("Enter title for the merged lesson:", "Merged Lesson " + new Date().toLocaleTimeString());
        if (!title) return;

        try {
            await fetch('http://localhost:8000/slidepacks/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title,
                    pack_ids: selectedPacks
                })
            });
            alert("Merge started! It will appear when processed.");
            setSelectedPacks([]);
            setSelectionMode(false);
            fetchCourses();
        } catch (e) {
            console.error(e);
            alert("Merge failed");
        }
    };


    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto p-8 text-white relative">
            <GlobalProgressBar />

            <div className="flex items-center justify-between mb-8">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                    Libreria Corsi
                </h1>

                <div className="flex items-center gap-4">
                    {selectionMode ? (
                        <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 px-4 py-2 rounded-xl">
                            <span className="text-sm font-medium text-blue-300">{selectedPacks.length} selected</span>
                            <button
                                onClick={handleMerge}
                                disabled={selectedPacks.length < 2}
                                className="flex items-center gap-2 px-3 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors"
                            >
                                <Combine className="w-4 h-4" /> Merge
                            </button>
                            <button onClick={() => { setSelectionMode(false); setSelectedPacks([]); }} className="p-1 hover:bg-white/10 rounded-lg ml-2">
                                <XCircle className="w-5 h-5 text-neutral-400" />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setSelectionMode(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-all text-neutral-300"
                        >
                            <CheckSquare className="w-4 h-4" /> Select / Merge
                        </button>
                    )}
                </div>
            </div>

            {courses.length === 0 ? (
                <div className="text-center py-20 bg-neutral-900/50 rounded-3xl border border-neutral-800">
                    <Package className="w-16 h-16 mx-auto text-neutral-600 mb-4" />
                    <p className="text-xl text-neutral-400">Nessun corso trovato</p>
                    <p className="text-neutral-500 mt-2">Carica delle lezioni per creare il tuo primo corso.</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {courses.map(course => (
                        <div
                            key={course.id}
                            className="bg-neutral-900/50 border border-neutral-800 rounded-3xl p-6 transition-all"
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, course.id)}
                        >
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-neutral-800 pb-4">
                                <div className="flex-1">
                                    {editingCourseId === course.id ? (
                                        <div className="flex items-center gap-2">
                                            <input
                                                className="bg-black/40 border border-neutral-700 rounded-lg px-3 py-1 text-white focus:outline-none focus:border-blue-500"
                                                value={editTitle}
                                                onChange={e => setEditTitle(e.target.value)}
                                                autoFocus
                                            />
                                            <button onClick={saveEditCourse} className="p-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30">
                                                <CheckCircle className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => setEditingCourseId(null)} className="p-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30">
                                                <XCircle className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="group flex items-center gap-3">
                                            <h2 className="text-2xl font-semibold text-white">{course.title}</h2>
                                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                                                <button onClick={() => startEditCourse(course)} className="p-1.5 hover:bg-white/10 rounded-lg text-neutral-400 hover:text-white">
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => deleteCourse(course.id)} className="p-1.5 hover:bg-white/10 rounded-lg text-neutral-400 hover:text-red-400">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    <p className="text-sm text-neutral-500 flex items-center gap-2 mt-1">
                                        <Clock className="w-4 h-4" />
                                        Created: {new Date(course.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleExportCourse(course.id, course.title)}
                                    disabled={exportingId === course.id}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-xl transition-all disabled:opacity-50"
                                >
                                    {exportingId === course.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                    Scarica Corso (.zip)
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-h-[100px]">
                                {course.slidepacks.length === 0 && (
                                    <div className="col-span-full flex flex-col items-center justify-center text-neutral-600 border-2 border-dashed border-neutral-800 rounded-xl p-8">
                                        <p>Drag lessons here</p>
                                    </div>
                                )}
                                {course.slidepacks.map(pack => (
                                    <div
                                        key={pack.id}
                                        draggable={!editingPackId && !selectionMode}
                                        onDragStart={(e) => handleDragStart(e, pack.id, course.id)}
                                        onDragEnd={handleDragEnd}
                                        className={cn(
                                            "bg-black/20 p-4 rounded-2xl flex items-center justify-between group transition-all border border-transparent",
                                            selectionMode && "cursor-pointer hover:border-blue-500/50",
                                            selectedPacks.includes(pack.id) ? "border-blue-500 bg-blue-500/10" : "hover:bg-black/30",
                                            "cursor-grab active:cursor-grabbing"
                                        )}
                                        onClick={() => selectionMode && toggleSelection(pack.id)}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                {!selectionMode && <GripVertical className="w-4 h-4 text-neutral-600 opacity-0 group-hover:opacity-100 cursor-grab" />}

                                                {selectionMode && (
                                                    selectedPacks.includes(pack.id)
                                                        ? <CheckSquare className="w-5 h-5 text-blue-400" />
                                                        : <Square className="w-5 h-5 text-neutral-600" />
                                                )}

                                                {editingPackId === pack.id ? (
                                                    <div className="flex items-center gap-1 flex-1">
                                                        <input
                                                            className="w-full bg-black/40 border border-neutral-700 rounded px-2 py-0.5 text-sm text-white"
                                                            value={editTitle}
                                                            onChange={e => setEditTitle(e.target.value)}
                                                            autoFocus
                                                            onClick={e => e.stopPropagation()}
                                                        />
                                                        <button onClick={(e) => { e.stopPropagation(); saveEditPack(); }} className="p-1 text-green-400 hover:bg-green-500/20 rounded"><CheckCircle className="w-3 h-3" /></button>
                                                        <button onClick={(e) => { e.stopPropagation(); setEditingPackId(null); }} className="p-1 text-red-400 hover:bg-red-500/20 rounded"><XCircle className="w-3 h-3" /></button>
                                                    </div>
                                                ) : (
                                                    <h3 className="font-medium truncate text-neutral-200" title={pack.title}>
                                                        {pack.title}
                                                    </h3>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2 mt-2 text-xs pl-6">
                                                {pack.status === 'completed' && (
                                                    <span className="text-green-400 flex items-center gap-1">
                                                        <CheckCircle className="w-3 h-3" /> Completato
                                                    </span>
                                                )}
                                                {pack.status === 'processing' && (
                                                    <span className="text-amber-400 flex items-center gap-1">
                                                        <Loader2 className="w-3 h-3 animate-spin" /> In elaborazione...
                                                    </span>
                                                )}
                                                {pack.status === 'failed' && (
                                                    <span className="text-red-400 flex items-center gap-1">
                                                        <XCircle className="w-3 h-3" /> Fallito
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {!selectionMode && (
                                            <div className="flex items-center gap-1">
                                                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity mr-2">
                                                    <button onClick={() => startEditPack(pack)} className="p-1.5 hover:bg-white/10 rounded-lg text-neutral-400 hover:text-white" title="Rename">
                                                        <Edit2 className="w-3 h-3" />
                                                    </button>
                                                    <button onClick={() => deletePack(pack.id)} className="p-1.5 hover:bg-white/10 rounded-lg text-neutral-400 hover:text-red-400" title="Delete">
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                </div>
                                                {pack.status === 'completed' && (
                                                    <button
                                                        onClick={() => onOpenSlidepack?.(pack.id)}
                                                        className="p-2 bg-white/5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
                                                        title="Apri nel Player"
                                                    >
                                                        <ArrowRight className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
