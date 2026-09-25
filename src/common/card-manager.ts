import * as ecs from "@8thwall/ecs";
import { cards, effectiveCardId } from "./selected-card";

ecs.registerComponent({
  name: "card-manager",
  schema: {},
  schemaDefaults: {},
  data: {},

  add: (world, component) => {
    // TEMP: on-screen debug overlay for mobile testing, where there's no
    // devtools/console access. Shows recent card-manager lifecycle events
    // directly over the AR view so loading progress/failures are visible
    // without a cable + remote debugger. Safe to remove once the feature is
    // confirmed working live — every call also mirrors to console.log.
    let debugOverlayEl: HTMLDivElement | null = null;
    const debugLog = (message: string) => {
      console.log("[card-manager]", message);
      if (!debugOverlayEl) {
        debugOverlayEl = document.createElement("div");
        Object.assign(debugOverlayEl.style, {
          position: "fixed",
          top: "0",
          left: "0",
          right: "0",
          maxHeight: "35vh",
          overflowY: "auto",
          zIndex: "999999",
          background: "rgba(0,0,0,0.75)",
          color: "#0f0",
          fontFamily: "monospace",
          fontSize: "11px",
          lineHeight: "1.35",
          padding: "6px 8px",
          pointerEvents: "none",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        });
        document.body.appendChild(debugOverlayEl);
      }
      const time = new Date().toISOString().slice(11, 19);
      const line = document.createElement("div");
      line.textContent = `[${time}] ${message}`;
      debugOverlayEl.appendChild(line);
      while (debugOverlayEl.children.length > 20) {
        debugOverlayEl.removeChild(debugOverlayEl.firstChild as ChildNode);
      }
      debugOverlayEl.scrollTop = debugOverlayEl.scrollHeight;
    };

    const PLAYER_DATA: Record<
      string,
      { playerName: string; texture: string; image?: string; video?: string }
    > = cards;

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
      "stats",
      "info",
      "position",
      "firstName",
      "surname",
    ];

    // player_without_video variant's own nodes. standBack/standFoot keep
    // their baked-in look; the sparks get an unlit material built from the
    // spark sheet embedded in sparksBackLeft's material (see
    // applySparkMaterials).
    const PLAYER_IMAGE_NODE = ["playerImage"];
    const SPARK_NODES = ["sparksBackLeft", "sparksBackRight", "sparksFront"];
    const SPARK_TEXTURE_SOURCE_NODE = "sparksBackLeft";

    // player_with_video variant's own node: a quad baked directly into the
    // glb (and already animated, in lockstep with the rest of the model's
    // "Animation" clip, growing from scale 0 into place) that the video
    // texture is painted onto — replaces a separate video-plane prefab
    // child. Only present in the with-video model pair.
    const VIDEO_MESH_NAME = "bragAI";

    // Per-card model selection: cards with a video use the player_with_video
    // pair, cards without one use player_without_video. Each pair has an
    // in_animation model (shown by default) and a tap_animation model
    // (swapped in when the displayed model is tapped, see handleModelTap).
    const MODEL_PATHS = {
      withVideo: {
        initial: "assets/models/player_with_video/in_animation_with_video.glb",
        tap: "assets/models/player_with_video/tap_animation_with_video.glb",
      },
      withoutVideo: {
        // NOTE: filename intentionally has no underscore between "in" and
        // "animation" — matches the actual asset filename, do not "fix" this.
        initial:
          "assets/models/player_without_video/inanimation_without_video.glb",
        tap: "assets/models/player_without_video/tap_animation_without_video.glb",
      },
    } as const;

    const modelPathsFor = (player: { video?: string }) =>
      player.video ? MODEL_PATHS.withVideo : MODEL_PATHS.withoutVideo;

    // Local transform (relative to the PlayerCard parent) applied to the
    // model child entity once its glb variant is chosen. The prefab
    // (src/.expanse.json) bakes a single fixed transform onto that child,
    // tuned by eye against the with-video geometry — but the two variants'
    // baked rest+animated local geometry occupies different bounding boxes
    // (with-video bbox center (0.16, 0.47, -0.03), size (2.71, 1.49, 2.08);
    // without-video bbox center (0.28, 0.89, -0.23), size (2.62, 1.83, 1.34)),
    // so reusing the with-video transform for without-video visibly
    // shifts/misshapes it.
    //
    // withVideo below simply restates the prefab's own baked default
    // explicitly so it no longer depends on that default surviving future
    // prefab edits. withoutVideo is a first-pass corrective *translation*,
    // derived analytically as T' = T - R*S*Delta (Delta = the two variants'
    // local bounding-box center offset, R/S = the prefab's existing
    // rotation/scale) — NOT yet visually verified in Studio or on-device.
    // Expect to nudge this by eye once someone can actually look at a
    // scanned without-video card.
    const MODEL_TRANSFORMS = {
      withVideo: {
        position: { x: 0, y: -0.539, z: -0.12 },
        quaternion: {
          x: 0.35836794954530027,
          y: 0,
          z: 0,
          w: 0.9335804264972017,
        },
        scale: 0.6,
      },
      withoutVideo: {
        position: { x: -0.072, y: -0.8066, z: -0.1994 },
        quaternion: {
          x: 0,
          y: 0,
          z: 0,
          w: 0,
        },
        scale: 0.6,
      },
    } as const;

    const modelTransformFor = (player: { video?: string }) =>
      player.video ? MODEL_TRANSFORMS.withVideo : MODEL_TRANSFORMS.withoutVideo;

    // The textured source glb marks these two materials `alphaMode: "BLEND"`
    // (and background_texture as doubleSided) so their shared texture sheets
    // can cut out non-rectangular shapes via alpha. The no-textures glb we
    // actually instantiate at runtime dropped those flags along with the
    // baked-in images, so we restore them here alongside the texture —
    // otherwise the cutout regions render as solid (often black) instead of
    // transparent.
    const nodeTexturesFor = (player: {
      texture: string;
      image?: string;
      video?: string;
    }): Array<{
      nodeNames: string[];
      texturePath: string;
      transparent: boolean;
      doubleSided?: boolean;
      fitContain?: boolean;
      unlit?: boolean;
    }> => {
      const groups: Array<{
        nodeNames: string[];
        texturePath: string;
        transparent: boolean;
        doubleSided?: boolean;
        fitContain?: boolean;
        unlit?: boolean;
      }> = [
        {
          nodeNames: BACKGROUND_SHEET_NODES,
          texturePath: BACKGROUND_TEXTURE,
          transparent: true,
          doubleSided: true,
        },
        {
          nodeNames: PLAYER_SHEET_NODES,
          texturePath: player.texture,
          transparent: true,
        },
      ];

      // playerImage only exists on the player_without_video model, and only
      // needs texturing when that variant is actually in play (no video to
      // show instead).
      if (!player.video && player.image) {
        groups.push({
          nodeNames: PLAYER_IMAGE_NODE,
          texturePath: player.image,
          transparent: true,
          doubleSided: true,
          fitContain: true,
          // The glb gives playerImage a white emissiveFactor with no
          // emissiveTexture, which three.js adds as flat white on top of
          // the photo (washing it out). Swap to an unlit material instead —
          // same full-brightness look the white emission was going for.
          unlit: true,
        });
      }

      return groups;
    };

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

    // effectiveCardId (from selected-card.js) is always a key of PLAYER_DATA
    const player = PLAYER_DATA[effectiveCardId];
    if (player) {
      preloadImage(player.texture);
      if (player.image) preloadImage(player.image);

      if (player.video) {
        const vid = document.createElement("video");
        vid.src = player.video;
        vid.preload = "auto";
        vid.loop = true;
        vid.muted = true;
        vid.playsInline = true;
        vid.load();
        preloadedVideos[effectiveCardId] = vid;
      }

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
    type CardInstance = {
      eid: ecs.Eid;
      modelEid: ecs.Eid | null;
      // Sticky for the instance's lifetime: once a tap has swapped in the
      // tap_animation model, further taps (and found/lost flicker re-reveals)
      // must not re-trigger or revert it. See handleModelTap.
      tapped: boolean;
    };
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

    const containTextureCache: Record<string, any> = {};

    // Builds a texture that fits `img` inside `mesh`'s own local aspect
    // ratio without distorting it (like CSS `object-fit: contain`), leaving
    // the leftover canvas area transparent instead of stretching the photo
    // to fill the mesh's full UV rectangle. Cached per texturePath+aspect so
    // repeated reveals (found/lost flicker) don't re-composite the canvas
    // every time.
    const getOrCreateContainTexture = (
      img: HTMLImageElement,
      texturePath: string,
      mesh: any,
    ) => {
      // Geometry bbox only — NOT multiplied by mesh.scale. The UV mapping
      // depends on the geometry alone, and playerImage's node scale is
      // animated from [0,0,0] (the in_animation clip's grow-in): at the
      // first reveal the clip is still paused at frame 0, so including the
      // scale gave 0/0 = NaN -> a 0x0 canvas -> an empty texture that was
      // then cached under a "NaN" key. That's why the photo was sometimes
      // missing on first scan and only showed up after a lost/found cycle.
      mesh.geometry.computeBoundingBox();
      const bbox = mesh.geometry.boundingBox;
      const meshWidth = bbox.max.x - bbox.min.x;
      const meshHeight = bbox.max.y - bbox.min.y;
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const rawAspect = meshWidth / meshHeight;
      const meshAspect =
        Number.isFinite(rawAspect) && rawAspect > 0 ? rawAspect : imgAspect;

      const cacheKey = `${texturePath}::${meshAspect.toFixed(4)}`;
      const cached = containTextureCache[cacheKey];
      if (cached) return cached;

      let canvasWidth: number;
      let canvasHeight: number;
      if (imgAspect > meshAspect) {
        canvasWidth = img.naturalWidth;
        canvasHeight = Math.round(img.naturalWidth / meshAspect);
      } else {
        canvasHeight = img.naturalHeight;
        canvasWidth = Math.round(img.naturalHeight * meshAspect);
      }

      const canvas = document.createElement("canvas");
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
      ctx.drawImage(
        img,
        (canvasWidth - img.naturalWidth) / 2,
        (canvasHeight - img.naturalHeight) / 2,
      );

      const THREE = (window as any).THREE;
      const tex = new THREE.CanvasTexture(canvas);
      // Same V-flip correction as getOrCreateTexture above (this model's
      // UVs need it regardless of which texture supplies the pixels) —
      // applied on top of the already-composited contain+transparent
      // canvas, so it flips the whole result consistently with every other
      // node on this model.
      tex.wrapS = THREE.MirroredRepeatWrapping;
      tex.wrapT = THREE.MirroredRepeatWrapping;
      tex.offset.set(0, -1);
      tex.needsUpdate = true;
      containTextureCache[cacheKey] = tex;
      return tex;
    };

    const POLL_INTERVAL_MS = 100;
    const POLL_MAX_ATTEMPTS = 50; // ~5s ceiling before giving up

    const TEXTURE_LOAD_MAX_RETRIES = 3;
    const TEXTURE_RETRY_DELAY_MS = 400;

    const MESH_MATCH_MAX_RETRIES = 10;
    const MESH_MATCH_RETRY_DELAY_MS = 200; // ~2s ceiling

    const MODEL_LOAD_TIMEOUT_MS = 8000; // generous ceiling for a several-MB glb on a slow connection

    // Waits for modelEid's gltfModel to finish (re)loading after a url
    // mutation. Mirrors this file's other bounded waits (pollUntil, texture
    // retries): if GLTF_MODEL_LOADED never fires within
    // MODEL_LOAD_TIMEOUT_MS, warn and run onTimeout instead of hanging
    // forever with no visible failure signal.
    const waitForModelLoad = (
      modelEid: ecs.Eid,
      onLoaded: () => void,
      onTimeout: () => void,
    ) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        world.events.removeListener(
          modelEid,
          ecs.events.GLTF_MODEL_LOADED,
          onModelLoaded,
        );
        console.warn(
          `card-manager: gave up waiting for model to load on entity ${modelEid}`,
        );
        onTimeout();
      }, MODEL_LOAD_TIMEOUT_MS);
      const onModelLoaded = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        world.events.removeListener(
          modelEid,
          ecs.events.GLTF_MODEL_LOADED,
          onModelLoaded,
        );
        onLoaded();
      };
      world.events.addListener(
        modelEid,
        ecs.events.GLTF_MODEL_LOADED,
        onModelLoaded,
      );
    };

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

    // The without-video glbs only embed the spark sheet on sparksBackLeft's
    // material (sparksBackRight/sparksFront export with no texture at all),
    // and in_animation also gives it a white emissiveFactor with no
    // emissiveTexture — three.js adds that as flat white, so the spark
    // rendered as a solid white quad. Reuse that embedded texture on all
    // three spark meshes through an unlit, alpha-blended material instead.
    // The glTF texture is used as-is (GLTFLoader already set flipY
    // correctly), so no offset/MirroredRepeat correction here.
    let sparkTexture: any = null;
    const applySparkMaterials = (
      modelEid: ecs.Eid,
      attemptsLeft: number = MESH_MATCH_MAX_RETRIES,
    ) => {
      pollUntil(
        () => world.three.entityToObject.get(modelEid),
        (modelObject) => {
          const THREE = (window as any).THREE;

          // Prefer the texture of the currently-loaded glb (it changes on the
          // tap swap), falling back to the one cached from a previous pass
          // once our own MeshBasicMaterial has replaced the original.
          modelObject.traverse((child: any) => {
            if (!child.isMesh || child.name !== SPARK_TEXTURE_SOURCE_NODE) {
              return;
            }
            const mat = Array.isArray(child.material)
              ? child.material[0]
              : child.material;
            if (mat?.map && !mat.userData?.cardManagerSpark) {
              sparkTexture = mat.map;
            }
          });

          let matchedCount = 0;
          if (sparkTexture) {
            modelObject.traverse((child: any) => {
              if (!child.isMesh || !SPARK_NODES.includes(child.name)) return;
              matchedCount += 1;
              const mat = new THREE.MeshBasicMaterial({
                map: sparkTexture,
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false,
              });
              mat.userData.cardManagerSpark = true;
              child.material = mat;
            });
          }

          if (matchedCount === 0) {
            // Mesh hierarchy may not be attached yet — same retry rule as
            // applyTextures' applyToMatchingMeshes.
            if (attemptsLeft > 0) {
              setTimeout(
                () => applySparkMaterials(modelEid, attemptsLeft - 1),
                MESH_MATCH_RETRY_DELAY_MS,
              );
              return;
            }
            console.warn(
              "card-manager: could not apply spark materials",
              sparkTexture ? "(no spark meshes matched)" : "(no embedded spark texture)",
            );
          }
        },
        `model object for entity ${modelEid} (sparks)`,
      );
    };

    const applyTextures = (
      modelEid: ecs.Eid,
      nodeTextureGroups: Array<{
        nodeNames: string[];
        texturePath: string;
        transparent: boolean;
        doubleSided?: boolean;
        fitContain?: boolean;
        unlit?: boolean;
      }>,
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

          nodeTextureGroups.forEach(
            ({
              nodeNames,
              texturePath,
              transparent,
              doubleSided,
              fitContain,
              unlit,
            }) => {
              const applyToMatchingMeshes = (
                img: HTMLImageElement,
                attemptsLeft: number = MESH_MATCH_MAX_RETRIES,
              ) => {
                const THREE = (window as any).THREE;

                // Only touch meshes whose node name is in this group (e.g. the
                // background sheet's nodes vs the player sheet's nodes) — leaves
                // the other baked-in materials (frame, logo, gold card...) untouched
                let matchedCount = 0;
                modelObject.traverse((child: any) => {
                  if (!child.isMesh || !nodeNames.includes(child.name)) return;
                  matchedCount += 1;
                  const tex = fitContain
                    ? getOrCreateContainTexture(img, texturePath, child)
                    : getOrCreateTexture(img, texturePath);
                  if (unlit) {
                    child.material = new THREE.MeshBasicMaterial({
                      map: tex,
                      transparent,
                      // Discard (near-)transparent texels so they write no
                      // depth: otherwise the photo's contain padding and
                      // cut-out background still occupy the depth buffer
                      // and clip info/bio when those draw after it in
                      // three.js's transparent sort.
                      alphaTest: 0.5,
                      side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
                    });
                    return;
                  }
                  const materials = Array.isArray(child.material)
                    ? child.material
                    : [child.material];
                  materials.forEach((mat: any) => {
                    mat.map = tex;
                    if (transparent) mat.transparent = true;
                    if (doubleSided) mat.side = THREE.DoubleSide;
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
            },
          );
        },
        `model object for entity ${modelEid}`,
      );
    };

    // Paints the card's video onto the model's own `bragAI` mesh (found by
    // name in the loaded glb's hierarchy) instead of a separate video-plane
    // entity. Mirrors applyTextures' applyToMatchingMeshes below: the mesh
    // hierarchy can populate a moment after the model object itself is
    // registered, so retry the name match a few times before giving up.
    const applyVideo = (
      modelEid: ecs.Eid,
      videoPath: string,
      cardName: string,
      onReady: (failed: boolean) => void,
    ) => {
      const modelObject = world.three.entityToObject.get(modelEid);
      if (!modelObject) {
        onReady(true);
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

      const attachVideo = (attemptsLeft: number = MESH_MATCH_MAX_RETRIES) => {
        const THREE = (window as any).THREE;
        const videoTexture = new THREE.VideoTexture(videoEl);
        // Same V-flip correction as getOrCreateTexture above — bragAI comes
        // from the same Blender->glTF export as the other nodes on this
        // model, so its baked UVs likely need the same treatment.
        videoTexture.wrapS = THREE.MirroredRepeatWrapping;
        videoTexture.wrapT = THREE.MirroredRepeatWrapping;
        videoTexture.offset.set(0, -1);
        videoTexture.needsUpdate = true;

        let matched = false;
        modelObject.traverse((child: any) => {
          if (!child.isMesh || child.name !== VIDEO_MESH_NAME) return;
          matched = true;
          // Replace outright rather than mutating the existing material's
          // .map: GLTFLoader gives bragAI a lit MeshStandardMaterial (the
          // glb has no KHR_materials_unlit extension), which would shade/tint
          // the video under the scene's lights/envmap instead of showing it
          // unshaded like the video plane it replaces did.
          child.material = new THREE.MeshBasicMaterial({ map: videoTexture });
        });

        if (!matched) {
          if (attemptsLeft > 0) {
            setTimeout(
              () => attachVideo(attemptsLeft - 1),
              MESH_MATCH_RETRY_DELAY_MS,
            );
            return;
          }
          console.warn(
            `card-manager: no mesh named "${VIDEO_MESH_NAME}" found for video`,
            "— model hierarchy:",
            modelObject,
          );
          onReady(true);
          return;
        }

        onReady(false);
      };

      videoEl.play().catch((err: any) => {
        console.warn("Video play error:", err);
        onReady(true); // don't hang on error
      });

      if (videoEl.readyState >= 3) {
        attachVideo();
      } else {
        videoEl.addEventListener("playing", () => attachVideo(), {
          once: true,
        });
      }
    };

    // Hides/shows a single entity (and its own Three.js subtree) without
    // touching any of its ECS siblings/children beyond what Three.js's own
    // traverse reaches.
    const setEidVisible = (eid: ecs.Eid, visible: boolean) => {
      if (visible) {
        ecs.Hidden.remove(world, eid);
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

    const setInstanceVisible = (eid: ecs.Eid, visible: boolean) => {
      setEidVisible(eid, visible);
      if (visible) {
        [...world.getChildren(eid)].forEach((childEid) =>
          setEidVisible(childEid, true),
        );
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
        // Wait for both the node textures and (when this card has one) the
        // video on `bragAI` before revealing — same "never show a
        // half-applied model" rule applyTextures already follows on its own.
        let pending = player.video ? 2 : 1;
        let anyFailed = false;
        const oneGroupDone = (failed: boolean) => {
          if (failed) anyFailed = true;
          pending -= 1;
          if (pending > 0) return;

          if (anyFailed) {
            // At least one texture (or the video) never loaded even after
            // retries — don't reveal the model with its baked-in default
            // look. Drop the cached instance and its entity so the next scan
            // of this card starts a fresh load attempt instead of reusing
            // this broken one.
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

          // The clip starts paused (see .expanse.json) so it can't finish —
          // or partially advance — in the background while the card was
          // still hidden during texture loading. Starting it here instead
          // means every reveal plays the same grow-in animation from frame
          // zero and always lands on the correct final scale, regardless of
          // how long texture loading took. Harmless no-op on a re-reveal of
          // an already-unpaused/finished instance. bragAI's own scale-in is
          // baked into this same clip, so the video needs no separate
          // show/hide handling — it appears exactly when the model's grow-in
          // animation reaches it.
          ecs.GltfModel.mutate(world, modelEid, (c) => {
            c.paused = false;
          });
        };

        applyTextures(modelEid, nodeTexturesFor(player), oneGroupDone);
        if (player.video) {
          applyVideo(modelEid, player.video, name, oneGroupDone);
        } else {
          // Not gating the reveal on this: the sparks are scaled to 0 at the
          // paused clip's first frame, so they're invisible until the grow-in
          // runs anyway.
          applySparkMaterials(modelEid);
        }
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
          // PlayerCard's only child: the arTest_Animated model (the video,
          // when this card has one, now lives on that model's own `bragAI`
          // mesh instead of a separate prefab child — see applyVideo).
          const modelEid = children[0];
          instance.modelEid = modelEid;

          // Swap in this card's with/without-video in_animation model. This
          // only runs once per instance (this whole pollUntil block is
          // skipped on every subsequent re-reveal once instance.modelEid is
          // set, see the early return above), so found/lost flicker never
          // re-selects or reloads this model and can't clobber a post-tap
          // state. Wait for GLTF_MODEL_LOADED rather than reusing
          // applyTextures' own "does the object exist yet" poll — right
          // after a url mutation that poll could transiently resolve to the
          // stale prefab-default object instead of the one we just asked for.
          const paths = modelPathsFor(player);

          // Each model variant's baked geometry needs its own local
          // transform on this child entity (see MODEL_TRANSFORMS above) —
          // set it once here, alongside the URL swap below, in the same
          // one-time-per-instance branch. Not re-applied in
          // handleModelTap: a tap only mutates this same entity's
          // gltfModel.url to the matching variant's `.tap` model and never
          // touches position/quaternion/scale, so whatever is set here for
          // `.initial` stays correct through the tap swap (same variant =>
          // same transform).
          const transform = modelTransformFor(player);
          world.setPosition(
            modelEid,
            transform.position.x,
            transform.position.y,
            transform.position.z,
          );
          world.setQuaternion(
            modelEid,
            transform.quaternion.x,
            transform.quaternion.y,
            transform.quaternion.z,
            transform.quaternion.w,
          );
          world.setScale(
            modelEid,
            transform.scale,
            transform.scale,
            transform.scale,
          );

          const initialUrl = ecs.assets.resolveAsset(paths.initial);
          if (!initialUrl) {
            console.warn(
              "card-manager: could not resolve initial model asset",
              paths.initial,
            );
            applyAndReveal(modelEid);
            return;
          }
          waitForModelLoad(
            modelEid,
            () => applyAndReveal(modelEid),
            () => {
              console.warn(
                `card-manager: giving up on "${name}" for now — model never loaded, will retry on next scan`,
              );
              delete instances[name];
              world.deleteEntity(instance.eid);
            },
          );
          ecs.GltfModel.mutate(world, modelEid, (c) => {
            c.url = initialUrl;
          });
        },
        `children of PlayerCard instance "${name}"`,
      );
    };

    const createInstance = (name: string, player: any, e: any) => {
      const instanceEid = world.createEntity("PlayerCard");
      if (!instanceEid) return;

      const instance: CardInstance = {
        eid: instanceEid,
        modelEid: null,
        tapped: false,
      };
      instances[name] = instance;

      // Hide immediately, before anything else — the entity is visible in
      // the scene as soon as it's created, and its model carries baked-in
      // default textures until we apply the real ones. Without this, the
      // model briefly shows that default look every time a new card is
      // scanned for the first time.
      setInstanceVisible(instanceEid, false);

      // Position with the live found-event pose right away — the entity
      // already exists synchronously above, so there's nothing to wait for
      // here. Deferring this used to reuse a stale, closed-over `e` once the
      // delay elapsed, overwriting whatever live REALITY_IMAGE_UPDATED pose
      // had already been applied in the meantime and snapping the model away
      // from the card the moment it was revealed.
      positionInstance(instanceEid, e);
      revealWhenTextured(name, instance, player);
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

    // Swaps the currently-visible card's model from in_animation to
    // tap_animation on tap. Sticky per instance (see CardInstance.tapped) —
    // deliberately never reset on REALITY_IMAGE_LOST/FOUND flicker, since
    // that would jarringly revert the model back to in_animation during
    // ordinary tracking noise.
    const handleModelTap = (e: any) => {
      if (!visibleCardName) return;
      const instance = instances[visibleCardName];
      if (!instance || !instance.modelEid) return;
      if (instance.tapped) return;

      const modelEid = instance.modelEid;
      // Require both start and end of the touch on the model, not just an
      // overlap, so a drag/swipe gesture doesn't get mistaken for a tap.
      if (e.data?.target !== modelEid || e.data?.endTarget !== modelEid) {
        return;
      }

      const player = PLAYER_DATA[visibleCardName];
      if (!player) return;
      // Captured as a const so it stays narrowed to `string` inside the
      // nested callbacks below, unlike the mutable `visibleCardName`.
      const cardName = visibleCardName;

      const tapPath = modelPathsFor(player).tap;
      const tapUrl = ecs.assets.resolveAsset(tapPath);
      if (!tapUrl) {
        console.warn(
          "card-manager: could not resolve tap model asset for",
          visibleCardName,
        );
        return;
      }

      // Set before any async work so a rapid second tap is a no-op right away.
      instance.tapped = true;

      waitForModelLoad(
        modelEid,
        () => {
          // tap_animation is a separate glb with fresh materials — the
          // in_animation textures don't carry over, so reapply them. Same
          // goes for the video on bragAI, which tap_animation_with_video.glb
          // bakes with its own "popped up" resting transform.
          applyTextures(modelEid, nodeTexturesFor(player), (failed) => {
            if (failed) {
              console.warn(
                `card-manager: failed to retexture tap model for "${cardName}"`,
              );
            }
            ecs.GltfModel.mutate(world, modelEid, (c) => {
              c.loop = false;
              c.paused = false;
            });
          });
          if (player.video) {
            applyVideo(modelEid, player.video, cardName, (failed) => {
              if (failed) {
                console.warn(
                  `card-manager: failed to reattach video for tap model "${cardName}"`,
                );
              }
            });
          } else {
            applySparkMaterials(modelEid);
          }
        },
        () => {
          console.warn(
            `card-manager: tap model never loaded for "${cardName}" — allowing retry`,
          );
          instance.tapped = false;
        },
      );
      ecs.GltfModel.mutate(world, modelEid, (c) => {
        c.url = tapUrl;
      });
    };

    world.events.addListener(
      world.events.globalId,
      ecs.events.REALITY_IMAGE_FOUND,
      (e: any) => {
        const name = e.data?.name;
        const player = PLAYER_DATA[name];
        if (!player) return;

        // Only the effective card's target is ever registered with the
        // tracker (see src/app.js), so this should never actually filter
        // anything out in practice — kept as a defensive guard against a
        // future regression where multiple targets get configured again.
        if (name !== effectiveCardId) return;

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

    world.events.addListener(
      world.events.globalId,
      ecs.input.SCREEN_TOUCH_END,
      (e: any) => {
        handleModelTap(e);
      },
    );
  },
});
