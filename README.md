# @metreeca/blue

[![npm](https://img.shields.io/npm/v/@metreeca/blue)](https://www.npmjs.com/package/@metreeca/blue)

Declarative blueprints for model-driven linked data processing.

**@metreeca/blue** provides a shape-based schema framework for the linked data model defined
by [@metreeca/qest](https://metreeca.github.io/qest/).

Shape-based schemas go beyond structural validation, capturing the complete semantics of a resource — structure,
constraints, metadata, and relationships — enabling them to act as a single source of truth for automated validation,
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
> | Module                                                                           | Description                                                             |
> |----------------------------------------------------------------------------------|-------------------------------------------------------------------------|
> | [@metreeca/blue](https://metreeca.github.io/blue/modules/index.html)             | Linked data validation API                                              |
> | [@metreeca/blue/boolean](https://metreeca.github.io/blue/modules/boolean.html)   | Boolean shape model and factories                                       |
> | [@metreeca/blue/number](https://metreeca.github.io/blue/modules/number.html)     | Numeric shape model and factories                                       |
> | [@metreeca/blue/string](https://metreeca.github.io/blue/modules/string.html)     | Textual shape model and factories                                       |
> | [@metreeca/blue/local](https://metreeca.github.io/blue/modules/local.html)       | Language-tagged shape model and factories                               |
> | [@metreeca/blue/resource](https://metreeca.github.io/blue/modules/resource.html) | Resource shape model and factories                                      |

## Defining Schemas

Schemas describe the expected structure of a resource using shape factories:

```ts
import { boolean } from "@metreeca/blue/boolean";
import { local } from "@metreeca/blue/local";
import { number } from "@metreeca/blue/number";
import { id, multiple, optional, reference, required, resource, type, union } from "@metreeca/blue/resource";
import { string, url } from "@metreeca/blue/string";

function Thing() {
	return resource({
		id: id(),
		type: type()
	});
}

function Product() {
	return resource({ extends: Thing }, {
		name: required(local()),
		description: optional(local()),
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
	return resource({ extends: Thing }, {
		name: required(string()),
		website: required(url()),
		address: optional(union({
			text: string(),
			PostalAddress: reference(PostalAddress),
			VirtualLocation: reference(VirtualLocation)
		}))
	});
}
```

Shape factories like `string()`, `number()`, `boolean()`, `local()`, and `reference()` define the expected value type
and optional constraints for each property. Cardinality helpers wrap shape factories to control how many values are
expected and to determine the inferred TypeScript type:

| Factory         | Cardinality | TypeScript Type             |
|-----------------|-------------|-----------------------------|
| `required(s)`   | 1..1        | `V`                         |
| `optional(s)`   | 0..1        | `undefined \| V`            |
| `repeatable(s)` | 1..*        | `readonly [V, ...V[]]`      |
| `multiple(s)`   | 0..*        | `undefined \| readonly V[]` |

Resource properties link to other resources in two ways. A `reference()` wrapper links to a **standalone resource** — an
independently identified and managed entity like `Vendor`. A direct shape inclusion defines an **embedded resource** — a
nested object with no independent identity, created and managed together with its parent like `Rating`.

Properties that accept multiple types are modelled as unions — discriminated variants wrapped in
[index maps](https://www.w3.org/TR/json-ld11/#data-indexing), where each key identifies a type alternative. At runtime,
union values are keyed by variant name:

```json
{
  "address": {
    "PostalAddress": {
      "id": "https://data.example.com/addresses/456",
      "streetAddress": "12 Harbour Street",
      "addressLocality": "Copenhagen"
    }
  }
}
```

## Type Inference

Schemas double as TypeScript type definitions. The `Infer` utility extracts the model type:

```ts
import { type Infer } from "@metreeca/blue";

type ProductType = Infer<typeof Product>;

// {
//     id: IRI,
//     type: undefined | IRI,
//     name: Local,
//     description: undefined | Local,
//     price: number,
//     inStock: boolean,
//     tags: undefined | readonly string[],
//     rating: undefined | { average: number, reviews: number },
//     vendor: Reference
// }
```

No separate interface needed — the schema is the type definition.

## Validating Resources

The `validate` function checks a value against a schema and returns a `Relay` that dispatches to either a `value` or
`trace` handler:

```ts
const result = validate(data, Product);

result({
	value: product => {
		// product is typed as Infer<typeof Product>
	},
	trace: errors => {
		// errors describes validation violations
	}
});
```

The same schema validates different kinds of CRUD payloads, each corresponding to a data type defined
by [@metreeca/qest](https://metreeca.github.io/qest/):

- **`"value"`** — Create/Replace ([`Resource`](https://metreeca.github.io/qest/types/state.Resource.html), default); all
  constraints enforced, missing and unknown properties rejected
- **`"patch"`** — Partial Update ([`Patch`](https://metreeca.github.io/qest/types/state.Patch.html)); `null` values
  accepted as deletion markers, missing properties accepted as not modified, custom validators skipped
- **`"model"`** — Retrieve ([`Model`](https://metreeca.github.io/qest/types/model.Model.html)); entry point for
  retrieval projections, only type compatibility checked, missing properties accepted as not requested
- **`"query"`** — Search ([`Query`](https://metreeca.github.io/qest/types/model.Query.html)); entry point for search
  queries, extends model validation with operator-prefixed filtering and ordering keys

Models and queries are mutually recursive — a model may contain nested queries and vice versa: `"model"` and `"query"`
modes provide distinct entry points into a shared recursive validation process, suited to different contexts.

```ts
validate(patch, Product, { mode: "patch" }); // partial update
validate(model, Product, { mode: "model" }); // retrieval model
validate(query, Product, { mode: "query" }); // search query
```

> [!WARNING]
>
> In `"patch"` mode, nested resources are validated as complete states — patch semantics (missing properties accepted,
> custom validators skipped) apply only at the top level.

> [!IMPORTANT]
>
> In `"model"` and `"query"` modes, nested resource and reference expansion is controlled by the `depth` option, which
> defaults to `0` — rejecting any nested model or query while still accepting IRI references. Set `depth` to a positive
> integer to allow that many levels of nesting, or to `null` for unlimited depth.
>
> ```ts
> validate(model, Product, { mode: "model" });                // depth 0 (default) — flat projections only
> validate(model, Product, { mode: "model", depth: 2 });      // up to 2 levels of nesting
> validate(model, Product, { mode: "model", depth: null });   // unlimited nesting
> ```

# SHACL Foundations

[SHACL](https://www.w3.org/TR/shacl/) (Shapes Constraint Language) is a [W3C](https://www.w3.org/) standard for
describing and validating RDF graphs. It defines *shapes* — sets of constraints that nodes in a graph must satisfy —
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
  `sh:pattern`, `sh:languageIn`) for text length, patterns, and language tags
- [value type constraints](https://www.w3.org/TR/shacl/#core-components-value-type) (`sh:class`) for declaring the
  expected type of resource instances; limited to a single class
- [value constraints](https://www.w3.org/TR/shacl/#InConstraintComponent) (`sh:in`, `sh:hasValue`) for enumerations and
  required values
- [logical constraints](https://www.w3.org/TR/shacl/#core-components-logical) limited to `sh:or` as typed unions on
  properties; `sh:not`, `sh:and`, and `sh:xone` are not supported
- [closed shapes](https://www.w3.org/TR/shacl/#ClosedConstraintComponent) enforced by default on all resource shapes;
  unknown properties are always rejected

[Property pair constraints](https://www.w3.org/TR/shacl/#core-components-property-pairs) and
[property paths](https://www.w3.org/TR/shacl/#property-paths) are not supported; cross-property logic can be implemented
via custom [validators](https://metreeca.github.io/blue/modules/index.html).

# Support

- Open an [issue](https://github.com/metreeca/blue/issues) to report a problem or to suggest a new feature
- Start a [discussion](https://github.com/metreeca/blue/discussions) to ask a how-to question or to share an idea

# License

This project is licensed under the Apache 2.0 License –
see [LICENSE](https://github.com/metreeca/blue?tab=Apache-2.0-1-ov-file) file for details.
