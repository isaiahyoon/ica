import { execFile } from 'node:child_process';
import { constants, realpathSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const MAX_PIXELS = 40_000_000;
const MAX_BYTES = 700_000;
const MAX_EDGE = 2048;
let jpegtranAvailable = true;

async function dimensions(filename) {
  const { stdout } = await run('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', filename]);
  const width = Number(stdout.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const height = Number(stdout.match(/pixelHeight:\s*(\d+)/)?.[1]);
  if (!width || !height) throw new Error('Could not read the image dimensions.');
  return { width, height };
}

export function fitDimensions(width, height, maxPixels = MAX_PIXELS) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height), Math.sqrt(maxPixels / (width * height)));
  let fittedWidth = Math.max(1, Math.floor(width * scale));
  let fittedHeight = Math.max(1, Math.floor(height * scale));
  if (fittedWidth * fittedHeight > maxPixels) {
    if (fittedWidth > fittedHeight) fittedWidth = Math.floor(maxPixels / fittedHeight);
    else fittedHeight = Math.floor(maxPixels / fittedWidth);
  }
  return { width: fittedWidth, height: fittedHeight };
}

async function optimizeJpeg(filename, optimized) {
  if (!jpegtranAvailable) return;
  try {
    await run('jpegtran', ['-copy', 'all', '-optimize', '-progressive', '-outfile', optimized, filename]);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    jpegtranAvailable = false;
    console.log('Lossless JPEG optimization is unavailable because jpegtran is not installed.');
    return;
  }
  if ((await fs.stat(optimized)).size < (await fs.stat(filename)).size) {
    await fs.rename(optimized, filename);
  } else {
    await fs.rm(optimized);
  }
}

export async function preparePhoto(input, outputDir, { maxPixels = MAX_PIXELS, maxBytes = MAX_BYTES } = {}) {
  const original = await dimensions(input);
  let size = fitDimensions(original.width, original.height, maxPixels);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ica-photo-'));
  const temporary = path.join(tempDir, 'converted.jpg');
  const optimized = path.join(tempDir, 'optimized.jpg');
  try {
    let valid = false;
    while (!valid) {
      for (let quality = 85; quality >= 80; quality -= 5) {
        const args = ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality)];
        if (size.width !== original.width || size.height !== original.height) {
          args.push('-z', String(size.height), String(size.width));
        }
        args.push(input, '--out', temporary);
        await run('/usr/bin/sips', args);
        await optimizeJpeg(temporary, optimized);
        if ((await fs.stat(temporary)).size < maxBytes) {
          valid = true;
          break;
        }
      }
      if (!valid) {
        if (size.width === 1 && size.height === 1) {
          throw new Error('Could not compress the JPEG below the size limit.');
        }
        size = {
          width: Math.max(1, Math.floor(size.width * 0.8)),
          height: Math.max(1, Math.floor(size.height * 0.8)),
        };
      }
    }
    const outputSize = await dimensions(temporary);
    if (outputSize.width * outputSize.height > maxPixels || Math.max(outputSize.width, outputSize.height) > MAX_EDGE) {
      throw new Error('The converted image exceeds the output dimension limit.');
    }
    const base = path.basename(input, path.extname(input));
    for (let number = 1; ; number++) {
      const suffix = number === 1 ? '' : `-${number}`;
      const output = path.join(outputDir, `${base}${suffix}.jpg`);
      try {
        await fs.copyFile(temporary, output, constants.COPYFILE_EXCL);
        return output;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('This tool requires macOS and its built-in sips utility.');
  if (process.argv.length < 3 || process.argv[2] === '--help') {
    console.log('Usage: npm run prepare-gallery -- "/path/to/photo.heic" [more photos...]');
    if (process.argv.length < 3) process.exitCode = 1;
    return;
  }
  const photos = process.argv.slice(2).map((photo) => path.resolve(photo));
  let failures = 0;
  for (const [index, photo] of photos.entries()) {
    try {
      if (!/\.(heic|heif)$/i.test(photo) || !(await fs.stat(photo)).isFile()) {
        throw new Error('Choose a HEIC or HEIF photo.');
      }
      const output = await preparePhoto(photo, path.dirname(photo));
      console.log(`${index + 1}/${photos.length}: ${path.basename(photo)} -> ${path.basename(output)}`);
    } catch (error) {
      failures++;
      console.error(`${index + 1}/${photos.length}: ${path.basename(photo)}: ${error.message}`);
    }
  }
  console.log(`Finished: ${photos.length - failures}/${photos.length} converted. JPEGs are beside their originals.`);
  if (failures) process.exitCode = 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
