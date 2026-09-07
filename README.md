# 🧬 AI Bio Lab: 3D Cell Tracking & Lineage Reconstruction

An automated bioimaging analytics platform for 3D time-lapse cell tracking, lineage tree reconstruction, and dynamic WebGL 3D visualization.

---

## 🌟 Key Features

- **3D Spatial Simulation & Processing**: Real-time generation and tracking of 3D cell motility, Brownian motion, and mitosis events.
- **Euclidean Nearest-Neighbor Tracking**: High-performance association across time frames with dynamic distance gating.
- **Mitosis & Lineage Tree Detection**: Automated detection of parent-daughter split events with cladogram reconstruction.
- **Interactive 3D Viewport**: Three.js/WebGL hardware-accelerated rendering of cell centroid meshes, confidence filters, and historical motion trails.
- **Lineage Tree Visualizer**: Custom SVG cladogram mapping cell lineages strictly across the timeline.
- **Quantitative Analytics Dashboard**: Real-time cell motility velocity, mitosis counts, population progression, and phenotypic profiling.

---

## 🛠️ Tech Stack

- **Backend**: Python 3, FastAPI, NumPy, SciPy, Pydantic V2, Uvicorn
- **Frontend**: React 18, Vite, Three.js, Tailwind CSS, Lucide React

---

## 🚀 Getting Started

### 1. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Backend API will run at `http://localhost:8000`.

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend dashboard will run at `http://localhost:5173`.

---

## 📂 Project Structure

```
cell_tracker_app/
├── backend/
│   ├── main.py              # FastAPI endpoints & REST routes
│   ├── models.py            # Pydantic schemas (CellDetection, Track, LineageLink)
│   ├── simulator.py         # 3D cell motility & mitosis synthetic generator
│   ├── tracker.py           # 3D tracking & mitosis association algorithm
│   ├── database.py          # Local JSON storage manager
│   ├── requirements.txt     # Backend dependencies
│   └── test_pipeline.py     # Automated testing suite
├── frontend/
│   ├── src/
│   │   ├── components/      # Viewport3D, LineageTree, ControlPanel, etc.
│   │   ├── utils/           # API fetch client
│   │   ├── App.jsx          # Main UI layout & state
│   │   └── main.jsx         # React root
│   ├── package.json         # Frontend dependencies
│   └── tailwind.config.js   # Tailwind styles
├── project_documentation.md # Detailed technical & viva documentation
└── README.md
```

---

## 📜 License

MIT License.
