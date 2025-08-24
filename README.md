A simple, open-source roguelike raycaster you can play right in your browser, featuring liminal space exploration.
Built in collaboration with WildRose and powered by an engine developed by Untrustedlife as the foundation.

This version has already diverged a lot from the original:

All side-screen artifacting issues are fixed comapred to original engine.

Sprite artifacting is gone comapred to original engine.

Many textures and sprites are new or improved

Gameplay feels smoother

Use this as a base to build your own free, open-source raycaster games!

# How to Stop Browsers From Caching Our HTML Pages (By Untrustedlife (08/23/2025))

## The Problem

Browsers save copies of the web pages so they load faster next time. This sucks when we update our game because people see the old version instead of our new stuff and have to hard refresh.
This makes it really annoying to both test locally and in the github pages site, so I took measures to avoid this.

## The Solution

### Part 1: Meta Tags

Put these in all HTML head sections:

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
- Third line: "Tells the browser that this page expired in 1970, and it needs to get a new one" (This is like a fallback)

### Part 2: Version Numbers

Add version numbers to all js/css/etc files like this in the html:

- `main.css?v=1.2`
- `script.js?v=1.2`

The browser thinks `main.css?v=1.2` is totally different from `main.css?v=1.3`
So when you change the version number, everyone downloads the new file when they run the game.
