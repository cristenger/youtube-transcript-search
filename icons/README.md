# Icon Placeholders

This folder should contain the extension icons in three sizes:

- **icon16.png** - 16x16 pixels (toolbar icon)
- **icon48.png** - 48x48 pixels (extension management page)
- **icon128.png** - 128x128 pixels (Chrome Web Store)

## How to Create Icons

You can create icons using:

1. **Online Tools**:
   - [Favicon.io](https://favicon.io/) - Generate from text or emoji
   - [Canva](https://www.canva.com/) - Design custom icons
   - [RealFaviconGenerator](https://realfavicongenerator.net/)

2. **Design Software**:
   - Adobe Photoshop / Illustrator
   - GIMP (free)
   - Figma (free)
   - Inkscape (free)

3. **Simple Approach**:
   - Use an emoji or symbol (🎬, 📝, 📄, 🔍)
   - Export as PNG at the required sizes
   - Make sure the background is transparent or matches the icon style

## Quick Emoji Icon

For a quick start, you can use this emoji: 📝 (memo/clipboard)

Or use these suggestions:
- 🎬 (movie camera)
- 📹 (video camera)
- 📄 (document)
- 🔍 (magnifying glass)

## Example with ImageMagick

If you have ImageMagick installed, you can create simple placeholder icons:

```bash
# Create a simple colored square
convert -size 128x128 xc:#ff0000 -fill white -pointsize 80 -gravity center -annotate +0+0 "T" icon128.png
convert icon128.png -resize 48x48 icon48.png
convert icon128.png -resize 16x16 icon16.png
```

## Temporary Solution

For testing purposes, you can use any PNG image renamed to the appropriate sizes, or the extension will fall back to Chrome's default icon.
