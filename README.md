# @metreeca/blue

[![npm](https://img.shields.io/npm/v/@metreeca/blue)](https://www.npmjs.com/package/@metreeca/blue)

Declarative blueprints for model-driven linked data processing.

**@metreeca/blue** provides a shape-based schema framework for the linked data model defined
by [@metreeca/qest](https://metreeca.github.io/qest/).

Shape-based schemas go beyond structural validation, capturing the complete semantics of a resource (structure,
constraints, metadata, and relationships), enabling them to act as a single source of truth for automated validation,
persistence, API publishing, UI generation, and more:

- **Define Once, Use Everywhere**: a single schema drives all automated processes
- **Guaranteed Consistency**: schema changes propagate to all dependent processes automatically
- **Less Code to Maintain**: declarative definitions replace scattered imperative logic

**@metreeca/blue** is designed for a broad range of model-driven tasks and ships with a robust and ready-to-use
validation engine:

- **No Type Duplication**: types and validation rules derived from a single schema
- **One Schema, Every Mode**: same schema validates state, updates, projections, and queries
- **Actionable Error Feedback**: per-value, per-property traces surface precise violations
- **Custom When Needed**: pluggable validators extend built-in constraints

> [!NOTE]
>
> **@metreeca/blue** is part of the
> [@metreeca/qest integrated ecosystem](https://github.com/metreeca/qest#ecosystem)
> for rapid development of linked data applications.

# Installation

```shell
npm install @metreeca/blue
```

> [!WARNING]
>
> TypeScript consumers must use `"moduleResolution": "nodenext"/"node16"/"bundler"` in `tsconfig.json`.
> The legacy `"node"` resolver is not supported.

# Usage

> [!NOTE]
>
> This section introduces essential concepts; for complete coverage, see the API reference:
>
> | Module                         | Description                                |
> |--------------------------------|--------------------------------------------|
> | [@metreeca/blue]               | Linked data validation API                 |
> | [@metreeca/blue/value]         | Composite shapes and value projections     |
> | [@metreeca/blue/boolean]       | Boolean shape and factories                |
> | [@metreeca/blue/number]        | Numeric shape and factories                |
> | [@metreeca/blue/string]        | Textual shape and factories                |
> | [@metreeca/blue/dictionary]    | Dictionary shape and factories             |
> | [@metreeca/blue/reference]     | Reference shape and factories              |
> | [@metreeca/blue/resource]      | Resource shape and factories               |

[@metreeca/blue]: https://metreeca.github.io/blue/modules/index.html

[@metreeca/blue/value]: https://metreeca.github.io/blue/modules/value.html

[@metreeca/blue/boolean]: https://metreeca.github.io/blue/modules/boolean.html

[@metreeca/blue/number]: https://metreeca.github.io/blue/modules/number.html

[@metreeca/blue/string]: https://metreeca.github.io/blue/modules/string.html

[@metreeca/blue/dictionary]: https://metreeca.github.io/blue/modules/dictionary.html

[@metreeca/blue/reference]: https://metreeca.github.io/blue/modules/reference.html

[@metreeca/blue/resource]: https://metreeca.github.io/blue/modules/resource.html


## Defining Schemas

Schemas describe the expected structure of a resource using shape factories:

```ts
import { union } from "@metreeca/blue/union";
import { boolean } from "@metreeca/blue/boolean";
import { number } from "@metreeca/blue/number";
import { string, url } from "@metreeca/blue/string";
import { dictionary } from "@metreeca/blue/dictionary";
import { reference } from "@metreeca/blue/reference";
import { id, multiple, optional, required, resource, type } from "@metreeca/blue/resource";

function Thing() {
	return resource({
		id: id(),
		type: type()
	});
}

function Product() {
	return resource(Thing, {
		name: required(dictionary()),
		description: optional(dictionary()),
		price: required(number({ minInclusive: 0 })),
		inStock: required(boolean()),
		tags: multiple(string()),
		rating: optional(Rating),
		vendor: required(reference(Vendor))
	});
}

function Rating() {
	return resource({
		average: required(number({ minInclusive: 0, maxInclusive: 5 })),
		reviews: required(number({ minInclusive: 1 }))
	});
}

function Vendor() {
	return resource(Thing, {
		name: required(string()),
		website: required(url()),
		address: optional(union(
			string(),
			PostalAddress(),
			VirtualLocation()
		))
	});
}
```

Shape factories like `string()`, `number()`, `boolean()`, `dictionary()`, and `reference()` define the expected value
type and optional constraints for each property. Cardinality factories wrap a shape into a property, controlling how
many values are expected and determining the inferred TypeScript type:

| Factory                                     | Cardinality | TypeScript Type             |
|---------------------------------------------|-------------|-----------------------------|
| `required(s)`                               | 1..1        | `V`                         |
| `optional(s)`                               | 0..1        | `undefined \| V`            |
| `nonempty(s)`                               | 1..*        | `readonly V[]`              |
| `multiple(s)`                               | 0..*        | `undefined \| readonly V[]` |
| `property(s, { minCount: l, maxCount: u })` | l..u        | `readonly V[]`              |

Each factory takes the constraints the property carries beyond its cardinality, such as IRI mappings, labels, or
visibility flags, as a trailing argument: `required(string(), { forward: schema })`.

Cardinalities admitting absence also relax their entry to an optional key, so a value literal spells out only the
entries it actually carries; reading an omitted entry still yields `undefined`.

Resource entries link to other resources in two ways. A `reference()` wrapper links to a **standalone resource**, an
independently identified and managed entity like `Vendor`. A direct shape inclusion defines an **embedded resource**, a
nested object with no independent identity, created and managed together with its parent like `Rating`.

Properties that accept multiple types are modelled as unions of positional variants. Matching splits by regime: a stored
**value** must single out **exactly one** variant (`sh:xone`), tested against all constraints, and is rejected when it
fits several (ambiguous) or none (unsatisfiable); a retrieval **placeholder** is tested by JSON type alone and must fit
**at least one** variant (`sh:or`), may fit several, and is rejected only when it fits none (see
[Validating Templates](#validating-templates)). A multi-valued property matches each of its values independently. At
runtime, values are stored directly with no variant wrapping. Each variant is a literal, reference, or resource shape; a
localised `dictionary()` is a whole-property type and is never a union variant, so `union()` rejects a dictionary shape.
Either of the following representations is accepted at the same `address` position:

```json
{ "address": "12 Harbour Street, Copenhagen" }
```

```json
{
  "address": {
    "streetAddress": "12 Harbour Street",
    "addressLocality": "Copenhagen"
  }
}
```

## Extending Schemas

Use `extends` to inherit entries and constraints from a parent shape. Local entries augment the parent and may override
inherited ones, but only by *narrowing*: overrides may restrict inherited constraints, never relax them. Cardinality
narrows monotonically (`required` may override `optional`, but not the reverse), per-kind constraints intersect, and the
override is rejected at the call site when the child relaxes the parent.

```ts
const NamedThing = resource({
    id: id(),
    name: required(string({ minLength: 1 }))
});

const Vendor = resource(NamedThing, {
    name: required(string({ minLength: 3, maxLength: 80 })), // narrows minLength
    rating: optional(number({ minInclusive: 0, maxInclusive: 5 }))
});
```

### Refining nested targets

A slot holding a nested resource or a `reference(...)` is refined by re-pointing it at a shape that extends the
inherited target. The refining shape declares only what it adds or narrows: it reaches the inherited definition through
its own `extends`, so the parent definition is never restated. A target that doesn't extend the inherited one, the
inherited target's own parent included, is rejected at the call site.

```ts
const Organization = resource({
    id: id(),
    name: required(string())
}, {
    class: "https://schema.org/Organization"
});

const University = resource(Organization, {
    country: required(string())
}, { class: "https://ec2u.eu/University" });

const Unit = resource({
    id: id(),
    unitOf: required(reference(Organization)), // referenced target
    host: required(Organization)               // embedded target
});

const ResearchUnit = resource(Unit, {
    unitOf: required(reference(University)),   // re-pointed at the extending target
    host: required(University)
});
```

Extending the inherited target is what makes the refinement legal for an embedded slot: a nested resource value must
carry every `class` the inherited target declares, so a standalone shape that merely repeats its entries is rejected.

### Narrowing union slots

When the parent declares a `union(...)` slot, an extending shape may narrow it in two forms:

- **Single-variant narrowing** — the child supplies a non-union value shape that narrows exactly one of the parent's
  variants (matched by `kind`, by `datatype` / `pattern` / `integral` for literals, by the variant's target shape or one
  extending it for `reference`, or by a subtype `class` for `resource`). The merged slot becomes a bare value shape;
  consumers see the variant's plain model rather than the indexed-record form.
- **Union subsetting** — the child supplies a smaller `union(...)`; each child variant narrows a distinct parent variant
  (an injective pairing), the paired variants are merged, and unpaired parent variants are dropped. A parent variant
  that no child variant can single out, such as one of two variants whose targets are the same shape or one extending
  the other, cannot be narrowed individually.

```ts
const Entity = resource({
	code: required(union(string(), number()))
});

// Form 1 — narrows the slot to a bare string
const Vendor = resource(Entity, {
	code: required(string({ model: "ABC", pattern: "^[A-Z]" }))
});

// Form 2 — keeps the union but drops the string variant wholesale
const Numbered = resource(Entity, {
	code: required(union(number({ minInclusive: 0 })))
});
```

The merged union's `model` re-indexes contiguously from `0`: dropping a parent variant renumbers every later variant.
Consumers must key off the shape's own `model`, not assume positional alignment with an ancestor.

## Type Inference

Schemas double as TypeScript type definitions. The `State` utility extracts the runtime state value type matching a
shape's template; pair it with `Schema` whenever the template form itself is needed:

```ts
import { type State } from "@metreeca/blue/value";

type ProductType = State<typeof Product>;

// {
//     id: Reference,
//     type: Reference,
//     name: Dictionary,
//     description?: undefined | Dictionary,
//     price: number,
//     inStock: boolean,
//     tags?: undefined | readonly string[],
//     rating?: undefined | { average: number, reviews: number },
//     vendor: Reference
// }
```

Entries admitting absence are optional keys: a value may either set them to `undefined` or leave them out.

No separate interface needed: the schema is the type definition.

## Validating Resources

The overloaded `validate` function checks a value against a schema and returns a
[Relay](https://metreeca.github.io/core/types/relay.Relay.html) that dispatches to either a `value` or `trace` handler:

```ts
import { validate } from "@metreeca/blue";

validate(data, { shape: Product })({
	value: product => {
		// product is typed as State<typeof Product>
	},
	trace: trace => {
		// trace describes validation violations
	}
});
```

All constraints are enforced, including type, cardinality, closed-shape checks, and custom validators. Unknown and
missing entries are both rejected. On success, the value is an immutable copy validated against a verified and flattened
copy of the shape. The function is idempotent on a specific shape: re-validation against the same shape trusts the
previous result without repeating the validation process.

## Validating Projections

When the projection template is not bonded to the shape (typically at API boundaries where `shape` defines the
admissible surface and the projection arrives per request), pass `model` as a separate template argument. The result is
narrowed to `Instance<T>`, where `T` is inferred from `model`:

```ts
import { validate } from "@metreeca/blue";

const model = { id: "", name: "" }; // projection requested by the caller

validate(response, { shape: Product, model })({
	value: product => {
		// product is typed as { readonly id: Reference; readonly name: string }
	},
	trace: trace => {
		// trace describes validation violations
	}
});
```

Only the projected keys are checked: constraints on keys absent from `model` are not enforced, so unrequested required
fields do not trigger `minCount` violations. Reference-shape slots additionally accept an expanded nested resource,
validated against the linked target shape narrowed by the nested projection in `model`.

## Validating Templates

The same `validate` function validates retrieval
[templates](https://metreeca.github.io/qest/types/template.Template.html) when the `model` option is set to `true`:

```ts
import { validate } from "@metreeca/blue";

validate(data, { model: true, shape: Product });
validate(data, { model: true, shape: Product, plain: true });
validate(data, { model: true, shape: Product, depth: 0 });
validate(data, { model: true, shape: Product, limit: 100 });
```

Type and structural constraints are enforced; value constraints are skipped as query values are placeholders. Missing
entries are accepted as not requested; explicit `undefined` entries are equivalent and mark optional template or
projection slots elided at construction time. Where a property specifies a reference shape, the query may be either an
IRI reference placeholder, retrieving only the identifier, or a nested template validated against the target shape. A
reference placeholder is never resolved on decoding, so it accepts any IRI reference (the empty string, a root-relative
or relative reference, or an absolute IRI); reference values in selection operands, by contrast, are resolved against
the base IRI and absolute. A union-typed property is addressed only through the indexed form (`{"0": ..., "1": ...}`),
one placeholder per branch; a plain placeholder over it is rejected. Each branch placeholder is matched by JSON type
alone, its value immaterial: it need not be legal, matches every type-compatible branch (so a literal or reference
placeholder retrieves all same-kind branches, while a nested template discriminates the resource branches its structure
fits), and is rejected only when it matches no branch. Selection operands (comparison bounds and set-matching options)
are values, not placeholders, so they take the exactly-one rule; a `~` text search is a plain string applied to every
string branch at once. Projection cells over a localised property carry a complete localised value whose
per-language-tag shape is pinned to the property's per-tag cardinality (a single string for single-string-per-tag, a
singleton array for array-per-tag); the localised value is assembled once per row rather than fanned out per tag.

A localised property additionally coalesces under language negotiation, at its per-tag cardinality: its template slot
also accepts a coalesced placeholder for the negotiated value (a bare string for single-string-per-tag, a single-element
string array for array-per-tag), and a selection may constrain it with a plain-string operand (comparison, text search,
or option) matched existentially over the coalesced value set under ordinary string semantics. Sorting and focusing
still require a single-valued key, so they accept a coalesced localised key only where it resolves single-valued.

The `plain`, `depth`, and `limit` options bound the accepted query language: `plain` rejects aggregate transforms
(`count`, `sum`, `min`, `max`, `avg`); `depth` caps nested template expansion and property path length; `limit` caps the
`#` pagination constraint and is injected as a default when missing.

> [!CAUTION]
>
> By default, templates support the full query language, including aggregate transforms and nested expansion.
> When exposing endpoints to untrusted clients, restrict query complexity as required by setting `plain`
> to `true`, `depth` to `0` or a positive value, and/or `limit` to a maximum result set size.

## Validating Values

The same `validate` function checks an individual value against a value shape when `shape` is passed alone, without
`model`:

```ts
import { validate } from "@metreeca/blue";
import { integer } from "@metreeca/blue/number";

validate(price, { shape: integer({ minInclusive: 0 }) })({
	value: amount => {
		// amount is typed as number
	},
	trace: trace => {
		// trace describes validation violations
	}
});
```

Only the leaf constraints (datatype, numeric range, string length, pattern, language) are enforced against the single
value; cardinality is not checked, as it belongs to the enclosing set shape. A union shape requires the value to match
**exactly one** variant (`sh:xone`), as a state value does. On success, the value is the input narrowed to `State<S>`.

# SHACL Foundations

[SHACL](https://www.w3.org/TR/shacl/) (Shapes Constraint Language) is a [W3C](https://www.w3.org/) standard for
describing and validating RDF graphs. It defines *shapes* (sets of constraints that nodes in a graph must satisfy)
covering structure, cardinality, value ranges, and logical combinations.

**@metreeca/blue** implements a controlled SHACL subset tailored to the
[JSON-LD](https://www.w3.org/TR/json-ld11/) profile defined by [@metreeca/qest](https://metreeca.github.io/qest/),
enabling TypeScript developers to use shape-based validation without mastering SHACL technicalities.

This controlled subset is specified by:

- [cardinality constraints](https://www.w3.org/TR/shacl/#core-components-count) (`sh:minCount`, `sh:maxCount`)
  for specifying how many values a property must or may have
- [value range constraints](https://www.w3.org/TR/shacl/#core-components-range) (`sh:minExclusive`,
  `sh:maxExclusive`, `sh:minInclusive`, `sh:maxInclusive`) for numeric value ranges
- [string constraints](https://www.w3.org/TR/shacl/#core-components-string) (`sh:minLength`, `sh:maxLength`,
  `sh:pattern`, `sh:languageIn`, `sh:uniqueLang`) for text length, patterns, and language tags
- [value type constraints](https://www.w3.org/TR/shacl/#core-components-value-type) (`sh:class`, `sh:datatype`) for
  declaring the expected type of resource instances and the RDF datatype of literals; `sh:class` is limited to a single
  class
- [value constraints](https://www.w3.org/TR/shacl/#core-components-others) (`sh:in`, `sh:hasValue`) for enumerations and
  required values
- [logical constraints](https://www.w3.org/TR/shacl/#core-components-logical) limited to `sh:xone` typed unions on
  entries, matched exactly-one on write and relaxed to at-least-one (`sh:or`) on read; the `sh:not`, `sh:and`, and
  `sh:or` shape combinators are not supported for authoring
- [closed shapes](https://www.w3.org/TR/shacl/#ClosedConstraintComponent) enforced by default on all resource shapes;
  unknown entries are always rejected

[Property pair constraints](https://www.w3.org/TR/shacl/#core-components-property-pairs) and
[property paths](https://www.w3.org/TR/shacl/#property-paths) are not supported; cross-property logic can be implemented
via custom [validators](https://metreeca.github.io/blue/modules/index.html).

# Support

- Open an [issue](https://github.com/metreeca/blue/issues) to report a problem or to suggest a new feature
- Start a [discussion](https://github.com/metreeca/blue/discussions) to ask a how-to question or to share an idea

# License

This project is licensed under the Apache 2.0 License –
see [LICENSE](https://github.com/metreeca/blue?tab=Apache-2.0-1-ov-file) file for details.
