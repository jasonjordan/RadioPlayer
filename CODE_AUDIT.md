# Radio Player App - Code Audit

This document provides a comprehensive overview of the Radio Player application, its architecture, core features, and technical details. This audit serves as a reference to quickly understand how the app works without having to manually review the source code every time.

## Overview

The Radio Player is a fully responsive, front-end web application that plays internet radio streams (e.g., Icecast, Shoutcast, Zeno). It features real-time metadata fetching (current song, artist, album art, lyrics) and maintains a history of played songs.

The application is built primarily with **Vanilla JavaScript (ES6)**, **HTML5**, and **CSS3**, utilizing **Bootstrap 4.6** for responsive layout and **FontAwesome 4.7** for icons. It also includes Progressive Web App (PWA) support.

## Project Structure

```text
/
├── index.html           # Main application entry point and UI structure
├── manifest.json        # PWA manifest file for installability
├── service-worker.js    # Service worker for offline caching and PWA support
├── README.md            # Installation and basic configuration instructions
├── css/
│   ├── style.css        # Custom styles
│   ├── animate.css      # CSS animations library
│   ├── bootstrap.min.css# Bootstrap framework
│   └── font-awesome.min.css # FontAwesome icons
├── js/
│   ├── script.js        # Core application logic (RadioApp class)
│   └── bootstrap.min.js # Bootstrap JS components
├── img/                 # Directory for images (e.g., cover.png)
└── fonts/               # FontAwesome web fonts
```

## Core Components & Logic

### 1. `js/script.js` (The `RadioApp` Class)

The entire player logic is encapsulated in the `RadioApp` class. Upon DOM load, an instance of `RadioApp` is initialized.

**Key Features of `RadioApp`:**
- **Configuration (`CONFIG` object):** Defines static constants like radio name, stream URL, metadata API URL, polling intervals, and default volume.
- **Audio Playback:** Uses the native HTML5 `Audio` API to stream from `CONFIG.STREAM_URL`.
- **Metadata Polling:** Periodically (`CONFIG.POLLING_INTERVAL`) fetches the currently playing track metadata from `CONFIG.METADATA_API_URL`.
- **Cover Art Fetching:** Retrieves album artwork URLs directly from the stream's metadata JSON payload (`data.coverart` and `data.covers`), eliminating the need for a third-party image search API.
- **Lyrics Fetching:** Queries the **Open Lyrics API** (`api.lyrics.ovh`) to fetch and display the current song's lyrics inside a Bootstrap modal.
- **Media Session API:** Integrates with `navigator.mediaSession` to provide OS-level media controls (e.g., play/pause from lock screen or keyboard media keys) and display the current track metadata outside the browser window.
- **Keyboard Shortcuts:** Implements listeners for `Space`/`P` (play/pause), `M` (mute), `ArrowUp`/`ArrowDown` (volume), and `0-9` (quick volume set).

### 2. `index.html` (The User Interface)

- Contains a structured, responsive grid using Bootstrap.
- Features a dynamic background (`#bgCover`) that blurs the current album art.
- Displays the current album art, track info, playback controls, volume slider, and a "Show Lyrics" button.
- Contains a "History" section (`#historicSong`) that populates with the last few played tracks dynamically via JavaScript.
- Includes a Bootstrap modal (`#modalLyrics`) for displaying fetched lyrics.

### 3. Progressive Web App (PWA)

- **`manifest.json`:** Defines the app's name, icons, theme colors, and display mode (`standalone`), allowing users to "install" the radio player on mobile and desktop devices.
- **`service-worker.js`:** Registered at the bottom of `index.html`. It caches essential assets (HTML, CSS, JS, fonts) during the `install` phase and intercepts fetch requests to serve cached files, ensuring the app shell loads fast and provides some offline resiliency.

## Third-Party APIs

1. **Stream Metadata API:** The main JSON endpoint providing real-time data, history, and cover art (`https://hello.citrus3.com:2020/json/stream/happyradio`).
2. **Open Lyrics API (`api.lyrics.ovh`):** Used to retrieve lyrics for the currently playing track.

## How to Configure

If changes need to be made to the target stream:
1. Open `js/script.js`.
2. Modify the constants inside the `CONFIG` object at the top of the file:
   - `STREAM_URL`: The audio stream URL.
   - `METADATA_API_URL`: The JSON endpoint providing the current track data.
   - `RADIO_NAME`: The display name of the radio.

## Summary

The app is a lightweight, dependency-free (in terms of build tools/bundlers like Webpack or Vite) Vanilla JS implementation. It heavily leverages modern browser APIs (`fetch`, `MediaSession`, `Audio`) and focuses on performance and ease of deployment (just copy files to a static host).
