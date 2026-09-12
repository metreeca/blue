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
import { string } from "../string/index.js";
import {
	id,
	multiple,
	nonempty,
	optional,
	property,
	required,
	resource,
	type ResourceShape,
	type as typed
} from "./index.js";


const schema = createNamespace("https://schema.org/");


function getProperty(shape: ResourceShape, name: string) {

	const member = shape.members[name];

	return member?.kind === "property" ? member : undefined;

}


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

				expect(getProperty(shape, "name")?.forward).toBe("app:/#name");

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

			it("keeps a stated reverse predicate", async () => {

				const shape = resource({ employee: multiple(string(), { reverse: "https://example.net/employee" }) });

				expect(getProperty(shape, "employee")?.reverse).toBe("https://example.net/employee");

			});

			it("resolves both mappings where a member states both", async () => {

				const shape = resource({ peer: multiple(string(), { forward: schema, reverse: schema }) });

				expect(getProperty(shape, "peer")?.forward).toBe("https://schema.org/peer");
				expect(getProperty(shape, "peer")?.reverse).toBe("https://schema.org/peer");

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

				expect(factory(string(), { foreign: true }).foreign).toBe(true);

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

			it("admits bounds admitting no value at all where they are equal", async () => {

				expect(() => property(string(), { minCount: 0, maxCount: 0 })).not.toThrow();

			});

			it("rejects a bound stated as a negative number", async () => {

				expect(() => property(string(), { minCount: -1 })).toThrow(TypeError);
				expect(() => property(string(), { maxCount: -1 })).toThrow(TypeError);

			});

			it("rejects bounds admitting nothing at all", async () => {

				expect(() => property(string(), { minCount: 3, maxCount: 2 })).toThrow(TypeError);

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

