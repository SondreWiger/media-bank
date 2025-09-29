# Media Bank (norsk versjon)

 Liten, kjapp og ganske kul «bank» for filer og bilder. Du kan laste opp ting, se miniatyrer, søke, tagge og slette – alt lokalt på maskina di. Laget i Node.js fordi det bare funker.

## Hva den kan
- Laste opp mange filer (bilder + annet)
- Lage miniatyrer for bilder (400x400 JPG)
- Vise alt i et responsivt rutenett
- Søk på filnavn / originalt navn
- Legg til tags per fil
- Slette ting når du er lei

## Kom i gang

### Du trenger
- Node.js 18+ (nyere = som regel bedre)

### Installer
```bash
npm install
```

### Kjør i dev (auto-reload)
```bash
npm run dev
```

### Kjør i prod (basic)
```bash
npm start
```

Åpne http://localhost:3000 og du er inne.

## Mappestruktur
- `server.js` – Express-server og API-ruter
- `src/db.js` – Databaseoppsett (SQLite via better-sqlite3)
- `uploads/originals`, `uploads/thumbs` – Filer og miniatyrer
- `index.html`, `styles.css`, `script.js` – Frontend-greiene

## API (kjapt)
- `POST /api/upload` – felt: `files` (flere går fint)
- `GET /api/media?query=&type=&order=...` – list media (støtter paginering)
- `PATCH /api/media/:id` – body `{ "tags": ["katt","meme"] }`
- `DELETE /api/media/:id`

## Notater
- Miniatyrer bare for bilder. Andre filer får placeholder.
- DB-fila ligger i `data/media.db`. Ta backup hvis ting er viktig.
# media-bank
