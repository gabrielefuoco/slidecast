import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle, XCircle, ChevronUp, ChevronDown, Activity } from 'lucide-react';
import { cn } from '../lib/utils';

interface Job {
    id: number;
    title: string;
    status: string;
    created_at: string;
}

export const GlobalProgressBar: React.FC = () => {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [isExpanded, setIsExpanded] = useState(true);
    const [completedJobs, setCompletedJobs] = useState<Set<number>>(new Set());
    const [failedJobs, setFailedJobs] = useState<Set<number>>(new Set());

    const fetchStatus = async () => {
        try {
            const res = await fetch('http://localhost:8000/jobs/pending');
            if (res.ok) {
                const data = await res.json();
                const currentJobs: Job[] = data.jobs;

                // Diff logic to detect completions (naive but works for now)
                // If a job was processing before and now is gone from the list...
                // Ideally backend would return "recently completed" list, but let's assume if it disappears it's done for simplicity
                // OR we could check /courses to see if it's there as completed.
                // For "Fire & Forget", simpler is: existing logic shows CURRENTLY processing. 
                // We might miss the "Success" toast if the polling misses the exact moment of transition, 
                // but since /jobs/pending ONLY returns processing, we can't infer success vs failure just by absence.

                // Improved logic: Only show WHAT IS PROCESSING. 
                // To show "Success", we ideally need a /jobs/completed endpoint or similar.
                // For MVP: Let's focus on showing active work.

                setJobs(currentJobs);
            }
        } catch (e) {
            console.error("Failed to fetch jobs", e);
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 2000);
        return () => clearInterval(interval);
    }, []);

    if (jobs.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2 animate-in slide-in-from-bottom-5 fade-in duration-300">
            {/* Header / Summary Card */}
            <div
                className="bg-neutral-900/90 backdrop-blur-xl border border-neutral-700 text-white p-1 rounded-2xl shadow-2xl overflow-hidden min-w-[300px]"
            >
                <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-neutral-800/50 rounded-xl transition-colors"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Activity className="w-5 h-5 text-blue-400" />
                            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                            </span>
                        </div>
                        <div>
                            <p className="text-sm font-bold">{jobs.length} Processi in corso</p>
                            <p className="text-xs text-neutral-400">Generazione AI attiva...</p>
                        </div>
                    </div>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-neutral-500" /> : <ChevronUp className="w-4 h-4 text-neutral-500" />}
                </div>

                {/* Expanded List */}
                {isExpanded && (
                    <div className="border-t border-neutral-800 mt-1 max-h-[300px] overflow-y-auto">
                        {jobs.map((job) => (
                            <div key={job.id} className="px-4 py-3 border-b border-neutral-800 last:border-0 flex items-center gap-3 hover:bg-neutral-800/30 transition-colors">
                                <Loader2 className="w-4 h-4 text-blue-500/80 animate-spin shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm text-neutral-200 truncate font-medium">{job.title}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <div className="h-1 flex-1 bg-neutral-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500/50 w-full animate-progress-indeterminate" />
                                        </div>
                                        <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Processing</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
