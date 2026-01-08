import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export const GlobalProgressBar: React.FC = () => {
    const [pendingCount, setPendingCount] = useState(0);

    const fetchStatus = async () => {
        try {
            const res = await fetch('http://localhost:8000/jobs/pending');
            if (res.ok) {
                const data = await res.json();
                setPendingCount(data.pending_count);
            }
        } catch (e) {
            console.error("Failed to fetch pending jobs", e);
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 3000); // Poll every 3s
        return () => clearInterval(interval);
    }, []);

    if (pendingCount === 0) return null;

    return (
        <div className="fixed bottom-4 right-4 bg-neutral-900 border border-neutral-700 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 z-50 animate-in slide-in-from-bottom-4">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            <div>
                <p className="text-sm font-medium">Processing {pendingCount} jobs...</p>
                <p className="text-xs text-neutral-400">Generazione slide e audio in corso</p>
            </div>
        </div>
    );
};
