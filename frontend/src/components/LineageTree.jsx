import React, { useMemo, useState } from 'react';

export default function LineageTree({
  tracks,
  lineageLinks,
  selectedTrackId,
  onSelectTrack,
  currentTime,
  onSeekTime,
}) {
  const [hoveredTrackId, setHoveredTrackId] = useState(null);

  // Compute layout coordinates for the lineage tree
  const treeLayout = useMemo(() => {
    if (!tracks || Object.keys(tracks).length === 0) return null;

    // 1. Identify start and end frame for each track
    const trackLifeSpan = {};
    Object.entries(tracks).forEach(([tid, track]) => {
      const frames = track.points.map((pt) => pt.t);
      trackLifeSpan[tid] = {
        start: Math.min(...frames),
        end: Math.max(...frames),
      };
    });

    // 2. Identify root tracks (no parent) and group by child links
    const roots = Object.keys(tracks).filter((tid) => !tracks[tid].parent_track_id);
    const childrenMap = {};
    Object.entries(tracks).forEach(([tid, track]) => {
      if (track.parent_track_id) {
        const parentId = track.parent_track_id;
        if (!childrenMap[parentId]) {
          childrenMap[parentId] = [];
        }
        childrenMap[parentId].push(tid);
      }
    });

    const xCoords = {};
    let leafCount = 0;

    // Post-order traversal to calculate width and assign X positions
    // This spreads the tree branches evenly across horizontal slots
    function assignX(trackId, leftBound) {
      const children = childrenMap[trackId] || [];
      if (children.length === 0) {
        xCoords[trackId] = leafCount;
        leafCount += 1;
        return;
      }

      // Recursively layout children
      children.forEach((childId) => {
        assignX(childId, leafCount);
      });

      // Parent X is average of children's X
      const childXCoords = children.map((c) => xCoords[c]);
      xCoords[trackId] = (Math.min(...childXCoords) + Math.max(...childXCoords)) / 2;
    }

    // Assign X coords to each independent root tree
    roots.forEach((rootId) => {
      assignX(rootId, leafCount);
      // Put some spacing between independent cell trees
      leafCount += 0.5;
    });

    // Get bounds for SVG viewBox configuration
    const maxX = Math.max(0.5, ...Object.values(xCoords));
    
    // Y-scale maps time frames to pixels
    const maxT = Math.max(
      1,
      ...Object.values(trackLifeSpan).map((span) => span.end)
    );

    return {
      xCoords,
      trackLifeSpan,
      roots,
      childrenMap,
      maxX,
      maxT,
    };
  }, [tracks]);

  if (!treeLayout) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-xs">
        No active tracking dataset loaded.
      </div>
    );
  }

  const { xCoords, trackLifeSpan, roots, childrenMap, maxX, maxT } = treeLayout;

  // Render SVG dimensions & scaling constants
  const paddingX = 40;
  const paddingY = 30;
  const width = Math.max(300, maxX * 75 + paddingX * 2);
  const height = Math.max(350, maxT * 12 + paddingY * 2);

  // Helper to map (x_grid, t) coordinates to pixels
  const getX = (gridX) => paddingX + (gridX / (maxX || 1)) * (width - paddingX * 2);
  const getY = (t) => paddingY + (t / (maxT || 1)) * (height - paddingY * 2);

  // Render all graphical connectors and nodes
  const renderVisuals = () => {
    const lines = [];
    const points = [];

    Object.entries(tracks).forEach(([tid, track]) => {
      const span = trackLifeSpan[tid];
      const x = getX(xCoords[tid]);
      const yStart = getY(span.start);
      const yEnd = getY(span.end);

      const isSelected = selectedTrackId === tid;
      const isHovered = hoveredTrackId === tid;
      const isActiveNow = currentTime >= span.start && currentTime <= span.end;

      // 1. Draw vertical cell lifetime line
      lines.push(
        <line
          key={`line-${tid}`}
          x1={x}
          y1={yStart}
          x2={x}
          y2={yEnd}
          stroke={track.color}
          strokeWidth={isSelected ? 4 : isHovered ? 2.5 : 1.5}
          strokeOpacity={isActiveNow ? 1.0 : 0.35}
          className="transition-all duration-150 cursor-pointer"
          onClick={() => {
            onSelectTrack(tid);
            onSeekTime(span.start); // Seek to cell birth frame
          }}
          onMouseEnter={() => setHoveredTrackId(tid)}
          onMouseLeave={() => setHoveredTrackId(null)}
        />
      );

      // Draw current time playhead dot if active in 3D frame
      if (isActiveNow) {
        const yPlayhead = getY(currentTime);
        points.push(
          <circle
            key={`playhead-${tid}`}
            cx={x}
            cy={yPlayhead}
            r={isSelected ? 5.5 : 4}
            fill="#ffffff"
            stroke={track.color}
            strokeWidth={2}
            className="pointer-events-none"
          />
        );
      }

      // 2. Draw Mitosis split lines (horizontal bridge connecting to children)
      const children = childrenMap[tid] || [];
      if (children.length > 0) {
        const childYs = children.map((cId) => getY(trackLifeSpan[cId].start));
        const ySplit = yEnd; // Division time

        children.forEach((childId) => {
          const childX = getX(xCoords[childId]);
          const childYStart = getY(trackLifeSpan[childId].start);

          // Horizontal branch connector
          lines.push(
            <line
              key={`mitosis-${tid}-${childId}`}
              x1={x}
              y1={ySplit}
              x2={childX}
              y2={ySplit}
              stroke={track.color}
              strokeWidth={1.5}
              strokeOpacity={0.6}
              strokeDasharray="2,2"
              className="pointer-events-none"
            />
          );

          // Short vertical drop line to child start
          lines.push(
            <line
              key={`drop-${tid}-${childId}`}
              x1={childX}
              y1={ySplit}
              x2={childX}
              y2={childYStart}
              stroke={tracks[childId].color}
              strokeWidth={1.5}
              strokeOpacity={0.6}
              className="pointer-events-none"
            />
          );
        });

        // Small indicator node at split location
        points.push(
          <polygon
            key={`mitosis-split-${tid}`}
            points={`${x},${ySplit - 3} ${x - 4.5},${ySplit + 4.5} ${x + 4.5},${ySplit + 4.5}`}
            fill="#f59e0b" // Amber mitosis color
            className="cursor-pointer hover:scale-150 transition-transform duration-100"
            onClick={() => {
              onSelectTrack(tid);
              onSeekTime(span.end);
            }}
            title={`Division frame ${span.end}`}
          />
        );
      }

      // 3. Label text at track birth (e.g. "T3")
      if (span.start === 0 || track.parent_track_id) {
        points.push(
          <text
            key={`lbl-${tid}`}
            x={x}
            y={yStart - 8}
            fill={isHovered || isSelected ? '#ffffff' : '#9ca3af'}
            fontSize={9}
            textAnchor="middle"
            fontFamily="monospace"
            className="pointer-events-none font-bold"
          >
            {tid.replace('track_', 'C')}
          </text>
        );
      }
    });

    return { lines, points };
  };

  const { lines, points } = renderVisuals();

  return (
    <div className="flex flex-col h-full bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      {/* Header Info */}
      <div className="px-4 py-3 bg-gray-950/60 border-b border-gray-800 flex justify-between items-center flex-shrink-0">
        <div>
          <h3 className="text-xs font-semibold text-gray-200">Lineage Reconstruction Tree</h3>
          <p className="text-[10px] text-gray-400">Vertical Axis maps to Frame Time (t = 0 → {maxT})</p>
        </div>
        {selectedTrackId && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono border border-indigo-500/30">
            Selected: Cell {selectedTrackId.replace('track_', '')}
          </span>
        )}
      </div>

      {/* SVG Container scroll area */}
      <div className="flex-1 overflow-auto p-4 bg-gray-950/20 relative">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="mx-auto"
        >
          {/* Time axis guide lines */}
          {Array.from({ length: maxT + 1 }).map((_, idx) => {
            if (idx % 5 !== 0 && idx !== maxT) return null;
            const y = getY(idx);
            return (
              <g key={`t-axis-${idx}`} className="opacity-10 pointer-events-none">
                <line x1={0} y1={y} x2={width} y2={y} stroke="#ffffff" strokeDasharray="4,4" />
                <text x={10} y={y - 4} fill="#ffffff" fontSize={8} fontFamily="monospace">
                  t={idx}
                </text>
              </g>
            );
          })}

          {/* Render lines first then dots on top */}
          {lines}
          {points}
        </svg>
      </div>
    </div>
  );
}
