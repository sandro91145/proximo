"""Collects the latest headlines from Portuguese news outlets' public RSS feeds.

Writes news.json with one list per section. Only the headline, a short excerpt from the
feed, the source, the time and the link are kept: the full article stays on the outlet's site.

Usage: python3 scripts/collect_news.py out/news.json
"""
import html
import json
import re
import os
import sys
import time
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

# Only outlets that can be read without paying. Removed for paywalls: Expresso, Público, Jornal de Negócios.
# Tried and left out: TSF (blocks feed readers), Shifter (essays, rarely updated), Ciência Viva (broken feed),
# 4gnews (mostly deals), Exame Informática (feed stale), Renascença and O Jogo (block feed readers).
# (source name, feed URL, section). "auto" sorts each story by its own category labels / link path,
# and skips stories that fit none of the sections (culture, lifestyle, radio shows…).
# "auto:portugal" does the same but puts stories that fit no section under Portugal & Mundo
# (for general news feeds with few or no labels).
FEEDS = [
    ("RTP Notícias", "https://www.rtp.pt/noticias/rss", "auto"),
    ("Observador", "https://observador.pt/feed/", "auto"),
    ("SIC Notícias", "http://feeds.feedburner.com/sicnoticias-ultimas", "auto:portugal"),
    ("CNN Portugal", "https://cnnportugal.iol.pt/rss", "auto:portugal"),
    ("SAPO 24", "https://24.sapo.pt/rss", "auto"),
    ("ECO", "https://eco.sapo.pt/feed/", "economia"),
    ("O Jornal Económico", "https://jornaleconomico.sapo.pt/feed", "economia"),
    ("Pplware", "https://pplware.sapo.pt/feed/", "tecnologia"),
    ("SAPO Tek", "https://tek.sapo.pt/rss", "tecnologia"),
    ("Record", "https://www.record.pt/rss", "desporto"),
]

# For "auto" feeds, checked in this order: words in a story's categories or link path.
AUTO_RULES = [
    ("desporto", ["desporto", "futebol", "modalidades", "motores", "tenis", "ciclismo", "atletismo", "basquetebol", "andebol", "futsal"]),
    ("economia", ["economia", "trabalho", "emprego", "negocios", "financas", "empresas", "mercados", "impostos",
                  "orcamento do estado", "banca", "imobiliario", "dinheiro", "salarios", "pensoes"]),
    ("tecnologia", ["ciencia", "tecnologia", "inovacao", "inteligencia artificial", "espacial", "nasa", "internet",
                    "digital", "startups", "astronomia", "tech"]),
    ("portugal", ["pais", "mundo", "politica", "sociedade", "europa", "uniao europeia", "justica", "local", "nacional",
                  "internacional", "atualidade", "saude", "educacao", "habitacao", "ambiente", "africa", "america", "asia",
                  "guerra", "ucrania", "eleicoes", "governo", "parlamento", "lisboa", "porto"]),
]

MAX_PER_SECTION = 40
OG_PER_SECTION = 14   # look up missing pictures for this many stories per section…
OG_BUDGET = 45        # …and at most this many article pages per run
MAX_AGE = timedelta(hours=48)
SKIP_LINK = re.compile(r"/(extras|opiniao|opinion|cronica|cronicas|podcast|podcasts|programas|video|videos|fotogaleria|publicidade|patrocinado|em-direto)/|-em-direto\b", re.I)
# Paid articles of mostly free outlets: Observador's and ECO's subscriber sections, and items whose feed
# content says they're for subscribers only (ECO marks these).
PAYWALL_LINK = re.compile(r"(observador\.pt|eco\.sapo\.pt)/(especiais|explicadores|fact-check|factcheck)/", re.I)
PAYWALL_TEXT = re.compile(r"exclusiv[oa] (para|a) assinantes|exclusivo assinantes|premium-paywall|s[oó] para assinantes", re.I)
# Shopping deals and sponsored posts aren't news.
SKIP_TITLE = re.compile(r"\bquiz\b|black friday|cyber monday|cup[aã]o|c[oó]digo promocional|desconto|promo[cç][aã]o|aproveite|oferta especial|patrocinad", re.I)
# Boilerplate some feeds put at the start of the excerpt.
JUNK_SUMMARY = re.compile(r"^(se est[aá] a ler esta not[ií]cia numa app[^.]*\.?|leia mais[^.]*\.?)\s*", re.I)
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


IMG_EXT = re.compile(r"\.(jpe?g|png|webp|gif|avif)(\?|$)", re.I)


BAD_IMG = re.compile(r"(pixel|tracker|feedburner\.com/~|gravatar|/emoji/|spacer|1x1|/default_|logo)", re.I)
# Thumbnails too small to lead a section: a larger picture is looked up on the article page.
SMALL_IMG = re.compile(r"img\.iol\.pt/image/id/[^/]+/\d{2,3}(\.\w+)?$|img_\d{2,3}x\d{2,3}", re.I)


def clean_img(u):
    u = html.unescape((u or "").strip())
    if u.startswith("//"):
        u = "https:" + u
    if u.startswith("http://"):
        u = "https://" + u[7:]  # the app is served over https; plain http images would be blocked
    if not u.startswith("https://") or BAD_IMG.search(u):
        return None
    if "cdn-images.rtp.pt" in u:
        u = re.sub(r"([?&])w=\d+", r"\g<1>w=800", u)  # RTP's feed asks for 350 px wide; same picture, larger
    return u


def find_image(node, raw):
    """The picture the outlet attached to the story in its feed (https only), or None."""
    found = []
    for c in node.iter():
        tag = local(c.tag)
        url = c.get("url") or c.get("href") or ""
        text = (c.text or "").strip()
        if tag in ("content", "thumbnail") and url:  # media:content / media:thumbnail
            medium, typ = (c.get("medium") or ""), (c.get("type") or "")
            if medium == "image" or typ.startswith("image") or tag == "thumbnail" or IMG_EXT.search(url):
                found.append(url)
        elif tag == "enclosure" and url and ((c.get("type") or "").startswith("image") or IMG_EXT.search(url)):
            found.append(url)
        elif tag == "link" and c.get("rel") == "enclosure" and (c.get("type") or "").startswith("image") and url:
            found.append(url)
        elif tag not in ("link", "guid", "comments", "description", "encoded", "summary") and text.startswith("http") \
                and " " not in text and (tag in ("image", "img", "url") or IMG_EXT.search(text)):
            found.append(text)  # <image>url</image>, <image><url>…</url></image>
    m = re.search(r"<img[^>]+src=[\"']([^\"']+)[\"']", html.unescape(raw or ""), re.I)
    if m:
        found.append(m.group(1))
    for u in found:
        u = clean_img(u)
        if u:
            return u
    return None


OG_RE = re.compile(
    r"<meta[^>]+(?:property|name)=[\"'](?:og:image(?::secure_url)?|twitter:image)[\"'][^>]*?content=[\"']([^\"']+)[\"']"
    r"|<meta[^>]+content=[\"']([^\"']+)[\"'][^>]*?(?:property|name)=[\"'](?:og:image(?::secure_url)?|twitter:image)[\"']", re.I)


def og_image(link):
    """The sharing picture (og:image) an article page declares, or '' if none / unreachable."""
    try:
        req = urllib.request.Request(link, headers={"User-Agent": UA, "Accept": "text/html"})
        with urllib.request.urlopen(req, timeout=10) as r:
            head = r.read(300_000).decode("utf-8", "ignore")
        m = OG_RE.search(head)
        return clean_img(m.group(1) or m.group(2)) or "" if m else ""
    except Exception:
        return ""


def previous_og():
    """Pictures already looked up in the last run, so each article page is only fetched once."""
    repo = os.environ.get("GITHUB_REPOSITORY", "sandro91145/proximo")
    try:
        req = urllib.request.Request(f"https://raw.githubusercontent.com/{repo}/news-data/news.json", headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.load(r).get("og", {}) or {}
    except Exception:
        return {}


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
        raw = " ".join((c.text or "") for c in node if local(c.tag) in ("description", "summary", "encoded", "content"))
        entries.append({
            "raw": raw,
            "title": child_text(node, "title"),
            "link": link,
            "summary": child_text(node, "description", "summary", "encoded", "content"),
            "date": parse_date(child_text(node, "pubDate", "published", "updated", "date")),
            "categories": cats,
            "image": find_image(node, raw),
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
            if not link.startswith("http") or not title or SKIP_LINK.search(link) or SKIP_TITLE.search(title):
                continue
            if PAYWALL_LINK.search(link) or PAYWALL_TEXT.search(en["raw"]) or PAYWALL_TEXT.search(title):
                continue
            if any(fold(c).strip() in ("opiniao", "opinion", "cronica", "publicidade", "conteudo patrocinado") for c in en["categories"]):
                continue
            if section.startswith("auto"):
                sec = auto_section(en) or (section.split(":", 1)[1] if ":" in section else None)
            else:
                sec = section
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
                "summary": plain(JUNK_SUMMARY.sub("", plain(en["summary"])), 220),
                "image": en["image"],
            })
            kept += 1
        with_img = sum(1 for en in entries if en["image"])
        report.append({"source": source, "url": url, "ok": True, "entries": len(entries), "kept": kept, "with_image": with_img})
        print(f"OK    {source:20} {url}  entries={len(entries)} kept={kept} images={with_img}")

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

    # Pictures for stories whose feed has none (or only a tiny thumbnail): read og:image from the article page.
    # Only the first stories of each section, at most OG_BUDGET new pages per run, remembered between runs.
    cache, og, budget = previous_og(), {}, OG_BUDGET
    for sec in out["sections"].values():
        for idx, it in enumerate(sec["items"]):
            if it["image"] and not SMALL_IMG.search(it["image"]):
                continue
            link = it["link"]
            if link in og:
                found = og[link]
            elif link in cache:
                found = cache[link]
            elif idx < OG_PER_SECTION and budget > 0:
                budget -= 1
                found = og_image(link)
                time.sleep(0.3)
            else:
                continue
            og[link] = found
            if found:
                it["image"] = found
    out["og"] = og
    print(f"PICTURES looked up: {OG_BUDGET - budget} new, {sum(1 for v in og.values() if v)} found of {len(og)} tried/remembered")
    for key, sec in out["sections"].items():
        print(f"IMAGES {key}: {sum(1 for i in sec['items'] if i['image'])}/{len(sec['items'])}")

    total = sum(len(s["items"]) for s in out["sections"].values())
    if total == 0:
        print("No items at all: keeping the previous file.")
        sys.exit(1)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "news.json")
