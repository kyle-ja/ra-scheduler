import { NextApiRequest, NextApiResponse } from 'next';
import { spawn } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * POST /api/generateSchedule
 *
 * Body JSON shape:
 * {
 *   "employees": [
 *     { "name": "Kyle", "weekday_cost": [1,2,3,4,5,6,7] }
 *   ],
 *   "dates": [
 *     { "date": "2025-06-03", "weekday": 1 }
 *   ]
 * }
 *
 * Response: 200 JSON array of { date, employee } on success.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // --------------------------
    // 1) Write request body to a temp file
    // --------------------------
    const tmpDir = mkdtempSync(join(tmpdir(), 'sched-'));
    const inPath = join(tmpDir, 'input.json');
    const outPath = join(tmpDir, 'output.json');
    writeFileSync(inPath, JSON.stringify(req.body));

    // --------------------------
    // 2) Spawn the Python solver
    // --------------------------
    const python = spawn('python', [
      'algorithms/scheduler_lp.py',
      inPath,
      outPath,
    ]);

    let stderr = '';
    python.stderr.on('data', (chunk) => (stderr += chunk));

    const exitCode: number = await new Promise((resolve) =>
      python.on('close', resolve)
    );

    if (exitCode !== 0) {
      console.error(stderr);
      return res.status(500).json({ error: 'Solver failed', details: stderr });
    }

    // --------------------------
    // 3) Read solver output and return it
    // --------------------------
    const scheduleJson = JSON.parse(readFileSync(outPath, 'utf-8'));
    return res.status(200).json(scheduleJson);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 