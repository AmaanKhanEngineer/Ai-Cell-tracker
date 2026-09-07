from pydantic import BaseModel, Field
from typing import List, Optional, Dict

class CellDetection(BaseModel):
    id: str = Field(..., description="Unique cell detection ID (e.g., cell_t_index)")
    x: float
    y: float
    z: float
    t: int
    radius: float
    confidence: float
    track_id: Optional[str] = None

class LineageLink(BaseModel):
    parent_track_id: str = Field(..., description="Track ID of the parent cell")
    child_track_id: str = Field(..., description="Track ID of the child cell")
    t_division: int = Field(..., description="Frame index where division occurred")

class TrackPoint(BaseModel):
    x: float
    y: float
    z: float
    t: int
    radius: float
    detection_id: str

class Track(BaseModel):
    track_id: str
    color: str
    points: List[TrackPoint]
    parent_track_id: Optional[str] = None
    children_track_ids: List[str] = Field(default_factory=list)

class ExperimentMetadata(BaseModel):
    id: str
    name: str
    created_at: str
    total_frames: int
    cell_count: int

class ExperimentDetail(BaseModel):
    metadata: ExperimentMetadata
    detections: List[CellDetection]
    tracks: Dict[str, Track]  # Map track_id -> Track details
    lineage_links: List[LineageLink]
