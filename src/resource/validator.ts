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
import { isTagRange } from "@metreeca/core/language";
import { isIRI } from "@metreeca/core/resource";
import { all, array, fail, object, type Trace } from "@metreeca/core/trace";
import { isReference, type Reference, type Resource } from "@metreeca/qest/resource";
import {
	type Binding,
	decodeProbe,
	isAggregate,
	isBinding,
	isBranch,
	isQuery,
	isSelector,
	isTemplate,
	isVacuous,
	type Probe,
	type Template
} from "@metreeca/qest/template";
import type { DictionaryShape } from "../dictionary/index.js";
import { eager, effective } from "../value/accessors.js";
import type { Scope } from "../value/validator.js";
import { validateShape } from "../value/validator.js";
import type { Range, Shape } from "../value/index.js";
import type { ReferenceShape } from "../reference/index.js";
import type { Property, ResourceShape } from "./index.js";
import { getShapeBranches } from "../union/accessors.js";
import { checkId } from "./assembler.js";
import { getShapeId } from "./accessors.js";
import { match } from "../value/validator.js";


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
					.map(name => () => [{ [name]: ["unexpected member"] }]),

				// the checks the shape states on top of its members, each keyed by the name of the check

				...checks(resource, shape)

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

		const resolved = eager(range);

		// a member reaching a resource reads an empty record as nothing stated, as a resource stating no member at
		// all names nothing to hold; one reaching a value reads it as a value of the wrong kind

		const nesting = getShapeBranches(resolved).some(branch =>
			branch.kind === "reference" || branch.kind === "resource"
		);

		const present = value === undefined || isArray(value, []) || nesting && vacant(value) ? undefined : value;

		const carried = (present === undefined ? [] : isArray(present) ? present : [present])
			.filter(element => !(nesting && vacant(element)));

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
 * retrieve rather than what is held, so the value-domain constraints are left alone: a placeholder stands for a value
 * and need not be a legal one.
 *
 * **What a slot may ask for**
 *
 * A member admitting a single value is asked for as a placeholder: a literal standing for its type, an identifier
 * standing for a link, or a nested template standing for the resource behind it. A member admitting several is asked
 * for as a collection: the template for one of them, optionally followed by the selection filtering, ordering and
 * paging the set. A polymorphic member is asked for one branch at a time, under the index of the branch. A localised
 * member is asked for as a map of the tags wanted, or as the single value content negotiation settles on.
 *
 * **What a projection may ask for**
 *
 * A collection may be asked for as a table rather than as resources, each column bound to a path through the shape and
 * to the transforms reducing it. A binding naming a path the shape cannot resolve is reported, as is one repeating an
 * identifier another column already binds. Where a projection groups the collection, every ordering and focus key must
 * name a grouping key or reduce to an aggregate, as nothing else ranks a group.
 *
 * @param values The templates to validate
 * @param shape The shape the templates are matched against
 * @param opts Validation options
 * @param opts.plain Whether to refuse the transforms combining several values into one, leaving a template that
 *     retrieves rather than computes
 * @param opts.depth The nesting a template may ask for, counting each resource it descends into; `0` refuses every
 *     nested template while still admitting the identifier naming the resource
 * @param opts.limit The largest page a template may ask for
 *
 * @returns A trace of the violations found, or `undefined` where every template asks for what the shape can give
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where `shape` reaches itself through a cycle no deferred
 *     shape breaks
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

	const matching = values.filter(value => isObject(value));
	const mistyped = values.length-matching.length;

	return all(

		(mistyped > 0)
		&& fail([`{kind} expected <resource> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`]),

		...matching.map((value, index) => () => fold(
			template(value, shape, depth),
			trace => [{ [key(value, shape, index)]: trace }]
		))

	)(undefined);


	/**
	 * Validates a template against the shape of the resources it asks for.
	 */
	function template(value: unknown, shape: ResourceShape, depth: Optional<number>): Optional<Trace> {

		if ( !isObject(value) ) { return ["expected <template> value"]; }

		if ( depth !== undefined && depth < 0 ) { return ["exceeded maximum nesting depth"]; }

		return all(...Object.entries(value).map(([name, asked]) => () => fold(

			!isIdentifier(name) ? ["expected property identifier"]
				: asked === undefined ? undefined
					: !Object.hasOwn(shape.members, name) ? ["unknown property path"]
						: shape.members[name].kind === "property"
							? slot(asked, shape.members[name], depth)
							: isIRI(asked) ? undefined : ["expected <IRI> value"], // the id/type members

			trace => [{ [name]: trace }]

		)))(undefined);

	}

	/**
	 * Validates what a slot asks for, as a single value or as a collection.
	 */
	function slot(value: unknown, member: Property, depth: Optional<number>): Optional<Trace> {

		const branches = getShapeBranches(member.shape);
		const [branch] = branches;

		// a localised member is one structured value however many maps it admits, so it is asked for as a
		// placeholder and never as a collection

		return member.maxCount === 1 || branches.length === 1 && branch.kind === "dictionary"
			? model(value, member, depth)
			: collection(value, member, depth);

	}

	/**
	 * Validates a placeholder standing for the value a branch admits.
	 */
	function placeholder(value: unknown, branch: Shape, depth: Optional<number>): Optional<Trace> {

		const next = depth === undefined ? depth : depth-1;

		switch ( branch.kind ) {

			case "reference":

				return isObject(value)
					? template(value, eager(branch.target), next)
					: validateShape([value], branch, { scope: "model" });

			case "resource":

				return template(value, branch, next);

			default:

				return validateShape([value], branch, { scope: "model" });

		}

	}

	/**
	 * Validates what a single-valued slot asks for.
	 *
	 * A localised branch is asked for as a tag map, which a projection column alone may reduce to the single value
	 * content negotiation settles on.
	 */
	function model(value: unknown, range: Range, depth: Optional<number>, local: boolean = false): Optional<Trace> {

		const branches = getShapeBranches(range.shape);
		const [branch] = branches;

		return branches.length > 1 ? indexed(value, branches, depth, local)
			: branch.kind === "dictionary" ? locale(value, branch, local)
				: placeholder(value, branch, depth);

	}

	/**
	 * Validates what a polymorphic slot asks for, one branch at a time under the index of the branch.
	 */
	function indexed(
		value: unknown,
		branches: readonly Shape[],
		depth: Optional<number>,
		local: boolean
	): Optional<Trace> {

		if ( !isObject(value, (_, key) => isBranch(key)) ) { return ["expected union variant map"]; }

		return all(...Object.entries(value).map(([index, asked]) => () => fold(

			branches.some(branch => branch.kind === "dictionary"
				? local && locale(asked, branch, local) === undefined
				: placeholder(asked, branch, depth) === undefined
			) ? undefined : ["{branches} no branch admits the placeholder"],

			trace => [{ [index]: trace }]

		)))(undefined);

	}

	/**
	 * Validates what a localised slot asks for.
	 *
	 * The tags wanted are stated as the keys of a map, as language ranges rather than as the tags they match, each
	 * paired with the placeholder fixing how many strings a matched tag carries. A projection column reduces the map
	 * to that placeholder alone, standing for the single value content negotiation settles on.
	 */
	function locale(value: unknown, shape: DictionaryShape, local: boolean): Optional<Trace> {

		const stacked = shape.uniqueLang !== true;

		if ( local && (stacked ? isArray(value, [isString]) : isString(value)) ) { return undefined; }

		if ( !isObject(value) ) { return ["expected <dictionary> value"]; }

		return object(([range, asked]: readonly [string, unknown]) =>
			!isTagRange(range) ? [{ [range]: ["invalid tag range"] }]
				: stacked
					? isArray(asked, [isString]) ? undefined : [{ [range]: ["expected singleton string tuple"] }]
					: isString(asked) ? undefined : [{ [range]: ["expected string value"] }]
		)(value);

	}

	/**
	 * Validates what a collection slot asks for: the template for one value, and the selection over the set.
	 */
	function collection(value: unknown, member: Property, depth: Optional<number>): Optional<Trace> {

		if ( !isArray(value) || value.length < 1 || value.length > 2 ) {
			return ["expected collection tuple <[element, selection?]>"];
		}

		const [asked, filtering] = value;

		const element = item(asked, member, depth);
		const selection = filters(filtering, member, depth);

		// the grouped-ordering cross-check reads both slots, so it runs only once each stands on its own, reporting
		// every offending sort key under the selector stating it

		const grouping = filtering !== undefined && element === undefined && selection === undefined
			? grouped(asked, filtering)
			: undefined;

		// element keys and selection operators are disjoint, so the slot traces merge into one: a keyed trace
		// spreads its own keys and an atomic one is filed under the position it was stated at

		return all(
			() => positional(element, "0"),
			() => positional(selection, "1"),
			() => grouping
		)(undefined);


		function positional(trace: Optional<Trace>, index: string): Optional<Trace> {
			return trace === undefined ? undefined
				: trace.every(item => isString(item)) ? [{ [index]: trace }]
					: trace;
		}

	}

	/**
	 * Validates that every ordering ranks a grouped collection by something the grouping leaves standing.
	 */
	function grouped(element: unknown, selection: unknown): Optional<Trace> {

		if ( !isObject(selection) ) { return undefined; }

		const aggregate = (probe: Probe): boolean => probe.pipe.some(isAggregate);
		const signature = (probe: Probe): string => `${probe.path.join(".")}|${probe.pipe.join(":")}`;

		const bindings = isObject(element) ? Object.keys(element).filter(isBinding).map(decodeProbe) : [];
		const selectors = Object.keys(selection).map((selector): [string, Probe] => [selector, decodeProbe(selector)]);

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
	function item(value: unknown, member: Property, depth: Optional<number>): Optional<Trace> {

		if ( depth !== undefined && depth < 0 ) { return ["exceeded maximum nesting depth"]; }

		const branches = getShapeBranches(member.shape);
		const [branch] = branches;

		if ( branches.length > 1 ) { return indexed(value, branches, depth, false); }

		switch ( branch.kind ) {

			case "dictionary":

				return ["unexpected <dictionary> element"];

			case "reference":
			case "resource": {

				const next = depth === undefined ? depth : depth-1;
				const target = branch.kind === "reference" ? eager(branch.target) : branch;

				return !isObject(value) ? placeholder(value, branch, depth)
					: Object.keys(value).every(isIdentifier) ? template(value, target, next)
						: projection(value, target, next);

			}

			default:

				return placeholder(value, branch, depth);

		}

	}

	/**
	 * Validates a table of paths bound to the columns a collection is asked for.
	 */
	function projection(value: unknown, shape: ResourceShape, depth: Optional<number>): Optional<Trace> {

		if ( !isObject(value) ) { return ["expected <projection> value"]; }

		if ( depth !== undefined && depth < 0 ) { return ["exceeded maximum nesting depth"]; }

		const probes = new Map<Binding, Probe>(Object.keys(value)
			.filter(isBinding)
			.map(binding => [binding, decodeProbe(binding)])
		);

		return all(...Object.entries(value).map(([binding, asked]) => () =>
			fold(column(binding, asked), trace => [{ [binding]: trace }])
		))(undefined);


		function column(binding: string, asked: unknown): Optional<Trace> {

			const probe = isBinding(binding) ? probes.get(binding) : undefined;

			if ( probe === undefined ) { return ["expected projection binding"]; }

			if ( depth !== undefined && probe.path.length > depth ) { return ["exceeded maximum path length"]; }

			if ( plain && probe.pipe.some(isAggregate) ) { return ["disabled aggregate transforms"]; }

			if ( [...probes.values()].filter(other => other.target === probe.target).length > 1 ) {
				return [`duplicate projection identifier <${probe.target}>`];
			}

			if ( asked === undefined ) { return undefined; }

			const range = effective(shape, probe);

			if ( isString(range) ) { return [range]; } // the path the shape cannot resolve

			const branches = getShapeBranches(range.shape);

			// the placeholder a localised column reduces to is the one array a column admits; any other array
			// asks for a collection, which a column is not

			const localised = branches.length === 1
				&& branches[0].kind === "dictionary"
				&& branches[0].uniqueLang !== true;

			return isArray(asked) && !localised ? ["unexpected array in projection value"]
				: model(asked, range, depth, true);

		}

	}

	/**
	 * Validates the selection filtering, ordering and paging a collection.
	 */
	function filters(value: unknown, member: Property, depth: Optional<number>): Optional<Trace> {

		// a selector resolves through the values the collection holds, one step below the collection itself

		const next = depth === undefined ? depth : depth-1;

		if ( value === undefined ) { return undefined; } // a collection stated without a selection

		if ( !isObject(value) ) { return ["expected selection object"]; }

		if ( next !== undefined && next < 0 ) { return ["exceeded maximum nesting depth"]; }

		return all(...Object.entries(value).map(([selector, asked]) => () =>
			fold(operator(selector, asked), trace => [{ [selector]: trace }])
		))(undefined);


		function operator(selector: string, asked: unknown): Optional<Trace> {

			if ( !isSelector(selector) ) { return ["expected selection operator"]; }

			const probe = decodeProbe(selector);

			if ( next !== undefined && probe.path.length > next ) { return ["exceeded maximum path length"]; }

			if ( plain && probe.pipe.some(isAggregate) ) { return ["disabled aggregate transforms"]; }

			const range = effective(member.shape, probe);

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

					return ["expected selection operator"];

			}

		}

	}

	/**
	 * Validates a relational bound, which singles out the branch it filters against.
	 */
	function bound(value: unknown, branches: readonly Shape[]): Optional<Trace> {

		if ( branches.length === 0 ) { return undefined; } // nothing to filter against, the bound is immaterial

		if ( branches.length > 1 ) {

			const matched = branches.filter(branch => bound(value, [branch]) === undefined);

			return matched.length === 0 ? ["{branches} no branch admits the bound"]
				: matched.length > 1 ? ["{branches} several branches admit the bound"]
					: undefined;

		}

		const [branch] = branches;

		switch ( branch.kind ) {

			case "boolean":

				return isBoolean(value) ? undefined : [`expected <${branch.kind}> value`];

			case "number":

				return isNumber(value) ? undefined : [`expected <${branch.kind}> value`];

			case "string":

				return isString(value) ? undefined : [`expected <${branch.kind}> value`];

			case "dictionary": // a localised value is filtered through the strings it carries

				return isString(value) ? undefined : ["expected string value"];

			default:

				return [`unsupported constraint for <${branch.kind}> value`];

		}

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

			return isArray(value) ? array((value: unknown) => single(value))(value) : single(value);

		}

		const [branch] = branches;

		if ( branch.kind === "dictionary" ) {

			// a tag map, or a plain string standing for the strings the map carries, stated singly or as a set;
			// the two forms are never mixed within one set

			return value === null || isString(value) || isArray(value, isString) ? undefined
				: isObject(value) ? validateShape([value], branch)
					: isArray(value) && value.some(value => isObject(value)) && value.some(value => isString(value))
						? ["mixed plain and tagged options"]
						: [`unsupported constraint for <${branch.kind}> value`];

		}

		return isArray(value)
			? array((value: unknown) => option(value, branch))(value)
			: option(value, branch);


		/**
		 * Reports whether an option singles out one branch; an option stated as nothing at all is typeless and exempt.
		 */
		function single(value: unknown): Optional<Trace> {

			if ( value === null ) { return undefined; }

			const matched = branches.filter(branch => options(value, [branch]) === undefined);

			return matched.length === 0 ? ["{branches} no branch admits the option"]
				: matched.length > 1 ? ["{branches} several branches admit the option"]
					: undefined;

		}

	}

	/**
	 * Validates one option against the branch it is matched against.
	 */
	function option(value: unknown, branch: Shape): Optional<Trace> {

		if ( value === null ) { return undefined; } // an option stated as nothing at all matches any value type

		switch ( branch.kind ) {

			case "boolean":

				return isBoolean(value) ? undefined : [`expected <${branch.kind}> value`];

			case "number":

				return isNumber(value) ? undefined : [`expected <${branch.kind}> value`];

			case "string":

				return isString(value) ? undefined : [`expected <${branch.kind}> value`];

			default:

				return isReference(value) ? undefined : ["expected <reference> value"];

		}

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
	 */
	function page(value: unknown): Optional<Trace> {

		return !isNumber(value) ? ["expected number value"]
			: !Number.isInteger(value) || value < 0 ? ["expected non-negative integer"]
				: limit !== undefined && (value === 0 || value > limit)
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
 * A member reaching a resource comes back either as the identifier naming it or as the resource itself, and is held
 * to whatever the nested template asked for; a localised member comes back in the form its template requested, as the
 * content negotiation settled on, as the tags it named, or as the whole map.
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

	const matching = values.filter(value => isObject(value));
	const mistyped = values.length-matching.length;

	return all(

		(mistyped > 0)
		&& fail([`{kind} expected <resource> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`]),

		...matching.map((resource, index) => () => fold(
			all(

				// every member asked for; a slot left empty states no expectation and is passed over

				...Object.keys(model)
					.filter(name => !isVacuous(model[name]))
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

			)(undefined),

			trace => [{ [key(resource, shape, index)]: trace }]
		))
	)(undefined);


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

		const { minCount, maxCount, shape: range } = member;

		const branches = getShapeBranches(range);

		const present = value === undefined || isArray(value, []) ? undefined : value;

		if ( present === undefined ) {

			return minCount !== undefined && minCount >= 1
				? [`{minCount} expected at least <${minCount}> value(s)`]
				: undefined;

		}

		const scalar = maxCount === 1;

		if ( scalar === isArray(present) ) {
			return [scalar ? "{kind} expected a single value" : "{kind} expected an array of values"];
		}

		const carried = isArray(present) ? present : [present];

		return elements(carried, branches, requested) ?? counts(carried.length, member);

	}

	/**
	 * Validates the elements a member came back with against the branches its range admits.
	 */
	function elements(carried: readonly unknown[], branches: readonly Shape[], requested: unknown): Optional<Trace> {

		if ( branches.length !== 1 ) {
			return array((value: unknown) => branch(value, branches, requested))(carried);
		}

		const [only] = branches;

		if ( only.kind === "reference" ) {

			// a link comes back as the identifier naming the resource, or as the resource itself

			return array((value: unknown) => isString(value)
				? isReference(value) ? undefined : ["expected an absolute IRI"]
				: isObject(value) ? validateResult([value], {
					shape: eager(only.target),
					model: nested(requested)
				}) : ["expected an IRI or the resource itself"]
			)(carried);

		}

		if ( only.kind === "resource" ) {

			return array((value: unknown) => isObject(value)
				? validateResult([value], { shape: only, model: nested(requested) })
				: ["expected a nested resource"]
			)(carried);

		}

		return validateShape(carried, only);

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

			return single(branches.filter(admits => keys.some(key => fits(value, admits, fields[key]))));

		}

		return single(branches.filter(admits => fits(value, admits, requested)));

	}

	/**
	 * Reports whether a value belongs to exactly one of the branches it was matched against.
	 */
	function single(matched: readonly Shape[]): Optional<Trace> {

		return matched.length === 0 ? ["{branches} no branch admits the value"]
			: matched.length > 1 ? ["{branches} several branches admit the value"]
				: undefined;

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

			default: // a plain branch is singled out only where both the value and the placeholder fit it

				return !isObject(requested)
					&& validateShape([value], admits) === undefined
					&& validateShape([requested], admits, { scope: "model" }) === undefined;

		}

	}

	/**
	 * Reports the cardinality bounds the values a member came back with break.
	 */
	function counts(count: number, { minCount, maxCount }: Property): Optional<Trace> {

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
	 * A collection states its per-item template first, and a placeholder asking for the identifier alone states no
	 * nested template at all, so every member the resource comes back with is unasked for.
	 */
	function nested(requested: unknown): Template {

		const element = isQuery(requested) ? requested[0] : requested;

		return isTemplate(element) ? element : {};

	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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
