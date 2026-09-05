// Local development server. Node only, no dependencies at all.
//
// It runs exactly the same request handler the Worker runs, over the SQLite
// database the build produced instead of over D1, and serves the built
// interface the same way the Worker serves it from Workers Assets. One command
// therefore gives the whole platform on one origin, which is what the deployed
// thing is, and a bug found here is a bug in the code that deploys.
//
//   node api/dev-server.mjs [--port 8000] [--db ../build/kb.db] [--dist ../web/dist]
//
// Build the interface first, or this serves the API alone:
//   cd web && npm run build
//
// Wrangler is still what you use to deploy, and `npx wrangler dev` is worth
// running once before deploying, because it exercises the real D1 adapter.

import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { handle } from './src/app.js'

const HERE = dirname(fileURLToPath(import.meta.url))

function option (name, fallback) {
  const i = process.argv.indexOf('--' + name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const PORT = Number(option('port', 8000))
const DB_PATH = resolve(HERE, option('db', '../build/kb.db'))
const DIST = resolve(HERE, option('dist', '../web/dist'))

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
}

// Anything that is not an API call is the single-page interface, treated
// exactly as worker.js treats it: serve the file if it exists, otherwise
// index.html, so a deep link into a route survives a reload.
async function serveInterface (pathname) {
  if (!existsSync(DIST)) {
    return {
      status: 503,
      type: 'text/plain; charset=utf-8',
      body: Buffer.from(
        'The interface has not been built.\n\n' +
        '    cd web\n    npm run build\n\n' +
        'The API itself is running: try /api/meta\n')
    }
  }

  const wanted = decodeURIComponent(pathname)
  let file = resolve(DIST, '.' + (wanted === '/' ? '/index.html' : wanted))

  // Refuse anything that resolves outside the build directory.
  if (file !== DIST && !file.startsWith(DIST + sep)) {
    return { status: 403, type: 'text/plain; charset=utf-8', body: Buffer.from('Forbidden\n') }
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = resolve(DIST, 'index.html')
  }

  return {
    status: 200,
    type: MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    body: await readFile(file)
  }
}

if (!existsSync(DB_PATH)) {
  console.error(`No knowledge base at ${DB_PATH}`)
  console.error('Build it first:  py build\\build_kb.py')
  process.exit(1)
}

const database = new DatabaseSync(DB_PATH)
database.exec('PRAGMA foreign_keys = ON')

// node:sqlite is synchronous; the interface is async because D1 is. Wrapping
// the results in resolved promises is the whole of the difference.
const db = {
  async all (sql, params = []) {
    return database.prepare(sql).all(...params)
  },
  async run (sql, params = []) {
    const result = database.prepare(sql).run(...params)
    return { lastRowId: result.lastInsertRowid }
  }
}

const server = createServer(async (incoming, outgoing) => {
  const chunks = []
  for await (const chunk of incoming) chunks.push(chunk)
  const body = chunks.length ? Buffer.concat(chunks) : undefined

  const request = new Request(new URL(incoming.url, `http://localhost:${PORT}`), {
    method: incoming.method,
    headers: incoming.headers,
    body: ['GET', 'HEAD'].includes(incoming.method) ? undefined : body
  })

  const { pathname } = new URL(incoming.url, `http://localhost:${PORT}`)

  if (!pathname.startsWith('/api/')) {
    const file = await serveInterface(pathname)
    outgoing.writeHead(file.status, { 'content-type': file.type, 'cache-control': 'no-store' })
    outgoing.end(file.body)
    return
  }

  let response
  try {
    response = await handle(request, db)
  } catch (error) {
    response = new Response(JSON.stringify({ detail: String(error) }),
      { status: 500, headers: { 'content-type': 'application/json' } })
  }

  outgoing.writeHead(response.status, Object.fromEntries(response.headers))
  outgoing.end(Buffer.from(await response.arrayBuffer()))
})

server.listen(PORT, () => {
  const meta = database.prepare(
    "SELECT value FROM build_meta WHERE key = 'curriculum'").get()
  console.log(`http://127.0.0.1:${PORT}`)
  console.log(`  database   ${DB_PATH}`)
  console.log(`  curriculum ${meta ? meta.value : 'unknown'}`)
  console.log(existsSync(DIST)
    ? `  interface  ${DIST}`
    : '  interface  NOT BUILT — run:  cd web && npm run build')
})
