# Run in Replit (Web)

This project includes a browser version of the game (Canvas + JavaScript).

## Files
- `index.html`, `style.css`, `game.js`: the web game
- `main.py` / `server.py`: a tiny static web server for Replit

## Replit steps
1. Create a new **Python** Replit (or import this repo).
2. Make sure your sprite files are included in the repl:
   - `sprite_mouse/cheese.png`
   - a mouse sprite sheet PNG in `sprite_mouse/` (16x16 tiles). Best name: `sprite_mouse/mouse.png`
3. Press **Run**. Replit will run `main.py` which serves the site.
4. Open the **Webview** and you should see the game.

## If the mouse sprite doesn’t show
`game.js` tries a few common filenames. If yours is different, either:
- rename the file to `sprite_mouse/mouse.png`, or
- edit the `mouseSheetCandidates` list in `game.js`.

## Run locally (optional)
```bash
python main.py
```
Then open `http://localhost:3000/` in your browser.
