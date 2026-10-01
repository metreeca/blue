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
 * Resource state and template validation.
 *
 * Holds a value to what a shape admits and reports everything wrong with it at once, keyed by the member at fault:
 * {@link validateResource} for a resource in its own right, {@link validateResult} for one that came back narrowed by
 * the template that asked for it, and {@link validateTemplate} for a template itself, so that a request is refused
 * before it is issued rather than after it is served.
 *
 * @module
 */

import {
	type Identifier,
	isArray,
	isBoolean,
	isIdentifier,
	isNumber,
	isObject,
	isString,
	opt as fold,
	type Optional
} from "@metreeca/core";
import { isTag, isTagRange } from "@metreeca/core/language";
import { all, array, fail, object, type Trace } from "@metreeca/core/trace";
import { isReference, type Reference, type Resource } from "@metreeca/qest/state";
import {
	decodeProbe,
	isAggregate,
	isAtomic,
	isBinding,
	isBranch,
	isSelector,
	isTemplate,
	type Probe,
	type Template
} from "@metreeca/qest/model";
import type { DictionaryShape } from "../dictionary/index.js";
import { eager, effective, type Range, type Shape } from "../value/index.js";
import { match, type Scope, validateShape } from "../value/validator.js";
import type { ReferenceShape } from "../reference/index.js";
import type { Property, ResourceShape } from "./index.js";
import { getShapeBranches } from "../union/index.js";
import { getShapeId } from "./accessors.js";


/**
 * Validates values against a resource shape.
 *
 * Reports a value that is not a resource as a `{kind}` violation and each member that breaks a constraint under its
 * own facet, keyed by the member it is stated under, so that a caller may tell which member failed and why. A resource
 * shape is closed: a value carrying a member the shape doesn't declare is rejected.
 *
 * A captive member is stated either as the link naming its target or as the resource itself, held in turn to the
 * target shape, so that a resource and the ones it holds captive travel as a single value; `depth` caps how far the
 * expansion reaches. A foreign member is written by the resources it points at, so a value stating one is rejected.
 *
 * A member ranging over a {@link dictionary!DictionaryShape | dictionary} states the language map whole, whatever
 * bounds it carries: a map wrapped in an array is rejected, as is one stated beside values of other alternatives, and
 * the bounds are held against those other values alone.
 *
 * @param values The values to validate
 * @param shape The shape the values are matched against
 * @param opts Validation options
 * @param opts.scope The {@link Scope | strictness} the shape is enforced at, defaulting to `"state"`
 * @param opts.entry The identifier the resources are expected to be named by, where they state one at all
 * @param opts.depth The nesting a captive member may be expanded to, counting each resource it descends into; `0`
 *     refuses every expansion while still admitting the identifier naming the resource
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

	return all(

		// an embedded resource naming itself is told from an expanded link only here, against a value

		() => checkId(shape),

		() => resources(values, shape, resource => all(

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
				.map(name => () => [{ [name]: ["unexpected member"] }]),

			// the checks the shape states on top of its members, each keyed by the name of the check

			...checks(resource, shape)

		)(undefined))

	)(undefined);


	/**
	 * Validates the values a member carries against its range and cardinality.
	 */
	function contents(value: unknown, member: Property): Optional<Trace> {

		const { range: { minCount, maxCount, shape: range }, foreign, captive } = member;

		// a foreign member is written by the resources it points at, not by the one exposing it

		if ( foreign ) {
			return value !== undefined ? ["unexpected foreign member"] : undefined;
		}

		const resolved = eager(range);
		const branches = getShapeBranches(resolved);

		// a member reaching a resource reads an empty record as nothing stated, as a resource stating no member at
		// all names nothing to hold; one reaching a value reads it as a value of the wrong kind

		const nesting = branches.some(branch =>
			branch.kind === "reference" || branch.kind === "resource"
		);

		// a localised value is a value set in its own right, holding its strings per tag at the arity its own shape
		// states: a member carries it whole, never in an array and never beside the other values, and the bounds
		// stated for the member count the other values alone

		const present = value === undefined || isArray(value, []) || nesting && vacant(value) ? undefined : value;

		const carried = (present === undefined ? [] : isArray(present) ? present : [present])
			.filter(element => !(nesting && vacant(element)));

		const whole = isLocalised(present, branches, scope);

		const bounds = whole ? undefined : all(
			(minCount !== undefined && carried.length < minCount)
			&& fail([`{minCount} expected at least <${minCount}> value(s)`]),

			(maxCount !== undefined && carried.length > maxCount)
			&& fail([`{maxCount} expected at most <${maxCount}> value(s)`])
		)(undefined);

		// the arity is reported first, then the values, then the cardinality

		return (whole ? undefined : arity(present, maxCount, branches, scope))
			?? elements(carried, resolved, captive)
			?? bounds;

	}

	/**
	 * Validates the elements a member carries, expanding the ones it holds captive.
	 */
	function elements(carried: readonly unknown[], range: Shape, captive: undefined | boolean): Optional<Trace> {

		const branches = getShapeBranches(range);
		const [branch] = branches;

		// captivity is stated on the member, so it reaches a target named through an alternative as well as a bare
		// one: a sole alternative reports the obstacles it found, several are told apart by the one admitting the value

		return !captive || !branches.some(alternative => alternative.kind === "reference")

			? validateShape(carried, range, { scope })

			: branches.length === 1 && branch.kind === "reference"

				? array((value: unknown) => expanded(value, branch))(carried)

				: array((value: unknown) => admitting(value, branches))(carried);

	}

	/**
	 * Validates a captive element against several alternatives, expanding the ones naming a resource.
	 */
	function admitting(value: unknown, branches: readonly Shape[]): Optional<Trace> {

		return verdict(branches.filter(alternative => alternative.kind === "reference"
			? expanded(value, alternative) === undefined
			: validateShape([value], alternative, { scope }) === undefined
		), "value");

	}

	/**
	 * Validates a captive element, stated either as a link or as the resource it points at.
	 */
	function expanded(value: unknown, range: ReferenceShape): Optional<Trace> {

		return !isObject(value) ? validateShape([value], range, { scope })
			: depth === undefined || depth > 0
				? validateResource([value], eager(range.target), { scope, depth: step(depth) })
				: ["exceeded the maximum nesting depth"];

	}

	/**
	 * Reports whether a value states nothing at all.
	 */
	function vacant(value: unknown): boolean {

		return isObject(value) && Object.keys(value).length === 0;

	}

}

/**
 * Validates retrieval templates against a shape.
 *
 * Reports each slot of a template that asks for something the shape cannot give, keyed by the member it asks under, so
 * that a caller may tell which part of a request will not be served before it is issued. A template describes what to
 * retrieve rather than what is held, so the value-domain constraints are left alone: a placeholder carries no value of
 * its own, and is held to asking for something the shape can give rather than to being a legal value of it.
 *
 * **What a slot may ask for**
 *
 * Every slot is one object, and the keys it carries say what it asks for: the atomic placeholder `{}` asks for the
 * value as it stands, a nested template for the resource behind a link, a map of language ranges for localised text
 * tag by tag, and a branch map for a polymorphic member one alternative at a time. A member that is not wanted is left
 * out of the template: a slot stated as `undefined` is refused, as is any other slot that isn't an object. Cardinality
 * is not stated by the notation, so a member admitting several values is asked for exactly as one admitting a single
 * value is, except that its slot may carry the constraints filtering, ordering and paging the collection alongside the
 * keys retrieving it. A member admitting one value has no collection to narrow and a localised member is filtered by its own tag ranges:
 * both refuse a constraint, as does a branch of a polymorphic member, which stands for one value alone, the
 * constraints narrowing a collection riding on the slot hosting the alternatives. A refused constraint is reported
 * under the key stating it and leaves what the slot asks for held to the shape all the same, so one pass reports both.
 * Where a localised branch is one alternative among others, the map of ranges is taken within a projection column
 * alone, the coalesced text being what it comes back as elsewhere.
 *
 * **What a constraint may test against**
 *
 * A membership filter tests the options it lists by equality, so an option is held to the type of the member alone and
 * need not be a legal value of it. A localised member is filtered through the text it carries: either plainly, as the
 * string or strings any tag may match, or as a map grouping the options by the tag they are to match under, a tag
 * carrying as many as the filter lists whatever arity the member admits. The two forms are never mixed within one set,
 * and a map keyed by anything but a language tag is reported under the key at fault.
 *
 * **What a projection may ask for**
 *
 * A collection may be asked for as a table rather than as resources, each column bound to a path through the shape and
 * to the transforms reducing it. A binding naming a path the shape cannot resolve is reported, as is one repeating an
 * identifier another column already binds. A binding whose path takes no step reaches the item the collection holds as
 * it stands, so a link is asked for as the identifier naming its target or expanded through a nested template, while an
 * embedded resource, naming no identifier to come back as, is refused. Where a projection groups the collection, every
 * ordering and focus key must name a grouping key or reduce to an aggregate, as nothing else ranks a group.
 *
 * A column holds one value per row, so it supplies no collection to narrow and refuses a constraint of its own; a
 * collection reached below it, through a nested template, carries its constraints as any other collection does.
 *
 * @param values The templates to validate
 * @param shape The shape the templates are matched against
 * @param opts Validation options
 * @param opts.plain Whether to refuse the transforms combining several values into one, leaving a template that
 *     retrieves rather than computes
 * @param opts.depth The nesting a template may ask for, counting each resource it descends into; `0` refuses every
 *     nested template while still admitting the identifier naming the resource
 * @param opts.limit The largest page a template may ask for; a collection asking for none is held to it, and one
 *     asking for more is refused. `0`, like omitting it, leaves the page to the caller
 *
 * @returns A trace of the violations found, or `undefined` where every template asks for what the shape can give
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where `shape` reaches itself through a cycle no deferred
 *     shape breaks, or where a union it reaches declares a shared member name inconsistently across its branches
 */
export function validateTemplate(values: readonly unknown[], shape: ResourceShape, {

	plain,
	depth,
	limit

}: {

	readonly plain?: boolean
	readonly depth?: number
	readonly limit?: number

} = {}): Optional<Trace> {

	return resources(values, shape, value => template(value, shape, depth));


	/**
	 * Validates a template against the shape of the resources it asks for.
	 */
	function template(value: unknown, shape: ResourceShape, depth: Optional<number>): Optional<Trace> {

		if ( !isObject(value) ) { return ["expected <template> value"]; }

		if ( exhausted(depth) ) { return ["exceeded maximum nesting depth"]; }

		return all(...Object.entries(value).map(([name, asked]) => () => fold(

			!isIdentifier(name) ? ["expected property identifier"]
				: !Object.hasOwn(shape.members, name) ? ["unknown property path"]
					: shape.members[name].kind === "property"
						? slot(asked, shape.members[name], depth)
						: isAtomic(asked) ? undefined : ["expected <Atomic> placeholder"], // the id/type members

			trace => [{ [name]: trace }]

		)))(undefined);

	}

	/**
	 * Validates what a slot asks for, retrieval keys and collection constraints together.
	 *
	 * A slot is one object partitioning its keys by what they are: a constraint narrows the collection the slot
	 * reaches, and every other key retrieves part of its values. Cardinality is not stated by the notation, so what
	 * refuses a constraint is the shape: a member admitting one value has no collection to narrow, and a localised
	 * member is filtered by its own tag ranges.
	 *
	 * The two partitions are faulted independently, so a slot refusing a constraint is still held to what it asks
	 * for and one pass reports both.
	 */
	function slot(value: unknown, member: Property, depth: Optional<number>): Optional<Trace> {

		if ( !isObject(value) ) { return ["expected <placeholder> value"]; }

		const branches = getShapeBranches(member.range.shape);
		const [branch] = branches;

		const localised = branches.length === 1 && branch.kind === "dictionary";
		const single = member.range.maxCount === 1 || localised;

		return single

			? unconstrained(value, localised
					? "unexpected constraint on a localised member"
					: "unexpected constraint on a single-valued member",
				contents => model(contents, member.range, depth)
			)

			: collection(value);


		/**
		 * Validates what a collection asks for, its constraints narrowing the values its other keys retrieve.
		 */
		function collection(value: Record<string, unknown>): Optional<Trace> {

			const entries = Object.entries(value);

			const constraints = entries.filter(([key]) => isSelector(key));
			const contents = Object.fromEntries(entries.filter(([key]) => !isSelector(key)));

			// element keys and constraint operators are disjoint, so the two traces merge into one

			return all(
				() => item(contents, member, depth),
				() => filters(constraints, member, depth),
				() => grouped(contents, constraints)
			)(undefined);

		}

	}

	/**
	 * Validates what a placeholder asks for, the constraints it may not state set apart from it.
	 *
	 * A placeholder standing for one value supplies no collection to narrow, so every constraint key it carries is
	 * refused, keyed by the offending key. The two partitions are faulted independently, so what the placeholder
	 * asks for is validated all the same and one pass reports both.
	 *
	 * @param value The placeholder to partition
	 * @param refused The violation reported for each constraint the placeholder may not state
	 * @param retrieval Validates what the placeholder asks for, once its constraints are set apart
	 */
	function unconstrained(
		value: unknown,
		refused: string,
		retrieval: (contents: unknown) => Optional<Trace>
	): Optional<Trace> {

		const entries = isObject(value) ? Object.entries(value) : [];

		const constraints = entries.filter(([key]) => isSelector(key));

		const contents = isObject(value)
			? Object.fromEntries(entries.filter(([key]) => !isSelector(key)))
			: value;

		return all(

			() => retrieval(contents),

			...constraints.map(([selector]) => () => [{ [selector]: [refused] }])

		)(undefined);

	}

	/**
	 * Validates a placeholder standing for the value a branch admits.
	 */
	function placeholder(value: unknown, branch: Shape, depth: Optional<number>): Optional<Trace> {

		const next = step(depth);

		switch ( branch.kind ) {

			case "reference": // a link comes back as the identifier naming its target, or as the resource itself

				return isAtomic(value)
					? validateShape([value], branch, { scope: "model" })
					: template(value, eager(branch.target), next);

			case "resource": // an embedded resource states no identifier to come back as

				return isAtomic(value)
					? ["expected <template> placeholder"]
					: template(value, branch, next);

			default:

				return validateShape([value], branch, { scope: "model" });

		}

	}

	/**
	 * Validates what a single-valued slot asks for.
	 *
	 * A localised branch is asked for either as the tags wanted or as the text content negotiation settles on. Standing
	 * as one alternative among others, it takes the tags within a projection column alone, where each branch is asked
	 * for under a column of its own and a map has nowhere to sit among the values the other branches carry.
	 */
	function model(value: unknown, range: Range, depth: Optional<number>, local: boolean = false): Optional<Trace> {

		const branches = getShapeBranches(range.shape);
		const [branch] = branches;

		return branches.length > 1

			// the atomic placeholder asks for the value as it stands, so it reaches every alternative coming back
			// as one and needs no branch of its own

			? isAtomic(value)
				? branches.some(alternative => alternative.kind !== "resource") ? undefined
					: ["{branches} no branch comes back as a value"]
				: indexed(value, branches, depth, local)

			: branch.kind === "dictionary" ? locale(value, branch, true)
				: placeholder(value, branch, depth);

	}

	/**
	 * Validates what a polymorphic slot asks for, one branch at a time under the index of the branch.
	 *
	 * A branch carries one value, so it states no constraint of its own: the ones narrowing a collection ride on the
	 * entry hosting the union, and a constraint stated on a branch is refused there.
	 */
	function indexed(
		value: unknown,
		branches: readonly Shape[],
		depth: Optional<number>,
		local: boolean
	): Optional<Trace> {

		if ( !isObject(value, (_, key) => isBranch(key)) ) { return ["expected union variant map"]; }

		return all(...Object.entries(value).map(([index, asked]) => () => fold(

			variant(asked),

			trace => [{ [index]: trace }]

		)))(undefined);


		/**
		 * Validates what one branch asks for, the constraints it may not state set apart from it.
		 */
		function variant(asked: unknown): Optional<Trace> {

			return unconstrained(asked, "unexpected constraint on a union branch", contents =>

				branches.some(branch => branch.kind === "dictionary"
					? locale(contents, branch, local) === undefined
					: placeholder(contents, branch, depth) === undefined
				) ? undefined : ["{branches} no branch admits the placeholder"]

			);

		}

	}

	/**
	 * Validates what a localised slot asks for.
	 *
	 * The text is asked for either coalesced, through the atomic placeholder, which comes back as the string content
	 * negotiation settles on, or structurally, as a map keyed by the tag ranges wanted rather than by the tags they
	 * match. Per-tag arity follows the shape, so a range asks for the value and states nothing about how many strings
	 * a matched tag carries.
	 *
	 * @param value The placeholder the slot states
	 * @param shape The localised shape the slot reaches
	 * @param structural Whether the tags may be wanted here, which they may not where the shape is one alternative
	 *     among others outside a projection column
	 */
	function locale(value: unknown, shape: DictionaryShape, structural: boolean): Optional<Trace> {

		return isAtomic(value) ? undefined
			: !structural ? ["expected <Atomic> placeholder"]
				: !isObject(value) ? ["{kind} expected <Atomic> or <Locale> placeholder"]
					: tagged(value, shape);

	}

	/**
	 * Validates the tags a localised slot wants, each asking for the value a matched tag carries.
	 */
	function tagged(value: Record<string, unknown>, {}: DictionaryShape): Optional<Trace> {

		return object(([range, asked]: readonly [string, unknown]) =>
			!isTagRange(range) ? [{ [range]: ["invalid tag range"] }]
				: isAtomic(asked) ? undefined
					: [{ [range]: ["{type} expected <Atomic> value"] }]
		)(value);

	}

	/**
	 * Validates that every ordering ranks a grouped collection by something the grouping leaves standing.
	 */
	function grouped(element: unknown, constraints: readonly (readonly [string, unknown])[]): Optional<Trace> {

		const aggregate = (probe: Probe): boolean => probe.pipe.some(isAggregate);
		const signature = (probe: Probe): string => `${probe.path.join(".")}|${probe.pipe.join(":")}`;

		const bindings = isObject(element) ? Object.keys(element).filter(isBinding).map(decodeProbe) : [];
		const selectors = constraints.map(([selector]): [string, Probe] => [selector, decodeProbe(selector)]);

		// the projection alone fixes the grouping: a combining column groups the collection, and the columns left
		// standing are then the keys it is grouped by; a combining selector reduces one group rather than forming it

		const groups = bindings.some(aggregate);
		const keys = new Set(bindings.filter(probe => !aggregate(probe)).map(signature));

		return !groups ? undefined : all(...selectors

			.filter(([, probe]) => (probe.target === "^" || probe.target === "+")
				&& !aggregate(probe)
				&& !keys.has(signature(probe))
			)

			.map(([selector]) => () => [{
				[selector]: ["expected a grouping-key or aggregate ordering/focus expression under grouping"]
			}])

		)(undefined);

	}

	/**
	 * Validates what a collection asks for one of its values as: a template, or a table of bound paths.
	 */
	function item(value: Record<string, unknown>, member: Property, depth: Optional<number>): Optional<Trace> {

		if ( exhausted(depth) ) { return ["exceeded maximum nesting depth"]; }

		const branches = getShapeBranches(member.range.shape);
		const [branch] = branches;

		if ( branches.length > 1 ) { return model(value, member.range, depth); }

		switch ( branch.kind ) {

			case "reference":
			case "resource": {

				const next = step(depth);
				const target = branch.kind === "reference" ? eager(branch.target) : branch;

				// a template descends into the resource, while a column resolves against the item as it stands, so
				// an empty path leaves a link a link, asked for as the identifier naming its target

				return isAtomic(value) ? placeholder(value, branch, depth)
					: Object.keys(value).every(isIdentifier) ? template(value, target, next)
						: projection(value, branch, next);

			}

			default:

				return placeholder(value, branch, depth);

		}

	}

	/**
	 * Validates a table of paths bound to the columns a collection is asked for.
	 *
	 * @param shape The item the columns resolve their paths against, a link left unresolved so that a path taking
	 *     no step reaches it as the identifier naming its target
	 *
	 * @remarks A column holds one value per row, so it supplies no collection to narrow: a constraint stated on the
	 *     placeholder a column asks for is refused, while a collection reached below it, through a nested template,
	 *     carries its own constraints as any other collection does.
	 */
	function projection(value: unknown, shape: Shape, depth: Optional<number>): Optional<Trace> {

		if ( !isObject(value) ) { return ["expected <projection> value"]; }

		if ( exhausted(depth) ) { return ["exceeded maximum nesting depth"]; }

		const probes = new Map<string, Probe>(Object.keys(value)
			.filter(isBinding)
			.map(binding => [binding, decodeProbe(binding)])
		);

		// the identifiers a column may not bind twice, settled once for the whole table

		const shared = new Set([...probes.values()]
			.map(probe => probe.target)
			.filter((target, index, targets) => targets.indexOf(target) !== index)
		);

		return all(...Object.entries(value).map(([binding, asked]) => () =>
			fold(column(binding, asked), trace => [{ [binding]: trace }])
		))(undefined);


		function column(binding: string, asked: unknown): Optional<Trace> {

			const probe = probes.get(binding);

			if ( probe === undefined ) { return ["expected projection binding"]; }

			if ( depth !== undefined && probe.path.length > depth ) { return ["exceeded maximum path length"]; }

			if ( plain && probe.pipe.some(isAggregate) ) { return ["disabled aggregate transforms"]; }

			if ( shared.has(probe.target) ) {
				return [`duplicate projection identifier <${probe.target}>`];
			}

			const range = effective(shape, probe);

			if ( isString(range) ) { return [range]; } // the path the shape cannot resolve

			// a column holds one value per row, so it neither asks for a collection nor narrows one; a collection
			// reached below it, through a nested template, carries its own constraints as any other does

			return isArray(asked) ? ["unexpected array in projection value"]

				: unconstrained(asked, "unexpected constraint in a projection column",
					contents => model(contents, range, depth, true)
				);

		}

	}

	/**
	 * Validates the constraints filtering, ordering and paging a collection.
	 */
	function filters(
		constraints: readonly (readonly [string, unknown])[],
		member: Property,
		depth: Optional<number>
	): Optional<Trace> {

		// a selector resolves through the values the collection holds, one step below the collection itself

		const next = step(depth);

		if ( constraints.length === 0 ) { return undefined; } // a collection stated without constraints

		if ( exhausted(next) ) { return ["exceeded maximum nesting depth"]; }

		return all(...constraints.map(([selector, asked]) => () =>
			fold(operator(selector, asked), trace => [{ [selector]: trace }])
		))(undefined);


		function operator(selector: string, asked: unknown): Optional<Trace> {

			if ( !isSelector(selector) ) { return ["expected constraint operator"]; }

			const probe = decodeProbe(selector);

			if ( next !== undefined && probe.path.length > next ) { return ["exceeded maximum path length"]; }

			if ( plain && probe.pipe.some(isAggregate) ) { return ["disabled aggregate transforms"]; }

			const range = effective(member.range.shape, probe);

			if ( isString(range) ) { return [range]; } // the path the shape cannot resolve

			const branches = getShapeBranches(range.shape);

			switch ( probe.target ) {

				case "<":
				case ">":
				case "<=":
				case ">=":

					return bound(asked, branches);

				case "~":

					return keywords(asked, branches);

				case "?":
				case "!":

					return options(asked, branches);

				case "+": // a sort focus ranks one value per resource, so it refuses a multi-valued key

					return range.maxCount === 1 ? options(asked, branches) : ["expected single-valued sort focus key"];

				case "^":

					return order(asked, range);

				case "@":

					return offset(asked);

				case "#":

					return page(asked);

				default:

					return ["expected constraint operator"];

			}

		}

	}

	/**
	 * Validates a relational bound, which singles out the branch it filters against.
	 */
	function bound(value: unknown, branches: readonly Shape[]): Optional<Trace> {

		if ( branches.length === 0 ) { return undefined; } // nothing to filter against, the bound is immaterial

		if ( branches.length > 1 ) {

			return verdict(branches.filter(branch => bound(value, [branch]) === undefined), "bound");

		}

		const [branch] = branches;

		// a localised value is filtered through the strings it carries

		return literal(value, branch, () => branch.kind === "dictionary"
			? isString(value) ? undefined : ["expected string value"]
			: [`unsupported constraint for <${branch.kind}> value`]
		);

	}

	/**
	 * Validates a text search, which filters every textual branch at once rather than singling one out.
	 */
	function keywords(value: unknown, branches: readonly Shape[]): Optional<Trace> {

		if ( branches.length === 0 ) { return undefined; } // nothing to search, the string is immaterial

		if ( branches.length > 1 ) {

			return branches.some(branch => keywords(value, [branch]) === undefined) ? undefined
				: ["{branches} no branch admits the search"];

		}

		const [branch] = branches;

		switch ( branch.kind ) {

			case "string":
			case "dictionary":

				return isString(value) ? undefined : ["expected string value"];

			default:

				return [`unsupported constraint for <${branch.kind}> value`];

		}

	}

	/**
	 * Validates the options a membership filter tests against.
	 */
	function options(value: unknown, branches: readonly Shape[]): Optional<Trace> {

		if ( branches.length === 0 ) { return undefined; } // nothing to match, the options are immaterial

		if ( branches.length > 1 ) {

			return isArray(value) ? array<unknown>(single)(value) : single(value);

		}

		const [branch] = branches;

		if ( branch.kind === "dictionary" ) {

			// a tag map, or a plain string standing for the strings the map carries, stated singly or as a set;
			// the two forms are never mixed within one set

			return value === null || isString(value) || isArray(value, isString) ? undefined
				: isObject(value) ? tags(value)
					: isArray(value) && value.some(value => isObject(value)) && value.some(value => isString(value))
						? ["mixed plain and tagged options"]
						: [`unsupported constraint for <${branch.kind}> value`];

		}

		return isArray(value)
			? array((value: unknown) => option(value, branch))(value)
			: option(value, branch);


		/**
		 * Validates a set of options stated as a tag map, grouped by the tag they are to match under.
		 *
		 * The map states the options a filter tests against rather than a value a resource holds, so a tag carries as
		 * many as the filter lists whatever the member admits, and the strings, being matched for equality, need not
		 * be legal values of the shape.
		 */
		function tags(value: Readonly<Record<string, unknown>>): Optional<Trace> {

			return object(([tag, asked]: readonly [string, unknown]) =>
				!isTag(tag) ? [{ [tag]: ["invalid tag"] }]
					: isString(asked) || isArray(asked, isString) ? undefined
						: [{ [tag]: ["expected string or string array option"] }]
			)(value);

		}

		/**
		 * Reports whether an option singles out one branch; an option stated as nothing at all is typeless and exempt.
		 */
		function single(value: unknown): Optional<Trace> {

			if ( value === null ) { return undefined; }

			return verdict(branches.filter(branch => options(value, [branch]) === undefined), "option");

		}

	}

	/**
	 * Validates one option against the branch it is matched against.
	 */
	function option(value: unknown, branch: Shape): Optional<Trace> {

		if ( value === null ) { return undefined; } // an option stated as nothing at all matches any value type

		return literal(value, branch, () => isReference(value) ? undefined : ["expected <reference> value"]);

	}

	/**
	 * Validates the ordering a collection is ranked by.
	 */
	function order(value: unknown, range: Range): Optional<Trace> {

		// an order is a precedence rank counted from one, which `asc` and `desc` abbreviate, so a fraction ranks
		// nothing; ranking requires one value per resource, a multi-valued key leaving no order to rank by

		return value !== "asc" && value !== "desc" && !Number.isInteger(value)
			? ["expected <asc>, <desc>, or integer value"]
			: range.maxCount !== 1 ? ["expected single-valued sort key"]
				: undefined;

	}

	/**
	 * Validates the point a page starts at.
	 */
	function offset(value: unknown): Optional<Trace> {

		return !isNumber(value) ? ["expected number value"]
			: !Number.isInteger(value) || value < 0 ? ["expected non-negative integer"]
				: undefined;

	}

	/**
	 * Validates the size a page is asked for at.
	 *
	 * A page of `0` asks for the whole set, so it is held to the limit like any other size; a limit of `0` caps
	 * nothing, leaving the page to the caller as it does for the default paging the same option drives.
	 */
	function page(value: unknown): Optional<Trace> {

		return !isNumber(value) ? ["expected number value"]
			: !Number.isInteger(value) || value < 0 ? ["expected non-negative integer"]
				: limit !== undefined && limit > 0 && (value === 0 || value > limit)
					? [`exceeded maximum result set limit <${limit}>`]
					: undefined;

	}

}

/**
 * Validates retrieved resources against a shape, narrowed by the template that requested them.
 *
 * Reports each member the template asked for and the resource states wrongly, keyed by the member it is stated under,
 * so that a caller may tell which part of what it asked for came back malformed. Only the members the template names
 * are held to the shape: one it left out is neither required nor checked, so a partial retrieval passes on its own
 * terms. The surface is closed the other way too: a member the resource states but the template didn't ask for is
 * rejected, as the caller has no place to put it.
 *
 * A member reaching a resource comes back as the resource itself where a nested template asked for it, and as the
 * identifier naming it where the atomic placeholder did; either way it is held to what was asked. A localised member
 * comes back in the form its template asked for: the map it named tag ranges under, whole and never in an array, or,
 * where the atomic placeholder asked for it, the text content negotiation settled on, at the arity the shape states
 * per tag and held to the lengths it bounds rather than to the counts of the other alternatives.
 *
 * @param values The retrieved resources to validate
 * @param opts Validation options
 * @param opts.shape The shape the resources are matched against
 * @param opts.model The template that requested them, narrowing what is checked
 * @param opts.entry The identifier the resources are expected to be named by, where one is expected
 *
 * @returns A trace of the violations found, or `undefined` where every resource matches what was asked for
 */
export function validateResult(values: readonly unknown[], {

	shape,
	model,

	entry

}: {

	readonly shape: ResourceShape
	readonly model: Template

	readonly entry?: Reference

}): Optional<Trace> {

	return resources(values, shape, resource => all(

		// every member asked for; a key present in the template always asks for something

		...Object.keys(model)
			.map(name => () => fold(
				requested(resource[name], name, model[name]),
				trace => [{ [name]: trace }]
			)),

		// the caller has nowhere to put a member it didn't ask for

		...Object.keys(resource)
			.filter(name => !Object.hasOwn(model, name))
			.map(name => () => [{ [name]: ["unexpected member"] }]),

		// the checks the shape states on top of its members, each keyed by the name of the check

		...checks(resource, shape)

	)(undefined));


	/**
	 * Validates the value a requested member came back with.
	 */
	function requested(value: unknown, name: Identifier, requested: unknown): Optional<Trace> {

		const member = shape.members[name];

		return member === undefined ? ["undefined member"]
			: member.kind === "id" ? identifier(value, shape, entry)
				: member.kind === "type" ? classifier(value, shape)
					: contents(value, member, requested);

	}

	/**
	 * Validates the values a member came back with against its range and the template narrowing it.
	 */
	function contents(value: unknown, member: Property, requested: unknown): Optional<Trace> {

		const { range: { minCount, maxCount, shape: range } } = member;

		const branches = getShapeBranches(range);

		const present = value === undefined || isArray(value, []) ? undefined : value;

		if ( present === undefined ) {

			return minCount !== undefined && minCount >= 1
				? [`{minCount} expected at least <${minCount}> value(s)`]
				: undefined;

		}

		// a localised member asked for by the atomic placeholder comes back as the text negotiation settled on rather
		// than as the map, at the arity the shape states per tag

		const negotiated = branches
			.flatMap(branch => branch.kind === "dictionary" ? [branch] : [])
			.find(branch => plain(requested, branch));

		if ( negotiated !== undefined ) {
			return text(present, negotiated);
		}

		// a localised member comes back as it is carried: one map, whole and never in an array, whatever bounds it
		// states of the other values, and the bounds count those other values alone

		const whole = isLocalised(present, branches, "state");

		const carried = isArray(present) ? present : [present];

		// a map is matched against the range as it stands, the template narrowing the other values alone

		return (whole ? undefined : arity(present, maxCount, branches, "state"))
			?? (whole ? validateShape(carried, eager(range)) : elements(carried, branches, requested))
			?? (whole ? undefined : counts(carried.length, member));

	}

	/**
	 * Reports whether a placeholder asked a localised shape for the text negotiation settles on.
	 *
	 * The atomic placeholder stands for that text, which is how a localised member is asked for where the tags are not
	 * wanted; the tags are stated as a map of language ranges instead. The arity the text comes back at follows the
	 * shape rather than the placeholder.
	 */
	function plain(requested: unknown, {}: DictionaryShape): boolean {

		return isAtomic(requested);

	}

	/**
	 * Validates the text a localised member came back with, where the atomic placeholder asked for it.
	 *
	 * Holds the text to the lengths the shape bounds; the language constraint is keyed on the tags it was negotiated
	 * from, which it comes back without. Where a tag stacks several strings the text comes back as the array of them,
	 * whose length is what that tag carried rather than what the member's bounds count, the map it stands for being
	 * held apart from those values too.
	 */
	function text(value: unknown, shape: DictionaryShape): Optional<Trace> {

		const { minLength, maxLength } = shape;

		const bounded = (content: string) => all(
			(minLength !== undefined && content.length < minLength)
			&& fail([`{minLength} expected string length >= <${minLength}>`]),

			(maxLength !== undefined && content.length > maxLength)
			&& fail([`{maxLength} expected string length <= <${maxLength}>`])
		)(undefined);

		return shape.uniqueLang === true

			? isString(value) ? bounded(value) : ["{kind} expected the negotiated text"]

			: !isArray<string>(value, isString) ? ["{kind} expected an array of the negotiated text"]
				: array(bounded)(value);

	}

	/**
	 * Validates the elements a member came back with against the branches its range admits.
	 */
	function elements(carried: readonly unknown[], branches: readonly Shape[], requested: unknown): Optional<Trace> {

		const [only] = branches;

		return branches.length !== 1

			? array((value: unknown) => branch(value, branches, requested))(carried)

			// a link comes back as the identifier naming the resource, or as the resource itself

			: only.kind === "reference"

				? array((value: unknown) => isString(value)
					? isReference(value) ? undefined : ["expected an absolute IRI"]
					: isObject(value) ? validateResult([value], {
						shape: eager(only.target),
						model: nested(requested)
					}) : ["expected an IRI or the resource itself"]
				)(carried)

				: only.kind === "resource"

					? array((value: unknown) => isObject(value)
						? validateResult([value], { shape: only, model: nested(requested) })
						: ["expected a nested resource"]
					)(carried)

					: validateShape(carried, only);

	}

	/**
	 * Validates a value against the branches of a polymorphic member, which it must single out one of.
	 */
	function branch(value: unknown, branches: readonly Shape[], requested: unknown): Optional<Trace> {

		const head = isArray(requested) && requested.length > 0 ? requested[0] : requested;
		const fields: Record<string, unknown> = isObject(head) ? head : {};

		const keys = Object.keys(fields);
		const indexed = keys.length > 0 && keys.some(key => !isIdentifier(key));

		if ( indexed ) {

			const malformed = keys.filter(key => !isBranch(key));

			if ( malformed.length > 0 ) {
				return all(...malformed.map(key => () => [{ [key]: ["expected a branch key"] }]))(undefined);
			}

			return verdict(branches.filter(admits => keys.some(key => fits(value, admits, fields[key]))), "value");

		}

		return verdict(branches.filter(admits => fits(value, admits, requested)), "value");

	}

	/**
	 * Reports whether a branch admits a value under the template narrowing it.
	 *
	 * The verdict alone is read, as it feeds the count a value is singled out by, so the trace is immaterial.
	 */
	function fits(value: unknown, admits: Shape, requested: unknown): boolean {

		switch ( admits.kind ) {

			case "resource": // a resource is reached only through a nested template

				return isObject(requested) && elements([value], [admits], requested) === undefined;

			case "reference": // a link comes back as an identifier or as the resource itself

				return !isObject(value)
					? validateShape([value], admits) === undefined
					: elements([value], [admits], requested) === undefined;

			default: // the atomic placeholder tells no literal branch from another, so the value alone singles one out

				return isAtomic(requested)
					&& validateShape([value], admits) === undefined;

		}

	}

	/**
	 * Reports the cardinality bounds the values a member came back with break.
	 */
	function counts(count: number, { range: { minCount, maxCount } }: Property): Optional<Trace> {

		return all(
			(minCount !== undefined && count < minCount)
			&& fail([`{minCount} expected at least <${minCount}> value(s)`]),

			(maxCount !== undefined && count > maxCount)
			&& fail([`{maxCount} expected at most <${maxCount}> value(s)`])
		)(undefined);

	}

	/**
	 * Resolves the template a nested resource was requested through.
	 *
	 * A collection carries its constraints alongside the keys retrieving its values, so the per-item template is the
	 * node less the constraints; the atomic placeholder states no nested template at all, so every member the
	 * resource comes back with is unasked for.
	 */
	function nested(requested: unknown): Template {

		const element = isObject(requested)
			? Object.fromEntries(Object.entries(requested).filter(([key]) => !isSelector(key)))
			: requested;

		return isTemplate(element) ? element : {};

	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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
function checkId(shape: ResourceShape): Optional<Trace> {

	return all(...Object.entries(shape.members)
		.flatMap(([name, member]) => member.kind === "property" ? getShapeBranches(member.range.shape)
			.filter(branch => branch.kind === "resource" && getShapeId(branch) !== undefined)
			.map(() => fail([`{id} unexpected identifier in the resource embedded under <${name}>`]))
			: []
		)
	)(undefined);

}

/**
 * Holds each value to a check of its own, keyed by the resource it found fault with.
 *
 * @param values The values to validate
 * @param shape The shape the values are keyed against
 * @param check The check each resource is held to
 *
 * @returns A trace of the violations found, keyed by the resource stating each
 */
function resources(
	values: readonly unknown[],
	shape: ResourceShape,
	check: (resource: Record<string, unknown>) => Optional<Trace>
): Optional<Trace> {

	const matching = values.filter(value => isObject(value));
	const mistyped = values.length-matching.length;

	return all(

		(mistyped > 0)
		&& fail([`{kind} expected <resource> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`]),

		...matching.map((resource, index) => () => fold(
			check(resource),
			trace => [{ [key(resource, shape, index)]: trace }]
		))

	)(undefined);

}

/**
 * Reports whether a value, bound or option singles out exactly one of the branches it was matched against.
 */
function verdict(matched: readonly Shape[], subject: string): Optional<Trace> {

	return matched.length === 0 ? [`{branches} no branch admits the ${subject}`]
		: matched.length > 1 ? [`{branches} several branches admit the ${subject}`]
			: undefined;

}

/**
 * Holds the values a member carries to the form its arity calls for: a single value where it admits one, an array
 * where it admits several, and no localised map stated beside values of other alternatives. Reached only where the
 * member does not carry the map whole, which the caller settles beforehand.
 */
function arity(
	present: unknown,
	maxCount: Optional<number>,
	branches: readonly Shape[],
	scope: Scope
): Optional<Trace> {

	const scalar = maxCount === 1;

	return isArray(present) && present.some(element => isLocalised(element, branches, scope))
		? ["{kind} expected a single localised value"]
		: present !== undefined && scalar === isArray(present)
			? [scalar ? "{kind} expected a single value" : "{kind} expected an array of values"]
			: undefined;

}

/**
 * Holds a value to the literal branch it is matched against, deferring any other kind to the caller.
 */
function literal(value: unknown, branch: Shape, otherwise: () => Optional<Trace>): Optional<Trace> {

	switch ( branch.kind ) {

		case "boolean":

			return isBoolean(value) ? undefined : [`expected <${branch.kind}> value`];

		case "number":

			return isNumber(value) ? undefined : [`expected <${branch.kind}> value`];

		case "string":

			return isString(value) ? undefined : [`expected <${branch.kind}> value`];

		default:

			return otherwise();

	}

}

/**
 * Holds the value a marker states to the single absolute IRI it must be.
 */
function marked(value: unknown): Optional<Trace> {

	return isArray(value) ? ["{kind} expected a single value"]
		: !isReference(value) ? ["{kind} expected an absolute IRI"]
			: undefined;

}

/**
 * Spends one step of the nesting a template or a captive member may be expanded to.
 */
function step(depth: Optional<number>): Optional<number> {

	return depth === undefined ? undefined : depth-1;

}

/**
 * Reports whether the nesting budget is spent.
 */
function exhausted(depth: Optional<number>): boolean {

	return depth !== undefined && depth < 0;

}

/**
 * Reports whether a value is the whole language map a localised member carries.
 *
 * A localised value is a value set in its own right, holding its strings per tag at the arity its own shape states, so
 * a member carries it whole rather than among the values its bounds count: the map stands apart from the cardinality,
 * and an array never holds one.
 *
 * @param value The value to test
 * @param branches The alternatives the member ranges over
 * @param scope The strictness the dictionary alternatives are enforced at
 *
 * @returns `true` where `value` is a language map one of `branches` admits
 */
function isLocalised(value: unknown, branches: readonly Shape[], scope: Scope): boolean {

	return !isArray(value) && branches.some(branch =>
		branch.kind === "dictionary" && validateShape([value], branch, { scope }) === undefined
	);

}

/**
 * Validates the identifier a resource states against the constraints its shape puts on identifiers.
 */
function identifier(value: unknown, shape: ResourceShape, entry: undefined | Reference): Optional<Trace> {

	const { pattern, in: allowed, hasValue: required } = shape;

	const iri = isReference(value) ? value : undefined;

	return value === undefined ? undefined : all(

		() => marked(value),

		(entry !== undefined && iri !== undefined && iri !== entry)
		&& fail([`{entry} mismatched entry <${entry}>`]),

		(pattern !== undefined && !(iri !== undefined && match(iri, pattern)))
		&& fail([`{pattern} expected an IRI matching pattern <${pattern}>`]),

		(allowed !== undefined && !(iri !== undefined && allowed.includes(iri)))
		&& fail([`{in} expected values in [${allowed.join(", ")}]`]),

		(required !== undefined && !(iri !== undefined && required.every(v => v === iri)))
		&& fail([`{hasValue} expected values to include [${required.join(", ")}]`])
	)(undefined);

}

/**
 * Validates the class a resource states against the one its shape declares.
 */
function classifier(value: unknown, shape: ResourceShape): Optional<Trace> {

	const { class: declared } = shape;

	const iri = isReference(value) ? value : undefined;

	return value === undefined ? undefined : all(

		() => marked(value),

		// a class value states the class the shape declares, so a shape declaring none admits no value

		(iri !== undefined && iri !== declared)
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

/**
 * Runs the checks a shape states on top of its members, each keyed by the name of the check.
 *
 * Every check runs, so a resource is told everything that is wrong with it at once; a check states its own name, and
 * one stating none is keyed by the position it was declared at.
 */
function checks(value: Record<string, unknown>, shape: ResourceShape): readonly (() => Optional<Trace>)[] {

	return (shape.validators ?? []).map((validator, index) => () => fold(

		// the check owns whatever it reads, the members having been held to the shape already

		validator(value as Resource), // ;(cast) a resource confirmed by isObject, checked field by field above

		trace => [{ [`{${validator.name || `validator[${index}]`}}`]: trace }]
	));

}
