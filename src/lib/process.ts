import { spawn } from 'node:child_process';

export interface RunResult {
  stdout: string;
  stderr: string;
}

/** Run a program without a shell (no quoting problems on Windows), with a timeout. */
export function runProcess(
  bin: string,
  args: string[],
  options: { timeoutMs?: number; cwd?: string } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd: options.cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = options.timeoutMs
      ? setTimeout(() => {
          proc.kill();
          reject(new Error(`${bin} timed out after ${Math.round(options.timeoutMs! / 1000)}s`));
        }, options.timeoutMs)
      : null;
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', (err) => { if (timer) clearTimeout(timer); reject(err); });
    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin.split(/[\\/]/).pop()} exited with code ${code}: ${(stderr || stdout).trim().slice(-800)}`));
    });
  });
}
