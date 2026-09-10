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

import type { Eager, Identifier, Lazy, Optional } from "@metreeca/core";
import type { Namespace } from "@metreeca/core/resource";
import type { Dictionary, Reference } from "@metreeca/qest/resource";
import type { Carried, Draft, Shape, State } from "./_.js";
import type { ReferenceShape } from "./reference.js";


export type ResourceShape<P extends Parents = Parents, M extends Members = Members> = ResourceConstraints & {

	readonly kind: "resource"


	readonly parents: P

	readonly members: M

}

export type ResourceConstraints = {

	/**
	 * Human-readable name for the shape.
	 *
	 * Accepts a localised {@link Dictionary} or, as a shorthand for the English-only case, a plain
	 * {@link string!text | text} string, expanded to `{ en: <value> }` on the
	 * {@link ResourceShape.name | built shape}.
	 *
	 * **Inheritance** — always from child; not inherited.
	 *
	 * @remarks
	 *
	 * SHACL defines sh:name only for property shapes; extended here to node shapes.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#name SHACL § 2.3.2.1 sh:name}
	 */
	readonly name?: string | Dictionary;

	/**
	 * Human-readable description of the shape.
	 *
	 * Accepts a localised {@link Dictionary} or, as a shorthand for the English-only case, a
	 * {@link string!markdown | Markdown} string, expanded to `{ en: <value> }` on the
	 * {@link ResourceShape.description | built shape}.
	 *
	 * **Inheritance** — always from child; not inherited.
	 *
	 * @remarks
	 *
	 * SHACL defines sh:description only for property shapes; extended here to node shapes.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#name SHACL § 2.3.2.1 sh:description}
	 */
	readonly description?: string | Dictionary;


	/**
	 * Default space for converting property names to IRIs.
	 *
	 * Property names without explicit IRI mappings are resolved relative to this space.
	 *
	 * **Inheritance** — inherited from parent; conflicting parents without child override are reported as an error.
	 *
	 * @defaultValue {@link defaultNamespace}
	 */
	readonly space?: Namespace;

	/**
	 * Target class for resource instances.
	 *
	 * The absolute IRI identifying the primary class that resource instances must belong to. Shape-specific and not
	 * inherited. If defined, this value is exposed through the property mapped to `@type` using {@link type}.
	 *
	 * **Inheritance** — shape-specific target class; outside inheritance scope.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#targetClass SHACL § 2.1.3.2 sh:targetClass}
	 */
	readonly class?: Reference;


	/**
	 * IRI path pattern that resource {@link Id identifiers} must match.
	 *
	 * Patterns are IRI-like templates using `{name}` placeholders for single path segments and `/*` for trailing
	 * wildcards. Patterns may be absolute or root-relative; root-relative patterns match absolute IRIs, ignoring the
	 * origin.
	 *
	 * **Inheritance** — only the trailing `/*` wildcard admits narrowing: a child may replace `/*` with more specific
	 * segments (for example, `/products/*` to `/products/{id}/reviews/{rid}`), provided the fixed prefix matches.
	 * All other cases require exact equality; a mismatch is reported as an error.
	 *
	 * @defaultValue `undefined` (no pattern constraint)
	 *
	 * @example
	 * ```
	 * https://example.org/products/{sku}  → https://example.org/products/ABC-456
	 * https://example.org/categories/*    → https://example.org/categories/electronics/phones
	 *
	 * /employees/{id}                     → https://example.org/employees/123
	 * /departments/*                      → https://example.org/departments/sales/emea
	 * ```
	 */
	readonly pattern?: string;

	/**
	 * Allowed resource {@link Id identifiers} (closed enumeration).
	 *
	 * When specified, resource identifiers must be members of this list. IRIs must be absolute. Empty arrays are
	 * ignored.
	 *
	 * **Inheritance** — intersection of parent and child sets; empty result is reported as an error.
	 *
	 * @defaultValue `undefined` (no enumeration constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#InConstraintComponent SHACL § 4.8.3 sh:in}
	 */
	readonly in?: readonly Reference[];

	/**
	 * Required resource {@link Id identifiers} that must be present.
	 *
	 * When specified, all listed resource identifiers must appear. IRIs must be absolute. Empty arrays are ignored.
	 *
	 * **Inheritance** — union of parent and child required values; child must require all parent values.
	 *
	 * @defaultValue `undefined` (no required values)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#HasValueConstraintComponent SHACL § 4.8.2 sh:hasValue}
	 */
	readonly hasValue?: readonly Reference[];

}


export type Id = {

	readonly kind: "id"

}

export type Type = {

	readonly kind: "type"

}

export type Property<
	R extends Lazy<Shape> = Lazy<Shape>,
	L extends Count = Count,
	U extends Count = Count
> = PropertyConstrains & {

	readonly kind: "property"

	readonly range: R

	/**
	 * Least number of values the property admits.
	 *
	 * @defaultValue `undefined` (no lower bound)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MinCountConstraintComponent SHACL § 4.2.1 sh:minCount}
	 */
	readonly minCount: L

	/**
	 * Greatest number of values the property admits.
	 *
	 * @defaultValue `undefined` (no upper bound)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MaxCountConstraintComponent SHACL § 4.2.2 sh:maxCount}
	 */
	readonly maxCount: U

}

export type PropertyConstrains = {

	/**
	 * Excludes the property from default serialisation.
	 *
	 * **Inheritance** — inherited from parent; conflicting parents without child override are reported as an error.
	 *
	 * @defaultValue `undefined` (`false`)
	 */
	readonly hidden?: boolean;


	/**
	 * Marks the property as owned by the resources in its range.
	 *
	 * A foreign property is read-only for the resource declaring it: retrieval templates may select it, but state
	 * validation rejects it when submitted, because the link is written by the resources it points at rather than by
	 * the one exposing it.
	 *
	 * > [!IMPORTANT]
	 * > A foreign property is independent from a {@link reverse} mapping. A `reverse` mapping writes an actual inverse
	 * > mapping; `foreign` exposes a read-only view over mappings another property owns and writes nothing on insert.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (`false`)
	 */
	readonly foreign?: boolean;

	/**
	 * Marks the resources in the property range as unable to outlive the resource declaring it.
	 *
	 * A captive resource keeps an identity and a lifecycle of its own and may be created, updated and deleted on its
	 * own. It stays existentially dependent on the resource declaring the property, though, and is cascade-removed
	 * when that resource is deleted.
	 *
	 * > [!IMPORTANT]
	 * > Captivity is independent from embedding. An embedded resource has no identity or lifecycle of its own (an `id`
	 * > is rejected during state validation) and is always managed as part of the resource containing it; a captive
	 * > resource has both and may be managed on its own, but does not survive the resource declaring the property.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (`false`)
	 */
	readonly captive?: boolean;

	/**
	 * Marks the property as system-managed.
	 *
	 * > [!IMPORTANT]
	 * > Computed entries are populated by the system and may be silently overwritten on mutation operations.
	 * > Client-supplied values must still be present in mutation payloads but carry no guarantees of being preserved.
	 *
	 * **Inheritance** — inherited from parent; conflicting parents without child override are reported as an error.
	 *
	 * @defaultValue `undefined` (`false`)
	 */
	readonly computed?: boolean;


	/**
	 * Human-readable name for the property.
	 *
	 * Accepts a localised {@link Dictionary} or, as a shorthand for the English-only case, a plain
	 * {@link string!text | text} string, expanded to `{ en: <value> }` on the
	 * {@link Property.name | resolved property}.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (no label)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#name SHACL § 2.3.2.1 sh:name}
	 */
	readonly name?: string | Dictionary;

	/**
	 * Human-readable description of the property.
	 *
	 * Accepts a localised {@link Dictionary} or, as a shorthand for the English-only case, a
	 * {@link string!markdown | Markdown} string, expanded to `{ en: <value> }` on the
	 * {@link Property.description | resolved property}.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (no description)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#name SHACL § 2.3.2.1 sh:description}
	 */
	readonly description?: string | Dictionary;


	/**
	 * The absolute IRI identifying the property for direct mapping.
	 *
	 * Accepts either an absolute IRI string or a {@link Namespace} function that resolves the property name to an
	 * absolute IRI (for instance, `{ forward: schema }` on property `name` yields `http://schema.org/name`).
	 *
	 * > [!IMPORTANT]
	 * > Both `forward` and {@link reverse} mappings write actual property values. This is independent from
	 * > {@link foreign}, which exposes a read-only view over mappings another property owns.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @see {@link https://www.w3.org/TR/json-ld11/#iris JSON-LD 1.1 § 3.2 IRIs}
	 */
	readonly forward?: Reference | Namespace;

	/**
	 * The absolute IRI identifying the property for inverse mapping.
	 *
	 * Accepts either an absolute IRI string or a {@link Namespace} function that resolves the property name to an
	 * absolute IRI (for instance, `{ reverse: schema }` on property `employee` yields `http://schema.org/employee`).
	 *
	 * > [!IMPORTANT]
	 * > Both {@link forward} and `reverse` mappings write actual property values. This is independent from
	 * > {@link foreign}, which exposes a read-only view over mappings another property owns.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (no inverse mapping)
	 *
	 * @see {@link https://www.w3.org/TR/json-ld11/#reverse-properties JSON-LD 1.1 § 4.8 Reverse Properties}
	 */
	readonly reverse?: Reference | Namespace;

}

/**
 * Property constraints admitting explicit cardinality bounds.
 *
 * Accepted by {@link property} for bounds beyond the four the cardinality factories name.
 */
export type PropertyBounds = PropertyConstrains & {

	readonly minCount?: Count
	readonly maxCount?: Count

}

/**
 * A cardinality bound, absent where the property states none.
 */
export type Count =
	undefined | number


export type Parents =
	readonly Lazy<ResourceShape>[]

export type Members = {

	readonly [field: Identifier]: Member

}

export type Member =
	| Id
	| Type
	| Property


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export function resource<I extends Parents, M extends Members>(
	...args: [...inheritance: I, members: M]
): ResourceShape<I, M>

export function resource<I extends Parents, M extends Members>(
	...args: [...inheritance: I, members: M, constraints: ResourceConstraints]
): ResourceShape<I, M>

export function resource(...args: readonly unknown[]): ResourceShape {
	throw new Error(";( to be implemented");
}


export function id(): Id {
	throw new Error(";( to be implemented");
}

export function type(): Type {
	throw new Error(";( to be implemented");
}


export function multiple<R extends Lazy<Shape>, const C extends PropertyConstrains = {}>(
	range: R, constraints?: C
): C & Property<R, undefined, undefined> {
	throw new Error(";( to be implemented");
}

export function nonempty<R extends Lazy<Shape>, const C extends PropertyConstrains = {}>(
	range: R, constraints?: C
): C & Property<R, 1, undefined> {
	throw new Error(";( to be implemented");
}

export function optional<R extends Lazy<Shape>, const C extends PropertyConstrains = {}>(
	range: R, constraints?: C
): C & Property<R, undefined, 1> {
	throw new Error(";( to be implemented");
}

export function required<R extends Lazy<Shape>, const C extends PropertyConstrains = {}>(
	range: R, constraints?: C
): C & Property<R, 1, 1> {
	throw new Error(";( to be implemented");
}


export function property<R extends Lazy<Shape>, const C extends PropertyBounds = {}>(
	range: R, constraints?: C
): C & Property<R, Stated<C, "minCount">, Stated<C, "maxCount">> {
	throw new Error(";( to be implemented");
}


//// Resource Members ////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the value a retrieved resource exposes.
 *
 * Maps the members the shape carries, so that a retrieved resource exposes what it declares merged over what it
 * inherits and a declaration is never read on its own.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Instance<S extends Lazy<Shape>> =
	Exposed<Carried<S>>

/**
 * Resolves the value a submitted resource satisfies.
 *
 * Maps the members the shape carries, as {@link Instance} does, dropping the ones the submitter does not own and
 * leaving optional the ones the system supplies.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Submission<S extends Lazy<Shape>> =
	Offered<Carried<S>>


/**
 * Resolves the members a retrieved resource carries.
 *
 * @typeParam M The members the shape carries
 */
export type Exposed<M extends Members> = {

	readonly [field in keyof M]: Content<M[field]>

};

/**
 * Resolves the members a submitted resource carries.
 *
 * Drops the members the submitter does not own and leaves optional the ones the system supplies, keeping the rest as
 * the shape states them.
 *
 * @typeParam M The members the shape carries
 */
export type Offered<M extends Members> =
	& { readonly [field in Demanded<M>]: Offer<M[field]> }
	& { readonly [field in Spared<M>]?: Offer<M[field]> }

/**
 * Selects the members a submission must supply: every member it owns but the system does not fill in.
 *
 * @typeParam M The members the shape carries
 */
export type Demanded<M extends Members> =
	Exclude<keyof M, Refused<M> | Spared<M>>

/**
 * Selects the members a submission may leave out: an identifier and a system-managed member.
 *
 * @typeParam M The members the shape carries
 */
export type Spared<M extends Members> =
	Exclude<Fields<M, Id | { readonly computed: true }>, Refused<M>>

/**
 * Selects the members a submission does not accept: those the resources they point at own.
 *
 * @typeParam M The members the shape carries
 */
export type Refused<M extends Members> =
	Fields<M, { readonly foreign: true }>

/**
 * Selects the members matching a description.
 *
 * @typeParam M The members the shape carries
 * @typeParam D The description a selected member matches
 */
export type Fields<M extends Members, D> = {

	[field in keyof M]: M[field] extends D ? field : never

}[keyof M]


/**
 * Resolves the value a retrieved member carries.
 *
 * Yields an IRI for an identifier, an optional IRI for a type and, for a property, the state its range describes in
 * the form its cardinality admits.
 *
 * @typeParam M The member to resolve
 */
export type Content<M extends Member> =
	M extends Id ? Reference
		: M extends Type ? Optional<Reference>
			: M extends Property<infer R, infer L, infer U> ? Bounded<State<R>, L, U>
				: never

/**
 * Resolves the value a submitted member carries.
 *
 * Admits a captive target inline alongside its IRI and otherwise carries what the retrieved member does.
 *
 * @typeParam M The member to resolve
 */
export type Offer<M extends Member> =
	M extends { readonly captive: true } & Property<infer R, infer L, infer U> ? Bounded<Inline<R>, L, U>
		: Content<M>

/**
 * Resolves the value a captive property range admits.
 *
 * Yields the target draft alongside its IRI where the range points at a resource, and the state the range describes
 * otherwise, as a scalar has nothing to hold captive.
 *
 * @typeParam R The captive range
 */
export type Inline<R extends Lazy<Shape>> =
	Eager<R> extends ReferenceShape<infer T> ? Reference | Draft<T> : State<R>


//// Resource Inheritance ////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Merges declared members over inherited ones.
 *
 * Retains a member that restricts the one it overrides and voids any other, so an extending resource may tighten what
 * it inherits but never relax it. Members the extended shapes do not declare pass through untouched.
 *
 * @typeParam I The extended shapes, possibly deferred to break definition cycles
 * @typeParam M The members the extending resource declares in its own right
 */
export type Merged<I extends Parents, M extends Members> =
	Overridden<Inherited<I>, M>

/**
 * Resolves the members a list of extended shapes contributes.
 *
 * Yields the members the extended shapes declare, together with those they inherit in turn, so that a constraint
 * stated anywhere up the chain reaches every extending resource.
 *
 * @typeParam I The extended shapes, possibly deferred to break definition cycles
 */
export type Inherited<I extends Parents> =
	I extends readonly [infer H extends Lazy<ResourceShape>, ...infer T extends Parents]
		? Declared<H> & Inherited<T>
		: {}

/**
 * Resolves the members a single shape contributes.
 *
 * @typeParam S The extended shape, possibly deferred to break definition cycles
 */
export type Declared<S extends Lazy<ResourceShape>> =
	Eager<S> extends ResourceShape<infer P, infer M> ? Inherited<P> & M : {}

/**
 * Lays declared members over the ones they override.
 *
 * @typeParam P The overridden members
 * @typeParam M The declared members
 */
export type Overridden<P, M extends Members> = Omit<P, keyof M> & {

	readonly [field in keyof M]: field extends keyof P
		? Narrows<M[field], P[field]> extends true ? M[field] : never
		: M[field]

}

/**
 * Checks whether a member restricts another.
 *
 * A property restricts another when it keeps the kind of its range, holds its lower bound and keeps its arity, so that
 * two ranges which happen to project the same state are told apart and an unbounded property is never capped at a
 * single value, which would swap an array for a bare value. An identifier and a type restrict a member of their own
 * kind alone.
 *
 * @typeParam C The member the extending resource declares
 * @typeParam P The member it overrides
 */
export type Narrows<C, P> =
	[C, P] extends [Property<infer R, infer L, infer U>, Property<infer S, infer M, infer V>]
		? [Kinded<R, S>, Floored<L, M>, Sized<U, V>] extends [true, true, true] ? true : false
		: [C, P] extends [Id, Id] | [Type, Type] ? true
			: false

/**
 * Checks whether a range keeps the kind of the one it overrides.
 *
 * @typeParam R The range the extending resource declares
 * @typeParam S The range it overrides
 */
export type Kinded<R extends Lazy<Shape>, S extends Lazy<Shape>> =
	Eager<R>["kind"] extends Eager<S>["kind"] ? true : false

/**
 * Checks whether a lower bound holds the one it overrides, so that a required value is never made optional.
 *
 * @typeParam L The lower bound the extending resource declares
 * @typeParam M The lower bound it overrides
 */
export type Floored<L extends Count, M extends Count> =
	Unbounded<L> extends true ? Unbounded<M> : true

/**
 * Checks whether an upper bound keeps the arity of the one it overrides.
 *
 * @typeParam U The upper bound the extending resource declares
 * @typeParam V The upper bound it overrides
 */
export type Sized<U extends Count, V extends Count> =
	Single<U> extends Single<V> ? true : false


//// Property Cardinality ////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the form a cardinality admits.
 *
 * Yields a bare value where the property is limited to one, an array otherwise, marking the form optional unless at
 * least one value is required. Bounds beyond the four the cardinality factories name are honoured all the same, so a
 * lower bound of two admits the same non-empty form as one.
 *
 * @typeParam V The value the property range describes
 * @typeParam L The least number of values admitted
 * @typeParam U The greatest number of values admitted
 */
export type Bounded<V, L extends Count, U extends Count> =
	Single<U> extends true
		? Unbounded<L> extends true ? undefined | V : V
		: Unbounded<L> extends true ? undefined | readonly V[]
			: readonly [V, ...V[]]

/**
 * Checks whether a lower bound leaves the property absent.
 *
 * Yields `true` unless at least one value is known to be required, so a bound stated as zero and a bound left
 * unstated both admit absence, as does one stated only as a number.
 *
 * @typeParam L The least number of values admitted
 */
export type Unbounded<L extends Count> =
	[undefined] extends [L] ? true
		: [0] extends [L] ? true
			: false

/**
 * Checks whether an upper bound limits a property to a single value.
 *
 * @typeParam U The greatest number of values admitted
 */
export type Single<U extends Count> =
	[U] extends [1] ? true : false

/**
 * Resolves a cardinality bound stated in a constraints object.
 *
 * Yields the bound where the object states one and `undefined` where it does not, so a property built from
 * constraints carries the bounds it was given rather than the widest ones.
 *
 * @typeParam C The stated constraints
 * @typeParam K The bound to resolve
 */
export type Stated<C, K extends string> =
	K extends keyof C ? (C[K] extends Count ? C[K] : undefined) : undefined
