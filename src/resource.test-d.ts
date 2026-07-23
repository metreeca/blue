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
import { type Reference } from "@metreeca/qest";
import { describe, expectTypeOf, test } from "vitest";
import type { BooleanShape } from "./boolean.js";
import { validate } from "./index.js";
import type { NumberShape } from "./number.js";
import {
	type Content,
	type Declared,
	type Member,
	type Id,
	id,
	type Inheritance,
	type Intersection,
	type Override,
	property,
	type Property,
	type PropertyConstraints,
	type Prototype,
	type Range,
	resource,
	type Slot,
	type Type,
	type
} from "./resource.js";
import type { StringShape } from "./string.js";
import { text } from "./text.js";
import { union } from "./union.js";
import { multiple, optional, repeatable, required, type SetShape } from "./value.js";


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
			name: property(required(string()))
		});
	}

	test("rejects incompatible override type", () => {
		// @ts-expect-error - incompatible override: integer does not extend string
		resource({ extends: Base }, { name: required(integer()) });
	});

	test("accepts compatible narrowing", () => {
		resource({ extends: Base }, { name: required(string()) });
	});

	test("rejects widening cardinality (required → optional)", () => {
		// @ts-expect-error - incompatible override: optional widens required
		resource({ extends: Base }, { name: optional(string()) });
	});

	test("rejects changing to array cardinality", () => {
		// @ts-expect-error - incompatible override: multiple changes scalar to array
		resource({ extends: Base }, { name: multiple(string()) });
	});

});


describe("Overrides over union ranges", () => {

	function Base() {
		return resource({
			value: required(union(string(), integer()))
		});
	}

	test("Form 1 narrowing resolves the model to the bare child slot", () => {
		const Derived = resource({ extends: Base }, { value: required(string()) });
		expectTypeOf(Derived.model).toHaveProperty("value").toEqualTypeOf<string>();
	});

	test("Form 2 full retention preserves the parent indexed record", () => {
		const Derived = resource({ extends: Base }, { value: required(union(string(), integer())) });
		expectTypeOf(Derived.model).toHaveProperty("value")
			.toEqualTypeOf<{ readonly "0": string; readonly "1": number }>();
	});

	test("Form 2 subsetting resolves the model to the retained variants only", () => {
		const Derived = resource({ extends: Base }, { value: required(union(string())) });
		expectTypeOf(Derived.model).toHaveProperty("value").toEqualTypeOf<{ readonly "0": string }>();
	});

	test("Form 1 narrowing under multi-valued cardinality resolves to the bare child slot", () => {
		function MultiBase() {
			return resource({
				value: multiple(union(string(), integer()))
			});
		}

		const Derived = resource({ extends: MultiBase }, { value: multiple(string()) });
		expectTypeOf(Derived.model).toHaveProperty("value").toEqualTypeOf<undefined | readonly [string]>();
	});

	test("rejects narrowing to a kind absent from the parent union", () => {
		// @ts-expect-error - incompatible override: boolean kind not in union(string, integer)
		resource({ extends: Base }, { value: required(boolean()) });
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
		type E = { readonly kind: "property"; readonly range: ReturnType<typeof required<StringShape>> };
		expectTypeOf<Content<E>>().toEqualTypeOf<string>();
	});

	test("Property with optional Range range → undefined | V", () => {
		type E = { readonly kind: "property"; readonly range: ReturnType<typeof optional<StringShape>> };
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
				readonly value: undefined | { readonly "0": string; readonly "1": number }
			}>();

		});

		test("multiple nested resource with union preserves structure", () => {

			const Inner = resource({
				tags: multiple(union(string(), integer()))
			});

			expectTypeOf(resource({
				children: multiple(Inner)
			}).model).toHaveProperty("children").toEqualTypeOf<undefined | readonly [{
				readonly tags: undefined | readonly [{ readonly "0": string; readonly "1": number }]
			}]>();

		});

		test("repeatable nested resource preserves inner structure", () => {

			const Inner = resource({
				label: required(string())
			});

			expectTypeOf(resource({
				children: repeatable(Inner)
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

		test("nested resource with localised field preserves Locale projection", () => {

			const Inner = resource({
				label: required(text())
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

			const Child = resource({ extends: Parent }, {
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
			name: property(required(string()))
		});

		validate({}, { shape });

	});

	test("extends accepts single lazy shape", () => {

		function Parent() {
			return resource({ name: required(string()) });
		}

		resource({ extends: Parent }, { extra: required(string()) });

	});

	test("extends accepts non-empty array of lazy shapes", () => {

		function Parent1() {
			return resource({ name: required(string()) });
		}

		function Parent2() {
			return resource({ code: required(string()) });
		}

		resource({ extends: [Parent1, Parent2] }, { extra: required(string()) });

	});

	test("accepts empty extends array (ignored)", () => {
		resource({ extends: [] }, { name: required(string()) });
	});

	test("accepts non-empty classes array", () => {
		resource({ classes: ["https://example.org/Type" as IRI] }, {});
	});

	test("accepts non-empty in array", () => {
		resource({ in: ["https://example.org/a" as IRI, "https://example.org/b" as IRI] }, {});
	});

	test("accepts non-empty hasValue array", () => {
		resource({ hasValue: ["https://example.org/x" as IRI] }, {});
	});

	test("accepts empty classes array (ignored)", () => {
		resource({ classes: [] }, {});
	});

	test("accepts empty in array (ignored)", () => {
		resource({ in: [] }, {});
	});

	test("accepts empty hasValue array (ignored)", () => {
		resource({ hasValue: [] }, {});
	});

	test("child accepts optional entries with inherited parent", () => {

		function Parent() {
			return resource({ name: required(string()) });
		}

		resource({ extends: Parent }, {
			extra: optional(string())
		});

	});

});


describe("markers", () => {

	test("id() returns an Id", () => {
		expectTypeOf(id()).toEqualTypeOf<Id>();
	});

	test("type() returns a Type", () => {
		expectTypeOf(type()).toEqualTypeOf<Type>();
	});

	test("Id and Type are assignable to Entry", () => {
		expectTypeOf<Id>().toExtend<Member>();
		expectTypeOf<Type>().toExtend<Member>();
	});

});


describe("Range", () => {

	test("extracts SetShape from a Property entry", () => {
		type E = Property<ReturnType<typeof required<StringShape>>>;
		expectTypeOf<Range<E>>().toEqualTypeOf<ReturnType<typeof required<StringShape>>>();
	});

	test("returns the entry itself for a naked SetShape", () => {
		type E = ReturnType<typeof required<StringShape>>;
		expectTypeOf<Range<E>>().toEqualTypeOf<E>();
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
		type E = ReturnType<typeof required<StringShape>>;
		expectTypeOf<Slot<E>>().toEqualTypeOf<E["model"]>();
	});

});


describe("Content", () => {

	test("projects Id markers to Reference", () => {
		expectTypeOf<Content<Id>>().toEqualTypeOf<Reference>();
	});

	test("projects Type markers to Reference", () => {
		expectTypeOf<Content<Type>>().toEqualTypeOf<Reference>();
	});

	test("repeatable scalar → readonly tuple of values", () => {
		type E = ReturnType<typeof repeatable<StringShape>>;
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


describe("Intersection", () => {

	test("collapses a union into an intersection", () => {
		expectTypeOf<Intersection<{ a: 1 } | { b: 2 }>>().toEqualTypeOf<{ a: 1 } & { b: 2 }>();
	});

	test("returns the sole member for a singleton union", () => {
		expectTypeOf<Intersection<{ a: 1 }>>().toEqualTypeOf<{ a: 1 }>();
	});

});


describe("Inheritance", () => {

	test("resolves single-parent model", () => {
		function Parent() {
			return resource({ name: required(string()) });
		}

		expectTypeOf<Inheritance<{ extends: typeof Parent }>>()
			.toEqualTypeOf<{ readonly name: string }>();
	});

	test("intersects multi-parent models", () => {
		function P1() { return resource({ a: required(string()) }); }

		function P2() { return resource({ b: required(integer()) }); }

		expectTypeOf<Inheritance<{ extends: readonly [typeof P1, typeof P2] }>>()
			.toEqualTypeOf<{ readonly a: string; readonly b: number }>();
	});

	test("yields {} without extends", () => {
		expectTypeOf<Inheritance<{}>>().toEqualTypeOf<{}>();
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
		type R = ReturnType<typeof required<StringShape>>;
		expectTypeOf<Property<R>["range"]>().toEqualTypeOf<R>();
	});

});


describe("naked range vs property-wrapped equivalence", () => {

	test("resource() produces identical model for naked and wrapped forms", () => {
		const naked = resource({ name: required(string()) });
		const wrapped = resource({ name: property(required(string())) });

		expectTypeOf(naked.model).toEqualTypeOf<typeof wrapped.model>();
	});

	test("produces identical model for optional cardinality", () => {
		const naked = resource({ name: optional(string()) });
		const wrapped = resource({ name: property(optional(string())) });

		expectTypeOf(naked.model).toEqualTypeOf<typeof wrapped.model>();
	});

	test("produces identical model for repeatable cardinality", () => {
		const naked = resource({ tags: repeatable(string()) });
		const wrapped = resource({ tags: property(repeatable(string())) });

		expectTypeOf(naked.model).toEqualTypeOf<typeof wrapped.model>();
	});

});
