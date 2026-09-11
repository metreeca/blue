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
 * Resource shape operators.
 *
 * @module
 */

import {
	assert,
	eager,
	type Eager,
	type Identifier,
	isArray,
	isFunction,
	isObject,
	isString,
	type Lazy,
	opt as fold,
	type Optional
} from "@metreeca/core";
import { unique, union } from "@metreeca/core/arrays";
import { isIRI, type Namespace } from "@metreeca/core/resource";
import { dedent, tidy } from "@metreeca/core/strings";
import { equals, immutable, seal } from "@metreeca/core/structures";
import { all, array, fail, test, type Trace, TraceError } from "@metreeca/core/trace";
import { isReference, type Dictionary, type Reference } from "@metreeca/qest/resource";
import { mergeShape, narrowsShape, type Scope, validateShape } from "./index.core.js";
import type { Compound, Instance, Shape } from "./index.js";
import { getShapeTarget } from "./reference.core.js";
import type { ReferenceShape } from "./reference.js";
import { defaultNamespace } from "./resource.js";
import type {
	Id,
	Member,
	Members,
	Parents,
	Property,
	PropertyBounds,
	ResourceConstraints,
	ResourceShape,
	Type
} from "./resource.js";
import { getShapeBranches } from "./union.core.js";


/**
 * The seal marking a shape as already merged.
 */
const Flattened = Symbol("flattened");

/**
 * The form an identifier pattern is stated in.
 */
const PatternFormat = new RegExp("^"
	+"(?:[a-zA-Z][a-zA-Z0-9+.-]*://[^/]+)?" // optional scheme://authority
	+"/(?:(?:[^/{}*]+|\\{\\w+})(?:/(?:[^/{}*]+|\\{\\w+}))*)?" // path segments with {name} placeholders
	+"(?:/\\*)?" // optional /* wildcard
	+"$"
);


//// Resource Members ////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the value an instance of a resource carries.
 *
 * Maps every member the shape carries to its content, leaving optional the ones a resource may {@link Omitted | leave
 * out}.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Retrieved<S extends Lazy<Shape>> =
	Loose<Carried<S>> extends infer M ? { readonly [field in keyof M]: Content<M[field]> } : never

/**
 * Resolves the value a resource carries with the ones it holds captive inlined.
 *
 * Maps the members the resource {@link Owned | owns} to their input, leaving optional the ones a writer may
 * {@link Omitted | leave out}: the identifier, as the system fills it in, and the ones the resource may do without.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Submitted<S extends Lazy<Shape>> =
	Loose<Owned<S>, Id> extends infer M ? { readonly [field in keyof M]: Input<M[field]> } : never

/**
 * Resolves the members a resource owns: every member the shape carries but a {@link Foreign | foreign} one.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Owned<S extends Lazy<Shape>> = {

	readonly [field in keyof Carried<S> as Carried<S>[field] extends Foreign ? never : field]: Carried<S>[field]

}

/**
 * A member a submission does not accept, as the resources it points at own it.
 */
export type Foreign = {

	readonly foreign: true

}


/**
 * Marks optional the members a resource may leave out.
 *
 * Yields the members as they stand, optional where a resource may {@link Omitted | leave them out}, so that a value
 * mapped over them requires exactly the members the resource is bound to carry.
 *
 * @typeParam M The members to mark
 * @typeParam X The members left out on top of the ones any resource may leave out
 */
export type Loose<M, X = never> = Joined<
	& { readonly [field in keyof M as Omitted<M[field], X> extends true ? never : field]: M[field] }
	& { readonly [field in keyof M as Omitted<M[field], X> extends true ? field : never]?: M[field] }
>

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
 * {@link Skippable | skippable}, so that a resource states only the members it is bound to carry. A voided member is
 * never left out, so that a conflict surfaces where the state is resolved.
 *
 * @typeParam M The member to check
 * @typeParam X The members a transfer lets out on top of the ones any resource may leave out
 */
export type Omitted<M, X = never> =
	[M] extends [never] ? false
		: M extends Type | X ? true
			: M extends Property<Lazy<Shape>, infer L, Optional<number>> ? Skippable<L>
				: false

/**
 * Resolves the value a member carries in an instance.
 *
 * Yields an IRI for an identifier, an optional IRI for a type and, for a property, the value its range describes in
 * the form its cardinality admits.
 *
 * @typeParam M The member to resolve
 */
export type Content<M> =
	M extends Id ? Reference
		: M extends Type ? Optional<Reference>
			: M extends Property<infer R, infer L, infer U> ? Arity<Instance<R>, L, U>
				: never

/**
 * Resolves the value a member carries in a compound.
 *
 * Admits a captive target inline alongside its IRI and otherwise carries what the member carries in an
 * {@link Content | instance}, as a scalar has nothing to hold captive.
 *
 * @typeParam M The member to resolve
 */
export type Input<M> =
	M extends { readonly captive: true } & Property<Lazy<ReferenceShape<infer T>>, infer L, infer U>
		? Arity<Reference | Compound<T>, L, U>
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
	M extends Property<infer R, infer L, infer U> ? Arity<Eager<R>["kind"], L, U> : M


//// Property Cardinality ////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the form a value takes at the arity its bounds admit.
 *
 * Yields a bare value where the range admits at most one, an array otherwise, marking the form optional unless at
 * least one value is {@link Skippable | known to be required}. Bounds beyond the four the cardinality factories name
 * are honoured all the same, so a lower bound of two admits the same non-empty form as one.
 *
 * @typeParam V The value the range describes
 * @typeParam L The least number of values admitted
 * @typeParam U The greatest number of values admitted
 */
export type Arity<V, L extends Optional<number>, U extends Optional<number>> =
	Skippable<L> extends true
		? Optional<[U] extends [1] ? V : readonly V[]>
		: [U] extends [1] ? V : readonly [V, ...V[]]

/**
 * Checks whether a lower bound lets the values be left out.
 *
 * Yields `true` unless at least one value is known to be required, so a bound stated as zero and a bound left
 * unstated both admit absence, as does one stated only as a number.
 *
 * @typeParam L The least number of values admitted
 */
export type Skippable<L extends Optional<number>> =
	[Extract<Optional<0>, L>] extends [never] ? false : true

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


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Declares a resource member.
 *
 * Backs the member factories the {@link resource!} module exposes, fixing what they share: the member is frozen as it
 * is declared, so that a shape carrying it states the same member however many shapes it reaches.
 *
 * @typeParam M The member the calling factory states
 *
 * @param member The member to declare
 *
 * @returns An immutable member as stated
 */
export function declare<M>(member: unknown): M {

	return immutable(member) as M; // ;(cast) the factory signatures fix the member each one states

}

/**
 * Assembles a resource shape.
 *
 * Backs the factory the {@link resource!} module exposes: reads the extended shapes, the members and the constraints
 * off the arguments as they were stated, resolves each member's predicate against the effective space, and merges the
 * inherited definitions in, so that the shape a caller holds states everything its resources carry.
 *
 * @param args The extended shapes, the members, and optionally the constraints
 *
 * @returns An immutable shape admitting the resources the members and constraints bound
 *
 * @throws {TraceError} Where the stated declarations are inconsistent with the inherited ones
 * @throws {@link !TypeError TypeError} Where the arguments state neither members nor constraints
 */
export function assemble(args: readonly unknown[]): ResourceShape {

	const parents = args.filter(isParent);
	const [members, constraints = {}] = args.filter(isDeclaration);

	if ( members === undefined || !isMembers(members) ) {
		throw new TypeError(`malformed member declarations <${JSON.stringify(members)}>`);
	}

	if ( !isConstraints(constraints) ) {
		throw new TypeError(`malformed shape constraints <${JSON.stringify(constraints)}>`);
	}

	const { name, description, ...stated } = constraints;

	const space = locate(parents, constraints.space);

	return flatten({

		kind: "resource",

		...stated,

		...name !== undefined && { name: localize(name, tidy) },
		...description !== undefined && { description: localize(description, dedent) },

		parents,

		members: resolve(inherit(members, parents), space)

	});


	/**
	 * Checks whether an argument states an extended shape.
	 */
	function isParent(argument: unknown): argument is Lazy<ResourceShape> {
		return isFunction(argument) || isObject(argument) && argument.kind === "resource";
	}

	/**
	 * Checks whether an argument states members or constraints rather than an extended shape.
	 */
	function isDeclaration(argument: unknown): argument is Members | ResourceConstraints {
		return !isParent(argument);
	}

	/**
	 * Checks whether a declaration lists members.
	 */
	function isMembers(declaration: Members | ResourceConstraints): declaration is Members {
		return Object.values(declaration).every(isMember);
	}

	/**
	 * Checks whether a declaration lists constraints.
	 */
	function isConstraints(declaration: Members | ResourceConstraints): declaration is ResourceConstraints {
		return !Object.values(declaration).some(isMember);
	}

	/**
	 * Checks whether a value states a member.
	 */
	function isMember(value: unknown): value is Member {
		return isObject(value)
			&& (value.kind === "id" || value.kind === "type" || value.kind === "property");
	}


	/**
	 * Expands a label to its localised form, normalising the layout of its content.
	 *
	 * @param label The stated label, localised or taken as English content where stated as a bare string
	 * @param normalise The layout normalisation applied to every entry
	 *
	 * @returns `label` as a localised dictionary, keyed by `en` where stated as a bare string
	 */
	function localize(label: string | Dictionary, normalise: (content: string) => string): Dictionary {

		return isString(label) ? {

			en: normalise(label)

		} : Object.fromEntries(Object.entries(label).map(([tag, content]) =>
			[tag, isString(content) ? normalise(content) : content.map(normalise)]
		));

	}

	/**
	 * Identifies the space member names are resolved against.
	 *
	 * @param parents The extended shapes the space may be inherited from
	 * @param space The space the shape states, if any
	 *
	 * @returns The effective space: the stated one, else the inherited one, else the default
	 */
	function locate(parents: Parents, space: undefined | Namespace): Namespace {

		// a conflict among the extended shapes is reported by checkParents against the merged ones

		return space ?? parents.map(parent => eager(parent).space)[0] ?? defaultNamespace;

	}

	/**
	 * Completes members with the predicates they inherit.
	 *
	 * A member stating neither `forward` nor `reverse` takes the mapping of the one it overrides, so that an override
	 * restates the range alone and keeps pointing at the inherited predicate.
	 *
	 * @param members The members stated in the shape's own right
	 * @param parents The extended shapes the mappings may be inherited from
	 *
	 * @returns The members carrying the predicates they inherit
	 */
	function inherit(members: Members, parents: Parents): Members {

		const inherited = parents.map(parent => eager(parent).members);

		return Object.fromEntries(Object.entries(members).map(([name, member]) => {

			const base = inherited.reduce<undefined | Member>((found, source) => found ?? source[name], undefined);

			return member.kind === "property"
				&& member.forward === undefined && member.reverse === undefined
				&& base?.kind === "property"
				&& (base.forward !== undefined || base.reverse !== undefined)

				? [name, declare<Property>({

					...member,

					...base.forward !== undefined && { forward: base.forward },
					...base.reverse !== undefined && { reverse: base.reverse }

				})]

				: [name, member];

		}));

	}

	/**
	 * Resolves the predicates and labels the members state.
	 *
	 * A member stating neither `forward` nor `reverse` is mapped to its own name resolved against the effective space.
	 *
	 * @param members The members to resolve
	 * @param space The space member names are resolved against
	 *
	 * @returns The members with their predicates resolved to IRIs and their labels localised
	 */
	function resolve(members: Members, space: Namespace): Members {

		return Object.fromEntries(Object.entries(members).map(([name, member]) => {

			if ( member.kind !== "property" ) { return [name, member]; }

			const forward = isString(member.forward) ? assert(member.forward, isIRI)
				: member.forward !== undefined ? assert(member.forward[name], isIRI)
					: undefined;

			const reverse = isString(member.reverse) ? assert(member.reverse, isIRI)
				: member.reverse !== undefined ? assert(member.reverse[name], isIRI)
					: undefined;

			return [name, declare<Property>({

				...member,

				...member.name !== undefined && { name: localize(member.name, tidy) },
				...member.description !== undefined && { description: localize(member.description, dedent) },

				forward: forward === undefined && reverse === undefined ? assert(space[name], isIRI) : forward,
				reverse

			})];

		}));

	}

}

/**
 * Merges the inheritance chain of a resource shape into a single shape.
 *
 * Walks the shapes extended and merges each into the result, so that the shape a caller holds states every member and
 * constraint its resources are held to. A shape already merged is left as it stands, so that merging it again costs
 * nothing and changes nothing.
 *
 * @param shape The shape to merge
 *
 * @returns An immutable shape stating the inherited definitions alongside its own
 *
 * @throws {TraceError} Where the stated declarations are inconsistent with the inherited ones
 */
export function flatten(shape: ResourceShape): ResourceShape {

	if ( seal(shape, Flattened) === null ) { return shape; }

	const parents = shape.parents.map(parent => eager(parent));

	const merged = mergeResource(shape, parents.reduce(mergeResource, {

		kind: "resource",

		parents: [],
		members: {}

	}));

	const trace = all(
		() => checkParents(shape, parents),
		() => checkSingletons(Object.values(merged.members)),
		() => checkPredicates(merged)

		// checkId is left to validateResource, which alone can tell an embedded resource from an expanded target
	)(undefined);

	if ( trace !== undefined ) {
		throw new TraceError("incompatible merged shape", trace);
	}

	// the shapes a member reaches are merged in turn, so a caller walking a range holds a merged shape throughout

	return seal(immutable({

		...merged,

		members: Object.fromEntries(Object.entries(merged.members).map(([name, member]) =>
			member.kind === "property" ? [name, { ...member, shape: descend(member.shape) }] : [name, member]
		))

	}), Flattened, null);


	/**
	 * Merges the inheritance chain of the shapes a range reaches.
	 *
	 * @param range The range to descend into, possibly deferred to break definition cycles
	 *
	 * @returns The range with the resource shapes it reaches merged
	 */
	function descend(range: Lazy<Shape>): Lazy<Shape> {

		if ( isFunction(range) ) { return range; } // a deferred range is merged where it resolves

		switch ( range.kind ) {

			case "resource":

				return flatten(range);

			case "reference":

				return { ...range, target: () => eager(range.target) };

			case "union":

				return { ...range, branches: range.branches.map(branch => descend(branch)) };

			default:

				return range;

		}

	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks a set of resource constraints for internal consistency.
 *
 * Reports the contradictions that would leave a shape admitting no resource at all, so that a shape is rejected as it
 * is built rather than when a resource is first matched against it.
 *
 * @param constraints The constraints to check
 *
 * @returns A trace of the inconsistencies found, or `undefined` where the constraints admit at least one resource
 */
export function checkResource(constraints: Partial<ResourceShape>): Optional<Trace> {

	return test<typeof constraints>(({ in: allowed, hasValue }) => {

		return hasValue === undefined || allowed === undefined || hasValue.every(v => allowed.includes(v)) || [
			`{hasValue/in} required values <${hasValue.filter(v => !allowed.includes(v))}> not in allowed set`
		];

	})(constraints);

}

/**
 * Checks the extended shapes for conflicts the extending shape leaves unsettled.
 *
 * Reports the inherited fields the extended shapes disagree on and the extending shape states no value for, so that a
 * shape reaching the same field along two paths never resolves it by declaration order.
 *
 * @param shape The extending shape
 * @param parents The extended shapes, already merged
 *
 * @returns A trace of the conflicts found, or `undefined` where the extended shapes agree on every inherited field
 */
export function checkParents(shape: ResourceShape, parents: readonly ResourceShape[]): Optional<Trace> {

	if ( parents.length < 2 ) { return undefined; }

	return all(

		(shape.space === undefined && !parents.every(p => p.space?.[""] === parents[0].space?.[""]))
		&& fail([`{space} conflicting inherited values <${parents[0].space?.[""]}> vs <${
			parents.find(p => p.space?.[""] !== parents[0].space?.[""])?.space?.[""]
		}> without an override`]),

		...unique(parents.flatMap(p => Object.keys(p.members)))

			// a member stated by a single extended shape can't conflict

			.filter(name => parents.filter(p => p.members[name]?.kind === "property").length > 1)

			.map(name => {

				const override = shape.members[name]?.kind === "property" ? shape.members[name] : undefined;
				const inherited = parents.flatMap(p => p.members[name]?.kind === "property" ? [p.members[name]] : []);

				return (!inherited.every(p => p.hidden === inherited[0].hidden) && override?.hidden === undefined)
					&& fail([`{hidden} conflicting inherited values <${inherited[0].hidden}> vs <${
						inherited.find(p => p.hidden !== inherited[0].hidden)?.hidden
					}> for <${name}> without an override`]);

			})
	)(undefined);

}

/**
 * Checks that a shape states at most one identifier and one type.
 *
 * > [!IMPORTANT]
 * > Members must be collapsed by name before they are counted: a marker reaching a shape under one name along several
 * > inheritance paths, or redeclared over an inherited one, is a single member rather than a duplicate. Only markers
 * > of the same kind held under *distinct* names are duplicates.
 *
 * @param members The merged members to check, collapsed by name
 *
 * @returns A trace of the duplicates found, or `undefined` where the shape states at most one of each
 */
export function checkSingletons(members: readonly { readonly kind?: string }[]): Optional<Trace> {

	return all<typeof members>(
		test(declared => {

			return declared.filter(m => m.kind === "id").length <= 1 || [
				`{id} duplicate member (<${declared.filter(m => m.kind === "id").length}> found)`
			];

		}),
		test(declared => {

			return declared.filter(m => m.kind === "type").length <= 1 || [
				`{type} duplicate member (<${declared.filter(m => m.kind === "type").length}> found)`
			];

		})
	)(members);

}

/**
 * Checks that no two members of a shape map to the same predicate.
 *
 * Forward and reverse mappings are counted apart, so the same IRI may serve both without conflict, but no two members
 * may share a forward mapping, and no two a reverse one.
 *
 * @param shape The merged shape to check
 *
 * @returns A trace of the duplicates found, or `undefined` where every member maps to a predicate of its own
 */
export function checkPredicates(shape: ResourceShape): Optional<Trace> {

	const properties = Object.entries(shape.members)
		.flatMap(([name, member]) => member.kind === "property" ? [[name, member] as const] : []);

	return all(...[...duplicates("forward"), ...duplicates("reverse")].map(message => fail([message])))(undefined);


	/**
	 * Lists the members sharing a mapping with one stated before them.
	 *
	 * @param mapping The mapping to inspect
	 *
	 * @returns One message per member sharing `mapping` with an earlier one
	 */
	function duplicates(mapping: "forward" | "reverse"): readonly string[] {

		return properties

			.flatMap(([name, member]) => {

				const iri = member[mapping];

				const earlier = iri === undefined ? undefined : properties
					.find(([other, source]) => other !== name && source[mapping] === iri);

				return earlier === undefined || properties.findIndex(([n]) => n === name)
					< properties.findIndex(([n]) => n === earlier[0]) ? []
					: [`{${mapping}} duplicate predicate <${iri}> on <${name}> already used by <${earlier[0]}>`];

			});

	}

}

/**
 * Checks that no member carries an embedded resource naming itself.
 *
 * An embedded resource has no identity of its own, so it states no identifier. A linked resource legitimately states
 * one and is left alone; a union range is inspected one branch at a time.
 *
 * This runs as a resource is validated rather than as the shape is built: at construction an id-bearing embedded range
 * reads exactly like an expanded link, whose target legitimately names itself, and the two are told apart only once a
 * value is matched against them.
 *
 * @param shape The merged shape to check
 *
 * @returns A trace of the embedded resources naming themselves, or `undefined` where none does
 */
export function checkId(shape: ResourceShape): Optional<Trace> {

	return all(...Object.entries(shape.members)
		.flatMap(([name, member]) => member.kind === "property" ? getShapeBranches(member.shape)
			.filter(branch => branch.kind === "resource" && getShapeId(branch) !== undefined)
			.map(() => fail([`{id} unexpected identifier in the resource embedded under <${name}>`]))
			: []
		)
	)(undefined);

}


/**
 * Reports whether a resource shape narrows an inherited one.
 *
 * Tests the override relation without building the merged shape, so that an incompatible extension is told apart from
 * a legitimate refinement before either is committed to: a shape narrows the inherited one where its identifier
 * `pattern` stays compatible, it adds no identifier the inherited shape omits, requires every identifier it requires,
 * and every member it redeclares keeps its kind and narrows the one it overrides.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns A trace of the obstacles to the override, or `undefined` where `target` narrows `source`
 */
export function narrowsResource(target: ResourceShape, source: ResourceShape): Optional<Trace> {

	const { in: allowed, hasValue: required } = source;

	return all<ResourceShape>(
		test(({ pattern }) => {

			return pattern === undefined || source.pattern === undefined || pattern === source.pattern
				|| source.pattern.endsWith("/*") && pattern.startsWith(source.pattern.slice(0, -1))
				|| [`{pattern} incompatible identifier patterns <${pattern}> and <${source.pattern}>`];

		}),
		test(({ in: values }) => {

			return values === undefined || allowed === undefined || values.every(v => allowed.includes(v)) || [
				`{in} unexpected values [${values.filter(v => !allowed.includes(v))}]`
			];

		}),
		test(({ hasValue }) => {

			return hasValue === undefined || required === undefined || required.every(v => hasValue.includes(v)) || [
				`{hasValue} missing required values [${required.filter(v => !hasValue.includes(v))}]`
			];

		}),

		// per shared member: the kind is kept, and a property narrows the one it overrides

		...union([Object.keys(target.members), Object.keys(source.members)]).flatMap(name => {

			const declared = target.members[name];
			const inherited = source.members[name];

			return declared === undefined || inherited === undefined ? []
				: declared.kind !== inherited.kind
					? [() => [{ [name]: [`mismatched member kinds <${declared.kind}> vs <${inherited.kind}>`] }]]
					: declared.kind === "property" && inherited.kind === "property"
						? [() => fold(narrowsProperty(declared, inherited), trace => [{ [name]: trace }])]
						: [];

		}),

		// post-merge constraint consistency, over the identifiers alone: merging the members here would throw on
		// the very incompatibility this relation is asked to report

		() => checkResource(identifiers(target, source))
	)(target);

}

/**
 * Merges a resource shape with an inherited one.
 *
 * Yields the single shape an extending resource is validated against, combining the inherited constraints with the
 * overriding ones: the admitted identifiers intersect, the required ones accumulate, and members declared on both
 * sides are merged one by one.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns An immutable shape admitting the resources both `target` and `source` admit
 *
 * @throws {TraceError} Where `target` doesn't narrow `source`
 */
export function mergeResource(target: ResourceShape, source: ResourceShape): ResourceShape {

	const trace = narrowsResource(target, source);

	if ( trace !== undefined ) {
		throw new TraceError("incompatible resource shape override", trace);
	}

	return immutable({

		kind: target.kind,

		name: target.name,
		description: target.description,

		space: target.space ?? source.space,
		class: target.class,

		parents: target.parents,

		...merge(target, source)

	});

}


/**
 * Combines the constraints and members of an overriding shape with the inherited ones.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns The merged identifier constraints and members, as they stand before they are checked for consistency
 */
function merge(target: ResourceShape, source: ResourceShape): Pick<ResourceShape,
	"pattern" | "in" | "hasValue" | "members"
> {

	return {

		// structural: pattern — the narrower of the two, equal unless the inherited one ends in a wildcard

		pattern: target.pattern ?? source.pattern,

		...identifiers(target, source),

		// conjunctive: members — union, each member stated on both sides merged

		members: Object.fromEntries(union([
			Object.keys(target.members),
			Object.keys(source.members)
		]).map(name => {

			const declared = target.members[name];
			const inherited = source.members[name];

			return declared === undefined || inherited === undefined ? [name, declared ?? inherited]
				: declared.kind === "property" && inherited.kind === "property"
					? [name, mergeProperty(declared, inherited)]
					: [name, declared]; // a marker states nothing to merge, and narrowsResource kept the kind

		}))

	};

}

/**
 * Combines the identifier constraints of an overriding shape with the inherited ones.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns The merged identifier constraints, as they stand before they are checked for consistency
 */
function identifiers(target: ResourceShape, source: ResourceShape): Pick<ResourceShape, "in" | "hasValue"> {

	const { in: allowed, hasValue: required } = source;

	return {

		// conjunctive: in — intersection; hasValue — union

		in: target.in !== undefined && allowed !== undefined
			? target.in.filter(v => allowed.includes(v))
			: target.in ?? allowed,

		hasValue: target.hasValue !== undefined && required !== undefined
			? union<Reference>([target.hasValue, required])
			: target.hasValue ?? required

	};

}

/**
 * Reports whether a member narrows an inherited one.
 *
 * Tests the override relation without building the merged member: a member narrows the inherited one where it leaves
 * the fields it may not override untouched, leaves neither cardinality bound wider, and states a range narrowing the
 * inherited one.
 *
 * @param target The overriding member
 * @param source The inherited member
 *
 * @returns A trace of the obstacles to the override, or `undefined` where `target` narrows `source`
 */
export function narrowsProperty(target: Property, source: Property): Optional<Trace> {

	return all<Property>(
		test(({ name }) => {

			return name === undefined || equals(name, source.name) || [`{name} unexpected <name> override`];

		}),
		test(({ description }) => {

			return description === undefined || equals(description, source.description) || [
				`{description} unexpected <description> override`
			];

		}),
		test(({ forward }) => {

			return forward === undefined || forward === source.forward || [`{forward} unexpected <forward> override`];

		}),
		test(({ reverse }) => {

			return reverse === undefined || reverse === source.reverse || [`{reverse} unexpected <reverse> override`];

		}),
		test(({ foreign }) => {

			return foreign === undefined || foreign === source.foreign || [`{foreign} unexpected <foreign> override`];

		}),
		test(({ captive }) => {

			return captive === undefined || captive === source.captive || [`{captive} unexpected <captive> override`];

		}),
		// an unstated bound leaves that end unbounded rather than unsaid, so it is read as the widest one

		test(({ minCount }) => {

			return (minCount ?? 0) >= (source.minCount ?? 0) || [
				`{minCount} widened limit <${minCount}> beyond <${source.minCount}>`
			];

		}),
		test(({ maxCount }) => {

			return (maxCount ?? Infinity) <= (source.maxCount ?? Infinity) || [
				`{maxCount} widened limit <${maxCount}> beyond <${source.maxCount}>`
			];

		}),
		() => narrowsShape(eager(target.shape), eager(source.shape))
	)(target);

}

/**
 * Merges a member with an inherited one.
 *
 * Yields the single member an extending resource is validated against: the tighter of the two cardinality bounds, the
 * merged range, and the fields the override may not restate carried through from the inherited member.
 *
 * @param target The overriding member
 * @param source The inherited member
 *
 * @returns An immutable member admitting the values both `target` and `source` admit
 *
 * @throws {TraceError} Where `target` doesn't narrow `source`
 */
export function mergeProperty(target: Property, source: Property): Property {

	const trace = narrowsProperty(target, source);

	if ( trace !== undefined ) {
		throw new TraceError("incompatible member override", trace);
	}

	return immutable({

		kind: target.kind,

		...target.hidden !== undefined ? { hidden: target.hidden }
			: source.hidden !== undefined ? { hidden: source.hidden }
				: {},

		...source.name !== undefined && { name: source.name },
		...source.description !== undefined && { description: source.description },

		...source.forward !== undefined && { forward: source.forward },
		...source.reverse !== undefined && { reverse: source.reverse },

		...source.foreign !== undefined && { foreign: source.foreign },
		...source.captive !== undefined && { captive: source.captive },

		minCount: target.minCount ?? source.minCount,
		maxCount: target.maxCount ?? source.maxCount,

		shape: mergeShape(eager(target.shape), eager(source.shape))

	});

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates values against a resource shape.
 *
 * Reports a value that is not a resource as a `{kind}` violation and each member that breaks a constraint under its
 * own facet, keyed by the member it is stated under, so that a caller may tell which member failed and why. A resource
 * shape is closed: a value carrying a member the shape doesn't declare is rejected.
 *
 * @param values The values to validate
 * @param shape The shape the values are matched against
 * @param opts Validation options
 * @param opts.scope The {@link Scope | strictness} the shape is enforced at, defaulting to `"state"`
 *
 * @returns A trace of the violations found, or `undefined` where every value matches `shape`
 */
export function validateResource(values: readonly unknown[], shape: ResourceShape, {

	scope = "state",

	entry,
	depth

}: {

	scope?: Scope
	entry?: Reference
	depth?: number

} = {}): Optional<Trace> {

	const matching = values.filter(value => isObject(value));
	const mistyped = values.length-matching.length;

	return all(

		// an embedded resource naming itself is told from an expanded link only here, against a value

		() => checkId(shape),

		(mistyped > 0)
		&& fail([`{kind} expected <resource> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`]),

		...matching.map((resource, index) => () => fold(
			all(

				// every member the shape declares, keyed by its name

				...Object.entries(shape.members).map(([name, declared]) => () => fold(
					declared.kind === "id" ? identifier(resource[name], shape, entry)
						: declared.kind === "type" ? classifier(resource[name], shape)
							: contents(resource[name], declared),
					trace => [{ [name]: trace }]
				)),

				// the shape is closed, so a field it doesn't declare is rejected

				...Object.keys(resource)
					.filter(name => !Object.hasOwn(shape.members, name))
					.map(name => () => [{ [name]: ["unexpected member"] }])

			)(undefined),

			trace => [{ [key(resource, shape, index)]: trace }]
		))
	)(undefined);


	/**
	 * Validates the values a member carries against its range and cardinality.
	 */
	function contents(value: unknown, member: Property): Optional<Trace> {

		const { minCount, maxCount, shape: range, foreign, captive } = member;

		// a foreign member is written by the resources it points at, not by the one exposing it

		if ( foreign ) {
			return value !== undefined ? ["unexpected foreign member"] : undefined;
		}

		const present = value === undefined || isArray(value, []) ? undefined : value;

		const resolved = eager(range);

		const carried = present === undefined ? [] : isArray(present) ? present : [present];

		const arity = maxCount === 1
			? isArray(present) ? ["{kind} expected a single value"] : undefined
			: present !== undefined && !isArray(present) ? ["{kind} expected an array of values"] : undefined;

		// the arity is reported first, then the values, then the cardinality

		return arity
			?? elements(carried, resolved, captive)
			?? all(
				(minCount !== undefined && carried.length < minCount)
				&& fail([`{minCount} expected at least <${minCount}> value(s)`]),

				(maxCount !== undefined && carried.length > maxCount)
				&& fail([`{maxCount} expected at most <${maxCount}> value(s)`])
			)(undefined);

	}

	/**
	 * Validates the elements a member carries, expanding the ones it holds captive.
	 */
	function elements(carried: readonly unknown[], range: Shape, captive: undefined | boolean): Optional<Trace> {

		return captive && range.kind === "reference"

			? array((value: unknown) => expanded(value, range))(carried)

			: validateShape(carried, range, { scope });

	}

	/**
	 * Validates a captive element, stated either as a link or as the resource it points at.
	 */
	function expanded(value: unknown, range: ReferenceShape): Optional<Trace> {

		const next = depth === undefined ? undefined : depth-1;

		return !isObject(value) ? validateShape([value], range, { scope })
			: depth === undefined || depth > 0
				? validateResource([value], eager(range.target), { scope, depth: next })
				: ["exceeded the maximum nesting depth"];

	}

	/**
	 * Validates the identifier a resource states against the constraints its shape puts on identifiers.
	 */
	function identifier(value: unknown, shape: ResourceShape, entry: undefined | Reference): Optional<Trace> {

		const { pattern, in: allowed, hasValue: required } = shape;

		return value === undefined ? undefined : all(

			isArray(value) ? fail(["{kind} expected a single value"])
				: !isReference(value) ? fail(["{kind} expected an absolute IRI"])
					: false,

			(entry !== undefined && isReference(value) && value !== entry)
			&& fail([`{entry} mismatched entry <${entry}>`]),

			(pattern !== undefined && !(isReference(value) && match(value, pattern)))
			&& fail([`{pattern} expected an IRI matching pattern <${pattern}>`]),

			(allowed !== undefined && !(isReference(value) && allowed.includes(value)))
			&& fail([`{in} expected values in [${allowed.join(", ")}]`]),

			(required !== undefined && !(isReference(value) && required.every(v => v === value)))
			&& fail([`{hasValue} expected values to include [${required.join(", ")}]`])
		)(undefined);

	}

	/**
	 * Validates the class a resource states against the one its shape declares.
	 */
	function classifier(value: unknown, shape: ResourceShape): Optional<Trace> {

		const { class: declared } = shape;

		return value === undefined ? undefined : all(

			isArray(value) ? fail(["{kind} expected a single value"])
				: !isReference(value) ? fail(["{kind} expected an absolute IRI"])
					: false,

			// a class value states the class the shape declares, so a shape declaring none admits no value

			(isReference(value) && value !== declared)
			&& fail([declared === undefined
				? `{class} unexpected class without one declared`
				: `{class} expected the declared class <${declared}>`
			])
		)(undefined);

	}

	/**
	 * Keys a resource by the identifier it states, or by its position where it states none.
	 */
	function key(value: Record<string, unknown>, shape: ResourceShape, index: number): string {

		const id = getShapeId(shape);
		const iri = id === undefined ? undefined : value[id];

		return isReference(iri) ? `<${iri}>` : `${index}`;

	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the class the resources a range describes belong to.
 *
 * @param shape The range to resolve, possibly deferred to break definition cycles
 *
 * @returns The class the target shape declares, or `undefined` where it declares none
 */
export function getShapeClass(shape: Lazy<Shape>): undefined | Reference {

	return getShapeTarget(shape)?.class;

}

/**
 * Resolves the name of the member naming the resources a range describes.
 *
 * @param shape The range to resolve, possibly deferred to break definition cycles
 *
 * @returns The name the identifier is stated under, or `undefined` where the target states none
 */
export function getShapeId(shape: Lazy<Shape>): undefined | Identifier {

	return member(shape, "id");

}

/**
 * Resolves the name of the member typing the resources a range describes.
 *
 * @param shape The range to resolve, possibly deferred to break definition cycles
 *
 * @returns The name the class is stated under, or `undefined` where the target states none
 */
export function getShapeType(shape: Lazy<Shape>): undefined | Identifier {

	return member(shape, "type");

}

/**
 * Resolves the members the resources a range describes carry.
 *
 * @param shape The range to resolve, possibly deferred to break definition cycles
 *
 * @returns The members of the target shape, or no member at all where the range points at no resource
 */
export function getShapeProperties(shape: Lazy<Shape>): Members {

	return getShapeTarget(shape)?.members ?? {};

}


/**
 * Resolves the name a marker of the given kind is stated under.
 *
 * @param shape The range to resolve, possibly deferred to break definition cycles
 * @param kind The kind of marker to look for
 *
 * @returns The name `kind` is stated under, or `undefined` where the target states none
 */
function member(shape: Lazy<Shape>, kind: "id" | "type"): undefined | Identifier {

	return Object.entries(getShapeTarget(shape)?.members ?? {})
		.find(([, declared]) => declared.kind === kind)?.[0];

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks whether an identifier matches a pattern.
 *
 * Reads a pattern as an IRI template, where `{name}` stands for a single path segment and a trailing `/*` for one or
 * more, so that a shape states the identifiers it admits by their shape rather than by enumeration. A root-relative
 * pattern is matched against the path alone, ignoring the origin, so that the same shape serves whatever host the
 * resources are published under.
 *
 * @param iri The identifier to test
 * @param pattern The pattern to match it against
 *
 * @returns `true` where `iri` matches `pattern`
 *
 * @throws {@link !TypeError TypeError} Where `pattern` is not a well-formed identifier pattern
 */
export function match(iri: Reference, pattern: string): boolean {

	if ( !PatternFormat.test(pattern) ) {
		throw new TypeError(`malformed pattern <${pattern}>`);
	}

	// {name} matches a single path segment; a trailing /* matches one or more

	const expression = pattern
		.replace(/[.+?^$()|[\]\\]/g, "\\$&")
		.replace(/\/\{\w*}(?=\/|$)/g, "/[^/]+")
		.replace(/\/\*$/, "/.+");

	// a root-relative pattern is matched against the path alone, ignoring scheme and authority

	const target = pattern.startsWith("/")
		? iri.replace(/^[a-z][a-z0-9+.-]*:(\/\/[^/]*)?/i, "")
		: iri;

	return new RegExp(`^${expression}$`).test(target);

}
