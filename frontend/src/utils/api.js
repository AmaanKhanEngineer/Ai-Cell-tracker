/**
 * API client to interact with the FastAPI bioimage backend.
 */

export async function fetchExperiments() {
  const res = await fetch('/api/experiments');
  if (!res.ok) throw new Error('Failed to fetch experiments');
  return res.json();
}

export async function triggerSimulation({ name, numInitialCells, totalFrames, boxSize, divisionProb, motionNoise, maxLinkDistance }) {
  const formData = new FormData();
  formData.append('name', name);
  formData.append('num_initial_cells', String(numInitialCells));
  formData.append('total_frames', String(totalFrames));
  formData.append('box_size', String(boxSize));
  formData.append('division_prob', String(divisionProb));
  formData.append('motion_noise', String(motionNoise));
  formData.append('max_link_distance', String(maxLinkDistance));

  const res = await fetch('/api/experiments/simulate', {
    method: 'POST',
    body: formData,
  });
  
  if (!res.ok) throw new Error('Simulation request failed');
  return res.json();
}

export async function uploadDataset(file, name) {
  const formData = new FormData();
  formData.append('file', file);
  if (name) {
    formData.append('name', name);
  }

  const res = await fetch('/api/experiments/upload', {
    method: 'POST',
    body: formData,
  });
  
  if (!res.ok) throw new Error('Dataset upload failed');
  return res.json();
}

export async function fetchExperimentDetail(id) {
  const res = await fetch(`/api/experiments/${id}`);
  if (!res.ok) throw new Error('Failed to fetch experiment detail');
  return res.json();
}

export async function deleteExperiment(id) {
  const res = await fetch(`/api/experiments/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete experiment');
  return res.json();
}
