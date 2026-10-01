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
 * Value inference.
 *
 * Type-level helpers behind the public value inference types: the plain value of a shape, the values allowed by
 * enumeration constraints, the retrieval models allowed for each member, the collections a model may name, and the
 * resources, rows and items a retrieval returns.
 *
 * > [!WARNING]
 * > Provisional. Projection columns are typed as any value a resource may hold, since expressions are not checked
 * > against the shape: callers needing a narrower type must state it themselves.
 *
 * @module
 */

import type { Eager, Lazy, Optional } from "@metreeca/core";
import type { Atomic, Binding, Criteria, Locale, Projection, Query, Union } from "@metreeca/qest/model";
import type { Reference, Value, Values } from "@metreeca/qest/state";
import type { BooleanShape } from "../boolean/index.js";
import type { Tagged } from "../dictionary/inference.js";
import type { DictionaryShape } from "../dictionary/index.js";
import type { NumberShape } from "../number/index.js";
import type { ReferenceShape } from "../reference/index.js";
import type { Arity, Arrayed, Carried, Content, Identifier, Joined, Loose, Repeated } from "../resource/inference.js";
import type { Property, ResourceShape } from "../resource/index.js";
import type { StringShape } from "../string/index.js";
import type { Branch, Variant } from "../union/inference.js";
import type { Draft, Model, Shape, State } from "./index.js";


//// Plain Values //////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the plain value type of a shape.
 *
 * Boolean, number and string shapes resolve to their primitive type, narrowed to the enumerated values if any.
 * Dictionary shapes resolve to a language-tag-keyed map, with the per-tag cardinality set by the shape. Reference
 * shapes resolve to a {@link Reference} to the target. Resource and union shapes have no plain value and resolve to
 * `never`.
 *
 * @typeParam S The shape, possibly deferred to break definition cycles
 */
export type Plain<S extends Lazy<Shape>> =
	Eager<S> extends BooleanShape<infer V> ? V
		: Eager<S> extends NumberShape<infer V> ? V
			: Eager<S> extends StringShape<infer V> ? V
				: Eager<S> extends infer D extends DictionaryShape ? Tagged<D>
					: Eager<S> extends ReferenceShape ? Reference
						: never

/**
 * Resolves the values allowed by a set of constraints.
 *
 * Resolves to the enumerated values if the constraints list them, either as an array or as a single value, and to the
 * whole domain otherwise, so values of an enumerated shape are typed by the values they can actually take. Empty
 * enumerations, and enumerations whose values are typed too broadly to tell apart, resolve to the whole domain.
 *
 * @typeParam C The constraints
 * @typeParam D The domain of the values
 */
export type Legal<C, D> =
	C extends { readonly in: infer V extends readonly D[] }
		? [V[number]] extends [never] ? D : V[number]
		: C extends { readonly in: infer V extends D } ? V
			: D

/**
 * Resolves the state of a resource to be persisted.
 *
 * Resolves to the state of the shape with an optional identifier.
 *
 * @typeParam S The resource shape, possibly deferred to break definition cycles
 */
export type Drafted<S extends Lazy<ResourceShape>> =
	State<S> extends infer I ? Joined<
		& { readonly [K in keyof I as K extends Identifier<S> ? never : K]: I[K] }
		& { readonly [K in keyof I as K extends Identifier<S> ? K : never]?: I[K] }
	> : never


//// Retrieval Models //////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the entries a model may contain for the members of a resource.
 *
 * Every member of the shape, declared or inherited, is optional and may take any form its range supports; any other
 * field of the supplied model accepts no value. There is no index signature, so a nested template naming no member of
 * the resource is told apart from an atomic `{}` and rejected.
 *
 * @typeParam S The resource shape, possibly deferred to break definition cycles
 * @typeParam T The supplied model, whose fields outside the members are rejected; omit it to reject nothing
 */
export type Entries<S extends Lazy<ResourceShape>, T = never> = {

	readonly [field in keyof Carried<S> | Strays<T, keyof Carried<S>>]?:
		field extends keyof Carried<S> ? Entry<Carried<S>[field]> : never

}


//// Collections ///////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the shape of the drafts posted to a resource or to one of its collection properties.
 *
 * Resolves to the shape a {@link Draft | draft} must satisfy. Without a slice, this is the resource shape itself. Given
 * a slice, this is the shape of the new items of the collection property it names: the shape of the resources the
 * property embeds, or of the ones its references point to, whether the property is declared or inherited. Resolves to
 * `never` for properties holding values other than resources, such as plain values or unions of shapes. The bare
 * resource shape, or a generic model naming no property, resolves to the bare resource shape, so drafts are still
 * accepted where only a generic shape or model is known.
 *
 * @typeParam S The resource shape, or the shape of the resource holding the collection, possibly deferred to break
 * definition cycles
 * @typeParam T The slice naming the collection property; omit it to get the resource shape
 */
export type Blueprint<S extends Lazy<ResourceShape>, T = never> =
	[T] extends [never] ? S
		: string extends keyof T ? ResourceShape // the model left wide
			: ResourceShape extends Eager<S> ? S // the shape left wide
				: { [F in keyof T]: F extends Repeated<S> ? Linked<Carried<S>[F]> : never }[keyof T]

/**
 * Resolves the models allowed for the items of a collection property.
 *
 * Resolves to the {@link Selection | selection models} of the item shape, or to `never` for properties holding values
 * other than resources, which allow no model.
 *
 * @typeParam S The shape of the resource holding the collection
 * @typeParam F The name of the collection property
 * @typeParam T The supplied item model, whose fields outside what the item shape allows are rejected
 */
export type Collecting<S extends Lazy<ResourceShape>, F extends Repeated<S>, T> =
	[Linked<Carried<S>[F]>] extends [never] ? never : Selection<Linked<Carried<S>[F]>, T>

/**
 * Checks that a set of keys contains exactly one key.
 *
 * Resolves to `unknown`, which constrains nothing, for a single key, and to `never` for none or several.
 *
 * @typeParam K The keys to check
 */
export type Sole<K extends PropertyKey> =
	{ [P in K]: [Exclude<K, P>] extends [never] ? unknown : never }[K]


//// Retrieval Details /////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves what a template retrieves from a resource.
 *
 * Resolves to the value of the shape restricted to the members the template names, including those of nested
 * templates, so callers get back exactly what they asked for. A collection requested with a projection holds the
 * {@link Row | rows} the projection computes. Depth, cardinality and optionality come from the shape: the template
 * only selects which values to return.
 *
 * Members the template omits are omitted from the result; a member the template doesn't narrow resolves as it would in
 * {@link State}. The bare resource shape declares no member, so every member the template names resolves to any value
 * a resource may hold.
 *
 * > [!WARNING]
 * > Provisional. Every value type comes from the shape and the template contributes only the set of keys, so some
 * > forms resolve to a broad type; callers needing the narrow type must state it themselves:
 * >
 * > - **polymorphic member**: `{ code: { "0": {} } }` resolves to the whole union, `string | number`, since branches
 * >   are not resolved one by one
 * > - **projection column**: `{ vendors: { "n=name": {} } }` resolves to rows whose columns hold any value, since
 * >   bindings are not read as expressions
 * > - **localised member**: `{ label: { "*": {} } }` resolves to the full tag map, since language ranges are not
 * >   narrowed
 * >
 * > All three are the same limit: a value is resolved against its whole shape, never against a single branch,
 * > expression or language range within it.
 *
 * @typeParam S The shape the retrieval runs against, possibly deferred to break definition cycles
 * @typeParam T The {@link Wanted | retrieval keys} of the template
 */
export type Detailed<S extends Lazy<ResourceShape>, T> =
	ResourceShape extends Eager<S> ? { readonly [field in keyof T]: Optional<Values> } // the shape left wide
		: Loose<Pick<Carried<S>, keyof Carried<S> & keyof T>> extends infer M
			? { readonly [field in keyof M]: Narrowed<M[field], T[field & keyof T]> }
			: never

/**
 * Keeps the retrieval keys of a template.
 *
 * Resolves to the members named by plain identifiers, dropping constraint operators and projection bindings, which
 * share the same key space, so the result is a valid template in its own right. A generic template names no member
 * and keeps none.
 *
 * @typeParam T The template to read, or the entry a template states for a member
 */
export type Wanted<T> = {

	readonly [field in keyof T as string extends field ? never // the index signature of a template left wide
		: field extends keyof Criteria | Binding ? never
			: field]: T[field]

}


//// Retrieval Results /////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves a row returned by a projection.
 *
 * Has one column per binding, keyed by the name before the binding's `=`, so callers read rows by the names they
 * chose; criteria keys mixed in with the bindings produce no column.
 *
 * @typeParam T The projection model
 */
export type Row<T> = {

	readonly [field in keyof T as Name<field>]: Optional<Value>

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the fields of a model that aren't among the allowed ones.
 *
 * Used to reject unknown fields when checking a model against a shape, so that an unknown member listed next to known
 * ones is refused instead of slipping through. Only fields with literal names are checked: a model typed as a generic
 * template has no named fields and is accepted as is.
 *
 * @typeParam T The supplied model, typically inferred from the argument
 * @typeParam K The allowed fields, as literal names or patterns
 */
type Strays<T, K extends PropertyKey> =
	string extends keyof T ? never : Exclude<keyof T & string, K>

/**
 * Resolves the retrieval models allowed for selecting resources.
 *
 * A selection model is either a {@link Model | template} allowed by the shape or a
 * {@link @metreeca/qest!Projection | projection} computing rows, each merged with filtering, ordering and pagination
 * criteria. A model passed as `T` must fit one of the two entirely: unknown members mixed with known ones, and members
 * mixed with projection bindings, fail to compile.
 *
 * @typeParam S The shape of the selected resources, possibly deferred to break definition cycles
 * @typeParam T The supplied model, whose fields outside what each alternative allows are rejected; omit it to accept
 * any model fitting either alternative
 */
type Selection<S extends Lazy<ResourceShape>, T = never> = Query<
	| Entries<S, T>
	| Projection & { readonly [field in Strays<T, Binding | keyof Criteria>]?: never }
>

/**
 * Resolves the entry a model may contain for a member.
 *
 * Identifiers and types take an atomic. Properties take the forms their range supports; multi-valued properties also
 * take a projection, and either form may be merged with collection criteria.
 *
 * @typeParam M The requested member
 */
type Entry<M> =
	M extends Property<infer R>
		? Arrayed<M> extends true ? Query<Placeholding<R> | Projection> : Placeholding<R>
		: Atomic

/**
 * Resolves the forms a range supports for one of its values.
 *
 * Resolves to an atomic, plus a nested template for each resource the range reaches, a locale if the range admits
 * localised text, and a branch map if the range mixes kinds of value, with each branch taking any of these forms except
 * a locale.
 *
 * @typeParam R The range, possibly deferred to break definition cycles
 */
type Placeholding<R extends Lazy<Shape>> =
	| Atomic
	| Expanded<R>
	| ([Extract<Variant<R>, DictionaryShape>] extends [never] ? never : Locale)
	| ([Branch<R>] extends [never] ? never : Union<Atomic | Expanded<R>>)

/**
 * Resolves the nested templates for the resources a range reaches.
 *
 * Covers both link targets and embedded resources, for every branch of the range; branches reaching no resource
 * contribute no template.
 *
 * @typeParam R The range, possibly deferred to break definition cycles
 */
type Expanded<R extends Lazy<Shape>> =
	Reached<Variant<R>> extends infer T ? T extends Lazy<ResourceShape> ? Entries<T> : never : never

/**
 * Resolves the resource a shape reaches.
 *
 * Resolves to the target of a link or to an embedded resource, and to `never` for shapes of any other kind; given a
 * union of shapes, resolves each one separately.
 *
 * @typeParam V The eager shape
 */
type Reached<V> =
	V extends ReferenceShape<infer T extends Lazy<ResourceShape>> ? T
		: V extends ResourceShape ? V
			: never

/**
 * Resolves the resource a range reaches.
 *
 * Resolves to the target of a link or to an embedded resource, and to `never` for ranges reaching no resource of their
 * own, including ranges mixing several kinds of value and the bare shape.
 *
 * @typeParam R The range, possibly deferred to break definition cycles
 */
type Target<R extends Lazy<Shape>> =
	Shape extends Eager<R> ? never : Reached<Eager<R>>

/**
 * Resolves the resource a member reaches.
 *
 * Resolves to the resource the {@link Target | range of a property reaches}, and to `never` for identifiers, types and
 * voided members.
 *
 * @typeParam M The member to reach through
 */
type Linked<M> =
	M extends Property<infer R> ? Target<R> : never

/**
 * Narrows the value of a member to what the template requests for it.
 *
 * If the entry is a projection over a collection, resolves to the {@link Row | rows} it computes. If the member reaches
 * a resource and the template requests members of it, resolves to the {@link Detailed | detailed} resource at the
 * cardinality of the member. Otherwise resolves to the value the shape describes.
 *
 * @typeParam M The member to narrow
 * @typeParam A The template entry for the member
 */
type Narrowed<M, A> =
	[Extract<Exclude<keyof A, keyof Criteria>, Binding>] extends [never]
		? M extends Property<infer R, infer L, infer U>
			? [Target<R>] extends [never] ? Content<M>
				: [keyof Wanted<A>] extends [never] ? Content<M>
					: Arity<Detailed<Target<R>, Wanted<A>>, L, U>
			: Content<M>
		: readonly Row<A>[] // the rows a projection over the collection hands back

/**
 * Maps a projection model key to the name of the column it produces.
 *
 * - **drops** `Criteria` constraint and pagination keys
 * - **extracts** the name from computed `Binding` keys (`name=expression`)
 * - **keeps** plain identifier keys unchanged
 *
 * @typeParam K The key to map
 */
type Name<K> =
	K extends keyof Criteria ? never
		: K extends `${infer I}=${string}` ? I
			: K
