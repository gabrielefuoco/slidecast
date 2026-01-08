import React, { useRef, useEffect, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Gauge } from 'lucide-react';
import { cn } from '../lib/utils';

interface PlayerProps {
    audioUrl: string;
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    onPlayPause: () => void;
    onSeek: (time: number) => void;
    onTimeUpdate: (time: number) => void;
    onDurationChange: (duration: number) => void;
}

export const Player: React.FC<PlayerProps> = ({
    audioUrl,
    currentTime,
    duration,
    isPlaying,
    onPlayPause,
    onSeek,
    onTimeUpdate,
    onDurationChange
}) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const progressBarRef = useRef<HTMLDivElement>(null);
    const [playbackRate, setPlaybackRate] = useState(1);

    const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

    const cyclePlaybackRate = () => {
        const currentIndex = PLAYBACK_RATES.indexOf(playbackRate);
        const nextIndex = (currentIndex + 1) % PLAYBACK_RATES.length;
        setPlaybackRate(PLAYBACK_RATES[nextIndex]);
    };

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.playbackRate = playbackRate;
        }
    }, [playbackRate]);

    useEffect(() => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.play();
            } else {
                audioRef.current.pause();
            }
        }
    }, [isPlaying]);

    useEffect(() => {
        // Sync external seek to internal audio
        if (audioRef.current && Math.abs(audioRef.current.currentTime - currentTime) > 0.5) {
            audioRef.current.currentTime = currentTime;
        }
    }, [currentTime]);

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            onTimeUpdate(audioRef.current.currentTime);
        }
    };

    const handleLoadedMetadata = () => {
        if (audioRef.current) {
            onDurationChange(audioRef.current.duration);
        }
    };

    const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (progressBarRef.current) {
            const rect = progressBarRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = x / rect.width;
            const newTime = percentage * duration;
            onSeek(newTime);
        }
    };

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    return (
        <div className="bg-neutral-900/80 backdrop-blur-xl border-t border-white/10 p-4 fixed bottom-0 left-0 right-0 z-50">
            <audio
                ref={audioRef}
                src={audioUrl}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
            />

            <div className="max-w-6xl mx-auto flex items-center gap-8">
                {/* Controls */}
                <div className="flex items-center gap-4">
                    <button className="text-neutral-400 hover:text-white transition">
                        <SkipBack className="w-5 h-5" />
                    </button>
                    <button
                        onClick={onPlayPause}
                        className="w-12 h-12 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 transition active:scale-95"
                    >
                        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
                    </button>
                    <button className="text-neutral-400 hover:text-white transition">
                        <SkipForward className="w-5 h-5" />
                    </button>
                </div>

                {/* Progress */}
                <div className="flex-grow flex items-center gap-4">
                    <span className="text-xs font-mono text-neutral-400 w-10 text-right">{formatTime(currentTime)}</span>
                    <div
                        ref={progressBarRef}
                        onClick={handleProgressBarClick}
                        className="h-2 flex-grow bg-neutral-700/50 rounded-full cursor-pointer overflow-hidden group"
                    >
                        <div
                            className="h-full bg-blue-500 relative transition-all duration-100 ease-linear"
                            style={{ width: `${(currentTime / duration) * 100}%` }}
                        >
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 shadow-lg scale-0 group-hover:scale-100 transition-all" />
                        </div>
                    </div>
                    <span className="text-xs font-mono text-neutral-400 w-10">{formatTime(duration)}</span>
                </div>

                {/* Volume (Mock) */}
                <div className="flex items-center gap-2 w-24">
                    <Volume2 className="w-5 h-5 text-neutral-400" />
                    <div className="h-1 flex-grow bg-neutral-700 rounded-full">
                        <div className="h-full w-2/3 bg-neutral-400 rounded-full" />
                    </div>
                </div>

                {/* Playback Speed Dropdown */}
                <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-neutral-400" />
                    <select
                        value={playbackRate}
                        onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                        className="bg-white/10 hover:bg-white/20 text-white text-sm font-medium px-2 py-1.5 rounded-lg border-none outline-none cursor-pointer appearance-none"
                        title="Velocità riproduzione"
                    >
                        {PLAYBACK_RATES.map((rate) => (
                            <option key={rate} value={rate} className="bg-neutral-900 text-white">
                                {rate}x
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
};
