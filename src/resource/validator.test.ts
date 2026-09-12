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

import { isArray, isObject, type Optional } from "@metreeca/core";
import { type Trace } from "@metreeca/core/trace";
import type { Resource } from "@metreeca/qest/resource";
import { describe, expect, it } from "vitest";
import { boolean } from "../boolean/index.js";
import { dictionary } from "../dictionary/index.js";
import { integer, number } from "../number/index.js";
import { reference } from "../reference/index.js";
import { date, string } from "../string/index.js";
import { union } from "../union/index.js";
import {
	id,
	multiple,
	nonempty,
	optional,
	property,
	required,
	resource,
	type as typed
} from "./index.js";
import { validateResource, validateResult, validateTemplate } from "./validator.js";


function at(trace: unknown, ...path: readonly string[]): unknown {

	return path.reduce<unknown>((node, key) => {

		const keyed = isArray(node) ? node.find(entry => isObject(entry)) : node;

		return isObject(keyed) ? keyed[key] : undefined;

	}, trace);

}


describe("validateResource", () => {

	const Product = resource({
		id: id(),
		name: required(string()),
		tags: multiple(string())
	});

	it("returns undefined for a resource matching the shape", async () => {

		expect(validateResource([{ id: "app:/products/1", name: "Widget" }], Product)).toBeUndefined();

	});

	it("returns undefined for empty values", async () => {

		expect(validateResource([], Product)).toBeUndefined();

	});

	it("reports a value that is not a resource", async () => {

		expect(validateResource([42], Product)).toContainEqual(expect.stringContaining("{kind}"));

	});

	it("rejects a member the shape doesn't declare", async () => {

		expect(validateResource([{ name: "Widget", nope: "x" }], Product)).toBeDefined();

	});

	it("keys a violation by the identifier the resource states", async () => {

		const trace = validateResource([{ id: "app:/products/1" }], Product);

		expect(trace).toEqual([{ "<app:/products/1>": expect.anything() }]);

	});

	it("keys a violation by position where the resource states no identifier", async () => {

		expect(validateResource([{}], Product)).toEqual([{ "0": expect.anything() }]);

	});

	describe("polymorphic members", () => {

		const Target = resource({ id: id(), name: required(string()) });

		const shape = resource({
			value: optional(union(string(), integer())),
			values: multiple(union(string(), integer())),
			link: optional(union(integer(), reference(Target)))
		});

		it("admits a value one alternative admits", async () => {

			expect(validateResource([{ value: "Widget" }], shape)).toBeUndefined();
			expect(validateResource([{ value: 42 }], shape)).toBeUndefined();

		});

		it("reports a value no alternative admits", async () => {

			expect(validateResource([{ value: true }], shape)).toBeDefined();

		});

		it("admits values drawn from different alternatives within one set", async () => {

			expect(validateResource([{ values: ["Widget", 42] }], shape)).toBeUndefined();

		});

		it("admits a link among the alternatives", async () => {

			expect(validateResource([{ link: "app:/vendors/1" }], shape)).toBeUndefined();

		});

		it("reports a value several alternatives admit, which settles on no branch", async () => {

			const ambiguous = resource({ link: optional(union(string(), reference(Target))) });

			expect(validateResource([{ link: "app:/vendors/1" }], ambiguous))
				.toBeDefined();

		});

	});

	describe("identifiers", () => {

		it("holds an identifier to the pattern the shape states", async () => {

			const shape = resource({ id: id() }, { pattern: "/products/{code}" });

			expect(validateResource([{ id: "app:/products/1" }], shape)).toBeUndefined();
			expect(validateResource([{ id: "app:/vendors/1" }], shape)).toBeDefined();

		});

		it("holds an identifier to the ones the shape enumerates", async () => {

			const shape = resource({ id: id() }, { in: ["app:/products/1", "app:/products/2"] });

			expect(validateResource([{ id: "app:/products/1" }], shape)).toBeUndefined();
			expect(validateResource([{ id: "app:/products/3" }], shape)).toBeDefined();

		});

		it("reports an identifier stated as a set", async () => {

			expect(validateResource([{ id: ["app:/products/1"] }], resource({ id: id() }))).toBeDefined();

		});

		it("reports an identifier that is no IRI", async () => {

			expect(validateResource([{ id: "products/1" }], resource({ id: id() }))).toBeDefined();
			expect(validateResource([{ id: 42 }], resource({ id: id() }))).toBeDefined();

		});

		it("admits a resource naming itself with nothing at all", async () => {

			expect(validateResource([{}], resource({ id: id() }))).toBeUndefined();

		});

	});

	describe("classes", () => {

		it("holds a class to the one the shape declares", async () => {

			const shape = resource({ kind: typed() }, { class: "app:/Product" });

			expect(validateResource([{ kind: "app:/Product" }], shape)).toBeUndefined();
			expect(validateResource([{ kind: "app:/Vendor" }], shape)).toBeDefined();

		});

		it("admits no class at all where the shape declares none", async () => {

			const shape = resource({ kind: typed() });

			expect(validateResource([{}], shape)).toBeUndefined();
			expect(validateResource([{ kind: "app:/Product" }], shape)).toBeDefined();

		});

	});

	describe("cardinality", () => {

		it("reports a required member left out", async () => {

			expect(validateResource([{ id: "app:/1" }], Product)).toBeDefined();

		});

		it("reports an array where a single value is admitted", async () => {

			expect(validateResource([{ name: ["a", "b"] }], Product)).toBeDefined();

		});

		it("reports a single value where an array is admitted", async () => {

			expect(validateResource([{ name: "Widget", tags: "a" }], Product)).toBeDefined();

		});

		it("admits an array for a repeated member", async () => {

			expect(validateResource([{ name: "Widget", tags: ["a", "b"] }], Product)).toBeUndefined();

		});

		it("reports a count below the lower bound", async () => {

			const shape = resource({ tags: property(string(), { minCount: 2 }) });

			expect(validateResource([{ tags: ["a"] }], shape)).toBeDefined();

		});

		it("reports a count above the upper bound", async () => {

			const shape = resource({ tags: property(string(), { maxCount: 1 }) });

			expect(validateResource([{ tags: ["a", "b"] }], shape)).toBeDefined();

		});

	});

	describe("identifier", () => {

		it("reports an identifier that is not an absolute IRI", async () => {

			expect(validateResource([{ id: "/products/1", name: "Widget" }], Product)).toBeDefined();

		});

		it("holds an identifier to the shape's pattern", async () => {

			const shape = resource({ id: id() }, { pattern: "/products/{id}" });

			expect(validateResource([{ id: "app:/products/1" }], shape)).toBeUndefined();
			expect(validateResource([{ id: "app:/vendors/1" }], shape)).toBeDefined();

		});

		it("holds an identifier to the stated entry", async () => {

			const shape = resource({ id: id() });

			expect(validateResource([{ id: "app:/1" }], shape, { entry: "app:/1" })).toBeUndefined();
			expect(validateResource([{ id: "app:/2" }], shape, { entry: "app:/1" })).toBeDefined();

		});

	});

	describe("class", () => {

		it("admits the class the shape declares", async () => {

			const shape = resource({ type: typed() }, { class: "https://schema.org/Product" });

			expect(validateResource([{ type: "https://schema.org/Product" }], shape)).toBeUndefined();

		});

		it("rejects a class the shape doesn't declare", async () => {

			const shape = resource({ type: typed() }, { class: "https://schema.org/Product" });

			expect(validateResource([{ type: "https://schema.org/Vendor" }], shape)).toBeDefined();

		});

		it("rejects any class where the shape declares none", async () => {

			const shape = resource({ type: typed() });

			expect(validateResource([{ type: "https://schema.org/Product" }], shape)).toBeDefined();

		});

	});

	describe("foreign members", () => {

		it("rejects a foreign member the submitter states", async () => {

			const Vendor = resource({ id: id() });
			const shape = resource({ products: multiple(reference(Vendor), { foreign: true }) });

			expect(validateResource([{ products: ["app:/1"] }], shape)).toBeDefined();

		});

		it("admits a foreign member left out", async () => {

			const Vendor = resource({ id: id() });
			const shape = resource({ products: multiple(reference(Vendor), { foreign: true }) });

			expect(validateResource([{}], shape)).toBeUndefined();

		});

	});

	describe("cardinality", () => {

		it.each<[string, unknown, boolean]>([
			["a single value", "Widget", true],
			["a set of one", ["Widget"], false],
			["a set of several", ["Widget", "Gadget"], false]
		])("holds a member admitting one value to %s", async (_label, stated, admitted) => {

			const shape = resource({ name: required(string()) });
			const trace = validateResource([{ name: stated }], shape);

			expect(trace === undefined).toBe(admitted);

		});

		it.each<[string, unknown, boolean]>([
			["a single value", "Widget", false],
			["a set of one", ["Widget"], true],
			["a set of several", ["Widget", "Gadget"], true]
		])("holds a member admitting several to %s", async (_label, stated, admitted) => {

			const shape = resource({ tags: nonempty(string()) });
			const trace = validateResource([{ tags: stated }], shape);

			expect(trace === undefined).toBe(admitted);

		});

		it("holds a member to the bounds it states", async () => {

			const shape = resource({ tags: property(string(), { minCount: 2, maxCount: 3 }) });

			expect(validateResource([{ tags: ["a"] }], shape))
				.toContainEqual(expect.anything());

			expect(validateResource([{ tags: ["a", "b"] }], shape)).toBeUndefined();
			expect(validateResource([{ tags: ["a", "b", "c"] }], shape)).toBeUndefined();
			expect(validateResource([{ tags: ["a", "b", "c", "d"] }], shape)).toBeDefined();

		});

		it("keys a count violation by the bound it breaks", async () => {

			const shape = resource({ tags: property(string(), { minCount: 2, maxCount: 3 }) });

			expect(JSON.stringify(at(validateResource([{ tags: ["a"] }], shape), "0", "tags")))
				.toContain("{minCount}");

			expect(JSON.stringify(at(validateResource([{ tags: ["a", "b", "c", "d"] }], shape), "0", "tags")))
				.toContain("{maxCount}");

		});

		it("admits a member admitting nothing at all only where nothing is stated", async () => {

			const shape = resource({ nothing: property(string(), { minCount: 0, maxCount: 0 }) });

			expect(validateResource([{}], shape)).toBeUndefined();
			expect(validateResource([{ nothing: [] }], shape)).toBeUndefined();
			expect(validateResource([{ nothing: ["a"] }], shape)).toBeDefined();

		});

	});

	describe("absence", () => {

		const Target = resource({ id: id() });

		it.each([
			["a single string", { name: optional(string()) }, "name"],
			["a single number", { size: optional(number()) }, "size"],
			["a single boolean", { listed: optional(boolean()) }, "listed"],
			["a link", { vendor: optional(reference(Target)) }, "vendor"],
			["a localised value", { label: optional(dictionary()) }, "label"],
			["a set of strings", { tags: multiple(string()) }, "tags"]
		])("reads nothing stated as absent on %s", async (_label, members, name) => {

			expect(validateResource([{ [name]: undefined }], resource(members))).toBeUndefined();

		});

		it.each([
			["a single string", { name: optional(string()) }, "name"],
			["a single number", { size: optional(number()) }, "size"],
			["a single boolean", { listed: optional(boolean()) }, "listed"],
			["a link", { vendor: optional(reference(Target)) }, "vendor"],
			["a localised value", { label: optional(dictionary()) }, "label"],
			["a set of strings", { tags: multiple(string()) }, "tags"]
		])("reads an empty set as absent on %s", async (_label, members, name) => {

			expect(validateResource([{ [name]: [] }], resource(members))).toBeUndefined();

		});

		it("reads an empty record as absent on a member reaching a resource", async () => {

			expect(validateResource([{ vendor: {} }], resource({ vendor: optional(reference(Target)) })))
				.toBeUndefined();

			expect(validateResource([{ rating: {} }], resource({ rating: optional(resource({})) })))
				.toBeUndefined();

		});

		it("reads an empty record as absent on a localised member", async () => {

			expect(validateResource([{ label: {} }], resource({ label: optional(dictionary()) })))
				.toBeUndefined();

		});

		it.each([
			["a single string", { name: optional(string()) }, "name"],
			["a single number", { size: optional(number()) }, "size"],
			["a single boolean", { listed: optional(boolean()) }, "listed"],
			["a required set of strings", { tags: nonempty(string()) }, "tags"],
			["a set of numbers", { scores: multiple(number()) }, "scores"]
		])("reports an empty record on %s, which reaches no resource", async (_label, members, name) => {

			expect(at(validateResource([{ [name]: {} }], resource(members)), "0", name)).toBeDefined();

		});

		it("reads a localised value carrying no content as absent", async () => {

			const shape = resource({ label: optional(dictionary()) });

			expect(validateResource([{ label: { und: [] } }], shape)).toBeUndefined();
			expect(validateResource([{ label: { en: [], fr: [] } }], shape)).toBeUndefined();

		});

		it("admits a localised value carrying content under some tags alone", async () => {

			const shape = resource({ label: optional(dictionary()) });

			expect(validateResource([{ label: { en: [], fr: ["bonjour"] } }], shape)).toBeUndefined();

		});

		it("holds a required member stating nothing at all to its lower bound", async () => {

			const shape = resource({ name: required(string()) });

			expect(validateResource([{ name: undefined }], shape)).toBeDefined();
			expect(validateResource([{ name: [] }], shape)).toBeDefined();

		});

		describe("within a set", () => {

			it("reads an empty record among links as absent", async () => {

				const shape = resource({ vendors: nonempty(reference(Target)) });

				expect(validateResource([{ vendors: ["app:/vendors/1", {}, "app:/vendors/2"] }], shape))
					.toBeUndefined();

			});

			it("reads an empty record among alternatives reaching a resource as absent", async () => {

				const shape = resource({ contacts: nonempty(union(string(), reference(Target))) });

				expect(validateResource([{ contacts: ["a", {}, "b"] }], shape)).toBeUndefined();

			});

			it("reports an empty record among values reaching no resource", async () => {

				const shape = resource({ tags: nonempty(string()) });

				expect(at(validateResource([{ tags: ["a", {}] }], shape), "0", "tags")).toBeDefined();

			});

			it("counts what is left once the absent are dropped", async () => {

				const shape = resource({ vendors: nonempty(reference(Target)) });

				expect(validateResource([{ vendors: [{}] }], shape)).toBeDefined();

			});

		});

	});

	describe("captive members", () => {

		const Part = resource({ id: id(), name: required(string()) });
		const Assembly = resource({ parts: multiple(reference(Part), { captive: true }) });

		it("admits a captive member stated as a link", async () => {

			expect(validateResource([{ parts: ["app:/parts/1"] }], Assembly)).toBeUndefined();

		});

		it("admits a captive member stated inline", async () => {

			expect(validateResource([{ parts: [{ id: "app:/parts/1", name: "Bolt" }] }], Assembly))
				.toBeUndefined();

		});

		it("rejects an inline captive breaking the target shape", async () => {

			expect(validateResource([{ parts: [{ id: "app:/parts/1" }] }], Assembly)).toBeDefined();

		});

		it("rejects an expansion beyond the stated depth", async () => {

			expect(validateResource([{ parts: [{ id: "app:/parts/1", name: "Bolt" }] }], Assembly, { depth: 0 }))
				.toBeDefined();

		});

		it("admits the link naming a captive whatever nesting is allowed", async () => {

			expect(validateResource([{ parts: ["app:/parts/1"] }], Assembly, { depth: 0 })).toBeUndefined();

		});

		it("expands a captive as deep as the nesting allows", async () => {

			const Bolt = resource({ id: id(), name: required(string()) });
			const Sub = resource({ id: id(), bolts: multiple(reference(Bolt), { captive: true }) });
			const shape = resource({ subs: multiple(reference(Sub), { captive: true }) });

			const stated = { subs: [{ id: "app:/subs/1", bolts: [{ id: "app:/bolts/1", name: "Bolt" }] }] };

			expect(validateResource([stated], shape, { depth: 2 })).toBeUndefined();
			expect(validateResource([stated], shape, { depth: 1 })).toBeDefined();

		});

		it("admits an expansion one step short of the nesting allowed", async () => {

			const Bolt = resource({ id: id(), name: required(string()) });
			const Sub = resource({ id: id(), bolts: multiple(reference(Bolt), { captive: true }) });
			const shape = resource({ subs: multiple(reference(Sub), { captive: true }) });

			expect(validateResource([{ subs: [{ id: "app:/subs/1", bolts: ["app:/bolts/1"] }] }], shape, {
				depth: 1
			})).toBeUndefined();

		});

		it("admits any nesting where none is stated", async () => {

			const Bolt = resource({ id: id(), name: required(string()) });
			const Sub = resource({ id: id(), bolts: multiple(reference(Bolt), { captive: true }) });
			const shape = resource({ subs: multiple(reference(Sub), { captive: true }) });

			expect(validateResource([{
				subs: [{ id: "app:/subs/1", bolts: [{ id: "app:/bolts/1", name: "Bolt" }] }]
			}], shape)).toBeUndefined();

		});

		it("leaves a member it holds nothing captive alone", async () => {

			const shape = resource({ part: optional(reference(Part)) });

			expect(validateResource([{ part: "app:/parts/1" }], shape, { depth: 0 })).toBeUndefined();
			expect(validateResource([{ part: { name: "Bolt" } }], shape, { depth: 0 })).toBeDefined();

		});

		describe("reached through alternatives", () => {

			// captivity is stated on the member, so it reaches whichever alternative names a resource: a link is
			// expanded wherever it is admitted, and the alternatives still single out the one admitting the value

			const Mixed = resource({ parts: multiple(union(integer(), reference(Part)), { captive: true }) });

			it("admits a captive alternative stated as a link", async () => {

				expect(validateResource([{ parts: ["app:/parts/1"] }], Mixed)).toBeUndefined();

			});

			it("admits a captive alternative stated inline", async () => {

				expect(validateResource([{ parts: [{ id: "app:/parts/1", name: "Bolt" }] }], Mixed))
					.toBeUndefined();

			});

			it("rejects an inline captive breaking the target shape", async () => {

				expect(validateResource([{ parts: [{ id: "app:/parts/1" }] }], Mixed)).toBeDefined();

			});

			it("rejects an expansion beyond the stated depth", async () => {

				expect(validateResource([{ parts: [{ id: "app:/parts/1", name: "Bolt" }] }], Mixed, { depth: 0 }))
					.toBeDefined();

			});

			it("admits the link naming a captive whatever nesting is allowed", async () => {

				expect(validateResource([{ parts: ["app:/parts/1"] }], Mixed, { depth: 0 })).toBeUndefined();

			});

			it("admits a value of an alternative naming no resource", async () => {

				expect(validateResource([{ parts: [42] }], Mixed)).toBeUndefined();

			});

			it("rejects an inline captive several alternatives admit", async () => {

				const Piece = resource({ id: id(), name: required(string()) });
				const shape = resource({
					parts: multiple(union(reference(Part), reference(Piece)), { captive: true })
				});

				expect(validateResource([{ parts: [{ id: "app:/parts/1", name: "Bolt" }] }], shape)).toBeDefined();

			});

			it("leaves alternatives it holds nothing captive alone", async () => {

				const shape = resource({ parts: multiple(union(integer(), reference(Part))) });

				expect(validateResource([{ parts: ["app:/parts/1"] }], shape)).toBeUndefined();
				expect(validateResource([{ parts: [{ id: "app:/parts/1", name: "Bolt" }] }], shape)).toBeDefined();

			});

		});

	});

	describe("localised members", () => {

		// a localised value is a value set in its own right, holding its strings per tag at the arity its own shape
		// states: a member carries one map, whole and never in an array, whatever its bounds admit of the other
		// values, and a resource carries either the map or the other values, never both

		it("admits a single map where a single value is admitted", async () => {

			const shape = resource({ label: required(dictionary({ uniqueLang: true })) });

			expect(validateResource([{ label: { en: "Widget" } }], shape)).toBeUndefined();

		});

		it("reports an array where a single value is admitted", async () => {

			const shape = resource({ label: required(dictionary({ uniqueLang: true })) });

			expect(validateResource([{ label: [{ en: "Widget" }] }], shape)).toBeDefined();

		});

		it("reports a required localised member left out", async () => {

			const shape = resource({ label: required(dictionary({ uniqueLang: true })) });

			expect(validateResource([{}], shape)).toBeDefined();

		});

		it("admits a bare map where an array is admitted", async () => {

			const shape = resource({ labels: multiple(dictionary()) });

			expect(validateResource([{ labels: { en: ["Widget"] } }], shape)).toBeUndefined();

		});

		it("reports an array of maps where an array is admitted", async () => {

			const shape = resource({ labels: multiple(dictionary()) });

			expect(validateResource([{ labels: [{ en: ["Widget"] }] }], shape)).toBeDefined();
			expect(validateResource([{ labels: [{ en: ["Widget"] }, { it: ["Aggeggio"] }] }], shape)).toBeDefined();

		});

		it("holds the map apart from the bounds stated for the member", async () => {

			const shape = resource({ labels: property(dictionary(), { minCount: 2, maxCount: 3 }) });

			expect(validateResource([{ labels: { en: ["Widget"] } }], shape)).toBeUndefined();

		});

		it("admits either the map or an array of the other values on a two-natured member", async () => {

			const shape = resource({ names: multiple(union(string(), dictionary())) });

			expect(validateResource([{ names: { en: ["Widget"] } }], shape)).toBeUndefined();
			expect(validateResource([{ names: ["Widget", "Gadget"] }], shape)).toBeUndefined();

		});

		it("reports a map among the other values on a two-natured member", async () => {

			const shape = resource({ names: multiple(union(string(), dictionary())) });

			expect(validateResource([{ names: ["Widget", { en: ["Widget"] }] }], shape)).toBeDefined();
			expect(validateResource([{ names: [{ en: ["Widget"] }] }], shape)).toBeDefined();

		});

		it("holds the other values of a two-natured member to its bounds", async () => {

			const shape = resource({ names: nonempty(union(string(), dictionary())) });

			expect(validateResource([{ names: [] }], shape)).toBeDefined();
			expect(validateResource([{ names: "Widget" }], shape)).toBeDefined();

		});

		it("admits a bare map on a member requiring at least one value", async () => {

			expect(validateResource([{ labels: { en: ["Widget"] } }], resource({ labels: nonempty(dictionary()) })))
				.toBeUndefined();

			expect(validateResource([{ names: { en: ["Widget"] } }], resource({
				names: nonempty(union(string(), dictionary()))
			}))).toBeUndefined();

		});

		it("reports a map left out of a member requiring at least one value", async () => {

			const shape = resource({ labels: nonempty(dictionary()) });

			expect(validateResource([{}], shape)).toBeDefined();
			expect(validateResource([{ labels: [] }], shape)).toBeDefined();

		});

		it("holds the map to the shape's constraints", async () => {

			const shape = resource({ label: required(dictionary({ uniqueLang: true, minLength: 3 })) });

			expect(validateResource([{ label: { en: "Widget" } }], shape)).toBeUndefined();
			expect(validateResource([{ label: { en: "W" } }], shape)).toBeDefined();

		});

	});

	describe("embedded resources", () => {

		it("validates an embedded resource against its shape", async () => {

			const Rating = resource({ average: required(number()) });
			const shape = resource({ rating: optional(Rating) });

			expect(validateResource([{ rating: { average: 4 } }], shape)).toBeUndefined();
			expect(validateResource([{ rating: { average: "high" } }], shape)).toBeDefined();

		});

		it("rejects an embedded resource naming itself", async () => {

			const Embedded = resource({ id: id(), name: required(string()) });
			const shape = resource({ rating: optional(Embedded) });

			expect(validateResource([{ rating: { name: "x" } }], shape))
				.toContainEqual(expect.stringContaining("{id}"));

		});

	});

	describe("custom checks", () => {

		it("passes a resource every check admits", async () => {

			const shape = resource({ name: required(string()) }, { validators: [() => undefined] });

			expect(validateResource([{ name: "Widget" }], shape)).toBeUndefined();

		});

		it("reports what a check finds, keyed by the name of the check", async () => {

			function rated(resource: Resource): Optional<Trace> {
				return resource["name"] === "Widget" ? undefined : ["expected a widget"];
			}

			const shape = resource({ name: required(string()) }, { validators: [rated] });

			expect(at(validateResource([{ name: "Gadget" }], shape), "0", "{rated}"))
				.toEqual(["expected a widget"]);

		});

		it("runs every check rather than stopping at the first", async () => {

			const shape = resource({ name: required(string()) }, {
				validators: [
					function first() { return ["first"]; },
					function second() { return ["second"]; }
				]
			});

			const trace = validateResource([{ name: "Widget" }], shape);

			expect(at(trace, "0", "{first}")).toEqual(["first"]);
			expect(at(trace, "0", "{second}")).toEqual(["second"]);

		});

		it("runs the checks a shape inherits", async () => {

			const Base = resource({ name: required(string()) }, {
				validators: [function inherited() { return ["inherited"]; }]
			});

			expect(at(validateResource([{ name: "Widget" }], resource(Base, {})), "0", "{inherited}"))
				.toEqual(["inherited"]);

		});

	});

});

describe("validateTemplate", () => {

	const Vendor = resource({ id: id(), name: required(string()) });

	const Product = resource({
		id: id(),
		type: typed(),
		name: required(string()),
		size: optional(integer()),
		listed: optional(boolean()),
		tags: multiple(string()),
		label: optional(dictionary({ uniqueLang: true })),
		notes: optional(dictionary()),
		vendor: optional(reference(Vendor)),
		vendors: multiple(reference(Vendor))
	});

	it("returns undefined for a template asking for what the shape gives", async () => {

		expect(validateTemplate([{ id: "", name: "", size: 0, listed: false }], Product)).toBeUndefined();

	});

	it("returns undefined for empty values", async () => {

		expect(validateTemplate([], Product)).toBeUndefined();

	});

	it("returns undefined for an empty template", async () => {

		expect(validateTemplate([{}], resource({}))).toBeUndefined();

	});

	it("reports a value that is not a template", async () => {

		expect(validateTemplate([42], Product))
			.toContainEqual(expect.stringContaining("{kind}"));

	});

	it("counts the values that are not templates", async () => {

		expect(validateTemplate([42, "x"], Product))
			.toContainEqual(expect.stringContaining("(2/2)"));

	});


	describe("members", () => {

		it("leaves a slot asking for nothing unchecked", async () => {

			expect(validateTemplate([{ name: undefined }], Product)).toBeUndefined();

		});

		it("reports a member the shape doesn't declare", async () => {

			expect(validateTemplate([{ unknown: "" }], Product)).toBeDefined();

		});

		it("reports a key that is not a member name", async () => {

			expect(validateTemplate([{ "not a name": "" }], Product)).toBeDefined();

		});

		it("accepts an IRI under the members naming and typing a resource", async () => {

			expect(validateTemplate([{ id: "app:/products/1", type: "app:/Product" }], Product)).toBeUndefined();

		});

		it("reports a non-IRI under the member naming a resource", async () => {

			expect(validateTemplate([{ id: 42 }], Product)).toBeDefined();

		});

		it("holds a placeholder to the kind of the member", async () => {

			expect(validateTemplate([{ size: "" }], Product)).toBeDefined();

		});

		it("leaves the value domain alone, a placeholder standing for a value", async () => {

			const shape = resource({ size: optional(integer({ minInclusive: 10 })) });

			expect(validateTemplate([{ size: 0 }], shape)).toBeUndefined();

		});

	});

	describe("collections", () => {

		it("accepts a collection stated as a lone element", async () => {

			expect(validateTemplate([{ tags: [""] }], Product)).toBeUndefined();

		});

		it("accepts a collection stated with a selection", async () => {

			expect(validateTemplate([{ tags: ["", { "#": 10 }] }], Product)).toBeUndefined();

		});

		it("reports a collection stated as a single value", async () => {

			expect(validateTemplate([{ tags: "" }], Product)).toBeDefined();

		});

		it("reports a collection stated as an empty tuple", async () => {

			expect(validateTemplate([{ tags: [] }], Product)).toBeDefined();

		});

		it("reports a collection stated with more than a selection", async () => {

			expect(validateTemplate([{ tags: ["", {}, {}] }], Product)).toBeDefined();

		});

		it("reports an element of the wrong kind", async () => {

			expect(validateTemplate([{ tags: [0] }], Product)).toBeDefined();

		});

	});

	describe("linked resources", () => {

		it("accepts an identifier standing for the link", async () => {

			expect(validateTemplate([{ vendor: "app:/vendors/1" }], Product)).toBeUndefined();

		});

		it("accepts a template standing for the resource behind the link", async () => {

			expect(validateTemplate([{ vendor: { name: "" } }], Product)).toBeUndefined();

		});

		it("holds the nested template to the shape of the target", async () => {

			expect(validateTemplate([{ vendor: { unknown: "" } }], Product)).toBeDefined();

		});

		it("accepts a collection of templates", async () => {

			expect(validateTemplate([{ vendors: [{ name: "" }] }], Product)).toBeUndefined();

		});

	});

	describe("localised members", () => {

		it("accepts a map of the tags wanted", async () => {

			expect(validateTemplate([{ label: { en: "", it: "" } }], Product)).toBeUndefined();

		});

		it("accepts the wildcard range", async () => {

			expect(validateTemplate([{ label: { "*": "" } }], Product)).toBeUndefined();

		});

		it("reports a key that is not a language range", async () => {

			expect(validateTemplate([{ label: { "<": "" } }], Product)).toBeDefined();

		});

		it("holds a unique-tagged member to a single placeholder per range", async () => {

			expect(validateTemplate([{ label: { en: [""] } }], Product)).toBeDefined();

		});

		it("holds a multi-tagged member to a singleton placeholder per range", async () => {

			expect(validateTemplate([{ notes: { en: [""] } }], Product)).toBeUndefined();
			expect(validateTemplate([{ notes: { en: "" } }], Product)).toBeDefined();

		});

		it("refuses the negotiated placeholder outside a projection column", async () => {

			expect(validateTemplate([{ label: "" }], Product)).toBeDefined();

		});

		it("is asked for as one value however many maps it admits", async () => {

			const shape = resource({ labels: multiple(dictionary({ uniqueLang: true })) });

			expect(validateTemplate([{ labels: { en: "" } }], shape)).toBeUndefined();

		});

	});

	describe("polymorphic members", () => {

		const A = resource({ name: required(string()) });
		const B = resource({ size: required(integer()) });

		const shape = resource({
			value: optional(union(A, B)),
			values: multiple(union(A, B))
		});

		it("accepts a branch map", async () => {

			expect(validateTemplate([{ value: { "0": { name: "" }, "1": { size: 0 } } }], shape)).toBeUndefined();

		});

		it("reports a placeholder stated outside a branch map", async () => {

			expect(validateTemplate([{ value: { name: "" } }], shape)).toBeDefined();

		});

		it("reports a branch no alternative admits", async () => {

			expect(validateTemplate([{ value: { "0": { unknown: "" } } }], shape)).toBeDefined();

		});

		it("accepts a branch map as the element of a collection", async () => {

			expect(validateTemplate([{ values: [{ "0": { name: "" } }, { "#": 10 }] }], shape)).toBeUndefined();

		});

	});

	describe("projections", () => {

		it("accepts a column bound to a path", async () => {

			expect(validateTemplate([{ vendors: [{ "vendor=name": "" }] }], Product)).toBeUndefined();

		});

		it("reports a column bound to a path the shape cannot resolve", async () => {

			expect(validateTemplate([{ vendors: [{ "x=unknown": "" }] }], Product)).toBeDefined();

		});

		it("reports two columns binding the same identifier", async () => {

			const shape = resource({ items: multiple(reference(resource({ a: optional(string()), b: optional(string()) }))) });

			expect(validateTemplate([{ items: [{ "x=a": "", "x=b": "" }] }], shape)).toBeDefined();

		});

		it("accepts the transforms combining values", async () => {

			expect(validateTemplate([{ vendors: [{ "n=count:name": 0 }] }], Product)).toBeUndefined();

		});

		it("refuses the transforms combining values where asked to", async () => {

			expect(validateTemplate([{ vendors: [{ "n=count:name": 0 }] }], Product, { plain: true })).toBeDefined();

		});

		it("reports a collection asked for under a column", async () => {

			expect(validateTemplate([{ vendors: [{ "n=name": [""] }] }], Product)).toBeDefined();

		});

		it("accepts the negotiated placeholder under a localised column", async () => {

			const shape = resource({ items: multiple(reference(resource({ notes: optional(dictionary()) }))) });

			expect(validateTemplate([{ items: [{ "n=notes": [""] }] }], shape)).toBeUndefined();

		});

	});

	describe("selections", () => {

		it("reports a key that is not a selection operator", async () => {

			expect(validateTemplate([{ tags: ["", { name: "" }] }], Product)).toBeDefined();

		});

		it("accepts a bound of the kind the path resolves to", async () => {

			const shape = resource({ items: multiple(reference(Product)) });

			expect(validateTemplate([{ items: [{ name: "" }, { ">=size": 10 }] }], shape)).toBeUndefined();

		});

		it("reports a bound of another kind", async () => {

			const shape = resource({ items: multiple(reference(Product)) });

			expect(validateTemplate([{ items: [{ name: "" }, { ">=size": "10" }] }], shape)).toBeDefined();

		});

		it("reports a bound on a value nothing orders", async () => {

			const shape = resource({ items: multiple(reference(Product)) });

			expect(validateTemplate([{ items: [{ name: "" }, { ">=vendor": "app:/v/1" }] }], shape)).toBeDefined();

		});

		it("accepts a text search over a textual path", async () => {

			const shape = resource({ items: multiple(reference(Product)) });

			expect(validateTemplate([{ items: [{ name: "" }, { "~name": "wid" }] }], shape)).toBeUndefined();

		});

		it("reports a text search over a path carrying no text", async () => {

			const shape = resource({ items: multiple(reference(Product)) });

			expect(validateTemplate([{ items: [{ name: "" }, { "~size": "wid" }] }], shape)).toBeDefined();

		});

		it("accepts options stated singly or as a set", async () => {

			const shape = resource({ items: multiple(reference(Product)) });

			expect(validateTemplate([{ items: [{ name: "" }, { "?name": "Widget" }] }], shape)).toBeUndefined();
			expect(validateTemplate([{ items: [{ name: "" }, { "!name": ["a", "b"] }] }], shape)).toBeUndefined();

		});

		it("accepts an option stated as nothing at all", async () => {

			const shape = resource({ items: multiple(reference(Product)) });

			expect(validateTemplate([{ items: [{ name: "" }, { "?name": null }] }], shape)).toBeUndefined();

		});

		it("reports an option of another kind", async () => {

			const shape = resource({ items: multiple(reference(Product)) });

			expect(validateTemplate([{ items: [{ name: "" }, { "?size": "big" }] }], shape)).toBeDefined();

		});

		it("accepts an ordering over a single-valued key", async () => {

			const shape = resource({ items: multiple(reference(Product)) });

			expect(validateTemplate([{ items: [{ name: "" }, { "^name": "asc" }] }], shape)).toBeUndefined();
			expect(validateTemplate([{ items: [{ name: "" }, { "^name": 1 }] }], shape)).toBeUndefined();

		});

		it("reports an ordering stated as a fraction", async () => {

			const shape = resource({ items: multiple(reference(Product)) });

			expect(validateTemplate([{ items: [{ name: "" }, { "^name": 1.5 }] }], shape)).toBeDefined();

		});

		it("reports an ordering over a multi-valued key", async () => {

			const shape = resource({ items: multiple(reference(Product)) });

			expect(validateTemplate([{ items: [{ name: "" }, { "^tags": "asc" }] }], shape)).toBeDefined();

		});

		it("reports a focus over a multi-valued key", async () => {

			const shape = resource({ items: multiple(reference(Product)) });

			expect(validateTemplate([{ items: [{ name: "" }, { "+tags": "a" }] }], shape)).toBeDefined();

		});

		it("accepts a page stated as a non-negative integer", async () => {

			expect(validateTemplate([{ tags: ["", { "@": 0, "#": 10 }] }], Product)).toBeUndefined();

		});

		it("reports a page stated as a negative integer", async () => {

			expect(validateTemplate([{ tags: ["", { "#": -1 }] }], Product)).toBeDefined();

		});

		it("reports a page larger than the one served", async () => {

			expect(validateTemplate([{ tags: ["", { "#": 100 }] }], Product, { limit: 10 })).toBeDefined();
			expect(validateTemplate([{ tags: ["", { "#": 0 }] }], Product, { limit: 10 })).toBeDefined();

		});

	});

	describe("grouped ordering", () => {

		const shape = resource({ items: multiple(reference(Product)) });

		it("accepts an ordering naming a grouping key", async () => {

			expect(validateTemplate([{
				items: [{ "name=name": "", "n=count:size": 0 }, { "^name": "asc" }]
			}], shape)).toBeUndefined();

		});

		it("accepts an ordering reducing to an aggregate", async () => {

			expect(validateTemplate([{
				items: [{ "name=name": "", "n=count:size": 0 }, { "^count:size": "desc" }]
			}], shape)).toBeUndefined();

		});

		it("reports an ordering naming neither", async () => {

			expect(validateTemplate([{
				items: [{ "name=name": "", "n=count:size": 0 }, { "^size": "asc" }]
			}], shape)).toBeDefined();

		});

		it("leaves an ungrouped collection alone", async () => {

			expect(validateTemplate([{
				items: [{ "name=name": "", "s=size": 0 }, { "^size": "asc" }]
			}], shape)).toBeUndefined();

		});

	});

	describe("embedded resources", () => {

		const shape = resource({ rating: optional(resource({ score: required(integer()) })) });

		it("is asked for as a template, having no identifier of its own", async () => {

			expect(validateTemplate([{ rating: { score: 0 } }], shape)).toBeUndefined();

		});

		it("refuses an identifier in its place", async () => {

			expect(validateTemplate([{ rating: "app:/ratings/1" }], shape)).toBeDefined();

		});

	});

	describe("foreign members", () => {

		const shape = resource({ children: multiple(reference(Vendor), { foreign: true }) });

		it("is asked for as the resources it points at are", async () => {

			expect(validateTemplate([{ children: ["app:/vendors/1"] }], shape)).toBeUndefined();
			expect(validateTemplate([{ children: [{ name: "" }] }], shape)).toBeUndefined();

		});

	});

	describe("paths", () => {

		const Inner = resource({ name: required(string()), size: optional(integer()) });
		const Middle = resource({ id: id(), inner: required(reference(Inner)) });
		const shape = resource({ items: multiple(reference(Middle)) });

		it("reaches a member across several steps", async () => {

			expect(validateTemplate([{ items: [{ "n=inner.name": "" }] }], shape)).toBeUndefined();
			expect(validateTemplate([{ items: [{}, { "~inner.name": "wid" }] }], shape)).toBeUndefined();
			expect(validateTemplate([{ items: [{}, { "?inner.name": ["a", "b"] }] }], shape)).toBeUndefined();
			expect(validateTemplate([{ items: [{}, { ">=inner.size": 10 }] }], shape)).toBeUndefined();
			expect(validateTemplate([{ items: [{}, { "^inner.name": "asc" }] }], shape)).toBeUndefined();

		});

		it("reports a step no member carries", async () => {

			expect(validateTemplate([{ items: [{ "n=inner.unknown": "" }] }], shape)).toBeDefined();
			expect(validateTemplate([{ items: [{}, { "~inner.unknown": "wid" }] }], shape)).toBeDefined();

		});

		it("counts every step of a path against the nesting allowed", async () => {

			expect(validateTemplate([{ items: [{}, { "~inner.name": "wid" }] }], shape, { depth: 2 })).toBeDefined();
			expect(validateTemplate([{ items: [{}, { "~inner.name": "wid" }] }], shape, { depth: 3 }))
				.toBeUndefined();

		});

		it("admits a path of any length where nothing caps it", async () => {

			const deep = resource({ items: multiple(reference(resource({ mid: required(reference(Middle)) }))) });

			expect(validateTemplate([{ items: [{}, { "^mid.inner.name": "asc" }] }], deep)).toBeUndefined();

		});

		it("reaches a member every alternative of a polymorphic step carries", async () => {

			const A = resource({ name: required(string()) });
			const B = resource({ name: required(string()) });

			const branched = resource({ items: multiple(reference(resource({ of: required(union(A, B)) }))) });

			expect(validateTemplate([{ items: [{}, { "~of.name": "wid" }] }], branched)).toBeUndefined();

		});

		it("reaches a member a single alternative carries", async () => {

			const A = resource({ name: required(string()) });
			const B = resource({ code: required(string()) });

			const branched = resource({ items: multiple(reference(resource({ of: required(union(A, B)) }))) });

			expect(validateTemplate([{ items: [{}, { "~of.name": "wid" }] }], branched)).toBeUndefined();
			expect(validateTemplate([{ items: [{}, { "~of.unknown": "wid" }] }], branched)).toBeDefined();

		});

	});

	describe("transforms", () => {

		const shape = resource({ items: multiple(reference(Product)) });

		it("reads a component of a point in time", async () => {

			const dated = resource({ items: multiple(reference(resource({ released: optional(date()) }))) });

			expect(validateTemplate([{ items: [{ "y=year:released": 0 }] }], dated)).toBeUndefined();

		});

		it("reports a transform the values it reads cannot be read through", async () => {

			expect(validateTemplate([{ items: [{ "y=year:name": 0 }] }], shape)).toBeDefined();
			expect(validateTemplate([{ items: [{ "n=sum:name": 0 }] }], shape)).toBeDefined();

		});

		it("reports a pipe combining values more than once", async () => {

			expect(validateTemplate([{ items: [{ "n=count:sum:size": 0 }] }], shape)).toBeDefined();

		});

		it("holds a column to the kind the transforms yield", async () => {

			expect(validateTemplate([{ items: [{ "n=count:name": 0 }] }], shape)).toBeUndefined();
			expect(validateTemplate([{ items: [{ "n=count:name": "" }] }], shape)).toBeDefined();

		});

		it("filters on what a transform yields", async () => {

			expect(validateTemplate([{ items: [{}, { ">=count:tags": 2 }] }], shape)).toBeUndefined();
			expect(validateTemplate([{ items: [{}, { ">=count:tags": "2" }] }], shape)).toBeDefined();

		});

	});

	describe("options", () => {

		const shape = resource({ items: multiple(reference(Product)) });

		it("admits an option of the kind the path reaches", async () => {

			expect(validateTemplate([{ items: [{}, { "?size": [1, 2] }] }], shape)).toBeUndefined();
			expect(validateTemplate([{ items: [{}, { "!listed": [true] }] }], shape)).toBeUndefined();
			expect(validateTemplate([{ items: [{}, { "?vendor": ["app:/vendors/1"] }] }], shape)).toBeUndefined();

		});

		it("admits nothing at all among the options", async () => {

			expect(validateTemplate([{ items: [{}, { "?name": [null, "Widget"] }] }], shape)).toBeUndefined();

		});

		it("reports an option of another kind within a set", async () => {

			expect(validateTemplate([{ items: [{}, { "?size": [1, "2"] }] }], shape)).toBeDefined();

		});

		it("singles out one alternative per option over a polymorphic path", async () => {

			const branched = resource({ items: multiple(reference(resource({ of: required(union(string(), integer())) }))) });

			expect(validateTemplate([{ items: [{}, { "?of": ["a", 1] }] }], branched)).toBeUndefined();
			expect(validateTemplate([{ items: [{}, { "?of": [true] }] }], branched)).toBeDefined();

		});

		it("admits a localised path as the text it carries or as the tags wanted", async () => {

			expect(validateTemplate([{ items: [{}, { "?label": "Widget" }] }], shape)).toBeUndefined();
			expect(validateTemplate([{ items: [{}, { "?label": ["a", "b"] }] }], shape)).toBeUndefined();
			expect(validateTemplate([{ items: [{}, { "?label": { en: "Widget" } }] }], shape)).toBeUndefined();

		});

		it("reports a localised path asked for as text and as tags at once", async () => {

			expect(validateTemplate([{ items: [{}, { "?label": [{ en: "Widget" }, "Gadget"] }] }], shape))
				.toBeDefined();

		});

	});

	describe("what a template may not ask for", () => {

		it.each<[string, Record<string, unknown>]>([
			["a bound", { ">=size": 18 }],
			["a text search", { "~name": "wid" }],
			["a membership filter", { "?name": "Widget" }],
			["a membership exclusion", { "!tags": "urgent" }],
			["a sort focus", { "+name": ["Widget"] }],
			["an ordering", { "^name": "asc" }],
			["a page start", { "@": 0 }],
			["a page size", { "#": 10 }]
		])("refuses %s asked for outside a collection", async (_label, stated) => {

			expect(validateTemplate([stated], Product)).toBeDefined();

		});

		it.each<[string, Record<string, unknown>]>([
			["a column", { "alias=name": "" }],
			["a computed column", { "n=count:tags": 0 }]
		])("refuses %s asked for outside a collection", async (_label, stated) => {

			expect(validateTemplate([stated], Product)).toBeDefined();

		});

		it("refuses a selection asked for beyond the nesting allowed", async () => {

			const shape = resource({ items: multiple(reference(Product)) });

			expect(validateTemplate([{ items: [{ name: "" }, { "^name": "asc" }] }], shape, { depth: 0 }))
				.toBeDefined();

		});

		it("refuses an ordering of nothing countable", async () => {

			const shape = resource({ items: multiple(reference(Product)) });

			expect(validateTemplate([{ items: [{ name: "" }, { "^name": true }] }], shape)).toBeDefined();
			expect(validateTemplate([{ items: [{ name: "" }, { "^name": null }] }], shape)).toBeDefined();

		});

		it("refuses a selection stated as anything but a record", async () => {

			expect(validateTemplate([{ tags: ["", "selection"] }], Product)).toBeDefined();
			expect(validateTemplate([{ tags: ["", 42] }], Product)).toBeDefined();

		});

	});

	describe("grouped ordering", () => {

		const shape = resource({ items: multiple(reference(Product)) });

		it.each<[string, Record<string, unknown>]>([
			["an ordering", { "^size": "asc" }],
			["a sort focus", { "+size": [1] }]
		])("refuses %s naming a column the grouping drops", async (_label, selection) => {

			expect(validateTemplate([{
				items: [{ "name=name": "", "n=count:size": 0 }, selection]
			}], shape)).toBeDefined();

		});

		it.each<[string, Record<string, unknown>]>([
			["an ordering", { "^name": "asc" }],
			["a sort focus", { "+name": ["Widget"] }]
		])("admits %s naming a grouping key", async (_label, selection) => {

			expect(validateTemplate([{
				items: [{ "name=name": "", "n=count:size": 0 }, selection]
			}], shape)).toBeUndefined();

		});

		it("admits an ordering combining values as the grouping does", async () => {

			expect(validateTemplate([{
				items: [{ "name=name": "", "n=count:size": 0 }, { "^count:size": "desc" }]
			}], shape)).toBeUndefined();

		});

		it("leaves a bound alone, which filters rather than ranks", async () => {

			expect(validateTemplate([{
				items: [{ "name=name": "", "n=count:size": 0 }, { ">=size": 10 }]
			}], shape)).toBeUndefined();

		});

		it("reads the grouping off the columns alone", async () => {

			// a selection combining values reduces a group rather than forming one, so nothing is grouped

			expect(validateTemplate([{
				items: [{ "name=name": "", "s=size": 0 }, { "^count:size": "desc" }]
			}], shape)).toBeUndefined();

		});

	});

	describe("columns", () => {

		const shape = resource({ items: multiple(reference(Product)) });

		it("admits the member naming a resource as a column", async () => {

			expect(validateTemplate([{ items: [{ "id=id": "" }] }], shape)).toBeUndefined();

		});

		it("admits the member typing a resource as a column", async () => {

			const typedShape = resource({
				items: multiple(reference(resource({ kind: typed() }, { class: "app:/Product" })))
			});

			expect(validateTemplate([{ items: [{ "type=kind": "" }] }], typedShape)).toBeUndefined();

		});

		it("holds a column to the kind the path reaches", async () => {

			expect(validateTemplate([{ items: [{ "n=name": "" }] }], shape)).toBeUndefined();
			expect(validateTemplate([{ items: [{ "n=name": 0 }] }], shape)).toBeDefined();

		});

		it("admits a column asking for nothing in particular", async () => {

			expect(validateTemplate([{ items: [{ "n=name": undefined }] }], shape)).toBeUndefined();

		});

		it("refuses a key that binds no column at all", async () => {

			expect(validateTemplate([{ items: [{ "=name": "" }] }], shape)).toBeDefined();
			expect(validateTemplate([{ items: [{ "not a binding": "" }] }], shape)).toBeDefined();

		});

		it("counts the resources a collection holds, naming no member", async () => {

			expect(validateTemplate([{ items: [{ "n=count:": 0 }] }], shape)).toBeUndefined();

		});

		it("holds a column naming no member to the kind counting yields", async () => {

			expect(validateTemplate([{ items: [{ "n=count:": "" }] }], shape)).toBeDefined();

		});

		it("refuses a column naming no member and combining nothing", async () => {

			// the column reaches the resource itself, which a placeholder never stands for

			expect(validateTemplate([{ items: [{ "value=": "" }] }], shape)).toBeDefined();

		});

		it("projects a collection of values as the values themselves, never as a table", async () => {

			const literals = resource({ items: multiple(string()) });

			expect(validateTemplate([{ items: [""] }], literals)).toBeUndefined();
			expect(validateTemplate([{ items: [{ "value=": "" }] }], literals)).toBeDefined();

		});

		it("admits a template and a table under the same collection separately", async () => {

			expect(validateTemplate([{ items: [{ name: "" }] }], shape)).toBeUndefined();
			expect(validateTemplate([{ items: [{ "n=name": "" }] }], shape)).toBeUndefined();

		});

	});

	describe("paging", () => {

		it("admits a page stated from where it starts", async () => {

			expect(validateTemplate([{ tags: ["", { "@": 10, "#": 20 }] }], Product)).toBeUndefined();

		});

		it("reports a page starting nowhere countable", async () => {

			expect(validateTemplate([{ tags: ["", { "@": 1.5 }] }], Product)).toBeDefined();
			expect(validateTemplate([{ tags: ["", { "@": -1 }] }], Product)).toBeDefined();
			expect(validateTemplate([{ tags: ["", { "@": "10" }] }], Product)).toBeDefined();

		});

		it("admits a page of any size where nothing caps it", async () => {

			expect(validateTemplate([{ tags: ["", { "#": 0 }] }], Product)).toBeUndefined();
			expect(validateTemplate([{ tags: ["", { "#": 1000 }] }], Product)).toBeUndefined();

		});

	});

	describe("polymorphic forms", () => {

		const A = resource({ name: required(string()) });
		const B = resource({ size: required(integer()) });

		const shape = resource({
			value: optional(union(A, B)),
			values: multiple(union(A, B)),
			literal: optional(union(string(), integer()))
		});

		it("refuses a placeholder stated plainly over alternatives", async () => {

			expect(validateTemplate([{ literal: "" }], shape)).toBeDefined();
			expect(validateTemplate([{ value: { name: "" } }], shape)).toBeDefined();

		});

		it("refuses a branch map keyed by anything but a branch index", async () => {

			expect(validateTemplate([{ value: { a: { name: "" } } }], shape)).toBeDefined();
			expect(validateTemplate([{ value: { "-1": { name: "" } } }], shape)).toBeDefined();

		});

		it("admits a branch map naming some alternatives alone", async () => {

			expect(validateTemplate([{ value: { "0": { name: "" } } }], shape)).toBeUndefined();
			expect(validateTemplate([{ value: { "1": { size: 0 } } }], shape)).toBeUndefined();

		});

		it("admits a branch map over plain alternatives", async () => {

			expect(validateTemplate([{ literal: { "0": "", "1": 0 } }], shape)).toBeUndefined();

		});

		it("refuses a branch no alternative admits", async () => {

			expect(validateTemplate([{ literal: { "0": true } }], shape)).toBeDefined();

		});

		it("refuses a collection stated as a branch map alone", async () => {

			expect(validateTemplate([{ values: { "0": { name: "" } } }], shape)).toBeDefined();

		});

		it("refuses a single value stated as a collection", async () => {

			expect(validateTemplate([{ value: [{ "0": { name: "" } }] }], shape)).toBeDefined();

		});

		it("searches every textual alternative at once", async () => {

			const collection = resource({
				items: multiple(reference(resource({ of: required(union(string(), integer())) })))
			});

			expect(validateTemplate([{ items: [{}, { "~of": "wid" }] }], collection)).toBeUndefined();

		});

		it("refuses a search where no alternative carries text", async () => {

			const collection = resource({
				items: multiple(reference(resource({ of: required(union(integer(), boolean())) })))
			});

			expect(validateTemplate([{ items: [{}, { "~of": "wid" }] }], collection)).toBeDefined();

		});

		it("singles out one alternative per bound", async () => {

			const collection = resource({
				items: multiple(reference(resource({ of: required(union(string(), integer())) })))
			});

			expect(validateTemplate([{ items: [{}, { ">=of": 1 }] }], collection)).toBeUndefined();
			expect(validateTemplate([{ items: [{}, { ">=of": true }] }], collection)).toBeDefined();

		});

		it("admits a link among the alternatives, asked for either way", async () => {

			const collection = resource({
				items: multiple(reference(resource({ of: required(union(string(), reference(Vendor))) })))
			});

			expect(validateTemplate([{ items: [{ of: { "0": "", "1": "app:/vendors/1" } }] }], collection))
				.toBeUndefined();

			expect(validateTemplate([{ items: [{ of: { "1": { name: "" } } }] }], collection)).toBeUndefined();

		});

	});

	describe("localised members", () => {

		it("refuses a localised member asked for as a collection", async () => {

			const shape = resource({ labels: multiple(dictionary({ uniqueLang: true })) });

			expect(validateTemplate([{ labels: [{ en: "" }] }], shape)).toBeDefined();

		});

		it("refuses a selection operator among the tags wanted", async () => {

			expect(validateTemplate([{ label: { en: "", "~": "wid" } }], Product)).toBeDefined();
			expect(validateTemplate([{ label: { en: "", "#": 10 } }], Product)).toBeDefined();
			expect(validateTemplate([{ label: { "^": "asc" } }], Product)).toBeDefined();

		});

		it("refuses a localised member asked for under a deep tag", async () => {

			expect(validateTemplate([{ label: { "en-US-x-private": "" } }], Product)).toBeUndefined();
			expect(validateTemplate([{ label: { "en_US": "" } }], Product)).toBeDefined();

		});

		it("reads the text of a localised member reached by a selection", async () => {

			const shape = resource({ items: multiple(reference(Product)) });

			expect(validateTemplate([{ items: [{}, { "~label": "wid" }] }], shape)).toBeUndefined();
			expect(validateTemplate([{ items: [{}, { ">=label": "wid" }] }], shape)).toBeUndefined();
			expect(validateTemplate([{ items: [{}, { ">=label": 42 }] }], shape)).toBeDefined();

		});

		it("reads the text of a localised member reached across several steps", async () => {

			const Inner = resource({ label: optional(dictionary({ uniqueLang: true })) });
			const shape = resource({ items: multiple(reference(resource({ inner: required(reference(Inner)) }))) });

			expect(validateTemplate([{ items: [{}, { "~inner.label": "wid" }] }], shape)).toBeUndefined();

		});

		it("refuses a transform text cannot be read through", async () => {

			const shape = resource({ items: multiple(reference(Product)) });

			expect(validateTemplate([{ items: [{ "y=year:label": 0 }] }], shape)).toBeDefined();
			expect(validateTemplate([{ items: [{ "n=length:label": 0 }] }], shape)).toBeUndefined();

		});

	});

	describe("what a slot may be stated as", () => {

		it("refuses a collection stated as a tuple of more than two", async () => {

			expect(validateTemplate([{ tags: ["", {}, {}] }], Product)).toBeDefined();

		});

		it("refuses a collection whose element is a collection in turn", async () => {

			expect(validateTemplate([{ tags: [[""]] }], Product)).toBeDefined();

		});

		it("admits a slot asked for as nothing at all", async () => {

			expect(validateTemplate([{ name: undefined, tags: undefined }], Product)).toBeUndefined();

		});

		it("admits a template asking for nothing at all", async () => {

			expect(validateTemplate([{}], Product)).toBeUndefined();

		});

		it("keys a violation by the member it is asked under", async () => {

			expect(at(validateTemplate([{ size: "" }], Product), "0", "size")).toBeDefined();

		});

		it("keys a violation within a collection by the position it is stated at", async () => {

			expect(at(validateTemplate([{ tags: [0] }], Product), "0", "tags", "0")).toBeDefined();

		});

		it("keys a violation within a selection by the operator stating it", async () => {

			const shape = resource({ items: multiple(reference(Product)) });

			expect(at(validateTemplate([{ items: [{}, { "#": -1 }] }], shape), "0", "items", "#"))
				.toBeDefined();

		});

		it("keys a violation by the identifier the template asked for", async () => {

			const trace = validateTemplate([{ id: "app:/products/1", size: "" }], Product);

			expect(at(trace, "<app:/products/1>", "size")).toBeDefined();

		});

	});

	describe("inherited members", () => {

		it("holds a template to what an extending shape carries", async () => {

			const Base = resource({ name: required(string()) });
			const shape = resource(Base, { size: optional(integer()) });

			expect(validateTemplate([{ name: "", size: 0 }], shape)).toBeUndefined();
			expect(validateTemplate([{ name: 0 }], shape)).toBeDefined();

		});

		it("holds a template to a member an extending shape tightened", async () => {

			const Base = resource({ code: required(union(string(), integer())) });
			const shape = resource(Base, { code: required(integer()) });

			expect(validateTemplate([{ code: 0 }], shape)).toBeUndefined();
			expect(validateTemplate([{ code: "" }], shape)).toBeDefined();

		});

	});

	describe("depth", () => {

		it("admits the identifier naming a resource at the last step", async () => {

			expect(validateTemplate([{ vendor: "app:/vendors/1" }], Product, { depth: 0 })).toBeUndefined();

		});

		it("refuses a nested template beyond the nesting allowed", async () => {

			expect(validateTemplate([{ vendor: { name: "" } }], Product, { depth: 0 })).toBeDefined();

		});

		it("admits a nested template within the nesting allowed", async () => {

			expect(validateTemplate([{ vendor: { name: "" } }], Product, { depth: 1 })).toBeUndefined();

		});

		it("refuses a path longer than the nesting allowed", async () => {

			const shape = resource({ items: multiple(reference(Product)) });

			expect(validateTemplate([{ items: [{ "v=vendor.name": "" }] }], shape, { depth: 1 })).toBeDefined();

		});

	});

});

describe("validateResult", () => {

	const Vendor = resource({ id: id(), name: required(string()) });

	const Product = resource({
		id: id(),
		name: required(string()),
		tags: multiple(string()),
		vendor: optional(reference(Vendor))
	});

	it("returns undefined for a resource matching what was asked for", async () => {

		expect(validateResult([{ id: "app:/products/1", name: "Widget" }], {
			shape: Product,
			model: { id: "", name: "" }
		})).toBeUndefined();

	});

	it("returns undefined for empty values", async () => {

		expect(validateResult([], { shape: Product, model: { name: "" } })).toBeUndefined();

	});

	it("reports a value that is not a resource", async () => {

		expect(validateResult([42], { shape: Product, model: { name: "" } }))
			.toContainEqual(expect.stringContaining("{kind}"));

	});

	describe("partial retrieval", () => {

		it("leaves a member the template didn't ask for unchecked", async () => {

			// name is required by the shape, but unrequested, so its absence is not a violation

			expect(validateResult([{ id: "app:/products/1" }], {
				shape: Product,
				model: { id: "" }
			})).toBeUndefined();

		});

		it("holds a member the template asked for to the shape", async () => {

			expect(validateResult([{ name: 42 }], { shape: Product, model: { name: "" } })).toBeDefined();

		});

		it("reports a member the template named but the shape doesn't declare", async () => {

			expect(validateResult([{}], { shape: Product, model: { nope: "" } })).toBeDefined();

		});

		it("reports a member the resource states but the template didn't ask for", async () => {

			expect(validateResult([{ name: "Widget", tags: ["a"] }], {
				shape: Product,
				model: { name: "" }
			})).toBeDefined();

		});

	});

	describe("identifier", () => {

		it("holds the identifier to the stated entry", async () => {

			expect(validateResult([{ id: "app:/1" }], { shape: Product, model: { id: "" }, entry: "app:/1" }))
				.toBeUndefined();

			expect(validateResult([{ id: "app:/2" }], { shape: Product, model: { id: "" }, entry: "app:/1" }))
				.toBeDefined();

		});

		it("keys a violation by the identifier the resource states", async () => {

			expect(validateResult([{ id: "app:/products/1", name: 42 }], {
				shape: Product,
				model: { id: "", name: "" }
			})).toEqual([{ "<app:/products/1>": expect.anything() }]);

		});

	});

	describe("cardinality", () => {

		it("reports a single value where an array was asked for", async () => {

			expect(validateResult([{ tags: "a" }], { shape: Product, model: { tags: [""] } })).toBeDefined();

		});

		it("reports an array where a single value was asked for", async () => {

			expect(validateResult([{ name: ["a"] }], { shape: Product, model: { name: "" } })).toBeDefined();

		});

		it("admits an array for a repeated member", async () => {

			expect(validateResult([{ tags: ["a", "b"] }], { shape: Product, model: { tags: [""] } }))
				.toBeUndefined();

		});

	});

	describe("linked resources", () => {

		it("admits a link stated as an identifier", async () => {

			expect(validateResult([{ vendor: "app:/vendors/1" }], {
				shape: Product,
				model: { vendor: "" }
			})).toBeUndefined();

		});

		it("rejects a link stated as a relative reference", async () => {

			expect(validateResult([{ vendor: "/vendors/1" }], {
				shape: Product,
				model: { vendor: "" }
			})).toBeDefined();

		});

		it("admits a link expanded to the resource it points at", async () => {

			expect(validateResult([{ vendor: { id: "app:/vendors/1", name: "Acme" } }], {
				shape: Product,
				model: { vendor: { id: "", name: "" } }
			})).toBeUndefined();

		});

		it("holds an expanded link to the nested template", async () => {

			expect(validateResult([{ vendor: { id: "app:/vendors/1", name: 42 } }], {
				shape: Product,
				model: { vendor: { id: "", name: "" } }
			})).toBeDefined();

		});

		it("reports a member the expansion states but the nested template didn't ask for", async () => {

			expect(validateResult([{ vendor: { id: "app:/vendors/1", name: "Acme" } }], {
				shape: Product,
				model: { vendor: { id: "" } }
			})).toBeDefined();

		});

	});

	describe("embedded resources", () => {

		const Rating = resource({ average: required(number()) });
		const Rated = resource({ rating: optional(Rating) });

		it("admits an embedded resource matching the nested template", async () => {

			expect(validateResult([{ rating: { average: 4 } }], {
				shape: Rated,
				model: { rating: { average: 0 } }
			})).toBeUndefined();

		});

		it("holds an embedded resource to the nested template", async () => {

			expect(validateResult([{ rating: { average: "high" } }], {
				shape: Rated,
				model: { rating: { average: 0 } }
			})).toBeDefined();

		});

	});

	describe("vacuous slots", () => {

		it("skips a slot the template leaves empty", async () => {

			expect(validateResult([{ vendor: { id: "app:/vendors/1", name: "Acme" } }], {
				shape: Product,
				model: { vendor: {} }
			})).toBeUndefined();

		});

	});

	describe("collections", () => {

		const shape = resource({ vendors: multiple(reference(Vendor)) });

		it("holds every resource a collection brought back to the template", async () => {

			expect(validateResult([{ vendors: [{ name: "Acme" }, { name: "Globex" }] }], {
				shape,
				model: { vendors: [{ name: "" }] }
			})).toBeUndefined();

		});

		it("keys a violation by the resource carrying it", async () => {

			const trace = validateResult([{
				vendors: [{ id: "app:/vendors/1", name: "Acme" }, { id: "app:/vendors/2", name: 42 }]
			}], {
				shape,
				model: { vendors: [{ id: "", name: "" }] }
			});

			expect(at(trace, "0", "vendors")).toBeDefined();

		});

		it("admits a collection brought back empty", async () => {

			expect(validateResult([{ vendors: [] }], { shape, model: { vendors: [{ name: "" }] } }))
				.toBeUndefined();

		});

		it("reports a collection brought back as a single resource", async () => {

			expect(validateResult([{ vendors: { name: "Acme" } }], {
				shape,
				model: { vendors: [{ name: "" }] }
			})).toBeDefined();

		});

		it("leaves the selection the template stated out of what comes back", async () => {

			expect(validateResult([{ vendors: [{ name: "Acme" }] }], {
				shape,
				model: { vendors: [{ name: "" }, { "#": 10 }] }
			})).toBeUndefined();

		});

	});

	describe("custom checks", () => {

		it("passes a resource every check admits", async () => {

			const shape = resource({ name: required(string()) }, { validators: [() => undefined] });

			expect(validateResult([{ name: "Widget" }], { shape, model: { name: "" } })).toBeUndefined();

		});

		it("reports what a check finds, keyed by the name of the check", async () => {

			function rated(resource: Resource): Optional<Trace> {
				return resource["name"] === "Widget" ? undefined : ["expected a widget"];
			}

			const shape = resource({ name: required(string()) }, { validators: [rated] });

			expect(at(validateResult([{ name: "Gadget" }], { shape, model: { name: "" } }), "0", "{rated}"))
				.toEqual(["expected a widget"]);

		});

		it("runs the checks a shape inherits", async () => {

			const Base = resource({ name: required(string()) }, {
				validators: [function inherited() { return ["inherited"]; }]
			});

			const shape = resource(Base, {});

			expect(at(validateResult([{ name: "Widget" }], { shape, model: { name: "" } }), "0", "{inherited}"))
				.toEqual(["inherited"]);

		});

	});

});
