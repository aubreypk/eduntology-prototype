// Cloudflare Worker entry point.
//
// The only thing here is the adapter from D1 to the small database interface
// app.js expects, plus serving the built interface from Workers Assets when it
// is bound. There is no reasoning at this layer and no reasoning library in the
// bundle; that is the point of Section 4.6, and this file is where the claim
// becomes checkable — the Worker runs in an environment where rdflib and
// pySHACL simply cannot.

import { handle } from './app.js'

function d1Adapter (database) {
  return {
    async all (sql, params = []) {
      const statement = params.length
        ? database.prepare(sql).bind(...params)
        : database.prepare(sql)
      const { results } = await statement.all()
      return results || []
    },
    async run (sql, params = []) {
      const statement = params.length
        ? database.prepare(sql).bind(...params)
        : database.prepare(sql)
      const result = await statement.run()
      return { lastRowId: result.meta ? result.meta.last_row_id : null }
    }
  }
}

export default {
  async fetch (request, env) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/')) {
      if (!env.DB) {
        return new Response(
          JSON.stringify({
            detail: 'No D1 binding named DB. Check api/wrangler.toml and that the ' +
                    'database has been created with: npx wrangler d1 create eduntology'
          }),
          { status: 503, headers: { 'content-type': 'application/json' } })
      }
      return handle(request, d1Adapter(env.DB))
    }

    // Anything that is not an API call is the single-page interface. ASSETS is
    // bound when web/dist has been built and deployed alongside the Worker.
    if (env.ASSETS) {
      const response = await env.ASSETS.fetch(request)
      if (response.status !== 404) return response
      return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request))
    }

    return new Response(
      'The interface has not been built. Run: cd web && npm install && npm run build',
      { status: 404, headers: { 'content-type': 'text/plain' } })
  }
}
