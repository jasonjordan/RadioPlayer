const RADIO_NAME = 'Happy Radio';

// Change the stream URL here. Supports: ICECAST, ZENO, SHOUTCAST, RADIOJAR, or any stream service.
const STREAM_URL = 'https://hello.citrus3.com:2020/stream/happyradio';

// Streaming Data API URLs
const STREAM_API_URL = 'https://twj.es/free/?url=' + STREAM_URL;
const FALLBACK_STREAM_API_URL = 'https://twj.es/metadata/?url=' + STREAM_URL;

let userInteracted = true;
let currentSongName = null;

// Cache for iTunes API results
const coverCache = {};

window.addEventListener('load', () => {
    const page = new Page();
    page.updatePageTitle();
    page.setVolume();

    const player = new Player();
    player.play();

    // Immediately fetch streaming data
    getStreamingData();

    // Update streaming data every 10 seconds
    setInterval(getStreamingData, 10000);

    // Set cover album height to its width
    const coverArt = document.querySelector('.cover-album');
    if (coverArt) {
        coverArt.style.height = `${coverArt.offsetWidth}px`;
    } else {
        console.warn("Element .cover-album not found.");
    }
});

// Page/UI control
class Page {
    constructor() {
        this.updatePageTitle = function(title = RADIO_NAME) {
            document.title = title;
        };

        this.refreshCurrentSong = function(song, artist) {
            const songElem = document.getElementById('currentSong');
            const artistElem = document.getElementById('currentArtist');
            const lyricsTitleElem = document.getElementById('lyricsSong');

            if (song !== songElem.textContent || artist !== artistElem.textContent) {
                // Fade out current content
                songElem.classList.add('fade-out');
                artistElem.classList.add('fade-out');

                setTimeout(function() {
                    // Update after fade out
                    songElem.textContent = song;
                    artistElem.textContent = artist;
                    lyricsTitleElem.textContent = song + ' - ' + artist;

                    // Fade in
                    songElem.classList.remove('fade-out');
                    songElem.classList.add('fade-in');
                    artistElem.classList.remove('fade-out');
                    artistElem.classList.add('fade-in');
                }, 500);

                setTimeout(function() {
                    songElem.classList.remove('fade-in');
                    artistElem.classList.remove('fade-in');
                }, 1000);
            }
        };

        this.refreshHistoryItem = async function(info, n) {
            const historyArticles = document.querySelectorAll("#historicSong article");
            const songFields = document.querySelectorAll("#historicSong article .music-info .song");
            const artistFields = document.querySelectorAll("#historicSong article .music-info .artist");
            const coverFields = document.querySelectorAll("#historicSong article .cover-historic");

            const defaultCover = "img/cover.png";
            const songTitle = typeof info.song === "object" ? info.song.title : info.song;
            const songArtist = typeof info.artist === "object" ? info.artist.title : info.artist;

            songFields[n].textContent = songTitle || "Unknown";
            artistFields[n].textContent = songArtist || "Unknown";

            try {
                const data = await getCoverDataFromITunes(songArtist, songTitle, defaultCover, defaultCover);
                coverFields[n].style.backgroundImage = "url(" + (data.art || defaultCover) + ")";
            } catch (error) {
                console.log("Error fetching cover from iTunes:", error);
                coverFields[n].style.backgroundImage = "url(" + defaultCover + ")";
            }

            // Animate
            historyArticles[n].classList.add("animated", "slideInRight");
            setTimeout(() => historyArticles[n].classList.remove("animated", "slideInRight"), 2000);
        };

        this.refreshCover = async function(song = '', artist) {
            const coverArt = document.getElementById('currentCoverArt');
            const coverBackground = document.getElementById('bgCover');
            const defaultCover = 'img/cover.png';

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
                        { src: data.art, sizes: '512x512', type: 'image/png' },
                    ];
                    navigator.mediaSession.metadata = new MediaMetadata({
                        title: song,
                        artist: artist,
                        artwork
                    });
                }
            } catch (error) {
                console.log("Error fetching cover data from iTunes:", error);
            }
        };

        this.updateVolumeIndicator = function(volume) {
            document.getElementById('volIndicator').textContent = volume;
            if (typeof Storage !== 'undefined') {
                localStorage.setItem('volume', volume);
            }
        };

        this.setVolume = function() {
            if (typeof Storage !== 'undefined') {
                const volumeFromStorage = localStorage.getItem('volume') || 80;
                document.getElementById('volume').value = volumeFromStorage;
                document.getElementById('volIndicator').textContent = volumeFromStorage;
            }
        };

        this.refreshLyrics = async function (currentSong, currentArtist) {
            const lyricsButton = document.getElementsByClassName('lyrics')[0];
            try {
                const response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(currentArtist)}/${encodeURIComponent(currentSong)}`);
                const data = await response.json();

                if (data.lyrics) {
                    document.getElementById('lyric').innerHTML = data.lyrics.replace(/\n/g, '<br />');
                    lyricsButton.style.opacity = "1";
                    lyricsButton.classList.remove('disabled');
                    lyricsButton.style.pointerEvents = 'auto';
                } else {
                    lyricsButton.style.opacity = "0.3";
                    lyricsButton.classList.add('disabled');
                    lyricsButton.style.pointerEvents = 'none';
                }
            } catch (error) {
                console.log("Error fetching lyrics from Open-Lyrics API:", error);
                lyricsButton.style.opacity = "0.3";
                lyricsButton.classList.add('disabled');
                lyricsButton.style.pointerEvents = 'none';
            }
        };
    }
}

async function getStreamingData() {
    try {
        let data = await fetchStreamingData(STREAM_API_URL);
        if (!data) {
            data = await fetchStreamingData(FALLBACK_STREAM_API_URL);
        }

        if (data) {
            const page = new Page();
            const currentSong = data.songtitle || (typeof data.song === "object" ? data.song.title : data.song);
            const currentArtist = typeof data.artist === "object" ? data.artist.title : data.artist;

            const safeSong = (currentSong || "").replace(/'/g, "'").replace(/&/g, "&");
            const safeArtist = (currentArtist || "").replace(/'/g, "'").replace(/&/g, "&");

            if (safeSong !== currentSongName) {
                document.title = `${safeSong} - ${safeArtist} | ${RADIO_NAME}`;

                page.refreshCover(safeSong, safeArtist);
                page.refreshCurrentSong(safeSong, safeArtist);
                page.refreshLyrics(safeSong, safeArtist);

                const historyContainer = document.getElementById("historicSong");
                historyContainer.innerHTML = "";

                const historyArr = data.song_history
                    ? data.song_history.map((item) => ({ song: item.song.title, artist: item.song.artist }))
                    : data.history;

                const maxSongs = 4;
                const limitedHistory = historyArr.slice(Math.max(0, historyArr.length - maxSongs));

                for (let i = 0; i < limitedHistory.length; i++) {
                    const songInfo = limitedHistory[i];
                    const article = document.createElement("article");
                    article.classList.add("col-12", "col-md-6");
                    article.innerHTML = `
                        <div class="cover-historic" style="background-image: url('img/cover.png');"></div>
                        <div class="music-info">
                          <p class="song">${songInfo.song || "Unknown"}</p>
                          <p class="artist">${songInfo.artist || "Unknown"}</p>
                        </div>
                      `;
                    historyContainer.appendChild(article);
                    try {
                        page.refreshHistoryItem(songInfo, i);
                    } catch (error) {
                        console.error("Error refreshing song in history:", error);
                    }
                }
                currentSongName = safeSong;
            }
        }
    } catch (error) {
        console.log("Error fetching streaming data:", error);
    }
}

// Fetch streaming data from an API endpoint
async function fetchStreamingData(apiUrl) {
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`API request error: ${response.status} ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.log("Error fetching stream data from API:", error);
        return null;
    }
}

// Change iTunes image size
function changeImageSize(url, size) {
    const parts = url.split("/");
    const filename = parts.pop();
    const newFilename = `${size}${filename.substring(filename.lastIndexOf("."))}`;
    return parts.join("/") + "/" + newFilename;
}

// Get data from iTunes API
const getCoverDataFromITunes = async (artist, title, defaultArt, defaultCover) => {
    let searchText;
    if (artist === title) {
        searchText = `${title}`;
    } else {
        searchText = `${artist} - ${title}`;
    }
    const cacheKey = searchText.toLowerCase();
    if (coverCache[cacheKey]) {
        return coverCache[cacheKey];
    }

    const response = await fetch(`https://itunes.apple.com/search?limit=1&term=${encodeURIComponent(searchText)}`);
    if (response.status === 403) {
        return {
            title,
            artist,
            art: defaultArt,
            cover: defaultCover,
            stream_url: "#not-found",
        };
    }
    const data = response.ok ? await response.json() : {};
    if (!data.results || data.results.length === 0) {
        return {
            title,
            artist,
            art: defaultArt,
            cover: defaultCover,
            stream_url: "#not-found",
        };
    }
    const itunes = data.results[0];
    const results = {
        title: title,
        artist: artist,
        thumbnail: itunes.artworkUrl100 || defaultArt,
        art: itunes.artworkUrl100 ? changeImageSize(itunes.artworkUrl100, "600x600") : defaultArt,
        cover: itunes.artworkUrl100 ? changeImageSize(itunes.artworkUrl100, "1500x1500") : defaultCover,
        stream_url: "#not-found",
    };
    coverCache[cacheKey] = results;
    return results;
};

// AUDIO

// Global audio element
var audio = new Audio(STREAM_URL);

// Player control class
class Player {
    constructor() {
        this.play = function () {
            audio.play();

            var defaultVolume = document.getElementById('volume').value;
            if (typeof (Storage) !== 'undefined') {
                if (localStorage.getItem('volume') !== null) {
                    audio.volume = intToDecimal(localStorage.getItem('volume'));
                } else {
                    audio.volume = intToDecimal(defaultVolume);
                }
            } else {
                audio.volume = intToDecimal(defaultVolume);
            }
            document.getElementById('volIndicator').innerHTML = defaultVolume;
            togglePlay();
        };

        this.pause = function () {
            audio.pause();
        };
    }
}

// Play and pause event bindings
audio.onplay = function () {
    var button = document.getElementById('playerButton');
    var buttonPlay = document.getElementById('buttonPlay');
    if (button.className === 'fa fa-play') {
        button.className = 'fa fa-pause';
        buttonPlay.firstChild.data = 'PAUSE';
    }
};

audio.onpause = function () {
    var button = document.getElementById('playerButton');
    var buttonPlay = document.getElementById('buttonPlay');
    if (button.className === 'fa fa-pause') {
        button.className = 'fa fa-play';
        buttonPlay.firstChild.data = 'PLAY';
    }
};

audio.onvolumechange = function () {
    if (audio.volume > 0) {
        audio.muted = false;
    }
};

audio.onerror = function () {
    var confirmed = confirm('Stream Down / Network Error.\nClick OK to try again.');
    if (confirmed) {
        window.location.reload();
    }
};

document.getElementById('volume').oninput = function () {
    audio.volume = intToDecimal(this.value);
    var page = new Page();
    page.updateVolumeIndicator(this.value);
};

function togglePlay() {
    const playerButton = document.getElementById("playerButton");
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
        audio.play();
    }
}

function volumeUp() {
    var vol = audio.volume;
    if(audio) {
        if(audio.volume >= 0 && audio.volume < 1) {
            audio.volume = (vol + .01).toFixed(2);
        }
    }
}

function volumeDown() {
    var vol = audio.volume;
    if(audio) {
        if(audio.volume >= 0.01 && audio.volume <= 1) {
            audio.volume = (vol - .01).toFixed(2);
        }
    }
}

function mute() {
    if (!audio.muted) {
        document.getElementById('volIndicator').innerHTML = 0;
        document.getElementById('volume').value = 0;
        audio.volume = 0;
        audio.muted = true;
    } else {
        var storedVolume = localStorage.getItem('volume');
        document.getElementById('volIndicator').innerHTML = storedVolume;
        document.getElementById('volume').value = storedVolume;
        audio.volume = intToDecimal(storedVolume);
        audio.muted = false;
    }
}

document.addEventListener('keydown', function (event) {
    var key = event.key;
    var slideVolume = document.getElementById('volume');
    var page = new Page();

    switch (key) {
        case 'ArrowUp':
            volumeUp();
            slideVolume.value = decimalToInt(audio.volume);
            page.updateVolumeIndicator(decimalToInt(audio.volume));
            break;
        case 'ArrowDown':
            volumeDown();
            slideVolume.value = decimalToInt(audio.volume);
            page.updateVolumeIndicator(decimalToInt(audio.volume));
            break;
        case ' ':
        case 'Spacebar':
            togglePlay();
            break;
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
            var volumeValue = parseInt(key);
            audio.volume = volumeValue / 10;
            slideVolume.value = volumeValue * 10;
            page.updateVolumeIndicator(volumeValue * 10);
            break;
    }
});

function intToDecimal(vol) {
    return vol / 100;
}

function decimalToInt(vol) {
    return vol * 100;
}
