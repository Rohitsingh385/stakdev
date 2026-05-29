// stak.dev — npm registry proxy
// deploy: wrangler deploy

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(req.url);
    const path = url.pathname;

    // /search?q=express
    if (path === '/search') {
      const q = url.searchParams.get('q') || '';
      if (!q) return json({ error: 'no query' }, 400);
      const r = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=8`);
      const d = await r.json();
      const results = (d.objects || []).map(o => ({
        name: o.package.name,
        description: o.package.description,
        version: o.package.version,
      }));
      return json(results);
    }

    // /versions?pkg=@faker-js/faker
    if (path === '/versions') {
      const pkg = url.searchParams.get('pkg') || '';
      if (!pkg) return json({ error: 'no pkg' }, 400);
      const r = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`);
      if (!r.ok) return json({ error: 'not found' }, 404);
      const d = await r.json();

      const latest = d['dist-tags']?.latest || '';
      const allVersions = Object.keys(d.versions || {}).reverse();
      // stable only — no prerelease
      const stable = allVersions.filter(v => /^\d+\.\d+\.\d+$/.test(v)).slice(0, 5);
      if (stable.length === 0 && latest) stable.push(latest);

      const pkg_json = d.versions?.[latest] || {};
      const hasBundledTypes = !!(pkg_json.types || pkg_json.typings || pkg_json['exports']?.types);
      const isBrowserSafe = !!(pkg_json.browser !== undefined);
      const isServerOnly = ['prisma', 'drizzle-orm', 'mongoose', 'nodemon', 'ts-node', 'jest', 'vitest', 'bcrypt', 'bullmq', 'ioredis', 'redis'].some(n => pkg.includes(n));

      return json({
        name: d.name,
        description: d.description,
        latest,
        versions: stable,
        hasBundledTypes,
        browserSafe: isBrowserSafe && !isServerOnly,
        typesPackage: !hasBundledTypes ? `@types/${pkg.replace(/^@[^/]+\//, '')}` : null,
      });
    }

    return json({ error: 'not found' }, 404);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
