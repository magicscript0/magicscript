import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const sourceRoot = join(root, 'src')
const approvedWriter = join(sourceRoot, 'services', 'm11.ts')
const sourceFiles = []

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await collect(path)
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) sourceFiles.push(path)
  }
}

await collect(sourceRoot)
const contents = new Map(await Promise.all(sourceFiles.map(async (path) => [path, await readFile(path, 'utf8')])))
const failures = []
const writer = contents.get(approvedWriter) ?? ''

function fail(message) { failures.push(message) }

const firebaseSdkFiles = sourceFiles.filter((path) => /firebase\/(app|database)|getDemoDatabase|publishDemoRound/.test(contents.get(path) ?? ''))
for (const path of firebaseSdkFiles) {
  if (path === approvedWriter) continue
  const text = contents.get(path) ?? ''
  if (/from ['"]firebase\/database['"]/.test(text) && /\b(?:update|set|remove|push|runTransaction)\s*\(/.test(text)) {
    fail(`${relative(root, path)} contains a Firebase mutation primitive outside the approved writer`)
  }
}

const executableWriter = writer.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const writerMutations = executableWriter.match(/\b(?:update|set|remove|push|runTransaction)\s*\(/g) ?? []
if (writerMutations.length !== 1 || writerMutations[0] !== 'update(') {
  fail(`approved writer must contain exactly one Firebase update() call; found ${writerMutations.join(', ') || 'none'}`)
}

const publisherReferences = [...contents.entries()].flatMap(([path, text]) => {
  const count = (text.match(/publishDemoRound/g) ?? []).length
  return count ? [{ path, count }] : []
})
const expectedPublisherFiles = new Set([approvedWriter, join(sourceRoot, 'pages', 'Console.tsx')])
for (const { path } of publisherReferences) {
  if (!expectedPublisherFiles.has(path)) fail(`${relative(root, path)} references the Firebase publisher unexpectedly`)
}
if (!publisherReferences.some(({ path }) => path === approvedWriter)) fail('approved Firebase publisher export is missing')
if (!publisherReferences.some(({ path }) => path === join(sourceRoot, 'pages', 'Console.tsx'))) fail('Game Console is no longer the explicit publisher caller')

const config = contents.get(join(sourceRoot, 'config', 'game.ts')) ?? ''
const keys = [...config.matchAll(/'m(\d+)'/g)].map((match) => Number(match[1]))
const uniqueKeys = [...new Set(keys)]
const expectedKeys = Array.from({ length: 50 }, (_, index) => index + 1)
if (uniqueKeys.length !== 50 || uniqueKeys.some((key, index) => key !== expectedKeys[index])) {
  fail(`config/game.ts must define m1 through m50 exactly; found ${uniqueKeys.join(', ')}`)
}

const m11Config = contents.get(join(sourceRoot, 'config', 'firebase.ts')) ?? ''
if (!/M11_PATH\s*=\s*'m11'/.test(m11Config)) fail('Firebase M11_PATH is not the fixed m11 path')
for (const path of sourceFiles) {
  const text = contents.get(path) ?? ''
  if (path !== approvedWriter && /updateChildren|setValue|removeValue|runTransaction/.test(text)) {
    fail(`${relative(root, path)} contains an Android/legacy Firebase mutation API`)
  }
}

if (failures.length) {
  console.error('Firebase static audit failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Firebase static audit passed.')
console.log('- One Firebase SDK mutation: update() in src/services/m11.ts')
console.log('- One publisher caller: the explicit NEW GAME flow in src/pages/Console.tsx')
console.log('- Fixed path: /m11; fixed children: m1 through m50')
console.log('- No Firebase mutation primitives or legacy Android write APIs elsewhere in src')
