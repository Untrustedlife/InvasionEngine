/**
 * Tile Manager Class
 * Handles tile definitions, palette rendering, and tile operations
 */

import {
  DEFAULT_TILES,
  MAX_TILE_ID,
  PROTECTED_TILE_IDS,
} from "./EditorConstants.js";
import { autoNameFor, defaultColor, safeClamp } from "./EditorUtils.js";

export class TileManager {
  constructor(editor, initialTiles = DEFAULT_TILES) {
    this.editor = editor;
    this.tiles = [...initialTiles];
    this.renderPalette();
  }

  /**
   * Generate tiles up to the specified max ID
   */
  generateIds() {
    const maxId = safeClamp(
      this.editor.elements.maxIdInput.value,
      0,
      MAX_TILE_ID
    );
    const newTiles = [];

    //Always include special tiles first
    const specialTiles = DEFAULT_TILES.filter((t) =>
      PROTECTED_TILE_IDS.includes(t.id)
    );
    for (const specialTile of specialTiles) {
      const existing = this.tiles.find((t) => t.id === specialTile.id);
      newTiles.push(existing || { ...specialTile });
    }

    //Generate regular tiles from 0 to maxId
    for (let i = 0; i <= maxId; i++) {
      const existing = this.tiles.find((t) => t.id === i);
      newTiles.push(
        existing || {
          id: i,
          name: `tile_${i}`,
          color: defaultColor(i),
        }
      );
    }

    this.tiles = newTiles;
    this.renderPalette();
    this.editor.render();
  }

  /**
   * Auto-name all tiles with preset names where available
   */
  autoNameTiles() {
    this.tiles = this.tiles.map((t) => ({
      ...t,
      name: autoNameFor(t.id),
    }));
    this.renderPalette();
  }

  /**
   * Seed tiles with default sample data
   */
  seedFromUserSample() {
    this.tiles = [...DEFAULT_TILES];
    this.editor.elements.maxIdInput.value = "7";
    this.renderPalette();
    this.editor.render();
  }

  /**
   * Render the tile palette UI
   */
  renderPalette() {
    const palListEl = this.editor.elements.palListEl;
    palListEl.innerHTML = "";

    const sortedTiles = [...this.tiles].sort((a, b) => a.id - b.id);

    for (const tile of sortedTiles) {
      const row = this.createPaletteRow(tile);
      palListEl.appendChild(row);
    }

    //Update active badge color
    this.updateActiveBadgeColor();
  }

  /**
   * Create a palette row element for a tile
   */
  createPaletteRow(tileDefinition) {
    const paletteRowElement = document.createElement("div");
    paletteRowElement.className = "palItem";

    //Color picker for tile appearance
    const colorPickerInput = document.createElement("input");
    colorPickerInput.type = "color";
    colorPickerInput.value = tileDefinition.color;
    colorPickerInput.oninput = () => {
      tileDefinition.color = colorPickerInput.value;
      if (tileDefinition.id === this.editor.activeId) {
        this.updateActiveBadgeColor();
      }
      this.editor.render();
    };

    //Container for tile metadata (ID and name)
    const metadataContainer = document.createElement("div");
    metadataContainer.className = "palMeta";

    //Clickable ID badge for tile selection
    const tileIdBadge = document.createElement("div");
    tileIdBadge.className = "idBadge";
    tileIdBadge.textContent = String(tileDefinition.id);
    tileIdBadge.title = "Select this tile";
    tileIdBadge.onclick = () => this.editor.setActiveId(tileDefinition.id);

    //Editable name input for tile naming
    const tileNameInput = document.createElement("input");
    tileNameInput.placeholder = `tile_${tileDefinition.id}`;
    tileNameInput.value = tileDefinition.name || "";
    tileNameInput.oninput = () => {
      tileDefinition.name =
        tileNameInput.value.trim() || `tile_${tileDefinition.id}`;
    };

    //Delete button with constraints for tile removal
    const deleteButton = document.createElement("button");
    deleteButton.textContent = "×";
    deleteButton.title = "Remove (only if not last in range)";
    deleteButton.onclick = () => this.deleteTile(tileDefinition);

    //Hide delete button for protected tiles (empty, special tiles)
    const isProtectedTile =
      tileDefinition.id === 0 || PROTECTED_TILE_IDS.includes(tileDefinition.id);
    if (isProtectedTile) {
      deleteButton.style.visibility = "hidden";
    }

    //Assemble the palette row elements
    metadataContainer.appendChild(tileIdBadge);
    metadataContainer.appendChild(tileNameInput);
    paletteRowElement.appendChild(colorPickerInput);
    paletteRowElement.appendChild(metadataContainer);
    paletteRowElement.appendChild(deleteButton);

    return paletteRowElement;
  }

  /**
   * Delete a tile with protection constraints
   */
  deleteTile(tileDefinition) {
    if (tileDefinition.id === 0) {
      return; //Always preserve the empty tile (ID 0)
    }

    //Protect special tiles from deletion
    if (PROTECTED_TILE_IDS.includes(tileDefinition.id)) {
      return; //Cannot delete protected system tiles
    }

    const lastTileInList = this.tiles[this.tiles.length - 1];

    if (tileDefinition.id === lastTileInList.id) {
      //Remove the last tile completely to shrink tile range
      this.tiles = this.tiles.filter((tile) => tile.id !== tileDefinition.id);
      if (this.tiles.length > 0) {
        this.editor.elements.maxIdInput.value = String(lastTileInList.id - 1);
      }
    } else {
      //Reset middle tiles to default to maintain contiguous ID sequence
      tileDefinition.name = `tile_${tileDefinition.id}`;
      tileDefinition.color = defaultColor(tileDefinition.id);
    }

    this.renderPalette();
    this.editor.render();
  }

  /**
   * Update the active badge color
   */
  updateActiveBadgeColor() {
    const activeTile = this.tiles.find((t) => t.id === this.editor.activeId);
    this.editor.elements.activeBadge.style.background = activeTile
      ? activeTile.color
      : "transparent";
  }

  /**
   * Find a tile by ID
   */
  getTile(id) {
    return this.tiles.find((t) => t.id === id);
  }

  /**
   * Get all tiles sorted by ID
   */
  getSortedTiles() {
    return [...this.tiles].sort((a, b) => a.id - b.id);
  }

  /**
   * Update tiles from imported data
   */
  updateTiles(importedTileData) {
    if (Array.isArray(importedTileData) && importedTileData.length) {
      this.tiles = [...importedTileData]
        .sort((tileA, tileB) => tileA.id - tileB.id)
        .map((tileData, tileIndex) => ({
          id: +tileData.id | 0,
          name: String(tileData.name || `tile_${tileIndex}`),
          color: String(tileData.color || defaultColor(+tileData.id | 0)),
        }));

      this.editor.elements.maxIdInput.value = String(
        this.tiles[this.tiles.length - 1].id
      );

      this.renderPalette();
    }
  }
}
