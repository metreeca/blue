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

import { assert } from "@metreeca/core";
import { isTag } from "@metreeca/core/language";
import { createNamespace } from "@metreeca/core/resource";
import { type Trace, TraceError } from "@metreeca/core/trace";
import { app } from "@metreeca/qest";
import type { Resource } from "@metreeca/qest/resource";
import { describe, expect, it } from "vitest";
import { boolean } from "./boolean.js";
import { dictionary } from "./dictionary.js";
import { integer } from "./number.js";
import { reference } from "./reference.js";
import {
	checkId,
	checkParents,
	checkPredicates,
	checkResource,
	checkSingletons,
	deriveResource,
	enforce,
	flatten,
	match,
	mergeProperty,
	mergeResource,
	narrowsProperty,
	narrowsResource,
	validateResource,
	validateResult,
	validateTemplate
} from "./resource.core.js";
import {
	id,
	multiple,
	nonempty,
	optional,
	property,
	type Property,
	required,
	resource,
	type ResourceShape,
	type
} from "./resource.js";
import { date, email, string } from "./string.js";
import { union, type UnionShape } from "./union.js";
import { eager, type SetShape } from "./value.js";


// navigate an array-shaped trace by key path, returning the raw value at the path or undefined

function at(trace: unknown, ...path: readonly (string | number)[]): any {
	return path.reduce<unknown>((node, key) => {
		const record = Array.isArray(node) ? node.find(item => item !== null && typeof item === "object") : node;
		return record === null || typeof record !== "object" ? undefined : (record as Record<string, unknown>)[`${key}`];
	}, trace);
}

// navigate an array-shaped trace by key path, returning the keyed record at the path (empty when absent)

function rec(trace: unknown, ...path: readonly (string | number)[]): Record<string, any> {
	const node = at(trace, ...path);
	const record = Array.isArray(node) ? node.find(item => item !== null && typeof item === "object") : node;
	return (record === null || typeof record !== "object" ? {} : record) as Record<string, any>;
}

// convert an old-style expected trace (object with `[i]`/name keys, string leaves) to the new array shape

function flat(expected: unknown): any {
	return typeof expected === "string" ? [expected]
		: [Object.fromEntries(Object.entries(expected as Record<string, unknown>)
			.map(([k, v]) => [k.replace(/^\[(\d+)]$/, "$1"), flat(v)]))];
}

// convert a new array-shaped trace back to the old object shape (numeric keys re-bracketed, single-message leaves
// unwrapped)

function unflat(trace: unknown): any {
	if ( !Array.isArray(trace) ) { return trace; }
	const records = trace.filter(item => item !== null && typeof item === "object");
	if ( records.length === 0 ) { return trace.length === 1 ? trace[0] : trace; }
	return Object.fromEntries(records.flatMap(record =>
		Object.entries(record).map(([k, v]) => [/^\d+$/.test(k) ? `[${k}]` : k, unflat(v)])
	));
}


describe("factories", () => {

	describe("resource", () => {

		describe("naked ranges", () => {

			it("normalizes single naked range to Property with Range range", async () => {

				const shape = resource({
					name: required(string())
				});

				expect(shape.members.name).toBeDefined();
				expect((shape.members.name as Property).range.kind).toBe("set");
				expect(((shape.members.name as Property).range as SetShape).shape.kind).toBe("string");

			});

			it("normalizes naked range with union shape to Property", async () => {

				const shape = resource({
					value: optional(union(string(), integer()))
				});

				expect(shape.members.value).toBeDefined();
				expect((shape.members.value as Property).range.kind).toBe("set");

				const rangeShape = ((shape.members.value as Property).range as SetShape).shape;
				expect(rangeShape.kind).toBe("union");
				expect((rangeShape as UnionShape).variants[0].kind).toBe("string");
				expect((rangeShape as UnionShape).variants[1].kind).toBe("number");

			});

			it("preserves explicit property with naked range", async () => {

				const shape = resource({
					name: required(string()),
					age: optional(integer())
				});

				expect(((shape.members.name as Property).range as SetShape).shape.kind).toBe("string");
				expect(((shape.members.age as Property).range as SetShape).shape.kind).toBe("number");

			});

			it("normalizes naked ranges with constraints", async () => {

				const shape = resource({
					name: required(string())
				}, {
					space: createNamespace("http://example.org/")
				});

				expect(shape.members.name).toBeDefined();
				expect((shape.members.name as Property).range.kind).toBe("set");
				expect(((shape.members.name as Property).range as SetShape).shape.kind).toBe("string");

			});

		});

		describe("entries only", () => {

			it("returns a shape with kind 'resource'", async () => {

				const shape = resource({
					name: required(string())
				});

				expect(shape.kind).toBe("resource");

			});

			it("returns an immutable shape", async () => {

				const shape = resource({
					name: required(string())
				});

				expect(() => {
					(shape as any).kind = "string";
				}).toThrow();

			});

			it("includes entries in the shape", async () => {

				const shape = resource({
					name: required(string()),
					age: optional(integer())
				});

				expect(shape.members).toBeDefined();
				expect(shape.members.name).toBeDefined();
				expect(shape.members.age).toBeDefined();

			});

		});

		describe("with specs", () => {

			it("accepts specs and entries", async () => {

				const shape = resource({
					name: required(string())
				}, {});

				expect(shape.kind).toBe("resource");
				expect(shape.members.name).toBeDefined();

			});

		});

		describe("deep flattening", () => {

			it("flattens an unflattened nested ResourceShape in a property range", async () => {

				const Parent = resource({
					name: required(string())
				});

				// manually constructed — not flattened, extends not resolved

				const Unflattened = {
					kind: "resource",
					model: {},
					parents: [Parent],
					members: {
						age: optional(integer())
					}
				} as ResourceShape;

				const Outer = resource({
					person: required(Unflattened)
				});

				const nested = ((Outer.members.person as Property).range as SetShape).shape as ResourceShape;

				expect(nested.members.name).toBeDefined();
				expect(nested.members.age).toBeDefined();

			});

			it("flattens an unflattened ResourceShape variant inside a union", async () => {

				const Parent = resource({
					name: required(string())
				});

				const Unflattened = {
					kind: "resource",
					model: {},
					parents: [Parent],
					members: {
						age: optional(integer())
					}
				} as ResourceShape;

				const Outer = resource({
					contact: required(union(Unflattened, string()))
				});

				const range = (Outer.members.contact as Property).range as SetShape;
				const variants = (range.shape as UnionShape).variants;
				const nested = variants[0] as ResourceShape;

				expect(nested.members.name).toBeDefined();
				expect(nested.members.age).toBeDefined();

			});

			it("flattens the target ResourceShape inside a ReferenceShape", async () => {

				const Parent = resource({
					name: required(string())
				});

				const Unflattened = {
					kind: "resource",
					model: {},
					parents: [Parent],
					members: {
						age: optional(integer())
					}
				} as ResourceShape;

				const Outer = resource({
					ref: required(reference(() => Unflattened))
				});

				const ref = ((Outer.members.ref as Property).range as SetShape).shape;

				expect(ref.kind).toBe("reference");

				const target = eager((ref as { shape: () => ResourceShape }).shape);

				expect(target.members.name).toBeDefined();
				expect(target.members.age).toBeDefined();

			});

			it("flattens nested ResourceShape with constraints overload", async () => {

				const Parent = resource({
					name: required(string())
				});

				const Unflattened = {
					kind: "resource",
					model: {},
					parents: [Parent],
					members: {
						age: optional(integer())
					}
				} as ResourceShape;

				const ns = createNamespace("http://example.org/");

				const Outer = resource({
					person: required(Unflattened)
				}, { space: ns });

				const nested = ((Outer.members.person as Property).range as SetShape).shape as ResourceShape;

				expect(nested.members.name).toBeDefined();
				expect(nested.members.age).toBeDefined();

			});

			it("handles circular lazy references without infinite recursion", async () => {

				function Person(): ResourceShape {
					return resource({
						name: required(string()),
						friend: optional(reference(Person))
					});
				}

				const shape = resource({
					person: required(reference(Person))
				});

				const ref = ((shape.members.person as Property).range as SetShape).shape;

				expect(ref.kind).toBe("reference");

			});

		});

		describe("namespace resolution", () => {

			it("resolves namespace function for forward using property name", async () => {

				const rdfs = createNamespace("http://www.w3.org/2000/01/rdf-schema#");

				const shape = resource({
					label: required(string(), { forward: rdfs })
				});

				expect((shape.members.label as Property).forward).toBe("http://www.w3.org/2000/01/rdf-schema#label");

			});

			it("resolves namespace function for reverse using property name", async () => {

				const ex = createNamespace("http://example.org/");

				const shape = resource({
					owner: required(string(), { reverse: ex })
				});

				expect((shape.members.owner as Property).reverse).toBe("http://example.org/owner");

			});

			it("keeps IRI forward as-is", async () => {

				const shape = resource({
					name: required(string(), { forward: "http://example.org/name" })
				});

				expect((shape.members.name as Property).forward).toBe("http://example.org/name");

			});

			it("keeps IRI reverse as-is", async () => {

				const shape = resource({
					owner: required(string(), { reverse: "http://example.org/owner" })
				});

				expect((shape.members.owner as Property).reverse).toBe("http://example.org/owner");

			});

			describe("default forward resolution", () => {

				it("uses app namespace when no namespace is defined (entries only)", async () => {

					const shape = resource({
						name: required(string())
					});

					expect((shape.members.name as Property).forward).toBe("app:/#name");
					expect((shape.members.name as Property).reverse).toBeUndefined();

				});

				it("uses app namespace when no namespace is defined (with empty constraints)", async () => {

					const shape = resource({
						name: required(string())
					}, {});

					expect((shape.members.name as Property).forward).toBe("app:/#name");
					expect((shape.members.name as Property).reverse).toBeUndefined();

				});

				it("uses shape namespace when defined", async () => {

					const ns = createNamespace("http://example.org/");

					const shape = resource({
						name: required(string())
					}, { space: ns });

					expect((shape.members.name as Property).forward).toBe("http://example.org/name");
					expect((shape.members.name as Property).reverse).toBeUndefined();

				});

				it("uses inherited namespace from single parent", async () => {

					const ns = createNamespace("http://example.org/");

					const Parent = resource({
						id: required(string())
					}, { space: ns });

					const Child = resource(Parent, {
						name: required(string())
					});

					expect((Child.members.name as Property).forward).toBe("http://example.org/name");
					expect((Child.members.name as Property).reverse).toBeUndefined();

				});

				it("uses common inherited namespace from multiple parents", async () => {

					const ns = createNamespace("http://example.org/");

					const Parent1 = resource({
						id: required(string())
					}, { space: ns });

					const Parent2 = resource({
						code: required(string())
					}, { space: ns });

					const Child = resource(Parent1, Parent2, {
						name: required(string())
					});

					expect((Child.members.name as Property).forward).toBe("http://example.org/name");
					expect((Child.members.name as Property).reverse).toBeUndefined();

				});

				it("uses app namespace when parents have no namespace", async () => {

					const Parent = resource({
						id: required(string())
					});

					const Child = resource(Parent, {
						name: required(string())
					});

					expect((Child.members.name as Property).forward).toBe("app:/#name");
					expect((Child.members.name as Property).reverse).toBeUndefined();

				});

				it("does not generate default forward when reverse is explicitly defined", async () => {

					const shape = resource({
						owner: required(string(), { reverse: "http://example.org/owns" })
					});

					expect((shape.members.owner as Property).forward).toBeUndefined();
					expect((shape.members.owner as Property).reverse).toBe("http://example.org/owns");

				});

				it("does not override explicit forward", async () => {

					const ns = createNamespace("http://schema.org/");

					const shape = resource({
						name: required(string(), { forward: "http://custom.org/name" })
					}, { space: ns });

					expect((shape.members.name as Property).forward).toBe("http://custom.org/name");

				});

				it("resolves multiple entries with default forward", async () => {

					const ns = createNamespace("http://example.org/");

					const shape = resource({
						name: required(string()),
						age: optional(integer()),
						email: required(string())
					}, { space: ns });

					expect((shape.members.name as Property).forward).toBe("http://example.org/name");
					expect((shape.members.age as Property).forward).toBe("http://example.org/age");
					expect((shape.members.email as Property).forward).toBe("http://example.org/email");

				});

			});

		});

		describe("structural integrity", () => {

			it("includes provided specs", async () => {

				const Base = resource({
					name: required(string())
				});

				const shape = resource(Base, {
					age: optional(integer())
				}, {
					name: { [assert("en", isTag)]: "Person" },
					description: { [assert("en", isTag)]: "A person resource" }
				});

				expect(shape).toMatchObject({
					kind: "resource",
					name: { [assert("en", isTag)]: "Person" },
					description: { [assert("en", isTag)]: "A person resource" },
					parents: [Base]
				});

			});

			it("includes only provided entries", async () => {

				const shape = resource({
					name: required(string())
				});

				expect(shape).toMatchObject({ kind: "resource", entries: { name: expect.anything() } });

			});

			it("expands string name and description shorthands", async () => {

				const shape = resource({
					age: optional(integer())
				}, {
					name: "Person",
					description: "A *person* resource"
				});

				expect(shape).toMatchObject({
					name: { [assert("en", isTag)]: "Person" },
					description: { [assert("en", isTag)]: "A *person* resource" }
				});

			});

			it("folds a name to a single line", async () => {

				const shape = resource({ age: optional(integer()) }, {
					name: "  A  person\n  resource  "
				});

				expect(shape).toMatchObject({ name: { [assert("en", isTag)]: "A person resource" } });

			});

			it("realigns a description flush left", async () => {

				const shape = resource({ age: optional(integer()) }, {
					description: "\n\t\t\t\t\tA *person* resource.\n\n\t\t\t\t\t- born\n\t\t\t\t\t- named\n"
				});

				expect(shape).toMatchObject({
					description: { [assert("en", isTag)]: "A *person* resource.\n\n- born\n- named" }
				});

			});

			it("normalises every entry of a localised name and description", async () => {

				const shape = resource({ age: optional(integer()) }, {
					name: { en: "  A  person  ", it: "  Una  persona  " },
					description: { en: "\n\t\t\t\t\tBorn.\n", it: "\n\t\t\t\t\tNato.\n" }
				});

				expect(shape).toMatchObject({
					name: { [assert("en", isTag)]: "A person", [assert("it", isTag)]: "Una persona" },
					description: { [assert("en", isTag)]: "Born.", [assert("it", isTag)]: "Nato." }
				});

			});

		});

		describe("type conformance", () => {

			it("throws on non-function namespace", async () => {

				// namespace validation is manual (typia can't validate function signatures)
				expect(() => resource({
					name: required(string())
				}, { space: "http://example.org/" } as any)).toThrow(TypeError);

			});

			it("throws on duplicate id entries", async () => {

				expect(() => resource({
					first: id(),
					second: id()
				})).toThrow(TraceError);

			});

			it("throws on duplicate type entries", async () => {

				expect(() => resource({
					first: type(),
					second: type()
				}, { class: "app:/types/T" })).toThrow(TraceError);

			});

			it("accepts a type field without a declared class", async () => {

				// the member stays inactive until a class is declared; declaring it is admissible on its own,
				// so a shared supershape may factor it out for its descendants

				expect(() => resource({
					type: type(),
					name: required(string())
				})).not.toThrow();

			});

			it("accepts a type field with a declared class", async () => {

				expect(() => resource({
					type: type(),
					name: required(string())
				}, { class: "app:/types/Person" })).not.toThrow();

			});

			it("accepts a type field inherited by a class-less child", async () => {

				const Parent = resource({
					rtype: type(),
					name: required(string())
				}, { class: "app:/types/T" });

				// class is shape-specific and not inherited: the child carries the factored-out member
				// without a class of its own

				expect(() => resource(Parent, {
					age: required(integer())
				})).not.toThrow();

			});

			it("throws on inherited id duplicated under a distinct name", async () => {

				const Parent = resource({
					rid: id(),
					name: required(string())
				});

				expect(() => resource(Parent, {
					uid: id()
				})).toThrow(TraceError);

			});

			it("throws on inherited type duplicated under a distinct name", async () => {

				const Parent = resource({
					rtype: type(),
					name: required(string())
				}, { class: "app:/types/T" });

				expect(() => resource(Parent, {
					utype: type()
				}, { class: "app:/types/U" })).toThrow(TraceError);

			});

			it("throws on deeply inherited id duplicated under a distinct name", async () => {

				const GrandParent = resource({
					rid: id(),
					name: required(string())
				});

				const Parent = resource(GrandParent, {
					age: required(integer())
				});

				expect(() => resource(Parent, {
					uid: id()
				})).toThrow(TraceError);

			});

			it("throws on deeply inherited type duplicated under a distinct name", async () => {

				const GrandParent = resource({
					rtype: type(),
					name: required(string())
				}, { class: "app:/types/T" });

				const Parent = resource(GrandParent, {
					age: required(integer())
				}, { class: "app:/types/U" });

				expect(() => resource(Parent, {
					utype: type()
				}, { class: "app:/types/V" })).toThrow(TraceError);

			});

			it("accepts a child redeclaring an inherited id under the same name", async () => {

				const Parent = resource({
					rid: id(),
					name: required(string())
				});

				// same name, same kind: a compatible override, collapsed by name before counting

				expect(() => resource(Parent, {
					rid: id()
				})).not.toThrow();

			});

			it("accepts a child redeclaring an inherited type under the same name", async () => {

				const Parent = resource({
					rtype: type(),
					name: required(string())
				}, { class: "app:/types/T" });

				expect(() => resource(Parent, {
					rtype: type()
				}, { class: "app:/types/U" })).not.toThrow();

			});

			it("accepts a child redeclaring a deeply inherited id under the same name", async () => {

				const GrandParent = resource({
					rid: id(),
					name: required(string())
				});

				const Parent = resource(GrandParent, {
					age: required(integer())
				});

				expect(() => resource(Parent, {
					rid: id()
				})).not.toThrow();

			});

			it("accepts an id inherited through a diamond", async () => {

				const Base = resource({
					rid: id(),
					name: required(string())
				});

				// the same marker reaches the child through both parents: one entry, not a duplicate

				const Left = resource(Base, { age: required(integer()) });
				const Right = resource(Base, { code: required(string()) });

				expect(() => resource(Left, Right, {})).not.toThrow();

			});

			it("accepts a type inherited through a diamond", async () => {

				const Base = resource({
					rtype: type(),
					name: required(string())
				}, { class: "app:/types/B" });

				const Left = resource(Base, {}, { class: "app:/types/L" });
				const Right = resource(Base, {}, { class: "app:/types/R" });

				expect(() => resource(Left, Right, {}, { class: "app:/types/C" })).not.toThrow();

			});

			it("accepts an id inherited through a diamond and redeclared by the child", async () => {

				const Base = resource({ rid: id(), name: required(string()) });

				const Left = resource(Base, {});
				const Right = resource(Base, {});

				expect(() => resource(Left, Right, { rid: id() })).not.toThrow();

			});

			it("throws on distinct id markers inherited from unrelated parents", async () => {

				const ParentA = resource({ rid: id() });
				const ParentB = resource({ uid: id() });

				expect(() => resource(ParentA, ParentB, {})).toThrow(TraceError);

			});

			it("accepts inherited id when child has none", async () => {

				const Parent = resource({
					rid: id(),
					name: required(string())
				});

				expect(() => resource(Parent, {
					age: required(integer())
				})).not.toThrow();

			});

			it("accepts inherited type when child declares its own class", async () => {

				const Parent = resource({
					rtype: type(),
					name: required(string())
				}, { class: "app:/types/T" });

				// the type field is inherited, but each shape declares its own class

				expect(() => resource(Parent, {
					age: required(integer())
				}, { class: "app:/types/U" })).not.toThrow();

			});

			it("accepts a child property range narrowing an inherited enumeration", async () => {

				const Parent = resource({ code: required(string({ in: ["a", "b"] })) });

				expect(() => resource(Parent, { code: required(string({ in: ["a"] })) })).not.toThrow();

			});

			it("throws on a child property range widening an inherited enumeration", async () => {

				// the range check reaches the value shape through narrowsProperty and narrowsValues

				const Parent = resource({ code: required(string({ in: ["a", "b"] })) });

				expect(() => resource(Parent, { code: required(string({ in: ["a", "z"] })) })).toThrow(TraceError);

			});

			it("throws on a nested resource range widening an inherited enumeration", async () => {

				const Inner = resource({}, { in: ["app:/a", "app:/b"] });
				const Wide = resource(Inner, {});

				const Parent = resource({ nested: required(Inner) });

				expect(() => resource(Parent, {
					nested: required(resource(Wide, {}, { in: ["app:/a", "app:/z"] }))
				})).toThrow(TraceError);

			});

			it("accepts a child property range extending inherited required values", async () => {

				const Parent = resource({ code: required(string({ in: ["a", "b"], hasValue: ["a"] })) });

				expect(() => resource(Parent, {
					code: required(string({ in: ["a", "b"], hasValue: ["a", "b"] }))
				})).not.toThrow();

			});

			it("throws on a child property range dropping an inherited required value", async () => {

				const Parent = resource({ code: required(string({ in: ["a", "b"], hasValue: ["a", "b"] })) });

				expect(() => resource(Parent, {
					code: required(string({ in: ["a", "b"], hasValue: ["a"] }))
				})).toThrow(TraceError);

			});

			it("throws on a nested resource range dropping an inherited required value", async () => {

				const Inner = resource({}, { hasValue: ["app:/a", "app:/b"] });
				const Wide = resource(Inner, {}, { hasValue: ["app:/a", "app:/b"] });

				const Parent = resource({ nested: required(Inner) });

				expect(() => resource(Parent, {
					nested: required(resource(Wide, {}, { hasValue: ["app:/a"] }))
				})).toThrow(TraceError);

			});

			it("throws on invalid property (entries only)", async () => {

				expect(() => resource({
					name: "not-a-property" as any
				})).toThrow(TypeError);

			});

			it("throws on invalid property (with options)", async () => {

				expect(() => resource({
					name: { invalid: "structure" } as any
				}, {})).toThrow(TypeError);

			});

		});

		describe("multiple inheritance namespace validation", () => {

			it("accepts multiple parents with no namespace defined", async () => {

				const Parent1 = resource({
					name: required(string())
				});

				const Parent2 = resource({
					age: optional(integer())
				});

				expect(() => resource(Parent1, Parent2, {
					email: required(string())
				})).not.toThrow();

			});

			it("accepts multiple parents with the same namespace", async () => {

				const ns = createNamespace("http://example.org/");

				const Parent1 = resource({
					name: required(string())
				}, { space: ns });

				const Parent2 = resource({
					age: optional(integer())
				}, { space: ns });

				expect(() => resource(Parent1, Parent2, {
					email: required(string())
				})).not.toThrow();

			});

			it("throws when some parents define namespace and others do not", async () => {

				const ns = createNamespace("http://example.org/");

				const Parent1 = resource({
					name: required(string())
				}, { space: ns });

				const Parent2 = resource({
					age: optional(integer())
				});

				expect(() => resource(Parent1, Parent2, {
					email: required(string())
				})).toThrow(RangeError);

			});

			it("throws when parents define different namespaces", async () => {

				const ns1 = createNamespace("http://example.org/");
				const ns2 = createNamespace("http://other.org/");

				const Parent1 = resource({
					name: required(string())
				}, { space: ns1 });

				const Parent2 = resource({
					age: optional(integer())
				}, { space: ns2 });

				expect(() => resource(Parent1, Parent2, {
					email: required(string())
				})).toThrow(RangeError);

			});

			it("accepts different namespaces when overriding namespace is defined", async () => {

				const ns1 = createNamespace("http://example.org/");
				const ns2 = createNamespace("http://other.org/");
				const override = createNamespace("http://override.org/");

				const Parent1 = resource({
					name: required(string())
				}, { space: ns1 });

				const Parent2 = resource({
					age: optional(integer())
				}, { space: ns2 });

				expect(() => resource(Parent1, Parent2, {
					email: required(string())
				}, { space: override })).not.toThrow();

			});

			it("accepts single parent with namespace without override", async () => {

				const ns = createNamespace("http://example.org/");

				const Parent = resource({
					name: required(string())
				}, { space: ns });

				expect(() => resource(Parent, {
					age: optional(integer())
				})).not.toThrow();

			});

		});

		describe("model", () => {

			describe("plain ranges", () => {

				it("uses scalar model for required property (maxCount=1)", async () => {

					const shape = resource({
						name: required(string())
					});

					expect(shape.model).toEqual({ name: "" });

				});

				it("uses scalar model for optional property (maxCount=1)", async () => {

					const shape = resource({
						age: optional(integer())
					});

					expect(shape.model).toEqual({ age: 0 });

				});

				it("uses array model for nonempty property (maxCount=undefined)", async () => {

					const shape = resource({
						tags: nonempty(string())
					});

					expect(shape.model).toEqual({ tags: [""] });

				});

				it("uses array model for multiple property (maxCount=undefined)", async () => {

					const shape = resource({
						aliases: multiple(string())
					});

					expect(shape.model).toEqual({ aliases: [""] });

				});

				it("uses array model for custom cardinality with maxCount>1", async () => {

					const shape = resource({
						items: property(string(), { minCount: 2, maxCount: 5 })
					});

					expect(shape.model).toEqual({ items: [""] });

				});

				it("combines multiple entries with correct cardinality models", async () => {

					const shape = resource({
						name: required(string()),
						age: optional(integer()),
						tags: nonempty(string())
					});

					expect(shape.model).toEqual({
						name: "",
						age: 0,
						tags: [""]
					});

				});

			});

			describe("nested resources", () => {

				it("uses nested resource model for required nested resource", async () => {

					const Address = resource({
						city: required(string())
					});

					const Person = resource({
						address: required(Address)
					});

					expect(Person.model).toEqual({
						address: { city: "" }
					});

				});

				it("uses array of nested resource model for nonempty nested resource", async () => {

					const Address = resource({
						city: required(string())
					});

					const Person = resource({
						addresses: nonempty(Address)
					});

					expect(Person.model).toEqual({
						addresses: [{ city: "" }]
					});

				});

			});

			describe("references", () => {

				it("uses reference model for required reference", async () => {

					const shape = resource({
						manager: required(reference(resource({})))
					});

					expect(shape.model).toEqual({ manager: "app:/" });

				});

				it("uses array of reference model for nonempty reference", async () => {

					const shape = resource({
						managers: nonempty(reference(resource({})))
					});

					expect(shape.model).toEqual({ managers: ["app:/"] });

				});

			});

			describe("id/type entries", () => {

				it("uses reference model for id entry", async () => {

					const shape = resource({
						id: id()
					});

					expect(shape.model).toHaveProperty("id");

				});

				it("uses reference model for type entry", async () => {

					const shape = resource({
						type: type()
					}, { class: "app:/types/T" });

					expect(shape.model).toHaveProperty("type");

				});

				it("includes id and type alongside regular entries", async () => {

					const shape = resource({
						id: id(),
						type: type(),
						name: required(string())
					}, { class: "app:/types/T" });

					expect(shape.model).toHaveProperty("id");
					expect(shape.model).toHaveProperty("type");
					expect(shape.model).toHaveProperty("name", "");

				});

			});

			describe("unions", () => {

				it("uses indexed variant models as the prototype", async () => {

					const shape = resource({
						value: required(union(
							string(),
							integer()
						))
					});

					expect(shape.model).toEqual({
						value: { "0": "", "1": 0 }
					});

				});

				it("wraps indexed variant models in a singleton tuple when maxCount>1", async () => {

					const shape = resource({
						values: multiple(union(
							string(),
							integer()
						))
					});

					expect(shape.model).toEqual({
						values: [{ "0": "", "1": 0 }]
					});

				});

			});

			describe("immutability", () => {

				it("returns an immutable model", async () => {

					const shape = resource({
						name: required(string())
					});

					expect(() => {
						(shape.model as any).name = "test";
					}).toThrow();

				});

				it("returns a deeply immutable model", async () => {

					const shape = resource({
						tags: nonempty(string())
					});

					expect(() => {
						(shape.model as any).tags.push("new");
					}).toThrow();

				});

			});

			describe("model with inheritance", () => {

				it("includes entries from single parent", async () => {

					const Parent = resource({ name: required(string()) });
					const Child = resource(Parent, { age: optional(integer()) });

					expect(Child.model).toEqual({ name: "", age: 0 });

				});

				it("includes entries from multiple parents", async () => {

					const Named = resource({ name: required(string()) });
					const Aged = resource({ age: required(integer()) });
					const Person = resource(Named, Aged, { email: optional(string()) });

					expect(Person.model).toEqual({ name: "", age: 0, email: "" });

				});

				it("compatible local override preserves type", async () => {

					const Parent = resource({ name: required(string()) });
					const Child = resource(Parent, {
						name: required(string({
							model: "x",
							minLength: 1
						}))
					});

					expect(Child.model).toEqual({ name: "x" });

				});

				it("inherits forward from parent when overriding with naked range", async () => {

					const rdfs = createNamespace("http://www.w3.org/2000/01/rdf-schema#", ["label"]);

					const Parent = resource({
						label: required(string(), { forward: rdfs.label })
					});

					const Child = resource(Parent, {
						label: required(string({ model: "x", minLength: 1 }))
					});

					expect((Child.members.label as Property).forward).toBe("http://www.w3.org/2000/01/rdf-schema#label");

				});

				it("inherits reverse from parent when overriding with naked range", async () => {

					const ex = createNamespace("http://example.org/", ["owner"]);

					const Parent = resource({
						owner: required(string(), { reverse: ex.owner })
					});

					const Child = resource(Parent, {
						owner: required(string({ model: "x", minLength: 1 }))
					});

					expect((Child.members.owner as Property).reverse).toBe("http://example.org/owner");

				});

				it("rejects incompatible property kinds across parents", async () => {

					const First = resource({ name: required(string()) });
					const Second = resource({ name: required(integer()) });

					expect(() => resource(First, Second, {})).toThrow(RangeError);

				});

				it("includes transitive inherited entries", async () => {

					const GrandParent = resource({ id: required(string()) });
					const Parent = resource(GrandParent, { name: required(string()) });
					const Child = resource(Parent, { age: optional(integer()) });

					expect(Child.model).toEqual({ id: "", name: "", age: 0 });

				});

			});

		});

	});


	describe("id", () => {

		it("returns a marker with kind 'id'", async () => {

			const prop = id();

			expect(prop.kind).toBe("id");

		});

	});

	describe("type", () => {

		it("returns a marker with kind 'type'", async () => {

			const prop = type();

			expect(prop.kind).toBe("type");

		});

	});

	describe("property", () => {

		describe("cardinality bounds", () => {

			it.each([
				["multiple", multiple, undefined, undefined],
				["nonempty", nonempty, 1, undefined],
				["optional", optional, undefined, 1],
				["required", required, 1, 1]
			])("%s sets correct cardinality bounds", async (_name, factory, expectedMin, expectedMax) => {

				const { range } = factory(string());

				expect(range.minCount).toBe(expectedMin);
				expect(range.maxCount).toBe(expectedMax);
				expect(range.shape.kind).toBe("string");

			});

			it("accepts a lazy resource shape", async () => {

				const { range } = multiple(() => resource({}));

				expect(range.shape.kind).toBe("resource");

			});

			it("returns an immutable range", async () => {

				const { range } = required(string());

				expect(() => {
					(range as any).minCount = 99;
				}).toThrow();

			});

			it("includes only expected range entries", async () => {

				const { range } = required(string());

				expect(Object.keys(range).sort()).toEqual(["kind", "maxCount", "minCount", "model", "shape"]);

			});

		});

		describe("stated bounds", () => {

			it("reads the bounds off the constraints", async () => {

				const { range } = property(string(), { minCount: 2, maxCount: 5 });

				expect(range.minCount).toBe(2);
				expect(range.maxCount).toBe(5);
				expect(range.shape.kind).toBe("string");

			});

			it("leaves the lower bound unstated", async () => {

				const { range } = property(string(), { maxCount: 3 });

				expect(range.minCount).toBeUndefined();
				expect(range.maxCount).toBe(3);

			});

			it("leaves the upper bound unstated", async () => {

				const { range } = property(string(), { minCount: 2 });

				expect(range.minCount).toBe(2);
				expect(range.maxCount).toBeUndefined();

			});

			it("leaves both bounds unstated", async () => {

				const { range } = property(string());

				expect(range.minCount).toBeUndefined();
				expect(range.maxCount).toBeUndefined();

			});

			it("rejects a negative lower bound", async () => {
				expect(() => property(string(), { minCount: -1 })).toThrow(TypeError);
			});

			it("rejects a negative upper bound", async () => {
				expect(() => property(string(), { maxCount: -1 })).toThrow(TypeError);
			});

			it("rejects inconsistent bounds", async () => {
				expect(() => property(string(), { minCount: 5, maxCount: 2 })).toThrow(TypeError);
			});

		});

		describe("model projection", () => {

			it("boxes a multi-valued model into a singleton tuple", async () => {
				expect(property(string(), { minCount: 2, maxCount: 5 }).range.model).toEqual([""]);
			});

			it("boxes a multi-valued model with an unstated upper bound", async () => {
				expect(property(string(), { minCount: 2 }).range.model).toEqual([""]);
			});

			it("boxes a multi-valued resource model into a singleton tuple", async () => {
				expect(property(resource({ name: required(string()) }), { minCount: 2, maxCount: 5 }).range.model)
					.toEqual([{ name: "" }]);
			});

			it("projects a localised dictionary model per tag for collection cardinality", async () => {
				expect(property(dictionary({ en: "", it: "" }), { minCount: 2, maxCount: 5 }).range.model)
					.toEqual({ en: [""], it: [""] });
			});

			it("projects a localised dictionary model per tag for scalar cardinality", async () => {
				expect(property(dictionary({ en: "", it: "" }), { minCount: 1, maxCount: 1 }).range.model)
					.toEqual({ en: "", it: "" });
			});

			it("wraps the default tag map for scalar cardinality", async () => {
				expect(required(dictionary()).range.model).toEqual({ "*": "" });
			});

			it("wraps the default tag map for optional cardinality", async () => {
				expect(optional(dictionary()).range.model).toEqual({ "*": "" });
			});

			it("boxes default tag values into singleton tuples for collection cardinality", async () => {
				expect(multiple(dictionary()).range.model).toEqual({ "*": [""] });
			});

			it("boxes default tag values into singleton tuples for nonempty cardinality", async () => {
				expect(nonempty(dictionary()).range.model).toEqual({ "*": [""] });
			});

			it("boxes default tag values into singleton tuples for stated bounds", async () => {
				expect(property(dictionary(), { minCount: 2, maxCount: 5 }).range.model).toEqual({ "*": [""] });
			});

		});

		describe("single range", () => {

			it("creates Property from single range", async () => {

				const prop = required(string());

				expect(prop.range.kind).toBe("set");
				expect((prop.range as SetShape).shape.kind).toBe("string");

			});

			it("returns an immutable property", async () => {

				const prop = required(string());

				expect(() => {
					(prop as any).range = {};
				}).toThrow();

			});

		});

		describe("union variants", () => {

			it("accepts a range with union shape", async () => {

				const prop = required(union(string(), integer()));

				expect(prop.range.kind).toBe("set");

				const rangeShape = (prop.range as SetShape).shape;
				expect(rangeShape.kind).toBe("union");
				expect((rangeShape as UnionShape).variants[0].kind).toBe("string");
				expect((rangeShape as UnionShape).variants[1].kind).toBe("number");

			});

		});

		describe("with specs", () => {

			it("accepts specs and single range", async () => {

				const prop = required(string(), { hidden: true });

				expect(prop.range.kind).toBe("set");
				expect((prop.range as SetShape).shape.kind).toBe("string");

			});

			it("includes hidden in the property", async () => {

				const prop = required(string(), { hidden: true });

				expect(prop.hidden).toBe(true);

			});

			it("expands string name and description shorthands", async () => {

				const shape = resource({
					age: optional(integer(), { name: "Age", description: "The *age* in years" })
				});

				expect(shape.members.age).toMatchObject({
					name: { [assert("en", isTag)]: "Age" },
					description: { [assert("en", isTag)]: "The *age* in years" }
				});

			});

			it("folds a property name to a single line", async () => {

				const shape = resource({
					age: optional(integer(), { name: "  The  age\n  in years  " })
				});

				expect(shape.members.age).toMatchObject({
					name: { [assert("en", isTag)]: "The age in years" }
				});

			});

			it("realigns a property description flush left", async () => {

				const shape = resource({
					age: optional(integer(), { description: "\n\t\t\t\t\tThe *age*.\n\n\t\t\t\t\t- in years\n" })
				});

				expect(shape.members.age).toMatchObject({
					description: { [assert("en", isTag)]: "The *age*.\n\n- in years" }
				});

			});

			it("converts string forward to IRI", async () => {

				const prop = required(string(), { forward: "http://example.org/name" });

				expect(prop.forward).toBe("http://example.org/name");

			});

			it("converts string reverse to IRI", async () => {

				const prop = required(string(), { reverse: "http://example.org/owner" });

				expect(prop.reverse).toBe("http://example.org/owner");

			});

		});

		describe("structural integrity", () => {

			it("includes provided specs", async () => {

				const prop = required(string(), {
					hidden: true,
					forward: "http://example.org/name",
					reverse: "http://example.org/owner"
				});

				expect(prop).toMatchObject({
					hidden: true,
					forward: "http://example.org/name",
					reverse: "http://example.org/owner"
				});
				expect(prop.range).toBeDefined();

			});

			it("includes only provided entries", async () => {

				const prop = required(string(), { hidden: true });

				expect(prop).toMatchObject({ hidden: true });
				expect(prop.range).toBeDefined();

			});

		});

	});


});

describe("utilities", () => {

	describe("match", () => {

		describe("absolute pattern", () => {

			it("matches absolute IRI with same origin", async () => {

				expect(match(
					"https://example.org/products/123",
					"https://example.org/products/{id}"
				)).toBeTruthy();

			});

			it("rejects absolute IRI with different origin", async () => {

				expect(match(
					"https://other.org/products/123",
					"https://example.org/products/{id}"
				)).toBeFalsy();

			});

			it("rejects root-relative IRI", async () => {

				expect(match(
					"/products/123",
					"https://example.org/products/{id}"
				)).toBeFalsy();

			});

		});

		describe("root-relative pattern", () => {

			it("matches root-relative IRI", async () => {

				expect(match(
					"/products/123",
					"/products/{id}"
				)).toBeTruthy();

			});

			it("matches absolute IRI ignoring origin", async () => {

				expect(match(
					"https://example.org/products/123",
					"/products/{id}"
				)).toBeTruthy();

			});

			it("matches absolute IRI with any origin", async () => {

				expect(match(
					"https://other.org/products/123",
					"/products/{id}"
				)).toBeTruthy();

			});

		});

	});

	describe("flatten", () => {

		describe("no inheritance", () => {

			it("returns equivalent shape for shape without extends", async () => {

				const shape = resource({ name: required(string()), age: optional(integer()) });
				const flat = flatten(shape);

				expect(flat.kind).toBe("resource");
				expect(flat.members).toHaveProperty("name");
				expect(flat.members).toHaveProperty("age");

			});

			it("preserves undefined extends", async () => {

				const shape = resource({ name: required(string()) });
				const flat = flatten(shape);

				expect(flat.parents).toBeUndefined();

			});

		});

		describe("single parent", () => {

			it("merges parent entries into child", async () => {

				const parent = resource({ age: optional(integer()) });
				const child = resource(parent, { name: required(string()) });

				const flat = flatten(child);

				expect(flat.members).toHaveProperty("name");
				expect(flat.members).toHaveProperty("age");

			});

			it("narrows overlapping constraints from parent", async () => {

				const parent = resource({ name: required(string({ maxLength: 100 })) });
				const child = resource(parent, {
					name: required(string({
						model: "hello",
						minLength: 5
					}))
				});

				const flat = flatten(child);

				const prop = flat.members["name"] as Property;

				expect((prop.range.shape as any).minLength).toBe(5);
				expect((prop.range.shape as any).maxLength).toBe(100);

			});

			it("preserves extends for reference", async () => {

				const parent = resource({});
				const child = resource(parent, {});

				const flat = flatten(child);

				expect(flat.parents).toStrictEqual([parent]);

			});

		});

		describe("multi-level inheritance", () => {

			it("merges grandparent entries through chain", async () => {

				const grandparent = resource({ code: required(string()) });
				const parent = resource(grandparent, { age: optional(integer()) });
				const child = resource(parent, { name: required(string()) });

				const flat = flatten(child);

				expect(flat.members).toHaveProperty("code");
				expect(flat.members).toHaveProperty("age");
				expect(flat.members).toHaveProperty("name");

			});

		});

		describe("preserved fields", () => {

			it("preserves kind", async () => {

				const flat = flatten(resource({}));

				expect(flat.kind).toBe("resource");

			});

			it("preserves name from input shape", async () => {

				const parent = resource({}, { name: { und: "Parent" } });
				const child = resource(parent, {}, { name: { und: "Child" } });

				const flat = flatten(child);

				expect(flat.name).toEqual({ und: "Child" });

			});

			it("preserves description from input shape", async () => {

				const parent = resource({}, { description: { und: "Parent desc" } });
				const child = resource(parent, {}, { description: { und: "Child desc" } });

				const flat = flatten(child);

				expect(flat.description).toEqual({ und: "Child desc" });

			});

			it("preserves class from input shape", async () => {

				const parent = resource({}, { class: "http://example.org/Parent" });
				const child = resource(parent, {}, { class: "http://example.org/Child" });

				const flat = flatten(child);

				expect(flat.class).toBe("http://example.org/Child");

			});

		});

		describe("conjunctive fields", () => {

			it("accumulates classes from lineage", async () => {

				const grandparent = resource({}, { class: "http://example.org/GrandParent" });
				const parent = resource(grandparent, {}, { class: "http://example.org/Parent" });
				const child = resource(parent, {}, { class: "http://example.org/Child" });

				const flat = flatten(child);

				expect(flat.classes).toContain("http://example.org/Parent");
				expect(flat.classes).toContain("http://example.org/GrandParent");
				expect(flat.classes).not.toContain("http://example.org/Child");

			});

			it("narrows in constraints from lineage", async () => {

				const parent = resource({}, {
					in: ["http://example.org/a", "http://example.org/b"]
				});

				const child = resource(parent, {}, { in: ["http://example.org/b"] });

				const flat = flatten(child);

				expect(flat.in).toEqual(["http://example.org/b"]);

			});

			it("unions hasValue from lineage", async () => {

				const parent = resource({}, { hasValue: ["http://example.org/a"] });

				const child = resource(parent, {}, {
					hasValue: ["http://example.org/a", "http://example.org/b"]
				});

				const flat = flatten(child);

				expect(flat.hasValue).toContain("http://example.org/a");
				expect(flat.hasValue).toContain("http://example.org/b");

			});

			it("unions validators from lineage", async () => {

				const v1: (value: Resource) => undefined | Trace = () => undefined;
				const v2: (value: Resource) => undefined | Trace = () => undefined;

				const parent = resource({}, { validators: [v1] });
				const child = resource(parent, {}, { validators: [v2] });

				const flat = flatten(child);

				expect(flat.validators).toContain(v1);
				expect(flat.validators).toContain(v2);

			});

		});

		describe("inherit fields", () => {

			describe("virtual", () => {

				describe("linear", () => {

					it("inherits virtual from parent when child has none", async () => {

						const parent = resource({}, { virtual: true });
						const child = resource(parent, {});

						const flat = flatten(child);

						expect(flat.virtual).toBe(true);

					});

					it("child overrides parent virtual", async () => {

						const parent = resource({}, { virtual: true });
						const child = resource(parent, {}, { virtual: false });

						const flat = flatten(child);

						expect(flat.virtual).toBe(false);

					});

					it("grandparent virtual overridden by parent propagates to child", async () => {

						const grandparent = resource({}, { virtual: true });
						const parent = resource(grandparent, {}, { virtual: false });
						const child = resource(parent, {});

						const flat = flatten(child);

						expect(flat.virtual).toBe(false);

					});

				});

				describe("branched", () => {

					it("inherits virtual when both parents agree", async () => {

						const parentA = resource({}, { virtual: true });
						const parentB = resource({}, { virtual: true });
						const child = resource(parentA, parentB, {});

						const flat = flatten(child);

						expect(flat.virtual).toBe(true);

					});

					it("child overrides conflicting parents", async () => {

						const parentA = resource({}, { virtual: true });
						const parentB = resource({}, { virtual: false });
						const child = resource(parentA, parentB, {}, { virtual: true });

						const flat = flatten(child);

						expect(flat.virtual).toBe(true);

					});

					it("rejects conflicting parents without child override", async () => {

						const parentA = resource({}, { virtual: true });
						const parentB = resource({}, { virtual: false });

						expect(() => resource(parentA, parentB, {})).toThrow();

					});

					it("rejects undefined vs defined conflict without child override", async () => {

						const parentA = resource({}, { virtual: true });
						const parentB = resource({});

						expect(() => resource(parentA, parentB, {})).toThrow();

					});

				});

			});

			describe("namespace", () => {

				describe("linear", () => {

					it("inherits namespace from parent when child has none", async () => {

						const ns = createNamespace("http://example.org/");
						const parent = resource({}, { space: ns });
						const child = resource(parent, {});

						const flat = flatten(child);

						expect(flat.space).toBe(ns);

					});

					it("child overrides parent namespace", async () => {

						const nsParent = createNamespace("http://parent.org/");
						const nsChild = createNamespace("http://child.org/");
						const parent = resource({}, { space: nsParent });
						const child = resource(parent, {}, { space: nsChild });

						const flat = flatten(child);

						expect(flat.space).toBe(nsChild);

					});

					it("grandparent namespace overridden by parent propagates to child", async () => {

						const nsGrand = createNamespace("http://grand.org/");
						const nsParent = createNamespace("http://parent.org/");
						const grandparent = resource({}, { space: nsGrand });
						const parent = resource(grandparent, {}, { space: nsParent });
						const child = resource(parent, {});

						const flat = flatten(child);

						expect(flat.space).toBe(nsParent);

					});

				});

				describe("branched", () => {

					it("inherits namespace when both parents agree", async () => {

						const ns = createNamespace("http://example.org/");
						const parentA = resource({}, { space: ns });
						const parentB = resource({}, { space: ns });
						const child = resource(parentA, parentB, {});

						const flat = flatten(child);

						expect(flat.space).toBe(ns);

					});

					it("child overrides conflicting parents", async () => {

						const nsA = createNamespace("http://a.org/");
						const nsB = createNamespace("http://b.org/");
						const nsChild = createNamespace("http://child.org/");
						const parentA = resource({}, { space: nsA });
						const parentB = resource({}, { space: nsB });
						const child = resource(parentA, parentB, {}, { space: nsChild });

						const flat = flatten(child);

						expect(flat.space).toBe(nsChild);

					});

					it("rejects conflicting parents without child override", async () => {

						const nsA = createNamespace("http://a.org/");
						const nsB = createNamespace("http://b.org/");
						const parentA = resource({}, { space: nsA });
						const parentB = resource({}, { space: nsB });

						expect(() => resource(parentA, parentB, {})).toThrow();

					});

					it("rejects undefined vs defined conflict without child override", async () => {

						const ns = createNamespace("http://example.org/");
						const parentA = resource({}, { space: ns });
						const parentB = resource({});

						expect(() => resource(parentA, parentB, {})).toThrow();

					});

				});

			});

			describe.each([
				"hidden" as const
			])("%s", (field) => {

				describe("linear", () => {

					it(`inherits ${field} from parent property when child has none`, async () => {

						const parent = resource({ field: required(string(), { [field]: true }) });
						const child = resource(parent, { field: required(string()) });

						const flat = flatten(child);

						expect((flat.members.field as Property)[field]).toBe(true);

					});

					it(`child overrides parent ${field}`, async () => {

						const parent = resource({ field: required(string(), { [field]: true }) });
						const child = resource(parent, { field: required(string(), { [field]: false }) });

						const flat = flatten(child);

						expect((flat.members.field as Property)[field]).toBe(false);

					});

					it(`grandparent ${field} overridden by parent propagates to child`, async () => {

						const grandparent = resource({ field: required(string(), { [field]: true }) });
						const parent = resource(grandparent, { field: required(string(), { [field]: false }) });
						const child = resource(parent, { field: required(string()) });

						const flat = flatten(child);

						expect((flat.members.field as Property)[field]).toBe(false);

					});

				});

				describe("branched", () => {

					it(`inherits ${field} when both parents agree`, async () => {

						const parentA = resource({ field: required(string(), { [field]: true }) });
						const parentB = resource({ field: required(string(), { [field]: true }) });
						const child = resource(parentA, parentB, { field: required(string()) });

						const flat = flatten(child);

						expect((flat.members.field as Property)[field]).toBe(true);

					});

					it("child overrides conflicting parents", async () => {

						const parentA = resource({ field: required(string(), { [field]: true }) });
						const parentB = resource({ field: required(string(), { [field]: false }) });
						const child = resource(parentA, parentB, { field: required(string(), { [field]: true }) });

						const flat = flatten(child);

						expect((flat.members.field as Property)[field]).toBe(true);

					});

					it("rejects conflicting parents without child override", async () => {

						const parentA = resource({ field: required(string(), { [field]: true }) });
						const parentB = resource({ field: required(string(), { [field]: false }) });

						expect(() => resource(parentA, parentB, { field: required(string()) })).toThrow(RangeError);

					});

					it("rejects undefined vs defined conflict without child override", async () => {

						const parentA = resource({ field: required(string(), { [field]: true }) });
						const parentB = resource({ field: required(string()) });

						expect(() => resource(parentA, parentB, { field: required(string()) })).toThrow(RangeError);

					});

				});

			});

		});

		describe("error cases", () => {

			it("rejects incompatible property kind overrides", async () => {

				const parent = resource({ field: id() });

				expect(() => resource(parent, { field: required(string()) })).toThrow(RangeError);

			});

		});

		describe("singleton conflicts", () => {

			describe("checkSingletons", () => {

				it("accepts entries with no id or type", async () => {

					expect(checkSingletons([
						{ kind: "property" },
						{ kind: "property" }
					])).toBeUndefined();

				});

				it("accepts a single id entry", async () => {

					expect(checkSingletons([
						{ kind: "id" },
						{ kind: "property" }
					])).toBeUndefined();

				});

				it("accepts a single type entry", async () => {

					expect(checkSingletons([
						{ kind: "type" },
						{ kind: "property" }
					])).toBeUndefined();

				});

				it("accepts one id and one type together", async () => {

					expect(checkSingletons([
						{ kind: "id" },
						{ kind: "type" },
						{ kind: "property" }
					])).toBeUndefined();

				});

				it("reports duplicate id entries", async () => {

					expect(checkSingletons([
						{ kind: "id" },
						{ kind: "id" }
					])).toBeDefined();

				});

				it("reports duplicate type entries", async () => {

					expect(checkSingletons([
						{ kind: "type" },
						{ kind: "type" }
					])).toBeDefined();

				});

				it("reports both duplicate id and type entries", async () => {

					const trace = checkSingletons([
						{ kind: "id" },
						{ kind: "id" },
						{ kind: "type" },
						{ kind: "type" }
					]);

					expect(trace).toBeDefined();
					expect(Object.keys(trace!)).toHaveLength(2);

				});

			});

			describe("flatten", () => {

				it("rejects duplicate id entries from inheritance", async () => {

					const parent = resource({
						rid: id(),
						name: required(string())
					});

					const child = resource(parent, {
						age: required(integer())
					});

					// manually assemble a shape with duplicate id — bypassing factory check
					const manual: ResourceShape = {
						...child,
						members: {
							...child.members,
							rid2: id()
						}
					};

					expect(() => flatten(manual)).toThrow(RangeError);

				});

				it("rejects duplicate type entries from inheritance", async () => {

					const parent = resource({
						rtype: type(),
						name: required(string())
					}, { class: "app:/types/T" });

					const child = resource(parent, {
						age: required(integer())
					}, { class: "app:/types/U" });

					// manually assemble a shape with duplicate type — bypassing factory check
					const manual: ResourceShape = {
						...child,
						members: {
							...child.members,
							rtype2: type()
						}
					};

					expect(() => flatten(manual)).toThrow(RangeError);

				});

				it("accepts single id and type through inheritance", async () => {

					const parent = resource({
						rid: id(),
						name: required(string())
					});

					const child = resource(parent, {
						age: required(integer())
					});

					expect(() => flatten(child)).not.toThrow();

				});

			});

		});

		describe("checkParents", () => {

			it("returns undefined for single parent", async () => {

				const parent = resource({ name: required(string()) });
				const child = resource(parent, { age: required(integer()) });

				expect(checkParents(child, [flatten(parent)])).toBeUndefined();

			});

			it("returns undefined when parents agree on virtual", async () => {

				const parentA = resource({ name: required(string()) }, { virtual: true });
				const parentB = resource({ age: required(integer()) }, { virtual: true });
				const child = resource(parentA, parentB, {});

				expect(checkParents(child, [flatten(parentA), flatten(parentB)])).toBeUndefined();

			});

			it("reports conflicting virtual without child override", async () => {

				const parentA = resource({ name: required(string()) }, { virtual: true });
				const parentB = resource({ age: required(integer()) }, {});
				const child = resource({}, {});

				expect(checkParents(child, [flatten(parentA), flatten(parentB)])).toBeDefined();

			});

			it("returns undefined when child overrides conflicting virtual", async () => {

				const parentA = resource({ name: required(string()) }, { virtual: true });
				const parentB = resource({ age: required(integer()) }, {});
				const child = resource({}, { virtual: false });

				expect(checkParents(child, [flatten(parentA), flatten(parentB)])).toBeUndefined();

			});

			it("returns undefined when parents agree on namespace", async () => {

				const ns = createNamespace("http://example.org/");
				const parentA = resource({ name: required(string()) }, { space: ns });
				const parentB = resource({ age: required(integer()) }, { space: ns });
				const child = resource({}, {});

				expect(checkParents(child, [flatten(parentA), flatten(parentB)])).toBeUndefined();

			});

			it("reports conflicting namespace without child override", async () => {

				const parentA = resource({ name: required(string()) }, { space: createNamespace("http://example.org/") });
				const parentB = resource({ age: required(integer()) }, { space: createNamespace("http://other.org/") });
				const child = resource({}, {});

				expect(checkParents(child, [flatten(parentA), flatten(parentB)])).toBeDefined();

			});

			it.each([
				"hidden" as const
			])("reports conflicting %s without child override", async (field) => {

				const parentA = resource({ field: required(string(), { [field]: true }) });
				const parentB = resource({ field: required(string(), { [field]: false }) });
				const child = resource({}, {});

				expect(checkParents(child, [flatten(parentA), flatten(parentB)])).toBeDefined();

			});

			it.each([
				"hidden" as const
			])("keys a conflicting %s by bare entry name and braced constraint", async (field) => {

				const parentA = resource({ field: required(string(), { [field]: true }) });
				const parentB = resource({ field: required(string(), { [field]: false }) });
				const child = resource({}, {});

				expect(checkParents(child, [flatten(parentA), flatten(parentB)]))
					.toContainEqual(expect.stringContaining(`{${field}}`));

			});

			it.each([
				"hidden" as const
			])("returns undefined when child overrides conflicting %s", async (field) => {

				const parentA = resource({ field: required(string(), { [field]: true }) });
				const parentB = resource({ field: required(string(), { [field]: false }) });
				const child = resource({ field: required(string(), { [field]: true }) });

				expect(checkParents(child, [flatten(parentA), flatten(parentB)])).toBeUndefined();

			});

			it("reports conflicting localised model without child override", async () => {

				const parentA = resource({ label: required(dictionary({ en: "hello" })) });
				const parentB = resource({ label: required(dictionary({ fr: "bonjour" })) });
				const child = resource({}, {});

				expect(checkParents(child, [flatten(parentA), flatten(parentB)])).toBeDefined();

			});

			it("returns undefined when parents agree on localised model", async () => {

				const parentA = resource({ label: required(dictionary({ en: "hello" })) });
				const parentB = resource({ label: required(dictionary({ en: "hello" })) });
				const child = resource({}, {});

				expect(checkParents(child, [flatten(parentA), flatten(parentB)])).toBeUndefined();

			});

			it("returns undefined when child overrides conflicting localised model", async () => {

				const parentA = resource({ label: required(dictionary({ en: "hello" })) });
				const parentB = resource({ label: required(dictionary({ fr: "bonjour" })) });
				const child = resource({ label: required(dictionary({ de: "hallo" })) });

				expect(checkParents(child, [flatten(parentA), flatten(parentB)])).toBeUndefined();

			});

		});

		describe("checkPredicates", () => {

			it("returns undefined for distinct forward predicates", async () => {

				const shape = resource({
					name: required(string(), { forward: "http://example.org/name" }),
					label: required(string(), { forward: "http://example.org/label" })
				});

				expect(checkPredicates(shape)).toBeUndefined();

			});

			it("reports duplicate forward predicates", async () => {

				const base = resource({ name: required(string(), { forward: "http://example.org/name" }) });

				const manual: ResourceShape = {
					...base,
					members: {
						...base.members,
						label: { kind: "property", forward: "http://example.org/name", range: required(string()).range }
					}
				};

				expect(checkPredicates(manual)).toBeDefined();

			});

			it("keys a duplicate forward predicate by bare entry name and braced constraint", async () => {

				const base = resource({ name: required(string(), { forward: "http://example.org/name" }) });

				const manual: ResourceShape = {
					...base,
					members: {
						...base.members,
						label: { kind: "property", forward: "http://example.org/name", range: required(string()).range }
					}
				};

				expect(checkPredicates(manual)).toContainEqual(expect.stringContaining("{forward}"));

			});

			it("returns undefined for distinct reverse predicates", async () => {

				const shape = resource({
					owner: required(string(), { reverse: "http://example.org/owns" }),
					creator: required(string(), { reverse: "http://example.org/created" })
				});

				expect(checkPredicates(shape)).toBeUndefined();

			});

			it("reports duplicate reverse predicates", async () => {

				const base = resource({ owner: required(string(), { reverse: "http://example.org/owns" }) });

				const manual: ResourceShape = {
					...base,
					members: {
						...base.members,
						creator: { kind: "property", reverse: "http://example.org/owns", range: required(string()).range }
					}
				};

				expect(checkPredicates(manual)).toBeDefined();

			});

			it("checks forward and reverse independently", async () => {

				const shape = resource({
					name: required(string(), { forward: "http://example.org/name" }),
					owner: required(string(), { reverse: "http://example.org/name" })
				});

				expect(checkPredicates(shape)).toBeUndefined();

			});

			it("ignores non-property entries", async () => {

				const shape = resource({
					rid: id(),
					rtype: type(),
					name: required(string(), { forward: "http://example.org/name" })
				}, { class: "app:/types/T" });

				expect(checkPredicates(shape)).toBeUndefined();

			});

		});

		describe("checkEmbedded", () => {

			it("returns undefined without embedded resources", async () => {

				const shape = resource({ name: required(string()) });

				expect(checkId(shape)).toBeUndefined();

			});

			it("accepts an embedded resource without an id", async () => {

				const shape = resource({ child: optional(resource({ label: required(string()) })) });

				expect(checkId(shape)).toBeUndefined();

			});

			it("accepts an embedded resource declaring a type", async () => {

				const shape = resource({
					child: optional(resource({
						rtype: type(),
						label: required(string())
					}, { class: "app:/types/T" }))
				});

				expect(checkId(shape)).toBeUndefined();

			});

			it("ignores an id on a reference target", async () => {

				const shape = resource({
					link: required(reference(resource({
						rid: id(),
						name: required(string())
					})))
				});

				expect(checkId(shape)).toBeUndefined();

			});

			it("reports an embedded resource declaring an id", async () => {

				const base = resource({ label: required(string()) });

				const manual: ResourceShape = {
					...base,
					members: {
						...base.members,
						child: {
							kind: "property",
							forward: "http://example.org/child",
							range: optional(resource({ rid: id() })).range
						}
					}
				};

				expect(checkId(manual)).toBeDefined();

			});

			it("keys an embedded id by bare entry name", async () => {

				const base = resource({ label: required(string()) });

				const manual: ResourceShape = {
					...base,
					members: {
						...base.members,
						child: {
							kind: "property",
							forward: "http://example.org/child",
							range: optional(resource({ rid: id() })).range
						}
					}
				};

				expect(checkId(manual)).toEqual(["{id} unexpected <id> entry in embedded resource <child>"]);

			});

			it("reports an id-bearing resource variant inside a union", async () => {

				const base = resource({ label: required(string()) });

				const manual: ResourceShape = {
					...base,
					members: {
						...base.members,
						child: {
							kind: "property",
							forward: "http://example.org/child",
							range: optional(union(resource({ rid: id() }), resource({ value: required(integer()) }))).range
						}
					}
				};

				expect(checkId(manual)).toBeDefined();

			});

		});

		describe("predicate conflicts", () => {

			describe.each([
				["forward", "reverse", "name", "label", "http://example.org/name", "http://example.org/label"] as const,
				["reverse", "forward", "owner", "creator", "http://example.org/owns", "http://example.org/created"] as const
			])("%s", (direction, opposite, prop1, prop2, iri1, iri2) => {

				it(`accepts distinct ${direction} predicates`, async () => {

					const shape = resource({
						[prop1]: required(string(), { [direction]: iri1 }),
						[prop2]: required(string(), { [direction]: iri2 })
					});

					expect(() => flatten(shape)).not.toThrow();

				});

				it(`rejects duplicate ${direction} predicates`, async () => {

					expect(() => resource({
						[prop1]: required(string(), { [direction]: iri1 }),
						[prop2]: required(string(), { [direction]: iri1 })
					})).toThrow(RangeError);

				});

				it(`rejects duplicate ${direction} predicates from inheritance`, async () => {

					const parent = resource({ [prop1]: required(string(), { [direction]: iri1 }) });

					expect(() => resource(parent, {
						[prop2]: required(string(), { [direction]: iri1 })
					})).toThrow(RangeError);

				});

				it(`ignores properties without ${direction} predicates`, async () => {

					const shape = resource({
						[prop1]: required(string(), { [opposite]: iri1 }),
						[prop2]: required(string(), { [opposite]: iri2 })
					});

					expect(() => flatten(shape)).not.toThrow();

				});

			});

			it("checks forward and reverse independently", async () => {

				const shape = resource({
					name: required(string(), { forward: "http://example.org/name" }),
					owner: required(string(), { reverse: "http://example.org/name" })
				});

				expect(() => flatten(shape)).not.toThrow();

			});

		});

		describe("model", () => {

			it("computes model from merged entries", async () => {

				const parent = resource({ age: optional(integer()) });
				const child = resource(parent, { name: required(string()) });

				const flat = flatten(child);

				expect(flat.model).toHaveProperty("name", "");
				expect(flat.model).toHaveProperty("age", 0);

			});

		});

		describe("idempotency", () => {

			it("returns same reference on repeated calls", async () => {

				const parent = resource({ age: optional(integer()) });
				const child = resource(parent, { name: required(string()) });

				const first = flatten(child);
				const second = flatten(first);

				expect(second).toBe(first);

			});

			it("returns same reference for shape without extends", async () => {

				const shape = resource({ name: required(string()) });

				const first = flatten(shape);
				const second = flatten(first);

				expect(second).toBe(first);

			});

		});

		describe("circular extends", () => {

			it("rejects direct self-extension", async () => {

				function Self(): ResourceShape {
					return resource(Self, { name: required(string()) });
				}

				expect(() => flatten(Self())).toThrow(TraceError);

			});

			it("rejects two-node cycle", async () => {

				function A(): ResourceShape {
					return resource(B, { a: required(string()) });
				}

				function B(): ResourceShape {
					return resource(A, { b: required(string()) });
				}

				expect(() => flatten(A())).toThrow(TraceError);

			});

			it("rejects three-node cycle", async () => {

				function A(): ResourceShape {
					return resource(B, { a: required(string()) });
				}

				function B(): ResourceShape {
					return resource(C, { b: required(string()) });
				}

				function C(): ResourceShape {
					return resource(A, { c: required(string()) });
				}

				expect(() => flatten(A())).toThrow(TraceError);

			});

			it("rejects cycle in multi-parent extends", async () => {

				const Base = resource({ base: required(string()) });

				function X(): ResourceShape {
					return resource(Base, Y, { x: required(string()) });
				}

				function Y(): ResourceShape {
					return resource(X, { y: required(string()) });
				}

				expect(() => flatten(X())).toThrow(TraceError);

			});

		});

	});

	describe("enforce", () => {

		describe("limit", () => {

			const limit = 100;

			it("injects no # when the limit is 0 (unbounded)", async () => {

				const Target = resource({ name: required(string()) });
				const Wrapper = resource({ items: multiple(reference(Target)) });

				expect(enforce({ items: [{ name: "" }] }, Wrapper, { limit: 0 }))
					.toEqual({ items: [{ name: "" }] });

			});


			describe("top-level dispatch", () => {

				it("returns empty object unchanged", async () => {

					const shape = resource({ name: required(string()) });

					expect(enforce({}, shape, { limit })).toEqual({});

				});

			});

			describe("scalar slots (maxCount 1)", () => {

				it("returns primitive scalar unchanged", async () => {

					const shape = resource({ name: required(string()), age: optional(integer()) });

					expect(enforce({ name: "", age: 0 }, shape, { limit }))
						.toEqual({ name: "", age: 0 });

				});

				it("returns IRI reference unchanged", async () => {

					const Target = resource({ label: required(string()) });
					const shape = resource({ link: optional(reference(Target)) });

					expect(enforce({ link: "https://example.org/x" }, shape, { limit }))
						.toEqual({ link: "https://example.org/x" });

				});

				it("recurses into reference-with-template, eagerly resolving the target", async () => {

					const Target = resource({ items: multiple(string()) });
					const shape = resource({ link: optional(reference(Target)) });

					expect(enforce({ link: { items: [""] } }, shape, { limit }))
						.toEqual({ link: { items: ["", { "#": limit }] } });

				});

				it("returns localised scalar unchanged", async () => {

					const shape = resource({ label: optional(dictionary()) });

					expect(enforce({ label: "hello" }, shape, { limit }))
						.toEqual({ label: "hello" });
					expect(enforce({ label: { en: "hi", it: "ciao" } }, shape, { limit }))
						.toEqual({ label: { en: "hi", it: "ciao" } });

				});

			});

			describe("object collection slots", () => {

				const Inner = resource({ label: required(string()) });
				const shape = resource({ items: multiple(reference(Inner)) });

				it("injects # into reference-with-template wrapper", async () => {

					expect(enforce({ items: [{ label: "" }] }, shape, { limit }))
						.toEqual({ items: [{ label: "" }, { "#": limit }] });

				});

				it("preserves existing # on selection slot", async () => {

					expect(enforce({ items: [{ label: "" }, { "#": 25 }] }, shape, { limit }))
						.toEqual({ items: [{ label: "" }, { "#": 25 }] });

				});

				it("recurses into element body even when # is present", async () => {

					const Outer = resource({ children: multiple(reference(Inner)) });
					const nested = resource({ items: multiple(reference(Outer)) });

					expect(enforce(
						{ items: [{ children: [{ label: "" }] }, { "#": 25 }] }, nested, { limit }
					)).toEqual({
						items: [{ children: [{ label: "" }, { "#": limit }] }, { "#": 25 }]
					});

				});

				it("injects # on bare IRI reference collection", async () => {

					expect(enforce({ items: ["https://example.org/x"] }, shape, { limit }))
						.toEqual({ items: ["https://example.org/x", { "#": limit }] });

				});

				it("handles embedded-resource collection by injecting # on selection slot", async () => {

					const embedded = resource({ items: multiple(resource({ label: required(string()) })) });

					expect(enforce({ items: [{ label: "" }] }, embedded, { limit }))
						.toEqual({ items: [{ label: "" }, { "#": limit }] });

				});

			});

			describe("primitive collection slots", () => {

				it("injects # into bare-scalar string collection", async () => {

					const shape = resource({ tags: multiple(string()) });

					expect(enforce({ tags: [""] }, shape, { limit }))
						.toEqual({ tags: ["", { "#": limit }] });

				});

				it("injects # into bare-scalar number collection", async () => {

					const shape = resource({ sizes: multiple(integer()) });

					expect(enforce({ sizes: [0] }, shape, { limit }))
						.toEqual({ sizes: [0, { "#": limit }] });

				});

				it("injects # into bare-scalar boolean collection", async () => {

					const shape = resource({ flags: multiple(boolean()) });

					expect(enforce({ flags: [false] }, shape, { limit }))
						.toEqual({ flags: [false, { "#": limit }] });

				});

				it("injects # into placeholder-element primitive collection", async () => {

					const shape = resource({ tags: multiple(string()) });

					expect(enforce({ tags: [""] }, shape, { limit }))
						.toEqual({ tags: ["", { "#": limit }] });

				});

				it("injects # into selection-bearing primitive collection", async () => {

					const shape = resource({ tags: multiple(string()) });

					expect(enforce({ tags: ["", { "~": "pre" }] }, shape, { limit }))
						.toEqual({ tags: ["", { "~": "pre", "#": limit }] });

				});

				it("preserves existing # in selection-bearing primitive collection", async () => {

					const shape = resource({ tags: multiple(string()) });

					expect(enforce({ tags: ["", { "#": 10 }] }, shape, { limit }))
						.toEqual({ tags: ["", { "#": 10 }] });

				});

			});

			describe("localised collection slots", () => {

				it("leaves multi-valued localised array unchanged", async () => {

					const shape = resource({ labels: multiple(dictionary()) });

					expect(enforce({ labels: ["hello"] }, shape, { limit }))
						.toEqual({ labels: ["hello"] });

				});

				it("leaves localised per-tag map collection unchanged", async () => {

					const shape = resource({ labels: multiple(dictionary()) });

					expect(enforce({ labels: { en: "hi" } }, shape, { limit }))
						.toEqual({ labels: { en: "hi" } });

				});

			});

			describe("scalar union slots (maxCount 1)", () => {

				const A = resource({ name: required(string()) });
				const B = resource({ tags: multiple(string()) });
				const shape = resource({ value: optional(union(A, B)) });

				it("recurses into union-form variant templates", async () => {

					expect(enforce(
						{ value: { "0": { name: "" }, "1": { tags: [""] } } }, shape, { limit }
					)).toEqual({
						value: { "0": { name: "" }, "1": { tags: ["", { "#": limit }] } }
					});

				});

			});

			describe("collection union slots (maxCount > 1)", () => {

				const A = resource({ name: required(string()) });
				const B = resource({ tags: multiple(string()) });
				const shape = resource({ items: multiple(union(A, B)) });

				it("injects # on union-form wrapper", async () => {

					expect(enforce(
						{ items: [{ "0": { name: "" }, "1": { tags: [""] } }] }, shape, { limit }
					)).toEqual({
						items: [{
							"0": { name: "" },
							"1": { tags: ["", { "#": limit }] }
						}, {
							"#": limit
						}]
					});

				});

				it("preserves existing # on selection slot", async () => {

					expect(enforce(
						{ items: [{ "0": { name: "" } }, { "#": 25 }] }, shape, { limit }
					)).toEqual({
						items: [{ "0": { name: "" } }, { "#": 25 }]
					});

				});

				it("recurses into indexed branches even when selection # present", async () => {

					expect(enforce(
						{ items: [{ "1": { tags: [""] } }, { "#": 25 }] }, shape, { limit }
					)).toEqual({
						items: [{ "1": { tags: ["", { "#": limit }] } }, { "#": 25 }]
					});

				});

				it("injects # on partial union-form element", async () => {

					const single = resource({ items: multiple(union(A)) });

					expect(enforce(
						{ items: [{ "0": { name: "" } }] }, single, { limit }
					)).toEqual({
						items: [{ "0": { name: "" } }, { "#": limit }]
					});

				});

				it("injects # into bare-primitive collection element", async () => {

					const prim = resource({ items: multiple(union(string(), integer())) });

					expect(enforce({ items: [""] }, prim, { limit }))
						.toEqual({ items: ["", { "#": limit }] });
					expect(enforce({ items: [0] }, prim, { limit }))
						.toEqual({ items: [0, { "#": limit }] });

				});

				it("injects # on plain object-form collection element", async () => {

					expect(enforce({ items: [{ name: "" }] }, shape, { limit }))
						.toEqual({ items: [{ name: "" }, { "#": limit }] });

				});

			});

			describe("projection bindings", () => {

				it("recurses into binding-keyed collection placeholder", async () => {

					const Inner = resource({ label: required(string()) });
					const Outer = resource({ children: multiple(reference(Inner)) });
					const shape = resource({ items: multiple(reference(Outer)) });

					expect(enforce(
						{ items: [{ "alias=children": [{ label: "" }] }] }, shape, { limit }
					)).toEqual({
						items: [{
							"alias=children": [{ label: "" }, { "#": limit }]
						}, {
							"#": limit
						}]
					});

				});

			});

		});

	});

});

describe("operators", () => {

	describe("checkResource", () => {

		it("returns undefined for consistent constraints", async () => {

			expect(checkResource({
				in: ["a", "b"],
				hasValue: ["a"]
			})).toBeUndefined();

		});

		it("returns undefined when only in is provided", async () => {

			expect(checkResource({ in: ["a", "b"] })).toBeUndefined();

		});

		it("returns undefined when only hasValue is provided", async () => {

			expect(checkResource({ hasValue: ["a"] })).toBeUndefined();

		});

		it("returns undefined when no constraints are provided", async () => {

			expect(checkResource({})).toBeUndefined();

		});

		it("returns trace when hasValue entries are not in 'in' set", async () => {

			const trace = checkResource({
				in: ["a", "b"],
				hasValue: ["c"]
			});

			expect(trace).toContainEqual(expect.stringContaining("{hasValue/in}"));

		});

	});


	describe("narrowsResource", () => {

		it("accepts an identical child", async () => {

			const Base = resource({ name: required(string()) });

			expect(narrowsResource(Base, Base)).toBeUndefined();

		});

		it("accepts a child that tightens a property", async () => {

			const Base = resource({ name: required(string()) });
			const Child = resource({ name: required(string({ model: "x", minLength: 1 })) });

			expect(narrowsResource(Child, Base)).toBeUndefined();

		});

		it("keys an entry named after a constraint without colliding with it", async () => {

			const Base = resource({ pattern: required(string()) });
			const Child = resource({ pattern: required(integer()) });

			expect(at(narrowsResource(Child, Base), "pattern")).toBeDefined();

		});

		it("ignores class differences (composition is class-conjunctive)", async () => {

			const A = resource({ name: required(string()) }, { class: "http://example.org/A" });
			const B = resource({ name: required(string()) }, { class: "http://example.org/B" });

			expect(narrowsResource(A, B)).toBeUndefined();

		});

		it("rejects a child that widens a property", async () => {

			const Base = resource({ name: required(string({ model: "hello", minLength: 5 })) });
			const Child = resource({ name: required(string({ model: "x", minLength: 1 })) });

			expect(narrowsResource(Child, Base)).toBeDefined();

		});

	});

	describe("narrowsProperty", () => {

		it("accepts a child that tightens the range", async () => {

			const base: Property = { kind: "property", range: required(string()).range };
			const child: Property = { kind: "property", range: required(string({ model: "x", minLength: 1 })).range };

			expect(narrowsProperty(child, base)).toBeUndefined();

		});

		it("rejects a child that widens the range", async () => {

			const base: Property = { kind: "property", range: required(string({ model: "hello", minLength: 5 })).range };
			const child: Property = { kind: "property", range: required(string({ model: "x", minLength: 1 })).range };

			expect(narrowsProperty(child, base)).toBeDefined();

		});

	});


	describe("mergeResource", () => {

		describe("kind", () => {

			it("preserves kind as 'resource'", async () => {

				const merged = mergeResource(resource({}), resource({}));

				expect(merged.kind).toBe("resource");

			});

		});

		describe("model", () => {

			it("computes model from merged entries", async () => {

				const merged = mergeResource(
					resource({ name: required(string()) }),
					resource({ age: optional(integer()) })
				);

				expect(merged.model).toEqual({ name: "", age: 0 });

			});

			it("uses merged range models for overlapping entries", async () => {

				const merged = mergeResource(
					resource({ name: required(string()) }),
					resource({ name: required(string()) })
				);

				expect(merged.model).toHaveProperty("name", "");

			});

			it("inherits base model for entries not in target", async () => {

				const base = resource(resource({ inherited: optional(integer()) }), {});

				const merged = mergeResource(
					resource({ name: required(string()) }),
					base
				);

				expect(merged.model).toHaveProperty("inherited", 0);
				expect(merged.model).toHaveProperty("name", "");

			});

		});

		describe("virtual", () => {

			it("inherits virtual from target", async () => {

				const merged = mergeResource(
					resource({}, { virtual: true }),
					resource({})
				);

				expect(merged.virtual).toBe(true);

			});

			it("inherits virtual from source when target is undefined", async () => {

				const merged = mergeResource(
					resource({}),
					resource({}, { virtual: true })
				);

				expect(merged.virtual).toBe(true);

			});

			it("preserves undefined when neither defines virtual", async () => {

				const merged = mergeResource(resource({}), resource({}));

				expect(merged.virtual).toBeUndefined();

			});

		});

		describe("name", () => {

			it("preserves name from target", async () => {

				const merged = mergeResource(
					resource({}, { name: { und: "child" } }),
					resource({}, { name: { und: "parent" } })
				);

				expect(merged.name).toEqual({ und: "child" });

			});

		});

		describe("description", () => {

			it("preserves description from target", async () => {

				const merged = mergeResource(
					resource({}, { description: { und: "child desc" } }),
					resource({}, { description: { und: "parent desc" } })
				);

				expect(merged.description).toEqual({ und: "child desc" });

			});

		});

		describe("namespace", () => {

			it("inherits namespace from target", async () => {

				const ns = createNamespace("http://example.org/");

				const merged = mergeResource(
					resource({}, { space: ns }),
					resource({})
				);

				expect(merged.space).toBe(ns);

			});

			it("inherits namespace from source when target is undefined", async () => {

				const ns = createNamespace("http://example.org/");

				const merged = mergeResource(
					resource({}),
					resource({}, { space: ns })
				);

				expect(merged.space).toBe(ns);

			});

		});

		describe("classes", () => {

			it("collects parent class into classes", async () => {

				const merged = mergeResource(
					resource({}),
					resource({}, { class: "http://example.org/Parent" })
				);

				expect(merged.classes).toContain("http://example.org/Parent");

			});

			it("merges parent classes with target classes", async () => {

				const A = resource({}, { class: "http://example.org/A" });
				const B = resource({}, { class: "http://example.org/B" });

				const merged = mergeResource(
					resource(A, {}),
					resource(B, {})
				);

				expect(merged.classes).toContain("http://example.org/A");
				expect(merged.classes).toContain("http://example.org/B");

			});

			it("deduplicates class entries", async () => {

				const A = resource({}, { class: "http://example.org/A" });

				const merged = mergeResource(
					resource(A, {}),
					resource(A, {}, { class: "http://example.org/A" })
				);

				expect(merged.classes!.filter(c => c === "http://example.org/A")).toHaveLength(1);

			});

			it("preserves target class outside merge", async () => {

				const merged = mergeResource(
					resource({}, { class: "http://example.org/Child" }),
					resource({})
				);

				expect(merged.class).toBe("http://example.org/Child");

			});

		});

		describe("pattern", () => {

			it("inherits pattern from target", async () => {

				const merged = mergeResource(
					resource({}, { pattern: "/products/{id}" }),
					resource({})
				);

				expect(merged.pattern).toBe("/products/{id}");

			});

			it("inherits pattern from source when target is undefined", async () => {

				const merged = mergeResource(
					resource({}),
					resource({}, { pattern: "/products/{id}" })
				);

				expect(merged.pattern).toBe("/products/{id}");

			});

			it("accepts equal patterns", async () => {

				const merged = mergeResource(
					resource({}, { pattern: "/products/{id}" }),
					resource({}, { pattern: "/products/{id}" })
				);

				expect(merged.pattern).toBe("/products/{id}");

			});

			it("narrows parent wildcard pattern", async () => {

				const merged = mergeResource(
					resource({}, { pattern: "/products/{id}/reviews/{rid}" }),
					resource({}, { pattern: "/products/*" })
				);

				expect(merged.pattern).toBe("/products/{id}/reviews/{rid}");

			});

			it("narrows parent wildcard with child wildcard", async () => {

				const merged = mergeResource(
					resource({}, { pattern: "/products/{id}/reviews/*" }),
					resource({}, { pattern: "/products/*" })
				);

				expect(merged.pattern).toBe("/products/{id}/reviews/*");

			});

			it("rejects incompatible patterns without wildcard", async () => {

				expect(() => mergeResource(
					resource({}, { pattern: "/items/{id}" }),
					resource({}, { pattern: "/products/{id}" })
				)).toThrow(RangeError);

			});

			it("rejects incompatible patterns with mismatched prefix", async () => {

				expect(() => mergeResource(
					resource({}, { pattern: "/items/{id}" }),
					resource({}, { pattern: "/products/*" })
				)).toThrow(RangeError);

			});

		});

		describe("in", () => {

			it("inherits in from target", async () => {

				const merged = mergeResource(
					resource({}, { in: ["http://example.org/a"] }),
					resource({})
				);

				expect(merged.in).toEqual(["http://example.org/a"]);

			});

			it("inherits in from source when target is undefined", async () => {

				const merged = mergeResource(
					resource({}),
					resource({}, { in: ["http://example.org/a"] })
				);

				expect(merged.in).toEqual(["http://example.org/a"]);

			});

			it("keeps a target narrowing source", async () => {

				const merged = mergeResource(
					resource({}, { in: ["http://example.org/b"] }),
					resource({}, { in: ["http://example.org/a", "http://example.org/b"] })
				);

				expect(merged.in).toEqual(["http://example.org/b"]);

			});

			it("rejects a target widening source", async () => {

				expect(() => mergeResource(
					resource({}, { in: ["http://example.org/a", "http://example.org/b"] }),
					resource({}, { in: ["http://example.org/b", "http://example.org/c"] })
				)).toThrow(RangeError);

			});

			it("rejects disjoint sets", async () => {

				expect(() => mergeResource(
					resource({}, { in: ["http://example.org/a"] }),
					resource({}, { in: ["http://example.org/b"] })
				)).toThrow(RangeError);

			});

			it("accepts a target adding required values", async () => {

				const merged = mergeResource(
					resource({}, { hasValue: ["http://example.org/a", "http://example.org/b"] }),
					resource({}, { hasValue: ["http://example.org/a"] })
				);

				expect(merged.hasValue).toEqual(["http://example.org/a", "http://example.org/b"]);

			});

			it("rejects a target dropping a required value", async () => {

				expect(() => mergeResource(
					resource({}, { hasValue: ["http://example.org/a"] }),
					resource({}, { hasValue: ["http://example.org/a", "http://example.org/b"] })
				)).toThrow(RangeError);

			});

		});

		describe("hasValue", () => {

			it("inherits hasValue from target", async () => {

				const merged = mergeResource(
					resource({}, { hasValue: ["http://example.org/a"] }),
					resource({})
				);

				expect(merged.hasValue).toEqual(["http://example.org/a"]);

			});

			it("computes union of target and source", async () => {

				const merged = mergeResource(
					resource({}, { hasValue: ["http://example.org/a", "http://example.org/b"] }),
					resource({}, { hasValue: ["http://example.org/b"] })
				);

				expect(merged.hasValue).toContain("http://example.org/a");
				expect(merged.hasValue).toContain("http://example.org/b");

			});

			it("deduplicates hasValue entries", async () => {

				const merged = mergeResource(
					resource({}, { hasValue: ["http://example.org/a"] }),
					resource({}, { hasValue: ["http://example.org/a"] })
				);

				expect(merged.hasValue).toEqual(["http://example.org/a"]);

			});

		});

		describe("validators", () => {

			it("inherits validators from target", async () => {

				const v: (value: Resource) => undefined | Trace = () => undefined;

				const merged = mergeResource(
					resource({}, { validators: [v] }),
					resource({})
				);

				expect(merged.validators).toContain(v);

			});

			it("computes union of target and source validators", async () => {

				const v1: (value: Resource) => undefined | Trace = () => undefined;
				const v2: (value: Resource) => undefined | Trace = () => undefined;

				const merged = mergeResource(
					resource({}, { validators: [v1] }),
					resource({}, { validators: [v2] })
				);

				expect(merged.validators).toContain(v1);
				expect(merged.validators).toContain(v2);

			});

			it("deduplicates validators", async () => {

				const v: (value: Resource) => undefined | Trace = () => undefined;

				const merged = mergeResource(
					resource({}, { validators: [v] }),
					resource({}, { validators: [v] })
				);

				expect(merged.validators).toHaveLength(1);

			});

		});

		describe("entries", () => {

			it("merges entries from both shapes", async () => {

				const merged = mergeResource(
					resource({ name: required(string()) }),
					resource({ age: optional(integer()) })
				);

				expect(merged.members).toHaveProperty("name");
				expect(merged.members).toHaveProperty("age");

			});

			it("merges clashing property entries", async () => {

				const merged = mergeResource(
					resource({ name: required(string({ model: "hello", minLength: 5 })) }),
					resource({ name: required(string({ maxLength: 20 })) })
				);

				const prop = merged.members["name"] as Property;

				expect(prop.kind).toBe("property");
				expect((prop.range.shape as any).minLength).toBe(5);
				expect((prop.range.shape as any).maxLength).toBe(20);

			});

			it("preserves id entries as immutable", async () => {

				const merged = mergeResource(
					resource({ iri: id() }),
					resource({ iri: id() })
				);

				expect(merged.members["iri"].kind).toBe("id");

			});

			it("preserves type entries as immutable", async () => {

				const merged = mergeResource(
					resource({ rdfType: type() }, { class: "app:/types/T" }),
					resource({ rdfType: type() }, { class: "app:/types/T" })
				);

				expect(merged.members["rdfType"].kind).toBe("type");

			});

			it("rejects kind mismatch on same property key", async () => {

				try {

					mergeResource(
						resource({ field: required(string()) }),
						resource({ field: id() })
					);

					expect.unreachable();

				} catch ( e ) {

					expect(e).toBeInstanceOf(TraceError);
					expect(at((e as TraceError).cause, "field")).toBeDefined();

				}

			});

		});

		describe("post-merge validation", () => {

			it("rejects hasValue entries not in 'in' set", async () => {

				expect(() => mergeResource(
					resource({}, { hasValue: ["http://example.org/a"] }),
					resource({}, { in: ["http://example.org/b"] })
				)).toThrow(RangeError);

			});

		});

	});

	describe("mergeProperty", () => {

		const base: Property = { kind: "property", range: required(string()).range };

		describe("kind", () => {

			it("preserves kind as 'property'", async () => {

				const merged = mergeProperty(base, base);

				expect(merged.kind).toBe("property");

			});

		});

		describe("range", () => {

			it("delegates range merge", async () => {

				const merged = mergeProperty(
					{ ...base, range: required(string({ model: "hello", minLength: 5 })).range },
					base
				);

				expect((merged.range.shape as any).minLength).toBe(5);

			});

		});

		describe.each([
			{ field: "hidden" as const }
		])("$field", ({ field }) => {

			it("inherits source value when target has none", async () => {

				const merged = mergeProperty(
					base,
					{ ...base, [field]: true }
				);

				expect(merged[field]).toBe(true);

			});

			it("keeps target value when source has none", async () => {

				const merged = mergeProperty(
					{ ...base, [field]: true },
					base
				);

				expect(merged[field]).toBe(true);

			});

		});

		describe("hidden", () => {

			it("uses target hidden over source hidden", async () => {

				const merged = mergeProperty(
					{ ...base, hidden: false },
					{ ...base, hidden: true }
				);

				expect(merged.hidden).toBe(false);

			});

		});

		describe.each([
			{ field: "forward" as const },
			{ field: "reverse" as const }
		])("$field", ({ field }) => {

			it("inherits source value when target has none", async () => {

				const merged = mergeProperty(
					base,
					{ ...base, [field]: "http://example.org/term" }
				);

				expect(merged[field]).toBe("http://example.org/term");

			});

			it("rejects redefinition by target when source defines it", async () => {

				expect(() => mergeProperty(
					{ ...base, [field]: "http://target.org/term" },
					{ ...base, [field]: "http://source.org/term" }
				)).toThrow(TraceError);

			});

			it("rejects definition by target when source has none", async () => {

				expect(() => mergeProperty(
					{ ...base, [field]: "http://target.org/term" },
					base
				)).toThrow(TraceError);

			});

		});

		describe.each([
			{ field: "foreign" as const },
			{ field: "captive" as const }
		])("$field", ({ field }) => {

			it("inherits source value when target has none", async () => {

				const merged = mergeProperty(base, { ...base, [field]: true });

				expect(merged[field]).toBe(true);

			});

			it("preserves absence when neither defines it", async () => {

				const merged = mergeProperty(base, base);

				expect(merged[field]).toBeUndefined();

			});

			it("tolerates a matching value on both target and source", async () => {

				const merged = mergeProperty({ ...base, [field]: true }, { ...base, [field]: true });

				expect(merged[field]).toBe(true);

			});

			it("rejects redefinition by target when source has none", async () => {

				expect(() => mergeProperty({ ...base, [field]: true }, base)).toThrow(TraceError);

			});

		});

		describe.each([
			{ field: "name" as const },
			{ field: "description" as const }
		])("$field", ({ field }) => {

			it("inherits source value when target has none", async () => {

				const merged = mergeProperty(
					base,
					{ ...base, [field]: { en: "Source" } }
				);

				expect(merged[field]).toEqual({ en: "Source" });

			});

			it("preserves absent value when neither defines it", async () => {

				const merged = mergeProperty(base, base);

				expect(merged[field]).toBeUndefined();

			});

			it("rejects definition by target when source has none", async () => {

				expect(() => mergeProperty(
					{ ...base, [field]: { en: "Target" } },
					base
				)).toThrow(TraceError);

			});

			it("rejects redefinition by target when source defines it", async () => {

				expect(() => mergeProperty(
					{ ...base, [field]: { en: "Target" } },
					{ ...base, [field]: { en: "Source" } }
				)).toThrow(TraceError);

			});

		});

	});


	describe("deriveResource", () => {

		it("derives a scalar property placeholder", async () => {

			expect(deriveResource(resource({ name: required(string()) }))).toEqual({ name: "" });

		});

		it("derives a multi-valued property placeholder as a singleton tuple", async () => {

			expect(deriveResource(resource({ tags: multiple(string()) }))).toEqual({ tags: [""] });

		});

		it("projects id entries to the default base", async () => {

			expect(deriveResource(resource({ id: id(), name: required(string()) })))
				.toEqual({ id: app, name: "" });

		});

		it("projects reference entries to the stored model", async () => {

			const shape = resource({ ref: required(reference(resource({}, { pattern: "/things/{id}" }))) });

			expect(deriveResource(shape)).toEqual({ ref: "app:/" });

		});

	});

});

describe("validators", () => {

	describe("validateResource", () => {

		describe("resource constraints", () => {

			describe("closed shape", () => {

				const named = resource({
					name: required(string()),
					age: optional(integer())
				});


				it("accepts empty resource with no entries", async () => {

					expect(validateResource([{}], resource({}))).toBeUndefined();

				});

				it("accepts resource with subset of defined entries", async () => {

					expect(validateResource([{ name: "Alice" }], named)).toBeUndefined();

				});

				it("accepts declared id property", async () => {

					const shape = resource({
						id: id(),
						name: required(string())
					});

					expect(validateResource([{ "id": "app:/users/123", name: "Alice" }], shape)).toBeUndefined();

				});

				it("accepts declared type property", async () => {

					const shape = resource({
						type: type(),
						name: required(string())
					}, { class: "app:/types/Person" });

					expect(validateResource([{
						"type": "app:/types/Person",
						name: "Alice"
					}], shape)).toBeUndefined();

				});

				it("accepts entries from inherited shape", async () => {

					const Base = resource({
						code: required(integer())
					});

					const Derived = resource(Base, {
						name: required(string())
					});

					expect(validateResource([{ code: 1, name: "Alice" }], Derived)).toBeUndefined();

				});

				it("rejects unknown property", async () => {

					const trace = validateResource([{ name: "Alice", extra: "value" }], named);

					expect(rec(trace, "0")).toHaveProperty("extra");

				});

			});

			describe("foreign references", () => {

				const Target = resource({ id: id(), label: required(string()) });

				const shape = resource({
					name: required(string()),
					children: multiple(reference(Target), { foreign: true })
				});


				it("accepts resource without foreign property", async () => {

					expect(validateResource([{ name: "Alice" }], shape)).toBeUndefined();

				});

				it("rejects foreign property with IRI value", async () => {

					const trace = validateResource([{
						name: "Alice",
						children: ["app:/items/1"]
					}], shape);

					expect(rec(trace, "0")).toHaveProperty("children");

				});

				it("rejects foreign property with nested resource", async () => {

					const trace = validateResource([{
						name: "Alice",
						children: [{ label: "Child" }]
					}], shape);

					expect(rec(trace, "0")).toHaveProperty("children");

				});

				it("accepts foreign property when undefined", async () => {

					expect(validateResource([{ name: "Alice", children: undefined }], shape)).toBeUndefined();

				});

				it("accepts non-foreign reference property", async () => {

					const owned = resource({
						name: required(string()),
						parent: optional(reference(Target))
					});

					expect(validateResource([{ name: "Alice", parent: "app:/items/1" }], owned)).toBeUndefined();

				});


				describe("unions", () => {

					const Other = resource({ id: id(), code: required(integer()) });


					it("rejects a foreign union property whatever the value", async () => {

						// foreign is declared on the property, so it covers every variant of the range

						const links = resource({
							name: required(string()),
							links: required(union(reference(Target), reference(Other)), { foreign: true })
						});

						expect(rec(validateResource([{
							name: "Alice",
							links: "app:/target/1"
						}], links), "0")).toHaveProperty("links");

						expect(rec(validateResource([{
							name: "Alice",
							links: { label: "Child" }
						}], links), "0")).toHaveProperty("links");

					});

					it("accepts an owned union property", async () => {

						const links = resource({
							name: required(string()),
							links: required(union(integer(), reference(Target)))
						});

						expect(validateResource([{
							name: "Alice",
							links: "app:/target/1"
						}], links)).toBeUndefined();

					});

				});

			});

			describe("custom validators", () => {

				const adultValidator: (value: Resource) => undefined | Trace = (r) => {
					return (r as any).age >= 18 ? undefined : ["must be adult"];
				};

				const validated = resource({
					age: required(integer())
				}, {
					validators: [adultValidator]
				});


				it("accepts resource passing custom validator", async () => {

					expect(validateResource([{ age: 25 }], validated)).toBeUndefined();

				});

				it("rejects resource failing custom validator", async () => {

					expect(validateResource([{ age: 15 }], validated)).toBeDefined();

				});

				it("runs all custom validators", async () => {

					const v1: (value: Resource) => undefined | Trace = (r) => (r as any).a > 0 ? undefined : ["a must be positive"];
					const v2: (value: Resource) => undefined | Trace = (r) => (r as any).b > 0 ? undefined : ["b must be positive"];

					const shape = resource({
						a: required(integer()),
						b: required(integer())
					}, {
						validators: [v1, v2]
					});

					// both pass

					expect(validateResource([{ a: 1, b: 1 }], shape)).toBeUndefined();

					// first fails

					expect(validateResource([{ a: -1, b: 1 }], shape)).toBeDefined();

					// second fails

					expect(validateResource([{ a: 1, b: -1 }], shape)).toBeDefined();

				});

				it("enforces inherited validators", async () => {

					const validator: (value: Resource) => undefined | Trace = (r) => {
						return (r as any).age >= 18 ? undefined : ["must be adult"];
					};

					const Base = resource({
						age: required(integer())
					}, { validators: [validator] });

					const Derived = resource(Base, {
						name: required(string())
					});

					expect(validateResource([{ age: 25, name: "Alice" }], Derived)).toBeUndefined();
					expect(validateResource([{ age: 15, name: "Bob" }], Derived)).toBeDefined();

				});

			});

			describe("trace structure", () => {

				it("returns keyed trace for value-level violations", async () => {

					const shape = resource({
						age: required(integer({ minInclusive: 0 }))
					});

					const trace = validateResource([{ age: -5 }], shape);

					expect(rec(trace, "0")).toHaveProperty("age");

				});

				it("includes property path in nested traces", async () => {

					const Address = resource({
						city: required(string({ model: "x", minLength: 1 }))
					});

					const Person = resource({
						address: required(Address)
					});

					const trace = validateResource([{ address: { city: "" } }], Person);
					const inner = rec(trace, "0");

					expect(inner).toHaveProperty("address");

					const address = inner["address"];

					expect(address).toHaveProperty([0, "0", 0, "city"]);

				});

				it("includes both unknown and invalid property traces in dictionary", async () => {

					const Address = resource({
						city: required(string({ model: "x", minLength: 1 }))
					});

					const shape = resource({
						address: required(Address)
					});

					const trace = validateResource([{
						address: { city: "" },
						extra: "value"
					}], shape);

					expect(rec(trace, "0")).toHaveProperty("extra");
					expect(rec(trace, "0")).toHaveProperty("address");

				});

			});

		});

		describe("embedding constraints", () => {

			it("accepts embedded resource without id or type", async () => {

				const Nested = resource({
					label: required(string())
				});

				const shape = resource({
					child: optional(Nested)
				});

				expect(validateResource([{ child: { label: "x" } }], shape)).toBeUndefined();

			});

			it("accepts standalone reference with id", async () => {

				const Target = resource({
					rid: id(),
					name: required(string())
				});

				const shape = resource({
					link: required(reference(Target))
				});

				expect(validateResource([{ link: "app:/targets/1" }], shape)).toBeUndefined();

			});

			// The embedded-resource id rejection is enforced by validateResource against the state, not at
			// shape construction: a resource-kind range bearing an id is a genuine embedded resource only
			// when a resource state is validated against the shape. At construction it is indistinguishable
			// from an expanded captive reference (a legal retrieval model), so the shape MUST construct
			// without error and the violation surfaces only against an actual state value.

			it("rejects embedded resource containing id entry", async () => {

				const Nested = resource({
					rid: id(),
					label: required(string())
				});

				const shape = resource({
					child: optional(Nested)
				});

				expect(validateResource([{ child: { rid: "app:/n/1", label: "x" } }], shape))
					.toContainEqual(expect.stringContaining("child"));

			});

			it("accepts embedded resource containing type entry", async () => {

				const Nested = resource({
					rtype: type(),
					label: required(string())
				}, { class: "app:/T" });

				const shape = resource({
					child: optional(Nested)
				});

				expect(validateResource([{ child: { rtype: "app:/T", label: "x" } }], shape)).toBeUndefined();

			});

			it("rejects embedded resource containing id entry alongside type entry", async () => {

				const Nested = resource({
					rid: id(),
					rtype: type(),
					label: required(string())
				}, { class: "app:/types/T" });

				const shape = resource({
					child: optional(Nested)
				});

				expect(validateResource([{ child: { rid: "app:/n/1", rtype: "app:/types/T", label: "x" } }], shape))
					.toContainEqual(expect.stringContaining("child"));

			});

			it("rejects embedded resource in union variant containing id entry", async () => {

				const Nested = resource({
					rid: id(),
					label: required(string())
				});

				const Other = resource({
					value: required(integer())
				});

				const shape = resource({
					child: optional(union(Nested, Other))
				});

				expect(validateResource([{ child: { rid: "app:/n/1", label: "x" } }], shape))
					.toContainEqual(expect.stringContaining("child"));

			});

		});

		describe("id constraints", () => {

			it("accepts single absolute IRI", async () => {

				const shape = resource({ id: id() });

				expect(validateResource([{ "id": "app:/users/123" }], shape)).toBeUndefined();

			});

			it("accepts missing id", async () => {

				const shape = resource({ id: id() });

				expect(validateResource([{}], shape)).toBeUndefined();

			});

			it("rejects non-IRI value", async () => {

				const shape = resource({ id: id() });

				const trace = validateResource([{ "id": "not an iri" }], shape);
				const inner = rec(trace, "0");

				expect(inner).toHaveProperty("id");
				expect(inner["id"]).toContainEqual(expect.stringContaining("{kind}"));

			});

			it("rejects multiple values", async () => {

				const shape = resource({ id: id() });

				const trace = validateResource([{ "id": ["/users/1", "/users/2"] }], shape);
				const inner = rec(trace, "0");

				expect(inner).toHaveProperty("id");
				expect(inner["id"]).toContainEqual(expect.stringContaining("{kind}"));

			});

			describe("pattern", () => {

				it("accepts id matching pattern", async () => {

					const shape = resource({ id: id() }, { pattern: "/users/{id}" });

					expect(validateResource([{ "id": "app:/users/123" }], shape)).toBeUndefined();

				});

				it("accepts wildcard pattern", async () => {

					const shape = resource({ id: id() }, { pattern: "/users/*" });

					expect(validateResource([{ "id": "app:/users/123/profile" }], shape)).toBeUndefined();

				});

				it("rejects id not matching pattern", async () => {

					const shape = resource({ id: id() }, { pattern: "/users/{id}" });

					const trace = validateResource([{ "id": "/products/123" }], shape);
					const inner = rec(trace, "0");

					expect(inner).toHaveProperty("id");
					expect(inner["id"]).toContainEqual(expect.stringContaining("{pattern}"));

				});

				it("accepts missing id", async () => {

					const shape = resource({ id: id() }, { pattern: "/users/{id}" });

					expect(validateResource([{}], shape)).toBeUndefined();

				});

			});

			describe("in", () => {

				it("accepts id in allowed enumeration", async () => {

					const shape = resource({ id: id() }, { in: ["app:/users/alice", "app:/users/bob"] });

					expect(validateResource([{ "id": "app:/users/alice" }], shape)).toBeUndefined();

				});

				it("rejects id not in allowed enumeration", async () => {

					const shape = resource({ id: id() }, { in: ["app:/users/alice", "app:/users/bob"] });

					const trace = validateResource([{ "id": "app:/users/charlie" }], shape);
					const inner = rec(trace, "<app:/users/charlie>");

					expect(inner).toHaveProperty("id");
					expect(inner["id"]).toContainEqual(expect.stringContaining("{in}"));

				});

				it("accepts missing id", async () => {

					const shape = resource({ id: id() }, { in: ["app:/users/alice", "app:/users/bob"] });

					expect(validateResource([{}], shape)).toBeUndefined();

				});

			});

			describe("hasValue", () => {

				it("accepts id matching required value", async () => {

					const shape = resource({ id: id() }, { hasValue: ["app:/users/admin"] });

					expect(validateResource([{ "id": "app:/users/admin" }], shape)).toBeUndefined();

				});

				it("rejects id not matching required value", async () => {

					const shape = resource({ id: id() }, { hasValue: ["app:/users/admin"] });

					const trace = validateResource([{ "id": "app:/users/guest" }], shape);
					const inner = rec(trace, "<app:/users/guest>");

					expect(inner).toHaveProperty("id");
					expect(inner["id"]).toContainEqual(expect.stringContaining("{hasValue}"));

				});

				it("accepts missing id", async () => {

					const shape = resource({ id: id() }, { hasValue: ["app:/users/admin"] });

					expect(validateResource([{}], shape)).toBeUndefined();

				});

				it("rejects every id against several required values", async () => {

					// a single identifier cannot equal two required values at once

					const shape = resource({ id: id() }, {
						hasValue: ["app:/users/admin", "app:/users/root"]
					});

					const trace = validateResource([{ "id": "app:/users/admin" }], shape);
					const inner = rec(trace, "<app:/users/admin>");

					expect(inner).toHaveProperty("id");
					expect(inner["id"]).toContainEqual(expect.stringContaining("{hasValue}"));

				});

			});

		});

		describe("inherited class-level constraints", () => {

			describe("pattern", () => {

				it("enforces parent pattern on child", async () => {

					const Parent = resource({ id: id() }, { pattern: "/users/{id}" });
					const Child = resource(Parent, { name: required(string()) });

					expect(validateResource([{ "id": "app:/users/123", "name": "Alice" }], Child)).toBeUndefined();

					const trace = validateResource([{
						"id": "app:/products/123",
						"name": "Alice"
					}], Child);
					const inner = rec(trace, "<app:/products/123>");

					expect(inner).toHaveProperty("id");
					expect(inner["id"]).toContainEqual(expect.stringContaining("{pattern}"));

				});

				it("enforces both parent and child patterns conjunctively", async () => {

					const Parent = resource({ id: id() }, { pattern: "/org/*" });
					const Child = resource(Parent, { name: required(string()) }, { pattern: "/org/users/{id}" });

					expect(validateResource([{ "id": "app:/org/users/123", "name": "Alice" }], Child)).toBeUndefined();

					const trace = validateResource([{
						"id": "app:/org/products/123",
						"name": "Alice"
					}], Child);
					const inner = rec(trace, "<app:/org/products/123>");

					expect(inner).toHaveProperty("id");

					expect(inner["id"]).toContainEqual(expect.stringContaining("{pattern}"));

				});

			});

			describe("in", () => {

				it("enforces parent in constraint on child", async () => {

					const Parent = resource({ id: id() }, { in: ["app:/users/alice", "app:/users/bob"] });
					const Child = resource(Parent, { name: required(string()) });

					expect(validateResource([{ "id": "app:/users/alice", "name": "Alice" }], Child)).toBeUndefined();

					const trace = validateResource([{
						"id": "app:/users/charlie",
						"name": "Charlie"
					}], Child);
					const inner = rec(trace, "<app:/users/charlie>");

					expect(inner).toHaveProperty("id");
					expect(inner["id"]).toContainEqual(expect.stringContaining("{in}"));

				});

				it("accepts a child narrowing the parent in constraint", async () => {

					const Parent = resource({ id: id() }, { in: ["app:/users/alice", "app:/users/bob"] });

					expect(() => resource(Parent, {}, { in: ["app:/users/alice"] })).not.toThrow();

				});

				it("rejects a child widening the parent in constraint", async () => {

					// a value the parent omits would be intersected away, leaving the state wider than the
					// shape admits

					const Parent = resource({ id: id() }, { in: ["app:/users/alice", "app:/users/bob"] });

					expect(() => resource(Parent, {}, {
						in: ["app:/users/alice", "app:/users/charlie"]
					})).toThrow(TraceError);

				});

			});

			describe("hasValue", () => {

				it("enforces parent hasValue constraint on child", async () => {

					const Parent = resource({ id: id() }, { hasValue: ["app:/users/admin"] });
					const Child = resource(Parent, { name: required(string()) });

					expect(validateResource([{ "id": "app:/users/admin", "name": "Admin" }], Child)).toBeUndefined();

					const trace = validateResource([{
						"id": "app:/users/guest",
						"name": "Guest"
					}], Child);
					const inner = rec(trace, "<app:/users/guest>");

					expect(inner).toHaveProperty("id");
					expect(inner["id"]).toContainEqual(expect.stringContaining("{hasValue}"));

				});

				it("enforces parent and child hasValue conjunctively", async () => {

					const Parent = resource({ id: id() }, { hasValue: ["app:/users/admin"] });

					const Child = resource(Parent, { name: required(string()) }, {
						hasValue: ["app:/users/admin", "app:/users/root"]
					});

					// a single identifier cannot equal both required values, so every id fails, the parent's
					// own required value included

					expect(validateResource([
						{ "id": "app:/users/admin", "name": "Admin" }
					], Child)).toBeDefined();

					const trace = validateResource([
						{ "id": "app:/users/guest", "name": "Guest" }
					], Child);
					const inner = rec(trace, "<app:/users/guest>");

					expect(inner).toHaveProperty("id");

					expect(inner["id"]).toContainEqual(expect.stringContaining("{hasValue}"));

				});

				it("accepts a child extending the parent hasValue constraint", async () => {

					const Parent = resource({ id: id() }, { hasValue: ["app:/users/admin"] });

					expect(() => resource(Parent, {}, {
						hasValue: ["app:/users/admin", "app:/users/root"]
					})).not.toThrow();

				});

				it("rejects a child dropping a parent required value", async () => {

					// the parent value would be unioned back in, leaving the child stating a weaker
					// requirement than it enforces

					const Parent = resource({ id: id() }, { hasValue: ["app:/users/admin"] });

					expect(() => resource(Parent, {}, { hasValue: ["app:/users/root"] })).toThrow(TraceError);

				});

			});

		});

		describe("type constraints", () => {

			it("accepts single absolute IRI", async () => {

				const shape = resource({ type: type() }, { class: "app:/types/Person" });

				expect(validateResource([{ "type": "app:/types/Person" }], shape)).toBeUndefined();

			});

			it("accepts missing type", async () => {

				const shape = resource({ type: type() }, { class: "app:/types/Person" });

				expect(validateResource([{}], shape)).toBeUndefined();

			});

			it("rejects non-IRI value", async () => {

				const shape = resource({ type: type() }, { class: "app:/types/Person" });

				const trace = validateResource([{ "type": "not an iri" }], shape);
				const inner = rec(trace, "0");

				expect(inner).toHaveProperty("type");
				expect(inner["type"]).toContainEqual(expect.stringContaining("{kind}"));

			});

			it("rejects multiple values", async () => {

				const shape = resource({ type: type() }, { class: "app:/types/Person" });

				const trace = validateResource([{ "type": ["/types/A", "/types/B"] }], shape);
				const inner = rec(trace, "0");

				expect(inner).toHaveProperty("type");
				expect(inner["type"]).toContainEqual(expect.stringContaining("{kind}"));

			});

			it("accepts missing type on a class-less shape", async () => {

				const shape = resource({ type: type() });

				expect(validateResource([{}], shape)).toBeUndefined();

			});

			it("rejects a type value on a class-less shape", async () => {

				// no own class means no value to materialise, whatever IRI is supplied

				const shape = resource({ type: type() });

				const trace = validateResource([{ "type": "app:/types/Person" }], shape);
				const inner = rec(trace, "0");

				expect(inner).toHaveProperty("type");
				expect(inner["type"]).toContainEqual(
					expect.stringContaining("{class} unexpected <type> value without declared class")
				);

			});

			it("rejects a type value on a class-less shape inheriting a class", async () => {

				const Parent = resource({ type: type() }, { class: "app:/types/Person" });
				const Child = resource(Parent, {});

				// the parent class reaches the child as an inherited class, which no type value materialises

				const trace = validateResource([{ "type": "app:/types/Person" }], Child);
				const inner = rec(trace, "0");

				expect(inner).toHaveProperty("type");
				expect(inner["type"]).toContainEqual(
					expect.stringContaining("{class} unexpected <type> value without declared class")
				);

			});

		});

		describe("property constraints", () => {

			describe("required property", () => {

				const named = resource({
					name: required(string())
				});


				it("accepts present required property", async () => {

					expect(validateResource([{ name: "Alice" }], named)).toBeUndefined();

				});

				it("rejects missing required property", async () => {

					const trace = validateResource([{}], named);
					const inner = rec(trace, "0");

					expect(inner).toHaveProperty("name");
					expect(inner["name"]).toContainEqual(expect.stringContaining("{minCount}"));

				});

				it("rejects array value", async () => {

					const trace = validateResource([{ name: ["Alice"] }], named);
					const inner = rec(trace, "0");

					expect(inner).toHaveProperty("name");
					expect(inner["name"]).toContainEqual(expect.stringContaining("{kind}"));

				});

			});

			describe("optional property", () => {

				const aged = resource({
					age: optional(integer())
				});


				it("accepts present optional property", async () => {

					expect(validateResource([{ age: 30 }], aged)).toBeUndefined();

				});

				it("accepts missing optional property", async () => {

					expect(validateResource([{}], aged)).toBeUndefined();

				});

				it("rejects array value", async () => {

					const trace = validateResource([{ age: [30] }], aged);
					const inner = rec(trace, "0");

					expect(inner).toHaveProperty("age");
					expect(inner["age"]).toContainEqual(expect.stringContaining("{kind}"));

				});

			});

			describe("nonempty property", () => {

				const tagged = resource({
					tags: nonempty(string())
				});


				it("accepts array with single element", async () => {

					expect(validateResource([{ tags: ["a"] }], tagged)).toBeUndefined();

				});

				it("accepts array with multiple elements", async () => {

					expect(validateResource([{ tags: ["a", "b", "c"] }], tagged)).toBeUndefined();

				});

				it("rejects empty array", async () => {

					const trace = validateResource([{ tags: [] }], tagged);
					const inner = rec(trace, "0");

					expect(inner).toHaveProperty("tags");
					expect(inner["tags"]).toContainEqual(expect.stringContaining("{minCount}"));

				});

				it("rejects missing nonempty property", async () => {

					const trace = validateResource([{}], tagged);
					const inner = rec(trace, "0");

					expect(inner).toHaveProperty("tags");
					expect(inner["tags"]).toContainEqual(expect.stringContaining("{minCount}"));

				});

				it("rejects scalar value", async () => {

					const trace = validateResource([{ tags: "a" }], tagged);
					const inner = rec(trace, "0");

					expect(inner).toHaveProperty("tags");
					expect(inner["tags"]).toContainEqual(expect.stringContaining("{kind}"));

				});

			});

			describe("multiple property", () => {

				const aliased = resource({
					aliases: multiple(string())
				});


				it("accepts array with single element", async () => {

					expect(validateResource([{ aliases: ["x"] }], aliased)).toBeUndefined();

				});

				it("accepts array with multiple elements", async () => {

					expect(validateResource([{ aliases: ["x", "y", "z"] }], aliased)).toBeUndefined();

				});

				it("accepts empty array", async () => {

					expect(validateResource([{ aliases: [] }], aliased)).toBeUndefined();

				});

				it("accepts missing multiple property", async () => {

					expect(validateResource([{}], aliased)).toBeUndefined();

				});

				it("rejects scalar value", async () => {

					const trace = validateResource([{ aliases: "x" }], aliased);
					const inner = rec(trace, "0");

					expect(inner).toHaveProperty("aliases");
					expect(inner["aliases"]).toContainEqual(expect.stringContaining("{kind}"));

				});

			});

			describe("absence forms", () => {

				// canonical absence forms per qest's Resource / Values / Dictionary contract:
				// `undefined`, `[]`, `{}` on Resource/Dictionary slots, and language maps whose
				// tag entries are all empty arrays

				const Target = resource({ id: id() });


				describe("undefined and empty array are absent on any slot", () => {

					it.each([
						["optional string", { name: optional(string()) }, "name"],
						["optional integer", { age: optional(integer()) }, "age"],
						["optional boolean", { flag: optional(boolean()) }, "flag"],
						["optional reference", { parent: optional(reference(Target)) }, "parent"],
						["optional localised", { label: optional(dictionary()) }, "label"],
						["multiple string", { aliases: multiple(string()) }, "aliases"]
					] as const)("accepts undefined on %s", async (_label, props, key) => {

						const shape = resource(props);

						expect(validateResource([{ [key]: undefined }], shape)).toBeUndefined();

					});

					it.each([
						["optional string", { name: optional(string()) }, "name"],
						["optional integer", { age: optional(integer()) }, "age"],
						["optional boolean", { flag: optional(boolean()) }, "flag"],
						["optional reference", { parent: optional(reference(Target)) }, "parent"],
						["optional localised", { label: optional(dictionary()) }, "label"],
						["multiple string", { aliases: multiple(string()) }, "aliases"]
					] as const)("accepts empty array on %s", async (_label, props, key) => {

						const shape = resource(props);

						expect(validateResource([{ [key]: [] }], shape)).toBeUndefined();

					});

				});


				describe("empty object — absent only on Resource-accepting slots", () => {

					it("accepts `{}` on optional reference (empty nested Resource)", async () => {

						const shape = resource({ parent: optional(reference(Target)) });

						expect(validateResource([{ parent: {} }], shape)).toBeUndefined();

					});

					it("accepts `{}` on optional localised (empty language map)", async () => {

						const shape = resource({ label: optional(dictionary()) });

						expect(validateResource([{ label: {} }], shape)).toBeUndefined();

					});

					it.each([
						["optional string", { name: optional(string()) }, "name"],
						["optional integer", { age: optional(integer()) }, "age"],
						["optional boolean", { flag: optional(boolean()) }, "flag"],
						["nonempty string", { tags: nonempty(string()) }, "tags"],
						["multiple integer", { scores: multiple(integer()) }, "scores"]
					] as const)("rejects `{}` on %s as type mismatch", async (_label, props, key) => {

						const shape = resource(props);
						const trace = validateResource([{ [key]: {} }], shape);
						const inner = rec(trace, "0");

						expect(inner).toHaveProperty(key);
						expect(JSON.stringify(inner[key])).toMatch(/\{(kind|type)\}/);

					});

				});


				describe("empty language maps on localised slots", () => {

					const shape = resource({ label: optional(dictionary()) });


					it("accepts `{ und: [] }`", async () => {

						expect(validateResource([{ label: { und: [] } }], shape)).toBeUndefined();

					});

					it("accepts map with all tag entries as empty arrays", async () => {

						expect(validateResource([{ label: { en: [], fr: [] } }], shape)).toBeUndefined();

					});

					it("does not treat partially-empty language map as absent", async () => {

						const required = resource({ label: nonempty(dictionary()) });

						// `fr` carries a value, so the map is not absent — normal validation runs
						// and flags `en` against its per-tag minCount

						expect(validateResource([{ label: { en: [], fr: ["bonjour"] } }], required)).toBeDefined();

					});

				});


				describe("array element absence", () => {

					// per qest resource.ts:272 — `{}` elements must be dropped from a `Values`
					// array on slots that accept a nested Resource (`reference` / `resource`
					// kinds, or unions containing such a variant); on pure-literal slots `{}`
					// is not a nested Resource and remains a `{kind}` type mismatch

					it("drops `{}` elements on nonempty reference slot", async () => {

						const shape = resource({
							parents: nonempty(reference(Target))
						});

						expect(validateResource([{
							parents: ["app:/1", {}, "app:/2"]
						}], shape)).toBeUndefined();

					});

					it("drops `{}` elements on nonempty union slot containing reference", async () => {

						const WithName = resource({ name: required(string()) });
						const shape = resource({
							contacts: nonempty(union(string(), reference(WithName)))
						});

						expect(validateResource([{
							contacts: ["a", {}, "b"]
						}], shape)).toBeUndefined();

					});

					it("does not drop `{}` elements on nonempty literal slot", async () => {

						const shape = resource({
							tags: nonempty(string())
						});

						const trace = validateResource([{ tags: ["a", {}] }], shape);
						const inner = rec(trace, "0");

						expect(inner).toHaveProperty("tags");
						expect(JSON.stringify(inner["tags"])).toContain("{type}");

					});

					it("enforces cardinality against filtered count", async () => {

						const shape = resource({
							parents: nonempty(reference(Target))
						});

						const trace = validateResource([{ parents: [{}, {}] }], shape);
						const inner = rec(trace, "0");

						expect(inner).toHaveProperty("parents");
						expect(inner["parents"]).toContainEqual(expect.stringContaining("{minCount}"));

					});

				});

			});

			describe("custom cardinality", () => {

				describe.each([

					{
						constraint: "minCount",
						cardinalityArgs: [2, undefined] as const,
						accepted: [["a", "b"], ["a", "b", "c"]],
						rejected: [["a"]],
						errorKey: "{minCount}"
					},

					{
						constraint: "maxCount",
						cardinalityArgs: [undefined, 3] as const,
						accepted: [["a", "b", "c"], ["a"]],
						rejected: [["a", "b", "c", "d"]],
						errorKey: "{maxCount}"
					},

					{
						constraint: "minCount and maxCount",
						cardinalityArgs: [2, 4] as const,
						accepted: [["a", "b"], ["a", "b", "c", "d"]],
						rejected: [["a"], ["a", "b", "c", "d", "e"]],
						errorKey: undefined
					}

				])("$constraint", ({ cardinalityArgs, accepted, rejected, errorKey }) => {

					it("accepts arrays within bounds", async () => {

						const shape = resource({
							tags: property(string(), { minCount: cardinalityArgs[0], maxCount: cardinalityArgs[1] })
						});

						for (const tags of accepted) {
							expect(validateResource([{ tags }], shape)).toBeUndefined();
						}

					});

					it("rejects arrays outside bounds", async () => {

						const shape = resource({
							tags: property(string(), { minCount: cardinalityArgs[0], maxCount: cardinalityArgs[1] })
						});

						for (const tags of rejected) {

							const trace = validateResource([{ tags }], shape);
							const inner = rec(trace, "0");

							expect(inner).toHaveProperty("tags");

							if ( errorKey ) {
								expect(inner["tags"]).toContainEqual(expect.stringContaining(errorKey));
							}

						}

					});

				});

			});

			it("enforces inherited cardinality constraints", async () => {

				const Base = resource({
					name: required(string())
				});

				const Derived = resource(Base, {
					age: optional(integer())
				});

				expect(validateResource([{ name: "Alice" }], Derived)).toBeUndefined();
				expect(validateResource([{}], Derived)).toHaveProperty([0, "0", 0, "name"]);

			});

			it("enforces multiple parents cardinality constraints", async () => {

				const Named = resource({
					name: required(string())
				});

				const Aged = resource({
					age: required(integer())
				});

				const Person = resource(Named, Aged, {
					email: optional(string())
				});

				expect(validateResource([{ name: "Alice", age: 30 }], Person)).toBeUndefined();
				expect(validateResource([{ name: "Alice" }], Person)).toHaveProperty([0, "0", 0, "age"]);
				expect(validateResource([{ age: 30 }], Person)).toHaveProperty([0, "0", 0, "name"]);

			});

			it("enforces inherited constraints on overridden entries", async () => {

				const Base = resource({
					name: required(string({ model: "abc", minLength: 3 }))
				});

				const Derived = resource(Base, {
					name: required(string({ model: "ABC", pattern: "^[A-Z]" }))
				});

				// satisfies both parent (minLength: 3) and child (pattern: ^[A-Z])

				expect(validateResource([{ name: "Alice" }], Derived)).toBeUndefined();

				// violates parent's minLength: 3 even though it matches child's pattern

				expect(validateResource([{ name: "A" }], Derived)).toHaveProperty([0, "0", 0, "name"]);

				// violates child's pattern even though it satisfies parent's minLength

				expect(validateResource([{ name: "alice" }], Derived)).toHaveProperty([0, "0", 0, "name"]);

			});

			it("prevents relaxing inherited constraints on overridden entries", async () => {

				const Base = resource({
					name: required(string({ model: "abc", minLength: 3, maxLength: 50 }))
				});

				// child tries to relax parent constraints — rejected at factory time

				expect(() => resource(Base, {
					name: required(string({ model: "x", minLength: 1, maxLength: 100 }))
				})).toThrow(RangeError);

			});

			it("enforces grandparent constraints through diamond inheritance", async () => {

				const GrandParent = resource({
					name: required(string({ model: "abc", minLength: 3 }))
				});

				const Parent1 = resource(GrandParent, {
					name: required(string({ model: "ABC", pattern: "^[A-Z]" }))
				});

				const Parent2 = resource(GrandParent, {
					name: required(string({ maxLength: 50 }))
				});

				const Child = resource(Parent1, Parent2, {
					name: required(string())
				});

				// satisfies grandparent (minLength: 3), last parent (maxLength: 50) and child

				expect(validateResource([{ name: "Alice" }], Child)).toBeUndefined();

				// violates grandparent's minLength: 3

				expect(validateResource([{ name: "AB" }], Child)).toHaveProperty([0, "0", 0, "name"]);

				// violates last parent's maxLength: 50

				expect(validateResource([{ name: "A".repeat(51) }], Child)).toHaveProperty([0, "0", 0, "name"]);

			});

		});

		describe("value constraints", () => {

			describe.each([

				{
					type: "boolean",
					field: "active",
					range: required(boolean()),
					valid: [{ active: true }, { active: false }],
					invalid: { active: "true" }
				},

				{
					type: "number",
					field: "age",
					range: required(integer()),
					valid: [{ age: 42 }],
					invalid: { age: "forty-two" }
				},

				{
					type: "string",
					field: "name",
					range: required(string()),
					valid: [{ name: "Alice" }],
					invalid: { name: 42 }
				},

				{
					type: "local",
					field: "label",
					range: required(dictionary()),
					valid: [{ label: { "en": "Hello" } }],
					invalid: { label: 42 }
				},

				{
					type: "text",
					field: "labels",
					range: nonempty(dictionary()),
					valid: [{ labels: { en: ["Hello"] } }, { labels: { und: ["Hello"] } }],
					invalid: { labels: 42 }
				}

			])("$type values", ({ field, range, valid, invalid }) => {

				it("accepts valid value", async () => {

					const shape = resource({ [field]: range });

					for (const v of valid) {
						expect(validateResource([v], shape)).toBeUndefined();
					}

				});

				it("rejects invalid value", async () => {

					const shape = resource({ [field]: range });

					expect(validateResource([invalid], shape)).toHaveProperty([0, "0", 0, field]);

				});

			});

			describe("string values", () => {

				it("validates array elements individually", async () => {

					const shape = resource({
						tags: nonempty(string({ model: "ab", minLength: 2 }))
					});

					expect(validateResource([{ tags: ["abc", "de", "fgh"] }], shape)).toBeUndefined();
					expect(validateResource([{ tags: ["abc", "x", "fgh"] }], shape)).toHaveProperty([0, "0", 0, "tags"]);

				});

			});

			describe("resource values", () => {

				it("accepts valid nested resource", async () => {

					const Address = resource({
						city: required(string())
					});

					const Person = resource({
						address: required(Address)
					});

					expect(validateResource([{ address: { city: "Rome" } }], Person)).toBeUndefined();

				});

				it("rejects invalid nested resource", async () => {

					const Address = resource({
						city: required(string())
					});

					const Person = resource({
						address: required(Address)
					});

					expect(validateResource([{ address: {} }], Person)).toHaveProperty([0, "0", 0, "address"]);

				});

				it("rejects deeply nested validation failure", async () => {

					const Street = resource({
						name: required(string({ model: "x", minLength: 1 }))
					});

					const Address = resource({
						street: required(Street)
					});

					const Person = resource({
						address: required(Address)
					});

					expect(validateResource([{
						address: { street: { name: "" } }
					}], Person)).toHaveProperty([0, "0", 0, "address"]);

				});

			});

			describe("union values", () => {

				const textOrCount = resource({
					value: required(union(string(), integer()))
				});

				const multiUnion = resource({
					value: nonempty(union(string(), integer()))
				});


				it("accepts a value matching the first variant", async () => {

					expect(validateResource([{ value: "hello" }], textOrCount)).toBeUndefined();

				});

				it("accepts a value matching the second variant", async () => {

					expect(validateResource([{ value: 42 }], textOrCount)).toBeUndefined();

				});

				it("rejects a value matching no variant", async () => {

					expect(validateResource([{ value: true }], textOrCount)).toHaveProperty([0, "0", 0, "value"]);

				});

				it("accepts a heterogeneous array for nonempty union", async () => {

					expect(validateResource([{ value: ["hello", 42, "world"] }], multiUnion)).toBeUndefined();

				});

				it("rejects an array element matching no variant", async () => {

					expect(validateResource([{ value: ["hello", true, 42] }], multiUnion)).toBeDefined();

				});

				it("rejects array for scalar union range", async () => {

					// textOrCount has maxCount=1: array is rejected
					expect(validateResource([{ value: ["a", "b"] }], textOrCount)).toHaveProperty([0, "0", 0, "value"]);

				});

				it("rejects missing required union property", async () => {

					expect(validateResource([{}], textOrCount)).toHaveProperty([0, "0", 0, "value"]);

				});

				it("accepts inherited union property", async () => {

					const Derived = resource(textOrCount, {
						name: required(string())
					});

					expect(validateResource([{ value: "hello", name: "Alice" }], Derived)).toBeUndefined();
					expect(validateResource([{
						value: true,
						name: "Alice"
					}], Derived)).toHaveProperty([0, "0", 0, "value"]);

				});

			});

			describe("union with reference variants", () => {

				const PostalAddress = resource({
					id: id(),
					street: required(string()),
					city: required(string())
				});

				const textOrAddress = resource({
					address: optional(union(
						string(),
						reference(PostalAddress)
					), { captive: true })
				});


				it("accepts a string variant value", async () => {

					expect(validateResource([{ address: "123 Main St" }], textOrAddress)).toBeUndefined();

				});

				it("accepts a reference variant value", async () => {

					expect(validateResource([{
						address: {
							street: "12 Harbour Street",
							city: "Copenhagen"
						}
					}], textOrAddress)).toBeUndefined();

				});

				it("rejects a value matching no variant", async () => {

					expect(validateResource([{
						address: 42
					}], textOrAddress)).toHaveProperty([0, "0", 0, "address"]);

				});

				it("rejects a reference variant value with an invalid embedded resource", async () => {

					expect(validateResource([{
						address: {
							street: "12 Harbour Street"
							// missing required city
						}
					}], textOrAddress)).toHaveProperty([0, "0", 0, "address"]);

				});

				it("accepts an absent optional union property", async () => {

					expect(validateResource([{}], textOrAddress)).toBeUndefined();

				});

				describe("effective cardinality", () => {

					it("accepts union values within cardinality bounds", async () => {

						const bounded = resource({
							value: property(union(string(), integer()), { minCount: 1, maxCount: 3 })
						});

						expect(validateResource([{
							value: ["a", "b", 42]
						}], bounded)).toBeUndefined();

					});

					it("rejects union values below minCount", async () => {

						const bounded = resource({
							value: property(union(string(), integer()), { minCount: 2, maxCount: 5 })
						});

						expect(validateResource([{
							value: ["a"]
						}], bounded)).toHaveProperty([0, "0", 0, "value"]);

					});

					it("rejects union values above maxCount", async () => {

						const bounded = resource({
							value: property(union(string(), integer()), { minCount: 1, maxCount: 2 })
						});

						expect(validateResource([{
							value: ["a", "b", 42]
						}], bounded)).toHaveProperty([0, "0", 0, "value"]);

					});

				});

			});

		});

		describe("captive reference expansion", () => {

			const Inner = resource({ id: id(), label: required(string()) });

			const captiveStandalone = resource({
				child: required(reference(Inner), { captive: true })
			});

			const plainStandalone = resource({
				child: required(reference(Inner))
			});

			const captiveUnion = resource({
				link: required(union(integer(), reference(Inner)), { captive: true })
			});

			const plainUnion = resource({
				link: required(union(integer(), reference(Inner)))
			});

			describe("captive reference", () => {

				it("accepts a bare IRI", async () => {

					expect(validateResource([{ child: "app:/inner/1" }], captiveStandalone)).toBeUndefined();

				});

				it("accepts an inline target state by default (no depth limit)", async () => {

					expect(validateResource([{ child: { id: "app:/inner/1", label: "x" } }], captiveStandalone))
						.toBeUndefined();

				});

				it("rejects an inline target state violating the target shape", async () => {

					expect(validateResource([{ child: { id: "app:/inner/1", label: 42 } }], captiveStandalone))
						.toBeDefined();

				});

				it("accepts a bare IRI when depth is 0", async () => {

					expect(validateResource([{ child: "app:/inner/1" }], captiveStandalone, { depth: 0 }))
						.toBeUndefined();

				});

				it("rejects an inline target state when depth is 0", async () => {

					expect(validateResource([{
						child: {
							id: "app:/inner/1",
							label: "x"
						}
					}], captiveStandalone, { depth: 0 }))
						.toEqual(flat({ "[0]": { "child": { "[0]": "exceeded maximum nesting depth" } } }));

				});

			});

			describe("plain reference", () => {

				it("accepts a bare IRI", async () => {

					expect(validateResource([{ child: "app:/inner/1" }], plainStandalone)).toBeUndefined();

				});

				it("rejects an inline target state regardless of depth", async () => {

					expect(validateResource([{ child: { id: "app:/inner/1", label: "x" } }], plainStandalone))
						.toBeDefined();

				});

			});

			describe("within unions", () => {

				it("accepts a bare IRI for a captive reference variant", async () => {

					expect(validateResource([{ link: "app:/inner/1" }], captiveUnion)).toBeUndefined();

				});

				it("accepts an inline target state for a captive reference variant", async () => {

					expect(validateResource([{
						link: {
							id: "app:/inner/1",
							label: "x"
						}
					}], captiveUnion)).toBeUndefined();

				});

				it("rejects an inline target state for a captive reference variant when depth is 0", async () => {

					expect(validateResource([{ link: { id: "app:/inner/1", label: "x" } }], captiveUnion, { depth: 0 }))
						.toBeDefined();

				});

				it("rejects an inline target state for a plain reference variant", async () => {

					expect(validateResource([{ link: { id: "app:/inner/1", label: "x" } }], plainUnion)).toBeDefined();

				});

			});

			describe("depth budget", () => {

				const Mid = resource({ id: id(), inner: required(reference(Inner), { captive: true }) });

				const captiveChain = resource({
					child: required(reference(Mid), { captive: true })
				});

				it("accepts one expansion level when depth is 1", async () => {

					// child expanded (level 1); its inner reference kept as a bare IRI
					expect(validateResource([{ child: { id: "app:/mid/1", inner: "app:/inner/1" } }], captiveChain, {
						depth: 1
					})).toBeUndefined();

				});

				it("rejects a second expansion level when depth is 1", async () => {

					// child expanded (level 1); inner also expanded (level 2) exceeds the budget
					expect(validateResource([{
						child: { id: "app:/mid/1", inner: { id: "app:/inner/1", label: "x" } }
					}], captiveChain, { depth: 1 })).toBeDefined();

				});

			});

		});

		describe("combined constraints", () => {

			const validator: (value: Resource) => undefined | Trace = (r) => {
				return (r as any).name.length <= 50 ? undefined : ["name too long"];
			};

			const shape = resource({
				id: id(),
				name: required(string({ model: "x", minLength: 1 })),
				age: optional(integer({ minInclusive: 0, maxInclusive: 150 }))
			}, {
				pattern: "/users/{id}",
				validators: [validator]
			});

			it("accepts resource satisfying all constraints", async () => {

				expect(validateResource([{
					"id": "app:/users/123",
					name: "Alice",
					age: 30
				}], shape)).toBeUndefined();

			});

			it("rejects resource failing pattern constraint", async () => {

				const trace = validateResource([{
					"id": "/products/123",
					name: "Alice"
				}], shape);
				const inner = rec(trace, "0");

				expect(inner).toHaveProperty("id");
				expect(inner["id"]).toContainEqual(expect.stringContaining("{pattern}"));

			});

			it("rejects resource failing property constraint", async () => {

				expect(validateResource([{
					"id": "app:/users/123",
					name: ""
				}], shape)).toHaveProperty([0, "<app:/users/123>", 0, "name"]);

			});

			it("rejects resource failing custom validator", async () => {

				expect(validateResource([{
					"id": "app:/users/123",
					name: "A".repeat(100)
				}], shape)).toBeDefined();

			});

		});

		describe("collection-level keying", () => {

			const shape = resource({
				id: id(),
				name: required(string({ model: "x", minLength: 1 }))
			});

			const shapeWithoutId = resource({
				name: required(string({ model: "x", minLength: 1 }))
			});


			it("wraps single resource trace under id key", async () => {

				const trace = validateResource([{ "id": "app:/users/1", name: "" }], shape);

				expect(trace).toHaveProperty([0, "<app:/users/1>"]);
				expect(rec(trace, "<app:/users/1>")).toHaveProperty("name");

			});

			it("keys violations by @id for multiple resources", async () => {

				const trace = validateResource([
					{ "id": "app:/users/1", name: "" },
					{ "id": "app:/users/2", name: "" }
				], shape);

				expect(trace).toHaveProperty([0, "<app:/users/1>"]);
				expect(trace).toHaveProperty([0, "<app:/users/2>"]);

				expect(rec(trace, "<app:/users/1>")).toHaveProperty("name");
				expect(rec(trace, "<app:/users/2>")).toHaveProperty("name");

			});

			it("keys violations by blank node for multiple resources without id property", async () => {

				const trace = validateResource([
					{ name: "" },
					{ name: "" }
				], shapeWithoutId);

				expect(trace).toHaveProperty([0, "0"]);
				expect(trace).toHaveProperty([0, "1"]);

			});

			it("uses blank node key for resources with missing @id value", async () => {

				const trace = validateResource([
					{ name: "" },
					{ "id": "app:/users/2", name: "" }
				], shape);

				expect(trace).toHaveProperty([0, "0"]);
				expect(trace).toHaveProperty([0, "<app:/users/2>"]);

			});

			it("includes only invalid resources in trace", async () => {

				const trace = validateResource([
					{ "id": "app:/users/1", name: "Alice" },
					{ "id": "app:/users/2", name: "" }
				], shape);

				expect(trace).not.toHaveProperty([0, "app:/users/1"]);
				expect(trace).toHaveProperty([0, "<app:/users/2>"]);

			});

			it("returns undefined when all resources are valid", async () => {

				expect(validateResource([
					{ "id": "app:/users/1", name: "Alice" },
					{ "id": "app:/users/2", name: "Bob" }
				], shape)).toBeUndefined();

			});

		});

	});

	describe("validateResult", () => {

		describe("structural admissibility", () => {

			it("accepts empty response under empty model", async () => {

				expect(validateResult([{}], { shape: resource({}), model: {} })).toBeUndefined();

			});

			it("rejects non-object value", async () => {

				const shape = resource({ name: required(string()) });

				expect(validateResult(["not-a-resource"], { shape, model: { name: "" } })).toBeDefined();

			});

			it("rejects null value", async () => {

				const shape = resource({ name: required(string()) });

				expect(validateResult([null], { shape, model: { name: "" } })).toBeDefined();

			});

			it("rejects array in place of a resource", async () => {

				const shape = resource({ name: required(string()) });

				expect(validateResult([[{ name: "Alice" }]], { shape, model: { name: "" } })).toBeDefined();

			});

			it("rejects undefined value", async () => {

				const shape = resource({ name: required(string()) });

				expect(validateResult([undefined], { shape, model: { name: "" } })).toBeDefined();

			});

			it("reports a malformed model key without throwing", async () => {

				// results come from untrusted sources, so a malformed projection key in the model must
				// surface as a trace rather than crash the validator

				const shape = resource({ name: required(string()) });

				expect(() => validateResult([{ name: "Alice" }], { shape, model: { "1bad=name": "" } })).not.toThrow();
				expect(validateResult([{ name: "Alice" }], { shape, model: { "1bad=name": "" } })).toBeDefined();

			});

			it("rejects primitive value", async () => {

				const shape = resource({ name: required(string()) });

				expect(validateResult([42], { shape, model: { name: "" } })).toBeDefined();

			});

		});

		describe("client expectations", () => {

			it("rejects response containing shape field absent from model", async () => {

				const shape = resource({
					name: required(string()),
					hidden: required(string())
				});

				const trace = validateResult([{ name: "Alice", hidden: "secret" }], {
					shape,
					model: { name: "" }
				});

				expect(rec(trace, "0")).toHaveProperty("hidden");

			});

			it("rejects response containing multiple shape fields absent from model", async () => {

				const shape = resource({
					a: required(string()),
					b: required(string()),
					c: required(string())
				});

				const trace = validateResult([{ a: "x", b: "y", c: "z" }], {
					shape,
					model: { a: "" }
				});

				expect(rec(trace, "0")).toHaveProperty("b");
				expect(rec(trace, "0")).toHaveProperty("c");

			});

			it("rejects nested response containing reference field not in nested model", async () => {

				const Inner = resource({
					id: id(),
					label: required(string()),
					hidden: required(string())
				});

				const shape = resource({
					child: required(reference(Inner))
				});

				const trace = validateResult([{ child: { label: "x", hidden: "secret" } }], {
					shape,
					model: { child: { label: "" } }
				});

				expect(rec(trace, "0")).toBeDefined();

			});

			it("rejects projected id absent from model but present in response", async () => {

				const shape = resource({
					id: id(),
					name: required(string())
				});

				const trace = validateResult([{ id: "app:/users/1", name: "Alice" }], {
					shape,
					model: { name: "" }
				});

				expect(rec(trace, "<app:/users/1>")).toHaveProperty("id");

			});

			it("accepts response containing only keys named in model", async () => {

				const shape = resource({
					name: required(string()),
					hidden: required(string())
				});

				expect(validateResult([{ name: "Alice" }], {
					shape,
					model: { name: "" }
				})).toBeUndefined();

			});

			it("rejects response with property not declared in shape", async () => {

				const shape = resource({ name: required(string()) });

				const trace = validateResult([{ name: "Alice", stray: "x" }], {
					shape,
					model: { name: "", stray: "" }
				});

				expect(rec(trace, "0")).toHaveProperty("stray");

			});

			it("rejects every field when model is empty", async () => {

				const shape = resource({
					name: required(string()),
					price: required(integer())
				});

				const trace = validateResult([{ name: "Alice", price: 42 }], {
					shape,
					model: {}
				});

				expect(rec(trace, "0")).toHaveProperty("name");
				expect(rec(trace, "0")).toHaveProperty("price");

			});

			it("rejects inherited parent field absent from model", async () => {

				const Base = resource({
					code: required(integer())
				});

				const Derived = resource(Base, {
					name: required(string())
				});

				// model projects only `name`; `code` is inherited from Base but not requested — reject
				const trace = validateResult([{ code: 1, name: "Alice" }], {
					shape: Derived,
					model: { name: "" }
				});

				expect(rec(trace, "0")).toHaveProperty("code");

			});

		});

		describe("partial resources", () => {

			it("accepts response omitting shape-required field absent from model", async () => {

				const shape = resource({
					name: required(string()),
					price: required(integer())
				});

				expect(validateResult([{ price: 42 }], { shape, model: { price: 0 } })).toBeUndefined();

			});

			it("accepts response omitting multiple shape-required fields absent from model", async () => {

				const shape = resource({
					a: required(string()),
					b: required(string()),
					c: required(integer())
				});

				expect(validateResult([{ c: 1 }], { shape, model: { c: 0 } })).toBeUndefined();

			});

			it("accepts response with projected optional field absent", async () => {

				const shape = resource({
					name: required(string()),
					note: optional(string())
				});

				expect(validateResult([{ name: "Alice" }], {
					shape,
					model: { name: "", note: "" }
				})).toBeUndefined();

			});

			it("rejects response missing a projected required field", async () => {

				const shape = resource({
					name: required(string()),
					price: required(integer())
				});

				expect(validateResult([{ name: "Widget" }], {
					shape,
					model: { name: "", price: 0 }
				})).toBeDefined();

			});

			it("rejects response with empty array for projected nonempty field", async () => {

				const shape = resource({
					tags: nonempty(string())
				});

				expect(validateResult([{ tags: [] }], { shape, model: { tags: [""] } })).toBeDefined();

			});

		});

		describe("projected fields", () => {

			it("rejects wrong type for projected scalar field", async () => {

				const shape = resource({
					name: required(string()),
					price: required(integer())
				});

				expect(validateResult([{ name: "Widget", price: "NaN" }], {
					shape,
					model: { name: "", price: 0 }
				})).toBeDefined();

			});

			it("rejects projected field violating a value constraint", async () => {

				const shape = resource({
					name: required(string({ model: "ab", minLength: 2 }))
				});

				expect(validateResult([{ name: "x" }], { shape, model: { name: "" } })).toBeDefined();

			});

			it("accepts projected field satisfying a value constraint", async () => {

				const shape = resource({
					name: required(string({ model: "ab", minLength: 2 }))
				});

				expect(validateResult([{ name: "abc" }], { shape, model: { name: "" } })).toBeUndefined();

			});

			it("rejects array value for a projected scalar field", async () => {

				const shape = resource({
					name: required(string())
				});

				expect(validateResult([{ name: ["one", "two"] }], {
					shape,
					model: { name: "" }
				})).toBeDefined();

			});

			it("accepts multi-value response for a projected nonempty field", async () => {

				const shape = resource({
					tags: nonempty(string())
				});

				expect(validateResult([{ tags: ["a", "b", "c"] }], {
					shape,
					model: { tags: [""] }
				})).toBeUndefined();

			});

			it("rejects projected field violating a pattern constraint", async () => {

				const shape = resource({
					code: required(string({ model: "ABC", pattern: "^[A-Z]{3}$" }))
				});

				expect(validateResult([{ code: "ab" }], { shape, model: { code: "" } })).toBeDefined();

			});

			it("accepts projected localised field with language-tagged map", async () => {

				const shape = resource({
					label: required(dictionary())
				});

				expect(validateResult([{ label: { en: "hello" } }], {
					shape,
					model: { label: { en: "" } }
				})).toBeUndefined();

			});

			describe("coalesced localised slots", () => {

				// a plain-string model entry over a single-string-per-tag localised slot requests the
				// coalesced label: the response carries the one rendered string; length bounds apply
				// to it, languageIn does not (coalescing discards the winning tag)

				it("accepts string response on coalesced localised slot", async () => {

					const shape = resource({ label: required(dictionary()) });

					expect(validateResult([{ label: "Widget" }], { shape, model: { label: "" } })).toBeUndefined();

				});

				it("rejects tag-map response on coalesced localised slot", async () => {

					const shape = resource({ label: required(dictionary()) });

					expect(validateResult([{ label: { en: "Widget" } }], {
						shape,
						model: { label: "" }
					})).toBeDefined();

				});

				it("rejects coalesced response shorter than shape's minLength", async () => {

					const shape = resource({ label: required(dictionary({ minLength: 3 })) });

					expect(unflat(validateResult([{ label: "ab" }], { shape, model: { label: "" } }))).toEqual({
						"[0]": { label: "{minLength} expected string length >= <3>" }
					});

				});

				it("rejects coalesced response longer than shape's maxLength", async () => {

					const shape = resource({ label: required(dictionary({ maxLength: 3 })) });

					expect(validateResult([{ label: "abcd" }], { shape, model: { label: "" } })).toBeDefined();

				});

				it("skips languageIn on coalesced response", async () => {

					const shape = resource({ label: required(dictionary({ languageIn: ["en"] })) });

					expect(validateResult([{ label: "Widget" }], { shape, model: { label: "" } })).toBeUndefined();

				});

				it("treats absent value as missing on required coalesced slot", async () => {

					const shape = resource({ label: required(dictionary()) });

					expect(validateResult([{}], { shape, model: { label: "" } })).toBeDefined();

				});

				it("accepts absent value on optional coalesced slot", async () => {

					const shape = resource({ label: optional(dictionary()) });

					expect(validateResult([{}], { shape, model: { label: "" } })).toBeUndefined();

				});

			});

			describe("coalesced array localised slots", () => {

				// a `[""]` model entry over an array-per-tag localised slot requests the coalesced array
				// label: the response carries the winning tag's value set as a string array; length bounds
				// apply per element, languageIn does not (coalescing discards the winning tag)

				it("accepts string-array response on coalesced array localised slot", async () => {

					const shape = resource({ keywords: nonempty(dictionary()) });

					expect(validateResult([{ keywords: ["alpha", "beta"] }], {
						shape,
						model: { keywords: [""] }
					})).toBeUndefined();

				});

				it("rejects tag-map response on coalesced array localised slot", async () => {

					const shape = resource({ keywords: nonempty(dictionary()) });

					expect(validateResult([{ keywords: { en: ["alpha"] } }], {
						shape,
						model: { keywords: [""] }
					})).toBeDefined();

				});

				it("rejects scalar string response on coalesced array localised slot", async () => {

					const shape = resource({ keywords: nonempty(dictionary()) });

					expect(validateResult([{ keywords: "alpha" }], { shape, model: { keywords: [""] } })).toBeDefined();

				});

				it("rejects coalesced array element shorter than shape's minLength", async () => {

					const shape = resource({ keywords: nonempty(dictionary({ minLength: 3 })) });

					expect(validateResult([{ keywords: ["ab"] }], { shape, model: { keywords: [""] } })).toBeDefined();

				});

				it("skips languageIn on coalesced array response", async () => {

					const shape = resource({ keywords: nonempty(dictionary({ languageIn: ["en"] })) });

					expect(validateResult([{ keywords: ["alpha", "beta"] }], {
						shape,
						model: { keywords: [""] }
					})).toBeUndefined();

				});

			});

		});

		describe("expanded nested references", () => {

			const Inner = resource({
				id: id(),
				label: required(string()),
				hidden: required(string())
			});

			it("accepts bare IRI for reference slot", async () => {

				const shape = resource({
					child: required(reference(Inner))
				});

				expect(validateResult([{ child: "app:/inner/1" }], {
					shape,
					model: { child: "" }
				})).toBeUndefined();

			});

			it("accepts expanded nested resource for reference slot", async () => {

				const shape = resource({
					child: required(reference(Inner))
				});

				expect(validateResult([{ child: { id: "app:/inner/1", label: "x" } }], {
					shape,
					model: { child: { id: "", label: "" } }
				})).toBeUndefined();

			});

			it("narrows nested validation to the nested projection in model", async () => {

				const shape = resource({
					child: required(reference(Inner))
				});

				// nested model omits `hidden` (required in Inner); value also omits it
				expect(validateResult([{ child: { label: "x" } }], {
					shape,
					model: { child: { label: "" } }
				})).toBeUndefined();

			});

			it("rejects expanded nested resource violating a projected nested field", async () => {

				const shape = resource({
					child: required(reference(Inner))
				});

				expect(validateResult([{ child: { label: 42 } }], {
					shape,
					model: { child: { label: "" } }
				})).toBeDefined();

			});

			it("rejects expanded nested resource missing a projected required field", async () => {

				const shape = resource({
					child: required(reference(Inner))
				});

				expect(validateResult([{ child: {} }], {
					shape,
					model: { child: { label: "" } }
				})).toBeDefined();

			});

			it("rejects expanded nested resource with property not declared in nested shape", async () => {

				const shape = resource({
					child: required(reference(Inner))
				});

				expect(validateResult([{ child: { label: "x", stray: true } }], {
					shape,
					model: { child: { label: "", stray: "" } }
				})).toBeDefined();

			});

			it("rejects expanded nested resource with shape field absent from nested model", async () => {

				const shape = resource({
					child: required(reference(Inner))
				});

				expect(validateResult([{ child: { label: "x", hidden: "secret" } }], {
					shape,
					model: { child: { label: "" } }
				})).toBeDefined();

			});

			it("accepts nonempty reference with mixed IRI and expanded resource", async () => {

				const shape = resource({
					items: nonempty(reference(Inner))
				});

				expect(validateResult([{ items: ["app:/inner/1", { label: "x" }] }], {
					shape,
					model: { items: [{ label: "" }] }
				})).toBeUndefined();

			});

			it("rejects invalid IRI string for reference slot", async () => {

				const shape = resource({
					child: required(reference(Inner))
				});

				expect(validateResult([{ child: "not an iri" }], {
					shape,
					model: { child: "" }
				})).toBeDefined();

			});

			it("recurses through multiple levels of nested references", async () => {

				const Leaf = resource({
					id: id(),
					label: required(string())
				});

				const Mid = resource({
					id: id(),
					leaf: required(reference(Leaf))
				});

				const shape = resource({
					mid: required(reference(Mid))
				});

				expect(validateResult([{ mid: { leaf: { label: "x" } } }], {
					shape,
					model: { mid: { leaf: { label: "" } } }
				})).toBeUndefined();

			});

			it("accepts optional reference slot absent from response", async () => {

				const shape = resource({
					child: optional(reference(Inner))
				});

				expect(validateResult([{}], {
					shape,
					model: { child: { label: "" } }
				})).toBeUndefined();

			});

			it("rejects null in required reference slot", async () => {

				const shape = resource({
					child: required(reference(Inner))
				});

				expect(validateResult([{ child: null }], {
					shape,
					model: { child: "" }
				})).toBeDefined();

			});

			it("rejects expanded nested resource when model requests IRI only", async () => {

				const shape = resource({
					child: required(reference(Inner))
				});

				// an IRI-only request (`child: ""`) carries no nested template, so an expanded
				// response is over-fetch: every returned property is unexpected
				expect(validateResult([{ child: { id: "app:/inner/1", label: "x" } }], {
					shape,
					model: { child: "" }
				})).toBeDefined();

			});

		});

		describe("id and type", () => {

			it("accepts projected id", async () => {

				const shape = resource({
					id: id(),
					name: required(string())
				});

				expect(validateResult([{ id: "app:/users/1", name: "Alice" }], {
					shape,
					model: { id: "", name: "" }
				})).toBeUndefined();

			});

			it("accepts projected type", async () => {

				const shape = resource({
					type: type(),
					name: required(string())
				}, { class: "app:/types/Person" });

				expect(validateResult([{ type: "app:/types/Person", name: "Alice" }], {
					shape,
					model: { type: "", name: "" }
				})).toBeUndefined();

			});

			it("rejects invalid IRI for projected id", async () => {

				const shape = resource({
					id: id(),
					name: required(string())
				});

				expect(validateResult([{ id: "not-an-iri", name: "Alice" }], {
					shape,
					model: { id: "", name: "" }
				})).toBeDefined();

			});

			it("rejects non-IRI for projected type", async () => {

				const shape = resource({
					type: type(),
					name: required(string())
				}, { class: "app:/types/Person" });

				expect(validateResult([{ type: 42, name: "Alice" }], {
					shape,
					model: { type: "", name: "" }
				})).toBeDefined();

			});

			it("rejects projected id violating pattern constraint", async () => {

				const shape = resource({
					id: id(),
					name: required(string())
				}, { pattern: "/users/*" });

				expect(validateResult([{ id: "app:/products/1", name: "Alice" }], {
					shape,
					model: { id: "", name: "" }
				})).toBeDefined();

			});

			it("rejects projected id not in allowed set", async () => {

				const shape = resource({
					id: id(),
					name: required(string())
				}, { in: ["app:/users/alice", "app:/users/bob"] });

				expect(validateResult([{ id: "app:/users/99", name: "Alice" }], {
					shape,
					model: { id: "", name: "" }
				})).toBeDefined();

			});

		});

		describe("entry", () => {

			it("accepts response when id matches entry", async () => {

				const shape = resource({
					id: id(),
					name: required(string())
				});

				expect(validateResult([{ id: "app:/users/1", name: "Alice" }], {
					shape,
					model: { id: "", name: "" },
					entry: "app:/users/1"
				})).toBeUndefined();

			});

			it("rejects response when id does not match entry", async () => {

				const shape = resource({
					id: id(),
					name: required(string())
				});

				expect(validateResult([{ id: "app:/users/2", name: "Alice" }], {
					shape,
					model: { id: "", name: "" },
					entry: "app:/users/1"
				})).toBeDefined();

			});

			it("ignores entry when id not in response", async () => {

				const shape = resource({
					id: id(),
					name: required(string())
				});

				expect(validateResult([{ name: "Alice" }], {
					shape,
					model: { name: "" },
					entry: "app:/users/1"
				})).toBeUndefined();

			});

		});

		describe("foreign references", () => {

			const Target = resource({ id: id(), label: required(string()) });

			it("accepts response without foreign property when not projected", async () => {

				const shape = resource({
					name: required(string()),
					children: multiple(reference(Target), { foreign: true })
				});

				expect(validateResult([{ name: "Alice" }], {
					shape,
					model: { name: "" }
				})).toBeUndefined();

			});

			it("accepts projected foreign reference property in response", async () => {

				// responses describe retrieval results; foreign references are queryable through the
				// inverse relationship and may legitimately appear when explicitly projected

				const shape = resource({
					name: required(string()),
					children: multiple(reference(Target), { foreign: true })
				});

				expect(validateResult([{ name: "Alice", children: ["app:/items/1"] }], {
					shape,
					model: { name: "", children: [""] }
				})).toBeUndefined();

			});

			it("rejects foreign reference property not projected but present in response", async () => {

				const shape = resource({
					name: required(string()),
					children: multiple(reference(Target), { foreign: true })
				});

				expect(validateResult([{ name: "Alice", children: ["app:/items/1"] }], {
					shape,
					model: { name: "" }
				})).toBeDefined();

			});

		});

		describe("unions", () => {

			const Book = resource({ type: type(), title: required(string()) }, { class: "app:/types/Book" });
			const Song = resource({ type: type(), duration: required(integer()) }, { class: "app:/types/Song" });

			it("accepts projection matching one union variant", async () => {

				const shape = resource({
					item: required(union(Book, Song))
				});

				expect(validateResult([{ item: { title: "Dune" } }], {
					shape,
					model: { item: { title: "" } }
				})).toBeUndefined();

			});

			it("rejects projection matching no union variant", async () => {

				const shape = resource({
					item: required(union(Book, Song))
				});

				// nested value has neither a title (Book) nor a duration (Song)
				expect(validateResult([{ item: { stray: "x" } }], {
					shape,
					model: { item: { stray: "" } }
				})).toBeDefined();

			});

			describe("template forms", () => {

				// union keys are opaque labels (type-inference scaffolding) carrying no positional or
				// nominal meaning (Section 5.4): a branch template is matched to a variant by its shape,
				// never by its key. Matching is a partial injection — each template singles out exactly
				// one variant, each variant is claimed by at most one template, unlisted variants are
				// skipped; a value of an un-templated variant is rejected.

				const Address = resource({
					street: required(string()),
					city: required(string())
				});

				const optionalUnion = resource({
					contact: optional(union(string(), Address))
				});

				const multiUnion = resource({
					contacts: multiple(union(string(), Address))
				});

				it("matches a branch to its variant by shape, not by key", async () => {

					// key "0" does not force the first (string) variant: the `{ street, city }` template
					// singles out the Address variant by shape, and the Address value is admitted under it
					expect(validateResult([{ contact: { street: "Main St", city: "Springfield" } }], {
						shape: optionalUnion,
						model: { contact: { "0": { street: "", city: "" } } }
					})).toBeUndefined();

				});

				it("accepts an arbitrary in-namespace key", async () => {

					// "7" is a valid opaque key even past the variant count: the `""` template singles
					// out the string variant by shape and the string value is admitted under it
					expect(validateResult([{ contact: "literal" }], {
						shape: optionalUnion,
						model: { contact: { "7": "" } }
					})).toBeUndefined();

				});

				it("accepts a form listing every variant", async () => {

					expect(validateResult([{ contact: { street: "Main St", city: "Springfield" } }], {
						shape: optionalUnion,
						model: { contact: { "0": "", "1": { street: "", city: "" } } }
					})).toBeUndefined();

				});

				it("rejects a value of an un-templated variant", async () => {

					// the sole template `{ street, city }` singles out Address; a string value belongs to
					// the untemplated string variant and is rejected (not silently admitted by key "0")
					expect(validateResult([{ contact: "literal" }], {
						shape: optionalUnion,
						model: { contact: { "0": { street: "", city: "" } } }
					})).toBeDefined();

				});

				it("accepts two templates singling out the same variant", async () => {

					// several placeholders MAY resolve to the same union branch — injectivity is not required (Section
					// 5.4)
					const stringOrInt = resource({
						value: required(union(string(), integer()))
					});

					expect(validateResult([{ value: "literal" }], {
						shape: stringOrInt,
						model: { value: { "0": "", "1": "" } }
					})).toBeUndefined();

				});

				it("rejects an empty-string key", async () => {

					// `""` is not a valid union key (Section 5.4)
					expect(validateResult([{ contact: { street: "Main St", city: "Springfield" } }], {
						shape: optionalUnion,
						model: { contact: { "": { street: "", city: "" } } }
					})).toBeDefined();

				});

				it("rejects a non-canonical key", async () => {

					// `"01"` is not a canonical non-negative integer string (Section 5.4)
					expect(validateResult([{ contact: "literal" }], {
						shape: optionalUnion,
						model: { contact: { "01": "" } }
					})).toBeDefined();

				});

				it("accepts auto-generated union-form model for primitive union", async () => {

					// resource(...).model auto-generates the union form for any union range —
					// `{ value: { "0": "", "1": 0 } }` for `union(string(), integer())`. The
					// validator MUST accept its own auto-generated models without crashing
					// decodeProbe on the bare-integer keys.

					const auto = resource({
						value: required(union(string(), integer()))
					});

					expect(validateResult([{ value: "literal" }], {
						shape: auto,
						model: auto.model
					})).toBeUndefined();

				});

				it("accepts singleton-tuple union form for multi-valued union", async () => {

					expect(validateResult([{ contacts: ["a@b.com", { street: "Main", city: "X" }] }], {
						shape: multiUnion,
						model: { contacts: [{ "0": "", "1": { street: "", city: "" } }] }
					})).toBeUndefined();

				});

			});

			describe("reference variants", () => {

				const Linked = resource({ id: id(), label: required(string()) });

				// integer and reference are disjoint: an IRI or expanded resource fits only the reference
				// branch, never the integer branch
				const refUnion = resource({
					link: required(union(integer(), reference(Linked)))
				});

				it("matches a bare IRI to the reference variant regardless of key", async () => {

					// key "0" does not force the integer variant: a bare IRI singles out the reference branch
					expect(validateResult([{ link: "app:/linked/1" }], {
						shape: refUnion,
						model: { link: { "0": "" } }
					})).toBeUndefined();

				});

				it("matches an expanded resource to the reference variant", async () => {

					expect(validateResult([{ link: { id: "app:/linked/1", label: "x" } }], {
						shape: refUnion,
						model: { link: { "1": { id: "", label: "" } } }
					})).toBeUndefined();

				});

				it("rejects an invalid IRI for the reference variant", async () => {

					expect(validateResult([{ link: "not-an-iri" }], {
						shape: refUnion,
						model: { link: { "1": "" } }
					})).toBeDefined();

				});

				it("rejects a value fitting overlapping string and reference branches", async () => {

					// string and reference both admit a bare IRI: the branches are not disjoint, so an
					// IRI-shaped value singles out several variants and is ambiguous (Section 5.4)
					const overlapping = resource({
						link: required(union(string(), reference(Linked)))
					});

					expect(validateResult([{ link: "app:/linked/1" }], {
						shape: overlapping,
						model: { link: { "1": "" } }
					})).toBeDefined();

				});

				describe("distinct reference targets", () => {

					// two reference variants discriminated by their target IRI pattern: a bare IRI
					// singles out the variant whose target it is a legal value of, not merely a
					// well-formed IRI for every reference branch

					const Person = resource({ name: required(string()) }, { pattern: "/people/{id}" });
					const Org = resource({ title: required(string()) }, { pattern: "/orgs/{id}" });

					const shape = resource({
						link: required(union(reference(Person), reference(Org)))
					});

					it("discriminates a bare IRI to the variant whose target admits it", async () => {

						expect(validateResult([{ link: "app:/people/1" }], {
							shape,
							model: { link: { "0": "" } }
						})).toBeUndefined();

					});

					it("rejects a bare IRI legal for no reference variant", async () => {

						expect(validateResult([{ link: "app:/widgets/1" }], {
							shape,
							model: { link: { "0": "" } }
						})).toBeDefined();

					});

				});

			});

		});

		describe("inheritance", () => {

			it("validates entries inherited from parent shape", async () => {

				const Base = resource({
					code: required(integer())
				});

				const Derived = resource(Base, {
					name: required(string())
				});

				expect(validateResult([{ code: 1, name: "Alice" }], {
					shape: Derived,
					model: { code: 0, name: "" }
				})).toBeUndefined();

			});

			it("applies partial projection to inherited entries", async () => {

				const Base = resource({
					code: required(integer()),
					secret: required(string())
				});

				const Derived = resource(Base, {
					name: required(string())
				});

				expect(validateResult([{ name: "Alice" }], {
					shape: Derived,
					model: { name: "" }
				})).toBeUndefined();

			});

			it("narrows a union slot to a single variant and validates against it", async () => {

				const Base = resource({
					contact: required(union(string(), integer()))
				});

				const Derived = resource(Base, {
					contact: required(string({ model: "abc", minLength: 3 }))
				});

				expect(Derived.model).toEqual({ contact: "abc" });

				expect(validateResult([{ contact: "abc" }], {
					shape: Derived,
					model: { contact: "" }
				})).toBeUndefined();

				expect(validateResult([{ contact: 42 }], {
					shape: Derived,
					model: { contact: "" }
				})).toBeDefined();

				expect(validateResult([{ contact: "ab" }], {
					shape: Derived,
					model: { contact: "" }
				})).toBeDefined();

			});

			it("subsets a union slot and validates against surviving variants", async () => {

				const Base = resource({
					value: required(union(string(), integer(), boolean()))
				});

				const Derived = resource(Base, {
					value: required(union(string(), integer()))
				});

				expect(Derived.model).toEqual({ value: { "0": "", "1": 0 } });

				expect(validateResult([{ value: "abc" }], {
					shape: Derived,
					model: { value: { "0": "", "1": 0 } }
				})).toBeUndefined();

				expect(validateResult([{ value: 42 }], {
					shape: Derived,
					model: { value: { "0": "", "1": 0 } }
				})).toBeUndefined();

				expect(validateResult([{ value: true }], {
					shape: Derived,
					model: { value: { "0": "", "1": 0 } }
				})).toBeDefined();

			});

		});

		describe("collection keying", () => {

			const shape = resource({
				id: id(),
				name: required(string())
			});

			it("keys traces by resource id when present", async () => {

				const trace = validateResult([{ id: "app:/users/1", name: 42 }], {
					shape,
					model: { id: "", name: "" }
				});

				expect(trace).toHaveProperty([0, "<app:/users/1>"]);

			});

			it("keys traces by index when id absent", async () => {

				const trace = validateResult([{ name: 42 }], {
					shape,
					model: { name: "" }
				});

				expect(trace).toHaveProperty([0, "0"]);

			});

			it("returns undefined when all responses are valid", async () => {

				expect(validateResult([
					{ id: "app:/users/1", name: "Alice" },
					{ id: "app:/users/2", name: "Bob" }
				], { shape, model: { id: "", name: "" } })).toBeUndefined();

			});

			it("traces only invalid responses in a mixed collection", async () => {

				const trace = validateResult([
					{ id: "app:/users/1", name: "Alice" },
					{ id: "app:/users/2", name: 42 }
				], { shape, model: { id: "", name: "" } });

				expect(trace).not.toHaveProperty([0, "<app:/users/1>"]);
				expect(trace).toHaveProperty([0, "<app:/users/2>"]);

			});

		});

		describe("custom validators", () => {

			it("runs custom validators on projected responses", async () => {

				const adult: (value: Resource) => undefined | Trace = value =>
					(value as Record<string, unknown>).age !== undefined
					&& (value as { age: number }).age < 18
						? ["under-age"]
						: undefined;

				const shape = resource(
					{ age: required(integer()) },
					{ validators: [adult] }
				);

				expect(validateResult([{ age: 25 }], { shape, model: { age: 0 } })).toBeUndefined();
				expect(validateResult([{ age: 15 }], { shape, model: { age: 0 } })).toBeDefined();

			});

			it("keys validator trace by validator name", async () => {

				function adult(value: unknown): undefined | Trace {
					return (value as { age: number }).age < 18 ? ["under-age"] : undefined;
				}

				const shape = resource(
					{ age: required(integer()) },
					{ validators: [adult] }
				);

				const trace = validateResult([{ age: 15 }], {
					shape,
					model: { age: 0 }
				});

				expect(rec(trace, "0")).toHaveProperty("{adult}");

			});

		});

		describe("model as authoritative contract", () => {

			// the projection-aware validator treats the model template as the authoritative
			// contract for what to validate; the shape supplies leaf details and constraints
			// but does not override what the model narrows away

			it("accepts response omitting slot elided via empty-template model", async () => {

				// empty-template elision: `vendor: {}` in the model requests no projection of
				// `vendor`; the shape's `required` constraint on the source slot must not be
				// re-applied to the absent response key

				const Vendor = resource({ name: required(string()) });

				const shape = resource({
					price: required(integer()),
					vendor: required(reference(Vendor))
				});

				expect(validateResult([{ price: 42 }], {
					shape,
					model: { price: 0, vendor: {} }
				})).toBeUndefined();

			});

			it("accepts array-of-tag-maps response for multi-localised when model narrows tag", async () => {

				// the model's per-element tag projection (`[{en: ""}]`) authoritatively narrows
				// the localised contract to `en`; the validator must not normalise the array of
				// tag-maps to a canonical `und` form and then reject its object elements

				const shape = resource({
					keywords: multiple(dictionary())
				});

				expect(validateResult([{ keywords: [{ en: "foo" }, { en: "bar" }] }], {
					shape,
					model: { keywords: [{ en: "" }] }
				})).toBeUndefined();

			});

			it("rejects projected localised tag value shorter than shape's minLength", async () => {

				// the localised shape's `minLength` constraint applies to each projected tag
				// value at runtime, not only to canonical-form responses

				const shape = resource({
					keywords: multiple(dictionary({ minLength: 3 }))
				});

				expect(validateResult([{ keywords: [{ en: "ab" }] }], {
					shape,
					model: { keywords: [{ en: "" }] }
				})).toBeDefined();

			});

			it("rejects projected localised tag value longer than shape's maxLength", async () => {

				// the localised shape's `maxLength` constraint applies to each projected tag
				// value at runtime, not only to canonical-form responses

				const shape = resource({
					keywords: multiple(dictionary({ maxLength: 3 }))
				});

				expect(validateResult([{ keywords: [{ en: "abcd" }] }], {
					shape,
					model: { keywords: [{ en: "" }] }
				})).toBeDefined();

			});

			it("rejects projected localised tag outside shape's languageIn range", async () => {

				// the localised shape's `languageIn` constraint applies to each projected tag
				// key at runtime, matching the behaviour of canonical-form validation

				const shape = resource({
					keywords: multiple(dictionary({ languageIn: ["en"] }))
				});

				expect(validateResult([{ keywords: [{ fr: "foo" }] }], {
					shape,
					model: { keywords: [{ fr: "" }] }
				})).toBeDefined();

			});

			it("accepts per-element tag-map array for wildcard tag-range projection", async () => {

				// `multiple(dictionary())` auto-generates the wildcard model `{ "*": [""] }`,
				// requesting per-tag map-array form. The validator MUST recognise the wildcard
				// as a per-element tag-map projection and accept the array-of-tag-maps response
				// instead of falling back to the canonical und-keyed shape.

				const shape = resource({
					keywords: multiple(dictionary())
				});

				expect(validateResult([{ keywords: [{ en: "foo" }, { en: "bar" }] }], {
					shape,
					model: shape.model
				})).toBeUndefined();

			});

			it("treats empty map response as absence on optional projected localised", async () => {

				// an absent optional localised slot returns `{}` from the adapter; per the
				// absence-semantics axis, `{}` MUST be treated as elision rather than triggering
				// missing-tag checks against the projected tag set.

				const shape = resource({
					description: optional(dictionary({ en: "" }))
				});

				expect(validateResult([{ description: {} }], {
					shape,
					model: { description: { en: "" } }
				})).toBeUndefined();

			});

			it("treats empty array response as absence on multi-valued projected localised", async () => {

				// the absence contract extends to the multi-valued form: an empty array is
				// equivalent to omission and MUST NOT trigger element-presence checks.

				const shape = resource({
					keywords: multiple(dictionary({ en: "" }))
				});

				expect(validateResult([{ keywords: [] }], {
					shape,
					model: { keywords: [{ en: "" }] }
				})).toBeUndefined();

			});

		});

		describe("shape constraint coverage", () => {

			// every value-level shape constraint MUST be enforced by validateResult against
			// retrieval results; these tests close coverage gaps where the constraint was only
			// exercised by validateResource / validateTemplate but not by validateResult

			it("rejects number below minInclusive", async () => {

				const shape = resource({
					age: required(integer({ minInclusive: 0 }))
				});

				expect(validateResult([{ age: -1 }], { shape, model: { age: 0 } })).toBeDefined();

			});

			it("rejects number above maxInclusive", async () => {

				const shape = resource({
					age: required(integer({ maxInclusive: 150 }))
				});

				expect(validateResult([{ age: 151 }], { shape, model: { age: 0 } })).toBeDefined();

			});

			it("rejects number at minExclusive boundary", async () => {

				const shape = resource({
					score: required(integer({ minExclusive: 0 }))
				});

				expect(validateResult([{ score: 0 }], { shape, model: { score: 0 } })).toBeDefined();

			});

			it("rejects number at maxExclusive boundary", async () => {

				const shape = resource({
					score: required(integer({ maxExclusive: 100 }))
				});

				expect(validateResult([{ score: 100 }], { shape, model: { score: 0 } })).toBeDefined();

			});

			it("rejects number outside in-set", async () => {

				const shape = resource({
					rating: required(integer({ in: [1, 2, 3] }))
				});

				expect(validateResult([{ rating: 5 }], { shape, model: { rating: 0 } })).toBeDefined();

			});

			it("rejects response missing number required by hasValue", async () => {

				const shape = resource({
					codes: nonempty(integer({ hasValue: [42] }))
				});

				expect(validateResult([{ codes: [1, 2] }], { shape, model: { codes: [0] } })).toBeDefined();

			});

			it("rejects response missing string required by hasValue", async () => {

				const shape = resource({
					tags: nonempty(string({ hasValue: ["required"] }))
				});

				expect(validateResult([{ tags: ["a", "b"] }], { shape, model: { tags: [""] } })).toBeDefined();

			});

			it("rejects array exceeding maxCount", async () => {

				const shape = resource({
					tags: property(string(), { maxCount: 2 })
				});

				expect(validateResult([{ tags: ["a", "b", "c"] }], { shape, model: { tags: [""] } })).toBeDefined();

			});

		});

	});

	describe("validateTemplate", () => {

		describe("resource constraints", () => {

			describe("binding resolution", () => {

				it("accepts empty model on empty shape", async () => {

					const shape = resource({});

					expect(validateTemplate([{}], shape, { depth: 0 })).toBeUndefined();

				});

				it("accepts model with only defined entries", async () => {

					const shape = resource({
						name: required(string()),
						age: optional(integer())
					});

					expect(validateTemplate([{ name: "Alice", age: 30 }], shape, { depth: 0 })).toBeUndefined();

				});

				it("accepts declared id property", async () => {

					const shape = resource({
						id: id(),
						name: required(string())
					});

					expect(validateTemplate([{
						"id": "app:/users/123",
						name: "Alice"
					}], shape, { depth: 0 })).toBeUndefined();

				});

				it("accepts entries from inherited shape", async () => {

					const Base = resource({
						id: required(integer())
					});

					const Derived = resource(Base, {
						name: required(string())
					});

					expect(validateTemplate([{ id: 1, name: "Alice" }], Derived, { depth: 0 })).toBeUndefined();

				});

				it("rejects unknown binding on empty shape", async () => {

					// name is shorthand for name=name → apply() returns "undefined property path"

					const shape = resource({});

					expect(validateTemplate([{ name: "Alice" }], shape, { depth: 0 })).toEqual(flat({
						"[0]": { "name": "undefined property path" }
					}));

				});

				it("rejects unknown binding", async () => {

					// extra=extra → apply() returns "undefined property path"

					const shape = resource({
						name: required(string())
					});

					expect(validateTemplate([{ name: "Alice", extra: "value" }], shape, { depth: 0 })).toEqual(flat({
						"[0]": { "extra": "undefined property path" }
					}));

				});

				it("rejects multiple unknown bindings", async () => {

					const shape = resource({
						name: required(string())
					});

					expect(validateTemplate([{
						name: "Alice",
						extra1: "a",
						extra2: "b"
					}], shape, { depth: 0 })).toEqual(flat({
						"[0]": {
							"extra1": "undefined property path",
							"extra2": "undefined property path"
						}
					}));

				});

				it("rejects undeclared id binding", async () => {

					// id=id → apply() returns "undefined property path" (id entry not declared)

					const shape = resource({
						name: required(string())
					});

					expect(validateTemplate([{
						"id": "app:/users/123",
						name: "Alice"
					}], shape, { depth: 0 })).toEqual(flat({
						"[0]": { "id": "undefined property path" }
					}));

				});

				it("rejects unknown binding alongside declared id", async () => {

					// extra=extra → apply() returns "undefined property path"

					const shape = resource({
						id: id(),
						name: required(string())
					});

					expect(validateTemplate([{
						"id": "app:/users/123",
						name: "Alice",
						extra: "value"
					}], shape, { depth: 0 })).toEqual(flat({
						"<app:/users/123>": { "extra": "undefined property path" }
					}));

				});

				it("rejects unknown binding in derived shape", async () => {

					const Base = resource({
						id: required(integer())
					});

					const Derived = resource(Base, {
						name: required(string())
					});

					expect(validateTemplate([{
						id: 1,
						name: "Alice",
						extra: "value"
					}], Derived, { depth: 0 })).toEqual(flat({
						"[0]": { "extra": "undefined property path" }
					}));

				});

				it("rejects non-identifier key at top level", async () => {

					const shape = resource({
						name: required(string())
					});

					expect(validateTemplate([{
						name: "Alice",
						">=name": "A"
					} as any], shape, { depth: 0 })).toBeDefined();

				});

				it("rejects probe key at top level", async () => {

					const shape = resource({
						name: required(string())
					});

					expect(validateTemplate([{
						name: "Alice",
						"^name": "asc"
					} as any], shape, { depth: 0 })).toBeDefined();

				});


			});

			describe("custom validators skipped", () => {

				it("accepts failing custom validator", async () => {

					const validator: (value: Resource) => undefined | Trace = () => ["always fails"];

					const shape = resource({
						name: required(string())
					}, {
						validators: [validator]
					});

					expect(validateTemplate([{ name: "Alice" }], shape, { depth: 0 })).toBeUndefined();

				});

				it("accepts failing inherited validator", async () => {

					const validator: (value: Resource) => undefined | Trace = () => ["always fails"];

					const Base = resource({
						age: required(integer())
					}, { validators: [validator] });

					const Derived = resource(Base, {
						name: required(string())
					});

					expect(validateTemplate([{ age: 15, name: "Bob" }], Derived, { depth: 0 })).toBeUndefined();

				});

			});

			describe("trace structure", () => {

				it("includes property path in nested traces", async () => {

					const Address = resource({
						city: required(string())
					});

					const shape = resource({
						address: required(Address)
					});

					// array on scalar triggers shape mismatch in nested resource

					const trace = validateTemplate([{ address: { city: ["Rome"] } as any }], shape, {});

					expect(trace).toHaveProperty([0, "0", 0, "address"]);

				});

			});

		});

		describe("id constraints", () => {

			it("accepts string value", async () => {

				const shape = resource({ id: id() });

				expect(validateTemplate([{ "id": "some-id" }], shape, { depth: 0 })).toBeUndefined();

			});

			it("accepts missing id", async () => {

				const shape = resource({ id: id() }, { pattern: "/users/{id}" });

				expect(validateTemplate([{}], shape, { depth: 0 })).toBeUndefined();

			});

			it("rejects multiple values", async () => {

				const shape = resource({ id: id() });

				expect(validateTemplate([{ "id": ["/users/1", "/users/2"] } as any], shape, { depth: 0 })).toBeDefined();

			});

			it("skips pattern", async () => {

				const shape = resource({ id: id() }, { pattern: "/users/{id}" });

				expect(validateTemplate([{ "id": "app:/invalid" }], shape, { depth: 0 })).toBeUndefined();

			});

			it("skips in", async () => {

				const shape = resource({ id: id() }, { in: ["app:/users/alice"] });

				expect(validateTemplate([{ "id": "app:/users/charlie" }], shape, { depth: 0 })).toBeUndefined();

			});

			it("skips hasValue", async () => {

				const shape = resource({ id: id() }, { hasValue: ["app:/users/admin"] });

				expect(validateTemplate([{ "id": "app:/users/guest" }], shape, { depth: 0 })).toBeUndefined();

			});

		});

		describe("type constraints", () => {

			it("accepts string value", async () => {

				const shape = resource({ type: type() }, { class: "app:/types/T" });

				expect(validateTemplate([{ "type": "some-type" }], shape, { depth: 0 })).toBeUndefined();

			});

			it("accepts missing type", async () => {

				const shape = resource({ type: type() }, { class: "app:/types/T" });

				expect(validateTemplate([{}], shape, { depth: 0 })).toBeUndefined();

			});

			it("rejects multiple values", async () => {

				const shape = resource({ type: type() }, { class: "app:/types/T" });

				expect(validateTemplate([{ "type": ["/types/A", "/types/B"] } as any], shape, { depth: 0 })).toBeDefined();

			});

		});

		describe("property constraints", () => {

			describe("missing entries accepted", () => {

				it("accepts absent required property", async () => {

					const shape = resource({
						name: required(string())
					});

					expect(validateTemplate([{}], shape, { depth: 0 })).toBeUndefined();

				});

				it("accepts absent nonempty property", async () => {

					const shape = resource({
						tags: nonempty(string())
					});

					expect(validateTemplate([{}], shape, { depth: 0 })).toBeUndefined();

				});

			});

			describe("shape enforced (scalar vs array)", () => {

				it.each([
					["accepts scalar on scalar", "name", required(string()), { name: "Alice" }, true],
					["accepts array on array", "tags", nonempty(string()), { tags: ["a"] }, true],
					["rejects array on scalar", "name", required(string()), { name: ["Alice"] }, false],
					["rejects scalar on array", "tags", nonempty(string()), { tags: "a" }, false]
				] as const)("%s", async (_label, key, range, value, valid) => {

					const shape = resource({ [key]: range });

					if ( valid ) {
						expect(validateTemplate([value], shape, { depth: 0 })).toBeUndefined();
					} else {
						expect(validateTemplate([value as any], shape, { depth: 0 })).toBeDefined();
					}

				});

				describe("local tag map on scalar cardinality", () => {

					it("accepts bare string template on scalar localised property (coalesced placeholder)", async () => {

						const shape = resource({ label: required(dictionary()) });

						expect(validateTemplate([{ label: "hello" }], shape, { depth: 0 })).toBeUndefined();

					});

					it("accepts tag-range map on scalar property", async () => {

						const shape = resource({ label: required(dictionary()) });

						expect(validateTemplate([{ label: { en: "hello" } }], shape, { depth: 0 })).toBeUndefined();

					});

					it("rejects array-valued tag map on scalar localised property", async () => {

						// single-string-per-tag pins the structural map to the single-string arm

						const shape = resource({ label: required(dictionary()) });

						expect(validateTemplate([{ label: { en: ["hello"] } }], shape, { depth: 0 })).toBeDefined();

					});

				});

				describe("localised tag map on array cardinality", () => {

					it("accepts bare singleton array template on array localised property (coalesced array placeholder)", async () => {

						// `[""]` is the array-per-tag coalesced placeholder, the counterpart of the bare
						// string on a single-string-per-tag slot (qest §5.3)

						const shape = resource({ labels: nonempty(dictionary()) });

						expect(validateTemplate([{ labels: ["hello"] }], shape, { depth: 0 })).toBeUndefined();

					});

					it("accepts tag-range map with array values on array property", async () => {

						const shape = resource({ labels: nonempty(dictionary()) });

						expect(validateTemplate([{ labels: { en: ["hello"] } }], shape, { depth: 0 })).toBeUndefined();

					});

					it("rejects single-string tag map on array localised property", async () => {

						// array-per-tag pins the structural map to the singleton-tuple arm

						const shape = resource({ labels: nonempty(dictionary()) });

						expect(validateTemplate([{ labels: { en: "hello" } }], shape, { depth: 0 })).toBeDefined();

					});

					it("rejects bare multi-element array template on array property", async () => {

						const shape = resource({ labels: multiple(dictionary()) });

						expect(validateTemplate([{ labels: ["alpha", "beta"] }], shape, { depth: 0 })).toBeDefined();

					});

				});

				describe("localised selection keys rejected", () => {

					// localised entries carry no inline Selection — filtering or ordering by a
					// localised value attaches at the enclosing collection's Selection through an
					// Expression, never inside the tag-range map — so an operator-prefixed key is an
					// invalid tag range

					const shape = resource({ labels: multiple(dictionary()) });

					it("reports a selection key as an invalid tag range", async () => {

						expect(unflat(validateTemplate([{
							labels: {
								en: ["hi"],
								">=length:": 5
							}
						}], shape, {}))).toEqual({
							"[0]": { "labels": { ">=length:": "invalid tag range" } }
						});

					});

					it.each([
						["keyword search", { en: ["hi"], "~": "foo" }],
						["focus ordering", { en: ["hi"], "+": ["x"] }],
						["sort ordering", { en: ["hi"], "^": "asc" }],
						["pagination offset", { en: ["hi"], "@": 0 }],
						["pagination limit", { en: ["hi"], "#": 10 }]
					])("rejects %s selection key on a localised property", async (_label, value) => {

						expect(validateTemplate([{ labels: value }], shape, {})).toBeDefined();

					});

					it("rejects a selection-only localised template", async () => {

						expect(validateTemplate([{ labels: { "#": 10 } }], shape, {})).toBeDefined();

					});

				});

				describe("effective cardinality for local", () => {

					it("rejects bare string on required local property", async () => {

						const shape = resource({ label: required(dictionary()) });

						expect(validateResource([{ label: "ToyMaster GmbH" }], shape)).toHaveProperty([0, "0", 0, "label"]);

					});

					it("rejects empty local object on required property", async () => {

						const shape = resource({ label: required(dictionary()) });

						expect(validateResource([{ label: {} }], shape)).toHaveProperty([0, "0", 0, "label"]);

					});

					it("accepts multi-tag local on required property", async () => {

						const shape = resource({ label: required(dictionary()) });

						expect(validateResource([{
							label: {
								en: "hello",
								fr: "bonjour"
							}
						}], shape)).toBeUndefined();

					});

					it("rejects array-per-tag local on required property", async () => {

						const shape = resource({ label: required(dictionary()) });

						expect(validateResource([{
							label: {
								en: ["hello", "hi"]
							}
						}], shape)).toHaveProperty([0, "0", 0, "label"]);

					});

				});

				describe("effective cardinality for localised", () => {

					it("rejects bare string array on required localised property", async () => {

						const shape = resource({ labels: nonempty(dictionary()) });

						expect(validateResource([{ labels: ["hello"] }], shape)).toHaveProperty([0, "0", 0, "labels"]);

					});

					it("rejects empty localised object on required property", async () => {

						const shape = resource({ labels: nonempty(dictionary()) });

						expect(validateResource([{ labels: {} }], shape)).toHaveProperty([0, "0", 0, "labels"]);

					});

					it("accepts multi-tag localised on required property", async () => {

						const shape = resource({ labels: nonempty(dictionary()) });

						expect(validateResource([{
							labels: {
								en: ["hello"],
								fr: ["bonjour"]
							}
						}], shape)).toBeUndefined();

					});

					it("rejects empty-array tag on required property", async () => {

						const shape = resource({ labels: nonempty(dictionary()) });

						expect(validateResource([{
							labels: {
								en: []
							}
						}], shape)).toHaveProperty([0, "0", 0, "labels"]);

					});

				});

			});

			describe("undefined template accepted", () => {

				// per qest: `Template = { [Identifier]: undefined | Placeholders }` — undefined
				// marks an optional slot that exists in the schema but may be absent at runtime

				it.each([
					["scalar", "name", required(string()), { name: undefined }],
					["array", "tags", nonempty(string()), { tags: undefined }]
				] as const)("accepts undefined template on %s property", async (_label, key, range, value) => {

					const shape = resource({ [key]: range });

					expect(validateTemplate([value as any], shape, { depth: 0 })).toBeUndefined();

				});

			});

			describe("placeholder tuple arity", () => {

				it("rejects empty array on string array property", async () => {

					const shape = resource({
						tags: nonempty(string())
					});

					expect(validateTemplate([{ tags: [] }], shape, { depth: 0 })).toBeDefined();

				});

				it("accepts singleton array on string array property", async () => {

					const shape = resource({
						tags: nonempty(string())
					});

					expect(validateTemplate([{ tags: ["a"] }], shape, { depth: 0 })).toBeUndefined();

				});

				it("rejects multi-element array on string array property", async () => {

					const shape = resource({
						tags: nonempty(string())
					});

					expect(validateTemplate([{ tags: ["a", "b"] }], shape, { depth: 0 })).toBeDefined();

				});

				it("accepts singleton array on number array property", async () => {

					const shape = resource({
						scores: nonempty(integer())
					});

					expect(validateTemplate([{ scores: [0] }], shape, { depth: 0 })).toBeUndefined();

				});

				it("rejects multi-element array on number array property", async () => {

					const shape = resource({
						scores: nonempty(integer())
					});

					expect(validateTemplate([{ scores: [1, 2] }], shape, { depth: 0 })).toBeDefined();

				});

				it("accepts singleton array on boolean array property", async () => {

					const shape = resource({
						flags: nonempty(boolean())
					});

					expect(validateTemplate([{ flags: [true] }], shape, { depth: 0 })).toBeUndefined();

				});

				it("rejects empty array on boolean array property", async () => {

					const shape = resource({
						flags: nonempty(boolean())
					});

					expect(validateTemplate([{ flags: [] }], shape, { depth: 0 })).toBeDefined();

				});

				it("rejects multi-element array on boolean array property", async () => {

					const shape = resource({
						flags: nonempty(boolean())
					});

					expect(validateTemplate([{ flags: [true, false] }], shape, { depth: 0 })).toBeDefined();

				});

				it("rejects non-boolean element on boolean array property", async () => {

					const shape = resource({
						flags: nonempty(boolean())
					});

					expect(validateTemplate([{ flags: ["true"] } as any], shape, { depth: 0 })).toBeDefined();

				});

				it("accepts singleton IRI array on reference array property", async () => {

					const Target = resource({ id: id(), name: required(string()) });
					const shape = resource({ members: multiple(reference(Target)) });

					expect(validateTemplate([{ members: ["app:/users/1"] }], shape, { depth: 0 })).toBeUndefined();

				});

				it("rejects multi-element IRI array on reference array property", async () => {

					const Target = resource({ id: id(), name: required(string()) });
					const shape = resource({ members: multiple(reference(Target)) });

					expect(validateTemplate([{ members: ["app:/users/1", "app:/users/2"] }], shape, { depth: 0 })).toBeDefined();

				});

			});

			describe("inherited shape enforced", () => {

				it("enforces shape on inherited scalar property", async () => {

					const Base = resource({
						name: required(string())
					});

					const Derived = resource(Base, {
						age: optional(integer())
					});

					expect(validateTemplate([{ name: "Alice" }], Derived, { depth: 0 })).toBeUndefined();
					expect(validateTemplate([{ name: ["Alice"] } as any], Derived, { depth: 0 })).toBeDefined();

				});

				it("enforces shape on inherited entries from multiple parents", async () => {

					const Named = resource({
						name: required(string())
					});

					const Aged = resource({
						age: required(integer())
					});

					const Person = resource(Named, Aged, {
						email: optional(string())
					});

					expect(validateTemplate([{}], Person, { depth: 0 })).toBeUndefined();
					expect(validateTemplate([{ name: "Alice", age: 30 }], Person, { depth: 0 })).toBeUndefined();
					expect(validateTemplate([{ name: ["Alice"] } as any], Person, { depth: 0 })).toBeDefined();

				});

			});

			it("enforces shape on overridden inherited property", async () => {

				const Base = resource({
					name: required(string())
				});

				const Derived = resource(Base, {
					name: required(string({ model: "abc", minLength: 3 }))
				});

				// type shape still enforced on overridden property

				expect(validateTemplate([{ name: "abc" }], Derived, { depth: 0 })).toBeUndefined();
				expect(validateTemplate([{ name: 42 }], Derived, { depth: 0 })).toBeDefined();

			});

		});

		describe("value constraints", () => {

			it("accepts value matching type", async () => {

				const shape = resource({
					name: required(string())
				});

				expect(validateTemplate([{ name: "Alice" }], shape, { depth: 0 })).toBeUndefined();

			});

			it("rejects value with wrong type", async () => {

				const shape = resource({
					name: required(string())
				});

				expect(validateTemplate([{ name: 42 }], shape, { depth: 0 })).toBeDefined();

			});

			it("skips value constraints, as query values are placeholders", async () => {

				const shape = resource({
					age: required(integer({ minInclusive: 0 }))
				});

				expect(validateTemplate([{ age: -5 }], shape, { depth: 0 })).toBeUndefined();

			});

			it("exempts placeholders from hasValue constraints", async () => {

				// a single placeholder cannot satisfy a value-set requirement, so hasValue is the one
				// constraint a placeholder is excused from (see validatePlaceholder)

				const shape = resource({
					age: required(integer({ hasValue: [1] }))
				});

				expect(validateTemplate([{ age: 0 }], shape, { depth: 0 })).toBeUndefined();

			});

			describe("union values", () => {

				const textOrCount = resource({
					value: required(union(string(), integer()))
				});

				it("rejects plain placeholder over union", async () => {

					// a union-typed property is addressable only through the indexed form; a plain
					// placeholder, whichever variant it may resemble, is rejected

					expect(validateTemplate([{ value: "hello" }], textOrCount, { depth: 0 })).toBeDefined();
					expect(validateTemplate([{ value: 42 }], textOrCount, { depth: 0 })).toBeDefined();

				});

				it("accepts indexed form over union", async () => {

					expect(validateTemplate([{
						value: {
							"0": "hello",
							"1": 42
						}
					}], textOrCount, { depth: 0 })).toBeUndefined();

				});

				it("accepts missing union property", async () => {

					expect(validateTemplate([{}], textOrCount, { depth: 0 })).toBeUndefined();

				});

				it("rejects plain placeholder matching no variant type", async () => {

					expect(validateTemplate([{ value: true }], textOrCount, { depth: 0 })).toBeDefined();

				});

				it("rejects plain placeholder over inherited union", async () => {

					const Derived = resource(textOrCount, {
						name: required(string())
					});

					expect(validateTemplate([{ value: "hello" }], Derived, { depth: 0 })).toBeDefined();
					expect(validateTemplate([{ value: true }], Derived, { depth: 0 })).toBeDefined();

				});

				it("accepts indexed form over inherited union", async () => {

					const Derived = resource(textOrCount, {
						name: required(string())
					});

					expect(validateTemplate([{ value: { "0": "hello" } }], Derived, { depth: 0 })).toBeUndefined();

				});

			});

			describe("union bindings", () => {

				const Target = resource({
					value: required(union(string(), integer()))
				});

				const Wrapper = resource({ items: multiple(reference(Target)) });

				it("rejects plain placeholder binding over union", async () => {

					// a union-typed binding takes the indexed form, one placeholder per branch; a plain
					// placeholder is rejected

					expect(validateTemplate([{ items: [{ "alias=value": "hello" }] }], Wrapper, {})).toBeDefined();
					expect(validateTemplate([{ items: [{ "alias=value": 42 }] }], Wrapper, {})).toBeDefined();

				});

				it("accepts indexed form binding over union", async () => {

					expect(validateTemplate([{
						items: [{
							"alias=value": {
								"0": "hello",
								"1": 42
							}
						}]
					}], Wrapper, {})).toBeUndefined();

				});

				it("rejects indexed form binding mismatching no variant type", async () => {

					expect(validateTemplate([{ items: [{ "alias=value": { "0": true } }] }], Wrapper, {})).toBeDefined();

				});

			});

			describe("union forms", () => {

				const textOrCount = resource({
					value: required(union(string(), integer()))
				});


				describe("plain form rejected", () => {

					const Target = resource({ name: required(string()) });

					const refOrText = resource({
						link: required(union(reference(Target), string()))
					});

					it("rejects nested template object as plain union form", async () => {

						// a union-typed property is addressable only through the indexed form; a nested
						// template resembling the reference variant is still a plain placeholder

						expect(validateTemplate([{ link: { name: "Alice" } }], refOrText, {})).toBeDefined();

					});

					it("rejects IRI string as plain union form for reference variant", async () => {

						expect(validateTemplate([{ link: "app:/items/1" }], refOrText, { depth: 0 })).toBeDefined();

					});

					it("accepts indexed form selecting the reference variant", async () => {

						expect(validateTemplate([{ link: { "0": { name: "Alice" } } }], refOrText, {})).toBeUndefined();

					});

				});


				describe("default form rejected", () => {

					// the default form `{ "": Scalar }` is not a Placeholders arm — it is the Query
					// scalar-collection branch (`[{ "": Scalar } & Selection]`), so a cardinality-1
					// union slot rejects it

					it("rejects default form regardless of variant match", async () => {

						expect(validateTemplate([{ value: { "": "hello" } }], textOrCount, { depth: 0 })).toBeDefined();
						expect(validateTemplate([{ value: { "": 42 } }], textOrCount, { depth: 0 })).toBeDefined();
						expect(validateTemplate([{ value: { "": true } }], textOrCount, { depth: 0 })).toBeDefined();

					});

					it("accepts empty union template", async () => {

						expect(validateTemplate([{ value: {} }], textOrCount, { depth: 0 })).toBeUndefined();

					});

				});


				describe("union form", () => {

					it("accepts union form with valid variant placeholders", async () => {

						expect(validateTemplate([{
							value: {
								"0": "hello",
								"1": 42
							}
						}], textOrCount, { depth: 0 })).toBeUndefined();

					});

					it("accepts union form with subset of variants", async () => {

						expect(validateTemplate([{ value: { "0": "hello" } }], textOrCount, { depth: 0 })).toBeUndefined();
						expect(validateTemplate([{ value: { "1": 42 } }], textOrCount, { depth: 0 })).toBeUndefined();

					});

					it("accepts an out-of-range integer key as an opaque label", async () => {

						// keys carry no positional meaning, so an integer key past the variant count is a valid
						// label; the branch placeholder is matched to a variant by shape, not by the key
						expect(validateTemplate([{ value: { "2": "hello" } }], textOrCount, { depth: 0 })).toBeUndefined();
						expect(validateTemplate([{ value: { "99": 42 } }], textOrCount, { depth: 0 })).toBeUndefined();

					});

					it("rejects union form with non-canonical integer key", async () => {

						expect(validateTemplate([{ value: { "01": "hello" } }], textOrCount, { depth: 0 })).toBeDefined();
						expect(validateTemplate([{ value: { "3.14": "hello" } }], textOrCount, { depth: 0 })).toBeDefined();
						expect(validateTemplate([{ value: { "-1": "hello" } }], textOrCount, { depth: 0 })).toBeDefined();
						expect(validateTemplate([{ value: { "1e2": "hello" } }], textOrCount, { depth: 0 })).toBeDefined();

					});

					it("rejects a branch placeholder matching no variant", async () => {

						// a boolean placeholder fits neither the string nor the integer branch — unsatisfiable
						expect(validateTemplate([{ value: { "0": true } }], textOrCount, { depth: 0 })).toBeDefined();

					});

					it("accepts two branches singling out the same variant", async () => {

						// branches need not be injective: each value resolves to its branch independently
						expect(validateTemplate([{
							value: {
								"0": "a",
								"1": "b"
							}
						}], textOrCount, { depth: 0 })).toBeUndefined();

					});

					it("rejects union form with mixed key spaces", async () => {

						expect(validateTemplate([{
							value: {
								"": "hello",
								"0": "hello"
							} as any
						}], textOrCount, { depth: 0 })).toBeDefined();

					});

					it("accepts empty union template", async () => {

						expect(validateTemplate([{ value: {} }], textOrCount, { depth: 0 })).toBeUndefined();

					});

				});


				describe("localised model rejected", () => {

					// a union property retrieved directly in a resource template never carries a `dictionary`
					// branch (union shapes exclude `dictionary`), so a `Locales` map model is rejected on every
					// branch regardless of variant — dictionary-as-Locales only arises in a projection, where a
					// binding path traverses into a localised property (see "projection union forms")

					const refOrText = resource({
						link: required(union(reference(resource({ name: required(string()) })), string()))
					});

					it("rejects a Locales map on the reference branch", async () => {

						expect(validateTemplate([{ link: { "0": { en: "hi" } } }], refOrText, {})).toBeDefined();

					});

					it("rejects a Locales map on the primitive branch", async () => {

						expect(validateTemplate([{ value: { "0": { en: "hi" } } }], textOrCount, { depth: 0 })).toBeDefined();

					});

				});


				describe("tuple form rejected on scalar union", () => {

					// scalar (required/optional) union slots have cardinality 1; the singleton-tuple
					// wrap is the Query carrier for collection-valued placeholders and has no role on
					// a scalar slot — closes the asymmetry with non-union scalar slots, which already
					// reject tuple form

					it("rejects tuple-wrapped default form on required union", async () => {

						expect(validateTemplate([{ value: [{ "": "hello" }] as any }], textOrCount, {})).toBeDefined();

					});

					it("rejects tuple-wrapped union form on required union", async () => {

						expect(validateTemplate([{ value: [{ "0": "hello" }] as any }], textOrCount, {})).toBeDefined();

					});

					it("rejects tuple-wrapped plain scalar on required union", async () => {

						expect(validateTemplate([{ value: ["hello"] as any }], textOrCount, {})).toBeDefined();

					});

					it("rejects selection-only tuple on required union", async () => {

						// previously admitted via the Query carve-out; Selection has no meaningful
						// effect on a cardinality-1 slot

						expect(validateTemplate([{ value: [{ "#": 10 }] as any }], textOrCount, {})).toBeDefined();

					});

					it("rejects tuple-wrapped union form on optional union", async () => {

						const maybeTextOrCount = resource({
							value: optional(union(string(), integer()))
						});

						expect(validateTemplate([{ value: [{ "0": "hello" }] as any }], maybeTextOrCount, {})).toBeDefined();

					});

				});


				describe("multi-valued union forms", () => {

					const multiTextOrCount = resource({
						values: multiple(union(string(), integer()))
					});

					it("accepts partial union form in one-element tuple", async () => {

						expect(validateTemplate([{ values: [{ "0": "hello" }] }], multiTextOrCount, {})).toBeUndefined();

					});

					it("accepts union form in one-element tuple", async () => {

						expect(validateTemplate([{
							values: [{
								"0": "hello",
								"1": 42
							}]
						}], multiTextOrCount, {})).toBeUndefined();

					});

					it("accepts empty union template in singleton tuple", async () => {

						expect(validateTemplate([{ values: [{}] }], multiTextOrCount, {})).toBeUndefined();

					});

					it("rejects default form wrapping a nested template", async () => {

						// the default form's `""` carries a Scalar, never a nested template; a resource
						// variant is reached through the union form or a plain template tuple instead

						const Address = resource({ street: required(string()), city: required(string()) });
						const multiContact = resource({ contacts: multiple(union(string(), Address)) });

						expect(validateTemplate([{ contacts: [{ "": { street: "", city: "" } }] }],
							multiContact, {})).toBeDefined();

					});

					describe("selection keys", () => {

						// per qest's `Placeholders`, object-shaped variants reach multi-cardinality
						// through `[Union & Selection]` — the singleton tuple wrapper intersects
						// with `Selection`, so filtering/ordering/pagination keys may attach to
						// the wrapped object alongside indexed/default/plain union form keys

						it("accepts pagination alongside union form", async () => {

							expect(validateTemplate([{ values: [{ "0": "hello" }, { "#": 10 }] }],
								multiTextOrCount, {})).toBeUndefined();

						});

						it("accepts pagination alongside empty union element", async () => {

							expect(validateTemplate([{ values: [{}, { "#": 10 }] }],
								multiTextOrCount, {})).toBeUndefined();

						});

						it("accepts selection-only collection tuple", async () => {

							// an empty union element paired with a Selection narrows the collection
							// without constraining any variant

							expect(validateTemplate([{ values: [{}, { "#": 10 }] }],
								multiTextOrCount, {})).toBeUndefined();

						});

						it("accepts comparison filter alongside union form", async () => {

							expect(validateTemplate([{ values: [{ "0": "hello" }, { ">=count:": 3 }] }],
								multiTextOrCount, {})).toBeUndefined();

						});

						it.each([
							["keyword search", { "~": "foo" }],
							["focus ordering", { "+": ["x"] }],
							["sort ordering", { "^": "asc" }],
							["pagination offset", { "@": 0 }]
						])("accepts %s selection key on [element, selection] tuple", async (_label, selection) => {

							expect(validateTemplate([{ values: [{ "0": "hello" }, selection] }], multiTextOrCount, {})).toBeUndefined();

						});

						it("rejects less-than selection key on undefined property in [element, selection] tuple", async () => {

							expect(unflat(validateTemplate([{ values: [{ "0": "hello" }, { "<x": 5 }] }], multiTextOrCount, {}))).toEqual({
								"[0]": { "values": { "<x": "undefined property path" } }
							});

						});

						describe("selection value semantics", () => {

							// `validateSelectionEntry` on projection-like templates validates the
							// per-operator value domain; [Union & Selection] slots must enforce the
							// same semantics rather than silently accepting any value

							it("rejects non-asc/desc/number sort value", async () => {

								expect(validateTemplate([{ values: [{ "0": "hello" }, { "^": true }] }],
									multiTextOrCount, {})).toBeDefined();

							});

							it("rejects negative pagination offset", async () => {

								expect(validateTemplate([{ values: [{ "0": "hello" }, { "@": -3 }] }],
									multiTextOrCount, {})).toBeDefined();

							});

							it("rejects non-integer pagination limit", async () => {

								expect(validateTemplate([{ values: [{ "0": "hello" }, { "#": 3.5 }] }],
									multiTextOrCount, {})).toBeDefined();

							});

							it("rejects pagination limit exceeding option", async () => {

								expect(validateTemplate([{ values: [{ "0": "hello" }, { "#": 101 }] }],
									multiTextOrCount, { limit: 100 })).toBeDefined();

							});

							// union shape resolves through `apply`: shape-dependent operators validate
							// against each variant and accept when at least one matches

							it("accepts filter operand matching a union variant", async () => {

								// 5 matches the integer variant of union(string, integer)

								expect(validateTemplate([{ values: [{}, { "<": 5 }] }],
									multiTextOrCount, {})).toBeUndefined();

							});

							it("rejects filter operand matching no union variant", async () => {

								// boolean operand satisfies neither string nor integer variant

								expect(validateTemplate([{ values: [{}, { "<": true }] }],
									multiTextOrCount, {})).toBeDefined();

							});

							it("rejects keyword operand matching no union variant", async () => {

								// number operand falls outside keyword's string domain on every variant

								expect(validateTemplate([{ values: [{}, { "~": 42 }] }],
									multiTextOrCount, {})).toBeDefined();

							});

						});

						describe("malformed selection keys", () => {

							// selection probes on [Union & Selection] reuse the same well-formedness
							// gates enforced on projection-bound probes: depth budget, aggregate
							// rejection under `plain`, and decodeProbe syntax validation

							it("accepts selection probe within depth budget", async () => {

								expect(validateTemplate([{ values: [{ "0": "hello" }, { "^": "asc" }] }],
									multiTextOrCount, { depth: 1 })).toBeUndefined();

							});

							it("rejects selection probe exceeding depth budget", async () => {

								expect(validateTemplate([{ values: [{ "0": "hello" }, { ">=x": 5 }] }],
									multiTextOrCount, { depth: 0 })).toBeDefined();

							});

							it("rejects an exhausted-depth selection with a nesting-depth trace", async () => {

								// the selection resolves one level below the collection, so an exhausted
								// budget rejects the whole slot with the same nesting-depth trace the
								// element side raises, not a per-key path-length trace

								expect(unflat(validateTemplate([{ values: [{ "0": "hello" }, { ">=x": 5 }] }],
									multiTextOrCount, { depth: 0 }))).toEqual({
									"[0]": { "values": { "[1]": "exceeded maximum nesting depth" } }
								});

							});

							it("accepts aggregate selection pipe when plain is false", async () => {

								expect(validateTemplate([{ values: [{ "0": "hello" }, { ">=count:": 3 }] }],
									multiTextOrCount, { plain: false })).toBeUndefined();

							});

							it("rejects aggregate selection pipe when plain is true", async () => {

								expect(validateTemplate([{ values: [{ "0": "hello" }, { ">=count:": 3 }] }],
									multiTextOrCount, { plain: true })).toBeDefined();

							});

							it("rejects selection probe with unknown transform", async () => {

								// unknown transform name in the pipe is rejected by decodeProbe

								expect(validateTemplate([{ values: [{ "0": "hello" }, { ">=bogus:": 3 }] }],
									multiTextOrCount, {})).toBeDefined();

							});

						});

					});

				});

			});

		});

		describe("multi-valued primitive forms", () => {

			// Multi-valued primitive shapes (`multiple(string())`, `multiple(integer())`,
			// `multiple(boolean())`) reach multi-cardinality through a `[element, selection?]`
			// tuple whose element is a bare primitive placeholder and whose optional second slot
			// carries Selection operators. The `multiple(shape, selection)` factory at value.ts
			// itself emits this form when a selection is supplied for a primitive shape, so the
			// validator must accept what the factory produces.

			const tags = resource({ tags: multiple(string()) });
			const sizes = resource({ sizes: multiple(integer()) });
			const flags = resource({ flags: multiple(boolean()) });

			it("accepts bare singleton tuple on string collection", async () => {
				expect(validateTemplate([{ tags: ["hello"] }], tags, {})).toBeUndefined();
			});

			it("accepts bare placeholder on string collection", async () => {
				expect(validateTemplate([{ tags: ["hello"] }], tags, {})).toBeUndefined();
			});

			it("accepts bare placeholder on number collection", async () => {
				expect(validateTemplate([{ sizes: [42] }], sizes, {})).toBeUndefined();
			});

			it("accepts bare placeholder on boolean collection", async () => {
				expect(validateTemplate([{ flags: [false] }], flags, {})).toBeUndefined();
			});

			it("rejects bare placeholder of wrong type", async () => {
				expect(validateTemplate([{ tags: [42] }], tags, {})).toBeDefined();
				expect(validateTemplate([{ sizes: ["not-a-number"] }], sizes, {})).toBeDefined();
				expect(validateTemplate([{ flags: ["true"] }], flags, {})).toBeDefined();
			});

			describe("selection keys", () => {

				// primitive-variant retrieval reaches multi-cardinality through a
				// `[element, selection?]` tuple whose element is a bare primitive placeholder;
				// filtering/ordering/pagination keys attach to the optional second slot

				it("accepts pagination alongside placeholder element", async () => {
					expect(validateTemplate([{ tags: ["hello", { "#": 10 }] }], tags, {})).toBeUndefined();
				});

				it("accepts selection-only collection tuple", async () => {
					// a bare placeholder element paired with a Selection narrows the collection
					expect(validateTemplate([{ tags: ["", { "#": 10 }] }], tags, {})).toBeUndefined();
				});

				it("accepts comparison filter alongside placeholder element", async () => {
					expect(validateTemplate([{ tags: ["hello", { "<=length:": 5 }] }], tags, {})).toBeUndefined();
				});

				it.each([
					["keyword search", { "~": "foo" }],
					["focus ordering", { "+": ["x"] }],
					["sort ordering", { "^": "asc" }],
					["pagination offset", { "@": 0 }]
				])("accepts %s selection key on [element, selection] tuple", async (_label, selection) => {
					expect(validateTemplate([{ tags: ["hello", selection] }], tags, {})).toBeUndefined();
				});

				it("rejects less-than selection key on undefined property in [element, selection] tuple", async () => {
					expect(unflat(validateTemplate([{ tags: ["hello", { "<x": "z" }] }], tags, {}))).toEqual({
						"[0]": { "tags": { "<x": "undefined property path" } }
					});
				});

				it("rejects non-selector identifier key in selection slot", async () => {
					// primitive collections have no projection — second-slot keys must be selectors
					expect(validateTemplate([{ tags: ["hello", { "name": "Alice" }] }], tags, {})).toBeDefined();
				});

				describe("selection value semantics", () => {

					it("rejects non-asc/desc/number sort value", async () => {
						expect(validateTemplate([{ tags: ["hello", { "^": true }] }], tags, {})).toBeDefined();
					});

					it("rejects negative pagination offset", async () => {
						expect(validateTemplate([{ tags: ["hello", { "@": -3 }] }], tags, {})).toBeDefined();
					});

					it("rejects pagination limit exceeding option", async () => {
						expect(validateTemplate([{ tags: ["hello", { "#": 101 }] }], tags, { limit: 100 })).toBeDefined();
					});

				});

				describe("malformed selection keys", () => {

					it("rejects selection probe with unknown transform", async () => {
						expect(validateTemplate([{ tags: ["hello", { ">=bogus:": 3 }] }], tags, {})).toBeDefined();
					});

					it("rejects aggregate selection pipe when plain is true", async () => {
						expect(validateTemplate([{ tags: ["hello", { ">=count:": 3 }] }], tags, { plain: true })).toBeDefined();
					});

				});

			});

		});

		describe("reference entries", () => {

			it("accepts IRI string for scalar reference", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					supervisor: optional(reference(Target))
				});

				expect(validateTemplate([{ supervisor: "app:/users/1" }], shape, { depth: 0 })).toBeUndefined();

			});

			it("accepts IRI strings for array reference", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					members: multiple(reference(Target))
				});

				expect(validateTemplate([{ members: ["app:/users/1"] }], shape, { depth: 0 })).toBeUndefined();

			});

			it("admits the full IRI-reference production as reference placeholders", async () => {

				// a reference placeholder matches by kind the full IRI-reference production (qest §5.2): the empty
				// string together with the relative, root-relative, and absolute forms, never the absolute-only
				// instance form

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					supervisor: optional(reference(Target)),
					members: multiple(reference(Target))
				});

				expect(validateTemplate([{ supervisor: "app:/users/1" }], shape, { depth: 0 })).toBeUndefined();
				expect(validateTemplate([{ supervisor: "" }], shape, { depth: 0 })).toBeUndefined();
				expect(validateTemplate([{ supervisor: "/users/1" }], shape, { depth: 0 })).toBeUndefined();
				expect(validateTemplate([{ members: [""] }], shape, { depth: 0 })).toBeUndefined();

			});

			it("rejects malformed strings as reference placeholders", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					supervisor: optional(reference(Target))
				});

				expect(validateTemplate([{ supervisor: "not a reference" }], shape, { depth: 0 })).toBeDefined();

			});

			describe("union of reference variants", () => {

				// a reference placeholder is matched by kind: any well-formed IRI reference fits every reference
				// variant, its value immaterial and not required to be legal for any target

				const Person = resource({ name: required(string()) }, { pattern: "/people/{id}" });
				const Org = resource({ title: required(string()) }, { pattern: "/orgs/{id}" });

				const shape = resource({
					link: required(union(reference(Person), reference(Org)))
				});

				it("accepts a well-formed IRI reference placeholder", async () => {

					expect(validateTemplate([{ link: { "0": "app:/people/1" } }], shape, { depth: 0 }))
						.toBeUndefined();

				});

				it("accepts an IRI legal for no reference target", async () => {

					expect(validateTemplate([{ link: { "0": "app:/widgets/3" } }], shape, { depth: 0 }))
						.toBeUndefined();

				});

				it("rejects a placeholder of the wrong kind", async () => {

					expect(validateTemplate([{ link: { "0": 42 } }], shape, { depth: 0 }))
						.toBeDefined();

				});

			});

			describe("union of same-kind literal variants", () => {

				// date and email are both string-kind: a string placeholder is matched by kind and fits every
				// string variant, its value immaterial

				const shape = resource({ when: required(union(date(), email())) });

				it("accepts a string placeholder over same-kind variants", async () => {

					expect(validateTemplate([{ when: { "0": "2020-01-01" } }], shape, {})).toBeUndefined();

				});

				it("accepts a string placeholder legal for neither variant", async () => {

					expect(validateTemplate([{ when: { "0": "neither" } }], shape, {})).toBeUndefined();

				});

				it("rejects a placeholder of the wrong kind", async () => {

					expect(validateTemplate([{ when: { "0": 42 } }], shape, {})).toBeDefined();

				});

			});

			describe("keyword search over a union", () => {

				// `~` is a search string applied to every string branch at once, not a discriminating placeholder

				const shape = resource({ contacts: multiple(union(string(), string())) });

				it("accepts a ~ filter matching several string variants", async () => {

					expect(validateTemplate([{ contacts: [{}, { "~": "foo" }] }], shape, {})).toBeUndefined();

				});

			});

			it("accepts nested model object for scalar reference", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					supervisor: optional(reference(Target))
				});

				expect(validateTemplate([{ supervisor: { name: "Alice" } }], shape, {})).toBeUndefined();

			});

			it("accepts nested model objects for array reference", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					members: multiple(reference(Target))
				});

				expect(validateTemplate([{ members: [{ name: "Alice" }] } as any], shape, {})).toBeUndefined();

			});

			it("rejects non-string non-object values for reference", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					supervisor: optional(reference(Target))
				});

				expect(validateTemplate([{ supervisor: 42 }], shape, { depth: 0 })).toBeDefined();

			});

			describe("nested model recursion at multiple levels", () => {

				const Department = resource({ id: id(), label: required(string()) });

				const Employee = resource({
					id: id(),
					name: required(string()),
					department: optional(reference(Department))
				});

				const shape = resource({
					supervisor: optional(reference(Employee))
				});

				it("accepts valid 2-level expansion", async () => {

					expect(validateTemplate([{
						supervisor: { name: "Alice", department: { label: "Engineering" } }
					}], shape, {})).toBeUndefined();

				});

				it("rejects unknown binding at level 1", async () => {

					// extra=extra → apply() returns "undefined property path"

					expect(unflat(validateTemplate([{
						supervisor: { name: "Alice", extra: "bad" }
					}], shape, {}))).toEqual({
						"[0]": { "supervisor": { "extra": "undefined property path" } }
					});

				});

				it("rejects unknown binding at level 2", async () => {

					// extra=extra → apply() returns "undefined property path"

					expect(unflat(validateTemplate([{
						supervisor: { name: "Alice", department: { label: "Engineering", extra: "bad" } }
					}], shape, {}))).toEqual({
						"[0]": { "supervisor": { "department": { "extra": "undefined property path" } } }
					});

				});

			});

			it("accepts missing reference property", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					supervisor: optional(reference(Target))
				});

				expect(validateTemplate([{}], shape, { depth: 0 })).toBeUndefined();

			});

			it("accepts foreign property with IRI value", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					children: multiple(reference(Target), { foreign: true })
				});

				expect(validateTemplate([{ children: ["app:/items/1"] } as any], shape, { depth: 0 })).toBeUndefined();

			});

			it("accepts foreign property with nested model", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					children: multiple(reference(Target), { foreign: true })
				});

				expect(validateTemplate([{ children: [{ name: "Child" }] }], shape, {})).toBeUndefined();

			});

		});

		describe("resource entries", () => {

			it("rejects IRI reference for inline resource property", async () => {

				const shape = resource({
					child: optional(resource({ name: required(string()) }))
				});

				expect(validateTemplate([{ child: "app:/children/1" }], shape, { depth: 0 })).toBeDefined();

			});

			it("accepts nested model for inline resource property", async () => {

				const shape = resource({
					child: optional(resource({ name: required(string()) }))
				});

				expect(validateTemplate([{ child: { name: "Alice" } }], shape, {})).toBeUndefined();

			});

		});

		describe("depth", () => {

			it("rejects nested model when depth is 0", async () => {

				const Inner = resource({ label: required(string()) });

				const Outer = resource({
					child: optional(reference(Inner))
				});

				expect(validateTemplate([{ child: { label: "x" } }], Outer, { depth: 0 })).toBeDefined();

			});

			it("accepts nested model when depth is omitted (defaults to null)", async () => {

				const Inner = resource({ label: required(string()) });

				const Outer = resource({
					child: optional(reference(Inner))
				});

				expect(validateTemplate([{ child: { label: "x" } }], Outer, {})).toBeUndefined();

			});

			it("accepts nested model when depth is null (unlimited)", async () => {

				const Inner = resource({ label: required(string()) });

				const Outer = resource({
					child: optional(reference(Inner))
				});

				expect(validateTemplate([{ child: { label: "x" } }], Outer, {})).toBeUndefined();

			});

			it("accepts IRI reference when depth is 0", async () => {

				const Inner = resource({ id: id(), label: required(string()) });

				const Outer = resource({
					child: optional(reference(Inner))
				});

				expect(validateTemplate([{ child: "app:/items/1" }], Outer, { depth: 0 })).toBeUndefined();

			});

			it("accepts nested model via reference when depth is 1", async () => {

				const Inner = resource({ label: required(string()) });

				const Outer = resource({
					child: optional(reference(Inner))
				});

				expect(validateTemplate([{ child: { label: "x" } }], Outer, { depth: 1 })).toBeUndefined();

			});

			it("rejects 2-level nesting via reference when depth is 1", async () => {

				const Leaf = resource({ value: required(string()) });

				const Middle = resource({
					leaf: optional(reference(Leaf))
				});

				const Root = resource({
					middle: optional(reference(Middle))
				});

				expect(validateTemplate([{
					middle: { leaf: { value: "x" } }
				}], Root, { depth: 1 })).toBeDefined();

			});

			it("accepts 2-level nesting via reference when depth is 2", async () => {

				const Leaf = resource({ value: required(string()) });

				const Middle = resource({
					leaf: optional(reference(Leaf))
				});

				const Root = resource({
					middle: optional(reference(Middle))
				});

				expect(validateTemplate([{
					middle: { leaf: { value: "x" } }
				}], Root, { depth: 2 })).toBeUndefined();

			});

			it("rejects nested embedded resource when depth is 0", async () => {

				const Embedded = resource({ label: required(string()) });

				const Outer = resource({
					child: required(Embedded)
				});

				expect(validateTemplate([{ child: { label: "x" } }], Outer, { depth: 0 })).toBeDefined();

			});

			it("accepts nested embedded resource when depth is 1", async () => {

				const Embedded = resource({ label: required(string()) });

				const Outer = resource({
					child: required(Embedded)
				});

				expect(validateTemplate([{ child: { label: "x" } }], Outer, { depth: 1 })).toBeUndefined();

			});

			it("rejects collection resource query when depth is 0", async () => {

				const Target = resource({ name: required(string()) });

				const Outer = resource({
					items: multiple(reference(Target))
				});

				expect(validateTemplate([{ items: [{ name: "x" }] }], Outer, { depth: 0 })).toBeDefined();

			});

			it("accepts collection resource query when depth allows path", async () => {

				const Target = resource({ name: required(string()) });

				const Outer = resource({
					items: multiple(reference(Target))
				});

				// depth 2 → depth 1 inside query → 1-step path ok
				expect(validateTemplate([{ items: [{ name: "x" }] }], Outer, { depth: 2 })).toBeUndefined();

			});

			it("accepts IRI strings in collection reference at depth 0", async () => {

				const Target = resource({ id: id(), name: required(string()) });
				const Outer = resource({ items: multiple(reference(Target)) });

				expect(validateTemplate([{ items: ["app:/items/1"] }], Outer, { depth: 0 })).toBeUndefined();

			});

			it("accepts collection reference template at depth 1", async () => {

				const Target = resource({ name: required(string()) });
				const Outer = resource({ items: multiple(reference(Target)) });

				expect(validateTemplate([{ items: [{ name: "x" }] }], Outer, { depth: 1 })).toBeUndefined();

			});

			it("rejects collection embedded resource template at depth 0", async () => {

				const Embedded = resource({ label: required(string()) });
				const Outer = resource({ items: multiple(Embedded) });

				expect(validateTemplate([{ items: [{ label: "x" }] }], Outer, { depth: 0 })).toBeDefined();

			});

			it("accepts collection embedded resource template at depth 1", async () => {

				const Embedded = resource({ label: required(string()) });
				const Outer = resource({ items: multiple(Embedded) });

				expect(validateTemplate([{ items: [{ label: "x" }] }], Outer, { depth: 1 })).toBeUndefined();

			});

			it("reports malformed query key under the offending key", async () => {

				const Target = resource({ name: required(string()) });

				const Outer = resource({
					items: multiple(reference(Target))
				});

				const trace = validateTemplate([{ items: [{ "===invalid": "x" }] }], Outer, { depth: 1 });

				expect(trace).toHaveProperty([0, "0", 0, "items", 0, "===invalid"]);

			});

			it("reports malformed selection probe in projection tuple under the offending key", async () => {

				// parity with Locales and [Union & Selection] — malformed probes routed through
				// `validateSelectionEntry` must surface under the offending key

				const Target = resource({ name: required(string()) });

				const Outer = resource({
					items: multiple(reference(Target))
				});

				const trace = validateTemplate([{ items: [{ name: "", "<x:": 5 }] }], Outer, {});

				expect(trace).toHaveProperty([0, "0", 0, "items", 0, "<x:"]);

			});

			it("accepts single-step path within depth budget", async () => {

				const Target = resource({ name: required(string()), age: optional(integer()) });
				const Wrapper = resource({ items: multiple(reference(Target)) });

				// depth 2 → depth 1 inside query → 1-step path ok
				expect(validateTemplate([{ items: [{}, { ">=age": 18 }] }], Wrapper, { depth: 2 })).toBeUndefined();

			});

			it("rejects single-step path when depth budget is exhausted", async () => {

				const Target = resource({ name: required(string()), age: optional(integer()) });
				const Wrapper = resource({ items: multiple(reference(Target)) });

				// depth 1 → depth 0 inside query → 1-step path rejected
				expect(validateTemplate([{ items: [{}, { ">=age": 18 }] }], Wrapper, { depth: 1 })).toBeDefined();

			});

			it("accepts two-step path within depth budget", async () => {

				const Vendor = resource({ name: required(string()), rating: optional(integer()) });
				const Target = resource({ vendor: required(reference(Vendor)) });
				const Wrapper = resource({ items: multiple(reference(Target)) });

				// depth 3 → depth 2 inside query → 2-step path ok
				expect(validateTemplate([{ items: [{}, { ">=vendor.rating": 3 }] }], Wrapper, { depth: 3 })).toBeUndefined();

			});

			it("rejects two-step path when depth budget is insufficient", async () => {

				const Vendor = resource({ name: required(string()), rating: optional(integer()) });
				const Target = resource({ vendor: required(reference(Vendor)) });
				const Wrapper = resource({ items: multiple(reference(Target)) });

				// depth 2 → depth 1 inside query → 2-step path rejected
				expect(validateTemplate([{ items: [{}, { ">=vendor.rating": 3 }] }], Wrapper, { depth: 2 })).toBeDefined();

			});

			it("accepts three-step path within depth budget", async () => {

				const Category = resource({ label: required(string()) });
				const Product = resource({ name: required(string()), category: required(reference(Category)) });
				const Target = resource({ product: required(reference(Product)) });
				const Wrapper = resource({ items: multiple(reference(Target)) });

				// depth 4 → depth 3 inside query → 3-step path ok
				expect(validateTemplate([{ items: [{}, { "^product.category.label": "asc" }] }], Wrapper, { depth: 4 })).toBeUndefined();

			});

			it("rejects three-step path when depth budget is insufficient", async () => {

				const Category = resource({ label: required(string()) });
				const Product = resource({ name: required(string()), category: required(reference(Category)) });
				const Target = resource({ product: required(reference(Product)) });
				const Wrapper = resource({ items: multiple(reference(Target)) });

				// depth 3 → depth 2 inside query → 3-step path rejected
				expect(validateTemplate([{ items: [{}, { "^product.category.label": "asc" }] }], Wrapper, { depth: 3 })).toBeDefined();

			});

			it("reduces path budget at nested levels", async () => {

				const Inner = resource({ name: required(string()), tag: optional(string()) });
				const Outer = resource({ items: multiple(reference(Inner)) });

				// depth 2 → depth 1 inside query → 1-step path ok
				expect(validateTemplate([{ items: [{}, { "^tag": "asc" }] }], Outer, { depth: 2 })).toBeUndefined();

				// depth 3 → depth 2 inside query → 2-step path rejected
				const Deep = resource({ label: required(string()) });
				const Inner2 = resource({ ref: required(reference(Deep)), tag: optional(string()) });
				const Outer2 = resource({ items: multiple(reference(Inner2)) });

				expect(validateTemplate([{ items: [{}, { ">=ref.label": "x" }] }], Outer2, { depth: 2 })).toBeDefined();

			});

			it("enforces depth on projection paths", async () => {

				const Vendor = resource({ name: required(string()), rating: optional(integer()) });
				const Target = resource({ vendor: required(reference(Vendor)) });
				const Wrapper = resource({ items: multiple(reference(Target)) });

				// projection path has 2 steps → rejected at depth 2 (depth 1 inside query)
				expect(validateTemplate([{ items: [{ "rating=vendor.rating": 0 }] }], Wrapper, { depth: 2 })).toBeDefined();

				// accepted at depth 3 (depth 2 inside query)
				expect(validateTemplate([{ items: [{ "rating=vendor.rating": 0 }] }], Wrapper, { depth: 3 })).toBeUndefined();

			});

			it("enforces depth on keyword search paths", async () => {

				const Vendor = resource({ name: required(string()) });
				const Target = resource({ vendor: required(reference(Vendor)) });
				const Wrapper = resource({ items: multiple(reference(Target)) });

				// keyword path has 2 steps → rejected at depth 2 (depth 1 inside query)
				expect(validateTemplate([{ items: [{}, { "~vendor.name": "test" }] }], Wrapper, { depth: 2 })).toBeDefined();

				// accepted at depth 3 (depth 2 inside query)
				expect(validateTemplate([{ items: [{}, { "~vendor.name": "test" }] }], Wrapper, { depth: 3 })).toBeUndefined();

			});

			it("enforces depth on option paths", async () => {

				const Vendor = resource({ name: required(string()) });
				const Target = resource({ vendor: required(reference(Vendor)) });
				const Wrapper = resource({ items: multiple(reference(Target)) });

				// option path has 2 steps → rejected at depth 2 (depth 1 inside query)
				expect(validateTemplate([{ items: [{}, { "?vendor.name": ["a", "b"] }] }], Wrapper, { depth: 2 })).toBeDefined();

				// accepted at depth 3 (depth 2 inside query)
				expect(validateTemplate([{ items: [{}, { "?vendor.name": ["a", "b"] }] }], Wrapper, { depth: 3 })).toBeUndefined();

			});

			it("accepts paths without depth limit", async () => {

				const Category = resource({ label: required(string()) });
				const Product = resource({ category: required(reference(Category)) });
				const Target = resource({ product: required(reference(Product)) });
				const Wrapper = resource({ items: multiple(reference(Target)) });

				expect(validateTemplate([{ items: [{}, { "^product.category.label": "asc" }] }], Wrapper, {})).toBeUndefined();

			});

		});

		describe("bindings", () => {

			it("accepts plain identifier at top level", async () => {

				const Target = resource({ name: required(string()), age: optional(integer()) });

				expect(validateTemplate([{ name: "", age: 0 }], Target, { depth: 0 })).toBeUndefined();

			});

			it("rejects plain identifier referencing undefined property", async () => {

				// apply() returns "undefined property path" for unknown property

				const Target = resource({ name: required(string()) });

				expect(unflat(validateTemplate([{ missing: "" }], Target, { depth: 0 }))).toEqual({
					"[0]": { "missing": "undefined property path" }
				});

			});

		});

		describe("restricted query features", () => {

			const Target = resource({
				name: required(string()),
				age: optional(integer()),
				status: required(string()),
				tags: nonempty(string()),
				released: required(date())
			});

			it.each([
				["comparison filter", { ">=age": 18 }],
				["dictionary search filter", { "~name": "alice" }],
				["disjunctive filter", { "?status": "active" }],
				["conjunctive filter", { "!tags": "urgent" }],
				["focus ordering", { "+status": ["active"] }],
				["sort ordering", { "^name": "asc" }],
				["pagination offset", { "@": 0 }],
				["pagination limit", { "#": 10 }]
			])("rejects %s at top level", async (_label, query) => {

				expect(validateTemplate([query], Target, { depth: 0 })).toBeDefined();

			});

			it("rejects transform binding at top level", async () => {

				expect(validateTemplate([{ "releaseYear=year:released": 0 }], Target, { depth: 0 })).toBeDefined();

			});

			it("rejects alias binding at top level", async () => {

				expect(validateTemplate([{ "alias=name": "" }], Target, { depth: 0 })).toBeDefined();

			});

			it("rejects dotted path binding at top level", async () => {

				const Shape = resource({ vendor: required(reference(resource({ rating: optional(integer()) }))) });

				expect(validateTemplate([{ "vendor.rating": 0 }], Shape, {})).toBeDefined();

			});

			it("rejects filter constraint in scalar reference template", async () => {

				const Wrapper = resource({ supervisor: optional(reference(Target)) });

				expect(validateTemplate([{ supervisor: { ">=age": 18 } }], Wrapper, {})).toBeDefined();

			});

			it("rejects sort criterion in scalar reference template", async () => {

				const Wrapper = resource({ supervisor: optional(reference(Target)) });

				expect(validateTemplate([{ supervisor: { "^name": "asc" } }], Wrapper, {})).toBeDefined();

			});

			it("accepts filter constraint inside collection template", async () => {

				const Wrapper = resource({ items: multiple(reference(Target)) });

				expect(validateTemplate([{ items: [{}, { ">=age": 18 }] }], Wrapper, {})).toBeUndefined();

			});

			it("accepts transform binding inside collection template", async () => {

				const Wrapper = resource({ items: multiple(reference(Target)) });

				expect(validateTemplate([{ items: [{ "releaseYear=year:released": 0 }] }], Wrapper, {})).toBeUndefined();

			});

			it("rejects filter through scalar reference inside collection template", async () => {

				const Inner = resource({ name: required(string()), rating: optional(integer()) });
				const Item = resource({ vendor: required(reference(Inner)) });
				const Wrapper = resource({ items: multiple(reference(Item)) });

				// nested scalar reference objects are templates — use dotted paths for cross-reference filtering

				expect(validateTemplate([{ items: [{ vendor: { ">=rating": 3 } }] }], Wrapper, {})).toBeDefined();

			});

			it("accepts plain identifier in scalar reference inside collection template", async () => {

				const Inner = resource({ name: required(string()), rating: optional(integer()) });
				const Item = resource({ vendor: required(reference(Inner)) });
				const Wrapper = resource({ items: multiple(reference(Item)) });

				expect(validateTemplate([{ items: [{ vendor: { rating: 0 } }] }], Wrapper, {})).toBeUndefined();

			});

		});

		describe("nested query criteria", () => {

			describe("projection entries", () => {

				it("accepts query with only projection entries", async () => {

					const Target = resource({ id: id(), name: required(string()), age: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{
							name: "",
							age: 0
						}]
					}], Wrapper, {})).toBeUndefined();

				});

				it("rejects query with unknown projection binding", async () => {

					// extra=extra → apply() returns "undefined property path"

					const Target = resource({ id: id(), name: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{
							name: "",
							extra: ""
						}]
					}], Wrapper, {})).toEqual(flat({
						"[0]": { "items": { "extra": "undefined property path" } }
					}));

				});

			});

			describe("id projection", () => {

				const Target = resource({ id: id(), name: required(string()), age: optional(integer()) });
				const Wrapper = resource({ items: multiple(reference(Target)) });

				it.each([
					["single", { id: "app:/items/1" }],
					["leading", { id: "app:/items/1", name: "", age: 0 }],
					["inner", { name: "", id: "app:/items/1", age: 0 }],
					["trailing", { name: "", age: 0, id: "app:/items/1" }]
				])("accepts id as %s projection property", async (_position, query) => {

					expect(validateTemplate([{ items: [query] }], Wrapper, {})).toBeUndefined();

				});

			});

			describe("type projection", () => {

				const Target = resource({
					type: type(),
					name: required(string()),
					age: optional(integer())
				}, { class: "app:/types/Target" });
				const Wrapper = resource({ items: multiple(reference(Target)) });

				it.each([
					["single", { type: "app:/types/Person" }],
					["leading", { type: "app:/types/Person", name: "", age: 0 }],
					["inner", { name: "", type: "app:/types/Person", age: 0 }],
					["trailing", { name: "", age: 0, type: "app:/types/Person" }]
				])("accepts type as %s projection property", async (_position, query) => {

					expect(validateTemplate([{ items: [query] }], Wrapper, {})).toBeUndefined();

				});

			});

			describe("limit", () => {

				const Target = resource({ name: required(string()) });
				const Wrapper = resource({ items: multiple(reference(Target)) });

				it("accepts # value equal to limit", async () => {
					expect(validateTemplate([{ items: [{}, { "#": 100 }] }], Wrapper, { limit: 100 })).toBeUndefined();
				});

				it("accepts # value less than limit", async () => {
					expect(validateTemplate([{ items: [{}, { "#": 50 }] }], Wrapper, { limit: 100 })).toBeUndefined();
				});

				it("rejects # value exceeding limit", async () => {
					expect(validateTemplate([{ items: [{}, { "#": 101 }] }], Wrapper, { limit: 100 })).toBeDefined();
				});

				it("rejects zero # as unbounded under a limit", async () => {
					expect(validateTemplate([{ items: [{}, { "#": 0 }] }], Wrapper, { limit: 100 })).toBeDefined();
				});

				it("accepts any non-negative # without a limit (spec-lenient)", async () => {
					expect(validateTemplate([{ items: [{}, { "#": 0 }] }], Wrapper, {})).toBeUndefined();
					expect(validateTemplate([{ items: [{}, { "#": 1000000 }] }], Wrapper, {})).toBeUndefined();
				});

				it("treats a limit of 0 as unbounded (accepts any #)", async () => {
					expect(validateTemplate([{ items: [{}, { "#": 0 }] }], Wrapper, { limit: 0 })).toBeUndefined();
					expect(validateTemplate([{ items: [{}, { "#": 1000000 }] }], Wrapper, { limit: 0 })).toBeUndefined();
				});

				it("accepts a template without # under a limit", async () => {
					expect(validateTemplate([{ items: [{ name: "" }] }], Wrapper, { limit: 50 })).toBeUndefined();
				});

			});

			describe("filter criteria", () => {

				it("accepts comparison filter on existing property", async () => {

					const Target = resource({ name: required(string()), age: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{}, { ">=age": 18 }] }], Wrapper, {})).toBeUndefined();

				});

				it("accepts dictionary search filter on string property", async () => {

					const Target = resource({ name: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{}, { "~name": "alice" }] }], Wrapper, {})).toBeUndefined();

				});

				it("accepts disjunctive filter on existing property", async () => {

					const Target = resource({ status: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{}, { "?status": "active" }] }], Wrapper, {})).toBeUndefined();

				});

				it("accepts conjunctive filter on existing property", async () => {

					const Target = resource({ tags: nonempty(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{}, { "!tags": "urgent" }] }], Wrapper, {})).toBeUndefined();

				});

				it("rejects filter on undefined property", async () => {

					const Target = resource({ name: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(unflat(validateTemplate([{ items: [{}, { ">=age": 18 }] }], Wrapper, {}))).toEqual({
						"[0]": { "items": { ">=age": "undefined property path" } }
					});

				});

			});

			describe("ordering criteria", () => {

				it("accepts sort ordering on existing property", async () => {

					const Target = resource({ name: required(string()), age: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{}, {
							"^name": "asc",
							"^age": "desc"
						}]
					}], Wrapper, {})).toBeUndefined();

				});

				it("accepts integer sort precedence", async () => {

					const Target = resource({ name: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{}, { "^name": 2 }] }], Wrapper, {})).toBeUndefined();

				});

				it("rejects non-integer sort precedence", async () => {

					const Target = resource({ name: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{}, { "^name": 1.5 }] }], Wrapper, {})).toBeDefined();

				});

				it("accepts focus ordering on existing property", async () => {

					const Target = resource({ status: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{}, { "+status": ["active"] }] }], Wrapper, {})).toBeUndefined();

				});

				it("rejects ordering on undefined property", async () => {

					const Target = resource({ name: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(unflat(validateTemplate([{ items: [{}, { "^missing": "asc" }] }], Wrapper, {}))).toEqual({
						"[0]": { "items": { "^missing": "undefined property path" } }
					});

				});

				// `^` requires a single-valued sort key: a bare sort over a multi-valued
				// property is invalid and must be reduced explicitly through a `min`/`max`
				// aggregate; a single-valued localised property coalesces and sorts directly

				it("rejects bare sort on multi-valued property", async () => {

					const Target = resource({ tags: nonempty(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{}, { "^tags": "asc" }] }], Wrapper, {})).toBeDefined();

				});

				it("accepts bare sort on single-valued localised property", async () => {

					const Target = resource({ label: required(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{}, { "^label": "asc" }] }], Wrapper, {})).toBeUndefined();

				});

				it("rejects bare sort on multi-valued localised property", async () => {

					const Target = resource({ labels: nonempty(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{}, { "^labels": "asc" }] }], Wrapper, {})).toBeDefined();

				});

				it("accepts scalar-transformed sort on coalesced localised property", async () => {

					const Target = resource({ label: required(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					// `lower` is coalesced access: the single-string-per-tag property contributes its
					// coalesced string, so the key sorts by the lowered label

					expect(validateTemplate([{ items: [{}, { "^lower:label": "asc" }] }], Wrapper, {})).toBeUndefined();

				});

				it("rejects malformed order on scalar-transformed coalesced localised sort key", async () => {

					const Target = resource({ label: required(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					// the coalesced key is a real string sort key, so the order operand is checked
					// rather than vacuously accepted

					expect(validateTemplate([{ items: [{}, { "^lower:label": 1.5 }] }], Wrapper, {})).toBeDefined();

				});

				it("accepts aggregate sort on coalesced localised property", async () => {

					const Target = resource({ label: required(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{}, { "^min:label": "asc" }] }], Wrapper, {})).toBeUndefined();

				});

				it("accepts aggregate sort on multi-valued property", async () => {

					const Target = resource({ tags: nonempty(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					// `max` collapses the multi-valued property to a single-valued sort key

					expect(validateTemplate([{ items: [{}, { "^max:tags": "asc" }] }], Wrapper, {})).toBeUndefined();

				});

				it("accepts count aggregate sort on multi-valued property", async () => {

					const Target = resource({ tags: nonempty(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{}, { "^count:tags": "asc" }] }], Wrapper, {})).toBeUndefined();

				});

			});

			describe("grouped-semantics ordering", () => {

				// under grouping (an aggregate in the projection alone, per qest §5.8.2.1), a non-aggregate
				// ordering or focus key must reference an existing grouping key (a non-aggregate projection
				// binding); an aggregate in the selection alone does not group

				const Target = resource({ name: required(string()), category: optional(string()) });
				const Wrapper = resource({ items: multiple(reference(Target)) });

				it("rejects a non-aggregate sort key with no grouping key under grouping", async () => {
					expect(validateTemplate([{ items: [{ "c=count:": 0 }, { "^name": "asc" }] }], Wrapper, {})).toBeDefined();
				});

				it("rejects a non-aggregate sort key not among the grouping keys", async () => {
					expect(validateTemplate([{
						items: [{ "category=category": "", "c=count:": 0 }, { "^name": "asc" }]
					}], Wrapper, {})).toBeDefined();
				});

				it("accepts a non-aggregate sort key matching a grouping key", async () => {
					expect(validateTemplate([{
						items: [{ "category=category": "", "c=count:": 0 }, { "^category": "asc" }]
					}], Wrapper, {})).toBeUndefined();
				});

				it("accepts an aggregate sort key under grouping", async () => {
					expect(validateTemplate([{
						items: [{ "category=category": "", "c=count:": 0 }, { "^count:": "desc" }]
					}], Wrapper, {})).toBeUndefined();
				});

				it("accepts a non-aggregate sort key when the query is not grouped", async () => {
					expect(validateTemplate([{ items: [{ "name": "" }, { "^name": "asc" }] }], Wrapper, {})).toBeUndefined();
				});

				// focus keys (`+`) are governed by the same grouping rule as ordering keys (`^`)

				it("rejects a non-aggregate focus key with no grouping key under grouping", async () => {
					expect(validateTemplate([{ items: [{ "c=count:": 0 }, { "+name": "x" }] }], Wrapper, {})).toBeDefined();
				});

				it("rejects a non-aggregate focus key not among the grouping keys", async () => {
					expect(validateTemplate([{
						items: [{ "category=category": "", "c=count:": 0 }, { "+name": "x" }]
					}], Wrapper, {})).toBeDefined();
				});

				it("accepts a non-aggregate focus key matching a grouping key", async () => {
					expect(validateTemplate([{
						items: [{ "category=category": "", "c=count:": 0 }, { "+category": "rock" }]
					}], Wrapper, {})).toBeUndefined();
				});

				it("accepts an aggregate focus key under grouping", async () => {
					expect(validateTemplate([{
						items: [{ "category=category": "", "c=count:": 0 }, { "+count:": 1 }]
					}], Wrapper, {})).toBeUndefined();
				});

				it("accepts a non-aggregate focus key when the query is not grouped", async () => {
					expect(validateTemplate([{ items: [{ "name": "" }, { "+name": "x" }] }], Wrapper, {})).toBeUndefined();
				});

				// an aggregate in the selection alone is a per-item reduction (qest §5.8.2.1), not grouping,
				// so a non-key ordering or focus key remains admissible

				it("accepts a non-key sort key with a selection-only aggregate filter", async () => {
					expect(validateTemplate([{
						items: [{ "name": "" }, { ">=count:category": 1, "^category": "asc" }]
					}], Wrapper, {})).toBeUndefined();
				});

				it("accepts a non-key focus key with a selection-only aggregate filter", async () => {
					expect(validateTemplate([{
						items: [{ "name": "" }, { ">=count:category": 1, "+category": "rock" }]
					}], Wrapper, {})).toBeUndefined();
				});

				// the grouping rule runs at any nesting depth: a grouped collection query nested under a
				// set-valued property is checked by the same rule as a top-level one

				const Outer = resource({ tags: multiple(reference(Target)) });
				const Root = resource({ groups: multiple(reference(Outer)) });

				it("rejects a non-key sort key in a grouped query nested under a set-valued property", async () => {
					expect(validateTemplate([{
						groups: [{ tags: [{ "category=category": "", "c=count:": 0 }, { "^name": "asc" }] }]
					}], Root, {})).toBeDefined();
				});

				it("accepts a grouping-key sort key in a grouped query nested under a set-valued property", async () => {
					expect(validateTemplate([{
						groups: [{ tags: [{ "category=category": "", "c=count:": 0 }, { "^category": "asc" }] }]
					}], Root, {})).toBeUndefined();
				});

			});

			describe("pagination", () => {

				const Target = resource({ name: required(string()) });
				const Wrapper = resource({ items: multiple(reference(Target)) });

				it("accepts offset and limit", async () => {
					expect(validateTemplate([{
						items: [{}, {
							"@": 10,
							"#": 25
						}]
					}], Wrapper, {})).toBeUndefined();
				});

				it("accepts zero offset", async () => {
					expect(validateTemplate([{ items: [{}, { "@": 0 }] }], Wrapper, {})).toBeUndefined();
				});

				it("accepts zero limit", async () => {
					expect(validateTemplate([{ items: [{}, { "#": 0 }] }], Wrapper, {})).toBeUndefined();
				});

				it("rejects negative offset", async () => {
					expect(validateTemplate([{ items: [{}, { "@": -1 }] }], Wrapper, {})).toBeDefined();
				});

				it("rejects negative limit", async () => {
					expect(validateTemplate([{ items: [{}, { "#": -1 }] }], Wrapper, {})).toBeDefined();
				});

				it("rejects fractional offset", async () => {
					expect(validateTemplate([{ items: [{}, { "@": 1.5 }] }], Wrapper, {})).toBeDefined();
				});

				it("rejects fractional limit", async () => {
					expect(validateTemplate([{ items: [{}, { "#": 2.5 }] }], Wrapper, {})).toBeDefined();
				});

				it("rejects string offset", async () => {
					expect(validateTemplate([{ items: [{}, { "@": "10" }] }], Wrapper, {})).toBeDefined();
				});

				it("rejects string limit", async () => {
					expect(validateTemplate([{ items: [{}, { "#": "25" }] }], Wrapper, {})).toBeDefined();
				});

				it("rejects boolean offset", async () => {
					expect(validateTemplate([{ items: [{}, { "@": true }] }], Wrapper, {})).toBeDefined();
				});

				it("rejects null limit", async () => {
					expect(validateTemplate([{ items: [{}, { "#": null }] }], Wrapper, {})).toBeDefined();
				});

			});

			describe("language scope", () => {

				const Target = resource({ name: required(string()) });
				const Wrapper = resource({ items: multiple(reference(Target)) });

				it("rejects a locale-tag array on the repurposed @ offset operator", async () => {
					// @ now carries the pagination offset (an integer); the dropped language-scope
					// array-of-tags form is no longer a valid operand
					expect(validateTemplate([{ items: [{}, { "@": ["en"] }] }], Wrapper, {})).toBeDefined();
				});

			});

			describe("mixed keys", () => {

				it("accepts projection element paired with filter, ordering, and pagination selection", async () => {

					const Target = resource({
						name: required(string()),
						age: optional(integer()),
						status: required(string())
					});

					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{
							name: ""
						}, {
							">=age": 18,
							"~name": "alice",
							"^age": "asc",
							"@": 0,
							"#": 10
						}]
					}], Wrapper, {})).toBeUndefined();

				});

				it("rejects unknown binding alongside valid query keys in singleton tuple", async () => {

					const Target = resource({ name: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [
							{ name: "", extra: "" },
							{ "^name": "asc" }
						]
					}], Wrapper, {})).toEqual(flat({
						"[0]": { "items": { "extra": "undefined property path" } }
					}));

				});

			});

			describe("singleton tuple enforcement", () => {

				it("accepts projection element with selection in second slot", async () => {

					const Target = resource({ name: required(string()), age: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{ name: "" }, { ">=age": 18 }]
					}], Wrapper, {})).toBeUndefined();

				});

				it("rejects selection operator key in the element slot", async () => {

					// selection operators belong in the tuple's second slot; an operator-keyed object
					// is neither a valid Template nor a valid Projection element

					const Target = resource({ name: required(string()), age: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{ name: "", ">=age": 18 }]
					}], Wrapper, {})).toBeDefined();

				});

				it("rejects three-element collection placeholder tuple", async () => {

					const Target = resource({ name: required(string()), age: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [
							{ name: "" },
							{ ">=age": 18 },
							{ "#": 10 }
						]
					}], Wrapper, {})).toBeDefined();

				});

				it("rejects three-element tuple even when entries are individually valid", async () => {

					const Target = resource({ name: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [
							{ name: "" },
							{ "#": 10 },
							{ "#": 20 }
						]
					}], Wrapper, {})).toBeDefined();

				});

				it("rejects empty collection placeholder tuple", async () => {

					const Target = resource({ name: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: []
					}], Wrapper, {})).toBeDefined();

				});

				it("accepts selection-only singleton tuple", async () => {

					const Target = resource({ name: required(string()), age: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{}, { ">=age": 18 }]
					}], Wrapper, {})).toBeUndefined();

				});

				it("accepts projection-only singleton tuple", async () => {

					const Target = resource({ name: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{ name: "" }]
					}], Wrapper, {})).toBeUndefined();

				});

				it("accepts projection binding in singleton tuple", async () => {

					const Target = resource({ name: required(string()), age: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{ "alias=name": "" }]
					}], Wrapper, {})).toBeUndefined();

				});

				it("accepts undefined projection binding for conditionally elided slot", async () => {

					// per qest: `Projection = { [Binding]: undefined | Union }` — undefined marks
					// an optional binding elided at construction time (for example, conditionally
					// included aggregates)

					const Target = resource({ name: required(string()), age: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{ "alias=name": undefined }]
					}], Wrapper, {})).toBeUndefined();

				});

				it("rejects array-valued projection binding to multi-valued property", async () => {

					// qest's Projection arm admits only Placeholder (Literal | Reference | Template),
					// excluding singleton-tuple collection placeholders

					const Target = resource({ tags: nonempty(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{ "alias=tags": ["a"] }]
					}], Wrapper, {})).toBeDefined();

				});

				it("accepts LocaleString projection binding on scalar localised property", async () => {

					// single-string-per-tag's structural map carries single strings per tag (qest §5.3)

					const Target = resource({ label: required(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{ "alias=label": { en: "" } }]
					}], Wrapper, {})).toBeUndefined();

				});

				it("accepts coalesced bare string projection binding on scalar localised property", async () => {

					// a single-valued localised binding coalesces, so a bare string stands in for its
					// negotiated value (the Section 5.3 scalar placeholder)

					const Target = resource({ label: required(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{ "alias=label": "" }]
					}], Wrapper, {})).toBeUndefined();

				});

				it("rejects bare string projection binding on multi-valued localised property", async () => {

					// an array-per-tag binding coalesces through the `[""]` coalesced array placeholder, so a
					// bare string (the single-string-per-tag form) is the wrong shape for its cardinality

					const Target = resource({ keywords: multiple(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{ "alias=keywords": "" }]
					}], Wrapper, {})).toBeDefined();

				});

				it("accepts coalesced array placeholder projection binding on multi-valued localised property", async () => {

					// `[""]` is the array-per-tag coalesced placeholder: a single-element string array fanning
					// out per value, distinct from the generic collection placeholder a non-dictionary array rejects

					const Target = resource({ keywords: multiple(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{ "alias=keywords": [""] }]
					}], Wrapper, {})).toBeUndefined();

				});

				it("rejects coalesced array placeholder projection binding on single-valued localised property", async () => {

					// `[""]` is the array-per-tag form; over a single-string-per-tag property the bare string
					// `""` is the matching coalesced placeholder, so the array shape is rejected

					const Target = resource({ label: required(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{ "alias=label": [""] }]
					}], Wrapper, {})).toBeDefined();

				});

				it("rejects LocaleString projection binding on multi-valued localised property", async () => {

					// per qest §5.3, the structural map's per-tag value is typed to the property's per-tag
					// cardinality: a single string over an array-per-tag property is a mismatch (the row-level
					// "one cell, no fan-out" rule is a separate axis from the per-tag value shape)

					const Target = resource({ keywords: multiple(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{ "alias=keywords": { en: "" } }]
					}], Wrapper, {})).toBeDefined();

				});

				it("accepts LocaleStrings projection binding on multi-valued localised property", async () => {

					// array-per-tag's structural map carries single-element string arrays per tag (qest §5.3)

					const Target = resource({ keywords: multiple(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{ "alias=keywords": { en: ["x"] } }]
					}], Wrapper, {})).toBeUndefined();

				});

				it("rejects LocaleStrings projection binding on scalar localised property", async () => {

					// single-string-per-tag's structural map carries single strings per tag, so a
					// singleton-tuple value is a per-tag cardinality mismatch (qest §5.3)

					const Target = resource({ label: required(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{ "alias=label": { en: ["x"] } }]
					}], Wrapper, {})).toBeDefined();

				});

				it("rejects mixed-shape Locales projection binding", async () => {

					// array-per-tag pins every tag value to a singleton tuple (qest §5.3), so the
					// single-string `en` entry is a per-tag cardinality mismatch

					const Target = resource({ keywords: multiple(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{ "alias=keywords": { en: "x", fr: ["y"] } }]
					}], Wrapper, {})).toBeDefined();

				});

				it("rejects collection-placeholder value on projection binding to multi-valued reference", async () => {

					// qest's Projection arm excludes singleton-tuple collection placeholders

					const Member = resource({ name: required(string()) });
					const Target = resource({ members: multiple(reference(Member)) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{ "alias=members": [{ name: "" }] }]
					}], Wrapper, {})).toBeDefined();

				});

				it("rejects mixing template singleton-tuple value with projection binding key", async () => {

					// The whole entry must satisfy isTemplateSelection or isProjectionSelection as a unit:
					// - isTemplateSelection rejects the binding key `alias=foo` (not an identifier)
					// - isProjectionSelection rejects the singleton-tuple value of `members` (Projection
					//   excludes singleton-tuple collection placeholders)
					// Therefore neither qest arm accepts the entry.

					const Member = resource({ name: required(string()) });
					const Target = resource({
						members: multiple(reference(Member)),
						foo: required(string())
					});
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{
							members: [{ name: "" }],
							"alias=foo": ""
						}]
					}], Wrapper, {})).toBeDefined();

				});

				it("accepts projection binding element with selection in second slot", async () => {

					const Target = resource({ name: required(string()), age: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{ "alias=name": "" }, { ">=age": 18 }]
					}], Wrapper, {})).toBeUndefined();

				});

				it("accepts multiple binding entries in singleton tuple", async () => {

					const Target = resource({ name: required(string()), age: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{ "name=name": "", "alias=age": 0 }]
					}], Wrapper, {})).toBeUndefined();

				});

				it("rejects duplicate projection identifier across self and computed bindings", async () => {

					// `name=name` (self binding) and `name=other` (computed binding) collide on the
					// projection identifier `name`; per qest's Projection contract bindings must be
					// unique within an entry

					const Target = resource({
						name: required(string()),
						other: required(string())
					});
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{
							"name=name": "",
							"name=other": ""
						}]
					}], Wrapper, {})).toBeDefined();

				});

				it("rejects duplicate projection identifier across two computed bindings", async () => {

					const Target = resource({
						name: required(string()),
						age: optional(integer())
					});
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{
							"alias=name": "",
							"alias=age": 0
						}]
					}], Wrapper, {})).toBeDefined();

				});

				it("accepts distinct projection identifiers", async () => {

					const Target = resource({
						name: required(string()),
						age: optional(integer())
					});
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: [{
							"first=name": "",
							"second=age": 0
						}]
					}], Wrapper, {})).toBeUndefined();

				});

				it("rejects non-object element in collection placeholder tuple", async () => {

					const Target = resource({ name: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{
						items: ["not an object"] as any
					}], Wrapper, {})).toBeDefined();

				});

			});

			describe("nested model passthrough", () => {

				it("accepts plain nested model in reference tuple", async () => {

					const Member = resource({ name: required(string()) });
					const Wrapper = resource({ members: multiple(reference(Member)) });

					expect(validateTemplate([{ members: [{ name: "" }] }], Wrapper, {})).toBeUndefined();

				});

				it("accepts scalar reference with IRI string", async () => {

					const Target = resource({ id: id(), name: required(string()) });
					const Wrapper = resource({ supervisor: optional(reference(Target)) });

					expect(validateTemplate([{ supervisor: "app:/users/1" }], Wrapper, { depth: 0 })).toBeUndefined();

				});

				it("preserves local model validation", async () => {

					const Wrapper = resource({ label: required(dictionary()) });

					expect(validateTemplate([{ label: { "en": "Hello" } }], Wrapper, { depth: 0 })).toBeUndefined();

				});

				it("preserves localised model validation", async () => {

					const Wrapper = resource({ labels: nonempty(dictionary()) });

					expect(validateTemplate([{ labels: { "en": ["Hello"] as const } }], Wrapper, { depth: 0 })).toBeUndefined();

				});

				it("rejects single-string map on multi-valued localised in collections", async () => {

					// array-per-tag pins the structural map to the singleton-tuple arm

					const Wrapper = resource({ label: multiple(dictionary()) });

					expect(validateTemplate([{ label: { "en": "Hello" } }], Wrapper, { depth: 0 })).toBeDefined();

				});

				it("accepts localised shape in collections", async () => {

					const Wrapper = resource({ labels: multiple(dictionary()) });

					expect(validateTemplate([{ labels: { "en": ["Hello"] as const } }], Wrapper, { depth: 0 })).toBeUndefined();

				});

			});

			describe("deep path criteria", () => {

				it("accepts filter with single-segment path", async () => {

					const Target = resource({ name: required(string()), age: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{}, { ">=age": 18 }] }], Wrapper, {})).toBeUndefined();

				});

				it("accepts filter through reference property", async () => {

					const Vendor = resource({ name: required(string()), rating: optional(integer()) });
					const Target = resource({ vendor: required(reference(Vendor)) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{}, { ">=vendor.rating": 3 }] }], Wrapper, {})).toBeUndefined();

				});

				it("accepts ordering through reference property", async () => {

					const Vendor = resource({ name: required(string()), rating: optional(integer()) });
					const Target = resource({ vendor: required(reference(Vendor)) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{}, { "^vendor.rating": "asc" }] }], Wrapper, {})).toBeUndefined();

				});

				it("accepts three-segment path through nested references", async () => {

					const Category = resource({ label: required(string()) });
					const Product = resource({ name: required(string()), category: required(reference(Category)) });
					const Target = resource({ product: required(reference(Product)) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{}, { "^product.category.label": "asc" }] }], Wrapper, {})).toBeUndefined();

				});

				it("rejects deep path with undefined nested property", async () => {

					const Vendor = resource({ name: required(string()) });
					const Target = resource({ vendor: required(reference(Vendor)) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{}, { ">=vendor.rating": 3 }] }], Wrapper, {})).toEqual(flat({
						"[0]": { "items": { ">=vendor.rating": "undefined property path" } }
					}));

				});

				it("rejects deep path through leaf property", async () => {

					const Target = resource({ name: required(string()), age: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{}, { ">=name.deep": 0 }] }], Wrapper, {})).toEqual(flat({
						"[0]": { "items": { ">=name.deep": "undefined property path" } }
					}));

				});

			});

			describe("union path criteria", () => {

				it("accepts filter through union variant reference", async () => {

					const ItemShape = resource({ score: optional(integer()) });
					const Target = resource({ item: required(union(reference(ItemShape), string())) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{}, { ">=item.score": 5 }] }], Wrapper, {})).toBeUndefined();

				});

				it("rejects deep path through union with missing property", async () => {

					const ItemShape = resource({ score: optional(integer()) });
					const Target = resource({ item: required(union(reference(ItemShape), string())) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{}, { ">=item.missing": 0 }] }], Wrapper, {})).toEqual(flat({
						"[0]": { "items": { ">=item.missing": "undefined property path" } }
					}));

				});

				it("accepts selection-only tuple with path-bearing filter over a UnionShape collection", async () => {

					// the collection range is itself a union; validateSelectionEntry resolves the
					// probe path through apply's UnionShape entry point (commit 6af1c8f) rather
					// than through a single variant shape

					const Scored = resource({ name: required(string()), score: required(integer()) });
					const Labeled = resource({ label: required(string()) });
					const Wrapper = resource({ items: multiple(union(reference(Scored), reference(Labeled))) });

					expect(validateTemplate([{ items: [{}, { ">=score": 5 }] }], Wrapper, {})).toBeUndefined();

				});

				it("rejects bare sort across union branches when any branch is multi-valued", async () => {

					// cardinality is a property of the enclosing slot, not of a single branch: the
					// `tag` property is multi-valued in the `nonempty` branch, so its cross-branch
					// envelope is multi-valued and a bare `^` — which requires a single-valued key —
					// is rejected regardless of the single-valued sibling branch

					const Many = resource({ tag: nonempty(string()) });
					const One = resource({ tag: required(string()) });
					const Wrapper = resource({ items: multiple(union(reference(Many), reference(One))) });

					expect(validateTemplate([{ items: [{}, { "^tag": "asc" }] }], Wrapper, {})).toBeDefined();

				});

				it("accepts bare sort across union branches when every branch is single-valued", async () => {

					// the `tag` property is single-valued in every branch, so its cross-branch
					// envelope is single-valued and a bare `^` is accepted

					const First = resource({ tag: required(string()) });
					const Second = resource({ tag: optional(string()) });
					const Wrapper = resource({ items: multiple(union(reference(First), reference(Second))) });

					expect(validateTemplate([{ items: [{}, { "^tag": "asc" }] }], Wrapper, {})).toBeUndefined();

				});

			});

			describe("binding criteria", () => {

				it("accepts binding with valid transform and projection type", async () => {

					const Target = resource({ name: required(string()), released: optional(date()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "releaseYear=year:released": 0 }] }], Wrapper, {})).toBeUndefined();

				});

				it("rejects binding with type mismatch in projection", async () => {

					const Target = resource({ name: required(string()), released: optional(date()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "releaseYear=year:released": "" }] }], Wrapper, {})).toBeDefined();

				});

				it("rejects binding referencing undefined property", async () => {

					const Target = resource({ name: required(string()), released: optional(date()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(unflat(validateTemplate([{ items: [{ "y=year:missing": 0 }] }], Wrapper, {}))).toEqual({
						"[0]": { "items": { "y=year:missing": "undefined property path" } }
					});

				});

				it("accepts chained aggregate transform", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "lowest=min:price": 0 }] }], Wrapper, {})).toBeUndefined();

				});

				it("accepts multi-step chained transform", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "avg=round:avg:price": 0 }] }], Wrapper, {})).toBeUndefined();

				});

				it("accepts count transform on empty path", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "total=count:": 0 }] }], Wrapper, {})).toBeUndefined();

				});

				it("rejects count transform with wrong projection type", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "total=count:": "" }] }], Wrapper, {})).toBeDefined();

				});

				it("reports incompatible transform input for sum on empty path (resource outside the processing space)", async () => {

					// the empty path resolves to the resource shape, which is not in the processing space →
					// no variant survives the numeric `sum` domain, so the binding is reported

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "total=sum:": 0 }] }], Wrapper, {})).toEqual(flat({
						"[0]": { "items": { "total=sum:": "incompatible transform input" } }
					}));

				});

				it("reports incompatible transform input for lower on empty path (resource outside the processing space)", async () => {

					// the empty path resolves to the resource shape, which is not in the processing space →
					// no variant survives the string `lower` domain, so the binding is reported

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "alias=lower:": "" }] }], Wrapper, {})).toEqual(flat({
						"[0]": { "items": { "alias=lower:": "incompatible transform input" } }
					}));

				});

				it("reports incompatible transform input for aggregate over an empty path (resource outside the processing space)", async () => {

					// min over an empty path resolves to the resource shape, which is not in the processing
					// space → no variant survives the literal `min` domain, so the binding is reported

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "alias=min:": { name: "" } }] }], Wrapper, {})).toEqual(flat({
						"[0]": { "items": { "alias=min:": "incompatible transform input" } }
					}));

				});

				describe("identity and aggregate bindings", () => {

					const Target = resource({
						name: required(string()),
						age: optional(integer()),
						active: optional(boolean()),
						link: optional(reference(resource({ id: id(), label: required(string()) }))),
						child: required(resource({ label: required(string()) }))
					});
					const Wrapper = resource({ items: multiple(reference(Target)) });

					it("accepts identity binding on string property", async () => {


						expect(validateTemplate([{ items: [{ "alias=name": "" }] }], Wrapper, {})).toBeUndefined();

					});

					it("accepts identity binding on integer property", async () => {


						expect(validateTemplate([{ items: [{ "alias=age": 0 }] }], Wrapper, {})).toBeUndefined();

					});

					it("accepts identity binding on boolean property", async () => {


						expect(validateTemplate([{ items: [{ "alias=active": true }] }], Wrapper, {})).toBeUndefined();

					});

					it("accepts identity binding on reference property with IRI", async () => {


						expect(validateTemplate([{ items: [{ "alias=link": "app:/items/1" }] }], Wrapper, {})).toBeUndefined();

					});

					it("rejects identity binding on reference property with wrong type", async () => {


						expect(validateTemplate([{ items: [{ "alias=link": 0 }] }], Wrapper, {})).toBeDefined();

					});

					it("accepts identity binding on embedded resource with model", async () => {


						expect(validateTemplate([{ items: [{ "alias=child": { label: "" } }] }], Wrapper, {})).toBeUndefined();

					});

					it("rejects identity binding on embedded resource with invalid model", async () => {


						expect(validateTemplate([{ items: [{ "alias=child": { label: 0 } }] }], Wrapper, {})).toBeDefined();

					});

					it("rejects identity binding on embedded resource with unknown binding", async () => {

						expect(validateTemplate([{ items: [{ "alias=child": { unknown: "" } }] }], Wrapper, {})).toEqual(flat({
							"[0]": { "items": { "alias=child": { "unknown": "undefined property path" } } }
						}));

					});

					it("rejects identity binding on embedded resource with non-object", async () => {


						expect(validateTemplate([{ items: [{ "alias=child": 42 }] }], Wrapper, {})).toBeDefined();

					});

					it("reports incompatible transform input for aggregate on embedded resource (resource outside the processing space)", async () => {

						// min over a reference/resource child has no variant in the literal domain, so the
						// binding is reported and the projected model is never reached

						expect(validateTemplate([{ items: [{ "alias=min:child": { label: "" } }] }], Wrapper, {})).toEqual(flat({
							"[0]": { "items": { "alias=min:child": "incompatible transform input" } }
						}));

					});

					it("accepts identity binding on embedded resource with depth", async () => {


						expect(validateTemplate([{ items: [{ "alias=child": { label: "x" } }] }], Wrapper, {})).toBeUndefined();

					});

					it("rejects operator key in scalar reference nested template", async () => {

						// nested scalar reference objects are templates — operators require dotted paths

						expect(validateTemplate([{
							items: [{
								"alias=link": {
									label: "",
									"^label": "asc"
								}
							}]
						}], Wrapper, {})).toBeDefined();

					});

					it("rejects identity binding on reference property with unknown binding", async () => {

						expect(validateTemplate([{ items: [{ "alias=link": { unknown: "" } }] }], Wrapper, {})).toEqual(flat({
							"[0]": { "items": { "alias=link": { "unknown": "undefined property path" } } }
						}));

					});

					it("rejects operator key in embedded resource nested template", async () => {

						// nested embedded resource objects are templates — operators require dotted paths

						expect(validateTemplate([{
							items: [{
								"alias=child": {
									label: "",
									"^label": "asc"
								}
							}]
						}], Wrapper, {})).toBeDefined();

					});

					it("rejects identity binding on embedded resource with unknown binding", async () => {

						expect(validateTemplate([{ items: [{ "alias=child": { unknown: "" } }] }], Wrapper, {})).toEqual(flat({
							"[0]": { "items": { "alias=child": { "unknown": "undefined property path" } } }
						}));

					});

					it("reports incompatible transform input for aggregate reference binding, leaving its nested template unchecked", async () => {

						// min over a reference has no variant in the literal domain, so the binding is reported
						// and the nested template (and any operator key within it) is never reached

						expect(validateTemplate([{
							items: [{
								"alias=min:link": {
									label: "",
									">=label": "a"
								}
							}]
						}], Wrapper, {})).toEqual(flat({
							"[0]": { "items": { "alias=min:link": "incompatible transform input" } }
						}));

					});

					it("reports incompatible transform input for aggregate resource binding, leaving its nested template unchecked", async () => {

						expect(validateTemplate([{
							items: [{
								"alias=min:child": {
									label: "",
									">=label": "a"
								}
							}]
						}], Wrapper, {})).toEqual(flat({
							"[0]": { "items": { "alias=min:child": "incompatible transform input" } }
						}));

					});

				});

			});

			describe("transform domain violations", () => {

				// a transform applied outside its domain drops the offending variant; when no variant survives,
				// effective reports `"incompatible transform input"` and the binding surfaces it.
				// This holds equally for values outside the processing space (reference, resource, localised map)

				it("reports incompatible transform input for sum on string property (out of domain)", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "total=sum:name": 0 }] }], Wrapper, {})).toEqual(flat({
						"[0]": { "items": { "total=sum:name": "incompatible transform input" } }
					}));

				});

				it("reports incompatible transform input for abs on reference property (out of processing space)", async () => {

					const Target = resource({
						name: required(string()),
						price: optional(integer()),
						link: optional(reference(resource({ id: id() })))
					});
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "v=abs:link": 0 }] }], Wrapper, {})).toEqual(flat({
						"[0]": { "items": { "v=abs:link": "incompatible transform input" } }
					}));

				});

				it("reports incompatible transform input for year on number property (out of domain)", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "y=year:price": 0 }] }], Wrapper, {})).toEqual(flat({
						"[0]": { "items": { "y=year:price": "incompatible transform input" } }
					}));

				});

				it("reports incompatible transform input for temporal transform on plain string property (out of domain)", async () => {

					const Target = resource({ name: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "m=month:name": 0 }] }], Wrapper, {})).toEqual(flat({
						"[0]": { "items": { "m=month:name": "incompatible transform input" } }
					}));

				});

				it("rejects aggregate-after-aggregate pipe", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "x=sum:count:price": 0 }] }], Wrapper, {})).toEqual(flat({
						"[0]": { "items": { "x=sum:count:price": "expected projection binding" } }
					}));

				});

				it.each([
					["leading digit", "1bad=name"],
					["hyphen", "bad-name=name"],
					["whitespace", "bad name=name"]
				])("rejects projection binding with invalid result name (%s)", async (_label, key) => {

					// the binding result name (left of `=`) must be a valid identifier; only the RHS
					// expression is well-formed here, isolating the result-name check

					const Target = resource({ name: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ [key]: 0 }] }], Wrapper, {})).toBeDefined();

				});

			});

			describe("localised shape transforms", () => {

				// a transform pipe is coalesced access: a localised property contributes the winning
				// tag's value(s) as an ordinary xsd:string of its per-tag cardinality, so string-domain
				// transforms apply under ordinary string semantics; an out-of-domain transform, having no
				// surviving variant, is reported. After a transform the range is a plain string, not a Locales,
				// so a transform-derived array-per-tag binding takes the ordinary string placeholder

				it("accepts string placeholder for lower transform on coalesced localised property", async () => {

					const Target = resource({ label: required(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "alias=lower:label": "" }] }], Wrapper, {})).toBeUndefined();

				});

				it("rejects locale placeholder for lower transform on coalesced localised property", async () => {

					const Target = resource({ label: required(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "alias=lower:label": { "en": "hello" } }] }], Wrapper, {})).toBeDefined();

				});

				it("accepts string placeholder for upper transform on coalesced localised property", async () => {

					const Target = resource({ label: required(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "alias=upper:label": "" }] }], Wrapper, {})).toBeUndefined();

				});

				it("accepts number placeholder for length transform on coalesced localised property", async () => {

					const Target = resource({ label: required(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "alias=length:label": 5 }] }], Wrapper, {})).toBeUndefined();

				});

				it("rejects string placeholder for length transform on coalesced localised property", async () => {

					const Target = resource({ label: required(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "alias=length:label": "x" }] }], Wrapper, {})).toBeDefined();

				});

				it("reports incompatible transform input for abs on coalesced localised property (out of domain)", async () => {

					const Target = resource({ label: required(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(unflat(validateTemplate([{ items: [{ "alias=abs:label": 0 }] }], Wrapper, {}))).toEqual({
						"[0]": { "items": { "alias=abs:label": "incompatible transform input" } }
					});

				});

				it("accepts string placeholder for lower transform on array-per-tag localised property", async () => {

					// array-per-tag coalesces to a multi-valued string; a transform-derived string range
					// takes the ordinary bare placeholder, fanning out per value

					const Target = resource({ labels: nonempty(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "alias=lower:labels": "" }] }], Wrapper, {})).toBeUndefined();

				});

				it("rejects locale placeholder for lower transform on array-per-tag localised property", async () => {

					// after the transform the range is a plain string, not a Locales, so the tag-map form is rejected

					const Target = resource({ labels: nonempty(dictionary()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "alias=lower:labels": { "en": "hello" } }] }], Wrapper, {})).toBeDefined();

				});

			});

			describe("union partial domain match", () => {

				it("accepts numeric transform on union with numeric variant", async () => {

					// abs: numeric domain — integer variant survives, string variant filtered → Range(integer)

					const Target = resource({
						value: required(union(integer(), string()))
					});
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "alias=abs:value": 42 }] }], Wrapper, {})).toBeUndefined();

				});

				it("rejects numeric transform on union with numeric variant when template is wrong type", async () => {

					// abs on union(integer, string) → Range(integer), but template is string → rejects

					const Target = resource({
						value: required(union(integer(), string()))
					});
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "alias=abs:value": "wrong" }] }], Wrapper, {})).toBeDefined();

				});

				it("accepts string transform on union with string variant", async () => {

					// lower: string domain — string variant survives, integer variant filtered → Range(string)

					const Target = resource({
						value: required(union(integer(), string()))
					});
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "alias=lower:value": "" }] }], Wrapper, {})).toBeUndefined();

				});

				it("reports incompatible transform input for union where no variant matches domain", async () => {

					// year: temporal domain — neither boolean nor integer is temporal → every variant
					// out of domain → no variant survives → the binding is reported

					const Target = resource({
						value: required(union(boolean(), integer()))
					});
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(unflat(validateTemplate([{ items: [{ "alias=year:value": 2024 }] }], Wrapper, {}))).toEqual({
						"[0]": { "items": { "alias=year:value": "incompatible transform input" } }
					});

				});

			});

			describe("projection union forms", () => {

				const Target = resource({
					value: required(union(string(), integer()))
				});
				const Wrapper = resource({ items: multiple(reference(Target)) });


				describe("default form rejected", () => {

					// a projection cell admits only Placeholder | Union | Locales; the default form
					// `{ "": Scalar }` is none of these (it is the Query scalar-collection branch)

					it("rejects default form projection regardless of variant match", async () => {

						expect(validateTemplate([{ items: [{ "alias=value": { "": "hello" } }] }], Wrapper, {})).toBeDefined();
						expect(validateTemplate([{ items: [{ "alias=value": { "": 42 } }] }], Wrapper, {})).toBeDefined();
						expect(validateTemplate([{ items: [{ "alias=value": { "": true } }] }], Wrapper, {})).toBeDefined();

					});

					it("accepts empty union template projection", async () => {

						expect(validateTemplate([{ items: [{ "alias=value": {} }] }], Wrapper, {})).toBeUndefined();

					});

				});


				describe("union form", () => {

					it("accepts union form projection with valid variant placeholders", async () => {

						expect(validateTemplate([{
							items: [{
								"alias=value": {
									"0": "hello",
									"1": 42
								}
							}]
						}], Wrapper, {})).toBeUndefined();

					});

					it("accepts union form projection with subset of variants", async () => {

						expect(validateTemplate([{ items: [{ "alias=value": { "0": "hello" } }] }], Wrapper, {})).toBeUndefined();
						expect(validateTemplate([{ items: [{ "alias=value": { "1": 42 } }] }], Wrapper, {})).toBeUndefined();

					});

					it("accepts an out-of-range integer key as an opaque label", async () => {

						// keys carry no positional meaning; the branch is matched to a variant by shape
						expect(validateTemplate([{ items: [{ "alias=value": { "2": "hello" } }] }], Wrapper, {})).toBeUndefined();

					});

					it("rejects union form projection with non-canonical integer key", async () => {

						expect(validateTemplate([{ items: [{ "alias=value": { "01": "hello" } }] }], Wrapper, {})).toBeDefined();

					});

					it("rejects a branch placeholder matching no variant", async () => {

						// a boolean placeholder fits neither the string nor the integer branch — unsatisfiable
						expect(validateTemplate([{ items: [{ "alias=value": { "0": true } }] }], Wrapper, {})).toBeDefined();

					});

					it("accepts two branches singling out the same variant", async () => {

						// branches need not be injective: each value resolves to its branch independently
						expect(validateTemplate([{
							items: [{
								"alias=value": {
									"0": "a",
									"1": "b"
								}
							}]
						}], Wrapper, {})).toBeUndefined();

					});

					it("accepts empty union template projection", async () => {

						expect(validateTemplate([{ items: [{ "alias=value": {} }] }], Wrapper, {})).toBeUndefined();

					});

				});

				describe("localised variant", () => {

					// a projection binding may traverse a union of references whose branches resolve to a
					// localised property: `effective` then yields a union range carrying a `dictionary` variant
					// (the only way a union range carries `dictionary`, since union shapes exclude it directly). A
					// `Locales` map is admitted on that dictionary branch, mirroring qest's `Union` branch widening
					// to `Placeholder | Locales` within a `Projection`

					const Loc = resource({ field: required(dictionary()) });
					const Num = resource({ field: required(integer()) });
					const Item = resource({ ref: required(union(reference(Loc), reference(Num))) });
					const Wrapper = resource({ items: multiple(reference(Item)) });

					it("accepts Locales branch over a dictionary-resolving union variant", async () => {

						expect(validateTemplate([{
							items: [{ "label=ref.field": { "0": { en: "hi" }, "1": 42 } }]
						}], Wrapper, {})).toBeUndefined();

					});

					it("accepts subset selecting only the dictionary branch as a Locales map", async () => {

						expect(validateTemplate([{
							items: [{ "label=ref.field": { "0": { en: "hi" } } }]
						}], Wrapper, {})).toBeUndefined();

					});

					it("accepts a coalesced bare string on the dictionary branch", async () => {

						expect(validateTemplate([{
							items: [{ "label=ref.field": { "0": "plain" } }]
						}], Wrapper, {})).toBeUndefined();

					});

					it("matches a number to the integer branch regardless of key", async () => {

						// key "0" does not force the dictionary branch: a number placeholder singles out the integer
						// branch by shape
						expect(validateTemplate([{
							items: [{ "label=ref.field": { "0": 42 } }]
						}], Wrapper, {})).toBeUndefined();

					});

					it("matches a Locales map to the dictionary branch regardless of key", async () => {

						expect(validateTemplate([{
							items: [{ "label=ref.field": { "1": { en: "hi" } } }]
						}], Wrapper, {})).toBeUndefined();

					});

					it("rejects a placeholder matching no variant", async () => {

						// a boolean placeholder fits neither the dictionary nor the integer branch — unsatisfiable
						expect(validateTemplate([{
							items: [{ "label=ref.field": { "0": true } }]
						}], Wrapper, {})).toBeDefined();

					});

				});

			});

			describe("plain option", () => {

				it("accepts aggregate binding when plain is false", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "total=count:": 0 }] }], Wrapper, {
						plain: false
					})).toBeUndefined();

				});

				it("accepts aggregate binding when plain is defaulted", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "total=count:": 0 }] }], Wrapper, {})).toBeUndefined();

				});

				it("rejects aggregate binding when plain is true", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "total=count:": 0 }] }], Wrapper, {
						plain: true
					})).toBeDefined();

				});

				it("rejects min aggregate when plain is true", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "lowest=min:price": 0 }] }], Wrapper, {
						plain: true
					})).toBeDefined();

				});

				it("rejects max aggregate when plain is true", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "highest=max:price": 0 }] }], Wrapper, {
						plain: true
					})).toBeDefined();

				});

				it("rejects sum aggregate when plain is true", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "total=sum:price": 0 }] }], Wrapper, {
						plain: true
					})).toBeDefined();

				});

				it("rejects avg aggregate when plain is true", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "average=avg:price": 0 }] }], Wrapper, {
						plain: true
					})).toBeDefined();

				});

				it("rejects chained aggregate pipe when plain is true", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "x=sum:count:price": 0 }] }], Wrapper, {
						plain: true
					})).toBeDefined();

				});

				it("accepts non-aggregate transform when plain is true", async () => {

					const Target = resource({ name: required(string()), released: optional(date()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "y=year:released": 0 }] }], Wrapper, {
						plain: true
					})).toBeUndefined();

				});

				it("accepts scalar transform pipe when plain is true", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ "r=round:price": 0 }] }], Wrapper, {
						plain: true
					})).toBeUndefined();

				});

				it("accepts plain property when plain is true", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateTemplate([{ items: [{ name: "" }] }], Wrapper, {
						plain: true
					})).toBeUndefined();

				});

				it("rejects aggregate on flat model when plain is true", async () => {

					const shape = resource({ name: required(string()), price: optional(integer()) });

					expect(validateTemplate([{ "total=count:": 0 }], shape, { depth: 0, plain: true })).toBeDefined();

				});

				it("accepts plain property on flat model when plain is true", async () => {

					const shape = resource({ name: required(string()), price: optional(integer()) });

					expect(validateTemplate([{ name: "" }], shape, { depth: 0, plain: true })).toBeUndefined();

				});

			});

			describe("operator semantics", () => {

				// operator/type compatibility must be evaluated against the effective shape
				// computed by apply(binding, shape), which accounts for transform pipelines

				const Target = resource({
					name: required(string()),
					age: optional(integer()),
					active: optional(boolean()),
					label: required(dictionary()),
					labels: nonempty(dictionary()),
					link: optional(reference(resource({ id: id(), label: required(string()) })))
				});
				const Wrapper = resource({ items: multiple(reference(Target)) });


				describe("dictionary search operator (~)", () => {

					it("accepts dictionary search on string property", async () => {
						expect(validateTemplate([{ items: [{}, { "~name": "alice" }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts dictionary search on local property", async () => {
						expect(validateTemplate([{ items: [{}, { "~label": "hello" }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts dictionary search on multi-valued localised property", async () => {
						// array-per-tag coalesces to a multi-valued string set; `~` searches it existentially
						expect(validateTemplate([{ items: [{}, { "~labels": "hello" }] }], Wrapper, {})).toBeUndefined();
					});

					it("rejects number keywords on single-valued localised property", async () => {
						expect(validateTemplate([{ items: [{}, { "~label": 42 }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects dictionary search on number property", async () => {
						expect(validateTemplate([{ items: [{}, { "~age": "42" }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects dictionary search on boolean property", async () => {
						expect(validateTemplate([{ items: [{}, { "~active": "true" }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects dictionary search on reference property", async () => {
						expect(validateTemplate([{ items: [{}, { "~link": "test" }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects dictionary search on undefined property", async () => {

						expect(unflat(validateTemplate([{ items: [{}, { "~missing": "x" }] }], Wrapper, {}))).toEqual({
							"[0]": { "items": { "~missing": "undefined property path" } }
						});
					});

					it("rejects number keywords on string property", async () => {
						expect(validateTemplate([{ items: [{}, { "~name": 42 }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects boolean keywords on string property", async () => {
						expect(validateTemplate([{ items: [{}, { "~name": true }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects null keywords on local property", async () => {
						expect(validateTemplate([{ items: [{}, { "~label": null }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects array keywords on string property", async () => {
						expect(validateTemplate([{ items: [{}, { "~name": ["a", "b"] }] }], Wrapper, {})).toBeDefined();
					});

				});

				describe("union keyword validation", () => {

					const UnionTarget = resource({
						value: required(union(string(), integer()))
					});
					const UnionWrapper = resource({ items: multiple(reference(UnionTarget)) });

					it("accepts dictionary search matching string union variant", async () => {
						expect(validateTemplate([{ items: [{}, { "~value": "hello" }] }], UnionWrapper, {})).toBeUndefined();
					});

					it("rejects dictionary search matching no textual union variant", async () => {

						const NumericUnion = resource({
							value: required(union(integer(), boolean()))
						});
						const NumericWrapper = resource({ items: multiple(reference(NumericUnion)) });

						expect(validateTemplate([{ items: [{}, { "~value": "hello" }] }], NumericWrapper, {})).toBeDefined();

					});

				});

				describe("range operators (<, >, <=, >=)", () => {

					it("accepts range operator on string property", async () => {
						expect(validateTemplate([{ items: [{}, { ">=name": "alice" }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts range operator on boolean property", async () => {
						expect(validateTemplate([{ items: [{}, { ">=active": true }] }], Wrapper, {})).toBeUndefined();
					});

					it("rejects non-boolean range bound on boolean property", async () => {
						expect(validateTemplate([{ items: [{}, { ">=active": "x" }] }], Wrapper, {})).toBeDefined();
					});

					it("accepts range operator on single-valued localised property", async () => {
						expect(validateTemplate([{ items: [{}, { ">=label": "x" }] }], Wrapper, {})).toBeUndefined();
					});

					it("rejects non-string range bound on single-valued localised property", async () => {
						expect(validateTemplate([{ items: [{}, { ">=label": 42 }] }], Wrapper, {})).toBeDefined();
					});

					it("accepts range operator on multi-valued localised property", async () => {
						// array-per-tag coalesces to a multi-valued string set; the bound filters it existentially
						expect(validateTemplate([{ items: [{}, { ">=labels": "x" }] }], Wrapper, {})).toBeUndefined();
					});

					// a transform pipe over a single-string-per-tag localised property is coalesced
					// access, so the bound is checked against the pipe's effective type

					it("accepts numeric bound on length-piped coalesced localised key", async () => {
						expect(validateTemplate([{ items: [{}, { "<=length:label": 5 }] }], Wrapper, {})).toBeUndefined();
					});

					it("rejects string bound on length-piped coalesced localised key", async () => {
						expect(validateTemplate([{ items: [{}, { "<=length:label": "x" }] }], Wrapper, {})).toBeDefined();
					});

					it("accepts string bound on lower-piped coalesced localised key", async () => {
						expect(validateTemplate([{ items: [{}, { ">=lower:label": "x" }] }], Wrapper, {})).toBeUndefined();
					});

					it("rejects numeric bound on lower-piped coalesced localised key", async () => {
						expect(validateTemplate([{ items: [{}, { ">=lower:label": 42 }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects range operator on reference property", async () => {
						expect(validateTemplate([{ items: [{}, { ">=link": "x" }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects range operator on undefined property", async () => {

						expect(unflat(validateTemplate([{ items: [{}, { ">=missing": 0 }] }], Wrapper, {}))).toEqual({
							"[0]": { "items": { ">=missing": "undefined property path" } }
						});
					});

					it.each([
						["<", "<age"],
						[">", ">age"],
						["<=", "<=age"],
						[">=", ">=age"]
					])("accepts %s operator on number property", async (_op, key) => {
						expect(validateTemplate([{ items: [{}, { [key]: 18 }] }], Wrapper, {})).toBeUndefined();
					});

					it("rejects string limit on number property", async () => {
						expect(validateTemplate([{ items: [{}, { ">=age": "alice" }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects number limit on string property", async () => {
						expect(validateTemplate([{ items: [{}, { ">=name": 42 }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects boolean limit on number property", async () => {
						expect(validateTemplate([{ items: [{}, { ">=age": true }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects null limit on string property", async () => {
						expect(validateTemplate([{ items: [{}, { ">=name": null }] }], Wrapper, {})).toBeDefined();
					});

				});

				describe("union limit validation", () => {

					const UnionTarget = resource({
						value: required(union(string(), integer()))
					});
					const UnionWrapper = resource({ items: multiple(reference(UnionTarget)) });

					it("accepts range limit matching first union variant", async () => {
						expect(validateTemplate([{ items: [{}, { ">=value": "hello" }] }], UnionWrapper, {})).toBeUndefined();
					});

					it("accepts range limit matching second union variant", async () => {
						expect(validateTemplate([{ items: [{}, { ">=value": 42 }] }], UnionWrapper, {})).toBeUndefined();
					});

					it("rejects range limit matching no union variant", async () => {
						expect(validateTemplate([{ items: [{}, { ">=value": true }] }], UnionWrapper, {})).toBeDefined();
					});

					it.each([
						["<", "<value"],
						[">", ">value"],
						["<=", "<=value"],
						[">=", ">=value"]
					])("accepts %s operator on union property with matching variant", async (_op, key) => {
						expect(validateTemplate([{ items: [{}, { [key]: 42 }] }], UnionWrapper, {})).toBeUndefined();
					});

				});

				describe("union option validation", () => {

					// per-branch admissibility: each option independently matches at least one declared
					// variant, so a mixed-type set may select different branches per option; a null
					// option is typeless and exempt

					const UnionTarget = resource({
						value: required(union(string(), integer()))
					});
					const UnionWrapper = resource({ items: multiple(reference(UnionTarget)) });

					it("accepts single option matching a union variant", async () => {
						expect(validateTemplate([{ items: [{}, { "?value": 42 }] }], UnionWrapper, {})).toBeUndefined();
					});

					it("accepts mixed-type option set with every option matching a variant", async () => {
						expect(validateTemplate([{ items: [{}, { "?value": [42, "hello"] }] }], UnionWrapper, {})).toBeUndefined();
					});

					it("accepts conjunctive mixed-type option set with every option matching a variant", async () => {
						expect(validateTemplate([{ items: [{}, { "!value": ["hello", 42] }] }], UnionWrapper, {})).toBeUndefined();
					});

					it("accepts null option beside a matching option", async () => {
						expect(validateTemplate([{ items: [{}, { "?value": [null, 42] }] }], UnionWrapper, {})).toBeUndefined();
					});

					it("accepts focus with mixed-type option set on single-valued union property", async () => {
						expect(validateTemplate([{ items: [{}, { "+value": [42, "hello"] }] }], UnionWrapper, {})).toBeUndefined();
					});

					it("rejects single option matching no union variant", async () => {
						expect(validateTemplate([{ items: [{}, { "?value": true }] }], UnionWrapper, {})).toBeDefined();
					});

					it("rejects only the options matching no union variant", async () => {

						expect(unflat(validateTemplate([{ items: [{}, { "?value": [42, true] }] }], UnionWrapper, {}))).toEqual({
							"[0]": { "items": { "?value": { "[1]": "no union variant matched" } } }
						});

					});

				});

				describe("deep localised keys", () => {

					// a coalescible leaf behind a multi-valued prefix keeps its plain-string forms for both
					// cardinalities (matching and filtering are cardinality-agnostic), but the localised step
					// enters the path product, so the prefix fan-out makes the deep key multi-valued and the
					// sort/focus single-valued gates reject it (closes #26)

					const Product = resource({
						label: required(dictionary()),
						labels: nonempty(dictionary())
					});
					const Vendor = resource({ products: multiple(reference(Product)) });
					const DeepWrapper = resource({ items: multiple(reference(Vendor)) });

					it("accepts dictionary search on coalescible leaf behind multi-valued prefix", async () => {
						expect(validateTemplate([{ items: [{}, { "~products.label": "widget" }] }], DeepWrapper, {})).toBeUndefined();
					});

					it("accepts plain-string option on coalescible leaf behind multi-valued prefix", async () => {
						expect(validateTemplate([{ items: [{}, { "?products.label": "x" }] }], DeepWrapper, {})).toBeUndefined();
					});

					it("accepts string bound on coalescible leaf behind multi-valued prefix", async () => {
						expect(validateTemplate([{ items: [{}, { ">=products.label": "x" }] }], DeepWrapper, {})).toBeUndefined();
					});

					it("accepts plain-string form on array-per-tag leaf behind multi-valued prefix", async () => {
						// array-per-tag now coalesces existentially, the same as a single-string-per-tag leaf
						expect(validateTemplate([{ items: [{}, { "~products.labels": "x" }] }], DeepWrapper, {})).toBeUndefined();
					});

					it("rejects sort on coalescible leaf behind multi-valued prefix", async () => {
						// the prefix fan-out makes the key multi-valued, so the single-valued sort gate rejects it
						expect(validateTemplate([{ items: [{}, { "^products.label": "asc" }] }], DeepWrapper, {})).toBeDefined();
					});

					it("rejects focus on coalescible leaf behind multi-valued prefix", async () => {
						expect(validateTemplate([{ items: [{}, { "+products.label": "x" }] }], DeepWrapper, {})).toBeDefined();
					});

					it("accepts aggregate-reduced sort on coalescible leaf behind multi-valued prefix", async () => {
						// reducing through min/max collapses the fan-out to one value per resource
						expect(validateTemplate([{ items: [{}, { "^min:products.label": "asc" }] }], DeepWrapper, {})).toBeUndefined();
					});

				});

				describe("disjunctive/conjunctive operators (?, !)", () => {

					// single option values

					it("accepts disjunctive filter on string property", async () => {
						expect(validateTemplate([{ items: [{}, { "?name": "alice" }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts disjunctive filter on number property", async () => {
						expect(validateTemplate([{ items: [{}, { "?age": 18 }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts disjunctive filter on boolean property", async () => {
						expect(validateTemplate([{ items: [{}, { "?active": true }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts conjunctive filter on string property", async () => {
						expect(validateTemplate([{ items: [{}, { "!name": "alice" }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts conjunctive filter on number property", async () => {
						expect(validateTemplate([{ items: [{}, { "!age": 18 }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts conjunctive filter on boolean property", async () => {
						expect(validateTemplate([{ items: [{}, { "!active": true }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts null option on any property", async () => {
						expect(validateTemplate([{ items: [{}, { "?name": null }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts reference option on reference property", async () => {
						expect(validateTemplate([{ items: [{}, { "?link": "app:/items/1" }] }], Wrapper, {})).toBeUndefined();
					});

					// array of options

					it("accepts array of options on string property", async () => {
						expect(validateTemplate([{ items: [{}, { "?name": ["alice", "bob"] }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts array of options on number property", async () => {
						expect(validateTemplate([{ items: [{}, { "?age": [18, 25] }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts array with null option", async () => {
						expect(validateTemplate([{ items: [{}, { "?name": ["alice", null] }] }], Wrapper, {})).toBeUndefined();
					});

					// localised options — the tagged-map form is legal for both arms (structural,
					// tagged-value equality); coalescing makes plain-string options (single or array) legal
					// against either cardinality, matched existentially over the coalesced value set

					it("accepts tag-map option on localised property", async () => {
						expect(validateTemplate([{ items: [{}, { "?label": { "en": "hello" } }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts string-array-per-tag option on localised property", async () => {
						expect(validateTemplate([{ items: [{}, { "?labels": { "en": ["hello"] } }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts null option on localised property", async () => {
						expect(validateTemplate([{ items: [{}, { "?label": null }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts coalesced bare string option on single-valued localised property", async () => {
						expect(validateTemplate([{ items: [{}, { "?label": "hello" }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts coalesced string-array option on single-valued localised property", async () => {
						expect(validateTemplate([{ items: [{}, { "?label": ["hello", "world"] }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts bare string option on multi-valued localised property", async () => {
						// array-per-tag coalesces, so a plain-string option matches its coalesced set existentially
						expect(validateTemplate([{ items: [{}, { "?labels": "hello" }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts string-array option on multi-valued localised property", async () => {
						expect(validateTemplate([{ items: [{}, { "?labels": ["hello", "world"] }] }], Wrapper, {})).toBeUndefined();
					});

					it("rejects tag-map-array option on localised property", async () => {
						expect(validateTemplate([{ items: [{}, { "?label": [{ "en": "hello" }, { "en": "world" }] }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects option set mixing plain and tagged options on localised property", async () => {
						expect(validateTemplate([{ items: [{}, { "?label": ["hello", { "en": "world" }] }] }], Wrapper, {})).toBeDefined();
					});

					// type mismatch rejections

					it("rejects string option on number property", async () => {
						expect(validateTemplate([{ items: [{}, { "?age": "alice" }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects number option on string property", async () => {
						expect(validateTemplate([{ items: [{}, { "?name": 42 }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects boolean option on number property", async () => {
						expect(validateTemplate([{ items: [{}, { "?age": true }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects array with mismatched option on number property", async () => {
						expect(validateTemplate([{ items: [{}, { "?age": [18, "wrong"] }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects number option on local property", async () => {
						expect(validateTemplate([{ items: [{}, { "?label": 42 }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects number option on localised property", async () => {
						expect(validateTemplate([{ items: [{}, { "?labels": 42 }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects non-IRI string option on reference property", async () => {
						expect(validateTemplate([{ items: [{}, { "?link": "not-an-iri" }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects conjunctive string option on number property", async () => {
						expect(validateTemplate([{ items: [{}, { "!age": "alice" }] }], Wrapper, {})).toBeDefined();
					});

					// undefined property

					it("rejects option on undefined property", async () => {

						expect(unflat(validateTemplate([{ items: [{}, { "?missing": "x" }] }], Wrapper, {}))).toEqual({
							"[0]": { "items": { "?missing": "undefined property path" } }
						});
					});

				});

				describe("focus operator (+)", () => {

					it("accepts focus on string property", async () => {
						expect(validateTemplate([{ items: [{}, { "+name": ["alice"] }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts focus on number property", async () => {
						expect(validateTemplate([{ items: [{}, { "+age": [18] }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts focus on boolean property", async () => {
						expect(validateTemplate([{ items: [{}, { "+active": [true] }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts focus with null option", async () => {
						expect(validateTemplate([{ items: [{}, { "+name": [null, "alice"] }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts focus with reference option on reference property", async () => {
						expect(validateTemplate([{ items: [{}, { "+link": "app:/items/1" }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts focus with tag-map option on localised property", async () => {
						expect(validateTemplate([{ items: [{}, { "+label": { "en": "hello" } }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts focus with coalesced bare string option on single-valued localised property", async () => {
						expect(validateTemplate([{ items: [{}, { "+label": "hello" }] }], Wrapper, {})).toBeUndefined();
					});

					it("rejects focus on a multi-valued property", async () => {
						const T = resource({ tags: nonempty(string()) });
						const W = resource({ items: multiple(reference(T)) });
						expect(validateTemplate([{ items: [{}, { "+tags": ["x"] }] }], W, {})).toBeDefined();
					});

					it("rejects focus on a multi-valued localised property", async () => {
						expect(validateTemplate([{ items: [{}, { "+labels": { en: "x" } }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects focus with string option on number property", async () => {
						expect(validateTemplate([{ items: [{}, { "+age": "alice" }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects focus with number option on string property", async () => {
						expect(validateTemplate([{ items: [{}, { "+name": 42 }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects focus with non-IRI string on reference property", async () => {
						expect(validateTemplate([{ items: [{}, { "+link": "not-an-iri" }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects focus with mismatched array element on number property", async () => {
						expect(validateTemplate([{ items: [{}, { "+age": [18, "wrong"] }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects focus on undefined property", async () => {
						expect(unflat(validateTemplate([{ items: [{}, { "+missing": "x" }] }], Wrapper, {}))).toEqual({
							"[0]": { "items": { "+missing": "undefined property path" } }
						});
					});

				});

				describe("union option validation", () => {

					const UnionTarget = resource({
						value: required(union(string(), integer())),
						link: optional(reference(resource({ id: id() })))
					});
					const UnionWrapper = resource({ items: multiple(reference(UnionTarget)) });

					// disjunctive filter

					it("accepts disjunctive filter matching first union variant", async () => {
						expect(validateTemplate([{ items: [{}, { "?value": "hello" }] }], UnionWrapper, {})).toBeUndefined();
					});

					it("accepts disjunctive filter matching second union variant", async () => {
						expect(validateTemplate([{ items: [{}, { "?value": 42 }] }], UnionWrapper, {})).toBeUndefined();
					});

					it("accepts null option on union property", async () => {
						expect(validateTemplate([{ items: [{}, { "?value": null }] }], UnionWrapper, {})).toBeUndefined();
					});

					it("rejects option matching no union variant", async () => {
						expect(validateTemplate([{ items: [{}, { "?value": true }] }], UnionWrapper, {})).toBeDefined();
					});

					// conjunctive filter

					it("accepts conjunctive filter matching one union variant", async () => {
						expect(validateTemplate([{ items: [{}, { "!value": "hello" }] }], UnionWrapper, {})).toBeUndefined();
					});

					it("rejects conjunctive filter matching no union variant", async () => {
						expect(validateTemplate([{ items: [{}, { "!value": true }] }], UnionWrapper, {})).toBeDefined();
					});

					// focus operator

					it("accepts focus option matching one union variant", async () => {
						expect(validateTemplate([{ items: [{}, { "+value": ["hello"] }] }], UnionWrapper, {})).toBeUndefined();
						expect(validateTemplate([{ items: [{}, { "+value": [42] }] }], UnionWrapper, {})).toBeUndefined();
					});

					it("rejects focus option matching no union variant", async () => {
						expect(validateTemplate([{ items: [{}, { "+value": [true] }] }], UnionWrapper, {})).toBeDefined();
					});

					// array of options

					it("accepts array of options matching same union variant", async () => {
						expect(validateTemplate([{ items: [{}, { "?value": ["hello", "world"] }] }], UnionWrapper, {})).toBeUndefined();
					});

					it("accepts array of options matching different union variants", async () => {
						expect(validateTemplate([{ items: [{}, { "?value": ["hello", 42] }] }], UnionWrapper, {})).toBeUndefined();
					});

					it("rejects array with option matching no union variant", async () => {
						expect(validateTemplate([{ items: [{}, { "?value": ["hello", true] }] }], UnionWrapper, {})).toBeDefined();
					});

				});

				describe("sort operator (^)", () => {

					it("accepts 'asc' sort value", async () => {
						expect(validateTemplate([{ items: [{}, { "^name": "asc" }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts 'desc' sort value", async () => {
						expect(validateTemplate([{ items: [{}, { "^name": "desc" }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts positive number sort value", async () => {
						expect(validateTemplate([{ items: [{}, { "^name": 1 }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts negative number sort value", async () => {
						expect(validateTemplate([{ items: [{}, { "^name": -1 }] }], Wrapper, {})).toBeUndefined();
					});

					it("accepts zero sort value", async () => {
						expect(validateTemplate([{ items: [{}, { "^name": 0 }] }], Wrapper, {})).toBeUndefined();
					});

					it("rejects boolean sort value", async () => {
						expect(validateTemplate([{ items: [{}, { "^name": true }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects null sort value", async () => {
						expect(validateTemplate([{ items: [{}, { "^name": null }] }], Wrapper, {})).toBeDefined();
					});

					it("rejects arbitrary string sort value", async () => {
						expect(validateTemplate([{ items: [{}, { "^name": "ascending" }] }], Wrapper, {})).toBeDefined();
					});

					it("accepts sort on number property", async () => {
						expect(validateTemplate([{ items: [{}, { "^age": "asc" }] }], Wrapper, {})).toBeUndefined();
					});

					it("rejects sort on undefined property", async () => {
						expect(unflat(validateTemplate([{ items: [{}, { "^missing": "asc" }] }], Wrapper, {}))).toEqual({
							"[0]": { "items": { "^missing": "undefined property path" } }
						});
					});

				});

				describe("effective shape with transforms", () => {

					it("accepts range operator on transform-derived number", async () => {

						// year transform on year property → effective kind is "number"

						const T = resource({ released: optional(date()) });
						const W = resource({ items: multiple(reference(T)) });

						expect(validateTemplate([{ items: [{}, { ">=year:released": 2020 }] }], W, {})).toBeUndefined();
					});

					it("rejects dictionary search on transform-derived number", async () => {

						// count transform → effective kind is "number"

						const T = resource({ name: required(string()), price: optional(integer()) });
						const W = resource({ items: multiple(reference(T)) });

						expect(validateTemplate([{ items: [{}, { "~count:price": "x" }] }], W, {})).toBeDefined();
					});

					it("accepts dictionary search on transform-preserving string", async () => {

						// lower transform on string → effective kind is "string"

						const T = resource({ name: required(string()) });
						const W = resource({ items: multiple(reference(T)) });

						expect(validateTemplate([{ items: [{}, { "~lower:name": "alice" }] }], W, {})).toBeUndefined();
					});

					it("reports incompatible transform input when operator transform resolves out of domain", async () => {

						// floor (scalar, numeric domain) on a string property → out of domain → no variant
						// survives → the operator is reported

						const T = resource({ name: required(string()) });
						const W = resource({ items: multiple(reference(T)) });

						expect(unflat(validateTemplate([{ items: [{}, { "~floor:name": "x" }] }], W, {}))).toEqual({
							"[0]": { "items": { "~floor:name": "incompatible transform input" } }
						});
					});

				});

			});

		});

		describe("collection-level keying", () => {

			// nested model validation uses validateNested → validateModel which validates
			// type guards (e.g., boolean instead of string) and cardinality, not value constraints

			const Target = resource({
				id: id(),
				name: required(string())
			});

			const TargetWithoutId = resource({
				name: required(string())
			});


			it("preserves flat trace for single nested model", async () => {

				// single nested value: no per-resource wrapping

				const shape = resource({
					items: multiple(reference(Target))
				});

				const trace = validateTemplate([{ items: [{ name: 42 }] } as any], shape, {});

				expect(trace).toHaveProperty([0, "0", 0, "items"]);

				const items = (rec(trace, "0"))["items"];

				expect(rec(items)).toHaveProperty("name");
				expect(items).not.toHaveProperty([0, "0"]);

			});

			it("keys violations by @id for single nested model", async () => {

				const shape = resource({
					items: multiple(reference(Target))
				});

				const trace = validateTemplate([{
					items: [
						{ "id": "app:/items/1", name: 42 }
					]
				} as any], shape, {});

				expect(trace).toHaveProperty([0, "0", 0, "items"]);

				const items = (rec(trace, "0"))["items"];

				expect(rec(items)).toHaveProperty("name");

			});

			it("keys violations by blank node for single nested model without id property", async () => {

				const shape = resource({
					items: multiple(reference(TargetWithoutId))
				});

				const trace = validateTemplate([{
					items: [
						{ name: 42 }
					]
				} as any], shape, {});

				expect(trace).toHaveProperty([0, "0", 0, "items"]);

				const items = (rec(trace, "0"))["items"];

				expect(rec(items)).toHaveProperty("name");

			});

			it("includes only invalid nested models in trace", async () => {

				const shape = resource({
					items: multiple(reference(Target))
				});

				const trace = validateTemplate([{
					items: [
						{ "id": "app:/items/2", name: 42 }
					]
				} as any], shape, {});

				expect(trace).toHaveProperty([0, "0", 0, "items"]);

				const items = (rec(trace, "0"))["items"];

				expect(rec(items)).toHaveProperty("name");

			});

			it("returns undefined when all nested models are valid", async () => {

				const shape = resource({
					items: multiple(reference(Target))
				});

				expect(validateTemplate([{
					items: [
						{ "id": "app:/items/1", name: "Alice" }
					] as any
				}], shape, {})).toBeUndefined();

			});

		});

	});

});
