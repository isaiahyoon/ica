import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { instagramArtworkTextLayers, postBackground, postCaption, postDetails, postHashtags, renderInstagramPost, sermonLink } from '../lib/instagram-post.js';
import { generatePosts, postFileStem, run } from '../scripts/render-instagram-post.js';
import { textLayer } from '../lib/sermon-preview.js';

const id = 'd1f9a3ba-7a1c-4b07-884b-2fad2f504a88';
const sermon = {
  id, url: `https://immanuelchurchofamerica.org/sermons/${id}`,
  title: 'The Path of the Grain of Wheat\n밀알의 길, 생명의 영광',
  speakerEn: 'Pastor John Yoon', speakerKo: '윤태선 목사',
  service: 'Sunday 2nd Service 주일 2부 예배',
  date: '2026-11-08',
  description: 'The saved English overview.\n저장된 한국어 설교 개요.',
  scripture: '2 Timothy 1:8-12, 16-18 // 디모데후서 1:8-12, 16-18',
  hashtags: ['2Timothy', 'Gospel', 'Sermon'],
};

async function temporary(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ica-instagram-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test('sermon links accept church and local URLs, discard query/hash, and reject unsupported sources', () => {
  assert.deepEqual(sermonLink(`${sermon.url}/?share=1#sermon`), { id, url: sermon.url });
  assert.equal(sermonLink(`http://localhost:1234/sermons/${id}`).id, id);
  assert.equal(sermonLink(`http://127.0.0.1:1234/sermons/${id}`).id, id);
  assert.equal(sermonLink(`http://[::1]:1234/sermons/${id}`).id, id);
  for (const url of ['https://example.org/sermons/' + id, 'http://immanuelchurchofamerica.org/sermons/' + id,
    'https://immanuelchurchofamerica.org:8443/sermons/' + id, 'https://user:pass@immanuelchurchofamerica.org/sermons/' + id,
    'https://immanuelchurchofamerica.org/sermons', sermon.url + '/preview.png', 'not a URL']) {
    assert.throws(() => sermonLink(url), { name: 'TypeError' });
  }
});

test('five hashtags always begin with the two church tags and validate three discretionary tags', () => {
  assert.deepEqual(postHashtags(sermon.hashtags), [
    '#ImmanuelChurchOfAmerica', '#미주임마누엘교회', '#2Timothy', '#Gospel', '#Sermon',
  ]);
  assert.equal(postHashtags().length, 5);
  assert.equal(postHashtags(['#Faith', '복음', 'Scripture'])[2], '#Faith');
  for (const tags of [[], ['Faith'], ['Faith', 'faith', 'Scripture'],
    ['ImmanuelChurchOfAmerica', 'Faith', 'Scripture'], ['미주임마누엘교회', 'Faith', 'Scripture'],
    ['two words', 'Faith', 'Scripture'], ['#', 'Faith', 'Scripture'], [null, 'Faith', 'Scripture']]) {
    assert.throws(() => postHashtags(tags), { name: 'TypeError' });
  }
});

test('required metadata preserves bilingual and legacy names without inventing translations', () => {
  assert.deepEqual(postDetails(sermon), {
    title: sermon.title, speaker: 'Pastor John Yoon\n윤태선 목사',
    scripture: '2 Timothy 1:8-12, 16-18\n디모데후서 1:8-12, 16-18',
    service: 'Sunday 2nd Service\n주일 2부 예배',
  });
  assert.equal(postDetails({ ...sermon, speakerEn: '', speakerKo: '윤태선 목사' }).speaker, '윤태선 목사');
  assert.equal(postDetails({ title: 'Hope', scripture: 'John 3:16', speaker: 'John Yoon // 윤태선' }).speaker, 'John Yoon\n윤태선');
  for (const invalid of [{ title: '' }, { title: ' '.repeat(140) }, { title: 'x'.repeat(141) },
    { scripture: '' }, { scripture: 'x'.repeat(101) }, { speakerEn: '', speakerKo: '' },
    { speakerEn: 'x'.repeat(101) }, { speakerEn: 42 }]) {
    assert.throws(() => postDetails({ ...sermon, ...invalid }), { name: 'TypeError' });
  }
});

test('captions use the verbatim overview with bilingual separation and a link-in-bio invitation', () => {
  const invitation = 'Listen to the sermon via the link in our bio.\n프로필 링크를 통해 설교를 들으실 수 있습니다.';
  for (const description of [
    'The saved English overview.\n저장된 한국어 설교 개요.',
    'The saved English overview. // 저장된 한국어 설교 개요.',
    '저장된 한국어 설교 개요. // The saved English overview.',
    'The saved English overview.\r\n저장된 한국어 설교 개요.',
  ]) {
    assert.equal(postCaption(description), `The saved English overview.\n\n저장된 한국어 설교 개요.\n\n${invitation}`);
  }
  const multiline = 'English first line.\nEnglish second line.\n한국어 첫 줄.\n한국어 둘째 줄.';
  assert.equal(postCaption(multiline), `English first line.\nEnglish second line.\n\n한국어 첫 줄.\n한국어 둘째 줄.\n\n${invitation}`);
  for (const description of ['English only.', '한국어만 있습니다.', 'English.\n\n한국어.']) {
    assert.equal(postCaption(description), `${description}\n\n${invitation}`);
  }
  const maximumOverview = 'x'.repeat(10000);
  assert.equal(postCaption(maximumOverview), `${maximumOverview}\n\n${invitation}`);
  for (const description of [undefined, null, '', '   ', 42, 'x'.repeat(10001)]) {
    assert.throws(() => postCaption(description), /Sermon Overview/);
  }
});

test('service labels preserve bilingual, single-language, and custom text and omit unspecified services', () => {
  for (const service of [undefined, null, '']) {
    assert.equal(postDetails({ ...sermon, service }).service, '');
  }
  for (const [service, expected] of [
    ['Sunday 2nd Service // 주일 2부 예배', 'Sunday 2nd Service\n주일 2부 예배'],
    ['Sunday 2nd Service\n주일 2부 예배', 'Sunday 2nd Service\n주일 2부 예배'],
    ['Wednesday Service', 'Wednesday Service'],
    ['금요예배', '금요예배'],
    ['Special Thanksgiving Service', 'Special Thanksgiving Service'],
  ]) {
    assert.equal(postDetails({ ...sermon, service }).service, expected);
  }
  for (const service of [42, ' '.repeat(4), 'x'.repeat(101)]) {
    assert.throws(() => postDetails({ ...sermon, service }), /Service label/);
  }
});

test('gradient compositions vary across generated seeds and use only supplied design colors', () => {
  const palette = Object.fromEntries(['midnight', 'royal-blue', 'ribbon-blue', 'sky',
    'pink', 'lavender', 'yellow', 'paper', 'brass', 'brass-soft'].map((key, index) => [key, `#${String(index).padStart(6, '0')}`]));
  const backgrounds = Array.from({ length: 20 }, (_, index) => postBackground(palette, `post-${index}`));
  assert.equal(new Set(backgrounds).size, 20);
  for (const svg of backgrounds) {
    assert.match(svg, /width="1080" height="1350"/);
    assert.ok(!svg.includes('undefined'));
    for (const accent of ['pink', 'lavender', 'yellow']) {
      assert.ok(svg.includes(`fill="${palette[accent]}"`) || svg.includes(`stroke="${palette[accent]}"`),
        `${accent} must be visible artwork, not just a gradient stop`);
    }
    for (const color of svg.match(/#[a-f\d]{6}/gi)) assert.ok(Object.values(palette).includes(color));
  }
});

test('composition families differ visibly even with identical colors, seed, and sermon text', async () => {
  const css = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  const colors = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[a-f\d]{6})/gi)]
    .map((match) => [match[1], match[2]]));
  const images = await Promise.all([0, 1, 2, 3].map((designIndex) =>
    sharp(Buffer.from(postBackground(colors, 'same-seed', designIndex)))
      .resize(270, 338).removeAlpha().raw().toBuffer()));
  for (let a = 0; a < images.length; a += 1) {
    for (let b = a + 1; b < images.length; b += 1) {
      let changed = 0;
      for (let i = 0; i < images[a].length; i += 3) {
        if (Math.max(...[0, 1, 2].map((channel) =>
          Math.abs(images[a][i + channel] - images[b][i + channel]))) > 30) changed += 1;
      }
      assert.ok(changed / (270 * 338) > .12, `designs ${a} and ${b} must differ across at least 12% of the artwork`);
    }
  }
});

test('artwork stays predominantly non-teal blue with visible pink, lavender, and yellow', async () => {
  const css = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  const colors = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[a-f\d]{6})/gi)]
    .map((match) => [match[1], match[2]]));
  for (let index = 0; index < 20; index += 1) {
    const { data, info } = await sharp(Buffer.from(postBackground(colors, `post-${index}`)))
      .resize(270, 338).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const counts = { blue: 0, pink: 0, lavender: 0, yellow: 0 };
    for (let i = 0; i < data.length; i += 3) {
      const [r, g, b] = data.subarray(i, i + 3);
      if (b > g * 1.15 && b > r * 1.2 && r < 110) counts.blue += 1;
      if (r > 140 && r > g * 1.06 && b > g * 1.02) counts.pink += 1;
      if (b > 140 && b > g * 1.1 && r > g * .99) counts.lavender += 1;
      if (r > 140 && g > 140 && r > b * 1.08 && g > b * 1.08) counts.yellow += 1;
    }
    const pixels = info.width * info.height;
    assert.ok(counts.blue / pixels > .6, 'dark, non-teal blue must dominate the artwork');
    for (const accent of ['pink', 'lavender', 'yellow']) {
      assert.ok(counts[accent] / pixels > .005, `${accent} must cover at least 0.5% of the artwork`);
    }
  }
});

test('renderer produces high-resolution portrait JPEGs with safe bilingual text and distinct artwork', async () => {
  const first = await renderInstagramPost(sermon, { seed: 'first' });
  const second = await renderInstagramPost({ ...sermon, title: '<Hope> & "Peace"\n소망과 평안' }, { seed: 'second' });
  assert.notDeepEqual(first, second);
  const info = await sharp(first).metadata();
  assert.equal(info.format, 'jpeg');
  assert.equal(info.width, 2160);
  assert.equal(info.height, 2700);
  assert.equal((await sharp(second).metadata()).width, 2160);
  const layers = await instagramArtworkTextLayers(sermon, { paper: '#fbfdfe' });
  const footer = layers.at(-2);
  const region = { left: footer.left, top: footer.top, width: footer.width, height: footer.height };
  const expectedFooter = await sharp(footer.input).ensureAlpha().raw().toBuffer();
  const renderedFooter = await sharp(first).extract(region).removeAlpha().raw().toBuffer();
  let inkPixels = 0;
  let difference = 0;
  for (let pixel = 0; pixel < expectedFooter.length / 4; pixel += 1) {
    if (expectedFooter[pixel * 4 + 3] !== 255) continue;
    inkPixels += 1;
    for (let channel = 0; channel < 3; channel += 1) {
      difference += Math.abs(renderedFooter[pixel * 3 + channel] - expectedFooter[pixel * 4 + channel]);
    }
  }
  assert.ok(inkPixels > 0);
  assert.ok(difference / (inkPixels * 3) < 5, 'rendered footer must contain the expected ivory lettering');
  for (const [field, value, text] of [
    ['service', 'Sunday 1st Service 주일 1부 예배', 'Sunday 2nd Service'],
    ['service', '', 'Sunday 2nd Service'],
    ['title', 'Hope\n소망', 'The Path of the Grain of Wheat'],
    ['scripture', 'John 3:16\n요한복음 3:16', '2 Timothy 1:8-12, 16-18'],
    ['speakerEn', 'Another saved speaker', 'Pastor John Yoon'],
  ]) {
    const changed = await renderInstagramPost({ ...sermon, [field]: value }, { seed: 'first' });
    const layer = layers.find((layer) => layer.text === text);
    assert.ok(layer, `missing ${field} layer`);
    const region = { left: layer.left, top: layer.top, width: layer.width, height: layer.height };
    assert.notDeepEqual(await sharp(first).extract(region).raw().toBuffer(),
      await sharp(changed).extract(region).raw().toBuffer(), `${field} must change pixels in its own region`);
  }
  await assert.rejects(renderInstagramPost({ ...sermon, title: Array(60).fill('A').join('\n') }), /too dense/);
});

test('filenames use the saved sermon date and safe service label', () => {
  assert.equal(postFileStem(sermon), 'sermons-2026-11-08-sunday-2nd-service');
  assert.equal(postFileStem({ ...sermon, service: '주일 2부 예배' }), 'sermons-2026-11-08-주일-2부-예배');
  assert.equal(postFileStem({ ...sermon, service: '../../Special / Service?' }), 'sermons-2026-11-08-special-service');
  assert.equal(postFileStem({}), 'sermons-undated-unspecified-service');
  for (const date of ['2026-02-30', '2026-13-01', '11/08/2026', 42]) {
    assert.throws(() => postFileStem({ ...sermon, date }), /valid YYYY-MM-DD/);
  }
  assert.throws(() => postFileStem({ ...sermon, service: '!!!' }), /letters or numbers/);
});

test('local background artwork is used beneath exact text and invalid paths fail explicitly', async (t) => {
  const directory = await temporary(t);
  const backgroundPath = path.join(directory, 'artwork.png');
  await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#03112c' } })
    .png().toFile(backgroundPath);
  const results = await generatePosts([{ ...sermon, backgroundPath }], directory);
  const { data } = await sharp(results[0].file).extract({ left: 0, top: 0, width: 20, height: 20 })
    .raw().toBuffer({ resolveWithObject: true });
  assert.ok(Math.abs(data[0] - 3) < 3 && Math.abs(data[1] - 17) < 3 && Math.abs(data[2] - 44) < 3);
  assert.equal((await sharp(results[0].file).metadata()).height, 2700);
  await assert.rejects(renderInstagramPost(sermon, { backgroundPath: '' }), /local image path/);
  await assert.rejects(renderInstagramPost(sermon, { backgroundPath: path.join(directory, 'missing.png') }), /missing/);
});

test('artwork typography separates languages and uses measured, non-overlapping groups', async () => {
  const c = { paper: '#fbfdfe', sky: '#bed8ea', 'brass-soft': '#dfc681' };
  for (const title of [sermon.title,
    'A Gospel Without Shame, Mercy on the Day of Judgment\n부끄러움없는 복음, 심판날의 긍휼',
    'Hope\n소망']) {
    const layers = await instagramArtworkTextLayers({ ...sermon, title }, c);
    for (let index = 0; index < layers.length; index += 1) {
      const layer = layers[index];
      const footer = index >= layers.length - 2;
      if (!footer) assert.ok(layer.height >= 44, 'secondary metadata must remain large enough for phone reading');
      assert.ok(layer.left >= 0 && layer.left + layer.width <= 2160);
      assert.ok(Math.abs(layer.left + layer.width / 2 - 1080) <= .5,
        'every text row must share the canvas centerline');
      const pixels = await sharp(layer.input).ensureAlpha().raw().toBuffer();
      const color = c.paper.match(/[a-f\d]{2}/gi).map((channel) => parseInt(channel, 16));
      let opaque = 0;
      for (let pixel = 0; pixel < pixels.length; pixel += 4) {
        if (pixels[pixel + 3] !== 255) continue;
        opaque += 1;
        assert.deepEqual([...pixels.subarray(pixel, pixel + 3)], color,
          'all lettering must use the same restrained ivory token');
      }
      assert.ok(opaque > 0, 'the color check must include visible lettering');
      assert.ok(layer.top + layer.height <= (footer ? 2580 : 2200),
        'metadata must stay above the bottom artwork; the footer may overlap ribbons');
      if (index) {
        const previous = layers[index - 1];
        assert.ok(layer.top - previous.top - previous.height >= 20, 'rows need at least 10 logical pixels of breathing room');
      }
    }
    assert.ok(!layers.some(({ text }) => text.includes('Speaker ·')));
    assert.equal(layers.at(-2).text, 'Since 1994');
    assert.equal(layers.at(-1).text, '1994년부터');
    assert.equal(layers.at(-1).top + layers.at(-1).height, 2580, 'footer must end 60 logical pixels above the bottom');
    assert.ok(layers.at(-2).height < layers.find(({ text }) => text === 'Pastor John Yoon').height,
      'founding year must be understated relative to sermon metadata');
    for (const text of ['2 Timothy 1:8-12, 16-18', 'Pastor John Yoon']) {
      const index = layers.findIndex((layer) => layer.text === text);
      const previous = layers[index - 1];
      assert.ok(layers[index].top - previous.top - previous.height >= 120,
        'separate sections need at least 60 logical pixels, more than language gaps');
    }
    const english = layers.find(({ text }) => text === 'Pastor John Yoon');
    const korean = layers.find(({ text }) => text === '윤태선 목사');
    assert.ok(korean.height < english.height * 1.3, 'Korean companion text must not dominate its English line');
  }
  await assert.rejects(instagramArtworkTextLayers({ ...sermon, title: Array(60).fill('A').join('\n') }, c), /too dense/);
});

test('Instagram stroke reinforcement improves thin serif visibility without changing preview defaults', async () => {
  const regular = await textLayer('Since 1994', 68, 1200, 130, '#fbfdfe');
  const explicit = await textLayer('Since 1994', 68, 1200, 130, '#fbfdfe', { strokeWidth: 0 });
  assert.deepEqual(regular, explicit);
  const reinforced = await textLayer('Since 1994', 68, 1200, 130, '#fbfdfe', { strokeWidth: 1.2 });
  const coverage = async (input) => {
    const pixels = await sharp(input).ensureAlpha().raw().toBuffer();
    let sum = 0;
    for (let i = 3; i < pixels.length; i += 4) sum += pixels[i];
    return sum;
  };
  assert.ok(await coverage(reinforced) > await coverage(regular) * 1.15,
    'reinforced strokes must measurably increase visible ink coverage');
});

test('batches create flat date-service filenames in order and preserve earlier renders', async (t) => {
  const output = await temporary(t);
  const other = { ...sermon, url: sermon.url.replace(id, 'eb590a2a-e48d-4160-b335-cdff6b3352cc') };
  const first = await generatePosts([sermon, other], output);
  assert.equal(first.length, 2);
  assert.deepEqual(first.map((item) => item.url), [sermon.url, other.url]);
  assert.equal((await fs.readdir(path.dirname(first[0].file))).length, 2);
  assert.equal(path.dirname(first[0].file), output);
  assert.equal(path.basename(first[0].file), 'sermons-2026-11-08-sunday-2nd-service.jpg');
  assert.equal(path.basename(first[1].file), 'sermons-2026-11-08-sunday-2nd-service-2.jpg');
  const before = await fs.readFile(first[0].file);
  const next = await generatePosts([sermon], output);
  assert.equal(path.dirname(next[0].file), output);
  assert.equal(path.basename(next[0].file), 'sermons-2026-11-08-sunday-2nd-service-3.jpg');
  assert.deepEqual(await fs.readFile(first[0].file), before);
  assert.equal(next[0].hashtags.length, 5);
  assert.equal(next[0].caption, postCaption(sermon.description));
  const folders = await fs.readdir(output);
  await assert.rejects(generatePosts([sermon, { ...sermon, scripture: '' }], output), /Scripture reference/);
  await assert.rejects(generatePosts([sermon, { ...sermon, description: '' }], output), /Sermon Overview/);
  await assert.rejects(generatePosts([], output), /at least one sermon/);
  assert.deepEqual(await fs.readdir(output), folders);
  await assert.rejects(generatePosts([{ ...sermon, title: Array(60).fill('A').join('\n') }], output), /too dense/);
  assert.deepEqual(await fs.readdir(output), folders);
  await assert.rejects(generatePosts([sermon, { ...sermon, title: Array(60).fill('A').join('\n') }], output), /too dense/);
  assert.deepEqual(await fs.readdir(output), folders);
  assert.deepEqual(await fs.readFile(first[0].file), before);
});

test('parallel generations reserve distinct flat filenames without overwriting', async (t) => {
  const output = await temporary(t);
  const batches = await Promise.all([generatePosts([sermon], output), generatePosts([sermon], output)]);
  assert.equal(new Set(batches.flat().map(({ file }) => file)).size, 2);
  assert.deepEqual((await fs.readdir(output)).sort(), [
    'sermons-2026-11-08-sunday-2nd-service-2.jpg', 'sermons-2026-11-08-sunday-2nd-service.jpg',
  ]);
});
test('local CLI resolves saved sermon links and supports verified JSON with custom per-sermon tags', async (t) => {
  const directory = await temporary(t);
  await fs.writeFile(path.join(directory, 'sermons.json'), JSON.stringify([sermon]));
  const output = path.join(directory, 'output');
  const saved = await run(['--data-dir', directory, '--output', output, sermon.url]);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].caption, postCaption(sermon.description));
  assert.deepEqual(saved[0].hashtags, postHashtags(sermon.hashtags));
  const input = path.join(directory, 'input.json');
  await fs.writeFile(input, JSON.stringify([{ ...sermon, hashtags: ['Faith', '복음', 'Scripture'] }]));
  const verified = await run(['--input', input, '--output', output]);
  assert.deepEqual(verified[0].hashtags, postHashtags(['Faith', '복음', 'Scripture']));
  assert.equal(verified[0].caption, postCaption(sermon.description));
  await assert.rejects(run([]), /Usage:/);
  await assert.rejects(run(['--output']), /needs a path/);
  await assert.rejects(run(['--unknown']), /Unknown option/);
  await assert.rejects(run(['--input', input, sermon.url]), /not both/);
  await assert.rejects(run(['--data-dir', directory, sermon.url.replace(id, 'eb590a2a-e48d-4160-b335-cdff6b3352cc')]), /not in the local store/);
  await fs.writeFile(input, '{broken');
  await assert.rejects(run(['--input', input]), SyntaxError);
});
