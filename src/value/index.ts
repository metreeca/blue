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
 * Value shape types and operations.
 *
 * Defines the {@link Shape} any value is validated against, derives TypeScript types from shapes, and provides the
 * accessors for navigating them. Callers holding a shape don't need to know which kind of shape it is, and since value
 * types are derived from the shapes describing them, the two can't drift apart.
 *
 * **Shape kinds**
 *
 * Each kind of shape is defined in its own module:
 *
 * - {@link boolean!BooleanShape | BooleanShape} — truth values
 * - {@link number!NumberShape | NumberShape} — numeric values
 * - {@link string!StringShape | StringShape} — textual values
 * - {@link dictionary!DictionaryShape | DictionaryShape} — language-tagged maps
 * - {@link reference!ReferenceShape | ReferenceShape} — links to standalone resources
 * - {@link resource!ResourceShape | ResourceShape} — linked data resources
 * - {@link union!UnionShape | UnionShape} — a value drawn from one of several alternatives
 *
 * <img src="../index.svg" alt="Shape hierarchy" style="width: 100%" />
 *
 * {@link sh} is the namespace of the SHACL terms shapes are modelled on.
 *
 * **Cardinality**
 *
 * A {@link Range} pairs a shape with the number of values allowed, and describes both the values of a declared member
 * and the values a path resolves to. A range isn't a shape: the shape describes each value, the range how many there
 * may be.
 *
 * **Value types**
 *
 * {@link State} is the type of a value described by a shape, and {@link Draft} the type of a resource or collection
 * item to be persisted, with its identifier optional:
 *
 * ```typescript
 * type Item = State<typeof Product>;                           // { readonly id: Reference, readonly name: string, … }
 * type Seed = Draft<typeof Product>;                           // { readonly name: string, …, readonly id?: Reference }
 * ```
 *
 * {@link blueprint} resolves the shape a draft posted to a collection property must satisfy, so that a new item can be
 * validated before it is stored.
 *
 * **Retrieval types**
 *
 * {@link Model} and {@link Slice} are the models allowed for retrieving a resource or a collection it holds, so that a
 * model naming members the shape doesn't declare fails to compile. {@link Match} and {@link Items} are the types of a
 * retrieved resource and of the items of a retrieved collection, restricted to the members the model asks for, so
 * callers get back exactly what they asked for:
 *
 * ```typescript
 * type Read = Match<typeof Product, { name: {} }>;             // { readonly name: string }
 * type Rows = Items<typeof Catalog, { items: { name: {} } }>;  // readonly { readonly name: string }[]
 * ```
 *
 * {@link items} gets the items of the collection from a resource retrieved with a slice, typed as {@link Items}.
 *
 * **Navigation**
 *
 * {@link eager} resolves a shape or range deferred to break definition cycles, returning resource shapes with their
 * inherited members merged in; repeated calls return the same value.
 *
 * {@link collection} resolves the collection property a slice names, whether the shape declares or inherits it.
 *
 * {@link effective} resolves the {@link Range} reached by a path and transform pipe, so that callers can type a
 * projection column or a constraint operand without walking the shape themselves. Links are followed only when the
 * path continues past them, and each branch of a union is explored in turn. Paths naming a member no branch declares,
 * and pipes that can't apply to the values reached, are reported as issues.
 *
 * @module
 *
 * @see {@link https://www.w3.org/TR/shacl/ SHACL - Shapes Constraint Language}
 */

import type { Eager, Lazy, Optional } from "@metreeca/core";
import { createNamespace, type Namespace } from "@metreeca/core/resource";
import type { Binding, Criteria, Template } from "@metreeca/qest/model";
import type { Resource, Value } from "@metreeca/qest/state";
import type { BooleanShape } from "../boolean/index.js";
import type { DictionaryShape } from "../dictionary/index.js";
import type { NumberShape } from "../number/index.js";
import type { ReferenceShape } from "../reference/index.js";
import type { ResourceShape } from "../resource/index.js";
import type { Repeated, Retrieved } from "../resource/inference.js";
import type { StringShape } from "../string/index.js";
import type { UnionShape } from "../union/index.js";
import type { Branch } from "../union/inference.js";
import type { Blueprint, Collecting, Detailed, Drafted, Entries, Plain, Row, Sole, Wanted } from "./inference.js";

export { blueprint, collection, eager, effective, items } from "./accessors.js";


/**
 * SHACL vocabulary namespace.
 *
 * An open {@link Namespace} over `http://www.w3.org/ns/shacl#`, resolving any SHACL term as a named property.
 *
 * @see {@link https://www.w3.org/TR/shacl/ SHACL - Shapes Constraint Language}
 */
export const sh: Namespace = createNamespace("http://www.w3.org/ns/shacl#");


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Value shape.
 *
 * Describes a plain value, localised text, a reference to a resource, a resource itself, or a value matching one of
 * several alternatives. Resource shapes declare the members of their instances and may extend other resource shapes.
 * The type of the described value is derived from the shape as {@link State}, so the two can't drift apart.
 */
export type Shape =
	| BooleanShape
	| NumberShape
	| StringShape
	| DictionaryShape
	| ReferenceShape
	| ResourceShape
	| UnionShape


/**
 * Cardinality-constrained value set.
 *
 * Describes both the values of a {@link resource!Property | property} and the values a path resolves to, stating the
 * shape of each value and how many values are allowed.
 *
 * @typeParam R The shape of the values, possibly deferred to break definition cycles
 * @typeParam L The minimum number of values
 * @typeParam U The maximum number of values
 */
export type Range<
	R extends Lazy<Shape> = Lazy<Shape>,
	L extends Optional<number> = Optional<number>,
	U extends Optional<number> = Optional<number>
> = {

	/**
	 * Minimum number of values.
	 *
	 * `undefined` sets no lower bound.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MinCountConstraintComponent SHACL § 4.2.1 sh:minCount}
	 */
	readonly minCount: L

	/**
	 * Maximum number of values.
	 *
	 * `undefined` sets no upper bound.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MaxCountConstraintComponent SHACL § 4.2.2 sh:maxCount}
	 */
	readonly maxCount: U


	/**
	 * Shape of every value in the set.
	 *
	 * May be deferred to break definition cycles: resolve it with {@link Eager} before reading it as a {@link Shape}.
	 */
	readonly shape: R

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the value type of a shape.
 *
 * Scalar, localised and reference shapes resolve to their plain value. Resource shapes resolve to a record of their
 * declared members merged over the inherited ones. Union shapes resolve to the value of any branch. A reference shape
 * resolves to a {@link @metreeca/qest!Reference | Reference} to its target, never to the target resource itself. A
 * bare {@link Shape}, standing for any kind of value, resolves to `never`; the bare
 * {@link resource!ResourceShape | ResourceShape}, standing for any resource, resolves to
 * {@link @metreeca/qest!Resource | Resource}, so the state of any resource shape is accepted where only a generic
 * resource shape is known.
 *
 * In a resource, the identifier is the IRI of the resource and the type is the IRI of its class, undefined for untyped
 * resources. A property holds a single value if it admits at most one, a read-only array otherwise, and a non-empty
 * array if at least one value is required. Localised text is always a single language-tag-keyed map, never wrapped in
 * an array, so a range admitting both localised text and other values holds either the map or the other values, never
 * both.
 *
 * Optional members may be omitted. A member voided by an incompatible override in an extension accepts no value, so the
 * conflict shows up as a member nothing can satisfy instead of the member silently disappearing.
 *
 * @typeParam S The shape, possibly deferred to break definition cycles
 *
 * @opaque
 */
export type State<S extends Lazy<Shape>> =
	Shape extends Eager<S> ? never
		: ResourceShape extends Eager<S> ? Resource
			: S extends Lazy<{ readonly kind: "resource" }> ? Retrieved<S>
				: S extends Lazy<{ readonly kind: "union" }> ? State<Branch<S>>
					: Plain<S>

/**
 * Resolves the state of a resource to be persisted.
 *
 * Resolves to the {@link State | state} of a resource of the shape, with an optional identifier. The identifier is
 * optional because the target of the operation already identifies the resource, or leaves the store to assign it on
 * creation; if stated, it must agree with the target.
 *
 * Given a {@link Slice | slice} as well, resolves instead to the state of a new item for the collection it names,
 * whether the collection property is declared or inherited. {@link blueprint} returns the shape such an item must
 * satisfy, so it can be validated before it is stored. Resolves to `never` for properties holding values other than
 * resources, which can't be drafted.
 *
 * The bare {@link resource!ResourceShape | ResourceShape} or a generic {@link @metreeca/qest!Template | Template}
 * resolves to any {@link @metreeca/qest!Resource | Resource}, so any draft is accepted where only a generic shape or
 * model is known.
 *
 * @typeParam S The resource shape, or the shape of the resource holding the collection, possibly deferred to break
 * definition cycles
 * @typeParam T The slice naming the collection property; omit it to draft the resource itself
 *
 * @opaque
 */
export type Draft<S extends Lazy<ResourceShape>, T = never> =
	[Blueprint<S, T>] extends [never] ? never : Drafted<Blueprint<S, T>>;


/**
 * Resolves the models for retrieving a resource.
 *
 * Resolves to the {@link @metreeca/qest!Template | templates} a retrieval against the shape may use, so that a template
 * naming members the shape doesn't declare, or requesting a member in a form its range doesn't support, fails to
 * compile instead of failing in the store. Any member of the shape, declared or inherited, may be requested as:
 *
 * - **atomic** — `{}`, for any member
 * - **template** — a nested template, checked against the shape of the linked or embedded resource
 * - **locale** — a language-range map, for ranges admitting localised text
 * - **union** — a branch map, for ranges mixing kinds of value, each branch in any form above except a locale
 * - **query** — any form above, or a projection, merged with collection criteria, for multi-valued members
 *
 * Only forms are checked: filter, ordering and projection expressions are not validated against the shape. Since keys
 * are compared structurally, a template mixing unknown members with known ones is accepted, unless the template is
 * passed as `T`: a bound stated as `T extends Model<S, T>` rejects it. Every model is a
 * {@link @metreeca/qest!Template | Template}, so stores can read it as one regardless of its shape.
 *
 * @typeParam S The resource shape, possibly deferred to break definition cycles
 * @typeParam T The supplied template, typically inferred from the argument, with members the shape doesn't declare
 * rejected; omit it to accept any template naming only members of the shape
 *
 * @opaque
 */
export type Model<S extends Lazy<ResourceShape>, T = never> = Template & Entries<S, T>

/**
 * Resolves the type of the resource retrieved by a model.
 *
 * For a template, resolves to the {@link State | state} of the shape restricted to the members the template names,
 * including those of nested templates. A collection requested with a projection holds the rows the projection
 * computes. For a projection, resolves to the computed row, keyed by the name before each binding's `=`, with columns
 * typed as any value a resource may hold. Depth, cardinality and optionality come from the shape: the model only
 * selects which values to return. Filtering, ordering and pagination criteria don't affect the result type.
 *
 * Members the template omits are omitted from the match. Polymorphic members, localised members and projection
 * columns keep the broad type the shape describes: callers needing the branch selected by a branch map, the tags
 * selected by a language range, or the specific type an expression computes, must narrow it themselves. Under the bare
 * {@link resource!ResourceShape | ResourceShape}, every member the template names resolves to any
 * {@link @metreeca/qest!Values | values}; a generic {@link @metreeca/qest!Template | Template}, naming no member,
 * resolves to an empty record.
 *
 * @typeParam S The shape the retrieval runs against, possibly deferred to break definition cycles
 * @typeParam T The template or projection model of the retrieval, possibly with criteria
 *
 * @opaque
 */
export type Match<S extends Lazy<ResourceShape>, T extends object> =
	Exclude<keyof T, keyof Criteria> extends Binding ? Row<T>
		: Detailed<S, Wanted<T>>


/**
 * Resolves the models for retrieving a resource restricted to a single collection.
 *
 * A slice is a specialised {@link Model | model} of the holding shape that targets a single collection, a property
 * holding any number of resources. It names that property and nothing else, and states under it a
 * {@link Model | template} or a {@link @metreeca/qest!Projection | projection} over the item shape, merged with
 * filtering, ordering and pagination criteria for the collection. This way a collection retrieval is checked against
 * the holding shape alone, just like a resource retrieval.
 *
 * {@link items} reads the retrieved items from the {@link Match | match}. {@link collection} resolves the property a
 * slice names, and {@link blueprint} the shape new items of that collection must satisfy.
 *
 * Slices fail to compile if they name no property or more than one, or a property the shape doesn't declare. They also
 * fail if the property isn't a collection, because it is single-valued or holds values other than resources, or if
 * they request a member the item shape doesn't declare.
 *
 * The bare {@link resource!ResourceShape | ResourceShape} accepts any model naming a single property, and a generic
 * {@link @metreeca/qest!Template | Template} is accepted as {@link Model} accepts it, so collection retrievals still
 * compile where only a generic shape or model is known.
 *
 * @typeParam S The shape of the resource holding the collection, possibly deferred to break definition cycles
 * @typeParam T The supplied model, typically inferred from the argument
 *
 * @opaque
 */
export type Slice<S extends Lazy<ResourceShape>, T> =
	string extends keyof T ? Model<S, T> // the model left wide
		: ResourceShape extends Eager<S> ? Model<S, T> & Sole<keyof T> // the shape left wide
			: Model<S, T> & Sole<keyof T> & { readonly [F in keyof T]: F extends Repeated<S> ? Collecting<S, F, T[F]> : never }

/**
 * Resolves the type of the items retrieved from a collection.
 *
 * Items are the array of {@link Frame | frames} that a {@link Slice | slice} retrieves from a collection.
 * {@link items} extracts them from the {@link Match | match} of the retrieval, so callers don't need to look up the
 * collection in the holding resource. Each frame is restricted to the members the slice asks for.
 *
 * Items are always an array, whatever the shape and model, so they are accepted wherever an iterable of items is
 * expected, even in code generic over both. The bare {@link resource!ResourceShape | ResourceShape} or a generic
 * {@link @metreeca/qest!Template | Template} resolves to an array of any {@link @metreeca/qest!Value | values}, so
 * any collection result is accepted where only a generic shape or model is known.
 *
 * @typeParam S The shape of the resource holding the collection, possibly deferred to break definition cycles
 * @typeParam T The slice, naming the collection property and the members wanted from each item, possibly
 * with criteria; callers constrain it to the {@link Slice | slice} the shape allows, as with {@link Match}
 *
 * @opaque
 */
export type Items<S extends Lazy<ResourceShape>, T extends object> =
	readonly Frame<S, T>[]

/**
 * Resolves the type of a single item retrieved from a collection.
 *
 * A frame is one of the {@link Items | items} returned by a {@link Slice | slice} retrieval. For a template
 * under the property, the item is restricted to the members the template names. For a projection, it is a computed
 * row, keyed by the name before each binding's `=`. For an empty template, it is the item as stored, such as a
 * {@link @metreeca/qest!Reference | reference}. Filtering, ordering and pagination criteria don't affect the item
 * type. The bare {@link resource!ResourceShape | ResourceShape} or a generic
 * {@link @metreeca/qest!Template | Template} resolves to any {@link @metreeca/qest!Value | value}.
 *
 * Code generic over the shape and the slice uses this type to name a single item, for instance to type the items
 * flattened out of several retrievals.
 *
 * @typeParam S The shape of the resource holding the collection, possibly deferred to break definition cycles
 * @typeParam T The slice, naming the collection property and the members wanted from each item, possibly
 * with criteria; callers constrain it to the {@link Slice | slice} the shape allows, as with {@link Match}
 *
 * @opaque
 */
export type Frame<S extends Lazy<ResourceShape>, T extends object> =
	string extends keyof T ? Value // the model left wide
		: Extract<Match<S, T>[keyof T & keyof Match<S, T>], readonly unknown[]>[number]
