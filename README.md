# Card-virtuweel

Een Node.js/Express webapplicatie voor het beheren van certificaten, licenties en posts met een goedkeuringsworkflow en **NFC-betaling**.

## Functionaliteiten

- **Certificaten & Licenties** – Upload en beheer uw certificaten (VOG, KvK, ISO, etc.) met bestandsupload (PDF/JPG/PNG).
- **Posts & Advertenties** – Maak posts aan die eerst worden goedgekeurd voordat betaling mogelijk is.
- **Admin Paneel** – Keur certificaten en posts goed of wijs ze af.
- **Betaalgating** – De betaaloptie verschijnt pas nadat een post is goedgekeurd door een admin.
- **NFC-betaling** – Betaal via NFC (Web NFC API) op Android-apparaten in Chrome.
- **PWA** – Installeerbaar als app op Android via "Toevoegen aan startscherm" in Chrome.

## NFC-betaling

De NFC-betaalfunctie maakt gebruik van de **[Web NFC API](https://developer.mozilla.org/en-US/docs/Web/API/Web_NFC_API)**.

### Vereisten
- **Chrome voor Android** (versie 89 of hoger)
- NFC ingeschakeld op het apparaat
- Pagina geserveerd via **HTTPS** (of localhost voor ontwikkeling)

### Hoe het werkt
1. Ga naar een goedgekeurde post
2. Kies tabblad "📲 NFC Betalen"
3. Klik op "Start NFC-betaling"
4. Houd uw NFC-kaart of betaalapparaat tegen de achterkant van uw telefoon
5. De betaling wordt bevestigd zodra de NFC-tag is gelezen

> **Let op:** De Web NFC API leest NFC-tags via de browser. Voor echte betalingsverwerking dient u een betaalprovider (bijv. Stripe, Adyen) te integreren.

## PWA installeren (Android)

1. Open de app in Chrome op Android
2. Tik op het menu (⋮) → "Toevoegen aan startscherm"
3. De app wordt geïnstalleerd en is offline beschikbaar

## APK-download tonen

Wilt u een directe APK-downloadlink in de app tonen, stel dan een publieke URL in via:

```
APK_DOWNLOAD_URL=https://example.com/downloads/Card-virtuweel.apk
```

Daarna verschijnt op `/` en `/install` een knop **Download APK** plus de volledige APK-link. Zonder deze variabele blijft de PWA-installatie via Chrome zichtbaar als fallback.

### Snel downloaden

- [Download APK](https://github.com/Ice1984m/Card-virtuweel/releases/latest/download/Card-virtuweel.apk)
- [README](https://github.com/Ice1984m/Card-virtuweel#readme)

## Installatie

```bash
npm install
```

## Starten

```bash
npm start
```

De applicatie start op **http://localhost:4242** (configureerbaar via `.env`).

## Projectstructuur

```
├── server.js                  # Express entrypoint
├── routes/
│   ├── certificates.js        # Certificaten & licenties routes
│   ├── posts.js               # Posts routes + betaalgating + NFC
│   ├── admin.js               # Admin goedkeuringsroutes
│   ├── layout.js              # Gedeelde HTML layout (PWA meta)
│   └── helpers.js             # Gedeelde hulpfuncties
├── public/
│   ├── style.css              # Stijlblad (incl. NFC animatie)
│   ├── manifest.json          # PWA manifest
│   ├── sw.js                  # Service Worker
│   └── icons/                 # PWA-iconen (192px, 512px)
├── data/
│   ├── certificates.json      # Certificaatopslag (JSON)
│   └── posts.json             # Postopslag (JSON)
├── uploads/
│   └── certificates/          # Geüploade bestanden
└── .env                       # Configuratie (PORT=4242)
```

## Workflow

1. **Certificaat toevoegen**: Ga naar `/certificates/new` en vul het formulier in.
2. **Post aanmaken**: Ga naar `/posts/new` en koppel optioneel een goedgekeurd certificaat.
3. **Admin goedkeuring**: Ga naar `/admin` en keur certificaten en posts goed of af.
4. **Betaling**: Na goedkeuring kiest u NFC-betaling of kaartbetaling op de postpagina.

## Configuratie

Bewerk het `.env` bestand:

```
PORT=4242
APK_DOWNLOAD_URL=https://example.com/downloads/Card-virtuweel.apk
```
