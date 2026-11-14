import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import heif from 'libheif-js/wasm-bundle.js';

const images = new heif.HeifDecoder().decode(await fs.readFile(workerData.path));
try {
  const image = images[0];
  const width = image?.get_width();
  const height = image?.get_height();
  if (images.length !== 1 || !width || !height || width * height > workerData.maxPixels) {
    parentPort.postMessage({ invalid: true });
  } else {
    const pixels = await new Promise((resolve) => {
      image.display({ width, height, data: new Uint8ClampedArray(width * height * 4) }, resolve);
    });
    if (!pixels) {
      parentPort.postMessage({ invalid: true });
    } else {
      const full = await sharp(Buffer.from(pixels.data.buffer), { raw: { width, height, channels: 4 } })
        .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
      parentPort.postMessage(full);
    }
  }
} finally {
  images.forEach((image) => image.free());
}
