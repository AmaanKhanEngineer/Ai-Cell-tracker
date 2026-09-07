import random
import numpy as np
from typing import List, Dict, Tuple, Set
from models import CellDetection, LineageLink, Track, TrackPoint, ExperimentDetail, ExperimentMetadata
import datetime

# A list of distinct hex colors for cells
COLORS = [
    "#FF5733", "#33FF57", "#3357FF", "#F3FF33", "#FF33F3", "#33FFF3",
    "#FFAF33", "#AF33FF", "#33FFAF", "#FF3333", "#33FF33", "#3333FF",
    "#FFC300", "#581845", "#900C3F", "#C70039", "#1D8348", "#1F618D",
    "#6C3483", "#117A65", "#9A7D0A", "#A04000", "#5D6D7E", "#2E4053"
]

def get_random_color() -> str:
    return random.choice(COLORS)

def run_tracking(
    detections: List[CellDetection],
    experiment_id: str,
    experiment_name: str,
    box_size: float = 100.0,
    max_link_distance: float = 12.0
) -> ExperimentDetail:
    """
    Performs nearest-neighbor tracking with mitosis detection on a set of 3D cell detections.
    Reconstructs continuous tracks and division (mitosis) lineage trees.
    """
    # 1. Group detections by frame
    frames_dict: Dict[int, List[CellDetection]] = {}
    for d in detections:
        frames_dict.setdefault(d.t, []).append(d)
        
    total_frames = max(frames_dict.keys()) + 1 if frames_dict else 0
    
    # Track dictionary: track_id -> Track object
    reconstructed_tracks: Dict[str, Track] = {}
    # Lineage links list
    lineage_links: List[LineageLink] = []
    
    # Active tracks: track_id -> last_point (CellDetection)
    active_tracks: Dict[str, CellDetection] = {}
    track_counter = 0
    
    # Initial tracks at t = 0
    initial_detections = frames_dict.get(0, [])
    # Filter out low confidence detections (noise) at the start
    initial_detections = [d for d in initial_detections if d.confidence >= 0.6]
    
    for d in initial_detections:
        track_id = f"track_{track_counter}"
        track_counter += 1
        d.track_id = track_id
        
        reconstructed_tracks[track_id] = Track(
            track_id=track_id,
            color=get_random_color(),
            points=[TrackPoint(x=d.x, y=d.y, z=d.z, t=d.t, radius=d.radius, detection_id=d.id)],
            parent_track_id=None,
            children_track_ids=[]
        )
        active_tracks[track_id] = d

    # Track propagation frame by frame
    for t in range(1, total_frames):
        current_detections = [d for d in frames_dict.get(t, []) if d.confidence >= 0.6]
        if not current_detections:
            continue
            
        # We match current frame detections to active tracks from t-1
        # For each detection in current frame, find the closest active track endpoint
        # Map: track_id -> list of detection objects that mapped to it as their nearest neighbor
        track_mappings: Dict[str, List[Tuple[CellDetection, float]]] = {tid: [] for tid in active_tracks}
        
        unmapped_detections: List[CellDetection] = []
        
        for det in current_detections:
            best_track_id = None
            min_dist = float("inf")
            
            # Find nearest active track endpoint
            for tid, active_det in active_tracks.items():
                dist = np.sqrt(
                    (det.x - active_det.x) ** 2 +
                    (det.y - active_det.y) ** 2 +
                    (det.z - active_det.z) ** 2
                )
                if dist < min_dist:
                    min_dist = dist
                    best_track_id = tid
            
            # Link check: must be within max search radius
            if best_track_id is not None and min_dist <= max_link_distance:
                track_mappings[best_track_id].append((det, min_dist))
            else:
                unmapped_detections.append(det)

        # Update active tracks for the next frame
        next_active_tracks: Dict[str, CellDetection] = {}
        
        for tid, mappings in track_mappings.items():
            parent_det = active_tracks[tid]
            
            if len(mappings) == 0:
                # Track dies / cell leaves frame
                pass
                
            elif len(mappings) == 1:
                # Continuous track propagation
                det, _ = mappings[0]
                det.track_id = tid
                
                # Append to existing track
                reconstructed_tracks[tid].points.append(
                    TrackPoint(x=det.x, y=det.y, z=det.z, t=det.t, radius=det.radius, detection_id=det.id)
                )
                next_active_tracks[tid] = det
                
            else:
                # Mitosis (division) detected! (Two or more cells closest to one parent)
                # Sort mappings by distance, take the top 2 as daughter cells
                mappings.sort(key=lambda x: x[1])
                daughter_mappings = mappings[:2]
                
                # Spawn two new tracks
                for d_det, _ in daughter_mappings:
                    d_track_id = f"track_{track_counter}"
                    track_counter += 1
                    d_det.track_id = d_track_id
                    
                    # Create the new daughter track
                    reconstructed_tracks[d_track_id] = Track(
                        track_id=d_track_id,
                        color=get_random_color(),
                        points=[TrackPoint(x=d_det.x, y=d_det.y, z=d_det.z, t=d_det.t, radius=d_det.radius, detection_id=d_det.id)],
                        parent_track_id=tid,
                        children_track_ids=[]
                    )
                    
                    # Update mother track children details
                    reconstructed_tracks[tid].children_track_ids.append(d_track_id)
                    
                    # Create Lineage Link
                    lineage_links.append(
                        LineageLink(
                            parent_track_id=tid,
                            child_track_id=d_track_id,
                            t_division=t
                        )
                    )
                    
                    next_active_tracks[d_track_id] = d_det
                
                # Detections beyond the first 2 are treated as unmapped (new tracks)
                for d_det, _ in mappings[2:]:
                    unmapped_detections.append(d_det)
                    
        # Detections that were not matched start new tracks (e.g. entry into field or false positive)
        for det in unmapped_detections:
            new_tid = f"track_{track_counter}"
            track_counter += 1
            det.track_id = new_tid
            
            reconstructed_tracks[new_tid] = Track(
                track_id=new_tid,
                color=get_random_color(),
                points=[TrackPoint(x=det.x, y=det.y, z=det.z, t=det.t, radius=det.radius, detection_id=det.id)],
                parent_track_id=None,
                children_track_ids=[]
            )
            next_active_tracks[new_tid] = det

        active_tracks = next_active_tracks

    # Flatten updated detections to return
    all_detections: List[CellDetection] = []
    for t_idx in range(total_frames):
        all_detections.extend(frames_dict.get(t_idx, []))
        
    metadata = ExperimentMetadata(
        id=experiment_id,
        name=experiment_name,
        created_at=datetime.datetime.now().isoformat(),
        total_frames=total_frames,
        cell_count=len(all_detections)
    )
    
    return ExperimentDetail(
        metadata=metadata,
        detections=all_detections,
        tracks=reconstructed_tracks,
        lineage_links=lineage_links
    )
