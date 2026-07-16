export const reviewTypeDefs = /* GraphQL */ `
  enum ReviewStatus {
    PENDING
    APPROVED
    REJECTED
  }

  type Review {
    id: ID!
    property: Property!
    user: User!
    rating: Int!
    body: String!
    status: ReviewStatus!
    moderatedBy: User
    moderatedAt: DateTime
    createdAt: DateTime!
  }

  type ReviewConnection {
    items: [Review!]!
    pageInfo: PageInfo!
  }

  input ReviewFilterInput {
    status: ReviewStatus
    minRating: Int
    propertyId: ID
    search: String
  }

  extend type Query {
    reviews(filter: ReviewFilterInput, pagination: PaginationInput): ReviewConnection!
    propertyReviews(propertyId: ID!, pagination: PaginationInput): ReviewConnection!
    myReviews(pagination: PaginationInput): ReviewConnection!

  }

  extend type Mutation {
    createReview(propertyId: ID!, rating: Int!, body: String!): Review!
    moderateReview(id: ID!, status: ReviewStatus!): Review!
    deleteReview(id: ID!): MutationResponse!
  }
`;

export const savedSearchTypeDefs = /* GraphQL */ `
  type SavedSearch {
    id: ID!
    label: String
    query: JSON!
    alertsEnabled: Boolean!
    lastNotifiedAt: DateTime
    createdAt: DateTime!
  }

  extend type Query {
    mySavedSearches: [SavedSearch!]!
    mySearchHistory(limit: Int = 10): [JSON!]!
  }

  extend type Mutation {
    saveSearch(label: String, query: JSON!, alertsEnabled: Boolean = true): SavedSearch!
    toggleSearchAlert(id: ID!, enabled: Boolean!): SavedSearch!
    deleteSavedSearch(id: ID!): MutationResponse!
    recordSearch(query: JSON!, resultCount: Int): MutationResponse!
    clearSearchHistory: MutationResponse!
  }
`;

export const reportTypeDefs = /* GraphQL */ `
  """ Platform-wide (SUPER_ADMIN) or tenant-scoped (FRANCHISE_OWNER) KPI summary. """
  type DashboardStats {
    totalProperties: Int!
    activeUsers: Int!
    monthlyRevenuePaise: Int!
    pendingReviews: Int!
    franchiseCount: Int!         # platform-only; 0 for tenant scope
    newLeads: Int!
  }

  type MonthlyMetric {
    month: String!
    revenuePaise: Int!
    leads: Int!
    propertiesListed: Int!
  }

  type CityMetric {
    city: String!
    listings: Int!
    leads: Int!
    revenuePaise: Int!
  }

  type PropertyTypeBreakdown {
    propertyType: PropertyTypeEnum!
    count: Int!
    percentage: Float!
  }

  extend type Query {
    dashboardStats: DashboardStats!
    monthlyMetrics(months: Int = 12): [MonthlyMetric!]!
    cityMetrics: [CityMetric!]!
    propertyTypeBreakdown: [PropertyTypeBreakdown!]!

    """ SUPER_ADMIN only: commission + subscription revenue, platform-wide. """
    revenueBreakdown: RevenueBreakdown!
  }

  type RevenueBreakdown {
    subscriptionRevenuePaise: Int!
    commissionRevenuePaise: Int!
    totalRevenuePaise: Int!
  }
`;
