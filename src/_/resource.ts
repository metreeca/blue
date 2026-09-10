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
import type { Instance, Proposal, Shape } from "./_.js";
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


export type Parents =
	readonly Lazy<ResourceShape>[]

export type Members = {

	readonly [field: Identifier]: Member

}

export type Member =
	| Id
	| Type
	| Property

/**
 * A cardinality bound, absent where the property states none.
 */
export type Count =
	undefined | number


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
): C & Property<R, Declared<C, "minCount">, Declared<C, "maxCount">> {
	throw new Error(";( to be implemented");
}


//// Resource Members ////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the value a retrieved resource exposes.
 *
 * Maps every member the shape carries to its content, leaving optional the ones a resource may {@link Omitted | leave
 * out}.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Retrieved<S extends Lazy<Shape>> = {

	readonly [field in keyof Loose<Carried<S>>]: Content<Loose<Carried<S>>[field]>

}

/**
 * Resolves the value a submitted resource satisfies.
 *
 * Maps the members the submitter {@link Owned | owns} to their payload, leaving optional the ones a submitter may
 * {@link Omitted | leave out}, as the system {@link Managed | fills them in} or the resource may do without them.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Submitted<S extends Lazy<Shape>> = {

	readonly [field in keyof Loose<Owned<S>, Managed>]: Input<Loose<Owned<S>, Managed>[field]>

}

/**
 * Resolves the members a submitter owns: every member the shape carries but a {@link Foreign | foreign} one.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Owned<S extends Lazy<Shape>> =
	Dropped<Carried<S>, Foreign>

/**
 * A member a submission does not accept, as the resources it points at own it.
 */
export type Foreign = {

	readonly foreign: true

}

/**
 * A member a submission may leave out, as the system fills it in: an identifier or a computed property.
 */
export type Managed =
	| Id
	| { readonly computed: true }


/**
 * Marks optional the members a resource may leave out.
 *
 * Yields the members as they stand, optional where a resource may {@link Omitted | leave them out}, so that a value
 * mapped over them requires exactly the members the resource is bound to carry.
 *
 * @typeParam M The members to mark
 * @typeParam X The members left out on top of the ones a retrieved resource may leave out
 */
export type Loose<M, X = never> = Joined<
	& { readonly [field in keyof M as Omitted<M[field], X> extends true ? never : field]: M[field] }
	& { readonly [field in keyof M as Omitted<M[field], X> extends true ? field : never]?: M[field] }
>

/**
 * Drops the members of a kind from a record.
 *
 * @typeParam M The members to filter
 * @typeParam X The members to drop
 */
export type Dropped<M, X> = {

	readonly [field in keyof M as M[field] extends X ? never : field]: M[field]

}

/**
 * Joins the parts of a record into a single one.
 *
 * Yields one record carrying every member the parts declare, with its modifiers, so that a resource resolved from
 * required and optional members reads and compares as one type rather than as an intersection.
 *
 * @typeParam T The parts to join
 */
export type Joined<T> = {

	[field in keyof T]: T[field]

}

/**
 * Checks whether a member may be left out of a resource.
 *
 * Yields `true` for a type, for a member of the kinds a transfer names and for a property whose lower bound is
 * {@link Omissible | omissible}, so that a resource states only the members it is bound to carry. A voided member is
 * never left out, so that a conflict surfaces where the state is resolved.
 *
 * @typeParam M The member to check
 * @typeParam X The members a transfer lets out on top of the ones any resource may leave out
 */
export type Omitted<M, X = never> =
	[M] extends [never] ? false
		: M extends Type | X ? true
			: M extends Property<Lazy<Shape>, infer L, Count> ? Omissible<L>
				: false

/**
 * Resolves the value a retrieved member carries.
 *
 * Yields an IRI for an identifier, an optional IRI for a type and, for a property, the state its range describes in
 * the form its cardinality admits.
 *
 * @typeParam M The member to resolve
 */
export type Content<M> =
	M extends Id ? Reference
		: M extends Type ? Optional<Reference>
			: M extends Property<infer R, infer L, infer U> ? Repeated<Instance<R>, L, U>
				: never

/**
 * Resolves the value a submitted member carries.
 *
 * Admits a captive target inline alongside its IRI and otherwise carries what the retrieved member does, as a scalar
 * has nothing to hold captive.
 *
 * @typeParam M The member to resolve
 */
export type Input<M> =
	M extends { readonly captive: true } & Property<Lazy<ReferenceShape<infer T>>, infer L, infer U>
		? Repeated<Reference | Proposal<T>, L, U>
		: Content<M>


//// Resource Inheritance ////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the members a resource carries.
 *
 * Yields the members the shape declares merged over the ones it inherits, and no member at all for a shape that
 * describes something other than a resource. A declared member that restricts the one it overrides is retained and
 * any other is voided, so an extending resource may tighten what it inherits but never relax it.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Carried<S extends Lazy<Shape>> =
	Eager<S> extends ResourceShape<infer P, infer M> ? Merged<Inherited<P>, M> : {}

/**
 * Resolves the members a list of extended shapes contributes.
 *
 * Yields the members every extended shape {@link Carried | carries}, so that a constraint stated anywhere up the
 * chain reaches every extending resource and shapes agreeing on a member pass it on as it stands.
 *
 * @typeParam P The extended shapes, possibly deferred to break definition cycles
 */
export type Inherited<P extends Parents> =
	P extends readonly [infer H extends Lazy<ResourceShape>, ...infer T extends Parents]
		? Carried<H> & Inherited<T>
		: {}

/**
 * Merges declared members over inherited ones.
 *
 * Retains a declared member whose {@link Outline | outline} restricts the one it overrides and voids any other;
 * inherited members left undeclared pass through untouched.
 *
 * @typeParam I The inherited members
 * @typeParam M The members the extending resource declares in its own right
 */
export type Merged<I, M> = Omit<I, keyof M> & {

	readonly [field in keyof M]: field extends keyof I
		? Outline<M[field]> extends Outline<I[field]> ? M[field] : never
		: M[field]

}

/**
 * Resolves the outline a member may be narrowed within.
 *
 * Yields, for a property, the kind of its range in the form its cardinality admits, and an identifier or a type as it
 * stands, so that a member restricts another exactly when its outline is assignable to the other's: the range kind is
 * kept, telling apart two ranges which happen to project the same state, a required value is never made optional, and
 * a repeated property is never capped at a single value, which would swap an array for a bare value.
 *
 * @typeParam M The member to outline
 */
export type Outline<M> =
	M extends Property<infer R, infer L, infer U> ? Repeated<Eager<R>["kind"], L, U> : M


//// Property Cardinality ////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the form a value takes when repeated within a cardinality.
 *
 * Yields a bare value where the property is limited to one, an array otherwise, marking the form optional unless at
 * least one value is {@link Omissible | known to be required}. Bounds beyond the four the cardinality factories name
 * are honoured all the same, so a lower bound of two admits the same non-empty form as one.
 *
 * @typeParam V The value the property range describes
 * @typeParam L The least number of values admitted
 * @typeParam U The greatest number of values admitted
 */
export type Repeated<V, L extends Count, U extends Count> =
	[U] extends [1]
		? Omissible<L> extends true ? undefined | V : V
		: Omissible<L> extends true ? undefined | readonly V[]
			: readonly [V, ...V[]]

/**
 * Checks whether a lower bound lets the property be left out.
 *
 * Yields `true` unless at least one value is known to be required, so a bound stated as zero and a bound left
 * unstated both admit absence, as does one stated only as a number.
 *
 * @typeParam L The least number of values admitted
 */
export type Omissible<L extends Count> =
	0 extends L ? true : undefined extends L ? true : false

/**
 * Resolves a cardinality bound stated in a constraints object.
 *
 * Yields the bound where the object states one and `undefined` where it does not, so a property built from
 * constraints carries the bounds it was given rather than the widest ones.
 *
 * @typeParam C The stated constraints
 * @typeParam K The bound to resolve
 */
export type Declared<C extends PropertyBounds, K extends keyof PropertyBounds> =
	K extends keyof C ? C[K] : undefined
