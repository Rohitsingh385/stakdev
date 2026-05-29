// Replace with your deployed worker URL after: wrangler deploy
const PROXY = 'https://stak-proxy.stakbackend.workers.dev';

const CONFLICTS = [
  ['express','fastify','koa','hono','elysia'],
  ['jest','vitest','mocha'],
  ['mongoose','prisma','drizzle-orm','sequelize'],
  ['npm','yarn','pnpm'],
];

const SERVER_ONLY = new Set(['prisma','drizzle-orm','mongoose','sequelize','nodemon','ts-node','jest','vitest','bcrypt','bullmq','ioredis','redis','@prisma/client']);

const selected = {}; // { pkgName: { version, versions, browserSafe, typesPackage } }
let pm = 'npm';
let freshProject = false;
let searchTimer = null;

const input     = document.getElementById('pkg-input');
const sugEl     = document.getElementById('suggestions');
const chipsEl   = document.getElementById('chips');
const outputEl  = document.getElementById('output');
const cmdBox    = document.getElementById('cmd-box');
const cdnSect   = document.getElementById('cdn-section');
const cdnList   = document.getElementById('cdn-list');
const shareUrl  = document.getElementById('share-url');
const conflict  = document.getElementById('conflict-banner');
const freshTog  = document.getElementById('fresh-toggle');

async function search(q) {
  try {
    const r = await fetch(`${PROXY}/search?q=${encodeURIComponent(q)}`);
    return await r.json();
  } catch { return []; }
}

async function getVersions(pkg) {
  try {
    const r = await fetch(`${PROXY}/versions?pkg=${encodeURIComponent(pkg)}`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function copy(text) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  const el = document.createElement('textarea');
  el.value = text; document.body.appendChild(el); el.select();
  document.execCommand('copy'); document.body.removeChild(el);
}

function flash(btn, label) {
  btn.textContent = label; btn.classList.add('flashed');
  setTimeout(() => { btn.textContent = btn.dataset.orig; btn.classList.remove('flashed'); }, 1500);
}

function checkConflicts() {
  const reasons = getConflictReasons();
  const conflicting = getConflictingPkgs();
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('conflict'));
  conflicting.forEach(n => {
    const el = document.getElementById('chip-' + CSS.escape(n));
    if (el) el.classList.add('conflict');
  });
  if (reasons.length) {
    conflict.textContent = 'heads up: ' + reasons[0];
    conflict.style.display = 'block';
  } else {
    conflict.style.display = 'none';
  }
}

function renderCommand() {
  const pkgs = Object.entries(selected);
  if (!pkgs.length) { outputEl.style.display = 'none'; return; }
  outputEl.style.display = 'block';

  const deps = pkgs.map(([n, d]) => {
    const v = d.version;
    return (v === 'latest' || !v) ? n : `${n}@${v}`;
  }).join(' ');

  let install = '';
  if (pm === 'npm') install = `npm install ${deps}`;
  else if (pm === 'yarn') install = `yarn add ${deps}`;
  else if (pm === 'pnpm') install = `pnpm add ${deps}`;
  else if (pm === 'bun') install = `bun add ${deps}`;

  let cmd = '';
  if (freshProject) {
    const init = pm === 'npm' ? 'npm init -y' : pm === 'yarn' ? 'yarn init -y' : pm === 'pnpm' ? 'pnpm init' : 'bun init -y';
    cmd = `${init}\n${install}`;
  } else {
    cmd = install;
  }

  cmdBox.textContent = cmd;

  // cdn
  const browserPkgs = pkgs.filter(([n, d]) => d.browserSafe && !SERVER_ONLY.has(n));
  if (browserPkgs.length) {
    cdnSect.style.display = 'block';
    cdnList.innerHTML = browserPkgs.map(([n, d]) => {
      const v = (d.version && d.version !== 'latest') ? `@${d.version}` : '';
      const url = `https://unpkg.com/${n}${v}`;
      return `<div class="cdn-item">
        <span class="cdn-name">${n}</span>
        <span class="cdn-url">${url}</span>
        <span class="cdn-copy" onclick="copy('${url}');this.textContent='copied';setTimeout(()=>this.textContent='copy',1200)">copy</span>
      </div>`;
    }).join('');
  } else { cdnSect.style.display = 'none'; }

  // share url
  const stackStr = pkgs.map(([n, d]) => `${n}@${d.version || 'latest'}`).join(',');
  const url = `${location.origin}${location.pathname}?stack=${encodeURIComponent(stackStr)}&pm=${pm}`;
  shareUrl.value = url;
  history.replaceState(null, '', `?stack=${encodeURIComponent(stackStr)}&pm=${pm}`);
}

function renderChips() {
  chipsEl.innerHTML = Object.entries(selected).map(([name, data]) => {
    const vs = data.versions || ['latest'];
    const opts = vs.map(v => `<option value="${v}"${v === data.version ? ' selected' : ''}>${v}</option>`).join('');
    const typesTip = data.typesPackage && !selected[data.typesPackage]
      ? `<span class="chip-types" onclick="addChip('${data.typesPackage}')" title="add types">+types</span>` : '';
    return `<div class="chip${data.loading ? ' loading' : ''}" id="chip-${CSS.escape(name)}">
      <span>${name}</span>
      <select onchange="selected['${name}'].version=this.value;renderCommand()">${opts}</select>
      ${typesTip}
      <span class="chip-remove" onclick="removeChip('${name}')">×</span>
    </div>`;
  }).join('');
  checkConflicts();
  renderCommand();
}

async function addChip(name) {
  if (selected[name]) return;
  selected[name] = { version: 'latest', versions: ['latest'], loading: true, browserSafe: false, typesPackage: null };
  input.value = '';
  sugEl.style.display = 'none';
  renderChips();

  const data = await getVersions(name);
  if (data) {
    selected[name] = {
      version: data.versions?.[0] || data.latest || 'latest',
      versions: data.versions?.length ? data.versions : ['latest'],
      loading: false,
      browserSafe: data.browserSafe,
      typesPackage: data.typesPackage,
    };
  } else {
    selected[name].loading = false;
  }
  renderChips();
}

function removeChip(name) {
  delete selected[name];
  renderChips();
}

async function showSuggestions(q) {
  if (!q) { sugEl.style.display = 'none'; return; }
  const results = await search(q);
  if (!results.length) { sugEl.style.display = 'none'; return; }
  sugEl.innerHTML = results.map(p => `
    <div class="sug-item" onmousedown="addChip('${p.name.replace(/'/g,"\\'")}')">
      <span class="sug-name">${p.name}</span>
      <span class="sug-desc">${(p.description||'').slice(0,60)}</span>
      <span class="sug-ver">${p.version||''}</span>
    </div>`).join('');
  sugEl.style.display = 'block';
}

input.addEventListener('input', e => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (!q) { sugEl.style.display = 'none'; return; }
  searchTimer = setTimeout(() => showSuggestions(q), 280);
});

input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && input.value.trim()) addChip(input.value.trim());
  if (e.key === 'Escape') sugEl.style.display = 'none';
});

input.addEventListener('blur', () => setTimeout(() => sugEl.style.display = 'none', 150));

document.querySelectorAll('.pm-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pm-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    pm = btn.dataset.pm;
    renderCommand();
  });
});

freshTog.addEventListener('click', () => {
  freshProject = !freshProject;
  freshTog.classList.toggle('on', freshProject);
  renderCommand();
});

const copyCmd = document.getElementById('copy-cmd');
const copyPkg = document.getElementById('copy-pkg');
const copyShr = document.getElementById('copy-share');
copyCmd.dataset.orig = copyCmd.textContent;
copyPkg.dataset.orig = copyPkg.textContent;
copyShr.dataset.orig = copyShr.textContent;

copyCmd.addEventListener('click', () => { copy(cmdBox.textContent); flash(copyCmd, '[ copied ]'); });
copyShr.addEventListener('click', () => { copy(shareUrl.value); flash(copyShr, '[ copied ]'); });
copyPkg.addEventListener('click', () => {
  const deps = Object.fromEntries(Object.entries(selected).map(([n,d]) => [n, d.version && d.version !== 'latest' ? `^${d.version}` : '*']));
  const json = JSON.stringify({ name: 'my-project', version: '1.0.0', dependencies: deps }, null, 2);
  copy(json); flash(copyPkg, '[ copied ]');
});

(async () => {
  const params = new URLSearchParams(location.search);
  const stack = params.get('stack');
  const pmParam = params.get('pm');
  if (pmParam && ['npm','yarn','pnpm','bun'].includes(pmParam)) {
    pm = pmParam;
    document.querySelectorAll('.pm-btn').forEach(b => b.classList.toggle('active', b.dataset.pm === pm));
  }
  if (stack) {
    const items = decodeURIComponent(stack).split(',');
    for (const item of items) {
      const atIdx = item.lastIndexOf('@');
      // handle scoped packages like @faker-js/faker@3.0.0
      const isScoped = item.startsWith('@');
      let name, version;
      if (isScoped) {
        const secondAt = item.indexOf('@', 1);
        name = secondAt > 0 ? item.slice(0, secondAt) : item;
        version = secondAt > 0 ? item.slice(secondAt + 1) : 'latest';
      } else {
        name = atIdx > 0 ? item.slice(0, atIdx) : item;
        version = atIdx > 0 ? item.slice(atIdx + 1) : 'latest';
      }
      if (name) await addChip(name);
    }
  }
})();

const POPULAR = [
  'express','zod','prisma','fastify','axios',
  'mongoose','socket.io','dotenv','cors','helmet',
  'jsonwebtoken','drizzle-orm','hono','vitest','bullmq',
  '@faker-js/faker','@prisma/client','typescript','nodemon','bcrypt'
];
let twIdx = 0, twChar = 0, twDeleting = false, twTimer = null;
const twEl = document.createElement('span');
twEl.style.cssText = 'position:absolute;top:0.6rem;left:0;font-size:16px;font-family:var(--mono);color:var(--faint);pointer-events:none;letter-spacing:0.04em;';
document.querySelector('.input-wrap').style.position = 'relative';
document.querySelector('.input-wrap').appendChild(twEl);

function typewriterTick() {
  if (document.activeElement === input || input.value) {
    twEl.textContent = '';
    twTimer = setTimeout(typewriterTick, 300);
    return;
  }
  const word = POPULAR[twIdx % POPULAR.length];
  if (!twDeleting) {
    twChar++;
    twEl.textContent = word.slice(0, twChar);
    if (twChar >= word.length) { twDeleting = true; twTimer = setTimeout(typewriterTick, 1400); return; }
    twTimer = setTimeout(typewriterTick, 90);
  } else {
    twChar--;
    twEl.textContent = word.slice(0, twChar);
    if (twChar === 0) { twDeleting = false; twIdx++; twTimer = setTimeout(typewriterTick, 400); return; }
    twTimer = setTimeout(typewriterTick, 45);
  }
}
typewriterTick();
input.addEventListener('focus', () => { twEl.textContent = ''; });
input.addEventListener('blur', () => { if (!input.value) { twChar = 0; twDeleting = false; typewriterTick(); } });

const INCOMPATIBLE = {
  'elysia':   { needs: 'bun', reason: 'elysia only runs on bun' },
  'bun-types':{ needs: 'bun', reason: 'bun-types is bun only' },
};
const PEER_CONFLICTS = [
  { pkgs: ['react','vue'],        reason: 'react + vue in same project is unusual' },
  { pkgs: ['jest','vitest'],      reason: 'jest and vitest are both test runners' },
  { pkgs: ['express','fastify'],  reason: 'express and fastify do the same thing' },
  { pkgs: ['express','hono'],     reason: 'express and hono do the same thing' },
  { pkgs: ['fastify','hono'],     reason: 'fastify and hono do the same thing' },
  { pkgs: ['mongoose','prisma'],  reason: 'mongoose and prisma are both ORMs' },
  { pkgs: ['mongoose','drizzle-orm'], reason: 'mongoose and drizzle-orm are both ORMs' },
  { pkgs: ['prisma','drizzle-orm'],   reason: 'prisma and drizzle-orm are both ORMs' },
];

function getConflictingPkgs() {
  const names = Object.keys(selected);
  const conflicting = new Set();
  PEER_CONFLICTS.forEach(({ pkgs }) => {
    const hits = pkgs.filter(p => names.includes(p));
    if (hits.length > 1) hits.forEach(h => conflicting.add(h));
  });
  names.forEach(n => {
    const rule = INCOMPATIBLE[n];
    if (rule && pm !== rule.needs) conflicting.add(n);
  });
  return conflicting;
}

function getConflictReasons() {
  const names = Object.keys(selected);
  const reasons = [];
  PEER_CONFLICTS.forEach(({ pkgs, reason }) => {
    const hits = pkgs.filter(p => names.includes(p));
    if (hits.length > 1) reasons.push(reason);
  });
  names.forEach(n => {
    const rule = INCOMPATIBLE[n];
    if (rule && pm !== rule.needs) reasons.push(rule.reason);
  });
  return reasons;
}