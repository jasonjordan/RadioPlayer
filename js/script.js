const RADIO_NAME = 'Happy Radio'

// Change Stream URL Here, Supports, ICECAST, ZENO, SHOUTCAST, RADIOJAR and any other stream service.
const URL_STREAMING = 'https://hello.citrus3.com:2020/stream/happyradio';

// API URL
const API_URL = 'https://twj.es/free/?url='+URL_STREAMING;
const FALLBACK_API_URL = 'https://twj.es/metadata/?url=' + URL_STREAMING;

let userInteracted = true;

let currentSongName = null;

// Cache for the iTunes API
const cache = {};

window.addEventListener('load', () => { 
    const page = new Page();
    page.changeTitlePage();
    page.setVolume();

    const player = new Player();
    player.play();

    // Fetch streaming data immediately when the page loads
    getStreamingData();

    // Set interval to update streaming data every 10 seconds
    const streamingInterval = setInterval(getStreamingData, 10000);

    // Adjust the album cover height to equal its width
    const coverArt = document.querySelector('.cover-album');
    if (coverArt) { 
      // Ensure the element exists before setting height
      coverArt.style.height = `${coverArt.offsetWidth}px`;
    } else {
      console.warn("Cover album element not found.");
    }
});

// DOM control
class Page {
    constructor() {
        this.changeTitlePage = function (title = RADIO_NAME) {
            document.title = title;
        };

        this.refreshCurrentSong = function(song, artist) {
            const currentSong = document.getElementById('currentSong');
            const currentArtist = document.getElementById('currentArtist');
            const lyricsSong = document.getElementById('lyricsSong');
        
            if (song !== currentSong.textContent || artist !== currentArtist.textContent) { 
                // Fade out existing content
                currentSong.classList.add('fade-out');
                currentArtist.classList.add('fade-out');
        
                setTimeout(function() {
                    // Update content after fade-out
                    currentSong.textContent = song; 
                    currentArtist.textContent = artist;
                    lyricsSong.textContent = song + ' - ' + artist;
        
                    // Fade in new content
                    currentSong.classList.remove('fade-out');
                    currentSong.classList.add('fade-in');
                    currentArtist.classList.remove('fade-out');
                    currentArtist.classList.add('fade-in');
                }, 500); 
        
                setTimeout(function() {
                    // Remove fade-in classes after animation
                    currentSong.classList.remove('fade-in');
                    currentArtist.classList.remove('fade-in');
                }, 1000); 
            }
        };
          
        this.refreshHistoryItem = async function (info, n) {
            const historyDiv = document.querySelectorAll("#historicSong article")[n];
            const songName = document.querySelectorAll("#historicSong article .music-info .song")[n];
            const artistName = document.querySelectorAll("#historicSong article .music-info .artist")[n];
            const coverHistoric = document.querySelectorAll("#historicSong article .cover-historic")[n];

            const defaultCoverArt = "img/cover.png";

            // Extract song title and artist name, handling the possibility that they may be objects or strings
            const songTitle = typeof info.song === "object" ? info.song.title : info.song;
            const songArtist = typeof info.artist === "object" ? info.artist.title : info.artist;

            // Set HTML element content with fallback for missing values
            songName.innerHTML = songTitle || "Unknown";
            artistName.innerHTML = songArtist || "Unknown";

            try {
                // Use extracted values to fetch album cover from iTunes API
                const data = await getDataFromITunes(songArtist, songTitle, defaultCoverArt, defaultCoverArt);
                // Set background image for history cover
                coverHistoric.style.backgroundImage = "url(" + (data.art || defaultCoverArt) + ")";
            } catch (error) {
                // Log error and set default cover on failure
                console.log("Error fetching iTunes API data:");
                console.error(error);
                coverHistoric.style.backgroundImage = "url(" + defaultCoverArt + ")";
            }

            // Add animated class for slide animation
            historyDiv.classList.add("animated", "slideInRight");
            // Remove animated class after 2 seconds to prepare for next animation
            setTimeout(() => historyDiv.classList.remove("animated", "slideInRight"), 2000);
        };
                
        this.refreshCover = async function (song = '', artist) {
            const coverArt = document.getElementById('currentCoverArt');
            const coverBackground = document.getElementById('bgCover');
            const defaultCoverArt = 'img/cover.png'; 
        
            try {
                const data = await getDataFromITunes(artist, song, defaultCoverArt, defaultCoverArt);
        
                // Apply cover image (always, even if default)
                coverArt.style.backgroundImage = 'url(' + data.art + ')';
                coverBackground.style.backgroundImage = 'url(' + data.cover + ')';
        
                // Add/remove classes for animation if necessary
                coverArt.classList.add('animated', 'bounceInLeft');
                setTimeout(() => coverArt.classList.remove('animated', 'bounceInLeft'), 2000);
              
                // Update MediaSession if supported
                if ('mediaSession' in navigator) {
                    const artwork = [
                        { src: data.art, sizes: '96x96',   type: 'image/png' },
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
                console.log("Error fetching iTunes API data:", error);
            }
        };

        this.changeVolumeIndicator = function(volume) {
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
                // Using Open-Lyrics API (no authentication required)
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
        let data = await fetchStreamingData(API_URL);
        if (!data) {
            data = await fetchStreamingData(FALLBACK_API_URL);
        }

        if (data) {
            const page = new Page();
            const currentSong = data.songtitle || (typeof data.song === "object" ? data.song.title : data.song);
            const currentArtist = typeof data.artist === "object" ? data.artist.title : data.artist;

            const safeCurrentSong = (currentSong || "").replace(/'/g, "'").replace(/&/g, "&");
            const safeCurrentArtist = (currentArtist || "").replace(/'/g, "'").replace(/&/g, "&");

            if (safeCurrentSong !== currentSongName) {
                document.title = `${safeCurrentSong} - ${safeCurrentArtist} | ${RADIO_NAME}`;

                page.refreshCover(safeCurrentSong, safeCurrentArtist);
                page.refreshCurrentSong(safeCurrentSong, safeCurrentArtist);
                page.refreshLyrics(safeCurrentSong, safeCurrentArtist);

                const historyContainer = document.getElementById("historicSong");
                historyContainer.innerHTML = "";

                const historyArray = data.song_history
                    ? data.song_history.map((item) => ({ song: item.song.title, artist: item.song.artist }))
                    : data.history;

                const maxSongsToDisplay = 4;
                const limitedHistory = historyArray.slice(Math.max(0, historyArray.length - maxSongsToDisplay));

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
                        console.error("Error refreshing history item:", error);
                    }
                }
                currentSongName = safeCurrentSong;
            }
        }
    } catch (error) {
        console.log("Error fetching streaming data:", error);
    }
}


// Function to fetch streaming data from a specific API
async function fetchStreamingData(apiUrl) {
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`API request error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.log("Error fetching streaming data from API:", error);
    return null;
  }
}

// Function to change iTunes image size
function changeImageSize(url, size) {
  const parts = url.split("/");
  const filename = parts.pop();
  const newFilename = `${size}${filename.substring(filename.lastIndexOf("."))}`;
  return parts.join("/") + "/" + newFilename;
}

// Function to fetch data from iTunes API
const getDataFromITunes = async (artist, title, defaultArt, defaultCover) => {
  let searchTerm;
  if (artist === title) {
      searchTerm = `${title}`;
  } else {
      searchTerm = `${artist} - ${title}`;
  }
  const cacheKey = searchTerm.toLowerCase();
  if (cache[cacheKey]) {
      return cache[cacheKey];
  }

  const response = await fetch(`https://itunes.apple.com/search?limit=1&term=${encodeURIComponent(searchTerm)}`);
  if (response.status === 403) {
      const results = {
          title,
          artist,
          art: defaultArt,
          cover: defaultCover,
          stream_url: "#not-found",
      };
      return results;
  }
  const data = response.ok ? await response.json() : {};
  if (!data.results || data.results.length === 0) {
      const results = {
          title,
          artist,
          art: defaultArt,
          cover: defaultCover,
          stream_url: "#not-found",
      };
      return results;
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
  cache[cacheKey] = results;
  return results;
};

// AUDIO


// Global variable for audio stream
var audio = new Audio(URL_STREAMING);

// Player control
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

// On play, change the button to pause
audio.onplay = function () {
    var button = document.getElementById('playerButton');
    if (button.className === 'fa fa-play') {
        button.className = 'fa fa-pause';
    }
}

// On pause, change the button to play
audio.onpause = function () {
    var button = document.getElementById('playerButton');
    if (button.className === 'fa fa-pause') {
        button.className = 'fa fa-play';
    }
}

// Unmute when volume changed
audio.onvolumechange = function () {
    if (audio.volume > 0) {
        audio.muted = false;
    }
}

audio.onerror = function () {
    var confirmed = confirm('Stream Down / Network Error. \nClick OK to try again.');

    if (confirmed) {
        window.location.reload();
    }
}

document.getElementById('volume').oninput = function () {
    audio.volume = intToDecimal(this.value);

    var page = new Page();
    page.changeVolumeIndicator(this.value);
}


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
        var localVolume = localStorage.getItem('volume');
        document.getElementById('volIndicator').innerHTML = localVolume;
        document.getElementById('volume').value = localVolume;
        audio.volume = intToDecimal(localVolume);
        audio.muted = false;
    }
}

document.addEventListener('keydown', function (event) {
    var key = event.key;
    var slideVolume = document.getElementById('volume');
    var page = new Page();

    switch (key) {
        // Arrow up
        case 'ArrowUp':
            volumeUp();
            slideVolume.value = decimalToInt(audio.volume);
            page.changeVolumeIndicator(decimalToInt(audio.volume));
            break;
        // Arrow down
        case 'ArrowDown':
            volumeDown();
            slideVolume.value = decimalToInt(audio.volume);
            page.changeVolumeIndicator(decimalToInt(audio.volume));
            break;
        // Spacebar
        case ' ':
        case 'Spacebar':
            togglePlay();
            break;
        // P
        case 'p':
        case 'P':
            togglePlay();
            break;
        // M
        case 'm':
        case 'M':
            mute();
            break;
        // Numeric keys 0-9
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
            var volumeValue = parseInt(key);
            audio.volume = volumeValue / 10;
            slideVolume.value = volumeValue * 10;
            page.changeVolumeIndicator(volumeValue * 10);
            break;
    }
}); 

function intToDecimal(vol) {
    return vol / 100;
}

function decimalToInt(vol) {
    return vol * 100;
}
