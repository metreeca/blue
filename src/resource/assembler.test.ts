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
import { TraceError, type Validator } from "@metreeca/core/trace";
import type { Resource } from "@metreeca/qest/resource";
import { describe, expect, it } from "vitest";
import { boolean } from "../boolean/index.js";
import { number } from "../number/index.js";
import { getShapeTarget, reference } from "../reference/index.js";
import { string } from "../string/index.js";
import { union } from "../union/index.js";
import { getShapeProperties } from "./accessors.js";
import {
	checkBounds,
	checkParents,
	checkPredicates,
	checkResource,
	checkSingletons,
	flatten,
	mergeProperty,
	mergeResource,
	narrowsProperty,
	narrowsResource
} from "./assembler.js";
import {
	id,
	multiple,
	optional,
	property,
	type Property,
	required,
	resource,
	type ResourceShape
} from "./index.js";


const schema = createNamespace("https://schema.org/");


function getProperty(shape: ResourceShape, name: string) {

	const member = shape.members[name];

	return member?.kind === "property" ? member : undefined;

}


describe("flatten", () => {

	it("carries the members of a shape extending nothing through", async () => {

		const shape = resource({ name: required(string()), size: optional(number()) });

		expect(Object.keys(flatten(shape).members).sort()).toEqual(["name", "size"]);

	});

	it("merges the members of the shapes extended in", async () => {

		const Base = resource({ name: required(string()) });

		expect(Object.keys(flatten(resource(Base, { size: optional(number()) })).members).sort())
			.toEqual(["name", "size"]);

	});

	it("settles a shape already flattened as it stands", async () => {

		const shape = resource({ name: required(string()) });

		expect(flatten(shape)).toBe(shape);

	});

	it("merges what a shape inherits, the factory having stated none of it", async () => {

		const Base = resource({ label: required(string()) });

		// stated as a literal, so that flattening is what merges the shape rather than the factory

		const stated: ResourceShape = { kind: "resource", classes: [], parents: [Base], members: {} };

		expect(Object.keys(flatten(stated).members)).toEqual(["label"]);

	});

	it("merges the shapes a member reaches in turn", async () => {

		const Base = resource({ label: required(string()) });

		const nested: ResourceShape = { kind: "resource", classes: [], parents: [Base], members: {} };

		const shape = flatten({
			kind: "resource", classes: [], parents: [],
			members: { nested: required(nested) }
		});

		expect(Object.keys(getShapeProperties(getProperty(shape, "nested")!.shape))).toEqual(["label"]);

	});

	it("reports a merged shape stating two identifiers", async () => {

		const One = resource({ one: id() });
		const Other = resource({ other: id() });

		expect(() => flatten(resource(One, Other, {}))).toThrow(TraceError);

	});

	describe("inheritance", () => {

		it("carries the members of the shapes it extends", async () => {

			const Base = resource({ id: id(), name: required(string()) });
			const shape = resource(Base, { code: required(string()) });

			expect(Object.keys(shape.members).sort()).toEqual(["code", "id", "name"]);

		});

		it("carries the members of every shape it extends", async () => {

			const Named = resource({ name: required(string()) });
			const Coded = resource({ code: required(string()) });

			expect(Object.keys(resource(Named, Coded, {}).members).sort()).toEqual(["code", "name"]);

		});

		it("carries the members of a shape reached transitively", async () => {

			const Base = resource({ name: required(string()) });
			const Middle = resource(Base, { code: required(string()) });
			const shape = resource(Middle, { note: optional(string()) });

			expect(Object.keys(shape.members).sort()).toEqual(["code", "name", "note"]);

		});

		it("resolves a deferred extended shape", async () => {

			const Base = resource({ name: required(string()) });
			const shape = resource(() => Base, {});

			expect(Object.keys(shape.members)).toEqual(["name"]);

		});

		it("narrows a member the extending shape redeclares", async () => {

			const Base = resource({ name: required(string()) });
			const shape = resource(Base, { name: required(string({ minLength: 1 })) });

			expect(getProperty(shape, "name")?.shape).toMatchObject({ minLength: 1 });

		});

		it("rejects a member the extending shape relaxes", async () => {

			const Base = resource({ name: required(string({ minLength: 5 })) });

			expect(() => resource(Base, { name: required(string({ minLength: 1 })) })).toThrow(TraceError);

		});

		it("rejects a member the extending shape retypes", async () => {

			const Base = resource({ name: required(string()) });

			expect(() => resource(Base, { name: required(number()) })).toThrow(TraceError);

		});

		it("rejects extended shapes disagreeing on the space", async () => {

			const One = resource({}, { space: schema });
			const Other = resource({}, { space: createNamespace("https://example.net/") });

			expect(() => resource(One, Other, {})).toThrow(TraceError);

		});

		it("admits extended shapes disagreeing on the space where the child states one", async () => {

			const One = resource({}, { space: schema });
			const Other = resource({}, { space: createNamespace("https://example.net/") });

			expect(() => resource(One, Other, {}, { space: schema })).not.toThrow();

		});

		it("re-points an inherited link at an extending target", async () => {

			const Wider = resource({ id: id() });
			const Narrower = resource(Wider, {});

			const Base = resource({ link: required(reference(Wider)) });
			const shape = resource(Base, { link: required(reference(Narrower)) });

			expect(getShapeTarget(getProperty(shape, "link")?.shape ?? string())).toBe(Narrower);

		});

		it("re-points an inherited link at a target deferred to break a definition cycle", async () => {

			const Wider = resource({ id: id() });
			const Narrower = resource(Wider, {});

			const Base = resource({ link: required(reference(Wider)) });
			const shape = resource(Base, { link: required(reference(() => Narrower)) });

			expect(getShapeTarget(getProperty(shape, "link")?.shape ?? string())).toBe(Narrower);

		});

		it("keeps the inherited target definition without restating it", async () => {

			const Wider = resource({ id: id(), label: required(string()) });
			const Narrower = resource(Wider, { label: required(string({ minLength: 1 })) });

			const Base = resource({ link: required(reference(Wider)) });
			const shape = resource(Base, { link: required(reference(Narrower)) });

			const target = getShapeTarget(getProperty(shape, "link")?.shape ?? string());

			expect(Object.keys(target?.members ?? {})).toEqual(expect.arrayContaining(["id", "label"]));

		});

		it("rejects re-pointing an inherited link at an unrelated target", async () => {

			const Wider = resource({ id: id() }, { pattern: "/wider/{id}" });
			const Unrelated = resource({ id: id() }, { pattern: "/unrelated/{id}" });

			const Base = resource({ link: required(reference(Wider)) });

			expect(() => resource(Base, { link: required(reference(Unrelated)) })).toThrow(TraceError);

		});

		it("narrows an inherited union member by dropping an alternative", async () => {

			const Base = resource({ code: required(union(string(), number())) });
			const shape = resource(Base, { code: required(union(number())) });

			expect(getProperty(shape, "code")?.shape).toMatchObject({ kind: "union" });

		});

		it("narrows an inherited union member to the single alternative it restricts", async () => {

			const Base = resource({ code: required(union(string(), number())) });
			const shape = resource(Base, { code: required(number({ minInclusive: 0 })) });

			expect(getProperty(shape, "code")?.shape).toMatchObject({ kind: "number", minInclusive: 0 });

		});

		it("rejects a member restricting no alternative of an inherited union", async () => {

			const Base = resource({ code: required(union(string(), number())) });

			expect(() => resource(Base, { code: required(boolean()) })).toThrow(TraceError);

		});

		it("rejects a member restricting several alternatives of an inherited union", async () => {

			const Base = resource({ code: required(union(string({ minLength: 1 }), string({ maxLength: 5 }))) });

			expect(() => resource(Base, { code: required(string({ minLength: 2, maxLength: 4 })) }))
				.toThrow(TraceError);

		});

		describe("virtual", () => {

			it("inherits what the extended shape states", async () => {

				const Base = resource({}, { virtual: true });

				expect(resource(Base, {}).virtual).toBe(true);

			});

			it("takes the value the extending shape states", async () => {

				const Base = resource({}, { virtual: true });

				expect(resource(Base, {}, { virtual: false }).virtual).toBe(false);

			});

			it("states none where nothing states one", async () => {

				expect(resource({}).virtual).toBeUndefined();

			});

			it("rejects extended shapes disagreeing", async () => {

				const One = resource({}, { virtual: true });
				const Other = resource({}, { virtual: false });

				expect(() => resource(One, Other, {})).toThrow(TraceError);

			});

			it("admits extended shapes disagreeing where the extending shape states a value", async () => {

				const One = resource({}, { virtual: true });
				const Other = resource({}, { virtual: false });

				expect(() => resource(One, Other, {}, { virtual: true })).not.toThrow();

			});

		});

		describe("hidden", () => {

			it("inherits what the extended shape states", async () => {

				const Base = resource({ name: required(string(), { hidden: true }) });

				expect(getProperty(resource(Base, {}), "name")?.hidden).toBe(true);

			});

			it("takes the value the extending shape states", async () => {

				const Base = resource({ name: required(string(), { hidden: true }) });
				const shape = resource(Base, { name: required(string(), { hidden: false }) });

				expect(getProperty(shape, "name")?.hidden).toBe(false);

			});

			it("rejects extended shapes disagreeing", async () => {

				const One = resource({ name: required(string(), { hidden: true }) });
				const Other = resource({ name: required(string()) });

				expect(() => resource(One, Other, {})).toThrow(TraceError);

			});

			it("admits extended shapes disagreeing where the extending shape states a value", async () => {

				const One = resource({ name: required(string(), { hidden: true }) });
				const Other = resource({ name: required(string()) });

				expect(() => resource(One, Other, { name: required(string(), { hidden: true }) })).not.toThrow();

			});

			it("takes the marker the most derived shape declares", async () => {

				const Base = resource({ id: id({ hidden: true }) });
				const shape = resource(Base, { id: id() });

				expect(shape.members["id"]?.hidden).toBeUndefined();

			});

			it("takes the marker the first extended shape declares", async () => {

				const One = resource({ id: id({ hidden: true }) });
				const Other = resource({ id: id() });

				const shape: ResourceShape = resource(One, Other, {});

				expect(shape.members["id"]?.hidden).toBe(true);

			});

		});

		describe("validators", () => {

			const check: Validator<Resource> = () => undefined;
			const other: Validator<Resource> = () => undefined;

			it("carries the checks the extended shape states", async () => {

				const Base = resource({}, { validators: [check] });

				expect(resource(Base, {}).validators).toEqual([check]);

			});

			it("accumulates the checks stated over the ones inherited", async () => {

				const Base = resource({}, { validators: [check] });

				expect(resource(Base, {}, { validators: [other] })).toMatchObject({
					validators: expect.arrayContaining([check, other])
				});

			});

			it("states a check reaching the shape along several paths once", async () => {

				const One = resource({}, { validators: [check] });
				const Other = resource({}, { validators: [check] });

				expect(resource(One, Other, {}).validators).toEqual([check]);

			});

			it("states none where nothing states one", async () => {

				expect(resource({}).validators).toBeUndefined();

			});

		});

	});

	describe("classes", () => {

		const Thing = resource({ id: id() }, { class: "https://schema.org/Thing" });
		const Product = resource(Thing, {}, { class: "https://schema.org/Product" });

		it("states none where a shape extends nothing", async () => {

			expect(resource({ id: id() }).classes).toEqual([]);

		});

		it("states none where a shape extends nothing stating a class", async () => {

			const Base = resource({ name: required(string()) });

			expect(resource(Base, {}).classes).toEqual([]);

		});

		it("carries the class of the shape extended", async () => {

			expect(Product.classes).toEqual(["https://schema.org/Thing"]);

		});

		it("leaves the shape's own class out", async () => {

			expect(Product.classes).not.toContain("https://schema.org/Product");

		});

		it("carries the class of a shape extended transitively", async () => {

			const Offer = resource(Product, {}, { class: "https://schema.org/Offer" });

			expect(Offer.classes).toEqual(["https://schema.org/Product", "https://schema.org/Thing"]);

		});

		it("carries the class of every shape extended", async () => {

			const Place = resource({ id: id() }, { class: "https://schema.org/Place" });
			const Store = resource(Thing, Place, {}, { class: "https://schema.org/Store" });

			expect(Store.classes).toEqual(["https://schema.org/Thing", "https://schema.org/Place"]);

		});

		it("states a class shared by several shapes extended once", async () => {

			const Left = resource(Thing, {}, { class: "https://schema.org/Left" });
			const Right = resource(Thing, {}, { class: "https://schema.org/Right" });

			const Joined = resource(Left, Right, {});

			expect(Joined.classes).toEqual([
				"https://schema.org/Left",
				"https://schema.org/Thing",
				"https://schema.org/Right"
			]);

		});

		it("carries the class of a shape extended through a deferred definition", async () => {

			const Deferred = resource(() => Thing, {}, { class: "https://schema.org/Deferred" });

			expect(Deferred.classes).toEqual(["https://schema.org/Thing"]);

		});

	});

});


describe("checkResource", () => {

	it("returns undefined for consistent constraints", async () => {

		expect(checkResource({})).toBeUndefined();
		expect(checkResource({ in: ["app:/1", "app:/2"], hasValue: ["app:/1"] })).toBeUndefined();

	});

	it("reports required identifiers outside the enumeration", async () => {

		expect(checkResource({ in: ["app:/1"], hasValue: ["app:/2"] }))
			.toContainEqual(expect.stringContaining("{hasValue/in}"));

	});

});

describe("checkBounds", () => {

	it("returns undefined for bounds admitting a value", async () => {

		expect(checkBounds({ minCount: 1, maxCount: 10 })).toBeUndefined();
		expect(checkBounds({ minCount: 1, maxCount: 1 })).toBeUndefined();
		expect(checkBounds({ minCount: 0, maxCount: 0 })).toBeUndefined();

	});

	it("returns undefined where an end is left unbounded", async () => {

		expect(checkBounds({ minCount: 5 })).toBeUndefined();
		expect(checkBounds({ maxCount: 5 })).toBeUndefined();
		expect(checkBounds({})).toBeUndefined();

	});

	it("reports bounds admitting nothing at all", async () => {

		expect(checkBounds({ minCount: 5, maxCount: 2 }))
			.toContainEqual(expect.stringContaining("{minCount/maxCount}"));

	});

});

describe("checkParents", () => {

	const One = resource({ name: required(string()) });
	const Other = resource({ code: required(string()) });

	it("returns undefined where a single shape is extended", async () => {

		const shape = resource(One, {}, { virtual: true });

		expect(checkParents(shape, [One])).toBeUndefined();

	});

	it("returns undefined where the extended shapes agree", async () => {

		const first = resource({ name: required(string()) }, { virtual: true, space: schema });
		const second = resource({ code: required(string()) }, { virtual: true, space: schema });

		expect(checkParents(resource(first, second, {}), [first, second])).toBeUndefined();

	});

	it("reports extended shapes disagreeing on what a resource is", async () => {

		const virtual = resource({ name: required(string()) }, { virtual: true });

		expect(checkParents(resource({}), [virtual, Other]))
			.toContainEqual(expect.stringContaining("{virtual}"));

	});

	it("reports extended shapes disagreeing on where members resolve", async () => {

		const here = resource({ name: required(string()) }, { space: schema });
		const there = resource({ code: required(string()) }, { space: createNamespace("https://example.net/") });

		expect(checkParents(resource({}), [here, there]))
			.toContainEqual(expect.stringContaining("{space}"));

	});

	it("returns undefined where the extending shape settles the disagreement", async () => {

		const virtual = resource({ name: required(string()) }, { virtual: true });
		const settled = resource({}, { virtual: false });

		expect(checkParents(settled, [virtual, Other])).toBeUndefined();

	});

	it("reports extended shapes disagreeing on the hidden of a member", async () => {

		const shown = resource({ name: required(string()) });
		const kept = resource({ name: required(string(), { hidden: true }) });

		expect(checkParents(resource({}), [shown, kept]))
			.toContainEqual(expect.stringContaining("{hidden}"));

	});

	it("returns undefined where the extending shape settles the hidden disagreement", async () => {

		const shown = resource({ name: required(string()) });
		const kept = resource({ name: required(string(), { hidden: true }) });
		const settled = resource({ name: required(string(), { hidden: false }) });

		expect(checkParents(settled, [shown, kept])).toBeUndefined();

	});

	it("returns undefined where a single extended shape hides a member", async () => {

		const kept = resource({ name: required(string(), { hidden: true }) });

		expect(checkParents(resource({}), [kept, Other])).toBeUndefined();

	});

});

describe("checkSingletons", () => {

	it("returns undefined for at most one of each marker", async () => {

		expect(checkSingletons([{ kind: "id" }, { kind: "type" }, { kind: "property" }])).toBeUndefined();

	});

	it("reports two identifiers", async () => {

		expect(checkSingletons([{ kind: "id" }, { kind: "id" }]))
			.toContainEqual(expect.stringContaining("{id}"));

	});

	it("reports two types", async () => {

		expect(checkSingletons([{ kind: "type" }, { kind: "type" }]))
			.toContainEqual(expect.stringContaining("{type}"));

	});

});

describe("checkPredicates", () => {

	it("returns undefined where every member maps to a predicate of its own", async () => {

		expect(checkPredicates(resource({
			name: required(string()),
			code: required(string())
		}))).toBeUndefined();

	});

});

describe("narrowsResource", () => {

	it("accepts an identical child", async () => {

		const shape = resource({ name: required(string()) });

		expect(narrowsResource(shape, shape)).toBeUndefined();

	});

	it("accepts a child adding a member", async () => {

		expect(narrowsResource(
			resource({ name: required(string()), code: required(string()) }),
			resource({ name: required(string()) })
		)).toBeUndefined();

	});

	it("accepts a child tightening an inherited member", async () => {

		expect(narrowsResource(
			resource({ name: required(string({ minLength: 1 })) }),
			resource({ name: required(string()) })
		)).toBeUndefined();

	});

	it("rejects a child retyping an inherited member", async () => {

		expect(narrowsResource(
			resource({ name: required(number()) }),
			resource({ name: required(string()) })
		)).toBeDefined();

	});

	it("rejects a child swapping the kind of an inherited member", async () => {

		expect(narrowsResource(
			resource({ name: id() }),
			resource({ name: required(string()) })
		)).toBeDefined();

	});

	it("accepts a child narrowing a wildcard pattern", async () => {

		expect(narrowsResource(
			resource({}, { pattern: "/products/{id}" }),
			resource({}, { pattern: "/products/*" })
		)).toBeUndefined();

	});

	it("rejects a child stating an unrelated pattern", async () => {

		expect(narrowsResource(
			resource({}, { pattern: "/vendors/{id}" }),
			resource({}, { pattern: "/products/{id}" })
		)).toContainEqual(expect.stringContaining("{pattern}"));

	});

	it("rejects a child widening the admitted identifiers", async () => {

		expect(narrowsResource(
			resource({}, { in: ["app:/1", "app:/2"] }),
			resource({}, { in: ["app:/1"] })
		)).toBeDefined();

	});

	it("rejects a child dropping a required identifier", async () => {

		expect(narrowsResource(
			resource({}, { hasValue: ["app:/1"] }),
			resource({}, { hasValue: ["app:/1", "app:/2"] })
		)).toBeDefined();

	});

});

describe("narrowsProperty", () => {

	it("accepts an identical child", async () => {

		expect(narrowsProperty(required(string()), required(string()))).toBeUndefined();

	});

	it("accepts a child tightening the range", async () => {

		expect(narrowsProperty(required(string({ minLength: 1 })), required(string()))).toBeUndefined();

	});

	it("accepts a child tightening the cardinality", async () => {

		expect(narrowsProperty(required(string()), optional(string()))).toBeUndefined();

	});

	it("rejects a child widening the cardinality", async () => {

		expect(narrowsProperty(optional(string()), required(string())))
			.toContainEqual(expect.stringContaining("{minCount}"));

	});

	it("rejects a child lifting an upper bound", async () => {

		expect(narrowsProperty(multiple(string()), optional(string())))
			.toContainEqual(expect.stringContaining("{maxCount}"));

	});

	it("rejects a child retyping the range", async () => {

		expect(narrowsProperty(required(number()), required(string()))).toBeDefined();

	});

	it.each<[string, Record<string, unknown>]>([
		["forward", { forward: "https://example.net/other" }],
		["reverse", { reverse: "https://example.net/other" }],
		["foreign", { foreign: true }],
		["captive", { captive: true }],
		["name", { name: "Other" }],
		["description", { description: "Other" }]
	])("rejects a child overriding %s", async (field, constraints) => {

		expect(narrowsProperty(required(string(), constraints), required(string())))
			.toContainEqual(expect.stringContaining(`{${field}}`));

	});

	it("accepts a child overriding hidden", async () => {

		expect(narrowsProperty(required(string(), { hidden: false }), required(string(), { hidden: true })))
			.toBeUndefined();

	});

	it("rejects a child whose bounds leave the merged one admitting nothing", async () => {

		// the factories refuse crossed bounds outright, so the check guards a member stated by other means

		const inherited: Property = { kind: "property", minCount: undefined, maxCount: 2, shape: string() };
		const declared: Property = { kind: "property", minCount: 3, maxCount: 2, shape: string() };

		expect(narrowsProperty(declared, inherited))
			.toContainEqual(expect.stringContaining("{minCount/maxCount}"));

	});

	it("rejects a child raising a lower bound past an inherited upper one", async () => {

		const inherited = property(string(), { minCount: 1, maxCount: 2 });
		const declared = property(string(), { minCount: 3 });

		expect(narrowsProperty(declared, inherited)).toBeDefined();

	});

});

describe("mergeResource", () => {

	it("carries the kind", async () => {

		expect(mergeResource(resource({}), resource({})).kind).toBe("resource");

	});

	it("carries the members of both shapes", async () => {

		const merged = mergeResource(
			resource({ code: required(string()) }),
			resource({ name: required(string()) })
		);

		expect(Object.keys(merged.members).sort()).toEqual(["code", "name"]);

	});

	it("merges a member stated on both sides", async () => {

		const merged = mergeResource(
			resource({ name: required(string({ minLength: 1 })) }),
			resource({ name: required(string({ maxLength: 9 })) })
		);

		expect(getProperty(merged, "name")?.shape).toMatchObject({ minLength: 1, maxLength: 9 });

	});

	it("intersects the admitted identifiers", async () => {

		const merged = mergeResource(
			resource({}, { in: ["app:/1"] }),
			resource({}, { in: ["app:/1", "app:/2"] })
		);

		expect(merged.in).toEqual(["app:/1"]);

	});

	it("accumulates the required identifiers", async () => {

		const merged = mergeResource(
			resource({}, { hasValue: ["app:/1", "app:/2"] }),
			resource({}, { hasValue: ["app:/2"] })
		);

		expect(merged.hasValue).toEqual(expect.arrayContaining(["app:/1", "app:/2"]));

	});

	it("inherits the space where the child states none", async () => {

		expect(mergeResource(resource({}), resource({}, { space: schema })).space).toBe(schema);

	});

	it("rejects an incompatible override", async () => {

		expect(() => mergeResource(
			resource({ name: required(number()) }),
			resource({ name: required(string()) })
		)).toThrow(TraceError);

	});

});

describe("mergeProperty", () => {

	it("keeps the tighter cardinality", async () => {

		const merged = mergeProperty(required(string()), optional(string()));

		expect(merged.minCount).toBe(1);
		expect(merged.maxCount).toBe(1);

	});

	it("merges the ranges", async () => {

		const merged = mergeProperty(required(string({ minLength: 1 })), required(string({ maxLength: 9 })));

		expect(merged.shape).toMatchObject({ minLength: 1, maxLength: 9 });

	});

	it("carries the inherited predicate through", async () => {

		const merged = mergeProperty(
			required(string()),
			required(string(), { forward: "https://schema.org/name" })
		);

		expect(merged.forward).toBe("https://schema.org/name");

	});

	it("takes the hidden stated by the overriding member", async () => {

		const merged = mergeProperty(
			required(string(), { hidden: false }),
			required(string(), { hidden: true })
		);

		expect(merged.hidden).toBe(false);

	});

	it("carries the inherited hidden through", async () => {

		const merged = mergeProperty(required(string()), required(string(), { hidden: true }));

		expect(merged.hidden).toBe(true);

	});

	it("leaves hidden unstated where neither member states it", async () => {

		const merged = mergeProperty(required(string()), required(string()));

		expect(merged).not.toHaveProperty("hidden");

	});

});
