import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = path.join(root, 'Gallery Photo Converter.app');

async function main() {
  if (process.platform !== 'darwin') throw new Error('Building the photo converter requires macOS.');
  try {
    await fs.access(app);
    throw new Error(`The app already exists: ${app}. Move or remove it before rebuilding.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await promisify(execFile)('/usr/bin/osacompile', [
    '-o', app, path.join(root, 'scripts/gallery-photo-converter.applescript'),
  ]);
  try {
    await fs.copyFile(
      path.join(root, 'scripts/prepare-gallery-photos.js'),
      path.join(app, 'Contents/Resources/prepare-gallery-photos.mjs'),
    );
    await promisify(execFile)('/usr/bin/codesign', ['--force', '--sign', '-', app]);
  } catch (error) {
    await fs.rm(app, { recursive: true, force: true });
    throw error;
  }
  console.log(`Created: ${app}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
