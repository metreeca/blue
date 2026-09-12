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
 * Resource shape assembly.
 *
 * Builds the shape a factory states into the merged form its consumers read: the shapes extended contribute their
 * members and constraints, each declared member is held to the one it overrides, and the result is frozen, so that a
 * shape admitting no resource at all is rejected as it is built rather than when a resource is first matched against
 * it.
 *
 * @module
 */

import {
	assert,
	isFunction,
	isNumber,
	isObject,
	isString,
	type Lazy,
	opt as fold,
	type Optional
} from "@metreeca/core";
import { unique, union } from "@metreeca/core/arrays";
import { app, isIRI, type Namespace } from "@metreeca/core/resource";
import { dedent, tidy } from "@metreeca/core/strings";
import { equals, immutable, seal } from "@metreeca/core/structures";
import { all, fail, test, type Trace, TraceError } from "@metreeca/core/trace";
import { type Dictionary, type Reference } from "@metreeca/qest/resource";
import { eager } from "../value/accessors.js";
import { mergeShape, narrowsShape } from "../value/assembler.js";
import type { Shape } from "../value/index.js";
import type {
	Member,
	Members,
	Parents,
	Property,
	PropertyBounds,
	ResourceConstraints,
	ResourceShape
} from "./index.js";
import { getShapeBranches } from "../union/accessors.js";
import { create as createUnion } from "../union/assembler.js";
import { getShapeId } from "./accessors.js";


/**
 * The seal marking a shape as already merged.
 */
const Flattened = Symbol("flattened");


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Declares a resource member.
 *
 * Backs the member factories the {@link resource!} module exposes, fixing what they share: the cardinality bounds are
 * checked as they are stated, and the member is frozen as it is declared, so that a shape carrying it states the same
 * member however many shapes it reaches.
 *
 * @typeParam M The member the calling factory states
 *
 * @param member The member to declare
 *
 * @returns An immutable member as stated
 *
 * @throws {@link !TypeError TypeError} Where the member states a negative bound, or bounds admitting no value at all
 */
export function declare<M>(member: unknown): M {

	if ( isObject(member) ) {

		const { minCount, maxCount } = member;

		if ( isNumber(minCount) && minCount < 0 ) {
			throw new TypeError(`negative minCount <${minCount}>`);
		}

		if ( isNumber(maxCount) && maxCount < 0 ) {
			throw new TypeError(`negative maxCount <${maxCount}>`);
		}

		if ( isNumber(minCount) && isNumber(maxCount) && minCount > maxCount ) {
			throw new TypeError(`inconsistent bounds <${minCount}> > <${maxCount}>`);
		}

	}

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

		classes: [], // computed as the shape is flattened

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

		return space ?? parents.map(parent => eager(parent).space)[0] ?? app;

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

		classes: [],

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

	// the class each extended shape states, followed by the ones it inherits in turn, so a caller tests a resource
	// against a supertype without walking the chain itself

	const classes = unique(parents.flatMap(parent => [
		...parent.class === undefined ? [] : [parent.class],
		...parent.classes
	]));

	// the shapes a member reaches are merged in turn, so a caller walking a range holds a merged shape throughout

	return seal(immutable({

		...merged,

		classes,

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

				// rebuilt through the factory, so the branches stay flat however descending reshapes them

				return createUnion(range.branches.map(branch => descend(branch)));

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
 * Checks a pair of cardinality bounds for internal consistency.
 *
 * Reports bounds that cross, leaving a member admitting no value at all, so that a contradiction between what is
 * required and what is admitted surfaces as the member is settled rather than when a resource is first matched against
 * it. An unstated bound leaves that end unbounded and crosses nothing.
 *
 * @param bounds The bounds to check
 *
 * @returns A trace of the inconsistency found, or `undefined` where the bounds admit at least one value
 */
export function checkBounds(bounds: Partial<PropertyBounds>): Optional<Trace> {

	return test<typeof bounds>(({ minCount, maxCount }) => {

		return minCount === undefined || maxCount === undefined || minCount <= maxCount || [
			`{minCount/maxCount} inconsistent bounds <${minCount}> > <${maxCount}>`
		];

	})(bounds);

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

		(shape.virtual === undefined && !parents.every(p => p.virtual === parents[0].virtual))
		&& fail([`{virtual} conflicting inherited values <${parents[0].virtual}> vs <${
			parents.find(p => p.virtual !== parents[0].virtual)?.virtual
		}> without an override`]),

		(shape.space === undefined && !parents.every(p => p.space?.[""] === parents[0].space?.[""]))
		&& fail([`{space} conflicting inherited values <${parents[0].space?.[""]}> vs <${
			parents.find(p => p.space?.[""] !== parents[0].space?.[""])?.space?.[""]
		}> without an override`])

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


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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
		() => narrowsShape(eager(target.shape), eager(source.shape)),

		// the bounds the merged member carries, which each may narrow on its own and still cross

		() => checkBounds({
			minCount: target.minCount ?? source.minCount,
			maxCount: target.maxCount ?? source.maxCount
		})
	)(target);

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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

		virtual: target.virtual ?? source.virtual,
		space: target.space ?? source.space,

		class: target.class,
		classes: target.classes,

		parents: target.parents,

		// structural: pattern — the narrower of the two, equal unless the inherited one ends in a wildcard

		pattern: target.pattern ?? source.pattern,

		...identifiers(target, source),

		// conjunctive: validators — union, a check reaching the shape along several paths stated once

		validators: target.validators !== undefined && source.validators !== undefined
			? union([target.validators, source.validators])
			: target.validators ?? source.validators,

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

	});

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
