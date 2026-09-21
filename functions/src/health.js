const { onCall } = require('firebase-functions/v2/https')
const { getTrustedActor } = require('./auth')

function buildHealthResponse(actor) {
  return {
    ok: true,
    authenticated: true,
    actorUid: actor.uid,
    authorizationPresent: Boolean(actor.authorization),
    authorizationVersion: actor.authorization?.version ?? null,
  }
}

const authHealth = onCall(async (request) => {
  const actor = await getTrustedActor(request)
  return buildHealthResponse(actor)
})

module.exports = { authHealth, buildHealthResponse }
