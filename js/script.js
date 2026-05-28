'use strict';

/* ========================================================================
   Radio Player — Config
   ======================================================================== */
const CONFIG = Object.freeze({
    RADIO_NAME: 'Happy Radio',
    STREAM_URL: 'https://hq3.yesstreaming.net/45185683',
    METADATA_API_URL: '/api/metadata',
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
        this.currentArtistName = null;
        this.lyricsCacheSong = null;
        this.pollingTimer = null;
        this.volumeBeforeMute = CONFIG.DEFAULT_VOLUME;
        this.historyCache = [];
        this.lastJingleTimestamp = 0;
        this.progressInterval = null;
        this.visualizer = null;

        // Cached DOM refs
        this.dom = {};

        // Initialize
        this._setupDebugLogger();
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

    _setupDebugLogger() {
        if (!window.location.search.includes('debug=1')) return;

        const debugUI = document.createElement('div');
        debugUI.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:30vh; background:rgba(0,0,0,0.8); color:#0f0; font-family:monospace; font-size:10px; z-index:999999; overflow-y:scroll; padding:10px; pointer-events:auto;';
        document.body.appendChild(debugUI);

        const ogLog = console.log;
        const ogWarn = console.warn;
        const ogError = console.error;

        const printMsg = (type, args) => {
            const msg = Array.from(args).map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
            const line = document.createElement('div');
            line.textContent = `[${type}] ${msg}`;
            line.style.color = type === 'ERROR' ? '#f00' : (type === 'WARN' ? '#ff0' : '#0f0');
            debugUI.appendChild(line);
            debugUI.scrollTop = debugUI.scrollHeight;
        };

        console.log = function () { ogLog.apply(console, arguments); printMsg('LOG', arguments); };
        console.warn = function () { ogWarn.apply(console, arguments); printMsg('WARN', arguments); };
        console.error = function () { ogError.apply(console, arguments); printMsg('ERROR', arguments); };

        window.addEventListener('error', (e) => console.error('Uncaught', e.message));
        window.addEventListener('unhandledrejection', (e) => console.error('Promise Rejection', e.reason ? e.reason.message : e.reason));

        console.log('--- DEBUG MODE ENABLED ---');
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



        // Auto-reconnect stream on error or stall
        this._setupAudioRecovery();

        // Stop preview audio when History modal closes
        if (window.$) {
            $('#modalHistoryInfo').on('hidden.bs.modal', () => {
                const previewAudio = document.getElementById('historyInfoPreviewAudio');
                if (previewAudio) {
                    previewAudio.pause();
                    previewAudio.src = '';
                }
            });
        }

        // Responsive cover art
        window.addEventListener('resize', () => this._resizeCover());

        // Native Share button
        this.dom.shareBtn = document.getElementById('shareBtn');
        if (this.dom.shareBtn) {
            this.dom.shareBtn.addEventListener('click', () => {
                const text = `I'm currently vibing to ${this.currentSongName || 'Happy Radio'} by ${this.currentArtistName || ''} on Happy Radio! 🎶`;
                if (navigator.share) {
                    navigator.share({
                        title: 'Happy Radio',
                        text: text,
                        url: window.location.href
                    }).catch(console.error);
                } else {
                    navigator.clipboard.writeText(`${text} ${window.location.href}`)
                        .then(() => alert('Link copied to clipboard!'))
                        .catch(console.error);
                }
            });
        }
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
        if (this.audio.src === '') {
            this.audio.src = CONFIG.STREAM_URL;
        }

        // Prevent rapid overlapping fades
        if (this.fadeInterval) clearInterval(this.fadeInterval);

        // Start with 0 volume
        const targetVolume = this.dom.volumeSlider ? parseInt(this.dom.volumeSlider.value, 10) / 100 : CONFIG.DEFAULT_VOLUME / 100;
        if (!this.hasLoaded) {
            this.audio.volume = targetVolume;
        } else {
            this.audio.volume = 0;
        }

        const playPromise = this.audio.play();

        return playPromise.then(() => {
            if (this.hasLoaded) {
                // Smooth fade in
                let currentVol = 0;
                this.fadeInterval = setInterval(() => {
                    currentVol += targetVolume / 20; // 50ms * 20 = 1000ms
                    if (currentVol >= targetVolume) {
                        currentVol = targetVolume;
                        clearInterval(this.fadeInterval);
                    }
                    this.audio.volume = currentVol;
                }, 50);
            }
            this.hasLoaded = true;
            this._onAudioPlay();
        }).catch((err) => {
            if (err.name !== 'AbortError') {
                console.error('Play failed:', err);
            }
            this._onAudioPause();
        });
    }

    _pause() {
        if (this.audio.paused && !this.hasLoaded) return;

        if (this.fadeInterval) clearInterval(this.fadeInterval);

        let currentVol = this.audio.volume;
        const fadeStep = currentVol / 20;

        this.fadeInterval = setInterval(() => {
            currentVol -= fadeStep;
            if (currentVol <= 0) {
                currentVol = 0;
                clearInterval(this.fadeInterval);
                this.audio.pause();
                this._onAudioPause();
            }
            this.audio.volume = currentVol;
        }, 50);
    }

    _setupAudioRecovery() {
        let recoveryTimer = null;
        let recoveryCount = 0;

        const attemptRecovery = (reason) => {
            if (this.audio.paused && !this.hasLoaded) return;
            if (recoveryTimer) return;

            if (recoveryCount >= 3) {
                console.warn(`Audio stream interrupted (${reason}). Max recovery attempts reached. Pausing.`);
                this._pause();
                recoveryCount = 0;
                return;
            }

            console.warn(`Audio stream interrupted (${reason}). Attempting recovery ${recoveryCount + 1}/3...`);

            recoveryTimer = setTimeout(() => {
                recoveryCount++;
                const wasPlaying = !this.audio.paused;

                // Append cache-busting timestamp to force fresh connection
                this.audio.src = CONFIG.STREAM_URL + '?t=' + Date.now();
                this.audio.load();

                if (wasPlaying) {
                    this._play();
                }

                recoveryTimer = null;
            }, 3000); // Wait 3 seconds before recovering
        };

        this.audio.addEventListener('error', () => attemptRecovery('error'));
        this.audio.addEventListener('stalled', () => attemptRecovery('stalled'));

        this.audio.addEventListener('playing', () => {
            setTimeout(() => {
                if (!this.audio.paused && !this.audio.error) {
                    recoveryCount = 0;
                }
            }, 5000);
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

        if (!this.visualizer && typeof ParticleVisualizer !== 'undefined') {
            this.visualizer = new ParticleVisualizer(this.audio);
        }
        if (this.visualizer) this.visualizer.start();
    }

    _onAudioPause() {
        if (this.dom.playerButton) {
            this.dom.playerButton.classList.remove('fa-pause-circle');
            this.dom.playerButton.classList.add('fa-play-circle');
            this.dom.playerButton.setAttribute('aria-label', 'Play');
        }
        this._updateMediaSessionPlaybackState('paused');

        if (this.visualizer) this.visualizer.stop();
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
       Helper Methods
       -------------------------------------------------------------------- */
    _formatMetadataString(str) {
        if (!str) return '';
        let formatted = str.replace(/_/g, ' ');
        formatted = formatted.split(' ').map(word => {
            if (!word) return '';
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(' ');
        return formatted;
    }

    _isJingleOrStab(song, artist) {
        const sLower = (song || '').toLowerCase();
        const aLower = (artist || '').toLowerCase();
        return sLower.includes('jingle') || aLower.includes('jingle') ||
            sLower.includes('stab') || aLower.includes('stab') ||
            sLower.includes('happy radio') || aLower.includes('happy radio');
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
            if (!data) throw new Error('Empty response from metadata API');

            const parsed = this._parseNowPlaying(data);
            let song = this._formatMetadataString(parsed.song || 'Unknown').trim();
            let artist = this._formatMetadataString(parsed.artist || 'Unknown').trim();

            if (song.toLowerCase().includes('happy radio')) {
                song = 'Happy Radio';
                artist = '';
            }

            if (song !== this.currentSongName) {
                // Manually maintain history since yesstreaming API does not provide it
                if (this.currentSongName && this.currentSongName !== 'Happy Radio' && this.currentSongName !== 'Unknown') {
                    const oldSongObj = {
                        song: this.currentSongName,
                        artist: this.currentArtistName || 'Unknown',
                        coverart: this.currentCoverartUrl || CONFIG.DEFAULT_COVER
                    };
                    const lastAdded = this.historyCache[this.historyCache.length - 1];
                    if (!lastAdded || lastAdded.song !== oldSongObj.song) {
                        this.historyCache.push(oldSongObj);
                    }
                }
                this.currentCoverartUrl = parsed.coverart;

                // Restore UI elements if recovering from fallback
                const historicSection = document.querySelector('.historic');
                if (historicSection) historicSection.classList.remove('d-none');
                const callLyrics = document.querySelector('.call-lyrics');
                if (callLyrics) {
                    callLyrics.classList.remove('d-none');
                    callLyrics.classList.add('d-flex');
                }

                document.title = `${song} ${artist ? '— ' + artist : ''} | ${CONFIG.RADIO_NAME}`;
                this._refreshCover(parsed.coverart);
                this._refreshCurrentSong(song, artist);
                this._refreshLyrics(song, artist);
                this._refreshHistory(parsed.history);
                this._startProgressBar(song, artist);
                this.currentSongName = song;
                this.currentArtistName = artist;

                this._updateMediaSessionMetadata(song, artist, parsed.coverart);
            }

            if (!this.hasLoaded) {
                this.hasLoaded = true;
                this._removeOverlay();
                this._play();
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.warn('Metadata fetch failed:', err.message);
            }
            if (!this.currentSongName || this.currentSongName === 'Happy Radio') {
                // Fallback UI if the load fails or is stuck
                const fallbackSong = 'Happy Radio';
                const fallbackArtist = 'Live Stream';
                document.title = `${fallbackSong} — ${fallbackArtist}`;
                this._refreshCurrentSong(fallbackSong, fallbackArtist);
                this.currentSongName = fallbackSong;
                this.currentArtistName = fallbackArtist;

                const historicSection = document.querySelector('.historic');
                if (historicSection) historicSection.classList.add('d-none');

                const callLyrics = document.querySelector('.call-lyrics');
                if (callLyrics) {
                    callLyrics.classList.remove('d-flex');
                    callLyrics.classList.add('d-none');
                }
            }
        } finally {
            if (!this.hasLoaded) {
                this.hasLoaded = true;
                this._removeOverlay();
                this._play();
            }
        }
    }

    _removeOverlay() {
        const overlay = document.getElementById('startupOverlay');
        if (overlay) {
            setTimeout(() => {
                overlay.style.opacity = '0';
                setTimeout(() => overlay.remove(), 3000);
            }, 1000);
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
            throw err;
        }
    }

    async _startProgressBar(song, artist) {
        const pContainer = document.getElementById('progressBarContainer');
        const pFill = document.getElementById('progressBarFill');
        const pTime = document.getElementById('progressTime');

        if (!song || !artist || song === 'Happy Radio' || song === 'Unknown' || !pContainer) {
            if (pContainer) pContainer.style.display = 'none';
            if (pTime) pTime.style.opacity = '0';
            if (this.progressInterval) clearInterval(this.progressInterval);
            return;
        }

        pContainer.style.display = 'block';
        pFill.style.width = '0%';
        pTime.style.opacity = '0';

        if (this.progressInterval) clearInterval(this.progressInterval);

        try {
            const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artist + ' ' + song)}&limit=1&media=music&entity=song`;
            const res = await fetch(url);
            const data = await res.json();
            const track = data.results && data.results[0] ? data.results[0] : null;

            if (track && track.trackTimeMillis) {
                const totalMs = track.trackTimeMillis;
                let elapsed = 0;

                document.getElementById('progressTotal').textContent = this._formatDuration(totalMs);
                pTime.style.opacity = '1';

                this.progressInterval = setInterval(() => {
                    elapsed += 1000;
                    if (elapsed > totalMs) elapsed = totalMs;

                    const percent = (elapsed / totalMs) * 100;
                    pFill.style.width = `${percent}%`;
                    document.getElementById('progressCurrent').textContent = this._formatDuration(elapsed);

                    if (elapsed >= totalMs) clearInterval(this.progressInterval);
                }, 1000);
            } else {
                pContainer.style.display = 'none';
            }
        } catch (err) {
            console.error('Progress bar fetch failed', err);
            pContainer.style.display = 'none';
        }
    }

    async _openHistoryModal(song, artist, defaultCover) {
        if (!window.$) return;
        $('#modalHistoryInfo').modal('show');
        document.getElementById('historyInfoLoading').style.display = 'block';
        document.getElementById('historyInfoContent').style.display = 'none';

        // Reset fields
        document.getElementById('historyInfoSong').textContent = song;
        document.getElementById('historyInfoArtist').textContent = artist;
        document.getElementById('historyInfoCover').src = defaultCover || CONFIG.DEFAULT_COVER;
        document.getElementById('historyInfoPreviewContainer').style.display = 'none';
        document.getElementById('historyInfoBioContainer').style.display = 'none';
        document.getElementById('historyInfoAppleLink').style.display = 'none';

        try {
            // Fetch iTunes Track Info
            let url = `https://itunes.apple.com/search?term=${encodeURIComponent(artist + ' ' + song)}&limit=1&media=music&entity=song`;
            let res = await fetch(url);
            let data = await res.json();

            const track = data.results && data.results[0] ? data.results[0] : null;

            if (track) {
                const cover = track.artworkUrl100 ? track.artworkUrl100.replace('100x100', '600x600') : defaultCover;
                document.getElementById('historyInfoCover').src = cover || CONFIG.DEFAULT_COVER;
                document.getElementById('historyInfoAlbum').textContent = track.collectionName || 'Unknown';
                document.getElementById('historyInfoYear').textContent = track.releaseDate ? new Date(track.releaseDate).getFullYear() : 'Unknown';
                document.getElementById('historyInfoGenre').textContent = track.primaryGenreName || 'Unknown';

                // Track Duration
                document.getElementById('historyInfoDuration').textContent = this._formatDuration(track.trackTimeMillis);

                // Audio Preview
                if (track.previewUrl) {
                    document.getElementById('historyInfoPreviewContainer').style.display = 'block';
                    document.getElementById('historyInfoPreviewAudio').src = track.previewUrl;
                }

                // Apple Music Link
                if (track.trackViewUrl) {
                    const appleLink = document.getElementById('historyInfoAppleLink');
                    appleLink.href = track.trackViewUrl;
                    appleLink.style.display = 'block';
                }
            } else {
                document.getElementById('historyInfoAlbum').textContent = 'Not Found on iTunes';
                document.getElementById('historyInfoYear').textContent = '-';
                document.getElementById('historyInfoGenre').textContent = '-';
                document.getElementById('historyInfoDuration').textContent = '-';
            }
        } catch (err) {
            console.error('Error fetching iTunes data:', err);
            document.getElementById('historyInfoAlbum').textContent = 'Network Error';
            document.getElementById('historyInfoYear').textContent = '-';
            document.getElementById('historyInfoGenre').textContent = '-';
            document.getElementById('historyInfoDuration').textContent = '-';
        }

        try {
            // Fetch Wikipedia Bio
            if (artist && artist !== 'Unknown' && artist !== '') {
                const bioUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&redirects=1&titles=${encodeURIComponent(artist)}&format=json&origin=*`;
                const bioRes = await fetch(bioUrl);
                const bioData = await bioRes.json();
                const pages = bioData.query.pages;
                const pageId = Object.keys(pages)[0];

                if (pageId !== '-1' && pages[pageId].extract) {
                    document.getElementById('historyInfoBio').textContent = pages[pageId].extract;
                    document.getElementById('historyInfoBioContainer').style.display = 'block';
                }
            }
        } catch (err) {
            console.error('Error fetching Wikipedia data:', err);
        }

        document.getElementById('historyInfoLoading').style.display = 'none';
        document.getElementById('historyInfoContent').style.display = 'block';
    }

    async _openArtistInfoModal(artist) {
        if (!window.$) return;
        $('#modalArtistInfo').modal('show');
        document.getElementById('artistInfoLoading').style.display = 'block';
        document.getElementById('artistInfoContent').style.display = 'none';

        try {
            const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&titles=${encodeURIComponent(artist)}&format=json&origin=*`;
            const res = await fetch(url);
            const data = await res.json();

            const pages = data.query.pages;
            const pageId = Object.keys(pages)[0];
            const extract = pages[pageId].extract;

            document.getElementById('artistInfoName').textContent = artist;

            if (pageId === '-1' || !extract) {
                document.getElementById('artistInfoBio').innerHTML = `<p>No biography found on Wikipedia for <strong>${this._escapeHtml(artist)}</strong>.</p>`;
            } else {
                document.getElementById('artistInfoBio').innerHTML = extract;
            }

            document.getElementById('artistInfoLoading').style.display = 'none';
            document.getElementById('artistInfoContent').style.display = 'block';
        } catch (err) {
            console.error('Error fetching Wikipedia data:', err);
            document.getElementById('artistInfoName').textContent = artist;
            document.getElementById('artistInfoBio').innerHTML = '<p class="text-danger">Network Error: Unable to fetch biography.</p>';
            document.getElementById('artistInfoLoading').style.display = 'none';
            document.getElementById('artistInfoContent').style.display = 'block';
        }
    }

    /* --------------------------------------------------------------------
       Metadata parsers
       -------------------------------------------------------------------- */
    _formatDuration(ms) {
        if (!ms) return 'Unknown';
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    _parseNowPlaying(data) {
        let song = null;
        let artist = null;
        let history = [];

        if (!data || typeof data !== 'object') {
            return { song: 'Unknown', artist: 'Unknown', history: [] };
        }

        // 1) Direct fields: title, songtitle + artist
        if (data.title) {
            song = data.title;
            if (typeof data.artist === 'string') artist = data.artist;
        } else if (data.songtitle) {
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

        let isJingle = this._isJingleOrStab(song, artist);

        if (isJingle) {
            this.lastJingleTimestamp = Date.now();
        }

        if (isJingle || (Date.now() - this.lastJingleTimestamp < 5000)) {
            song = 'Happy Radio';
            artist = '';
            data.coverart = CONFIG.DEFAULT_COVER;
        }

        // History parsing
        history = this._parseHistoryArray(data.trackhistory || data.song_history || data.history || data.playlist, data.covers);

        // YesStreaming provides a relative albumArtUrl
        let coverart = data.coverart || CONFIG.DEFAULT_COVER;
        if (data.albumArtUrl) {
            let absoluteUrl = data.albumArtUrl;
            if (!absoluteUrl.startsWith('http')) {
                absoluteUrl = `https://hq3.yesstreaming.net${data.albumArtUrl}`;
            }
            // Route through our CORS proxy to allow canvas color extraction
            coverart = `/api/album-art?url=${encodeURIComponent(absoluteUrl)}`;
        }

        return {
            song: song || 'Unknown',
            artist: artist || 'Unknown',
            coverart: coverart,
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

            if (this._isJingleOrStab(parsedSong, parsedArtist)) {
                parsedSong = 'Happy Radio';
                parsedArtist = '';
            }

            let parsedCover = covers[index] || CONFIG.DEFAULT_COVER;
            if (item && item.albumArtUrl) {
                let absoluteUrl = item.albumArtUrl;
                if (!absoluteUrl.startsWith('http')) {
                    absoluteUrl = `https://hq3.yesstreaming.net${item.albumArtUrl}`;
                }
                parsedCover = `/api/album-art?url=${encodeURIComponent(absoluteUrl)}`;
            }

            return {
                song: parsedSong,
                artist: parsedArtist,
                coverart: parsedCover
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

        songEl.classList.remove('slide-down-in', 'animated');
        songEl.classList.add('animated', 'slide-up-out');
        artistEl.classList.remove('slide-down-in', 'animated');
        artistEl.classList.add('animated', 'slide-up-out');

        setTimeout(() => {
            songEl.textContent = song;
            artistEl.textContent = artist;
            lyricsTitleEl.textContent = artist ? `${song} — ${artist}` : song;

            songEl.classList.remove('slide-up-out');
            songEl.classList.add('slide-down-in');
            artistEl.classList.remove('slide-up-out');
            artistEl.classList.add('slide-down-in');

            const artistInfoBtn = document.getElementById('artistInfoBtn');
            if (artistInfoBtn) {
                artistInfoBtn.onclick = (e) => {
                    e.preventDefault();
                    this._openArtistInfoModal(artist);
                };
            }

            const lyricsBtn = document.querySelector('.lyrics[data-target="#modalLyrics"]');
            if (lyricsBtn) {
                lyricsBtn.onclick = () => {
                    this._loadLyrics(song, artist);
                };
            }
        }, 1200);
    }

    _getAverageColor(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 50;
                canvas.height = 50;
                ctx.drawImage(img, 0, 0, 50, 50);

                try {
                    const data = ctx.getImageData(0, 0, 50, 50).data;
                    let r = 0, g = 0, b = 0, count = 0;
                    for (let i = 0; i < data.length; i += 4) {
                        // skip fully transparent pixels
                        if (data[i + 3] > 0) {
                            r += data[i];
                            g += data[i + 1];
                            b += data[i + 2];
                            count++;
                        }
                    }
                    if (count === 0) resolve('#1a1a2e');
                    else resolve(`rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`);
                } catch (e) {
                    resolve('#1a1a2e');
                }
            };
            img.onerror = () => resolve('#1a1a2e');
            img.src = url;
        });
    }

    _refreshCover(coverartUrl) {
        if (!this.dom.currentCoverArt || !this.dom.bgCover) return;

        const cover = this.dom.currentCoverArt;
        const currentBg = cover.style.backgroundImage;
        if (currentBg && currentBg.includes(coverartUrl)) return;

        // Fade out
        cover.style.opacity = '0';

        setTimeout(async () => {
            cover.style.backgroundImage = `url('${coverartUrl}')`;

            // Get dominant color and apply
            const dominantColor = await this._getAverageColor(coverartUrl);
            document.documentElement.style.setProperty('--ambient-color', dominantColor);

            // Fade in
            cover.style.opacity = '1';
        }, 1200);
    }

    _refreshHistory(historyArray) {
        if (!this.dom.historicSong) return;

        const historicSection = document.querySelector('.historic');
        if (historicSection) historicSection.classList.remove('d-none'); // Restore if hidden

        const incoming = (Array.isArray(historyArray) ? historyArray : []).slice().reverse();

        if (this.historyCache.length === 0 && incoming.length === 0) {
            this.dom.historicSong.innerHTML = '<p class="text-white opacity-50 mb-0">No history available</p>';
            return;
        }

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
            article.classList.add('col-12', 'col-md-6', 'historic-item');
            article.dataset.id = uniqueId;
            article.innerHTML = `
                <div class="cover-historic" style="background-image: url('${info.coverart || CONFIG.DEFAULT_COVER}');"></div>
                <div class="music-info">
                    <p class="song">${this._escapeHtml(songTitle)}</p>
                    <p class="artist">${this._escapeHtml(songArtist)}</p>
                </div>
            `;

            article.addEventListener('click', () => {
                this._openHistoryModal(songTitle, songArtist, info.coverart);
            });

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

    _refreshLyrics(song, artist) {
        if (!this.dom.lyricsButton || !this.dom.lyric) return;

        if (!song || !artist || song === 'Unknown' || artist === 'Unknown') {
            this._disableLyrics();
            return;
        }

        this.dom.lyricsButton.style.opacity = '1';
        this.dom.lyricsButton.style.pointerEvents = 'auto';

        this.lyricsCacheSong = null;
        if (this.dom.lyricsSong) this.dom.lyricsSong.textContent = `${song} — ${artist}`;
        this.dom.lyric.innerHTML = '<div class="text-center my-4"><i class="fa fa-spinner fa-spin fa-3x mb-3" style="color: #00E1E7;"></i><p>Fetching lyrics...</p></div>';
    }

    async _loadLyrics(song, artist) {
        if (!this.dom.lyric) return;
        if (this.lyricsCacheSong === song) return; // already loaded or loading

        this.lyricsCacheSong = song;

        try {
            const response = await this._fetchWithTimeout(
                `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(song)}`,
                5000
            );
            if (response && response.lyrics) {
                this.dom.lyric.innerHTML = this._escapeHtml(response.lyrics).replace(/\n/g, '<br>');
                this._enableLyrics();
            } else {
                this.dom.lyric.innerHTML = '<p class="text-warning text-center mt-3">No lyrics found for this track.</p>';
            }
        } catch (err) {
            console.error('Lyrics fetch failed:', err);
            this.dom.lyric.innerHTML = '<p class="text-danger text-center mt-3">Failed to load lyrics. Please try again later.</p>';
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
