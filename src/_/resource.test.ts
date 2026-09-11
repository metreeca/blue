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
import { boolean } from "./boolean.js";
import { dictionary } from "./dictionary.js";
import { integer, number } from "./number.js";
import { reference } from "./reference.js";
import {
	checkPredicates,
	checkResource,
	checkSingletons,
	enforce,
	mergeProperty,
	mergeResource,
	narrowsProperty,
	narrowsResource,
	getShapeId,
	getShapeProperties,
	getShapeType,
	match,
	validateResource,
	validateResult,
	validateTemplate
} from "./resource.core.js";
import {
	defaultNamespace,
	id,
	multiple,
	nonempty,
	optional,
	property,
	required,
	resource,
	type ResourceShape,
	type as typed
} from "./resource.js";
import { string } from "./string.js";
import { union } from "./union.js";


const schema = createNamespace("https://schema.org/");


describe("factories", () => {

	describe("resource", () => {

		it("returns a shape with kind 'resource'", async () => {

			expect(resource({}).kind).toBe("resource");

		});

		it("returns an immutable shape", async () => {

			const shape = resource({});

			expect(() => Object.assign(shape, { kind: "string" })).toThrow();

		});

		it("carries the members it declares", async () => {

			const shape = resource({ name: required(string()) });

			expect(Object.keys(shape.members)).toEqual(["name"]);

		});

		it("carries no parent where none is stated", async () => {

			expect(resource({}).parents).toEqual([]);

		});

		it("carries the shapes it extends", async () => {

			const Base = resource({});

			expect(resource(Base, {}).parents).toEqual([Base]);

		});

		it("accepts constraints after the members", async () => {

			const shape = resource({}, { pattern: "/products/{id}" });

			expect(shape.pattern).toBe("/products/{id}");

		});

		it("accepts constraints with no members at all", async () => {

			expect(resource({}, { class: "https://schema.org/Product" }).class)
				.toBe("https://schema.org/Product");

		});

		it("rejects a malformed declaration", async () => {

			expect(() => resource({ name: "nope" } as never)).toThrow(TypeError);

		});

		describe("predicates", () => {

			it("resolves a member name against the default space", async () => {

				const shape = resource({ name: required(string()) });

				expect(getProperty(shape, "name")?.forward).toBe(defaultNamespace.name);

			});

			it("resolves a member name against the stated space", async () => {

				const shape = resource({ name: required(string()) }, { space: schema });

				expect(getProperty(shape, "name")?.forward).toBe("https://schema.org/name");

			});

			it("resolves a member name against the inherited space", async () => {

				const Base = resource({}, { space: schema });
				const shape = resource(Base, { name: required(string()) });

				expect(getProperty(shape, "name")?.forward).toBe("https://schema.org/name");

			});

			it("resolves a stated space against a namespace", async () => {

				const shape = resource({ name: required(string(), { forward: schema }) });

				expect(getProperty(shape, "name")?.forward).toBe("https://schema.org/name");

			});

			it("keeps a stated predicate", async () => {

				const shape = resource({ name: required(string(), { forward: "https://example.net/label" }) });

				expect(getProperty(shape, "name")?.forward).toBe("https://example.net/label");

			});

			it("resolves a reverse mapping and states no forward one", async () => {

				const shape = resource({ employee: multiple(string(), { reverse: schema }) });

				expect(getProperty(shape, "employee")?.reverse).toBe("https://schema.org/employee");
				expect(getProperty(shape, "employee")?.forward).toBeUndefined();

			});

			it("inherits the predicate of the member it overrides", async () => {

				const Base = resource({ name: required(string(), { forward: schema }) });
				const shape = resource(Base, { name: required(string({ minLength: 1 })) });

				expect(getProperty(shape, "name")?.forward).toBe("https://schema.org/name");

			});

			it("rejects two members mapping to the same predicate", async () => {

				expect(() => resource({
					name: required(string(), { forward: "https://schema.org/name" }),
					label: required(string(), { forward: "https://schema.org/name" })
				})).toThrow(TraceError);

			});

			it("admits the same IRI as a forward and a reverse mapping", async () => {

				expect(() => resource({
					name: required(string(), { forward: "https://schema.org/name" }),
					named: multiple(string(), { reverse: "https://schema.org/name" })
				})).not.toThrow();

			});

		});

		describe("labels", () => {

			it("expands a bare name to English content", async () => {

				expect(resource({}, { name: "Product" }).name).toEqual({ en: "Product" });

			});

			it("keeps a localised name", async () => {

				expect(resource({}, { name: { it: "Prodotto" } }).name).toEqual({ it: "Prodotto" });

			});

			it("expands a bare member name to English content", async () => {

				const shape = resource({ name: required(string(), { name: "Name" }) });

				expect(getProperty(shape, "name")?.name).toEqual({ en: "Name" });

			});

		});

		describe("singletons", () => {

			it("admits one identifier and one type", async () => {

				expect(() => resource({ id: id(), type: typed() })).not.toThrow();

			});

			it("rejects two identifiers under distinct names", async () => {

				expect(() => resource({ id: id(), iri: id() })).toThrow(TraceError);

			});

			it("counts an identifier redeclared over an inherited one once", async () => {

				const Base = resource({ id: id() });

				expect(() => resource(Base, { id: id() })).not.toThrow();

			});

		});

	});

	describe("members", () => {

		describe.each([
			["multiple", multiple, undefined, undefined],
			["nonempty", nonempty, 1, undefined],
			["optional", optional, undefined, 1],
			["required", required, 1, 1]
		] as const)("%s", (_label, factory, expectedMin, expectedMax) => {

			it("states the expected cardinality", async () => {

				const member = factory(string());

				expect(member.minCount).toBe(expectedMin);
				expect(member.maxCount).toBe(expectedMax);

			});

			it("carries the range it is given", async () => {

				expect(factory(string()).shape).toMatchObject({ kind: "string" });

			});

			it("carries the constraints it is given", async () => {

				expect(factory(string(), { hidden: true }).hidden).toBe(true);

			});

			it("returns an immutable member", async () => {

				const member = factory(string());

				expect(() => Object.assign(member, { minCount: 99 })).toThrow();

			});

		});

		describe("property", () => {

			it("states the bounds it is given", async () => {

				const member = property(string(), { minCount: 2, maxCount: 5 });

				expect(member.minCount).toBe(2);
				expect(member.maxCount).toBe(5);

			});

			it("leaves an unstated bound unbounded", async () => {

				const member = property(string(), { minCount: 2 });

				expect(member.minCount).toBe(2);
				expect(member.maxCount).toBeUndefined();

			});

		});

		describe("id", () => {

			it("returns a member with kind 'id'", async () => {

				expect(id().kind).toBe("id");

			});

		});

		describe("type", () => {

			it("returns a member with kind 'type'", async () => {

				expect(typed().kind).toBe("type");

			});

		});

	});

});

describe("operators", () => {

	describe("checkResource", () => {

		it("returns undefined for consistent constraints", async () => {

			expect(checkResource({})).toBeUndefined();
			expect(checkResource({ in: ["app:/1", "app:/2"], hasValue: ["app:/1"] })).toBeUndefined();

		});

		it("returns trace for required identifiers outside the enumeration", async () => {

			expect(checkResource({ in: ["app:/1"], hasValue: ["app:/2"] }))
				.toContainEqual(expect.stringContaining("{hasValue/in}"));

		});

	});

	describe("checkSingletons", () => {

		it("returns undefined for at most one of each marker", async () => {

			expect(checkSingletons([{ kind: "id" }, { kind: "type" }, { kind: "property" }])).toBeUndefined();

		});

		it("returns trace for two identifiers", async () => {

			expect(checkSingletons([{ kind: "id" }, { kind: "id" }]))
				.toContainEqual(expect.stringContaining("{id}"));

		});

		it("returns trace for two types", async () => {

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

	});

	describe("mergeResource", () => {

		it("preserves kind as 'resource'", async () => {

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

			expect(getProperty(shape, "link")?.shape).toMatchObject({ kind: "reference" });

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

	});

	describe("match", () => {

		it.each<[string, string, string, boolean]>([
			["a placeholder segment", "app:/users/123", "/users/{id}", true],
			["a mismatched segment", "app:/products/123", "/users/{id}", false],
			["a trailing wildcard", "app:/users/1/2", "/users/*", true],
			["an absolute pattern", "https://example.net/users/1", "https://example.net/users/{id}", true],
			["a root-relative pattern against an absolute IRI", "https://example.net/users/1", "/users/{id}", true]
		])("matches %s", async (_label, iri, pattern, expected) => {

			expect(match(iri, pattern)).toBe(expected);

		});

		it("rejects a malformed pattern", async () => {

			expect(() => match("app:/users/1", "users/{id}")).toThrow(TypeError);

		});

	});

	describe("accessors", () => {

		const shape = resource({ id: id(), type: typed(), name: required(string()) });

		it("resolves the name the identifier is stated under", async () => {

			expect(getShapeId(shape)).toBe("id");

		});

		it("resolves the name the class is stated under", async () => {

			expect(getShapeType(shape)).toBe("type");

		});

		it("resolves the members of a linked target", async () => {

			expect(Object.keys(getShapeProperties(reference(shape))).sort()).toEqual(["id", "name", "type"]);

		});

		it("resolves no member for a range pointing at no resource", async () => {

			expect(getShapeProperties(string())).toEqual({});

		});

	});

});

describe("validators", () => {

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

		});

		describe("localised members", () => {

			// a localised value is a structured value in its own right, as a resource is: the bounds count the maps a
			// member carries rather than the strings a tag holds

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

			it("admits an array of maps where an array is admitted", async () => {

				const shape = resource({ labels: multiple(dictionary()) });

				expect(validateResource([{ labels: [{ en: ["Widget"] }, { it: ["Aggeggio"] }] }], shape))
					.toBeUndefined();

			});

			it("reports a bare map where an array is admitted", async () => {

				const shape = resource({ labels: multiple(dictionary()) });

				expect(validateResource([{ labels: { en: ["Widget"] } }], shape)).toBeDefined();

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

});

describe("policies", () => {

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

});


// resolve a declared member as a property, so a test reads its resolved fields

function getProperty(shape: ResourceShape, name: string) {

	const member = shape.members[name];

	return member?.kind === "property" ? member : undefined;

}
