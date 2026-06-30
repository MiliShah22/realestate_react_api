export const authTypeDefs = /* GraphQL */ `
  enum UserRole {
    SUPER_ADMIN
    SUPPORT_AGENT
    FRANCHISE_OWNER
    FRANCHISE_STAFF
    CUSTOMER
  }

  type User {
    id: ID!
    tenant: Tenant
    role: UserRole!
    name: String!
    email: String!
    phone: String
    avatarUrl: String
    city: String
    emailVerified: Boolean!
    phoneVerified: Boolean!
    isActive: Boolean!
    notificationPrefs: JSON!
    lastLoginAt: DateTime
    createdAt: DateTime!
  }

  type AuthPayload {
    accessToken: String!
    refreshToken: String!
    user: User!
  }

  input SignupInput {
    role: UserRole!          # CUSTOMER or FRANCHISE_OWNER only — enforced server-side
    name: String!
    email: String!
    password: String!
    phone: String!
    city: String
    # Franchise-only fields:
    businessName: String
    gstin: String
  }

  input LoginInput {
    email: String!
    password: String!
    role: UserRole!          # must match the account's actual role
  }

  extend type Query {
    """ The currently authenticated user, derived from the bearer token. """
    me: User

    """ Platform admin / franchise owner: list users (scoped by RLS). """
    users(
      pagination: PaginationInput
      search: String
      role: UserRole
      status: String
    ): UserConnection!
  }

  type UserConnection {
    items: [User!]!
    pageInfo: PageInfo!
  }

  extend type Mutation {
    signup(input: SignupInput!): AuthPayload!
    login(input: LoginInput!): AuthPayload!
    refreshToken(refreshToken: String!): AuthPayload!
    logout(refreshToken: String!): MutationResponse!
    logoutAllSessions: MutationResponse!

    requestPasswordReset(email: String!): MutationResponse!
    resetPassword(token: String!, newPassword: String!): MutationResponse!
    changePassword(currentPassword: String!, newPassword: String!): MutationResponse!

    verifyOtp(contact: String!, code: String!, purpose: String!): MutationResponse!
    resendOtp(contact: String!, purpose: String!): MutationResponse!

    updateProfile(name: String, phone: String, city: String, avatarUrl: String): User!
    updateNotificationPrefs(prefs: JSON!): User!

    """ Admin/Franchise-owner only: suspend, activate, or change role of a user. """
    setUserStatus(userId: ID!, isActive: Boolean!): User!
  }
`;
