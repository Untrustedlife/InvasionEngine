A simple, open-source roguelike raycaster you can play right in your browser, featuring liminal space exploration.
Built in collaboration with WildRose and powered by an engine developed by Untrustedlife as the foundation.

This version has already diverged a lot from the original:

All side-screen artifacting issues are fixed comapred to original engine.

Sprite artifacting is gone comapred to original engine.

Many textures and sprites are new or improved

Gameplay feels smoother

Use this as a base to build your own free, open-source raycaster games!

# How to Stop Browsers From Caching Our HTML Pages (For anyone working in this repo to read.)

## The Problem

Browsers save copies of your web pages so they load faster next time. This sucks when you update your game because people see the old version instead of your new stuff.

## How Cache Prevention Works

### Method 1: Meta Tags

Put these in your HTML head section:

```html
<meta
  http-equiv="Cache-Control"
  content="no-cache, no-store, must-revalidate"
/>
<meta http-equiv="Pragma" content="no-cache" />
<meta http-equiv="Expires" content="0" />
```

What each one does:

- First line: "Don't cache this, don't store it, always check for updates"
- Second line: Same thing but for really old browsers
- Third line: "This page expired in 1970, get a new one"

### Method 2: Version Numbers

Add version numbers to your files like this:

- `main.css?v=1.2`
- `script.js?v=1.2`

The browser thinks `main.css?v=1.2` is totally different from `main.css?v=1.3`
So when you change the version number, everyone downloads the new file.

## Result

When you update your game, people will see the changes right away instead of seeing cached old versions.
