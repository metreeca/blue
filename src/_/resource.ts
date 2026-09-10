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
import type { Draft, Shape, State } from "./_.js";
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


export type Id = {

	readonly kind: "id"

}

export type Type = {

	readonly kind: "type"

}


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
 * Resolves the members a retrieved resource carries.
 *
 * @typeParam M The members the shape describes
 */
export type Instance<M extends Members> = {

	readonly [field in keyof M]: Content<M[field]>

};

/**
 * Resolves the members a submitted resource carries.
 *
 * Drops the members the submitter does not own and leaves optional the ones the system supplies, keeping the rest as
 * the shape states them.
 *
 * @typeParam M The members the shape describes
 */
export type Submission<M extends Members> =
	& { readonly [field in keyof M as Duty<M[field]> extends "demanded" ? field : never]: Offer<M[field]> }
	& { readonly [field in keyof M as Duty<M[field]> extends "spared" ? field : never]?: Offer<M[field]> }

/**
 * Resolves what a submission owes for a member.
 *
 * Yields `refused` for a member the resources it points at own, `spared` for an identifier and for a system-managed
 * member, both of which a submission may leave out, and `demanded` for every other.
 *
 * @typeParam M The member to resolve
 */
export type Duty<M> =
	M extends { readonly foreign: true } ? "refused"
		: M extends { readonly kind: "id" } ? "spared"
			: M extends { readonly computed: true } ? "spared"
				: "demanded"

/**
 * Resolves the value a retrieved member carries.
 *
 * @typeParam M The member to resolve
 */
export type Content<M extends Member> =
	M extends Id ? Reference
		: M extends Type ? Optional<Reference>
			: M extends {
					readonly kind: "property",
					readonly range: infer R extends Lazy<Shape>,
					readonly minCount: infer L extends Count,
					readonly maxCount: infer U extends Count
				} ? Bounded<State<R>, L, U>
				: never

/**
 * Resolves the value a submitted member carries.
 *
 * @typeParam M The member to resolve
 */
export type Offer<M extends Member> =
	M extends Id ? Reference
		: M extends Type ? Optional<Reference>
			: M extends {
					readonly kind: "property",
					readonly range: infer R extends Lazy<Shape>,
					readonly minCount: infer L extends Count,
					readonly maxCount: infer U extends Count
				} ? Bounded<Ranged<M, R>, L, U>
				: never

/**
 * Resolves the value a submitted property range admits.
 *
 * Admits a captive target inline alongside its IRI, and otherwise carries the state the range describes.
 *
 * @typeParam M The member stating the range
 * @typeParam R The range it states
 */
export type Ranged<M, R extends Lazy<Shape>> =
	[M] extends [{ readonly captive: true }]
		? Eager<R> extends ReferenceShape<infer X> ? Reference | Draft<X> : State<R>
		: State<R>


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
	[U] extends [1]
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


/**
 * Checks whether an upper bound limits a property to a single value.
 *
 * @typeParam U The greatest number of values admitted
 */
export type Single<U extends Count> =
	[U] extends [1] ? true : false


//// Resource Inheritance ////////////////////////////////////////////////////////////////////////////////////////////

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
	Eager<S> extends {
			readonly parents: infer P extends Parents,
			readonly members: infer M extends Members
		} ? Inherited<P> & M
		: {}

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
	Inherited<I> extends infer P ? Omit<P, keyof M> & {

			readonly [field in keyof M]: field extends keyof P
				? Narrows<M[field], P[field]> extends true ? M[field] : never
				: M[field]

		} : never

/**
 * Checks whether a member restricts another.
 *
 * Compares the member kind, the range and the two cardinality bounds in their own right, rather than the state they
 * project, so that two ranges which happen to project the same state are told apart. A bound may only be tightened,
 * and only within the arity it states: raising a lower bound restricts the values admitted, while capping an unbounded
 * property at a single value swaps an array for a bare value and is refused.
 *
 * @typeParam C The member the extending resource declares
 * @typeParam P The member it overrides
 */
export type Narrows<C, P> =
	[Kinds<C, P>, Ranges<C, P>, Lowers<C, P>, Uppers<C, P>] extends [true, true, true, true] ? true : false

type Kinds<C, P> =
	[C, P] extends [{ readonly kind: infer C }, { readonly kind: infer P }]
		? C extends P ? true : false
		: false

type Ranges<C, P> =
	[C, P] extends [
			{ readonly range: infer C extends Lazy<Shape> },
			{ readonly range: infer P extends Lazy<Shape> }
		] ? Eager<C>["kind"] extends Eager<P>["kind"] ? true : false
		: true

type Lowers<C, P> =
	[C, P] extends [{ readonly minCount: infer C extends Count }, { readonly minCount: infer P extends Count }]
		? Unbounded<C> extends true ? Unbounded<P> : true
		: true

type Uppers<C, P> =
	[C, P] extends [{ readonly maxCount: infer C extends Count }, { readonly maxCount: infer P extends Count }]
		? Single<C> extends Single<P> ? true : false
		: true
