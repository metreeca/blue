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
> | Module                       | Description                           |
> |------------------------------|---------------------------------------|
> | [@metreeca/blue]             | Linked data validation                |
> | [@metreeca/blue/value]       | Value shape types and operations      |
> | [@metreeca/blue/boolean]     | Boolean shape types and operations    |
> | [@metreeca/blue/number]      | Number shape types and operations     |
> | [@metreeca/blue/string]      | String shape types and operations     |
> | [@metreeca/blue/dictionary]  | Dictionary shape types and operations |
> | [@metreeca/blue/reference]   | Reference shape types and operations  |
> | [@metreeca/blue/resource]    | Resource shape types and operations   |
> | [@metreeca/blue/union]       | Union shape types and operations      |

[@metreeca/blue]: https://metreeca.github.io/blue/modules/index.html

[@metreeca/blue/value]: https://metreeca.github.io/blue/modules/value.html

[@metreeca/blue/boolean]: https://metreeca.github.io/blue/modules/boolean.html

[@metreeca/blue/number]: https://metreeca.github.io/blue/modules/number.html

[@metreeca/blue/string]: https://metreeca.github.io/blue/modules/string.html

[@metreeca/blue/dictionary]: https://metreeca.github.io/blue/modules/dictionary.html

[@metreeca/blue/reference]: https://metreeca.github.io/blue/modules/reference.html

[@metreeca/blue/resource]: https://metreeca.github.io/blue/modules/resource.html

[@metreeca/blue/union]: https://metreeca.github.io/blue/modules/union.html


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
| `nonempty(s)`                               | 1..*        | `readonly [V, ...V[]]`      |
| `multiple(s)`                               | 0..*        | `undefined \| readonly V[]` |
| `property(s, { minCount: l, maxCount: u })` | l..u        | as `l` and `u` imply        |

An upper bound of 1 yields the bare value and any other an array, non-empty where at least one value is required.
`property()` follows the same rules, so bounds beyond the four named cardinalities are typed exactly as their
counterparts are.

Each factory takes the constraints the property carries beyond its cardinality, such as IRI mappings, labels, or
ownership flags, as a trailing argument: `required(string(), { forward: schema })`.

Cardinalities admitting absence also relax their key to an optional one, so a value literal spells out only the
members it actually carries; reading an omitted member still yields `undefined`.

Resource members link to other resources in two ways. A `reference()` wrapper links to a **standalone resource**, an
independently identified and managed entity like `Vendor`. A direct shape inclusion defines an **embedded resource**, a
nested object with no independent identity, created and managed together with its parent like `Rating`.

Properties accepting values of more than one type are modelled as unions of positional branches. Matching splits by
regime: a stored **value** must single out **exactly one** branch (`sh:xone`), tested against all constraints, and is
rejected when it fits several (ambiguous) or none (unsatisfiable); a relational **bound** must likewise single out
exactly one, but keys on syntactic traits alone, as it need not be a legal value; a retrieval **placeholder** is tested
by JSON type alone and must fit **at least one** branch (`sh:or`), may fit several, and is rejected only when it fits
none (see [Validating Templates](#validating-templates)). A multi-valued property matches each of its values
independently, and values are stored as they stand with no branch wrapping.

Branches are expected to be **disjoint**: overlapping ones are accepted as the shape is built, and an ambiguous value is
rejected only when it is matched. Either of the following representations is accepted at the same `address` position:

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

Declare parent shapes ahead of the member definitions to inherit their members and constraints. Local members augment
the parent and may override inherited ones, but only by *narrowing*: an override restricts what it inherits and never
relaxes it. Cardinality narrows monotonically (`required` may override `optional`, but not the reverse), per-kind
constraints intersect, and the override is rejected at the call site when the child relaxes the parent.

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

### Refining Nested Targets

A member holding a nested resource or a `reference(...)` is refined by re-pointing it at a shape that extends the
inherited target. The refining shape declares only what it adds or narrows: it reaches the inherited definition through
its own parents, so the parent definition is never restated. A target that doesn't extend the inherited one, the
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

Extending the inherited target is what makes the refinement legal for an embedded member: a nested resource value must
carry every `class` the inherited target declares, so a standalone shape that merely repeats its members is rejected.

### Narrowing Union Members

When the parent declares a `union(...)` member, an extending shape may narrow it in two forms:

- **Single-branch narrowing**: the child supplies a non-union shape that narrows exactly one of the parent's branches.
  The merged member becomes a bare value shape, no longer polymorphic.
- **Branch subsetting**: the child supplies a smaller `union(...)`; each child branch narrows a distinct parent branch
  (an injective pairing), the paired branches are merged, and unpaired parent branches are dropped.

A child branch narrowing no parent branch, several, or one already claimed by another child branch is rejected at the
call site.

```ts
const Entity = resource({
	code: required(union(string(), number()))
});

// Form 1 — narrows the member to a bare string
const Vendor = resource(Entity, {
	code: required(string({ pattern: /^[A-Z]/ }))
});

// Form 2 — keeps the union but drops the string branch wholesale
const Numbered = resource(Entity, {
	code: required(union(number({ minInclusive: 0 })))
});
```

The merged union indexes its branches contiguously from `0`, so dropping a parent branch renumbers every later one. A
retrieval template addressing branches by index must key off the shape it actually queries rather than assume positional
alignment with an ancestor.

## Type Inference

Schemas double as TypeScript type definitions. `Instance` yields the value a resource carries as it is held and
retrieved:

```ts
import { type Instance } from "@metreeca/blue/value";

type ProductType = Instance<typeof Product>;

// {
//     readonly id: Reference,
//     readonly type?: undefined | Reference,
//     readonly name: { readonly [tag: Tag]: readonly string[] },
//     readonly description?: undefined | { readonly [tag: Tag]: readonly string[] },
//     readonly price: number,
//     readonly inStock: boolean,
//     readonly tags?: undefined | readonly string[],
//     readonly rating?: undefined | { readonly average: number, readonly reviews: number },
//     readonly vendor: Reference
// }
```

`Compound` yields the value a writer may submit instead: the identifier is optional, as a resource yet to be created has
none to state, captive targets may be inlined alongside their identifiers, and `foreign` members are left out, as the
resources they point at carry the link.

Members admitting absence are optional keys: a value may either set them to `undefined` or leave them out.

No separate interface needed: the schema is the type definition.

## Validating Resources

The overloaded `validate` function checks a value against a schema and returns a
[Relay](https://metreeca.github.io/core/types/relay.Relay.html) that dispatches to either a `value` or `trace` handler:

```ts
import { validate } from "@metreeca/blue";

validate(data, { shape: Product })({
	value: product => {
		// product is typed as Instance<typeof Product>
	},
	trace: trace => {
		// trace describes validation violations
	}
});
```

All constraints are enforced, including type, cardinality, closed-shape checks, and custom validators. Unknown and
missing members are both rejected. On success, the value comes back typed as the shape describes it. Validation is
idempotent on a given shape: re-validating the same value on the same terms reads the earlier verdict off the value
rather than walking it again, so a caller may validate defensively wherever it is unsure.

Two further options bound what a resource may carry: `entry` names the identifier the resource is expected to be named
by, and `depth` caps the nesting a captive member may be expanded to, with `0` refusing every expansion while still
admitting the identifier naming the resource.

## Validating Projections

When the projection template is not bonded to the shape (typically at API boundaries where `shape` defines the
admissible surface and the projection arrives per request), pass `model` as a separate template argument. The result is
narrowed to the members the template asked for:

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

Only the requested members are checked: constraints on members absent from `model` are not enforced, so an unrequested
required member triggers no `minCount` violation. A member the template didn't ask for is rejected all the same, as the
caller has nowhere to put it. A reference member additionally accepts an expanded nested resource, validated against the
target shape narrowed by the nested projection in `model`.

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

A template describes what to retrieve rather than what is held, so type and structural constraints are enforced while
value constraints are left alone: a placeholder stands for a value and need not be a legal one. A missing member is
accepted as not requested, and an explicit `undefined` member reads the same way, marking one elided at construction
time.

What each kind of member may be asked for:

- **Reference**: either an IRI placeholder, retrieving the identifier alone, or a nested template validated against the
  target shape. A placeholder is never resolved on decoding, so any IRI reference is accepted, the empty string and
  relative forms included; reference values in selection operands, by contrast, are resolved against the base IRI and
  are absolute.
- **Union**: the indexed form (`{"0": …, "1": …}`) alone, one placeholder per branch; a plain placeholder over a
  union is rejected. Each branch placeholder is matched by JSON type alone and retrieves every branch it fits, so a
  literal or reference placeholder requests all same-kind branches while a nested template discriminates the
  resource branches its structure fits. Only a placeholder fitting no branch at all is rejected.
- **Localised**: a map of the tags wanted, or the single value language negotiation settles on. A coalesced placeholder
  carries the negotiated content at the member's per-tag arity: a bare string where a tag carries one, a single-element
  array where it carries several.

Selection operands follow their own rules: comparison bounds and set-matching options are values rather than
placeholders, so each must single out exactly one branch, while a `~` text search is a plain string applied to every
string branch at once. A plain-string operand over a localised member filters the negotiated content under ordinary
textual semantics; sorting and focusing still require a single-valued key, so they accept a coalesced localised key only
where it resolves single-valued.

Three options bound the query language a template may draw on:

- **`plain`**: rejects the aggregate transforms combining several values into one (`count`, `sum`, `min`, `max`, `avg`)
- **`depth`**: caps nested template expansion and property path length
- **`limit`**: caps the `#` pagination constraint, and is injected as a default where a collection states none

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
**exactly one** branch (`sh:xone`), as a stored value does. On success, the value is the input narrowed to
`Instance<S>`.

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
  members, matched exactly-one on write and relaxed to at-least-one (`sh:or`) on read; the `sh:not`, `sh:and`, and
  `sh:or` shape combinators are not supported for authoring
- [closed shapes](https://www.w3.org/TR/shacl/#ClosedConstraintComponent) enforced by default on all resource shapes;
  unknown properties are always rejected

[Property pair constraints](https://www.w3.org/TR/shacl/#core-components-property-pairs) and
[property paths](https://www.w3.org/TR/shacl/#property-paths) are not supported; cross-property logic can be implemented
via custom [validators](https://metreeca.github.io/blue/modules/resource.html).

# Support

- Open an [issue](https://github.com/metreeca/blue/issues) to report a problem or to suggest a new feature
- Start a [discussion](https://github.com/metreeca/blue/discussions) to ask a how-to question or to share an idea

# License

This project is licensed under the Apache 2.0 License –
see [LICENSE](https://github.com/metreeca/blue?tab=Apache-2.0-1-ov-file) file for details.
