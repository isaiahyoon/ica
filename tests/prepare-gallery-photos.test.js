import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { fitDimensions, preparePhoto } from '../scripts/prepare-gallery-photos.js';

const exec = promisify(execFile);

test('gallery photo dimensions fit the website without enlarging smaller images', () => {
  assert.deepEqual(fitDimensions(1200, 800), { width: 1200, height: 800 });
  assert.deepEqual(fitDimensions(2048, 1024), { width: 2048, height: 1024 });
  const scaled = fitDimensions(6000, 4000);
  assert.equal(scaled.width, 2048);
  assert.ok(Math.abs(scaled.width / scaled.height - 1.5) < 0.001);
  assert.deepEqual(fitDimensions(1, 100_000_000), { width: 1, height: 2048 });
});

test('macOS gallery conversion preserves originals, limits outputs, and avoids overwrites', {
  skip: process.platform !== 'darwin',
}, async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ica-photo-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const png = path.join(dir, 'source.png');
  const heic = path.join(dir, 'photo.HEIC');
  const out = path.join(dir, 'output');
  await fs.mkdir(out);
  await sharp(crypto.randomBytes(480 * 320 * 3), {
    raw: { width: 480, height: 320, channels: 3 },
  }).png().toFile(png);
  await exec('/usr/bin/sips', ['-s', 'format', 'heic', png, '--out', heic]);
  const original = await fs.readFile(heic);

  const first = await preparePhoto(heic, out);
  const firstBytes = await fs.readFile(first);
  const meta = await sharp(firstBytes).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.width, 480);
  assert.equal(meta.height, 320);

  const unoptimized = path.join(dir, 'unoptimized.jpg');
  await exec('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', heic, '--out', unoptimized]);
  const originalJpeg = await fs.readFile(unoptimized);
  assert.ok(firstBytes.length <= originalJpeg.length);
  assert.deepEqual(await sharp(firstBytes).raw().toBuffer(), await sharp(originalJpeg).raw().toBuffer());

  const second = await preparePhoto(heic, out, { maxPixels: 60_000, maxBytes: 20_000 });
  const secondBytes = await fs.readFile(second);
  const reduced = await sharp(secondBytes).metadata();
  assert.ok(reduced.width * reduced.height <= 60_000);
  assert.ok(secondBytes.length <= 20_000);
  assert.equal(path.basename(second), 'photo-2.jpg');
  const thirdLimit = firstBytes.length - 1;
  const third = await preparePhoto(heic, out, { maxBytes: thirdLimit });
  const thirdBytes = await fs.readFile(third);
  const compressed = await sharp(thirdBytes).metadata();
  assert.equal(compressed.width, 480);
  assert.equal(compressed.height, 320);
  assert.ok(thirdBytes.length < thirdLimit);
  const fourth = await preparePhoto(heic, out, { maxBytes: 20_000 });
  const fourthBytes = await fs.readFile(fourth);
  const smaller = await sharp(fourthBytes).metadata();
  assert.ok(smaller.width < 480 && smaller.height < 320);
  assert.ok(fourthBytes.length <= 20_000);
  assert.deepEqual(await fs.readFile(first), firstBytes);
  assert.deepEqual(await fs.readFile(heic), original);

  const invalid = path.join(dir, 'invalid.heic');
  await fs.writeFile(invalid, 'not a photo');
  await assert.rejects(preparePhoto(invalid, out));
  assert.deepEqual((await fs.readdir(out)).sort(), ['photo-2.jpg', 'photo-3.jpg', 'photo-4.jpg', 'photo.jpg']);

  const secondDir = path.join(dir, 'another folder');
  await fs.mkdir(secondDir);
  const other = path.join(secondDir, 'another photo.heif');
  await fs.copyFile(heic, other);
  const existing = path.join(dir, 'photo.jpg');
  await fs.writeFile(existing, 'existing JPEG');
  await assert.rejects(exec(process.execPath, ['scripts/prepare-gallery-photos.js', heic, invalid, other, png]), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /invalid\.heic/);
    assert.match(error.stderr, /source\.png/);
    assert.match(error.stdout, /2\/4 converted/);
    return true;
  });
  const cliOutput = await fs.readFile(path.join(dir, 'photo-2.jpg'));
  assert.equal((await sharp(cliOutput).metadata()).format, 'jpeg');
  assert.equal((await sharp(path.join(secondDir, 'another photo.jpg')).metadata()).format, 'jpeg');
  assert.equal(await fs.readFile(existing, 'utf8'), 'existing JPEG');
  assert.deepEqual(await fs.readFile(heic), original);

  const app = path.join(dir, 'Converter.app');
  await exec('/usr/bin/osacompile', ['-o', app, 'scripts/gallery-photo-converter.applescript']);
  const bundled = path.join(app, 'Contents/Resources/prepare-gallery-photos.mjs');
  await fs.copyFile('scripts/prepare-gallery-photos.js', bundled);
  await exec('/usr/bin/codesign', ['--force', '--sign', '-', app]);
  await exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  const result = await exec(process.execPath, [bundled, heic, other]);
  assert.match(result.stdout, /2\/2 converted/);
  assert.equal((await sharp(path.join(dir, 'photo-3.jpg')).metadata()).format, 'jpeg');
  assert.equal((await sharp(path.join(secondDir, 'another photo-2.jpg')).metadata()).format, 'jpeg');

  const withoutJpegtran = await exec(process.execPath, [bundled, heic, other], {
    env: { ...process.env, PATH: '/usr/bin:/bin' },
  });
  assert.match(withoutJpegtran.stdout, /Lossless JPEG optimization is unavailable/);
  assert.match(withoutJpegtran.stdout, /2\/2 converted/);
});

test('macOS conversion resizes large photos to the website display dimensions', {
  skip: process.platform !== 'darwin',
}, async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ica-photo-limit-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const png = path.join(dir, 'large.png');
  const heic = path.join(dir, 'large.heic');
  await sharp({ create: { width: 6500, height: 6200, channels: 3, background: '#223b55' } }).png().toFile(png);
  await exec('/usr/bin/sips', ['-s', 'format', 'heic', png, '--out', heic]);
  const output = await preparePhoto(heic, dir);
  const info = await sharp(output).metadata();
  assert.equal(info.width, 2048);
  assert.ok(Math.abs(info.width / info.height - 6500 / 6200) < 0.001);
  assert.ok((await fs.stat(output)).size < 700_000);
});

test('website-sized output retains image detail while reducing JPEG size', {
  skip: process.platform !== 'darwin',
}, async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ica-photo-quality-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const png = path.join(dir, 'source.png');
  const heic = path.join(dir, 'photo.heic');
  const reference = path.join(dir, 'reference.tiff');
  const baseline = path.join(dir, 'high-quality.jpg');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1600">
    <defs><linearGradient id="sky" x2="1" y2="1"><stop stop-color="#213c6e"/><stop offset="1" stop-color="#f8d3bb"/></linearGradient>
    <pattern id="detail" width="60" height="60" patternUnits="userSpaceOnUse"><circle cx="30" cy="30" r="13" fill="#726148"/></pattern></defs>
    <path fill="url(#sky)" d="M0 0h2400v1600H0z"/><path fill="url(#detail)" d="M0 600h2400v1000H0z"/>
    <circle cx="1200" cy="650" r="260" fill="#f3d9b2"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(png);
  await exec('/usr/bin/sips', ['-s', 'format', 'heic', png, '--out', heic]);
  await exec('/usr/bin/sips', ['-s', 'format', 'tiff', '-z', '1365', '2048', heic, '--out', reference]);
  await exec('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '95', '-z', '1365', '2048', heic, '--out', baseline]);
  const output = await preparePhoto(heic, dir);
  const [expected, actual] = await Promise.all([
    sharp(reference).removeAlpha().toColourspace('srgb').raw().toBuffer(),
    sharp(output).removeAlpha().toColourspace('srgb').raw().toBuffer(),
  ]);
  assert.equal(actual.length, expected.length);
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference += Math.abs(actual[i] - expected[i]);
  assert.ok(difference / actual.length < 4);
  assert.ok((await fs.stat(output)).size < (await fs.stat(baseline)).size);
  assert.ok((await fs.stat(output)).size < 700_000);
});

test('macOS conversion compresses a large JPEG to strictly less than 0.7 MB', {
  skip: process.platform !== 'darwin',
}, async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ica-photo-size-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const png = path.join(dir, 'source.png');
  const heic = path.join(dir, 'photo.heic');
  const uncompressed = path.join(dir, 'high-quality.jpg');
  await sharp(crypto.randomBytes(1600 * 1200 * 3), {
    raw: { width: 1600, height: 1200, channels: 3 },
  }).png().toFile(png);
  await exec('/usr/bin/sips', ['-s', 'format', 'heic', png, '--out', heic]);
  await exec('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '95', heic, '--out', uncompressed]);
  assert.ok((await fs.stat(uncompressed)).size >= 700_000);
  const previousLimit = await preparePhoto(heic, dir, { maxBytes: 1_000_000 });
  assert.ok((await fs.stat(previousLimit)).size >= 700_000);
  const output = await preparePhoto(heic, dir);
  const info = await sharp(output).metadata();
  assert.ok(info.width <= 1600 && info.height <= 1200);
  assert.ok((await fs.stat(output)).size < 700_000);
});
