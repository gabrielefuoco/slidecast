import React, { useEffect, useState } from 'react';
import { Package, Download, Clock, CheckCircle, XCircle, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface SlidePack {
    id: number;
    title: string;
    status: 'processing' | 'completed' | 'failed';
    created_at: string;
}

interface Course {
    id: number;
    title: string;
    created_at: string;
    slidepacks: SlidePack[];
}

interface LibraryProps {
    onOpenSlidepack?: (id: number) => void; // Future: open specific slidepack in player
}

export const Library: React.FC<LibraryProps> = ({ onOpenSlidepack }) => {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [exportingId, setExportingId] = useState<number | null>(null);

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
        // Poll every 5 seconds to update status
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

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto p-8 text-white">
            <h1 className="text-4xl font-bold mb-8 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                Libreria Corsi
            </h1>

            {courses.length === 0 ? (
                <div className="text-center py-20 bg-neutral-900/50 rounded-3xl border border-neutral-800">
                    <Package className="w-16 h-16 mx-auto text-neutral-600 mb-4" />
                    <p className="text-xl text-neutral-400">Nessun corso trovato</p>
                    <p className="text-neutral-500 mt-2">Carica delle lezioni per creare il tuo primo corso.</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {courses.map(course => (
                        <div key={course.id} className="bg-neutral-900/50 border border-neutral-800 rounded-3xl p-6 hover:border-neutral-700 transition-all">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-neutral-800 pb-4">
                                <div>
                                    <h2 className="text-2xl font-semibold text-white">{course.title}</h2>
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

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {course.slidepacks.map(pack => (
                                    <div key={pack.id} className="bg-black/20 p-4 rounded-2xl flex items-center justify-between group hover:bg-black/30 transition-all">
                                        <div className="min-w-0">
                                            <h3 className="font-medium truncate text-neutral-200" title={pack.title}>
                                                {pack.title}
                                            </h3>
                                            <div className="flex items-center gap-2 mt-2 text-xs">
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
                                        <div className="flex items-center gap-2">
                                            {pack.status === 'completed' && (
                                                <button
                                                    onClick={() => onOpenSlidepack?.(pack.id)}
                                                    className="p-2 bg-white/5 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-white/10 text-white hover:text-blue-400"
                                                    title="Apri nel Player"
                                                >
                                                    <ArrowRight className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
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
