const User = require('./models/User');
const Entry = require('./models/Entry');
const Match = require('./models/Match');

const GROUP_SIZE = 100;   // Stage 1 and Stage 2 group size
const POOL_SIZE = 10;     // players per round-robin pool
const STAGES = ['S1', 'S2', 'S3', 'QF', 'SF', 'F'];
const KNOCKOUT = ['QF', 'SF', 'F'];
const FEE = Number(process.env.ENTRY_FEE || 200);

const idStr = (v) => String(v);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uniqueSorted(values) {
  return [...new Set(values.filter((v) => v !== null && v !== undefined))].sort((a, b) => a - b);
}

async function matchesFor(stage) {
  return Match.find({ stage }).sort({ _id: 1 }).lean();
}

async function nameMap() {
  const users = await User.find({}, 'name').lean();
  return new Map(users.map((u) => [idStr(u._id), u.name]));
}

// Standings computed from match documents, for a whole stage, a group, or one pool.
function standingsFrom(ms, names, group = null, pool = null) {
  const table = new Map();
  const row = (id) => {
    if (!table.has(id)) {
      table.set(id, { id, name: names.get(id) || 'Unknown', played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 });
    }
    return table.get(id);
  };

  for (const m of ms) {
    if (group !== null && m.groupNo !== group) continue;
    if (pool !== null && m.poolNo !== pool) continue;
    const h = row(idStr(m.home));
    const a = row(idStr(m.away));
    if (!m.played) continue;
    h.played++; a.played++;
    h.gf += m.homeScore; h.ga += m.awayScore;
    a.gf += m.awayScore; a.ga += m.homeScore;
    if (m.homeScore > m.awayScore) { h.won++; h.pts += 3; a.lost++; }
    else if (m.homeScore < m.awayScore) { a.won++; a.pts += 3; h.lost++; }
    else { h.drawn++; a.drawn++; h.pts++; a.pts++; }
  }

  return [...table.values()]
    .map((r) => ({ ...r, gd: r.gf - r.ga }))
    .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.name.localeCompare(y.name));
}

async function standingsFor(stage, group = null, pool = null) {
  return standingsFrom(await matchesFor(stage), await nameMap(), group, pool);
}

async function unplayed(stage) {
  return Match.countDocuments({ stage, played: false });
}

/* ---------- fixture creation ---------- */

// Splits ids into groups of groupSize, then pools of poolSize, and creates every round-robin fixture.
async function generate(stage, ids, groupSize, poolSize) {
  const buckets = new Map();
  const entryOps = [];

  ids.forEach((id, i) => {
    const g = Math.floor(i / groupSize) + 1;
    const p = Math.floor((i % groupSize) / poolSize) + 1;
    entryOps.push({ updateOne: { filter: { user: id }, update: { $set: { stage, groupNo: g, poolNo: p } } } });
    const key = `${g}-${p}`;
    if (!buckets.has(key)) buckets.set(key, { g, p, ids: [] });
    buckets.get(key).ids.push(id);
  });

  const docs = [];
  for (const b of buckets.values()) {
    for (let i = 0; i < b.ids.length; i++) {
      for (let j = i + 1; j < b.ids.length; j++) {
        docs.push({ stage, groupNo: b.g, poolNo: b.p, home: b.ids[i], away: b.ids[j] });
      }
    }
  }

  if (entryOps.length) await Entry.bulkWrite(entryOps);
  if (docs.length) await Match.insertMany(docs);
}

async function createKnockoutMatch(stage, slot, homeId, awayId) {
  await Entry.updateMany({ user: { $in: [homeId, awayId] } }, { $set: { stage, groupNo: null, poolNo: null } });
  await Match.create({ stage, slot, home: homeId, away: awayId });
}

async function eliminate(stage) {
  await Entry.updateMany({ stage, status: 'active' }, { $set: { status: 'eliminated' } });
}

const winnerOf = (m) => (m.homeScore > m.awayScore ? m.home : m.away);

async function advanceKnockout() {
  const qf = await Match.find({ stage: 'QF' }).sort({ slot: 1 }).lean();
  if (qf.length === 4 && qf.every((m) => m.played) && !(await Match.exists({ stage: 'SF' }))) {
    await createKnockoutMatch('SF', 1, winnerOf(qf[0]), winnerOf(qf[1]));
    await createKnockoutMatch('SF', 2, winnerOf(qf[2]), winnerOf(qf[3]));
  }
  const sf = await Match.find({ stage: 'SF' }).sort({ slot: 1 }).lean();
  if (sf.length === 2 && sf.every((m) => m.played) && !(await Match.exists({ stage: 'F' }))) {
    await createKnockoutMatch('F', 1, winnerOf(sf[0]), winnerOf(sf[1]));
  }
}

/* ---------- stage control (called by the admin "advance" button) ---------- */

async function advance() {
  if (!(await Match.exists({ stage: 'S1' }))) {
    const entries = await Entry.find({ stage: 'S1', groupNo: null, status: 'active' }).lean();
    const ids = shuffle(entries.map((e) => idStr(e.user)));
    if (ids.length < 2) throw new Error('At least 2 paid players are needed to start.');
    await generate('S1', ids, GROUP_SIZE, POOL_SIZE);
    return `Stage 1 started: ${ids.length} players in ${Math.ceil(ids.length / GROUP_SIZE)} group(s).`;
  }

  const s1Open = await unplayed('S1');
  if (s1Open > 0) throw new Error(`Stage 1 still has ${s1Open} unplayed matches.`);

  if (!(await Match.exists({ stage: 'S2' }))) {
    const names = await nameMap();
    const s1 = await matchesFor('S1');
    const qualifiers = uniqueSorted(s1.map((m) => m.groupNo))
      .flatMap((g) => standingsFrom(s1, names, g).slice(0, 10).map((r) => r.id));
    await generate('S2', shuffle(qualifiers), GROUP_SIZE, POOL_SIZE);
    await eliminate('S1');
    return `Stage 2 started with ${qualifiers.length} players (top 10 from each group).`;
  }

  const s2Open = await unplayed('S2');
  if (s2Open > 0) throw new Error(`Stage 2 still has ${s2Open} unplayed matches.`);

  if (!(await Match.exists({ stage: 'S3' }))) {
    const names = await nameMap();
    const s2 = await matchesFor('S2');
    const qualifiers = uniqueSorted(s2.map((m) => m.poolNo))
      .flatMap((p) => standingsFrom(s2, names, 1, p).slice(0, 2).map((r) => r.id));
    await generate('S3', shuffle(qualifiers), 5, 5);
    await eliminate('S2');
    return `Stage 3 started: ${qualifiers.length} players in ${qualifiers.length / 5} groups of 5.`;
  }

  const s3Open = await unplayed('S3');
  if (s3Open > 0) throw new Error(`Stage 3 still has ${s3Open} unplayed matches.`);

  if (!(await Match.exists({ stage: 'QF' }))) {
    const names = await nameMap();
    const s3 = await matchesFor('S3');
    const q = shuffle(uniqueSorted(s3.map((m) => m.groupNo))
      .flatMap((g) => standingsFrom(s3, names, g).slice(0, 2).map((r) => r.id)));
    for (let i = 0; i + 1 < q.length; i += 2) {
      await createKnockoutMatch('QF', i / 2 + 1, q[i], q[i + 1]);
    }
    await eliminate('S3');
    return 'Quarter-finals drawn (round of 8).';
  }

  return 'Knockout stage is in progress. Enter results to move forward.';
}

/* ---------- results ---------- */

async function recordResult(matchId, homeScore, awayScore) {
  const m = await Match.findById(matchId);
  if (!m) throw new Error('Match not found.');
  const isKO = KNOCKOUT.includes(m.stage);
  if (isKO && m.played) throw new Error('This knockout match is already decided.');
  if (isKO && homeScore === awayScore)
    throw new Error('Knockout matches cannot end level. Record the winner after extra time or penalties.');

  m.homeScore = homeScore;
  m.awayScore = awayScore;
  m.played = true;
  await m.save();

  if (isKO) {
    const loser = homeScore > awayScore ? m.away : m.home;
    await Entry.updateOne({ user: loser }, { $set: { status: 'eliminated' } });
    if (m.stage === 'F') {
      const champion = homeScore > awayScore ? m.home : m.away;
      await Entry.updateOne({ user: champion }, { $set: { status: 'champion' } });
    }
    await advanceKnockout();
  }
}

/* ---------- public view ---------- */

function awardsFrom(byStage, names) {
  const groupTopTen = {};
  for (const g of uniqueSorted(byStage.S1.map((m) => m.groupNo))) {
    groupTopTen[g] = standingsFrom(byStage.S1, names, g).slice(0, 10).map((r) => r.name);
  }

  const entrants = (ms) => [...new Set(ms.flatMap((m) => [idStr(m.home), idStr(m.away)]))]
    .map((id) => names.get(id))
    .filter(Boolean);

  const f = byStage.F.find((m) => m.played);
  const nameOf = (id) => names.get(idStr(id)) || null;

  return {
    groupTopTen,
    roundOf8: entrants(byStage.QF),
    semiFinalists: entrants(byStage.SF),
    champion: f ? nameOf(winnerOf(f)) : null,
    runnerUp: f ? nameOf(idStr(winnerOf(f)) === idStr(f.home) ? f.away : f.home) : null
  };
}

async function getView() {
  const names = await nameMap();
  const byStage = {};
  for (const s of STAGES) byStage[s] = await matchesFor(s);

  const progress = {};
  for (const s of STAGES) {
    const ms = byStage[s];
    progress[s] = ms.length === 0 ? 'pending' : ms.some((m) => !m.played) ? 'in progress' : 'complete';
  }

  const matchView = (ms) => ms.map((m) => ({
    id: idStr(m._id),
    slot: m.slot,
    home_score: m.homeScore,
    away_score: m.awayScore,
    played: m.played,
    home: names.get(idStr(m.home)),
    away: names.get(idStr(m.away))
  }));

  const stageView = (ms) => uniqueSorted(ms.map((m) => m.groupNo)).map((g) => ({
    group: g,
    leaders: standingsFrom(ms, names, g).slice(0, 10).map((r) => r.name),
    pools: uniqueSorted(ms.filter((m) => m.groupNo === g).map((m) => m.poolNo)).map((p) => ({
      pool: p,
      standings: standingsFrom(ms, names, g, p),
      matches: matchView(ms.filter((m) => m.groupNo === g && m.poolNo === p))
    }))
  }));

  return {
    fee: FEE,
    progress,
    stages: {
      S1: stageView(byStage.S1),
      S2: stageView(byStage.S2),
      S3: stageView(byStage.S3)
    },
    knockout: {
      QF: matchView(byStage.QF),
      SF: matchView(byStage.SF),
      F: matchView(byStage.F)
    },
    awards: awardsFrom(byStage, names)
  };
}

module.exports = { advance, recordResult, getView };
