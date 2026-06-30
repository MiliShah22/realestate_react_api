import { GraphQLScalarType, Kind } from 'graphql';

export const scalarResolvers = {
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
