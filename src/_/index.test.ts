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

import { type Optional } from "@metreeca/core";
import type { Relay } from "@metreeca/core/relay";
import { type Trace, TraceError } from "@metreeca/core/trace";
import { describe, expect, it } from "vitest";
import { dictionary } from "./dictionary/index.js";
import { enforce } from "./index.core.js";
import { validate } from "./index.js";
import { integer } from "./number/index.js";
import { reference } from "./reference/index.js";
import { id, multiple, optional, required, resource } from "./resource/index.js";
import { string } from "./string/index.js";
import { union } from "./union/index.js";


describe("validate", () => {

	// the value where it passed, or undefined where it didn't

	function value(relay: Relay<{ readonly value: unknown, readonly trace: Optional<Trace> }>): unknown {
		return relay({ value: value => value, trace: () => undefined });
	}

	// the trace where it didn't pass, or undefined where it did

	function trace(relay: Relay<{ readonly value: unknown, readonly trace: Optional<Trace> }>): Optional<Trace> {
		return relay({ value: () => undefined, trace: trace => trace });
	}


	const Vendor = resource({ id: id(), name: required(string()) });

	const Product = resource({
		id: id(),
		name: required(string()),
		size: optional(integer()),
		tags: multiple(string()),
		vendor: optional(reference(Vendor))
	});


	describe("a resource in its own right", () => {

		it("hands back the resource it admits", async () => {

			expect(value(validate({ id: "app:/products/1", name: "Widget" }, { shape: Product })))
				.toEqual({ id: "app:/products/1", name: "Widget" });

		});

		it("reports what a resource states wrongly", async () => {

			expect(trace(validate({ name: 42 }, { shape: Product }))).toBeDefined();

		});

		it("reports a member the shape doesn't declare", async () => {

			expect(trace(validate({ name: "Widget", unknown: "x" }, { shape: Product }))).toBeDefined();

		});

		it("reports a member the shape requires and the resource leaves out", async () => {

			expect(trace(validate({ id: "app:/products/1" }, { shape: Product }))).toBeDefined();

		});

		it("reports a value that is not a resource at all", async () => {

			expect(trace(validate("Widget", { shape: Product }))).toBeDefined();
			expect(trace(validate([{ name: "Widget" }], { shape: Product }))).toBeDefined();

		});

		it("holds the resource to the identifier it is expected to be named by", async () => {

			const stated = { id: "app:/products/1", name: "Widget" };

			expect(value(validate(stated, { shape: Product, entry: "app:/products/1" }))).toEqual(stated);
			expect(trace(validate(stated, { shape: Product, entry: "app:/products/2" }))).toBeDefined();

		});

		it("hands back a resource that cannot be written through", async () => {

			// ;(cast) the relay hands back an unknown, which this test writes through on purpose

			const validated = value(validate({ name: "Widget" }, { shape: Product })) as Record<string, unknown>;

			expect(() => { validated["name"] = "Gadget"; }).toThrow();

		});

		it("resolves a shape deferred to break a definition cycle", async () => {

			expect(value(validate({ name: "Widget" }, { shape: () => Product }))).toEqual({ name: "Widget" });

		});

		it("settles a second validation on the same terms off the first", async () => {

			const validated = value(validate({ name: "Widget" }, { shape: Product }));

			expect(value(validate(validated, { shape: Product }))).toBe(validated);

		});

		it("validates again where the terms tightened", async () => {

			const validated = value(validate({ vendor: "app:/vendors/1", name: "Widget" }, { shape: Product }));

			expect(value(validate(validated, { shape: Product, entry: "app:/products/1" }))).not.toBe(validated);

		});

	});

	describe("arbitrary input", () => {

		const shape = resource({ name: optional(string()), size: optional(integer()), tags: multiple(string()) });

		it.each<[string, unknown]>([
			["a date", new Date()],
			["a pattern", /pattern/],
			["a map", new Map()],
			["a set", new Set()],
			["an error", new Error("boom")],
			["an object of no prototype", Object.create(null)],
			["an instance of a class", new (class { name = "Widget"; })()]
		])("refuses %s in place of a resource", async (_label, stated) => {

			expect(trace(validate(stated, { shape }))).toBeDefined();
			expect(trace(validate(stated, { shape, model: true }))).toBeDefined();

		});

		it.each<[string, unknown]>([
			["nothing at all", null],
			["nothing stated", undefined],
			["a string", "Widget"],
			["a number", 42],
			["a boolean", true],
			["a set of resources", [{ name: "Widget" }]],
			["a function", () => undefined],
			["a symbol", Symbol("Widget")],
			["a big integer", BigInt(1)]
		])("refuses %s in place of a resource", async (_label, stated) => {

			expect(trace(validate(stated, { shape }))).toBeDefined();
			expect(trace(validate(stated, { shape, model: true }))).toBeDefined();

		});

		it.each<[string, string]>([
			["a hyphen", "foo-bar"],
			["a dot", "foo.bar"],
			["a keyword", "@id"],
			["a prefix", "ns:prop"],
			["digits alone", "123"]
		])("refuses a member name carrying %s", async (_label, name) => {

			expect(trace(validate({ [name]: "Widget" }, { shape }))).toBeDefined();
			expect(trace(validate({ [name]: "" }, { shape, model: true }))).toBeDefined();

		});

		it.each<[string, unknown]>([
			["a function", () => undefined],
			["a symbol", Symbol("Widget")],
			["a big integer", BigInt(1)],
			["a date", new Date()],
			["a pattern", /pattern/],
			["a map", new Map()]
		])("refuses %s stated under a member", async (_label, stated) => {

			expect(trace(validate({ name: stated }, { shape }))).toBeDefined();
			expect(trace(validate({ name: stated }, { shape, model: true }))).toBeDefined();

		});

		it.each<[string, number]>([
			["not a number at all", Number.NaN],
			["beyond counting", Number.POSITIVE_INFINITY],
			["below counting", Number.NEGATIVE_INFINITY]
		])("refuses a number %s", async (_label, stated) => {

			expect(trace(validate({ size: stated }, { shape }))).toBeDefined();
			expect(trace(validate({ size: stated }, { shape, model: true }))).toBeDefined();

		});

		it.each<[string, unknown]>([
			["nothing at all", null],
			["nothing stated", undefined],
			["a date", new Date()],
			["not a number at all", Number.NaN]
		])("refuses %s within a set", async (_label, stated) => {

			expect(trace(validate({ tags: [stated] }, { shape }))).toBeDefined();

		});

		it("refuses what a nested slot states wrongly", async () => {

			const Inner = resource({ label: optional(string()) });
			const nested = resource({ child: optional(reference(Inner)) });

			expect(trace(validate({ child: { "bad-key": "x" } }, { shape: nested, model: true }))).toBeDefined();
			expect(trace(validate({ child: new Date() }, { shape: nested }))).toBeDefined();

		});

		it("admits a resource parsed straight out of JSON", async () => {

			const stated = JSON.stringify({ name: "Widget", size: 30, tags: ["a", "b"] });

			expect(value(validate(JSON.parse(stated), { shape })))
				.toEqual({ name: "Widget", size: 30, tags: ["a", "b"] });

		});

		describe("prototype pollution", () => {

			it("refuses a member the shape doesn't declare, however it was stated", async () => {

				// JSON.parse states __proto__ as a member of its own rather than as the prototype, so it is read
				// like any other member and refused by the closed shape

				expect(trace(validate(JSON.parse("{\"__proto__\": \"value\"}"), { shape }))).toBeDefined();

			});

			it("refuses a resource stating through a prototype rather than in its own right", async () => {

				const inherited: Record<string, unknown> = Object.create({ name: "inherited" });

				inherited["name"] = "own";

				expect(trace(validate(inherited, { shape }))).toBeDefined();

			});

		});

	});

	describe("a retrieval", () => {

		it("hands back the resource the template asked for", async () => {

			const retrieved = { id: "app:/products/1", name: "Widget" };

			expect(value(validate(retrieved, { shape: Product, model: { id: "", name: "" } })))
				.toEqual(retrieved);

		});

		it("leaves a member the template didn't ask for unchecked", async () => {

			expect(value(validate({ id: "app:/products/1" }, { shape: Product, model: { id: "" } })))
				.toEqual({ id: "app:/products/1" });

		});

		it("reports a member the template didn't ask for", async () => {

			expect(trace(validate({ id: "app:/products/1", name: "Widget" }, {
				shape: Product,
				model: { id: "" }
			}))).toBeDefined();

		});

		it("holds a member the template asked for to the shape", async () => {

			expect(trace(validate({ name: 42 }, { shape: Product, model: { name: "" } }))).toBeDefined();

		});

		it("holds the resource to the identifier it is expected to be named by", async () => {

			const retrieved = { id: "app:/products/1" };

			expect(trace(validate(retrieved, {
				shape: Product,
				model: { id: "" },
				entry: "app:/products/2"
			}))).toBeDefined();

		});

		it("leaves a member the shape requires and the template didn't ask for unchecked", async () => {

			const shape = resource({ name: required(string()), size: required(integer()) });

			expect(value(validate({ size: 42 }, { shape, model: { size: 0 } })))
				.toEqual({ size: 42 });

		});

		it("leaves several such members unchecked at once", async () => {

			const shape = resource({
				a: required(string()),
				b: required(string()),
				c: required(integer())
			});

			expect(value(validate({ c: 42 }, { shape, model: { c: 0 } })))
				.toEqual({ c: 42 });

		});

		it("admits a link brought back as the identifier naming it", async () => {

			const retrieved = { vendor: "app:/vendors/1" };

			expect(value(validate(retrieved, { shape: Product, model: { vendor: "" } })))
				.toEqual(retrieved);

		});

		it("admits a link brought back as the resource behind it", async () => {

			const retrieved = { vendor: { id: "app:/vendors/1", name: "Acme" } };

			expect(value(validate(retrieved, { shape: Product, model: { vendor: { id: "", name: "" } } })))
				.toEqual(retrieved);

		});

		it("holds the resource behind a link to what the nested template asked for", async () => {

			expect(trace(validate({ vendor: { id: "app:/vendors/1", name: "Acme" } }, {
				shape: Product,
				model: { vendor: { id: "" } }
			}))).toBeDefined();

		});

		it("holds the resource behind a link to the shape of its target", async () => {

			expect(trace(validate({ vendor: { name: 42 } }, {
				shape: Product,
				model: { vendor: { name: "" } }
			}))).toBeDefined();

		});

		it("hands back a resource that cannot be written through", async () => {

			// ;(cast) the relay hands back an unknown, which this test writes through on purpose

			const validated = value(validate({ name: "Widget" }, {
				shape: Product,
				model: { name: "" }
			})) as Record<string, unknown>;

			expect(() => { validated["name"] = "Gadget"; }).toThrow();

		});

		it("settles a second validation on the same template off the first", async () => {

			const validated = value(validate({ name: "Widget" }, { shape: Product, model: { name: "" } }));

			expect(value(validate(validated, { shape: Product, model: { name: "" } }))).toBe(validated);

		});

		it("validates again where another template is asked about", async () => {

			const validated = value(validate({ name: "Widget" }, { shape: Product, model: { name: "" } }));

			expect(trace(validate(validated, { shape: Product, model: { size: 0 } }))).toBeDefined();

		});

	});

	describe("the page a retrieval template is held to", () => {

		it("holds every collection a template asks for to the page served", async () => {

			const Inner = resource({ id: id(), tags: multiple(string()) });
			const shape = resource({ items: multiple(reference(Inner)) });

			expect(value(validate({ items: [{ tags: [""] }] }, { shape, model: true, limit: 10 })))
				.toEqual({ items: [{ tags: ["", { "#": 10 }] }, { "#": 10 }] });

		});

		it("holds a collection stated as a branch map to the page served", async () => {

			const A = resource({ id: id(), name: required(string()) });
			const B = resource({ id: id(), tags: multiple(string()) });
			const shape = resource({ items: multiple(union(A, B)) });

			expect(value(validate({ items: [{ "1": { tags: [""] } }] }, { shape, model: true, limit: 10 })))
				.toEqual({ items: [{ "1": { tags: ["", { "#": 10 }] } }, { "#": 10 }] });

		});

		it("holds a collection asked for as a table to the page served", async () => {

			const shape = resource({ items: multiple(reference(Product)) });

			expect(value(validate({ items: [{ "n=name": "" }] }, { shape, model: true, limit: 10 })))
				.toEqual({ items: [{ "n=name": "" }, { "#": 10 }] });

		});

		it("leaves a single value alone, which nothing pages", async () => {

			expect(value(validate({ name: "", vendor: { name: "" } }, { shape: Product, model: true, limit: 10 })))
				.toEqual({ name: "", vendor: { name: "" } });

		});

		it("leaves a localised value alone, which nothing pages", async () => {

			const shape = resource({ label: optional(dictionary({ uniqueLang: true })) });

			expect(value(validate({ label: { en: "" } }, { shape, model: true, limit: 10 })))
				.toEqual({ label: { en: "" } });

		});

		it("leaves the template alone where the page is left to the caller", async () => {

			expect(value(validate({ tags: [""] }, { shape: Product, model: true, limit: 0 })))
				.toEqual({ tags: [""] });

		});

	});

	describe("a retrieval template", () => {

		it("hands back the template the shape can serve", async () => {

			expect(value(validate({ id: "", name: "" }, { shape: Product, model: true })))
				.toEqual({ id: "", name: "" });

		});

		it("reports a slot naming a member the shape doesn't declare", async () => {

			expect(trace(validate({ unknown: "" }, { shape: Product, model: true }))).toBeDefined();

		});

		it("leaves the value domain alone, a placeholder standing for a value", async () => {

			const shape = resource({ size: optional(integer({ minInclusive: 10 })) });

			expect(value(validate({ size: 0 }, { shape, model: true }))).toEqual({ size: 0 });

		});

		it("refuses the transforms combining values where asked to", async () => {

			const shape = resource({ items: multiple(reference(Product)) });
			const template = { items: [{ "n=count:name": 0 }] };

			expect(value(validate(template, { shape, model: true }))).toBeDefined();
			expect(trace(validate(template, { shape, model: true, plain: true }))).toBeDefined();

		});

		it("caps the nesting a template may ask for", async () => {

			expect(value(validate({ vendor: "app:/vendors/1" }, { shape: Product, model: true, depth: 0 })))
				.toEqual({ vendor: "app:/vendors/1" });

			expect(trace(validate({ vendor: { name: "" } }, { shape: Product, model: true, depth: 0 })))
				.toBeDefined();

		});

		it("refuses a page larger than the one served", async () => {

			expect(trace(validate({ tags: ["", { "#": 100 }] }, { shape: Product, model: true, limit: 10 })))
				.toBeDefined();

		});

		it("holds a collection asking for no page to the one served", async () => {

			expect(value(validate({ tags: [""] }, { shape: Product, model: true, limit: 10 })))
				.toEqual({ tags: ["", { "#": 10 }] });

		});

		it("leaves a page the template asked for alone", async () => {

			expect(value(validate({ tags: ["", { "#": 5 }] }, { shape: Product, model: true, limit: 10 })))
				.toEqual({ tags: ["", { "#": 5 }] });

		});

		it("hands back a template that cannot be written through", async () => {

			// ;(cast) the relay hands back an unknown, which this test writes through on purpose

			const validated = value(validate({ name: "" }, { shape: Product, model: true })) as Record<string, unknown>;

			expect(() => { validated["name"] = [true]; }).toThrow();

		});

		it("hands back a template stated apart from the one it was given", async () => {

			const stated = { name: "" };

			expect(value(validate(stated, { shape: Product, model: true }))).not.toBe(stated);
			expect(value(validate(stated, { shape: Product, model: true }))).toEqual(stated);

		});

		it("settles a second validation on the same terms off the first", async () => {

			const validated = value(validate({ name: "" }, { shape: Product, model: true }));

			expect(value(validate(validated, { shape: Product, model: true }))).toBe(validated);

		});

		it("settles a second validation where the page served loosened", async () => {

			const validated = value(validate({ tags: [""] }, { shape: Product, model: true, limit: 10 }));

			expect(value(validate(validated, { shape: Product, model: true, limit: 100 }))).toBe(validated);

		});

		it("validates again where the page served tightened", async () => {

			const validated = value(validate({ tags: [""] }, { shape: Product, model: true, limit: 100 }));

			expect(trace(validate(validated, { shape: Product, model: true, limit: 10 }))).toBeDefined();

		});

		it("validates again where the nesting allowed tightened", async () => {

			const validated = value(validate({ vendor: { name: "" } }, { shape: Product, model: true, depth: 1 }));

			expect(trace(validate(validated, { shape: Product, model: true, depth: 0 }))).toBeDefined();

		});

		it("validates again where the terms tightened", async () => {

			const validated = value(validate({ name: "" }, { shape: Product, model: true }));

			expect(value(validate(validated, { shape: Product, model: true, plain: true }))).not.toBe(validated);

		});

		it("tells a template apart from a resource on the same shape", async () => {

			// a nested template stands for the resource behind a link, which the link itself never admits

			const validated = value(validate({ vendor: { name: "" } }, { shape: Product, model: true }));

			expect(validated).toEqual({ vendor: { name: "" } });
			expect(trace(validate(validated, { shape: Product }))).toBeDefined();

		});

	});

});

describe("enforce", () => {

	const limit = 100;

	const Vendor = resource({ id: id(), name: required(string()), tags: multiple(string()) });

	const Product = resource({
		name: required(string()),
		size: optional(integer()),
		tags: multiple(string()),
		label: optional(dictionary({ uniqueLang: true })),
		vendor: optional(reference(Vendor)),
		vendors: multiple(reference(Vendor))
	});

	it("leaves the template alone where no page is served", async () => {

		expect(enforce({ tags: [""] }, Product)).toEqual({ tags: [""] });
		expect(enforce({ tags: [""] }, Product, { limit: 0 })).toEqual({ tags: [""] });

	});

	it("leaves a malformed template alone", async () => {

		expect(enforce(42, Product, { limit })).toBe(42);
		expect(enforce({ unknown: "" }, Product, { limit })).toEqual({ unknown: "" });

	});

	describe("single values", () => {

		it("leaves a placeholder alone", async () => {

			expect(enforce({ name: "", size: 0 }, Product, { limit })).toEqual({ name: "", size: 0 });

		});

		it("leaves an identifier standing for a link alone", async () => {

			expect(enforce({ vendor: "app:/vendors/1" }, Product, { limit }))
				.toEqual({ vendor: "app:/vendors/1" });

		});

		it("leaves a localised value alone", async () => {

			expect(enforce({ label: { en: "" } }, Product, { limit })).toEqual({ label: { en: "" } });

		});

		it("descends into the template behind a link", async () => {

			expect(enforce({ vendor: { tags: [""] } }, Product, { limit }))
				.toEqual({ vendor: { tags: ["", { "#": limit }] } });

		});

	});

	describe("collections", () => {

		it("pages a collection of placeholders", async () => {

			expect(enforce({ tags: [""] }, Product, { limit })).toEqual({ tags: ["", { "#": limit }] });

		});

		it("pages a collection of templates", async () => {

			expect(enforce({ vendors: [{ name: "" }] }, Product, { limit }))
				.toEqual({ vendors: [{ name: "" }, { "#": limit }] });

		});

		it("leaves a page the client stated alone", async () => {

			expect(enforce({ tags: ["", { "#": 25 }] }, Product, { limit }))
				.toEqual({ tags: ["", { "#": 25 }] });

		});

		it("keeps the rest of a selection the client stated", async () => {

			expect(enforce({ tags: ["", { "~": "wid" }] }, Product, { limit }))
				.toEqual({ tags: ["", { "~": "wid", "#": limit }] });

		});

		it("pages a collection nested within a paged one", async () => {

			expect(enforce({ vendors: [{ tags: [""] }, { "#": 25 }] }, Product, { limit }))
				.toEqual({ vendors: [{ tags: ["", { "#": limit }] }, { "#": 25 }] });

		});

		it("leaves a localised member alone however many maps it admits", async () => {

			const shape = resource({ labels: multiple(dictionary({ uniqueLang: true })) });

			expect(enforce({ labels: { en: "" } }, shape, { limit })).toEqual({ labels: { en: "" } });

		});

	});

	describe("polymorphic members", () => {

		const A = resource({ name: required(string()) });
		const B = resource({ tags: multiple(string()) });

		const shape = resource({
			value: optional(union(A, B)),
			values: multiple(union(A, B))
		});

		it("descends into each branch of a single value", async () => {

			expect(enforce({ value: { "0": { name: "" }, "1": { tags: [""] } } }, shape, { limit }))
				.toEqual({ value: { "0": { name: "" }, "1": { tags: ["", { "#": limit }] } } });

		});

		it("pages a collection stated as a branch map", async () => {

			expect(enforce({ values: [{ "1": { tags: [""] } }] }, shape, { limit }))
				.toEqual({ values: [{ "1": { tags: ["", { "#": limit }] } }, { "#": limit }] });

		});

		it("leaves a branch the union doesn't declare alone", async () => {

			expect(enforce({ value: { "7": { name: "" } } }, shape, { limit }))
				.toEqual({ value: { "7": { name: "" } } });

		});

	});

	describe("projections", () => {

		it("pages a collection asked for under a column", async () => {

			expect(enforce({ vendors: [{ "t=tags": [""] }] }, Product, { limit }))
				.toEqual({ vendors: [{ "t=tags": ["", { "#": limit }] }, { "#": limit }] });

		});

	});

});
