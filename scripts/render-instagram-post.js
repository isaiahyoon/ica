import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { postCaption, postDetails, postHashtags, renderInstagramPost, sermonLink } from '../lib/instagram-post.js';
import { splitBilingual } from '../lib/sermon-metadata.js';

const root = fileURLToPath(new URL('../', import.meta.url));

export function postFileStem(sermon) {
  let date = 'undated';
  if (sermon.date != null && sermon.date !== '') {
    if (typeof sermon.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(sermon.date)
      || !Number.isFinite(Date.parse(sermon.date))
      || new Date(sermon.date).toISOString().slice(0, 10) !== sermon.date) {
      throw new TypeError('Sermon date must be a valid YYYY-MM-DD date.');
    }
    date = sermon.date;
  }
  const { en, ko } = splitBilingual(sermon.service);
  const service = (en || ko).normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  if ((en || ko) && !service) throw new TypeError('Service label must contain letters or numbers for the filename.');
  return `sermons-${date}-${service || 'unspecified-service'}`;
}

async function writePost(outputRoot, stem, image) {
  for (let number = 1; ; number += 1) {
    const file = path.join(outputRoot, `${stem}${number === 1 ? '' : `-${number}`}.jpg`);
    let handle;
    try {
      handle = await fs.open(file, 'wx');
    } catch (error) {
      if (error.code === 'EEXIST') continue;
      throw error;
    }
    try {
      await handle.writeFile(image);
      await handle.close();
    } catch (error) {
      await handle.close();
      await fs.unlink(file);
      throw error;
    }
    return file;
  }
}

export async function generatePosts(entries, outputRoot) {
  if (!Array.isArray(entries) || !entries.length) throw new TypeError('Provide at least one sermon.');
  const posts = entries.map((entry) => {
    const link = sermonLink(entry.url);
    postDetails(entry);
    return { ...entry, ...link, stem: postFileStem(entry),
      caption: postCaption(entry.description), hashtags: postHashtags(entry.hashtags) };
  });
  await fs.mkdir(outputRoot, { recursive: true });
  const existingImages = (await fs.readdir(outputRoot)).filter((file) => file.endsWith('.jpg')).length;
  const results = [];
  try {
    for (const [index, post] of posts.entries()) {
      const image = await renderInstagramPost(post, {
        seed: `${crypto.randomUUID()}:${index}`, designIndex: existingImages + index,
        backgroundPath: post.backgroundPath,
      });
      const file = await writePost(outputRoot, post.stem, image);
      results.push({ url: post.url, file, caption: post.caption, hashtags: post.hashtags });
    }
  } catch (error) {
    await Promise.all(results.map(({ file }) => fs.unlink(file)));
    throw error;
  }
  return results;
}

export async function run(args) {
  const options = {
    '--output': path.join(root, 'data/instagram'),
    '--data-dir': process.env.ICA_DATA_DIR || path.join(root, 'data'),
  };
  const links = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (['--output', '--data-dir', '--input'].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new TypeError(`${arg} needs a path.`);
      options[arg] = path.resolve(args[++i]);
    } else if (arg.startsWith('--')) {
      throw new TypeError(`Unknown option: ${arg}`);
    } else {
      links.push(arg);
    }
  }
  if (options['--input'] && links.length) throw new TypeError('Use sermon links or --input, not both.');
  let entries;
  if (options['--input']) {
    entries = JSON.parse(await fs.readFile(options['--input'], 'utf8'));
  } else {
    if (!links.length) throw new TypeError('Usage: npm run instagram -- "<sermon URL>" [...] or --input <verified metadata.json>');
    const parsed = links.map(sermonLink);
    const sermons = JSON.parse(await fs.readFile(path.join(options['--data-dir'], 'sermons.json'), 'utf8'));
    if (!Array.isArray(sermons)) throw new TypeError('sermons.json must contain an array.');
    entries = parsed.map((link) => {
      const sermon = sermons.find((item) => item.id?.toLowerCase() === link.id);
      if (!sermon) throw new Error(`Sermon ${link.id} is not in the local store. Use --input with metadata verified from the linked page.`);
      return { ...sermon, url: link.url };
    });
  }
  return generatePosts(entries, options['--output']);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).then((results) => {
    console.log(JSON.stringify(results, null, 2));
  }).catch((error) => {
    console.error(`Instagram generation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
