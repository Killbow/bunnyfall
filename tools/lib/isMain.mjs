// Compares real paths, because import.meta.url is percent-encoded and symlink-resolved and process.argv[1] is not.
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function isMain(url) {
  const argv1 = process.argv[1];
  if (!argv1 || !existsSync(argv1)) return false;
  return realpathSync(argv1) === realpathSync(fileURLToPath(url));
}
