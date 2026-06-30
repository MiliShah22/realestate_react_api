export const tenantTypeDefs = /* GraphQL */ `
  enum TenantStatus {
    TRIAL
    ACTIVE
    PAST_DUE
    SUSPENDED
    CANCELLED
  }

  type Plan {
    id: ID!
    code: String!
    name: String!
    description: String
    priceMonthlyPaise: Int!
    priceYearlyPaise: Int!
    maxListings: Int!
    maxStaffSeats: Int!
    commissionRate: Float!
    features: JSON!
    isActive: Boolean!
  }

  type Tenant {
    id: ID!
    name: String!
    slug: String!
    billingEmail: String!
    phone: String
    gstin: String
    city: String
    logoUrl: String
    plan: Plan
    status: TenantStatus!
    trialEndsAt: DateTime
    currentPeriodStart: DateTime
    currentPeriodEnd: DateTime
    commissionRateOverride: Float
    effectiveCommissionRate: Float!     # override if set, else plan default
    settings: JSON!
    suspendedAt: DateTime
    suspensionReason: String
    createdAt: DateTime!

    # Aggregates (resolved via DataLoader/SQL aggregate, not N+1)
    listingCount: Int!
    activeLeadCount: Int!
    staffCount: Int!
    monthlyRevenuePaise: Int!
  }

  type TenantConnection {
    items: [Tenant!]!
    pageInfo: PageInfo!
  }

  input CreateTenantInput {
    name: String!
    billingEmail: String!
    phone: String
    gstin: String
    city: String
    planId: ID!
    ownerName: String!
    ownerEmail: String!
    ownerPassword: String!
    ownerPhone: String!
  }

  input UpdateTenantInput {
    name: String
    phone: String
    gstin: String
    city: String
    logoUrl: String
    planId: ID
    commissionRateOverride: Float
  }

  extend type Query {
    plans: [Plan!]!
    plan(id: ID!): Plan

    """ SUPER_ADMIN/SUPPORT_AGENT only — cross-tenant list. """
    tenants(pagination: PaginationInput, search: String, status: TenantStatus): TenantConnection!
    tenant(id: ID!): Tenant

    """ The tenant of the currently authenticated franchise user. """
    myTenant: Tenant
  }

  extend type Mutation {
    """ SUPER_ADMIN only: onboard a brand-new franchise + its owner account. """
    createTenant(input: CreateTenantInput!): Tenant!

    updateTenant(id: ID!, input: UpdateTenantInput!): Tenant!
    suspendTenant(id: ID!, reason: String!): Tenant!
    reactivateTenant(id: ID!): Tenant!

    changeTenantPlan(id: ID!, planId: ID!): Tenant!

    """ Franchise owner: invite a staff member into their own tenant. """
    inviteStaff(name: String!, email: String!, phone: String!): User!
  }
`;
