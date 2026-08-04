import { GraphQLScalarType, Kind } from 'graphql';

export const scalarResolvers = {
  /**
   * Postgres BIGINT columns (price_paise, budget_paise) come back from
   * node-postgres as STRINGS, not numbers, to avoid silent precision loss
   * above Number.MAX_SAFE_INTEGER. Real-estate rupee-paise values never get
   * remotely close to that ceiling (₹1 lakh crore would still be safe), so
   * we convert to a JS number for the client. Schema declared `scalar BigInt`
   * with no matching resolver entry here previously — that's a hard crash
   * the first time any query selects pricePaise/budgetPaise.
   */
  BigInt: new GraphQLScalarType({
    name: 'BigInt',
    description: 'Integer value that may exceed 32-bit range (stored as Postgres BIGINT, e.g. paise amounts)',
    serialize(value) {
      if (value == null) return null;
      return typeof value === 'string' ? Number(value) : Number(value);
    },
    parseValue(value) {
      return typeof value === 'string' ? Number(value) : value;
    },
    parseLiteral(ast) {
      return ast.kind === Kind.INT || ast.kind === Kind.STRING ? Number(ast.value) : null;
    },
  }),

  DateTime: new GraphQLScalarType({
    name: 'DateTime',
    description: 'ISO-8601 date-time scalar',
    serialize(value) {
      if (value instanceof Date) return value.toISOString();
      if (typeof value === 'string') return new Date(value).toISOString();
      return null;
    },
    parseValue(value) {
      return new Date(value);
    },
    parseLiteral(ast) {
      return ast.kind === Kind.STRING ? new Date(ast.value) : null;
    },
  }),

  JSON: new GraphQLScalarType({
    name: 'JSON',
    description: 'Arbitrary JSON value',
    serialize: (value) => value,
    parseValue: (value) => value,
    parseLiteral: function parseLiteral(ast) {
      switch (ast.kind) {
        case Kind.STRING:
        case Kind.BOOLEAN:
          return ast.value;
        case Kind.INT:
        case Kind.FLOAT:
          return Number(ast.value);
        case Kind.OBJECT: {
          const value = {};
          ast.fields.forEach((field) => { value[field.name.value] = parseLiteral(field.value); });
          return value;
        }
        case Kind.LIST:
          return ast.values.map(parseLiteral);
        case Kind.NULL:
          return null;
        default:
          return null;
      }
    },
  }),
};
