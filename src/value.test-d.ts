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
import type { Localised, Resource } from "@metreeca/qest/resource";
import { assertType, describe, expectTypeOf, test } from "vitest";
import type { BooleanShape } from "./boolean.js";
import { localised, type LocalisedShape } from "./localised.js";
import { integer, type NumberShape } from "./number.js";
import { reference, type ReferenceShape } from "./reference.js";
import { property, resource, type ResourceShape } from "./resource.js";
import { string, type StringShape } from "./string.js";
import {
	type Cardinality,
	type Infer,
	multiple,
	optional,
	repeatable,
	required,
	union,
	type ValuesShape
} from "./value.js";


describe("Infer", () => {

	describe("value shapes", () => {

		test("BooleanShape → boolean", () => {
			expectTypeOf<Infer<BooleanShape>>().toEqualTypeOf<boolean>();
		});

		test("NumberShape → number", () => {
			expectTypeOf<Infer<NumberShape>>().toEqualTypeOf<number>();
		});

		test("StringShape → string", () => {
			expectTypeOf<Infer<StringShape>>().toEqualTypeOf<string>();
		});

		test("LocalisedShape → Localised", () => {
			expectTypeOf<Infer<LocalisedShape>>().toEqualTypeOf<Localised>();
		});

		test("LocalisedShape accepts string shorthand", () => {
			expectTypeOf<string>().toExtend<Infer<LocalisedShape>>();
		});

		test("LocalisedShape accepts string array shorthand", () => {
			expectTypeOf<readonly string[]>().toExtend<Infer<LocalisedShape>>();
		});

		test("ReferenceShape → Reference", () => {
			expectTypeOf<Infer<ReferenceShape>>().toEqualTypeOf<IRI>();
		});

		test("ResourceShape → Resource", () => {
			expectTypeOf<Infer<ResourceShape>>().toEqualTypeOf<Resource>();
		});

		test("ValueShape → union of all model types", () => {
			expectTypeOf<Infer<ValuesShape>>()
				.toEqualTypeOf<boolean | number | string | Localised | IRI | Resource>();
		});

		test("lazy resource factory → unwrapped model type", () => {
			expectTypeOf<Infer<() => ResourceShape>>().toEqualTypeOf<Resource>();
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
			expectTypeOf<Infer<typeof Shape>>().toHaveProperty("req").toEqualTypeOf<string>();
		});

		test("optional → undefined | T", () => {
			expectTypeOf<Infer<typeof Shape>>().toHaveProperty("opt").toEqualTypeOf<string | undefined>();
		});

		test("multiple → undefined | readonly T[]", () => {
			expectTypeOf<Infer<typeof Shape>>().toHaveProperty("mult").toEqualTypeOf<readonly string[] | undefined>();
		});

		test("repeatable → readonly [T, ...T[]]", () => {
			expectTypeOf<Infer<typeof Shape>>().toHaveProperty("rep").toEqualTypeOf<readonly [string, ...string[]]>();
		});

		test("rejects undefined for required", () => {
			// @ts-expect-error - required cannot be undefined
			assertType<Infer<typeof Shape>>({ req: undefined, rep: ["x"] });
		});

		test("rejects empty array for repeatable", () => {
			// @ts-expect-error - repeatable cannot be empty
			assertType<Infer<typeof Shape>>({ req: "x", rep: [] });
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
			expectTypeOf<Infer<typeof NakedShape>>().toHaveProperty("req").toEqualTypeOf<string>();
		});

		test("optional → undefined | T", () => {
			expectTypeOf<Infer<typeof NakedShape>>().toHaveProperty("opt").toEqualTypeOf<string | undefined>();
		});

		test("multiple → undefined | readonly T[]", () => {
			expectTypeOf<Infer<typeof NakedShape>>().toHaveProperty("mult").toEqualTypeOf<readonly string[] | undefined>();
		});

		test("repeatable → readonly [T, ...T[]]", () => {
			expectTypeOf<Infer<typeof NakedShape>>().toHaveProperty("rep").toEqualTypeOf<readonly [string, ...string[]]>();
		});

		test("union accepts string variant", () => {
			function UnionShape() {
				return resource({
					value: optional(union({ string: string(), number: integer() }))
				});
			}

			assertType<Infer<typeof UnionShape>>({ value: { string: "text" } });
		});

		test("union accepts number variant", () => {
			function UnionShape() {
				return resource({
					value: optional(union({ string: string(), number: integer() }))
				});
			}

			assertType<Infer<typeof UnionShape>>({ value: { number: 42 } });
		});

		test("union rejects invalid type", () => {
			function UnionShape() {
				return resource({
					value: optional(union({ string: string(), number: integer() }))
				});
			}

			// @ts-expect-error - boolean not a valid variant value
			assertType<Infer<typeof UnionShape>>({ value: { string: true } });
		});

		test("mixed property and naked range", () => {
			function MixedShape() {
				return resource({
					name: property(required(string())),
					age: optional(integer())
				});
			}

			expectTypeOf<Infer<typeof MixedShape>>().toHaveProperty("name").toEqualTypeOf<string>();
			expectTypeOf<Infer<typeof MixedShape>>().toHaveProperty("age").toEqualTypeOf<number | undefined>();
		});

		test("rejects undefined for required", () => {
			function NakedRequired() {
				return resource({
					req: required(string()),
					rep: repeatable(string())
				});
			}

			// @ts-expect-error - required cannot be undefined
			assertType<Infer<typeof NakedRequired>>({ req: undefined, rep: ["x"] });
		});

	});

	describe("locals", () => {

		const Shape = resource({
			title: required(localised()),
			keywords: multiple(localised())
		});

		test("infers string | { readonly [tag: string]: string } type for scalar cardinality", () => {
			expectTypeOf<Infer<typeof Shape>>().toHaveProperty("title").toEqualTypeOf<string | {
				readonly [tag: string]: string
			}>();
		});

		test("infers readonly string[] | { readonly [tag: string]: readonly string[] } | undefined type for array cardinality", () => {
			expectTypeOf<Infer<typeof Shape>>().toHaveProperty("keywords").toEqualTypeOf<readonly string[] | {
				readonly [tag: string]: readonly string[]
			} | undefined>();
		});

		test("scalar local accepts string shorthand", () => {
			expectTypeOf<string>().toExtend<Infer<typeof Shape>["title"]>();
		});

		test("array local accepts string array shorthand", () => {
			expectTypeOf<readonly string[]>().toExtend<NonNullable<Infer<typeof Shape>["keywords"]>>();
		});

		test("accepts tagged object for scalar local", () => {
			assertType<Infer<typeof Shape>>({ title: { en: "Hello" } });
		});

		test("accepts string shorthand for scalar local", () => {
			assertType<Infer<typeof Shape>>({ title: "Hello" });
		});

		test("accepts tagged object for array local", () => {
			assertType<Infer<typeof Shape>>({ title: "Hello", keywords: { en: ["a", "b"] } });
		});

		test("accepts string array shorthand for array local", () => {
			assertType<Infer<typeof Shape>>({ title: "Hello", keywords: ["a", "b"] });
		});

	});

	describe("unions", () => {

		function Shape() {
			return resource({
				value: property(required(union({ string: string(), number: integer() })))
			});
		}

		test("accepts string variant", () => {
			assertType<Infer<typeof Shape>>({ value: { string: "text" } });
		});

		test("accepts number variant", () => {
			assertType<Infer<typeof Shape>>({ value: { number: 42 } });
		});

		test("rejects invalid type", () => {
			// @ts-expect-error - boolean not a valid variant value
			assertType<Infer<typeof Shape>>({ value: { string: true } });
		});

		test("rejects bare value without variant key", () => {
			// @ts-expect-error - union values must be indexed by variant identifier
			assertType<Infer<typeof Shape>>({ value: "text" });
		});

		test("rejects unknown variant identifier", () => {
			// @ts-expect-error - 'unknown' is not a declared variant
			assertType<Infer<typeof Shape>>({ value: { unknown: "text" } });
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

			test("includes inherited properties", () => {
				expectTypeOf<Infer<typeof Derived>>().toHaveProperty("name").toEqualTypeOf<string>();
				expectTypeOf<Infer<typeof Derived>>().toHaveProperty("code").toEqualTypeOf<string>();
			});

			test("rejects missing inherited property", () => {
				// @ts-expect-error - missing inherited 'name'
				assertType<Infer<typeof Derived>>({ code: "own" });
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

			test("includes properties from all parents", () => {
				expectTypeOf<Infer<typeof Multi>>().toHaveProperty("name").toEqualTypeOf<string>();
				expectTypeOf<Infer<typeof Multi>>().toHaveProperty("label").toEqualTypeOf<string | undefined>();
				expectTypeOf<Infer<typeof Multi>>().toHaveProperty("id").toEqualTypeOf<string>();
			});

			test("rejects missing property from parent", () => {
				// @ts-expect-error - missing 'name' from Base
				assertType<Infer<typeof Multi>>({ label: "mixin", id: "own" });
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

			test("includes properties from all ancestors", () => {
				expectTypeOf<Infer<typeof Child>>().toHaveProperty("a").toEqualTypeOf<string>();
				expectTypeOf<Infer<typeof Child>>().toHaveProperty("b").toEqualTypeOf<string>();
				expectTypeOf<Infer<typeof Child>>().toHaveProperty("c").toEqualTypeOf<string>();
			});

			test("rejects missing grandparent property", () => {
				// @ts-expect-error - missing 'a' from GrandParent
				assertType<Infer<typeof Child>>({ b: "parent", c: "child" });
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

			test("includes properties from all paths", () => {
				expectTypeOf<Infer<typeof Diamond>>().toHaveProperty("id").toEqualTypeOf<string>();
				expectTypeOf<Infer<typeof Diamond>>().toHaveProperty("left").toEqualTypeOf<string>();
				expectTypeOf<Infer<typeof Diamond>>().toHaveProperty("right").toEqualTypeOf<string>();
				expectTypeOf<Infer<typeof Diamond>>().toHaveProperty("own").toEqualTypeOf<string>();
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
				expectTypeOf<Infer<typeof Derived>>().toHaveProperty("reqBase").toEqualTypeOf<string>();
				expectTypeOf<Infer<typeof Derived>>().toHaveProperty("optBase").toEqualTypeOf<string | undefined>();
				expectTypeOf<Infer<typeof Derived>>().toHaveProperty("reqOwn").toEqualTypeOf<number>();
				expectTypeOf<Infer<typeof Derived>>().toHaveProperty("optOwn").toEqualTypeOf<number | undefined>();
			});

			test("allows omitting optional properties", () => {
				assertType<Infer<typeof Derived>>({ reqBase: "x", reqOwn: 1 });
			});

		});

	});

	describe("laziness", () => {

		test("direct shape", () => {

			const DirectShape = resource({
				name: property(required(string()))
			});

			expectTypeOf<Infer<typeof DirectShape>>().toHaveProperty("name").toEqualTypeOf<string>();

		});

		test("lazy factory", () => {

			function LazyShape() {
				return resource({
					name: property(required(string()))
				});
			}

			expectTypeOf<Infer<typeof LazyShape>>().toHaveProperty("name").toEqualTypeOf<string>();

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
			expectTypeOf<Infer<typeof TreeNode>>().toHaveProperty("children").toEqualTypeOf<undefined | readonly IRI[]>();
		});

		test("accepts IRI array", () => {
			assertType<Infer<typeof TreeNode>>({ label: "root", children: ["/child1" as IRI, "/child2" as IRI] });
		});

		test("accepts undefined", () => {
			assertType<Infer<typeof TreeNode>>({ label: "leaf" });
		});

		test("rejects non-IRI values", () => {
			// @ts-expect-error - number not assignable to IRI
			assertType<Infer<typeof TreeNode>>({ label: "root", children: [1, 2] });
		});

	});

	describe("composition", () => {

		test("maps identifier keys to their content types", () => {

			const shape = resource({
				name: required(string()),
				age: optional(integer())
			});

			expectTypeOf<Infer<typeof shape>>().toHaveProperty("name").toEqualTypeOf<string>();
			expectTypeOf<Infer<typeof shape>>().toHaveProperty("age").toEqualTypeOf<number | undefined>();

		});

		test("accepts extra properties via Resource index signature", () => {

			const shape = resource({
				name: required(string())
			});

			assertType<Infer<typeof shape>>({ name: "test", extra: "unexpected" });

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
				assertType<Infer<typeof Shape>>({ name: "Alice", roles: ["admin"] });
			});

			test("rejects wrong type", () => {
				// @ts-expect-error - number not assignable to string
				assertType<Infer<typeof Shape>>({ name: 123, roles: ["admin"] });
			});

			test("rejects undefined", () => {
				// @ts-expect-error - required cannot be undefined
				assertType<Infer<typeof Shape>>({ name: undefined, roles: ["admin"] });
			});

			test("rejects missing property", () => {
				// @ts-expect-error - missing required 'name'
				assertType<Infer<typeof Shape>>({ roles: ["admin"] });
			});

		});

		describe("optional property", () => {

			test("accepts correct type", () => {
				assertType<Infer<typeof Shape>>({ name: "Alice", age: 30, roles: ["admin"] });
			});

			test("accepts omitted", () => {
				assertType<Infer<typeof Shape>>({ name: "Alice", roles: ["admin"] });
			});

			test("rejects wrong type", () => {
				// @ts-expect-error - string not assignable to number
				assertType<Infer<typeof Shape>>({ name: "Alice", age: "thirty", roles: ["admin"] });
			});

		});

		describe("multiple property", () => {

			test("accepts array", () => {
				assertType<Infer<typeof Shape>>({ name: "Alice", tags: ["a", "b"], roles: ["admin"] });
			});

			test("accepts omitted", () => {
				assertType<Infer<typeof Shape>>({ name: "Alice", roles: ["admin"] });
			});

			test("rejects scalar", () => {
				// @ts-expect-error - scalar not assignable to array
				assertType<Infer<typeof Shape>>({ name: "Alice", tags: "single", roles: ["admin"] });
			});

			test("rejects wrong element type", () => {
				// @ts-expect-error - number[] not assignable to string[]
				assertType<Infer<typeof Shape>>({ name: "Alice", tags: [1, 2, 3], roles: ["admin"] });
			});

		});

		describe("repeatable property", () => {

			test("accepts non-empty array", () => {
				assertType<Infer<typeof Shape>>({ name: "Alice", roles: ["admin", "user"] });
			});

			test("accepts single element", () => {
				assertType<Infer<typeof Shape>>({ name: "Alice", roles: ["admin"] });
			});

			test("rejects empty array", () => {
				// @ts-expect-error - empty array not assignable to non-empty tuple
				assertType<Infer<typeof Shape>>({ name: "Alice", roles: [] });
			});

			test("rejects undefined", () => {
				// @ts-expect-error - undefined not assignable to non-empty tuple
				assertType<Infer<typeof Shape>>({ name: "Alice", roles: undefined });
			});

			test("rejects scalar", () => {
				// @ts-expect-error - scalar not assignable to array
				assertType<Infer<typeof Shape>>({ name: "Alice", roles: "admin" });
			});

		});

	});

});

describe("Cardinality", () => {

	test("required (1,1) → V", () => {
		expectTypeOf<Cardinality<string, 1, 1>>().toEqualTypeOf<string>();
	});

	test("optional (undefined,1) → undefined | V", () => {
		expectTypeOf<Cardinality<string, undefined, 1>>().toEqualTypeOf<undefined | string>();
	});

	test("multiple (undefined,undefined) → undefined | readonly V[]", () => {
		expectTypeOf<Cardinality<string, undefined, undefined>>().toEqualTypeOf<undefined | readonly string[]>();
	});

	test("repeatable (1,undefined) → readonly [V, ...V[]]", () => {
		expectTypeOf<Cardinality<string, 1, undefined>>().toEqualTypeOf<readonly [string, ...string[]]>();
	});

	describe("union model distribution", () => {

		type UnionModel = { readonly text?: string; readonly postal?: string };

		test("required union (1,1) → scalar model unchanged", () => {
			expectTypeOf<Cardinality<UnionModel, 1, 1>>().toEqualTypeOf<UnionModel>();
		});

		test("optional union (undefined,1) → undefined | scalar model", () => {
			expectTypeOf<Cardinality<UnionModel, undefined, 1>>().toEqualTypeOf<undefined | UnionModel>();
		});

		test("multiple union (undefined,undefined) → undefined | readonly array", () => {
			expectTypeOf<Cardinality<UnionModel, undefined, undefined>>()
				.toEqualTypeOf<undefined | readonly UnionModel[]>();
		});

		test("repeatable union (1,undefined) → non-empty readonly array", () => {
			expectTypeOf<Cardinality<UnionModel, 1, undefined>>()
				.toEqualTypeOf<readonly [UnionModel, ...UnionModel[]]>();
		});

	});

});
