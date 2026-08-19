import { isAbsolute, relative, sep } from "node:path";

export function isPathWithin(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" ||
    (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}
