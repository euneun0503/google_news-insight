/* 구글 인사이트 — 헬스조선 구글 통계 (정적 사이트, data/*.json을 읽어 그립니다) */
(() => {
  'use strict';
  const RED = '#2563eb', INK = '#111214', MUTED = '#c9ccd3', GRID = '#eef0f3', AX = '#8a8f9c', BLUE = '#f59e0b'; // RED=포인트(블루), BLUE=하이닥(앰버)
  const OURS = '헬스조선';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ko = new Intl.NumberFormat('ko-KR');
  const fmt = (n) => (n === null || n === undefined || isNaN(n) ? '–' : ko.format(Math.round(n)));
  const cp = (n) => { if (n === null || n === undefined || isNaN(n)) return '–'; const a = Math.abs(n); if (a >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '억'; if (a >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '만'; return ko.format(Math.round(n)); };
  const pct = (x, d = 1) => (x === null || x === undefined || !isFinite(x) ? '–' : (x * 100).toFixed(d) + '%');
  const pos1 = (x) => (!x || !isFinite(x) ? '–' : Number(x).toFixed(1));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = (d) => d.toISOString().slice(0, 10);
  const D = (s) => new Date(s + 'T00:00:00Z');
  const addDays = (s, n) => iso(new Date(D(s).getTime() + n * 864e5));
  const daysBetween = (a, b) => Math.round((D(b) - D(a)) / 864e5) + 1;
  const kstToday = () => { const n = new Date(Date.now() + 9 * 3600e3); return iso(new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))); };
  const md = (s) => (s ? Number(s.slice(5, 7)) + '.' + Number(s.slice(8, 10)) : '–');
  const up = (s) => (s ? md(s) + ' ' + s.slice(11, 16) : '–');
  const wd = (s) => '일월화수목금토'[D(s).getUTCDay()];
  const idOf = (u) => { const m = /(\d{13})/.exec(u || ''); return m ? m[1] : null; };
  const info = (t) => `<span class="i" tabindex="0" data-tip="${esc(t)}">i</span>`;
  const delta = (x, kind) => {
    if (x === null || x === undefined || !isFinite(x)) return '';
    const upv = x > 0, good = kind === 'pos' ? !upv : upv;
    const a = Math.abs(x);
    const txt = kind === 'pt' ? (a * 100).toFixed(1) + '%p' : kind === 'pos' ? a.toFixed(1) + '위' : kind === 'n' ? fmt(a) : (a * 100).toFixed(1) + '%';
    return `<span class="delta ${good ? 'up' : 'down'}">${upv ? '▲' : '▼'}${txt}</span>`;
  };
  const badge = (i) => `<span class="rank-badge${i < 3 ? ' top' : ''}">${i + 1}</span>`;
  const toast = (m) => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600); };

  const CHANNEL = { WEB: '웹 검색', DISCOVER: 'Discover', GOOGLE_NEWS: 'Google 뉴스', IMAGE: '이미지 검색', NEWS: '검색 뉴스 탭', VIDEO: '동영상 검색' };
  const DEVICE = { MOBILE: '모바일', DESKTOP: '데스크톱', TABLET: '태블릿', mobile: '모바일', desktop: '데스크톱', tablet: '태블릿' };
  const COUNTRY = { kor: '한국', usa: '미국', can: '캐나다', jpn: '일본', vnm: '베트남', aus: '호주', idn: '인도네시아', tha: '태국', deu: '독일', gbr: '영국', chn: '중국', phl: '필리핀', sgp: '싱가포르', twn: '대만', nzl: '뉴질랜드', rus: '러시아', mys: '말레이시아', hkg: '홍콩' };
  const AGE = { '18-24': '18–24세', '25-34': '25–34세', '35-44': '35–44세', '45-54': '45–54세', '55-64': '55–64세', '65+': '65세+' };
  const GENDER = { male: '남성', female: '여성' };

  /* ---------- 데이터 ---------- */
  const DATA = {};
  const dayCache = {};
  const get = async (p, opt) => { try { const r = await fetch(p + (p.includes('?') ? '&' : '?') + 't=' + Math.floor(Date.now() / 6e5)); if (!r.ok) throw 0; return await r.json(); } catch (e) { return opt ? null : null; } };
  async function loadBase() {
    const [daily, idx, arts, pub, rep, hidoc, trends, rt, demo] = await Promise.all(['data/gsc/daily.json', 'data/gsc/index.json', 'data/articles.json', 'data/publish.json', 'data/reporters.json', 'data/hidoc.json', 'data/trends.json', 'data/ga4/realtime.json', 'data/ga4/demo.json'].map((p) => get(p)));
    DATA.daily = daily ? daily.rows : [];
    DATA.dailyUpdated = daily && daily.updated;
    DATA.days = new Set(idx ? idx.days : []);
    DATA.arts = arts ? arts.articles : {};
    DATA.pub = pub ? pub.rows : [];
    DATA.rep = rep ? rep.rows : [];
    DATA.hidoc = hidoc ? hidoc.items : [];
    DATA.trends = trends;
    DATA.rt = rt;
    DATA.demo = demo;
    DATA.lastDay = DATA.daily.length ? DATA.daily.map((r) => r.date).sort().pop() : null;
  }
  async function loadDays(a, b) {
    const want = [];
    for (let d = a; d <= b; d = addDays(d, 1)) if (DATA.days.has(d)) want.push(d);
    await Promise.all(want.filter((d) => !(d in dayCache)).map(async (d) => { dayCache[d] = await get('data/gsc/days/' + d + '.json'); }));
    return want.map((d) => dayCache[d]).filter(Boolean);
  }

  /* ---------- 기간 ---------- */
  const state = { preset: '28', start: null, end: null, view: 'dashboard', sub: {} };
  try { const s = JSON.parse(localStorage.getItem('gi-range') || 'null'); if (s) Object.assign(state, { preset: s.preset, start: s.start, end: s.end }); } catch (e) {}
  const RANGE_NAME = { yesterday: '어제', 7: '최근 7일', 28: '최근 28일', thisMonth: '이번 달', lastMonth: '지난 달', 90: '최근 90일', custom: '직접 지정' };
  function presetRange(p) {
    const t = kstToday(), y = addDays(t, -1);
    if (p === 'yesterday') return [y, y];
    if (p === '7') return [addDays(t, -7), y];
    if (p === '90') return [addDays(t, -90), y];
    if (p === 'thisMonth') return [y.slice(0, 8) + '01', y];
    if (p === 'lastMonth') { const f = new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 2, 1)); const l = new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, 0)); return [iso(f), iso(l)]; }
    return [addDays(t, -28), y];
  }
  function setPreset(p) { state.preset = p; [state.start, state.end] = presetRange(p); saveRange(); route(); }
  function saveRange() { try { localStorage.setItem('gi-range', JSON.stringify({ preset: state.preset, start: state.start, end: state.end })); } catch (e) {} }
  const prevRange = () => { const n = daysBetween(state.start, state.end); return [addDays(state.start, -n), addDays(state.start, -1)]; };
  const inR = (d, a = state.start, b = state.end) => d >= a && d <= b;

  /* ---------- 집계 ---------- */
  function sumDaily(a, b, type) {
    let c = 0, i = 0, pw = 0, wi = 0;
    DATA.daily.forEach((r) => { if (!inR(r.date, a, b) || (type && r.type !== type)) return; c += r.clicks; i += r.impressions; if (r.type === 'WEB' && r.position) { pw += r.position * r.impressions; wi += r.impressions; } });
    return { clicks: c, impressions: i, ctr: i ? c / i : null, position: wi ? pw / wi : null };
  }
  function dailySeries(a, b) {
    const by = {};
    DATA.daily.forEach((r) => { if (!inR(r.date, a, b)) return; const o = (by[r.date] = by[r.date] || { date: r.date, clicks: 0, impressions: 0, pw: 0, wi: 0, disc: 0, disc_i: 0, web: 0, news: 0 });
      o.clicks += r.clicks; o.impressions += r.impressions; if (r.type === 'WEB') { o.web += r.clicks; if (r.position) { o.pw += r.position * r.impressions; o.wi += r.impressions; } } if (r.type === 'DISCOVER') { o.disc += r.clicks; o.disc_i += r.impressions; } if (r.type === 'GOOGLE_NEWS' || r.type === 'NEWS') o.news += r.clicks; });
    return Object.values(by).sort((x, y) => (x.date < y.date ? -1 : 1)).map((o) => ({ ...o, ctr: o.impressions ? o.clicks / o.impressions : null, position: o.wi ? o.pw / o.wi : null }));
  }
  function aggDays(days, key, field) {
    const by = {};
    days.forEach((d) => (d[key] || []).forEach((r) => { const k = r[field]; const o = (by[k] = by[k] || { [field]: k, clicks: 0, impressions: 0, pw: 0, disc_clicks: 0, disc_impressions: 0, news_clicks: 0 });
      o.clicks += r.clicks || 0; o.impressions += r.impressions || 0; o.pw += (r.position || 0) * (r.impressions || 0); o.disc_clicks += r.disc_clicks || 0; o.disc_impressions += r.disc_impressions || 0; o.news_clicks += r.news_clicks || 0; }));
    return Object.values(by).map((o) => ({ ...o, ctr: o.impressions ? o.clicks / o.impressions : null, position: o.impressions && o.pw ? o.pw / o.impressions : null }));
  }
  const artOf = (page) => DATA.arts[idOf(page)] || {};

  /* ---------- 공통 그리기 ---------- */
  const tipBox = (box) => { let t = box.querySelector('.tip'); if (!t) { t = document.createElement('div'); t.className = 'tip'; box.appendChild(t); }
    return { show(x, y, title, lines) { t.innerHTML = `<div class="d">${esc(title)}</div>` + lines.map(([c, l, v]) => `<div>${c ? `<span class="sw" style="background:${c}"></span>` : ''}${esc(l)} ${esc(v)}</div>`).join(''); t.style.display = 'block'; t.style.left = Math.max(0, Math.min(box.clientWidth - t.offsetWidth, x + 12)) + 'px'; t.style.top = Math.max(0, y - 10) + 'px'; }, hide() { t.style.display = 'none'; } }; };
  const textW = (svg, s) => { const t = svg.append('text').attr('font-size', 11).text(s); const w = t.node().getComputedTextLength(); t.remove(); return w; };

  function barChart(box, rows, { value, fmtV = cp, label = '클릭', color = (r) => RED, H = 260, invert = false, line = false, marks = [] }) {
    box.innerHTML = '';
    if (!rows.length) { box.innerHTML = '<div class="empty">선택 기간에 데이터가 없어요</div>'; return; }
    const W = box.clientWidth || 600;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const vals = rows.map(value).filter((v) => v !== null && isFinite(v));
    const ext = line ? [invert ? Math.max(1, Math.floor(d3.min(vals))) : 0, d3.max(vals) || 1] : [0, d3.max(vals) || 1];
    const y = d3.scaleLinear(ext, invert ? [16, H - 24] : [H - 24, 16]).nice();
    const yt = y.ticks(4);
    const L = Math.max(...yt.map((v) => textW(svg, fmtV(v)))) + 10;
    const x = d3.scaleBand(rows.map((r) => r.date), [L, W - 8]).paddingInner(rows.length > 60 ? 0.15 : 0.25);
    yt.forEach((v) => { svg.append('line').attr('x1', L).attr('x2', W - 8).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', GRID); svg.append('text').attr('x', L - 6).attr('y', y(v) + 4).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', AX).text(fmtV(v)); });
    const step = Math.ceil(rows.length / Math.max(2, Math.floor(W / 70)));
    rows.forEach((r, i) => { if (i % step === 0 || rows.length < 10) svg.append('text').attr('x', x(r.date) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', AX).text(md(r.date)); });
    const cx = (r) => x(r.date) + x.bandwidth() / 2;
    if (line) {
      const pts = rows.filter((r) => value(r) !== null && isFinite(value(r)));
      svg.append('path').datum(pts).attr('fill', 'none').attr('stroke', INK).attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round').attr('d', d3.line().x(cx).y((r) => y(value(r))));
    } else {
      svg.append('g').selectAll('rect').data(rows).join('rect').attr('x', (r) => x(r.date)).attr('width', x.bandwidth()).attr('y', (r) => y(value(r) || 0)).attr('height', (r) => Math.max(0, y(0) - y(value(r) || 0))).attr('rx', Math.min(3, x.bandwidth() / 2)).attr('fill', color);
    }
    marks.forEach(([day, lb], i) => { if (x(day) === undefined) return; const xx = cx({ date: day }); svg.append('line').attr('x1', xx).attr('x2', xx).attr('y1', 12).attr('y2', H - 24).attr('stroke', INK).attr('stroke-dasharray', '3 3').attr('opacity', .5); svg.append('text').attr('x', xx + 4).attr('y', 10 + i * 12).attr('font-size', 11).attr('fill', INK).text(lb); });
    const dot = svg.append('circle').attr('r', 4).attr('fill', line ? INK : RED).style('display', 'none'), tt = tipBox(box);
    svg.append('rect').attr('x', L).attr('width', W - L - 8).attr('height', H).attr('fill', 'transparent').on('mousemove', (e) => {
      const [mx, my] = d3.pointer(e, box); const i = Math.max(0, Math.min(rows.length - 1, Math.round((mx - L - x.bandwidth() / 2) / x.step()))); const r = rows[i];
      if (line && value(r) !== null) dot.style('display', null).attr('cx', cx(r)).attr('cy', y(value(r)));
      tt.show(mx, my, r.date + ' (' + wd(r.date) + ')', [[null, label, fmtV(value(r))]]);
    }).on('mouseleave', () => { dot.style('display', 'none'); tt.hide(); });
  }

  function multiLine(box, series, { H = 260, fmtV = (v) => fmt(v), color }) {
    box.innerHTML = '';
    series = series.filter((s) => s.pts.length);
    if (!series.length) { box.innerHTML = '<div class="empty">선택 기간에 데이터가 없어요</div>'; return; }
    const W = box.clientWidth || 600;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const R = Math.max(...series.map((s) => textW(svg, s.name + ' ' + fmtV(s.pts[s.pts.length - 1].v)))) + 14;
    const y = d3.scaleLinear([0, d3.max(series, (s) => d3.max(s.pts, (p) => p.v)) || 1], [H - 24, 10]).nice();
    const yt = y.ticks(4), L = Math.max(...yt.map((v) => textW(svg, fmtV(v)))) + 10;
    const all = series.flatMap((s) => s.pts.map((p) => D(p.date)));
    const x = d3.scaleUtc(d3.extent(all), [L, W - R]);
    yt.forEach((v) => { svg.append('line').attr('x1', L).attr('x2', W - R).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', GRID); svg.append('text').attr('x', L - 6).attr('y', y(v) + 4).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', AX).text(fmtV(v)); });
    x.ticks(W < 500 ? 3 : 6).forEach((d) => svg.append('text').attr('x', x(d)).attr('y', H - 6).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', AX).text(d3.utcFormat('%-m/%-d')(d)));
    series.forEach((s) => svg.append('path').datum(s.pts).attr('fill', 'none').attr('stroke', color(s.name)).attr('stroke-width', s.strong ? 2.5 : 1.75).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round').attr('d', d3.line().x((p) => x(D(p.date))).y((p) => y(p.v))));
    const lab = series.map((s) => ({ s, y: y(s.pts[s.pts.length - 1].v) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < lab.length; i++) if (lab[i].y - lab[i - 1].y < 13) lab[i].y = lab[i - 1].y + 13;
    lab.forEach((l) => svg.append('text').attr('x', W - R + 6).attr('y', l.y + 4).attr('font-size', 11).attr('font-weight', l.s.strong ? 700 : 400).attr('fill', color(l.s.name)).text(l.s.name + ' ' + fmtV(l.s.pts[l.s.pts.length - 1].v)));
    const dates = [...new Set(series.flatMap((s) => s.pts.map((p) => p.date)))].sort();
    const rule = svg.append('line').attr('y1', 10).attr('y2', H - 24).attr('stroke', AX).style('display', 'none'), tt = tipBox(box);
    svg.append('rect').attr('x', L).attr('width', W - L - R).attr('height', H).attr('fill', 'transparent').on('mousemove', (e) => {
      const [mx, my] = d3.pointer(e, box); const i = d3.bisectCenter(dates.map(D), x.invert(mx)); const d = dates[i];
      rule.style('display', null).attr('x1', x(D(d))).attr('x2', x(D(d)));
      tt.show(mx, my, d + ' (' + wd(d) + ')', series.map((s) => { const p = s.pts.find((q) => q.date === d); return [color(s.name), s.name, p ? fmtV(p.v) : '–']; }));
    }).on('mouseleave', () => { rule.style('display', 'none'); tt.hide(); });
  }

  const rkList = (rows) => { const max = Math.max(1, ...rows.map((r) => r.v)); return `<div class="rk">${rows.map((r, i) => `<div class="row${r.ours ? ' ours' : ''}">${badge(i)}<div class="nm"><i></i><span>${esc(r.label)}</span></div><div class="bar${r.ours ? ' red' : ''}"><span style="width:${Math.max(2, (r.v / max) * 100)}%"></span></div><div class="v">${esc(r.text || cp(r.v))}<small>${r.sub || ''}</small></div></div>`).join('')}</div>`; };
  const hbars = (rows) => { const max = Math.max(1, ...rows.map((r) => r.v)); return `<div class="hb">${rows.map((r, i) => `<div class="row"><div>${esc(r.label)}</div><div class="bar${i === 0 || r.hi ? ' red' : ''}"><span style="width:${Math.max(2, (r.v / max) * 100)}%"></span></div><div class="v">${esc(r.text)}</div></div>`).join('')}</div>`; };
  const table = (cols, rows, opt = {}) => `<div class="table-wrap"${opt.h ? ` style="max-height:${opt.h}px"` : ''}><table class="t"${opt.id ? ` id="${opt.id}"` : ''}><thead><tr>${cols.map((c) => `<th class="${c.r ? 'r' : ''} ${c.hide ? 'hide-s' : ''}">${esc(c.h)}${c.tip ? info(c.tip) : ''}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((r, i) => `<tr class="${opt.rowClass ? opt.rowClass(r) : ''}">${cols.map((c) => `<td class="${c.r ? 'r' : ''} ${c.hide ? 'hide-s' : ''} ${c.cls ? (typeof c.cls === 'function' ? c.cls(r) : c.cls) : ''}">${c.v(r, i)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}" class="mut" style="text-align:center;padding:30px">${opt.empty || '선택 기간에 데이터가 없어요'}</td></tr>`}</tbody></table></div>`;
  const titleCell = (page, a, q) => `<a href="${esc(a.url || page)}" target="_blank" rel="noopener">${esc(a.title || page.replace(/^https?:\/\//, '').slice(0, 70))}</a>${q !== undefined ? `<span class="q">${q ? '대표 검색어 · ' + esc(q) : 'Discover 중심'}</span>` : ''}`;
  const needDays = (what) => `<div class="empty"><b>${what}는 수집기가 하루 단위로 쌓은 데이터로 보여줘요</b><br>선택 기간의 수집 데이터가 아직 없어요. GitHub Actions의 '구글 데이터 수집'이 처음 실행되면 최근 90일치가 채워져요.</div>`;
  const pageHead = (title, tip, desc) => `<div class="page-head"><div><h1>${esc(title)} ${info(tip)}</h1><p>${esc(desc)}</p></div></div>`;
  const kpi = (label, tip, value, d, meta, cls = '') => `<div class="card kpi"><div class="label">${esc(label)} ${info(tip)}</div><div class="value ${cls}">${value}${d || ''}</div><div class="meta">${meta || ''}</div></div>`;
  const rangeText = () => `${state.start.replace(/-/g, '.')} ~ ${state.end.replace(/-/g, '.')}`;

  /* ---------- 화면 ---------- */
  const VIEWS = {};

  VIEWS.dashboard = async (el) => {
    const [pa, pb] = prevRange();
    const c = sumDaily(state.start, state.end), p = sumDaily(pa, pb);
    const ch = Object.keys(CHANNEL).map((t) => { const a = sumDaily(state.start, state.end, t), b = sumDaily(pa, pb, t); return { type: t, ...a, prev: b.clicks, chg: b.clicks ? a.clicks / b.clicks - 1 : null }; }).filter((r) => r.clicks || r.prev).sort((x, y) => y.clicks - x.clicks);
    const disc = ch.find((r) => r.type === 'DISCOVER'), web = ch.find((r) => r.type === 'WEB');
    const series = dailySeries(state.start, state.end);
    const tab = state.sub.daily || 'clicks';
    el.innerHTML = `${pageHead('구글통계 (G)', '구글 검색·Discover·구글 뉴스에서 헬스조선 기사가 얼마나 보였고(노출) 얼마나 읽혔는지(클릭) 한눈에 봅니다. Search Console 기준이에요.', '구글 검색·Discover·구글 뉴스 전체 성과를 한눈에 봅니다.')}
      <div class="alert">선택 기간 구글 클릭은 <b>${cp(c.clicks)}</b>, 직전 같은 기간 대비 <b>${c.clicks && p.clicks ? (c.clicks > p.clicks ? '+' : '') + pct(c.clicks / p.clicks - 1) : '–'}</b>이에요.
        ${disc ? ` Discover <b>${disc.chg !== null ? (disc.chg > 0 ? '+' : '') + pct(disc.chg) : '–'}</b>` : ''}${web ? `, 웹 검색 <b>${web.chg !== null ? (web.chg > 0 ? '+' : '') + pct(web.chg) : '–'}</b>.` : ''}
        9월 10일 전후부터 일 클릭이 급감했고 Discover 감소폭이 가장 커요. 원인 검색어는 <a href="#/keywords">검색어 랭킹</a>에서 확인하세요.</div>
      <div class="grid g-4">
        ${kpi('클릭', '구글 검색·Discover·구글 뉴스 등에서 헬스조선 기사를 눌러 들어온 횟수예요. 실제 방문 유입에 가장 가까운 지표예요.', cp(c.clicks), delta(p.clicks ? c.clicks / p.clicks - 1 : null), '직전 ' + cp(p.clicks))}
        ${kpi('노출', '기사가 구글 화면(검색 결과·Discover 피드·뉴스·이미지)에 보인 횟수예요. 실제로 화면에 나타나야 1회로 셉니다.', cp(c.impressions), delta(p.impressions ? c.impressions / p.impressions - 1 : null), '직전 ' + cp(p.impressions))}
        ${kpi('클릭률 (CTR)', '노출 중 클릭으로 이어진 비율(클릭 ÷ 노출)이에요. 제목·썸네일의 매력도를 보여줘요. 증감은 %p 차이예요.', pct(c.ctr), delta(c.ctr !== null && p.ctr !== null ? c.ctr - p.ctr : null, 'pt'), '직전 ' + pct(p.ctr), 'red')}
        ${kpi('웹 검색 평균 순위', '구글 웹 검색 결과에서 헬스조선 기사가 나온 평균 위치(노출 가중)예요. 숫자가 작을수록 위쪽이에요. Discover·뉴스는 순위가 없어 빠져요.', pos1(c.position), delta(c.position && p.position ? c.position - p.position : null, 'pos'), '직전 ' + pos1(p.position) + '위')}
      </div>
      <div class="note">% = 직전 동일 기간(${addDays(state.start, -daysBetween(state.start, state.end)).replace(/-/g, '.')}~${addDays(state.start, -1).replace(/-/g, '.')}) 대비</div>
      <div class="grid g-21">
        <div class="card">
          <div class="card-head"><div><h3>일별 추이 ${info('선택 기간의 하루 값이에요. 탭으로 클릭·노출·CTR·순위를 바꿔 볼 수 있어요. 점선은 하락 시작(9/10)과 구글 9월 스팸 업데이트(9/24 시작) 시점이에요. 아래 표는 날짜별 상세 값이에요.')}</h3><div class="sub">${rangeText()} · 하루 단위</div></div>
            <div class="seg" id="segDaily">${[['clicks', '클릭'], ['impressions', '노출'], ['ctr', 'CTR'], ['position', '웹 순위'], ['disc', 'Discover 클릭']].map(([k, l]) => `<button data-k="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
          <div class="chart" id="chDaily" style="min-height:260px"></div>
          ${table([{ h: '날짜', v: (r) => r.total ? '합계 ' + r.n + '일' : md(r.date) + ' (' + wd(r.date) + ')' }, { h: '클릭', r: 1, v: (r) => fmt(r.clicks) }, { h: '노출', r: 1, v: (r) => fmt(r.impressions), hide: 1 }, { h: 'CTR', r: 1, v: (r) => pct(r.ctr) }, { h: '웹 순위', r: 1, v: (r) => pos1(r.position) }, { h: 'Discover', r: 1, v: (r) => fmt(r.disc) }, { h: '웹 검색', r: 1, v: (r) => fmt(r.web), hide: 1 }, { h: '뉴스', r: 1, v: (r) => fmt(r.news), hide: 1, tip: 'Google 뉴스 + 검색 뉴스 탭 클릭' }],
            [{ total: 1, n: series.length, clicks: c.clicks, impressions: c.impressions, ctr: c.ctr, position: c.position, disc: d3.sum(series, (r) => r.disc), web: d3.sum(series, (r) => r.web), news: d3.sum(series, (r) => r.news) }, ...series.slice().reverse()], { h: 320, id: 'tblDaily', rowClass: (r) => (r.total ? 'total' : '') })}
        </div>
        <div class="card">
          <div class="card-head"><div><h3>유입 채널별 클릭 ${info('Discover = 구글 앱·크롬 첫 화면 추천 피드, 웹 검색 = 일반 검색 결과, Google 뉴스 = 뉴스 앱·사이트, 검색 뉴스 탭 = 검색 결과의 뉴스 탭이에요. 아래 %는 직전 같은 기간 대비예요.')}</h3><div class="sub">선택 기간 · 직전 대비</div></div></div>
          ${rkList(ch.map((r) => ({ label: CHANNEL[r.type], v: r.clicks, sub: delta(r.chg), ours: r.type === 'DISCOVER' })))}
        </div>
      </div>`;
    const V = { clicks: [(r) => r.clicks, cp, '클릭'], impressions: [(r) => r.impressions, cp, '노출'], ctr: [(r) => r.ctr, (v) => pct(v), 'CTR'], position: [(r) => r.position, (v) => pos1(v) + '위', '웹 평균 순위'], disc: [(r) => r.disc, cp, 'Discover 클릭'] }[tab];
    barChart($('#chDaily'), series, { value: V[0], fmtV: V[1], label: V[2], line: tab === 'ctr' || tab === 'position', invert: tab === 'position', color: (r) => (r.date >= '2026-09-10' ? RED : MUTED), marks: [['2026-09-10', '하락 시작'], ['2026-09-24', '스팸 업데이트']] });
    $$('#segDaily button').forEach((b) => b.addEventListener('click', () => { state.sub.daily = b.dataset.k; route(); }));
  };

  VIEWS.discover = async (el) => {
    const [pa, pb] = prevRange();
    const c = sumDaily(state.start, state.end, 'DISCOVER'), p = sumDaily(pa, pb, 'DISCOVER'), all = sumDaily(state.start, state.end), allp = sumDaily(pa, pb);
    const series = dailySeries(state.start, state.end);
    const days = await loadDays(state.start, state.end);
    const pages = aggDays(days, 'pages', 'page').filter((r) => r.disc_clicks > 0).sort((a, b) => b.disc_clicks - a.disc_clicks).slice(0, 30);
    const ctry = aggDays(days, 'disc_country', 'country').sort((a, b) => b.clicks - a.clicks).slice(0, 15);
    el.innerHTML = `${pageHead('Discover', '구글 앱·크롬 새 탭의 추천 피드(Discover)에 헬스조선 기사가 얼마나 떴고 읽혔는지 봅니다. 구글은 Discover를 국가 단위까지만 나눠 주고, 국내 지역·기기별 값이나 피드 전체 대비 점유율은 제공하지 않아요.', '구글 추천 피드에서의 노출과 클릭 · 헬스조선 구글 유입의 가장 큰 채널')}
      <div class="grid g-4">
        ${kpi('Discover 클릭', 'Discover 피드에서 헬스조선 기사를 눌러 들어온 횟수예요.', cp(c.clicks), delta(p.clicks ? c.clicks / p.clicks - 1 : null), '직전 ' + cp(p.clicks), 'red')}
        ${kpi('Discover 노출', 'Discover 피드에 헬스조선 기사 카드가 화면에 보인 횟수예요.', cp(c.impressions), delta(p.impressions ? c.impressions / p.impressions - 1 : null), '직전 ' + cp(p.impressions))}
        ${kpi('Discover CTR', 'Discover 노출 중 클릭 비율이에요. 피드 카드의 제목·이미지 매력도를 보여줘요.', pct(c.ctr), delta(c.ctr !== null && p.ctr !== null ? c.ctr - p.ctr : null, 'pt'), '직전 ' + pct(p.ctr))}
        ${kpi('전체 클릭 중 Discover', '구글 전체 클릭 중 Discover에서 나온 비율이에요. 높을수록 Discover 노출 변화에 유입이 크게 흔들려요.', pct(all.clicks ? c.clicks / all.clicks : null, 0), '', '직전 ' + pct(allp.clicks ? p.clicks / allp.clicks : null, 0))}
      </div>
      <div class="card"><div class="card-head"><div><h3>Discover 일별 클릭 ${info('선택 기간 하루 Discover 클릭이에요. 노출이 줄면 클릭도 같이 줄어요 — 피드에 덜 뜨고 있다는 뜻이에요.')}</h3><div class="sub">${rangeText()}</div></div></div><div class="chart" id="chDisc" style="min-height:260px"></div></div>
      <div class="grid g-21">
        <div class="card"><div class="card-head"><div><h3>Discover 상위 기사 ${info('선택 기간 Discover 클릭이 많은 기사예요. 업로드 시간과 기자는 기사 페이지·네이버 송고 기록에서 가져와요.')}</h3><div class="sub">Discover 클릭 순</div></div></div>
          ${days.length ? table([{ h: '순위', v: (r, i) => badge(i) }, { h: '업로드', v: (r) => up(artOf(r.page).uploaded), cls: 'mut' }, { h: '제목', v: (r) => titleCell(r.page, artOf(r.page)), cls: 'title' }, { h: '기자', v: (r) => esc(artOf(r.page).reporter || '–') }, { h: '클릭', r: 1, v: (r) => fmt(r.disc_clicks) }, { h: '노출', r: 1, hide: 1, v: (r) => fmt(r.disc_impressions) }, { h: 'CTR', r: 1, v: (r) => pct(r.disc_impressions ? r.disc_clicks / r.disc_impressions : null) }], pages, { id: 'tblDiscPages' }) : needDays('Discover 기사별 성과')}</div>
        <div class="card"><div class="card-head"><div><h3>국가별 Discover ${info('Discover 노출·클릭이 나온 국가예요. 구글은 Discover를 국가 단위까지만 나눠 줘서 국내 지역별 값은 볼 수 없어요. 기기 구분도 제공하지 않아요.')}</h3><div class="sub">클릭 순</div></div></div>
          ${days.length ? table([{ h: '국가', v: (r) => esc(COUNTRY[r.country] || r.country) }, { h: '클릭', r: 1, v: (r) => fmt(r.clicks) }, { h: '노출', r: 1, v: (r) => fmt(r.impressions) }, { h: 'CTR', r: 1, v: (r) => pct(r.ctr) }], ctry, { rowClass: (r) => (r.country === 'kor' ? 'ours' : '') }) : needDays('국가별 Discover')}</div>
      </div>`;
    barChart($('#chDisc'), series, { value: (r) => r.disc, label: 'Discover 클릭', color: () => RED });
  };

  VIEWS.articles = async (el) => {
    const days = await loadDays(state.start, state.end);
    const qmap = {};
    days.forEach((d) => (d.page_queries || []).forEach((r) => { const k = r.page + '\u0001' + r.query; qmap[k] = (qmap[k] || 0) + r.clicks; }));
    const best = {};
    Object.entries(qmap).forEach(([k, v]) => { const [pg, q] = k.split('\u0001'); if (!best[pg] || v > best[pg].v) best[pg] = { q, v }; });
    let rows = aggDays(days, 'pages', 'page').map((r) => ({ ...r, a: artOf(r.page), q: best[r.page] ? best[r.page].q : null }));
    const s = state.sub.artSort || 'clicks', q = (state.sub.artQ || '').toLowerCase();
    rows = rows.filter((r) => !q || ((r.a.title || '') + ' ' + (r.a.reporter || '') + ' ' + (r.q || '')).toLowerCase().includes(q));
    rows.sort((a, b) => (s === 'uploaded' ? String(b.a.uploaded || '').localeCompare(String(a.a.uploaded || '')) : (b[s] || 0) - (a[s] || 0)));
    rows = rows.slice(0, 200);
    el.innerHTML = `${pageHead('기사 목록', '구글에서 클릭이 많은 헬스조선 기사 목록이에요. 제목·기자·업로드 시간은 수집기가 기사 페이지를 직접 읽어 가져오고, 없으면 네이버 송고 기록에서 제목으로 맞춰요. 대표 검색어는 그 기사로 가장 많이 들어온 검색어예요.', '구글 클릭 상위 기사를 제목·기자·업로드 시간과 함께 보고 엑셀로 저장합니다.')}
      <div class="card"><div class="card-head"><div class="tools">
        <input class="input" id="qArt" type="search" placeholder="제목·기자·검색어 검색" value="${esc(state.sub.artQ || '')}" style="width:240px">
        <select class="input" id="sArt"><option value="clicks">클릭 많은 순</option><option value="impressions">노출 많은 순</option><option value="ctr">CTR 높은 순</option><option value="disc_clicks">Discover 클릭 순</option><option value="uploaded">최신 업로드 순</option></select></div>
        <span class="note">${days.length ? rows.length + '건 · ' + rangeText() : ''}</span></div>
      ${days.length ? table([{ h: '순위', v: (r, i) => badge(i) }, { h: '업로드', v: (r) => up(r.a.uploaded), cls: 'mut', tip: '헬스조선이 기사를 올린 시각이에요. 기사 페이지의 입력 시각, 없으면 네이버 송고 시각이에요.' }, { h: '제목', v: (r) => titleCell(r.page, r.a, r.q), cls: 'title' }, { h: '기자', v: (r) => esc(r.a.reporter || '–') }, { h: '클릭', r: 1, v: (r) => fmt(r.clicks), tip: '구글 전체(검색·Discover·뉴스 등) 클릭 합계' }, { h: '노출', r: 1, hide: 1, v: (r) => fmt(r.impressions), tip: '구글 화면에 보인 횟수 합계' }, { h: 'CTR', r: 1, v: (r) => pct(r.ctr), tip: '클릭 ÷ 노출' }, { h: 'Discover 클릭', r: 1, hide: 1, v: (r) => fmt(r.disc_clicks) }, { h: 'Discover 비중', r: 1, v: (r) => pct(r.clicks ? r.disc_clicks / r.clicks : null, 0), tip: '이 기사 클릭 중 Discover에서 나온 비율' }], rows, { id: 'tblArt', h: 760 }) : needDays('기사별 성과')}</div>`;
    $('#sArt').value = s;
    $('#sArt').addEventListener('change', (e) => { state.sub.artSort = e.target.value; route(); });
    $('#qArt').addEventListener('change', (e) => { state.sub.artQ = e.target.value; route(); });
  };

  VIEWS.media = async (el) => {
    const [pa, pb] = prevRange();
    const HEALTH = [OURS, '코메디닷컴', '하이닥'];
    const scope = state.sub.mediaScope || 'health';
    const hid = {}; DATA.hidoc.forEach((r) => { hid[r.date] = (hid[r.date] || 0) + 1; });
    const hidDates = Object.keys(hid).sort();
    const hidFull = hidDates.slice(1, -1); // 첫날·마지막 날은 하루치가 다 담기지 않아 제외
    const pubRows = [...DATA.pub, ...hidFull.map((d) => ({ date: d, media: '하이닥', articles: hid[d] }))];
    const byMD = {}; pubRows.forEach((r) => { byMD[r.media + '|' + r.date] = Number(r.articles); });
    const datesOf = (m, a, b) => pubRows.filter((r) => r.media === m && inR(r.date, a, b)).map((r) => r.date);
    const sumOn = (m, dates) => dates.reduce((x, d) => x + (byMD[m + '|' + d] || 0), 0);
    let medias = [...new Set(pubRows.map((r) => r.media))];
    if (scope === 'health') medias = medias.filter((m) => HEALTH.includes(m));
    const rk = medias.map((m) => {
      const dd = datesOf(m, state.start, state.end), pd = datesOf(m, pa, pb);
      const cur = sumOn(m, dd), prev = sumOn(m, pd);
      const both = dd.filter((d) => (OURS + '|' + d) in byMD);
      const oursSame = sumOn(OURS, both), mSame = sumOn(m, both);
      return { media: m, ours: m === OURS, articles: cur, days: dd.length, perDay: dd.length ? cur / dd.length : null, chg: prev && pd.length === dd.length ? cur / prev - 1 : null,
        sameDays: both.length, oursSame, mSame, gap: mSame - oursSame, gapDay: both.length ? (mSame - oursSame) / both.length : null };
    }).filter((r) => r.articles > 0).sort((a, b) => (b.perDay || 0) - (a.perDay || 0));
    const pubLast = DATA.pub.map((r) => r.date).sort().pop();
    const g = sumDaily(state.start, state.end);
    const series = HEALTH.map((m) => ({ name: m, strong: m === OURS, pts: pubRows.filter((r) => r.media === m && inR(r.date)).map((r) => ({ date: r.date, v: Number(r.articles) })).sort((a, b) => (a.date < b.date ? -1 : 1)) }));
    const R = (m) => rk.find((r) => r.media === m) || {};
    const ro = R(OURS), kom = R('코메디닷컴'), hd = R('하이닥');
    const gapTxt = (r) => (r.sameDays ? `같은 ${r.sameDays}일 기준 헬스조선 ${fmt(r.oursSame)}건 vs ${fmt(r.mSame)}건 (${r.gap > 0 ? '+' : ''}${fmt(r.gap)})` : '헬스조선과 겹치는 날짜 없음');
    el.innerHTML = `${pageHead('매체 비교', '경쟁 매체와 기사 발행 수, 구글 노출을 비교합니다. 헬스조선·코메디닷컴 등은 네이버 발행목록(뉴스 인사이트 수집), 하이닥은 하이닥이 구글 뉴스에 제출하는 공개 사이트맵 기준이에요. 매체마다 수집된 날짜가 달라서, 차이는 두 매체 모두 데이터가 있는 같은 날짜끼리 비교해요. 경쟁 매체의 구글 노출 수는 구글이 제공하지 않아요.', '얼마나 썼고(발행), 구글에 얼마나 보였고(노출), 우리와 얼마나 차이 나는지')}
      <div class="grid g-4">
        ${kpi('헬스조선 발행 기사', '선택 기간 헬스조선이 발행한 기사 수예요(네이버 발행목록 기준).', fmt(ro.articles), delta(ro.chg), '하루 평균 ' + (ro.perDay ? ro.perDay.toFixed(1) : '–') + '건 · ' + (ro.days || 0) + '일', 'red')}
        ${kpi('코메디닷컴 발행 기사', '같은 기간 코메디닷컴 발행 수예요. 아래 차이는 두 매체 모두 데이터가 있는 같은 날짜끼리 비교한 값이에요(+면 코메디닷컴이 더 많이 발행).', fmt(kom.articles), delta(kom.chg), kom.media ? gapTxt(kom) : '데이터 없음')}
        ${kpi('하이닥 발행 기사', '하이닥이 구글 뉴스 사이트맵에 올린 기사 수예요. 사이트맵에는 최근 4~5일치만 있어 수집기가 매일 쌓아요. 하루치가 다 담긴 날만 세고, 헬스조선과는 같은 날짜끼리 비교해요.', fmt(hd.articles), '', hd.media ? gapTxt(hd) : '선택 기간 수집 데이터 없음')}
        ${kpi('헬스조선 구글 노출', '선택 기간 헬스조선 기사의 구글 노출(검색·Discover·뉴스 합계)이에요. 경쟁 매체의 구글 노출은 구글이 공개하지 않아 비교할 수 없어요.', cp(g.impressions), '', '기사 1건당 ' + (ro.articles ? cp(g.impressions / ro.articles) : '–') + ' 노출')}
      </div>
      <div class="grid g-21">
        <div class="card"><div class="card-head"><div><h3>건강 매체 일별 발행 추이 ${info('하루 발행 기사 수예요. 빨간 선이 헬스조선이에요. 하이닥은 사이트맵 수집이 시작된 날부터 표시돼요.')}</h3><div class="sub">${rangeText()}</div></div>
          <div class="legend"><span style="--c:${RED}">헬스조선</span><span style="--c:${INK}">코메디닷컴</span><span style="--c:${BLUE}">하이닥</span></div></div>
          <div class="chart" id="chPub" style="min-height:260px"></div>
          <div class="note">발행 데이터: 네이버 ~${md(pubLast)} · 하이닥 ${hidFull.length ? md(hidFull[0]) + '~' + md(hidFull[hidFull.length - 1]) : '수집 전'}</div></div>
        <div class="card"><div class="card-head"><div><h3>하루 평균 발행 ${info('선택 기간 데이터가 있는 날의 하루 평균 발행 수예요. 매체마다 수집 일수가 달라 합계 대신 하루 평균으로 순위를 매겨요. 작은 %는 직전 같은 기간 대비예요.')}</h3><div class="sub">선택 기간 · 하루 평균 순</div></div>
          <div class="seg" id="segScope"><button data-k="health" class="${scope === 'health' ? 'on' : ''}">건강 매체</button><button data-k="all" class="${scope === 'all' ? 'on' : ''}">전체</button></div></div>
          ${rkList(rk.map((r) => ({ label: r.media, v: r.perDay || 0, text: (r.perDay ? r.perDay.toFixed(1) : '–') + '건/일', sub: delta(r.chg), ours: r.ours })))}</div>
      </div>
      <div class="card"><div class="card-head"><div><h3>헬스조선과의 차이 ${info('같은 날짜 기준 차이: 두 매체 모두 데이터가 있는 날만 골라 그 매체 발행 수에서 헬스조선 발행 수를 뺀 값이에요(+면 그 매체가 더 많이 발행). 하루 차이: 그 값을 날짜 수로 나눈 값이에요.')}</h3><div class="sub">${rangeText()} · 같은 날짜끼리 비교</div></div></div>
        ${table([{ h: '순위', v: (r, i) => badge(i) }, { h: '매체', v: (r) => esc(r.media) }, { h: '발행 기사', r: 1, v: (r) => fmt(r.articles) }, { h: '데이터 일수', r: 1, v: (r) => r.days + '일' }, { h: '하루 평균', r: 1, v: (r) => (r.perDay ? r.perDay.toFixed(1) : '–') }, { h: '같은 날짜 기준 차이', r: 1, v: (r) => (r.ours ? '—' : r.sameDays ? (r.gap > 0 ? '+' : '') + fmt(r.gap) + `건 (${r.sameDays}일)` : '–'), cls: (r) => (r.ours ? '' : r.gap > 0 ? 'pos' : 'neg') }, { h: '하루 차이', r: 1, v: (r) => (r.ours || r.gapDay === null ? '—' : (r.gapDay > 0 ? '+' : '') + r.gapDay.toFixed(1) + '건'), cls: (r) => (r.ours ? '' : r.gapDay > 0 ? 'pos' : 'neg') }, { h: '직전 대비', r: 1, hide: 1, v: (r) => delta(r.chg) || '–' }], rk, { id: 'tblMedia', rowClass: (r) => (r.ours ? 'ours' : '') })}</div>
      <div class="card"><div class="card-head"><div><h3>구글 노출 비교 ${info('경쟁 매체가 구글에 몇 번 노출됐는지는 구글이 공개하지 않아요. 구글 뉴스 페이지는 자동 수집이 막혀 있어(robots), 경쟁 매체는 구글 뉴스에 제출하는 사이트맵(발행)까지만 비교해요.')}</h3><div class="sub">매체별 구글 노출</div></div></div>
        <div class="empty"><b>경쟁 매체의 구글 노출 수는 구글이 제공하지 않아요</b><br>헬스조선은 Search Console로 실제 노출을 보고, 경쟁 매체는 구글 뉴스 사이트맵 기준 발행 수로 비교해요.</div></div>`;
    multiLine($('#chPub'), series, { color: (n) => (n === OURS ? RED : n === '하이닥' ? BLUE : INK) });
    $$('#segScope button').forEach((b) => b.addEventListener('click', () => { state.sub.mediaScope = b.dataset.k; route(); }));
  };

  VIEWS.reporters = async (el) => {
    const [pa, pb] = prevRange();
    const n = daysBetween(state.start, state.end);
    const cur = {}, prv = {};
    DATA.rep.forEach((r) => { if (r.reporter === '(미기재)') return; if (inR(r.date)) cur[r.reporter] = (cur[r.reporter] || 0) + r.articles; else if (inR(r.date, pa, pb)) prv[r.reporter] = (prv[r.reporter] || 0) + r.articles; });
    const days = await loadDays(state.start, state.end);
    const G = {};
    aggDays(days, 'pages', 'page').forEach((p) => { const a = artOf(p.page); if (!a.reporter) return; a.reporter.split(/[·,/]/).map((x) => x.trim()).filter(Boolean).forEach((nm) => { const b = (G[nm] = G[nm] || { g_articles: 0, g_clicks: 0, g_impressions: 0, best: null }); b.g_articles++; b.g_clicks += p.clicks; b.g_impressions += p.impressions; if (!b.best || p.clicks > b.best.clicks) b.best = { ...p, a }; }); });
    const key = state.sub.repSort || 'articles';
    let rows = [...new Set([...Object.keys(cur), ...Object.keys(G)])].map((k) => ({ reporter: k, articles: cur[k] || 0, perDay: (cur[k] || 0) / n, chg: prv[k] ? (cur[k] || 0) / prv[k] - 1 : null, ...(G[k] || { g_articles: 0, g_clicks: 0, g_impressions: 0 }) }));
    rows = rows.filter((r) => r.articles || r.g_articles).sort((a, b) => (b[key] || 0) - (a[key] || 0));
    const tot = d3.sum(Object.values(cur)), totp = d3.sum(Object.values(prv));
    const top = rows.slice().sort((a, b) => b.articles - a.articles)[0], gtop = rows.slice().sort((a, b) => b.g_clicks - a.g_clicks)[0];
    const repLast = DATA.rep.map((r) => r.date).sort().pop();
    el.innerHTML = `${pageHead('기자 통계', '헬스조선 기자별 발행량과 구글 성과예요. 발행 수는 네이버 발행목록 기준, 구글 클릭·노출은 선택 기간 구글 클릭 상위 기사 중 그 기자가 쓴 기사의 합이에요.', '누가 얼마나 썼고, 누구 기사가 구글에서 많이 읽혔나')}
      <div class="grid g-4">
        ${kpi('활동 기자', '선택 기간 기사를 1건 이상 발행한 헬스조선 기자 수예요(공동 바이라인은 각각 셈).', Object.keys(cur).length + '명', '', '발행 데이터 ~' + md(repLast))}
        ${kpi('총 발행 기사', '선택 기간 기자별 발행 수 합계예요. 공동 바이라인은 기자마다 1건씩 세서 매체 발행 수보다 조금 클 수 있어요.', fmt(tot), delta(totp ? tot / totp - 1 : null), '직전 ' + fmt(totp))}
        ${kpi('발행 1위 기자', '선택 기간 가장 많은 기사를 발행한 기자예요.', esc(top ? top.reporter : '–'), '', top ? fmt(top.articles) + '건 · 하루 ' + top.perDay.toFixed(1) + '건' : '', 'red sm')}
        ${kpi('구글 클릭 1위 기자', '선택 기간 구글 클릭 상위 기사 중, 그 기자가 쓴 기사들의 클릭 합이 가장 큰 기자예요.', esc(gtop && gtop.g_clicks ? gtop.reporter : '–'), '', gtop && gtop.g_clicks ? '클릭 ' + cp(gtop.g_clicks) + ' · 상위 기사 ' + gtop.g_articles + '건' : (days.length ? '' : '구글 기사 데이터 수집 전'), 'sm')}
      </div>
      <div class="card"><div class="card-head"><div><h3>기자별 발행·구글 성과 ${info('발행 기사: 선택 기간 발행 수. 하루 평균: 발행 ÷ 기간 일수. 구글 기사: 선택 기간 구글에서 클릭이 발생한 그 기자의 기사 수. 구글 클릭·노출: 그 기사들의 합. 대표 기사: 그중 클릭이 가장 많은 기사.')}</h3><div class="sub">${rangeText()}</div></div>
        <select class="input" id="sRep"><option value="articles">발행 많은 순</option><option value="g_clicks">구글 클릭 많은 순</option><option value="g_articles">구글 기사 많은 순</option></select></div>
        ${table([{ h: '순위', v: (r, i) => badge(i) }, { h: '기자', v: (r) => esc(r.reporter) }, { h: '발행 기사', r: 1, v: (r) => fmt(r.articles) }, { h: '하루 평균', r: 1, hide: 1, v: (r) => r.perDay.toFixed(1) }, { h: '직전 대비', r: 1, v: (r) => delta(r.chg) || '–' }, { h: '구글 기사', r: 1, v: (r) => fmt(r.g_articles) }, { h: '구글 클릭', r: 1, v: (r) => fmt(r.g_clicks) }, { h: '구글 노출', r: 1, hide: 1, v: (r) => fmt(r.g_impressions) }, { h: '대표 기사', v: (r) => (r.best ? titleCell(r.best.page, r.best.a) : '–'), cls: 'title' }], rows, { id: 'tblRep', h: 760 })}</div>`;
    $('#sRep').value = key;
    $('#sRep').addEventListener('change', (e) => { state.sub.repSort = e.target.value; route(); });
  };

  VIEWS.keywords = async (el) => {
    const [pa, pb] = prevRange();
    const [days, pdays] = await Promise.all([loadDays(state.start, state.end), loadDays(pa, pb)]);
    const cur = aggDays(days, 'queries', 'query'), prev = aggDays(pdays, 'queries', 'query');
    const pm = Object.fromEntries(prev.map((r) => [r.query, r])), cm = Object.fromEntries(cur.map((r) => [r.query, r]));
    const q = (state.sub.kwQ || '').toLowerCase();
    const top = cur.filter((r) => r.query && (!q || r.query.toLowerCase().includes(q))).sort((a, b) => b.clicks - a.clicks).slice(0, 100);
    const lost = prev.map((r) => ({ query: r.query, before: r.clicks, now: cm[r.query] ? cm[r.query].clicks : 0, pb: r.position, pn: cm[r.query] ? cm[r.query].position : null })).map((r) => ({ ...r, diff: r.now - r.before })).sort((a, b) => a.diff - b.diff).slice(0, 20);
    const gained = cur.map((r) => ({ query: r.query, now: r.clicks, before: pm[r.query] ? pm[r.query].clicks : 0, pn: r.position, pb: pm[r.query] ? pm[r.query].position : null })).map((r) => ({ ...r, diff: r.now - r.before })).sort((a, b) => b.diff - a.diff).slice(0, 20);
    const ch = [{ h: '순위', v: (r, i) => badge(i) }, { h: '검색어', v: (r) => esc(r.query) }, { h: '직전 클릭', r: 1, v: (r) => fmt(r.before) }, { h: '선택 기간 클릭', r: 1, v: (r) => fmt(r.now) }, { h: '차이', r: 1, v: (r) => (r.diff > 0 ? '+' : '') + fmt(r.diff), cls: (r) => (r.diff > 0 ? 'pos' : 'neg') }, { h: '직전 순위', r: 1, hide: 1, v: (r) => pos1(r.pb) }, { h: '최근 순위', r: 1, v: (r) => pos1(r.pn) }];
    el.innerHTML = `${pageHead('검색어 랭킹', '독자가 구글에서 어떤 검색어로 헬스조선 기사에 들어왔는지 봅니다. 구글이 개인정보 보호로 가린 검색어와 Discover(검색어 없음)는 빠져요.', '어떤 검색어로 들어왔고, 어떤 검색어를 얻고 잃었나')}
      ${days.length ? `<div class="grid g-2">
        <div class="card"><div class="card-head"><div><h3>잃은 검색어 TOP 20 ${info('직전 같은 길이 기간 대비 클릭이 가장 많이 줄어든 검색어예요. 최근 순위가 –면 상위 검색어 밖으로 밀려난 거예요.')}</h3><div class="sub">직전 기간 vs 선택 기간</div></div></div>${table(ch, lost, { h: 520 })}</div>
        <div class="card"><div class="card-head"><div><h3>얻은 검색어 TOP 20 ${info('직전 같은 길이 기간 대비 클릭이 가장 많이 늘어난 검색어예요.')}</h3><div class="sub">직전 기간 vs 선택 기간</div></div></div>${table(ch, gained, { h: 520 })}</div></div>
      <div class="card"><div class="card-head"><div><h3>유입 검색어 TOP 100 ${info('선택 기간 클릭이 많은 검색어예요. 평균 순위는 그 검색어 결과에서 헬스조선 기사의 평균 위치예요(노출 가중).')}</h3><div class="sub">${rangeText()} · 클릭 순</div></div>
        <input class="input" id="qKw" type="search" placeholder="검색어 찾기" value="${esc(state.sub.kwQ || '')}" style="width:200px"></div>
        ${table([{ h: '순위', v: (r, i) => badge(i) }, { h: '검색어', v: (r) => esc(r.query) }, { h: '클릭', r: 1, v: (r) => fmt(r.clicks) }, { h: '노출', r: 1, hide: 1, v: (r) => fmt(r.impressions) }, { h: 'CTR', r: 1, v: (r) => pct(r.ctr) }, { h: '평균 순위', r: 1, v: (r) => pos1(r.position) }, { h: '직전 대비', r: 1, v: (r) => (pm[r.query] ? delta(r.clicks / pm[r.query].clicks - 1) : '<span class="tag red">신규</span>') }], top, { id: 'tblKw', h: 720 })}</div>` : needDays('검색어 랭킹')}`;
    const qk = $('#qKw'); if (qk) qk.addEventListener('change', (e) => { state.sub.kwQ = e.target.value; route(); });
  };

  VIEWS.trends = async (el) => {
    const T = DATA.trends;
    const days = await loadDays(state.start, state.end);
    const qs = aggDays(days, 'queries', 'query');
    const C = { 독감: RED, 다이어트: INK, 당뇨: '#6b7280', 탈모: '#9ca3af', 고혈압: '#c4c8cf' };
    let opp = [];
    if (T && T.rows) {
      const terms = [...new Set(T.rows.map((r) => r.term))];
      opp = terms.map((t) => { const s = T.rows.filter((r) => r.term === t).sort((a, b) => (a.date < b.date ? -1 : 1)); const v = s.map((r) => r.value || 0), n = v.length; const avg = (a) => (a.length ? d3.mean(a) : null); const now = avg(v.slice(n - 7)), before = avg(v.slice(n - 35, n - 28)); const head = qs.find((r) => r.query === t); const rel = qs.filter((r) => r.query.includes(t)); const p = head ? head.position : null, chg = before ? now / before - 1 : null;
        return { term: t, now, chg, pos: p, relN: rel.length, relC: d3.sum(rel, (r) => r.clicks), verdict: p === null ? '노출 거의 없음' : p > 10 && chg > 0.2 ? '지금 보강' : p > 10 ? '순위 개선 필요' : '방어' }; }).sort((a, b) => b.now - a.now);
    }
    el.innerHTML = `${pageHead('키워드 트렌드', 'Google Trends(한국)로 건강 키워드의 검색 관심도를 보고, 그 키워드에서 헬스조선이 구글 몇 위인지 함께 봅니다.', '지금 사람들이 많이 찾는 건강 주제와 우리의 위치')}
      <div class="card"><div class="card-head"><div><h3>건강 키워드 검색 관심도 ${info('Google Trends 상대 지수예요. 기간 중 가장 많이 검색된 날을 100으로 두고 나머지를 비율로 나타내요. 실제 검색 횟수가 아니라 키워드끼리 비교하는 값이에요.')}</h3><div class="sub">한국 · ${T && T.updated ? '수집 ' + T.updated.slice(0, 10) : '수집 전'}</div></div></div>
        ${T && T.rows ? '<div class="chart" id="chGt" style="min-height:280px"></div>' : '<div class="empty"><b>트렌드 데이터 수집 전이에요</b><br>수집기가 매일 Google Trends에서 키워드 관심도를 받아와요.</div>'}</div>
      <div class="card"><div class="card-head"><div><h3>키워드 기회표 ${info('최근 7일 관심도: Trends 지수 평균. 4주 전 대비: 28~35일 전 평균과 비교. 단어 자체 순위: 그 단어만 검색했을 때 헬스조선 평균 순위. 관련 클릭: 그 단어가 들어간 검색어 클릭 합. 관심도가 20% 이상 오르는데 순위가 10위 밖이면 \'지금 보강\'이에요.')}</h3><div class="sub">트렌드 vs 헬스조선 구글 성과 (${rangeText()})</div></div></div>
        ${table([{ h: '키워드', v: (r) => esc(r.term) }, { h: '최근 7일 관심도', r: 1, v: (r) => (r.now === null ? '–' : r.now.toFixed(0)) }, { h: '4주 전 대비', r: 1, v: (r) => delta(r.chg) || '–' }, { h: '단어 자체 순위', r: 1, v: (r) => (r.pos ? r.pos.toFixed(1) + '위' : '–') }, { h: '관련 검색어 수', r: 1, hide: 1, v: (r) => fmt(r.relN) }, { h: '관련 클릭', r: 1, v: (r) => fmt(r.relC) }, { h: '판단', v: (r) => `<span class="tag${r.verdict === '지금 보강' ? ' red' : r.verdict === '방어' ? ' ink' : ''}">${r.verdict}</span>` }], opp, { empty: '트렌드·검색어 데이터 수집 후 표시돼요' })}</div>`;
    if (T && T.rows) { const terms = [...new Set(T.rows.map((r) => r.term))]; multiLine($('#chGt'), terms.map((t) => ({ name: t, strong: t === '독감', pts: T.rows.filter((r) => r.term === t).map((r) => ({ date: r.date, v: r.value || 0 })).sort((a, b) => (a.date < b.date ? -1 : 1)) })), { H: 280, color: (n) => C[n] || AX, fmtV: (v) => String(Math.round(v)) }); }
  };

  VIEWS.audience = async (el) => {
    const days = await loadDays(state.start, state.end);
    const dev = aggDays(days, 'device', 'device').sort((a, b) => b.clicks - a.clicks);
    const ctry = aggDays(days, 'country', 'country').sort((a, b) => b.clicks - a.clicks).slice(0, 8);
    const series = dailySeries(state.start, state.end);
    const dow = [1, 2, 3, 4, 5, 6, 0].map((k) => ({ k, label: '일월화수목금토'[k] + '요일', v: d3.sum(series.filter((r) => D(r.date).getUTCDay() === k), (r) => r.clicks) }));
    const mx = d3.max(dow, (r) => r.v);
    const qs = aggDays(days, 'queries', 'query');
    const br = d3.sum(qs.filter((r) => /헬스\s*조선|health\s*chosun|조선\s*헬스/i.test(r.query)), (r) => r.clicks), nb = d3.sum(qs, (r) => r.clicks) - br;
    const totalC = sumDaily(state.start, state.end).clicks;
    const rt = DATA.rt, demo = DATA.demo;
    const demoR = demo && demo.rows ? demo.rows.filter((r) => inR(r.date)) : [];
    const age = d3.rollups(demoR.filter((r) => r.age && r.age !== 'unknown'), (v) => d3.sum(v, (r) => r.users), (r) => r.age).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const gen = d3.rollups(demoR.filter((r) => r.gender && r.gender !== 'unknown'), (v) => d3.sum(v, (r) => r.users), (r) => r.gender);
    const ageT = d3.sum(age, (r) => r[1]), genT = d3.sum(gen, (r) => r[1]);
    const ga4Need = (w) => `<div class="empty"><b>${w}는 Google Analytics 4에서 가져와요</b><br>저장소 설정에 GA4 속성 ID와 서비스 계정을 등록하면 수집기가 채워요.${w.includes('연령') ? '<br>연령·성별은 GA4에서 \'Google 신호\'가 켜져 있어야 나와요.' : ''}</div>`;
    el.innerHTML = `${pageHead('독자 성향', '구글로 들어온 독자가 어떤 기기로, 어느 나라에서, 무슨 요일에 오는지(Search Console), 지금 몇 명이 읽고 있는지와 연령·성별(GA4)을 봅니다.', '실시간 독자 · 연령·성별 · 기기 · 요일 · 국가')}
      <div class="grid g-21">
        <div class="card"><div class="card-head"><div><h3>실시간 · 최근 30분 ${info('GA4 실시간 보고서 기준, 최근 30분 동안 사이트를 본 활성 사용자예요. 수집기가 1시간마다 받아와서, 화면의 값은 받아온 시점 기준이에요.')}</h3><div class="sub">${rt && rt.fetched_at ? '받아온 시각 ' + rt.fetched_at.slice(5, 16).replace('T', ' ') : 'GA4 연결 전'}</div></div></div>
          ${rt && rt.total !== undefined ? `<div class="grid g-3"><div class="kpi"><div class="label">활성 사용자</div><div class="value red">${fmt(rt.total)}</div><div class="meta">최근 30분</div></div><div class="kpi"><div class="label">모바일 비중</div><div class="value">${pct(rt.total ? (rt.device || []).filter((r) => r.device === 'mobile').reduce((a, r) => a + r.users, 0) / rt.total : null, 0)}</div><div class="meta">기기 기준</div></div><div class="kpi"><div class="label">많이 보는 지역</div><div class="value sm">${esc(((rt.city || [])[0] || {}).city || '–')}</div><div class="meta">도시 기준</div></div></div>
            <div style="margin-top:14px">${table([{ h: '지금 많이 보는 페이지', v: (r) => esc(r.title || r.page) }, { h: '사용자', r: 1, v: (r) => fmt(r.users) }], (rt.pages || []).slice(0, 10))}</div>` : ga4Need('최근 30분 실시간 독자')}</div>
        <div class="card"><div class="card-head"><div><h3>연령 · 성별 ${info('GA4 기준 선택 기간 활성 사용자의 연령대·성별 비중이에요. 구글이 식별한 사용자만 집계되고, 적은 값은 개인정보 보호로 가려질 수 있어요.')}</h3><div class="sub">${rangeText()}</div></div></div>
          ${demoR.length ? hbars(age.map(([k, v]) => ({ label: AGE[k] || k, v, text: pct(v / ageT, 0) }))) + '<div style="height:10px"></div>' + hbars(gen.map(([k, v]) => ({ label: GENDER[k] || k, v, text: pct(v / genT, 0) }))) : ga4Need('연령·성별')}</div>
      </div>
      <div class="grid g-2">
        <div class="card"><div class="card-head"><div><h3>기기 ${info('구글 검색·뉴스 클릭의 기기 비중이에요. Discover 클릭은 구글이 기기 구분 없이 집계해서 여기서 빠져요(사실상 모바일 구글 앱).')}</h3><div class="sub">클릭 비중</div></div></div>
          ${days.length ? hbars(dev.map((r) => ({ label: DEVICE[r.device] || r.device, v: r.clicks, text: pct(r.clicks / d3.sum(dev, (x) => x.clicks)) }))) : needDays('기기별 클릭')}</div>
        <div class="card"><div class="card-head"><div><h3>요일 ${info('선택 기간 요일별 구글 클릭 합계예요. 클릭이 많은 요일에 주요 기사를 배치하면 효과가 커요.')}</h3><div class="sub">클릭 수</div></div></div>
          ${hbars(dow.map((r) => ({ label: r.label, v: r.v, text: cp(r.v), hi: r.v === mx })))}</div>
        <div class="card"><div class="card-head"><div><h3>국가 ${info('전체 클릭 중 국가별 비중이에요. 해외 한인 독자 규모를 볼 수 있어요.')}</h3><div class="sub">클릭 비중</div></div></div>
          ${days.length ? hbars(ctry.map((r) => ({ label: COUNTRY[r.country] || r.country, v: r.clicks, text: pct(totalC ? r.clicks / totalC : null) }))) : needDays('국가별 클릭')}</div>
        <div class="card"><div class="card-head"><div><h3>찾아오는 방식 ${info('\'헬스조선\'처럼 매체명을 직접 검색해 온 독자(매체명 검색)와 건강 정보를 찾다가 들어온 독자(정보 검색)의 비중이에요. 구글이 가린 검색어는 빠져요.')}</h3><div class="sub">검색어 클릭 비중</div></div></div>
          ${days.length ? hbars([{ label: '정보 검색', v: nb, text: pct(nb / (nb + br)) }, { label: '매체명 검색', v: br, text: pct(br / (nb + br)) }]) : needDays('검색 방식')}</div>
      </div>`;
  };

  /* ---------- 라우팅 ---------- */
  async function route() {
    const v = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'dashboard';
    state.view = VIEWS[v] ? v : 'dashboard';
    $$('.sidebar a').forEach((a) => a.classList.toggle('active', a.dataset.page === state.view));
    $$('#presets button').forEach((b) => b.classList.toggle('on', b.dataset.p === state.preset));
    $('#dStart').value = state.start; $('#dEnd').value = state.end;
    const n = daysBetween(state.start, state.end), [pa, pb] = prevRange();
    $('#rangeNote').innerHTML = `조회 기간: <b>${RANGE_NAME[state.preset] || '직접 지정'} (${rangeText()}, ${n}일)</b> · 증감은 직전 동일 기간(${pa.replace(/-/g, '.')}~${pb.replace(/-/g, '.')}) 대비` + (DATA.lastDay && state.end > DATA.lastDay ? ` · <span style="color:#b45309">구글 데이터는 ${DATA.lastDay.replace(/-/g, '.')}까지 있어요</span>` : '');
    const el = $('#view');
    el.innerHTML = '<div class="loading">불러오는 중…</div>';
    try { await VIEWS[state.view](el); } catch (e) { console.error(e); el.innerHTML = `<div class="empty"><b>화면을 그리지 못했어요</b><br>${esc(e.message)}</div>`; }
    $('#sidebar').classList.remove('open');
  }

  /* ---------- 설명(i) 팝업 ---------- */
  const pop = $('#pop');
  const showPop = (t) => { pop.textContent = t.dataset.tip; pop.style.display = 'block'; const r = t.getBoundingClientRect(); const w = pop.offsetWidth; pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left - 12)) + 'px'; pop.style.top = Math.min(window.innerHeight - pop.offsetHeight - 8, r.bottom + 8) + 'px'; };
  document.addEventListener('mouseover', (e) => { const t = e.target.closest('.i'); if (t) showPop(t); });
  document.addEventListener('mouseout', (e) => { if (e.target.closest('.i')) pop.style.display = 'none'; });
  document.addEventListener('focusin', (e) => { const t = e.target.closest('.i'); if (t) showPop(t); });
  document.addEventListener('focusout', (e) => { if (e.target.closest('.i')) pop.style.display = 'none'; });
  document.addEventListener('click', (e) => { const t = e.target.closest('.i'); if (t) { e.preventDefault(); pop.style.display === 'block' ? (pop.style.display = 'none') : showPop(t); } });

  /* ---------- 엑셀(CSV) 저장 ---------- */
  $('#btnCsv').addEventListener('click', () => {
    const tbl = $('#view table.t');
    if (!tbl) return toast('저장할 표가 없어요');
    const rows = [...tbl.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => '"' + (c.querySelector('a') ? c.querySelector('a').textContent + (c.querySelector('.q') ? ' / ' + c.querySelector('.q').textContent : '') : c.textContent).replace(/\s+/g, ' ').trim().replace(/"/g, '""') + '"').join(','));
    const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `구글인사이트_${state.view}_${state.start}_${state.end}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  /* ---------- 시작 ---------- */
  $$('#presets button').forEach((b) => b.addEventListener('click', () => setPreset(b.dataset.p)));
  $('#btnApply').addEventListener('click', () => { let a = $('#dStart').value, b = $('#dEnd').value; if (!a || !b) return toast('시작일과 종료일을 고르세요'); if (a > b) [a, b] = [b, a]; state.preset = 'custom'; state.start = a; state.end = b; saveRange(); route(); });
  $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  window.addEventListener('hashchange', route);
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(route, 250); });

  /* ---------- 입장 확인 ---------- */
  const CFG = window.GI_CONFIG || {};
  const sha = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const unlocked = () => { try { const v = JSON.parse(localStorage.getItem('gi-auth') || 'null'); return v && v.h === CFG.PASSWORD_SHA256 && v.exp > Date.now(); } catch (e) { return false; } };
  const gate = () => new Promise((resolve) => {
    if (!CFG.PASSWORD_SHA256 || unlocked() || sessionStorage.getItem('gi-auth') === CFG.PASSWORD_SHA256) { document.body.classList.remove('locked'); return resolve(); }
    $('#gateForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const h = await sha((CFG.SALT || '') + $('#gatePw').value);
      if (h !== CFG.PASSWORD_SHA256) { $('#gateErr').hidden = false; $('#gatePw').select(); return; }
      try { if ($('#gateKeep').checked) localStorage.setItem('gi-auth', JSON.stringify({ h, exp: Date.now() + (CFG.REMEMBER_DAYS || 30) * 864e5 })); sessionStorage.setItem('gi-auth', h); } catch (er) {}
      document.body.classList.remove('locked');
      resolve();
    });
  });

  (async () => {
    await gate();
    await loadBase();
    if (state.preset !== 'custom' || !state.start) [state.start, state.end] = presetRange(state.preset || '28');
    const pill = $('#statusPill');
    const upd = DATA.dailyUpdated ? DATA.dailyUpdated.slice(0, 16).replace('T', ' ') : null;
    pill.className = 'status-pill ' + (DATA.days.size ? 'ok' : 'warn');
    pill.lastElementChild.textContent = (upd ? '최근 수집 ' + upd : '수집 전') + ' · 구글 데이터 ~' + (DATA.lastDay ? DATA.lastDay.replace(/-/g, '.') : '–');
    route();
  })();
})();
