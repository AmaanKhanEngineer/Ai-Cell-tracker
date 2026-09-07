# 🧬 AI Bio Lab: Complete Project Documentation & Viva Guide

This document provides a comprehensive, module-by-module explanation of the **AI Bio Lab** application. It is designed to help you understand the architecture, algorithms, and modules in full detail, so you can easily explain them to your examiner.

---

## 📂 1. Project Concept & Objective
In biological research, cells are filmed over days using **3D time-lapse confocal microscopes**. Analyzing these videos manually is slow and error-prone. 

This project builds an automated end-to-end framework to:
1.  **Detect (Segmentation)**: Find the 3D position $(x, y, z)$ of cells in each time frame.
2.  **Track (Association)**: Connect the same cell across consecutive frames to map its migration path.
3.  **Lineage Reconstruction (Mitosis)**: Detect when a cell divides (mitosis) and build a genealogical family tree.

---

## 🛠️ 2. Technology Stack (Tools & Libraries Used)

| Component | Technology | Why we used it? |
| :--- | :--- | :--- |
| **Backend Framework** | **Python (FastAPI)** | Extremely fast, lightweight, supports asynchronous operations, and integrates natively with Python data-science tools. |
| **Data Calculations** | **NumPy** | Used to run fast multi-dimensional matrix operations (like calculating 3D Euclidean distances). |
| **Data Validation** | **Pydantic V2** | Enforces strict schemas and data validation between Python and React frontend. |
| **Multipart Parsing** | **python-multipart** | Required by FastAPI to process form-data and TIFF/ZIP file uploads. |
| **Frontend Framework** | **React.js (Vite)** | Component-based structure with fast Hot Module Replacement (HMR) for live updates. |
| **3D Rendering** | **Three.js (WebGL)** | Standard library for high-performance hardware-accelerated 3D graphics in web browsers. |
| **Styling** | **Tailwind CSS** | Utility-first styling framework to build a modern dark-theme dashboard quickly. |

---

## 🧩 3. Module-by-Module Explanation

### 🐍 BACKEND MODULES (`backend/`)

#### 1. [`models.py`](file:///Users/amaankhan/cell_tracker_app/backend/models.py) (The Blueprints)
Defines Pydantic data schemas. This guarantees that the data structure sent to the frontend is clean and validated:
*   `CellDetection`: Contains `x`, `y`, `z`, `t` (frame), `radius`, `confidence`, and `track_id`.
*   `LineageLink`: Maps parent-child links (`parent_track_id` $\rightarrow$ `child_track_id` at division frame `t_division`).
*   `Track`: Stores a list of `TrackPoint` coordinates representing the cell's lifespan, its color, and references to parent/children tracks.

#### 2. [`simulator.py`](file:///Users/amaankhan/cell_tracker_app/backend/simulator.py) (Biological Simulator)
Generates coordinate-based cells in a $100\mu m$ cube:
*   **Motility**: Simulates Brownian random walk + a constant drift vector (radial expansion).
*   **Mitosis**: If a cell's age and size exceed thresholds, it splits into two smaller daughter cells offset along a random 3D axis.
*   **Noise**: Adds false positives (noisy dots) and randomly deletes real cells (false negatives) to simulate a real, imperfect AI segmenter. Detections are shuffled to remove track identity.

#### 3. [`tracker.py`](file:///Users/amaankhan/cell_tracker_app/backend/tracker.py) (The AI Tracker)
Reconstructs tracks and detects cell divisions:
*   Calculates the **3D Euclidean distance matrix** between cells at frame $t$ and active tracks at $t-1$.
*   **Track Continuation**: Matches cells to their closest predecessor (within a maximum linking distance of $12\mu m$).
*   **Mitosis Splitting**: If two new cells at $t$ find the same parent at $t-1$ as their nearest neighbor, it terminates the parent track and spawns two daughter tracks, linking them via a lineage relationship.

#### 4. [`database.py`](file:///Users/amaankhan/cell_tracker_app/backend/database.py) (Local Storage)
Manages saving and loading simulations/uploads as JSON files inside `backend/data/`. This makes database queries extremely simple, fast, and lock-free.

#### 5. [`main.py`](file:///Users/amaankhan/cell_tracker_app/backend/main.py) (FastAPI Gatekeeper)
Exposes the REST API routes. Key endpoints:
*   `POST /api/experiments/simulate`: Generates cell coordinates, runs tracking, and saves results.
*   `POST /api/experiments/upload`: Accepts any TIFF/ZIP file, reads size/properties, and starts the tracking pipeline.
*   `GET /api/experiments/{id}`: Delivers the full data (detections, tracks, lineage links) to the frontend.

---

### ⚛️ FRONTEND MODULES (`frontend/src/`)

#### 1. [`App.jsx`](file:///Users/amaankhan/cell_tracker_app/frontend/src/App.jsx) (Dashboard Manager)
Manages the application state (active experiment, timeline playback, simulation parameters, AI logs console tab, and active cell selections).

#### 2. [`Viewport3D.jsx`](file:///Users/amaankhan/cell_tracker_app/frontend/src/components/Viewport3D.jsx) (3D Space Renderer)
Initializes a Three.js WebGL scene with camera, orbit controls, bounding box outline, and floor grid:
*   **Cells**: Rendered as dynamic `THREE.Mesh` spheres.
*   **Trails**: Rendered as `THREE.Line` geometry tracing the historical path of each active cell.
*   **AI Confidence Filtering**: Discards cell meshes that fall below the active `confidenceThreshold` slider.
*   **Color Modes**:
    *   *Track ID*: Colors cells using unique, persistent track colors.
    *   *AI Confidence*: Colors cells using HSL values (interpolating from Red for low confidence $0.3$ to Green for high confidence $1.0$).

#### 3. [`LineageTree.jsx`](file:///Users/amaankhan/cell_tracker_app/frontend/src/components/LineageTree.jsx) (Custom SVG Cladogram)
Lays out cell divisions horizontally and time vertically (Top $t=0 \rightarrow$ Bottom $t=T$). Uses a post-order tree layout algorithm:
$$X_{parent} = \frac{X_{left\_child} + X_{right\_child}}{2}$$
This avoids line crossovers and displays cell divisions cleanly as orange triangles.

#### 4. [`ControlPanel.jsx`](file:///Users/amaankhan/cell_tracker_app/frontend/src/components/ControlPanel.jsx) (Timeline Bar)
Manages timeline scrubbing, play/pause animations, speed adjustments, and display toggles (like trails visibility).

#### 5. [`api.js`](file:///Users/amaankhan/cell_tracker_app/frontend/src/utils/api.js) (Network Client)
Wrote fetch handlers to wrap API endpoints, using FormData payloads to send simulation inputs and multi-page TIFF uploads.

---

## ⚙️ 4. How the Math & Logic Works

### 1. 3D Euclidean Distance (Cell Proximity)
To associate cells across frames, we calculate the shortest distance:
$$d = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2 + (z_2 - z_1)^2}$$
If $d \le 12 \mu m$, the tracker assumes it is the same cell.

### 2. Mitosis Detection Logic (Parent-Child Branching)
```
          (Mother Cell: track_0 at t-1)
                      \
                       \ (Mitosis Event)
                      / \
                     /   \
(Daughter 1: track_1 at t) (Daughter 2: track_2 at t)
```
If two centroids at frame $t$ map to the same nearest neighbor at frame $t-1$, we trigger division:
1.  Close `track_0` (mother) at frame $t-1$.
2.  Open `track_1` & `track_2` (daughters) at frame $t$.
3.  Add lineage link: `track_0` $\rightarrow$ `[track_1, track_2]`.

### 3. Quantitative AI Analytics (Live Calculations)
*   **Cell Speed / Motility**: The distance between consecutive points in a track is calculated for all steps and averaged:
    $$Avg\_Velocity = \frac{1}{N} \sum_{i=1}^{N} \sqrt{(x_i - x_{i-1})^2 + (y_i - y_{i-1})^2 + (z_i - z_{i-1})^2}$$
*   **Bio-Profile Interpretation**:
    *   If $Avg\_Velocity > 1.4 \mu m/frame \Rightarrow$ High Motility (indicates invasive / migratory cellular phenotype).
    *   If Mitosis Events $> 8 \Rightarrow$ Proliferative State (rapid tumor/embryo growth).

---

## 💬 5. Examiner Question & Answer Cheat-Sheet

*   **Q: Why use JSON database instead of SQLite/PostgreSQL?**
    *   *A*: "Sir, since this is a local Bioimage Informatics MVP, a file-based JSON database is faster, lock-free, and highly transparent. Every experiment file can be read and inspected directly in the folder as standard JSON, avoiding database migration dependencies."
*   **Q: What is the benefit of mapping the Lineage Tree on a Time-Scale Y-Axis?**
    *   *A*: "Sir, traditional tree layouts just show parent-child links. By mapping the Y-axis strictly to frame time $t$, researchers can visually verify exactly *when* division events happened relative to the timeline."
*   **Q: How does the app handle noisy/incorrect AI detections?**
    *   *A*: "Sir, we have two layers of defense. First, the tracking algorithm ignores detections with confidence $< 0.60$. Second, the frontend features an interactive AI Confidence Slider to filter out low-confidence cells dynamically in the 3D viewport."
