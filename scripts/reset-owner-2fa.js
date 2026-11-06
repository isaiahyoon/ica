// Run on the server if the owner loses both their phone and recovery codes:
//   npm run reset-owner-2fa
// The owner then signs in with ADMIN_PASSWORD and sets up the authenticator again.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from '../lib/store.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const store = createStore(process.env.ICA_DATA_DIR || path.join(root, 'data'));
await store.update('admins', (all) => all.map((a) => (a.owner
  ? { ...a, totpSecret: undefined, lastStep: undefined, recovery: undefined }
  : a)));
console.log('Owner two-step sign-in cleared. Sign in with ADMIN_PASSWORD to set it up again.');
