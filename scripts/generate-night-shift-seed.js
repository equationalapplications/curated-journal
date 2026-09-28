#!/usr/bin/env node
/**
 * Generates an OKF zip bundle for the Night Shift Jetsam soak (spec §9.2):
 * 50 markdown facts, ~500 words each, with cross-links for realistic librarian work.
 *
 * Output: fixtures/night-shift-seed.zip (and fixtures/night-shift-seed/entities/journal/facts/*.md)
 *
 * N=<count> generates a larger journal for scale testing instead (e.g. the
 * graph at 100 / 1000 notes): fixtures/seed-<count>.zip, gitignored.
 *
 * Bundle layout: parseOkfBundle only reads files under `entities/<id>/`; a
 * bundle with notes at the root imports as zero facts.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { buildConceptDocument } = require('@equationalapplications/core-okf');
const { parseOkfBundle } = require('@equationalapplications/core-llm-wiki');

const NOTE_COUNT = Number(process.env.N ?? 50);
if (!Number.isInteger(NOTE_COUNT) || NOTE_COUNT < 1) {
  throw new Error(`N must be a positive integer, got ${process.env.N}`);
}
const IS_DEFAULT = NOTE_COUNT === 50;
const NAME = IS_DEFAULT ? 'night-shift-seed' : `seed-${NOTE_COUNT}`;
const ENTITY_DIR = 'entities/journal';
const TARGET_WORDS = 500;
const ROOT = path.join(__dirname, '..', 'fixtures', NAME);
const FACTS_DIR = path.join(ROOT, ENTITY_DIR, 'facts');
const ZIP_PATH = path.join(__dirname, '..', 'fixtures', `${NAME}.zip`);

const TITLES = [
  'Morning pages before the commute',
  'Conversation with Mara about the roadmap',
  'Lunch walk observations',
  'Notes from the architecture review',
  'Evening reflection on focus',
  'Weekend hike at Cedar Ridge',
  'Therapy session takeaways',
  'Book notes: Thinking in Systems',
  'Kitchen experiment — sourdough attempt',
  'Quarterly goals check-in',
  'Coffee with Alex from design',
  'Parent call — garden plans',
  'Sprint retro themes',
  'Meditation streak day forty',
  'Draft ideas for the talk',
  'Neighborhood noise complaint',
  'Research rabbit hole on embeddings',
  'Gym routine adjustment',
  'Podcast notes: maintenance culture',
  'Budget review for the trip',
  'Volunteer shift at the library',
  'Doctor follow-up questions',
  'Sketching the onboarding flow',
  'Rainy afternoon reading list',
  'Team offsite memories',
  'Fixing the bike tire',
  'Late night debugging journal',
  'Farmers market haul',
  'Conflict resolution at work',
  'Learning Rust — day one',
  'Gardening log — tomatoes',
  'Birthday dinner planning',
  'Noise-canceling headphones review',
  'Community meetup recap',
  'Writing practice — scene draft',
  'Insurance paperwork slog',
  'Sunrise run along the river',
  'Meal prep for the week',
  'Interview debrief notes',
  'Museum visit — color studies',
  'Phone screen fatigue',
  'Grant application outline',
  'Old photos digitization',
  'Stargazing on the roof',
  'Clinic visit summary',
  'Board game night strategy',
  'Freelance invoice chase',
  'Rain barrel installation',
  'Language practice — Spanish',
  'Year-end letter to friends',
];

const OPENERS = [
  'Today I noticed',
  'What stayed with me was',
  'I keep returning to the idea that',
  'The surprising part of the day was',
  'If I am honest with myself',
  'A small win:',
  'The friction point was',
  'Someone said something that landed:',
  'I want to remember',
  'Looking back at the last few weeks',
];

const THEMES = [
  'attention and how easily it fragments when notifications stack up',
  'the difference between urgency and importance on a crowded calendar',
  'how physical movement changes the quality of my thinking',
  'trust on a team when deadlines compress',
  'the stories I tell myself when I procrastinate',
  'sleep debt and its effect on patience',
  'learning in public versus learning in private',
  'the cost of saying yes without checking capacity',
  'friendships that survive long gaps between conversations',
  'craftsmanship in software as a form of respect for users',
  'anxiety as a signal rather than a verdict',
  'how naming a problem reduces its emotional temperature',
  'the pleasure of finishing something small and complete',
  'comparison spirals on social feeds',
  'gratitude that is specific instead of generic',
  'boundaries with work email after dinner',
  'curiosity as an antidote to cynicism',
  'the way place shapes mood more than I admit',
  'mentorship as listening more than advising',
  'maintenance work that nobody applauds but everybody needs',
];

const DETAILS = [
  'I wrote a few bullet points before the meeting so I would not ramble.',
  'The room was too warm and I drank too much coffee.',
  'I left my phone in another room for an hour and it helped.',
  'A neighbor waved from across the street and it oddly reset my mood.',
  'I misread a message and had to apologize — a useful humility reminder.',
  'The bus was late so I listened to a full album start to finish.',
  'I sketched a diagram on paper instead of opening another tab.',
  'Dinner was simple soup and bread and it tasted better than restaurant food.',
  'I saved a quote in my notebook without tagging it and found it again tonight.',
  'Rain on the window made the apartment feel like a studio.',
  'I counted ten breaths before replying to a tense email.',
  'The cat sat on my keyboard at the worst possible moment and I laughed.',
  'I walked an extra block to avoid the construction noise.',
  'A stranger held the door and I paid it forward at the shop.',
  'I deleted three apps I had not opened in months.',
];

function padId(n) {
  return String(n).padStart(Math.max(3, String(NOTE_COUNT).length), '0');
}

/** Distinct, realistic titles past the 50 curated ones: "Lunch walk observations (2)". */
function noteTitle(n) {
  if (n <= TITLES.length) return TITLES[n - 1];
  return `${TITLES[(n - 1) % TITLES.length]} (${Math.ceil(n / TITLES.length)})`;
}

function notePath(n) {
  return `${ENTITY_DIR}/facts/note-${padId(n)}.md`;
}

function linkTarget(n) {
  const wrapped = ((n - 1 + NOTE_COUNT) % NOTE_COUNT) + 1;
  // Relative to the linking note, which lives in the same folder.
  return `note-${padId(wrapped)}.md`;
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function generateBody(index) {
  const title = noteTitle(index);
  const relatedA = ((index + 6) % NOTE_COUNT) + 1;
  const relatedB = ((index + 17) % NOTE_COUNT) + 1;
  const relatedC = ((index + 29) % NOTE_COUNT) + 1;

  const paragraphs = [
    `# ${title}`,
    '',
    `${OPENERS[index % OPENERS.length]} ${THEMES[index % THEMES.length]}. ${DETAILS[index % DETAILS.length]}`,
    '',
    `This connects to earlier thinking in [note ${padId(relatedA)}](${linkTarget(relatedA)}) and the thread in [note ${padId(relatedB)}](${linkTarget(relatedB)}). I should revisit [note ${padId(relatedC)}](${linkTarget(relatedC)}) when I run Night Shift — there is probably an edge worth healing between them.`,
  ];

  let paragraphIndex = 0;
  while (wordCount(paragraphs.join('\n')) < TARGET_WORDS) {
    const theme = THEMES[(index + paragraphIndex) % THEMES.length];
    const detail = DETAILS[(index + paragraphIndex * 3) % DETAILS.length];
    paragraphs.push('');
    paragraphs.push(
      `Paragraph ${paragraphIndex + 1}: I spent time unpacking ${theme}. ${detail} I asked whether my default reaction still serves me, or if it is just familiar. Sometimes the journal is where I negotiate with future-me about what to prioritize next week.`,
    );
    paragraphIndex += 1;
  }

  paragraphs.push('');
  paragraphs.push(
    '## Loose ends',
    '',
    '- Follow up with one concrete next step, not three vague intentions.',
    '- Capture any names, dates, or numbers while they are still vivid.',
    '- Re-read linked notes after the librarian pass to see what merged.',
  );

  return paragraphs.join('\n');
}

function writeNotes() {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(FACTS_DIR, { recursive: true });

  const files = [];
  for (let i = 1; i <= NOTE_COUNT; i += 1) {
    const id = `note_${padId(i)}`;
    const title = noteTitle(i);
    const body = generateBody(i);
    const content = buildConceptDocument({ type: 'fact', id, title }, body);
    const relPath = notePath(i);
    const absPath = path.join(ROOT, relPath);
    fs.writeFileSync(absPath, content, 'utf8');
    files.push({ path: relPath, content });
  }
  return files;
}

function writeZip() {
  if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);
  execSync(`zip -rq "${ZIP_PATH}" entities`, { cwd: ROOT, stdio: 'inherit' });
}

function verify(files) {
  const dump = parseOkfBundle('night-shift-seed', files, { defaultSchema: 'fact' });
  const bundle = dump.entities['night-shift-seed'];
  const facts = bundle?.facts ?? [];
  const edges = bundle?.edges ?? [];
  if (facts.length !== NOTE_COUNT) {
    throw new Error(`Expected ${NOTE_COUNT} facts, parsed ${facts.length}`);
  }
  // Every note links 3 others; if none become edges, the link format drifted.
  if (NOTE_COUNT > 1 && edges.length === 0) {
    throw new Error('Parsed 0 edges; cross-links did not resolve');
  }
  const wordCounts = facts.map((fact) => wordCount(fact.body ?? ''));
  const minWords = Math.min(...wordCounts);
  const maxWords = Math.max(...wordCounts);
  const avgWords = Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length);
  if (minWords < TARGET_WORDS - 50) {
    throw new Error(`Note too short: min ${minWords} words (target ~${TARGET_WORDS})`);
  }
  console.log(`Verified: ${facts.length} facts, ${edges.length} edges`);
  console.log(`Body word counts — min: ${minWords}, avg: ${avgWords}, max: ${maxWords}`);
}

// Written after writeNotes() wipes ROOT, so it is never lost on regeneration.
function writeReadme() {
  const readme = `# ${NAME}

Generated by \`${IS_DEFAULT ? 'npm run seed:night-shift' : `N=${NOTE_COUNT} npm run seed:night-shift`}\`: ${NOTE_COUNT} journal notes (~${TARGET_WORDS} words each, 3 cross-links per note) as an OKF bundle.

Do not edit by hand; regenerate instead.

## Get the zip onto a device

- **Android emulator / USB device:** \`adb push fixtures/${NAME}.zip /sdcard/Download/\`
- **iOS simulator:** drag \`fixtures/${NAME}.zip\` onto the simulator window; it lands in Files.
- **Physical iPhone:** AirDrop the zip, then choose "Save to Files".

Then in the app: **Settings → Import OKF → pick \`${NAME}.zip\`**.
`;
  fs.writeFileSync(path.join(ROOT, 'README.md'), readme, 'utf8');
}

function main() {
  const files = writeNotes();
  writeReadme();
  writeZip();
  verify(files);
  const zipSizeKb = Math.round(fs.statSync(ZIP_PATH).size / 1024);
  console.log(`Wrote ${ZIP_PATH} (${zipSizeKb} KB)`);
  console.log(`Markdown sources: ${FACTS_DIR}/`);
  console.log(`Import on device: Settings → Import OKF → pick fixtures/${NAME}.zip`);
}

main();
