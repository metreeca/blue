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
import type { Validator } from "./index.js";
import { local, locals } from "./local.js";
import { integer } from "./number.js";
import {
	isReferenceShape,
	match,
	validateModel,
	validateQuery,
	validateReference,
	validateResource
} from "./resource.core.js";
import {
	backlink,
	cardinality,
	id,
	isEntries,
	isEntry,
	isId,
	isProperty,
	isPropertyConstraints,
	isRange,
	isResourceConstraints,
	isResourceShape,
	isType,
	isUnion,
	multiple,
	optional,
	property,
	type Property,
	type Range,
	reference,
	repeatable,
	required,
	resource,
	type,
	union,
	type Union
} from "./resource.js";
import { string } from "./string.js";


describe("guards", () => {

	describe("isResourceShape", () => {

		it("returns true for valid resource shape", async () => {

			expect(isResourceShape(resource({ name: property(required(string())) }))).toBe(true);

		});

		it("returns false for object with wrong kind", async () => {

			expect(isResourceShape({ kind: "string", model: {}, properties: {} })).toBe(false);

		});

		it("returns false for non-object values", async () => {

			expect(isResourceShape(null)).toBe(false);
			expect(isResourceShape(undefined)).toBe(false);

		});

		it("returns false for multiple id entries", async () => {

			expect(isResourceShape({
				kind: "resource",
				model: {},
				properties: {
					id1: { kind: "id" },
					id2: { kind: "id" }
				}
			})).toBe(false);

		});

		it("returns false for multiple type entries", async () => {

			expect(isResourceShape({
				kind: "resource",
				model: {},
				properties: {
					type1: { kind: "type" },
					type2: { kind: "type" }
				}
			})).toBe(false);

		});

		it("returns true for single id and single type entry", async () => {

			expect(isResourceShape({
				kind: "resource",
				model: {},
				properties: {
					id: { kind: "id" },
					type: { kind: "type" }
				}
			})).toBe(true);

		});

	});

	describe("isResourceConstraints", () => {

		it("returns true for empty object", async () => {

			expect(isResourceConstraints({})).toBe(true);

		});

		it("returns true for object with valid constraints", async () => {

			expect(isResourceConstraints({ virtual: true })).toBe(true);
			expect(isResourceConstraints({ pattern: "/users/{id}" })).toBe(true);
			expect(isResourceConstraints({ validators: [() => []] })).toBe(true);

		});

		it("returns false for object with invalid validators", async () => {

			expect(isResourceConstraints({ validators: "not-array" })).toBe(false);
			expect(isResourceConstraints({ validators: ["not-function"] })).toBe(false);

		});

		it("returns false for non-object values", async () => {

			expect(isResourceConstraints(null)).toBe(false);
			expect(isResourceConstraints(undefined)).toBe(false);

		});

	});

	describe("isId", () => {

		it("returns true for valid id", async () => {

			expect(isId({ kind: "id" })).toBe(true);
			expect(isId({ kind: "id", hidden: true })).toBe(true);
			expect(isId({ kind: "id", hidden: false })).toBe(true);

		});

		it("returns false for object with wrong kind", async () => {

			expect(isId({ kind: "type" })).toBe(false);
			expect(isId({ kind: "property" })).toBe(false);

		});

		it("returns false for object with invalid hidden", async () => {

			expect(isId({ kind: "id", hidden: "true" })).toBe(false);

		});

		it("returns false for unknown fields", async () => {

			expect(isId({ kind: "id", computed: true })).toBe(false);

		});

		it("returns false for non-object values", async () => {

			expect(isId(null)).toBe(false);
			expect(isId(undefined)).toBe(false);

		});

	});

	describe("isType", () => {

		it("returns true for valid type", async () => {

			expect(isType({ kind: "type" })).toBe(true);
			expect(isType({ kind: "type", hidden: true })).toBe(true);
			expect(isType({ kind: "type", hidden: false })).toBe(true);

		});

		it("returns false for object with wrong kind", async () => {

			expect(isType({ kind: "id" })).toBe(false);
			expect(isType({ kind: "property" })).toBe(false);

		});

		it("returns false for object with invalid hidden", async () => {

			expect(isType({ kind: "type", hidden: "true" })).toBe(false);

		});

		it("returns false for unknown fields", async () => {

			expect(isType({ kind: "type", computed: true })).toBe(false);

		});

		it("returns false for non-object values", async () => {

			expect(isType(null)).toBe(false);
			expect(isType(undefined)).toBe(false);

		});

	});

	describe("isEntries", () => {

		it("returns true for empty object", async () => {

			expect(isEntries({})).toBe(true);

		});

		it("returns true for object with valid entries", async () => {

			expect(isEntries({ name: required(string()) })).toBe(true);
			expect(isEntries({ name: property(required(string())) })).toBe(true);

		});

		it("returns false for non-object values", async () => {

			expect(isEntries(null)).toBe(false);
			expect(isEntries(undefined)).toBe(false);

		});

	});

	describe("isEntry", () => {

		it("returns true for valid Range", async () => {

			expect(isEntry(required(string()))).toBe(true);
			expect(isEntry(optional(integer()))).toBe(true);

		});

		it("returns true for Range with union shape", async () => {

			expect(isEntry(optional(union({ string: string(), number: integer() })))).toBe(true);

		});

		it("returns true for valid Property", async () => {

			expect(isEntry(property(required(string())))).toBe(true);

		});

		it("returns false for non-object values", async () => {

			expect(isEntry(null)).toBe(false);
			expect(isEntry(undefined)).toBe(false);

		});

	});

	describe("isProperty", () => {

		it("returns true for valid property", async () => {

			expect(isProperty(property(required(string())))).toBe(true);

		});

		it("returns true for property with computed flag", async () => {

			expect(isProperty(property({ computed: true }, required(string())))).toBe(true);
			expect(isProperty(property({ computed: false }, required(string())))).toBe(true);

		});

		it("returns false for range without range wrapper", async () => {

			expect(isProperty(required(string()))).toBe(false);

		});

		it("returns false for non-object values", async () => {

			expect(isProperty(null)).toBe(false);
			expect(isProperty(undefined)).toBe(false);

		});

	});

	describe("isPropertyConstraints", () => {

		it("returns true for empty object", async () => {

			expect(isPropertyConstraints({})).toBe(true);

		});

		it("returns true for object with valid constraints", async () => {

			expect(isPropertyConstraints({ hidden: true })).toBe(true);
			expect(isPropertyConstraints({ name: { en: "Name" } })).toBe(true);

		});

		it("returns false for non-object values", async () => {

			expect(isPropertyConstraints(null)).toBe(false);
			expect(isPropertyConstraints(undefined)).toBe(false);

		});

	});

	describe("isRange", () => {

		it("returns true for valid range", async () => {

			expect(isRange(required(string()))).toBe(true);
			expect(isRange(optional(integer()))).toBe(true);
			expect(isRange(multiple(boolean()))).toBe(true);

		});

		it("returns false for object with wrong kind", async () => {

			expect(isRange({ kind: "union", variants: {} })).toBe(false);

		});

		it("returns false for non-object values", async () => {

			expect(isRange(null)).toBe(false);
			expect(isRange(undefined)).toBe(false);

		});

	});

	describe("isUnion", () => {

		it("returns true for valid union", async () => {

			expect(isUnion(union({ string: string(), number: integer() }))).toBe(true);

		});

		it("returns false for object with wrong kind", async () => {

			expect(isUnion({ kind: "range", shape: string() })).toBe(false);

		});

		it("returns false for non-object values", async () => {

			expect(isUnion(null)).toBe(false);
			expect(isUnion(undefined)).toBe(false);

		});

	});

	describe("isReferenceShape", () => {

		it("returns true for valid reference shape", async () => {

			expect(isReferenceShape(reference(resource({})))).toBe(true);

		});

		it("returns false for object with wrong kind", async () => {

			expect(isReferenceShape({ kind: "string", model: "/" })).toBe(false);

		});

		it("returns false for object with non-IRI model", async () => {

			expect(isReferenceShape({ kind: "reference", model: 42 })).toBe(false);

		});

		it("returns false for non-object values", async () => {

			expect(isReferenceShape(null)).toBe(false);
			expect(isReferenceShape(undefined)).toBe(false);

		});

	});

});

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
				expect((rangeShape as Union).variants.string.kind).toBe("string");
				expect((rangeShape as Union).variants.number.kind).toBe("number");

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

				expect(Object.keys(shape).sort()).toEqual([
					"description",
					"extends",
					"kind",
					"model",
					"name",
					"properties"
				]);

			});

			it("includes only provided properties", async () => {

				const shape = resource({
					name: property(required(string()))
				});

				expect(Object.keys(shape).sort()).toEqual(["kind", "model", "properties"]);

			});

			it("rejects extra properties", async () => {

				expect(() => resource({ extra: "ignored" } as any, {
					name: property(required(string()))
				})).toThrow(TypeError);

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

			it("throws on extra properties in property", async () => {

				expect(() => resource({
					name: { ...property(required(string())), extra: "ignored" }
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
				})).toThrow(TypeError);

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
				})).toThrow(TypeError);

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

					expect(shape.model).toEqual({ id: "/" });

				});

				it("uses reference model for type entry", async () => {

					const shape = resource({
						type: type()
					});

					expect(shape.model).toEqual({ type: "/" });

				});

				it("includes id and type alongside regular properties", async () => {

					const shape = resource({
						id: id(),
						type: type(),
						name: required(string())
					});

					expect(shape.model).toEqual({ id: "/", type: "/", name: "" });

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

				it("earlier parent overrides later parent", async () => {

					const First = resource({ name: required(string()) });
					const Second = resource({ name: required(integer()) });
					const Child = resource({ extends: [First, Second] }, {});

					expect(Child.model).toEqual({ name: "" });

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
				expect((rangeShape as Union).variants.string.kind).toBe("string");
				expect((rangeShape as Union).variants.number.kind).toBe("number");

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

			it("rejects extra properties", async () => {

				expect(() => property({ extra: "ignored" } as any, required(string()))).toThrow(TypeError);

			});

		});

		describe("type conformance", () => {

			it("throws on non-boolean hidden", async () => {

				expect(() => property({ hidden: "true" } as any, required(string()))).toThrow(TypeError);

			});

			it("throws on non-string forward", async () => {

				expect(() => property({ forward: 123 } as any, required(string()))).toThrow(TypeError);

			});

			it("throws on non-string reverse", async () => {

				expect(() => property({ reverse: 123 } as any, required(string()))).toThrow(TypeError);

			});

			it("throws on invalid range", async () => {

				expect(() => property("not-a-range" as any)).toThrow(TypeError);

			});

			it("throws on extra properties in range", async () => {

				expect(() => property({ ...required(string()), extra: "ignored" })).toThrow(TypeError);

			});

		});

	});


	describe("multiple", () => {

		it("returns a range with no cardinality constraints", async () => {

			const range = multiple(string());

			expect(range.minCount).toBeUndefined();
			expect(range.maxCount).toBeUndefined();
			expect(range.shape.kind).toBe("string");

		});

		it("returns an immutable range", async () => {

			const range = multiple(string());

			expect(() => {
				(range as any).minCount = 1;
			}).toThrow();

		});

		it("accepts lazy shape", async () => {

			const range = multiple(() => string());

			expect(range.shape.kind).toBe("string");

		});

		describe("structural integrity", () => {

			it("includes only expected properties", async () => {

				const range = multiple(string());

				expect(Object.keys(range).sort()).toEqual(["kind", "maxCount", "minCount", "shape"]);

			});

		});

		describe("type conformance", () => {

			it("throws on non-object/function shape", async () => {

				expect(() => multiple("not-a-shape" as any)).toThrow(TypeError);

			});

		});

	});

	describe("repeatable", () => {

		it("returns a range with minCount=1", async () => {

			const range = repeatable(string());

			expect(range.minCount).toBe(1);
			expect(range.maxCount).toBeUndefined();
			expect(range.shape.kind).toBe("string");

		});

		it("returns an immutable range", async () => {

			const range = repeatable(string());

			expect(() => {
				(range as any).minCount = 0;
			}).toThrow();

		});

		describe("structural integrity", () => {

			it("includes only expected properties", async () => {

				const range = repeatable(string());

				expect(Object.keys(range).sort()).toEqual(["kind", "maxCount", "minCount", "shape"]);

			});

		});

		describe("type conformance", () => {

			it("throws on non-object/function shape", async () => {

				expect(() => repeatable("not-a-shape" as any)).toThrow(TypeError);

			});

		});

	});

	describe("optional", () => {

		it("returns a range with maxCount=1", async () => {

			const range = optional(string());

			expect(range.minCount).toBeUndefined();
			expect(range.maxCount).toBe(1);
			expect(range.shape.kind).toBe("string");

		});

		it("returns an immutable range", async () => {

			const range = optional(string());

			expect(() => {
				(range as any).maxCount = 2;
			}).toThrow();

		});

		describe("structural integrity", () => {

			it("includes only expected properties", async () => {

				const range = optional(string());

				expect(Object.keys(range).sort()).toEqual(["kind", "maxCount", "minCount", "shape"]);

			});

		});

		describe("type conformance", () => {

			it("throws on non-object/function shape", async () => {

				expect(() => optional("not-a-shape" as any)).toThrow(TypeError);

			});

		});

	});

	describe("required", () => {

		it("returns a range with minCount=1 and maxCount=1", async () => {

			const range = required(string());

			expect(range.minCount).toBe(1);
			expect(range.maxCount).toBe(1);
			expect(range.shape.kind).toBe("string");

		});

		it("returns an immutable range", async () => {

			const range = required(string());

			expect(() => {
				(range as any).minCount = 0;
			}).toThrow();

		});

		describe("structural integrity", () => {

			it("includes only expected properties", async () => {

				const range = required(string());

				expect(Object.keys(range).sort()).toEqual(["kind", "maxCount", "minCount", "shape"]);

			});

		});

		describe("type conformance", () => {

			it("throws on non-object/function shape", async () => {

				expect(() => required("not-a-shape" as any)).toThrow(TypeError);

			});

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

		describe("type conformance", () => {

			it("throws on non-number lower bound", async () => {

				expect(() => cardinality("2" as any, 5)).toThrow(TypeError);

			});

			it("throws on non-number upper bound", async () => {

				expect(() => cardinality(2, "5" as any)).toThrow(TypeError);

			});

			it("throws on non-object/function shape in returned factory", async () => {

				const twoToFive = cardinality(2, 5);

				expect(() => twoToFive("not-a-shape" as any)).toThrow(TypeError);

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

	describe("backlink", () => {

		describe("shape", () => {

			it("returns a shape with kind 'reference'", async () => {

				expect(backlink(resource({})).kind).toBe("reference");

			});

			it("returns a shape with backlink set to true", async () => {

				expect(backlink(resource({})).backlink).toBe(true);

			});

			it("returns a shape with default model", async () => {

				expect(backlink(resource({})).model).toBe("app:/");

			});

			it("returns an immutable shape", async () => {

				const shape = backlink(resource({}));

				expect(() => (shape as any).kind = "string").toThrow();
				expect(() => (shape as any).backlink = false).toThrow();

			});

			it("throws on invalid shape argument", async () => {

				expect(() => backlink("not-a-shape" as any)).toThrow(TypeError);

			});

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


				it("accepts empty resource with no properties", async () => {

					expect(validateResource([{}], resource({}))).toEqual([]);

				});

				it("accepts resource with subset of defined properties", async () => {

					expect(validateResource([{ name: "Alice" }], named)).toEqual([]);

				});

				it("accepts declared id property", async () => {

					const shape = resource({
						id: id(),
						name: required(string())
					});

					expect(validateResource([{ "id": "app:/users/123", name: "Alice" }], shape)).toEqual([]);

				});

				it("accepts declared type property", async () => {

					const shape = resource({
						type: type(),
						name: required(string())
					});

					expect(validateResource([{ "type": "app:/types/Person", name: "Alice" }], shape)).toEqual([]);

				});

				it("accepts properties from inherited shape", async () => {

					const Base = resource({
						code: required(integer())
					});

					const Derived = resource({ extends: Base }, {
						name: required(string())
					});

					expect(validateResource([{ code: 1, name: "Alice" }], Derived)).toEqual([]);

				});

				it("rejects unknown property", async () => {

					expect(validateResource([{ name: "Alice", extra: "value" }], named).length).toBeGreaterThan(0);

				});

			});

			describe("custom validators", () => {

				const adultValidator: Validator = (r) => {
					return (r as any).age >= 18 ? [] : ["must be adult"];
				};

				const validated = resource({
					validators: [adultValidator]
				}, {
					age: required(integer())
				});


				it("accepts resource passing custom validator", async () => {

					expect(validateResource([{ age: 25 }], validated)).toEqual([]);

				});

				it("rejects resource failing custom validator", async () => {

					expect(validateResource([{ age: 15 }], validated).length).toBeGreaterThan(0);

				});

				it("runs all custom validators", async () => {

					const v1: Validator = (r) => (r as any).a > 0 ? [] : ["a must be positive"];
					const v2: Validator = (r) => (r as any).b > 0 ? [] : ["b must be positive"];

					const shape = resource({
						validators: [v1, v2]
					}, {
						a: required(integer()),
						b: required(integer())
					});

					// both pass

					expect(validateResource([{ a: 1, b: 1 }], shape)).toEqual([]);

					// first fails

					expect(validateResource([{ a: -1, b: 1 }], shape).length).toBeGreaterThan(0);

					// second fails

					expect(validateResource([{ a: 1, b: -1 }], shape).length).toBeGreaterThan(0);

				});

				it("enforces inherited validators", async () => {

					const validator: Validator = (r) => {
						return (r as any).age >= 18 ? [] : ["must be adult"];
					};

					const Base = resource({ validators: [validator] }, {
						age: required(integer())
					});

					const Derived = resource({ extends: Base }, {
						name: required(string())
					});

					expect(validateResource([{ age: 25, name: "Alice" }], Derived)).toEqual([]);
					expect(validateResource([{ age: 15, name: "Bob" }], Derived).length).toBeGreaterThan(0);

				});

			});

			describe("trace structure", () => {

				it("returns string array for value-level violations", async () => {

					const shape = resource({
						age: required(integer({ minInclusive: 0 }))
					});

					const trace = validateResource([{ age: -5 }], shape);

					expect(Array.isArray(trace)).toBeTruthy();
					expect(trace.length).toBeGreaterThan(0);

				});

				it("includes property path in nested traces", async () => {

					const Address = resource({
						city: required(string({ minLength: 1 }))
					});

					const Person = resource({
						address: required(Address)
					});

					const trace = validateResource([{ address: { city: "" } }], Person);
					const dict = trace.find(e => typeof e === "object") as Record<string, unknown> | undefined;

					expect(dict).toBeDefined();
					expect(dict).toHaveProperty("address");

					const nested = (dict!.address as unknown[]).find(e => typeof e === "object") as Record<string, unknown> | undefined;

					expect(nested).toBeDefined();
					expect(nested).toHaveProperty("city");

				});

				it("includes both unknown and invalid property traces in dictionary", async () => {

					const Address = resource({
						city: required(string({ minLength: 1 }))
					});

					const shape = resource({
						address: required(Address)
					});

					const trace = validateResource([{ address: { city: "" }, extra: "value" }], shape);
					const dict = trace.find(e => typeof e === "object") as Record<string, unknown> | undefined;

					expect(dict).toBeDefined();
					expect(dict).toHaveProperty("extra");
					expect(dict).toHaveProperty("address");

				});

			});

		});

		describe("id constraints", () => {

			it("accepts single absolute IRI", async () => {

				const shape = resource({ id: id() });

				expect(validateResource([{ "id": "app:/users/123" }], shape)).toEqual([]);

			});

			it("rejects missing id", async () => {

				const shape = resource({ id: id() });

				expect(validateResource([{}], shape).length).toBeGreaterThan(0);

			});

			it("rejects non-IRI value", async () => {

				const shape = resource({ id: id() });

				expect(validateResource([{ "id": "not an iri" }], shape).length).toBeGreaterThan(0);

			});

			it("rejects multiple values", async () => {

				const shape = resource({ id: id() });

				expect(validateResource([{ "id": ["/users/1", "/users/2"] }], shape).length).toBeGreaterThan(0);

			});

			describe("pattern", () => {

				it("accepts id matching pattern", async () => {

					const shape = resource({ pattern: "/users/{id}" }, { id: id() });

					expect(validateResource([{ "id": "app:/users/123" }], shape)).toEqual([]);

				});

				it("accepts wildcard pattern", async () => {

					const shape = resource({ pattern: "/users/*" }, { id: id() });

					expect(validateResource([{ "id": "app:/users/123/profile" }], shape)).toEqual([]);

				});

				it("rejects id not matching pattern", async () => {

					const shape = resource({ pattern: "/users/{id}" }, { id: id() });

					expect(validateResource([{ "id": "/products/123" }], shape).length).toBeGreaterThan(0);

				});

				it("rejects missing id", async () => {

					const shape = resource({ pattern: "/users/{id}" }, { id: id() });

					expect(validateResource([{}], shape).length).toBeGreaterThan(0);

				});

			});

			describe("in", () => {

				it("accepts id in allowed enumeration", async () => {

					const shape = resource({ in: ["app:/users/alice", "app:/users/bob"] }, { id: id() });

					expect(validateResource([{ "id": "app:/users/alice" }], shape)).toEqual([]);

				});

				it("rejects id not in allowed enumeration", async () => {

					const shape = resource({ in: ["app:/users/alice", "app:/users/bob"] }, { id: id() });

					expect(validateResource([{ "id": "app:/users/charlie" }], shape).length).toBeGreaterThan(0);

				});

				it("rejects missing id", async () => {

					const shape = resource({ in: ["app:/users/alice", "app:/users/bob"] }, { id: id() });

					expect(validateResource([{}], shape).length).toBeGreaterThan(0);

				});

				it("rejects empty enumeration", async () => {

					const shape = resource({ in: [] }, { id: id() });

					expect(validateResource([{ "id": "app:/users/alice" }], shape).length).toBeGreaterThan(0);

				});

			});

			describe("hasValue", () => {

				it("accepts id matching required value", async () => {

					const shape = resource({ hasValue: ["app:/users/admin"] }, { id: id() });

					expect(validateResource([{ "id": "app:/users/admin" }], shape)).toEqual([]);

				});

				it("rejects id not matching required value", async () => {

					const shape = resource({ hasValue: ["app:/users/admin"] }, { id: id() });

					expect(validateResource([{ "id": "app:/users/guest" }], shape).length).toBeGreaterThan(0);

				});

				it("rejects missing id", async () => {

					const shape = resource({ hasValue: ["app:/users/admin"] }, { id: id() });

					expect(validateResource([{}], shape).length).toBeGreaterThan(0);

				});

			});

		});

		describe("type constraints", () => {

			it("accepts single absolute IRI", async () => {

				const shape = resource({ type: type() });

				expect(validateResource([{ "type": "app:/types/Person" }], shape)).toEqual([]);

			});

			it("accepts missing type", async () => {

				const shape = resource({ type: type() });

				expect(validateResource([{}], shape)).toEqual([]);

			});

			it("rejects non-IRI value", async () => {

				const shape = resource({ type: type() });

				expect(validateResource([{ "type": "not an iri" }], shape).length).toBeGreaterThan(0);

			});

			it("rejects multiple values", async () => {

				const shape = resource({ type: type() });

				expect(validateResource([{ "type": ["/types/A", "/types/B"] }], shape).length).toBeGreaterThan(0);

			});

		});

		describe("property constraints", () => {

			describe("required property", () => {

				it("accepts present required property", async () => {

					const shape = resource({
						name: required(string())
					});

					expect(validateResource([{ name: "Alice" }], shape)).toEqual([]);

				});

				it("rejects missing required property", async () => {

					const shape = resource({
						name: required(string())
					});

					expect(validateResource([{}], shape).length).toBeGreaterThan(0);

				});

				it("rejects array value", async () => {

					const shape = resource({
						name: required(string())
					});

					expect(validateResource([{ name: ["Alice"] }], shape).length).toBeGreaterThan(0);

				});

			});

			describe("optional property", () => {

				it("accepts present optional property", async () => {

					const shape = resource({
						age: optional(integer())
					});

					expect(validateResource([{ age: 30 }], shape)).toEqual([]);

				});

				it("accepts missing optional property", async () => {

					const shape = resource({
						age: optional(integer())
					});

					expect(validateResource([{}], shape)).toEqual([]);

				});


				it("rejects array value", async () => {

					const shape = resource({
						age: optional(integer())
					});

					expect(validateResource([{ age: [30] }], shape).length).toBeGreaterThan(0);

				});

			});

			describe("repeatable property", () => {

				it("accepts array with single element", async () => {

					const shape = resource({
						tags: repeatable(string())
					});

					expect(validateResource([{ tags: ["a"] }], shape)).toEqual([]);

				});

				it("accepts array with multiple elements", async () => {

					const shape = resource({
						tags: repeatable(string())
					});

					expect(validateResource([{ tags: ["a", "b", "c"] }], shape)).toEqual([]);

				});

				it("rejects empty array", async () => {

					const shape = resource({
						tags: repeatable(string())
					});

					expect(validateResource([{ tags: [] }], shape).length).toBeGreaterThan(0);

				});

				it("rejects missing repeatable property", async () => {

					const shape = resource({
						tags: repeatable(string())
					});

					expect(validateResource([{}], shape).length).toBeGreaterThan(0);

				});

				it("rejects scalar value", async () => {

					const shape = resource({
						tags: repeatable(string())
					});

					expect(validateResource([{ tags: "a" }], shape).length).toBeGreaterThan(0);

				});

			});

			describe("multiple property", () => {

				it("accepts array with single element", async () => {

					const shape = resource({
						aliases: multiple(string())
					});

					expect(validateResource([{ aliases: ["x"] }], shape)).toEqual([]);

				});

				it("accepts array with multiple elements", async () => {

					const shape = resource({
						aliases: multiple(string())
					});

					expect(validateResource([{ aliases: ["x", "y", "z"] }], shape)).toEqual([]);

				});

				it("accepts empty array", async () => {

					const shape = resource({
						aliases: multiple(string())
					});

					expect(validateResource([{ aliases: [] }], shape)).toEqual([]);

				});

				it("accepts missing multiple property", async () => {

					const shape = resource({
						aliases: multiple(string())
					});

					expect(validateResource([{}], shape)).toEqual([]);

				});

				it("rejects scalar value", async () => {

					const shape = resource({
						aliases: multiple(string())
					});

					expect(validateResource([{ aliases: "x" }], shape).length).toBeGreaterThan(0);

				});

			});

			describe("custom cardinality", () => {

				it("accepts array satisfying minCount", async () => {

					const shape = resource({
						tags: cardinality(2)(string())
					});

					expect(validateResource([{ tags: ["a", "b"] }], shape)).toEqual([]);
					expect(validateResource([{ tags: ["a", "b", "c"] }], shape)).toEqual([]);

				});

				it("rejects array below minCount", async () => {

					const shape = resource({
						tags: cardinality(2)(string())
					});

					expect(validateResource([{ tags: ["a"] }], shape).length).toBeGreaterThan(0);

				});

				it("accepts array satisfying maxCount", async () => {

					const shape = resource({
						tags: cardinality(undefined, 3)(string())
					});

					expect(validateResource([{ tags: ["a", "b", "c"] }], shape)).toEqual([]);
					expect(validateResource([{ tags: ["a"] }], shape)).toEqual([]);

				});

				it("rejects array exceeding maxCount", async () => {

					const shape = resource({
						tags: cardinality(undefined, 3)(string())
					});

					expect(validateResource([{ tags: ["a", "b", "c", "d"] }], shape).length).toBeGreaterThan(0);

				});

				it("accepts array within minCount and maxCount", async () => {

					const shape = resource({
						tags: cardinality(2, 4)(string())
					});

					expect(validateResource([{ tags: ["a", "b"] }], shape)).toEqual([]);
					expect(validateResource([{ tags: ["a", "b", "c", "d"] }], shape)).toEqual([]);

				});

				it("rejects array outside minCount and maxCount", async () => {

					const shape = resource({
						tags: cardinality(2, 4)(string())
					});

					expect(validateResource([{ tags: ["a"] }], shape).length).toBeGreaterThan(0);
					expect(validateResource([{ tags: ["a", "b", "c", "d", "e"] }], shape).length).toBeGreaterThan(0);

				});

			});

			it("enforces inherited cardinality constraints", async () => {

				const Base = resource({
					name: required(string())
				});

				const Derived = resource({ extends: Base }, {
					age: optional(integer())
				});

				expect(validateResource([{ name: "Alice" }], Derived)).toEqual([]);
				expect(validateResource([{}], Derived).length).toBeGreaterThan(0);

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

				expect(validateResource([{ name: "Alice", age: 30 }], Person)).toEqual([]);
				expect(validateResource([{ name: "Alice" }], Person).length).toBeGreaterThan(0);
				expect(validateResource([{ age: 30 }], Person).length).toBeGreaterThan(0);

			});

			it("enforces inherited constraints on overridden properties", async () => {

				const Base = resource({
					name: required(string({ minLength: 3 }))
				});

				const Derived = resource({ extends: Base }, {
					name: required(string({ pattern: "^[A-Z]" }))
				});

				// satisfies both parent (minLength: 3) and child (pattern: ^[A-Z])

				expect(validateResource([{ name: "Alice" }], Derived)).toEqual([]);

				// violates parent's minLength: 3 even though it matches child's pattern

				expect(validateResource([{ name: "A" }], Derived).length).toBeGreaterThan(0);

				// violates child's pattern even though it satisfies parent's minLength

				expect(validateResource([{ name: "alice" }], Derived).length).toBeGreaterThan(0);

			});

			it("prevents relaxing inherited constraints on overridden properties", async () => {

				const Base = resource({
					name: required(string({ minLength: 3, maxLength: 50 }))
				});

				// child tries to relax parent constraints

				const Derived = resource({ extends: Base }, {
					name: required(string({ minLength: 1, maxLength: 100 }))
				});

				// satisfies both parent and child constraints

				expect(validateResource([{ name: "Alice" }], Derived)).toEqual([]);

				// satisfies child's relaxed minLength: 1 but violates parent's minLength: 3

				expect(validateResource([{ name: "AB" }], Derived).length).toBeGreaterThan(0);

				// satisfies child's relaxed maxLength: 100 but violates parent's maxLength: 50

				expect(validateResource([{ name: "A".repeat(51) }], Derived).length).toBeGreaterThan(0);

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

				expect(validateResource([{ name: "Alice" }], Child)).toEqual([]);

				// violates grandparent's minLength: 3

				expect(validateResource([{ name: "AB" }], Child).length).toBeGreaterThan(0);

				// violates last parent's maxLength: 50

				expect(validateResource([{ name: "A".repeat(51) }], Child).length).toBeGreaterThan(0);

			});

		});

		describe("value constraints", () => {

			describe("boolean values", () => {

				it("accepts valid boolean", async () => {

					const shape = resource({
						active: required(boolean())
					});

					expect(validateResource([{ active: true }], shape)).toEqual([]);
					expect(validateResource([{ active: false }], shape)).toEqual([]);

				});

				it("rejects non-boolean value", async () => {

					const shape = resource({
						active: required(boolean())
					});

					expect(validateResource([{ active: "true" }], shape).length).toBeGreaterThan(0);

				});

			});

			describe("number values", () => {

				it("accepts valid number", async () => {

					const shape = resource({
						age: required(integer())
					});

					expect(validateResource([{ age: 42 }], shape)).toEqual([]);

				});

				it("rejects non-number value", async () => {

					const shape = resource({
						age: required(integer())
					});

					expect(validateResource([{ age: "forty-two" }], shape).length).toBeGreaterThan(0);

				});

			});

			describe("string values", () => {

				it("accepts valid string", async () => {

					const shape = resource({
						name: required(string())
					});

					expect(validateResource([{ name: "Alice" }], shape)).toEqual([]);

				});

				it("rejects non-string value", async () => {

					const shape = resource({
						name: required(string())
					});

					expect(validateResource([{ name: 42 }], shape).length).toBeGreaterThan(0);

				});

				it("validates array elements individually", async () => {

					const shape = resource({
						tags: repeatable(string({ minLength: 2 }))
					});

					expect(validateResource([{ tags: ["abc", "de", "fgh"] }], shape)).toEqual([]);
					expect(validateResource([{ tags: ["abc", "x", "fgh"] }], shape).length).toBeGreaterThan(0);

				});

			});

			describe("local values", () => {

				it("accepts valid local value", async () => {

					const shape = resource({
						label: required(local())
					});

					expect(validateResource([{ label: { "en": "Hello" } }], shape)).toEqual([]);

				});

				it("rejects non-local value", async () => {

					const shape = resource({
						label: required(local())
					});

					expect(validateResource([{ label: 42 }], shape).length).toBeGreaterThan(0);

				});

			});

			describe("locals values", () => {

				it("accepts valid locals value", async () => {

					const shape = resource({
						labels: required(locals())
					});

					expect(validateResource([{ labels: { en: ["Hello"], it: ["Ciao"] } }], shape)).toEqual([]);

				});

				it("rejects non-locals value", async () => {

					const shape = resource({
						labels: required(locals())
					});

					expect(validateResource([{ labels: "Hello" }], shape).length).toBeGreaterThan(0);

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

					expect(validateResource([{ address: { city: "Rome" } }], Person)).toEqual([]);

				});

				it("rejects invalid nested resource", async () => {

					const Address = resource({
						city: required(string())
					});

					const Person = resource({
						address: required(Address)
					});

					expect(validateResource([{ address: {} }], Person).length).toBeGreaterThan(0);

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
					}], Person).length).toBeGreaterThan(0);

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

					expect(validateResource([{ value: "hello" }], textOrCount)).toEqual([]);
					expect(validateResource([{ value: 42 }], textOrCount)).toEqual([]);

				});

				it("rejects scalar matching no variant type", async () => {

					expect(validateResource([{ value: true }], textOrCount).length).toBeGreaterThan(0);

				});

				it("accepts array matching variant type and cardinality", async () => {

					// multiUnion is repeatable (1..*): 3 values satisfy both type and cardinality
					expect(validateResource([{ value: [1, 2, 3] }], multiUnion)).toEqual([]);

				});

				it("rejects array for scalar union range", async () => {

					// textOrCount has maxCount=1: array is rejected
					expect(validateResource([{ value: ["a", "b"] }], textOrCount).length).toBeGreaterThan(0);

				});

				it("rejects missing union property", async () => {

					expect(validateResource([{}], textOrCount).length).toBeGreaterThan(0);

				});

				it("accepts inherited union property", async () => {

					const Derived = resource({ extends: textOrCount }, {
						name: required(string())
					});

					expect(validateResource([{ value: "hello", name: "Alice" }], Derived)).toEqual([]);
					expect(validateResource([{ value: true, name: "Alice" }], Derived).length).toBeGreaterThan(0);

				});

			});

		});

		describe("combined constraints", () => {

			const validator: Validator = (r) => {
				return (r as any).name.length <= 50 ? [] : ["name too long"];
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
				}], shape)).toEqual([]);

			});

			it("rejects resource failing pattern constraint", async () => {

				expect(validateResource([{
					"id": "/products/123",
					name: "Alice"
				}], shape).length).toBeGreaterThan(0);

			});

			it("rejects resource failing property constraint", async () => {

				expect(validateResource([{
					"id": "app:/users/123",
					name: ""
				}], shape).length).toBeGreaterThan(0);

			});

			it("rejects resource failing custom validator", async () => {

				expect(validateResource([{
					"id": "app:/users/123",
					name: "A".repeat(100)
				}], shape).length).toBeGreaterThan(0);

			});

		});

	});

	describe("validateReference", () => {

		describe("no constraints", () => {

			it("accepts any reference when target shape has no constraints", async () => {

				const target = resource({});
				const shape = reference(target);

				expect(validateReference(["app:/users/123"], shape)).toEqual([]);

			});

			it("accepts empty values", async () => {

				const target = resource({});
				const shape = reference(target);

				expect(validateReference([], shape)).toEqual([]);

			});

		});

		describe("pattern constraint", () => {

			it("accepts references matching the target pattern", async () => {

				const target = resource({ pattern: "/users/{id}" }, {});
				const shape = reference(target);

				expect(validateReference(["app:/users/123"], shape)).toEqual([]);

			});

			it("rejects references not matching the target pattern", async () => {

				const target = resource({ pattern: "/users/{id}" }, {});
				const shape = reference(target);

				expect(validateReference(["app:/products/123"], shape).length).toBeGreaterThan(0);

			});

		});

		describe("in constraint", () => {

			it("accepts references in the allowed set", async () => {

				const target = resource({ in: ["app:/users/1", "app:/users/2"] }, {});
				const shape = reference(target);

				expect(validateReference(["app:/users/1"], shape)).toEqual([]);

			});

			it("rejects references not in the allowed set", async () => {

				const target = resource({ in: ["app:/users/1", "app:/users/2"] }, {});
				const shape = reference(target);

				expect(validateReference(["app:/users/99"], shape).length).toBeGreaterThan(0);

			});

		});

		describe("hasValue constraint", () => {

			it("accepts when all required values are present", async () => {

				const target = resource({ hasValue: ["app:/users/1"] }, {});
				const shape = reference(target);

				expect(validateReference(["app:/users/1", "app:/users/2"], shape)).toEqual([]);

			});

			it("rejects when required values are missing", async () => {

				const target = resource({ hasValue: ["app:/users/1"] }, {});
				const shape = reference(target);

				expect(validateReference(["app:/users/2"], shape).length).toBeGreaterThan(0);

			});

		});

		describe("lazy shape resolution", () => {

			it("resolves lazy shape function before validation", async () => {

				const target = resource({ pattern: "/users/{id}" }, {});
				const shape = reference(() => target);

				expect(validateReference(["app:/users/123"], shape)).toEqual([]);
				expect(validateReference(["app:/products/123"], shape).length).toBeGreaterThan(0);

			});

		});

	});

	describe("validateModel", () => {

		describe("resource constraints", () => {

			describe("closed shape", () => {

				it("accepts empty model on empty shape", async () => {

					const shape = resource({});

					expect(validateModel([{}], shape)).toEqual([]);

				});

				it("accepts model with only defined properties", async () => {

					const shape = resource({
						name: required(string()),
						age: optional(integer())
					});

					expect(validateModel([{ name: "Alice", age: 30 }], shape)).toEqual([]);

				});

				it("accepts declared id property", async () => {

					const shape = resource({
						id: id(),
						name: required(string())
					});

					expect(validateModel([{ "id": "app:/users/123", name: "Alice" }], shape)).toEqual([]);

				});

				it("accepts properties from inherited shape", async () => {

					const Base = resource({
						id: required(integer())
					});

					const Derived = resource({ extends: Base }, {
						name: required(string())
					});

					expect(validateModel([{ id: 1, name: "Alice" }], Derived)).toEqual([]);

				});

				it("rejects unknown property on empty shape", async () => {

					const shape = resource({});

					expect(validateModel([{ name: "Alice" }], shape).length).toBeGreaterThan(0);

				});

				it("rejects unknown property", async () => {

					const shape = resource({
						name: required(string())
					});

					expect(validateModel([{ name: "Alice", extra: "value" }], shape).length).toBeGreaterThan(0);

				});

				it("rejects multiple unknown properties", async () => {

					const shape = resource({
						name: required(string())
					});

					expect(validateModel([{
						name: "Alice",
						extra1: "a",
						extra2: "b"
					}], shape).length).toBeGreaterThan(0);

				});

				it("rejects undeclared id property", async () => {

					const shape = resource({
						name: required(string())
					});

					expect(validateModel([{ "id": "app:/users/123", name: "Alice" }], shape).length).toBeGreaterThan(0);

				});

				it("rejects unknown property alongside declared id", async () => {

					const shape = resource({
						id: id(),
						name: required(string())
					});

					expect(validateModel([{
						"id": "app:/users/123",
						name: "Alice",
						extra: "value"
					}], shape).length).toBeGreaterThan(0);

				});

				it("rejects unknown properties in derived shape", async () => {

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
					}], Derived).length).toBeGreaterThan(0);

				});

			});

			describe("custom validators skipped", () => {

				it("accepts failing custom validator", async () => {

					const validator: Validator = () => ["always fails"];

					const shape = resource({
						validators: [validator]
					}, {
						name: required(string())
					});

					expect(validateModel([{ name: "Alice" }], shape)).toEqual([]);

				});

				it("accepts failing inherited validator", async () => {

					const validator: Validator = () => ["always fails"];

					const Base = resource({ validators: [validator] }, {
						age: required(integer())
					});

					const Derived = resource({ extends: Base }, {
						name: required(string())
					});

					expect(validateModel([{ age: 15, name: "Bob" }], Derived)).toEqual([]);

				});

			});

			describe("trace structure", () => {

				it("returns string array for closed shape violations", async () => {

					const shape = resource({
						name: required(string())
					});

					// unknown property triggers closed shape violation

					const trace = validateModel([{ name: "Alice", extra: "value" }], shape);

					expect(Array.isArray(trace)).toBeTruthy();
					expect(trace.length).toBeGreaterThan(0);

				});

				it("includes property path in nested traces", async () => {

					const Address = resource({
						city: required(string())
					});

					const shape = resource({
						address: required(Address)
					});

					// array on scalar triggers shape mismatch in nested resource

					const trace = validateModel([{ address: { city: ["Rome"] } as any }], shape, null);
					const dict = trace.find(e => typeof e === "object") as Record<string, unknown> | undefined;

					expect(dict).toBeDefined();
					expect(dict).toHaveProperty("address");

					const nested = (dict!.address as unknown[]).find(e => typeof e === "object") as Record<string, unknown> | undefined;

					expect(nested).toBeDefined();
					expect(nested).toHaveProperty("city");

				});

				it("includes both unknown and invalid property traces in dictionary", async () => {

					const Address = resource({
						city: required(string())
					});

					const shape = resource({
						address: required(Address)
					});

					const trace = validateModel([{ address: { city: ["Rome"] } as any, extra: "value" }], shape, null);
					const dict = trace.find(e => typeof e === "object") as Record<string, unknown> | undefined;

					expect(dict).toBeDefined();
					expect(dict).toHaveProperty("extra");
					expect(dict).toHaveProperty("address");

				});

			});

		});

		describe("id constraints", () => {

			it("accepts single absolute IRI", async () => {

				const shape = resource({ id: id() });

				expect(validateModel([{ "id": "app:/users/123" }], shape)).toEqual([]);

			});

			it("accepts missing id", async () => {

				const shape = resource({ pattern: "/users/{id}" }, { id: id() });

				expect(validateModel([{}], shape)).toEqual([]);

			});

			it("rejects non-IRI value", async () => {

				const shape = resource({ id: id() });

				expect(validateModel([{ "id": "not an iri" }], shape).length).toBeGreaterThan(0);

			});

			it("rejects multiple values", async () => {

				const shape = resource({ id: id() });

				expect(validateModel([{ "id": ["/users/1", "/users/2"] } as any], shape).length).toBeGreaterThan(0);

			});

			it("skips pattern", async () => {

				const shape = resource({ pattern: "/users/{id}" }, { id: id() });

				expect(validateModel([{ "id": "app:/invalid" }], shape)).toEqual([]);

			});

			it("skips in", async () => {

				const shape = resource({ in: ["app:/users/alice"] }, { id: id() });

				expect(validateModel([{ "id": "app:/users/charlie" }], shape)).toEqual([]);

			});

			it("skips hasValue", async () => {

				const shape = resource({ hasValue: ["app:/users/admin"] }, { id: id() });

				expect(validateModel([{ "id": "app:/users/guest" }], shape)).toEqual([]);

			});

		});

		describe("type constraints", () => {

			it("accepts single absolute IRI", async () => {

				const shape = resource({ type: type() });

				expect(validateModel([{ "type": "app:/types/Person" }], shape)).toEqual([]);

			});

			it("accepts missing type", async () => {

				const shape = resource({ type: type() });

				expect(validateModel([{}], shape)).toEqual([]);

			});

			it("rejects non-IRI value", async () => {

				const shape = resource({ type: type() });

				expect(validateModel([{ "type": "not an iri" }], shape).length).toBeGreaterThan(0);

			});

			it("rejects multiple values", async () => {

				const shape = resource({ type: type() });

				expect(validateModel([{ "type": ["/types/A", "/types/B"] } as any], shape).length).toBeGreaterThan(0);

			});

		});

		describe("property constraints", () => {

			describe("missing properties accepted", () => {

				it("accepts absent required property", async () => {

					const shape = resource({
						name: required(string())
					});

					expect(validateModel([{}], shape)).toEqual([]);

				});

				it("accepts absent repeatable property", async () => {

					const shape = resource({
						tags: repeatable(string())
					});

					expect(validateModel([{}], shape)).toEqual([]);

				});

			});

			describe("shape enforced (scalar vs singleton tuple)", () => {

				it("accepts scalar value on scalar property", async () => {

					const shape = resource({
						name: required(string())
					});

					expect(validateModel([{ name: "Alice" }], shape)).toEqual([]);

				});

				it("accepts singleton tuple on array property", async () => {

					const shape = resource({
						tags: repeatable(string())
					});

					expect(validateModel([{ tags: ["a"] }], shape)).toEqual([]);

				});

				it("rejects array value on scalar property", async () => {

					const shape = resource({
						name: required(string())
					});

					expect(validateModel([{ name: ["Alice"] } as any], shape).length).toBeGreaterThan(0);

				});

				it("rejects scalar value on array property", async () => {

					const shape = resource({
						tags: repeatable(string())
					});

					expect(validateModel([{ tags: "a" }], shape).length).toBeGreaterThan(0);

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

					expect(validateModel([{ name: "Alice" }], Derived)).toEqual([]);
					expect(validateModel([{ name: ["Alice"] } as any], Derived).length).toBeGreaterThan(0);

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

					expect(validateModel([{}], Person)).toEqual([]);
					expect(validateModel([{ name: "Alice", age: 30 }], Person)).toEqual([]);
					expect(validateModel([{ name: ["Alice"] } as any], Person).length).toBeGreaterThan(0);

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

				expect(validateModel([{ name: "A" }], Derived)).toEqual([]);
				expect(validateModel([{ name: 42 }], Derived).length).toBeGreaterThan(0);

			});

			it("prevents relaxing inherited constraints on overridden properties", async () => {

				const Base = resource({
					name: required(string({ minLength: 3, maxLength: 50 }))
				});

				// child tries to relax parent constraints

				const Derived = resource({ extends: Base }, {
					name: required(string({ minLength: 1, maxLength: 100 }))
				});

				// value constraints skipped in model mode, but type shape preserved

				expect(validateModel([{ name: "A" }], Derived)).toEqual([]);
				expect(validateModel([{ name: 42 }], Derived).length).toBeGreaterThan(0);

			});

		});

		describe("value constraints", () => {

			it("accepts value matching type", async () => {

				const shape = resource({
					name: required(string())
				});

				expect(validateModel([{ name: "Alice" }], shape)).toEqual([]);

			});

			it("rejects value with wrong type", async () => {

				const shape = resource({
					name: required(string())
				});

				expect(validateModel([{ name: 42 }], shape).length).toBeGreaterThan(0);

			});

			it("skips value constraints", async () => {

				const shape = resource({
					age: required(integer({ minInclusive: 0 }))
				});

				expect(validateModel([{ age: -5 }], shape)).toEqual([]);

			});

			describe("union values", () => {

				const textOrCount = resource({
					value: required(union({
						text: string(),
						count: integer()
					}))
				});

				it("accepts value matching one variant type", async () => {

					expect(validateModel([{ value: "hello" }], textOrCount)).toEqual([]);
					expect(validateModel([{ value: 42 }], textOrCount)).toEqual([]);

				});

				it("accepts missing union property", async () => {

					expect(validateModel([{}], textOrCount)).toEqual([]);

				});

				it("rejects value matching no variant type", async () => {

					expect(validateModel([{ value: true }], textOrCount).length).toBeGreaterThan(0);

				});

				it("accepts inherited union property", async () => {

					const Derived = resource({ extends: textOrCount }, {
						name: required(string())
					});

					expect(validateModel([{ value: "hello" }], Derived)).toEqual([]);
					expect(validateModel([{ value: true }], Derived).length).toBeGreaterThan(0);

				});

			});

		});

		describe("reference properties", () => {

			it("accepts IRI string for scalar reference", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					supervisor: optional(reference(Target))
				});

				expect(validateModel([{ supervisor: "app:/users/1" }], shape)).toEqual([]);

			});

			it("accepts IRI strings for array reference", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					members: multiple(reference(Target))
				});

				expect(validateModel([{ members: ["app:/users/1", "app:/users/2"] } as any], shape)).toEqual([]);

			});

			it("accepts nested model object for scalar reference", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					supervisor: optional(reference(Target))
				});

				expect(validateModel([{ supervisor: { name: "Alice" } }], shape, null)).toEqual([]);

			});

			it("accepts nested model objects for array reference", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					members: multiple(reference(Target))
				});

				expect(validateModel([{ members: [{ name: "Alice" }, { name: "Bob" }] } as any], shape, null)).toEqual([]);

			});

			it("rejects non-string non-object values for reference", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					supervisor: optional(reference(Target))
				});

				expect(validateModel([{ supervisor: 42 }], shape).length).toBeGreaterThan(0);

			});

			it("validates nested model recursively at multiple levels", async () => {

				const Department = resource({ id: id(), label: required(string()) });

				const Employee = resource({
					id: id(),
					name: required(string()),
					department: optional(reference(Department))
				});

				const shape = resource({
					supervisor: optional(reference(Employee))
				});

				// valid 2-level expansion

				expect(validateModel([{
					supervisor: { name: "Alice", department: { label: "Engineering" } }
				}], shape, null)).toEqual([]);

				// unknown property at level 1

				expect(validateModel([{
					supervisor: { name: "Alice", extra: "bad" }
				}], shape, null).length).toBeGreaterThan(0);

				// unknown property at level 2

				expect(validateModel([{
					supervisor: { name: "Alice", department: { label: "Engineering", extra: "bad" } }
				}], shape, null).length).toBeGreaterThan(0);

			});

			it("accepts missing reference property", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					supervisor: optional(reference(Target))
				});

				expect(validateModel([{}], shape)).toEqual([]);

			});

			it("accepts backlink property with IRI value", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					children: multiple(backlink(Target))
				});

				expect(validateModel([{ children: ["app:/items/1", "app:/items/2"] } as any], shape)).toEqual([]);

			});

			it("accepts backlink property with nested model", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					children: multiple(backlink(Target))
				});

				expect(validateModel([{ children: [{ name: "Child" }] }], shape, null)).toEqual([]);

			});

		});

		describe("depth", () => {

			it("rejects nested model when depth is omitted (defaults to 0)", async () => {

				const Inner = resource({ label: required(string()) });

				const Outer = resource({
					child: optional(reference(Inner))
				});

				expect(validateModel([{ child: { label: "x" } }], Outer).length).toBeGreaterThan(0);

			});

			it("accepts nested model when depth is null (unlimited)", async () => {

				const Inner = resource({ label: required(string()) });

				const Outer = resource({
					child: optional(reference(Inner))
				});

				expect(validateModel([{ child: { label: "x" } }], Outer, null)).toEqual([]);

			});

			it("rejects nested model via reference when depth is 0", async () => {

				const Inner = resource({ label: required(string()) });

				const Outer = resource({
					child: optional(reference(Inner))
				});

				expect(validateModel([{ child: { label: "x" } }], Outer, 0).length).toBeGreaterThan(0);

			});

			it("accepts IRI reference when depth is 0", async () => {

				const Inner = resource({ id: id(), label: required(string()) });

				const Outer = resource({
					child: optional(reference(Inner))
				});

				expect(validateModel([{ child: "app:/items/1" }], Outer, 0)).toEqual([]);

			});

			it("accepts nested model via reference when depth is 1", async () => {

				const Inner = resource({ label: required(string()) });

				const Outer = resource({
					child: optional(reference(Inner))
				});

				expect(validateModel([{ child: { label: "x" } }], Outer, 1)).toEqual([]);

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
				}], Root, 1).length).toBeGreaterThan(0);

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
				}], Root, 2)).toEqual([]);

			});

			it("rejects nested embedded resource when depth is 0", async () => {

				const Embedded = resource({ label: required(string()) });

				const Outer = resource({
					child: required(Embedded)
				});

				expect(validateModel([{ child: { label: "x" } }], Outer, 0).length).toBeGreaterThan(0);

			});

			it("accepts nested embedded resource when depth is 1", async () => {

				const Embedded = resource({ label: required(string()) });

				const Outer = resource({
					child: required(Embedded)
				});

				expect(validateModel([{ child: { label: "x" } }], Outer, 1)).toEqual([]);

			});

		});

	});

	describe("validateQuery", () => {

		describe("projection properties", () => {

			it("accepts query with only projection properties", async () => {

				const Target = resource({ id: id(), name: required(string()), age: optional(integer()) });

				const shape = resource({
					members: multiple(reference(Target))
				});

				expect(validateQuery([{ name: "", age: 0 }], Target)).toEqual([]);

			});

			it("rejects query with unknown projection property", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				expect(validateQuery([{ name: "", extra: "" }], Target).length).toBeGreaterThan(0);

			});

			it("enforces shape on overridden inherited property", async () => {

				const Base = resource({
					name: required(string())
				});

				const Derived = resource({ extends: Base }, {
					name: required(string({ minLength: 3 }))
				});

				// type shape still enforced on overridden property

				expect(validateQuery([{ name: "" }], Derived)).toEqual([]);
				expect(validateQuery([{ name: 42 }], Derived).length).toBeGreaterThan(0);

			});

			it("prevents relaxing inherited constraints on overridden properties", async () => {

				const Base = resource({
					name: required(string({ minLength: 3, maxLength: 50 }))
				});

				// child tries to relax parent constraints

				const Derived = resource({ extends: Base }, {
					name: required(string({ minLength: 1, maxLength: 100 }))
				});

				// value constraints skipped in query mode, but type shape preserved

				expect(validateQuery([{ name: "" }], Derived)).toEqual([]);
				expect(validateQuery([{ name: 42 }], Derived).length).toBeGreaterThan(0);

			});

		});

		describe("filter criteria", () => {

			it("accepts comparison filter on existing property", async () => {

				const Target = resource({ name: required(string()), age: optional(integer()) });

				expect(validateQuery([{ ">=age": 18 }], Target)).toEqual([]);

			});

			it("accepts text search filter on string property", async () => {

				const Target = resource({ name: required(string()) });

				expect(validateQuery([{ "~name": "alice" }], Target)).toEqual([]);

			});

			it("accepts disjunctive filter on existing property", async () => {

				const Target = resource({ status: required(string()) });

				expect(validateQuery([{ "?status": "active" }], Target)).toEqual([]);

			});

			it("accepts conjunctive filter on existing property", async () => {

				const Target = resource({ tags: repeatable(string()) });

				expect(validateQuery([{ "!tags": "urgent" }], Target)).toEqual([]);

			});

			it("rejects filter on undefined property", async () => {

				const Target = resource({ name: required(string()) });

				expect(validateQuery([{ ">=age": 18 }], Target).length).toBeGreaterThan(0);

			});

		});

		describe("ordering criteria", () => {

			it("accepts sort ordering on existing property", async () => {

				const Target = resource({ name: required(string()), age: optional(integer()) });

				expect(validateQuery([{ "^name": "asc", "^age": "desc" }], Target)).toEqual([]);

			});

			it("accepts focus ordering on existing property", async () => {

				const Target = resource({ status: required(string()) });

				expect(validateQuery([{ "*status": ["active"] }], Target)).toEqual([]);

			});

			it("rejects ordering on undefined property", async () => {

				const Target = resource({ name: required(string()) });

				expect(validateQuery([{ "^missing": "asc" }], Target).length).toBeGreaterThan(0);

			});

		});

		describe("pagination", () => {

			it("accepts offset and limit", async () => {

				const Target = resource({ name: required(string()) });

				expect(validateQuery([{ "@": 10, "#": 25 }], Target)).toEqual([]);

			});

		});

		describe("mixed keys", () => {

			it("accepts projection, filter, ordering, and pagination together", async () => {

				const Target = resource({
					name: required(string()),
					age: optional(integer()),
					status: required(string())
				});

				expect(validateQuery([{
					name: "",
					">=age": 18,
					"~name": "alice",
					"^age": "asc",
					"@": 0,
					"#": 10
				}], Target)).toEqual([]);

			});

			it("rejects unknown projection property alongside valid query keys", async () => {

				const Target = resource({ name: required(string()) });

				expect(validateQuery([{
					name: "",
					extra: "",
					"^name": "asc"
				}], Target).length).toBeGreaterThan(0);

			});

		});

		describe("nested query in model", () => {

			it("validates nested query tuple against reference shape", async () => {

				const Member = resource({ name: required(string()), age: optional(integer()) });

				const shape = resource({
					members: multiple(reference(Member))
				});

				expect(validateModel([{
					members: [{ name: "", "^name": "asc", "#": 10 }]
				}], shape, null)).toEqual([]);

			});

			it("rejects nested query with filter on undefined property", async () => {

				const Member = resource({ name: required(string()) });

				const shape = resource({
					members: multiple(reference(Member))
				});

				expect(validateModel([{
					members: [{ ">=missing": 0 }]
				}], shape, null).length).toBeGreaterThan(0);

			});

			it("rejects nested query with unknown projection property", async () => {

				const Member = resource({ name: required(string()) });

				const shape = resource({
					members: multiple(reference(Member))
				});

				expect(validateModel([{
					members: [{ name: "", extra: "" }]
				}], shape).length).toBeGreaterThan(0);

			});

		});

		describe("existing behavior preserved", () => {

			it("accepts plain nested model in reference tuple", async () => {

				const Member = resource({ name: required(string()) });

				const shape = resource({
					members: multiple(reference(Member))
				});

				expect(validateModel([{ members: [{ name: "" }] }], shape, null)).toEqual([]);

			});

			it("accepts scalar reference with IRI string", async () => {

				const Target = resource({ id: id(), name: required(string()) });

				const shape = resource({
					supervisor: optional(reference(Target))
				});

				expect(validateModel([{ supervisor: "app:/users/1" }], shape)).toEqual([]);

			});

			it("preserves local model validation", async () => {

				const shape = resource({
					label: required(local())
				});

				expect(validateModel([{ label: { "en": "Hello" } }], shape)).toEqual([]);

			});

			it("preserves locals model validation", async () => {

				const shape = resource({
					labels: required(locals())
				});

				expect(validateModel([{ labels: { "en": ["Hello"] as const } }], shape)).toEqual([]);

			});

		});

		describe("deep path criteria", () => {

			it("accepts filter with single-segment path", async () => {

				const Target = resource({ name: required(string()), age: optional(integer()) });

				expect(validateQuery([{ ">=age": 18 }], Target)).toEqual([]);

			});

			it("accepts filter through reference property", async () => {

				const Vendor = resource({ name: required(string()), rating: optional(integer()) });

				const Target = resource({ vendor: required(reference(Vendor)) });

				expect(validateQuery([{ ">=vendor.rating": 3 }], Target)).toEqual([]);

			});

			it("accepts ordering through reference property", async () => {

				const Vendor = resource({ name: required(string()), rating: optional(integer()) });

				const Target = resource({ vendor: required(reference(Vendor)) });

				expect(validateQuery([{ "^vendor.rating": "asc" }], Target)).toEqual([]);

			});

			it("accepts three-segment path through nested references", async () => {

				const Category = resource({ label: required(string()) });

				const Product = resource({ name: required(string()), category: required(reference(Category)) });

				const Target = resource({ product: required(reference(Product)) });

				expect(validateQuery([{ "^product.category.label": "asc" }], Target)).toEqual([]);

			});

			it("rejects deep path with undefined nested property", async () => {

				const Vendor = resource({ name: required(string()) });

				const Target = resource({ vendor: required(reference(Vendor)) });

				expect(validateQuery([{ ">=vendor.rating": 3 }], Target).length).toBeGreaterThan(0);

			});

			it("rejects deep path through leaf property", async () => {

				const Target = resource({ name: required(string()), age: optional(integer()) });

				expect(validateQuery([{ ">=name.deep": 0 }], Target).length).toBeGreaterThan(0);

			});

			it("accepts deep path through union when at least one variant resolves", async () => {

				const TypeA = resource({ score: required(integer()) });
				const TypeB = resource({ label: required(string()) });

				const Target = resource({
					item: property(required(union({
						a: reference(TypeA),
						b: reference(TypeB)
					})))
				});

				expect(validateQuery([{ ">=item.score": 5 }], Target)).toEqual([]);

			});

			it("rejects deep path through union when no variant resolves", async () => {

				const TypeA = resource({ score: required(integer()) });
				const TypeB = resource({ label: required(string()) });

				const Target = resource({
					item: property(required(union({
						a: reference(TypeA),
						b: reference(TypeB)
					})))
				});

				expect(validateQuery([{ ">=item.missing": 0 }], Target).length).toBeGreaterThan(0);

			});

		});

		describe("depth", () => {

			it("rejects nested query via reference when depth is 0", async () => {

				const Member = resource({ name: required(string()) });

				const shape = resource({
					members: multiple(reference(Member))
				});

				expect(validateQuery([{
					members: [{ name: "" }]
				}], shape, 0).length).toBeGreaterThan(0);

			});

			it("accepts IRI reference in query when depth is 0", async () => {

				const Member = resource({ id: id(), name: required(string()) });

				const shape = resource({
					members: multiple(reference(Member))
				});

				expect(validateQuery([{
					members: ["app:/users/1"]
				} as any], shape, 0)).toEqual([]);

			});

			it("rejects nested query via reference when depth is omitted (defaults to 0)", async () => {

				const Member = resource({ name: required(string()) });

				const shape = resource({
					members: multiple(reference(Member))
				});

				expect(validateQuery([{
					members: [{ name: "" }]
				}], shape).length).toBeGreaterThan(0);

			});

			it("accepts nested query via reference when depth is null (unlimited)", async () => {

				const Member = resource({ name: required(string()) });

				const shape = resource({
					members: multiple(reference(Member))
				});

				expect(validateQuery([{
					members: [{ name: "" }]
				}], shape, null)).toEqual([]);

			});

			it("accepts nested query via reference when depth is 1", async () => {

				const Member = resource({ name: required(string()) });

				const shape = resource({
					members: multiple(reference(Member))
				});

				expect(validateQuery([{
					members: [{ name: "" }]
				}], shape, 1)).toEqual([]);

			});

			it("rejects 2-level nesting via reference when depth is 1", async () => {

				const Leaf = resource({ value: required(string()) });

				const Middle = resource({
					leaf: optional(reference(Leaf))
				});

				const Root = resource({
					middle: optional(reference(Middle))
				});

				expect(validateQuery([{
					middle: { leaf: { value: "" } }
				}], Root, 1).length).toBeGreaterThan(0);

			});

			it("accepts 2-level nesting via reference when depth is 2", async () => {

				const Leaf = resource({ value: required(string()) });

				const Middle = resource({
					leaf: optional(reference(Leaf))
				});

				const Root = resource({
					middle: optional(reference(Middle))
				});

				expect(validateQuery([{
					middle: { leaf: { value: "" } }
				}], Root, 2)).toEqual([]);

			});

			it("rejects nested embedded resource when depth is 0", async () => {

				const Embedded = resource({ label: required(string()) });

				const Outer = resource({
					child: required(Embedded)
				});

				expect(validateQuery([{ child: { label: "" } }], Outer, 0).length).toBeGreaterThan(0);

			});

			it("accepts nested embedded resource when depth is 1", async () => {

				const Embedded = resource({ label: required(string()) });

				const Outer = resource({
					child: required(Embedded)
				});

				expect(validateQuery([{ child: { label: "" } }], Outer, 1)).toEqual([]);

			});

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
