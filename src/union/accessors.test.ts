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
import { getBoundBranch, getModelBranches, getOptionBranch, getShapeBranches, getStateBranch } from "./accessors.js";
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

	it("tells string branches apart by pattern", async () => {

		const branches = [string({ pattern: "^a" }), string({ pattern: "^b" })];

		expect(getBoundBranch("bravo", branches)).toBe(branches[1]);

	});

	it("picks a localised branch for a plain string bound", async () => {

		const branches = [number(), dictionary()];

		expect(getBoundBranch("M", branches)).toBe(branches[1]);

	});

	it("picks nothing for a plain string bound over a string and a localised branch", async () => {

		expect(getBoundBranch("M", [string(), dictionary()])).toBeUndefined();

	});

	it("picks nothing for a bound over branches nothing orders", async () => {

		expect(getBoundBranch("https://example.com/x", [reference(target())])).toBeUndefined();
		expect(getBoundBranch({}, [target()])).toBeUndefined();

	});

});

describe("getOptionBranch", () => {

	it("picks the branch an option is tested against", async () => {

		const branches = [string(), number(), reference(target())];

		expect(getOptionBranch("hello", branches)).toBe(branches[0]);
		expect(getOptionBranch(42, branches)).toBe(branches[1]);

	});

	it("picks a link branch for an IRI option", async () => {

		const branches = [number(), reference(target())];

		expect(getOptionBranch("https://example.com/x", branches)).toBe(branches[1]);

	});

	it("picks a branch for an option outside its value domain", async () => {

		const branches = [string({ pattern: "^a$", in: ["a"] })];

		expect(getOptionBranch("zulu", branches)).toBe(branches[0]);

	});

	it("picks a localised branch for a plain string or a tag map option", async () => {

		const branches = [number(), dictionary()];

		expect(getOptionBranch("M", branches)).toBe(branches[1]);
		expect(getOptionBranch({ en: ["M", "L"] }, branches)).toBe(branches[1]);

	});

	it("picks nothing for an option fitting no branch", async () => {

		expect(getOptionBranch(true, [string(), number()])).toBeUndefined();
		expect(getOptionBranch({ "123": "M" }, [dictionary()])).toBeUndefined();

	});

	it("picks nothing for an option fitting several branches", async () => {

		expect(getOptionBranch("alpha", [string({ pattern: "^a" }), string({ pattern: "^b" })])).toBeUndefined();
		expect(getOptionBranch("M", [string(), dictionary()])).toBeUndefined();

	});

	it("picks the only branch for an option stated as nothing at all", async () => {

		const branches = [number()];

		expect(getOptionBranch(null, branches)).toBe(branches[0]);
		expect(getOptionBranch(null, [string(), number()])).toBeUndefined();

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

	describe("an object over a localised and a nested-resource branch", () => {

		// a tag range may also be a member name, so the object form is settled against the shape: a template where
		// every key names a member of a nested resource, a map of tag ranges otherwise, never both

		const map = dictionary({ uniqueLang: true });
		const link = reference(resource({ name: optional(string()), en: optional(string()) }));

		it("reads an object naming members alone as a template", async () => {

			expect(getModelBranches({ name: {} }, [map, link])).toEqual([link]);

		});

		it("reads a member name that is also a tag range as a template", async () => {

			expect(getModelBranches({ en: {} }, [map, link])).toEqual([link]);

		});

		it("reads an object naming any key no member declares as tag ranges", async () => {

			expect(getModelBranches({ fr: {} }, [map, link])).toEqual([map]);
			expect(getModelBranches({ "*": {} }, [map, link])).toEqual([map]);
			expect(getModelBranches({ en: {}, fr: {} }, [map, link])).toEqual([map]);

		});

		it("picks nothing for a template read the nested resource rejects", async () => {

			const Box = resource({ en: optional(resource({ code: optional(string()) })) });

			expect(getModelBranches({ en: {} }, [map, Box])).toBeUndefined();

		});

	});

	describe("a template spanning several resource branches", () => {

		// a template may ask for members declared by different resource branches, each branch retrieving those it
		// declares, as long as every member it asks for is declared by some branch

		const map = dictionary();
		const Place = resource({ latitude: optional(number()) });
		const Postal = resource({ street: optional(string()) });

		it("picks every branch declaring any member it asks for", async () => {

			expect(getModelBranches({ latitude: {}, street: {} }, [Place, Postal])).toEqual([Place, Postal]);

		});

		it("picks the declaring branches alone, never the localised ones", async () => {

			expect(getModelBranches({ latitude: {}, street: {} }, [map, Place, Postal])).toEqual([Place, Postal]);
			expect(getModelBranches({ latitude: {} }, [map, Place, Postal])).toEqual([Place]);

		});

		it("picks nothing where a member it asks for is declared by no branch", async () => {

			expect(getModelBranches({ latitude: {}, nope: {} }, [Place, Postal])).toBeUndefined();

		});

	});

	describe("a template asking for a member several resource branches declare", () => {

		// a member declared by several branches may take a different shape in each, so its placeholder spans them,
		// each branch answering the members whose placeholders it admits

		const Named = resource({ name: optional(string()), age: optional(number()) });
		const Linked = resource({ name: optional(reference(resource({ code: optional(string()) }))) });
		const Boxed = resource({ street: optional(resource({ code: optional(string()) })) });

		it("picks every branch admitting the member's placeholder", async () => {

			expect(getModelBranches({ name: {} }, [Named, Linked])).toEqual([Named, Linked]);
			expect(getModelBranches({ name: { code: {} } }, [Named, Linked])).toEqual([Linked]);

		});

		it("picks a branch admitting some member even where it rejects another", async () => {

			expect(getModelBranches({ name: { code: {} }, age: {} }, [Named, Linked])).toEqual([Named, Linked]);

		});

		it("picks nothing where a member's placeholder fits no branch declaring it", async () => {

			expect(getModelBranches({ name: { nope: {} } }, [Named, Linked])).toBeUndefined();
			expect(getModelBranches({ age: {}, street: {} }, [Named, Boxed])).toBeUndefined();

		});

	});

});
