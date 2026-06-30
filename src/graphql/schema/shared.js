export const sharedTypeDefs = /* GraphQL */ `
  scalar DateTime
  scalar JSON

  """ Generic pagination wrapper used by every list query. """
  type PageInfo {
    totalCount: Int!
    hasNextPage: Boolean!
    page: Int!
    pageSize: Int!
  }

  input PaginationInput {
    page: Int = 1
    pageSize: Int = 20
  }

  type MutationResponse {
    success: Boolean!
    message: String
  }

  enum SortDirection {
    ASC
    DESC
  }

  type Query {
    _empty: String
  }

  type Mutation {
    _empty: String
  }
`;
