---
title: Retrieval Inference — Bridge
summary: Where a retrieval result widens to the shape, and what closes the gap
description: Design note for the provisional retrieval result typing the value module carries until the overhaul lands.
---

# Context

`Delivery<S, M>` types what a retrieval hands back by walking the shape and the template together: the value comes
from the shape, which no longer stores a model ([#22](https://github.com/metreeca/blue/issues/22)), and the key set
from the template, which no longer carries types. It resolves the forms a template states as plain members, and is
provisional, tracked in [#33](https://github.com/metreeca/blue/issues/33).

# What Resolves What

Three units answer three different questions about the same shape:

| Type                      | Module                           | Answers                                       |
|---------------------------|----------------------------------|-----------------------------------------------|
| `Plain<S>`, `Legal<C, D>` | [`inference.ts`](inference.ts)   | the value a leaf shape admits                 |
| `Instance<S>`             | [`index.ts`](index.ts)           | the whole value a shape describes             |
| `Delivery<S, M>`          | [`_inference.ts`](_inference.ts) | that value, keyed down to a template's request |

`Instance<S>` is published surface and answers the shape alone, composing `Plain` for a leaf and recursing through a
resource's members and a union's branches. `Delivery<S, M>` answers the shape and a request together, and is the
narrower of the two: where a template narrows nothing, a member comes back as `Instance` would state it.

Neither is built on the other. Both reach the members of a resource through the same
[resource inference](../resource/inference.ts), which is why the widenings below are stated in terms of what the shape
describes. The underscore marks the split as provisional: `Delivery` sits apart only until the overhaul folds it, with
`Model<S>`, into `inference.ts` beside `Plain` and `Legal`, leaving `Instance` where it is.

# Where the Result Widens

Three forms carry more in the template than the bridge reads, and come back as the shape describes them. A call site
needing the narrow type states it itself.

- **Polymorphic member**: `{ code: { "0": {} } }` yields the whole union, `string | number`, the alternatives not
  being resolved one by one.
- **Projection column**: `{ vendors: { "n=name": {} } }` yields the unexpanded link, `readonly Reference[]`, a
  binding not being read as an expression.
- **Localised member**: `{ label: { "*": {} } }` yields the full tag map, the ranges not being narrowed.

One limit seen from three sides: a member resolves against the shape as a whole, never against one branch, one
expression or one tag range within it.

# The Route Out

`Instance<S>` states what a shape yields, `Model<S>` what it admits being asked for, and `Delivery<S, M>` resolves the
pair. A projection column is then typed by application rather than by parsing, a transform being a function and an
alias an object key, so a column takes its type from the transform's signature.

The route is assessed in full in `packages/components/keep/src/_/_inference.md` on
[@metreeca/keep](https://github.com/metreeca/keep), with the two limits that survive whatever lands: a path cannot
reach through a union, and `Model<S>` closes either the call site or the recursion through member ranges, not both.

One decision is Blue's to take: which of the [resource inference](../resource/inference.ts) types become public
surface, the downstream sketch re-declaring `Carried`, `Settled`, `Merged`, `Outline`, `Arity`, `Skippable` and
`Loose` locally.
