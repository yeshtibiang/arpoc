import * as ecs from "@8thwall/ecs";

ecs.registerComponent({
  name: "card-manager",
  schema: {},
  schemaDefaults: {},
  data: {},

  add: (world, component) => {
    const PLAYER_DATA: Record<
      string,
      { playerName: string; texture: string; video: string }
    > = {
      Card_Siya_Kolisi: {
        playerName: "Siya Kolisi",
        texture: "assets/textures/SiyaKolisi_texture.png",
        video: "assets/videos/siya_kolisi.mp4",
      },
      Card_Nandine_Roos: {
        playerName: "Nandine Roos",
        texture: "assets/textures/NadineRoos_texture.png",
        video: "assets/videos/nadine_roos.mp4",
      },
    };

    // Applied to the 'bgTexture' material on every card, regardless of player
    const BACKGROUND_TEXTURE = "assets/textures/background_textureSheet.png";

    // The model spreads two shared "texture sheet" materials across several
    // nodes via different UV regions. 8th Wall's runtime doesn't reliably
    // keep the original glTF material names on the Three.js materials, so we
    // target the known node names directly instead of matching by material
    // name (these come straight from the glb's node -> material mapping).
    const BACKGROUND_SHEET_NODES = [
      "collectaboksLogo",
      "stripes",
      "sparksTop",
      "sparksBottom",
    ];
    const PLAYER_SHEET_NODES = [
      "number",
      "bio",
      "bio_frame",
      "info_frame",
      "stats",
      "stats_frame",
      "info",
      "position",
      "firstName",
      "surname",
    ];

    const nodeTexturesFor = (player: {
      texture: string;
    }): Array<{ nodeNames: string[]; texturePath: string }> => [
      { nodeNames: BACKGROUND_SHEET_NODES, texturePath: BACKGROUND_TEXTURE },
      { nodeNames: PLAYER_SHEET_NODES, texturePath: player.texture },
    ];

    // Read the selected card from URL
    const urlParams = new URLSearchParams(window.location.search);
    const selectedCard = urlParams.get("card");

    // Preload images/videos, keyed by asset path so the shared background
    // texture is only ever fetched once regardless of which card is selected
    const preloadedImages: Record<string, HTMLImageElement> = {};
    const preloadedVideos: Record<string, HTMLVideoElement> = {};

    const preloadImage = (path: string) => {
      if (preloadedImages[path]) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = path;
      preloadedImages[path] = img;
    };

    // Background is used on every card, so it's always worth preloading
    preloadImage(BACKGROUND_TEXTURE);

    if (selectedCard && PLAYER_DATA[selectedCard]) {
      const player = PLAYER_DATA[selectedCard];

      preloadImage(player.texture);

      // Preload video
      const vid = document.createElement("video");
      vid.src = player.video;
      vid.preload = "auto";
      vid.loop = true;
      vid.muted = true;
      vid.playsInline = true;
      vid.load();
      preloadedVideos[selectedCard] = vid;

      console.log("Preloading assets for:", player.playerName);
    }

    const AR_SCALE = 3;

    // Cache one entity + one set of textures per known card name and reuse
    // them across found/lost cycles instead of recreating them. Image
    // tracking flickers between found and lost several times a second while
    // the user is still aiming the camera at the card, and every flicker
    // used to spawn a brand new model instance plus two brand new
    // THREE.Texture uploads that were never disposed — that's what was
    // leaking GPU/JS memory fast enough to crash the browser during the
    // scan. Keying by card name bounds memory to the number of distinct
    // cards actually seen (PLAYER_DATA only has a couple), regardless of
    // how much the tracker flickers.
    //
    // Reusing the entity does NOT mean trusting that it's still correctly
    // textured, though: every reveal re-applies textures to the model's
    // materials (cheap — textures/images are cached, see getOrCreateTexture
    // and preloadedImages below) and only then makes it visible, so what
    // you see when a card is scanned is always the freshly-applied player
    // texture, never the model's baked-in default look.
    type CardInstance = { eid: ecs.Eid; modelEid: ecs.Eid | null };
    const instances: Record<string, CardInstance> = {};
    const sharedTextures: Record<string, any> = {};
    let visibleCardName: string | null = null;

    const getOrCreateTexture = (img: HTMLImageElement, texturePath: string) => {
      const cached = sharedTextures[texturePath];
      if (cached) return cached;

      const THREE = (window as any).THREE;
      const tex = new THREE.Texture(img);
      tex.wrapS = THREE.MirroredRepeatWrapping;
      tex.wrapT = THREE.MirroredRepeatWrapping;
      tex.offset.set(0, -1);
      tex.needsUpdate = true;
      sharedTextures[texturePath] = tex;
      return tex;
    };

    const POLL_INTERVAL_MS = 100;
    const POLL_MAX_ATTEMPTS = 50; // ~5s ceiling before giving up

    const TEXTURE_LOAD_MAX_RETRIES = 3;
    const TEXTURE_RETRY_DELAY_MS = 400;

    const MESH_MATCH_MAX_RETRIES = 10;
    const MESH_MATCH_RETRY_DELAY_MS = 200; // ~2s ceiling

    // Cold loads compete for bandwidth with the ~4.4MB glTF and the shared
    // background sheet, so a texture fetch can transiently fail/time out.
    // Retry a few times before giving up instead of treating the failure as
    // if the texture had loaded successfully.
    const loadTextureWithRetry = (
      texturePath: string,
      onSuccess: (img: HTMLImageElement) => void,
      onFailure: () => void,
      attemptsLeft: number = TEXTURE_LOAD_MAX_RETRIES,
    ) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = texturePath;
      img.onload = () => onSuccess(img);
      img.onerror = () => {
        if (attemptsLeft > 0) {
          setTimeout(
            () =>
              loadTextureWithRetry(
                texturePath,
                onSuccess,
                onFailure,
                attemptsLeft - 1,
              ),
            TEXTURE_RETRY_DELAY_MS,
          );
          return;
        }
        console.warn(
          "card-manager: failed to load texture after retries",
          texturePath,
        );
        onFailure();
      };
    };

    // Retries `check` every POLL_INTERVAL_MS until it returns a truthy
    // value, then calls onReady with it. The ECS attaches a cloned entity's
    // Three.js object (and its mesh hierarchy) asynchronously, so a single
    // fixed-delay check can fire before it's actually ready — which used to
    // make the card reveal with none of its textures applied, showing the
    // model's baked-in default look instead of the scanned player. Polling
    // instead of a one-shot timeout means onReady only ever fires once the
    // thing we're waiting for truly exists.
    const pollUntil = (
      check: () => any,
      onReady: (value: any) => void,
      label: string,
      attemptsLeft: number = POLL_MAX_ATTEMPTS,
    ) => {
      const value = check();
      if (value) {
        onReady(value);
        return;
      }
      if (attemptsLeft <= 0) {
        console.warn(`card-manager: gave up waiting for ${label}`);
        return;
      }
      setTimeout(
        () => pollUntil(check, onReady, label, attemptsLeft - 1),
        POLL_INTERVAL_MS,
      );
    };

    const applyTextures = (
      modelEid: ecs.Eid,
      nodeTextureGroups: Array<{ nodeNames: string[]; texturePath: string }>,
      onReady: (failed: boolean) => void,
    ) => {
      pollUntil(
        () => world.three.entityToObject.get(modelEid),
        (modelObject) => {
          let remaining = nodeTextureGroups.length;
          if (remaining === 0) {
            onReady(false);
            return;
          }

          let anyFailed = false;
          const oneDone = (success: boolean) => {
            if (!success) anyFailed = true;
            remaining -= 1;
            if (remaining <= 0) onReady(anyFailed);
          };

          nodeTextureGroups.forEach(({ nodeNames, texturePath }) => {
            const applyToMatchingMeshes = (
              img: HTMLImageElement,
              attemptsLeft: number = MESH_MATCH_MAX_RETRIES,
            ) => {
              const tex = getOrCreateTexture(img, texturePath);

              // Only touch meshes whose node name is in this group (e.g. the
              // background sheet's nodes vs the player sheet's nodes) — leaves
              // the other baked-in materials (frame, logo, gold card...) untouched
              let matchedCount = 0;
              modelObject.traverse((child: any) => {
                if (!child.isMesh || !nodeNames.includes(child.name)) return;
                matchedCount += 1;
                const materials = Array.isArray(child.material)
                  ? child.material
                  : [child.material];
                materials.forEach((mat: any) => {
                  mat.map = tex;
                  mat.needsUpdate = true;
                });
              });

              if (matchedCount === 0) {
                // The model object exists but its mesh hierarchy may not be
                // fully attached yet (glTF nodes can populate a moment after
                // the root Object3D itself is registered) — retry a few
                // times before concluding the node names genuinely don't
                // match anything, so we don't silently "succeed" without
                // ever touching a single material.
                if (attemptsLeft > 0) {
                  setTimeout(
                    () => applyToMatchingMeshes(img, attemptsLeft - 1),
                    MESH_MATCH_RETRY_DELAY_MS,
                  );
                  return;
                }
                console.warn(
                  "card-manager: no meshes matched node names",
                  nodeNames,
                  "for texture",
                  texturePath,
                  "— model hierarchy:",
                  modelObject,
                );
                oneDone(false);
                return;
              }

              oneDone(true);
            };

            const onFailure = () => oneDone(false);

            const preloaded = preloadedImages[texturePath];
            if (!preloaded) {
              loadTextureWithRetry(
                texturePath,
                applyToMatchingMeshes,
                onFailure,
              );
            } else if (preloaded.complete) {
              // `complete` is true both on success and on a failed load —
              // naturalWidth is what actually tells the two apart.
              if (preloaded.naturalWidth > 0) {
                applyToMatchingMeshes(preloaded);
              } else {
                loadTextureWithRetry(
                  texturePath,
                  applyToMatchingMeshes,
                  onFailure,
                );
              }
            } else {
              // Still in flight — wait for it instead of firing a second,
              // redundant fetch of the same resource.
              preloaded.addEventListener(
                "load",
                () => applyToMatchingMeshes(preloaded),
                { once: true },
              );
              preloaded.addEventListener(
                "error",
                () =>
                  loadTextureWithRetry(
                    texturePath,
                    applyToMatchingMeshes,
                    onFailure,
                  ),
                { once: true },
              );
            }
          });
        },
        `model object for entity ${modelEid}`,
      );
    };

    const applyVideo = (
      planeEid: ecs.Eid,
      videoPath: string,
      cardName: string,
      onReady: () => void,
    ) => {
      setTimeout(() => {
        const planeObject = world.three.entityToObject.get(planeEid);
        if (!planeObject) {
          onReady();
          return;
        }

        const videoEl =
          preloadedVideos[cardName] ||
          (() => {
            const v = document.createElement("video");
            v.src = videoPath;
            v.loop = true;
            v.muted = true;
            v.playsInline = true;
            v.load();
            return v;
          })();

        const attachVideo = () => {
          const THREE = (window as any).THREE;
          const videoTexture = new THREE.VideoTexture(videoEl);
          videoTexture.needsUpdate = true;

          planeObject.traverse((child: any) => {
            if (child.isMesh) {
              child.material.map = videoTexture;
              child.material.needsUpdate = true;
            }
          });

          onReady();
        };

        videoEl.play().catch((err) => {
          console.warn("Video play error:", err);
          onReady(); // don't hang on error
        });

        if (videoEl.readyState >= 3) {
          attachVideo();
        } else {
          videoEl.addEventListener("playing", attachVideo, { once: true });
        }
      }, 500);
    };

    const setInstanceVisible = (eid: ecs.Eid, visible: boolean) => {
      if (visible) {
        ecs.Hidden.remove(world, eid);
        [...world.getChildren(eid)].forEach((childEid) =>
          ecs.Hidden.remove(world, childEid),
        );
      } else {
        ecs.Hidden.set(world, eid);
      }

      const obj = world.three.entityToObject.get(eid);
      if (obj) {
        obj.visible = visible;
        obj.traverse((child: any) => {
          child.visible = visible;
        });
      }
    };

    const positionInstance = (eid: ecs.Eid, e: any) => {
      world.setPosition(
        eid,
        e.data.position.x,
        e.data.position.y,
        e.data.position.z,
      );
      world.setQuaternion(
        eid,
        e.data.rotation.x,
        e.data.rotation.y,
        e.data.rotation.z,
        e.data.rotation.w,
      );
      world.setScale(eid, AR_SCALE, AR_SCALE, AR_SCALE);
    };

    // Applies this card's textures to its model, then reveals it — used both
    // for a brand new instance and for one we're re-showing after a
    // found/lost flicker. Never skips straight to `setInstanceVisible(true)`
    // on the assumption that a past reveal is still valid: the whole point
    // is that what you see on screen is always freshly re-textured, not
    // whatever the model happened to look like before.
    const revealWhenTextured = (
      name: string,
      instance: CardInstance,
      player: any,
    ) => {
      const applyAndReveal = (modelEid: ecs.Eid) => {
        applyTextures(modelEid, nodeTexturesFor(player), (failed) => {
          if (failed) {
            // At least one texture never loaded even after retries — don't
            // reveal the model with its baked-in default look. Drop the
            // cached instance and its entity so the next scan of this card
            // starts a fresh load attempt instead of reusing this broken
            // one.
            console.warn(
              `card-manager: giving up on "${name}" for now — will retry on next scan`,
            );
            delete instances[name];
            world.deleteEntity(instance.eid);
            return;
          }

          // The card may have been lost again while its textures were
          // still (re)loading — don't reveal it after the fact.
          if (visibleCardName !== name) return;
          setInstanceVisible(instance.eid, true);
        });
      };

      if (instance.modelEid) {
        applyAndReveal(instance.modelEid);
        return;
      }

      pollUntil(
        () => {
          const children = [...world.getChildren(instance.eid)];
          return children.length > 0 ? children : null;
        },
        (children) => {
          // The video plane is currently removed from the model
          // (temporary) — support both layouts: [plane, model] when it's
          // present, or just [model] when it's not, so this keeps working
          // either way.
          const modelEid = children[0];
          instance.modelEid = modelEid;
          applyAndReveal(modelEid);
        },
        `children of PlayerCard instance "${name}"`,
      );
    };

    const createInstance = (name: string, player: any, e: any) => {
      const instanceEid = world.createEntity("PlayerCard");
      if (!instanceEid) return;

      const instance: CardInstance = { eid: instanceEid, modelEid: null };
      instances[name] = instance;

      // Hide immediately, before anything else — the entity is visible in
      // the scene as soon as it's created, and its model carries baked-in
      // default textures until we apply the real ones. Without this, the
      // model briefly shows that default look every time a new card is
      // scanned for the first time.
      setInstanceVisible(instanceEid, false);

      setTimeout(() => {
        positionInstance(instanceEid, e);
        revealWhenTextured(name, instance, player);
      }, 500);
    };

    const showCard = (name: string, player: any, e: any) => {
      if (visibleCardName && visibleCardName !== name) {
        const previous = instances[visibleCardName];
        if (previous) setInstanceVisible(previous.eid, false);
      }
      visibleCardName = name;

      const existing = instances[name];
      if (existing) {
        // Reuse the cached entity (avoids re-spawning a model + textures on
        // every found/lost flicker), but still re-apply and verify its
        // textures before showing it again rather than trusting that it's
        // still correctly textured from before.
        positionInstance(existing.eid, e);
        revealWhenTextured(name, existing, player);
        return;
      }

      createInstance(name, player, e);
    };

    const hideCard = (name: string) => {
      if (visibleCardName !== name) return;
      visibleCardName = null;

      const instance = instances[name];
      if (instance) setInstanceVisible(instance.eid, false);
    };

    world.events.addListener(
      world.events.globalId,
      ecs.events.REALITY_IMAGE_FOUND,
      (e: any) => {
        const name = e.data?.name;
        const player = PLAYER_DATA[name];
        if (!player) return;

        // If a specific card was selected, only respond to that card
        if (selectedCard && name !== selectedCard) return;

        showCard(name, player, e);
      },
    );

    world.events.addListener(
      world.events.globalId,
      ecs.events.REALITY_IMAGE_UPDATED,
      (e: any) => {
        const name = e.data?.name;
        const instance = instances[name];
        if (visibleCardName !== name || !instance) return;

        world.setPosition(
          instance.eid,
          e.data.position.x,
          e.data.position.y,
          e.data.position.z,
        );
        world.setQuaternion(
          instance.eid,
          e.data.rotation.x,
          e.data.rotation.y,
          e.data.rotation.z,
          e.data.rotation.w,
        );
      },
    );

    world.events.addListener(
      world.events.globalId,
      ecs.events.REALITY_IMAGE_LOST,
      (e: any) => {
        const name = e.data?.name;
        hideCard(name);
      },
    );
  },
});
