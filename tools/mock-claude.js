(() => {
  const people = { u_me: 'Behzod Shadiev', u_a: 'Dilnoza Karimova', u_b: 'Farrukh Aliev', u_c: 'Madina Rakhimova', u_d: 'Timur Nazarov', u_e: 'Sabina Yusupova', u_f: 'Rustam Saidov', u_g: 'Malika Ergasheva' };
  const colors = ['#e8710a', '#1a73e8', '#188038', '#d93025', '#9334e6', '#e37400', '#12b5cb', '#c5221f'];
  const avatar = (id, i) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="${colors[i % colors.length]}"/><text x="16" y="21" font-size="13" text-anchor="middle" fill="#fff" font-family="Arial">${people[id].split(' ').map(s => s[0]).join('')}</text></svg>`);
  const seed = { u_a: 1840, u_b: 1220, u_c: 760, u_d: 410, u_e: 230, u_f: 120, u_g: 60 };
  const docs = new Map(Object.entries(seed).map(([k, v], i) => ['scores/' + k, { best: v, l2: i % 2 ? v * 2 + 300 : 0, l3: i % 3 === 0 ? v * 3 : 0, at: 1 }]));
  const listeners = [];
  const readOnly = sessionStorage.getItem('mockReadOnly') === '1';
  window.__mockWrites = [];
  const snap = (field) => {
    const rows = [...docs.entries()].map(([p, v]) => ({ id: p.slice(7), exists: true, data: () => v, metadata: { fromCache: false, hasPendingWrites: false } }));
    rows.sort((a, b) => (b.data()[field] || 0) - (a.data()[field] || 0));
    return { docs: rows, size: rows.length, empty: !rows.length, metadata: { fromCache: false, hasPendingWrites: false }, docChanges: () => [] };
  };
  const notify = () => listeners.forEach(([f, fn]) => fn(snap(f)));
  const query = (field) => ({
    orderBy: (f) => query(f), limit: () => query(field),
    onSnapshot(next) { listeners.push([field, next]); setTimeout(() => next(snap(field)), 80); return () => {}; },
    get: async () => snap(field),
  });
  const db = {
    collection: () => query('best'),
    doc: (path) => ({
      get: async () => ({ id: path.split('/')[1], exists: docs.has(path), data: () => docs.get(path), metadata: { fromCache: false } }),
      set: async (body) => {
        if (readOnly) throw { code: 'invalid_argument', message: 'view only' };
        window.__mockWrites.push({ path, body, op: 'set' });
        docs.set(path, body); setTimeout(notify, 30);
      },
      update: async (body) => {
        if (readOnly) throw { code: 'invalid_argument', message: 'view only' };
        if (!docs.has(path)) throw { code: 'invalid_argument', message: 'missing' };
        window.__mockWrites.push({ path, body, op: 'update' });
        docs.set(path, { ...docs.get(path), ...body }); setTimeout(notify, 30);
      },
    }),
  };
  const ids = Object.keys(people);
  const user = {
    id: async () => 'u_me', can: async () => (readOnly ? false : true), isOwner: async () => true, canEdit: async () => true,
    profiles: async (list) => Object.fromEntries([].concat(list).map((id) => [id, { id, name: people[id] || '', avatarUrl: people[id] ? avatar(id, ids.indexOf(id)) : 'data:,', color: '#888', email: null, isMe: id === 'u_me', guest: false }])),
  };
  window.claude = { use: async (name) => { await new Promise((r) => setTimeout(r, 60)); return name === 'db' ? db : name === 'user' ? user : null; } };
})();
