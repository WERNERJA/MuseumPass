#!/usr/bin/env python3
"""
MuseumPass Maandelijkse Database Update
Scrapet alle musea van museumpassmusees.be en synchroniseert met Firebase Firestore.
"""

import json
import re
import sys
import time
import base64
import os
import argparse
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import requests

# ── Configuratie ──────────────────────────────────────────────────────────────

WEBSITE_BASE = "https://www.museumpassmusees.be"
LISTING_URL  = f"{WEBSITE_BASE}/nl/aanbod?activeCategory=museum&sort=alphabetically"
FIREBASE_PROJECT = "museumpass-b3f1b"
FIRESTORE_COLLECTION = "musea"
DEFAULT_CREDENTIALS_PATH = os.path.expanduser(
    "~/Documents/Claude/Scheduled/MuseumPass/MuseumPass Musea/"
    "museumpass-b3f1b-firebase-adminsdk-fbsvc-e085b42cde.json"
)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "nl-BE,nl;q=0.9,fr;q=0.8,en;q=0.7",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

MUSEUM_PATH_RE = re.compile(
    r'(?:https?://www\.museumpassmusees\.be)?'
    r'(/(?:nl/museum|fr/mus(?:ee|ée))[^\s"\'>,\]\[{}\\]+)',
    re.IGNORECASE,
)


# ── Stap 1: Web scraping ───────────────────────────────────────────────────────

def fetch_all_museum_urls(session: requests.Session) -> list[str]:
    """Haalt alle museum-URLs op via sitemap, Nuxt data of HTML-paginering."""
    print("Ophalen van museumlijst...")

    # Methode 1: Sitemap
    urls = _try_sitemap(session)
    if urls:
        print(f"  Totaal unieke museum-URLs via sitemap: {len(urls)}")
        return urls

    # Methode 2 & 3: Listing-pagina (Nuxt data + brede HTML)
    print("  Sitemap niet beschikbaar, ophalen van listing-pagina...")
    try:
        resp = session.get(LISTING_URL, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        html = resp.text
    except Exception as e:
        print(f"  FOUT bij ophalen listing-pagina: {e}")
        return []

    # Methode 2: Nuxt __NUXT_DATA__ JSON
    urls = _extract_from_nuxt_data(html)
    if urls:
        print(f"  {len(urls)} museum-URLs uit Nuxt data")
        return urls

    # Methode 3: Brede zoekactie naar museum-paden in volledige HTML
    urls = _extract_museum_paths_broad(html)
    if urls:
        print(f"  {len(urls)} museum-URLs via brede HTML-zoekactie")
        return _paginate_html(session, urls)

    # Methode 4: API-paginering
    print("  Probeer API-endpoints...")
    return _try_api_pagination(session, html)


def _try_sitemap(session: requests.Session) -> list[str]:
    candidates = [
        f"{WEBSITE_BASE}/sitemap.xml",
        f"{WEBSITE_BASE}/sitemap_index.xml",
        f"{WEBSITE_BASE}/nl/sitemap.xml",
        f"{WEBSITE_BASE}/sitemap-museums.xml",
    ]
    for sitemap_url in candidates:
        try:
            r = session.get(sitemap_url, headers=HEADERS, timeout=15)
            if r.status_code != 200:
                continue
            content = r.text
            sub_sitemaps = re.findall(
                r'<loc>([^<]+sitemap[^<]*\.xml[^<]*)</loc>', content, re.IGNORECASE
            )
            if sub_sitemaps:
                print(f"  Sitemap-index: {len(sub_sitemaps)} sub-sitemaps")
                all_urls: list[str] = []
                for sub in sub_sitemaps:
                    try:
                        r2 = session.get(sub.strip(), headers=HEADERS, timeout=15)
                        if r2.status_code == 200:
                            all_urls.extend(_museum_urls_from_sitemap(r2.text))
                    except Exception:
                        continue
                if all_urls:
                    return list(dict.fromkeys(all_urls))
            found = _museum_urls_from_sitemap(content)
            if found:
                print(f"  Sitemap gevonden: {sitemap_url}")
                return list(dict.fromkeys(found))
        except Exception:
            continue
    return []


def _museum_urls_from_sitemap(xml: str) -> list[str]:
    locs = re.findall(r'<loc>([^<]+)</loc>', xml)
    return [
        loc.strip() for loc in locs
        if re.search(r'/(?:nl/museum|fr/mus(?:ee|ée))/', loc, re.IGNORECASE)
    ]


def _extract_from_nuxt_data(html: str) -> list[str]:
    patterns = [
        r'<script[^>]*id=["\']__NUXT_DATA__["\'][^>]*>([\s\S]*?)</script>',
        r'window\.__nuxt__\s*=\s*([\s\S]*?)</script>',
        r'window\.__NUXT__\s*=\s*(\{[\s\S]*?\})\s*;?\s*</script>',
    ]
    for pat in patterns:
        m = re.search(pat, html, re.IGNORECASE)
        if not m:
            continue
        raw = m.group(1).strip()
        found = list(dict.fromkeys(
            urljoin(WEBSITE_BASE, p) for p in MUSEUM_PATH_RE.findall(raw)
        ))
        if found:
            return found
    return []


def _extract_museum_paths_broad(html: str) -> list[str]:
    return list(dict.fromkeys(
        urljoin(WEBSITE_BASE, p) for p in MUSEUM_PATH_RE.findall(html)
    ))


def _paginate_html(session: requests.Session, initial_urls: list[str]) -> list[str]:
    urls = list(initial_urls)
    for p in range(2, 25):
        try:
            r = session.get(f"{LISTING_URL}&page={p}", headers=HEADERS, timeout=20)
            if r.status_code != 200:
                break
            new = _extract_museum_paths_broad(r.text)
            if not new or all(u in urls for u in new):
                break
            added = [u for u in new if u not in urls]
            urls.extend(added)
            print(f"  Pagina {p}: +{len(added)} musea")
            time.sleep(0.5)
        except Exception as e:
            print(f"  Waarschuwing pagina {p}: {e}")
            break
    return list(dict.fromkeys(urls))


def _try_api_pagination(session: requests.Session, html: str) -> list[str]:
    total_match = re.search(r'"total"\s*:\s*(\d+)', html)
    per_page_match = re.search(r'"perPage"\s*:\s*(\d+)', html)
    total_pages = 20
    if total_match and per_page_match:
        total = int(total_match.group(1))
        per_page = int(per_page_match.group(1))
        total_pages = (total + per_page - 1) // per_page

    api_patterns = [
        f"{WEBSITE_BASE}/api/museums?category=museum&sort=alphabetically&page={{page}}",
        f"{WEBSITE_BASE}/api/aanbod?activeCategory=museum&sort=alphabetically&page={{page}}",
        f"{WEBSITE_BASE}/_nuxt/api/aanbod?activeCategory=museum&sort=alphabetically&page={{page}}",
    ]
    urls: list[str] = []
    for pattern in api_patterns:
        try:
            r = session.get(
                pattern.format(page=1),
                headers={**HEADERS, "Accept": "application/json"},
                timeout=15,
            )
            if r.status_code == 200 and "application/json" in r.headers.get("content-type", ""):
                items = _extract_urls_from_json(r.json())
                if items:
                    print(f"  API-patroon: {pattern}")
                    urls.extend(items)
                    for p in range(2, total_pages + 1):
                        r2 = session.get(
                            pattern.format(page=p),
                            headers={**HEADERS, "Accept": "application/json"},
                            timeout=15,
                        )
                        if r2.status_code != 200:
                            break
                        more = _extract_urls_from_json(r2.json())
                        if not more:
                            break
                        urls.extend(more)
                        time.sleep(0.3)
                    break
        except Exception:
            continue

    if not urls:
        return []
    return list(dict.fromkeys(
        u if u.startswith("http") else urljoin(WEBSITE_BASE, u)
        for u in urls
    ))


def _extract_urls_from_json(data) -> list[str]:
    urls = []
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                for key in ("url", "slug", "path", "link", "href"):
                    if key in item:
                        urls.append(item[key])
    elif isinstance(data, dict):
        for key in ("data", "items", "museums", "results"):
            if key in data:
                return _extract_urls_from_json(data[key])
    return urls


def scrape_museum(session: requests.Session, url: str) -> dict | None:
    try:
        r = session.get(url, headers=HEADERS, timeout=20)
        r.raise_for_status()
    except Exception as e:
        print(f"  Fout bij ophalen {url}: {e}")
        return None
    return extract_museum_data(r.text, url)


def extract_museum_data(html: str, museumpass_url: str) -> dict:
    clean = re.sub(r'<(script|style|noscript)[^>]*>[\s\S]*?</\1>', ' ', html, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', ' ', clean)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n\s*\n', '\n', text).strip()

    h1_match = re.search(r'<h1[^>]*>([\s\S]*?)</h1>', html, re.IGNORECASE)
    naam = re.sub(r'<[^>]+>', '', h1_match.group(1)).strip() if h1_match else ''

    omschrijving = ''
    jd_match = re.search(r'"description"\s*:\s*"((?:[^"\\]|\\.)*)"', html)
    if jd_match:
        omschrijving = (jd_match.group(1).replace('\\"', '"').replace('\\n', ' ').strip())

    openingsuren = ''
    oh_match = re.search(
        r'Openingsuren\s*\n+([\s\S]{5,400}?)\s*\n\s*(?:Locatie|Faciliteiten|Contact|Meer info)', text
    )
    if oh_match:
        openingsuren = re.sub(r'^\s+|\s+$', '', oh_match.group(1), flags=re.MULTILINE)
        openingsuren = re.sub(r'\n{3,}', '\n', openingsuren).strip()

    straat = huisnummer = postcode = gemeente = ''
    spans = re.findall(r'<span[^>]*>([\s\S]*?)</span>', html, re.IGNORECASE)
    span_texts = [re.sub(r'<[^>]+>', '', s).strip() for s in spans]
    span_texts = [s for s in span_texts if s]
    for i in range(len(span_texts) - 2):
        if re.match(r'^\d{4}$', span_texts[i + 1]):
            sp = re.match(r'^(.+?)\s+(\d+[\w\s/\-]*)$', span_texts[i])
            if sp:
                straat = sp.group(1)
                huisnummer = sp.group(2).strip()
                postcode = span_texts[i + 1]
                gemeente = span_texts[i + 2] if i + 2 < len(span_texts) else ''
                break

    tel_match = re.search(r'href="tel:([^"]+)"[^>]*>(.*?)</a>', html, re.IGNORECASE)
    tel = re.sub(r'<[^>]+>', '', tel_match.group(2)).strip() if tel_match else ''

    mail_match = re.search(r'href="mailto:([^"]+)"[^>]*>(.*?)</a>', html, re.IGNORECASE)
    mail = re.sub(r'<[^>]+>', '', mail_match.group(2)).strip() if mail_match else ''

    url_museum = ''
    excluded = re.compile(r'museumpass|google|facebook|twitter|instagram|apple\.com|apps\.apple|linkedin', re.I)
    for m in re.finditer(r'href="(https://[^"]+)"', html):
        href = m.group(1)
        if not excluded.search(href) and urlparse(href).netloc not in ("", "www.museumpassmusees.be"):
            url_museum = href
            break

    return {
        "naam": naam, "omschrijving": omschrijving, "openingsuren": openingsuren,
        "straat": straat, "huisnummer": huisnummer, "postcode": postcode,
        "gemeente": gemeente, "tel": tel, "mail": mail,
        "url_museum": url_museum, "museumpass_url": museumpass_url,
    }


# ── Stap 2: Firebase JWT authenticatie ────────────────────────────────────────

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def _rs256_sign(msg: str, private_key_pem: str) -> bytes:
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding as asym_padding
        key = serialization.load_pem_private_key(private_key_pem.encode(), password=None)
        return key.sign(msg.encode(), asym_padding.PKCS1v15(), hashes.SHA256())
    except Exception:
        pass
    import rsa as _rsa
    private_key = _rsa.PrivateKey.load_pkcs1(private_key_pem.encode())
    return _rsa.sign(msg.encode(), private_key, "SHA-256")


def create_jwt(credentials: dict) -> str:
    now = int(datetime.now(timezone.utc).timestamp())
    header = {"alg": "RS256", "typ": "JWT"}
    payload = {
        "iss": credentials["client_email"], "sub": credentials["client_email"],
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now, "exp": now + 3600,
        "scope": "https://www.googleapis.com/auth/datastore",
    }
    header_b64  = _b64url(json.dumps(header, separators=(",", ":")).encode())
    payload_b64 = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header_b64}.{payload_b64}"
    return f"{signing_input}.{_b64url(_rs256_sign(signing_input, credentials['private_key']))}"


def get_access_token(credentials: dict) -> str:
    print("Firebase-authenticatie...")
    jwt_token = create_jwt(credentials)
    resp = requests.post(
        "https://oauth2.googleapis.com/token",
        data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": jwt_token},
        timeout=30,
    )
    resp.raise_for_status()
    print("  Authenticatie geslaagd.")
    return resp.json()["access_token"]


# ── Stap 3: Firestore ophalen ──────────────────────────────────────────────────

FIRESTORE_BASE = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT}/databases/(default)/documents"


def fetch_existing_documents(access_token: str) -> dict[str, dict]:
    print(f"Ophalen van bestaande Firestore-documenten ({FIRESTORE_COLLECTION})...")
    auth_headers = {"Authorization": f"Bearer {access_token}"}
    existing: dict[str, dict] = {}
    page_token = None
    while True:
        url = f"{FIRESTORE_BASE}/{FIRESTORE_COLLECTION}?pageSize=300"
        if page_token:
            url += f"&pageToken={page_token}"
        resp = requests.get(url, headers=auth_headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        for doc in data.get("documents", []):
            fields = doc.get("fields", {})
            mp_url = fields.get("museumpass_url", {}).get("stringValue", "")
            if mp_url:
                existing[mp_url] = {
                    "doc_name": doc["name"],
                    "al_bezocht": fields.get("al_bezocht", {}).get("booleanValue", False),
                }
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    print(f"  {len(existing)} bestaande documenten gevonden.")
    return existing


# ── Stap 4: Upsert naar Firestore ─────────────────────────────────────────────

def to_firestore_fields(museum: dict, al_bezocht: bool) -> dict:
    return {
        "naam":           {"stringValue": museum.get("naam", "")},
        "omschrijving":   {"stringValue": museum.get("omschrijving", "")},
        "openingsuren":   {"stringValue": museum.get("openingsuren", "")},
        "straat":         {"stringValue": museum.get("straat", "")},
        "huisnummer":     {"stringValue": museum.get("huisnummer", "")},
        "postcode":       {"stringValue": museum.get("postcode", "")},
        "gemeente":       {"stringValue": museum.get("gemeente", "")},
        "tel":            {"stringValue": museum.get("tel", "")},
        "mail":           {"stringValue": museum.get("mail", "")},
        "url_museum":     {"stringValue": museum.get("url_museum", "")},
        "museumpass_url": {"stringValue": museum.get("museumpass_url", "")},
        "al_bezocht":     {"booleanValue": al_bezocht},
    }


def upsert_museums(museums: list[dict], existing: dict[str, dict], access_token: str) -> tuple[int, int, int]:
    auth_headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    BATCH_SIZE = 20
    updated = new = errors = 0
    for i in range(0, len(museums), BATCH_SIZE):
        writes = []
        for museum in museums[i : i + BATCH_SIZE]:
            mp_url = museum.get("museumpass_url", "")
            if not mp_url:
                continue
            if mp_url in existing:
                fields = to_firestore_fields(museum, existing[mp_url]["al_bezocht"])
                writes.append({
                    "update": {"name": existing[mp_url]["doc_name"], "fields": fields},
                    "updateMask": {"fieldPaths": [k for k in fields if k != "al_bezocht"]},
                })
                updated += 1
            else:
                doc_id = re.sub(r'[^a-zA-Z0-9_\-]', '_', re.sub(r'https?://', '', mp_url))[:500]
                writes.append({
                    "update": {
                        "name": f"{FIRESTORE_BASE}/{FIRESTORE_COLLECTION}/{doc_id}",
                        "fields": to_firestore_fields(museum, False),
                    },
                })
                new += 1
        if not writes:
            continue
        resp = requests.post(
            f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT}"
            f"/databases/(default)/documents:batchWrite",
            headers=auth_headers, json={"writes": writes}, timeout=60,
        )
        if resp.status_code != 200:
            print(f"  Batch {i//BATCH_SIZE + 1} mislukt (HTTP {resp.status_code}): {resp.text[:200]}")
            errors += len(writes)
        else:
            failed = sum(1 for wr in resp.json().get("writeResults", []) if "updateTime" not in wr)
            if failed:
                errors += failed
        time.sleep(0.1)
    return updated, new, errors


# ── Hoofdprogramma ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="MuseumPass Firestore update")
    parser.add_argument("--credentials", default=DEFAULT_CREDENTIALS_PATH)
    parser.add_argument("--max-museums", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    start = time.time()
    print("=" * 60)
    print("MuseumPass Database Update")
    print(f"Gestart: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    creds_path = args.credentials
    if not os.path.exists(creds_path):
        print(f"FOUT: Credentials-bestand niet gevonden: {creds_path}")
        sys.exit(1)
    with open(creds_path) as f:
        raw = f.read().strip()
    if not raw:
        print("FOUT: Credentials-bestand is leeg. Controleer FIREBASE_CREDENTIALS secret.")
        sys.exit(1)
    try:
        credentials = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"FOUT: Geen geldig JSON: {e}")
        sys.exit(1)

    session = requests.Session()
    session.headers.update(HEADERS)

    print("\nSTAP 1: Scrapen van musea")
    print("-" * 40)
    museum_urls = fetch_all_museum_urls(session)
    if args.max_museums:
        museum_urls = museum_urls[:args.max_museums]

    print(f"\nScrapen van {len(museum_urls)} museumpagina's...")
    museums: list[dict] = []
    scrape_errors = 0
    for idx, url in enumerate(museum_urls, 1):
        if idx % 10 == 0 or idx == len(museum_urls):
            print(f"  {idx}/{len(museum_urls)} gescraped...", end="\r")
        m = scrape_museum(session, url)
        if m:
            museums.append(m)
        else:
            scrape_errors += 1
        time.sleep(0.2)

    print(f"\n  {len(museums)} musea gescraped, {scrape_errors} fouten")
    if not museums:
        print("FOUT: Geen museumdata. Script stopt.")
        sys.exit(1)

    if args.dry_run:
        print("\nDRY-RUN:")
        print(json.dumps(museums[0], indent=2, ensure_ascii=False))
        sys.exit(0)

    print("\nSTAP 2: Firebase authenticatie")
    print("-" * 40)
    access_token = get_access_token(credentials)

    print("\nSTAP 3: Bestaande Firestore-data")
    print("-" * 40)
    existing = fetch_existing_documents(access_token)

    print("\nSTAP 4: Upsert naar Firestore")
    print("-" * 40)
    updated, new, write_errors = upsert_museums(museums, existing, access_token)

    elapsed = time.time() - start
    print("\n" + "=" * 60)
    print("SAMENVATTING")
    print("=" * 60)
    print(f"  Totaal gescraped:             {len(museums)}")
    print(f"  Bestaande records bijgewerkt: {updated}")
    print(f"  Nieuwe musea toegevoegd:      {new}")
    print(f"  Scrape-fouten:                {scrape_errors}")
    print(f"  Schrijffouten:                {write_errors}")
    print(f"  Tijd:                         {elapsed:.1f}s")
    print("=" * 60)

    if write_errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
