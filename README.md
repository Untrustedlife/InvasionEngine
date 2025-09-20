Play the currently deployed sample game "Aniachronism" here:
https://untrustedlife.github.io/BackroomsTower

Invasion Engine is a professionally developed, open-source raycaster game engine that runs and embeds directly in your browser. Without utilizing WebGL.

Built at first in collaboration with WildRose then fully taken over by Untrustedlife and powered by an engine developed by Untrustedlife as the foundation.

This version has already diverged a lot from the original:

All side-screen artifacting issues are fixed comapred to original engine.

Sprite artifacting is gone comapred to original engine.

Many textures and sprites are new or improved

Gameplay feels smoother

Use this as a base to build your own free, open-source raycaster games!

# How to Build

To contribute to this project, you should build it locally to test your changes first!

**Steps:**

1. First **Clone the repository**
2. Then Run `npm install`
3. Then **Start the development server:**
   - On **Windows:**  
     `npm run serve`
   - On **Linux:**  
     `npm run linuxserve`

This will automatically build the project, start a local server, and open it up in your browser so you can test it quickly and immediately.
We value ease of use here ;) heh

# How to Stop Browsers From Caching Our HTML Pages (By Untrustedlife (08/23/2025))

## The Problem

Browsers save copies of the web pages so they load faster next time. This sucks when we update our game because people see the old version instead of our new stuff and have to hard refresh.
This makes it really annoying to both test locally and in the github pages site, so I took measures to avoid this.

## The Solution

### Part 1: Meta Tags

Make sure you (The contributor heh) put these in all HTML head sections:

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

_Best practice, not strictly necessary, but easy to add when switching major versions_

For cache-busting, we add version numbers to all JS, CSS, or other file references in the HTML, like this:

- `main.css?v=1.3`
- `script.js?v=1.3`

The browser treats `main.css?v=1.1` and `main.css?v=1.3` as different files.  
So when we update the version number, users are forced to download the updated file the next time they load the game.

_This isn’t strictly required, and was mainly used as a safeguard for players who visited before proper `<head>` tags were added._
