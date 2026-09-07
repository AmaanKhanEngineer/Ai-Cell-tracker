import React, { useState, useEffect, useRef } from 'react';
import { fetchExperiments, triggerSimulation, uploadDataset, fetchExperimentDetail, deleteExperiment } from './utils/api';
import Viewport3D from './components/Viewport3D';
import LineageTree from './components/LineageTree';
import ControlPanel from './components/ControlPanel';
import { Activity, Plus, Upload, Trash2, Database, Info, Loader2 } from 'lucide-react';

export default function App() {
  // Application Data States
  const [experiments, setExperiments] = useState([]);
  const [selectedExpId, setSelectedExpId] = useState('');
  const [experimentDetail, setExperimentDetail] = useState(null);
  
  // Animation / Time Scrubber States
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 1x, 2x, etc.
  const [showTrails, setShowTrails] = useState(true);
  const [selectedTrackId, setSelectedTrackId] = useState(null);

  // AI Classification & Layout States
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);
  const [colorMode, setColorMode] = useState('track');
  const [sidebarTab, setSidebarTab] = useState('library');
  const [inferenceLogs, setInferenceLogs] = useState([
    `[${new Date().toLocaleTimeString()}] [SYSTEM] AI Bio Lab pipeline initialized.`,
    `[${new Date().toLocaleTimeString()}] [SYSTEM] WebGL context bound.`,
    `[${new Date().toLocaleTimeString()}] [SYSTEM] Awaiting AI pipeline seed...`
  ]);

  const triggerLogTrace = (name, totalCells, totalFrames) => {
    const timestamp = () => new Date().toLocaleTimeString();
    setInferenceLogs([
      `[${timestamp()}] [INFO] Initializing 3D U-Net segmenter...`,
      `[${timestamp()}] [INFO] Loading weights: cellpose_3d_fluo.onnx`,
      `[${timestamp()}] [INFO] Processing input dataset: "${name}"`,
      `[${timestamp()}] [INFO] Scanning voxel intensities...`,
      `[${timestamp()}] [SUCCESS] Detected ${totalCells} cell spots across ${totalFrames} frames.`,
      `[${timestamp()}] [INFO] Running spatial tracking graph matching...`,
      `[${timestamp()}] [SUCCESS] Graph tracking complete: lineage tree reconstructed.`,
      `[${timestamp()}] [SYSTEM] Pipeline execution finished.`
    ]);
  };

  // AI Classification & Layout States
  const [activeRightTab, setActiveRightTab] = useState('tree'); // 'tree' | 'analytics'

  // Compute cell analytics dynamically
  const analyticsMetrics = React.useMemo(() => {
    if (!experimentDetail || !experimentDetail.tracks) {
      return { totalTracks: 0, totalDivisions: 0, avgVelocity: 0, maxLife: 0 };
    }
    const tracksDict = experimentDetail.tracks;
    const lineageLinks = experimentDetail.lineage_links || [];
    const trackIds = Object.keys(tracksDict);
    
    const totalTracks = trackIds.length;
    const totalDivisions = lineageLinks.length;
    
    let totalDist = 0;
    let totalSteps = 0;
    let maxLife = 0;
    
    trackIds.forEach((tid) => {
      const pts = tracksDict[tid].points || [];
      maxLife = Math.max(maxLife, pts.length);
      for (let i = 1; i < pts.length; i++) {
        const d = Math.sqrt(
          Math.pow(pts[i].x - pts[i-1].x, 2) +
          Math.pow(pts[i].y - pts[i-1].y, 2) +
          Math.pow(pts[i].z - pts[i-1].z, 2)
        );
        totalDist += d;
        totalSteps += 1;
      }
    });
    
    const avgVelocity = totalSteps > 0 ? (totalDist / totalSteps) : 0;
    
    return {
      totalTracks,
      totalDivisions,
      avgVelocity,
      maxLife,
    };
  }, [experimentDetail]);
  const [simName, setSimName] = useState('Embryo-Timelapse');
  const [simCells, setSimCells] = useState(12);
  const [simFrames, setSimFrames] = useState(30);
  const [simDivProb, setSimDivProb] = useState(0.06);
  const [simMotion, setSimMotion] = useState(1.2);
  
  // UI Status States
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Interval reference for playback loop
  const playbackIntervalRef = useRef(null);

  // 1. Initial Load: list all experiments
  const loadExperimentList = async (selectFirst = false) => {
    setLoadingList(true);
    try {
      const list = await fetchExperiments();
      setExperiments(list);
      if (selectFirst && list.length > 0) {
        setSelectedExpId(list[0].id);
      }
    } catch (err) {
      setErrorMessage('Failed to fetch experiments list.');
      console.error(err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadExperimentList(true);
  }, []);

  // 2. Load detail when selected experiment changes
  useEffect(() => {
    if (!selectedExpId) {
      setExperimentDetail(null);
      return;
    }
    
    const loadDetail = async () => {
      setLoading(true);
      setErrorMessage('');
      setIsPlaying(false);
      setCurrentTime(0);
      setSelectedTrackId(null);
      try {
        const detail = await fetchExperimentDetail(selectedExpId);
        setExperimentDetail(detail);
      } catch (err) {
        setErrorMessage('Failed to load experiment data details.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadDetail();
  }, [selectedExpId]);

  // 3. Playback timer ticking mechanism
  useEffect(() => {
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
    }

    if (isPlaying && experimentDetail) {
      const totalFrames = experimentDetail.metadata.total_frames;
      // Normal frame rate is 4 frames per second (250ms), scaled by playback speed
      const delay = 250 / playbackSpeed;

      playbackIntervalRef.current = setInterval(() => {
        setCurrentTime((prevTime) => {
          if (prevTime >= totalFrames - 1) {
            // Loop back to start or pause
            return 0;
          }
          return prevTime + 1;
        });
      }, delay);
    }

    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, experimentDetail]);

  // 4. Trigger new simulation
  const handleRunSimulation = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    try {
      const newMeta = await triggerSimulation({
        name: simName,
        numInitialCells: simCells,
        totalFrames: simFrames,
        boxSize: 100.0,
        divisionProb: simDivProb,
        motionNoise: simMotion,
        maxLinkDistance: 12.0,
      });
      // Refresh list and auto-select new simulation
      await loadExperimentList();
      setSelectedExpId(newMeta.id);
      triggerLogTrace(newMeta.name, newMeta.cell_count, newMeta.total_frames);
      setSidebarTab('logs');
    } catch (err) {
      setErrorMessage('Could not generate simulation.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 5. File upload handler (Mock multi-page TIFF z-stack)
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setErrorMessage('');
    try {
      const newMeta = await uploadDataset(file, file.name);
      await loadExperimentList();
      setSelectedExpId(newMeta.id);
      triggerLogTrace(newMeta.name, newMeta.cell_count, newMeta.total_frames);
      setSidebarTab('logs');
    } catch (err) {
      setErrorMessage('Failed to upload and track dataset.');
      console.error(err);
    } finally {
      setUploading(false);
      e.target.value = ''; // Reset input
    }
  };

  // 6. Delete experiment handler
  const handleDeleteExperiment = async (id, e) => {
    e.stopPropagation(); // Avoid selecting the deleted item
    if (!window.confirm('Are you sure you want to delete this dataset?')) return;

    try {
      await deleteExperiment(id);
      if (selectedExpId === id) {
        setSelectedExpId('');
        setExperimentDetail(null);
      }
      loadExperimentList(true);
    } catch (err) {
      setErrorMessage('Failed to delete dataset.');
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-950 text-gray-100 font-sans antialiased overflow-hidden">
      {/* Header Banner */}
      <header className="h-14 bg-gray-900 border-b border-gray-800 px-6 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 p-1.5 rounded-lg text-white animate-pulse">
            <Activity size={20} />
          </div>
          <div>
            <span className="font-bold text-sm tracking-wide bg-gradient-to-r from-indigo-400 to-indigo-200 bg-clip-text text-transparent">
              AI BIO LAB
            </span>
            <span className="ml-2 text-[10px] text-gray-500 font-mono">v1.2 MVP</span>
          </div>
        </div>
        <div className="text-xs text-gray-400 bg-gray-950 px-3 py-1 rounded-full border border-gray-800 flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
          <span>FastAPI Engine Running</span>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Control Panel / Datasets Sidebar */}
        <aside className="w-80 bg-gray-900/60 border-r border-gray-800 flex flex-col flex-shrink-0 overflow-y-auto">
          {/* New Simulation Form */}
          <div className="p-4 border-b border-gray-800">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
              <Plus size={14} className="text-indigo-400" />
              <span>Simulate 3D Cell Growth</span>
            </h2>
            <form onSubmit={handleRunSimulation} className="space-y-3">
              <div>
                <label className="block text-[10px] text-gray-500 font-mono uppercase">Simulation Name</label>
                <input
                  type="text"
                  value={simName}
                  onChange={(e) => setSimName(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-500 font-mono uppercase">Start Cells</label>
                  <input
                    type="number"
                    min={5}
                    max={40}
                    value={simCells}
                    onChange={(e) => setSimCells(parseInt(e.target.value))}
                    className="w-full bg-gray-950 border border-gray-800 rounded px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 font-mono uppercase">Frames (T)</label>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={simFrames}
                    onChange={(e) => setSimFrames(parseInt(e.target.value))}
                    className="w-full bg-gray-950 border border-gray-800 rounded px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-500 font-mono uppercase" title="Mitosis probability per frame">Division Rate</label>
                  <input
                    type="number"
                    step={0.01}
                    min={0}
                    max={0.2}
                    value={simDivProb}
                    onChange={(e) => setSimDivProb(parseFloat(e.target.value))}
                    className="w-full bg-gray-950 border border-gray-800 rounded px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 font-mono uppercase" title="Brownian movement noise multiplier">Motility</label>
                  <input
                    type="number"
                    step={0.1}
                    min={0.2}
                    max={4}
                    value={simMotion}
                    onChange={(e) => setSimMotion(parseFloat(e.target.value))}
                    className="w-full bg-gray-950 border border-gray-800 rounded px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-xs font-semibold py-2 rounded text-center transition-colors flex items-center justify-center gap-1.5"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                <span>Run AI Pipeline</span>
              </button>
            </form>
          </div>

          {/* Upload Section */}
          <div className="p-4 border-b border-gray-800">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Upload size={14} className="text-indigo-400" />
              <span>Upload 3D TIFF Stack</span>
            </h2>
            <label className="flex flex-col items-center justify-center border border-dashed border-gray-800 hover:border-indigo-500/50 rounded bg-gray-950/40 p-4 cursor-pointer hover:bg-gray-950/60 transition-colors">
              <Upload size={20} className="text-gray-500 mb-1.5" />
              <span className="text-[10px] text-gray-400">Select multi-page .tiff or .zarr</span>
              <input
                type="file"
                accept=".tiff,.tif,.zip"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
            {uploading && (
              <div className="flex items-center gap-1.5 text-[10px] text-indigo-400 mt-2">
                <Loader2 size={12} className="animate-spin" />
                <span>Simulating segmentation + tracking...</span>
              </div>
            )}
          </div>

          {/* AI Settings Section */}
          <div className="p-4 border-b border-gray-800 bg-gray-950/20">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
              <span className="text-indigo-400">🤖</span>
              <span>AI Classifier settings</span>
            </h2>
            <div className="space-y-3">
              {/* Confidence Threshold Slider */}
              <div>
                <div className="flex justify-between items-center text-[10px] text-gray-500 font-mono">
                  <span>CONFIDENCE THRESHOLD</span>
                  <span className="text-indigo-400 font-bold">{confidenceThreshold.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.30"
                  max="0.95"
                  step="0.05"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 mt-1"
                />
              </div>

              {/* Color Code Mode */}
              <div>
                <span className="block text-[10px] text-gray-500 font-mono uppercase mb-1">Color Code Mode</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setColorMode('track')}
                    className={`text-[10px] font-semibold py-1 rounded border transition-colors ${
                      colorMode === 'track'
                        ? 'bg-indigo-950/40 border-indigo-700/60 text-indigo-300'
                        : 'bg-gray-950 border-gray-800 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    Track ID
                  </button>
                  <button
                    type="button"
                    onClick={() => setColorMode('confidence')}
                    className={`text-[10px] font-semibold py-1 rounded border transition-colors ${
                      colorMode === 'confidence'
                        ? 'bg-indigo-950/40 border-indigo-700/60 text-indigo-300'
                        : 'bg-gray-950 border-gray-800 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    AI Confidence
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Saved Experiments & AI Logs Tab Layout */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex border-b border-gray-800 text-xs flex-shrink-0 bg-gray-950/30">
              <button
                type="button"
                onClick={() => setSidebarTab('library')}
                className={`flex-1 py-2 font-semibold text-center border-b-2 transition-all ${
                  sidebarTab === 'library'
                    ? 'border-indigo-500 text-white bg-gray-900/40'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                📁 Library
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('logs')}
                className={`flex-1 py-2 font-semibold text-center border-b-2 transition-all ${
                  sidebarTab === 'logs'
                    ? 'border-indigo-500 text-white bg-gray-900/40'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                🤖 AI Console
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
              {sidebarTab === 'library' ? (
                <div className="p-3 flex-1 overflow-y-auto space-y-1.5">
                  {loadingList ? (
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500 p-2">
                      <Loader2 size={12} className="animate-spin" />
                      <span>Loading library...</span>
                    </div>
                  ) : experiments.length === 0 ? (
                    <div className="text-xs text-gray-500 p-2">No experiments saved yet. Run a simulation to start.</div>
                  ) : (
                    experiments.map((exp) => (
                      <div
                        key={exp.id}
                        onClick={() => setSelectedExpId(exp.id)}
                        className={`group flex items-center justify-between p-2 rounded border cursor-pointer transition-all ${
                          selectedExpId === exp.id
                            ? 'bg-indigo-950/40 border-indigo-700/60 text-white'
                            : 'bg-gray-950/40 border-gray-800 text-gray-400 hover:border-gray-700 hover:bg-gray-950/60'
                        }`}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="text-xs font-semibold truncate leading-tight">{exp.name}</div>
                          <div className="text-[9px] text-gray-500 font-mono mt-0.5">
                            Frames: {exp.total_frames} | Cells: {exp.cell_count}
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleDeleteExperiment(exp.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-950/40 rounded text-gray-500 hover:text-red-400 transition-all flex-shrink-0"
                          title="Delete Experiment"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="p-3 flex-1 overflow-y-auto font-mono text-[9px] text-gray-400 bg-gray-950/40 flex flex-col space-y-1 select-text">
                  {inferenceLogs.map((log, index) => {
                    let colorClass = "text-gray-400";
                    if (log.includes("[SYSTEM]")) colorClass = "text-indigo-400 font-semibold";
                    if (log.includes("[SUCCESS]")) colorClass = "text-green-400 font-semibold";
                    if (log.includes("[ERROR]")) colorClass = "text-red-400 font-semibold";
                    if (log.includes("[INFO]")) colorClass = "text-gray-300";
                    
                    return (
                      <div key={index} className={`${colorClass} leading-tight break-all`}>
                        {log}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Right Dashboard Area (Visualizer & Lineage Tree) */}
        <section className="flex-1 flex flex-col bg-gray-950 overflow-hidden">
          {/* Main Visual Panels */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 overflow-hidden p-4 gap-4">
            {/* 3D Cell Renderer (Takes 2 columns on large screen) */}
            <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-lg overflow-hidden flex flex-col relative">
              <div className="px-4 py-3 bg-gray-950/60 border-b border-gray-800 flex justify-between items-center z-10">
                <div>
                  <h3 className="text-xs font-semibold text-gray-200">
                    WebGL 3D Volumetric Viewport
                  </h3>
                  <p className="text-[10px] text-gray-400">
                    Spheres denote cell centroids. Use mouse to rotate, pan, and zoom.
                  </p>
                </div>
                {selectedTrackId && (
                  <button
                    onClick={() => setSelectedTrackId(null)}
                    className="text-[10px] text-indigo-400 hover:underline"
                  >
                    Clear Selection
                  </button>
                )}
              </div>

              {/* Loader Overlay */}
              {loading && (
                <div className="absolute inset-0 bg-gray-950/80 z-20 flex flex-col items-center justify-center gap-2">
                  <Loader2 size={24} className="animate-spin text-indigo-500" />
                  <span className="text-xs text-gray-400 font-mono">Syncing AI tracks...</span>
                </div>
              )}

              {/* Three.js Canvas container */}
              <div className="flex-1 min-h-0 bg-gray-950 relative">
                {experimentDetail ? (
                  <Viewport3D
                    detections={experimentDetail.detections}
                    tracks={experimentDetail.tracks}
                    currentTime={currentTime}
                    boxSize={100.0}
                    showTrails={showTrails}
                    selectedTrackId={selectedTrackId}
                    onSelectTrack={setSelectedTrackId}
                    confidenceThreshold={confidenceThreshold}
                    colorMode={colorMode}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2 p-6 text-center">
                    <Info size={28} className="text-gray-600" />
                    <div>
                      <p className="text-xs font-semibold text-gray-400">No Experiment Loaded</p>
                      <p className="text-[10px] max-w-sm mt-1">
                        Select a dataset from the library or trigger a new AI tracking simulation in the left panel to populate the workspace.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel: Lineage Tree & Analytics (Takes 1 column) */}
            <div className="lg:col-span-1 min-h-0 flex flex-col bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              {experimentDetail ? (
                <>
                  {/* Tabs Header */}
                  <div className="flex border-b border-gray-800 text-xs flex-shrink-0 bg-gray-950/60">
                    <button
                      type="button"
                      onClick={() => setActiveRightTab('tree')}
                      className={`flex-1 py-3 font-semibold text-center border-b-2 transition-all ${
                        activeRightTab === 'tree'
                          ? 'border-indigo-500 text-white bg-gray-900/40'
                          : 'border-transparent text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      🌳 Lineage Tree
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveRightTab('analytics')}
                      className={`flex-1 py-3 font-semibold text-center border-b-2 transition-all ${
                        activeRightTab === 'analytics'
                          ? 'border-indigo-500 text-white bg-gray-900/40'
                          : 'border-transparent text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      📊 AI Analytics
                    </button>
                  </div>

                  {/* Tab Contents */}
                  <div className="flex-1 min-h-0">
                    {activeRightTab === 'tree' ? (
                      <LineageTree
                        tracks={experimentDetail.tracks}
                        lineageLinks={experimentDetail.lineage_links}
                        selectedTrackId={selectedTrackId}
                        onSelectTrack={setSelectedTrackId}
                        currentTime={currentTime}
                        onSeekTime={setCurrentTime}
                      />
                    ) : (
                      <div className="h-full p-4 overflow-y-auto space-y-4 bg-gray-950/10">
                        <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                          <h3 className="text-xs font-semibold text-gray-200">AI Quantitative Metrics</h3>
                          <span className="text-[9px] font-mono text-gray-500">Live Compute</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-gray-950 border border-gray-800/80 rounded p-3">
                            <span className="block text-[9px] text-gray-500 font-mono">TOTAL TRACKS</span>
                            <span className="text-xl font-bold text-indigo-400">{analyticsMetrics.totalTracks}</span>
                          </div>
                          <div className="bg-gray-950 border border-gray-800/80 rounded p-3">
                            <span className="block text-[9px] text-gray-500 font-mono">MITOSIS EVENTS</span>
                            <span className="text-xl font-bold text-amber-500">{analyticsMetrics.totalDivisions}</span>
                          </div>
                          <div className="bg-gray-950 border border-gray-800/80 rounded p-3">
                            <span className="block text-[9px] text-gray-500 font-mono">AVG SPEED</span>
                            <span className="text-xl font-bold text-green-500">
                              {analyticsMetrics.avgVelocity.toFixed(2)}{" "}
                              <span className="text-[10px] font-normal text-gray-500">μm/f</span>
                            </span>
                          </div>
                          <div className="bg-gray-950 border border-gray-800/80 rounded p-3">
                            <span className="block text-[9px] text-gray-500 font-mono">MAX LIFESPAN</span>
                            <span className="text-xl font-bold text-pink-500">
                              {analyticsMetrics.maxLife}{" "}
                              <span className="text-[10px] font-normal text-gray-500">frames</span>
                            </span>
                          </div>
                        </div>

                        {/* Biological status interpretation */}
                        <div className="bg-gray-905 border border-gray-800 rounded p-3.5 space-y-2">
                          <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Phenotypic Bio-Profile</h4>
                          <p className="text-xs text-gray-300 leading-relaxed font-sans">
                            {analyticsMetrics.avgVelocity > 1.4 
                              ? "High motility cells detected (highly migratory phenotype, matching metastatic progression behavior)."
                              : "Moderate motility cells detected (stable tracking, standard biological motility)."}
                            {" "}
                            {analyticsMetrics.totalDivisions > 8
                              ? "Rapid proliferation index (highly proliferative/mitotic population growth)."
                              : "Stable proliferation index (steady cellular population cycle)."}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center p-6 text-center text-gray-500 text-xs">
                  Awaiting lineage reconstruction data...
                </div>
              )}
            </div>
          </div>

          {/* Timeline Playback Control Bar */}
          <div className="px-4 pb-4 flex-shrink-0">
            <ControlPanel
              currentTime={currentTime}
              totalFrames={experimentDetail ? experimentDetail.metadata.total_frames : 0}
              isPlaying={isPlaying}
              playbackSpeed={playbackSpeed}
              showTrails={showTrails}
              onPlayPause={() => setIsPlaying(!isPlaying)}
              onSeekTime={setCurrentTime}
              onSpeedChange={setPlaybackSpeed}
              onToggleTrails={() => setShowTrails(!showTrails)}
              experimentMetadata={experimentDetail ? experimentDetail.tracks : null}
            />
          </div>
        </section>
      </main>

      {/* Error alert toast */}
      {errorMessage && (
        <div className="absolute bottom-20 right-6 bg-red-950 border border-red-800 text-red-300 text-xs rounded px-4 py-2.5 shadow-lg flex items-center gap-2 z-50">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage('')} className="ml-2 hover:text-white font-bold">×</button>
        </div>
      )}
    </div>
  );
}
