const RADIO_NAME = 'Happy Radio';

// Stream URL and metadata endpoint
const STREAM_URL = 'https://hello.citrus3.com:2020/stream/happyradio';
const METADATA_API_URL = 'https://hello.citrus3.com:2020/json/stream/happyradio';

let currentSongName = null;
const coverCache = {};

// Wait for DOM load
window.addEventListener('load', () => {
    const page = new Page();
    page.updatePageTitle();
    page.setVolume();

    // Fetch streaming data immediately and then poll
    getStreamingData();
    setInterval(getStreamingData, 10000);

    // Set album cover height to its width (if present)
    const coverArt = document.querySelector('.cover-album');
    if (coverArt) {
        coverArt.style.height = `${coverArt.offsetWidth}px`;
    } else {
        console.warn("Element .cover-album not found.");
    }

    // Setup play button (user gesture required for audio playback)
    const playButton = document.getElementById('playerButton');
    if (playButton) {
        playButton.addEventListener('click', function() {
            togglePlay();
        });
    }
});

// Page and UI control
class Page {
    updatePageTitle(title = RADIO_NAME) {
        document.title = title;
    }

    refreshCurrentSong(song, artist) {
        const songElem = document.getElementById('currentSong');
        const artistElem = document.getElementById('currentArtist');
        const lyricsTitleElem = document.getElementById('lyricsSong');
        if (!songElem || !artistElem || !lyricsTitleElem) return;

        if (song !== songElem.textContent || artist !== artistElem.textContent) {
            songElem.classList.add('fade-out');
            artistElem.classList.add('fade-out');
            setTimeout(() => {
                songElem.textContent = song;
                artistElem.textContent = artist;
                lyricsTitleElem.textContent = song + ' - ' + artist;
                songElem.classList.remove('fade-out');
                songElem.classList.add('fade-in');
                artistElem.classList.remove('fade-out');
                artistElem.classList.add('fade-in');
            }, 500);
            setTimeout(() => {
                songElem.classList.remove('fade-in');
                artistElem.classList.remove('fade-in');
            }, 1000);
        }
    }

    async refreshHistoryItem(info, n) {
        const historyArticles = document.querySelectorAll("#historicSong article");
        const songFields = document.querySelectorAll("#historicSong article .music-info .song");
        const artistFields = document.querySelectorAll("#historicSong article .music-info .artist");
        const coverFields = document.querySelectorAll("#historicSong article .cover-historic");
        const defaultCover = "img/cover.png";

        const songTitle = typeof info.song === "object" ? info.song.title : info.song;
        const songArtist = typeof info.artist === "object" ? info.artist.title : info.artist;

        if (songFields[n]) songFields[n].textContent = songTitle || "Unknown";
        if (artistFields[n]) artistFields[n].textContent = songArtist || "Unknown";

        try {
            const data = await getCoverDataFromITunes(songArtist, songTitle, defaultCover, defaultCover);
            if (coverFields[n]) coverFields[n].style.backgroundImage = "url(" + (data.art || defaultCover) + ")";
        } catch (error) {
            if (coverFields[n]) coverFields[n].style.backgroundImage = "url(" + defaultCover + ")";
        }

        if (historyArticles[n]) {
            historyArticles[n].classList.add("animated", "slideInRight");
            setTimeout(() => historyArticles[n].classList.remove("animated", "slideInRight"), 2000);
        }
    }

    async refreshCover(song = '', artist) {
        const coverArt = document.getElementById('currentCoverArt');
        const coverBackground = document.getElementById('bgCover');
        const defaultCover = 'img/cover.png';
        if (!coverArt || !coverBackground) return;
        try {
            const data = await getCoverDataFromITunes(artist, song, defaultCover, defaultCover);
            coverArt.style.backgroundImage = 'url(' + data.art + ')';
            coverBackground.style.backgroundImage = 'url(' + data.cover + ')';
            coverArt.classList.add('animated', 'bounceInLeft');
            setTimeout(() => coverArt.classList.remove('animated', 'bounceInLeft'), 2000);

            if ('mediaSession' in navigator) {
                const artwork = [
                    { src: data.art, sizes: '96x96', type: 'image/png' },
                    { src: data.art, sizes: '128x128', type: 'image/png' },
                    { src: data.art, sizes: '192x192', type: 'image/png' },
                    { src: data.art, sizes: '256x256', type: 'image/png' },
                    { src: data.art, sizes: '384x384', type: 'image/png' },
                    { src: data.art, sizes: '512x512', type: 'image/png' }
                ];
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: song,
                    artist: artist,
                    artwork
                });
            }
        } catch (error) {
            // Silent on cover errors
        }
    }

    updateVolumeIndicator(volume) {
        const volIndicator = document.getElementById('volIndicator');
        if (volIndicator) volIndicator.textContent = volume;
        if (typeof Storage !== 'undefined') {
            localStorage.setItem('volume', volume);
        }
    }

    setVolume() {
        if (typeof Storage !== 'undefined') {
            const volumeFromStorage = localStorage.getItem('volume') || 80;
            const volumeElem = document.getElementById('volume');
            const volIndicator = document.getElementById('volIndicator');
            if (volumeElem) volumeElem.value = volumeFromStorage;
            if (volIndicator) volIndicator.textContent = volumeFromStorage;
        }
    }

    async refreshLyrics(currentSong, currentArtist) {
        const lyricsButton = document.getElementsByClassName('lyrics')[0];
        const lyricsBox = document.getElementById('lyric');
        if (!lyricsButton || !lyricsBox) return;

        // Only try when we have valid artist and title
        if (!currentSong || !currentArtist || currentSong === "Unknown" || currentArtist === "Unknown") {
            lyricsButton.style.opacity = "0.3";
            lyricsButton.classList.add('disabled');
            lyricsButton.style.pointerEvents = 'none';
            lyricsBox.innerHTML = "";
            return;
        }

        try {
            const response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(currentArtist)}/${encodeURIComponent(currentSong)}`);
            // ensure we got JSON back
            if (!response.ok) throw new Error('Lyrics not found');
            const contentType = response.headers.get("content-type") || "";
            if (!contentType.includes("application/json")) throw new Error('Unexpected response');
            const data = await response.json();
            if (data && data.lyrics) {
                lyricsBox.innerHTML = data.lyrics.replace(/\n/g, '<br />');
                lyricsButton.style.opacity = "1";
                lyricsButton.classList.remove('disabled');
                lyricsButton.style.pointerEvents = 'auto';
            } else {
                lyricsButton.style.opacity = "0.3";
                lyricsButton.classList.add('disabled');
                lyricsButton.style.pointerEvents = 'none';
                lyricsBox.innerHTML = "";
            }
        } catch (error) {
            lyricsButton.style.opacity = "0.3";
            lyricsButton.classList.add('disabled');
            lyricsButton.style.pointerEvents = 'none';
            lyricsBox.innerHTML = "";
        }
    }
}

// Helpers to parse metadata payloads safely
function parseNowPlaying(data) {
    // Return object: { song: stringTitle, artist: stringArtist, history: array }
    let song = null;
    let artist = null;
    let history = [];

    // Common shapes:
    // 1) { songtitle: "Title", artist: "Artist", song_history: [...] }
    if (data.songtitle && (data.artist || data.song)) {
        song = data.songtitle;
        if (data.artist && typeof data.artist === 'string') {
            artist = data.artist;
        } else if (data.artist && typeof data.artist === 'object' && data.artist.title) {
            artist = data.artist.title;
        } else if (typeof data.song === 'object' && data.song.artist) {
            artist = data.song.artist;
        }
    }

    // 2) { song: "Artist - Title" } or { song: "Title - Artist" } sometimes
    if ((!song || !artist) && data.song && typeof data.song === 'string') {
        // Try to split by " - " expecting "Artist - Title" or "Title - Artist"
        const parts = data.song.split(' - ').map(s => s.trim());
        if (parts.length === 2) {
            // Attempt heuristic: if first part contains commas or multiple words, treat as artist
            artist = parts[0];
            song = parts[1];
        } else {
            song = data.song;
        }
    }

    // 3) { song: { title: "...", artist: "..." } }
    if ((!song || !artist) && typeof data.song === 'object' && data.song !== null) {
        if (!song && data.song.title) song = data.song.title;
        if (!artist && (data.song.artist || data.song.artists)) artist = data.song.artist || data.song.artists;
    }

    // 4) other fields: now_playing, current, current_track
    if ((!song || !artist) && data.now_playing) {
        if (!song && data.now_playing.title) song = data.now_playing.title;
        if (!artist && data.now_playing.artist) artist = data.now_playing.artist;
    }
    if ((!song || !artist) && data.current_track) {
        if (!song && data.current_track.title) song = data.current_track.title;
        if (!artist && data.current_track.artist) artist = data.current_track.artist;
    }

    // History possibilities: data.song_history (array of objects), data.history (array), data.playlist
    if (Array.isArray(data.song_history)) {
        history = data.song_history.map(item => {
            if (typeof item === 'string') {
                const parts = item.split(' - ').map(s => s.trim());
                if (parts.length === 2) return { song: parts[1], artist: parts[0] };
                return { song: item, artist: 'Unknown' };
            } else if (item && item.song) {
                if (typeof item.song === 'object') {
                    return { song: item.song.title || 'Unknown', artist: item.song.artist || 'Unknown' };
                } else {
                    // item.song might be a string "Artist - Title"
                    const parts = String(item.song).split(' - ').map(s => s.trim());
                    if (parts.length === 2) return { song: parts[1], artist: parts[0] };
                    return { song: String(item.song), artist: item.artist || 'Unknown' };
                }
            } else if (item && item.title) {
                return { song: item.title, artist: item.artist || 'Unknown' };
            } else {
                return { song: 'Unknown', artist: 'Unknown' };
            }
        });
    } else if (Array.isArray(data.history)) {
        history = data.history.map(item => {
            if (typeof item === 'string') {
                const parts = item.split(' - ').map(s => s.trim());
                if (parts.length === 2) return { song: parts[1], artist: parts[0] };
                return { song: item, artist: 'Unknown' };
            } else if (item && item.song && item.artist) {
                return { song: item.song, artist: item.artist };
            } else if (item && item.title) {
                return { song: item.title, artist: item.artist || 'Unknown' };
            } else {
                return { song: 'Unknown', artist: 'Unknown' };
            }
        });
    } else if (Array.isArray(data.playlist)) {
        history = data.playlist.map(item => {
            if (typeof item === 'string') {
                const parts = item.split(' - ').map(s => s.trim());
                if (parts.length === 2) return { song: parts[1], artist: parts[0] };
                return { song: item, artist: 'Unknown' };
            } else if (item && item.title) {
                return { song: item.title, artist: item.artist || 'Unknown' };
            } else {
                return { song: 'Unknown', artist: 'Unknown' };
            }
        });
    }

    // Normalize defaults
    if (!song) song = "Unknown";
    if (!artist) artist = "Unknown";

    return { song, artist, history };
}

// Main streaming data fetch
async function getStreamingData() {
    try {
        const data = await fetchStreamingData(METADATA_API_URL);
        if (!data) return;

        const parsed = parseNowPlaying(data);
        const page = new Page();

        const safeSong = (parsed.song || "Unknown").trim();
        const safeArtist = (parsed.artist || "Unknown").trim();

        if (safeSong !== currentSongName) {
            document.title = `${safeSong} - ${safeArtist} | ${RADIO_NAME}`;
            page.refreshCover(safeSong, safeArtist);
            page.refreshCurrentSong(safeSong, safeArtist);
            page.refreshLyrics(safeSong, safeArtist);

            const historyContainer = document.getElementById("historicSong");
            if (historyContainer) historyContainer.innerHTML = "";

            const historyArray = Array.isArray(parsed.history) ? parsed.history.slice(-4) : [];
            for (let i = 0; i < historyArray.length; i++) {
                const songInfo = historyArray[i];
                const article = document.createElement("article");
                article.classList.add("col-12", "col-md-6");
                article.innerHTML = `
                    <div class="cover-historic" style="background-image: url('img/cover.png');"></div>
                    <div class="music-info">
                      <p class="song">${songInfo.song || "Unknown"}</p>
                      <p class="artist">${songInfo.artist || "Unknown"}</p>
                    </div>
                  `;
                if (historyContainer) historyContainer.appendChild(article);
                try {
                    page.refreshHistoryItem(songInfo, i);
                } catch (error) {
                    // ignore
                }
            }

            currentSongName = safeSong;
        }
    } catch (error) {
        // ignore streaming errors silently
    }
}

// Safe fetch wrapper for metadata
async function fetchStreamingData(apiUrl) {
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`API request error: ${response.status} ${response.statusText}`);
        return await response.json();
    } catch {
        return null;
    }
}

// Change iTunes image size helper
function changeImageSize(url, size) {
    if (!url) return url;
    const parts = url.split("/");
    const filename = parts.pop();
    const newFilename = `${size}${filename.substring(filename.lastIndexOf("."))}`;
    return parts.join("/") + "/" + newFilename;
}

// Get cover/thumbnail data from iTunes (cached)
const getCoverDataFromITunes = async (artist, title, defaultArt, defaultCover) => {
    const searchText = (artist === title) ? title : `${artist} - ${title}`;
    const cacheKey = String(searchText || '').toLowerCase();
    if (coverCache[cacheKey]) {
        return coverCache[cacheKey];
    }

    try {
        const response = await fetch(`https://itunes.apple.com/search?limit=1&term=${encodeURIComponent(searchText)}`);
        if (response.status === 403) {
            return { title, artist, art: defaultArt, cover: defaultCover, stream_url: "#not-found" };
        }
        const data = response.ok ? await response.json() : {};
        if (!data.results || data.results.length === 0) {
            return { title, artist, art: defaultArt, cover: defaultCover, stream_url: "#not-found" };
        }
        const itunes = data.results[0];
        const results = {
            title: title,
            artist: artist,
            thumbnail: itunes.artworkUrl100 || defaultArt,
            art: itunes.artworkUrl100 ? changeImageSize(itunes.artworkUrl100, "600x600") : defaultArt,
            cover: itunes.artworkUrl100 ? changeImageSize(itunes.artworkUrl100, "1500x1500") : defaultCover,
            stream_url: "#not-found"
        };
        coverCache[cacheKey] = results;
        return results;
    } catch (err) {
        return { title, artist, art: defaultArt, cover: defaultCover, stream_url: "#not-found" };
    }
};

// --- AUDIO CONTROLS ---
var audio = new Audio(STREAM_URL);

class Player {
    play() {
        // Must be called from a user gesture
        audio.play();
        const defaultVolume = (document.getElementById('volume') && document.getElementById('volume').value) || 80;
        const storedVolume = (typeof Storage !== 'undefined' && localStorage.getItem('volume')) || defaultVolume;
        audio.volume = intToDecimal(storedVolume);
        const volIndicator = document.getElementById('volIndicator');
        if (volIndicator) volIndicator.innerHTML = storedVolume;
    }
    pause() {
        audio.pause();
    }
}

audio.onplay = function () {
    const button = document.getElementById('playerButton');
    if (button && button.className === 'fa fa-play') button.className = 'fa fa-pause';
};
audio.onpause = function () {
    const button = document.getElementById('playerButton');
    if (button && button.className === 'fa fa-pause') button.className = 'fa fa-play';
};
audio.onvolumechange = function () {
    if (audio.volume > 0) audio.muted = false;
};
audio.onerror = function () {
    const confirmed = confirm('Stream Down / Network Error.\nClick OK to try again.');
    if (confirmed) window.location.reload();
};

// Volume slider event
const volumeElem = document.getElementById('volume');
if (volumeElem) {
    volumeElem.oninput = function () {
        audio.volume = intToDecimal(this.value);
        const page = new Page();
        page.updateVolumeIndicator(this.value);
    };
}

function togglePlay() {
    const playerButton = document.getElementById("playerButton");
    if (!playerButton) return;
    const isPlaying = playerButton.classList.contains("fa-pause-circle");
    if (isPlaying) {
        playerButton.classList.remove("fa-pause-circle");
        playerButton.classList.add("fa-play-circle");
        playerButton.style.textShadow = "0 0 5px black";
        audio.pause();
    } else {
        playerButton.classList.remove("fa-play-circle");
        playerButton.classList.add("fa-pause-circle");
        playerButton.style.textShadow = "0 0 5px black";
        audio.load();
        audio.play().catch(err => {
            // play() may fail if not called directly by user gesture; ignore
            console.warn('Audio play failed (gesture required):', err);
        });
    }
}

function volumeUp() {
    const vol = audio.volume;
    if (audio && vol >= 0 && vol < 1) {
        audio.volume = Math.min(1, (parseFloat(vol) + 0.01));
    }
}
function volumeDown() {
    const vol = audio.volume;
    if (audio && vol > 0) {
        audio.volume = Math.max(0, (parseFloat(vol) - 0.01));
    }
}
function mute() {
    if (!audio.muted) {
        const volIndicator = document.getElementById('volIndicator');
        const volumeInput = document.getElementById('volume');
        if (volIndicator) volIndicator.innerHTML = 0;
        if (volumeInput) volumeInput.value = 0;
        audio.volume = 0;
        audio.muted = true;
    } else {
        const storedVolume = localStorage.getItem('volume') || 80;
        const volIndicator = document.getElementById('volIndicator');
        const volumeInput = document.getElementById('volume');
        if (volIndicator) volIndicator.innerHTML = storedVolume;
        if (volumeInput) volumeInput.value = storedVolume;
        audio.volume = intToDecimal(storedVolume);
        audio.muted = false;
    }
}

document.addEventListener('keydown', function (event) {
    const key = event.key;
    const slideVolume = document.getElementById('volume');
    const page = new Page();

    switch (key) {
        case 'ArrowUp':
            volumeUp();
            if (slideVolume) slideVolume.value = decimalToInt(audio.volume);
            page.updateVolumeIndicator(decimalToInt(audio.volume));
            break;
        case 'ArrowDown':
            volumeDown();
            if (slideVolume) slideVolume.value = decimalToInt(audio.volume);
            page.updateVolumeIndicator(decimalToInt(audio.volume));
            break;
        case ' ':
        case 'Spacebar':
        case 'p':
        case 'P':
            togglePlay();
            break;
        case 'm':
        case 'M':
            mute();
            break;
        case '0': case '1': case '2': case '3': case '4':
        case '5': case '6': case '7': case '8': case '9':
            const volumeValue = parseInt(key);
            audio.volume = volumeValue / 10;
            if (slideVolume) slideVolume.value = volumeValue * 10;
            page.updateVolumeIndicator(volumeValue * 10);
            break;
    }
});

function intToDecimal(vol) {
    return Number(vol) / 100;
}
function decimalToInt(vol) {
    return Number(vol) * 100;
}
