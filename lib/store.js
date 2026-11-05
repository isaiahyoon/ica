import fs from 'node:fs/promises';
import path from 'node:path';

// Tiny JSON-file store; plenty for a local prototype. Swap for a database later.
export function createStore(dataDir) {
  const file = (name) => path.join(dataDir, `${name}.json`);
  let queue = Promise.resolve();

  async function read(name) {
    try {
      return JSON.parse(await fs.readFile(file(name), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  // Serialise writes so concurrent uploads cannot clobber each other.
  function update(name, fn) {
    const run = queue.then(async () => {
      await fs.mkdir(dataDir, { recursive: true });
      const next = await fn(await read(name));
      await fs.writeFile(file(name), JSON.stringify(next, null, 2));
      return next;
    });
    queue = run.catch(() => {});
    return run;
  }

  return { read, update };
}
