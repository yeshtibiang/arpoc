// Read card ID from URL: ?card=001
const urlParams = new URLSearchParams(window.location.search)
const selectedCard = urlParams.get('card')

// Map card IDs to their JSON targets
const CARD_TARGETS = {
  '001': require('../image-targets/001.json'),
  '002': require('../image-targets/002.json'),
  '003': require('../image-targets/003.json'),
  '004': require('../image-targets/004.json'),
  '005': require('../image-targets/005.json'),
  '006': require('../image-targets/006.json'),
  '007': require('../image-targets/007.json'),
  '008': require('../image-targets/008.json'),
  '009': require('../image-targets/009.json'),
  '010': require('../image-targets/010.json'),
  '011': require('../image-targets/011.json'),
  '013': require('../image-targets/013.json'),
  '014': require('../image-targets/014.json'),
  '015': require('../image-targets/015.json'),
  '016': require('../image-targets/016.json'),
  '019': require('../image-targets/019.json'),
  '020': require('../image-targets/020.json'),
  '021': require('../image-targets/021.json'),
  '022': require('../image-targets/022.json'),
  '025': require('../image-targets/025.json'),
  '026': require('../image-targets/026.json'),
  '027': require('../image-targets/027.json'),
  '028': require('../image-targets/028.json'),
  '032': require('../image-targets/032.json'),
  '033': require('../image-targets/033.json'),
  '034': require('../image-targets/034.json'),
  '035': require('../image-targets/035.json'),
  '036': require('../image-targets/036.json'),
  '037': require('../image-targets/037.json'),
  '038': require('../image-targets/038.json'),
  '039': require('../image-targets/039.json'),
  '040': require('../image-targets/040.json'),
  '041': require('../image-targets/041.json'),
  '042': require('../image-targets/042.json'),
  '043': require('../image-targets/043.json'),
  '044': require('../image-targets/044.json'),
  '045': require('../image-targets/045.json'),
  '046': require('../image-targets/046.json'),
  '047': require('../image-targets/047.json'),
  '048': require('../image-targets/048.json'),
  '049': require('../image-targets/049.json'),
  '050': require('../image-targets/050.json'),
  '051': require('../image-targets/051.json'),
  '052': require('../image-targets/052.json'),
  '053': require('../image-targets/053.json'),
  '054': require('../image-targets/054.json'),
  '055': require('../image-targets/055.json'),
  '056': require('../image-targets/056.json'),
  '057': require('../image-targets/057.json'),
  '058': require('../image-targets/058.json'),
  '059': require('../image-targets/059.json'),
  '060': require('../image-targets/060.json'),
  '061': require('../image-targets/061.json'),
  '062': require('../image-targets/062.json'),
  '063': require('../image-targets/063.json'),
  '064': require('../image-targets/064.json'),
  '065': require('../image-targets/065.json'),
  '066': require('../image-targets/066.json'),
  '067': require('../image-targets/067.json'),
  '068': require('../image-targets/068.json'),
  '069': require('../image-targets/069.json'),
  '070': require('../image-targets/070.json'),
  '071': require('../image-targets/071.json'),
  '072': require('../image-targets/072.json'),
  '901': require('../image-targets/901.json'),
  '902': require('../image-targets/902.json'),
  '903': require('../image-targets/903.json'),
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