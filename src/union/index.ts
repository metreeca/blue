/*
 * Copyright © 2025-2026 Metreeca srl
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Union shape types and operations.
 *
 * Defines the shape describing a value drawn from one of several alternatives and its branch types, and provides the
 * {@link union} factory stating them and the accessors reading the branches, so that a member whose vocabulary ranges
 * over unrelated types is described by a single shape. Alternatives are stated positionally, and a value is stored as
 * it stands under the one branch it belongs to.
 *
 * **Defining polymorphic members**
 *
 * State the alternatives positionally; cardinality belongs to the enclosing member rather than to a branch:
 *
 * ```typescript
 * import { optional, resource } from '@metreeca/blue/resource';
 * import { reference } from '@metreeca/blue/reference';
 * import { string } from '@metreeca/blue/string';
 * import { union } from '@metreeca/blue/union';
 *
 * const Contact = resource({
 *   address: optional(union(
 *     string(),
 *     reference(PostalAddress)
 *   ))
 * });
 * ```
 *
 * Either alternative is accepted at the same position, stored as it stands with no wrapping:
 *
 * ```json
 * { "address": "123 Main St" }
 *
 * { "address": "https://data.example.com/addresses/456" }
 * ```
 *
 * **Reading the alternatives off a shape**
 *
 * {@link getShapeBranches} lists the alternatives a shape admits values from, taking a shape that is not a union to
 * the single branch it is, so that a caller routing a value needs not tell a polymorphic shape from a plain one.
 * {@link getStateBranch} settles the one branch a stored value belongs to, {@link getBoundBranch} the one a relational
 * bound filters against, and {@link getModelBranches} every branch a retrieval placeholder may draw from.
 *
 * @module
 *
 * @document ./index.md
 *
 * @see [Unions — Design](./index.md)
 * @see {@link https://www.w3.org/TR/shacl/#XoneConstraintComponent SHACL § 4.6.4 sh:xone}
 * @see {@link https://www.w3.org/TR/shacl/#OrConstraintComponent SHACL § 4.6.2 sh:or}
 */

import type { Lazy } from "@metreeca/core";
import type { Shape } from "../value/index.js";
import { assemble } from "./assembler.js";

export { getShapeBranches, getStateBranch, getBoundBranch, getModelBranches } from "./accessors.js";


/**
 * Describes a value drawn from one of several alternatives.
 *
 * Admits whatever any of its branches admits, so that a property whose vocabulary ranges over unrelated types (a plain
 * string or any of several structured resources, say) is described by a single shape. A branch is a shape in its own
 * right, a union included, possibly deferred to break definition cycles.
 *
 * **Matching**
 *
 * Which branches an operation is carried out against is decided by the input the caller supplies, under the regime
 * that input belongs to:
 *
 * - a **data value**, either one being stored or an option a filter tests membership against, singles out **exactly
 *   one** branch, matched against all its constraints, as it is a legal value of the branch it selects and that branch
 *   fixes how it is stored;
 * - a **relational bound** singles out **exactly one** branch as well, but keys on syntactic traits alone (the value's
 *   `kind` and, where branches share it, their lexical `pattern`), as a bound filters by order and need not be a legal
 *   value of the branch it selects;
 * - a **retrieval placeholder** matches **at least one** branch by JSON type alone, ignoring every other constraint,
 *   and retrieves each branch it fits, as its value is immaterial and discriminates nothing.
 *
 * An input matching no branch is rejected as unsatisfiable, and one required to single out a branch but matching
 * several is rejected as ambiguous. A text search is matched against no branch at all: it filters every textual branch
 * at once.
 *
 * > [!IMPORTANT]
 * > Branches are expected to be **disjoint**: no legal value satisfies two of them at once. Disjointness is a
 * > modelling contract rather than a property proved as the shape is built, so overlapping branches are accepted and
 * > an offending value is rejected only when it is matched. A union filtered by relational bounds is held to a
 * > stricter grade, as a bound is told apart by syntax alone: it admits at most one numeric and one boolean branch,
 * > and textual branches only under mutually exclusive patterns.
 *
 * **Inheritance**
 *
 * Where a {@link resource!ResourceShape} extends the shapes it lists as `parents`, union-valued members are merged
 * according to the following rules. The *child* is the extending shape; the *parent* is the inherited one.
 *
 * | Field      | Override Rule                                                                           |
 * | ---------- | --------------------------------------------------------------------------------------- |
 * | `kind`     | Cannot be overridden                                                                    |
 * | `branches` | Each child branch narrows exactly one parent branch; unpaired parent branches are dropped |
 *
 * A child narrowing a branch that no parent branch matches, one that several match, or one already taken by another
 * child branch is reported as an error. A child declaring a single non-union shape narrows the one parent branch it
 * matches and collapses the member to that shape, leaving the value no longer polymorphic.
 *
 * @typeParam B The alternatives a value may be drawn from
 *
 * @see {@link https://www.w3.org/TR/shacl/#XoneConstraintComponent SHACL § 4.6.4 sh:xone}
 * @see {@link https://www.w3.org/TR/shacl/#OrConstraintComponent SHACL § 4.6.2 sh:or}
 */
export type UnionShape<B extends UnionBranches = UnionBranches> = {

	/**
	 * Discriminator identifying this as a union shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "union"

	/**
	 * The alternatives a value may be drawn from.
	 *
	 * Stated flat: a branch that is itself a union is replaced, as the shape is built, by the alternatives it holds, so
	 * that a caller routing a value walks one list however the union was assembled. A branch left deferred is flattened
	 * where it is resolved rather than where it is stated.
	 *
	 * **Inheritance** — each child branch narrows exactly one parent branch; unpaired parent branches are dropped.
	 */
	readonly branches: B

}

/**
 * The alternatives a union admits.
 *
 * Retains the order the alternatives were declared in, so that a value matching or failing to match them is reported
 * against a stable sequence; order carries no priority, as every alternative is matched.
 */
export type UnionBranches =
	readonly Lazy<Shape>[]


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Assembles a union shape.
 *
 * Alternatives are accepted as they are stated: a union that exists proves nothing about the distinguishability of its
 * branches, which is a {@link UnionShape | modelling contract} settled when a value is matched. An alternative that is
 * itself a union contributes the alternatives it holds rather than nesting, so that a union of unions reads as the
 * single flat list of alternatives it admits values from.
 *
 * @typeParam B The alternatives a value may be drawn from
 *
 * @param branches The shapes a value may be drawn from, each possibly deferred to break definition cycles
 *
 * @returns An immutable shape admitting the values any of the branches admits
 *
 * @example
 *
 * ```typescript
 * const location = optional(union(
 *     string(),
 *     reference(PostalAddress)
 * ));
 * ```
 */
export function union<B extends readonly [Lazy<Shape>, ...Lazy<Shape>[]]>(...branches: B): UnionShape<B> {

	return assemble<B>(branches);

}
