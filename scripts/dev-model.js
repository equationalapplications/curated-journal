#!/usr/bin/env node
/**
 * Put a catalog LLM on a dev device without downloading it through the app.
 *
 *   npm run dev:model                 # fast-light onto the connected Android device
 *   npm run dev:model -- smarter-slower
 *   npm run dev:model -- fast-light --ios        # booted iOS simulator
 *   npm run dev:model -- fast-light --serial emulator-5554
 *
 * The model is downloaded once to a host cache (resumable, size-checked):
 *   ${XDG_CACHE_HOME:-~/.cache}/curated-journal/models/<file>.gguf
 * and copied into the dev build's documents folder, where the model hub
 * would have put it. On next launch a dev build (EXPO_PUBLIC_DEV_LLM unset or
 * `auto`) adopts it and skips the model hub. See src/lib/devModel.ts.
 *
 * Android needs a debuggable build (the dev client is): the copy uses run-as.
 */

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo;
const ANDROID_PACKAGE = app.android.package;
const IOS_BUNDLE_ID = app.ios.bundleIdentifier;

/**
 * The catalog lives in TypeScript (src/catalog/modelManifest.ts); read the
 * three fields this script needs from it rather than duplicating them.
 */
function readCatalog() {
  const src = fs.readFileSync(path.join(ROOT, 'src/catalog/modelManifest.ts'), 'utf8');
  // One entry per `id:`; fields are read independently, in any order.
  const models = src
    .split(/\n\s*id:\s*/)
    .slice(1)
    .map((block) => {
      const field = (name) => new RegExp(`${name}:\\s*'([^']+)'`).exec(block)?.[1];
      const size = /sizeBytes:\s*([\d_]+)/.exec(block)?.[1];
      return {
        id: /^'([^']+)'/.exec(block)?.[1],
        filename: field('filename'),
        hfUrl: field('hfUrl'),
        sizeBytes: size ? Number(size.replace(/_/g, '')) : NaN,
      };
    })
    .filter((m) => m.id && m.filename && m.hfUrl && Number.isFinite(m.sizeBytes));
  if (models.length === 0) throw new Error('Could not read the model catalog from modelManifest.ts');
  return models;
}

function parseArgs(argv) {
  const opts = { modelId: 'fast-light', platform: 'android', serial: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ios') opts.platform = 'ios';
    else if (a === '--android') opts.platform = 'android';
    else if (a === '--serial') opts.serial = argv[++i];
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (!a.startsWith('-')) opts.modelId = a;
    else throw new Error(`Unknown option ${a}`);
  }
  return opts;
}

function cacheDir() {
  const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  return path.join(base, 'curated-journal', 'models');
}

function sizeOf(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return -1;
  }
}

function ensureCached(model) {
  const dir = cacheDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, model.filename);
  if (sizeOf(file) === model.sizeBytes) {
    console.log(`Cached: ${file}`);
    return file;
  }
  const partial = `${file}.part`;
  console.log(`Downloading ${model.id} (${(model.sizeBytes / 1e9).toFixed(1)} GB) to ${dir}`);
  // -C - resumes an interrupted download; --fail surfaces HTTP errors.
  const r = spawnSync('curl', ['-L', '--fail', '-C', '-', '-o', partial, model.hfUrl], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`Download failed (curl exit ${r.status}); run again to resume.`);
  const got = sizeOf(partial);
  if (got !== model.sizeBytes) {
    throw new Error(
      `Downloaded ${got} bytes, expected ${model.sizeBytes}. Delete ${partial} and retry, or update sizeBytes in the catalog.`,
    );
  }
  fs.renameSync(partial, file);
  return file;
}

function pushAndroid(file, model, serial) {
  const target = serial ? ['-s', serial] : [];
  const adb = (...args) => execFileSync('adb', [...target, ...args], { encoding: 'utf8' });
  const dest = `files/${model.filename}`;
  console.log(`Copying to ${serial ?? 'the connected device'} (${ANDROID_PACKAGE}/${dest})…`);
  // Stream the host file straight into the app's files dir. No temp copy on
  // the device: a 2-3 GB model staged in /data/local/tmp needs twice the
  // space and fills an emulator's data partition.
  const r = spawnSync('adb', [...target, 'exec-in', `run-as ${ANDROID_PACKAGE} sh -c 'cat > ${dest}'`], {
    stdio: [fs.openSync(file, 'r'), 'inherit', 'inherit'],
  });
  const sizeOnDevice = () =>
    Number(adb('shell', `run-as ${ANDROID_PACKAGE} stat -c %s ${dest} 2>/dev/null || echo -1`).trim());
  // exec-in can return while the device-side cat is still flushing: wait
  // until the file reaches its size or stops growing.
  let size = sizeOnDevice();
  for (let last = -2; size !== model.sizeBytes && size !== last; ) {
    last = size;
    execFileSync('sleep', ['1']);
    size = sizeOnDevice();
  }
  if (r.status !== 0 || size !== model.sizeBytes) {
    adb('shell', `run-as ${ANDROID_PACKAGE} rm -f ${dest}`);
    throw new Error(
      `Copy failed (${size} of ${model.sizeBytes} bytes on device). Check free space: adb shell df -h /data`,
    );
  }
}

function pushIos(file, model) {
  const container = execFileSync('xcrun', ['simctl', 'get_app_container', 'booted', IOS_BUNDLE_ID, 'data'], {
    encoding: 'utf8',
  }).trim();
  const dest = path.join(container, 'Documents', model.filename);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  console.log(`Copying to ${dest}`);
  fs.copyFileSync(file, dest);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const catalog = readCatalog();
  if (opts.help) {
    console.log(`Usage: npm run dev:model -- [${catalog.map((m) => m.id).join('|')}] [--ios] [--serial <id>]`);
    return;
  }
  const model = catalog.find((m) => m.id === opts.modelId);
  if (!model) throw new Error(`Unknown model "${opts.modelId}". Choose: ${catalog.map((m) => m.id).join(', ')}`);

  const file = ensureCached(model);
  if (opts.platform === 'ios') pushIos(file, model);
  else pushAndroid(file, model, opts.serial);
  console.log(
    `Done. Relaunch the dev build: with no model configured it adopts ${model.id} and skips the model hub.`,
  );
}

module.exports = { readCatalog, parseArgs };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
