# Studio: Image Targets

This project demonstrates how to use Image Targets to anchor virtual content to images in the real world.

## Usage

1. [Install the Desktop App](https://8thwall.org/downloads)
2. On this repository, click Code > Download zip
3. Unzip the folder to the location you'd like to work in
4. In the desktop app, click "Open" and select the folder
5. To connect to a mobile device, follow [these instructions](https://8th.io/connect-device)
6. When importing your own targets, please see [this guide](https://8thwall.org/docs/studio/guides/xr/image-targets) for more information
7. Recommended: Track your files using [git](https://git-scm.com/about) to avoid losing progress

## Card Image Targets

Each card is identified by a short numeric code (`"001"`, `"002"`, ...) instead of a descriptive name. This code must match **exactly** across four places: the Image Target's filename, its `name` field, `src/app.js`, and `src/common/card-manager.ts`. If the JSON's filename doesn't match its `name` field, 8th Wall Studio will silently reassign the `name` the next time it syncs the project, breaking the lookup in `card-manager.ts`.

### Adding a new card

1. Generate the Image Target in 8th Wall Studio from the new card's photo (see the [Image Targets guide](https://8thwall.org/docs/studio/guides/xr/image-targets)).
2. Pick the next sequential code (e.g. `003`) and rename all the files 8th Wall generated for it to that code:
   - `image-targets/003.json`
   - `image-targets/003_original.png`
   - `image-targets/003_cropped.png`
   - `image-targets/003_thumbnail.png`
   - `image-targets/003_luminance.png`
3. In `003.json`, set `"name": "003"` and update `imagePath` / `resources` to point at the renamed files above.
4. Register the target in `src/app.js`:
   ```js
   const CARD_TARGETS = {
     '001': require('../image-targets/001.json'),
     '002': require('../image-targets/002.json'),
     '003': require('../image-targets/003.json'),
   }
   ```
5. Add the player's data to `PLAYER_DATA` in `src/common/card-manager.ts`, keyed by the same code:
   ```ts
   "003": {
     playerName: "Player Name",
     texture: "assets/textures/PlayerName_texture.png",
     video: "assets/videos/player_name.mp4",
   },
   ```
6. Add the player's texture (`src/assets/textures/`) and video (`src/assets/videos/`). The texture must follow the same UV layout as the existing player texture sheets, since it's mapped onto fixed mesh node names shared by every card's 3D model.
7. The card is now reachable at `?card=003`.

## Deployment

This project contains Github Actions configuration for deployment to Github Pages, which triggers automatically by pushing the `main` branch. You can also follow the publishing instructions here: https://8thwall.org/docs/getting-started/publishing to publish to any other web host.

## Questions?

Please raise any questions on [Github Discussions](https://github.com/orgs/8thwall/discussions) or join the [Discord](https://8th.io/discord) to connect with the community.

