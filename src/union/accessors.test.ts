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

import { createNamespace } from "@metreeca/core/resource";
import { TraceError } from "@metreeca/core/trace";
import { describe, expect, it } from "vitest";
import { boolean } from "../boolean/index.js";
import { dictionary } from "../dictionary/index.js";
import { number } from "../number/index.js";
import { reference } from "../reference/index.js";
import {
	id,
	type Member,
	multiple,
	optional,
	type Parents,
	required,
	resource,
	type ResourceConstraints,
	type ResourceShape
} from "../resource/index.js";
import { string } from "../string/index.js";
import { getBoundBranch, getModelBranches, getShapeBranches, getStateBranch } from "./accessors.js";
import { union } from "./index.js";


/**
 * Builds a resource shape without the resource() factory, keeping the suite to the union module alone.
 */
function target(constraints: ResourceConstraints = {}, ...parents: Parents): ResourceShape {
	return resource(...parents, constraints, {});
}


describe("getShapeBranches", () => {

	it("flattens a union to its branches", async () => {

		const text = string();
		const count = number();

		expect(getShapeBranches(union(text, count))).toEqual([text, count]);

	});

	it("takes a plain shape to the single branch it is", async () => {

		const text = string();

		expect(getShapeBranches(text)).toEqual([text]);

	});

	it("resolves a deferred range", async () => {

		const text = string();

		expect(getShapeBranches(() => text)).toEqual([text]);

	});

	it("resolves a deferred branch", async () => {

		const text = string();

		expect(getShapeBranches(union(() => text))).toEqual([text]);

	});

	it("flattens a nested union into the enclosing one", async () => {

		const text = string();
		const count = number();
		const flag = boolean();

		expect(getShapeBranches(union(text, union(count, flag)))).toEqual([text, count, flag]);

	});

	describe("coherence", () => {

		const Vendor = target();

		it.each<[string, Member, Member]>([
			["ranges", required(string()), required(number())],
			["cardinalities", required(string()), multiple(string())],
			["value domains", required(string({ minLength: 1 })), required(string({ maxLength: 9 }))]
		])("accepts a shared member differing in %s", async (_, one, other) => {

			const shape = union(resource({ shared: one }), resource({ shared: other }));

			expect(getShapeBranches(shape)).toHaveLength(2);

		});

		it("accepts member names declared by a single branch", async () => {

			const shape = union(resource({ one: required(string()) }), resource({ other: required(number()) }));

			expect(getShapeBranches(shape)).toHaveLength(2);

		});

		it("ignores branches describing no resource", async () => {

			const shape = union(string(), resource({ shared: required(string()) }));

			expect(getShapeBranches(shape)).toHaveLength(2);

		});

		it.each<[string, Member, Member]>([
			["kinds", id(), required(string())],
			[
				"forward predicates",
				required(string(), { forward: "https://schema.org/name" }),
				required(string(), { forward: "https://schema.org/alternateName" })
			],
			[
				"reverse predicates",
				multiple(reference(Vendor), { reverse: "https://schema.org/seller" }),
				multiple(reference(Vendor), { reverse: "https://schema.org/vendor" })
			],
			["captive flags", multiple(reference(Vendor), { captive: true }), multiple(reference(Vendor))],
			["foreign flags", multiple(reference(Vendor), { foreign: true }), multiple(reference(Vendor))]
		])("rejects a shared member differing in %s", async (_, one, other) => {

			const shape = union(resource({ shared: one }), resource({ shared: other }));

			expect(() => getShapeBranches(shape)).toThrow(TraceError);

		});

		it("rejects a shared member mapped against different spaces", async () => {

			const shape = union(
				resource({ space: createNamespace("https://schema.org/") }, { shared: required(string()) }),
				resource({ space: createNamespace("https://example.net/") }, { shared: required(string()) })
			);

			expect(() => getShapeBranches(shape)).toThrow(TraceError);

		});

		it("rejects incoherent link targets", async () => {

			const shape = union(
				reference(resource({ shared: required(string(), { forward: "https://schema.org/name" }) })),
				reference(resource({ shared: required(string(), { forward: "https://schema.org/alternateName" }) }))
			);

			expect(() => getShapeBranches(shape)).toThrow(TraceError);

		});

		it("rejects an incoherent deferred branch as it is resolved", async () => {

			const One = resource({ shared: required(string(), { forward: "https://schema.org/name" }) });
			const Other = resource({ shared: required(string(), { forward: "https://schema.org/alternateName" }) });

			const shape = union(One, () => Other);

			expect(() => getShapeBranches(shape)).toThrow(TraceError);

		});

	});

});

describe("getStateBranch", () => {

	const branches = [string(), number()];

	it("picks the branch a value belongs to", async () => {

		expect(getStateBranch("hello", branches)).toBe(branches[0]);
		expect(getStateBranch(42, branches)).toBe(branches[1]);

	});

	it("picks nothing for a value belonging to no branch", async () => {

		expect(getStateBranch(true, branches)).toBeUndefined();

	});

	it("picks nothing for a value belonging to several branches", async () => {

		expect(getStateBranch("hello", [string({ minLength: 1 }), string({ maxLength: 9 })])).toBeUndefined();

	});

	it("holds a value to every constraint of the branch", async () => {

		expect(getStateBranch(8, [number({ minInclusive: 1, maxInclusive: 5 })])).toBeUndefined();

	});

});

describe("getBoundBranch", () => {

	it("picks the branch a bound filters against", async () => {

		const branches = [number(), string()];

		expect(getBoundBranch(42, branches)).toBe(branches[0]);

	});

	it("picks a branch for a bound outside its value domain", async () => {

		const branches = [number({ minInclusive: 1, maxInclusive: 5 })];

		expect(getBoundBranch(8, branches)).toBe(branches[0]);

	});

	it("picks nothing for a bound filtering no branch", async () => {

		expect(getBoundBranch(true, [number(), string()])).toBeUndefined();

	});

	it("picks nothing for a bound filtering several branches", async () => {

		expect(getBoundBranch("hello", [string(), string()])).toBeUndefined();

	});

});

describe("getModelBranches", () => {

	// the atomic placeholder asks for the value as it stands, so it carries nothing to tell literal branches apart
	// and retrieves each of them

	it("picks every branch the atomic placeholder fits", async () => {

		const branches = [string({ minLength: 1 }), string({ maxLength: 9 })];

		expect(getModelBranches({}, branches)).toEqual(branches);

	});

	it("picks every literal branch, whatever their types", async () => {

		const branches = [string(), number()];

		expect(getModelBranches({}, branches)).toEqual(branches);

	});

	it("fits a reference branch, which comes back as the identifier naming its target", async () => {

		const branches = [reference(target()), string()];

		expect(getModelBranches({}, branches)).toEqual(branches);

	});

	it("fits a localised branch, which comes back coalesced", async () => {

		const map = dictionary({ uniqueLang: true });
		const branches = [string(), map];

		expect(getModelBranches({}, branches)).toEqual(branches);

	});

	// an embedded resource carries no identifier to come back as, so it is reached through a template alone

	it("picks nothing where the atomic placeholder reaches an embedded resource alone", async () => {

		expect(getModelBranches({}, [resource({ name: optional(string()) })])).toBeUndefined();

	});

	it("picks nothing for a placeholder carrying a value of its own", async () => {

		expect(getModelBranches("", [string(), number()])).toBeUndefined();
		expect(getModelBranches(42, [string(), number()])).toBeUndefined();

	});

	it("fits a localised branch by the tag ranges it names", async () => {

		const map = dictionary({ uniqueLang: true });

		expect(getModelBranches({ "*": {} }, [string(), map])).toEqual([map]);

	});

	describe("a nested template", () => {

		// a branch naming a resource is asked for either by the identifier naming it or by a template stating what
		// to bring back, so a placeholder crossing the link is matched against the resource it points at

		const Vendor = resource({ name: optional(string()) });

		it("fits a reference branch through its target", async () => {

			const link = reference(Vendor);

			expect(getModelBranches({ name: {} }, [number(), link])).toEqual([link]);

		});

		it("fits an embedded resource branch", async () => {

			expect(getModelBranches({ name: {} }, [number(), Vendor])).toEqual([Vendor]);

		});

		it("fits both a reference and an embedded resource branch", async () => {

			const link = reference(Vendor);

			expect(getModelBranches({ name: {} }, [link, Vendor])).toEqual([link, Vendor]);

		});

		it("fits nothing where no branch names a resource", async () => {

			expect(getModelBranches({ name: {} }, [string(), number()])).toBeUndefined();

		});

		it("holds the template to the target shape", async () => {

			const link = reference(Vendor);

			expect(getModelBranches({ nope: {} }, [number(), link])).toBeUndefined();

		});

		// a template states what to bring back, never what is held, so a slot the shape declares may be left out

		const Postal = resource({ street: required(string()), city: required(string()) });

		it("fits an embedded resource branch asked for in part", async () => {

			expect(getModelBranches({ city: {} }, [string(), Postal])).toEqual([Postal]);

		});

		it("fits a reference branch asked for in part through its target", async () => {

			const link = reference(Postal);

			expect(getModelBranches({ city: {} }, [string(), link])).toEqual([link]);

		});

	});

});
