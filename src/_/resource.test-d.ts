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

/**
 * Static type tests for resource shape type inference.
 *
 * Verifies compile-time type inference for resource shapes, including cardinality constraints, property composition,
 * and inheritance hierarchies. Uses Vitest type testing with `expectTypeOf` and `assertType`.
 *
 * @module
 */

import type { IRI, Namespace } from "@metreeca/core/resource";
import { type Dictionary, type Reference } from "@metreeca/qest/resource";
import { describe, expectTypeOf, test } from "vitest";
import type { BooleanShape } from "./boolean.js";
import { dictionary } from "./dictionary.js";
import { validate } from "./index.js";
import type { NumberShape } from "./number.js";
import {
	type Content,
	type Declared,
	type Id,
	id,
	type Inheritance,
	type Intersected,
	type Member,
	multiple,
	nonempty,
	optional,
	type Override,
	type Parents,
	property,
	type Property,
	type PropertyConstraints,
	type Prototype,
	type Range,
	required,
	resource,
	type Slot,
	type Type,
	type
} from "./resource.js";
import type { StringShape } from "./string.js";
import { union } from "./union.js";
import { type SetShape } from "./value.js";


// helper shapes for tests

function string(): StringShape {
	return { kind: "string", model: "" };
}

function integer(): NumberShape {
	return { kind: "number", model: 0 };
}

function boolean(): BooleanShape {
	return { kind: "boolean", model: false };
}


describe("Overrides", () => {

	function Base() {
		return resource({
			name: required(string())
		});
	}

	test("rejects incompatible override type", () => {
		// @ts-expect-error - incompatible override: integer does not extend string
		resource(Base, { name: required(integer()) });
	});

	test("accepts compatible narrowing", () => {
		resource(Base, { name: required(string()) });
	});

	test("rejects widening cardinality (required → optional)", () => {
		// @ts-expect-error - incompatible override: optional widens required
		resource(Base, { name: optional(string()) });
	});

	test("rejects changing to array cardinality", () => {
		// @ts-expect-error - incompatible override: multiple changes scalar to array
		resource(Base, { name: multiple(string()) });
	});

});


describe("Overrides over union ranges", () => {

	function Base() {
		return resource({
			value: required(union(string(), integer()))
		});
	}

	test("Form 1 narrowing resolves the model to the bare child slot", () => {
		const Derived = resource(Base, { value: required(string()) });
		expectTypeOf(Derived.model).toHaveProperty("value").toEqualTypeOf<string>();
	});

	test("Form 2 full retention preserves the parent indexed record", () => {
		const Derived = resource(Base, { value: required(union(string(), integer())) });
		expectTypeOf(Derived.model).toHaveProperty("value")
			.toEqualTypeOf<{ readonly "0": string; readonly "1": number }>();
	});

	test("Form 2 subsetting resolves the model to the retained variants only", () => {
		const Derived = resource(Base, { value: required(union(string())) });
		expectTypeOf(Derived.model).toHaveProperty("value").toEqualTypeOf<{ readonly "0": string }>();
	});

	test("Form 1 narrowing under multi-valued cardinality resolves to the bare child slot", () => {
		function MultiBase() {
			return resource({
				value: multiple(union(string(), integer()))
			});
		}

		const Derived = resource(MultiBase, { value: multiple(string()) });
		expectTypeOf(Derived.model).toHaveProperty("value").toEqualTypeOf<undefined | readonly [string]>();
	});

	test("rejects narrowing to a kind absent from the parent union", () => {
		// @ts-expect-error - incompatible override: boolean kind not in union(string, integer)
		resource(Base, { value: required(boolean()) });
	});

});

describe("Content", () => {

	test("naked Range → V", () => {
		type E = ReturnType<typeof required<StringShape>>;
		expectTypeOf<Content<E>>().toEqualTypeOf<string>();
	});

	test("naked optional Range → undefined | V", () => {
		type E = ReturnType<typeof optional<StringShape>>;
		expectTypeOf<Content<E>>().toEqualTypeOf<undefined | string>();
	});

	test("Property with Range range → V", () => {
		type E = { readonly kind: "property"; readonly range: SetShape<StringShape, 1, 1> };
		expectTypeOf<Content<E>>().toEqualTypeOf<string>();
	});

	test("Property with optional Range range → undefined | V", () => {
		type E = { readonly kind: "property"; readonly range: SetShape<StringShape, undefined, 1> };
		expectTypeOf<Content<E>>().toEqualTypeOf<undefined | string>();
	});

	test("scalar union → discriminated union of variant values", () => {
		const r = required(union(string(), integer()));
		type E = typeof r;
		expectTypeOf<Content<E>>().toEqualTypeOf<string | number>();
	});

	test("multi-valued union → readonly array of disjunctive variant values", () => {
		const r = multiple(union(string(), integer()));
		type E = typeof r;
		expectTypeOf<Content<E>>().toEqualTypeOf<undefined | readonly (string | number)[]>();
	});

});

describe("nested model inference", () => {

	describe("deep typing through resource()", () => {

		test("required nested resource preserves inner structure", () => {

			const Inner = resource({
				label: required(string())
			});

			expectTypeOf(resource({
				child: required(Inner)
			}).model).toHaveProperty("child").toEqualTypeOf<{ readonly label: string }>();

		});

		test("optional nested resource preserves inner structure", () => {

			const Inner = resource({
				label: required(string())
			});

			expectTypeOf(resource({
				child: optional(Inner)
			}).model).toHaveProperty("child").toEqualTypeOf<undefined | { readonly label: string }>();

		});

		test("optional inner entries project to optional keys", () => {

			const Inner = resource({
				label: optional(string())
			});

			expectTypeOf(resource({
				child: required(Inner)
			}).model).toHaveProperty("child").toEqualTypeOf<{ readonly label?: undefined | string }>();

		});

		test("multiple nested resource preserves inner structure", () => {

			const Inner = resource({
				label: required(string())
			});

			expectTypeOf(resource({
				children: multiple(Inner)
			}).model).toHaveProperty("children").toEqualTypeOf<undefined | readonly [{ readonly label: string }]>();

		});

		test("deeply nested resource preserves structure at all levels", () => {

			const Leaf = resource({
				value: required(integer())
			});

			const Branch = resource({
				leaf: required(Leaf)
			});

			expectTypeOf(resource({
				branch: required(Branch)
			}).model).toHaveProperty("branch").toEqualTypeOf<{ readonly leaf: { readonly value: number } }>();

		});

		test("nested resource with union preserves variant models", () => {

			const Inner = resource({
				value: required(union(string(), integer()))
			});

			expectTypeOf(resource({
				child: required(Inner)
			}).model).toHaveProperty("child").toEqualTypeOf<{
				readonly value: { readonly "0": string; readonly "1": number }
			}>();

		});

		test("optional nested resource with union preserves structure", () => {

			const Inner = resource({
				value: optional(union(string(), integer()))
			});

			expectTypeOf(resource({
				child: optional(Inner)
			}).model).toHaveProperty("child").toEqualTypeOf<undefined | {
				readonly value?: undefined | { readonly "0": string; readonly "1": number }
			}>();

		});

		test("multiple nested resource with union preserves structure", () => {

			const Inner = resource({
				tags: multiple(union(string(), integer()))
			});

			expectTypeOf(resource({
				children: multiple(Inner)
			}).model).toHaveProperty("children").toEqualTypeOf<undefined | readonly [{
				readonly tags?: undefined | readonly [{ readonly "0": string; readonly "1": number }]
			}]>();

		});

		test("nonempty nested resource preserves inner structure", () => {

			const Inner = resource({
				label: required(string())
			});

			expectTypeOf(resource({
				children: nonempty(Inner)
			}).model).toHaveProperty("children").toEqualTypeOf<readonly [{ readonly label: string }]>();

		});

		test("nested resource with id and type markers projects to Reference", () => {

			const Inner = resource({
				rid: id(),
				rtype: type(),
				label: required(string())
			});

			expectTypeOf(resource({
				child: required(Inner)
			}).model).toHaveProperty("child").toEqualTypeOf<{
				readonly rid: Reference
				readonly rtype: Reference
				readonly label: string
			}>();

		});

		test("nested resource with localised field preserves Locales projection", () => {

			const Inner = resource({
				label: required(dictionary())
			});

			expectTypeOf(resource({
				child: required(Inner)
			}).model).toHaveProperty("child").toEqualTypeOf<{
				readonly label: { readonly [tag: string]: string }
			}>();

		});

		test("lazy nested resource preserves inner structure", () => {

			const Inner = resource({
				label: required(string())
			});

			expectTypeOf(resource({
				child: required(() => Inner)
			}).model).toHaveProperty("child").toEqualTypeOf<{ readonly label: string }>();

		});

		test("union of nested resources at property level preserves variant models", () => {

			const Foo = resource({
				foo: required(string())
			});

			const Bar = resource({
				bar: required(integer())
			});

			expectTypeOf(resource({
				child: required(union(Foo, Bar))
			}).model).toHaveProperty("child").toEqualTypeOf<{
				readonly "0": { readonly foo: string }
				readonly "1": { readonly bar: number }
			}>();

		});

		test("union mixing primitive and nested resource preserves both arms", () => {

			const Inner = resource({
				label: required(string())
			});

			expectTypeOf(resource({
				child: required(union(string(), Inner))
			}).model).toHaveProperty("child").toEqualTypeOf<{
				readonly "0": string
				readonly "1": { readonly label: string }
			}>();

		});

		test("3-level nested resources preserve structure at all levels", () => {

			const Leaf = resource({
				value: required(integer())
			});

			const Branch = resource({
				leaf: required(Leaf)
			});

			const Trunk = resource({
				branch: required(Branch)
			});

			expectTypeOf(resource({
				trunk: required(Trunk)
			}).model).toHaveProperty("trunk").toEqualTypeOf<{
				readonly branch: { readonly leaf: { readonly value: number } }
			}>();

		});

		test("3-level mixed resource/union/resource preserves deep structure", () => {

			const Leaf = resource({
				value: required(integer())
			});

			const Branch = resource({
				alt: required(union(string(), Leaf))
			});

			expectTypeOf(resource({
				root: required(Branch)
			}).model).toHaveProperty("root").toEqualTypeOf<{
				readonly alt: {
					readonly "0": string
					readonly "1": { readonly value: number }
				}
			}>();

		});

		test("nested resource with extends preserves merged structure", () => {

			const Parent = resource({
				name: required(string())
			});

			const Child = resource(Parent, {
				age: required(integer())
			});

			expectTypeOf(resource({
				child: required(Child)
			}).model).toHaveProperty("child").toEqualTypeOf<{
				readonly age: number
				readonly name: string
			}>();

		});

	});

});


describe("resource()", () => {

	test("validate() accepts concrete shapes", () => {

		const shape = resource({
			name: required(string())
		});

		validate({}, { shape });

	});

	test("name and description accept string shorthands but are exposed as dictionaries", () => {

		const shape = resource({
			age: required(integer())
		}, { name: "Person", description: "A *person* resource" });

		expectTypeOf(shape.name).toEqualTypeOf<undefined | Dictionary>();
		expectTypeOf(shape.description).toEqualTypeOf<undefined | Dictionary>();

	});

	test("accepts a single lazy parent", () => {

		function Parent() {
			return resource({ name: required(string()) });
		}

		resource(Parent, { extra: required(string()) });

	});

	test("accepts several lazy parents", () => {

		function Parent1() {
			return resource({ name: required(string()) });
		}

		function Parent2() {
			return resource({ code: required(string()) });
		}

		resource(Parent1, Parent2, { extra: required(string()) });

	});

	test("rejects a declared classes array", () => {
		// @ts-expect-error - classes are computed from the extended shapes, never declared
		resource({}, { classes: ["https://example.org/Type" as IRI] });
	});

	test("accepts non-empty in array", () => {
		resource({}, { in: ["https://example.org/a" as IRI, "https://example.org/b" as IRI] });
	});

	test("accepts non-empty hasValue array", () => {
		resource({}, { hasValue: ["https://example.org/x" as IRI] });
	});

	test("accepts empty in array (ignored)", () => {
		resource({}, { in: [] });
	});

	test("accepts empty hasValue array (ignored)", () => {
		resource({}, { hasValue: [] });
	});

	test("child accepts optional entries with inherited parent", () => {

		function Parent() {
			return resource({ name: required(string()) });
		}

		resource(Parent, {
			extra: optional(string())
		});

	});

});


describe("resource() argument dispatch", () => {

	function Named() {
		return resource({ id: id(), name: required(string()) });
	}

	function Aged() {
		return resource({ age: required(integer()) });
	}

	const Eager = resource({ code: required(string()) });

	test("reads a lone argument as the entries", () => {

		const shape = resource({ label: required(string()) });

		expectTypeOf(shape.model).toEqualTypeOf<{ readonly label: string }>();

	});

	test("reads a trailing object as the constraints when no parent leads", () => {

		const shape = resource({ label: required(string()) }, { class: "https://example.org/Type" as IRI });

		expectTypeOf(shape.model).toEqualTypeOf<{ readonly label: string }>();

	});

	test("composes the model of a single lazy parent", () => {

		const shape = resource(Named, { age: required(integer()) });

		expectTypeOf(shape.model).toEqualTypeOf<{
			readonly id: Reference;
			readonly name: string;
			readonly age: number;
		}>();

	});

	test("composes the model of a single eager parent", () => {

		const shape = resource(Eager, { age: required(integer()) });

		expectTypeOf(shape.model).toEqualTypeOf<{
			readonly code: string;
			readonly age: number;
		}>();

	});

	test("composes the model of several parents", () => {

		const shape = resource(Named, Aged, { code: required(string()) });

		expectTypeOf(shape.model).toEqualTypeOf<{
			readonly id: Reference;
			readonly name: string;
			readonly age: number;
			readonly code: string;
		}>();

	});

	test("composes the model of parents mixing lazy and eager forms", () => {

		const shape = resource(Named, Eager, { age: required(integer()) });

		expectTypeOf(shape.model).toEqualTypeOf<{
			readonly id: Reference;
			readonly name: string;
			readonly code: string;
			readonly age: number;
		}>();

	});

	test("reads a trailing object as the constraints when parents lead", () => {

		const shape = resource(Named, { age: required(integer()) }, { class: "https://example.org/Type" as IRI });

		expectTypeOf(shape.model).toEqualTypeOf<{
			readonly id: Reference;
			readonly name: string;
			readonly age: number;
		}>();

	});

	test("reads empty entries against a leading parent", () => {

		const shape = resource(Named, {});

		expectTypeOf(shape.model).toEqualTypeOf<{
			readonly id: Reference;
			readonly name: string;
		}>();

	});

	test("types validators against the composed model", () => {

		resource(Named, { age: required(integer()) }, {
			validators: [ value => {
				expectTypeOf(value).toEqualTypeOf<{
					readonly id: Reference;
					readonly name: string;
					readonly age: number;
				}>();
				return undefined;
			} ]
		});

	});

	test("exposes the parents as a list", () => {

		const shape = resource(Named, { age: required(integer()) });

		expectTypeOf(shape.parents).toEqualTypeOf<undefined | Parents>();

	});

	test("rejects an entry relaxing an inherited one", () => {

		// @ts-expect-error — optional cannot override an inherited required entry
		resource(Named, { name: optional(string()) });

	});

});


describe("markers", () => {

	test("id() returns an Id", () => {
		expectTypeOf(id()).toEqualTypeOf<Id>();
	});

	test("type() returns a Type", () => {
		expectTypeOf(type()).toEqualTypeOf<Type>();
	});

	test("Id and Type are assignable to Member", () => {
		expectTypeOf<Id>().toExtend<Member>();
		expectTypeOf<Type>().toExtend<Member>();
	});

});


describe("Range", () => {

	test("extracts SetShape from a Property entry", () => {
		type E = Property<SetShape<StringShape, 1, 1>>;
		expectTypeOf<Range<E>>().toEqualTypeOf<SetShape<StringShape, 1, 1>>();
	});

	test("collapses to never for Id markers", () => {
		expectTypeOf<Range<Id>>().toBeNever();
	});

	test("collapses to never for Type markers", () => {
		expectTypeOf<Range<Type>>().toBeNever();
	});

});


describe("Slot", () => {

	test("projects Id markers to Reference", () => {
		expectTypeOf<Slot<Id>>().toEqualTypeOf<Reference>();
	});

	test("projects Type markers to Reference", () => {
		expectTypeOf<Slot<Type>>().toEqualTypeOf<Reference>();
	});

	test("projects ranged entries to the range model", () => {
		type E = Property<SetShape<StringShape, 1, 1>>;
		expectTypeOf<Slot<E>>().toEqualTypeOf<SetShape<StringShape, 1, 1>["model"]>();
	});

});


describe("Content", () => {

	test("projects Id markers to Reference", () => {
		expectTypeOf<Content<Id>>().toEqualTypeOf<Reference>();
	});

	test("projects Type markers to Reference", () => {
		expectTypeOf<Content<Type>>().toEqualTypeOf<Reference>();
	});

	test("nonempty scalar → readonly tuple of values", () => {
		type E = ReturnType<typeof nonempty<StringShape>>;
		expectTypeOf<Content<E>>().toEqualTypeOf<readonly string[]>();
	});

});


describe("Prototype", () => {

	test("composes per-entry Slot projections", () => {
		type E = {
			readonly name: ReturnType<typeof required<StringShape>>;
			readonly rid: Id;
		};

		expectTypeOf<Prototype<E>>().toEqualTypeOf<{
			readonly name: string;
			readonly rid: Reference;
		}>();
	});

	test("marks slots admitting undefined as optional keys", () => {
		type E = {
			readonly name: ReturnType<typeof required<StringShape>>;
			readonly alias: ReturnType<typeof optional<StringShape>>;
		};

		expectTypeOf<Prototype<E>>().toEqualTypeOf<{
			readonly name: string;
			readonly alias?: undefined | string;
		}>();
	});

});


describe("Declared", () => {

	test("strips string index signatures", () => {
		type T = { readonly [k: string]: unknown; readonly name: string };
		expectTypeOf<Declared<T>>().toEqualTypeOf<{ readonly name: string }>();
	});

	test("strips number index signatures", () => {
		type T = { readonly [k: number]: unknown; readonly age: number };
		expectTypeOf<Declared<T>>().toEqualTypeOf<{ readonly age: number }>();
	});

	test("preserves literal keys", () => {
		type T = { readonly name: string; readonly age: number };
		expectTypeOf<Declared<T>>().toEqualTypeOf<T>();
	});

});


describe("Intersected", () => {

	test("collapses a union into an intersection", () => {
		expectTypeOf<Intersected<{ a: 1 } | { b: 2 }>>().toEqualTypeOf<{ a: 1 } & { b: 2 }>();
	});

	test("returns the sole member for a singleton union", () => {
		expectTypeOf<Intersected<{ a: 1 }>>().toEqualTypeOf<{ a: 1 }>();
	});

});


describe("Inheritance", () => {

	test("resolves single-parent model", () => {
		function Parent() {
			return resource({ name: required(string()) });
		}

		expectTypeOf<Inheritance<readonly [typeof Parent]>>()
			.toEqualTypeOf<{ readonly name: string }>();
	});

	test("intersects multi-parent models", () => {
		function P1() { return resource({ a: required(string()) }); }

		function P2() { return resource({ b: required(integer()) }); }

		expectTypeOf<Inheritance<readonly [typeof P1, typeof P2]>>()
			.toEqualTypeOf<{ readonly a: string; readonly b: number }>();
	});

	test("yields {} without parents", () => {
		expectTypeOf<Inheritance<readonly []>>().toEqualTypeOf<{}>();
	});

});


describe("Override", () => {

	test("preserves entries whose slot is assignable to the inherited model", () => {
		type E = { name: ReturnType<typeof required<StringShape>> };
		type I = { readonly name: string };
		expectTypeOf<Override<E, I>>().toEqualTypeOf<E>();
	});

	test("collapses incompatible entries to never", () => {
		type E = { name: ReturnType<typeof required<NumberShape>> };
		type I = { readonly name: string };
		expectTypeOf<Override<E, I>["name"]>().toBeNever();
	});

	test("passes through entries absent from the inherited model", () => {
		type E = { extra: ReturnType<typeof required<StringShape>> };
		type I = { readonly name: string };
		expectTypeOf<Override<E, I>>().toEqualTypeOf<E>();
	});

});


describe("Property generics", () => {

	test("Property defaults propagate Reference and unconstrained SetShape", () => {
		expectTypeOf<Property>().toExtend<{
			readonly kind: "property";
			readonly range: SetShape;
			readonly forward?: Reference;
			readonly reverse?: Reference;
		}>();
	});

	test("PropertyConstraints widens forward/reverse to accept a Namespace", () => {
		expectTypeOf<PropertyConstraints["forward"]>().toEqualTypeOf<undefined | Reference | Namespace>();
		expectTypeOf<PropertyConstraints["reverse"]>().toEqualTypeOf<undefined | Reference | Namespace>();
	});

	test("Property tightens forward/reverse to a resolved Reference", () => {
		expectTypeOf<Property["forward"]>().toEqualTypeOf<undefined | Reference>();
		expectTypeOf<Property["reverse"]>().toEqualTypeOf<undefined | Reference>();
	});

	test("Property<R> narrows range to R", () => {
		type R = SetShape<StringShape, 1, 1>;
		expectTypeOf<Property<R>["range"]>().toEqualTypeOf<R>();
	});

});
