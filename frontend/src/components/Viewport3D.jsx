import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export default function Viewport3D({
  detections,
  tracks,
  currentTime,
  boxSize = 100.0,
  showTrails = true,
  showLabels = false,
  selectedTrackId = null,
  onSelectTrack = () => {},
  confidenceThreshold = 0.5,
  colorMode = 'track',
}) {
  const mountRef = useRef(null);
  
  // Keep states in refs to access inside the Three.js loop and resize event handlers
  const stateRef = useRef({
    detections,
    tracks,
    currentTime,
    boxSize,
    showTrails,
    showLabels,
    selectedTrackId,
    onSelectTrack,
    confidenceThreshold,
    colorMode,
  });

  // Track rendering references
  const meshesRef = useRef({}); // map: detection_id -> THREE.Mesh
  const trailsRef = useRef({}); // map: track_id -> THREE.Line
  const labelsContainerRef = useRef(null); // ref for overlaying html divs on top of 3D canvas
  const [hoveredCell, setHoveredCell] = useState(null);

  // Update stateRef whenever props change
  useEffect(() => {
    stateRef.current = {
      detections,
      tracks,
      currentTime,
      boxSize,
      showTrails,
      showLabels,
      selectedTrackId,
      onSelectTrack,
      confidenceThreshold,
      colorMode,
    };
  }, [detections, tracks, currentTime, boxSize, showTrails, showLabels, selectedTrackId, onSelectTrack, confidenceThreshold, colorMode]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030712); // Tailwind gray-950

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      60,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000
    );
    // Position camera looking down slightly at the center of the bounding box
    camera.position.set(boxSize * 1.5, boxSize * 1.5, boxSize * 1.8);
    camera.lookAt(boxSize / 2, boxSize / 2, boxSize / 2);

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(boxSize / 2, boxSize / 2, boxSize / 2);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(1, 2, 1).multiplyScalar(boxSize);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xa5b4fc, 0.5); // Indigo light
    dirLight2.position.set(-1, -1, -1).multiplyScalar(boxSize);
    scene.add(dirLight2);

    // Bounding Box Helper (Visualizes the microscopy volume boundary)
    const boxGeo = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
    const edges = new THREE.EdgesGeometry(boxGeo);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x374151, linewidth: 2 }); // gray-700
    const wireframe = new THREE.LineSegments(edges, lineMat);
    // Center it around (boxSize/2, boxSize/2, boxSize/2)
    wireframe.position.set(boxSize / 2, boxSize / 2, boxSize / 2);
    scene.add(wireframe);

    // Grid Floor
    const gridHelper = new THREE.GridHelper(boxSize, 10, 0x4b5563, 0x1f2937);
    gridHelper.position.set(boxSize / 2, 0, boxSize / 2);
    scene.add(gridHelper);

    // Axis Helper
    const axesHelper = new THREE.AxesHelper(15);
    scene.add(axesHelper);

    // Raycasting for cell selection/clicks
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Group to hold dynamic cell meshes
    const cellsGroup = new THREE.Group();
    scene.add(cellsGroup);

    // Group to hold trails
    const trailsGroup = new THREE.Group();
    scene.add(trailsGroup);

    // --- Cell Geometry/Material Reuse ---
    const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);

    // Helper map to quickly find cell coordinates
    // We map cell_id to detection details
    let cachedDetections = [];

    // --- Animation & Render Loop ---
    let animationFrameId;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();

      const {
        detections: curDets,
        tracks: curTracks,
        currentTime: curT,
        showTrails: sTrails,
        selectedTrackId: selId,
        confidenceThreshold: confThresh,
        colorMode: cMode,
      } = stateRef.current;

      // 1. Update Cell Spheres (Recreate or move)
      // For this MVP, we empty the cellsGroup and rebuild the current frame's cell spheres.
      // This is robust and simple for 100-1000 cells.
      cellsGroup.clear();
      meshesRef.current = {};

      const frameDetections = curDets.filter((d) => d.t === curT && d.confidence >= confThresh);

      frameDetections.forEach((det) => {
        let colorHex;
        if (cMode === 'confidence') {
          const conf = det.confidence || 0.8;
          // Interpolate HSL Hue: 0 (Red) to 0.35 (Green) based on confidence [0.3 - 1.0]
          const normConf = Math.max(0, Math.min(1, (conf - 0.3) / 0.7));
          const color = new THREE.Color().setHSL(normConf * 0.35, 1.0, 0.5);
          colorHex = `#${color.getHexString()}`;
        } else {
          const track = curTracks[det.track_id];
          colorHex = track ? track.color : '#9ca3af'; // Default gray for untracked cell
        }

        // Material changes based on selection
        const isSelected = det.track_id && det.track_id === selId;
        
        let material;
        if (isSelected) {
          // Highlight selected: glowing emissive border or bright color
          material = new THREE.MeshPhongMaterial({
            color: new THREE.Color(colorHex),
            emissive: new THREE.Color(colorHex),
            emissiveIntensity: 0.8,
            shininess: 100,
          });
        } else {
          material = new THREE.MeshPhongMaterial({
            color: new THREE.Color(colorHex),
            shininess: 30,
            specular: 0x333333,
          });
        }

        const sphere = new THREE.Mesh(sphereGeometry, material);
        // Position cell sphere
        sphere.position.set(det.x, det.y, det.z);
        // Scale based on cell radius
        sphere.scale.setScalar(det.radius || 3);
        
        // Save references for raycasting
        sphere.userData = {
          detectionId: det.id,
          trackId: det.track_id,
          x: det.x,
          y: det.y,
          z: det.z,
          radius: det.radius,
        };

        cellsGroup.add(sphere);
        meshesRef.current[det.id] = sphere;

        // Render standard outline if selected
        if (isSelected) {
          const wireframeMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            wireframe: true,
            transparent: true,
            opacity: 0.15,
          });
          const outlineMesh = new THREE.Mesh(sphereGeometry, wireframeMat);
          outlineMesh.position.copy(sphere.position);
          outlineMesh.scale.copy(sphere.scale).multiplyScalar(1.2);
          cellsGroup.add(outlineMesh);
        }
      });

      // 2. Render Cell Trails (Historical paths)
      trailsGroup.clear();
      if (sTrails && curTracks) {
        Object.entries(curTracks).forEach(([trackId, trackData]) => {
          // Gather points in this track up to current frame t
          const historyPoints = trackData.points.filter((pt) => pt.t <= curT);
          if (historyPoints.length < 2) return;

          // Create geometry from path
          const vertices = [];
          historyPoints.forEach((pt) => {
            vertices.push(new THREE.Vector3(pt.x, pt.y, pt.z));
          });

          const curve = new THREE.CatmullRomCurve3(vertices);
          const points = curve.getPoints(historyPoints.length * 3); // Smooth lines

          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          
          const isSelected = trackId === selId;
          const material = new THREE.LineBasicMaterial({
            color: new THREE.Color(trackData.color),
            linewidth: isSelected ? 3 : 1, // Note: WebGL standard LineBasicMaterial width is always 1 on most platforms, but we try anyway
            transparent: true,
            opacity: isSelected ? 1.0 : 0.4,
          });

          const line = new THREE.Line(geometry, material);
          trailsGroup.add(line);
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    // --- Interaction Handlers ---
    const handleResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Mouse Move (Hover effects)
    const handleMouseMove = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(cellsGroup.children);

      if (intersects.length > 0) {
        const hoveredObject = intersects[0].object;
        if (hoveredObject.userData && hoveredObject.userData.trackId) {
          setHoveredCell({
            trackId: hoveredObject.userData.trackId,
            x: hoveredObject.userData.x,
            y: hoveredObject.userData.y,
            z: hoveredObject.userData.z,
            radius: hoveredObject.userData.radius,
          });
          return;
        }
      }
      setHoveredCell(null);
    };

    // Mouse Click (Cell Selection)
    const handleMouseClick = (event) => {
      // Only trigger selection on primary click
      if (event.button !== 0) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(cellsGroup.children);

      if (intersects.length > 0) {
        const clickedMesh = intersects[0].object;
        if (clickedMesh.userData && clickedMesh.userData.trackId) {
          stateRef.current.onSelectTrack(clickedMesh.userData.trackId);
        }
      }
    };

    mount.addEventListener('mousemove', handleMouseMove);
    mount.addEventListener('mousedown', handleMouseClick);

    // --- Cleanup ---
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      if (mount) {
        mount.removeEventListener('mousemove', handleMouseMove);
        mount.removeEventListener('mousedown', handleMouseClick);
        mount.removeChild(renderer.domElement);
      }
      // Dispose materials/geometries
      sphereGeometry.dispose();
      boxGeo.dispose();
      edges.dispose();
      lineMat.dispose();
      renderer.dispose();
    };
  }, [boxSize]);

  return (
    <div className="relative w-full h-full" ref={mountRef}>
      {/* 3D Visualizer HUD Overlay */}
      <div className="absolute top-4 left-4 bg-gray-900/80 backdrop-blur border border-gray-800 rounded px-3 py-2 text-xs select-none pointer-events-none space-y-1">
        <div className="font-semibold text-gray-400">Microscopy 3D Grid</div>
        <div>Volume Size: {boxSize}³ μm</div>
        <div>Frame: {currentTime}</div>
        <div className="flex items-center space-x-1 mt-1">
          <span className="inline-block w-2.5 h-2.5 bg-indigo-500 rounded-full"></span>
          <span>Detections: {detections.filter((d) => d.t === currentTime).length}</span>
        </div>
      </div>

      {/* Floating Hover Tooltip */}
      {hoveredCell && (
        <div
          className="absolute bg-gray-900/95 border border-gray-800 rounded p-2 text-xs shadow-lg font-mono pointer-events-none"
          style={{
            top: '20px',
            right: '20px',
          }}
        >
          <div className="font-semibold text-indigo-400 mb-1">Cell Properties</div>
          <div>Track: {hoveredCell.trackId}</div>
          <div>Coord: ({hoveredCell.x.toFixed(1)}, {hoveredCell.y.toFixed(1)}, {hoveredCell.z.toFixed(1)})</div>
          <div>Radius: {hoveredCell.radius.toFixed(2)} μm</div>
        </div>
      )}
    </div>
  );
}
