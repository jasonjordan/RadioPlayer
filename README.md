# HTML5 Icecast/Shoutcast Full Page Radio Player with PWA Support

## Demo Screenshots

![Demo Screenshot](https://i.imgur.com/PJGKsGh.jpg)

* Current song
* Historic of played songs
* Cover art of the current song
* Lyrics of the current song ([Open Lyrics API](https://lyrics.ovh/))
* Responsive design
* Progressive Web App (PWA) support
* Automatic search via alternative API on error

## Documentation

Open the [`js/script.js`](https://github.com/jasonjordan/RadioPlayer/blob/main/js/script.js) file and edit the lines below.

```javascript
// RADIO NAME
const RADIO_NAME = 'Your Radio Name';

// Change Stream URL Here. Supports ICECAST, ZENO, SHOUTCAST, RADIOJAR, and any other stream service.
const URL_STREAMING = 'https://stream.zeno.fm/yn65fsaurfhvv';
```

## Change Logo

Open the `img` folder and add your logo named `cover.png`.

## Installation

Just put the files on your server or use free hosting.

## Free Hosting

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/jasonjordan/RadioPlayer)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/jasonjordan/RadioPlayer)

### Progressive Web App (PWA) Support

You can install the Radio Player as a Progressive Web App (PWA) to your device for an enhanced experience. Simply visit the website on a supported browser and follow the prompts to install it.

### Configuring Radio Name and Colors

To configure the name of your radio and the colors used in the PWA, edit the `manifest.json` file:

1. Locate the `"name"` field and replace `'Your Radio Name'` with the name of your radio.
2. Customize `"background_color"` and `"theme_color"` to match your radio's branding.

```json
{
  "name": "Your Radio Name",
  "short_name": "Radio Player",
  "start_url": "/index.html",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "icons": [
    {
      "src": "img/cover.png",
      "sizes": "192x192",
      "type": "image/png"
    }
  ]
}
```

## Supported Hosting Types

* Icecast / Shoutcast
* Zeno Radio
* RadioJar
* Azuracast
* Centova Cast
* Everest Cast
* MediaCP
* Sonic Panel

## Supported API / Data Sources

* Apple Music / iTunes
* Deezer
* Spotify
* Azuracast
* MediaCP
* CentovaCast

## Keyboard Controls

* `M` — mute / unmute
* `P` and `Space` — play / pause
* `Arrow Up` and `Arrow Down` — increase / decrease volume
* `0` to `9` — set volume to 0–90 % (0 = 100 %)

## Feedback

If you have any feedback, please reach out to me at contact@jailson.es

## License

[MIT](https://github.com/gsavio/player-shoutcast-html5/blob/master/LICENSE)

## Credits

* [gsavio/player-shoutcast-html5](https://github.com/gsavio/player-shoutcast-html5)
* [joeyboli/RadioPlayer](https://github.com/joeyboli/RadioPlayer)
