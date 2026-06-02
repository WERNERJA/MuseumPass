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
    """Haalt alle museum-URLs op van de aanbodpagina (inclusief paginering via API)."""
    print("Ophalen van museumlijst...")

    urls: list[str] = []

    # Probeer eerst de HTML-pagina om de structuur te begrijpen
    resp = session.get(LISTING_URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    html = resp.text

    # Verzamel links van de initieel geladen pagina
    links = _extract_museum_links_from_html(html)
    urls.extend(links)
    print(f"  Initieel geladen: {len(links)} musea")

    # Detecteer een API-endpoint voor "Toon meer" (Nuxt/Vue typisch via _nuxt of api/)
    # Probeer meerdere bekende patronen
    page = 2
    api_patterns = [
        f"{WEBSITE_BASE}/api/museums?category=museum&sort=alphabetically&page={{page}}",
        f"{WEBSITE_BASE}/_nuxt/api/aanbod?activeCategory=museum&sort=alphabetically&page={{page}}",
        f"{WEBSITE_BASE}/nl/aanbod?activeCategory=museum&sort=alphabetically&page={{page}}",
    ]

    # Controleer of er een "next" of paginering-hint in de HTML zit
    # Zoek naar een "__NUXT_DATA__" of JSON-blok met totaalaantal
    total_match = re.search(r'"total"\s*:\s*(\d+)', html)
    per_page_match = re.search(r'"perPage"\s*:\s*(\d+)', html)

    if total_match and per_page_match:
        total = int(total_match.group(1))
        per_page = int(per_page_match.group(1))
        total_pages = (total + per_page - 1) // per_page
        print(f"  Totaal: {total} musea, {per_page} per pagina, {total_pages} pagina's")
    else:
        total_pages = 20  # Ruime schatting

    # Probeer API-aanroepen voor de overige pagina's
    loaded_via_api = False
    for pattern in api_patterns:
        test_url = pattern.format(page=2)
        try:
            r = session.get(test_url, headers={**HEADERS, "Accept": "application/json"}, timeout=15)
            if r.status_code == 200 and r.headers.get("content-type", "").startswith("application/json"):
                data = r.json()
                items = _extract_urls_from_json(data)
                if items:
                    print(f"  API-patroon gevonden: {pattern}")
                    urls.extend(items)
                    # Laad resterende pagina's
                    for p in range(3, total_pages + 1):
                        api_url = pattern.format(page=p)
                        r2 = session.get(api_url, headers={**HEADERS, "Accept": "application/json"}, timeout=15)
                        if r2.status_code != 200:
                            break
                        more = _extract_urls_from_json(r2.json())
                        if not more:
                            break
                        urls.extend(more)
                        time.sleep(0.3)
                    loaded_via_api = True
                    break
        except Exception:
            continue

    if not loaded_via_api:
        # Fallback: haal opeenvolgende HTML-pagina's op
        print("  Geen JSON-API gevonden, probeer HTML-paginering...")
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

    # Uniek + volledig
    unique_urls = list(dict.fromkeys(
        u if u.startswith("http") else urljoin(WEBSITE_BASE, u)
        for u in urls
        if "/museum/" in u or "/nl/museum" in u or "/fr/musee" in u
    ))
    print(f"  Totaal unieke museum-URLs: {len(unique_urls)}")
    return unique_urls


def _extract_museum_links_from_html(html: str) -> list[str]:
    """Extraheert museum-links uit HTML zonder externe parser."""
    # Zoek alle href-waarden die naar een museum-pagina wijzen
    pattern = r'href=["\']([^"\']*(?:/nl/museum|/fr/mus[ée]e|/museum/)[^"\']*)["\']'
    return list(dict.fromkeys(re.findall(pattern, html)))


def _extract_urls_from_json(data) -> list[str]:
    """Probeert museum-URLs te extraheren uit een JSON-response."""
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
    """Haalt en parseert één museumpagina."""
    try:
        r = session.get(url, headers=HEADERS, timeout=20)
        r.raise_for_status()
    except Exception as e:
        print(f"  Fout bij ophalen {url}: {e}")
        return None

    return extract_museum_data(r.text, url)


def extract_museum_data(html: str, museumpass_url: str) -> dict:
    """
    Python-vertaling van de window._extractMuseum JS-functie.
    Parseert museum-HTML naar een gestructureerd dict.
    """
    # Verwijder script/style/noscript voor tekstextractie
    clean = re.sub(r'<(script|style|noscript)[^>]*>[\s\S]*?</\1>', ' ', html, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', ' ', clean)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n\s*\n', '\n', text).strip()

    # Naam (h1)
    h1_match = re.search(r'<h1[^>]*>([\s\S]*?)</h1>', html, re.IGNORECASE)
    naam = re.sub(r'<[^>]+>', '', h1_match.group(1)).strip() if h1_match else ''

    # Omschrijving (JSON-LD description)
    omschrijving = ''
    jd_match = re.search(r'"description"\s*:\s*"((?:[^"\\]|\\.)*)"', html)
    if jd_match:
        omschrijving = (jd_match.group(1)
                        .replace('\\"', '"')
                        .replace('\\n', ' ')
                        .strip())

    # Openingsuren
    openingsuren = ''
    oh_match = re.search(
        r'Openingsuren\s*\n+([\s\S]{5,400}?)\s*\n\s*(?:Locatie|Faciliteiten|Contact|Meer info)',
        text
    )
    if oh_match:
        openingsuren = re.sub(r'^\s+|\s+$', '', oh_match.group(1), flags=re.MULTILINE)
        openingsuren = re.sub(r'\n{3,}', '\n', openingsuren).strip()

    # Adres: spans zoeken
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

    # Telefoonnummer
    tel_match = re.search(r'href="tel:([^"]+)"[^>]*>(.*?)</a>', html, re.IGNORECASE)
    tel = re.sub(r'<[^>]+>', '', tel_match.group(2)).strip() if tel_match else ''

    # E-mailadres
    mail_match = re.search(r'href="mailto:([^"]+)"[^>]*>(.*?)</a>', html, re.IGNORECASE)
    mail = re.sub(r'<[^>]+>', '', mail_match.group(2)).strip() if mail_match else ''

    # Website URL (eerste externe link die geen bekende dienst is)
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
    """Ondertekent een bericht met RS256 (gebruikt rsa of cryptography)."""
    try:
        # Probeer eerst google-auth / cryptography (werkt op de meeste systemen)
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding as asym_padding
        key = serialization.load_pem_private_key(private_key_pem.encode(), password=None)
        return key.sign(msg.encode(), asym_padding.PKCS1v15(), hashes.SHA256())
    except Exception:
        pass

    # Fallback: pure-Python rsa bibliotheek
    import rsa as _rsa
    private_key = _rsa.PrivateKey.load_pkcs1(private_key_pem.encode())
    return _rsa.sign(msg.encode(), private_key, "SHA-256")


def create_jwt(credentials: dict) -> str:
    """Maakt een gesigneerde JWT voor het Firebase service account."""
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
    """Wisselt een JWT in voor een Google OAuth2 access token."""
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

FIRESTORE_BASE = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT}/databases/(default)/documents"


def fetch_existing_documents(access_token: str) -> dict[str, dict]:
    """
    Haalt alle bestaande documenten op uit de Firestore-collectie 'musea'.
    Retourneert een dict: museumpass_url -> {doc_name, al_bezocht, ...}.
    """
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
    """Converteert een museum-dict naar Firestore field-formaat."""
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
    """
    Upsert musea naar Firestore:
    - Bestaand: update alle velden BEHALVE al_bezocht
    - Nieuw:    aanmaken met al_bezocht=False

    Retourneert (bijgewerkt, nieuw, fouten).
    """
    auth_headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    BATCH_SIZE = 20
    updated = new = errors = 0

    for i in range(0, len(museums), BATCH_SIZE):
        batch = museums[i : i + BATCH_SIZE]
        writes = []

        for museum in batch:
            mp_url = museum.get("museumpass_url", "")
            if not mp_url:
                continue

            if mp_url in existing:
                # Update: bewaar al_bezocht
                al_bezocht = existing[mp_url]["al_bezocht"]
                doc_name = existing[mp_url]["doc_name"]
                fields = to_firestore_fields(museum, al_bezocht)
                # updateMask: alle velden behalve al_bezocht
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
                # Nieuw document
                doc_id = _safe_doc_id(mp_url)
                fields = to_firestore_fields(museum, False)
                writes.append({
                    "update": {
                        "name":   f"{FIRESTORE_BASE}/{FIRESTORE_COLLECTION}/{doc_id}",
                        "fields": fields,
                    },
                })
                new += 1

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
            print(f"  Batch {i//BATCH_SIZE + 1} mislukt (HTTP {resp.status_code}): {resp.text[:200]}")
            errors += len(writes)
            updated -= sum(1 for w in writes if "updateMask" in w)
            new     -= sum(1 for w in writes if "updateMask" not in w)
        else:
            write_results = resp.json().get("writeResults", [])
            failed = sum(
                1 for wr in write_results
                if "updateTime" not in wr
            )
            if failed:
                print(f"  {failed} writes in batch {i//BATCH_SIZE + 1} hadden geen updateTime")
                errors += failed

        time.sleep(0.1)

    return updated, new, errors


def _safe_doc_id(url: str) -> str:
    """Maakt een veilige Firestore document-ID van een URL."""
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
    args = parser.parse_args()

    start = time.time()
    print("=" * 60)
    print("MuseumPass Database Update")
    print(f"Gestart: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # Laad credentials
    creds_path = args.credentials
    if not os.path.exists(creds_path):
        print(f"FOUT: Credentials-bestand niet gevonden: {creds_path}")
        print("Gebruik --credentials /pad/naar/service-account.json")
        sys.exit(1)

    with open(creds_path) as f:
        credentials = json.load(f)

    session = requests.Session()
    session.headers.update(HEADERS)

    # Stap 1: Scrapen
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
        print("Voorbeeld van eerste museum:")
        print(json.dumps(museums[0], indent=2, ensure_ascii=False))
        sys.exit(0)

    # Stap 2: Firebase authenticatie
    print("\nSTAP 2: Firebase authenticatie")
    print("-" * 40)
    access_token = get_access_token(credentials)

    # Stap 3: Bestaande data ophalen
    print("\nSTAP 3: Bestaande Firestore-data")
    print("-" * 40)
    existing = fetch_existing_documents(access_token)

    # Stap 4: Upsert
    print("\nSTAP 4: Upsert naar Firestore")
    print("-" * 40)
    print(f"  Verwerken van {len(museums)} musea...")
    updated, new, write_errors = upsert_museums(museums, existing, access_token)

    # Stap 5: Rapport
    elapsed = time.time() - start
    print("\n" + "=" * 60)
    print("SAMENVATTING")
    print("=" * 60)
    print(f"  Totaal gescraped:          {len(museums)}")
    print(f"  Bestaande records bijgewerkt: {updated}")
    print(f"  Nieuwe musea toegevoegd:   {new}")
    print(f"  Scrape-fouten:             {scrape_errors}")
    print(f"  Schrijffouten:             {write_errors}")
    print(f"  Tijd:                      {elapsed:.1f}s")
    print("=" * 60)

    if write_errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
