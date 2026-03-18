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

import { asTag } from "@metreeca/core/language";
import { createNamespace } from "@metreeca/core/resource";
import { describe, expect, it } from "vitest";
import { boolean } from "./boolean.js";
import { TraceError } from "./core/trace.js";
import { type Trace, type Validator } from "./index.js";
import { local, locals } from "./local.js";
import { integer } from "./number.js";
import {
	checkParents,
	checkPredicates,
	checkRange,
	checkResource,
	checkSingletons,
	flatten,
	match,
	mergeProperty,
	mergeRange,
	mergeReference,
	mergeResource,
	mergeUnion,
	validateEntry,
	validateModel,
	validateReference,
	validateResource
} from "./resource.core.js";
import {
	foreign,
	cardinality,
	id,
	multiple,
	optional,
	property,
	type Property,
	type Range,
	reference,
	repeatable,
	required,
	resource,
	type ResourceShape,
	type,
	union,
	type UnionShape
} from "./resource.js";
import { string, year } from "./string.js";


describe("factories", () => {

	describe("resource", () => {

		describe("naked ranges", () => {

			it("normalizes single naked range to Property with Range range", async () => {

				const shape = resource({
					name: required(string())
				});

				expect(shape.properties.name).toBeDefined();
				expect((shape.properties.name as Property).range.kind).toBe("range");
				expect(((shape.properties.name as Property).range as Range).shape.kind).toBe("string");

			});

			it("normalizes naked range with union shape to Property", async () => {

				const shape = resource({
					value: optional(union({ string: string(), number: integer() }))
				});

				expect(shape.properties.value).toBeDefined();
				expect((shape.properties.value as Property).range.kind).toBe("range");

				const rangeShape = ((shape.properties.value as Property).range as Range).shape;
				expect(rangeShape.kind).toBe("union");
				expect((rangeShape as UnionShape).variants.string.kind).toBe("string");
				expect((rangeShape as UnionShape).variants.number.kind).toBe("number");

			});

			it("preserves explicit property with naked range", async () => {

				const shape = resource({
					name: property(required(string())),
					age: optional(integer())
				});

				expect(((shape.properties.name as Property).range as Range).shape.kind).toBe("string");
				expect(((shape.properties.age as Property).range as Range).shape.kind).toBe("number");

			});

			it("normalizes naked ranges with constraints", async () => {

				const shape = resource({
					namespace: createNamespace("http://example.org/")
				}, {
					name: required(string())
				});

				expect(shape.properties.name).toBeDefined();
				expect((shape.properties.name as Property).range.kind).toBe("range");
				expect(((shape.properties.name as Property).range as Range).shape.kind).toBe("string");

			});

		});

		describe("lazy factory", () => {

			it("materialises a lazy factory and returns a validated shape", async () => {

				const shape = resource(() => resource({
					name: required(string())
				}));

				expect(shape.kind).toBe("resource");
				expect(shape.properties.name).toBeDefined();

			});

			it("returns the same shape when called with a direct resource shape", async () => {

				const direct = resource({
					name: required(string())
				});

				const lazy = resource(direct);

				expect(lazy).toBe(direct);

			});

			it("caches factory results for idempotent materialisation", async () => {

				const factory = () => resource({
					name: required(string())
				});

				const first = resource(factory);
				const second = resource(factory);

				expect(first).toBe(second);

			});

			it("flattens inherited constraints from a lazy factory", async () => {

				const Parent = resource({
					name: required(string())
				});

				const Child = resource(() => resource({ extends: Parent }, {
					age: optional(integer())
				}));

				expect(Child.properties.name).toBeDefined();
				expect(Child.properties.age).toBeDefined();

			});

		});

		describe("properties only", () => {

			it("returns a shape with kind 'resource'", async () => {

				const shape = resource({
					name: property(required(string()))
				});

				expect(shape.kind).toBe("resource");

			});

			it("returns an immutable shape", async () => {

				const shape = resource({
					name: property(required(string()))
				});

				expect(() => {
					(shape as any).kind = "string";
				}).toThrow();

			});

			it("includes properties in the shape", async () => {

				const shape = resource({
					name: property(required(string())),
					age: property(optional(integer()))
				});

				expect(shape.properties).toBeDefined();
				expect(shape.properties.name).toBeDefined();
				expect(shape.properties.age).toBeDefined();

			});

		});

		describe("with specs", () => {

			it("accepts specs and properties", async () => {

				const shape = resource({}, {
					name: property(required(string()))
				});

				expect(shape.kind).toBe("resource");
				expect(shape.properties.name).toBeDefined();

			});

		});

		describe("from shape", () => {

			it("returns a resource shape with kind 'resource'", async () => {

				const original = resource({
					name: property(required(string()))
				});

				const reprocessed = resource(original);

				expect(reprocessed.kind).toBe("resource");

			});

			it("preserves properties from the original shape", async () => {

				const original = resource({
					name: property(required(string())),
					age: property(optional(integer()))
				});

				const reprocessed = resource(original);

				expect(reprocessed.properties.name).toBeDefined();
				expect(reprocessed.properties.age).toBeDefined();

			});

			it("resolves namespace from the original shape", async () => {

				const ns = createNamespace("http://example.org/");

				const original = resource({ namespace: ns }, {
					name: required(string())
				});

				const reprocessed = resource(original);

				expect((reprocessed.properties.name as Property).forward).toBe("http://example.org/name");

			});

			it("preserves constraints from the original shape", async () => {

				const ns = createNamespace("http://example.org/");

				const original = resource({ namespace: ns }, {
					name: required(string())
				});

				const reprocessed = resource(original);

				expect(reprocessed.namespace).toBe(ns);

			});

			it("returns an immutable shape", async () => {

				const original = resource({
					name: property(required(string()))
				});

				const reprocessed = resource(original);

				expect(() => {
					(reprocessed as any).kind = "string";
				}).toThrow();

			});

			it("rebuilds the model from properties", async () => {

				const original = resource({
					name: required(string()),
					age: optional(integer())
				});

				const reprocessed = resource(original);

				expect(reprocessed.model).toBeDefined();
				expect(reprocessed.model).toHaveProperty("name");
				expect(reprocessed.model).toHaveProperty("age");

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
					extends: Parent,
					properties: {
						age: property(optional(integer()))
					}
				} as ResourceShape;

				const Outer = resource({
					person: required(Unflattened)
				});

				const nested = ((Outer.properties.person as Property).range as Range).shape as ResourceShape;

				expect(nested.properties.name).toBeDefined();
				expect(nested.properties.age).toBeDefined();

			});

			it("flattens an unflattened ResourceShape variant inside a union", async () => {

				const Parent = resource({
					name: required(string())
				});

				const Unflattened = {
					kind: "resource",
					model: {},
					extends: Parent,
					properties: {
						age: property(optional(integer()))
					}
				} as ResourceShape;

				const Outer = resource({
					contact: required(union({ person: Unflattened, org: string() }))
				});

				const range = (Outer.properties.contact as Property).range as Range;
				const variants = (range.shape as UnionShape).variants;
				const nested = variants.person as ResourceShape;

				expect(nested.properties.name).toBeDefined();
				expect(nested.properties.age).toBeDefined();

			});

			it("flattens the target ResourceShape inside a ReferenceShape", async () => {

				const Parent = resource({
					name: required(string())
				});

				const Unflattened = {
					kind: "resource",
					model: {},
					extends: Parent,
					properties: {
						age: property(optional(integer()))
					}
				} as ResourceShape;

				const Outer = resource({
					ref: required(reference(() => Unflattened))
				});

				const ref = ((Outer.properties.ref as Property).range as Range).shape;

				expect(ref.kind).toBe("reference");

				const target = resource((ref as { shape: () => ResourceShape }).shape);

				expect(target.properties.name).toBeDefined();
				expect(target.properties.age).toBeDefined();

			});

			it("flattens nested ResourceShape with constraints overload", async () => {

				const Parent = resource({
					name: required(string())
				});

				const Unflattened = {
					kind: "resource",
					model: {},
					extends: Parent,
					properties: {
						age: property(optional(integer()))
					}
				} as ResourceShape;

				const ns = createNamespace("http://example.org/");

				const Outer = resource({ namespace: ns }, {
					person: required(Unflattened)
				});

				const nested = ((Outer.properties.person as Property).range as Range).shape as ResourceShape;

				expect(nested.properties.name).toBeDefined();
				expect(nested.properties.age).toBeDefined();

			});

			it("flattens nested ResourceShape with shape overload", async () => {

				const Parent = resource({
					name: required(string())
				});

				const Unflattened = {
					kind: "resource",
					model: {},
					extends: Parent,
					properties: {
						age: property(optional(integer()))
					}
				} as ResourceShape;

				const manual = resource({
					person: required(Unflattened)
				});

				const reprocessed = resource(manual);

				const nested = ((reprocessed.properties.person as Property).range as Range).shape as ResourceShape;

				expect(nested.properties.name).toBeDefined();
				expect(nested.properties.age).toBeDefined();

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

				const ref = ((shape.properties.person as Property).range as Range).shape;

				expect(ref.kind).toBe("reference");

			});

		});

		describe("namespace resolution", () => {

			it("resolves namespace function for forward using property name", async () => {

				const rdfs = createNamespace("http://www.w3.org/2000/01/rdf-schema#");

				const shape = resource({
					label: property({ forward: rdfs }, required(string()))
				});

				expect((shape.properties.label as Property).forward).toBe("http://www.w3.org/2000/01/rdf-schema#label");

			});

			it("resolves namespace function for reverse using property name", async () => {

				const ex = createNamespace("http://example.org/");

				const shape = resource({
					owner: property({ reverse: ex }, required(string()))
				});

				expect((shape.properties.owner as Property).reverse).toBe("http://example.org/owner");

			});

			it("keeps IRI forward as-is", async () => {

				const shape = resource({
					name: property({ forward: "http://example.org/name" }, required(string()))
				});

				expect((shape.properties.name as Property).forward).toBe("http://example.org/name");

			});

			it("keeps IRI reverse as-is", async () => {

				const shape = resource({
					owner: property({ reverse: "http://example.org/owner" }, required(string()))
				});

				expect((shape.properties.owner as Property).reverse).toBe("http://example.org/owner");

			});

			describe("default forward resolution", () => {

				it("uses app namespace when no namespace is defined (properties only)", async () => {

					const shape = resource({
						name: required(string())
					});

					expect((shape.properties.name as Property).forward).toBe("app:/#name");
					expect((shape.properties.name as Property).reverse).toBeUndefined();

				});

				it("uses app namespace when no namespace is defined (with empty constraints)", async () => {

					const shape = resource({}, {
						name: required(string())
					});

					expect((shape.properties.name as Property).forward).toBe("app:/#name");
					expect((shape.properties.name as Property).reverse).toBeUndefined();

				});

				it("uses shape namespace when defined", async () => {

					const ns = createNamespace("http://example.org/");

					const shape = resource({ namespace: ns }, {
						name: required(string())
					});

					expect((shape.properties.name as Property).forward).toBe("http://example.org/name");
					expect((shape.properties.name as Property).reverse).toBeUndefined();

				});

				it("uses inherited namespace from single parent", async () => {

					const ns = createNamespace("http://example.org/");

					const Parent = resource({ namespace: ns }, {
						id: required(string())
					});

					const Child = resource({ extends: Parent }, {
						name: required(string())
					});

					expect((Child.properties.name as Property).forward).toBe("http://example.org/name");
					expect((Child.properties.name as Property).reverse).toBeUndefined();

				});

				it("uses common inherited namespace from multiple parents", async () => {

					const ns = createNamespace("http://example.org/");

					const Parent1 = resource({ namespace: ns }, {
						id: required(string())
					});

					const Parent2 = resource({ namespace: ns }, {
						code: required(string())
					});

					const Child = resource({ extends: [Parent1, Parent2] }, {
						name: required(string())
					});

					expect((Child.properties.name as Property).forward).toBe("http://example.org/name");
					expect((Child.properties.name as Property).reverse).toBeUndefined();

				});

				it("uses app namespace when parents have no namespace", async () => {

					const Parent = resource({
						id: required(string())
					});

					const Child = resource({ extends: Parent }, {
						name: required(string())
					});

					expect((Child.properties.name as Property).forward).toBe("app:/#name");
					expect((Child.properties.name as Property).reverse).toBeUndefined();

				});

				it("does not generate default forward when reverse is explicitly defined", async () => {

					const shape = resource({
						owner: property({ reverse: "http://example.org/owns" }, required(string()))
					});

					expect((shape.properties.owner as Property).forward).toBeUndefined();
					expect((shape.properties.owner as Property).reverse).toBe("http://example.org/owns");

				});

				it("does not override explicit forward", async () => {

					const ns = createNamespace("http://schema.org/");

					const shape = resource({ namespace: ns }, {
						name: property({ forward: "http://custom.org/name" }, required(string()))
					});

					expect((shape.properties.name as Property).forward).toBe("http://custom.org/name");

				});

				it("resolves multiple properties with default forward", async () => {

					const ns = createNamespace("http://example.org/");

					const shape = resource({ namespace: ns }, {
						name: required(string()),
						age: optional(integer()),
						email: required(string())
					});

					expect((shape.properties.name as Property).forward).toBe("http://example.org/name");
					expect((shape.properties.age as Property).forward).toBe("http://example.org/age");
					expect((shape.properties.email as Property).forward).toBe("http://example.org/email");

				});

			});

		});

		describe("structural integrity", () => {

			it("includes provided specs", async () => {

				const Base = resource({
					name: property(required(string()))
				});

				const shape = resource({
					name: { [asTag("en")]: "Person" },
					description: { [asTag("en")]: "A person resource" },
					extends: Base
				}, {
					age: property(optional(integer()))
				});

				expect(shape).toMatchObject({
					kind: "resource",
					name: { [asTag("en")]: "Person" },
					description: { [asTag("en")]: "A person resource" },
					extends: Base
				});

			});

			it("includes only provided properties", async () => {

				const shape = resource({
					name: property(required(string()))
				});

				expect(shape).toMatchObject({ kind: "resource", properties: { name: expect.anything() } });

			});

		});

		describe("type conformance", () => {

			it("accepts string name shorthand", async () => {

				expect(() => resource({ name: "Person" } as any, {
					name: property(required(string()))
				})).not.toThrow();

			});

			it("accepts string description shorthand", async () => {

				expect(() => resource({ description: "A person" } as any, {
					name: property(required(string()))
				})).not.toThrow();

			});

			it("throws on non-function namespace", async () => {

				// namespace validation is manual (typia can't validate function signatures)
				expect(() => resource({ namespace: "http://example.org/" } as any, {
					name: property(required(string()))
				})).toThrow(TypeError);

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
				})).toThrow(TraceError);

			});

			it("throws on inherited duplicate id entries", async () => {

				const Parent = resource({
					rid: id(),
					name: required(string())
				});

				expect(() => resource({ extends: Parent }, {
					rid: id()
				})).toThrow(TraceError);

			});

			it("throws on inherited duplicate type entries", async () => {

				const Parent = resource({
					rtype: type(),
					name: required(string())
				});

				expect(() => resource({ extends: Parent }, {
					rtype: type()
				})).toThrow(TraceError);

			});

			it("throws on deeply inherited duplicate id entries", async () => {

				const GrandParent = resource({
					rid: id(),
					name: required(string())
				});

				const Parent = resource({ extends: GrandParent }, {
					age: required(integer())
				});

				expect(() => resource({ extends: Parent }, {
					rid: id()
				})).toThrow(TraceError);

			});

			it("throws on deeply inherited duplicate type entries", async () => {

				const GrandParent = resource({
					rtype: type(),
					name: required(string())
				});

				const Parent = resource({ extends: GrandParent }, {
					age: required(integer())
				});

				expect(() => resource({ extends: Parent }, {
					rtype: type()
				})).toThrow(TraceError);

			});

			it("accepts inherited id when child has none", async () => {

				const Parent = resource({
					rid: id(),
					name: required(string())
				});

				expect(() => resource({ extends: Parent }, {
					age: required(integer())
				})).not.toThrow();

			});

			it("accepts inherited type when child has none", async () => {

				const Parent = resource({
					rtype: type(),
					name: required(string())
				});

				expect(() => resource({ extends: Parent }, {
					age: required(integer())
				})).not.toThrow();

			});

			it("throws on invalid property (properties only)", async () => {

				expect(() => resource({
					name: "not-a-property" as any
				})).toThrow(TypeError);

			});

			it("throws on invalid property (with options)", async () => {

				expect(() => resource({}, {
					name: { invalid: "structure" } as any
				})).toThrow(TypeError);

			});

		});

		describe("multiple inheritance namespace validation", () => {

			it("accepts multiple parents with no namespace defined", async () => {

				const Parent1 = resource({
					name: property(required(string()))
				});

				const Parent2 = resource({
					age: property(optional(integer()))
				});

				expect(() => resource({ extends: [Parent1, Parent2] }, {
					email: property(required(string()))
				})).not.toThrow();

			});

			it("accepts multiple parents with the same namespace", async () => {

				const ns = createNamespace("http://example.org/");

				const Parent1 = resource({ namespace: ns }, {
					name: property(required(string()))
				});

				const Parent2 = resource({ namespace: ns }, {
					age: property(optional(integer()))
				});

				expect(() => resource({ extends: [Parent1, Parent2] }, {
					email: property(required(string()))
				})).not.toThrow();

			});

			it("throws when some parents define namespace and others do not", async () => {

				const ns = createNamespace("http://example.org/");

				const Parent1 = resource({ namespace: ns }, {
					name: property(required(string()))
				});

				const Parent2 = resource({
					age: property(optional(integer()))
				});

				expect(() => resource({ extends: [Parent1, Parent2] }, {
					email: property(required(string()))
				})).toThrow(RangeError);

			});

			it("throws when parents define different namespaces", async () => {

				const ns1 = createNamespace("http://example.org/");
				const ns2 = createNamespace("http://other.org/");

				const Parent1 = resource({ namespace: ns1 }, {
					name: property(required(string()))
				});

				const Parent2 = resource({ namespace: ns2 }, {
					age: property(optional(integer()))
				});

				expect(() => resource({ extends: [Parent1, Parent2] }, {
					email: property(required(string()))
				})).toThrow(RangeError);

			});

			it("accepts different namespaces when overriding namespace is defined", async () => {

				const ns1 = createNamespace("http://example.org/");
				const ns2 = createNamespace("http://other.org/");
				const override = createNamespace("http://override.org/");

				const Parent1 = resource({ namespace: ns1 }, {
					name: property(required(string()))
				});

				const Parent2 = resource({ namespace: ns2 }, {
					age: property(optional(integer()))
				});

				expect(() => resource({ namespace: override, extends: [Parent1, Parent2] }, {
					email: property(required(string()))
				})).not.toThrow();

			});

			it("accepts single parent with namespace without override", async () => {

				const ns = createNamespace("http://example.org/");

				const Parent = resource({ namespace: ns }, {
					name: property(required(string()))
				});

				expect(() => resource({ extends: Parent }, {
					age: property(optional(integer()))
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

					expect(shape.model).toEqual({ age: 1 });

				});

				it("uses array model for repeatable property (maxCount=undefined)", async () => {

					const shape = resource({
						tags: repeatable(string())
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
						items: cardinality(2, 5)(string())
					});

					expect(shape.model).toEqual({ items: [""] });

				});

				it("combines multiple properties with correct cardinality models", async () => {

					const shape = resource({
						name: required(string()),
						age: optional(integer()),
						tags: repeatable(string())
					});

					expect(shape.model).toEqual({
						name: "",
						age: 1,
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

				it("uses array of nested resource model for repeatable nested resource", async () => {

					const Address = resource({
						city: required(string())
					});

					const Person = resource({
						addresses: repeatable(Address)
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

				it("uses array of reference model for repeatable reference", async () => {

					const shape = resource({
						managers: repeatable(reference(resource({})))
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
					});

					expect(shape.model).toHaveProperty("type");

				});

				it("includes id and type alongside regular properties", async () => {

					const shape = resource({
						id: id(),
						type: type(),
						name: required(string())
					});

					expect(shape.model).toHaveProperty("id");
					expect(shape.model).toHaveProperty("type");
					expect(shape.model).toHaveProperty("name", "");

				});

			});

			describe("unions", () => {

				it("uses record model mapping variant identifiers to their model values", async () => {

					const shape = resource({
						value: required(union({
							string: string(),
							number: integer()
						}))
					});

					expect(shape.model).toEqual({
						value: {
							string: "",
							number: 1
						}
					});

				});

				it("wraps union model in array when maxCount>1", async () => {

					const shape = resource({
						values: multiple(union({
							string: string(),
							number: integer()
						}))
					});

					expect(shape.model).toEqual({
						values: [{
							string: "",
							number: 1
						}]
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
						tags: repeatable(string())
					});

					expect(() => {
						(shape.model as any).tags.push("new");
					}).toThrow();

				});

			});

			describe("model with inheritance", () => {

				it("includes properties from single parent", async () => {

					const Parent = resource({ name: required(string()) });
					const Child = resource({ extends: Parent }, { age: optional(integer()) });

					expect(Child.model).toEqual({ name: "", age: 1 });

				});

				it("includes properties from multiple parents", async () => {

					const Named = resource({ name: required(string()) });
					const Aged = resource({ age: required(integer()) });
					const Person = resource({ extends: [Named, Aged] }, { email: optional(string()) });

					expect(Person.model).toEqual({ name: "", age: 1, email: "" });

				});

				it("compatible local override preserves type", async () => {

					const Parent = resource({ name: required(string()) });
					const Child = resource({ extends: Parent }, { name: required(string({ minLength: 1 })) });

					expect(Child.model).toEqual({ name: "" });

				});

				it("inherits forward from parent when overriding with naked range", async () => {

					const rdfs = createNamespace("http://www.w3.org/2000/01/rdf-schema#", ["label"]);

					const Parent = resource({
						label: property({ forward: rdfs.label }, required(string()))
					});

					const Child = resource({ extends: Parent }, {
						label: required(string({ minLength: 1 }))
					});

					expect((Child.properties.label as Property).forward).toBe("http://www.w3.org/2000/01/rdf-schema#label");

				});

				it("inherits reverse from parent when overriding with naked range", async () => {

					const ex = createNamespace("http://example.org/", ["owner"]);

					const Parent = resource({
						owner: property({ reverse: ex.owner }, required(string()))
					});

					const Child = resource({ extends: Parent }, {
						owner: required(string({ minLength: 1 }))
					});

					expect((Child.properties.owner as Property).reverse).toBe("http://example.org/owner");

				});

				it("rejects incompatible property kinds across parents", async () => {

					const First = resource({ name: required(string()) });
					const Second = resource({ name: required(integer()) });

					expect(() => resource({ extends: [First, Second] }, {})).toThrow(RangeError);

				});

				it("includes transitive inherited properties", async () => {

					const GrandParent = resource({ id: required(string()) });
					const Parent = resource({ extends: GrandParent }, { name: required(string()) });
					const Child = resource({ extends: Parent }, { age: optional(integer()) });

					expect(Child.model).toEqual({ id: "", name: "", age: 1 });

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

		describe("single range", () => {

			it("creates Property from single range", async () => {

				const prop = property(required(string()));

				expect(prop.range.kind).toBe("range");
				expect((prop.range as Range).shape.kind).toBe("string");

			});

			it("returns an immutable property", async () => {

				const prop = property(required(string()));

				expect(() => {
					(prop as any).range = {};
				}).toThrow();

			});

		});

		describe("union variants", () => {

			it("accepts a range with union shape", async () => {

				const prop = property(required(union({ string: string(), number: integer() })));

				expect(prop.range.kind).toBe("range");

				const rangeShape = (prop.range as Range).shape;
				expect(rangeShape.kind).toBe("union");
				expect((rangeShape as UnionShape).variants.string.kind).toBe("string");
				expect((rangeShape as UnionShape).variants.number.kind).toBe("number");

			});

		});

		describe("with specs", () => {

			it("accepts specs and single range", async () => {

				const prop = property({ hidden: true }, required(string()));

				expect(prop.range.kind).toBe("range");
				expect((prop.range as Range).shape.kind).toBe("string");

			});

			it("includes hidden in the property", async () => {

				const prop = property({ hidden: true }, required(string()));

				expect(prop.hidden).toBe(true);

			});

			it("converts string forward to IRI", async () => {

				const prop = property({ forward: "http://example.org/name" }, required(string()));

				expect(prop.forward).toBe("http://example.org/name");

			});

			it("converts string reverse to IRI", async () => {

				const prop = property({ reverse: "http://example.org/owner" }, required(string()));

				expect(prop.reverse).toBe("http://example.org/owner");

			});

		});

		describe("structural integrity", () => {

			it("includes provided specs", async () => {

				const prop = property({
					hidden: true,
					forward: "http://example.org/name",
					reverse: "http://example.org/owner"
				}, required(string()));

				expect(prop).toMatchObject({
					hidden: true,
					forward: "http://example.org/name",
					reverse: "http://example.org/owner"
				});
				expect(prop.range).toBeDefined();

			});

			it("includes only provided properties", async () => {

				const prop = property({ hidden: true }, required(string()));

				expect(prop).toMatchObject({ hidden: true });
				expect(prop.range).toBeDefined();

			});

		});

	});


	describe.each([
		["multiple", multiple, undefined, undefined],
		["repeatable", repeatable, 1, undefined],
		["optional", optional, undefined, 1],
		["required", required, 1, 1]
	] as const)("%s", (_label, factory, expectedMin, expectedMax) => {

		it("returns a range with expected cardinality", async () => {

			const range = factory(string());

			expect(range.minCount).toBe(expectedMin);
			expect(range.maxCount).toBe(expectedMax);
			expect(range.shape.kind).toBe("string");

		});

		it("returns an immutable range", async () => {

			const range = factory(string());

			expect(() => {
				(range as any).minCount = 99;
			}).toThrow();

		});

		it("includes only expected properties", async () => {

			const range = factory(string());

			expect(Object.keys(range).sort()).toEqual(["kind", "maxCount", "minCount", "shape"]);

		});

	});

	describe("multiple", () => {

		it("accepts lazy resource shape", async () => {

			const range = multiple(() => resource({}));

			expect(range.shape.kind).toBe("resource");

		});

	});

	describe("cardinality", () => {

		it("returns a factory function", async () => {

			const twoToFive = cardinality(2, 5);

			expect(typeof twoToFive).toBe("function");

		});

		it("creates ranges with specified cardinality", async () => {

			const twoToFive = cardinality(2, 5);
			const range = twoToFive(string());

			expect(range.minCount).toBe(2);
			expect(range.maxCount).toBe(5);
			expect(range.shape.kind).toBe("string");

		});

		it("supports undefined lower bound", async () => {

			const upToThree = cardinality(undefined, 3);
			const range = upToThree(string());

			expect(range.minCount).toBeUndefined();
			expect(range.maxCount).toBe(3);

		});

		it("supports undefined upper bound", async () => {

			const atLeastTwo = cardinality(2);
			const range = atLeastTwo(string());

			expect(range.minCount).toBe(2);
			expect(range.maxCount).toBeUndefined();

		});

		it("returns immutable ranges", async () => {

			const twoToFive = cardinality(2, 5);
			const range = twoToFive(string());

			expect(() => {
				(range as any).minCount = 0;
			}).toThrow();

		});

		describe("structural integrity", () => {

			it("includes undefined constraints", async () => {

				const upToThree = cardinality(undefined, 3);
				const range = upToThree(string());

				expect(Object.keys(range).sort()).toEqual(["kind", "maxCount", "minCount", "shape"]);
				expect(range.minCount).toBeUndefined();

			});

		});

	});

	describe("reference", () => {

		describe("shape", () => {

			it("returns a shape with kind 'reference'", async () => {

				expect(reference(resource({})).kind).toBe("reference");

			});

			it("returns a shape with default model", async () => {

				expect(reference(resource({})).model).toBe("app:/");

			});

			it("returns an immutable shape", async () => {

				const shape = reference(resource({}));

				expect(() => (shape as any).kind = "string").toThrow();
				expect(() => (shape as any).model = "/test").toThrow();

			});

		});

	});

	describe("foreign", () => {

		describe("shape", () => {

			it("returns a shape with kind 'reference'", async () => {

				expect(foreign(resource({})).kind).toBe("reference");

			});

			it("returns a shape with foreign set to true", async () => {

				expect(foreign(resource({})).foreign).toBe(true);

			});

			it("returns a shape with default model", async () => {

				expect(foreign(resource({})).model).toBe("app:/");

			});

			it("returns an immutable shape", async () => {

				const shape = foreign(resource({}));

				expect(() => (shape as any).kind = "string").toThrow();
				expect(() => (shape as any).foreign = false).toThrow();

			});

		});

	});

});

describe("operators", () => {

	describe("validateReference", () => {

		describe("type filtering", () => {

			it("returns undefined for valid reference values", async () => {

				expect(validateReference(["app:/users/123"], reference(resource({})))).toBeUndefined();

			});

			it("returns undefined for empty values array", async () => {

				expect(validateReference([], reference(resource({})))).toBeUndefined();

			});

			it("returns trace with kind key for non-reference value", async () => {

				const trace = validateReference([42], reference(resource({})));

				expect(trace).toHaveProperty("{kind}");

			});

			it("returns trace with kind key for multiple non-reference values", async () => {

				const trace = validateReference([42, true], reference(resource({})));

				expect(trace).toHaveProperty("{kind}");
				expect((trace as Record<string, string>)["{kind}"]).toMatch(/\(2\/2\)/);

			});

			it("returns trace with kind key for mixed values", async () => {

				const trace = validateReference(["app:/users/123", 42], reference(resource({})));

				expect(trace).toHaveProperty("{kind}");

			});

		});

		describe("no constraints", () => {

			it("accepts any reference when target shape has no constraints", async () => {

				const target = resource({});
				const shape = reference(target);

				expect(validateReference(["app:/users/123"], shape)).toBeUndefined();

			});

			it("accepts empty values", async () => {

				const target = resource({});
				const shape = reference(target);

				expect(validateReference([], shape)).toBeUndefined();

			});

		});

		describe.each([

			{
				constraint: "pattern",
				options: { pattern: "/users/{id}" } as const,
				valid: ["app:/users/123"],
				invalid: ["app:/products/123"],
				errorKey: "{pattern}"
			},

			{
				constraint: "in",
				options: { in: ["app:/users/1", "app:/users/2"] } as const,
				valid: ["app:/users/1"],
				invalid: ["app:/users/99"],
				errorKey: "{in}"
			},

			{
				constraint: "hasValue",
				options: { hasValue: ["app:/users/1"] } as const,
				valid: ["app:/users/1", "app:/users/2"],
				invalid: ["app:/users/2"],
				errorKey: "{hasValue}"
			}

		])("$constraint constraint", ({ options, valid, invalid, errorKey }) => {

			it("accepts valid references", async () => {

				const shape = reference(resource(options, {}));

				expect(validateReference(valid, shape)).toBeUndefined();

			});

			it("rejects invalid references", async () => {

				const shape = reference(resource(options, {}));

				expect(validateReference(invalid, shape)).toHaveProperty(errorKey);

			});

		});

		describe("lazy shape resolution", () => {

			it("resolves lazy shape function before validation", async () => {

				const target = resource({ pattern: "/users/{id}" }, {});
				const shape = reference(() => target);

				expect(validateReference(["app:/users/123"], shape)).toBeUndefined();
				expect(validateReference(["app:/products/123"], shape)).toHaveProperty("{pattern}");

			});

		});

	});

	describe("mergeReference", () => {

		describe("kind", () => {

			it("preserves kind as 'reference'", async () => {

				const merged = mergeReference(reference(resource({})), reference(resource({})));

				expect(merged.kind).toBe("reference");

			});

		});

		describe("model", () => {

			it("merges shapes with equal models", async () => {

				const merged = mergeReference(reference(resource({})), reference(resource({})));

				expect(merged.model).toBe("app:/");

			});

		});

		describe("foreign", () => {

			it("preserves foreign from target", async () => {

				const merged = mergeReference(foreign(resource({})), foreign(resource({})));

				expect(merged.foreign).toBe(true);

			});

			it("preserves absent foreign from target", async () => {

				const merged = mergeReference(reference(resource({})), reference(resource({})));

				expect(merged.foreign).toBeUndefined();

			});

		});

		describe("shape", () => {

			it("preserves shape from target", async () => {

				const target = resource({});
				const source = resource({});

				const merged = mergeReference(reference(target), reference(source));

				expect(merged.shape).toBe(target);

			});

		});

	});


	describe("validateEntry", () => {

		describe("shapes without id", () => {

			it("returns undefined for shape with no id property", async () => {

				const shape = resource({
					name: required(string())
				});

				expect(validateEntry([{ name: "Alice" }], shape)).toBeUndefined();

			});

			it("returns undefined for empty shape", async () => {

				expect(validateEntry([{}], resource({}))).toBeUndefined();

			});

		});

		describe("shapes with id", () => {

			it("accepts single absolute IRI", async () => {

				const shape = resource({ id: id() });

				expect(validateEntry([{ "id": "app:/users/123" }], shape)).toBeUndefined();

			});

			it("rejects missing id", async () => {

				const shape = resource({ id: id() });

				const trace = validateEntry([{}], shape) as Record<string, Trace>;
				const inner = trace["[0]"] as Record<string, Trace>;

				expect(inner).toHaveProperty("id");
				expect(inner["id"]).toHaveProperty("{kind}");

			});

			it("rejects non-IRI value", async () => {

				const shape = resource({ id: id() });

				const trace = validateEntry([{ "id": "not an iri" }], shape) as Record<string, Trace>;
				const inner = trace["[0]"] as Record<string, Trace>;

				expect(inner).toHaveProperty("id");
				expect(inner["id"]).toHaveProperty("{kind}");

			});

			it("rejects multiple values", async () => {

				const shape = resource({ id: id() });

				const trace = validateEntry([{ "id": ["/users/1", "/users/2"] }], shape) as Record<string, Trace>;
				const inner = trace["[0]"] as Record<string, Trace>;

				expect(inner).toHaveProperty("id");
				expect(inner["id"]).toHaveProperty("{kind}");

			});

			it("rejects non-object values", async () => {

				const shape = resource({ id: id() });

				const trace = validateEntry(["not an object"], shape) as Record<string, Trace>;

				expect(trace).toHaveProperty("{kind}");

			});

		});

		describe("id constraints", () => {

			describe("pattern", () => {

				it("accepts id matching pattern", async () => {

					const shape = resource({ pattern: "/users/{id}" }, { id: id() });

					expect(validateEntry([{ "id": "app:/users/123" }], shape)).toBeUndefined();

				});

				it("rejects id not matching pattern", async () => {

					const shape = resource({ pattern: "/users/{id}" }, { id: id() });

					const trace = validateEntry([{ "id": "/products/123" }], shape) as Record<string, Trace>;
					const inner = trace["[0]"] as Record<string, Trace>;

					expect(inner).toHaveProperty("id");
					expect(inner["id"]).toHaveProperty("{pattern}");

				});

			});

			describe("in", () => {

				it("accepts id in allowed enumeration", async () => {

					const shape = resource({ in: ["app:/users/alice", "app:/users/bob"] }, { id: id() });

					expect(validateEntry([{ "id": "app:/users/alice" }], shape)).toBeUndefined();

				});

				it("rejects id not in allowed enumeration", async () => {

					const shape = resource({ in: ["app:/users/alice", "app:/users/bob"] }, { id: id() });

					const trace = validateEntry([{ "id": "app:/users/charlie" }], shape) as Record<string, Trace>;
					const inner = trace["<app:/users/charlie>"] as Record<string, Trace>;

					expect(inner).toHaveProperty("id");
					expect(inner["id"]).toHaveProperty("{in}");

				});

			});

			describe("hasValue", () => {

				it("accepts id matching required value", async () => {

					const shape = resource({ hasValue: ["app:/users/alice"] }, { id: id() });

					expect(validateEntry([{ "id": "app:/users/alice" }], shape)).toBeUndefined();

				});

				it("rejects id not matching required value", async () => {

					const shape = resource({ hasValue: ["app:/users/alice"] }, { id: id() });

					const trace = validateEntry([{ "id": "app:/users/bob" }], shape) as Record<string, Trace>;
					const inner = trace["<app:/users/bob>"] as Record<string, Trace>;

					expect(inner).toHaveProperty("id");
					expect(inner["id"]).toHaveProperty("{hasValue}");

				});

			});

		});

		describe("non-id properties ignored", () => {

			it("does not validate other properties", async () => {

				const shape = resource({
					id: id(),
					name: required(string({ minLength: 10 }))
				});

				// name violates minLength but validateEntry should not check it
				expect(validateEntry([{ "id": "app:/users/123", name: "Al" }], shape)).toBeUndefined();

			});

			it("does not reject unknown properties", async () => {

				const shape = resource({ id: id() });

				expect(validateEntry([{ "id": "app:/users/123", extra: "value" }], shape)).toBeUndefined();

			});

		});

		describe("multiple entries", () => {

			it("accepts multiple valid entries", async () => {

				const shape = resource({ id: id() });

				expect(validateEntry([
					{ "id": "app:/users/1" },
					{ "id": "app:/users/2" }
				], shape)).toBeUndefined();

			});

			it("reports invalid entries keyed by IRI or index", async () => {

				const shape = resource({ id: id() });

				const trace = validateEntry([
					{ "id": "app:/users/1" },
					{ "id": "not valid" }
				], shape) as Record<string, Trace>;

				expect(trace).not.toHaveProperty("<app:/users/1>");
				expect(trace).toHaveProperty("[1]");

			});

		});

	});

	describe("validateResource", () => {

		describe("resource constraints", () => {

			describe("closed shape", () => {

				const named = resource({
					name: required(string()),
					age: optional(integer())
				});


				it("accepts empty resource with no properties", async () => {

					expect(validateResource([{}], resource({}))).toBeUndefined();

				});

				it("accepts resource with subset of defined properties", async () => {

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
					});

					expect(validateResource([{
						"type": "app:/types/Person",
						name: "Alice"
					}], shape)).toBeUndefined();

				});

				it("accepts properties from inherited shape", async () => {

					const Base = resource({
						code: required(integer())
					});

					const Derived = resource({ extends: Base }, {
						name: required(string())
					});

					expect(validateResource([{ code: 1, name: "Alice" }], Derived)).toBeUndefined();

				});

				it("rejects unknown property", async () => {

					const trace = validateResource([{ name: "Alice", extra: "value" }], named) as Record<string, Trace>;

					expect(trace["[0]"]).toHaveProperty("extra");

				});

			});

			describe("custom validators", () => {

				const adultValidator: Validator = (r) => {
					return (r as any).age >= 18 ? undefined : "must be adult";
				};

				const validated = resource({
					validators: [adultValidator]
				}, {
					age: required(integer())
				});


				it("accepts resource passing custom validator", async () => {

					expect(validateResource([{ age: 25 }], validated)).toBeUndefined();

				});

				it("rejects resource failing custom validator", async () => {

					expect(validateResource([{ age: 15 }], validated)).toBeDefined();

				});

				it("runs all custom validators", async () => {

					const v1: Validator = (r) => (r as any).a > 0 ? undefined : "a must be positive";
					const v2: Validator = (r) => (r as any).b > 0 ? undefined : "b must be positive";

					const shape = resource({
						validators: [v1, v2]
					}, {
						a: required(integer()),
						b: required(integer())
					});

					// both pass

					expect(validateResource([{ a: 1, b: 1 }], shape)).toBeUndefined();

					// first fails

					expect(validateResource([{ a: -1, b: 1 }], shape)).toBeDefined();

					// second fails

					expect(validateResource([{ a: 1, b: -1 }], shape)).toBeDefined();

				});

				it("enforces inherited validators", async () => {

					const validator: Validator = (r) => {
						return (r as any).age >= 18 ? undefined : "must be adult";
					};

					const Base = resource({ validators: [validator] }, {
						age: required(integer())
					});

					const Derived = resource({ extends: Base }, {
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

					const trace = validateResource([{ age: -5 }], shape) as Record<string, Trace>;

					expect(trace["[0]"]).toHaveProperty("age");

				});

				it("includes property path in nested traces", async () => {

					const Address = resource({
						city: required(string({ minLength: 1 }))
					});

					const Person = resource({
						address: required(Address)
					});

					const trace = validateResource([{ address: { city: "" } }], Person) as Record<string, Trace>;
					const inner = trace["[0]"] as Record<string, Trace>;

					expect(inner).toHaveProperty("address");

					const address = inner["address"] as Record<string, Trace>;

					expect(address).toHaveProperty(["[0]", "city"]);

				});

				it("includes both unknown and invalid property traces in dictionary", async () => {

					const Address = resource({
						city: required(string({ minLength: 1 }))
					});

					const shape = resource({
						address: required(Address)
					});

					const trace = validateResource([{
						address: { city: "" },
						extra: "value"
					}], shape) as Record<string, Trace>;

					expect(trace["[0]"]).toHaveProperty("extra");
					expect(trace["[0]"]).toHaveProperty("address");

				});

			});

		});

		describe("id constraints", () => {

			it("accepts single absolute IRI", async () => {

				const shape = resource({ id: id() });

				expect(validateResource([{ "id": "app:/users/123" }], shape)).toBeUndefined();

			});

			it("rejects missing id", async () => {

				const shape = resource({ id: id() });

				const trace = validateResource([{}], shape) as Record<string, Trace>;
				const inner = trace["[0]"] as Record<string, Trace>;

				expect(inner).toHaveProperty("id");
				expect(inner["id"]).toHaveProperty("{kind}");

			});

			it("rejects non-IRI value", async () => {

				const shape = resource({ id: id() });

				const trace = validateResource([{ "id": "not an iri" }], shape) as Record<string, Trace>;
				const inner = trace["[0]"] as Record<string, Trace>;

				expect(inner).toHaveProperty("id");
				expect(inner["id"]).toHaveProperty("{kind}");

			});

			it("rejects multiple values", async () => {

				const shape = resource({ id: id() });

				const trace = validateResource([{ "id": ["/users/1", "/users/2"] }], shape) as Record<string, Trace>;
				const inner = trace["[0]"] as Record<string, Trace>;

				expect(inner).toHaveProperty("id");
				expect(inner["id"]).toHaveProperty("{kind}");

			});

			describe("pattern", () => {

				it("accepts id matching pattern", async () => {

					const shape = resource({ pattern: "/users/{id}" }, { id: id() });

					expect(validateResource([{ "id": "app:/users/123" }], shape)).toBeUndefined();

				});

				it("accepts wildcard pattern", async () => {

					const shape = resource({ pattern: "/users/*" }, { id: id() });

					expect(validateResource([{ "id": "app:/users/123/profile" }], shape)).toBeUndefined();

				});

				it("rejects id not matching pattern", async () => {

					const shape = resource({ pattern: "/users/{id}" }, { id: id() });

					const trace = validateResource([{ "id": "/products/123" }], shape) as Record<string, Trace>;
					const inner = trace["[0]"] as Record<string, Trace>;

					expect(inner).toHaveProperty("id");
					expect(inner["id"]).toHaveProperty("{pattern}");

				});

				it("rejects missing id", async () => {

					const shape = resource({ pattern: "/users/{id}" }, { id: id() });

					const trace = validateResource([{}], shape) as Record<string, Trace>;
					const inner = trace["[0]"] as Record<string, Trace>;

					expect(inner).toHaveProperty("id");
					expect(inner["id"]).toHaveProperty("{kind}");

				});

			});

			describe("in", () => {

				it("accepts id in allowed enumeration", async () => {

					const shape = resource({ in: ["app:/users/alice", "app:/users/bob"] }, { id: id() });

					expect(validateResource([{ "id": "app:/users/alice" }], shape)).toBeUndefined();

				});

				it("rejects id not in allowed enumeration", async () => {

					const shape = resource({ in: ["app:/users/alice", "app:/users/bob"] }, { id: id() });

					const trace = validateResource([{ "id": "app:/users/charlie" }], shape) as Record<string, Trace>;
					const inner = trace["<app:/users/charlie>"] as Record<string, Trace>;

					expect(inner).toHaveProperty("id");
					expect(inner["id"]).toHaveProperty("{in}");

				});

				it("rejects missing id", async () => {

					const shape = resource({ in: ["app:/users/alice", "app:/users/bob"] }, { id: id() });

					const trace = validateResource([{}], shape) as Record<string, Trace>;
					const inner = trace["[0]"] as Record<string, Trace>;

					expect(inner).toHaveProperty("id");
					expect(inner["id"]).toHaveProperty("{kind}");

				});

			});

			describe("hasValue", () => {

				it("accepts id matching required value", async () => {

					const shape = resource({ hasValue: ["app:/users/admin"] }, { id: id() });

					expect(validateResource([{ "id": "app:/users/admin" }], shape)).toBeUndefined();

				});

				it("rejects id not matching required value", async () => {

					const shape = resource({ hasValue: ["app:/users/admin"] }, { id: id() });

					const trace = validateResource([{ "id": "app:/users/guest" }], shape) as Record<string, Trace>;
					const inner = trace["<app:/users/guest>"] as Record<string, Trace>;

					expect(inner).toHaveProperty("id");
					expect(inner["id"]).toHaveProperty("{hasValue}");

				});

				it("rejects missing id", async () => {

					const shape = resource({ hasValue: ["app:/users/admin"] }, { id: id() });

					const trace = validateResource([{}], shape) as Record<string, Trace>;
					const inner = trace["[0]"] as Record<string, Trace>;

					expect(inner).toHaveProperty("id");
					expect(inner["id"]).toHaveProperty("{kind}");

				});

			});

		});

		describe("inherited class-level constraints", () => {

			describe("pattern", () => {

				it("enforces parent pattern on child", async () => {

					const Parent = resource({ pattern: "/users/{id}" }, { id: id() });
					const Child = resource({ extends: Parent }, { name: required(string()) });

					expect(validateResource([{ "id": "app:/users/123", "name": "Alice" }], Child)).toBeUndefined();

					const trace = validateResource([{
						"id": "app:/products/123",
						"name": "Alice"
					}], Child) as Record<string, Trace>;
					const inner = trace["<app:/products/123>"] as Record<string, Trace>;

					expect(inner).toHaveProperty("id");
					expect(inner["id"]).toHaveProperty("{pattern}");

				});

				it("enforces both parent and child patterns conjunctively", async () => {

					const Parent = resource({ pattern: "/org/*" }, { id: id() });
					const Child = resource({
						extends: Parent,
						pattern: "/org/users/{id}"
					}, { name: required(string()) });

					expect(validateResource([{ "id": "app:/org/users/123", "name": "Alice" }], Child)).toBeUndefined();

					const trace = validateResource([{
						"id": "app:/org/products/123",
						"name": "Alice"
					}], Child) as Record<string, Trace>;
					const inner = trace["<app:/org/products/123>"] as Record<string, Trace>;

					expect(inner).toHaveProperty("id");

					// with multiple patterns, keys are indexed
					const idTrace = inner["id"] as Record<string, Trace>;
					expect(idTrace).toSatisfy((t: Record<string, unknown>) =>
						Object.keys(t).some(k => k.startsWith("{pattern}"))
					);

				});

			});

			describe("in", () => {

				it("enforces parent in constraint on child", async () => {

					const Parent = resource({ in: ["app:/users/alice", "app:/users/bob"] }, { id: id() });
					const Child = resource({ extends: Parent }, { name: required(string()) });

					expect(validateResource([{ "id": "app:/users/alice", "name": "Alice" }], Child)).toBeUndefined();

					const trace = validateResource([{
						"id": "app:/users/charlie",
						"name": "Charlie"
					}], Child) as Record<string, Trace>;
					const inner = trace["<app:/users/charlie>"] as Record<string, Trace>;

					expect(inner).toHaveProperty("id");
					expect(inner["id"]).toHaveProperty("{in}");

				});

			});

			describe("hasValue", () => {

				it("enforces parent hasValue constraint on child", async () => {

					const Parent = resource({ hasValue: ["app:/users/admin"] }, { id: id() });
					const Child = resource({ extends: Parent }, { name: required(string()) });

					expect(validateResource([{ "id": "app:/users/admin", "name": "Admin" }], Child)).toBeUndefined();

					const trace = validateResource([{
						"id": "app:/users/guest",
						"name": "Guest"
					}], Child) as Record<string, Trace>;
					const inner = trace["<app:/users/guest>"] as Record<string, Trace>;

					expect(inner).toHaveProperty("id");
					expect(inner["id"]).toHaveProperty("{hasValue}");

				});

				it("enforces parent and child hasValue conjunctively", async () => {

					const Parent = resource({ hasValue: ["app:/users/admin"] }, { id: id() });
					const Child = resource({
						extends: Parent,
						hasValue: ["app:/users/root"]
					}, { name: required(string()) });

					// id "app:/users/guest" fails both parent and child hasValue

					const trace = validateResource([
						{ "id": "app:/users/guest", "name": "Guest" }
					], Child) as Record<string, Trace>;
					const inner = trace["<app:/users/guest>"] as Record<string, Trace>;

					expect(inner).toHaveProperty("id");

					// with multiple hasValue lists, keys are indexed
					const idTrace = inner["id"] as Record<string, unknown>;
					expect(idTrace).toSatisfy((t: Record<string, unknown>) =>
						Object.keys(t).some(k => k.startsWith("{hasValue}"))
					);

				});

			});

		});

		describe("type constraints", () => {

			it("accepts single absolute IRI", async () => {

				const shape = resource({ type: type() });

				expect(validateResource([{ "type": "app:/types/Person" }], shape)).toBeUndefined();

			});

			it("accepts missing type", async () => {

				const shape = resource({ type: type() });

				expect(validateResource([{}], shape)).toBeUndefined();

			});

			it("rejects non-IRI value", async () => {

				const shape = resource({ type: type() });

				const trace = validateResource([{ "type": "not an iri" }], shape) as Record<string, Trace>;
				const inner = trace["[0]"] as Record<string, Trace>;

				expect(inner).toHaveProperty("type");
				expect(inner["type"]).toHaveProperty("{kind}");

			});

			it("rejects multiple values", async () => {

				const shape = resource({ type: type() });

				const trace = validateResource([{ "type": ["/types/A", "/types/B"] }], shape) as Record<string, Trace>;
				const inner = trace["[0]"] as Record<string, Trace>;

				expect(inner).toHaveProperty("type");
				expect(inner["type"]).toHaveProperty("{kind}");

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

					const trace = validateResource([{}], named) as Record<string, Trace>;
					const inner = trace["[0]"] as Record<string, Trace>;

					expect(inner).toHaveProperty("name");
					expect(inner["name"]).toHaveProperty("{minCount}");

				});

				it("rejects array value", async () => {

					const trace = validateResource([{ name: ["Alice"] }], named) as Record<string, Trace>;
					const inner = trace["[0]"] as Record<string, Trace>;

					expect(inner).toHaveProperty("name");
					expect(inner["name"]).toHaveProperty("{kind}");

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

					const trace = validateResource([{ age: [30] }], aged) as Record<string, Trace>;
					const inner = trace["[0]"] as Record<string, Trace>;

					expect(inner).toHaveProperty("age");
					expect(inner["age"]).toHaveProperty("{kind}");

				});

			});

			describe("repeatable property", () => {

				const tagged = resource({
					tags: repeatable(string())
				});


				it("accepts array with single element", async () => {

					expect(validateResource([{ tags: ["a"] }], tagged)).toBeUndefined();

				});

				it("accepts array with multiple elements", async () => {

					expect(validateResource([{ tags: ["a", "b", "c"] }], tagged)).toBeUndefined();

				});

				it("rejects empty array", async () => {

					const trace = validateResource([{ tags: [] }], tagged) as Record<string, Trace>;
					const inner = trace["[0]"] as Record<string, Trace>;

					expect(inner).toHaveProperty("tags");
					expect(inner["tags"]).toHaveProperty("{minCount}");

				});

				it("rejects missing repeatable property", async () => {

					const trace = validateResource([{}], tagged) as Record<string, Trace>;
					const inner = trace["[0]"] as Record<string, Trace>;

					expect(inner).toHaveProperty("tags");
					expect(inner["tags"]).toHaveProperty("{minCount}");

				});

				it("rejects scalar value", async () => {

					const trace = validateResource([{ tags: "a" }], tagged) as Record<string, Trace>;
					const inner = trace["[0]"] as Record<string, Trace>;

					expect(inner).toHaveProperty("tags");
					expect(inner["tags"]).toHaveProperty("{kind}");

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

					const trace = validateResource([{ aliases: "x" }], aliased) as Record<string, Trace>;
					const inner = trace["[0]"] as Record<string, Trace>;

					expect(inner).toHaveProperty("aliases");
					expect(inner["aliases"]).toHaveProperty("{kind}");

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
							tags: cardinality(cardinalityArgs[0], cardinalityArgs[1])(string())
						});

						for (const tags of accepted) {
							expect(validateResource([{ tags }], shape)).toBeUndefined();
						}

					});

					it("rejects arrays outside bounds", async () => {

						const shape = resource({
							tags: cardinality(cardinalityArgs[0], cardinalityArgs[1])(string())
						});

						for (const tags of rejected) {

							const trace = validateResource([{ tags }], shape) as Record<string, Trace>;
							const inner = trace["[0]"] as Record<string, Trace>;

							expect(inner).toHaveProperty("tags");

							if ( errorKey ) {
								expect(inner["tags"]).toHaveProperty(errorKey);
							}

						}

					});

				});

			});

			it("enforces inherited cardinality constraints", async () => {

				const Base = resource({
					name: required(string())
				});

				const Derived = resource({ extends: Base }, {
					age: optional(integer())
				});

				expect(validateResource([{ name: "Alice" }], Derived)).toBeUndefined();
				expect(validateResource([{}], Derived)).toHaveProperty(["[0]", "name"]);

			});

			it("enforces multiple parents cardinality constraints", async () => {

				const Named = resource({
					name: required(string())
				});

				const Aged = resource({
					age: required(integer())
				});

				const Person = resource({ extends: [Named, Aged] }, {
					email: optional(string())
				});

				expect(validateResource([{ name: "Alice", age: 30 }], Person)).toBeUndefined();
				expect(validateResource([{ name: "Alice" }], Person)).toHaveProperty(["[0]", "age"]);
				expect(validateResource([{ age: 30 }], Person)).toHaveProperty(["[0]", "name"]);

			});

			it("enforces inherited constraints on overridden properties", async () => {

				const Base = resource({
					name: required(string({ minLength: 3 }))
				});

				const Derived = resource({ extends: Base }, {
					name: required(string({ pattern: "^[A-Z]" }))
				});

				// satisfies both parent (minLength: 3) and child (pattern: ^[A-Z])

				expect(validateResource([{ name: "Alice" }], Derived)).toBeUndefined();

				// violates parent's minLength: 3 even though it matches child's pattern

				expect(validateResource([{ name: "A" }], Derived)).toHaveProperty(["[0]", "name"]);

				// violates child's pattern even though it satisfies parent's minLength

				expect(validateResource([{ name: "alice" }], Derived)).toHaveProperty(["[0]", "name"]);

			});

			it("prevents relaxing inherited constraints on overridden properties", async () => {

				const Base = resource({
					name: required(string({ minLength: 3, maxLength: 50 }))
				});

				// child tries to relax parent constraints — rejected at factory time

				expect(() => resource({ extends: Base }, {
					name: required(string({ minLength: 1, maxLength: 100 }))
				})).toThrow(RangeError);

			});

			it("enforces grandparent constraints through diamond inheritance", async () => {

				const GrandParent = resource({
					name: required(string({ minLength: 3 }))
				});

				const Parent1 = resource({ extends: GrandParent }, {
					name: required(string({ pattern: "^[A-Z]" }))
				});

				const Parent2 = resource({ extends: GrandParent }, {
					name: required(string({ maxLength: 50 }))
				});

				const Child = resource({ extends: [Parent1, Parent2] }, {
					name: required(string())
				});

				// satisfies grandparent (minLength: 3), last parent (maxLength: 50) and child

				expect(validateResource([{ name: "Alice" }], Child)).toBeUndefined();

				// violates grandparent's minLength: 3

				expect(validateResource([{ name: "AB" }], Child)).toHaveProperty(["[0]", "name"]);

				// violates last parent's maxLength: 50

				expect(validateResource([{ name: "A".repeat(51) }], Child)).toHaveProperty(["[0]", "name"]);

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
					range: required(local()),
					valid: [{ label: { "en": "Hello" } }],
					invalid: { label: 42 }
				},

				{
					type: "locals",
					field: "labels",
					range: required(locals()),
					valid: [{ labels: { en: ["Hello"], it: ["Ciao"] } }],
					invalid: { labels: "Hello" }
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

					expect(validateResource([invalid], shape)).toHaveProperty(["[0]", field]);

				});

			});

			describe("string values", () => {

				it("validates array elements individually", async () => {

					const shape = resource({
						tags: repeatable(string({ minLength: 2 }))
					});

					expect(validateResource([{ tags: ["abc", "de", "fgh"] }], shape)).toBeUndefined();
					expect(validateResource([{ tags: ["abc", "x", "fgh"] }], shape)).toHaveProperty(["[0]", "tags"]);

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

					expect(validateResource([{ address: {} }], Person)).toHaveProperty(["[0]", "address"]);

				});

				it("rejects deeply nested validation failure", async () => {

					const Street = resource({
						name: required(string({ minLength: 1 }))
					});

					const Address = resource({
						street: required(Street)
					});

					const Person = resource({
						address: required(Address)
					});

					expect(validateResource([{
						address: { street: { name: "" } }
					}], Person)).toHaveProperty(["[0]", "address"]);

				});

			});

			describe("union values", () => {

				const textOrCount = resource({
					value: required(union({
						text: string(),
						count: integer()
					}))
				});

				const multiUnion = resource({
					value: repeatable(union({
						text: string(),
						count: integer()
					}))
				});


				it("accepts scalar matching variant type", async () => {

					expect(validateResource([{ value: "hello" }], textOrCount)).toBeUndefined();
					expect(validateResource([{ value: 42 }], textOrCount)).toBeUndefined();

				});

				it("rejects scalar matching no variant type", async () => {

					expect(validateResource([{ value: true }], textOrCount)).toHaveProperty(["[0]", "value"]);

				});

				it("accepts array matching variant type and cardinality", async () => {

					// multiUnion is repeatable (1..*): 3 values satisfy both type and cardinality
					expect(validateResource([{ value: [1, 2, 3] }], multiUnion)).toBeUndefined();

				});

				it("rejects array for scalar union range", async () => {

					// textOrCount has maxCount=1: array is rejected
					expect(validateResource([{ value: ["a", "b"] }], textOrCount)).toHaveProperty(["[0]", "value"]);

				});

				it("rejects missing union property", async () => {

					expect(validateResource([{}], textOrCount)).toHaveProperty(["[0]", "value"]);

				});

				it("accepts inherited union property", async () => {

					const Derived = resource({ extends: textOrCount }, {
						name: required(string())
					});

					expect(validateResource([{ value: "hello", name: "Alice" }], Derived)).toBeUndefined();
					expect(validateResource([{
						value: true,
						name: "Alice"
					}], Derived)).toHaveProperty(["[0]", "value"]);

				});

			});

			describe("indexed union containers", () => {

				const PostalAddress = resource({
					street: required(string()),
					city: required(string())
				});

				const textOrAddress = resource({
					address: optional(union({
						text: string(),
						PostalAddress: reference(PostalAddress)
					}))
				});

				const multiTextOrCount = resource({
					value: repeatable(union({
						text: string(),
						count: integer()
					}))
				});


				it("accepts indexed container with scalar variant", async () => {

					expect(validateResource([{ address: { text: "123 Main St" } }], textOrAddress)).toBeUndefined();

				});

				it("accepts indexed container with reference variant", async () => {

					expect(validateResource([{
						address: {
							PostalAddress: {
								street: "12 Harbour Street",
								city: "Copenhagen"
							}
						}
					}], textOrAddress)).toBeUndefined();

				});

				it("rejects indexed container with unknown variant key", async () => {

					expect(validateResource([{
						address: { unknown: "value" }
					}], textOrAddress)).toHaveProperty(["[0]", "address"]);

				});

				it("rejects indexed container with invalid variant value", async () => {

					expect(validateResource([{
						address: { text: 42 }
					}], textOrAddress)).toHaveProperty(["[0]", "address"]);

				});

				it("rejects indexed container with invalid reference variant value", async () => {

					expect(validateResource([{
						address: {
							PostalAddress: {
								street: "12 Harbour Street"
								// missing required city
							}
						}
					}], textOrAddress)).toHaveProperty(["[0]", "address"]);

				});

				it("accepts indexed container array for repeatable union", async () => {

					expect(validateResource([{
						value: [{ text: "hello" }, { count: 42 }]
					}], multiTextOrCount)).toBeUndefined();

				});

				it("accepts absent optional indexed union property", async () => {

					expect(validateResource([{}], textOrAddress)).toBeUndefined();

				});

			});

		});

		describe("combined constraints", () => {

			const validator: Validator = (r) => {
				return (r as any).name.length <= 50 ? undefined : "name too long";
			};

			const shape = resource({
				pattern: "/users/{id}",
				validators: [validator]
			}, {
				id: id(),
				name: required(string({ minLength: 1 })),
				age: optional(integer({ minInclusive: 0, maxInclusive: 150 }))
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
				}], shape) as Record<string, Trace>;
				const inner = trace["[0]"] as Record<string, Trace>;

				expect(inner).toHaveProperty("id");
				expect(inner["id"]).toHaveProperty("{pattern}");

			});

			it("rejects resource failing property constraint", async () => {

				expect(validateResource([{
					"id": "app:/users/123",
					name: ""
				}], shape)).toHaveProperty(["<app:/users/123>", "name"]);

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
				name: required(string({ minLength: 1 }))
			});

			const shapeWithoutId = resource({
				name: required(string({ minLength: 1 }))
			});


			it("wraps single resource trace under id key", async () => {

				const trace = validateResource([{ "id": "app:/users/1", name: "" }], shape) as Record<string, Trace>;

				expect(trace).toHaveProperty("<app:/users/1>");
				expect(trace["<app:/users/1>"]).toHaveProperty("name");

			});

			it("keys violations by @id for multiple resources", async () => {

				const trace = validateResource([
					{ "id": "app:/users/1", name: "" },
					{ "id": "app:/users/2", name: "" }
				], shape) as Record<string, Trace>;

				expect(trace).toHaveProperty("<app:/users/1>");
				expect(trace).toHaveProperty("<app:/users/2>");

				expect(trace["<app:/users/1>"]).toHaveProperty("name");
				expect(trace["<app:/users/2>"]).toHaveProperty("name");

			});

			it("keys violations by blank node for multiple resources without id property", async () => {

				const trace = validateResource([
					{ name: "" },
					{ name: "" }
				], shapeWithoutId) as Record<string, Trace>;

				expect(trace).toHaveProperty("[0]");
				expect(trace).toHaveProperty("[1]");

			});

			it("uses blank node key for resources with missing @id value", async () => {

				const trace = validateResource([
					{ name: "" },
					{ "id": "app:/users/2", name: "" }
				], shape) as Record<string, Trace>;

				expect(trace).toHaveProperty("[0]");
				expect(trace).toHaveProperty("<app:/users/2>");

			});

			it("includes only invalid resources in trace", async () => {

				const trace = validateResource([
					{ "id": "app:/users/1", name: "Alice" },
					{ "id": "app:/users/2", name: "" }
				], shape) as Record<string, Trace>;

				expect(trace).not.toHaveProperty("app:/users/1");
				expect(trace).toHaveProperty("<app:/users/2>");

			});

			it("returns undefined when all resources are valid", async () => {

				expect(validateResource([
					{ "id": "app:/users/1", name: "Alice" },
					{ "id": "app:/users/2", name: "Bob" }
				], shape)).toBeUndefined();

			});

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

			it("computes model from merged properties", async () => {

				const merged = mergeResource(
					resource({ name: required(string()) }),
					resource({ age: optional(integer()) })
				);

				expect(merged.model).toEqual({ name: "", age: 1 });

			});

			it("uses merged range models for overlapping properties", async () => {

				const merged = mergeResource(
					resource({ name: required(string()) }),
					resource({ name: required(string()) })
				);

				expect(merged.model).toHaveProperty("name", "");

			});

			it("inherits base model for properties not in target", async () => {

				const base = resource({
					extends: resource({ inherited: optional(integer()) })
				}, {});

				const merged = mergeResource(
					resource({ name: required(string()) }),
					base
				);

				expect(merged.model).toHaveProperty("inherited", 1);
				expect(merged.model).toHaveProperty("name", "");

			});

		});

		describe("virtual", () => {

			it("inherits virtual from target", async () => {

				const merged = mergeResource(
					resource({ virtual: true }, {}),
					resource({})
				);

				expect(merged.virtual).toBe(true);

			});

			it("inherits virtual from source when target is undefined", async () => {

				const merged = mergeResource(
					resource({}),
					resource({ virtual: true }, {})
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
					resource({ name: "child" }, {}),
					resource({ name: "parent" }, {})
				);

				expect(merged.name).toBe("child");

			});

		});

		describe("description", () => {

			it("preserves description from target", async () => {

				const merged = mergeResource(
					resource({ description: "child desc" }, {}),
					resource({ description: "parent desc" }, {})
				);

				expect(merged.description).toBe("child desc");

			});

		});

		describe("namespace", () => {

			it("inherits namespace from target", async () => {

				const ns = createNamespace("http://example.org/");

				const merged = mergeResource(
					resource({ namespace: ns }, {}),
					resource({})
				);

				expect(merged.namespace).toBe(ns);

			});

			it("inherits namespace from source when target is undefined", async () => {

				const ns = createNamespace("http://example.org/");

				const merged = mergeResource(
					resource({}),
					resource({ namespace: ns }, {})
				);

				expect(merged.namespace).toBe(ns);

			});

		});

		describe("classes", () => {

			it("collects parent class into classes", async () => {

				const merged = mergeResource(
					resource({}),
					resource({ class: "http://example.org/Parent" }, {})
				);

				expect(merged.classes).toContain("http://example.org/Parent");

			});

			it("merges parent classes with target classes", async () => {

				const merged = mergeResource(
					resource({ classes: ["http://example.org/A"] }, {}),
					resource({ classes: ["http://example.org/B"] }, {})
				);

				expect(merged.classes).toContain("http://example.org/A");
				expect(merged.classes).toContain("http://example.org/B");

			});

			it("deduplicates class entries", async () => {

				const merged = mergeResource(
					resource({ classes: ["http://example.org/A"] }, {}),
					resource({ class: "http://example.org/A", classes: ["http://example.org/A"] }, {})
				);

				expect(merged.classes!.filter(c => c === "http://example.org/A")).toHaveLength(1);

			});

			it("preserves target class outside merge", async () => {

				const merged = mergeResource(
					resource({ class: "http://example.org/Child" }, {}),
					resource({})
				);

				expect(merged.class).toBe("http://example.org/Child");

			});

		});

		describe("pattern", () => {

			it("inherits pattern from target", async () => {

				const merged = mergeResource(
					resource({ pattern: "/products/{id}" }, {}),
					resource({})
				);

				expect(merged.pattern).toBe("/products/{id}");

			});

			it("inherits pattern from source when target is undefined", async () => {

				const merged = mergeResource(
					resource({}),
					resource({ pattern: "/products/{id}" }, {})
				);

				expect(merged.pattern).toBe("/products/{id}");

			});

			it("accepts equal patterns", async () => {

				const merged = mergeResource(
					resource({ pattern: "/products/{id}" }, {}),
					resource({ pattern: "/products/{id}" }, {})
				);

				expect(merged.pattern).toBe("/products/{id}");

			});

			it("narrows parent wildcard pattern", async () => {

				const merged = mergeResource(
					resource({ pattern: "/products/{id}/reviews/{rid}" }, {}),
					resource({ pattern: "/products/*" }, {})
				);

				expect(merged.pattern).toBe("/products/{id}/reviews/{rid}");

			});

			it("narrows parent wildcard with child wildcard", async () => {

				const merged = mergeResource(
					resource({ pattern: "/products/{id}/reviews/*" }, {}),
					resource({ pattern: "/products/*" }, {})
				);

				expect(merged.pattern).toBe("/products/{id}/reviews/*");

			});

			it("rejects incompatible patterns without wildcard", async () => {

				expect(() => mergeResource(
					resource({ pattern: "/items/{id}" }, {}),
					resource({ pattern: "/products/{id}" }, {})
				)).toThrow(RangeError);

			});

			it("rejects incompatible patterns with mismatched prefix", async () => {

				expect(() => mergeResource(
					resource({ pattern: "/items/{id}" }, {}),
					resource({ pattern: "/products/*" }, {})
				)).toThrow(RangeError);

			});

		});

		describe("in", () => {

			it("inherits in from target", async () => {

				const merged = mergeResource(
					resource({ in: ["http://example.org/a"] }, {}),
					resource({})
				);

				expect(merged.in).toEqual(["http://example.org/a"]);

			});

			it("inherits in from source when target is undefined", async () => {

				const merged = mergeResource(
					resource({}),
					resource({ in: ["http://example.org/a"] }, {})
				);

				expect(merged.in).toEqual(["http://example.org/a"]);

			});

			it("computes intersection of target and source", async () => {

				const merged = mergeResource(
					resource({ in: ["http://example.org/a", "http://example.org/b"] }, {}),
					resource({ in: ["http://example.org/b", "http://example.org/c"] }, {})
				);

				expect(merged.in).toEqual(["http://example.org/b"]);

			});

			it("rejects empty intersection", async () => {

				expect(() => mergeResource(
					resource({ in: ["http://example.org/a"] }, {}),
					resource({ in: ["http://example.org/b"] }, {})
				)).toThrow(RangeError);

			});

		});

		describe("hasValue", () => {

			it("inherits hasValue from target", async () => {

				const merged = mergeResource(
					resource({ hasValue: ["http://example.org/a"] }, {}),
					resource({})
				);

				expect(merged.hasValue).toEqual(["http://example.org/a"]);

			});

			it("computes union of target and source", async () => {

				const merged = mergeResource(
					resource({ hasValue: ["http://example.org/a"] }, {}),
					resource({ hasValue: ["http://example.org/b"] }, {})
				);

				expect(merged.hasValue).toContain("http://example.org/a");
				expect(merged.hasValue).toContain("http://example.org/b");

			});

			it("deduplicates hasValue entries", async () => {

				const merged = mergeResource(
					resource({ hasValue: ["http://example.org/a"] }, {}),
					resource({ hasValue: ["http://example.org/a"] }, {})
				);

				expect(merged.hasValue).toEqual(["http://example.org/a"]);

			});

		});

		describe("validators", () => {

			it("inherits validators from target", async () => {

				const v: Validator = () => undefined;

				const merged = mergeResource(
					resource({ validators: [v] }, {}),
					resource({})
				);

				expect(merged.validators).toContain(v);

			});

			it("computes union of target and source validators", async () => {

				const v1: Validator = () => undefined;
				const v2: Validator = () => undefined;

				const merged = mergeResource(
					resource({ validators: [v1] }, {}),
					resource({ validators: [v2] }, {})
				);

				expect(merged.validators).toContain(v1);
				expect(merged.validators).toContain(v2);

			});

			it("deduplicates validators", async () => {

				const v: Validator = () => undefined;

				const merged = mergeResource(
					resource({ validators: [v] }, {}),
					resource({ validators: [v] }, {})
				);

				expect(merged.validators).toHaveLength(1);

			});

		});

		describe("properties", () => {

			it("merges properties from both shapes", async () => {

				const merged = mergeResource(
					resource({ name: required(string()) }),
					resource({ age: optional(integer()) })
				);

				expect(merged.properties).toHaveProperty("name");
				expect(merged.properties).toHaveProperty("age");

			});

			it("merges clashing property entries", async () => {

				const merged = mergeResource(
					resource({ name: required(string({ minLength: 5 })) }),
					resource({ name: required(string({ maxLength: 20 })) })
				);

				const prop = merged.properties["name"] as Property;

				expect(prop.kind).toBe("property");
				expect((prop.range.shape as any).minLength).toBe(5);
				expect((prop.range.shape as any).maxLength).toBe(20);

			});

			it("preserves id entries as immutable", async () => {

				const merged = mergeResource(
					resource({ iri: id() }),
					resource({ iri: id() })
				);

				expect(merged.properties["iri"].kind).toBe("id");

			});

			it("preserves type entries as immutable", async () => {

				const merged = mergeResource(
					resource({ rdfType: type() }),
					resource({ rdfType: type() })
				);

				expect(merged.properties["rdfType"].kind).toBe("type");

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
					expect((e as TraceError).cause).toHaveProperty("{field}");

				}

			});

		});

		describe("post-merge validation", () => {

			it("rejects hasValue entries not in 'in' set", async () => {

				expect(() => mergeResource(
					resource({ hasValue: ["http://example.org/a"] }, {}),
					resource({ in: ["http://example.org/b"] }, {})
				)).toThrow(RangeError);

			});

		});

	});

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

			expect(trace).toHaveProperty("{hasValue/in}");

		});

	});


	describe("mergeProperty", () => {

		const base: Property = { kind: "property", range: required(string()) };

		describe("kind", () => {

			it("preserves kind as 'property'", async () => {

				const merged = mergeProperty(base, base);

				expect(merged.kind).toBe("property");

			});

		});

		describe("range", () => {

			it("delegates range merge", async () => {

				const merged = mergeProperty(
					{ ...base, range: required(string({ minLength: 5 })) },
					base
				);

				expect((merged.range.shape as any).minLength).toBe(5);

			});

		});

		describe.each([
			{ field: "hidden" as const },
			{ field: "computed" as const }
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

			it("keeps target value when both define it", async () => {

				const merged = mergeProperty(
					{ ...base, [field]: "http://target.org/term" },
					{ ...base, [field]: "http://source.org/term" }
				);

				expect(merged[field]).toBe("http://target.org/term");

			});

			it("keeps target value when source has none", async () => {

				const merged = mergeProperty(
					{ ...base, [field]: "http://target.org/term" },
					base
				);

				expect(merged[field]).toBe("http://target.org/term");

			});

		});

		describe("immutable fields", () => {

			it("preserves name from target", async () => {

				const merged = mergeProperty(
					{ ...base, name: { en: "Name" } },
					base
				);

				expect(merged.name).toEqual({ en: "Name" });

			});

			it("preserves description from target", async () => {

				const merged = mergeProperty(
					{ ...base, description: { en: "Desc" } },
					base
				);

				expect(merged.description).toEqual({ en: "Desc" });

			});

		});

	});

	describe("mergeRange", () => {

		describe("kind", () => {

			it("preserves kind as 'range'", async () => {

				const merged = mergeRange(required(string()), required(string()));

				expect(merged.kind).toBe("range");

			});

		});

		describe.each([

			{
				bound: "minCount" as const,
				inheritTarget: multiple(string()),
				inheritSource: required(string()),
				keepTarget: required(string()),
				keepSource: multiple(string()),
				compatibleTarget: cardinality(2)(string()),
				compatibleSource: cardinality(1)(string()),
				compatibleExpected: 2,
				incompatibleTarget: cardinality(1)(string()),
				incompatibleSource: cardinality(2)(string())
			},

			{
				bound: "maxCount" as const,
				inheritTarget: multiple(string()),
				inheritSource: optional(string()),
				keepTarget: optional(string()),
				keepSource: multiple(string()),
				compatibleTarget: cardinality(undefined, 2)(string()),
				compatibleSource: cardinality(undefined, 5)(string()),
				compatibleExpected: 2,
				incompatibleTarget: cardinality(undefined, 10)(string()),
				incompatibleSource: cardinality(undefined, 5)(string())
			}

		])("$bound", ({
			bound, inheritTarget, inheritSource, keepTarget, keepSource,
			compatibleTarget, compatibleSource, compatibleExpected,
			incompatibleTarget, incompatibleSource
		}) => {

			it("inherits source value when target has none", async () => {

				const merged = mergeRange(inheritTarget, inheritSource);

				expect(merged[bound]).toBe(1);

			});

			it("keeps target value when source has none", async () => {

				const merged = mergeRange(keepTarget, keepSource);

				expect(merged[bound]).toBe(1);

			});

			it("accepts compatible target override", async () => {

				const merged = mergeRange(compatibleTarget, compatibleSource);

				expect(merged[bound]).toBe(compatibleExpected);

			});

			it("rejects incompatible target override", async () => {

				expect(() => mergeRange(incompatibleTarget, incompatibleSource)).toThrow(RangeError);

			});

		});

		describe("shape", () => {

			it("delegates to value shape merge", async () => {

				const merged = mergeRange(
					required(string({ minLength: 5 })),
					required(string())
				);

				expect((merged.shape as any).minLength).toBe(5);

			});

			it("rejects shape kind mismatch", async () => {

				expect(() => mergeRange(
					required(string()),
					required(boolean())
				)).toThrow(RangeError);

			});

			it("delegates to union merge for union shapes", async () => {

				const merged = mergeRange(
					required(union({ a: string({ minLength: 5 }), b: boolean() })),
					required(union({ a: string(), b: boolean() }))
				);

				expect((merged.shape as any).variants.a.minLength).toBe(5);

			});

		});

		describe("post-merge validation", () => {

			it("rejects merged minCount > maxCount", async () => {

				expect(() => mergeRange(
					cardinality(3)(string()),
					cardinality(undefined, 2)(string())
				)).toThrow(RangeError);

			});

		});

	});

	describe("mergeUnion", () => {

		describe("variants", () => {

			it("merges matching variant keys", async () => {

				const merged = mergeUnion(
					union({ a: string({ minLength: 5 }), b: boolean() }),
					union({ a: string(), b: boolean() })
				);

				expect(merged.kind).toBe("union");
				expect(Object.keys(merged.variants).sort()).toEqual(["a", "b"]);
				expect((merged.variants as any).a.minLength).toBe(5);

			});

			it("rejects mismatched variant keys", async () => {

				expect(() => mergeUnion(
					union({ a: string(), b: boolean() }),
					union({ a: string(), c: boolean() })
				)).toThrow(RangeError);

			});

			it("rejects extra variant keys in target", async () => {

				expect(() => mergeUnion(
					union({ a: string(), b: boolean(), c: string() }),
					union({ a: string(), b: boolean() })
				)).toThrow(RangeError);

			});

			it("rejects missing variant keys in target", async () => {

				expect(() => mergeUnion(
					union({ a: string() }),
					union({ a: string(), b: boolean() })
				)).toThrow(RangeError);

			});

		});

		describe("model", () => {

			it("computes merged model from merged variants", async () => {

				const merged = mergeUnion(
					union({ a: string(), b: boolean() }),
					union({ a: string(), b: boolean() })
				);

				expect(merged.model).toEqual({ a: "", b: false });

			});

		});

	});

	describe("checkRange", () => {

		it("returns undefined for consistent constraints", async () => {

			expect(checkRange({ minCount: 1, maxCount: 10 })).toBeUndefined();

		});

		it("returns undefined when minCount equals maxCount", async () => {

			expect(checkRange({ minCount: 1, maxCount: 1 })).toBeUndefined();

		});

		it("returns undefined when only minCount is provided", async () => {

			expect(checkRange({ minCount: 1 })).toBeUndefined();

		});

		it("returns undefined when only maxCount is provided", async () => {

			expect(checkRange({ maxCount: 1 })).toBeUndefined();

		});

		it("returns undefined when no constraints are provided", async () => {

			expect(checkRange({})).toBeUndefined();

		});

		it("returns trace when minCount > maxCount", async () => {

			const trace = checkRange({ minCount: 5, maxCount: 2 });

			expect(trace).toBeDefined();
			expect(trace).toHaveProperty("{minCount/maxCount}");

		});

	});


	describe("validateModel", () => {

		describe("resource constraints", () => {

			describe("binding resolution", () => {

				it("accepts empty model on empty shape", async () => {

					const shape = resource({});

					expect(validateModel([{}], shape, { depth: 0 })).toBeUndefined();

				});

				it("accepts model with only defined properties", async () => {

					const shape = resource({
						name: required(string()),
						age: optional(integer())
					});

					expect(validateModel([{ name: "Alice", age: 30 }], shape, { depth: 0 })).toBeUndefined();

				});

				it("accepts declared id property", async () => {

					const shape = resource({
						id: id(),
						name: required(string())
					});

					expect(validateModel([{
						"id": "app:/users/123",
						name: "Alice"
					}], shape, { depth: 0 })).toBeUndefined();

				});

				it("accepts properties from inherited shape", async () => {

					const Base = resource({
						id: required(integer())
					});

					const Derived = resource({ extends: Base }, {
						name: required(string())
					});

					expect(validateModel([{ id: 1, name: "Alice" }], Derived, { depth: 0 })).toBeUndefined();

				});

				it("accepts unknown binding on empty shape", async () => {

					// name is shorthand for name=name → apply() returns undefined → lenient

					const shape = resource({});

					expect(validateModel([{ name: "Alice" }], shape, { depth: 0 })).toBeUndefined();

				});

				it("accepts unknown binding", async () => {

					// extra=extra → apply() returns undefined → lenient

					const shape = resource({
						name: required(string())
					});

					expect(validateModel([{ name: "Alice", extra: "value" }], shape, { depth: 0 })).toBeUndefined();

				});

				it("accepts multiple unknown bindings", async () => {

					const shape = resource({
						name: required(string())
					});

					expect(validateModel([{
						name: "Alice",
						extra1: "a",
						extra2: "b"
					}], shape, { depth: 0 })).toBeUndefined();

				});

				it("accepts undeclared id binding", async () => {

					// id=id → apply() returns undefined (id entry not declared) → lenient

					const shape = resource({
						name: required(string())
					});

					expect(validateModel([{
						"id": "app:/users/123",
						name: "Alice"
					}], shape, { depth: 0 })).toBeUndefined();

				});

				it("accepts unknown binding alongside declared id", async () => {

					// extra=extra → apply() returns undefined → lenient

					const shape = resource({
						id: id(),
						name: required(string())
					});

					expect(validateModel([{
						"id": "app:/users/123",
						name: "Alice",
						extra: "value"
					}], shape, { depth: 0 })).toBeUndefined();

				});

				it("accepts unknown binding in derived shape", async () => {

					const Base = resource({
						id: required(integer())
					});

					const Derived = resource({ extends: Base }, {
						name: required(string())
					});

					expect(validateModel([{
						id: 1,
						name: "Alice",
						extra: "value"
					}], Derived, { depth: 0 })).toBeUndefined();

				});

				it("ignores non-binding key", async () => {

					const shape = resource({
						name: required(string())
					});

					expect(validateModel([{
						name: "Alice",
						">=name": "A"
					} as any], shape, { depth: 0 })).toBeUndefined();

				});

				it("ignores probe key", async () => {

					const shape = resource({
						name: required(string())
					});

					expect(validateModel([{
						name: "Alice",
						"^name": "asc"
					} as any], shape, { depth: 0 })).toBeUndefined();

				});


			});

			describe("custom validators skipped", () => {

				it("accepts failing custom validator", async () => {

					const validator: Validator = () => "always fails";

					const shape = resource({
						validators: [validator]
					}, {
						name: required(string())
					});

					expect(validateModel([{ name: "Alice" }], shape, { depth: 0 })).toBeUndefined();

				});

				it("accepts failing inherited validator", async () => {

					const validator: Validator = () => "always fails";

					const Base = resource({ validators: [validator] }, {
						age: required(integer())
					});

					const Derived = resource({ extends: Base }, {
						name: required(string())
					});

					expect(validateModel([{ age: 15, name: "Bob" }], Derived, { depth: 0 })).toBeUndefined();

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

					const trace = validateModel([{ address: { city: ["Rome"] } as any }], shape, { depth: null });

					expect(trace).toBeDefined();
					expect(trace).toHaveProperty(["[0]", "address"]);

				});

			});

		});

		describe("id constraints", () => {

			it("accepts string value", async () => {

				const shape = resource({ id: id() });

				expect(validateModel([{ "id": "some-id" }], shape, { depth: 0 })).toBeUndefined();

			});

			it("accepts missing id", async () => {

				const shape = resource({ pattern: "/users/{id}" }, { id: id() });

				expect(validateModel([{}], shape, { depth: 0 })).toBeUndefined();

			});

			it("rejects multiple values", async () => {

				const shape = resource({ id: id() });

				expect(validateModel([{ "id": ["/users/1", "/users/2"] } as any], shape, { depth: 0 })).toBeDefined();

			});

			it("skips pattern", async () => {

				const shape = resource({ pattern: "/users/{id}" }, { id: id() });

				expect(validateModel([{ "id": "app:/invalid" }], shape, { depth: 0 })).toBeUndefined();

			});

			it("skips in", async () => {

				const shape = resource({ in: ["app:/users/alice"] }, { id: id() });

				expect(validateModel([{ "id": "app:/users/charlie" }], shape, { depth: 0 })).toBeUndefined();

			});

			it("skips hasValue", async () => {

				const shape = resource({ hasValue: ["app:/users/admin"] }, { id: id() });

				expect(validateModel([{ "id": "app:/users/guest" }], shape, { depth: 0 })).toBeUndefined();

			});

		});

		describe("type constraints", () => {

			it("accepts string value", async () => {

				const shape = resource({ type: type() });

				expect(validateModel([{ "type": "some-type" }], shape, { depth: 0 })).toBeUndefined();

			});

			it("accepts missing type", async () => {

				const shape = resource({ type: type() });

				expect(validateModel([{}], shape, { depth: 0 })).toBeUndefined();

			});

			it("rejects multiple values", async () => {

				const shape = resource({ type: type() });

				expect(validateModel([{ "type": ["/types/A", "/types/B"] } as any], shape, { depth: 0 })).toBeDefined();

			});

		});

		describe("property constraints", () => {

			describe("missing properties accepted", () => {

				it("accepts absent required property", async () => {

					const shape = resource({
						name: required(string())
					});

					expect(validateModel([{}], shape, { depth: 0 })).toBeUndefined();

				});

				it("accepts absent repeatable property", async () => {

					const shape = resource({
						tags: repeatable(string())
					});

					expect(validateModel([{}], shape, { depth: 0 })).toBeUndefined();

				});

			});

			describe("shape enforced (scalar vs singleton tuple)", () => {

				it.each([
					["accepts scalar on scalar", "name", required(string()), { name: "Alice" }, true],
					["accepts tuple on array", "tags", repeatable(string()), { tags: ["a"] }, true],
					["rejects array on scalar", "name", required(string()), { name: ["Alice"] }, false],
					["rejects scalar on array", "tags", repeatable(string()), { tags: "a" }, false]
				] as const)("%s", async (_label, key, range, value, valid) => {

					const shape = resource({ [key]: range });

					if ( valid ) {
						expect(validateModel([value], shape, { depth: 0 })).toBeUndefined();
					} else {
						expect(validateModel([value as any], shape, { depth: 0 })).toBeDefined();
					}

				});

				describe("local shorthand on scalar cardinality", () => {

					it("accepts local string shorthand on scalar property", async () => {

						const shape = resource({ label: required(local()) });

						expect(validateModel([{ label: "hello" }], shape, { depth: 0 })).toBeUndefined();

					});

					it("accepts local object shorthand on scalar property", async () => {

						const shape = resource({ label: required(local()) });

						expect(validateModel([{ label: { en: "hello" } }], shape, { depth: 0 })).toBeUndefined();

					});

				});

				describe("locals shorthand on scalar cardinality", () => {

					it("accepts locals singleton array shorthand on scalar property", async () => {

						const shape = resource({ labels: required(locals()) });

						expect(validateModel([{ labels: ["hello"] }], shape, { depth: 0 })).toBeUndefined();

					});

					it("accepts locals object shorthand on scalar property", async () => {

						const shape = resource({ labels: required(locals()) });

						expect(validateModel([{ labels: { en: ["hello"] } }], shape, { depth: 0 })).toBeUndefined();

					});

					it("rejects locals multi-element array with cardinality error on scalar property", async () => {

						const shape = resource({ labels: optional(locals()) });
						const trace = validateModel([{ labels: ["alpha", "beta"] } as any], shape, { depth: 0 });

						expect(trace).toBeDefined();
						expect(JSON.stringify(trace)).not.toContain("expected scalar value");

					});

				});

			});

			describe("undefined template rejected", () => {

				it.each([
					["scalar", "name", required(string()), { name: undefined }],
					["array", "tags", repeatable(string()), { tags: undefined }]
				] as const)("rejects undefined template on %s property", async (_label, key, range, value) => {

					const shape = resource({ [key]: range });

					expect(validateModel([value as any], shape, { depth: 0 })).toBeDefined();

				});

			});

			describe("tuple arity enforced", () => {

				it("rejects empty tuple on array property", async () => {

					const shape = resource({
						tags: repeatable(string())
					});

					expect(validateModel([{ tags: [] }], shape, { depth: 0 })).toBeDefined();

				});

				it("rejects multi-element tuple on array property", async () => {

					const shape = resource({
						tags: repeatable(string())
					});

					expect(validateModel([{ tags: ["a", "b"] } as any], shape, { depth: 0 })).toBeDefined();

				});

				it("accepts singleton tuple on array property", async () => {

					const shape = resource({
						tags: repeatable(string())
					});

					expect(validateModel([{ tags: ["a"] }], shape, { depth: 0 })).toBeUndefined();

				});

			});

			describe("inherited shape enforced", () => {

				it("enforces shape on inherited scalar property", async () => {

					const Base = resource({
						name: required(string())
					});

					const Derived = resource({ extends: Base }, {
						age: optional(integer())
					});

					expect(validateModel([{ name: "Alice" }], Derived, { depth: 0 })).toBeUndefined();
					expect(validateModel([{ name: ["Alice"] } as any], Derived, { depth: 0 })).toBeDefined();

				});

				it("enforces shape on inherited properties from multiple parents", async () => {

					const Named = resource({
						name: required(string())
					});

					const Aged = resource({
						age: required(integer())
					});

					const Person = resource({ extends: [Named, Aged] }, {
						email: optional(string())
					});

					expect(validateModel([{}], Person, { depth: 0 })).toBeUndefined();
					expect(validateModel([{ name: "Alice", age: 30 }], Person, { depth: 0 })).toBeUndefined();
					expect(validateModel([{ name: ["Alice"] } as any], Person, { depth: 0 })).toBeDefined();

				});

			});

			it("enforces shape on overridden inherited property", async () => {

				const Base = resource({
					name: required(string())
				});

				const Derived = resource({ extends: Base }, {
					name: required(string({ minLength: 3 }))
				});

				// type shape still enforced on overridden property

				expect(validateModel([{ name: "A" }], Derived, { depth: 0 })).toBeUndefined();
				expect(validateModel([{ name: 42 }], Derived, { depth: 0 })).toBeDefined();

			});

		});

		describe("value constraints", () => {

			it("accepts value matching type", async () => {

				const shape = resource({
					name: required(string())
				});

				expect(validateModel([{ name: "Alice" }], shape, { depth: 0 })).toBeUndefined();

			});

			it("rejects value with wrong type", async () => {

				const shape = resource({
					name: required(string())
				});

				expect(validateModel([{ name: 42 }], shape, { depth: 0 })).toBeDefined();

			});

			it("skips value constraints", async () => {

				const shape = resource({
					age: required(integer({ minInclusive: 0 }))
				});

				expect(validateModel([{ age: -5 }], shape, { depth: 0 })).toBeUndefined();

			});

			describe("union values", () => {

				const textOrCount = resource({
					value: required(union({
						text: string(),
						count: integer()
					}))
				});

				it("accepts value matching one variant type", async () => {

					expect(validateModel([{ value: "hello" }], textOrCount, { depth: 0 })).toBeUndefined();
					expect(validateModel([{ value: 42 }], textOrCount, { depth: 0 })).toBeUndefined();

				});

				it("accepts missing union property", async () => {

					expect(validateModel([{}], textOrCount, { depth: 0 })).toBeUndefined();

				});

				it("rejects value matching no variant type", async () => {

					expect(validateModel([{ value: true }], textOrCount, { depth: 0 })).toBeDefined();

				});

				it("accepts inherited union property", async () => {

					const Derived = resource({ extends: textOrCount }, {
						name: required(string())
					});

					expect(validateModel([{ value: "hello" }], Derived, { depth: 0 })).toBeUndefined();
					expect(validateModel([{ value: true }], Derived, { depth: 0 })).toBeDefined();

				});

			});

			describe("union bindings", () => {

				const shape = resource({
					value: required(union({
						text: string(),
						count: integer()
					}))
				});

				it("accepts alias binding matching one variant type", async () => {

					expect(validateModel([{ "alias=value": "hello" }], shape, { depth: 0 })).toBeUndefined();
					expect(validateModel([{ "alias=value": 42 }], shape, { depth: 0 })).toBeUndefined();

				});

				it("rejects alias binding matching no variant type", async () => {

					expect(validateModel([{ "alias=value": true }], shape, { depth: 0 })).toBeDefined();

				});

			});

		});

		describe("reference properties", () => {

			it("accepts IRI string for scalar reference", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					supervisor: optional(reference(Target))
				});

				expect(validateModel([{ supervisor: "app:/users/1" }], shape, { depth: 0 })).toBeUndefined();

			});

			it("accepts IRI strings for array reference", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					members: multiple(reference(Target))
				});

				expect(validateModel([{ members: ["app:/users/1"] }], shape, { depth: 0 })).toBeUndefined();

			});

			it("accepts nested model object for scalar reference", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					supervisor: optional(reference(Target))
				});

				expect(validateModel([{ supervisor: { name: "Alice" } }], shape, { depth: null })).toBeUndefined();

			});

			it("accepts nested model objects for array reference", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					members: multiple(reference(Target))
				});

				expect(validateModel([{ members: [{ name: "Alice" }] } as any], shape, { depth: null })).toBeUndefined();

			});

			it("rejects non-string non-object values for reference", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					supervisor: optional(reference(Target))
				});

				expect(validateModel([{ supervisor: 42 }], shape, { depth: 0 })).toBeDefined();

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

					expect(validateModel([{
						supervisor: { name: "Alice", department: { label: "Engineering" } }
					}], shape, { depth: null })).toBeUndefined();

				});

				it("accepts unknown binding at level 1", async () => {

					// extra=extra → apply() returns undefined → lenient

					expect(validateModel([{
						supervisor: { name: "Alice", extra: "bad" }
					}], shape, { depth: null })).toBeUndefined();

				});

				it("accepts unknown binding at level 2", async () => {

					// extra=extra → apply() returns undefined → lenient

					expect(validateModel([{
						supervisor: { name: "Alice", department: { label: "Engineering", extra: "bad" } }
					}], shape, { depth: null })).toBeUndefined();

				});

			});

			it("accepts missing reference property", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					supervisor: optional(reference(Target))
				});

				expect(validateModel([{}], shape, { depth: 0 })).toBeUndefined();

			});

			it("accepts foreign property with IRI value", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					children: multiple(foreign(Target))
				});

				expect(validateModel([{ children: ["app:/items/1"] } as any], shape, { depth: 0 })).toBeUndefined();

			});

			it("accepts foreign property with nested model", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					children: multiple(foreign(Target))
				});

				expect(validateModel([{ children: [{ name: "Child" }] }], shape, { depth: null })).toBeUndefined();

			});

		});

		describe("resource properties", () => {

			it("rejects IRI reference for inline resource property", async () => {

				const shape = resource({
					child: optional(resource({ name: required(string()) }))
				});

				expect(validateModel([{ child: "app:/children/1" }], shape, { depth: 0 })).toBeDefined();

			});

			it("accepts nested model for inline resource property", async () => {

				const shape = resource({
					child: optional(resource({ name: required(string()) }))
				});

				expect(validateModel([{ child: { name: "Alice" } }], shape, { depth: null })).toBeUndefined();

			});

		});

		describe("depth", () => {

			it("rejects nested model when depth is omitted (defaults to 0)", async () => {

				const Inner = resource({ label: required(string()) });

				const Outer = resource({
					child: optional(reference(Inner))
				});

				expect(validateModel([{ child: { label: "x" } }], Outer, { depth: 0 })).toBeDefined();

			});

			it("accepts nested model when depth is null (unlimited)", async () => {

				const Inner = resource({ label: required(string()) });

				const Outer = resource({
					child: optional(reference(Inner))
				});

				expect(validateModel([{ child: { label: "x" } }], Outer, { depth: null })).toBeUndefined();

			});

			it("accepts IRI reference when depth is 0", async () => {

				const Inner = resource({ id: id(), label: required(string()) });

				const Outer = resource({
					child: optional(reference(Inner))
				});

				expect(validateModel([{ child: "app:/items/1" }], Outer, { depth: 0 })).toBeUndefined();

			});

			it("accepts nested model via reference when depth is 1", async () => {

				const Inner = resource({ label: required(string()) });

				const Outer = resource({
					child: optional(reference(Inner))
				});

				expect(validateModel([{ child: { label: "x" } }], Outer, { depth: 1 })).toBeUndefined();

			});

			it("rejects 2-level nesting via reference when depth is 1", async () => {

				const Leaf = resource({ value: required(string()) });

				const Middle = resource({
					leaf: optional(reference(Leaf))
				});

				const Root = resource({
					middle: optional(reference(Middle))
				});

				expect(validateModel([{
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

				expect(validateModel([{
					middle: { leaf: { value: "x" } }
				}], Root, { depth: 2 })).toBeUndefined();

			});

			it("rejects nested embedded resource when depth is 0", async () => {

				const Embedded = resource({ label: required(string()) });

				const Outer = resource({
					child: required(Embedded)
				});

				expect(validateModel([{ child: { label: "x" } }], Outer, { depth: 0 })).toBeDefined();

			});

			it("accepts nested embedded resource when depth is 1", async () => {

				const Embedded = resource({ label: required(string()) });

				const Outer = resource({
					child: required(Embedded)
				});

				expect(validateModel([{ child: { label: "x" } }], Outer, { depth: 1 })).toBeUndefined();

			});

			it("rejects collection resource query when depth is 0", async () => {

				const Target = resource({ name: required(string()) });

				const Outer = resource({
					items: multiple(reference(Target))
				});

				expect(validateModel([{ items: [{ name: "x" }] }], Outer, { depth: 0 })).toBeDefined();

			});

			it("accepts collection resource query when depth is 1", async () => {

				const Target = resource({ name: required(string()) });

				const Outer = resource({
					items: multiple(reference(Target))
				});

				expect(validateModel([{ items: [{ name: "x" }] }], Outer, { depth: 1 })).toBeUndefined();

			});

			it("reports malformed query key under the offending key", async () => {

				const Target = resource({ name: required(string()) });

				const Outer = resource({
					items: multiple(reference(Target))
				});

				const trace = validateModel([{ items: [{ "===invalid": "x" }] }], Outer, { depth: 1 });

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty(["[0]", "items", "===invalid"]);

			});

		});

		describe("bindings", () => {

			it("accepts valid binding key on model", async () => {

				const Target = resource({ released: required(year()) });

				// year: transform produces number, 0 is number — should be accepted

				expect(validateModel([{ "releaseYear=year:released": 0 }], Target, { depth: 0 })).toBeUndefined();

			});

			it("does not report binding key as unexpected property", async () => {

				const Target = resource({ name: required(string()) });

				// "alias=name" is a valid binding key — envelope should not reject it

				expect(validateModel([{ "alias=name": "" }], Target, { depth: 0 })).toBeUndefined();

			});

			it("rejects binding with wrong post-transform type", async () => {

				const Target = resource({ released: required(year()) });

				// year: produces number, "" is string — should be rejected

				const trace = validateModel([{ "releaseYear=year:released": "" }], Target, { depth: 0 });

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty(["[0]", "releaseYear=year:released"]);

			});

			it("accepts binding referencing undefined property", async () => {

				// apply() returns undefined for unknown property → lenient: no shape to validate against

				const Target = resource({ name: required(string()) });

				expect(validateModel([{ "y=year:missing": 0 }], Target, { depth: 0 })).toBeUndefined();

			});

		});

		describe("nested query criteria", () => {

			describe("projection properties", () => {

				it("accepts query with only projection properties", async () => {

					const Target = resource({ id: id(), name: required(string()), age: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{
						items: [{
							name: "",
							age: 0
						}]
					}], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts query with unknown projection binding", async () => {

					// extra=extra → apply() returns undefined → lenient

					const Target = resource({ id: id(), name: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{
						items: [{
							name: "",
							extra: ""
						}]
					}], Wrapper, { depth: null })).toBeUndefined();

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

					expect(validateModel([{ items: [query] }], Wrapper, { depth: null })).toBeUndefined();

				});

			});

			describe("type projection", () => {

				const Target = resource({ type: type(), name: required(string()), age: optional(integer()) });
				const Wrapper = resource({ items: multiple(reference(Target)) });

				it.each([
					["single", { type: "app:/types/Person" }],
					["leading", { type: "app:/types/Person", name: "", age: 0 }],
					["inner", { name: "", type: "app:/types/Person", age: 0 }],
					["trailing", { name: "", age: 0, type: "app:/types/Person" }]
				])("accepts type as %s projection property", async (_position, query) => {

					expect(validateModel([{ items: [query] }], Wrapper, { depth: null })).toBeUndefined();

				});

			});

			describe("filter criteria", () => {

				it("accepts comparison filter on existing property", async () => {

					const Target = resource({ name: required(string()), age: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ ">=age": 18 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts text search filter on string property", async () => {

					const Target = resource({ name: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "~name": "alice" }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts disjunctive filter on existing property", async () => {

					const Target = resource({ status: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "?status": "active" }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts conjunctive filter on existing property", async () => {

					const Target = resource({ tags: repeatable(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "!tags": "urgent" }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts filter on undefined property", async () => {

					// apply() returns undefined for unknown property → lenient

					const Target = resource({ name: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ ">=age": 18 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

			});

			describe("ordering criteria", () => {

				it("accepts sort ordering on existing property", async () => {

					const Target = resource({ name: required(string()), age: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{
						items: [{
							"^name": "asc",
							"^age": "desc"
						}]
					}], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts focus ordering on existing property", async () => {

					const Target = resource({ status: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "*status": ["active"] }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts ordering on undefined property", async () => {

					// apply() returns undefined for unknown property → lenient

					const Target = resource({ name: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "^missing": "asc" }] }], Wrapper, { depth: null })).toBeUndefined();

				});

			});

			describe("pagination", () => {

				const Target = resource({ name: required(string()) });
				const Wrapper = resource({ items: multiple(reference(Target)) });

				it("accepts offset and limit", async () => {
					expect(validateModel([{
						items: [{
							"@": 10,
							"#": 25
						}]
					}], Wrapper, { depth: null })).toBeUndefined();
				});

				it("accepts zero offset", async () => {
					expect(validateModel([{ items: [{ "@": 0 }] }], Wrapper, { depth: null })).toBeUndefined();
				});

				it("accepts zero limit", async () => {
					expect(validateModel([{ items: [{ "#": 0 }] }], Wrapper, { depth: null })).toBeUndefined();
				});

				it("rejects negative offset", async () => {
					expect(validateModel([{ items: [{ "@": -1 }] }], Wrapper, { depth: null })).toBeDefined();
				});

				it("rejects negative limit", async () => {
					expect(validateModel([{ items: [{ "#": -1 }] }], Wrapper, { depth: null })).toBeDefined();
				});

				it("rejects fractional offset", async () => {
					expect(validateModel([{ items: [{ "@": 1.5 }] }], Wrapper, { depth: null })).toBeDefined();
				});

				it("rejects fractional limit", async () => {
					expect(validateModel([{ items: [{ "#": 2.5 }] }], Wrapper, { depth: null })).toBeDefined();
				});

				it("rejects string offset", async () => {
					expect(validateModel([{ items: [{ "@": "10" }] }], Wrapper, { depth: null })).toBeDefined();
				});

				it("rejects string limit", async () => {
					expect(validateModel([{ items: [{ "#": "25" }] }], Wrapper, { depth: null })).toBeDefined();
				});

				it("rejects boolean offset", async () => {
					expect(validateModel([{ items: [{ "@": true }] }], Wrapper, { depth: null })).toBeDefined();
				});

				it("rejects null limit", async () => {
					expect(validateModel([{ items: [{ "#": null }] }], Wrapper, { depth: null })).toBeDefined();
				});

			});

			describe("mixed keys", () => {

				it("accepts projection, filter, ordering, and pagination together", async () => {

					const Target = resource({
						name: required(string()),
						age: optional(integer()),
						status: required(string())
					});

					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{
						items: [{
							name: "",
							">=age": 18,
							"~name": "alice",
							"^age": "asc",
							"@": 0,
							"#": 10
						}]
					}], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts unknown binding alongside valid query keys", async () => {

					// `extra` is a binding (identity shorthand), apply() returns undefined → lenient

					const Target = resource({ name: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{
						items: [{
							name: "",
							extra: "",
							"^name": "asc"
						}]
					}], Wrapper, { depth: null })).toBeUndefined();

				});

			});

			describe("nested model passthrough", () => {

				it("accepts plain nested model in reference tuple", async () => {

					const Member = resource({ name: required(string()) });
					const Wrapper = resource({ members: multiple(reference(Member)) });

					expect(validateModel([{ members: [{ name: "" }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts scalar reference with IRI string", async () => {

					const Target = resource({ id: id(), name: required(string()) });
					const Wrapper = resource({ supervisor: optional(reference(Target)) });

					expect(validateModel([{ supervisor: "app:/users/1" }], Wrapper, { depth: 0 })).toBeUndefined();

				});

				it("preserves local model validation", async () => {

					const Wrapper = resource({ label: required(local()) });

					expect(validateModel([{ label: { "en": "Hello" } }], Wrapper, { depth: 0 })).toBeUndefined();

				});

				it("preserves locals model validation", async () => {

					const Wrapper = resource({ labels: required(locals()) });

					expect(validateModel([{ labels: { "en": ["Hello"] as const } }], Wrapper, { depth: 0 })).toBeUndefined();

				});

				it("rejects local shape in collections", async () => {

					const Wrapper = resource({ label: multiple(local()) });

					expect(validateModel([{ label: [{ "en": "Hello" }] }], Wrapper, { depth: 0 })).toBeDefined();

				});

				it("rejects locals shape in collections", async () => {

					const Wrapper = resource({ labels: multiple(locals()) });

					expect(validateModel([{ labels: [{ "en": ["Hello"] as const }] }], Wrapper, { depth: 0 })).toBeDefined();

				});

			});

			describe("deep path criteria", () => {

				it("accepts filter with single-segment path", async () => {

					const Target = resource({ name: required(string()), age: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ ">=age": 18 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts filter through reference property", async () => {

					const Vendor = resource({ name: required(string()), rating: optional(integer()) });
					const Target = resource({ vendor: required(reference(Vendor)) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ ">=vendor.rating": 3 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts ordering through reference property", async () => {

					const Vendor = resource({ name: required(string()), rating: optional(integer()) });
					const Target = resource({ vendor: required(reference(Vendor)) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "^vendor.rating": "asc" }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts three-segment path through nested references", async () => {

					const Category = resource({ label: required(string()) });
					const Product = resource({ name: required(string()), category: required(reference(Category)) });
					const Target = resource({ product: required(reference(Product)) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "^product.category.label": "asc" }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts deep path with undefined nested property", async () => {

					// apply() returns undefined for unknown nested property → lenient

					const Vendor = resource({ name: required(string()) });
					const Target = resource({ vendor: required(reference(Vendor)) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ ">=vendor.rating": 3 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts deep path through leaf property", async () => {

					// apply() returns undefined for non-traversable leaf → lenient

					const Target = resource({ name: required(string()), age: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ ">=name.deep": 0 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

			});

			describe("union path criteria", () => {

				it("accepts filter through union variant reference", async () => {

					const ItemShape = resource({ score: optional(integer()) });
					const Target = resource({ item: required(union({ a: reference(ItemShape), b: string() })) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ ">=item.score": 5 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts deep path through union with missing property", async () => {

					// apply() returns undefined when no union variant has the property → lenient

					const ItemShape = resource({ score: optional(integer()) });
					const Target = resource({ item: required(union({ a: reference(ItemShape), b: string() })) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ ">=item.missing": 0 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

			});

			describe("binding criteria", () => {

				it("accepts binding with valid transform and projection type", async () => {

					const Target = resource({ name: required(string()), released: optional(year()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "releaseYear=year:released": 0 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("rejects binding with type mismatch in projection", async () => {

					const Target = resource({ name: required(string()), released: optional(year()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "releaseYear=year:released": "" }] }], Wrapper, { depth: null })).toBeDefined();

				});

				it("accepts binding referencing undefined property", async () => {

					// apply() returns undefined for unknown property → lenient

					const Target = resource({ name: required(string()), released: optional(year()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "y=year:missing": 0 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts chained aggregate transform", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "lowest=min:price": 0 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts multi-step chained transform", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "avg=round:avg:price": 0 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts count transform on empty path", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "total=count:": 0 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("rejects count transform with wrong projection type", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "total=count:": "" }] }], Wrapper, { depth: null })).toBeDefined();

				});

				it("accepts sum transform on empty path", async () => {

					// sum requires numeric, empty path resolves to resource shape → apply() returns undefined → lenient

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "total=sum:": 0 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts lower transform on empty path", async () => {

					// lower requires string, empty path resolves to resource shape → apply() returns undefined →
					// lenient

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "alias=lower:": "" }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts aggregate binding producing resource model", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "alias=min:": { name: "" } }] }], Wrapper, { depth: null })).toBeUndefined();

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


						expect(validateModel([{ items: [{ "alias=name": "" }] }], Wrapper, { depth: null })).toBeUndefined();

					});

					it("accepts identity binding on integer property", async () => {


						expect(validateModel([{ items: [{ "alias=age": 0 }] }], Wrapper, { depth: null })).toBeUndefined();

					});

					it("accepts identity binding on boolean property", async () => {


						expect(validateModel([{ items: [{ "alias=active": true }] }], Wrapper, { depth: null })).toBeUndefined();

					});

					it("accepts identity binding on reference property with IRI", async () => {


						expect(validateModel([{ items: [{ "alias=link": "app:/items/1" }] }], Wrapper, { depth: null })).toBeUndefined();

					});

					it("rejects identity binding on reference property with wrong type", async () => {


						expect(validateModel([{ items: [{ "alias=link": 0 }] }], Wrapper, { depth: null })).toBeDefined();

					});

					it("accepts identity binding on embedded resource with model", async () => {


						expect(validateModel([{ items: [{ "alias=child": { label: "" } }] }], Wrapper, { depth: null })).toBeUndefined();

					});

					it("rejects identity binding on embedded resource with invalid model", async () => {


						expect(validateModel([{ items: [{ "alias=child": { label: 0 } }] }], Wrapper, { depth: null })).toBeDefined();

					});

					it("accepts identity binding on embedded resource with unknown binding", async () => {

						// unknown=unknown → apply() returns undefined → lenient

						expect(validateModel([{ items: [{ "alias=child": { unknown: "" } }] }], Wrapper, { depth: null })).toBeUndefined();

					});

					it("rejects identity binding on embedded resource with non-object", async () => {


						expect(validateModel([{ items: [{ "alias=child": 42 }] }], Wrapper, { depth: null })).toBeDefined();

					});

					it("accepts aggregate binding on embedded resource with model", async () => {


						expect(validateModel([{ items: [{ "alias=min:child": { label: "" } }] }], Wrapper, { depth: null })).toBeUndefined();

					});

					it("rejects aggregate binding on embedded resource with invalid model", async () => {


						expect(validateModel([{ items: [{ "alias=min:child": { label: 0 } }] }], Wrapper, { depth: null })).toBeDefined();

					});

					it("rejects aggregate binding on embedded resource with non-object", async () => {


						expect(validateModel([{ items: [{ "alias=min:child": 42 }] }], Wrapper, { depth: null })).toBeDefined();

					});

					it("accepts identity binding on embedded resource with depth", async () => {


						expect(validateModel([{ items: [{ "alias=child": { label: "x" } }] }], Wrapper, { depth: null })).toBeUndefined();

					});

					it("accepts identity binding on reference property with query", async () => {


						expect(validateModel([{
							items: [{
								"alias=link": {
									label: "",
									"^label": "asc"
								}
							}]
						}], Wrapper, { depth: null })).toBeUndefined();

					});

					it("accepts identity binding on reference property with unknown binding", async () => {

						// unknown=unknown → apply() returns undefined → lenient

						expect(validateModel([{ items: [{ "alias=link": { unknown: "" } }] }], Wrapper, { depth: null })).toBeUndefined();

					});

					it("accepts identity binding on embedded resource with query", async () => {


						expect(validateModel([{
							items: [{
								"alias=child": {
									label: "",
									"^label": "asc"
								}
							}]
						}], Wrapper, { depth: null })).toBeUndefined();

					});

					it("accepts identity binding on embedded resource with unknown binding", async () => {

						// unknown=unknown → apply() returns undefined → lenient

						expect(validateModel([{ items: [{ "alias=child": { unknown: "" } }] }], Wrapper, { depth: null })).toBeUndefined();

					});

					it("accepts aggregate binding on reference property with query", async () => {


						expect(validateModel([{
							items: [{
								"alias=min:link": {
									label: "",
									">=label": "a"
								}
							}]
						}], Wrapper, { depth: null })).toBeUndefined();

					});

					it("accepts aggregate binding on embedded resource with query", async () => {


						expect(validateModel([{
							items: [{
								"alias=min:child": {
									label: "",
									">=label": "a"
								}
							}]
						}], Wrapper, { depth: null })).toBeUndefined();

					});

				});

			});

			describe("transform domain violations", () => {

				// apply() returns undefined for all domain violations → lenient: no shape to validate against

				it("accepts sum transform on string property", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "total=sum:name": 0 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts abs transform on reference property", async () => {

					const Target = resource({
						name: required(string()),
						price: optional(integer()),
						link: optional(reference(resource({ id: id() })))
					});
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "v=abs:link": 0 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts year transform on number property", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "y=year:price": 0 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts temporal transform on plain string property", async () => {

					const Target = resource({ name: required(string()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "m=month:name": 0 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts aggregate-after-aggregate pipe", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "x=sum:count:price": 0 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

			});

			describe("localised shape transforms", () => {

				it("accepts lower transform on local property", async () => {

					// lower: accepts string, returns same → valid for localised shapes

					const Target = resource({ label: required(local()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "alias=lower:label": { "en": "hello" } }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts upper transform on local property", async () => {

					const Target = resource({ label: required(local()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "alias=upper:label": { "en": "HELLO" } }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts length transform on local property", async () => {

					// length: accepts string, returns integer → not "same" → apply() returns undefined for localised →
					// lenient

					const Target = resource({ label: required(local()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "alias=length:label": 5 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts abs transform on local property", async () => {

					// abs requires numeric, local is not numeric → apply() returns undefined → lenient

					const Target = resource({ label: required(local()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "alias=abs:label": 0 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts lower transform on locals property", async () => {

					const Target = resource({ labels: required(locals()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "alias=lower:labels": { "en": ["hello"] as const } }] }], Wrapper, { depth: null })).toBeUndefined();

				});

			});

			describe("union partial domain match", () => {

				it("accepts numeric transform on union with numeric variant", async () => {

					// abs: numeric domain — integer variant survives, string variant filtered → Range(integer)

					const Target = resource({
						value: required(union({ num: integer(), text: string() }))
					});
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "alias=abs:value": 42 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("rejects numeric transform on union with numeric variant when template is wrong type", async () => {

					// abs on union(integer, string) → Range(integer), but template is string → rejects

					const Target = resource({
						value: required(union({ num: integer(), text: string() }))
					});
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "alias=abs:value": "wrong" }] }], Wrapper, { depth: null })).toBeDefined();

				});

				it("accepts string transform on union with string variant", async () => {

					// lower: string domain — string variant survives, integer variant filtered → Range(string)

					const Target = resource({
						value: required(union({ num: integer(), text: string() }))
					});
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "alias=lower:value": "" }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("accepts transform on union where no variant matches domain", async () => {

					// year: temporal domain — neither boolean nor integer is temporal → apply() returns undefined →
					// lenient

					const Target = resource({
						value: required(union({ flag: boolean(), count: integer() }))
					});
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "alias=year:value": 2024 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

			});

			describe("stats option", () => {

				it("accepts aggregate binding when stats is true", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "total=count:": 0 }] }], Wrapper, {
						depth: null,
						stats: true
					})).toBeUndefined();

				});

				it("accepts aggregate binding when stats is defaulted", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "total=count:": 0 }] }], Wrapper, { depth: null })).toBeUndefined();

				});

				it("rejects aggregate binding when stats is false", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "total=count:": 0 }] }], Wrapper, {
						depth: null,
						stats: false
					})).toBeDefined();

				});

				it("rejects min aggregate when stats is false", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "lowest=min:price": 0 }] }], Wrapper, {
						depth: null,
						stats: false
					})).toBeDefined();

				});

				it("rejects max aggregate when stats is false", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "highest=max:price": 0 }] }], Wrapper, {
						depth: null,
						stats: false
					})).toBeDefined();

				});

				it("rejects sum aggregate when stats is false", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "total=sum:price": 0 }] }], Wrapper, {
						depth: null,
						stats: false
					})).toBeDefined();

				});

				it("rejects avg aggregate when stats is false", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "average=avg:price": 0 }] }], Wrapper, {
						depth: null,
						stats: false
					})).toBeDefined();

				});

				it("rejects chained aggregate pipe when stats is false", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "x=sum:count:price": 0 }] }], Wrapper, {
						depth: null,
						stats: false
					})).toBeDefined();

				});

				it("accepts non-aggregate transform when stats is false", async () => {

					const Target = resource({ name: required(string()), released: optional(year()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "y=year:released": 0 }] }], Wrapper, {
						depth: null,
						stats: false
					})).toBeUndefined();

				});

				it("accepts scalar transform pipe when stats is false", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ "r=round:price": 0 }] }], Wrapper, {
						depth: null,
						stats: false
					})).toBeUndefined();

				});

				it("accepts plain property when stats is false", async () => {

					const Target = resource({ name: required(string()), price: optional(integer()) });
					const Wrapper = resource({ items: multiple(reference(Target)) });

					expect(validateModel([{ items: [{ name: "" }] }], Wrapper, {
						depth: null,
						stats: false
					})).toBeUndefined();

				});

				it("rejects aggregate on flat model when stats is false", async () => {

					const shape = resource({ name: required(string()), price: optional(integer()) });

					expect(validateModel([{ "total=count:": 0 }], shape, { depth: 0, stats: false })).toBeDefined();

				});

				it("accepts plain property on flat model when stats is false", async () => {

					const shape = resource({ name: required(string()), price: optional(integer()) });

					expect(validateModel([{ name: "" }], shape, { depth: 0, stats: false })).toBeUndefined();

				});

			});

			describe("operator semantics", () => {

				// operator/type compatibility must be evaluated against the effective shape
				// computed by apply(binding, shape), which accounts for transform pipelines

				const Target = resource({
					name: required(string()),
					age: optional(integer()),
					active: optional(boolean()),
					label: required(local()),
					labels: required(locals()),
					link: optional(reference(resource({ id: id(), label: required(string()) })))
				});
				const Wrapper = resource({ items: multiple(reference(Target)) });


				describe("text search operator (~)", () => {

					it("accepts text search on string property", async () => {
						expect(validateModel([{ items: [{ "~name": "alice" }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts text search on local property", async () => {
						expect(validateModel([{ items: [{ "~label": "hello" }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts text search on locals property", async () => {
						expect(validateModel([{ items: [{ "~labels": "hello" }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("rejects text search on number property", async () => {
						expect(validateModel([{ items: [{ "~age": "42" }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects text search on boolean property", async () => {
						expect(validateModel([{ items: [{ "~active": "true" }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects text search on reference property", async () => {
						expect(validateModel([{ items: [{ "~link": "test" }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("accepts text search on undefined property", async () => {

						// apply() returns undefined → lenient

						expect(validateModel([{ items: [{ "~missing": "x" }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("rejects number keywords on string property", async () => {
						expect(validateModel([{ items: [{ "~name": 42 }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects boolean keywords on string property", async () => {
						expect(validateModel([{ items: [{ "~name": true }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects null keywords on local property", async () => {
						expect(validateModel([{ items: [{ "~label": null }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects array keywords on string property", async () => {
						expect(validateModel([{ items: [{ "~name": ["a", "b"] }] }], Wrapper, { depth: null })).toBeDefined();
					});

				});

				describe("union keyword validation", () => {

					const UnionTarget = resource({
						value: required(union({
							text: string(),
							count: integer()
						}))
					});
					const UnionWrapper = resource({ items: multiple(reference(UnionTarget)) });

					it("accepts text search matching string union variant", async () => {
						expect(validateModel([{ items: [{ "~value": "hello" }] }], UnionWrapper, { depth: null })).toBeUndefined();
					});

					it("rejects text search matching no textual union variant", async () => {

						const NumericUnion = resource({
							value: required(union({
								count: integer(),
								flag: boolean()
							}))
						});
						const NumericWrapper = resource({ items: multiple(reference(NumericUnion)) });

						expect(validateModel([{ items: [{ "~value": "hello" }] }], NumericWrapper, { depth: null })).toBeDefined();

					});

				});

				describe("range operators (<, >, <=, >=)", () => {

					it("accepts range operator on string property", async () => {
						expect(validateModel([{ items: [{ ">=name": "alice" }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts range operator on boolean property", async () => {
						expect(validateModel([{ items: [{ ">=active": true }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("rejects range operator on local property", async () => {
						expect(validateModel([{ items: [{ ">=label": "x" }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects range operator on locals property", async () => {
						expect(validateModel([{ items: [{ ">=labels": "x" }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects range operator on reference property", async () => {
						expect(validateModel([{ items: [{ ">=link": "x" }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("accepts range operator on undefined property", async () => {

						// apply() returns undefined → lenient

						expect(validateModel([{ items: [{ ">=missing": 0 }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it.each([
						["<", "<age"],
						[">", ">age"],
						["<=", "<=age"],
						[">=", ">=age"]
					])("accepts %s operator on number property", async (_op, key) => {
						expect(validateModel([{ items: [{ [key]: 18 }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("rejects string limit on number property", async () => {
						expect(validateModel([{ items: [{ ">=age": "alice" }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects number limit on string property", async () => {
						expect(validateModel([{ items: [{ ">=name": 42 }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects boolean limit on number property", async () => {
						expect(validateModel([{ items: [{ ">=age": true }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects null limit on string property", async () => {
						expect(validateModel([{ items: [{ ">=name": null }] }], Wrapper, { depth: null })).toBeDefined();
					});

				});

				describe("union limit validation", () => {

					const UnionTarget = resource({
						value: required(union({
							text: string(),
							count: integer()
						}))
					});
					const UnionWrapper = resource({ items: multiple(reference(UnionTarget)) });

					it("accepts range limit matching first union variant", async () => {
						expect(validateModel([{ items: [{ ">=value": "hello" }] }], UnionWrapper, { depth: null })).toBeUndefined();
					});

					it("accepts range limit matching second union variant", async () => {
						expect(validateModel([{ items: [{ ">=value": 42 }] }], UnionWrapper, { depth: null })).toBeUndefined();
					});

					it("rejects range limit matching no union variant", async () => {
						expect(validateModel([{ items: [{ ">=value": true }] }], UnionWrapper, { depth: null })).toBeDefined();
					});

					it.each([
						["<", "<value"],
						[">", ">value"],
						["<=", "<=value"],
						[">=", ">=value"]
					])("accepts %s operator on union property with matching variant", async (_op, key) => {
						expect(validateModel([{ items: [{ [key]: 42 }] }], UnionWrapper, { depth: null })).toBeUndefined();
					});

				});

				describe("disjunctive/conjunctive operators (?, !)", () => {

					// single option values

					it("accepts disjunctive filter on string property", async () => {
						expect(validateModel([{ items: [{ "?name": "alice" }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts disjunctive filter on number property", async () => {
						expect(validateModel([{ items: [{ "?age": 18 }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts disjunctive filter on boolean property", async () => {
						expect(validateModel([{ items: [{ "?active": true }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts conjunctive filter on string property", async () => {
						expect(validateModel([{ items: [{ "!name": "alice" }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts conjunctive filter on number property", async () => {
						expect(validateModel([{ items: [{ "!age": 18 }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts conjunctive filter on boolean property", async () => {
						expect(validateModel([{ items: [{ "!active": true }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts null option on any property", async () => {
						expect(validateModel([{ items: [{ "?name": null }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts reference option on reference property", async () => {
						expect(validateModel([{ items: [{ "?link": "app:/items/1" }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					// array of options

					it("accepts array of options on string property", async () => {
						expect(validateModel([{ items: [{ "?name": ["alice", "bob"] }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts array of options on number property", async () => {
						expect(validateModel([{ items: [{ "?age": [18, 25] }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts array with null option", async () => {
						expect(validateModel([{ items: [{ "?name": ["alice", null] }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					// local/locals options

					it("accepts local option on local property", async () => {
						expect(validateModel([{ items: [{ "?label": { "en": "hello" } }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts string option on local property", async () => {
						expect(validateModel([{ items: [{ "?label": "hello" }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts locals option on locals property", async () => {
						expect(validateModel([{ items: [{ "?labels": { "en": ["hello"] as const } }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					// type mismatch rejections

					it("rejects string option on number property", async () => {
						expect(validateModel([{ items: [{ "?age": "alice" }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects number option on string property", async () => {
						expect(validateModel([{ items: [{ "?name": 42 }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects boolean option on number property", async () => {
						expect(validateModel([{ items: [{ "?age": true }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects array with mismatched option on number property", async () => {
						expect(validateModel([{ items: [{ "?age": [18, "wrong"] }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects number option on local property", async () => {
						expect(validateModel([{ items: [{ "?label": 42 }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects number option on locals property", async () => {
						expect(validateModel([{ items: [{ "?labels": 42 }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects non-IRI string option on reference property", async () => {
						expect(validateModel([{ items: [{ "?link": "not-an-iri" }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects conjunctive string option on number property", async () => {
						expect(validateModel([{ items: [{ "!age": "alice" }] }], Wrapper, { depth: null })).toBeDefined();
					});

					// undefined property

					it("accepts option on undefined property", async () => {

						// apply() returns undefined → lenient

						expect(validateModel([{ items: [{ "?missing": "x" }] }], Wrapper, { depth: null })).toBeUndefined();
					});

				});

				describe("focus operator (*)", () => {

					it("accepts focus on string property", async () => {
						expect(validateModel([{ items: [{ "*name": ["alice"] }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts focus on number property", async () => {
						expect(validateModel([{ items: [{ "*age": [18] }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts focus on boolean property", async () => {
						expect(validateModel([{ items: [{ "*active": [true] }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts focus with null option", async () => {
						expect(validateModel([{ items: [{ "*name": [null, "alice"] }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts focus with reference option on reference property", async () => {
						expect(validateModel([{ items: [{ "*link": "app:/items/1" }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts focus with local option on local property", async () => {
						expect(validateModel([{ items: [{ "*label": { "en": "hello" } }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("rejects focus with string option on number property", async () => {
						expect(validateModel([{ items: [{ "*age": "alice" }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects focus with number option on string property", async () => {
						expect(validateModel([{ items: [{ "*name": 42 }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects focus with non-IRI string on reference property", async () => {
						expect(validateModel([{ items: [{ "*link": "not-an-iri" }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects focus with mismatched array element on number property", async () => {
						expect(validateModel([{ items: [{ "*age": [18, "wrong"] }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("accepts focus on undefined property", async () => {
						expect(validateModel([{ items: [{ "*missing": "x" }] }], Wrapper, { depth: null })).toBeUndefined();
					});

				});

				describe("union option validation", () => {

					const UnionTarget = resource({
						value: required(union({
							text: string(),
							count: integer()
						})),
						link: optional(reference(resource({ id: id() })))
					});
					const UnionWrapper = resource({ items: multiple(reference(UnionTarget)) });

					// disjunctive filter

					it("accepts disjunctive filter matching first union variant", async () => {
						expect(validateModel([{ items: [{ "?value": "hello" }] }], UnionWrapper, { depth: null })).toBeUndefined();
					});

					it("accepts disjunctive filter matching second union variant", async () => {
						expect(validateModel([{ items: [{ "?value": 42 }] }], UnionWrapper, { depth: null })).toBeUndefined();
					});

					it("accepts null option on union property", async () => {
						expect(validateModel([{ items: [{ "?value": null }] }], UnionWrapper, { depth: null })).toBeUndefined();
					});

					it("rejects option matching no union variant", async () => {
						expect(validateModel([{ items: [{ "?value": true }] }], UnionWrapper, { depth: null })).toBeDefined();
					});

					// conjunctive filter

					it("accepts conjunctive filter matching one union variant", async () => {
						expect(validateModel([{ items: [{ "!value": "hello" }] }], UnionWrapper, { depth: null })).toBeUndefined();
					});

					it("rejects conjunctive filter matching no union variant", async () => {
						expect(validateModel([{ items: [{ "!value": true }] }], UnionWrapper, { depth: null })).toBeDefined();
					});

					// focus operator

					it("accepts focus option matching one union variant", async () => {
						expect(validateModel([{ items: [{ "*value": ["hello"] }] }], UnionWrapper, { depth: null })).toBeUndefined();
						expect(validateModel([{ items: [{ "*value": [42] }] }], UnionWrapper, { depth: null })).toBeUndefined();
					});

					it("rejects focus option matching no union variant", async () => {
						expect(validateModel([{ items: [{ "*value": [true] }] }], UnionWrapper, { depth: null })).toBeDefined();
					});

					// array of options

					it("accepts array of options each matching some union variant", async () => {
						expect(validateModel([{ items: [{ "?value": ["hello", 42] }] }], UnionWrapper, { depth: null })).toBeUndefined();
					});

					it("rejects array with option matching no union variant", async () => {
						expect(validateModel([{ items: [{ "?value": ["hello", true] }] }], UnionWrapper, { depth: null })).toBeDefined();
					});

				});

				describe("sort operator (^)", () => {

					it("accepts 'asc' sort value", async () => {
						expect(validateModel([{ items: [{ "^name": "asc" }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts 'desc' sort value", async () => {
						expect(validateModel([{ items: [{ "^name": "desc" }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts positive number sort value", async () => {
						expect(validateModel([{ items: [{ "^name": 1 }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts negative number sort value", async () => {
						expect(validateModel([{ items: [{ "^name": -1 }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts zero sort value", async () => {
						expect(validateModel([{ items: [{ "^name": 0 }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("rejects boolean sort value", async () => {
						expect(validateModel([{ items: [{ "^name": true }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects null sort value", async () => {
						expect(validateModel([{ items: [{ "^name": null }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("rejects arbitrary string sort value", async () => {
						expect(validateModel([{ items: [{ "^name": "ascending" }] }], Wrapper, { depth: null })).toBeDefined();
					});

					it("accepts sort on number property", async () => {
						expect(validateModel([{ items: [{ "^age": "asc" }] }], Wrapper, { depth: null })).toBeUndefined();
					});

					it("accepts sort on undefined property", async () => {
						expect(validateModel([{ items: [{ "^missing": "asc" }] }], Wrapper, { depth: null })).toBeUndefined();
					});

				});

				describe("effective shape with transforms", () => {

					it("accepts range operator on transform-derived number", async () => {

						// year transform on year property → effective kind is "number"

						const T = resource({ released: optional(year()) });
						const W = resource({ items: multiple(reference(T)) });

						expect(validateModel([{ items: [{ ">=year:released": 2020 }] }], W, { depth: null })).toBeUndefined();
					});

					it("rejects text search on transform-derived number", async () => {

						// count transform → effective kind is "number"

						const T = resource({ name: required(string()), price: optional(integer()) });
						const W = resource({ items: multiple(reference(T)) });

						expect(validateModel([{ items: [{ "~count:price": "x" }] }], W, { depth: null })).toBeDefined();
					});

					it("accepts text search on transform-preserving string", async () => {

						// lower transform on string → effective kind is "string"

						const T = resource({ name: required(string()) });
						const W = resource({ items: multiple(reference(T)) });

						expect(validateModel([{ items: [{ "~lower:name": "alice" }] }], W, { depth: null })).toBeUndefined();
					});

					it("accepts operator when transform makes apply() return undefined", async () => {

						// sum on string property → apply() returns undefined → lenient

						const T = resource({ name: required(string()) });
						const W = resource({ items: multiple(reference(T)) });

						expect(validateModel([{ items: [{ "~sum:name": "x" }] }], W, { depth: null })).toBeUndefined();
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

				const trace = validateModel([{ items: [{ name: 42 }] } as any], shape, { depth: null }) as Record<string, Trace>;

				expect(trace).toHaveProperty(["[0]", "items"]);

				const items = (trace["[0]"] as Record<string, Trace>)["items"] as Record<string, Trace>;

				expect(items).toHaveProperty("name");
				expect(items).not.toHaveProperty("[0]");

			});

			it("keys violations by @id for single nested model", async () => {

				const shape = resource({
					items: multiple(reference(Target))
				});

				const trace = validateModel([{
					items: [
						{ "id": "app:/items/1", name: 42 }
					]
				} as any], shape, { depth: null }) as Record<string, Trace>;

				expect(trace).toHaveProperty(["[0]", "items"]);

				const items = (trace["[0]"] as Record<string, Trace>)["items"] as Record<string, Trace>;

				expect(items).toHaveProperty("name");

			});

			it("keys violations by blank node for single nested model without id property", async () => {

				const shape = resource({
					items: multiple(reference(TargetWithoutId))
				});

				const trace = validateModel([{
					items: [
						{ name: 42 }
					]
				} as any], shape, { depth: null }) as Record<string, Trace>;

				expect(trace).toHaveProperty(["[0]", "items"]);

				const items = (trace["[0]"] as Record<string, Trace>)["items"] as Record<string, Trace>;

				expect(items).toHaveProperty("name");

			});

			it("includes only invalid nested models in trace", async () => {

				const shape = resource({
					items: multiple(reference(Target))
				});

				const trace = validateModel([{
					items: [
						{ "id": "app:/items/2", name: 42 }
					]
				} as any], shape, { depth: null }) as Record<string, Trace>;

				expect(trace).toHaveProperty(["[0]", "items"]);

				const items = (trace["[0]"] as Record<string, Trace>)["items"] as Record<string, Trace>;

				expect(items).toHaveProperty("name");

			});

			it("returns undefined when all nested models are valid", async () => {

				const shape = resource({
					items: multiple(reference(Target))
				});

				expect(validateModel([{
					items: [
						{ "id": "app:/items/1", name: "Alice" }
					] as any
				}], shape, { depth: null })).toBeUndefined();

			});

		});

	});

});

describe("utilities", () => {

	describe("flatten", () => {

		describe("no inheritance", () => {

			it("returns equivalent shape for shape without extends", async () => {

				const shape = resource({ name: required(string()), age: optional(integer()) });
				const flat = flatten(shape);

				expect(flat.kind).toBe("resource");
				expect(flat.properties).toHaveProperty("name");
				expect(flat.properties).toHaveProperty("age");

			});

			it("preserves undefined extends", async () => {

				const shape = resource({ name: required(string()) });
				const flat = flatten(shape);

				expect(flat.extends).toBeUndefined();

			});

		});

		describe("single parent", () => {

			it("merges parent properties into child", async () => {

				const parent = resource({ age: optional(integer()) });
				const child = resource({ extends: parent }, { name: required(string()) });

				const flat = flatten(child);

				expect(flat.properties).toHaveProperty("name");
				expect(flat.properties).toHaveProperty("age");

			});

			it("narrows overlapping constraints from parent", async () => {

				const parent = resource({ name: required(string({ maxLength: 100 })) });
				const child = resource({ extends: parent }, { name: required(string({ minLength: 5 })) });

				const flat = flatten(child);

				const prop = flat.properties["name"] as Property;

				expect((prop.range.shape as any).minLength).toBe(5);
				expect((prop.range.shape as any).maxLength).toBe(100);

			});

			it("preserves extends for reference", async () => {

				const parent = resource({});
				const child = resource({ extends: parent }, {});

				const flat = flatten(child);

				expect(flat.extends).toBe(parent);

			});

		});

		describe("multi-level inheritance", () => {

			it("merges grandparent properties through chain", async () => {

				const grandparent = resource({ code: required(string()) });
				const parent = resource({ extends: grandparent }, { age: optional(integer()) });
				const child = resource({ extends: parent }, { name: required(string()) });

				const flat = flatten(child);

				expect(flat.properties).toHaveProperty("code");
				expect(flat.properties).toHaveProperty("age");
				expect(flat.properties).toHaveProperty("name");

			});

		});

		describe("preserved fields", () => {

			it("preserves kind", async () => {

				const flat = flatten(resource({}));

				expect(flat.kind).toBe("resource");

			});

			it("preserves name from input shape", async () => {

				const parent = resource({ name: "Parent" }, {});
				const child = resource({ extends: parent, name: "Child" }, {});

				const flat = flatten(child);

				expect(flat.name).toEqual("Child");

			});

			it("preserves description from input shape", async () => {

				const parent = resource({ description: "Parent desc" }, {});
				const child = resource({ extends: parent, description: "Child desc" }, {});

				const flat = flatten(child);

				expect(flat.description).toEqual("Child desc");

			});

			it("preserves class from input shape", async () => {

				const parent = resource({ class: "http://example.org/Parent" }, {});
				const child = resource({ extends: parent, class: "http://example.org/Child" }, {});

				const flat = flatten(child);

				expect(flat.class).toBe("http://example.org/Child");

			});

		});

		describe("conjunctive fields", () => {

			it("accumulates classes from lineage", async () => {

				const parent = resource({ class: "http://example.org/Parent" }, {});
				const child = resource({
					extends: parent,
					class: "http://example.org/Child",
					classes: ["http://example.org/A"]
				}, {});

				const flat = flatten(child);

				expect(flat.classes).toContain("http://example.org/Parent");
				expect(flat.classes).toContain("http://example.org/A");

			});

			it("intersects in constraints from lineage", async () => {

				const parent = resource({
					in: ["http://example.org/a", "http://example.org/b"]
				}, {});

				const child = resource({
					extends: parent,
					in: ["http://example.org/b", "http://example.org/c"]
				}, {});

				const flat = flatten(child);

				expect(flat.in).toEqual(["http://example.org/b"]);

			});

			it("unions hasValue from lineage", async () => {

				const parent = resource({ hasValue: ["http://example.org/a"] }, {});
				const child = resource({
					extends: parent,
					hasValue: ["http://example.org/b"]
				}, {});

				const flat = flatten(child);

				expect(flat.hasValue).toContain("http://example.org/a");
				expect(flat.hasValue).toContain("http://example.org/b");

			});

			it("unions validators from lineage", async () => {

				const v1: Validator = () => undefined;
				const v2: Validator = () => undefined;

				const parent = resource({ validators: [v1] }, {});
				const child = resource({ extends: parent, validators: [v2] }, {});

				const flat = flatten(child);

				expect(flat.validators).toContain(v1);
				expect(flat.validators).toContain(v2);

			});

		});

		describe("inherit fields", () => {

			describe("virtual", () => {

				describe("linear", () => {

					it("inherits virtual from parent when child has none", async () => {

						const parent = resource({ virtual: true }, {});
						const child = resource({ extends: parent }, {});

						const flat = flatten(child);

						expect(flat.virtual).toBe(true);

					});

					it("child overrides parent virtual", async () => {

						const parent = resource({ virtual: true }, {});
						const child = resource({ extends: parent, virtual: false }, {});

						const flat = flatten(child);

						expect(flat.virtual).toBe(false);

					});

					it("grandparent virtual overridden by parent propagates to child", async () => {

						const grandparent = resource({ virtual: true }, {});
						const parent = resource({ extends: grandparent, virtual: false }, {});
						const child = resource({ extends: parent }, {});

						const flat = flatten(child);

						expect(flat.virtual).toBe(false);

					});

				});

				describe("branched", () => {

					it("inherits virtual when both parents agree", async () => {

						const parentA = resource({ virtual: true }, {});
						const parentB = resource({ virtual: true }, {});
						const child = resource({ extends: [parentA, parentB] }, {});

						const flat = flatten(child);

						expect(flat.virtual).toBe(true);

					});

					it("child overrides conflicting parents", async () => {

						const parentA = resource({ virtual: true }, {});
						const parentB = resource({ virtual: false }, {});
						const child = resource({ extends: [parentA, parentB], virtual: true }, {});

						const flat = flatten(child);

						expect(flat.virtual).toBe(true);

					});

					it("rejects conflicting parents without child override", async () => {

						const parentA = resource({ virtual: true }, {});
						const parentB = resource({ virtual: false }, {});

						expect(() => resource({ extends: [parentA, parentB] }, {})).toThrow(RangeError);

					});

					it("rejects undefined vs defined conflict without child override", async () => {

						const parentA = resource({ virtual: true }, {});
						const parentB = resource({});

						expect(() => resource({ extends: [parentA, parentB] }, {})).toThrow(RangeError);

					});

				});

			});

			describe("namespace", () => {

				describe("linear", () => {

					it("inherits namespace from parent when child has none", async () => {

						const ns = createNamespace("http://example.org/");
						const parent = resource({ namespace: ns }, {});
						const child = resource({ extends: parent }, {});

						const flat = flatten(child);

						expect(flat.namespace).toBe(ns);

					});

					it("child overrides parent namespace", async () => {

						const nsParent = createNamespace("http://parent.org/");
						const nsChild = createNamespace("http://child.org/");
						const parent = resource({ namespace: nsParent }, {});
						const child = resource({ extends: parent, namespace: nsChild }, {});

						const flat = flatten(child);

						expect(flat.namespace).toBe(nsChild);

					});

					it("grandparent namespace overridden by parent propagates to child", async () => {

						const nsGrand = createNamespace("http://grand.org/");
						const nsParent = createNamespace("http://parent.org/");
						const grandparent = resource({ namespace: nsGrand }, {});
						const parent = resource({ extends: grandparent, namespace: nsParent }, {});
						const child = resource({ extends: parent }, {});

						const flat = flatten(child);

						expect(flat.namespace).toBe(nsParent);

					});

				});

				describe("branched", () => {

					it("inherits namespace when both parents agree", async () => {

						const ns = createNamespace("http://example.org/");
						const parentA = resource({ namespace: ns }, {});
						const parentB = resource({ namespace: ns }, {});
						const child = resource({ extends: [parentA, parentB] }, {});

						const flat = flatten(child);

						expect(flat.namespace).toBe(ns);

					});

					it("child overrides conflicting parents", async () => {

						const nsA = createNamespace("http://a.org/");
						const nsB = createNamespace("http://b.org/");
						const nsChild = createNamespace("http://child.org/");
						const parentA = resource({ namespace: nsA }, {});
						const parentB = resource({ namespace: nsB }, {});
						const child = resource({ extends: [parentA, parentB], namespace: nsChild }, {});

						const flat = flatten(child);

						expect(flat.namespace).toBe(nsChild);

					});

					it("rejects conflicting parents without child override", async () => {

						const nsA = createNamespace("http://a.org/");
						const nsB = createNamespace("http://b.org/");
						const parentA = resource({ namespace: nsA }, {});
						const parentB = resource({ namespace: nsB }, {});

						expect(() => resource({ extends: [parentA, parentB] }, {})).toThrow();

					});

					it("rejects undefined vs defined conflict without child override", async () => {

						const ns = createNamespace("http://example.org/");
						const parentA = resource({ namespace: ns }, {});
						const parentB = resource({});

						expect(() => resource({ extends: [parentA, parentB] }, {})).toThrow();

					});

				});

			});

			describe.each([
				"hidden" as const,
				"computed" as const
			])("%s", (field) => {

				describe("linear", () => {

					it(`inherits ${field} from parent property when child has none`, async () => {

						const parent = resource({ field: property({ [field]: true }, required(string())) });
						const child = resource({ extends: parent }, { field: property(required(string())) });

						const flat = flatten(child);

						expect((flat.properties.field as Property)[field]).toBe(true);

					});

					it(`child overrides parent ${field}`, async () => {

						const parent = resource({ field: property({ [field]: true }, required(string())) });
						const child = resource({ extends: parent }, { field: property({ [field]: false }, required(string())) });

						const flat = flatten(child);

						expect((flat.properties.field as Property)[field]).toBe(false);

					});

					it(`grandparent ${field} overridden by parent propagates to child`, async () => {

						const grandparent = resource({ field: property({ [field]: true }, required(string())) });
						const parent = resource({ extends: grandparent }, { field: property({ [field]: false }, required(string())) });
						const child = resource({ extends: parent }, { field: property(required(string())) });

						const flat = flatten(child);

						expect((flat.properties.field as Property)[field]).toBe(false);

					});

				});

				describe("branched", () => {

					it(`inherits ${field} when both parents agree`, async () => {

						const parentA = resource({ field: property({ [field]: true }, required(string())) });
						const parentB = resource({ field: property({ [field]: true }, required(string())) });
						const child = resource({ extends: [parentA, parentB] }, { field: property(required(string())) });

						const flat = flatten(child);

						expect((flat.properties.field as Property)[field]).toBe(true);

					});

					it("child overrides conflicting parents", async () => {

						const parentA = resource({ field: property({ [field]: true }, required(string())) });
						const parentB = resource({ field: property({ [field]: false }, required(string())) });
						const child = resource({ extends: [parentA, parentB] }, { field: property({ [field]: true }, required(string())) });

						const flat = flatten(child);

						expect((flat.properties.field as Property)[field]).toBe(true);

					});

					it("rejects conflicting parents without child override", async () => {

						const parentA = resource({ field: property({ [field]: true }, required(string())) });
						const parentB = resource({ field: property({ [field]: false }, required(string())) });

						expect(() => resource({ extends: [parentA, parentB] }, { field: property(required(string())) })).toThrow(RangeError);

					});

					it("rejects undefined vs defined conflict without child override", async () => {

						const parentA = resource({ field: property({ [field]: true }, required(string())) });
						const parentB = resource({ field: property(required(string())) });

						expect(() => resource({ extends: [parentA, parentB] }, { field: property(required(string())) })).toThrow(RangeError);

					});

				});

			});

		});

		describe("error cases", () => {

			it("rejects incompatible property kind overrides", async () => {

				const parent = resource({ field: id() });

				expect(() => resource({ extends: parent }, { field: required(string()) })).toThrow(RangeError);

			});

		});

		describe("singleton conflicts", () => {

			describe("checkSingletons", () => {

				it("accepts properties with no id or type", async () => {

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

					const child = resource({ extends: parent }, {
						age: required(integer())
					});

					// manually assemble a shape with duplicate id — bypassing factory check
					const manual: ResourceShape = {
						...child,
						properties: {
							...child.properties,
							rid2: id()
						}
					};

					expect(() => flatten(manual)).toThrow(RangeError);

				});

				it("rejects duplicate type entries from inheritance", async () => {

					const parent = resource({
						rtype: type(),
						name: required(string())
					});

					const child = resource({ extends: parent }, {
						age: required(integer())
					});

					// manually assemble a shape with duplicate type — bypassing factory check
					const manual: ResourceShape = {
						...child,
						properties: {
							...child.properties,
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

					const child = resource({ extends: parent }, {
						age: required(integer())
					});

					expect(() => flatten(child)).not.toThrow();

				});

			});

		});

		describe("checkParents", () => {

			it("returns undefined for single parent", async () => {

				const parent = resource({ name: required(string()) });
				const child = resource({ extends: parent }, { age: required(integer()) });

				expect(checkParents(child, [flatten(parent)])).toBeUndefined();

			});

			it("returns undefined when parents agree on virtual", async () => {

				const parentA = resource({ virtual: true }, { name: required(string()) });
				const parentB = resource({ virtual: true }, { age: required(integer()) });
				const child = resource({ extends: [parentA, parentB] }, {});

				expect(checkParents(child, [flatten(parentA), flatten(parentB)])).toBeUndefined();

			});

			it("reports conflicting virtual without child override", async () => {

				const parentA = resource({ virtual: true }, { name: required(string()) });
				const parentB = resource({}, { age: required(integer()) });
				const child = resource({}, {});

				expect(checkParents(child, [flatten(parentA), flatten(parentB)])).toBeDefined();

			});

			it("returns undefined when child overrides conflicting virtual", async () => {

				const parentA = resource({ virtual: true }, { name: required(string()) });
				const parentB = resource({}, { age: required(integer()) });
				const child = resource({ virtual: false }, {});

				expect(checkParents(child, [flatten(parentA), flatten(parentB)])).toBeUndefined();

			});

			it("returns undefined when parents agree on namespace", async () => {

				const ns = createNamespace("http://example.org/");
				const parentA = resource({ namespace: ns }, { name: required(string()) });
				const parentB = resource({ namespace: ns }, { age: required(integer()) });
				const child = resource({}, {});

				expect(checkParents(child, [flatten(parentA), flatten(parentB)])).toBeUndefined();

			});

			it("reports conflicting namespace without child override", async () => {

				const parentA = resource({ namespace: createNamespace("http://example.org/") }, { name: required(string()) });
				const parentB = resource({ namespace: createNamespace("http://other.org/") }, { age: required(integer()) });
				const child = resource({}, {});

				expect(checkParents(child, [flatten(parentA), flatten(parentB)])).toBeDefined();

			});

			it.each([
				"hidden" as const,
				"computed" as const
			])("reports conflicting %s without child override", async (field) => {

				const parentA = resource({ field: property({ [field]: true }, required(string())) });
				const parentB = resource({ field: property({ [field]: false }, required(string())) });
				const child = resource({}, {});

				expect(checkParents(child, [flatten(parentA), flatten(parentB)])).toBeDefined();

			});

			it.each([
				"hidden" as const,
				"computed" as const
			])("returns undefined when child overrides conflicting %s", async (field) => {

				const parentA = resource({ field: property({ [field]: true }, required(string())) });
				const parentB = resource({ field: property({ [field]: false }, required(string())) });
				const child = resource({ field: property({ [field]: true }, required(string())) });

				expect(checkParents(child, [flatten(parentA), flatten(parentB)])).toBeUndefined();

			});

		});

		describe("checkPredicates", () => {

			it("returns undefined for distinct forward predicates", async () => {

				const shape = resource({
					name: property({ forward: "http://example.org/name" }, required(string())),
					label: property({ forward: "http://example.org/label" }, required(string()))
				});

				expect(checkPredicates(shape)).toBeUndefined();

			});

			it("reports duplicate forward predicates", async () => {

				const base = resource({ name: property({ forward: "http://example.org/name" }, required(string())) });

				const manual: ResourceShape = {
					...base,
					properties: {
						...base.properties,
						label: { kind: "property", forward: "http://example.org/name", range: required(string()) }
					}
				};

				expect(checkPredicates(manual)).toBeDefined();

			});

			it("returns undefined for distinct reverse predicates", async () => {

				const shape = resource({
					owner: property({ reverse: "http://example.org/owns" }, required(string())),
					creator: property({ reverse: "http://example.org/created" }, required(string()))
				});

				expect(checkPredicates(shape)).toBeUndefined();

			});

			it("reports duplicate reverse predicates", async () => {

				const base = resource({ owner: property({ reverse: "http://example.org/owns" }, required(string())) });

				const manual: ResourceShape = {
					...base,
					properties: {
						...base.properties,
						creator: { kind: "property", reverse: "http://example.org/owns", range: required(string()) }
					}
				};

				expect(checkPredicates(manual)).toBeDefined();

			});

			it("checks forward and reverse independently", async () => {

				const shape = resource({
					name: property({ forward: "http://example.org/name" }, required(string())),
					owner: property({ reverse: "http://example.org/name" }, required(string()))
				});

				expect(checkPredicates(shape)).toBeUndefined();

			});

			it("ignores non-property entries", async () => {

				const shape = resource({
					rid: id(),
					rtype: type(),
					name: property({ forward: "http://example.org/name" }, required(string()))
				});

				expect(checkPredicates(shape)).toBeUndefined();

			});

		});

		describe("predicate conflicts", () => {

			describe.each([
				["forward", "reverse", "name", "label", "http://example.org/name", "http://example.org/label"] as const,
				["reverse", "forward", "owner", "creator", "http://example.org/owns", "http://example.org/created"] as const
			])("%s", (direction, opposite, prop1, prop2, iri1, iri2) => {

				it(`accepts distinct ${direction} predicates`, async () => {

					const shape = resource({
						[prop1]: property({ [direction]: iri1 }, required(string())),
						[prop2]: property({ [direction]: iri2 }, required(string()))
					});

					expect(() => flatten(shape)).not.toThrow();

				});

				it(`rejects duplicate ${direction} predicates`, async () => {

					expect(() => resource({
						[prop1]: property({ [direction]: iri1 }, required(string())),
						[prop2]: property({ [direction]: iri1 }, required(string()))
					})).toThrow(RangeError);

				});

				it(`rejects duplicate ${direction} predicates from inheritance`, async () => {

					const parent = resource({ [prop1]: property({ [direction]: iri1 }, required(string())) });

					expect(() => resource({ extends: parent }, {
						[prop2]: property({ [direction]: iri1 }, required(string()))
					})).toThrow(RangeError);

				});

				it(`ignores properties without ${direction} predicates`, async () => {

					const shape = resource({
						[prop1]: property({ [opposite]: iri1 }, required(string())),
						[prop2]: property({ [opposite]: iri2 }, required(string()))
					});

					expect(() => flatten(shape)).not.toThrow();

				});

			});

			it("checks forward and reverse independently", async () => {

				const shape = resource({
					name: property({ forward: "http://example.org/name" }, required(string())),
					owner: property({ reverse: "http://example.org/name" }, required(string()))
				});

				expect(() => flatten(shape)).not.toThrow();

			});

		});

		describe("model", () => {

			it("computes model from merged properties", async () => {

				const parent = resource({ age: optional(integer()) });
				const child = resource({ extends: parent }, { name: required(string()) });

				const flat = flatten(child);

				expect(flat.model).toHaveProperty("name", "");
				expect(flat.model).toHaveProperty("age", 1);

			});

		});

		describe("idempotency", () => {

			it("returns same reference on repeated calls", async () => {

				const parent = resource({ age: optional(integer()) });
				const child = resource({ extends: parent }, { name: required(string()) });

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
					return resource({ extends: Self }, { name: required(string()) });
				}

				expect(() => flatten(Self())).toThrow(TraceError);

			});

			it("rejects two-node cycle", async () => {

				function A(): ResourceShape {
					return resource({ extends: B }, { a: required(string()) });
				}

				function B(): ResourceShape {
					return resource({ extends: A }, { b: required(string()) });
				}

				expect(() => flatten(A())).toThrow(TraceError);

			});

			it("rejects three-node cycle", async () => {

				function A(): ResourceShape {
					return resource({ extends: B }, { a: required(string()) });
				}

				function B(): ResourceShape {
					return resource({ extends: C }, { b: required(string()) });
				}

				function C(): ResourceShape {
					return resource({ extends: A }, { c: required(string()) });
				}

				expect(() => flatten(A())).toThrow(TraceError);

			});

			it("rejects cycle in multi-parent extends", async () => {

				const Base = resource({ base: required(string()) });

				function X(): ResourceShape {
					return resource({ extends: [Base, Y] }, { x: required(string()) });
				}

				function Y(): ResourceShape {
					return resource({ extends: X }, { y: required(string()) });
				}

				expect(() => flatten(X())).toThrow(TraceError);

			});

		});

	});

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

});
