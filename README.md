# Apologea Studio

Windows-Desktop-Programm für die Marke Apologea:

- **Design-Studio:** Idee eintippen → KI-Konzept (Groq) → Motive (Cloudflare FLUX) → Kleidungs-Mockups im Canvas.
- **Video-Cutter:** Spracherkennung mit Wortzeiten (Groq Whisper) → Pausen/Versprecher raus → TikTok-Untertitel, Logo, Bilder (FFmpeg).

## Entwickeln

```sh
npm install
npm start
```

## Windows-Installer bauen

Unter Windows: `npx electron-builder --win`. Unter Linux (mit wine64 + wine32): `./build-win.sh`.
Ergebnis: `dist/Apologea Studio Setup <version>.exe`.

## Neue Version veröffentlichen

Version in `package.json` erhöhen, committen und einen Tag `v<version>` pushen.
GitHub Actions baut dann den Installer und legt ihn als Release ab; das Programm findet ihn über „Nach Updates suchen“.
