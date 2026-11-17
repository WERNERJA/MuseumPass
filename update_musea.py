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
import hashlib
import hmac
import struct
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

# ── Stap 1: Web scraping ───────────────────────────────────────────────────────
def fetch_all_museum_urls(session: requests.Session) -> list[str]:
    """Haalt alle museum-URLs op via Playwright (netwerk-interceptie + links)."""
    print("Ophalen van museumlijst via Playwright...")
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

        api_museum_urls: list[str] = []
        api_calls_seen: list[str] = []

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent=HEADERS["User-Agent"],
                locale="nl-BE",
            )
            page = context.new_page()

            # Intercept JSON responses to find the museum API
            def handle_response(response):
                url = response.url
                if "museumpassmusees.be" not in url:
                    return
                ct = response.headers.get("content-type", "")
                if "json" not in ct:
                    return
                api_calls_seen.append(url)
                try:
                    data = response.json()
                    extracted = _extract_museum_urls_from_json_deep(data)
                    if extracted:
                        print(f"  API museum-data gevonden: {url[:80]}")
                        api_museum_urls.extend(extracted)
                except Exception:
                    pass

            page.on("response", handle_response)

            page.goto(LISTING_URL, wait_until="networkidle", timeout=60000)

            # Click "Toon meer" to load all museums
            clicks = 0
            while clicks < 50:
                try:
                    btn = page.locator(
                        "button:has-text('Toon meer'), "
                        "button:has-text('Show more'), "
                        "button:has-text('Voir plus'), "
                        "[data-test*='load-more'], "
                        ".load-more"
                    ).first
                    btn.wait_for(state="visible", timeout=3000)
                    btn.click()
                    page.wait_for_load_state("networkidle", timeout=10000)
                    clicks += 1
                    print(f"  'Toon meer' geklikt ({clicks}x)...", end="\r")
                except PWTimeout:
                    break
                except Exception:
                    break
            print(f"\n  'Toon meer' {clicks}x geklikt")

            # Diagnostic: dump all site links
            all_anchors = page.eval_on_selector_all(
                "a[href]",
                "els => els.map(el => el.href)"
            )
            site_links = [h for h in all_anchors if "museumpassmusees.be" in h]
            unique_site_links = list(dict.fromkeys(site_links))
            print(f"  Alle site-links op pagina: {len(unique_site_links)}")
            for lnk in unique_site_links[:20]:
                print(f"    {lnk}")

            print(f"  API-aanroepen: {len(api_calls_seen)}")
            for u in api_calls_seen[:10]:
                print(f"    {u}")

            browser.close()

        # Use API-extracted URLs if available
        if api_museum_urls:
            unique = list(dict.fromkeys(api_museum_urls))
            print(f"  Totaal unieke museum-URLs (via API): {len(unique)}")
            return unique

        # Fallback: filter site links by path patterns
        museum_patterns = (
            "/nl/museum", "/fr/musee", "/nl/musea", "/fr/musees",
            "/nl/detail", "/fr/detail", "/nl/aanbod/", "/fr/offre/",
            "/nl/visit", "/fr/visit",
        )
        hrefs = [h for h in unique_site_links if any(p in h for p in museum_patterns)]
        print(f"  Totaal unieke museum-URLs (via links): {len(hrefs)}")
        return hrefs

    except ImportError:
        print("  Playwright niet beschikbaar, val terug op HTTP-scraping...")
        return _fetch_urls_http(session)


def _extract_museum_urls_from_json_deep(data, base: str = "https://www.museumpassmusees.be") -> list[str]:
    """Zoekt recursief museum-URLs in een JSON-structuur."""
    urls: list[str] = []
    if isinstance(data, dict):
        for key in ("items", "museums", "musea", "results", "data", "offers", "content"):
            if key in data:
                urls.extend(_extract_museum_urls_from_json_deep(data[key], base))
        for key in ("url", "slug", "path", "href", "link", "detailUrl", "detail_url", "museumUrl"):
            val = data.get(key)
            if isinstance(val, str) and val:
                full = val if val.startswith("http") else base + val
                if "museumpassmusees.be" in full:
                    urls.append(full)
    elif isinstance(data, list):
        for item in data:
            urls.extend(_extract_museum_urls_from_json_deep(item, base))
    return urls
    


def _fetch_urls_http(session: requests.Session) -> list[str]:
    """HTTP-fallback voor museum-URL-ophaling (werkt alleen bij SSR-pagina's)."""
    urls: list[str] = []
    resp = session.get(LISTING_URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    html = resp.text
    links = _extract_museum_links_from_html(html)
    urls.extend(links)
    print(f"  Initieel geladen: {len(links)} musea")

    total_match = re.search(r'"total"\s*:\s*(\d+)', html)
    per_page_match = re.search(r'"perPage"\s*:\s*(\d+)', html)
    total_pages = 20
    if total_match and per_page_match:
        total = int(total_match.group(1))
        per_page = int(per_page_match.group(1))
        total_pages = (total + per_page - 1) // per_page

    for p in range(2, total_pages + 1):
        page_url = f"{LISTING_URL}&page={p}"
        try:
            r = session.get(page_url, headers=HEADERS, timeout=20)
            if r.status_code != 200:
                break
            new_links = _extract_museum_links_from_html(r.text)
            if not new_links:
                break
            urls.extend(new_links)
            print(f"  Pagina {p}: +{len(new_links)} musea")
            time.sleep(0.5)
        except Exception as e:
            print(f"  Waarschuwing: pagina {p} mislukt: {e}")
            break

    unique_urls = list(dict.fromkeys(
        u if u.startswith("http") else urljoin(WEBSITE_BASE, u)
        for u in urls
        if "/museum/" in u or "/nl/museum" in u or "/fr/musee" in u
    ))
    print(f"  Totaal unieke museum-URLs: {len(unique_urls)}")
    return unique_urls


def _extract_museum_links_from_html(html: str) -> list[str]:
    pattern = r'href=["\']([^"\']*(?:/nl/museum|/fr/mus[ée]e|/museum/)[^"\']*)["\']'
    return list(dict.fromkeys(re.findall(pattern, html)))


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
        omschrijving = (jd_match.group(1)
                        .replace('\\"', '"')
                        .replace('\\n', ' ')
                        .strip())

    openingsuren = ''
    oh_match = re.search(
        r'Openingsuren\s*\n+([\s\S]{5,400}?)\s*\n\s*(?:Locatie|Faciliteiten|Contact|Meer info)',
        text
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
        "naam": naam,
        "omschrijving": omschrijving,
        "openingsuren": openingsuren,
        "straat": straat,
        "huisnummer": huisnummer,
        "postcode": postcode,
        "gemeente": gemeente,
        "tel": tel,
        "mail": mail,
        "url_museum": url_museum,
        "museumpass_url": museumpass_url,
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
        "iss": credentials["client_email"],
        "sub": credentials["client_email"],
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now,
        "exp": now + 3600,
        "scope": "https://www.googleapis.com/auth/datastore",
    }
    header_b64  = _b64url(json.dumps(header, separators=(",", ":")).encode())
    payload_b64 = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header_b64}.{payload_b64}"
    signature = _rs256_sign(signing_input, credentials["private_key"])
    return f"{signing_input}.{_b64url(signature)}"


def get_access_token(credentials: dict) -> str:
    print("Firebase-authenticatie...")
    jwt_token = create_jwt(credentials)
    resp = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": jwt_token,
        },
        timeout=30,
    )
    resp.raise_for_status()
    token = resp.json()["access_token"]
    print("  Authenticatie geslaagd.")
    return token


# ── Stap 3: Firestore ophalen ──────────────────────────────────────────────────

FIRESTORE_BASE     = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT}/databases/(default)/documents"
FIRESTORE_RESOURCE = f"projects/{FIREBASE_PROJECT}/databases/(default)/documents"


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
            mp_url = _fs_get_string(fields, "museumpass_url")
            if mp_url:
                existing[mp_url] = {
                    "doc_name":   doc["name"],
                    "al_bezocht": _fs_get_bool(fields, "al_bezocht"),
                    "naam":       _fs_get_string(fields, "naam"),
                    "gemeente":   _fs_get_string(fields, "gemeente"),
                }

        page_token = data.get("nextPageToken")
        if not page_token:
            break

    print(f"  {len(existing)} bestaande documenten gevonden.")
    return existing


def _fs_get_string(fields: dict, key: str) -> str:
    return fields.get(key, {}).get("stringValue", "")


def _fs_get_bool(fields: dict, key: str) -> bool:
    return fields.get(key, {}).get("booleanValue", False)


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


def match_by_museum_id(museums: list[dict], existing: dict[str, dict]) -> list[str]:
    """
    Zelfde museum-ID maar andere URL (naam gewijzigd) => hetzelfde museum.
    Het bestaande record wordt in `existing` onder de nieuwe URL gezet, zodat de
    upsert het bijwerkt (nieuwe naam/URL, al_bezocht blijft) i.p.v. een nieuw
    record aan te maken. Geeft een lijst 'oude naam -> nieuwe naam' terug.
    """
    scraped = {m.get("museumpass_url", "") for m in museums}
    # kandidaten: bestaande records waarvan de URL niet meer op de website staat
    by_id: dict[str, list[str]] = {}
    for url, d in existing.items():
        mid = _museum_id(url)
        if mid and url not in scraped:
            by_id.setdefault(mid, []).append(url)
    renamed: list[str] = []
    for m in museums:
        url = m.get("museumpass_url", "")
        if not url or url in existing:
            continue
        cands = by_id.pop(_museum_id(url), None)
        if not cands:
            continue
        # bij meerdere oude versies: neem een bezochte, de rest wordt later opgeruimd
        cands.sort(key=lambda u: not existing[u]["al_bezocht"])
        old = existing.pop(cands[0])
        existing[url] = old
        renamed.append(f"{old['naam'] or '?'} -> {m.get('naam', '?')}")
    return renamed


def upsert_museums(museums: list[dict], existing: dict[str, dict], access_token: str) -> tuple[int, int, int, list[dict]]:
    auth_headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    BATCH_SIZE = 20
    updated = new = errors = 0
    new_museums: list[dict] = []

    for i in range(0, len(museums), BATCH_SIZE):
        batch = museums[i : i + BATCH_SIZE]
        writes = []

        for museum in batch:
            mp_url = museum.get("museumpass_url", "")
            if not mp_url:
                continue

            if mp_url in existing:
                al_bezocht = existing[mp_url]["al_bezocht"]
                doc_name = existing[mp_url]["doc_name"]
                fields = to_firestore_fields(museum, al_bezocht)
                update_fields = [k for k in fields if k != "al_bezocht"]
                writes.append({
                    "update": {
                        "name":   doc_name,
                        "fields": fields,
                    },
                    "updateMask": {"fieldPaths": update_fields},
                })
                updated += 1
            else:
                doc_id = _safe_doc_id(mp_url)
                fields = to_firestore_fields(museum, False)
                writes.append({
                    "update": {
                        "name":   f"{FIRESTORE_RESOURCE}/{FIRESTORE_COLLECTION}/{doc_id}",
                        "fields": fields,
                    },
                })
                new += 1
                new_museums.append(museum)

        if not writes:
            continue

        resp = requests.post(
            f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT}"
            f"/databases/(default)/documents:batchWrite",
            headers=auth_headers,
            json={"writes": writes},
            timeout=60,
        )

        if resp.status_code != 200:
            print(f"  Batch {i//BATCH_SIZE + 1} mislukt (HTTP {resp.status_code}), individueel herproberen...")
            # Retry elke write afzonderlijk zodat 1 fout niet de hele batch blokkeert
            batch_errors = 0
            for w in writes:
                is_update = "updateMask" in w
                r2 = requests.post(
                    f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT}"
                    f"/databases/(default)/documents:batchWrite",
                    headers=auth_headers,
                    json={"writes": [w]},
                    timeout=30,
                )
                if r2.status_code != 200:
                    doc_name = w.get("update", {}).get("name", "?")
                    print(f"    Fout bij {doc_name[-80:]}: HTTP {r2.status_code} – {r2.text[:120]}")
                    errors += 1
                    if is_update:
                        updated -= 1
                    else:
                        new -= 1
                    batch_errors += 1
                time.sleep(0.05)
            if batch_errors:
                print(f"  {batch_errors} writes in batch {i//BATCH_SIZE + 1} definitief mislukt")
        else:
            write_results = resp.json().get("writeResults", [])
            failed = sum(1 for wr in write_results if "updateTime" not in wr)
            if failed:
                print(f"  {failed} writes in batch {i//BATCH_SIZE + 1} hadden geen updateTime")
                errors += failed

        time.sleep(0.1)

    return updated, new, errors, new_museums


# ── Stap 4b: Verouderde records opruimen ──────────────────────────────────────

def _norm_naam(naam: str) -> str:
    """Naam zonder toevoegingen tussen haakjes, bv. 'X (vanaf 02/11)' -> 'x'."""
    naam = re.sub(r'\s*\([^)]*\)', ' ', naam or '')
    return re.sub(r'\s+', ' ', naam).strip().lower()


_UUID_RE = re.compile(r'/museum/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', re.I)


def _museum_id(url: str) -> str:
    """Vaste museum-ID uit de museumpass-URL (verandert niet bij naamswijziging)."""
    m = _UUID_RE.search(url or '')
    return m.group(1).lower() if m else ''


def _batch_write(writes: list[dict], auth_headers: dict) -> int:
    """Voert writes uit in batches; geeft het aantal mislukte writes terug."""
    failed = 0
    for i in range(0, len(writes), 20):
        chunk = writes[i : i + 20]
        resp = requests.post(
            f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT}"
            f"/databases/(default)/documents:batchWrite",
            headers=auth_headers,
            json={"writes": chunk},
            timeout=60,
        )
        if resp.status_code != 200:
            print(f"    Batch mislukt (HTTP {resp.status_code}): {resp.text[:200]}")
            failed += len(chunk)
            continue
        for st in resp.json().get("status", []):
            if st.get("code", 0) != 0:
                print(f"    Write mislukt: {st.get('message', '')[:200]}")
                failed += 1
        time.sleep(0.1)
    return failed


def prune_stale(museums: list[dict], existing: dict[str, dict], access_token: str,
                scrape_errors: int, preview: bool) -> dict:
    """
    Verwijdert Firestore-documenten waarvan de museumpass_url niet meer op de
    website voorkomt (bv. omdat de naam/URL van een museum gewijzigd is).

    - Staat een verouderd record op al_bezocht=true, dan wordt die waarde eerst
      overgezet op het huidige record met dezelfde naam (zonder haakjes).
    - Bezochte verouderde records zonder huidig equivalent blijven behouden.
    - Records die nog op de website staan worden nooit aangeraakt of gewist.
    """
    result = {"deleted": 0, "deleted_list": [], "transferred": [], "kept": [], "errors": 0, "skipped": ""}
    scraped_urls = {m["museumpass_url"] for m in museums if m.get("museumpass_url")}
    stale = {u: d for u, d in existing.items() if u not in scraped_urls}
    print(f"  {len(stale)} verouderde records (niet meer op de website).")
    if not stale:
        return result

    # Veiligheid: niet opruimen als de scrape onvolledig lijkt
    if scrape_errors:
        result["skipped"] = f"{scrape_errors} scrape-fouten"
    elif len(museums) < 200:
        result["skipped"] = f"slechts {len(museums)} musea gescraped"
    elif len(stale) > 0.25 * len(existing):
        result["skipped"] = f"{len(stale)} van {len(existing)} records zou verdwijnen"
    if result["skipped"]:
        print(f"  Opruimen OVERGESLAGEN: {result['skipped']}")
        return result

    # Huidige records per museum-ID en per genormaliseerde naam
    current: dict[str, list[dict]] = {}
    current_by_id: dict[str, dict] = {}
    for m in museums:
        url = m.get("museumpass_url", "")
        if not url:
            continue
        if url in existing:
            doc_name, bezocht = existing[url]["doc_name"], existing[url]["al_bezocht"]
        else:
            doc_name = f"{FIRESTORE_RESOURCE}/{FIRESTORE_COLLECTION}/{_safe_doc_id(url)}"
            bezocht = False
        rec = {"doc_name": doc_name, "al_bezocht": bezocht, "naam": m.get("naam", "")}
        current.setdefault(_norm_naam(m.get("naam", "")), []).append(rec)
        mid = _museum_id(url)
        if mid:
            current_by_id[mid] = rec

    transfers: dict[str, str] = {}   # doc_name huidig record -> naam
    deletes: list[dict] = []
    for url, d in sorted(stale.items(), key=lambda kv: kv[1]["naam"].lower()):
        # 1) zelfde museum-ID in de URL, 2) anders zelfde naam (zonder haakjes)
        by_id = current_by_id.get(_museum_id(url))
        if by_id:
            matches = [by_id]
        else:
            matches = current.get(_norm_naam(d["naam"]), []) if d["naam"] else []
        if d["al_bezocht"] and len(matches) != 1:
            actie = "BEHOUDEN (bezocht, geen eenduidig huidig record)"
            result["kept"].append(d["naam"] or url)
        else:
            actie = "verwijderen"
            if d["al_bezocht"]:
                tgt = matches[0]
                if tgt["al_bezocht"]:
                    actie += f" (huidig record '{tgt['naam']}' is al bezocht)"
                else:
                    actie += f" + bezocht overzetten naar '{tgt['naam']}'"
                    transfers[tgt["doc_name"]] = tgt["naam"]
            elif matches:
                actie += f" (huidig record: '{matches[0]['naam']}')"
            else:
                actie += " (geen huidig record met deze naam)"
            deletes.append(d)
        print(f"    - {d['naam'] or '?'} [bezocht={d['al_bezocht']}] -> {actie}")
        print(f"        {url}")

    result["transferred"] = sorted(transfers.values())
    result["deleted_list"] = [
        (d["naam"] or "?") + (f" ({d['gemeente']})" if d.get("gemeente") else "") for d in deletes
    ]
    if preview:
        print(f"  PREVIEW: {len(deletes)} te verwijderen, {len(transfers)} x bezocht over te zetten, "
              f"{len(result['kept'])} behouden. Niets gewijzigd.")
        return result

    auth_headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    if transfers:
        failed = _batch_write([
            {"update": {"name": dn, "fields": {"al_bezocht": {"booleanValue": True}}},
             "updateMask": {"fieldPaths": ["al_bezocht"]},
             "currentDocument": {"exists": True}}
            for dn in transfers
        ], auth_headers)
        if failed:
            print("  Overzetten van 'bezocht' mislukt — er wordt NIETS verwijderd.")
            result["errors"] = failed
            result["transferred"] = []
            return result
        print(f"  'bezocht' overgezet op {len(transfers)} huidige records.")

    failed = _batch_write([{"delete": d["doc_name"]} for d in deletes], auth_headers)
    result["errors"] = failed
    result["deleted"] = len(deletes) - failed
    if failed:
        result["deleted_list"] = []  # onzeker welke precies gelukt zijn
    print(f"  {result['deleted']} verouderde records verwijderd, {failed} fouten.")
    return result


# ── Stap 5: WhatsApp notificatie ───────────────────────────────────────────────

def send_whatsapp(message: str, phone: str, api_key: str) -> bool:
    """Stuur een WhatsApp-bericht via CallMeBot."""
    from urllib.parse import quote
    encoded = quote(message)
    url = f"https://api.callmebot.com/whatsapp.php?phone={phone}&text={encoded}&apikey={api_key}"
    try:
        resp = requests.get(url, timeout=30)
        print(f"  CallMeBot response (HTTP {resp.status_code}): {resp.text[:200]}")
        return resp.status_code == 200
    except Exception as e:
        print(f"  WhatsApp-notificatie mislukt: {e}")
        return False


def _safe_doc_id(url: str) -> str:
    slug = re.sub(r'https?://', '', url)
    slug = re.sub(r'[^a-zA-Z0-9_\-]', '_', slug)
    return slug[:500]


# ── Hoofdprogramma ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="MuseumPass Firestore update")
    parser.add_argument("--credentials", default=DEFAULT_CREDENTIALS_PATH,
                        help="Pad naar Firebase service account JSON")
    parser.add_argument("--max-museums", type=int, default=None,
                        help="Maximaal aantal te scrapen musea (voor testen)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Scrape en parse, maar schrijf niet naar Firestore")
    parser.add_argument("--whatsapp-phone", default="32499712300",
                        help="Telefoonnummer voor WhatsApp-notificatie")
    parser.add_argument("--callmebot-apikey", default=None,
                        help="CallMeBot API-sleutel voor WhatsApp-notificatie")
    parser.add_argument("--prune", choices=("off", "preview", "delete"), default="off",
                        help="Records die niet meer op de website staan: "
                             "negeren, enkel tonen, of verwijderen")
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
        credentials = json.load(f)

    session = requests.Session()
    session.headers.update(HEADERS)

    print("\nSTAP 1: Scrapen van musea")
    print("-" * 40)
    museum_urls = fetch_all_museum_urls(session)

    if args.max_museums:
        museum_urls = museum_urls[:args.max_museums]
        print(f"  (Beperkt tot {args.max_museums} voor test)")

    print(f"\nScrapen van {len(museum_urls)} museumpagina's...")
    museums: list[dict] = []
    scrape_errors = 0

    for idx, url in enumerate(museum_urls, 1):
        if idx % 10 == 0 or idx == len(museum_urls):
            print(f"  {idx}/{len(museum_urls)} gescraped...", end="\r")
        museum = scrape_museum(session, url)
        if museum:
            museums.append(museum)
        else:
            scrape_errors += 1
        time.sleep(0.2)

    print(f"\n  {len(museums)} musea succesvol gescraped, {scrape_errors} fouten")

    if not museums:
        print("FOUT: Geen museumdata verkregen. Script stopt.")
        sys.exit(1)

    if args.dry_run:
        print("\nDRY-RUN: Geen wijzigingen naar Firestore geschreven.")
        print(json.dumps(museums[0], indent=2, ensure_ascii=False))
        sys.exit(0)

    print("\nSTAP 2: Firebase authenticatie")
    print("-" * 40)
    access_token = get_access_token(credentials)

    print("\nSTAP 3: Bestaande Firestore-data")
    print("-" * 40)
    existing = fetch_existing_documents(access_token)
    renamed = match_by_museum_id(museums, existing)
    if renamed:
        print(f"  {len(renamed)} musea met gewijzigde naam/URL (zelfde museum-ID) worden bijgewerkt:")
        for r in renamed:
            print(f"    - {r}")

    print("\nSTAP 4: Upsert naar Firestore")
    print("-" * 40)
    print(f"  Verwerken van {len(museums)} musea...")
    updated, new, write_errors, new_museums = upsert_museums(museums, existing, access_token)

    prune = {"deleted": 0, "deleted_list": [], "transferred": [], "kept": [], "errors": 0, "skipped": ""}
    if args.prune != "off":
        print("\nSTAP 4b: Verouderde records opruimen" + (" (preview)" if args.prune == "preview" else ""))
        print("-" * 40)
        prune = prune_stale(museums, existing, access_token,
                            scrape_errors + write_errors, preview=(args.prune == "preview"))
        write_errors += prune["errors"]

    elapsed = time.time() - start
    print("\n" + "=" * 60)
    print("SAMENVATTING")
    print("=" * 60)
    print(f"  Totaal gescraped:             {len(museums)}")
    print(f"  Bestaande records bijgewerkt: {updated}")
    print(f"  Nieuwe musea toegevoegd:      {new}")
    print(f"  Naam gewijzigd (bijgewerkt):  {len(renamed)}")
    print(f"  Verouderde records verwijderd: {prune['deleted']}")
    for naam in prune["deleted_list"]:
        print(f"    - verwijderd: {naam}")
    if prune["transferred"]:
        print(f"  'Bezocht' overgezet op:       {', '.join(prune['transferred'])}")
    if prune["kept"]:
        print(f"  Verouderd maar behouden:      {', '.join(prune['kept'])}")
    if prune["skipped"]:
        print(f"  Opruimen overgeslagen:        {prune['skipped']}")
    print(f"  Scrape-fouten:                {scrape_errors}")
    print(f"  Schrijffouten:                {write_errors}")
    print(f"  Tijd:                         {elapsed:.1f}s")
    if new_museums:
        print(f"\n  Nieuwe musea:")
        for m in new_museums:
            print(f"    - {m.get('naam', '?')} ({m.get('gemeente', '?')})")
    print("=" * 60)

    # WhatsApp notificatie
    callmebot_key = args.callmebot_apikey or os.environ.get("CALLMEBOT_API_KEY", "")
    if callmebot_key and args.prune != "preview":
        print("\nSTAP 5: WhatsApp-notificatie")
        print("-" * 40)
        datum = datetime.now().strftime("%Y-%m-%d")
        lines = [
            f"MuseumPass update {datum}",
            f"Gescraped: {len(museums)} musea",
            f"Bijgewerkt: {updated}",
            f"Nieuw: {new}",
        ]
        if new_museums:
            lines.append("Nieuwe musea:")
            for m in new_museums:
                lines.append(f"  - {m.get('naam', '?')} ({m.get('gemeente', '?')})")
        if renamed:
            lines.append("Naam gewijzigd:")
            for r in renamed[:40]:
                lines.append(f"  - {r}")
        if prune["deleted"]:
            lines.append(f"Verwijderd (niet meer op website): {prune['deleted']}")
            for naam in prune["deleted_list"][:40]:
                lines.append(f"  - {naam}")
            if len(prune["deleted_list"]) > 40:
                lines.append(f"  ... en nog {len(prune['deleted_list']) - 40}")
        if prune["transferred"]:
            lines.append("Bezocht overgezet naar: " + ", ".join(prune["transferred"]))
        if prune["kept"]:
            lines.append(f"Verouderd maar bezocht, behouden: {', '.join(prune['kept'])}")
        if prune["skipped"]:
            lines.append(f"Opruimen overgeslagen: {prune['skipped']}")
        if scrape_errors or write_errors:
            lines.append(f"Fouten: {scrape_errors} scrape, {write_errors} schrijf")
        message = "\n".join(lines)
        ok = send_whatsapp(message, args.whatsapp_phone, callmebot_key)
        if ok:
            print("  WhatsApp-bericht verzonden.")
        else:
            print("  WhatsApp-bericht MISLUKT.")
    elif args.prune == "preview":
        print("\n(Preview-modus — WhatsApp overgeslagen)")
    else:
        print("\n(Geen CallMeBot API-sleutel opgegeven — WhatsApp overgeslagen)")

    if write_errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
