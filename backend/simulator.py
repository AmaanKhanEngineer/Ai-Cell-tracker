import random
import uuid
import numpy as np
from typing import List, Dict, Tuple
from models import CellDetection

def generate_simulation(
    num_initial_cells: int = 15,
    total_frames: int = 30,
    box_size: float = 100.0,
    division_prob: float = 0.05,
    motion_noise: float = 1.5,
    drift: Tuple[float, float, float] = (0.2, 0.1, -0.05)
) -> List[CellDetection]:
    """
    Simulates 3D cell motility, growth, and division (mitosis) over time.
    Returns a flat list of CellDetection objects (without track_id, representing raw AI detections).
    """
    raw_detections: List[CellDetection] = []
    
    # Active cells tracking state: list of dicts representing the ground truth state
    active_cells: List[dict] = []
    
    # Initialize cells randomly in the central 3D space
    for i in range(num_initial_cells):
        active_cells.append({
            "x": random.uniform(box_size * 0.25, box_size * 0.75),
            "y": random.uniform(box_size * 0.25, box_size * 0.75),
            "z": random.uniform(box_size * 0.25, box_size * 0.75),
            "radius": random.uniform(2.5, 3.5),
            "age": random.randint(0, 5)
        })

    detection_counter = 0

    for t in range(total_frames):
        next_active_cells = []
        frame_detections = []

        for cell in active_cells:
            # 1. Growth: cells grow slightly in size per frame
            cell["radius"] += 0.08
            cell["age"] += 1

            # 2. Check for division (mitosis)
            # Conditions: age > 4, size > 3.0, and probability check
            if cell["age"] > 4 and cell["radius"] > 3.2 and random.random() < division_prob:
                # Mitosis: Split into two daughter cells
                # Offset coordinates along a random 3D division axis
                axis = np.random.normal(0, 1, 3)
                axis /= np.linalg.norm(axis)
                offset = axis * (cell["radius"] * 0.5)

                # Daughter 1
                d1_x = max(0.0, min(box_size, cell["x"] + offset[0]))
                d1_y = max(0.0, min(box_size, cell["y"] + offset[1]))
                d1_z = max(0.0, min(box_size, cell["z"] + offset[2]))
                d1_radius = cell["radius"] * 0.75  # Smaller volume/radius
                
                # Daughter 2
                d2_x = max(0.0, min(box_size, cell["x"] - offset[0]))
                d2_y = max(0.0, min(box_size, cell["y"] - offset[1]))
                d2_z = max(0.0, min(box_size, cell["z"] - offset[2]))
                d2_radius = cell["radius"] * 0.75

                next_active_cells.append({
                    "x": d1_x, "y": d1_y, "z": d1_z,
                    "radius": d1_radius, "age": 0
                })
                next_active_cells.append({
                    "x": d2_x, "y": d2_y, "z": d2_z,
                    "radius": d2_radius, "age": 0
                })
            else:
                # 3. Normal Motility: random walk + drift
                dx = random.normalvariate(drift[0], motion_noise)
                dy = random.normalvariate(drift[1], motion_noise)
                dz = random.normalvariate(drift[2], motion_noise)

                new_x = max(0.0, min(box_size, cell["x"] + dx))
                new_y = max(0.0, min(box_size, cell["y"] + dy))
                new_z = max(0.0, min(box_size, cell["z"] + dz))

                next_active_cells.append({
                    "x": new_x,
                    "y": new_y,
                    "z": new_z,
                    "radius": cell["radius"],
                    "age": cell["age"]
                })

        # Save detections for current frame (shuffle to simulate un-ordered detection output)
        for cell in next_active_cells:
            # Randomize detection confidence slightly
            confidence = random.uniform(0.85, 0.99)
            
            # Occasionally omit a detection to simulate false negatives (5% chance)
            if random.random() < 0.03:
                continue

            detection_id = f"det_{t}_{detection_counter}"
            detection_counter += 1

            frame_detections.append(
                CellDetection(
                    id=detection_id,
                    x=round(cell["x"], 3),
                    y=round(cell["y"], 3),
                    z=round(cell["z"], 3),
                    t=t,
                    radius=round(cell["radius"], 2),
                    confidence=round(confidence, 3),
                    track_id=None # To be populated by the tracker
                )
            )

        # Add occasional false positives (random artifact detections)
        if random.random() < 0.2: # 20% chance per frame of having a noise detection
            noise_x = random.uniform(0, box_size)
            noise_y = random.uniform(0, box_size)
            noise_z = random.uniform(0, box_size)
            noise_radius = random.uniform(1.5, 2.5)
            noise_id = f"noise_{t}_{detection_counter}"
            detection_counter += 1
            frame_detections.append(
                CellDetection(
                    id=noise_id,
                    x=round(noise_x, 3),
                    y=round(noise_y, 3),
                    z=round(noise_z, 3),
                    t=t,
                    radius=round(noise_radius, 2),
                    confidence=round(random.uniform(0.4, 0.7), 3),
                    track_id=None
                )
            )

        random.shuffle(frame_detections)
        raw_detections.extend(frame_detections)
        active_cells = next_active_cells

    return raw_detections
