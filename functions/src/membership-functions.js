const { onCall } = require('firebase-functions/v2/https')
const service = require('./membership-service')

const listMembershipTiers = onCall((request) => (
  service.invokeMembershipRead(request, service.listMembershipTiers)
))

const listMemberships = onCall((request) => (
  service.invokeMembershipRead(request, service.listMemberships)
))

const getUserMemberships = onCall((request) => (
  service.invokeMembershipRead(request, service.getUserMemberships)
))

const createManualMembership = onCall((request) => (
  service.invokeMembershipMutation(request, service.createManualMembership, 'createManualMembership')
))

const revokeMembership = onCall((request) => (
  service.invokeMembershipMutation(request, service.revokeMembership, 'revokeMembership')
))

const createMembershipTier = onCall((request) => (
  service.invokeMembershipMutation(request, service.createMembershipTier, 'createMembershipTier')
))

const updateMembershipTier = onCall((request) => (
  service.invokeMembershipMutation(request, service.updateMembershipTier, 'updateMembershipTier')
))

const deactivateMembershipTier = onCall((request) => (
  service.invokeMembershipMutation(request, service.deactivateMembershipTier, 'deactivateMembershipTier')
))

module.exports = {
  listMembershipTiers,
  listMemberships,
  getUserMemberships,
  createManualMembership,
  revokeMembership,
  createMembershipTier,
  updateMembershipTier,
  deactivateMembershipTier,
}
