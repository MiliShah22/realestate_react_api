export const propertyTypeDefs = /* GraphQL */ `
  enum PropertyStatusEnum {
    DRAFT
    PENDING_REVIEW
    ACTIVE
    INACTIVE
    REJECTED
    SOLD
    ARCHIVED
  }

  enum ListingTypeEnum {
    SALE
    RENT
    PG
  }

  enum PropertyTypeEnum {
    APARTMENT
    VILLA
    PLOT
    COMMERCIAL
    OFFICE
    PG_ROOM
  }

  type PropertyImage {
    id: ID!
    url: String!
    altText: String
    sortOrder: Int!
    isCover: Boolean!
  }
scalar BigInt

  type Property {
    id: ID!
    tenant: Tenant!
    createdBy: User
    assignedAgent: User

    title: String!
    description: String
    listingType: ListingTypeEnum!
    propertyType: PropertyTypeEnum!
    status: PropertyStatusEnum!

    bhk: String
    carpetAreaSqft: Float
    builtupAreaSqft: Float
    pricePaise: BigInt!
    priceDisplay: String!          # formatted ₹ string, e.g. "₹1.25 Cr"
    pricePerSqftPaise: Int
    maintenancePaise: Int

    possessionStatus: String
    possessionDate: DateTime

    addressLine: String
    locality: String
    city: String!
    state: String
    pincode: String
    latitude: Float
    longitude: Float

    builderName: String
    rating: Float
    reviewCount: Int!

    isFeatured: Boolean!
    isVerified: Boolean!
    viewCount: Int!
    leadCount: Int!

    amenities: [String!]!
    images: [PropertyImage!]!

    publishedAt: DateTime
    createdAt: DateTime!
  }

  type PropertyConnection {
    items: [Property!]!
    pageInfo: PageInfo!
  }

  input PropertyFilterInput {
    city: String
    locality: String
    listingType: ListingTypeEnum
    propertyType: PropertyTypeEnum
    bhk: [String!]
    minPrice: Int
    maxPrice: Int
    minAreaSqft: Float
    maxAreaSqft: Float
    possessionStatus: String
    amenities: [String!]
    isFeatured: Boolean
    status: PropertyStatusEnum
    search: String                 # full text search across title/locality/builder/description
    tenantId: ID                   # admin/franchise scoping
  }

  enum PropertySortField {
    PRICE
    CREATED_AT
    VIEW_COUNT
    RATING
  }

  input PropertySortInput {
    field: PropertySortField = CREATED_AT
    direction: SortDirection = DESC
  }

  input PropertyInput {
    title: String!
    description: String
    listingType: ListingTypeEnum!
    propertyType: PropertyTypeEnum!
    bhk: String
    carpetAreaSqft: Float
    builtupAreaSqft: Float
    pricePaise: Int!
    maintenancePaise: Int
    possessionStatus: String
    possessionDate: DateTime
    addressLine: String
    locality: String
    city: String!
    state: String
    pincode: String
    latitude: Float
    longitude: Float
    builderName: String
    amenities: [String!]
    assignedAgentId: ID
  }

  extend type Query {
    properties(
      filter: PropertyFilterInput
      sort: PropertySortInput
      pagination: PaginationInput
    ): PropertyConnection!

    property(id: ID!): Property

    """ Properties saved by the current customer. """
    savedProperties(pagination: PaginationInput): PropertyConnection!

    """ Featured properties for the homepage rail. """
    featuredProperties(limit: Int = 8): [Property!]!

    """ Properties similar to a given one (same city + type, excluding itself). """
    similarProperties(propertyId: ID!, limit: Int = 4): [Property!]!
  }

  extend type Mutation {
    """ Franchise staff/owner: create a new listing (starts as DRAFT). """
    createProperty(input: PropertyInput!): Property!
    updateProperty(id: ID!, input: PropertyInput!): Property!
    deleteProperty(id: ID!): MutationResponse!

    """ Franchise: submit a DRAFT for admin review. """
    submitPropertyForReview(id: ID!): Property!

    """ Admin only: approve/reject/feature toggles. """
    setPropertyStatus(id: ID!, status: PropertyStatusEnum!, reason: String): Property!
    setPropertyFeatured(id: ID!, isFeatured: Boolean!): Property!
    setPropertyVerified(id: ID!, isVerified: Boolean!): Property!

    addPropertyImages(propertyId: ID!, urls: [String!]!): Property!
    removePropertyImage(imageId: ID!): MutationResponse!
    setCoverImage(imageId: ID!): MutationResponse!

    """ Customer: toggle save/unsave. Returns the new saved state. """
    toggleSaveProperty(propertyId: ID!): Boolean!

    """ Fire-and-forget view counter increment (called on detail page load). """
    recordPropertyView(propertyId: ID!): MutationResponse!
  }
`;
