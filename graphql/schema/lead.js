export const leadTypeDefs = /* GraphQL */ `
  enum LeadStatus {
    NEW
    CONTACTED
    FOLLOW_UP
    CONVERTED
    LOST
  }

  type LeadStatusEvent {
    id: ID!
    fromStatus: LeadStatus
    toStatus: LeadStatus!
    note: String
    changedBy: User
    createdAt: DateTime!
  }
scalar BigInt

  type Lead {
    id: ID!
    tenant: Tenant!
    property: Property
    customer: User
    assignedAgent: User

    contactName: String!
    contactEmail: String
    contactPhone: String!

    budgetLabel: String
    budgetPaise: BigInt
    city: String
    source: String!
    message: String

    status: LeadStatus!
    internalNotes: String

    history: [LeadStatusEvent!]!

    contactedAt: DateTime
    convertedAt: DateTime
    createdAt: DateTime!
  }

  type LeadConnection {
    items: [Lead!]!
    pageInfo: PageInfo!
  }

  input LeadFilterInput {
    status: LeadStatus
    propertyId: ID
    assignedAgentId: ID
    search: String
    city: String
  }

  input CreateLeadInput {
    propertyId: ID!
    contactName: String!
    contactEmail: String
    contactPhone: String!
    budgetLabel: String
    message: String
    source: String = "SEARCH"
  }

  extend type Query {
    leads(filter: LeadFilterInput, pagination: PaginationInput): LeadConnection!
    lead(id: ID!): Lead

    """ Customer: enquiries they've personally sent. """
    myEnquiries(pagination: PaginationInput): LeadConnection!

    leadStats: LeadStats!
  }

  type LeadStats {
    total: Int!
    new: Int!
    contacted: Int!
    followUp: Int!
    converted: Int!
    lost: Int!
  }

  extend type Mutation {
    """ Customer (or guest): submit an enquiry on a property — creates a Lead. """
    createLead(input: CreateLeadInput!): Lead!

    updateLeadStatus(id: ID!, status: LeadStatus!, note: String): Lead!
    assignLead(id: ID!, agentId: ID!): Lead!
    addLeadNote(id: ID!, note: String!): Lead!
    deleteLead(id: ID!): MutationResponse!
  }
`;
