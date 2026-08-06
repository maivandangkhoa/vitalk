/**
 * Deploy storage.rules through the firebaserules REST API.
 *
 * The project uses a custom Storage bucket name ("havitalk", not
 * "<project>.appspot.com"), which the Firebase CLI's storage deploy cannot
 * target — that is also why firebase.json deliberately has no "storage" block.
 * This script does what the CLI would: upload a ruleset, then point the
 * bucket's release at it.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=firebase-auth.json node scripts/deploy-storage-rules.mjs
 */
import { readFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'vietalky';
const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'havitalk';
const RULES_FILE = 'storage.rules';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});
const client = await auth.getClient();

async function api(url, method, body) {
  const res = await client.request({ url, method, data: body });
  return res.data;
}

const source = readFileSync(RULES_FILE, 'utf8');

const ruleset = await api(
  `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/rulesets`,
  'POST',
  { source: { files: [{ name: RULES_FILE, content: source }] } }
);
console.log(`Uploaded ruleset ${ruleset.name}`);

// The release id contains a slash, so it has to be percent-encoded when it
// appears inside a URL path.
const releaseId = `firebase.storage/${BUCKET}`;
const releaseName = `projects/${PROJECT_ID}/releases/${releaseId}`;
const encoded = encodeURIComponent(releaseId);

try {
  await api(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/releases`,
    'POST',
    { name: releaseName, rulesetName: ruleset.name }
  );
  console.log(`Created release ${releaseName}`);
} catch (err) {
  if (err.response?.status !== 409) throw err;
  // Already released once — update it in place.
  await api(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/releases/${encoded}`,
    'PATCH',
    { release: { name: releaseName, rulesetName: ruleset.name } }
  );
  console.log(`Updated release ${releaseName}`);
}

console.log(`storage.rules is live on gs://${BUCKET}`);
