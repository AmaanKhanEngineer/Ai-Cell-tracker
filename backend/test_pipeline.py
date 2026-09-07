import sys
import os

# Add current folder to sys.path so we can import models, simulator, etc.
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import simulator
import tracker
import database

def test_pipeline():
    print("--- Starting 3D Cell Tracking Pipeline Verification ---")
    
    # 1. Test simulation
    print("1. Simulating 3D cell growth and division...")
    raw_dets = simulator.generate_simulation(
        num_initial_cells=8,
        total_frames=15,
        box_size=100.0,
        division_prob=0.1,
        motion_noise=1.0
    )
    print(f"   Generated {len(raw_dets)} cell detections across 15 frames.")
    assert len(raw_dets) > 0, "Simulation failed: no detections returned."

    # 2. Test tracking
    print("2. Running nearest-neighbor tracking and lineage reconstruction...")
    exp_detail = tracker.run_tracking(
        detections=raw_dets,
        experiment_id="test_verify_uuid",
        experiment_name="Validation Run",
        box_size=100.0,
        max_link_distance=15.0
    )
    
    # Analyze track data
    num_tracks = len(exp_detail.tracks)
    num_links = len(exp_detail.lineage_links)
    print(f"   Reconstructed {num_tracks} cell tracks.")
    print(f"   Identified {num_links} mitosis (division) events.")
    assert num_tracks > 0, "Tracking failed: no tracks reconstructed."
    
    # Verification of tracks linking
    for t_id, track in exp_detail.tracks.items():
        assert len(track.points) > 0, f"Track {t_id} is empty."
        if track.parent_track_id:
            # Check if parent exists
            assert track.parent_track_id in exp_detail.tracks, f"Parent track {track.parent_track_id} not found for {t_id}"

    # 3. Test Database storage
    print("3. Testing Local Database read/write...")
    database.save_experiment(exp_detail)
    print("   Saved experiment to local JSON store.")
    
    loaded_exp = database.get_experiment("test_verify_uuid")
    assert loaded_exp is not None, "Failed to load experiment from DB."
    assert loaded_exp.metadata.name == "Validation Run", "Loaded data name mismatch."
    assert len(loaded_exp.tracks) == num_tracks, "Loaded tracks length mismatch."
    print("   Successfully loaded and verified experiment.")

    # 4. Clean up
    database.delete_experiment("test_verify_uuid")
    print("   Cleaned up validation database entry.")
    
    print("\n--- Pipeline Verification SUCCESS! All checks passed. ---")

if __name__ == "__main__":
    try:
        test_pipeline()
    except Exception as e:
        print(f"\nVerification FAILED: {e}")
        sys.exit(1)
