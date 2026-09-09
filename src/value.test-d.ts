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

import type { IRI } from "@metreeca/core/resource";
import type { Dictionary } from "@metreeca/qest/resource";
import { assertType, describe, expectTypeOf, test } from "vitest";
import type { BooleanShape } from "./boolean.js";
import { dictionary, type DictionaryShape } from "./dictionary.js";
import { integer, type NumberShape } from "./number.js";
import { reference, type ReferenceShape } from "./reference.js";
import { property, resource, type ResourceShape } from "./resource.js";
import { string, type StringShape } from "./string.js";
import { union } from "./union.js";
import { type Bounds, cardinality, multiple, optional, repeatable, required, type State } from "./value.js";


describe("State", () => {

	describe("value shapes", () => {

		test("BooleanShape → boolean", () => {
			expectTypeOf<State<BooleanShape>>().toEqualTypeOf<boolean>();
		});

		test("NumberShape → number", () => {
			expectTypeOf<State<NumberShape>>().toEqualTypeOf<number>();
		});

		test("StringShape → string", () => {
			expectTypeOf<State<StringShape>>().toEqualTypeOf<string>();
		});

		test("DictionaryShape → Dictionary", () => {
			expectTypeOf<State<DictionaryShape>>().toEqualTypeOf<Dictionary>();
		});

		test("DictionaryShape rejects string shorthand", () => {
			expectTypeOf<string>().not.toExtend<State<DictionaryShape>>();
		});

		test("DictionaryShape rejects string array shorthand", () => {
			expectTypeOf<readonly string[]>().not.toExtend<State<DictionaryShape>>();
		});

		test("ReferenceShape → Reference", () => {
			expectTypeOf<State<ReferenceShape>>().toEqualTypeOf<IRI>();
		});

		test("ResourceShape → Resource-like record", () => {
			expectTypeOf<State<ResourceShape>>().toBeObject();
		});

		test("ValueShape → union of all model types", () => {
			expectTypeOf<State<BooleanShape>>().toExtend<boolean>();
			expectTypeOf<State<NumberShape>>().toExtend<number>();
			expectTypeOf<State<StringShape>>().toExtend<string>();
			expectTypeOf<State<DictionaryShape>>().toExtend<Dictionary>();
			expectTypeOf<State<ReferenceShape>>().toExtend<IRI>();
		});

		test("lazy resource factory → unwrapped model type", () => {
			expectTypeOf<State<() => ResourceShape>>().toBeObject();
		});

	});

	describe("cardinality", () => {

		function Shape() {
			return resource({
				req: property(required(string())),
				opt: property(optional(string())),
				mult: property(multiple(string())),
				rep: property(repeatable(string()))
			});
		}

		test("required → T", () => {
			expectTypeOf<State<typeof Shape>>().toHaveProperty("req").toEqualTypeOf<string>();
		});

		test("optional → undefined | T", () => {
			expectTypeOf<State<typeof Shape>>().toHaveProperty("opt").toEqualTypeOf<string | undefined>();
		});

		test("multiple → undefined | readonly T[]", () => {
			expectTypeOf<State<typeof Shape>>().toHaveProperty("mult").toEqualTypeOf<readonly string[] | undefined>();
		});

		test("repeatable → readonly T[]", () => {
			expectTypeOf<State<typeof Shape>>().toHaveProperty("rep").toEqualTypeOf<readonly string[]>();
		});

		test("rejects undefined for required", () => {
			// @ts-expect-error - required cannot be undefined
			assertType<State<typeof Shape>>({ req: undefined, rep: ["x"] });
		});

		test("omits entries admitting undefined", () => {
			assertType<State<typeof Shape>>({ req: "x", rep: ["x"] });
		});

	});

	describe("naked ranges", () => {

		function NakedShape() {
			return resource({
				req: required(string()),
				opt: optional(string()),
				mult: multiple(string()),
				rep: repeatable(string())
			});
		}

		test("required → T", () => {
			expectTypeOf<State<typeof NakedShape>>().toHaveProperty("req").toEqualTypeOf<string>();
		});

		test("optional → undefined | T", () => {
			expectTypeOf<State<typeof NakedShape>>().toHaveProperty("opt").toEqualTypeOf<string | undefined>();
		});

		test("multiple → undefined | readonly T[]", () => {
			expectTypeOf<State<typeof NakedShape>>().toHaveProperty("mult").toEqualTypeOf<readonly string[] | undefined>();
		});

		test("repeatable → readonly T[]", () => {
			expectTypeOf<State<typeof NakedShape>>().toHaveProperty("rep").toEqualTypeOf<readonly string[]>();
		});

		test("union accepts first variant", () => {
			function UnionShape() {
				return resource({
					value: optional(union(string(), integer()))
				});
			}

			assertType<State<typeof UnionShape>>({ value: "text" });
		});

		test("union accepts second variant", () => {
			function UnionShape() {
				return resource({
					value: optional(union(string(), integer()))
				});
			}

			assertType<State<typeof UnionShape>>({ value: 42 });
		});

		test("union rejects invalid type", () => {
			function UnionShape() {
				return resource({
					value: optional(union(string(), integer()))
				});
			}

			// @ts-expect-error - boolean not a valid variant value
			assertType<State<typeof UnionShape>>({ value: true });
		});

		test("mixed property and naked range", () => {
			function MixedShape() {
				return resource({
					name: property(required(string())),
					age: optional(integer())
				});
			}

			expectTypeOf<State<typeof MixedShape>>().toHaveProperty("name").toEqualTypeOf<string>();
			expectTypeOf<State<typeof MixedShape>>().toHaveProperty("age").toEqualTypeOf<number | undefined>();
		});

		test("rejects undefined for required", () => {
			function NakedRequired() {
				return resource({
					req: required(string()),
					rep: repeatable(string())
				});
			}

			// @ts-expect-error - required cannot be undefined
			assertType<State<typeof NakedRequired>>({ req: undefined, rep: ["x"] });
		});

	});

	describe("locals", () => {

		const Shape = resource({
			title: required(dictionary()),
			keywords: multiple(dictionary())
		});

		test("infers { readonly [tag: string]: string } type for scalar cardinality", () => {
			expectTypeOf<State<typeof Shape>>().toHaveProperty("title").toEqualTypeOf<{
				readonly [tag: string]: string
			}>();
		});

		test("infers { readonly [tag: string]: readonly string[] } | undefined type for array cardinality", () => {
			expectTypeOf<State<typeof Shape>>().toHaveProperty("keywords").toEqualTypeOf<{
				readonly [tag: string]: readonly string[]
			} | undefined>();
		});

		test("scalar local rejects string shorthand", () => {
			expectTypeOf<string>().not.toExtend<State<typeof Shape>["title"]>();
		});

		test("array local rejects string array shorthand", () => {
			expectTypeOf<readonly string[]>().not.toExtend<NonNullable<State<typeof Shape>["keywords"]>>();
		});

		test("accepts tagged object for scalar local", () => {
			assertType<State<typeof Shape>>({ title: { en: "Hello" }, keywords: undefined });
		});

		test("rejects string shorthand for scalar local", () => {
			// @ts-expect-error - bare string no longer accepted; tag map required
			assertType<State<typeof Shape>>({ title: "Hello", keywords: undefined });
		});

		test("accepts tagged object for array local", () => {
			assertType<State<typeof Shape>>({ title: { und: "Hello" }, keywords: { en: ["a", "b"] } });
		});

		test("rejects string array shorthand for array local", () => {
			// @ts-expect-error - bare string array no longer accepted; tag map required
			assertType<State<typeof Shape>>({ title: { und: "Hello" }, keywords: ["a", "b"] });
		});

	});

	describe("unions", () => {

		function Shape() {
			return resource({
				value: property(required(union(string(), integer())))
			});
		}

		test("accepts first variant", () => {
			assertType<State<typeof Shape>>({ value: "text" });
		});

		test("accepts second variant", () => {
			assertType<State<typeof Shape>>({ value: 42 });
		});

		test("rejects invalid type", () => {
			// @ts-expect-error - boolean not a valid variant value
			assertType<State<typeof Shape>>({ value: true });
		});

	});

	describe("inheritance", () => {

		describe("single", () => {

			function Base() {
				return resource({
					name: property(required(string()))
				});
			}

			function Derived() {
				return resource({ extends: Base }, {
					code: property(required(string()))
				});
			}

			test("includes inherited entries", () => {
				expectTypeOf<State<typeof Derived>>().toHaveProperty("name").toEqualTypeOf<string>();
				expectTypeOf<State<typeof Derived>>().toHaveProperty("code").toEqualTypeOf<string>();
			});

			test("rejects missing inherited property", () => {
				// @ts-expect-error - missing inherited 'name'
				assertType<State<typeof Derived>>({ code: "own" });
			});

		});

		describe("multiple", () => {

			function Base() {
				return resource({
					name: property(required(string()))
				});
			}

			function Mixin() {
				return resource({
					label: property(optional(string()))
				});
			}

			function Multi() {
				return resource({ extends: [Base, Mixin] }, {
					id: property(required(string()))
				});
			}

			test("includes entries from all parents", () => {
				expectTypeOf<State<typeof Multi>>().toHaveProperty("name").toEqualTypeOf<string>();
				expectTypeOf<State<typeof Multi>>().toHaveProperty("label").toEqualTypeOf<string | undefined>();
				expectTypeOf<State<typeof Multi>>().toHaveProperty("id").toEqualTypeOf<string>();
			});

			test("rejects missing property from parent", () => {
				// @ts-expect-error - missing 'name' from Base
				assertType<State<typeof Multi>>({ label: "mixin", id: "own" });
			});

		});

		describe("deep", () => {

			function GrandParent() {
				return resource({
					a: property(required(string()))
				});
			}

			function Parent() {
				return resource({ extends: GrandParent }, {
					b: property(required(string()))
				});
			}

			function Child() {
				return resource({ extends: Parent }, {
					c: property(required(string()))
				});
			}

			test("includes entries from all ancestors", () => {
				expectTypeOf<State<typeof Child>>().toHaveProperty("a").toEqualTypeOf<string>();
				expectTypeOf<State<typeof Child>>().toHaveProperty("b").toEqualTypeOf<string>();
				expectTypeOf<State<typeof Child>>().toHaveProperty("c").toEqualTypeOf<string>();
			});

			test("rejects missing grandparent property", () => {
				// @ts-expect-error - missing 'a' from GrandParent
				assertType<State<typeof Child>>({ b: "parent", c: "child" });
			});

		});

		describe("diamond", () => {

			function Root() {
				return resource({
					id: property(required(string()))
				});
			}

			function Left() {
				return resource({ extends: Root }, {
					left: property(required(string()))
				});
			}

			function Right() {
				return resource({ extends: Root }, {
					right: property(required(string()))
				});
			}

			function Diamond() {
				return resource({ extends: [Left, Right] }, {
					own: property(required(string()))
				});
			}

			test("includes entries from all paths", () => {
				expectTypeOf<State<typeof Diamond>>().toHaveProperty("id").toEqualTypeOf<string>();
				expectTypeOf<State<typeof Diamond>>().toHaveProperty("left").toEqualTypeOf<string>();
				expectTypeOf<State<typeof Diamond>>().toHaveProperty("right").toEqualTypeOf<string>();
				expectTypeOf<State<typeof Diamond>>().toHaveProperty("own").toEqualTypeOf<string>();
			});

		});

		describe("mixed optionality", () => {

			function Base() {
				return resource({
					reqBase: property(required(string())),
					optBase: property(optional(string()))
				});
			}

			function Derived() {
				return resource({ extends: Base }, {
					reqOwn: property(required(integer())),
					optOwn: property(optional(integer()))
				});
			}

			test("preserves optionality from parent", () => {
				expectTypeOf<State<typeof Derived>>().toHaveProperty("reqBase").toEqualTypeOf<string>();
				expectTypeOf<State<typeof Derived>>().toHaveProperty("optBase").toEqualTypeOf<string | undefined>();
				expectTypeOf<State<typeof Derived>>().toHaveProperty("reqOwn").toEqualTypeOf<number>();
				expectTypeOf<State<typeof Derived>>().toHaveProperty("optOwn").toEqualTypeOf<number | undefined>();
			});

			test("allows undefined for optional entries", () => {
				assertType<State<typeof Derived>>({ reqBase: "x", reqOwn: 1, optBase: undefined, optOwn: undefined });
			});

			test("omits optional entries, own and inherited", () => {
				assertType<State<typeof Derived>>({ reqBase: "x", reqOwn: 1 });
			});

		});

	});

	describe("laziness", () => {

		test("direct shape", () => {

			const DirectShape = resource({
				name: property(required(string()))
			});

			expectTypeOf<State<typeof DirectShape>>().toHaveProperty("name").toEqualTypeOf<string>();

		});

		test("lazy factory", () => {

			function LazyShape() {
				return resource({
					name: property(required(string()))
				});
			}

			expectTypeOf<State<typeof LazyShape>>().toHaveProperty("name").toEqualTypeOf<string>();

		});

	});

	describe("references", () => {

		function TreeNode() {
			return resource({
				label: property(required(string())),
				children: property(multiple(reference(TreeNode)))
			});
		}

		test("infers as IRI", () => {
			expectTypeOf<State<typeof TreeNode>>().toHaveProperty("children").toEqualTypeOf<undefined | readonly IRI[]>();
		});

		test("accepts IRI array", () => {
			assertType<State<typeof TreeNode>>({ label: "root", children: ["/child1" as IRI, "/child2" as IRI] });
		});

		test("accepts undefined", () => {
			assertType<State<typeof TreeNode>>({ label: "leaf", children: undefined });
		});

		test("rejects non-IRI values", () => {
			// @ts-expect-error - number not assignable to IRI
			assertType<State<typeof TreeNode>>({ label: "root", children: [1, 2] });
		});

	});

	describe("composition", () => {

		test("maps identifier keys to their content types", () => {

			const shape = resource({
				name: required(string()),
				age: optional(integer())
			});

			expectTypeOf<State<typeof shape>>().toHaveProperty("name").toEqualTypeOf<string>();
			expectTypeOf<State<typeof shape>>().toHaveProperty("age").toEqualTypeOf<number | undefined>();

		});

		test("rejects extra entries (closed-shape semantics)", () => {

			const shape = resource({
				name: required(string())
			});

			// @ts-expect-error - extra entries not allowed on closed resource shapes
			assertType<State<typeof shape>>({ name: "test", extra: "unexpected" });

		});

	});

	describe("type validation", () => {

		const Shape = resource({
			name: property(required(string())),
			age: property(optional(integer())),
			tags: property(multiple(string())),
			roles: property(repeatable(string()))
		});

		describe("required property", () => {

			test("accepts correct type", () => {
				assertType<State<typeof Shape>>({ name: "Alice", age: undefined, tags: undefined, roles: ["admin"] });
			});

			test("rejects wrong type", () => {
				// @ts-expect-error - number not assignable to string
				assertType<State<typeof Shape>>({ name: 123, age: undefined, tags: undefined, roles: ["admin"] });
			});

			test("rejects undefined", () => {
				// @ts-expect-error - required cannot be undefined
				assertType<State<typeof Shape>>({ name: undefined, age: undefined, tags: undefined, roles: ["admin"] });
			});

			test("rejects missing property", () => {
				// @ts-expect-error - missing required 'name'
				assertType<State<typeof Shape>>({ age: undefined, tags: undefined, roles: ["admin"] });
			});

		});

		describe("optional property", () => {

			test("accepts correct type", () => {
				assertType<State<typeof Shape>>({ name: "Alice", age: 30, tags: undefined, roles: ["admin"] });
			});

			test("accepts undefined", () => {
				assertType<State<typeof Shape>>({ name: "Alice", age: undefined, tags: undefined, roles: ["admin"] });
			});

			test("rejects wrong type", () => {
				// @ts-expect-error - string not assignable to number
				assertType<State<typeof Shape>>({ name: "Alice", age: "thirty", tags: undefined, roles: ["admin"] });
			});

		});

		describe("multiple property", () => {

			test("accepts array", () => {
				assertType<State<typeof Shape>>({ name: "Alice", age: undefined, tags: ["a", "b"], roles: ["admin"] });
			});

			test("accepts undefined", () => {
				assertType<State<typeof Shape>>({ name: "Alice", age: undefined, tags: undefined, roles: ["admin"] });
			});

			test("rejects scalar", () => {
				// @ts-expect-error - scalar not assignable to array
				assertType<State<typeof Shape>>({ name: "Alice", age: undefined, tags: "single", roles: ["admin"] });
			});

			test("rejects wrong element type", () => {
				// @ts-expect-error - number[] not assignable to string[]
				assertType<State<typeof Shape>>({ name: "Alice", age: undefined, tags: [1, 2, 3], roles: ["admin"] });
			});

		});

		describe("repeatable property", () => {

			test("accepts non-empty array", () => {
				assertType<State<typeof Shape>>({
					name: "Alice",
					age: undefined,
					tags: undefined,
					roles: ["admin", "user"]
				});
			});

			test("accepts single element", () => {
				assertType<State<typeof Shape>>({ name: "Alice", age: undefined, tags: undefined, roles: ["admin"] });
			});

			test("rejects undefined", () => {
				// @ts-expect-error - undefined not assignable to non-empty tuple
				assertType<State<typeof Shape>>({ name: "Alice", age: undefined, tags: undefined, roles: undefined });
			});

			test("rejects scalar", () => {
				// @ts-expect-error - scalar not assignable to array
				assertType<State<typeof Shape>>({ name: "Alice", age: undefined, tags: undefined, roles: "admin" });
			});

		});

	});

});

describe("Bounds", () => {

	describe("with cardinality", () => {

		test("required (L = 1, U = 1) returns raw model", () => {
			expectTypeOf<Bounds<StringShape, 1, 1>>().toEqualTypeOf<string>();
		});

		test("optional (L = undefined, U = 1) adds undefined arm", () => {
			expectTypeOf<Bounds<StringShape, undefined, 1>>().toEqualTypeOf<undefined | string>();
		});

		test("repeatable (L = 1, U = undefined) wraps in singleton tuple", () => {
			expectTypeOf<Bounds<StringShape, 1, undefined>>().toEqualTypeOf<readonly [string]>();
		});

		test("multiple (L = undefined, U = undefined) wraps in singleton tuple with undefined arm", () => {
			expectTypeOf<Bounds<StringShape, undefined, undefined>>()
				.toEqualTypeOf<undefined | readonly [string]>();
		});

		test("multi number shape (L = 1, U = undefined) → readonly [number]", () => {
			expectTypeOf<Bounds<NumberShape, 1, undefined>>().toEqualTypeOf<readonly [number]>();
		});

		describe("Dictionary", () => {

			test("required scalar → { [tag]: string }", () => {
				expectTypeOf<Bounds<DictionaryShape, 1, 1>>().toEqualTypeOf<
					{ readonly [tag: string]: string }
				>();
			});

			test("optional scalar adds undefined arm", () => {
				expectTypeOf<Bounds<DictionaryShape, undefined, 1>>().toEqualTypeOf<
					undefined | { readonly [tag: string]: string }
				>();
			});

			test("repeatable → { [tag]: readonly [string] }", () => {
				expectTypeOf<Bounds<DictionaryShape, 1, undefined>>().toEqualTypeOf<
					{ readonly [tag: string]: readonly [string] }
				>();
			});

			test("multiple adds undefined arm", () => {
				expectTypeOf<Bounds<DictionaryShape, undefined, undefined>>().toEqualTypeOf<
					undefined | { readonly [tag: string]: readonly [string] }
				>();
			});

		});

	});

});

describe("model projection", () => {

	test("tuple factory rejects a selection argument", () => {
		const factory = cardinality(2, 5);
		// @ts-expect-error - a selection is supplied per request in the template, never on the shape
		factory(string(), { "#": 10 });
	});

	test("scalar factory rejects a selection argument", () => {
		const factory = cardinality(1, 1);
		// @ts-expect-error - a selection is supplied per request in the template, never on the shape
		factory(string(), { "#": 10 });
	});

	test("Dictionary factory rejects a selection argument", () => {
		const factory = cardinality(1, 1);
		// @ts-expect-error - a selection is supplied per request in the template, never on the shape
		factory(dictionary({ en: "", it: "" }), { "#": 10 });
	});

	test("multi-valued model is a singleton tuple", () => {
		const range = cardinality(2, 5)(string());
		expectTypeOf(range.model).toEqualTypeOf<readonly [string]>();
	});

	test("Dictionary model is a per-tag map", () => {
		const range = cardinality(1, 1)(dictionary({ en: "", it: "" }));
		expectTypeOf(range.model).toEqualTypeOf<{ readonly en: string; readonly it: string }>();
	});

});
