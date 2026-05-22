const RADIO_NAME = 'Happy Radio';

// Set your stream URL here (ICECAST, ZENO, SHOUTCAST, etc.)
const STREAM_URL = 'https://hello.citrus3.com:2020/stream/happyradio';

// API URLs for streaming data
const STREAM_API_URL = 'https://twj.es/free/?url=' + STREAM_URL;
const FALLBACK_STREAM_API_URL = 'https://twj.es/metadata/?url=' + STREAM_URL;

let currentSongName = null;
const coverCache = {};

// Wait for DOM load
window.addEventListener('load', () => {
    const page = new Page();
    page.updatePageTitle();
    page.setVolume();

    // Remove auto-player.play/togglePlay: only user action starts audio!

    // Fetch streaming data instantly
    getStreamingData();

    // Poll streaming data every 10s
    setInterval(getStreamingData, 10000);

    // Set album cover height
    const coverArt = document.querySelector('.cover-album');
    if (coverArt) {
        coverArt.style.height = `${coverArt.offsetWidth}px`;
    } else {
        console.warn("Element .cover-album not found.");
    }

    // Setup play button: user gesture only!
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
                    { src: data.art, sizes: '128x128', type](#)
