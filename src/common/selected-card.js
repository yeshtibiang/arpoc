const cards = require('./cards.json')

// Resolve which card is "in play" for this page load, once, at module
// evaluation time. Both src/app.js and src/common/card-manager.ts require()
// /import this same module, and webpack (like Node) caches a module
// instance by resolved path — so both files are guaranteed to see the exact
// same effectiveCardId, rather than each independently recomputing a
// "fallback to first key" that only coincidentally agrees.
const cardIds = Object.keys(cards)
const urlParams = new URLSearchParams(window.location.search)
const requestedCardId = urlParams.get('card')

const isKnownCard = requestedCardId !== null
  && Object.prototype.hasOwnProperty.call(cards, requestedCardId)

const effectiveCardId = isKnownCard ? requestedCardId : cardIds[0]

if (requestedCardId && !isKnownCard) {
  console.warn(`selected-card: unknown card id "${requestedCardId}" in URL, falling back to "${effectiveCardId}"`)
} else if (!requestedCardId) {
  console.info(`selected-card: no ?card= in URL, defaulting to "${effectiveCardId}"`)
}

module.exports = {cards, effectiveCardId}
