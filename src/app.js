// Read card ID from URL: ?card=Card_Siya_Kolisi
const urlParams = new URLSearchParams(window.location.search)
const selectedCard = urlParams.get('card')

// Map card IDs to their JSON targets
const CARD_TARGETS = {
  'Card_Siya_Kolisi': require('../image-targets/Card_Siya_Kolisi.json'),
  'Card_Nandine_Roos': require('../image-targets/Card_Nandine_Roos.json'),
}

const onxrloaded = () => {
  // Load ONLY the selected card's target
  const targetData = selectedCard && CARD_TARGETS[selectedCard]
    ? [CARD_TARGETS[selectedCard]]
    : Object.values(CARD_TARGETS) // fallback: load all if no card specified

  XR8.XrController.configure({
    imageTargetData: targetData,
  })
  XR8.addCameraPipelineModule(LandingPage.pipelineModule())
}
window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)