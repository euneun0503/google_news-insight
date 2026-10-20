#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
구글 인사이트 수집기 (GitHub Actions에서 실행)

  python collector/collect.py auto            # 매시간: 실시간(GA4)·하이닥 / 하루 1번(KST 9시): 나머지 전부
  python collector/collect.py all --days 90   # 전부 (처음 한 번은 90일 채우기)
  python collector/collect.py gsc --days 5    # Search Console 최근 N일
  python collector/collect.py articles        # 기사 페이지 크롤링(제목·기자·업로드 시간)
  python collector/collect.py naver           # 네이버 발행·기자 (뉴스 인사이트 저장소)
  python collector/collect.py hidoc           # 하이닥 구글 뉴스 사이트맵
  python collector/collect.py trends          # Google Trends
  python collector/collect.py realtime        # GA4 최근 30분
  python collector/collect.py demo --days 90  # GA4 연령·성별

필요한 저장소 비밀값(Settings → Secrets and variables → Actions):
  GOOGLE_SA_JSON   서비스 계정 키(JSON 전체). Search Console·GA4에 이 계정 이메일을 사용자로 추가해야 함
  GA4_PROPERTY_ID  GA4 속성 ID(숫자). 없으면 GA4 단계는 건너뜀
"""
import argparse
import datetime as dt
import html
import json
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import quote

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
KST = dt.timezone(dt.timedelta(hours=9))
SITES = [s.strip() for s in os.environ.get("GSC_SITES", "https://health.chosun.com/,https://m.health.chosun.com/").split(",") if s.strip()]
GA4 = os.environ.get("GA4_PROPERTY_ID", "").strip()
NAVER_REPO = os.environ.get("NAVER_REPO", "euneun0503/news-insight")
OUR_OID = "346"
MEDIA = {"346": "헬스조선", "296": "코메디닷컴", "421": "뉴스1", "001": "연합뉴스", "119": "데일리안", "081": "서울신문",
         "023": "조선일보", "020": "동아일보", "025": "중앙일보", "052": "YTN", "011": "서울경제"}
TREND_TERMS = ["독감", "당뇨", "다이어트", "고혈압", "탈모"]
TYPES = {"web": "WEB", "discover": "DISCOVER", "googleNews": "GOOGLE_NEWS", "news": "NEWS", "image": "IMAGE", "video": "VIDEO"}
UA = {"User-Agent": "Mozilla/5.0 (compatible; GoogleInsightCollector/1.0; +https://euneun0503.github.io/google_news-insight/)"}


def now_kst():
    return dt.datetime.now(KST)


def today_kst():
    return now_kst().date()


def load(p, default):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception:
        return default


def save(p, obj, compact=True):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    txt = json.dumps(obj, ensure_ascii=False, separators=(",", ":") if compact else None, indent=None if compact else 0)
    p.write_text(txt, encoding="utf-8")


def log(*a):
    print(now_kst().strftime("%H:%M:%S"), *a, flush=True)


# ---------------------------------------------------------------- 인증
_session = None


def gsession():
    global _session
    if _session:
        return _session
    raw = os.environ.get("GOOGLE_SA_JSON", "").strip()
    if not raw:
        return None
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession
    creds = service_account.Credentials.from_service_account_info(json.loads(raw), scopes=[
        "https://www.googleapis.com/auth/webmasters.readonly",
        "https://www.googleapis.com/auth/analytics.readonly",
    ])
    _session = AuthorizedSession(creds)
    return _session


# ---------------------------------------------------------------- Search Console
def gsc_query(site, body):
    s = gsession()
    url = f"https://www.googleapis.com/webmasters/v3/sites/{quote(site, safe='')}/searchAnalytics/query"
    rows, start = [], 0
    limit = body.get("rowLimit", 1000)
    while True:
        b = dict(body, startRow=start, dataState="all")
        for attempt in range(4):
            r = s.post(url, json=b, timeout=90)
            if r.status_code in (429, 500, 503):
                time.sleep(5 * (attempt + 1))
                continue
            break
        if r.status_code != 200:
            log("GSC 오류", site, r.status_code, r.text[:300])
            return rows
        got = r.json().get("rows", [])
        rows += got
        if len(got) < min(limit, 25000) or len(rows) >= body.get("maxRows", limit):
            return rows
        start += len(got)


def run_gsc(days):
    if not gsession():
        log("GOOGLE_SA_JSON 없음 → Search Console 건너뜀")
        return
    end = today_kst() - dt.timedelta(days=1)
    start = end - dt.timedelta(days=days - 1)
    log(f"Search Console {start}~{end} ({days}일)")

    # 1) 일별 · 검색 유형별 합계 → data/gsc/daily.json
    daily = load(DATA / "gsc/daily.json", {"rows": []})
    keep = {(r["date"], r["type"]): r for r in daily.get("rows", []) if not (str(start) <= r["date"] <= str(end))}
    acc = {}
    for site in SITES:
        for t, T in TYPES.items():
            for row in gsc_query(site, {"startDate": str(start), "endDate": str(end), "dimensions": ["date"], "type": t, "rowLimit": 1000}):
                k = (row["keys"][0], T)
                o = acc.setdefault(k, {"date": k[0], "type": T, "clicks": 0, "impressions": 0, "_pw": 0.0})
                o["clicks"] += row["clicks"]
                o["impressions"] += row["impressions"]
                o["_pw"] += row.get("position", 0) * row["impressions"]
    for k, o in acc.items():
        pw = o.pop("_pw")
        if o["type"] not in ("DISCOVER", "GOOGLE_NEWS") and o["impressions"]:
            o["position"] = round(pw / o["impressions"], 4)
        keep[k] = o
    save(DATA / "gsc/daily.json", {"source": "Google Search Console (" + " + ".join(SITES) + ")", "updated": now_kst().isoformat(timespec="minutes"),
                                   "rows": sorted(keep.values(), key=lambda r: (r["date"], r["type"]))})

    # 2) 하루 단위 상세 → data/gsc/days/YYYY-MM-DD.json
    d = start
    while d <= end:
        day = str(d)
        pages, queries, pq, device, country, dcountry = {}, {}, {}, {}, {}, {}

        def add(store, key, row, extra=None):
            o = store.setdefault(key, {"clicks": 0, "impressions": 0, "_pw": 0.0, "_wi": 0})
            o["clicks"] += row["clicks"]
            o["impressions"] += row["impressions"]
            if extra != "nopos":
                o["_pw"] += row.get("position", 0) * row["impressions"]
                o["_wi"] += row["impressions"]
            return o

        for site in SITES:
            base = {"startDate": day, "endDate": day}
            for row in gsc_query(site, dict(base, dimensions=["page"], type="web", rowLimit=1000)):
                add(pages, row["keys"][0], row)
            for t in ("discover", "googleNews", "news"):
                for row in gsc_query(site, dict(base, dimensions=["page"], type=t, rowLimit=1000)):
                    o = add(pages, row["keys"][0], row, "nopos")
                    if t == "discover":
                        o["disc_clicks"] = o.get("disc_clicks", 0) + row["clicks"]
                        o["disc_impressions"] = o.get("disc_impressions", 0) + row["impressions"]
                    else:
                        o["news_clicks"] = o.get("news_clicks", 0) + row["clicks"]
            for row in gsc_query(site, dict(base, dimensions=["query"], type="web", rowLimit=1000)):
                add(queries, row["keys"][0], row)
            for row in gsc_query(site, dict(base, dimensions=["page", "query"], type="web", rowLimit=3000, maxRows=3000)):
                k = (row["keys"][0], row["keys"][1])
                pq[k] = pq.get(k, 0) + row["clicks"]
            for t in ("web", "news", "googleNews"):
                for row in gsc_query(site, dict(base, dimensions=["device"], type=t, rowLimit=10)):
                    add(device, row["keys"][0], row, "nopos")
            for t in ("web", "discover", "googleNews", "news"):
                for row in gsc_query(site, dict(base, dimensions=["country"], type=t, rowLimit=50)):
                    add(country, row["keys"][0], row, "nopos")
                    if t == "discover":
                        add(dcountry, row["keys"][0], row, "nopos")

        def out(store, field, top=None, minc=0):
            rows = []
            for k, o in store.items():
                pw, wi = o.pop("_pw", 0), o.pop("_wi", 0)
                r = {field: k, **{kk: vv for kk, vv in o.items()}}
                if pw and wi:
                    r["position"] = round(pw / wi, 2)
                rows.append(r)
            rows.sort(key=lambda r: -r["clicks"])
            rows = [r for r in rows if r["clicks"] >= minc or r["impressions"] >= 50]
            return rows[:top] if top else rows

        doc = {
            "date": day,
            "pages": out(pages, "page", 800),
            "queries": out(queries, "query", 1500),
            "page_queries": [{"page": k[0], "query": k[1], "clicks": v} for k, v in sorted(pq.items(), key=lambda x: -x[1])[:1500] if v > 0],
            "device": out(device, "device"),
            "country": out(country, "country", 40),
            "disc_country": out(dcountry, "country", 40),
        }
        save(DATA / f"gsc/days/{day}.json", doc)
        log("  ", day, "pages", len(doc["pages"]), "queries", len(doc["queries"]))
        d += dt.timedelta(days=1)

    idx = sorted(p.stem for p in (DATA / "gsc/days").glob("*.json"))
    save(DATA / "gsc/index.json", {"updated": now_kst().isoformat(timespec="minutes"), "days": idx})


# ---------------------------------------------------------------- 기사 페이지 크롤링
def norm_title(s):
    s = re.sub(r"\s*[-|]\s*헬스조선\s*$", "", s or "")
    return re.sub(r"[\W_]+", "", s).lower()


def parse_article(htm):
    def meta(*names):
        for n in names:
            m = re.search(r'<meta[^>]+(?:property|name)=["\']%s["\'][^>]*content=["\']([^"\']+)' % re.escape(n), htm, re.I) or \
                re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']%s["\']' % re.escape(n), htm, re.I)
            if m:
                return html.unescape(m.group(1)).strip()
        return None
    title = meta("og:title", "twitter:title")
    if not title:
        m = re.search(r"<title>(.*?)</title>", htm, re.S | re.I)
        title = html.unescape(m.group(1)).strip() if m else None
    if title:
        title = re.sub(r"\s*[-|]\s*헬스조선\s*$", "", title)
    author = meta("dable:author", "article:author", "author", "byl", "og:article:author")
    if author and author.startswith("http"):
        author = None
    if not author:
        m = re.search(r"([가-힣]{2,4}(?:\s*[·,]\s*[가-힣]{2,4})*)\s*(?:헬스조선\s*)?기자", re.sub(r"<[^>]+>", " ", htm))
        author = m.group(1) if m else None
    if author:
        author = re.sub(r"\s*기자\s*$", "", author).strip()
    pub = meta("article:published_time", "og:regDate", "dable:published_time", "pubdate")
    if pub:
        m = re.search(r"(\d{4})[-.]?(\d{2})[-.]?(\d{2})[T\s]?(\d{2})?:?(\d{2})?", pub)
        pub = f"{m.group(1)}-{m.group(2)}-{m.group(3)} {m.group(4) or '00'}:{m.group(5) or '00'}" if m else None
    if not pub:
        m = re.search(r"입력\s*:?\s*(\d{4})[.-](\d{2})[.-](\d{2})\s+(\d{2}):(\d{2})", re.sub(r"<[^>]+>", " ", htm))
        pub = f"{m.group(1)}-{m.group(2)}-{m.group(3)} {m.group(4)}:{m.group(5)}" if m else None
    return {"title": title, "reporter": author, "uploaded": pub}


def naver_index(days=60):
    """뉴스 인사이트 저장소에서 헬스조선(346) 송고 기록: 정규화 제목 → (날짜, 시각, 기자)"""
    idx = {}
    for i in range(days):
        d = today_kst() - dt.timedelta(days=i)
        try:
            r = requests.get(f"https://raw.githubusercontent.com/{NAVER_REPO}/main/data/articles/{d}.json", timeout=30)
            if r.status_code != 200:
                continue
            for it in r.json().get("items", []):
                if it[0] == OUR_OID:
                    idx.setdefault(norm_title(it[3]), (str(d), it[2], it[4] if len(it) > 4 else ""))
        except Exception:
            pass
    return idx


def run_articles(limit=400):
    arts = load(DATA / "articles.json", {"articles": {}})
    A = arts.setdefault("articles", {})
    want = {}
    for p in sorted((DATA / "gsc/days").glob("*.json"))[-30:]:
        for r in load(p, {}).get("pages", [])[:300]:
            m = re.search(r"(\d{13})", r["page"])
            if m and (m.group(1) not in A or not A[m.group(1)].get("title")):
                want[m.group(1)] = r["page"]
    log(f"기사 크롤링 대상 {len(want)}건")
    nidx = None
    n = 0
    for aid, page in list(want.items())[:limit]:
        url = f"https://health.chosun.com/site/data/html_dir/{aid[:4]}/{aid[4:6]}/{aid[6:8]}/{aid}.html"
        info = {"url": url}
        try:
            r = requests.get(url, headers=UA, timeout=20)
            r.encoding = r.apparent_encoding or "utf-8"
            if r.status_code == 200:
                info.update({k: v for k, v in parse_article(r.text).items() if v})
                info["src"] = "page"
        except Exception as e:
            log("  크롤링 실패", aid, e)
        if not info.get("reporter") or not info.get("uploaded"):
            if nidx is None:
                nidx = naver_index()
            hit = nidx.get(norm_title(info.get("title")))
            if not hit and info.get("title"):
                k = norm_title(info["title"])[:16]
                hit = next((v for kk, v in nidx.items() if k and (k in kk or kk[:16] in norm_title(info["title"]))), None)
            if hit:
                info.setdefault("reporter", hit[2] or None)
                info.setdefault("uploaded", f"{hit[0]} {hit[1]}")
                info["src"] = info.get("src", "") + "+naver"
        A[aid] = {**A.get(aid, {}), **info}
        n += 1
        time.sleep(0.4)
    arts["updated"] = now_kst().isoformat(timespec="minutes")
    save(DATA / "articles.json", arts, compact=False)
    log(f"기사 {n}건 갱신 · 전체 {len(A)}건")


# ---------------------------------------------------------------- 네이버 발행·기자
def run_naver(days=60):
    pub = load(DATA / "publish.json", {"rows": []})
    rep = load(DATA / "reporters.json", {"rows": []})
    P = {(r["date"], r["media"]): r for r in pub.get("rows", [])}
    R = {(r["date"], r["reporter"]): r for r in rep.get("rows", [])}
    got = 0
    for i in range(1, days + 1):
        d = str(today_kst() - dt.timedelta(days=i))
        try:
            r = requests.get(f"https://raw.githubusercontent.com/{NAVER_REPO}/main/data/articles/{d}.json", timeout=30)
            if r.status_code != 200:
                continue
            j = r.json()
        except Exception:
            continue
        cnt, rc = {}, {}
        for it in j.get("items", []):
            oid = it[0]
            cnt[oid] = cnt.get(oid, 0) + 1
            if oid == OUR_OID:
                names = [x.strip() for x in re.split(r"[·,/]", it[4] if len(it) > 4 else "") if x.strip()] or ["(미기재)"]
                for nm in names:
                    rc[nm] = rc.get(nm, 0) + 1
        for oid, name in MEDIA.items():
            if oid in cnt or oid in j.get("media", {}):
                P[(d, name)] = {"date": d, "media": name, "articles": cnt.get(oid, 0)}
        for k in [k for k in R if k[0] == d]:
            del R[k]
        for nm, c in rc.items():
            R[(d, nm)] = {"date": d, "reporter": nm, "articles": c}
        got += 1
    save(DATA / "publish.json", {"source": f"{NAVER_REPO} data/articles (네이버 발행목록)", "updated": now_kst().isoformat(timespec="minutes"), "rows": sorted(P.values(), key=lambda r: (r["date"], r["media"]))})
    save(DATA / "reporters.json", {"source": f"{NAVER_REPO} data/articles (헬스조선 346)", "updated": now_kst().isoformat(timespec="minutes"), "rows": sorted(R.values(), key=lambda r: (r["date"], r["reporter"]))})
    log(f"네이버 발행·기자 {got}일 갱신")


# ---------------------------------------------------------------- 하이닥 (구글 뉴스 사이트맵)
def run_hidoc():
    doc = load(DATA / "hidoc.json", {"items": []})
    items = {(i.get("url") or (i["date"] + i["time"] + i["title"])): i for i in doc.get("items", [])}
    try:
        r = requests.get("https://news.hidoc.co.kr/sitemap.xml", headers=UA, timeout=30)
        root = ET.fromstring(r.content)
    except Exception as e:
        log("하이닥 사이트맵 실패", e)
        return
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9", "n": "http://www.google.com/schemas/sitemap-news/0.9"}
    new = 0
    for u in root.findall("s:url", ns):
        loc = (u.findtext("s:loc", default="", namespaces=ns) or "").strip()
        pd = u.findtext("n:news/n:publication_date", default="", namespaces=ns) or u.findtext("s:lastmod", default="", namespaces=ns)
        title = (u.findtext("n:news/n:title", default="", namespaces=ns) or "").strip()
        m = re.match(r"(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})", pd or "")
        if not m:
            continue
        # 예전에 url 없이 저장된 같은 기사는 교체
        for k in [k for k, v in items.items() if not v.get("url") and v["title"] == title and v["date"] == m.group(1)]:
            del items[k]
        if loc not in items:
            new += 1
        items[loc] = {"date": m.group(1), "time": m.group(2), "title": title, "url": loc}
    rows = sorted(items.values(), key=lambda i: (i["date"], i["time"]), reverse=True)
    save(DATA / "hidoc.json", {"source": "https://news.hidoc.co.kr/sitemap.xml (Google News sitemap)", "updated": now_kst().isoformat(timespec="minutes"), "items": rows}, compact=False)
    log(f"하이닥 새 기사 {new}건 · 누적 {len(rows)}건")


# ---------------------------------------------------------------- Google Trends
def run_trends():
    try:
        from pytrends.request import TrendReq
        tr = TrendReq(hl="ko-KR", tz=-540, timeout=(10, 30), retries=2, backoff_factor=1)
        tr.build_payload(TREND_TERMS, timeframe="today 3-m", geo="KR")
        df = tr.interest_over_time()
    except Exception as e:
        log("트렌드 실패(다음 실행 때 다시 시도)", e)
        return
    rows = []
    for ts, rec in df.iterrows():
        for t in TREND_TERMS:
            if t in rec:
                rows.append({"date": ts.strftime("%Y-%m-%d"), "term": t, "value": int(rec[t])})
    save(DATA / "trends.json", {"source": "Google Trends (KR, 최근 90일)", "updated": now_kst().isoformat(timespec="minutes"), "rows": rows})
    log(f"트렌드 {len(rows)}행")


# ---------------------------------------------------------------- GA4
def ga4(method, body):
    s = gsession()
    r = s.post(f"https://analyticsdata.googleapis.com/v1beta/properties/{GA4}:{method}", json=body, timeout=60)
    if r.status_code != 200:
        log("GA4 오류", r.status_code, r.text[:300])
        return []
    out = []
    for row in r.json().get("rows", []):
        out.append(([d["value"] for d in row.get("dimensionValues", [])], [float(m["value"]) for m in row.get("metricValues", [])]))
    return out


def run_realtime():
    if not (GA4 and gsession()):
        log("GA4 설정 없음 → 실시간 건너뜀")
        return
    m = [{"name": "activeUsers"}]
    dev = ga4("runRealtimeReport", {"dimensions": [{"name": "deviceCategory"}], "metrics": m})
    city = ga4("runRealtimeReport", {"dimensions": [{"name": "city"}], "metrics": m, "limit": 10})
    pages = ga4("runRealtimeReport", {"dimensions": [{"name": "unifiedScreenName"}], "metrics": m, "limit": 20})
    tot = ga4("runRealtimeReport", {"metrics": m})
    save(DATA / "ga4/realtime.json", {
        "fetched_at": now_kst().isoformat(timespec="minutes"), "window": "최근 30분",
        "total": int(tot[0][1][0]) if tot else int(sum(v[0] for _, v in dev)),
        "device": [{"device": k[0], "users": int(v[0])} for k, v in dev],
        "city": [{"city": k[0], "users": int(v[0])} for k, v in sorted(city, key=lambda x: -x[1][0]) if k[0] != "(not set)"],
        "pages": [{"title": re.sub(r"\s*[-|]\s*헬스조선\s*$", "", k[0]), "users": int(v[0])} for k, v in sorted(pages, key=lambda x: -x[1][0])],
    })
    log("GA4 실시간 저장")


def run_demo(days):
    if not (GA4 and gsession()):
        log("GA4 설정 없음 → 연령·성별 건너뜀")
        return
    end = today_kst() - dt.timedelta(days=1)
    start = end - dt.timedelta(days=days - 1)
    doc = load(DATA / "ga4/demo.json", {"rows": []})
    keep = [r for r in doc.get("rows", []) if not (str(start) <= r["date"] <= str(end))]
    rows = ga4("runReport", {"dateRanges": [{"startDate": str(start), "endDate": str(end)}],
                             "dimensions": [{"name": "date"}, {"name": "userAgeBracket"}, {"name": "userGender"}],
                             "metrics": [{"name": "activeUsers"}], "limit": 100000})
    for k, v in rows:
        keep.append({"date": f"{k[0][:4]}-{k[0][4:6]}-{k[0][6:]}", "age": k[1], "gender": k[2], "users": int(v[0])})
    save(DATA / "ga4/demo.json", {"source": f"GA4 property {GA4}", "updated": now_kst().isoformat(timespec="minutes"), "rows": sorted(keep, key=lambda r: (r["date"], r["age"], r["gender"]))})
    log(f"GA4 연령·성별 {len(rows)}행")


# ---------------------------------------------------------------- 실행
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", nargs="?", default="auto")
    ap.add_argument("--days", type=int, default=5)
    a = ap.parse_args()
    cmd = a.cmd
    daily_hour = now_kst().hour == 9
    first_run = not any((DATA / "gsc/days").glob("*.json"))
    days = 90 if (first_run and cmd in ("auto", "all")) else a.days
    steps = []
    if cmd == "auto":
        steps = ["realtime", "hidoc"] + (["gsc", "articles", "naver", "trends", "demo"] if (daily_hour or first_run) else [])
    elif cmd == "all":
        steps = ["gsc", "articles", "naver", "hidoc", "trends", "realtime", "demo"]
    else:
        steps = [cmd]
    for s in steps:
        try:
            {"gsc": lambda: run_gsc(days), "articles": run_articles, "naver": lambda: run_naver(max(days, 10)), "hidoc": run_hidoc,
             "trends": run_trends, "realtime": run_realtime, "demo": lambda: run_demo(max(days, 7))}[s]()
        except Exception as e:
            log(f"[{s}] 실패: {e}")
    save(DATA / "status.json", {"ran_at": now_kst().isoformat(timespec="minutes"), "steps": steps, "has_google": bool(gsession()), "has_ga4": bool(GA4)})


if __name__ == "__main__":
    sys.exit(main())
