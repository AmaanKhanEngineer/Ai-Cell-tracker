import os
import json
from typing import List, Optional
from models import ExperimentDetail, ExperimentMetadata

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

def ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)

def save_experiment(exp: ExperimentDetail):
    ensure_data_dir()
    file_path = os.path.join(DATA_DIR, f"{exp.metadata.id}.json")
    with open(file_path, "w") as f:
        # Use Pydantic v2 model_dump or model_dump_json
        f.write(exp.model_dump_json(indent=2))

def get_experiment(exp_id: str) -> Optional[ExperimentDetail]:
    file_path = os.path.join(DATA_DIR, f"{exp_id}.json")
    if not os.path.exists(file_path):
        return None
    try:
        with open(file_path, "r") as f:
            data = json.load(f)
            return ExperimentDetail.model_validate(data)
    except Exception as e:
        print(f"Error loading experiment {exp_id}: {e}")
        return None

def list_experiments() -> List[ExperimentMetadata]:
    ensure_data_dir()
    experiments = []
    for filename in os.listdir(DATA_DIR):
        if filename.endswith(".json"):
            exp_id = filename[:-5]
            exp = get_experiment(exp_id)
            if exp:
                experiments.append(exp.metadata)
    # Sort by creation time (newest first)
    experiments.sort(key=lambda x: x.created_at, reverse=True)
    return experiments

def delete_experiment(exp_id: str) -> bool:
    file_path = os.path.join(DATA_DIR, f"{exp_id}.json")
    if os.path.exists(file_path):
        os.remove(file_path)
        return True
    return False
