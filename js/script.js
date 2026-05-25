'use strict';

/* ========================================================================
   Radio Player — Config
   ======================================================================== */
const CONFIG = Object.freeze({
    RADIO_NAME: 'Happy Radio',
    STREAM_URL: 'https://hello.citrus3.com:2020/stream/happyradio',
    METADATA_API_URL: 'https://hello.citrus3.com:2020/json/stream/happyradio',
    POLLING_INTERVAL: 10000,   // ms
    FETCH_TIMEOUT: 8000,       // ms
    HISTORY_LIMIT: 4,
    DEFAULT_VOLUME: 80,
    DEFAULT_COVER: 'img/cover.png'
});

/* ========================================================================
   Radio Player — Main Application
   ======================================================================== */
class RadioApp {
    constructor() {
        // Audio element
        this.audio = new Audio(CONFIG.STREAM_URL);
        this.audio.preload = 'none';
        this.audio.crossOrigin = 'anonymous';

        // State
        this.currentSongName = null;
        this.pollingTimer = null;
        this.volumeBeforeMute = CONFIG.DEFAULT_VOLUME;
        this.hasLoaded = false;
        this.historyCache = [];

        // Cached DOM refs
        this.dom = {};

        // Initialize
        this._cacheDOM();
        this._bindEvents();
        this._setInitialVolume();
        this._startPolling();
        this._setupMediaSession();

        // Set square cover art
        this._resizeCover();

        // Initial data fetch
        this._fetchStreamingData();
    }

    /* --------------------------------------------------------------------
       DOM caching
       -------------------------------------------------------------------- */
    _cacheDOM() {
        this.dom = {
            playerButton: document.getElementById('playerButton'),
            volumeSlider: document.getElementById('volume'),
            volIndicator: document.getElementById('volIndicator'),
            currentSong: document.getElementById('currentSong'),
            currentArtist: document.getElementById('currentArtist'),
            currentCoverArt: document.getElementById('currentCoverArt'),
            bgCover: document.getElementById('bgCover'),
            lyricsSong: document.getElementById('lyricsSong'),
            lyric: document.getElementById('lyric'),
            lyricsButton: document.querySelector('.lyrics'),
            historicSong: document.getElementById('historicSong'),
            coverAlbum: document.querySelector('.cover-album')
        };
    }

    /* --------------------------------------------------------------------
       Event binding
       -------------------------------------------------------------------- */
    _bindEvents() {
        // Play / pause button
        if (this.dom.playerButton) {
            this.dom.playerButton.addEventListener('click', () => this.togglePlay());
            this.dom.playerButton.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.togglePlay();
                }
            });
        }

        // Audio lifecycle
        this.audio.addEventListener('play', () => this._onAudioPlay());
        this.audio.addEventListener('pause', () => this._onAudioPause());
        this.audio.addEventListener('volumechange', () => {
            if (this.audio.volume > 0 && this.audio.muted) {
                this.audio.muted = false;
            }
        });
        this.audio.addEventListener('error', (e) => this._onAudioError(e));
        this.audio.addEventListener('stalled', () => {
            console.warn('Audio stream stalled');
        });

        // Volume slider
        if (this.dom.volumeSlider) {
            this.dom.volumeSlider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value, 10);
                this.audio.volume = val / 100;
                this._updateVolumeIndicator(val);
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this._handleKeydown(e));

        // Page Visibility API — conserve bandwidth when tab is hidden
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this._stopPolling();
            } else {
                this._fetchStreamingData();
                this._startPolling();
            }
        });

        // Responsive cover art
        window.addEventListener('resize', () => this._resizeCover());
    }

    /* --------------------------------------------------------------------
       Playback controls
       -------------------------------------------------------------------- */
    togglePlay() {
        if (this.audio.paused) {
            this._play();
        } else {
            this._pause();
        }
    }

    _play() {
        // Load only on first play or after an error
        if (!this.hasLoaded || this.audio.error) {
            this.audio.load();
            this.hasLoaded = true;
        }

        this.audio.play().catch((err) => {
            console.warn('Audio play failed (user gesture may be required):', err);
        });
    }

    _pause() {
        this.audio.pause();
    }

    _onAudioPlay() {
        if (this.dom.playerButton) {
            this.dom.playerButton.classList.remove('fa-play-circle');
            this.dom.playerButton.classList.add('fa-pause-circle');
            this.dom.playerButton.setAttribute('aria-label', 'Pause');
        }
        this._updateMediaSessionPlaybackState('playing');
    }

    _onAudioPause() {
        if (this.dom.playerButton) {
            this.dom.playerButton.classList.remove('fa-pause-circle');
            this.dom.playerButton.classList.add('fa-play-circle');
            this.dom.playerButton.setAttribute('aria-label', 'Play');
        }
        this._updateMediaSessionPlaybackState('paused');
    }

    _onAudioError(err) {
        console.error('Audio stream error:', err);
        const confirmed = confirm('Stream unavailable or network error.\nClick OK to try again.');
        if (confirmed) window.location.reload();
    }

    /* --------------------------------------------------------------------
       Volume controls
       -------------------------------------------------------------------- */
    _setInitialVolume() {
        let vol = CONFIG.DEFAULT_VOLUME;
        try {
            const stored = localStorage.getItem('volume');
            if (stored !== null) vol = parseInt(stored, 10);
        } catch (e) {
            // localStorage may be unavailable in private mode
        }

        vol = this._clamp(vol, 0, 100);
        this.audio.volume = vol / 100;

        if (this.dom.volumeSlider) this.dom.volumeSlider.value = vol;
        if (this.dom.volIndicator) this.dom.volIndicator.textContent = vol;
    }

    _updateVolumeIndicator(volume) {
        const v = this._clamp(parseInt(volume, 10), 0, 100);
        if (this.dom.volIndicator) this.dom.volIndicator.textContent = v;
        try {
            localStorage.setItem('volume', v);
        } catch (e) {
            // ignore
        }
    }

    volumeUp() {
        const next = Math.min(100, Math.round((this.audio.volume + 0.01) * 100));
        this.audio.volume = next / 100;
        if (this.dom.volumeSlider) this.dom.volumeSlider.value = next;
        this._updateVolumeIndicator(next);
    }

    volumeDown() {
        const next = Math.max(0, Math.round((this.audio.volume - 0.01) * 100));
        this.audio.volume = next / 100;
        if (this.dom.volumeSlider) this.dom.volumeSlider.value = next;
        this._updateVolumeIndicator(next);
    }

    toggleMute() {
        if (!this.audio.muted) {
            this.volumeBeforeMute = Math.round(this.audio.volume * 100) || CONFIG.DEFAULT_VOLUME;
            this.audio.muted = true;
            this.audio.volume = 0;
            if (this.dom.volumeSlider) this.dom.volumeSlider.value = 0;
            if (this.dom.volIndicator) this.dom.volIndicator.textContent = 0;
        } else {
            const vol = this.volumeBeforeMute;
            this.audio.muted = false;
            this.audio.volume = vol / 100;
            if (this.dom.volumeSlider) this.dom.volumeSlider.value = vol;
            if (this.dom.volIndicator) this.dom.volIndicator.textContent = vol;
            this._updateVolumeIndicator(vol);
        }
    }

    /* --------------------------------------------------------------------
       Keyboard shortcuts
       -------------------------------------------------------------------- */
    _handleKeydown(event) {
        const key = event.key;

        // Prevent default for media keys so page doesn't scroll
        if (key === ' ' || key === 'Spacebar' || key === 'ArrowUp' || key === 'ArrowDown') {
            event.preventDefault();
        }

        switch (key) {
            case 'ArrowUp':
                this.volumeUp();
                break;
            case 'ArrowDown':
                this.volumeDown();
                break;
            case ' ':
            case 'Spacebar':
                this.togglePlay();
                break;
            case 'p':
            case 'P':
                this.togglePlay();
                break;
            case 'm':
            case 'M':
                this.toggleMute();
                break;
            case '0':
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
            case '6':
            case '7':
            case '8':
            case '9': {
                let target = parseInt(key, 10);
                if (target === 0) target = 10;
                const val = target * 10;
                this.audio.volume = val / 100;
                if (this.dom.volumeSlider) this.dom.volumeSlider.value = val;
                this._updateVolumeIndicator(val);
                break;
            }
            default:
                break;
        }
    }

    /* --------------------------------------------------------------------
       Polling & metadata fetching
       -------------------------------------------------------------------- */
    _startPolling() {
        this._stopPolling();
        this.pollingTimer = setInterval(() => this._fetchStreamingData(), CONFIG.POLLING_INTERVAL);
    }

    _stopPolling() {
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
        }
    }

    async _fetchStreamingData() {
        try {
            const data = await this._fetchWithTimeout(CONFIG.METADATA_API_URL, CONFIG.FETCH_TIMEOUT);
            if (!data) return;

            const parsed = this._parseNowPlaying(data);
            const song = (parsed.song || 'Unknown').trim();
            const artist = (parsed.artist || 'Unknown').trim();

            if (song !== this.currentSongName) {
                document.title = `${song} — ${artist} | ${CONFIG.RADIO_NAME}`;
                this._refreshCover(parsed.coverart);
                this._refreshCurrentSong(song, artist);
                this._refreshLyrics(song, artist);
                this._refreshHistory(parsed.history);
                this.currentSongName = song;

                this._updateMediaSessionMetadata(song, artist, parsed.coverart);
            }
        } catch (err) {
            // Silently ignore streaming errors to avoid UI noise
            if (err.name !== 'AbortError') {
                console.warn('Metadata fetch failed:', err.message);
            }
        }
    }

    async _fetchWithTimeout(url, ms) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), ms);
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(id);
            if (!response.ok) return null;
            return await response.json();
        } catch (err) {
            clearTimeout(id);
            return null;
        }
    }

    /* --------------------------------------------------------------------
       Metadata parsers
       -------------------------------------------------------------------- */
    _parseNowPlaying(data) {
        let song = null;
        let artist = null;
        let history = [];

        if (!data || typeof data !== 'object') {
            return { song: 'Unknown', artist: 'Unknown', history: [] };
        }

        // 1) Direct fields: songtitle + artist
        if (data.songtitle) {
            song = data.songtitle;
            if (typeof data.artist === 'string') artist = data.artist;
            else if (data.artist && typeof data.artist === 'object' && data.artist.title) artist = data.artist.title;
            else if (typeof data.song === 'object' && data.song.artist) artist = data.song.artist;
        }

        // 2) String "Artist - Title"
        if ((!song || !artist) && typeof data.song === 'string') {
            const parts = data.song.split(' - ').map((s) => s.trim());
            if (parts.length === 2) {
                artist = parts[0];
                song = parts[1];
            } else {
                song = data.song;
            }
        }

        // 3) Object { title, artist }
        if ((!song || !artist) && typeof data.song === 'object' && data.song !== null) {
            if (!song && data.song.title) song = data.song.title;
            if (!artist && (data.song.artist || data.song.artists)) artist = data.song.artist || data.song.artists;
        }

        // 4) now_playing / current_track wrappers
        if ((!song || !artist) && data.now_playing) {
            if (!song && data.now_playing.title) song = data.now_playing.title;
            if (!artist && data.now_playing.artist) artist = data.now_playing.artist;
        }
        if ((!song || !artist) && data.current_track) {
            if (!song && data.current_track.title) song = data.current_track.title;
            if (!artist && data.current_track.artist) artist = data.current_track.artist;
        }

        // 5) nowplaying string (e.g. Citrus3 JSON: "Artist - Title")
        if ((!song || !artist) && typeof data.nowplaying === 'string') {
            const parts = data.nowplaying.split(' - ').map((s) => s.trim());
            if (parts.length === 2) {
                artist = parts[0];
                song = parts[1];
            } else {
                song = data.nowplaying;
            }
        }

        // History parsing
        history = this._parseHistoryArray(data.trackhistory || data.song_history || data.history || data.playlist, data.covers);

        return {
            song: song || 'Unknown',
            artist: artist || 'Unknown',
            coverart: data.coverart || CONFIG.DEFAULT_COVER,
            history
        };
    }

    _parseHistoryArray(source, covers = []) {
        if (!Array.isArray(source)) return [];

        const parsedItems = source.map((item, index) => {
            let parsedSong = 'Unknown';
            let parsedArtist = 'Unknown';

            if (typeof item === 'string') {
                const parts = item.split(' - ').map((s) => s.trim());
                if (parts.length === 2) {
                    parsedArtist = parts[0];
                    parsedSong = parts[1];
                } else {
                    parsedSong = item;
                }
            } else if (item) {
                if (item.song) {
                    if (typeof item.song === 'object') {
                        parsedSong = item.song.title || 'Unknown';
                        parsedArtist = item.song.artist || 'Unknown';
                    } else {
                        const parts = String(item.song).split(' - ').map((s) => s.trim());
                        if (parts.length === 2) {
                            parsedArtist = parts[0];
                            parsedSong = parts[1];
                        } else {
                            parsedSong = String(item.song);
                            parsedArtist = item.artist || 'Unknown';
                        }
                    }
                } else if (item.title) {
                    parsedSong = item.title;
                    parsedArtist = item.artist || 'Unknown';
                }
            }
            
            return { 
                song: parsedSong, 
                artist: parsedArtist, 
                coverart: covers[index] || CONFIG.DEFAULT_COVER 
            };
        });

        return parsedItems.filter(item => {
            const sLower = item.song.toLowerCase();
            const aLower = item.artist.toLowerCase();
            if (sLower.includes('happy radio') || aLower.includes('happy radio')) return false;
            if (sLower === 'unknown' || aLower === 'unknown') return false;
            return true;
        });
    }

    /* --------------------------------------------------------------------
       UI updates
       -------------------------------------------------------------------- */
    _refreshCurrentSong(song, artist) {
        const songEl = this.dom.currentSong;
        const artistEl = this.dom.currentArtist;
        const lyricsTitleEl = this.dom.lyricsSong;
        if (!songEl || !artistEl || !lyricsTitleEl) return;

        if (song === songEl.textContent && artist === artistEl.textContent) return;

        songEl.classList.remove('slideInRight', 'animated');
        songEl.classList.add('animated', 'slideOutLeft');
        artistEl.classList.remove('slideInRight', 'animated');
        artistEl.classList.add('animated', 'slideOutLeft');

        setTimeout(() => {
            songEl.textContent = song;
            artistEl.textContent = artist;
            lyricsTitleEl.textContent = `${song} — ${artist}`;

            songEl.classList.remove('slideOutLeft');
            songEl.classList.add('slideInRight');
            artistEl.classList.remove('slideOutLeft');
            artistEl.classList.add('slideInRight');

            const artistInfoBtn = document.getElementById('artistInfoBtn');
            if (artistInfoBtn) {
                artistInfoBtn.href = `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(artist)}`;
            }
        }, 500);
    }

    _refreshCover(coverartUrl) {
        if (!this.dom.currentCoverArt || !this.dom.bgCover) return;

        const cover = this.dom.currentCoverArt;
        const currentBg = cover.style.backgroundImage;
        if (currentBg && currentBg.includes(coverartUrl)) return;

        cover.classList.remove('slideInRight', 'bounceInLeft', 'animated');
        cover.classList.add('animated', 'slideOutLeft');

        setTimeout(() => {
            cover.style.backgroundImage = `url('${coverartUrl}')`;
            this.dom.bgCover.style.backgroundImage = `url('${coverartUrl}')`;
            cover.classList.remove('slideOutLeft');
            cover.classList.add('slideInRight');
        }, 500);
    }

    _refreshHistory(historyArray) {
        if (!this.dom.historicSong) return;

        const incoming = (Array.isArray(historyArray) ? historyArray : []).slice().reverse();
        
        incoming.forEach(newItem => {
            const recentlyAdded = this.historyCache.slice(-5).find(
                item => item.song === newItem.song && item.artist === newItem.artist
            );
            if (!recentlyAdded) {
                this.historyCache.push(newItem);
            }
        });

        // Limit cache size to prevent memory leaks over very long sessions
        if (this.historyCache.length > 50) {
            this.historyCache = this.historyCache.slice(-50);
        }

        const items = this.historyCache.slice(-CONFIG.HISTORY_LIMIT).reverse();
        const container = this.dom.historicSong;
        
        const oldChildren = Array.from(container.children);
        const oldRects = oldChildren.map(el => el.getBoundingClientRect());
        const oldIds = oldChildren.map(el => el.dataset.id);

        container.innerHTML = '';

        items.forEach((info, index) => {
            const songTitle = info.song || 'Unknown';
            const songArtist = info.artist || 'Unknown';
            const uniqueId = songTitle + '|' + songArtist;

            const article = document.createElement('article');
            article.classList.add('col-12', 'col-md-6');
            article.dataset.id = uniqueId;
            article.innerHTML = `
                <div class="cover-historic" style="background-image: url('${info.coverart || CONFIG.DEFAULT_COVER}');"></div>
                <div class="music-info">
                    <p class="song">${this._escapeHtml(songTitle)}</p>
                    <p class="artist">${this._escapeHtml(songArtist)}</p>
                </div>
            `;
            container.appendChild(article);
        });

        // FLIP animation
        const newChildren = Array.from(container.children);
        newChildren.forEach(newEl => {
            const id = newEl.dataset.id;
            const oldIndex = oldIds.indexOf(id);
            if (oldIndex !== -1) {
                const oldRect = oldRects[oldIndex];
                const newRect = newEl.getBoundingClientRect();
                const dx = oldRect.left - newRect.left;
                const dy = oldRect.top - newRect.top;
                if (dx !== 0 || dy !== 0) {
                    newEl.style.transform = `translate(${dx}px, ${dy}px)`;
                    newEl.style.transition = 'none';
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            newEl.style.transform = '';
                            newEl.style.transition = 'transform 0.5s ease-in-out';
                        });
                    });
                }
            } else {
                newEl.classList.add('animated', 'slideInLeft');
            }
        });
    }

    async _refreshLyrics(song, artist) {
        if (!this.dom.lyricsButton || !this.dom.lyric) return;

        if (!song || !artist || song === 'Unknown' || artist === 'Unknown') {
            this._disableLyrics();
            return;
        }

        try {
            const response = await this._fetchWithTimeout(
                `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(song)}`,
                5000
            );
            if (response && response.lyrics) {
                this.dom.lyric.innerHTML = this._escapeHtml(response.lyrics).replace(/\n/g, '<br>');
                this._enableLyrics();
            } else {
                this._disableLyrics();
            }
        } catch (err) {
            this._disableLyrics();
        }
    }

    _enableLyrics() {
        if (!this.dom.lyricsButton) return;
        this.dom.lyricsButton.style.opacity = '1';
        this.dom.lyricsButton.classList.remove('disabled');
        this.dom.lyricsButton.style.pointerEvents = 'auto';
        this.dom.lyricsButton.setAttribute('data-toggle', 'modal');
        this.dom.lyricsButton.setAttribute('data-target', '#modalLyrics');
    }

    _disableLyrics() {
        if (!this.dom.lyricsButton) return;
        this.dom.lyricsButton.style.opacity = '0.3';
        this.dom.lyricsButton.classList.add('disabled');
        this.dom.lyricsButton.style.pointerEvents = 'none';
        this.dom.lyricsButton.removeAttribute('data-toggle');
        this.dom.lyricsButton.removeAttribute('data-target');
        if (this.dom.lyric) this.dom.lyric.innerHTML = '';
    }

    _resizeCover() {
        if (this.dom.coverAlbum) {
            this.dom.coverAlbum.style.height = `${this.dom.coverAlbum.offsetWidth}px`;
        }
    }

    /* --------------------------------------------------------------------
       Media Session API
       -------------------------------------------------------------------- */
    _setupMediaSession() {
        if (!('mediaSession' in navigator)) return;

        navigator.mediaSession.setActionHandler('play', () => this._play());
        navigator.mediaSession.setActionHandler('pause', () => this._pause());
        navigator.mediaSession.setActionHandler('stop', () => this._pause());
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
    }

    _updateMediaSessionMetadata(song, artist, coverartUrl) {
        if (!('mediaSession' in navigator)) return;

        const art = coverartUrl || CONFIG.DEFAULT_COVER;
        const artwork = [
            { src: art, sizes: '96x96', type: 'image/png' },
            { src: art, sizes: '128x128', type: 'image/png' },
            { src: art, sizes: '192x192', type: 'image/png' },
            { src: art, sizes: '256x256', type: 'image/png' },
            { src: art, sizes: '384x384', type: 'image/png' },
            { src: art, sizes: '512x512', type: 'image/png' }
        ];

        navigator.mediaSession.metadata = new MediaMetadata({
            title: song,
            artist: artist,
            album: CONFIG.RADIO_NAME,
            artwork
        });
    }

    _updateMediaSessionPlaybackState(state) {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = state;
        }
    }

    /* --------------------------------------------------------------------
       Utilities
       -------------------------------------------------------------------- */
    _clamp(num, min, max) {
        return Math.min(Math.max(num, min), max);
    }

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

/* ========================================================================
   Bootstrap
   ======================================================================== */
window.addEventListener('DOMContentLoaded', () => {
    new RadioApp();
});
