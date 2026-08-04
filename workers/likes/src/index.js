const ALLOWED_ORIGINS = new Set([
  'https://nacreator.it',
  'https://www.nacreator.it',
  'https://nacreatorita-hash.github.io',
  'http://127.0.0.1:4173',
  'http://localhost:4173'
]);

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://nacreator.it',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin'
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(origin)
  });
}

function validArticleId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,119}$/.test(value);
}

function validVoterId(value) {
  return typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
}

async function getCount(db, articleId) {
  const row = await db.prepare(
    'SELECT COUNT(*) AS total FROM article_likes WHERE article_id = ?'
  ).bind(articleId).first();
  return Number(row?.total || 0);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      if (!ALLOWED_ORIGINS.has(origin)) return json({ error: 'Origin non consentita' }, 403, origin);
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json({ error: 'Origin non consentita' }, 403, origin);
    }

    const url = new URL(request.url);
    if (url.pathname !== '/likes') return json({ error: 'Risorsa non trovata' }, 404, origin);

    const articleId = url.searchParams.get('article');
    if (!validArticleId(articleId)) return json({ error: 'Articolo non valido' }, 400, origin);

    if (request.method === 'GET') {
      return json({ article: articleId, count: await getCount(env.LIKES_DB, articleId) }, 200, origin);
    }

    if (request.method !== 'POST') return json({ error: 'Metodo non consentito' }, 405, origin);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Dati non validi' }, 400, origin);
    }

    if (!validVoterId(body.voterId) || typeof body.liked !== 'boolean') {
      return json({ error: 'Dati non validi' }, 400, origin);
    }

    if (body.liked) {
      await env.LIKES_DB.prepare(
        'INSERT OR IGNORE INTO article_likes (article_id, voter_id) VALUES (?, ?)'
      ).bind(articleId, body.voterId).run();
    } else {
      await env.LIKES_DB.prepare(
        'DELETE FROM article_likes WHERE article_id = ? AND voter_id = ?'
      ).bind(articleId, body.voterId).run();
    }

    return json({ article: articleId, count: await getCount(env.LIKES_DB, articleId), liked: body.liked }, 200, origin);
  }
};
