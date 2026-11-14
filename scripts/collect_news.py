"""Collects the latest headlines from Portuguese news outlets' public RSS feeds.

Writes news.json with one list per section. Only the headline, a short excerpt from the
feed, the source, the time and the link are kept: the full article stays on the outlet's site.

Usage: python3 scripts/collect_news.py out/news.json
"""
import html
import json
import re
import sys
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime

SECTIONS = {
    "portugal": "Portugal & Mundo",
    "economia": "Economia & Trabalho",
    "tecnologia": "Tecnologia & Ciência",
    "desporto": "Desporto",
}

# (source name, feed URL, section). "auto" sorts each story by its own category labels / link path,
# and skips stories that fit none of the sections (culture, lifestyle, radio shows…).
FEEDS = [
    ("RTP Notícias", "https://www.rtp.pt/noticias/rss", "auto"),
    ("Observador", "https://observador.pt/feed/", "auto"),
    ("Expresso", "https://feeds.feedburner.com/expresso-geral", "auto"),
    ("Público", "https://feeds.feedburner.com/PublicoRSS", "auto"),
    ("ECO", "https://eco.sapo.pt/feed/", "economia"),
    ("Jornal de Negócios", "https://www.jornaldenegocios.pt/rss", "economia"),
    ("O Jornal Económico", "https://jornaleconomico.sapo.pt/feed", "economia"),
    ("Pplware", "https://pplware.sapo.pt/feed/", "tecnologia"),
    ("Record", "https://www.record.pt/rss", "desporto"),
]

# For "auto" feeds, checked in this order: words in a story's categories or link path.
AUTO_RULES = [
    ("desporto", ["desporto", "futebol", "modalidades", "motores", "tenis", "ciclismo", "atletismo", "basquetebol", "andebol", "futsal"]),
    ("economia", ["economia", "trabalho", "emprego", "negocios", "financas", "empresas", "mercados", "impostos",
                  "orcamento do estado", "banca", "imobiliario", "dinheiro", "salarios", "pensoes"]),
    ("tecnologia", ["ciencia", "tecnologia", "inovacao", "inteligencia artificial", "espaco", "internet",
                    "digital", "startups", "astronomia", "tech"]),
    ("portugal", ["pais", "mundo", "politica", "sociedade", "europa", "uniao europeia", "justica", "local", "nacional",
                  "internacional", "saude", "educacao", "habitacao", "ambiente", "africa", "america", "asia",
                  "guerra", "ucrania", "eleicoes", "governo", "parlamento", "lisboa", "porto"]),
]

MAX_PER_SECTION = 40
MAX_AGE = timedelta(hours=48)
SKIP_LINK = re.compile(r"/(opiniao|opinion|cronica|cronicas|podcast|podcasts|programas|video|videos|fotogaleria|publicidade|patrocinado|em-direto)/|-em-direto\b", re.I)
UA = "Proximo-news/1.0 (+https://github.com/sandro91145/proximo)"


def plain(s, limit=None):
    s = s or ""
    for _ in range(2):  # some feeds escape CDATA or HTML twice
        s = re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", html.unescape(s), flags=re.S)
    s = html.unescape(re.sub(r"<[^>]+>", " ", s))
    s = re.sub(r"\s+", " ", s).strip()
    if limit and len(s) > limit:
        s = s[:limit].rsplit(" ", 1)[0].rstrip(".,;:–- ") + "…"
    return s


def fold(s):
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]+", " ", s)


def local(tag):
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def child_text(node, *names):
    for c in node:
        if local(c.tag) in names and (c.text or "").strip():
            return c.text.strip()
    return ""


def parse_date(s):
    s = (s or "").strip()
    if not s:
        return None
    s = re.sub(r"\s(Z|UT|UTC)$", " +0000", s)  # e.g. "Fri, 13 Nov 2026 20:17:00 Z"
    try:
        d = parsedate_to_datetime(s)          # RSS: "Sat, 14 Nov 2026 06:14:13 +0000"
    except (TypeError, ValueError):
        try:
            d = datetime.fromisoformat(s.replace("Z", "+00:00"))  # Atom: ISO 8601
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc)


def fetch_entries(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8"})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = r.read()
    root = ET.fromstring(data)
    entries = []
    for node in root.iter():
        kind = local(node.tag)
        if kind not in ("item", "entry"):
            continue
        link = child_text(node, "link")
        if not link:  # Atom: <link href="..." rel="alternate"/>
            for c in node:
                if local(c.tag) == "link" and c.get("href") and c.get("rel", "alternate") == "alternate":
                    link = c.get("href"); break
        cats = []
        for c in node:
            if local(c.tag) == "category":
                cats.append((c.text or c.get("term") or "").strip())
        entries.append({
            "title": child_text(node, "title"),
            "link": link,
            "summary": child_text(node, "description", "summary", "encoded", "content"),
            "date": parse_date(child_text(node, "pubDate", "published", "updated", "date")),
            "categories": cats,
        })
    return entries


def auto_section(entry):
    text = fold(" ".join(entry["categories"] + [entry["link"]]))
    for section, words in AUTO_RULES:
        if any(re.search(r"\b" + w + r"\b", text) for w in words):
            return section
    return None


def main(out_path):
    now = datetime.now(timezone.utc)
    items = {k: [] for k in SECTIONS}
    report = []
    for source, url, section in FEEDS:
        try:
            entries = fetch_entries(url)
            if not entries:
                raise ValueError("no entries")
        except Exception as e:  # one broken feed must not stop the others
            report.append({"source": source, "url": url, "ok": False, "error": str(e)[:200]})
            print(f"FAIL  {source:20} {url}  {e}")
            continue
        kept = 0
        for en in entries:
            link = (en["link"] or "").strip()
            title = plain(en["title"])
            if not link.startswith("http") or not title or SKIP_LINK.search(link):
                continue
            sec = auto_section(en) if section == "auto" else section
            if sec not in items:
                continue
            ts = en["date"]
            if ts and (now - ts > MAX_AGE or ts - now > timedelta(hours=2)):
                continue
            items[sec].append({
                "title": title,
                "link": link,
                "source": source,
                "time": ts.replace(microsecond=0).isoformat().replace("+00:00", "Z") if ts else None,
                "summary": plain(en["summary"], 220),
            })
            kept += 1
        report.append({"source": source, "url": url, "ok": True, "entries": len(entries), "kept": kept})
        print(f"OK    {source:20} {url}  entries={len(entries)} kept={kept}")

    out = {"updated": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"), "sections": {}, "feeds": report}
    for sec, lst in items.items():
        seen_links, seen_titles, clean = set(), set(), []
        lst.sort(key=lambda x: x["time"] or "", reverse=True)
        for it in lst:
            key_t = " ".join(fold(it["title"]).split()[:8])
            if it["link"] in seen_links or key_t in seen_titles:
                continue
            seen_links.add(it["link"]); seen_titles.add(key_t)
            if it["summary"] and fold(it["summary"]).startswith(fold(it["title"])[:40]):
                it["summary"] = ""  # excerpt that only repeats the headline
            clean.append(it)
        out["sections"][sec] = {"name": SECTIONS[sec], "items": clean[:MAX_PER_SECTION]}
        print(f"SECTION {sec}: {len(clean[:MAX_PER_SECTION])} items")

    total = sum(len(s["items"]) for s in out["sections"].values())
    if total == 0:
        print("No items at all: keeping the previous file.")
        sys.exit(1)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "news.json")
