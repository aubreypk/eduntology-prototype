// Local development server. Node only, no dependencies at all.
//
// It runs exactly the same request handler the Worker runs, over the SQLite
// database the build produced instead of over D1. That means local development
// needs no Cloudflare account, no wrangler install and no network, and it means
// a bug found here is a bug in the code that deploys.
//
//   node api/dev-server.mjs [--port 8000] [--db ../build/kb.db]
//
// Wrangler is still what you use to deploy, and `npx wrangler dev` is worth
// running once before deploying, because it exercises the real D1 adapter.

import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { handle } from './src/app.js'

const HERE = dirname(fileURLToPath(import.meta.url))

function option (name, fallback) {
  const i = process.argv.indexOf('--' + name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const PORT = Number(option('port', 8000))
const DB_PATH = resolve(HERE, option('db', '../build/kb.db'))

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
  console.log(`API on http://127.0.0.1:${PORT}`)
  console.log(`  database   ${DB_PATH}`)
  console.log(`  curriculum ${meta ? meta.value : 'unknown'}`)
  console.log('  the interface runs separately:  cd web && npm run dev')
})
