import * as path from "path";
import * as fs from "fs";

/**
 * Walk up from `startDir` (default CWD) looking for `.agency/` directory.
 * Returns the absolute path to `.agency/`, or null if not found.
 */
export function findAgencyRoot(startDir?: string): string | null {
  let dir = path.resolve(startDir ?? process.cwd());
  const root = path.parse(dir).root;

  while (true) {
    const candidate = path.join(dir, ".agency");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    if (dir === root) return null;
    dir = path.dirname(dir);
  }
}

/**
 * Like findAgencyRoot but throws if not found.
 */
export function requireAgencyRoot(startDir?: string): string {
  const root = findAgencyRoot(startDir);
  if (!root) {
    console.error("No .agency/ directory found. Run `agency init` first.");
    process.exit(1);
  }
  return root;
}
