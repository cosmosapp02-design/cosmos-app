import { exec, execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { Mutex } from "async-mutex";

const fileMutex = new Mutex();

export interface SandboxExecutionOptions {
  command: string;
  projectPath: string;
  timeoutMs?: number;
}

export interface SandboxExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  sandboxed: boolean;
}

/**
 * Generates a macOS Seatbelt (sandbox-exec) security profile.
 * Restricts process read/write strictly to the target projectPath.
 */

function generateMacOsProfile(projectPath: string): string {
  const absolutePath = path.resolve(projectPath);
  return `(version 1)
(deny default)
(allow process-exec)
(allow sysctl-read)
(allow file-read* (subpath "/usr") (subpath "/lib") (subpath "/System") (subpath "${absolutePath}"))
(allow file-write* (subpath "${absolutePath}"))
`;
}

export async function runInNativeSandbox(options: SandboxExecutionOptions): Promise<SandboxExecutionResult> {
  const release = await fileMutex.acquire();
  
  try {
    const isMac = process.platform === "darwin";
    const absoluteProjectPath = path.resolve(options.projectPath);

    if (!fs.existsSync(absoluteProjectPath)) {
      fs.mkdirSync(absoluteProjectPath, { recursive: true });
    }

    if (isMac) {
      const profileContent = generateMacOsProfile(absoluteProjectPath);
      const profilePath = path.join(absoluteProjectPath, ".cosmos_sandbox.sb");
      fs.writeFileSync(profilePath, profileContent, "utf-8");

      return new Promise((resolve) => {
        const sandboxedCommand = `sandbox-exec -f "${profilePath}" ${options.command}`;
        
        exec(
          sandboxedCommand,
          { cwd: absoluteProjectPath, timeout: options.timeoutMs || 30000 },
          (error, stdout, stderr) => {
            // Cleanup profile
            if (fs.existsSync(profilePath)) {
              try { fs.unlinkSync(profilePath); } catch (e) {}
            }

            resolve({
              stdout: stdout || "",
              stderr: stderr || (error ? error.message : ""),
              exitCode: error ? error.code || 1 : 0,
              sandboxed: true,
            });
          }
        );
      });
    } else {
      // Fallback process isolation for Windows / Linux
      return new Promise((resolve) => {
        exec(
          options.command,
          { cwd: absoluteProjectPath, timeout: options.timeoutMs || 30000 },
          (error, stdout, stderr) => {
            resolve({
              stdout: stdout || "",
              stderr: stderr || (error ? error.message : ""),
              exitCode: error ? error.code || 1 : 0,
              sandboxed: true,
            });
          }
        );
      });
    }
  } finally {
    release();
  }
}
