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
 * Retrieval policy enforcement.
 *
 * Holds a validated template to what the service will actually serve: {@link enforce} rewrites the template where a
 * policy requires it and leaves it as it stands everywhere else.
 *
 * @module
 */

import { isIdentifier, isObject } from "@metreeca/core";
import { decodeProbe, isBinding, isBranch, isUnion } from "@metreeca/qest/model";
import { getShapeTarget } from "./reference/index.js";
import type { ResourceShape } from "./resource/index.js";
import { getShapeBranches } from "./union/index.js";
import { effective, type Range, type Shape } from "./value/index.js";


/**
 * Applies retrieval policies to a validated template.
 *
 * Returns the template the server will actually honour, so that a caller may hold a request to what the service
 * guarantees rather than to what the client happened to ask for. The template is rewritten where a policy requires it
 * and returned unchanged everywhere else, keeping what the client asked for intact; a template stating no policy at
 * all comes back as it went in.
 *
 * **Default paging**
 *
 * A collection left unpaged is given the largest page the service serves, so that a client omitting `#` is handed a
 * bounded set rather than the whole of it. A collection already stating a page of its own is left alone, as is a
 * single-valued or localised slot, which nothing pages, and a projection column, which holds one value per row and so
 * reaches no collection of its own.
 *
 * The template is expected to have been validated against the shape: a malformed one is returned as it stands rather
 * than reported.
 *
 * @param value The validated template to enforce
 * @param shape The shape the template was validated against
 * @param opts Enforcement options, each applied on its own
 * @param opts.limit The page every unpaged collection is held to; omitted, or `0`, leaves paging to the client
 *
 * @returns A template structurally equivalent to `value`, rewritten where a policy requires it
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where `shape` reaches itself through a cycle no deferred
 *     shape breaks
 */
export function enforce(value: unknown, shape: ResourceShape, {

	limit

}: {

	readonly limit?: number

} = {}): unknown {

	return limit ? template(value, shape) : value; // an omitted or `0` page leaves the set unbounded


	/**
	 * Walks the slots of a template, resolving each to what the shape says it reaches.
	 */
	function template(value: unknown, shape: ResourceShape): unknown {

		if ( !isObject(value) ) { return value; }

		return Object.fromEntries(Object.entries(value).map(([name, asked]) => {

			// a projection column carries its own path, while a plain member names the single step it is

			const probe = isBinding(name) ? decodeProbe(name)
				: isIdentifier(name) ? { target: name, pipe: [], path: [name] }
					: undefined;

			const range = probe && effective(shape, probe);

			// a path the shape cannot resolve leaves the slot as it stands

			return [name, isObject(range) ? slot(asked, range, !isBinding(name)) : asked];

		}));

	}

	/**
	 * Walks what a slot asks for, under the cardinality and the form the shape gives it.
	 *
	 * @param value The slot to walk
	 * @param range The range the shape gives the slot
	 * @param paged Whether the slot reaches a collection of its own, which a projection column never does, holding
	 *     one value per row
	 */
	function slot(value: unknown, range: Range, paged: boolean): unknown {

		const branches = getShapeBranches(range.shape);
		const [branch] = branches;

		const collection = paged && range.maxCount !== 1;

		return branches.length > 1 ? model(value, branches, collection)
			: branch.kind === "dictionary" ? value // nothing pages a localised value
				: collection ? page(placeholder(value, branch))
					: placeholder(value, branch);

	}

	/**
	 * Walks what a single value asks for, descending into the template behind a resource.
	 */
	function placeholder(value: unknown, branch: Shape): unknown {

		// a union of one flattens away, so its branch map arrives here rather than through `model`

		const target = isObject(value) ? getShapeTarget(branch) : undefined;

		return isUnion(value) ? indexed(value, [branch])
			: target !== undefined ? template(value, target)
				: value;

	}

	/**
	 * Walks what a polymorphic slot asks for, paging the collection it reaches.
	 */
	function model(value: unknown, branches: readonly Shape[], collection: boolean): unknown {

		return collection ? page(indexed(value, branches)) : indexed(value, branches);

	}

	/**
	 * Walks each branch of a branch map into the shape it is stated under.
	 */
	function indexed(value: unknown, branches: readonly Shape[]): unknown {

		if ( !isObject(value) ) { return value; }

		return Object.fromEntries(Object.entries(value).map(([index, asked]) => {

			const branch: undefined | Shape = isBranch(index) ? branches[Number(index)] : undefined;

			return [index, branch === undefined ? asked : placeholder(asked, branch)];

		}));

	}

	/**
	 * Holds a collection to the largest page the service serves, leaving a stated one alone.
	 */
	function page(node: unknown): unknown {

		return !isObject(node) ? node // a malformed slot is left as it stands
			: "#" in node ? node
				: { ...node, "#": limit };

	}

}
