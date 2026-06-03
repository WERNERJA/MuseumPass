name: MuseumPass Maandelijkse Update

on:
  schedule:
    - cron: '0 8 1 * *'
  workflow_dispatch:

jobs:
  update:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Python instellen
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Dependencies installeren
        run: pip install -r requirements.txt

      - name: Playwright Chromium installeren
        run: playwright install chromium --with-deps

      - name: Firebase credentials schrijven
        env:
          FIREBASE_CREDENTIALS: ${{ secrets.FIREBASE_CREDENTIALS }}
        run: |
          if [ -z "$FIREBASE_CREDENTIALS" ]; then
            echo "FOUT: FIREBASE_CREDENTIALS secret is niet ingesteld."
            exit 1
          fi
          printf '%s' "$FIREBASE_CREDENTIALS" > /tmp/firebase-credentials.json

      - name: Musea updaten
        run: python update_musea.py --credentials /tmp/firebase-credentials.json

      - name: Credentials verwijderen
        if: always()
        run: rm -f /tmp/firebase-credentials.json
