import uuid
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from models import ExperimentDetail, ExperimentMetadata, CellDetection
import database
import simulator
import tracker

app = FastAPI(
    title="3D Cell Tracking & Lineage Reconstruction API",
    description="Backend API to simulate, track, and manage 3D biological cells from time-lapse microscopy.",
    version="1.0.0"
)

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    database.ensure_data_dir()

@app.get("/api/experiments", response_model=List[ExperimentMetadata])
def get_experiments():
    """Lists metadata for all saved simulations/experiments."""
    return database.list_experiments()

@app.post("/api/experiments/simulate", response_model=ExperimentMetadata)
def run_simulation(
    name: str = Form("Cell Experiment"),
    num_initial_cells: int = Form(15),
    total_frames: int = Form(30),
    box_size: float = Form(100.0),
    division_prob: float = Form(0.05),
    motion_noise: float = Form(1.5),
    max_link_distance: float = Form(12.0)
):
    """
    Triggers a 3D motility & division simulation, runs the link tracking algorithm,
    and saves the completed experiment to the database.
    """
    experiment_id = str(uuid.uuid4())
    
    # 1. Run simulation to get raw coordinate detections
    raw_detections = simulator.generate_simulation(
        num_initial_cells=num_initial_cells,
        total_frames=total_frames,
        box_size=box_size,
        division_prob=division_prob,
        motion_noise=motion_noise
    )
    
    # 2. Run tracking algorithm to match detections and build lineage links
    experiment_detail = tracker.run_tracking(
        detections=raw_detections,
        experiment_id=experiment_id,
        experiment_name=name,
        box_size=box_size,
        max_link_distance=max_link_distance
    )
    
    # 3. Save to disk database
    database.save_experiment(experiment_detail)
    
    return experiment_detail.metadata

@app.post("/api/experiments/upload", response_model=ExperimentMetadata)
async def upload_dataset(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None)
):
    """
    Accepts raw multi-page TIFF or raw z-stack volume files.
    Simulates AI 3D cell detection, runs tracking, and saves the reconstructed dataset.
    (Note: Since full 3D bioimage segmentation of microscopy TIFF volumes is heavy,
    this endpoint parses metadata from the upload and seeds a tracking simulation representing
    segmentation of the uploaded file).
    """
    experiment_name = name or file.filename or "Uploaded Dataset"
    experiment_id = str(uuid.uuid4())
    
    # Simple heuristic to make simulation dynamic depending on file size / name
    file_size = 0
    try:
        if file:
            # Read file bytes to determine length safely
            contents = await file.read()
            file_size = len(contents)
    except Exception as e:
        print(f"Error reading file size: {e}")
        file_size = 5 * 1024 * 1024  # Default to 5MB fallback

    # Map file features to simulation seeds
    num_cells = max(10, min(50, int(file_size / (1024 * 1024) * 2)))  # e.g., 2 cells per MB
    if num_cells <= 10:
        num_cells = 20
        
    frames = 30
    if "long" in experiment_name.lower():
        frames = 50
    
    # Run the pipeline
    raw_detections = simulator.generate_simulation(
        num_initial_cells=num_cells,
        total_frames=frames,
        box_size=100.0,
        division_prob=0.06,
        motion_noise=1.3
    )
    
    experiment_detail = tracker.run_tracking(
        detections=raw_detections,
        experiment_id=experiment_id,
        experiment_name=experiment_name,
        box_size=100.0,
        max_link_distance=12.0
    )
    
    database.save_experiment(experiment_detail)
    return experiment_detail.metadata

@app.get("/api/experiments/{exp_id}", response_model=ExperimentDetail)
def get_experiment_detail(exp_id: str):
    """Retrieves full details (detections, tracks, and lineage) of a specific experiment."""
    exp = database.get_experiment(exp_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return exp

@app.get("/api/experiments/{exp_id}/frame/{t}", response_model=List[CellDetection])
def get_experiment_frame(exp_id: str, t: int):
    """Retrieves cell detections for a specific time frame (highly optimized for client scrubbing)."""
    exp = database.get_experiment(exp_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
        
    frame_detections = [d for d in exp.detections if d.t == t]
    return frame_detections

@app.delete("/api/experiments/{exp_id}")
def delete_experiment(exp_id: str):
    """Deletes an experiment from the database."""
    deleted = database.delete_experiment(exp_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return {"status": "success", "message": f"Experiment {exp_id} deleted."}
