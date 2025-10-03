# YouTube Transcript Search - Chrome Extension

A Chrome extension that displays YouTube video transcripts in a sidebar with search functionality and clickable timestamps.

## Features

- 📝 **Transcript Display**: Shows the full video transcript alongside the video
- 🔍 **Search Functionality**: Search for specific words or phrases within the transcript
- ⏱️ **Clickable Timestamps**: Jump to any point in the video by clicking on timestamps
- 🎨 **YouTube-matching UI**: Seamlessly integrates with YouTube's design (supports both light and dark modes)
- 🔄 **Auto-detection**: Automatically loads transcripts when you navigate to a YouTube video

## Installation

1. **Download the extension files** to a local folder
2. **Open Chrome** and navigate to `chrome://extensions/`
3. **Enable Developer Mode** (toggle in the top right corner)
4. Click **"Load unpacked"**
5. Select the folder containing the extension files
6. The extension is now installed!

## Usage

1. Navigate to any YouTube video (e.g., `https://www.youtube.com/watch?v=VIDEO_ID`)
2. The transcript panel will automatically appear in the sidebar (where the live chat or recommended videos are shown)
3. **Search**: Type in the search box to filter transcript entries
4. **Navigate**: Click on any timestamp to jump to that moment in the video
5. Search results are highlighted in yellow for easy identification

## Files Structure

```
youtube-transcript-search/
├── manifest.json       # Extension configuration
├── content.js          # Main logic for transcript fetching and UI
├── styles.css          # Styling for the transcript panel
├── icons/              # Extension icons (16x16, 48x48, 128x128)
└── README.md          # This file
```

## How It Works

1. **Content Script Injection**: The extension injects a content script into YouTube watch pages
2. **Transcript Fetching**: Extracts caption track URLs from YouTube's player data
3. **XML Parsing**: Parses the transcript XML data with timestamps
4. **UI Rendering**: Creates a searchable, clickable transcript panel
5. **Video Control**: Uses the native HTML5 video element to seek to timestamps

## Notes

- The extension requires videos to have captions/transcripts available
- Auto-generated captions are supported
- English captions are preferred, but other languages work too
- The extension respects YouTube's theme (light/dark mode)

## Creating Icons

The extension needs three icon sizes. You can create simple icons using any image editor:

- `icons/icon16.png` - 16x16 pixels
- `icons/icon48.png` - 48x48 pixels
- `icons/icon128.png` - 128x128 pixels

For now, you can use placeholder icons or create your own with tools like:
- [Favicon.io](https://favicon.io/)
- [Canva](https://www.canva.com/)
- Any image editor (GIMP, Photoshop, etc.)

## Troubleshooting

**"No transcript available for this video"**
- The video doesn't have captions enabled
- Captions might not be accessible via the API

**Panel not showing up**
- Refresh the page
- Make sure you're on a YouTube watch page (`/watch?v=...`)
- Check that the extension is enabled in `chrome://extensions/`

**Search not working**
- Make sure the transcript has loaded successfully
- Try clearing the search box and typing again

## Privacy

This extension:
- Does NOT collect any user data
- Does NOT send data to external servers
- Only accesses YouTube pages with your permission
- Fetches transcripts directly from YouTube's public API

## License

MIT License - Feel free to modify and distribute

## Contributing

Contributions are welcome! Feel free to submit issues or pull requests.
