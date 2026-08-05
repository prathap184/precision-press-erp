/**
 * Re-export drizzle-orm operators through a single local module.
 *
 * When Next.js bundles this monorepo workspace the webpack minifier sometimes
 * drops named exports from the hoisted `drizzle-orm` package (appearing at
 * runtime as `(0, x.I8) is not a function`).  Routing the imports through this
 * local barrel forces the bundler to retain all referenced exports.
 */
export {
  eq,
  ne,
  and,
  or,
  not,
  gt,
  gte,
  lt,
  lte,
  isNull,
  isNotNull,
  inArray,
  notInArray,
  between,
  ilike,
  like,
  asc,
  desc,
  sql,
  count,
  sum,
  avg,
  min,
  max,
} from "drizzle-orm";
