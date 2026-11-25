# Global Coffee Matrix — test copy

A static copy of the Coffee Matrix dashboard (Labesera, prepared for Covoya), hosted on GitHub Pages for testing.

- The matrix prices in `data/matrix.enc.json` are encrypted (AES-GCM-256, key derived with PBKDF2-SHA256). The page decrypts them in the browser with the access code, which travels in the link's `#k=` fragment (never sent to the server) or is typed in.
- Map shapes: Natural Earth 1:110m via world-atlas. Flags: country-flag-icons (MIT). Charts: d3 v7 (ISC). Fonts: Inter and IBM Plex Mono (SIL OFL).
- View-only: new matrices are loaded on the main dashboard, not here.
