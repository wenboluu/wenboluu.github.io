// Meshes arm shells off the main thread. Message: {jobs: [{name, index}]}.
// Replies with {name, positions, normals, indices} per job (transferred).
import * as S from './sdf.js';
import {SHAPES, FINGER, ARM_RESOLUTION} from './robot-shapes.js';
onmessage = ({data}) => {
  for (const job of data.jobs) {
    const shape = job.name === 'finger' ? FINGER : SHAPES[job.index];
    const m = S.mesh(shape.sdf, shape.bounds[0], shape.bounds[1], job.name === 'finger' ? FINGER.h : ARM_RESOLUTION);
    postMessage({name: job.name, positions: m.positions, normals: m.normals, indices: m.indices},
      [m.positions.buffer, m.normals.buffer, m.indices.buffer]);
  }
};
