import React from 'react';
import { Play, Pause, SkipForward, SkipBack, RotateCcw, Activity, Eye, EyeOff } from 'lucide-react';

export default function ControlPanel({
  currentTime,
  totalFrames,
  isPlaying,
  playbackSpeed,
  showTrails,
  onPlayPause,
  onSeekTime,
  onSpeedChange,
  onToggleTrails,
  experimentMetadata,
}) {
  const formatTime = (t) => `t = ${String(t).padStart(2, '0')}`;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 select-none">
      {/* 1. Playback Status & Scrubber Slider */}
      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        <div className="flex justify-between items-center text-xs font-mono text-gray-400">
          <span>Timeline Frame</span>
          <span className="text-indigo-400 font-semibold text-sm">
            {formatTime(currentTime)} / {formatTime(Math.max(0, totalFrames - 1))}
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={Math.max(0, totalFrames - 1)}
            value={currentTime}
            onChange={(e) => onSeekTime(parseInt(e.target.value))}
            className="flex-1 h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400"
          />
        </div>
      </div>

      {/* 2. Playback Control Buttons */}
      <div className="flex items-center justify-center gap-2 flex-shrink-0">
        <button
          onClick={() => onSeekTime(0)}
          className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors"
          title="Jump to Start"
        >
          <RotateCcw size={16} />
        </button>

        <button
          onClick={() => onSeekTime(Math.max(0, currentTime - 1))}
          className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors"
          title="Previous Frame"
        >
          <SkipBack size={16} />
        </button>

        <button
          onClick={onPlayPause}
          className={`p-2.5 rounded-full transition-all duration-150 ${
            isPlaying ? 'bg-amber-500 hover:bg-amber-400 text-gray-950' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
          }`}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>

        <button
          onClick={() => onSeekTime(Math.min(totalFrames - 1, currentTime + 1))}
          className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors"
          title="Next Frame"
        >
          <SkipForward size={16} />
        </button>
      </div>

      {/* 3. Settings Toggles (Trails, speed) */}
      <div className="flex items-center justify-end gap-3 flex-wrap md:flex-nowrap flex-shrink-0">
        {/* Speed setting */}
        <div className="flex items-center gap-1 bg-gray-950 border border-gray-800 rounded px-2 py-1">
          <span className="text-[10px] uppercase font-semibold text-gray-500">Speed:</span>
          <select
            value={playbackSpeed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            className="bg-transparent text-xs text-gray-300 font-mono focus:outline-none cursor-pointer"
          >
            <option value="0.5">0.5x</option>
            <option value="1">1.0x</option>
            <option value="2">2.0x</option>
            <option value="5">5.0x</option>
          </select>
        </div>

        {/* Trail toggling */}
        <button
          onClick={onToggleTrails}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors ${
            showTrails
              ? 'bg-indigo-950/40 border-indigo-800/80 text-indigo-300 hover:bg-indigo-950/60'
              : 'bg-gray-950 border-gray-800 text-gray-400 hover:bg-gray-800/50'
          }`}
        >
          {showTrails ? <Eye size={14} /> : <EyeOff size={14} />}
          <span>Trails</span>
        </button>

        {/* Info stats pill */}
        {experimentMetadata && (
          <div className="hidden lg:flex items-center gap-1.5 bg-gray-950 border border-gray-800 rounded px-3 py-1.5 text-[11px] text-gray-400">
            <Activity size={12} className="text-green-500" />
            <span>Total Tracks: {Object.keys(experimentMetadata).length}</span>
          </div>
        )}
      </div>
    </div>
  );
}
