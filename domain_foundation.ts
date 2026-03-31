export const DOMAIN_FOUNDATION_INVARIANTS = {
  actor: 'ownership_truth',
  session: 'runtime_access_layer_only',
  order: 'commercial_truth',
  payment: 'financial_truth',
  entitlement: 'product_truth',
  accessGrant: 'operational_access_truth',
  event: 'programming_and_audience_subject',
  registration: 'participation_intent_or_approval',
  ticket: 'event_specific_access_artifact',
  membership: 'ongoing_non_ticket_access_container',
  venueSlot: 'space_time_usage_anchor',
  accessEligibility: 'admission_or_usage_eligibility_only',
  discountEligibility: 'pricing_eligibility_only',
  contactPoint: 'auditable_contact_surface',
  consent: 'auditable_communication_permission',
  attribution: 'growth_and_partner_source_anchor',
} as const;

export const DOMAIN_FOUNDATION_ANTI_OVERLOAD_POSITIONS = {
  clubCardIsNotTicket: true,
  membershipSoldThroughCheckoutButSeparateConcept: true,
  ticketRemainsEventSpecificArtifact: true,
  discountEligibilityIsNotAccessEligibility: true,
  slotAccessIsNotFakeEventTicket: true,
  roleAssignmentIsNotActorKindOnly: true,
  consentMustBeExplicitAndAuditable: true,
  frontendMustNotOwnBusinessRules: true,
} as const;

export type RoleAssignmentStatus = 'active' | 'inactive' | 'revoked';
export type RoleType =
  | 'guest'
  | 'member'
  | 'resident'
  | 'artist'
  | 'performer'
  | 'vip_guest'
  | 'volunteer'
  | 'staff'
  | 'partner'
  | 'media'
  | 'influencer'
  | 'organizer'
  | 'operator'
  | 'guard';

export type RoleAssignment = {
  id: string;
  actorId: string;
  roleType: RoleType;
  scopeRef: string | null;
  status: RoleAssignmentStatus;
  validFrom: string | null;
  validTo: string | null;
};

export type ContactChannel = 'email' | 'phone' | 'telegram' | 'whatsapp';
export type ContactPointStatus = 'active' | 'inactive' | 'blocked';

export type ContactPoint = {
  id: string;
  actorId: string;
  channel: ContactChannel;
  value: string;
  isPrimary: boolean;
  verifiedAt: string | null;
  status: ContactPointStatus;
};

export type ConsentType =
  | 'marketing'
  | 'transactional'
  | 'community_updates'
  | 'partner_offers';
export type ConsentStatus = 'granted' | 'revoked' | 'pending';

export type Consent = {
  id: string;
  actorId: string;
  contactPointId: string | null;
  consentType: ConsentType;
  status: ConsentStatus;
  sourceRef: string | null;
  grantedAt: string | null;
  revokedAt: string | null;
};

export type NotificationTopic =
  | 'events'
  | 'memberships'
  | 'transactions'
  | 'community'
  | 'partner_offers';
export type NotificationPreferenceStatus = 'enabled' | 'disabled' | 'muted';

export type NotificationPreference = {
  id: string;
  actorId: string;
  channel: ContactChannel;
  topic: NotificationTopic;
  status: NotificationPreferenceStatus;
};

export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed';
export type EventVisibility = 'public' | 'private' | 'members_only' | 'invite_only';

export type Event = {
  id: string;
  venueId: string | null;
  title: string;
  status: EventStatus;
  startsAt: string;
  endsAt: string;
  categoryRef: string | null;
  characteristicRefs: string[];
  visibility: EventVisibility;
  metadata: Record<string, unknown>;
};

export type EventCategoryStatus = 'active' | 'inactive';

export type EventCategory = {
  id: string;
  key: string;
  title: string;
  status: EventCategoryStatus;
};

export type EventCharacteristicValueType = 'boolean' | 'string' | 'number' | 'enum';

export type EventCharacteristic = {
  id: string;
  key: string;
  valueType: EventCharacteristicValueType;
  value: boolean | string | number | null;
  allowedValues: string[] | null;
};

export type RegistrationSourceType =
  | 'checkout'
  | 'manual'
  | 'invite'
  | 'partner'
  | 'membership';
export type RegistrationStatus =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'checked_in';

export type Registration = {
  id: string;
  actorId: string;
  eventId: string;
  sourceType: RegistrationSourceType;
  status: RegistrationStatus;
  requestedAt: string;
  approvedAt: string | null;
};

export type TicketStatus = 'reserved' | 'issued' | 'used' | 'expired' | 'revoked';
export type TicketAccessClass =
  | 'general'
  | 'vip'
  | 'backstage'
  | 'staff'
  | 'member';

export type Ticket = {
  id: string;
  eventId: string;
  actorId: string | null;
  registrationId: string | null;
  orderId: string | null;
  status: TicketStatus;
  accessClass: TicketAccessClass;
  validFrom: string | null;
  validTo: string | null;
};

export type MembershipProductStatus = 'draft' | 'active' | 'inactive' | 'archived';
export type MembershipBillingMode = 'one_time' | 'recurring';
export type MembershipTermKind = 'days' | 'months' | 'years' | 'open_ended';

export type MembershipProduct = {
  id: string;
  key: string;
  title: string;
  status: MembershipProductStatus;
  billingMode: MembershipBillingMode;
  termKind: MembershipTermKind;
  metadata: Record<string, unknown>;
};

export type MembershipLifecycleStatus =
  | 'pending'
  | 'active'
  | 'paused'
  | 'expired'
  | 'revoked';

export type MembershipTierStatus = 'active' | 'inactive';

export type MembershipTier = {
  id: string;
  key: string;
  title: string;
  status: MembershipTierStatus;
};

export type Membership = {
  id: string;
  actorId: string;
  membershipProductId: string;
  membershipTierId: string;
  status: MembershipLifecycleStatus;
  startsAt: string;
  endsAt: string | null;
  sourceOrderId: string | null;
};

export type MembershipEntitlementType =
  | 'full_access'
  | 'conditional_access'
  | 'weekday_discount'
  | 'members_only'
  | 'daytime_slot_access';
export type MembershipEntitlementStatus = 'pending' | 'active' | 'expired' | 'revoked';

export type MembershipEntitlement = {
  id: string;
  membershipId: string;
  entitlementType: MembershipEntitlementType;
  scopeRef: string;
  status: MembershipEntitlementStatus;
  validFrom: string | null;
  validTo: string | null;
};

export type VenueStatus = 'active' | 'inactive';

export type Venue = {
  id: string;
  key: string;
  title: string;
  status: VenueStatus;
  metadata: Record<string, unknown>;
};

export type VenueSlotType = 'event' | 'daytime_use' | 'resident_use' | 'private_booking';
export type VenueSlotStatus = 'open' | 'held' | 'reserved' | 'closed';

export type VenueSlot = {
  id: string;
  venueId: string;
  startsAt: string;
  endsAt: string;
  slotType: VenueSlotType;
  capacity: number | null;
  status: VenueSlotStatus;
};

export type AccessEligibilityInput = {
  actorId: string;
  subjectRef: string;
  membershipIds: string[];
  ticketIds: string[];
  roleAssignments: RoleAssignment[];
  trustLevel: string;
};

export type AccessEligibilityDecision = {
  allowed: boolean;
  reasonCode: string;
  matchedSourceRef: string | null;
};

export type DiscountEligibilityInput = {
  actorId: string;
  subjectRef: string;
  membershipIds: string[];
  referralSourceId: string | null;
  partnerId: string | null;
  campaignRef: string | null;
};

export type DiscountEligibilityDecision = {
  eligible: boolean;
  reasonCode: string;
  appliedRuleRef: string | null;
};

export type ReferralSourceType = 'campaign' | 'partner' | 'invite' | 'organic' | 'media';
export type ReferralSourceStatus = 'active' | 'inactive';

export type ReferralSource = {
  id: string;
  key: string;
  title: string;
  sourceType: ReferralSourceType;
  status: ReferralSourceStatus;
};

export type PartnerType =
  | 'commercial'
  | 'media'
  | 'community'
  | 'resident_program'
  | 'influencer';
export type PartnerStatus = 'active' | 'inactive';

export type Partner = {
  id: string;
  key: string;
  title: string;
  partnerType: PartnerType;
  status: PartnerStatus;
};

export type CampaignAttribution = {
  id: string;
  actorId: string | null;
  sourceRef: string;
  campaignRef: string | null;
  partnerRef: string | null;
  happenedAt: string;
  metadata: Record<string, unknown>;
};

export const DOMAIN_FOUNDATION_RELATIONSHIPS = {
  eventNotDerivedFromOrder: true,
  registrationNotEquivalentToTicket: true,
  ticketNotEquivalentToMembership: true,
  membershipNotEquivalentToOrderAccess: true,
  contactPointNotEquivalentToActorProfileMetadata: true,
  partnerReferralAttributionNotEquivalentToRawQueryString: true,
  venueSlotNotEquivalentToEvent: true,
} as const;
