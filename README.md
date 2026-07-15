# Card-virtuweel

Een Node.js/Express webapplicatie voor het beheren van certificaten, licenties en posts met een goedkeuringsworkflow.

## Functionaliteiten

- **Certificaten & Licenties** – Upload en beheer uw certificaten (VOG, KvK, ISO, etc.) met bestandsupload (PDF/JPG/PNG).
- **Posts & Advertenties** – Maak posts aan die eerst worden goedgekeurd voordat betaling mogelijk is.
- **Admin Paneel** – Keur certificaten en posts goed of wijs ze af.
- **Betaalgating** – De betaaloptie verschijnt pas nadat een post is goedgekeurd door een admin.

## Installatie

```bash
npm install
```

## Starten

```bash
npm start
# of
node server.js
```

De applicatie start op **http://localhost:4242** (configureerbaar via `.env`).

## Projectstructuur

```
├── server.js              # Express entrypoint
├── routes/
│   ├── certificates.js    # Certificaten & licenties routes
│   ├── posts.js           # Posts routes + betaalgating
│   └── admin.js           # Admin goedkeuringsroutes
├── public/
│   └── style.css          # Stijlblad
├── data/
│   ├── certificates.json  # Certificaatopslag (JSON)
│   └── posts.json         # Postopslag (JSON)
├── uploads/
│   └── certificates/      # Geüploade bestanden
└── .env                   # Configuratie (PORT=4242)
```

## Workflow

1. **Certificaat toevoegen**: Ga naar `/certificates/new` en vul het formulier in.
2. **Post aanmaken**: Ga naar `/posts/new` en koppel optioneel een goedgekeurd certificaat.
3. **Admin goedkeuring**: Ga naar `/admin` en keur certificaten en posts goed of af.
4. **Betaling**: Alleen na goedkeuring verschijnt de betaaloptie op de postpagina.

## Configuratie

Bewerk het `.env` bestand:

```
PORT=4242
```
