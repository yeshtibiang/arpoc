const {effectiveCardId} = require('./common/selected-card')

const onxrloaded = () => {
  XR8.addCameraPipelineModule(LandingPage.pipelineModule())

  // Only the effective card's target is fetched here — image-targets/*.json
  // is already copied to dist/ by CopyWebpackPlugin (config/webpack.config.js),
  // so this needs no webpack changes. Must stay a relative path (no leading
  // slash): production is served from a GitHub Pages project subpath, not
  // domain root, and every other asset path in this app (assets/textures/...,
  // assets/videos/...) already relies on relative resolution against the
  // current document URL.
  fetch(`image-targets/${effectiveCardId}.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
    .then((targetData) => {
      XR8.XrController.configure({
        imageTargetData: [targetData],
      })
    })
    .catch((err) => {
      console.warn(`app.js: failed to load image target for card "${effectiveCardId}"`, err)
    })
}
window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
